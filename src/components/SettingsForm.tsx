import * as React from 'react';
import { colors } from '~/theme';
import { Settings } from '~/hooks/useSettings';

export type SettingsFormSettings = Omit<Settings, 'historyCleanupKeepCount' | 'showBreadcrumbs'>;

export interface SettingsFormHandle {
  getSettings: () => SettingsFormSettings;
}

interface SettingsFormProps {
  settings: SettingsFormSettings;
  dataPageTitle: string;
}

const SettingsForm = React.forwardRef<SettingsFormHandle, SettingsFormProps>(
  ({ settings, dataPageTitle }, ref) => {
    const [formSettings, setFormSettings] = React.useState<SettingsFormSettings>({
      tagsListString: settings.tagsListString,
      dataPageTitle: settings.dataPageTitle,
      dailyLimit: settings.dailyLimit,
      forgotReinsertOffset: settings.forgotReinsertOffset,
      lblNextReinsertOffset: settings.lblNextReinsertOffset,
      showModeBorders: settings.showModeBorders,
      rtlEnabled: settings.rtlEnabled,
      shuffleCards: settings.shuffleCards,
      dailynoteEnabled: settings.dailynoteEnabled,
      autoCollapseBlocks: settings.autoCollapseBlocks,
    });

    React.useImperativeHandle(ref, () => ({
      getSettings: () => formSettings,
    }));

    React.useEffect(() => {
      setFormSettings({
        tagsListString: settings.tagsListString,
        dataPageTitle: settings.dataPageTitle,
        dailyLimit: settings.dailyLimit,
        forgotReinsertOffset: settings.forgotReinsertOffset,
        lblNextReinsertOffset: settings.lblNextReinsertOffset,
        showModeBorders: settings.showModeBorders,
        rtlEnabled: settings.rtlEnabled,
        shuffleCards: settings.shuffleCards,
        dailynoteEnabled: settings.dailynoteEnabled,
        autoCollapseBlocks: settings.autoCollapseBlocks,
      });
    }, [
      settings.tagsListString,
      settings.dataPageTitle,
      settings.dailyLimit,
      settings.forgotReinsertOffset,
      settings.lblNextReinsertOffset,
      settings.showModeBorders,
      settings.rtlEnabled,
      settings.shuffleCards,
      settings.dailynoteEnabled,
      settings.autoCollapseBlocks,
    ]);

    return (
      <>
        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>Tag Pages (Decks)</h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 5px 0' }}>
            Separate multiple decks with commas. Example: &quot;memo, sr, 🐘, french exam&quot;
          </p>
          <input
            type="text"
            className="bp3-input"
            value={formSettings.tagsListString}
            onChange={(e) => {
              const value = e.target.value;
              setFormSettings((prev) => ({ ...prev, tagsListString: value }));
            }}
            placeholder="memo"
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
            placeholder="roam/memo"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>Daily Review Limit</h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 5px 0' }}>
            Number of cards to review each day. 0 means no limit. When set (&gt;0), each
            deck&apos;s limit = this value × deck weight %. Adjust deck weights via the gear
            icon next to each deck.
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
            autoComplete="off"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>
            Reinsert &quot;Forgot&quot; Cards After N Cards
          </h5>
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
            autoComplete="off"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 10px 0' }}>
            Reinsert &quot;LBL Next&quot; Cards After N Cards
          </h5>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '0 0 5px 0' }}>
            When you click &quot;Next&quot; on an LBL + Progressive/Fixed card, it will be reinserted
            into the current review session N cards later. Set to 0 to disable.
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
            autoComplete="off"
            style={{ width: '100%' }}
          />
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
            Show the colored dialog border that marks the current card&apos;s algorithm (green=SM2, orange=Progressive, blue=Fixed Time).
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
              checked={formSettings.dailynoteEnabled}
              onChange={(e) => {
                const value = e.target.checked;
                setFormSettings((prev) => ({ ...prev, dailynoteEnabled: value }));
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
              checked={formSettings.autoCollapseBlocks}
              onChange={(e) => {
                const value = e.target.checked;
                setFormSettings((prev) => ({ ...prev, autoCollapseBlocks: value }));
              }}
              style={{ marginRight: '8px' }}
            />
            <span>Auto Collapse Blocks After Review</span>
          </label>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 0 0' }}>
            Automatically collapse blocks on the Roam page after reviewing them, keeping your page tidy. In Line-by-Line mode, only the current sub-block stays expanded.
          </p>
        </div>
      </>
    );
  }
);

SettingsForm.displayName = 'SettingsForm';

export default SettingsForm;
