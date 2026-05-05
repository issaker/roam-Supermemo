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
 *   4. Sync:    roamSupermemoSettingsChanged event → re-read extensionAPI → update React state
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
};

export const defaultSettings: Settings = {
  deckConfigs:
    '[{"name":"memo","swapQA":false,"weight":50},{"name":"DailyNote","swapQA":false,"weight":50}]',
  dataPageTitle: 'roam/Supermemo',
  dailyLimit: 0,
  historyCleanupKeepCount: 3,
  rtlEnabled: false,
  shuffleCards: false,
  forgotReinsertOffset: 3,
  lblNextReinsertOffset: 0,
  showBreadcrumbs: false,
  showModeBorders: true,
  dailynoteEnabled: true,
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
} as const;

const SETTING_KEYS = Object.keys(defaultSettings) as (keyof Settings)[];

const coerceSettingValue = (key: keyof Settings, value: unknown): Settings[keyof Settings] => {
  const type = SETTING_TYPES[key];
  if (type === 'number') return Number(value) as Settings[keyof Settings];
  if (type === 'boolean') return (value === true || value === 'true') as Settings[keyof Settings];
  return value as Settings[keyof Settings];
};

const coerceAllSettings = (
  allSettings: Record<string, unknown>
): Record<string, Settings[keyof Settings]> => {
  return Object.keys(allSettings).reduce((acc, key) => {
    const settingKey = key as keyof Settings;
    if (SETTING_KEYS.includes(settingKey)) {
      acc[key] = coerceSettingValue(settingKey, allSettings[key]);
    }
    return acc;
  }, {} as Record<string, Settings[keyof Settings]>);
};

const PAGE_SYNC_DEBOUNCE_MS = 5000;

const useSettings = () => {
  const [settings, setSettings] = React.useState(defaultSettings);
  const pageSyncTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const pendingPageSyncRef = React.useRef<Settings | null>(null);
  const hasInitializedRef = React.useRef(false);

  // One-time startup: load page data into extensionAPI if it's empty (roam/js cold start)
  const syncPageToExtensionAPI = React.useCallback(async (dataPageTitle: string) => {
    const pageSettings = await loadSettingsFromPage(dataPageTitle);
    if (!pageSettings) return false;

    const canWrite = typeof window.roamSupermemo?.extensionAPI?.settings?.set === 'function';
    if (canWrite) {
      for (const [key, value] of Object.entries(pageSettings)) {
        window.roamSupermemo.extensionAPI.settings.set(key, value);
      }
    }
    return true;
  }, []);

  // Fill any missing default values in extensionAPI
  const ensureAllDefaults = React.useCallback(() => {
    const allSettings = window.roamSupermemo.extensionAPI.settings.getAll() || {};
    let needsUpdate = false;

    for (const key of SETTING_KEYS) {
      if (!(key in allSettings)) {
        window.roamSupermemo.extensionAPI.settings.set(key, defaultSettings[key]);
        needsUpdate = true;
      }
    }

    return needsUpdate;
  }, []);

  // Read all settings from extensionAPI into React state
  const syncSettingsFromAPI = React.useCallback(() => {
    const allSettings = window.roamSupermemo.extensionAPI.settings.getAll() || {};
    ensureAllDefaults();
    const filteredSettings = coerceAllSettings(allSettings);
    setSettings((currentSettings) => ({ ...currentSettings, ...filteredSettings }));
  }, [setSettings, ensureAllDefaults]);

  // Initialization: run once on mount
  React.useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initialize = async () => {
      try {
        const allSettings = window.roamSupermemo.extensionAPI.settings.getAll() || {};
        const hasExistingSettings = SETTING_KEYS.some((key) => key in allSettings);

        if (!hasExistingSettings) {
          const loaded = await syncPageToExtensionAPI(defaultSettings.dataPageTitle);
          if (!loaded) {
            ensureAllDefaults();
          }
        } else {
          ensureAllDefaults();
        }

        syncSettingsFromAPI();
      } catch (err) {
        console.error('Memo: Failed to initialize settings', err);
      }
    };

    initialize();
  }, [syncSettingsFromAPI, syncPageToExtensionAPI, ensureAllDefaults]);

  // Listen for settings changes from other components
  React.useEffect(() => {
    const handleSettingsChange = () => {
      syncSettingsFromAPI();
    };

    window.addEventListener('roamSupermemoSettingsChanged', handleSettingsChange as EventListener);

    return () => {
      window.removeEventListener(
        'roamSupermemoSettingsChanged',
        handleSettingsChange as EventListener
      );
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
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      window.roamSupermemo.extensionAPI.settings.set(key, value);

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
