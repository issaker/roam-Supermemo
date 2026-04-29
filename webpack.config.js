const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const baseConfig = {
  entry: './src/extension.tsx',
  externalsType: 'window',
  resolve: {
    plugins: [new TsconfigPathsPlugin({ configFile: './tsconfig.json' })],
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM',
    'chrono-node': 'ChronoNode',
    '@blueprintjs/core': ['Blueprint', 'Core'],
    '@blueprintjs/select': ['Blueprint', 'Select'],
  },
  optimization: {
    splitChunks: false,
  },
  devtool: process.env.NODE_ENV === 'production' ? 'source-map' : 'inline-source-map',
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
      },
    ],
  },
};

//
// TWO-OUTPUT ARCHITECTURE (DO NOT COLLAPSE INTO ONE)
//
// Roam Research has two mutually exclusive extension loading mechanisms:
//
//   1. Extension Settings (Roam Depot): loads the extension via dynamic
//      import(), which requires ES module format with `export default`.
//      The `export` keyword is MANDATORY — without it, module.default is
//      undefined and the plugin silently fails to load.
//
//   2. roam/js (<script> tag): loads the extension via a plain <script>
//      tag. The `export` keyword at top level is a SyntaxError in
//      non-module scripts — the browser parser throws before any code runs.
//
// These two requirements are FUNDAMENTALLY INCOMPATIBLE in a single file:
//   - ES module `export` → SyntaxError in <script> tag
//   - UMD wrapper (no `export`) → module.default is undefined in import()
//
// Therefore we produce TWO bundles from the same source:
//   - extension.js  → ES module for Roam Depot
//   - standalone.js → UMD for roam/js <script> tag
//
// The source code (src/extension.tsx) does BOTH `export default` AND
// `window.RoamMemo = plugin`, but webpack's output format determines
// which loading mechanism actually works.
//
// DO NOT merge these into a single output. DO NOT switch extension.js
// to UMD — that will break Extension Settings loading. DO NOT remove
// standalone.js — roam/js users need it.
//
// CRITICAL: The filename "extension.js" is reserved by Roam's Extension
// Settings system. If a roam/js script is ALSO named "extension.js",
// Roam will try to load it as a local Extension Settings extension,
// which fails for UMD format. The roam/js bundle MUST use a different
// filename ("standalone.js") to avoid this conflict. Users loading
// from roam/js should reference standalone.js, not extension.js.
//
module.exports = [
  {
    ...baseConfig,
    output: {
      filename: 'extension.js',
      path: __dirname,
      library: {
        type: 'module',
      },
    },
    experiments: {
      outputModule: true,
    },
  },
  {
    ...baseConfig,
    output: {
      filename: 'standalone.js',
      path: __dirname,
      library: {
        name: 'RoamMemo',
        type: 'umd',
        export: 'default',
      },
    },
  },
];
