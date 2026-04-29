import * as React from 'react';
import { Today } from '~/models/practice';
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
 *   Cards are NEVER removed from the primaryQueue after grading.
 *
 *   The queue is built ONCE at session start from today's dueUids + newUids.
 *   Forgot and LBL-Next reinserts add DUPLICATE entries at later positions,
 *   but they never REMOVE the original entry.  Navigation is purely
 *   index-based: after each review, currentIndex++.
 *
 *   DO NOT derive the queue from deriveDeckSnapshot or latestByUid on
 *   every mutation.  That was the cause of the "queue jumps to 0/51" bug:
 *   when a card was mastered, deriveDeckSnapshot excluded it from
 *   availablePrimaryQueue, focusNextAfterMutation couldn't find its entry,
 *   and fell back to queue[0].
 *
 *   If you're tempted to "re-derive the queue to keep it in sync":
 *   DON'T.  The queue is intentionally static.  Cards that have been
 *   reviewed stay in the queue so the user can navigate back to them.
 *   The only modifications are insertions (Forgot / LBL-Next), not removals.
 *
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Architecture:
 *   1. SessionFacts (facts.latestByUid) — one session per uid
 *   2. ViewState — currentIndex into the static primary queue + navigation state
 *   3. primaryQueue — STATIC array generated once at session start
 */
import {
  deriveChildSessionMap,
  deriveDeckSnapshot,
} from './selectors';
import { RevisitDirective, ReviewViewState, SessionFacts } from './types';

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
    previousPrimaryUid: undefined,
    focusedChildUid: undefined,
    revisitDirectives: [],
    maxVisitedChildIndex: 0,
  });
  const directiveIdRef = React.useRef(0);

  // ── incoming data sync ──
  React.useEffect(() => {
    setFacts((prev) => mergeSourceIntoFacts({ currentFacts: prev, incoming: practiceData }));
  }, [practiceData]);

  // ── static primary queue ──
  // Generated once from today's dueUids + newUids.  NEVER removes cards.
  // Only revisit directives add duplicate entries for Forgot / LBL-Next.
  const initialUids = React.useMemo(() => {
    const tagData = today.tags[selectedTag];
    if (!tagData) return [];
    return [...(tagData.dueUids || []), ...(tagData.newUids || [])];
  }, [today, selectedTag]);

  const primaryQueue = React.useMemo(() => {
    // Start with the initial queue, then apply revisit directives in order.
    // Each directive inserts a duplicate entry at its recorded insertAtIndex.
    return viewState.revisitDirectives.reduce(
      (acc, directive) => {
        const insertAt = Math.min(directive.insertAtIndex, acc.length);
        const next = [...acc];
        next.splice(insertAt, 0, directive.primaryUid);
        return next;
      },
      [...initialUids]
    );
  }, [initialUids, viewState.revisitDirectives]);

  // Reset index + directives when the base queue COMPOSITION changes
  // (different set of cards, e.g. tag switch or new session).
  // Key is based on SORTED UIDs so that ORDER changes (from
  // sortNormalDueCardUids after undo or review) don't trigger a reset —
  // order changes are handled by the primaryQueue useMemo automatically.
  const initialUidsKey = React.useMemo(
    () => Array.from(new Set(initialUids)).sort().join(','),
    [initialUids]
  );
  React.useEffect(() => {
    setViewState({
      currentIndex: 0,
      previousPrimaryUid: undefined,
      focusedChildUid: undefined,
      revisitDirectives: [],
      maxVisitedChildIndex: 0,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUidsKey]);

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

  // ── navigation ──
  const focusPrimaryByOffset = React.useCallback(
    (offset: number) => {
      if (offset < 0) {
        // First left click after a review: go back to the just-reviewed card.
        if (
          viewState.previousPrimaryUid &&
          currentCardRefUid !== viewState.previousPrimaryUid
        ) {
          const prevIndex = primaryQueue.indexOf(viewState.previousPrimaryUid);
          if (prevIndex >= 0) {
            setViewState((prev) => ({
              ...prev,
              currentIndex: prevIndex,
              previousPrimaryUid: undefined,
            }));
            return;
          }
        }
      }

      const newIndex = viewState.currentIndex + offset;
      if (newIndex >= 0 && newIndex < primaryQueue.length) {
        setViewState((prev) => ({
          ...prev,
          currentIndex: newIndex,
        }));
      }
    },
    [viewState.currentIndex, viewState.previousPrimaryUid, currentCardRefUid, primaryQueue]
  );

  const setFocusedPrimaryUid = React.useCallback(
    (uid?: string) => {
      if (uid === undefined) {
        setViewState((prev) => ({ ...prev, currentIndex: 0 }));
        return;
      }
      const index = primaryQueue.indexOf(uid);
      if (index >= 0) {
        setViewState((prev) => ({ ...prev, currentIndex: index }));
      }
    },
    [primaryQueue]
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

  // ── revisit directive helpers ──
  const createRevisitDirective = React.useCallback(
    (uid: RecordUid, offset: number, reason: 'forgot' | 'lbl-next'): RevisitDirective => {
      const currentIndex = viewState.currentIndex;
      const directive: RevisitDirective = {
        id: `${reason}:${directiveIdRef.current++}`,
        primaryUid: uid,
        insertAtIndex: currentIndex + 1 + offset,
        reason,
      };
      return directive;
    },
    [viewState.currentIndex]
  );

  const addRevisitDirective = React.useCallback(
    (uid: RecordUid, offset: number, reason: 'forgot' | 'lbl-next') => {
      const directive = createRevisitDirective(uid, offset, reason);
      setViewState((prev) => ({
        ...prev,
        revisitDirectives: [...prev.revisitDirectives, directive],
      }));
      return directive;
    },
    [createRevisitDirective]
  );

  const removeRevisitDirectives = React.useCallback(
    (predicate: (directive: RevisitDirective) => boolean) => {
      setViewState((prev) => ({
        ...prev,
        revisitDirectives: prev.revisitDirectives.filter((d) => !predicate(d)),
      }));
    },
    []
  );

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
  //   2. Handle revisit directives (Forgot / LBL-Next reinserts)
  //   3. Advance currentIndex by 1
  //
  // Cards stay in the queue.  The queue is NOT rebuilt after mutation.
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

      // ── 3. Handle reinsert directives (Forgot / LBL-Next) ──
      const isForgot = grade === 0;

      // Advance the primary queue index.  Extracted to a single helper so
      // all three branches (normal, LBL-Forgot, LBL-Next/complete) stay in
      // sync — duplicating setViewState inline caused bugs in the past when
      // one branch was updated but others were not.
      const advancePrimaryQueue = () => {
        setViewState((prev) => ({
          ...prev,
          previousPrimaryUid: currentCardRefUid,
          currentIndex: prev.currentIndex + 1,
        }));
      };

      // setShowAnswers(false) must precede advancePrimaryQueue() so the
      // current card's override is reset before any synchronous re-render
      // (e.g. from keyboard shortcuts outside React's batch context) updates
      // activeSetShowAnswersRef to point to the next card.  Otherwise the
      // reinserted card reappears with a stale showAnswers=true override.
      if (!isChild) {
        // Normal card: Forgot with offset → reinsert this card later
        if (isForgot && forgotReinsertOffset > 0) {
          addRevisitDirective(targetUid, forgotReinsertOffset, 'forgot');
        }
        setShowAnswers(false);
        advancePrimaryQueue();
      } else if (isForgot) {
        // LBL child Forgot: reinsert PARENT card later, advance queue
        if (forgotReinsertOffset > 0) {
          addRevisitDirective(parentUid!, forgotReinsertOffset, 'forgot');
        }
        setShowAnswers(false);
        advancePrimaryQueue();
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
          // LBL-Next: reinsert parent card later, advance queue
          addRevisitDirective(parentUid!, lblNextReinsertOffset!, 'lbl-next');
          advancePrimaryQueue();
        } else if (isCardComplete) {
          advancePrimaryQueue();
        } else {
          // Stay on this parent card, advance within children
          // No primary queue navigation
        }

        setFocusedChildUid(childList[nextDueIndex]);
        setMaxVisitedChildIndex(nextDueIndex);
      }

      // ── 4. Persist to Roam ──
      // savePracticeData and updateParentNextDueDate are independent —
      // run them in parallel to reduce latency on each review.
      try {
        const persists: Promise<void>[] = [
          savePracticeData({
            refUid: targetUid,
            dataPageTitle,
            dateCreated: now,
            ...practiceResult,
          }),
        ];
        if (isChild) {
          persists.push(
            updateParentNextDueDate({
              refUid: parentUid!,
              childUids: childUidsList!,
              dataPageTitle,
            })
          );
        }
        await Promise.all(persists);
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
      currentCardRefUid,
      setPendingState,
      upsertLatestSession,
      upsertLatestSessions,
      addRevisitDirective,
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
        // ARCHITECTURE NOTE — applyOptimisticCardMeta and cardMeta are
        // technically redundant: upsertLatestSession already updates
        // facts.latestByUid, which is the single source of truth for
        // cardMeta (via useCurrentCardData's derivedCardMeta).  Keeping
        // them because removing would require verifying all call sites,
        // but future cleanup should derive cardMeta purely from facts.
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
    isFirst: viewState.currentIndex <= 0,
    setFocusedPrimaryUid,
    focusPrimaryByOffset,
    setFocusedChildUid,
    resetChildViewState,
    setMaxVisitedChildIndex,
    addRevisitDirective,
    createRevisitDirective: (args: {
      primaryUid: RecordUid;
      anchorEntryId: string;
      offset: number;
      reason: 'forgot' | 'lbl-next';
    }) => createRevisitDirective(args.primaryUid, args.offset, args.reason),
    setRevisitDirectives: (
      directivesOrUpdater: RevisitDirective[] | ((prev: RevisitDirective[]) => RevisitDirective[])
    ) => {
      if (typeof directivesOrUpdater === 'function') {
        setViewState((prev) => ({
          ...prev,
          revisitDirectives: directivesOrUpdater(prev.revisitDirectives),
        }));
      } else {
        setViewState((prev) => ({
          ...prev,
          revisitDirectives: directivesOrUpdater,
        }));
      }
    },
    removeRevisitDirectives,
    setPendingState,
    clearPendingState,
    upsertLatestSession,
    upsertLatestSessions,
    ensureLatestSessions,
    deriveChildSessionMap,
    reviewUnit,
    updateReviewConfigAction,
  };
};
