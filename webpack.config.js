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
