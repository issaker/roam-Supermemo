import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import MigrateLegacyDataPanel from '~/components/MigrateLegacyDataPanel';
import HistoryCleanupSection from '~/components/overlay/HistoryCleanup';
import SettingsForm, { SettingsFormSettings, SettingsFormHandle } from '~/components/SettingsForm';
import { colors } from '~/theme';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SettingsFormSettings & {
    historyCleanupKeepCount: number;
  };
  onApplyAndClose: (settings: SettingsFormSettings) => void;
  dataPageTitle: string;
}

const SettingsDialog = ({
  isOpen,
  onClose,
  settings,
  onApplyAndClose,
  dataPageTitle,
}: SettingsDialogProps) => {
  const [historyCleanupKeepCount, setHistoryCleanupKeepCount] = React.useState(
    settings.historyCleanupKeepCount
  );
  const formRef = React.useRef<SettingsFormHandle>(null);

  React.useEffect(() => {
    setHistoryCleanupKeepCount(settings.historyCleanupKeepCount);
  }, [settings.historyCleanupKeepCount]);

  const handleApplyAndClose = () => {
    const formSettings = formRef.current?.getSettings();
    if (formSettings) {
      onApplyAndClose(formSettings);
    }
  };

  return (
    <Blueprint.Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Memo Settings"
      style={{ maxWidth: '500px' }}
    >
      <div
        className="bp3-dialog-body"
        style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}
      >
        <SettingsForm
          ref={formRef}
          settings={settings}
          dataPageTitle={dataPageTitle}
        />

        <div style={{ marginBottom: '20px', borderTop: '1px solid #394b59', paddingTop: '15px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>Data Migration</span>
          <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 10px 0' }}>
            Migrate card data to the current architecture: convert reviewMode fields to algorithm +
            interaction, and remove redundant reviewMode from session records. Safe to run
            multiple times.
          </p>
          <MigrateLegacyDataPanel dataPageTitle={dataPageTitle} />
        </div>

        <HistoryCleanupSection
          dataPageTitle={dataPageTitle}
          keepCount={historyCleanupKeepCount}
          onKeepCountChange={(nextKeepCount) => {
            setHistoryCleanupKeepCount(nextKeepCount);
          }}
        />
      </div>
      <div className="bp3-dialog-footer" style={{ padding: '10px 20px 15px', borderTop: '1px solid #394b59' }}>
        <div className="bp3-dialog-footer-actions">
          <Blueprint.Button onClick={onClose}>
            Close
          </Blueprint.Button>
          <Blueprint.Button intent="primary" onClick={handleApplyAndClose}>
            Apply & Restart
          </Blueprint.Button>
        </div>
      </div>
    </Blueprint.Dialog>
  );
};

export default SettingsDialog;
