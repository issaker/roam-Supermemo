import * as React from 'react';
import { colors } from '~/theme';
import { Settings } from '~/hooks/useSettings';
import { equalizeWeights } from '~/utils/deckWeight';
import { parseDeckConfigs } from '~/utils/deckConfig';
import DeckConfigsTable from '~/components/DeckConfigsTable';

export type SettingsFormSettings = Omit<Settings, 'historyCleanupKeepCount' | 'showBreadcrumbs'>;

export interface SettingsFormHandle {
  getSettings: () => SettingsFormSettings;
}

interface SettingsFormProps {
  settings: SettingsFormSettings;
  dataPageTitle: string;
}

const SettingsForm = React.forwardRef<SettingsFormHandle, SettingsFormProps>(
  ({ settings }, ref) => {
    const [formSettings, setFormSettings] = React.useState<SettingsFormSettings>({
      deckConfigs: settings.deckConfigs,
      dataPageTitle: settings.dataPageTitle,
      dailyLimit: settings.dailyLimit,
      forgotReinsertOffset: settings.forgotReinsertOffset,
      lblNextReinsertOffset: settings.lblNextReinsertOffset,
      showModeBorders: settings.showModeBorders,
      rtlEnabled: settings.rtlEnabled,
      shuffleCards: settings.shuffleCards,
      dailynoteEnabled: settings.dailynoteEnabled,
    });

    React.useImperativeHandle(ref, () => ({
      getSettings: () => formSettings,
    }));

    React.useEffect(() => {
      setFormSettings({
        deckConfigs: settings.deckConfigs,
        dataPageTitle: settings.dataPageTitle,
        dailyLimit: settings.dailyLimit,
        forgotReinsertOffset: settings.forgotReinsertOffset,
        lblNextReinsertOffset: settings.lblNextReinsertOffset,
        showModeBorders: settings.showModeBorders,
        rtlEnabled: settings.rtlEnabled,
        shuffleCards: settings.shuffleCards,
        dailynoteEnabled: settings.dailynoteEnabled,
      });
    }, [
      settings.deckConfigs,
      settings.dataPageTitle,
      settings.dailyLimit,
      settings.forgotReinsertOffset,
      settings.lblNextReinsertOffset,
      settings.showModeBorders,
      settings.rtlEnabled,
      settings.shuffleCards,
      settings.dailynoteEnabled,
    ]);

    return (
      <>
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>Tag Pages (Decks)</h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 8px 0' }}>
            Each deck&apos;s Weight % determines its share of the daily review limit. All weights
            sum to 100%. Set a deck&apos;s weight to 0 to disable its review quota.
          </p>
          <DeckConfigsTable
            deckConfigs={formSettings.deckConfigs}
            dailynoteEnabled={formSettings.dailynoteEnabled}
            onChange={(value) => {
              setFormSettings((prev) => ({ ...prev, deckConfigs: value }));
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>Daily Review Limit</h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 5px 0' }}>
            Number of cards to review each day. 0 means no limit. When set, each deck receives a
            proportional share based on its Weight %.
          </p>
          <input
            type="number"
            className="bp3-input"
            value={formSettings.dailyLimit}
            onChange={(e) => {
              const value = Number(e.target.value);
              setFormSettings((prev) => ({ ...prev, dailyLimit: value }));
            }}
            placeholder="0"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>Reinsert &quot;Forgot&quot; Cards After N Cards</h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 5px 0' }}>
            When you mark a card as &quot;Forgot&quot;, it will be reinserted into the current
            review session N cards later. Set to 0 to disable.
          </p>
          <input
            type="number"
            className="bp3-input"
            value={formSettings.forgotReinsertOffset}
            onChange={(e) => {
              const value = Number(e.target.value);
              setFormSettings((prev) => ({ ...prev, forgotReinsertOffset: value }));
            }}
            placeholder="3"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>
            Reinsert &quot;LBL Next&quot; Cards After N Cards
          </h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 5px 0' }}>
            When you click &quot;Next&quot; on an LBL + Progressive/Fixed card, it will be
            reinserted into the current review session N cards later. Set to 0 to review all lines
            consecutively on the same card (like SM2 LBL mode).
          </p>
          <input
            type="number"
            className="bp3-input"
            value={formSettings.lblNextReinsertOffset}
            onChange={(e) => {
              const value = Number(e.target.value);
              setFormSettings((prev) => ({ ...prev, lblNextReinsertOffset: value }));
            }}
            placeholder="3"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>Data Page Title</h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 5px 0' }}>
            Name of page where we&apos;ll store all your data
          </p>
          <input
            type="text"
            className="bp3-input"
            value={formSettings.dataPageTitle}
            onChange={(e) => {
              const value = e.target.value;
              setFormSettings((prev) => ({ ...prev, dataPageTitle: value }));
            }}
            placeholder="roam/Supermemo"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="bp3-checkbox"
              checked={formSettings.dailynoteEnabled}
              onChange={(e) => {
                const value = e.target.checked;
                setFormSettings((prev) => {
                  let updatedConfigs = parseDeckConfigs(prev.deckConfigs);

                  if (value) {
                    const hasDailyNote = updatedConfigs.some((d) => d.name === 'DailyNote');
                    if (!hasDailyNote) {
                      updatedConfigs = [
                        ...updatedConfigs,
                        { name: 'DailyNote', swapQA: false, weight: 0 },
                      ];
                      const weights = equalizeWeights(updatedConfigs.length);
                      updatedConfigs = updatedConfigs.map((d, i) => ({ ...d, weight: weights[i] }));
                    }
                  } else {
                    updatedConfigs = updatedConfigs.filter((d) => d.name !== 'DailyNote');
                    if (updatedConfigs.length > 0) {
                      const weights = equalizeWeights(updatedConfigs.length);
                      updatedConfigs = updatedConfigs.map((d, i) => ({ ...d, weight: weights[i] }));
                    }
                  }

                  return {
                    ...prev,
                    dailynoteEnabled: value,
                    deckConfigs: JSON.stringify(updatedConfigs),
                  };
                });
              }}
              style={{ marginRight: '8px' }}
            />
            <span>Enable DailyNote Deck</span>
          </label>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 0 0' }}>
            Aggregate all top-level blocks from your DailyNote pages into a special deck for review.
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="bp3-checkbox"
              checked={formSettings.showModeBorders}
              onChange={(e) => {
                const value = e.target.checked;
                setFormSettings((prev) => ({ ...prev, showModeBorders: value }));
              }}
              style={{ marginRight: '8px' }}
            />
            <span>Show Review Mode Borders</span>
          </label>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 0 0' }}>
            Show the colored dialog border that marks the current card&apos;s algorithm (green=SM2,
            orange=Progressive, blue=Fixed Time).
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="bp3-checkbox"
              checked={formSettings.shuffleCards}
              onChange={(e) => {
                const value = e.target.checked;
                setFormSettings((prev) => ({ ...prev, shuffleCards: value }));
              }}
              style={{ marginRight: '8px' }}
            />
            <span>Shuffle Cards</span>
          </label>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 0 0' }}>
            OFF: Due cards sorted by urgency (most overdue → hardest → least mature). New cards in
            reverse creation order. ON: All cards randomly shuffled.
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              className="bp3-checkbox"
              checked={formSettings.rtlEnabled}
              onChange={(e) => {
                const value = e.target.checked;
                setFormSettings((prev) => ({ ...prev, rtlEnabled: value }));
              }}
              style={{ marginRight: '8px' }}
            />
            <span>Right-to-Left (RTL) Enabled</span>
          </label>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 0 0' }}>
            Enable RTL for languages like Arabic, Hebrew, etc.
          </p>
        </div>
      </>
    );
  }
);

SettingsForm.displayName = 'SettingsForm';

export default SettingsForm;
