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
    []
  );
  return {
    fetchCacheData,
    data: selectedTag ? data[selectedTag] || {} : data,
  };
};

export default useCachedData;
