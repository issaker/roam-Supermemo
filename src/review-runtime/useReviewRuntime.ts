import * as React from 'react';
import { TagCardSets } from '~/models/practice';
import { Records } from '~/models/session';
import { ReviewViewState } from './types';
import { CardSet } from './queue/types';
import { useQueue } from './queue/useQueue';
import { isCardCompletedToday } from './reviewLogic';
import { useSessionFacts } from './useSessionFacts';
import { useReviewOperation } from './useReviewOperation';

export const useReviewRuntime = ({
  practiceData,
  tagCardSets,
  selectedTag,
  isCramming,
  dataPageTitle,
}: {
  practiceData: Records;
  tagCardSets: TagCardSets;
  selectedTag: string;
  isCramming: boolean;
  dataPageTitle: string;
}) => {
  const { facts, setPendingState, upsertLatestSessions, ensureLatestSessions } = useSessionFacts(
    practiceData,
    dataPageTitle
  );

  const [viewState, setViewState] = React.useState<ReviewViewState>({
    currentIndex: 0,
    focusedChildUid: undefined,
    maxVisitedChildIndex: 0,
  });

  const cardSet = React.useMemo((): CardSet => {
    const tagData = tagCardSets[selectedTag];
    if (!tagData) return { due: [], new: [], completed: [], lblMeta: {} };
    return {
      due: tagData.dueUids,
      new: tagData.newUids,
      completed: tagData.completedUids,
      lblMeta: tagData.lblDeckMeta,
    };
  }, [tagCardSets, selectedTag]);

  const today = new Date().toISOString().slice(0, 10);
  const todayEnd = React.useMemo(() => {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59);
  }, [today]);

  const queueId = `${today}-${selectedTag}`;

  const {
    uids: rawUids,
    reinsert: queueReinsert,
    checkDeleted,
  } = useQueue(cardSet, queueId, selectedTag);

  const filteredQueue = rawUids;

  const completedCount = React.useMemo(
    () =>
      filteredQueue.filter((uid) =>
        isCardCompletedToday(uid, facts.latestByUid, cardSet.lblMeta, todayEnd)
      ).length,
    [filteredQueue, facts.latestByUid, cardSet.lblMeta, todayEnd]
  );

  const filteredQueueRef = React.useRef(filteredQueue);
  filteredQueueRef.current = filteredQueue;

  const viewStateRef = React.useRef(viewState);
  viewStateRef.current = viewState;

  const [pendingReposition, setPendingReposition] = React.useState<'reset' | 'next' | null>(
    'reset'
  );

  const [prevTag, setPrevTag] = React.useState(selectedTag);
  if (selectedTag !== prevTag) {
    setPrevTag(selectedTag);
    setPendingReposition('reset');
  }

  const [prevDate, setPrevDate] = React.useState(today);
  if (today !== prevDate) {
    setPrevDate(today);
    setPendingReposition('reset');
  }

  const resetToFirstUnpracticed = React.useCallback(() => {
    setPendingReposition('reset');
  }, []);

  const navigateToNextUnpracticed = React.useCallback(() => {
    setPendingReposition('next');
  }, []);

  React.useEffect(() => {
    if (pendingReposition === null) return;
    if (filteredQueue.length === 0) return;

    let targetIndex: number;
    if (pendingReposition === 'next') {
      const startIndex = viewStateRef.current.currentIndex;
      const nextIndex = filteredQueue.findIndex(
        (uid, index) =>
          index >= startIndex &&
          !isCardCompletedToday(uid, facts.latestByUid, cardSet.lblMeta, todayEnd)
      );
      targetIndex = nextIndex >= 0 ? nextIndex : filteredQueue.length;
    } else {
      const firstUnpracticedIndex = filteredQueue.findIndex(
        (uid) => !isCardCompletedToday(uid, facts.latestByUid, cardSet.lblMeta, todayEnd)
      );
      targetIndex = firstUnpracticedIndex >= 0 ? firstUnpracticedIndex : filteredQueue.length;
    }

    setPendingReposition(null);
    setViewState({
      currentIndex: targetIndex,
      focusedChildUid: undefined,
      maxVisitedChildIndex: 0,
    });
  }, [pendingReposition, filteredQueue, facts.latestByUid, cardSet.lblMeta, todayEnd]);

  const currentCardRefUid =
    viewState.currentIndex >= 0 && viewState.currentIndex < filteredQueue.length
      ? filteredQueue[viewState.currentIndex]
      : undefined;

  // 为 ref 模式下的稳定回调收集最新依赖
  const currentPrimaryEntryId = currentCardRefUid ? `card:${currentCardRefUid}` : undefined;

  const focusPrimaryByOffset = React.useCallback(
    (offset: number) => {
      setViewState((prev) => {
        const newIndex = prev.currentIndex + offset;
        if (newIndex >= 0 && newIndex <= filteredQueue.length) {
          return { ...prev, currentIndex: newIndex };
        }
        return prev;
      });
    },
    [filteredQueue.length]
  );

  const setFocusedPrimaryUid = React.useCallback(
    (uid?: string) => {
      if (uid === undefined) {
        setViewState((prev) => ({ ...prev, currentIndex: 0 }));
        return;
      }
      const index = filteredQueue.indexOf(uid);
      if (index >= 0) {
        setViewState((prev) => ({ ...prev, currentIndex: index }));
      }
    },
    [filteredQueue]
  );

  const setFocusedChildUid = React.useCallback((uid?: string) => {
    setViewState((prev) => ({
      ...prev,
      focusedChildUid: uid,
    }));
  }, []);

  const resetChildViewState = React.useCallback(() => {
    setViewState((prev) => ({
      ...prev,
      focusedChildUid: undefined,
      maxVisitedChildIndex: 0,
    }));
  }, []);

  const setMaxVisitedChildIndex = React.useCallback((index: number) => {
    setViewState((prev) => ({
      ...prev,
      maxVisitedChildIndex: Math.max(prev.maxVisitedChildIndex, index),
    }));
  }, []);

  const { reviewUnit, updateReviewConfigAction } = useReviewOperation({
    facts,
    isCramming,
    dataPageTitle,
    setPendingState,
    upsertLatestSessions,
    queueOps: {
      queueReinsert,
      filteredQueueRef,
      viewStateRef,
    },
    navigationOps: {
      navigateToNextUnpracticed,
      setFocusedChildUid,
      setMaxVisitedChildIndex,
    },
  });

  return {
    facts,
    viewState,
    renderMode: tagCardSets[selectedTag]?.renderMode,
    completedCount,
    currentPrimaryEntryId,
    currentCardRefUid,
    currentIndex: viewState.currentIndex,
    cardQueueLength: filteredQueue.length,
    setFocusedPrimaryUid,
    focusPrimaryByOffset,
    setFocusedChildUid,
    resetChildViewState,
    setMaxVisitedChildIndex,
    resetToFirstUnpracticed,
    navigateToNextUnpracticed,
    upsertLatestSessions,
    ensureLatestSessions,
    reviewUnit,
    updateReviewConfigAction,
    checkDeleted,
  };
};
