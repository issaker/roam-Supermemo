import * as React from 'react';
import { collapseBlockOnPage } from '~/utils/dom';

interface UseAutoCollapseBlocksInput {
  enabled: boolean;
  currentCardRefUid: string | undefined;
  isLineByLineActive: boolean;
  childUidsList: string[];
  lineByLineCurrentChildIndex: number;
  lineByLineIsCardComplete: boolean;
  isOpen: boolean;
}

export default function useAutoCollapseBlocks({
  enabled,
  currentCardRefUid,
  isLineByLineActive,
  childUidsList,
  lineByLineCurrentChildIndex,
  lineByLineIsCardComplete,
  isOpen,
}: UseAutoCollapseBlocksInput) {
  const expandedBlockUidsRef = React.useRef<Set<string>>(new Set());
  const prevCardRefUidRef = React.useRef<string | undefined>();
  const prevChildIndexRef = React.useRef<number>(0);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    if (!enabled || !isOpen || !currentCardRefUid) return;
    expandedBlockUidsRef.current.add(currentCardRefUid);
  }, [enabled, isOpen, currentCardRefUid]);

  React.useEffect(() => {
    if (!enabled) return;
    const prevUid = prevCardRefUidRef.current;
    prevCardRefUidRef.current = currentCardRefUid;
    if (prevUid && prevUid !== currentCardRefUid) {
      setTimeout(() => {
        if (!isMountedRef.current) return;
        collapseBlockOnPage(prevUid);
      }, 300);
    }
  }, [enabled, currentCardRefUid]);

  React.useEffect(() => {
    if (!enabled || !isLineByLineActive) {
      prevChildIndexRef.current = lineByLineCurrentChildIndex;
      return;
    }
    const prevIndex = prevChildIndexRef.current;
    prevChildIndexRef.current = lineByLineCurrentChildIndex;
    if (lineByLineCurrentChildIndex > prevIndex) {
      for (let i = prevIndex; i < lineByLineCurrentChildIndex; i++) {
        const uid = childUidsList[i];
        if (uid) {
          expandedBlockUidsRef.current.add(uid);
          const collapseUid = uid;
          setTimeout(() => {
            if (!isMountedRef.current) return;
            collapseBlockOnPage(collapseUid);
          }, 300);
        }
      }
    }
  }, [enabled, isLineByLineActive, lineByLineCurrentChildIndex, childUidsList]);

  React.useEffect(() => {
    if (!enabled || !lineByLineIsCardComplete || !currentCardRefUid) return;
    expandedBlockUidsRef.current.add(currentCardRefUid);
    const uid = currentCardRefUid;
    setTimeout(() => {
      if (!isMountedRef.current) return;
      collapseBlockOnPage(uid);
    }, 300);
  }, [enabled, lineByLineIsCardComplete, currentCardRefUid]);

  React.useEffect(() => {
    if (!enabled) return;
    if (!isOpen && expandedBlockUidsRef.current.size > 0) {
      const uids = Array.from(expandedBlockUidsRef.current);
      expandedBlockUidsRef.current.clear();
      setTimeout(() => {
        if (!isMountedRef.current) return;
        uids.forEach((uid) => collapseBlockOnPage(uid));
      }, 500);
    }
  }, [enabled, isOpen]);
}
