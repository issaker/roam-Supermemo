import * as React from 'react';
import { Session, Records, RecordUid } from '~/models/session';
import { generateNewSession } from '~/queries/utils';
import {
  savePracticeData,
  updateParentNextDueDate,
  updateReviewConfig,
  undoCardSession,
} from '~/queries/save';
import { getChildSessionData } from '~/queries/data';
import {
  omitIsNew,
  calculateNormalReview,
  calculateChildReview,
} from '~/review-runtime/reviewLogic';
import { ReviewState, ReviewAction, GradeCardInput, ChangeConfigInput } from './types';
import { reviewReducer, initialReviewState } from './reducer';
import {
  computeQueueId,
  computeCardSet,
  reconcileUids,
  hasCardsInSet,
  loadPersistedQueue,
  savePersistedQueue,
  cleanStaleQueueKeys,
  findDeletedUids,
  syncQueueWithCardSet,
  truncateQueueToCardSet,
} from './queue-logic';

export type ReviewStoreActions = {
  gradeCard: (input: GradeCardInput) => Promise<void>;
  undoCard: (args: {
    targetUid: RecordUid;
    parentUid?: RecordUid;
    childUidsList?: string[];
  }) => Promise<void>;
  changeConfig: (input: ChangeConfigInput) => Promise<void>;
  ensureLatestSessions: (uids: string[]) => Promise<Records>;
  checkDeleted: () => Promise<void>;
};

type ReviewStoreContextValue = {
  state: ReviewState;
  dispatch: React.Dispatch<ReviewAction>;
  actions: ReviewStoreActions;
  updateSetting: <K extends keyof ReviewState['settings']>(
    key: K,
    value: ReviewState['settings'][K]
  ) => void;
};

const ReviewStoreContext = React.createContext<ReviewStoreContextValue | undefined>(undefined);

export const useReviewStore = (): ReviewStoreContextValue => {
  const ctx = React.useContext(ReviewStoreContext);
  if (!ctx) throw new Error('useReviewStore must be used within ReviewStoreProvider');
  return ctx;
};

type ReviewStoreProviderProps = {
  children: React.ReactNode;
  tagCardSets: ReviewState['tagCardSets'];
  dataPageTitle: string;
  practiceData: Records;
  settings: ReviewState['settings'];
  fetchPracticeData: () => void;
  updateSetting: <K extends keyof ReviewState['settings']>(
    key: K,
    value: ReviewState['settings'][K]
  ) => void;
};

export const ReviewStoreProvider = ({
  children,
  tagCardSets,
  dataPageTitle,
  practiceData,
  settings,
  fetchPracticeData: _fetchPracticeData,
  updateSetting,
}: ReviewStoreProviderProps) => {
  const [state, dispatch] = React.useReducer(reviewReducer, initialReviewState);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  React.useEffect(() => {
    dispatch({ type: 'SET_TAG_CARD_SETS', tagCardSets, practiceData });
  }, [tagCardSets, practiceData]);

  React.useEffect(() => {
    dispatch({ type: 'SET_DATA_PAGE_TITLE', dataPageTitle });
  }, [dataPageTitle]);

  React.useEffect(() => {
    dispatch({ type: 'UPDATE_SETTINGS', settings });
  }, [settings]);

  const queueId = computeQueueId(state.selectedTag);
  const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
  const hasCards = hasCardsInSet(cardSet);

  // Restore persisted queue on page refresh, reconciled with current cardSet.
  // cardSet intentionally omitted — changes are tracked via queueId + hasCards + cardSetFingerprint
  // dailyLimit dependency: settings load asynchronously (default dailyLimit=0),
  // re-initialize when dailyLimit arrives so the queue reflects filtered cardSet.
  React.useEffect(() => {
    if (!hasCards) return;
    const persisted = loadPersistedQueue(queueId);
    const reconciled = persisted
      ? reconcileUids(persisted.uids, persisted.removedUids, cardSet)
      : reconcileUids([], [], cardSet);
    const truncated = truncateQueueToCardSet(
      { uids: reconciled.uids, removedUids: reconciled.removedUids },
      cardSet
    );
    dispatch({ type: 'QUEUE_INIT', queueId, uids: truncated.uids, removedUids: truncated.removedUids });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, hasCards, state.settings.dailyLimit]);

  const cardSetFingerprint = React.useMemo(() => {
    if (!hasCards) return '';
    return `${cardSet.completed.length}:${cardSet.due.length}:${cardSet.new.length}`;
  }, [hasCards, cardSet.completed.length, cardSet.due.length, cardSet.new.length]);

  // Sync queue when cardSet fingerprint changes (uids added/removed from cardSet).
  // cardSet intentionally omitted — its changes are captured by cardSetFingerprint.
  React.useEffect(() => {
    if (!hasCards) return;
    const currentQueue = stateRef.current.queues[queueId];
    if (!currentQueue) return;
    const synced = syncQueueWithCardSet(currentQueue, cardSet);
    if (synced !== currentQueue) {
      dispatch({ type: 'QUEUE_INIT', queueId, uids: synced.uids, removedUids: synced.removedUids });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, hasCards, cardSetFingerprint]);

  const today = queueId.slice(0, 10);
  React.useEffect(() => {
    cleanStaleQueueKeys(today);
  }, [today]);

  React.useEffect(() => {
    const currentQueue = stateRef.current.queues[queueId];
    if (!currentQueue || !currentQueue.uids.length) return;
    findDeletedUids(currentQueue.uids).then((deleted) => {
      if (deleted.length) {
        dispatch({ type: 'QUEUE_ADD_REMOVED', queueId, uids: deleted });
      }
    });
  }, [queueId]);

  React.useEffect(() => {
    const currentQueue = stateRef.current.queues[queueId];
    if (!currentQueue || !currentQueue.uids.length) return;
    savePersistedQueue(queueId, currentQueue);
  }, [queueId, state.queues]);

  const actions: ReviewStoreActions = React.useMemo(() => {
    const gradeCard = async (input: GradeCardInput) => {
      const currentState = stateRef.current;
      const now = new Date();
      const isCrammingNow = currentState.isCramming;

      if (!isCrammingNow) {
        let practiceResult: ReturnType<typeof calculateNormalReview>['practiceResult'];
        let updatedChildSessionsForParent: Record<string, Session> | undefined;
        let updatedParentSession: Session | undefined;

        if (input.isChild) {
          const parentSession = input.parentUid
            ? (currentState.facts.latestByUid[input.parentUid] as Session | undefined)
            : undefined;
          const result = calculateChildReview({
            targetUid: input.targetUid,
            parentUid: input.parentUid!,
            grade: input.grade,
            algorithm: input.algorithm,
            interaction: input.interaction,
            childUidsList: input.childUidsList!,
            childSessionData: input.childSessionData!,
            parentSession,
            now,
          });
          practiceResult = result.practiceResult;
          updatedChildSessionsForParent = result.updatedChildSessionsForParent;
          updatedParentSession = result.updatedParentSession;
        } else {
          const baseData = input.baseCardData || input.currentCardData;
          const result = calculateNormalReview({
            grade: input.grade,
            algorithm: input.algorithm,
            interaction: input.interaction,
            baseCardData: baseData as Session,
            currentCardData: input.currentCardData as Session,
            fixed_multiplier: input.fixed_multiplier,
            fixed_unit: input.fixed_unit,
            now,
          });
          practiceResult = result.practiceResult;
        }

        const sessions: Partial<Records> = {};
        if (input.isChild) {
          const childSession =
            input.childSessionData?.[input.targetUid] ||
            generateNewSession({ algorithm: input.algorithm });
          sessions[input.targetUid] = {
            ...omitIsNew(childSession),
            ...practiceResult,
            dateCreated: now,
          };
          if (updatedParentSession) {
            sessions[input.parentUid!] = updatedParentSession;
          }
        } else {
          const baseData = input.baseCardData || input.currentCardData;
          sessions[input.targetUid] = {
            ...omitIsNew(baseData),
            ...practiceResult,
            dateCreated: now,
          };
        }

        dispatch({
          type: 'GRADE_CARD',
          payload: {
            sessions,
            targetUid: input.targetUid,
            grade: input.grade,
            isChild: input.isChild,
            parentUid: input.parentUid,
            forgotReinsertOffset: input.forgotReinsertOffset,
            lblNextReinsertOffset: input.lblNextReinsertOffset,
            currentChildIsLblNext: input.currentChildIsLblNext,
            lineByLineCurrentChildIndex: input.lineByLineCurrentChildIndex,
            childUidsList: input.childUidsList,
            updatedChildSessionsForParent,
          },
        });

        try {
          await savePracticeData({
            refUid: input.targetUid,
            dataPageTitle: currentState.dataPageTitle,
            dateCreated: now,
            ...practiceResult,
          });
          if (
            input.isChild &&
            input.parentUid &&
            input.childUidsList &&
            updatedChildSessionsForParent
          ) {
            await updateParentNextDueDate({
              refUid: input.parentUid,
              childUids: input.childUidsList,
              dataPageTitle: currentState.dataPageTitle,
              childSessions: updatedChildSessionsForParent,
            });
          }
        } catch (err) {
          console.error('Memo: Failed to save practice data', err);
        }

        dispatch({ type: 'SET_PENDING', uid: input.targetUid, pendingState: undefined });
      }
    };

    const undoCard = async (args: {
      targetUid: RecordUid;
      parentUid?: RecordUid;
      childUidsList?: string[];
    }) => {
      const currentState = stateRef.current;
      try {
        const freshData = await undoCardSession({
          targetUid: args.targetUid,
          dataPageTitle: currentState.dataPageTitle,
        });
        if (freshData) {
          dispatch({
            type: 'UPSERT_SESSIONS',
            sessions: { [args.targetUid]: freshData[args.targetUid] },
          });
          if (args.parentUid && args.childUidsList && freshData) {
            const childSessionData: Record<string, Session> = {};
            for (const uid of args.childUidsList) {
              if (freshData[uid]) childSessionData[uid] = freshData[uid] as Session;
            }
            await updateParentNextDueDate({
              refUid: args.parentUid,
              childUids: args.childUidsList,
              dataPageTitle: currentState.dataPageTitle,
              childSessions: childSessionData,
            });
          }
        }
      } catch (err) {
        console.error('Memo: Failed to undo card session', err);
      }
    };

    const changeConfig = async (input: ChangeConfigInput) => {
      const currentState = stateRef.current;
      const sessions: Partial<Records> = {};

      if (input.isChild && input.childSessionData) {
        const childSession = input.childSessionData[input.targetUid];
        if (childSession) {
          sessions[input.targetUid] = {
            ...childSession,
            ...(input.algorithm !== undefined ? { algorithm: input.algorithm } : {}),
          };
        }
      } else {
        const currentSession = currentState.facts.latestByUid[input.targetUid];
        if (currentSession) {
          // NewSession has isNew:true — strip via omitIsNew before merging
          // so the optimistic update doesn't re-classify the card as 'new'.
          const base = omitIsNew(currentSession as Session);
          sessions[input.targetUid] = {
            ...base,
            ...(input.algorithm !== undefined ? { algorithm: input.algorithm } : {}),
            ...(input.interaction !== undefined ? { interaction: input.interaction } : {}),
          };
        }
      }

      dispatch({ type: 'CHANGE_CONFIG', payload: { sessions, targetUid: input.targetUid } });

      try {
        await updateReviewConfig({
          refUid: input.targetUid,
          dataPageTitle: currentState.dataPageTitle,
          algorithm: input.algorithm,
          interaction: input.isChild ? undefined : input.interaction,
        });
      } catch (err) {
        console.error('Memo: Failed to update review config', err);
      }

      dispatch({ type: 'SET_PENDING', uid: input.targetUid, pendingState: undefined });
    };

    const ensureLatestSessions = async (uids: string[]): Promise<Records> => {
      if (!uids.length) return {};
      const currentState = stateRef.current;
      const data = await getChildSessionData({
        childUids: uids,
        dataPageTitle: currentState.dataPageTitle,
      });
      if (Object.keys(data).length) {
        dispatch({ type: 'UPSERT_SESSIONS', sessions: data });
      }
      return data;
    };

    const checkDeleted = async () => {
      const currentState = stateRef.current;
      const currentQueueId = computeQueueId(currentState.selectedTag);
      const queue = currentState.queues[currentQueueId];
      if (!queue || !queue.uids.length) return;
      const deleted = await findDeletedUids(queue.uids);
      if (deleted.length) {
        dispatch({ type: 'QUEUE_ADD_REMOVED', queueId: currentQueueId, uids: deleted });
      }
    };

    return { gradeCard, undoCard, changeConfig, ensureLatestSessions, checkDeleted };
  }, []);

  const contextValue = React.useMemo(
    () => ({ state, dispatch, actions, updateSetting }),
    [state, actions, updateSetting]
  );

  return <ReviewStoreContext.Provider value={contextValue}>{children}</ReviewStoreContext.Provider>;
};
