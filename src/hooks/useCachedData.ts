/**
 * useCachedData Hook
 *
 * Manages per-tag cache data stored on the Roam data page.
 * Cache stores UI state like renderMode (Normal/AnswerFirst) per deck.
 */
import React from 'react';
import * as queries from '~/queries';

const useCachedData = ({
  dataPageTitle,
  selectedTag,
}: {
  dataPageTitle: string;
  selectedTag?: string;
}) => {
  const [data, setData] = React.useState({});
  const [refetchTrigger, setRefetchTrigger] = React.useState(0);

  const deleteCacheDataKey = async (toDeleteKeyId: string) => {
    if (!selectedTag) return;
    await queries.deleteCacheDataKey({ dataPageTitle, selectedTag, toDeleteKeyId });
  };

  React.useEffect(() => {
    const getData = async () => {
      try {
        const result = await queries.getPluginPageCachedData({ dataPageTitle });
        setData(result);
      } catch (err) {
        console.error('Memo: Failed to fetch cached data', err);
      }
    };

    getData();
  }, [refetchTrigger, dataPageTitle, selectedTag]);

  const fetchCacheData = React.useCallback(
    () => setRefetchTrigger((prev) => prev + 1),
    [setRefetchTrigger]
  );
  return {
    saveCacheData: async (data: { [key: string]: any }, overrides?: { [key: string]: any }) => {
      const tag = overrides?.selectedTag || selectedTag;
      if (!tag) return;
      await queries.saveCacheData({ dataPageTitle, data, selectedTag: tag });
      setRefetchTrigger((prev) => prev + 1);
    },
    deleteCacheDataKey,
    fetchCacheData,
    data: selectedTag ? data[selectedTag] || {} : data,
  };
};

export default useCachedData;
