import * as React from 'react';
import { TagCardSets } from '~/models/practice';
import {
  CardMeta,
  InteractionStyle,
  Records,
  RecordUid,
  Session,
  SchedulingAlgorithm,
  classifyCard,
} from '~/models/session';
import {
  getChildSessionData,
  savePracticeData,
  updateParentNextDueDate,
  updateReviewConfig,
} from '~/queries';
import { generateNewSession } from '~/queries/utils';
import { generatePracticeData } from '~/practice';
import { getLblQueueState } from '~/models/practice';
import {
  deriveParentNextDueDateFromChildSessions,
  resolveBaseForCalculation,
} from '~/models/session';
import { ReviewViewState, SessionFacts, LatestSessionRecord } from './types';
import { CardSet } from './queue/types';
import { useQueue } from './queue/useQueue';

const mergeSourceIntoFacts = ({
  currentFacts,
  incoming,
}: {
  currentFacts: SessionFacts;
  incoming: Records;
}): SessionFacts => {
  const latestByUid = { ...currentFacts.latestByUid };
  Object.keys(incoming).forEach((uid) => {
    if (!currentFacts.pendingByUid[uid]) {
      latestByUid[uid] = incoming[uid];
    }
  });

  return {
    ...currentFacts,
    latestByUid,
  };
};

const deriveCompletedUids = (
  cardSet: CardSet,
  latestByUid: Record<RecordUid, LatestSessionRecord>,
  todayStr: string
): Set<RecordUid> => {
  const [y, m, d] = todayStr.split('-').map(Number);
  const now = new Date(y, m - 1, d, 23, 59, 59);
  const result = new Set<RecordUid>();

  // cardSet.completed 中的卡片已被 classifyAllCards 判定为已完成，直接标记
  for (const uid of cardSet.completed) {
    result.add(uid);
  }

  // 对 due 和 new 中的卡片重新分类，识别今天刚完成的
  const checkUids = [...cardSet.due, ...cardSet.new];
  for (const uid of checkUids) {
    const session = latestByUid[uid] as Session | undefined;
    const lblChildren = cardSet.lblMeta[uid]
      ? {
          uids: cardSet.lblMeta[uid],
          sessions: Object.fromEntries(
            cardSet.lblMeta[uid].map((childUid) => [
              childUid,
              latestByUid[childUid] as Session | undefined,
            ])
          ),
        }
      : undefined;
    const cls = classifyCard({ session, lblChildren, now });
    if (cls === 'completed') {
      result.add(uid);
    }
  }
  return result;
};

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
  const [facts, setFacts] = React.useState<SessionFacts>({
    latestByUid: practiceData,
    pendingByUid: {},
  });
  const [viewState, setViewState] = React.useState<ReviewViewState>({
    currentIndex: 0,
    focusedChildUid: undefined,
    maxVisitedChildIndex: 0,
  });

  React.useEffect(() => {
    setFacts((prev) => mergeSourceIntoFacts({ currentFacts: prev, incoming: practiceData }));
  }, [practiceData]);

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

  const completedUids = React.useMemo(
    () => deriveCompletedUids(cardSet, facts.latestByUid, today),
    [cardSet, facts.latestByUid, today]
  );

  const queueId = `${today}-${selectedTag}`;

  const {
    uids: rawUids,
    reinsert: queueReinsert,
    checkDeleted,
  } = useQueue(cardSet, queueId, selectedTag);

  // rawUids 已由 useQueue 叠加了配额遮罩 + 黑名单遮罩，直接作为展示队列使用
  const filteredQueue = rawUids;

  // ref 确保 reviewUnit/LBL Next 等回调始终使用最新的 filteredQueue，
  // 避免闭包陈旧导致 afterUid 解析错误
  const filteredQueueRef = React.useRef(filteredQueue);
  filteredQueueRef.current = filteredQueue;

  const repositionRequestedRef = React.useRef<'reset' | 'next' | false>('reset');
  const [repositionVersion, setRepositionVersion] = React.useState(0);

  const [prevTag, setPrevTag] = React.useState(selectedTag);
  if (selectedTag !== prevTag) {
    setPrevTag(selectedTag);
    repositionRequestedRef.current = 'reset';
  }

  const [prevDate, setPrevDate] = React.useState(today);
  if (today !== prevDate) {
    setPrevDate(today);
    repositionRequestedRef.current = 'reset';
  }

  const viewStateRef = React.useRef(viewState);
  viewStateRef.current = viewState;

  const resetToFirstUnpracticed = React.useCallback(() => {
    repositionRequestedRef.current = 'reset';
    setRepositionVersion((v) => v + 1);
  }, []);

  const navigateToNextUnpracticed = React.useCallback(() => {
    repositionRequestedRef.current = 'next';
    setRepositionVersion((v) => v + 1);
  }, []);

  React.useEffect(() => {
    if (!repositionRequestedRef.current) return;
    if (filteredQueue.length === 0) return;

    const mode = repositionRequestedRef.current;
    repositionRequestedRef.current = false;

    let targetIndex: number;
    if (mode === 'next') {
      const startIndex = viewStateRef.current.currentIndex + 1;
      const nextIndex = filteredQueue.findIndex(
        (uid, index) => index >= startIndex && !completedUids.has(uid)
      );
      targetIndex = nextIndex >= 0 ? nextIndex : filteredQueue.length;
    } else {
      const firstUnpracticedIndex = filteredQueue.findIndex((uid) => !completedUids.has(uid));
      targetIndex = firstUnpracticedIndex >= 0 ? firstUnpracticedIndex : filteredQueue.length;
    }

    setViewState({
      currentIndex: targetIndex,
      focusedChildUid: undefined,
      maxVisitedChildIndex: 0,
    });
  }, [repositionVersion, filteredQueue, completedUids]);

  const currentCardRefUid =
    viewState.currentIndex >= 0 && viewState.currentIndex < filteredQueue.length
      ? filteredQueue[viewState.currentIndex]
      : undefined;

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

  const setPendingState = React.useCallback(
    (uid: RecordUid, state: SessionFacts['pendingByUid'][string]) => {
      setFacts((prev) => ({
        ...prev,
        pendingByUid: {
          ...prev.pendingByUid,
          [uid]: state,
        },
      }));
    },
    []
  );

  const upsertLatestSessions = React.useCallback((sessions: Partial<Records>) => {
    setFacts((prev) => ({
      ...prev,
      latestByUid: {
        ...prev.latestByUid,
        ...sessions,
      },
    }));
  }, []);

  const ensureLatestSessions = React.useCallback(
    async (uids: string[]) => {
      if (!uids.length) return {};
      const data = await getChildSessionData({ childUids: uids, dataPageTitle });
      if (Object.keys(data).length) {
        setFacts((prev) => ({
          ...prev,
          latestByUid: {
            ...prev.latestByUid,
            ...data,
          },
        }));
      }
      return data;
    },
    [dataPageTitle]
  );

  const reviewUnit = React.useCallback(
    async (args: {
      targetUid: RecordUid;
      grade: number;
      algorithm: SchedulingAlgorithm;
      interaction: InteractionStyle;
      forgotReinsertOffset: number;
      currentPrimaryEntryId?: string;
      baseCardData?: Session;
      currentCardData?: Session;
      fixed_multiplier?: number;
      fixed_unit?: import('~/models/session').FixedTimeUnit;
      isChild?: boolean;
      parentUid?: RecordUid;
      childUidsList?: string[];
      childSessionData?: Record<string, Session>;
      currentChildIsLblNext?: boolean;
      lineByLineCurrentChildIndex?: number;
      lblNextReinsertOffset?: number;
    }) => {
      const {
        targetUid,
        grade,
        algorithm,
        interaction,
        forgotReinsertOffset,
        baseCardData,
        currentCardData,
        fixed_multiplier,
        fixed_unit,
        isChild,
        parentUid,
        childUidsList,
        childSessionData,
        currentChildIsLblNext,
        lineByLineCurrentChildIndex,
        lblNextReinsertOffset,
      } = args;

      const now = new Date();

      let practiceResult: ReturnType<typeof generatePracticeData>;
      let updatedChildSessionsForParent: Record<string, Session> | undefined;
      let updatedParentSession: Session | undefined;

      if (isChild) {
        const childList = childUidsList!;
        const cData = childSessionData!;
        const existingChildSession = cData[targetUid] || generateNewSession({ algorithm });
        const baseForCalc = resolveBaseForCalculation(existingChildSession, now);
        const sm2_grade = currentChildIsLblNext ? undefined : grade;

        practiceResult = generatePracticeData({
          ...baseForCalc,
          algorithm,
          ...(sm2_grade !== undefined && { sm2_grade }),
          dateCreated: now,
        });

        updatedChildSessionsForParent = {
          ...cData,
          [targetUid]: { ...existingChildSession, ...practiceResult, dateCreated: now },
        };

        const pSession = facts.latestByUid[parentUid!] as Session | undefined;
        updatedParentSession = {
          ...(pSession || {}),
          algorithm,
          interaction,
          dateCreated: now,
          nextDueDate: deriveParentNextDueDateFromChildSessions(
            childList,
            updatedChildSessionsForParent,
            now
          ),
        };
      } else {
        const baseData = baseCardData || currentCardData;
        practiceResult = generatePracticeData({
          ...baseData,
          sm2_grade: grade,
          ...(algorithm && { algorithm }),
          ...(interaction && { interaction }),
          ...(fixed_multiplier !== undefined && { fixed_multiplier }),
          ...(fixed_unit !== undefined && { fixed_unit }),
          dateCreated: now,
        });
      }

      if (!isCramming) {
        setPendingState(targetUid, 'saving');
        if (isChild) {
          upsertLatestSessions({
            [targetUid]: {
              ...(childSessionData![targetUid] || generateNewSession({ algorithm })),
              ...practiceResult,
              dateCreated: now,
            } as Session,
            [parentUid!]: updatedParentSession!,
          });
        } else {
          const baseData = baseCardData || currentCardData;
          upsertLatestSessions({
            [targetUid]: {
              ...baseData,
              ...practiceResult,
              dateCreated: now,
            } as Session,
          });
        }
      }

      const isForgot = grade === 0;

      if (!isChild || isForgot) {
        const reinsertUid = isChild ? parentUid! : targetUid;
        if (isForgot && forgotReinsertOffset > 0) {
          const afterUid = filteredQueueRef.current[viewStateRef.current.currentIndex];
          queueReinsert(reinsertUid, afterUid, forgotReinsertOffset);
        }
        navigateToNextUnpracticed();
      } else {
        const childList = childUidsList!;
        const nextDueIndex = getLblQueueState(
          childList,
          updatedChildSessionsForParent!,
          lineByLineCurrentChildIndex! + 1
        ).nextDueChildIndex;

        if (
          currentChildIsLblNext &&
          lblNextReinsertOffset! > 0 &&
          lineByLineCurrentChildIndex! < childList.length - 1
        ) {
          queueReinsert(
            parentUid!,
            filteredQueueRef.current[viewStateRef.current.currentIndex],
            lblNextReinsertOffset!
          );
          navigateToNextUnpracticed();
        } else if (nextDueIndex >= childList.length) {
          navigateToNextUnpracticed();
        }

        if (nextDueIndex < childList.length) {
          setFocusedChildUid(childList[nextDueIndex]);
          setMaxVisitedChildIndex(nextDueIndex);
        }
      }

      try {
        await savePracticeData({
          refUid: targetUid,
          dataPageTitle,
          dateCreated: now,
          ...practiceResult,
        });
        if (isChild) {
          await updateParentNextDueDate({
            refUid: parentUid!,
            childUids: childUidsList!,
            dataPageTitle,
            childSessions: updatedChildSessionsForParent,
          });
        }
      } catch (err) {
        console.error('Memo: Failed to save practice data', err);
      } finally {
        setPendingState(targetUid, undefined);
      }
    },
    [
      isCramming,
      dataPageTitle,
      facts.latestByUid,
      setPendingState,
      upsertLatestSessions,
      queueReinsert,
      setFocusedChildUid,
      setMaxVisitedChildIndex,
      navigateToNextUnpracticed,
    ]
  );

  const updateReviewConfigAction = React.useCallback(
    async (args: {
      targetUid: RecordUid;
      isChild: boolean;
      algorithm?: SchedulingAlgorithm;
      interaction?: InteractionStyle;
      childSessionData?: Record<string, Session>;
      applyOptimisticCardMeta: (meta: CardMeta) => void;
      cardMeta: CardMeta | undefined;
    }) => {
      const {
        targetUid,
        isChild,
        algorithm,
        interaction,
        childSessionData,
        applyOptimisticCardMeta,
        cardMeta,
      } = args;

      try {
        setPendingState(targetUid, 'updatingConfig');

        if (isChild) {
          const existingChildSession =
            childSessionData?.[targetUid] || generateNewSession({ algorithm });
          upsertLatestSessions({
            [targetUid]: {
              ...existingChildSession,
              algorithm,
            } as Session,
          });
        } else {
          const currentSession = facts.latestByUid[targetUid] as Session | undefined;
          upsertLatestSessions({
            [targetUid]: {
              ...(currentSession || {}),
              algorithm,
              interaction,
            } as Session,
          });

          applyOptimisticCardMeta({
            ...cardMeta,
            algorithm: (algorithm ?? cardMeta?.algorithm) as SchedulingAlgorithm,
            interaction: (interaction ?? cardMeta?.interaction) as InteractionStyle,
          });
        }

        await updateReviewConfig({
          refUid: targetUid,
          dataPageTitle,
          algorithm,
          interaction,
        });
      } catch (err) {
        console.error('Memo: Failed to update review config', err);
      } finally {
        setPendingState(targetUid, undefined);
      }
    },
    [dataPageTitle, facts.latestByUid, setPendingState, upsertLatestSessions]
  );

  return {
    facts,
    viewState,
    renderMode: tagCardSets[selectedTag]?.renderMode,
    completedCount: completedUids.size,
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
