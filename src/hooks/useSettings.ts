/**
 * useSettings Hook — Single Source of Truth for Plugin Settings
 *
 * Architecture (unified after dual-storage conflict fix):
 *
 *   extensionAPI.settings  ←──  PRIMARY (always written first)
 *        ↕ sync                    ↕ debounced page sync (5s)
 *   React state (settings)      Roam data page (backup)
 *
 * Data flow:
 *   1. Startup: extensionAPI empty? → load from page → write to extensionAPI
 *   2. Startup: extensionAPI has data? → use it directly, fill missing defaults
 *   3. Update:  updateSetting() → write extensionAPI → update React state
 *              → schedule debounced page sync (5s, coalesced)
 *   4. Sync:    roamMemoSettingsChanged event → re-read extensionAPI → update React state
 *   5. Unmount: flush any pending page sync immediately
 *
 * Why this design:
 *   - extensionAPI is the primary store because it works in both Roam Depot
 *     (persistent) and roam/js (in-memory via extension.tsx wrapper) modes
 *   - The Roam data page serves as a persistent backup for roam/js mode,
 *     where extensionAPI is memory-only and lost on page reload
 *   - Page sync is debounced (5s) to avoid excessive block write operations
 *     that would inflate "pending remote changes" in Roam's sync indicator
 *   - Page is only read at startup when extensionAPI is empty, preventing
 *     stale page data from overwriting newer in-memory settings
 *
 * Components that need to change settings should use updateSetting() via props,
 * NOT directly call extensionAPI.settings.set() or saveSettingsToPage().
 */
import React from 'react';
import settingsPanelConfig from '~/settingsPanelConfig';
import { loadSettingsFromPage, saveSettingsToPage } from '~/queries/settings';

export type DeckConfig = { name: string; swapQA: boolean; weight: number };

export type Settings = {
  deckConfigs: string;
  dataPageTitle: string;
  dailyLimit: number;
  historyCleanupKeepCount: number;
  rtlEnabled: boolean;
  shuffleCards: boolean;
  forgotReinsertOffset: number;
  lblNextReinsertOffset: number;
  showBreadcrumbs: boolean;
  showModeBorders: boolean;
  dailynoteEnabled: boolean;
  autoCollapseBlocks: boolean;
};

export const defaultSettings: Settings = {
  deckConfigs: '[{"name":"memo","swapQA":false,"weight":50},{"name":"DailyNote","swapQA":false,"weight":50}]',
  dataPageTitle: 'roam/memo',
  dailyLimit: 0,
  historyCleanupKeepCount: 3,
  rtlEnabled: false,
  shuffleCards: false,
  forgotReinsertOffset: 3,
  lblNextReinsertOffset: 3,
  showBreadcrumbs: false,
  showModeBorders: true,
  dailynoteEnabled: true,
  autoCollapseBlocks: true,
};

const SETTING_TYPES = {
  deckConfigs: 'string',
  dailyLimit: 'number',
  historyCleanupKeepCount: 'number',
  rtlEnabled: 'boolean',
  shuffleCards: 'boolean',
  forgotReinsertOffset: 'number',
  lblNextReinsertOffset: 'number',
  showBreadcrumbs: 'boolean',
  showModeBorders: 'boolean',
  dailynoteEnabled: 'boolean',
  autoCollapseBlocks: 'boolean',
} as const;

const SETTING_KEYS = Object.keys(defaultSettings) as (keyof Settings)[];

const coerceSettingValue = (key: string, value: any): any => {
  const type = SETTING_TYPES[key];
  if (type === 'number') return Number(value);
  if (type === 'boolean') return value === true || value === 'true';
  return value;
};

const coerceAllSettings = (allSettings: Record<string, any>): Record<string, any> => {
  return Object.keys(allSettings).reduce((acc, key) => {
    acc[key] = coerceSettingValue(key, allSettings[key]);
    return acc;
  }, {});
};

const PAGE_SYNC_DEBOUNCE_MS = 5000;

const useSettings = () => {
  const [settings, setSettings] = React.useState(defaultSettings);
  const pageSyncTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingPageSyncRef = React.useRef<Settings | null>(null);
  const hasInitializedRef = React.useRef(false);

  React.useEffect(() => {
    window.roamMemo.extensionAPI.settings.panel.create(
      settingsPanelConfig({ settings, setSettings })
    );
  }, [setSettings]);

  // One-time startup: load page data into extensionAPI if it's empty (roam/js cold start)
  const syncPageToExtensionAPI = React.useCallback(
    async (dataPageTitle: string) => {
      const pageSettings = await loadSettingsFromPage(dataPageTitle);
      if (!pageSettings) return false;

      const canWrite = typeof window.roamMemo?.extensionAPI?.settings?.set === 'function';
      if (canWrite) {
        for (const [key, value] of Object.entries(pageSettings)) {
          window.roamMemo.extensionAPI.settings.set(key, value);
        }
      }
      return true;
    },
    []
  );

  // Fill any missing default values in extensionAPI
  const ensureAllDefaults = React.useCallback(() => {
    const allSettings = window.roamMemo.extensionAPI.settings.getAll() || {};
    let needsUpdate = false;

    for (const key of SETTING_KEYS) {
      if (!(key in allSettings)) {
        window.roamMemo.extensionAPI.settings.set(key, defaultSettings[key]);
        needsUpdate = true;
      }
    }

    return needsUpdate;
  }, []);

  // Read all settings from extensionAPI into React state
  const syncSettingsFromAPI = React.useCallback(() => {
    const allSettings = window.roamMemo.extensionAPI.settings.getAll() || {};
    ensureAllDefaults();
    const filteredSettings = coerceAllSettings(allSettings);
    setSettings((currentSettings) => ({ ...currentSettings, ...filteredSettings }));
  }, [setSettings, ensureAllDefaults]);

  // Initialization: run once on mount
  React.useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initialize = async () => {
      const allSettings = window.roamMemo.extensionAPI.settings.getAll() || {};
      const hasExistingSettings = SETTING_KEYS.some((key) => key in allSettings);

      if (!hasExistingSettings) {
        // Cold start (roam/js): no in-memory settings → load from page
        const loaded = await syncPageToExtensionAPI(defaultSettings.dataPageTitle);
        if (!loaded) {
          ensureAllDefaults();
        }
      } else {
        // Warm start: extensionAPI has data → just fill missing defaults
        ensureAllDefaults();
      }

      syncSettingsFromAPI();
    };

    initialize();
  }, [syncSettingsFromAPI, syncPageToExtensionAPI, ensureAllDefaults]);

  // Listen for settings changes from other components (e.g. settingsPanelConfig)
  React.useEffect(() => {
    const handleSettingsChange = () => {
      syncSettingsFromAPI();
    };

    window.addEventListener('roamMemoSettingsChanged', handleSettingsChange as EventListener);

    return () => {
      window.removeEventListener('roamMemoSettingsChanged', handleSettingsChange as EventListener);
    };
  }, [syncSettingsFromAPI]);

  // Write current settings snapshot to the Roam data page
  const flushPageSync = React.useCallback(async (settingsToSave: Settings) => {
    try {
      await saveSettingsToPage(settingsToSave.dataPageTitle, settingsToSave);
    } catch (err) {
      console.error('Memo: Failed to sync settings to page', err);
    }
  }, []);

  // Debounce page writes: coalesce rapid changes into a single write
  const schedulePageSync = React.useCallback(
    (newSettings: Settings) => {
      pendingPageSyncRef.current = newSettings;

      if (pageSyncTimerRef.current) {
        clearTimeout(pageSyncTimerRef.current);
      }

      pageSyncTimerRef.current = setTimeout(() => {
        if (pendingPageSyncRef.current) {
          flushPageSync(pendingPageSyncRef.current);
          pendingPageSyncRef.current = null;
        }
      }, PAGE_SYNC_DEBOUNCE_MS);
    },
    [flushPageSync]
  );

  // Cleanup: flush pending page sync on unmount
  React.useEffect(() => {
    return () => {
      if (pageSyncTimerRef.current) {
        clearTimeout(pageSyncTimerRef.current);
        if (pendingPageSyncRef.current) {
          flushPageSync(pendingPageSyncRef.current);
          pendingPageSyncRef.current = null;
        }
      }
    };
  }, [flushPageSync]);

  /**
   * Update a single setting. This is the ONLY way components should change settings.
   *
   * Write order: extensionAPI first (immediate) → React state → debounced page sync.
   * This ensures the primary store is always up-to-date, even if the page write fails.
   */
  const updateSetting = React.useCallback(
    (key: keyof Settings, value: any) => {
      window.roamMemo.extensionAPI.settings.set(key, value);

      setSettings((currentSettings) => {
        const newSettings = { ...currentSettings, [key]: coerceSettingValue(key, value) };
        schedulePageSync(newSettings);
        return newSettings;
      });
    },
    [schedulePageSync]
  );

  return { settings, updateSetting };
};

export default useSettings;
