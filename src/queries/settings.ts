import { getOrCreatePage, getOrCreateBlockOnPage, getChildBlock } from '~/queries/utils';
import { defaultSettings, Settings } from '~/hooks/useSettings';

const SETTINGS_BLOCK_NAME = 'settings';

/**
 * Settings Page Persistence — Roam Data Page Read/Write
 *
 * This module handles reading and writing settings as blocks on the Roam data
 * page (default: roam/memo). It is a LOW-LEVEL persistence layer called by
 * useSettings; it should NOT be called directly from UI components.
 *
 * Role in the settings architecture:
 *   - The Roam data page is the BACKUP store for settings (not the primary)
 *   - Primary store is extensionAPI.settings (see useSettings.ts for details)
 *   - This module is only called in two scenarios:
 *     1. Startup: loadSettingsFromPage() restores settings when extensionAPI
 *        is empty (roam/js cold start after page reload)
 *     2. Debounced sync: saveSettingsToPage() writes settings to the page
 *        after a 5-second debounce (triggered by useSettings.schedulePageSync)
 *
 * Write strategy: delete-then-create (not update-in-place) for each setting
 * block, because setting blocks are simple key:: value strings and the
 * delete+create pattern avoids UID tracking complexity.
 */
/** Save all settings to the data page (delete-then-create per key) */
export const saveSettingsToPage = async (dataPageTitle: string, settings: Settings) => {
  try {
    // Ensure the data page exists
    await getOrCreatePage(dataPageTitle);
    
    // Get or create the settings block
    const settingsBlockUid = await getOrCreateBlockOnPage(dataPageTitle, SETTINGS_BLOCK_NAME, -1, {
      open: false,
      heading: 3,
    });

    // Save each setting as a child block
    const settingsToSave = {
      tagsListString: settings.tagsListString,
      dataPageTitle: settings.dataPageTitle,
      dailyLimit: settings.dailyLimit.toString(),
      historyCleanupKeepCount: settings.historyCleanupKeepCount.toString(),
      rtlEnabled: settings.rtlEnabled.toString(),
      shuffleCards: settings.shuffleCards.toString(),
      forgotReinsertOffset: settings.forgotReinsertOffset.toString(),
      lblNextReinsertOffset: settings.lblNextReinsertOffset.toString(),
      showBreadcrumbs: settings.showBreadcrumbs.toString(),
      showModeBorders: settings.showModeBorders.toString(),
      dailynoteEnabled: settings.dailynoteEnabled.toString(),
      autoCollapseBlocks: settings.autoCollapseBlocks.toString(),
    };

    for (const [key, value] of Object.entries(settingsToSave)) {
      try {
        // Delete existing block if it exists
        const existingBlockUid = await getChildBlock(settingsBlockUid, `${key}::`, {
          exactMatch: false,
        });
        
        if (existingBlockUid) {
          await window.roamAlphaAPI.deleteBlock({ block: { uid: existingBlockUid } });
        }

        // Create new block with updated value
        await window.roamAlphaAPI.createBlock({
          location: { 'parent-uid': settingsBlockUid, order: -1 },
          block: {
            string: `${key}:: ${value}`,
            open: false,
          },
        });
      } catch (err) {
        console.error(`Memo: Failed to save setting ${key}`, err);
        throw err; // Re-throw to be caught by outer try-catch
      }
    }

    return true;
  } catch (error) {
    console.error('Memo: Failed to save settings', error);
    return false;
  }
};

/** Load settings from the data page (used only at roam/js cold start) */
export const loadSettingsFromPage = async (dataPageTitle: string): Promise<Settings | null> => {
  try {
    // Get the page UID
    const pageUid = await getOrCreatePage(dataPageTitle);
    
    if (!pageUid) {
      return null;
    }

    // Use getChildBlock to find the settings block
    const settingsBlockUid = await getChildBlock(pageUid, SETTINGS_BLOCK_NAME, {
      exactMatch: true,
    });

    if (!settingsBlockUid) {
      return null;
    }

    // Query for all child blocks of the settings block
    // Use a simple query that doesn't pass UIDs as parameters in lookup ref position
    const childrenQuery = `
      [:find ?child-uid ?child-string
       :where
       [?parent :block/uid "${settingsBlockUid}"]
       [?child :block/parents ?parent]
       [?child :block/uid ?child-uid]
       [?child :block/string ?child-string]
      ]
    `;
    
    const results = window.roamAlphaAPI.q(childrenQuery);
    
    if (!results || results.length === 0) {
      return null;
    }

    const loadedSettings: Partial<Settings> = {};
    
    // Parse each setting
    for (const [blockUid, blockString] of results) {
      try {
        if (blockString && blockString.includes('::')) {
          const [keyPart, ...valueParts] = blockString.split('::');
          const key = keyPart.trim();
          const value = valueParts.join('::').trim();
          
          // Convert values to appropriate types
          switch (key) {
            case 'tagsListString':
              loadedSettings.tagsListString = value;
              break;
            case 'dataPageTitle':
              loadedSettings.dataPageTitle = value;
              break;
            case 'dailyLimit':
              loadedSettings.dailyLimit = Number(value) || 0;
              break;
            case 'historyCleanupKeepCount':
              loadedSettings.historyCleanupKeepCount = Number(value) || 3;
              break;
            case 'rtlEnabled':
              loadedSettings.rtlEnabled = value === 'true';
              break;
            case 'shuffleCards':
              loadedSettings.shuffleCards = value === 'true';
              break;
            case 'forgotReinsertOffset':
              loadedSettings.forgotReinsertOffset = Number(value) || 3;
              break;
            case 'lblNextReinsertOffset':
              loadedSettings.lblNextReinsertOffset = Number(value) || 3;
              break;
            case 'showBreadcrumbs':
              loadedSettings.showBreadcrumbs = value === 'true';
              break;
            case 'showModeBorders':
              loadedSettings.showModeBorders = value === 'true';
              break;
            case 'dailynoteEnabled':
              loadedSettings.dailynoteEnabled = value === 'true';
              break;
            case 'autoCollapseBlocks':
              loadedSettings.autoCollapseBlocks = value === 'true';
              break;
          }
        }
      } catch (err) {
        console.error('Memo: Error parsing setting from block', blockUid, blockString, err);
      }
    }

    
    // Merge with defaults to ensure all fields are present
    return {
      ...defaultSettings,
      ...loadedSettings,
    };
  } catch (error) {
    console.error('Memo: Failed to load settings', error);
    return null;
  }
};
