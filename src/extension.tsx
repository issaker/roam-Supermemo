/**
 * Plugin Entry Point
 *
 * Lifecycle hooks for Roam Research plugin loading/unloading.
 * - onload: Creates sidebar widget, renders React app, injects CSS fixes
 * - onunload: Cleans up DOM and styles
 *
 * Settings Compatibility Layer:
 * When loaded via roam/js (not Roam Depot), extensionAPI lacks settings methods
 * and settings.panel. We wrap all settings methods with an in-memory overlay
 * (inMemorySettings) that:
 *
 *   1. Provides a working getAll/set/get even without Roam Depot's extensionAPI
 *   2. Overlays in-memory values ON TOP of any existing extensionAPI values,
 *      so inMemorySettings always takes precedence (handles roam/js cold start)
 *   3. Dispatches 'roamMemoSettingsChanged' event on every set(), which
 *      useSettings hook listens to for re-syncing React state
 *   4. Falls through to original extensionAPI methods when available (Roam Depot)
 *
 * This layer is the FOUNDATION of the settings architecture — useSettings
 * treats extensionAPI.settings as its primary data source, and this wrapper
 * ensures that source is always functional regardless of loading mode.
 */
import ReactDOM from 'react-dom';
import App from './app';
import { FocusStyleManager } from '@blueprintjs/core';
import { injectZIndexFixStyles, removeZIndexFixStyles } from './utils/zIndexFix';

const container_id: string = 'roam-memo-wrapper';

const createAndRenderContainer = () => {
  const siblingElm = document.querySelector('.rm-left-sidebar__daily-notes');
  if (!siblingElm || !siblingElm.parentNode) {
    console.warn('Memo: Could not find sidebar element');
    return null;
  }

  const newContainerElm = document.createElement('div');
  newContainerElm.id = container_id;
  newContainerElm.classList.add('log-button');
  siblingElm.parentNode.insertBefore(newContainerElm, siblingElm.nextSibling);

  return newContainerElm;
};

function onload({ extensionAPI }: { extensionAPI: any }) {
  try {
    const compatibleExtensionAPI = extensionAPI || {};

    const inMemorySettings: Record<string, any> = {};

    if (!compatibleExtensionAPI.settings) {
      compatibleExtensionAPI.settings = {};
    }

    const originalGetAll = compatibleExtensionAPI.settings.getAll;
    const originalSet = compatibleExtensionAPI.settings.set;
    const originalGet = compatibleExtensionAPI.settings.get;

    compatibleExtensionAPI.settings.getAll = () => {
      const existingSettings = originalGetAll ? originalGetAll() : {};
      return { ...existingSettings, ...inMemorySettings };
    };

    compatibleExtensionAPI.settings.set = (key: string, value: any) => {
      inMemorySettings[key] = value;
      if (originalSet) originalSet(key, value);
      window.dispatchEvent(new CustomEvent('roamMemoSettingsChanged', { detail: { key, value } }));
    };

    compatibleExtensionAPI.settings.get = (key: string) => {
      if (key in inMemorySettings) return inMemorySettings[key];
      return originalGet ? originalGet(key) : undefined;
    };

    window.roamMemo = {
      extensionAPI: compatibleExtensionAPI,
    };

    if (compatibleExtensionAPI.settings?.panel?.create) {
      compatibleExtensionAPI.settings.panel.create({
        tabTitle: 'Memo',
        settings: [],
      });
    }

    FocusStyleManager.onlyShowFocusOnTabs();

    injectZIndexFixStyles();

    const container = createAndRenderContainer();
    if (container) {
      ReactDOM.render(<App />, container);
    } else {
      console.error('Memo: Failed to create container - sidebar element not found');
    }
  } catch (error) {
    console.error('Memo: Initialization failed', error);
  }
}

function onunload() {
  const container = document.getElementById(container_id);

  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  }

  removeZIndexFixStyles();
}

const plugin = {
  onload,
  onunload,
};

//
// Dual export for two loading mechanisms:
//   export default → used when loaded as ES module (Roam Depot)
//   window.RoamMemo → used when loaded via <script> tag (roam/js)
//
// The webpack build produces two output files from this same source:
//   extension.js (ES module)  → for Roam Depot dynamic import()
//   standalone.js (UMD)       → for roam/js <script> tag
//
// Do NOT remove either export — each serves a different loading path.
// See webpack.config.js for why single-file dual-use is impossible.
//
export default plugin;

if (typeof window !== 'undefined') {
  (window as any).RoamMemo = plugin;
}
