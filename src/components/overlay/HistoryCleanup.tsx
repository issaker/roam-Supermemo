import * as React from 'react';
import * as stringUtils from '~/utils/string';
import * as asyncUtils from '~/utils/async';
import { colors } from '~/theme';

const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 2000;
const CARD_DELAY_MS = 100;

interface HistoryCleanupProps {
  dataPageTitle: string;
  keepCount: number;
  onKeepCountChange: (_nextKeepCount: number) => void;
}

const HistoryCleanupSection = ({
  dataPageTitle,
  keepCount,
  onKeepCountChange,
}: HistoryCleanupProps) => {
  const [status, setStatus] = React.useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [progress, setProgress] = React.useState({ total: 0, cleaned: 0, deleted: 0, phase: '' });
  const [errorDetail, setErrorDetail] = React.useState('');

  const runCleanup = async () => {
    if (keepCount < 0) return;
    setStatus('running');
    setProgress({ total: 0, cleaned: 0, deleted: 0, phase: 'Scanning...' });
    setErrorDetail('');

    try {
      const query = `[
        :find (pull ?pluginPageChildren [
          :block/string
          :block/children
          :block/order
          :block/uid
          {:block/children [:block/uid :block/string :block/order {:block/children ...}]}])
        :in $ ?pageTitle ?dataBlockName
        :where
        [?page :node/title ?pageTitle]
        [?page :block/children ?pluginPageChildren]
        [?pluginPageChildren :block/string ?dataBlockName]
      ]`;

      const queryResultsData = await window.roamAlphaAPI.q(query, dataPageTitle, 'data');
      const dataChildren = queryResultsData.map((arr) => arr[0])[0]?.children || [];

      const total = dataChildren.length;
      setProgress({ total, cleaned: 0, deleted: 0, phase: 'Scanning cards...' });

      let cleaned = 0;
      let totalDeleted = 0;
      let errors = 0;

      for (let i = 0; i < dataChildren.length; i++) {
        const cardBlock = dataChildren[i];
        if (!cardBlock?.children) continue;

        const dateBlocks = cardBlock.children.filter((child) => {
          if (!child?.string) return false;
          const dateStr = stringUtils.getStringBetween(child.string, '[[', ']]');
          return !!stringUtils.parseRoamDateString(dateStr);
        });

        if (dateBlocks.length <= keepCount) {
          cleaned++;
          setProgress({
            total,
            cleaned,
            deleted: totalDeleted,
            phase: `Scanning (${i + 1}/${total})`,
          });
          continue;
        }

        const sortedDateBlocks = [...dateBlocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const blocksToDelete = sortedDateBlocks.slice(keepCount);

        for (const block of blocksToDelete) {
          try {
            await window.roamAlphaAPI.deleteBlock({ block: { uid: block.uid } });
            totalDeleted++;
          } catch (err) {
            console.error(`[Memo] History cleanup error deleting block ${block.uid}:`, err);
            errors++;
          }
        }

        cleaned++;

        setProgress({
          total,
          cleaned,
          deleted: totalDeleted,
          phase: `Cleaning (${cleaned}/${total})`,
        });

        if ((i + 1) % BATCH_SIZE === 0) {
          await asyncUtils.sleep(BATCH_DELAY_MS);
        } else {
          await asyncUtils.sleep(CARD_DELAY_MS);
        }
      }

      setProgress({ total, cleaned, deleted: totalDeleted, phase: 'Done' });
      if (errors > 0) {
        setErrorDetail(`${errors} blocks had errors — check console for details.`);
      }
      setStatus('done');
    } catch (error) {
      console.error('[Memo] History cleanup error:', error);
      setStatus('error');
    }
  };

  return (
    <div style={{ marginBottom: '20px', borderTop: '1px solid #394b59', paddingTop: '15px' }}>
      <span style={{ fontSize: '14px', fontWeight: 600 }}>Clean Up History Data</span>
      <p style={{ fontSize: '12px', color: colors.textMuted, margin: '5px 0 10px 0' }}>
        Keep only the N most recent date session blocks per card. Older blocks beyond the specified
        count will be deleted. This action cannot be undone. Cleanup remains manual by design to
        avoid automatic heavy writes during normal review sessions.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <span style={{ fontSize: '12px' }}>Keep count:</span>
        <input
          type="number"
          className="bp3-input"
          value={keepCount}
          onChange={(e) => onKeepCountChange(Math.max(0, Number(e.target.value)))}
          min={0}
          style={{ width: '80px' }}
        />
      </div>
      {status === 'idle' && (
        <button
          className="bp3-button bp3-intent-warning"
          onClick={runCleanup}
          style={{ fontSize: '12px' }}
        >
          Start Cleanup
        </button>
      )}
      {status === 'running' && (
        <div style={{ fontSize: '12px', color: colors.textMuted }}>
          <div>{progress.phase}</div>
          <div>
            {progress.cleaned}/{progress.total} cards processed, {progress.deleted} blocks deleted
          </div>
        </div>
      )}
      {status === 'done' && (
        <div>
          <div style={{ fontSize: '12px', color: '#0d8050' }}>
            Cleanup complete! {progress.cleaned} cards processed, {progress.deleted} expired blocks
            deleted.
          </div>
          {errorDetail && (
            <div style={{ fontSize: '12px', color: '#d29922', marginTop: '4px' }}>
              {errorDetail}
            </div>
          )}
          <button
            className="bp3-button"
            onClick={() => {
              setStatus('idle');
              setProgress({ total: 0, cleaned: 0, deleted: 0, phase: '' });
            }}
            style={{ fontSize: '12px', marginTop: '8px' }}
          >
            Run Again
          </button>
        </div>
      )}
      {status === 'error' && (
        <div>
          <div style={{ fontSize: '12px', color: '#c23030' }}>
            Cleanup failed. Check the console for details.
          </div>
          <button
            className="bp3-button"
            onClick={() => {
              setStatus('idle');
              setProgress({ total: 0, cleaned: 0, deleted: 0, phase: '' });
            }}
            style={{ fontSize: '12px', marginTop: '8px' }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default HistoryCleanupSection;
