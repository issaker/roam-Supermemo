import * as React from 'react';
import { TagCardSets } from '~/models/practice';
import {
  CardMeta,
  InteractionStyle,
  Records,
  RecordUid,
  Session,
  SchedulingAlgorithm,
} from '~/models/session';
import {
  getChildSessionData,
  savePracticeData,
  updateParentNextDueDate,
  updateReviewConfig,
} from '~/queries';
import { generateNewSession } from '~/queries/utils';
import { generatePracticeData } from '~/practice';
import { deriveLblSubQueue } from '~/models/practice';
import {
  deriveParentNextDueDateFromChildSessions,
  resolveBaseForCalculation,
} from '~/models/session';
import { ReviewViewState, SessionFacts } from './types';
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

  // 队列身份 = 日期 + 牌组，每日每牌组仅构建一次快照
  const queueId = `${new Date().toISOString().slice(0, 10)}-${selectedTag}`;

  const {
    effectiveQueue,
    complete: queueComplete,
    reinsert: queueReinsert,
  } = useQueue(cardSet, queueId, selectedTag);

  // 游标重定位：切换牌组、重启会话、日期变更时触发
  const repositionRequestedRef = React.useRef(true);
  const [repositionVersion, setRepositionVersion] = React.useState(0);

  const [prevTag, setPrevTag] = React.useState(selectedTag);
  if (selectedTag !== prevTag) {
    setPrevTag(selectedTag);
    repositionRequestedRef.current = true;
  }

  const today = new Date().toISOString().slice(0, 10);
  const [prevDate, setPrevDate] = React.useState(today);
  if (today !== prevDate) {
    setPrevDate(today);
    repositionRequestedRef.current = true;
  }

  const resetToFirstUnpracticed = React.useCallback(() => {
    repositionRequestedRef.current = true;
    setRepositionVersion((v) => v + 1);
  }, []);

  React.useEffect(() => {
    if (!repositionRequestedRef.current) return;
    if (effectiveQueue.uids.length === 0) return;

    repositionRequestedRef.current = false;
    const firstUnpracticedIndex = effectiveQueue.uids.findIndex(
      (uid, index) =>
        index >= effectiveQueue.preCompletedCount && !effectiveQueue.completedUids.has(uid)
    );
    setViewState({
      currentIndex: firstUnpracticedIndex >= 0 ? firstUnpracticedIndex : effectiveQueue.uids.length,
      focusedChildUid: undefined,
      maxVisitedChildIndex: 0,
    });
  }, [repositionVersion, effectiveQueue]);

  const viewStateRef = React.useRef(viewState);
  viewStateRef.current = viewState;

  const currentCardRefUid =
    viewState.currentIndex >= 0 && viewState.currentIndex < effectiveQueue.uids.length
      ? effectiveQueue.uids[viewState.currentIndex]
      : undefined;

  const currentPrimaryEntryId = currentCardRefUid ? `card:${currentCardRefUid}` : undefined;

  const focusPrimaryByOffset = React.useCallback(
    (offset: number) => {
      setViewState((prev) => {
        const newIndex = prev.currentIndex + offset;
        if (newIndex >= 0 && newIndex <= effectiveQueue.uids.length) {
          return { ...prev, currentIndex: newIndex };
        }
        return prev;
      });
    },
    [effectiveQueue.uids.length]
  );

  const setFocusedPrimaryUid = React.useCallback(
    (uid?: string) => {
      if (uid === undefined) {
        setViewState((prev) => ({ ...prev, currentIndex: 0 }));
        return;
      }
      const index = effectiveQueue.uids.indexOf(uid);
      if (index >= 0) {
        setViewState((prev) => ({ ...prev, currentIndex: index }));
      }
    },
    [effectiveQueue.uids]
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

  const upsertLatestSession = React.useCallback((uid: RecordUid, session: Records[string]) => {
    setFacts((prev) => ({
      ...prev,
      latestByUid: {
        ...prev.latestByUid,
        [uid]: session,
      },
    }));
  }, []);

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
      setShowAnswers: (show: boolean) => void;
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
        setShowAnswers,
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
          upsertLatestSession(targetUid, {
            ...baseData,
            ...practiceResult,
            dateCreated: now,
          } as Session);
        }
      }

      const isForgot = grade === 0;

      if (!isChild || isForgot) {
        const reinsertUid = isChild ? parentUid! : targetUid;
        if (isForgot && forgotReinsertOffset > 0) {
          queueReinsert(
            reinsertUid,
            viewStateRef.current.currentIndex,
            forgotReinsertOffset,
            'forgot'
          );
          setShowAnswers(false);
          setViewState((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
        } else {
          queueComplete(reinsertUid);
          setShowAnswers(false);
          setViewState((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
        }
      } else {
        const childList = childUidsList!;
        const nextDueIndex = deriveLblSubQueue(
          childList,
          updatedChildSessionsForParent!,
          lineByLineCurrentChildIndex! + 1
        ).nextDueChildIndex;
        const isCardComplete = nextDueIndex >= childList.length;

        setShowAnswers(false);

        if (
          currentChildIsLblNext &&
          lblNextReinsertOffset! > 0 &&
          lineByLineCurrentChildIndex! < childList.length - 1
        ) {
          queueReinsert(
            parentUid!,
            viewStateRef.current.currentIndex,
            lblNextReinsertOffset!,
            'lbl-next'
          );
          setViewState((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
        } else if (isCardComplete) {
          queueComplete(parentUid!);
          setViewState((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
        }

        setFocusedChildUid(childList[nextDueIndex]);
        setMaxVisitedChildIndex(nextDueIndex);
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
      upsertLatestSession,
      upsertLatestSessions,
      queueComplete,
      queueReinsert,
      setFocusedChildUid,
      setMaxVisitedChildIndex,
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
          upsertLatestSession(targetUid, {
            ...existingChildSession,
            algorithm,
          } as Session);
        } else {
          const currentSession = facts.latestByUid[targetUid] as Session | undefined;
          upsertLatestSession(targetUid, {
            ...(currentSession || {}),
            algorithm,
            interaction,
          } as Session);

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
    [dataPageTitle, facts.latestByUid, setPendingState, upsertLatestSession]
  );

  return {
    facts,
    viewState,
    renderMode: tagCardSets[selectedTag]?.renderMode,
    completedCount: effectiveQueue.completedUids.size,
    currentPrimaryEntryId,
    currentCardRefUid,
    currentIndex: viewState.currentIndex,
    cardQueueLength: effectiveQueue.uids.length,
    setFocusedPrimaryUid,
    focusPrimaryByOffset,
    setFocusedChildUid,
    resetChildViewState,
    setMaxVisitedChildIndex,
    resetToFirstUnpracticed,
    upsertLatestSession,
    upsertLatestSessions,
    ensureLatestSessions,
    reviewUnit,
    updateReviewConfigAction,
  };
};
