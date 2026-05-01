import * as React from 'react';
import { Today } from '~/models/practice';
import {
  CardMeta,
  InteractionStyle,
  isSessionMastered,
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
import { getLblQueueState } from '~/models/practice';
import {
  deriveParentNextDueDateFromChildSessions,
  resolveBaseForCalculation,
} from '~/models/session';
/**
 * useReviewRuntime — single entry point for all review state.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ARCHITECTURE INVARIANT — READ BEFORE MODIFYING:
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Completed cards are NOT removed from the primaryQueue. They stay in
 *   the queue so the user can undo a previous grade. When the user
 *   switches decks or the session restarts, currentIndex is set to the
 *   first uncompleted card, skipping already-practiced cards. On data
 *   refresh, if the current card becomes completed, currentIndex advances
 *   to the next uncompleted card.
 *
 *   Cards are NOT removed immediately after grading — they stay in the
 *   queue so the user can undo a previous grade. After each review,
 *   currentIndex advances past the current card. When the user switches
 *   decks or the session restarts, currentIndex is set to the first
 *   uncompleted card, skipping any already-practiced cards.
 *
 *   The queue is rebuilt from scratch on tag switch or settings change.
 *   On regular data refresh, only completed cards are removed — the
 *   queue otherwise stays stable (no new cards appended, no reordering).
 *
 *   Forgot and LBL-Next reinserts splice DUPLICATE entries directly into
 *   the queue state. Navigation is purely index-based: after each review,
 *   currentIndex++.
 *
 *   DO NOT re-derive the queue from deriveDeckSnapshot or latestByUid on
 *   every mutation. That was the cause of the "queue jumps to 0/51" bug.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   1. SessionFacts (facts.latestByUid) — one session per uid
 *   2. primaryQueue — state, built from initialUids, shrinks as cards are completed
 *   3. ViewState — currentIndex into the queue + child focus state
 */
import { deriveDeckSnapshot } from './selectors';
import { ReviewViewState, SessionFacts } from './types';

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
  today,
  selectedTag,
  isCramming,
  dataPageTitle,
}: {
  practiceData: Records;
  today: Today;
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

  // ── incoming data sync ──
  React.useEffect(() => {
    setFacts((prev) => mergeSourceIntoFacts({ currentFacts: prev, incoming: practiceData }));
  }, [practiceData]);

  // ── primary queue ──
  // Built from today's completedUids + dueUids + newUids. Completed cards
  // are placed at the front so the user can navigate left to review or undo.
  // currentIndex is set to the first uncompleted card on tag switch /
  // session restart.
  const initialUids = React.useMemo(() => {
    const tagData = today.tags[selectedTag];
    if (!tagData) return [];
    const completed = tagData.completedUids || [];
    const due = tagData.dueUids || [];
    const newUids = tagData.newUids || [];
    const seen = new Set<string>();
    const result: RecordUid[] = [];
    for (const uid of [...completed, ...due, ...newUids]) {
      if (!seen.has(uid)) {
        seen.add(uid);
        result.push(uid);
      }
    }
    return result;
  }, [today, selectedTag]);

  const completedUidsSet = React.useMemo(
    () => new Set(today.tags[selectedTag]?.completedUids || []),
    [today, selectedTag]
  );

  const [primaryQueue, setPrimaryQueue] = React.useState<RecordUid[]>(() => initialUids);

  const initialUidsKey = React.useMemo(() => initialUids.join(','), [initialUids]);

  const primaryQueueRef = React.useRef(primaryQueue);
  primaryQueueRef.current = primaryQueue;

  const viewStateRef = React.useRef(viewState);
  viewStateRef.current = viewState;

  const prevInitialUidsKeyRef = React.useRef('');
  const prevCompletedUidsSetRef = React.useRef(completedUidsSet);

  // Sync primaryQueue when data changes.
  // - Tag switch / settings change (initialUidsKey changed) → rebuild queue,
  //   position at first uncompleted card (skip already-practiced cards)
  // - Data refresh (only completedUidsSet changed) → remove newly completed cards, adjust currentIndex
  React.useEffect(() => {
    const initialUidsChanged = prevInitialUidsKeyRef.current !== initialUidsKey;
    prevInitialUidsKeyRef.current = initialUidsKey;

    if (initialUidsChanged) {
      setPrimaryQueue(initialUids);
      const now = new Date();
      const firstUncompletedIndex = initialUids.findIndex((uid) => {
        const session = facts.latestByUid[uid] as Session & { isNew?: boolean };
        if (!session || session.isNew) return true;
        return !isSessionMastered(session, now);
      });
      setViewState({
        currentIndex: firstUncompletedIndex >= 0 ? firstUncompletedIndex : initialUids.length,
        focusedChildUid: undefined,
        maxVisitedChildIndex: 0,
      });
      prevCompletedUidsSetRef.current = completedUidsSet;
      return;
    }

    const prevSet = prevCompletedUidsSetRef.current;
    const newlyCompleted = new Set(Array.from(completedUidsSet).filter((uid) => !prevSet.has(uid)));
    prevCompletedUidsSetRef.current = completedUidsSet;

    if (newlyCompleted.size === 0) return;

    const currentQueue = primaryQueueRef.current;
    const currentUid = currentQueue[viewStateRef.current.currentIndex];

    if (currentUid && newlyCompleted.has(currentUid)) {
      const nextUncompletedIndex = currentQueue.findIndex(
        (uid, idx) => idx > viewStateRef.current.currentIndex && !completedUidsSet.has(uid)
      );
      setViewState((prev) => ({
        ...prev,
        currentIndex: nextUncompletedIndex >= 0 ? nextUncompletedIndex : currentQueue.length,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUidsKey, completedUidsSet]);

  // ── derived display state (for status badges, completion checks) ──
  // deckSnapshot is only used for DISPLAY.  Never for queue derivation.
  const deckSnapshot = React.useMemo(
    () =>
      deriveDeckSnapshot({
        today,
        selectedTag,
        latestByUid: facts.latestByUid as Records,
        isCramming,
      }),
    [today, selectedTag, facts.latestByUid, isCramming]
  );

  // ── current position ──
  const currentCardRefUid =
    viewState.currentIndex >= 0 && viewState.currentIndex < primaryQueue.length
      ? primaryQueue[viewState.currentIndex]
      : undefined;

  const focusedPrimary = {
    index: currentCardRefUid ? viewState.currentIndex : -1,
    entry: currentCardRefUid
      ? { id: `card:${currentCardRefUid}`, uid: currentCardRefUid }
      : undefined,
  };

  const currentPrimaryEntryId = focusedPrimary.entry?.id;

  const reinsertCard = React.useCallback((uid: RecordUid, afterIndex: number, offset: number) => {
    setPrimaryQueue((prev) => {
      const insertAt = Math.min(afterIndex + 1 + offset, prev.length);
      const next = [...prev];
      next.splice(insertAt, 0, uid);
      return next;
    });
  }, []);

  // ── navigation ──
  const focusPrimaryByOffset = React.useCallback(
    (offset: number) => {
      setViewState((prev) => {
        const newIndex = prev.currentIndex + offset;
        if (newIndex >= 0 && newIndex < primaryQueue.length) {
          return { ...prev, currentIndex: newIndex };
        }
        return prev;
      });
    },
    [primaryQueue]
  );

  const setFocusedPrimaryUid = React.useCallback((uid?: string) => {
    if (uid === undefined) {
      setViewState((prev) => ({ ...prev, currentIndex: 0 }));
      return;
    }
    const index = primaryQueueRef.current.indexOf(uid);
    if (index >= 0) {
      setViewState((prev) => ({ ...prev, currentIndex: index }));
    }
  }, []);

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

  // ── facts mutation helpers ──
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

  const clearPendingState = React.useCallback((uid: RecordUid) => {
    setFacts((prev) => ({
      ...prev,
      pendingByUid: {
        ...prev.pendingByUid,
        [uid]: undefined,
      },
    }));
  }, []);

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

  // ── unified reviewUnit ──
  // Normal cards and LBL child blocks share a single grading function.
  //
  // After computing the practice result:
  //   1. Update facts (optimistic)
  //   2. Handle reinsert (Forgot / LBL-Next) via reinsertCard
  //   3. Reset showAnswers, then advance currentIndex by 1
  //
  // Cards stay in the queue after grading so the user can undo.
  // Completed cards are removed on data refresh or when switching decks.
  const reviewUnit = React.useCallback(
    async (args: {
      targetUid: RecordUid;
      grade: number;
      algorithm: SchedulingAlgorithm;
      interaction: InteractionStyle;
      forgotReinsertOffset: number;
      currentPrimaryEntryId?: string;
      setShowAnswers: (show: boolean) => void;
      // ── normal-card-only ──
      baseCardData?: Session;
      currentCardData?: Session;
      fixed_multiplier?: number;
      fixed_unit?: import('~/models/session').FixedTimeUnit;
      // ── LBL-child-only ──
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

      // ── 1. Compute practice result ──
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

      // ── 2. Optimistic facts update ──
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

      // ── 3. Handle reinsert (Forgot / LBL-Next) + advance ──
      const isForgot = grade === 0;

      // setShowAnswers(false) MUST precede currentIndex advance so the
      // current card's override is reset before any synchronous re-render
      // updates activeSetShowAnswersRef to point to the next card.
      if (!isChild || isForgot) {
        const reinsertUid = isChild ? parentUid! : targetUid;
        if (isForgot && forgotReinsertOffset > 0) {
          reinsertCard(reinsertUid, viewState.currentIndex, forgotReinsertOffset);
        }
        setShowAnswers(false);
        setViewState((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
      } else {
        // LBL child non-Forgot: advance within children or complete card.
        const childList = childUidsList!;
        const nextDueIndex = getLblQueueState(
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
          reinsertCard(parentUid!, viewState.currentIndex, lblNextReinsertOffset!);
          setViewState((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
        } else if (isCardComplete) {
          setViewState((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }));
        }

        setFocusedChildUid(childList[nextDueIndex]);
        setMaxVisitedChildIndex(nextDueIndex);
      }

      // ── 4. Persist to Roam ──
      // savePracticeData MUST complete before updateParentNextDueDate
      // because the latter reads child sessions from Roam to derive the
      // parent's nextDueDate — if the just-saved child isn't visible yet,
      // deriveParentNextDueDateFromChildSessions treats it as due-now and
      // incorrectly sets the parent's nextDueDate back to today.
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
        clearPendingState(targetUid);
      }
    },
    [
      isCramming,
      dataPageTitle,
      facts.latestByUid,
      viewState.currentIndex,
      setPendingState,
      upsertLatestSession,
      upsertLatestSessions,
      reinsertCard,
      setFocusedChildUid,
      setMaxVisitedChildIndex,
      clearPendingState,
    ]
  );

  // ── review config update ──
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
        clearPendingState(targetUid);
      }
    },
    [dataPageTitle, facts.latestByUid, setPendingState, upsertLatestSession, clearPendingState]
  );

  // ── exports ──
  return {
    facts,
    viewState,
    deckSnapshot,
    focusedPrimary,
    currentPrimaryEntryId,
    currentCardRefUid,
    currentIndex: viewState.currentIndex,
    cardQueueLength: primaryQueue.length,
    setFocusedPrimaryUid,
    focusPrimaryByOffset,
    setFocusedChildUid,
    resetChildViewState,
    setMaxVisitedChildIndex,
    setPendingState,
    clearPendingState,
    upsertLatestSession,
    upsertLatestSessions,
    ensureLatestSessions,
    reviewUnit,
    updateReviewConfigAction,
  };
};
