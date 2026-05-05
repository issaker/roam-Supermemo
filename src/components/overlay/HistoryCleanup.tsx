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
  const [progress, setProgress] = React.useState({
    total: 0,
    cleaned: 0,
    deleted: 0,
    orphaned: 0,
    phase: '',
  });
  const [errorDetail, setErrorDetail] = React.useState('');

  const runCleanup = async () => {
    if (keepCount < 0) return;
    setStatus('running');
    setProgress({ total: 0, cleaned: 0, deleted: 0, orphaned: 0, phase: 'Scanning...' });
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
      setProgress({ total, cleaned: 0, deleted: 0, orphaned: 0, phase: 'Scanning cards...' });

      // Phase 1: Clean up orphaned sessions (blocks whose original card has been deleted)
      const cardUids = dataChildren
        .map((cardBlock) => stringUtils.getStringBetween(cardBlock.string || '', '((', '))'))
        .filter((uid) => !!uid);

      let orphanedCount = 0;

      if (cardUids.length > 0) {
        setProgress({
          total,
          cleaned: 0,
          deleted: 0,
          orphaned: 0,
          phase: 'Checking orphaned sessions...',
        });

        const existingUidsQuery = `[
          :find ?uid
          :in $ [?uid ...]
          :where [?block :block/uid ?uid] [?block :block/string ?str] [(not= ?str "")]
        ]`;
        const existingUidsResult = await window.roamAlphaAPI.q(existingUidsQuery, cardUids);
        const existingUidsSet = new Set(existingUidsResult.map((arr) => arr[0]));

        for (let i = 0; i < dataChildren.length; i++) {
          const cardBlock = dataChildren[i];
          const cardUid = stringUtils.getStringBetween(cardBlock.string || '', '((', '))');
          if (!cardUid) continue;

          if (!existingUidsSet.has(cardUid)) {
            try {
              await window.roamAlphaAPI.deleteBlock({ block: { uid: cardBlock.uid } });
              orphanedCount++;
            } catch (err) {
              console.error(
                `[Memo] History cleanup error deleting orphaned card block ${cardBlock.uid}:`,
                err
              );
            }

            if ((i + 1) % BATCH_SIZE === 0) {
              await asyncUtils.sleep(BATCH_DELAY_MS);
            } else {
              await asyncUtils.sleep(CARD_DELAY_MS);
            }
          }
        }
      }

      // Re-query after orphan cleanup to get fresh data
      const freshQueryResultsData = await window.roamAlphaAPI.q(query, dataPageTitle, 'data');
      const freshDataChildren = freshQueryResultsData.map((arr) => arr[0])[0]?.children || [];
      const freshTotal = freshDataChildren.length;

      // Phase 2: Clean up old date session blocks (existing logic)
      let cleaned = 0;
      let totalDeleted = 0;
      let errors = 0;

      setProgress({
        total: freshTotal,
        cleaned: 0,
        deleted: 0,
        orphaned: orphanedCount,
        phase: 'Cleaning history...',
      });

      for (let i = 0; i < freshDataChildren.length; i++) {
        const cardBlock = freshDataChildren[i];
        if (!cardBlock?.children) continue;

        const dateBlocks = cardBlock.children.filter((child) => {
          if (!child?.string) return false;
          const dateStr = stringUtils.getStringBetween(child.string, '[[', ']]');
          return !!stringUtils.parseRoamDateString(dateStr);
        });

        if (dateBlocks.length <= keepCount) {
          cleaned++;
          setProgress({
            total: freshTotal,
            cleaned,
            deleted: totalDeleted,
            orphaned: orphanedCount,
            phase: `Cleaning (${cleaned}/${freshTotal})`,
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
          total: freshTotal,
          cleaned,
          deleted: totalDeleted,
          orphaned: orphanedCount,
          phase: `Cleaning (${cleaned}/${freshTotal})`,
        });

        if ((i + 1) % BATCH_SIZE === 0) {
          await asyncUtils.sleep(BATCH_DELAY_MS);
        } else {
          await asyncUtils.sleep(CARD_DELAY_MS);
        }
      }

      setProgress({
        total: freshTotal,
        cleaned,
        deleted: totalDeleted,
        orphaned: orphanedCount,
        phase: 'Done',
      });
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
        Remove orphaned sessions (cards deleted from Roam but still in data) and keep only the N
        most recent date session blocks per card. This action cannot be undone. Cleanup remains
        manual by design to avoid automatic heavy writes during normal review sessions.
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
            {progress.orphaned > 0 && `, ${progress.orphaned} orphaned sessions removed`}
          </div>
        </div>
      )}
      {status === 'done' && (
        <div>
          <div style={{ fontSize: '12px', color: '#0d8050' }}>
            Cleanup complete! {progress.cleaned} cards processed, {progress.deleted} expired blocks
            deleted{progress.orphaned > 0 && `, ${progress.orphaned} orphaned sessions removed`}.
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
              setProgress({ total: 0, cleaned: 0, deleted: 0, orphaned: 0, phase: '' });
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
              setProgress({ total: 0, cleaned: 0, deleted: 0, orphaned: 0, phase: '' });
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
