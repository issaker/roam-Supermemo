/**
 * useBlockInfo Hook
 *
 * Fetches block content, children, and breadcrumb data from Roam's API.
 * Breadcrumbs are sorted by hierarchy depth to match Roam's native display order.
 */
import * as React from 'react';
import { BlockInfo, fetchBlockInfo } from '~/queries';

const useBlockInfo = ({ refUid, refreshKey }: { refUid: any; refreshKey?: any }) => {
  const [blockInfo, setBlockInfo] = React.useState<BlockInfo>({} as BlockInfo);

  React.useEffect(() => {
    if (!refUid) return;
    let cancelled = false;

    const fetch = async () => {
      try {
        const blockInfo = await fetchBlockInfo(refUid);
        if (!cancelled) {
          setBlockInfo({ ...blockInfo, refUid });
        }
      } catch (err) {
        console.error('Memo: Failed to fetch block info', err);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, [refUid, refreshKey]);

  return { blockInfo };
};

export default useBlockInfo;
