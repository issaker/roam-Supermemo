/**
 * usePracticeData Hook
 *
 * Fetches and manages practice card data from the Roam data page.
 *
 * Architecture — Frozen Today Snapshot:
 *   The today stats (with dailyLimit + weight% quota allocation) are computed
 *   ONCE and frozen.  They only update when Settings change (dailyLimit,
 *   deckConfigs, shuffleCards, or tagsList).  On every other refresh
 *   (tag switch, overlay reopen, visibility change, block tag edits),
 *   only the raw session data (practiceData) and completedUids are updated —
 *   the quota allocation stays frozen so the queue does not shift under the user.
 *
 *   Completed cards are reported via completedUids so the runtime can
 *   remove them from the visible queue. The due/new counts are recomputed
 *   from the frozen UIDs minus completed UIDs to stay accurate.
 *
 *   Race-condition guard: each effect run increments a version counter.
 *   When the async fetch completes, it checks whether the version is still
 *   current.  If a newer effect has started, the stale result is discarded
 *   so it cannot overwrite the correct state.
 */
import * as React from 'react';
import { Today, TodayInitial } from '~/models/practice';
import { Records } from '~/models/session';
import * as queries from '~/queries';
import { calculateCombinedCounts, calculateTodayStatus } from '~/queries/today';

const usePracticeCardsData = ({
  tagsList,
  selectedTag,
  dataPageTitle,
  cachedData,
  isCramming,
  dailyLimit,
  shuffleCards,
  deckConfigs,
}: {
  tagsList: string[];
  selectedTag: string;
  dataPageTitle: string;
  cachedData: any;
  isCramming: boolean;
  dailyLimit: number;
  shuffleCards: boolean;
  deckConfigs: string;
}) => {
  const [practiceData, setPracticeData] = React.useState<Records>({});
  const [refetchTrigger, setRefetchTrigger] = React.useState(false);
  const [today, setToday] = React.useState<Today>(TodayInitial);

  const refetchTriggerFn = React.useCallback(() => setRefetchTrigger((trigger) => !trigger), []);

  const cachedDataRef = React.useRef(cachedData);
  cachedDataRef.current = cachedData;

  const settingsFingerprint = React.useMemo(
    () => `${dailyLimit}|${deckConfigs}|${shuffleCards}|${tagsList.join(',')}`,
    [dailyLimit, deckConfigs, shuffleCards, tagsList]
  );

  const todaySealedRef = React.useRef(false);
  const settingsFingerprintRef = React.useRef(settingsFingerprint);
  const fetchVersionRef = React.useRef(0);

  React.useEffect(() => {
    const thisVersion = ++fetchVersionRef.current;

    (async () => {
      if (!selectedTag) return;

      try {
        const { practiceData: freshPracticeData, todayStats: freshTodayStats } =
          await queries.getPracticeData({
            tagsList,
            dataPageTitle,
            dailyLimit,
            isCramming,
            shuffleCards,
            cachedData: cachedDataRef.current,
            deckConfigs,
          });

        if (thisVersion !== fetchVersionRef.current) return;

        const isSettingsChange = settingsFingerprint !== settingsFingerprintRef.current;

        if (!todaySealedRef.current || isSettingsChange) {
          setToday(freshTodayStats);
          todaySealedRef.current = true;
          settingsFingerprintRef.current = settingsFingerprint;
        } else {
          setToday((prev) => {
            const next = { ...prev, tags: { ...prev.tags } };
            for (const tag of tagsList) {
              const freshTag = freshTodayStats.tags[tag];
              if (!freshTag) continue;

              const frozenDueUids = prev.tags[tag]?.dueUids || [];
              const frozenNewUids = prev.tags[tag]?.newUids || [];
              const completedSet = new Set(freshTag.completedUids);

              const remainingDueUids = frozenDueUids.filter((uid) => !completedSet.has(uid));
              const remainingNewUids = frozenNewUids.filter((uid) => !completedSet.has(uid));

              next.tags[tag] = {
                ...next.tags[tag],
                dueUids: remainingDueUids,
                newUids: remainingNewUids,
                due: remainingDueUids.length,
                new: remainingNewUids.length,
                completed: freshTag.completed,
                completedUids: freshTag.completedUids,
              };
            }

            calculateCombinedCounts({ today: next, tagsList });
            calculateTodayStatus({ today: next, tagsList });

            return next;
          });
        }

        setPracticeData(freshPracticeData);
      } catch (err) {
        console.error('Memo: Failed to fetch practice data', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataPageTitle, refetchTrigger, isCramming, settingsFingerprint]);

  return {
    practiceData,
    fetchPracticeData: refetchTriggerFn,
    today,
  };
};

export default usePracticeCardsData;
