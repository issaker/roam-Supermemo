/**
 * usePracticeData Hook
 *
 * Fetches and manages practice card data from the Roam data page.
 *
 * Architecture:
 *   On every refresh, tagCardSets are recomputed from scratch.
 *   Queue stability is handled by useQueue (immutable snapshot + patches),
 *   not by freezing tagCardSets here.
 *
 *   Race-condition guard: each effect run increments a version counter.
 *   When the async fetch completes, it checks whether the version is still
 *   current. If a newer effect has started, the stale result is discarded.
 */
import * as React from 'react';
import { TagCardSets } from '~/models/practice';
import { Records } from '~/models/session';
import * as queries from '~/queries';

const usePracticeCardsData = ({
  tagsList,
  selectedTag,
  dataPageTitle,
  cachedData,
  isCramming,
  shuffleCards,
  deckConfigs,
}: {
  tagsList: string[];
  selectedTag: string;
  dataPageTitle: string;
  cachedData: any;
  isCramming: boolean;
  shuffleCards: boolean;
  deckConfigs: string;
}) => {
  const [practiceData, setPracticeData] = React.useState<Records>({});
  const [refetchTrigger, setRefetchTrigger] = React.useState(false);
  const [tagCardSets, setTagCardSets] = React.useState<TagCardSets>({});

  const refetchTriggerFn = React.useCallback(() => setRefetchTrigger((trigger) => !trigger), []);

  const cachedDataRef = React.useRef(cachedData);
  cachedDataRef.current = cachedData;

  const settingsFingerprint = React.useMemo(
    () => `${deckConfigs}|${shuffleCards}|${tagsList.join(',')}`,
    [deckConfigs, shuffleCards, tagsList]
  );

  const fetchVersionRef = React.useRef(0);

  React.useEffect(() => {
    const thisVersion = ++fetchVersionRef.current;

    (async () => {
      if (!selectedTag) return;

      try {
        const { practiceData: freshPracticeData, tagCardSets: freshTagCardSets } =
          await queries.getPracticeData({
            tagsList,
            dataPageTitle,
            isCramming,
            shuffleCards,
            cachedData: cachedDataRef.current,
            deckConfigs,
          });

        if (thisVersion !== fetchVersionRef.current) return;

        setTagCardSets(freshTagCardSets);
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
    tagCardSets,
  };
};

export default usePracticeCardsData;
