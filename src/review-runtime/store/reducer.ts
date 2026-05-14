import {
  isCardCompletedToday,
  mergeSourceIntoFacts,
  resolveNextLblNavigation,
} from '~/review-runtime/reviewLogic';
import { ReviewState, ReviewAction, GradeCardPayload, ChangeConfigPayload } from './types';
import { computeQueueId, computeCardSet, reconcileUids, hasCardsInSet, applyReinsert, computeTodayEnd } from './queue-logic';
import { selectEffectiveQueue } from './selectors';
import { defaultSettings } from '~/hooks/useSettings';

export const initialReviewState: ReviewState = {
  facts: { latestByUid: {}, pendingByUid: {} },
  viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
  queues: {},
  selectedTag: '',
  isCramming: false,
  tagCardSets: {},
  dataPageTitle: '',
  practiceData: {},
  settings: defaultSettings,
  tagsList: [],
};

const findNextUnpracticedIndex = (
  effectiveQueue: string[],
  latestByUid: ReviewState['facts']['latestByUid'],
  lblMeta: Record<string, string[]>,
  startIndex: number
): number => {
  const todayEnd = computeTodayEnd();
  for (let i = startIndex; i < effectiveQueue.length; i++) {
    const uid = effectiveQueue[i];
    if (!isCardCompletedToday(uid, latestByUid, lblMeta, todayEnd)) {
      return i;
    }
  }
  return effectiveQueue.length;
};

/**
 * Build/reconcile the queue for a specific tag and cardSet.
 * Keeps existing queue order, appends any cardSet UIDs that are missing.
 * Uses the provided tagCardSets (caller chooses incoming or state) and tag.
 */
const reconcileQueueForTag = (
  queues: ReviewState['queues'],
  tag: string,
  tagCardSets: ReviewState['tagCardSets']
): ReviewState['queues'] => {
  const queueId = computeQueueId(tag);
  const cardSet = computeCardSet(tagCardSets, tag);
  if (!hasCardsInSet(cardSet)) return queues;
  const existing = queues[queueId];
  const { uids, removedUids } = reconcileUids(
    existing?.uids || [],
    existing?.removedUids || [],
    cardSet
  );
  return { ...queues, [queueId]: { uids, removedUids } };
};

export const reviewReducer = (state: ReviewState, action: ReviewAction): ReviewState => {
  switch (action.type) {
    case 'UPSERT_SESSIONS': {
      return {
        ...state,
        facts: {
          ...state.facts,
          latestByUid: { ...state.facts.latestByUid, ...action.sessions },
        },
      };
    }

    case 'SET_PENDING': {
      return {
        ...state,
        facts: {
          ...state.facts,
          pendingByUid: {
            ...state.facts.pendingByUid,
            [action.uid]: action.pendingState,
          },
        },
      };
    }

    case 'FOCUS_BY_OFFSET': {
      const queue = selectEffectiveQueue(state);
      const nextIndex = Math.max(
        0,
        Math.min(state.viewState.currentIndex + action.offset, queue.length)
      );
      return {
        ...state,
        viewState: { ...state.viewState, currentIndex: nextIndex },
      };
    }

    case 'FOCUS_TO_UID': {
      const queue = selectEffectiveQueue(state);
      const idx = queue.indexOf(action.uid);
      if (idx < 0) return state;
      return {
        ...state,
        viewState: { ...state.viewState, currentIndex: idx },
      };
    }

    case 'RESET_TO_FIRST': {
      const queue = selectEffectiveQueue(state);
      const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
      const nextIndex = findNextUnpracticedIndex(
        queue,
        state.facts.latestByUid,
        cardSet.lblMeta,
        0
      );
      return {
        ...state,
        viewState: { currentIndex: nextIndex, focusedChildUid: undefined, maxVisitedChildIndex: 0 },
      };
    }

    case 'NAVIGATE_NEXT_UNPRACTICED': {
      const queue = selectEffectiveQueue(state);
      const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
      const nextIndex = findNextUnpracticedIndex(
        queue,
        state.facts.latestByUid,
        cardSet.lblMeta,
        state.viewState.currentIndex
      );
      return {
        ...state,
        viewState: { ...state.viewState, currentIndex: nextIndex },
      };
    }

    case 'SET_FOCUSED_CHILD': {
      return {
        ...state,
        viewState: { ...state.viewState, focusedChildUid: action.childUid },
      };
    }

    case 'RESET_CHILD_VIEW': {
      return {
        ...state,
        viewState: { ...state.viewState, focusedChildUid: undefined, maxVisitedChildIndex: 0 },
      };
    }

    case 'SET_MAX_VISITED_CHILD_INDEX': {
      return {
        ...state,
        viewState: { ...state.viewState, maxVisitedChildIndex: action.index },
      };
    }

    case 'CHANGE_TAG': {
      return {
        ...state,
        selectedTag: action.tag,
        queues: reconcileQueueForTag(state.queues, action.tag, state.tagCardSets),
        viewState: { currentIndex: 0, focusedChildUid: undefined, maxVisitedChildIndex: 0 },
      };
    }

    case 'SET_CRAMMING': {
      return { ...state, isCramming: action.value };
    }

    case 'SET_TAG_CARD_SETS': {
      const mergedLatest = mergeSourceIntoFacts(
        state.facts.latestByUid,
        action.practiceData,
        state.facts.pendingByUid
      );
      const newQueues = state.selectedTag
        ? reconcileQueueForTag(state.queues, state.selectedTag, action.tagCardSets)
        : state.queues;
      return {
        ...state,
        tagCardSets: action.tagCardSets,
        practiceData: action.practiceData,
        facts: { ...state.facts, latestByUid: mergedLatest },
        queues: newQueues,
      };
    }

    case 'UPDATE_SETTINGS': {
      return { ...state, settings: { ...state.settings, ...action.settings } };
    }

    case 'SET_TAGS_LIST': {
      return { ...state, tagsList: action.tagsList };
    }

    case 'SET_DATA_PAGE_TITLE': {
      return { ...state, dataPageTitle: action.dataPageTitle };
    }

    case 'QUEUE_INIT': {
      const newQueues = {
        ...state.queues,
        [action.queueId]: { uids: action.uids, removedUids: action.removedUids },
      };
      const effectiveQueue = action.uids.filter(
        (uid) => !new Set(action.removedUids).has(uid)
      );
      const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
      const nextIndex = findNextUnpracticedIndex(
        effectiveQueue,
        state.facts.latestByUid,
        cardSet.lblMeta,
        0
      );
      return {
        ...state,
        queues: newQueues,
        viewState: { currentIndex: nextIndex, focusedChildUid: undefined, maxVisitedChildIndex: 0 },
      };
    }

    case 'QUEUE_REINSERT': {
      const queue = state.queues[action.queueId];
      if (!queue) return state;
      return {
        ...state,
        queues: {
          ...state.queues,
          [action.queueId]: applyReinsert(queue, action.uid, action.afterUid, action.offset),
        },
      };
    }

    case 'QUEUE_ADD_REMOVED': {
      const queue = state.queues[action.queueId];
      if (!queue) return state;
      const newRemoved = Array.from(new Set([...queue.removedUids, ...action.uids]));
      if (newRemoved.length === queue.removedUids.length) return state;
      return {
        ...state,
        queues: {
          ...state.queues,
          [action.queueId]: { ...queue, removedUids: newRemoved },
        },
      };
    }

    case 'GRADE_CARD': {
      return handleGradeCard(state, action.payload);
    }

    case 'CHANGE_CONFIG': {
      return handleChangeConfig(state, action.payload);
    }

    default:
      return state;
  }
};

const handleGradeCard = (state: ReviewState, payload: GradeCardPayload): ReviewState => {
  const {
    sessions,
    targetUid,
    grade,
    isChild,
    parentUid,
    forgotReinsertOffset,
    lblNextReinsertOffset,
    currentChildIsLblNext,
    lineByLineCurrentChildIndex,
    childUidsList,
    updatedChildSessionsForParent,
  } = payload;

  const newFacts = {
    ...state.facts,
    latestByUid: { ...state.facts.latestByUid, ...sessions },
    pendingByUid: { ...state.facts.pendingByUid, [targetUid]: 'saving' as const },
  };

  const queueId = computeQueueId(state.selectedTag);
  let newQueues = state.queues;
  let newViewState = state.viewState;

  const queue = state.queues[queueId];
  if (queue) {
    const removedSet = new Set(queue.removedUids);
    const effectiveQueue = queue.uids.filter((uid) => !removedSet.has(uid));
    const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);

    if (!isChild || grade === 0) {
      const reinsertUid = isChild ? parentUid! : targetUid;
      if (grade === 0 && forgotReinsertOffset > 0) {
        const afterUid = effectiveQueue[state.viewState.currentIndex] || reinsertUid;
        newQueues = {
          ...newQueues,
          [queueId]: applyReinsert(queue, reinsertUid, afterUid, forgotReinsertOffset),
        };
        const newRemovedSet = new Set(newQueues[queueId].removedUids);
        const newEffectiveQueue = newQueues[queueId].uids.filter(
          (uid) => !newRemovedSet.has(uid)
        );
        const nextIndex = findNextUnpracticedIndex(
          newEffectiveQueue,
          newFacts.latestByUid,
          cardSet.lblMeta,
          state.viewState.currentIndex
        );
        newViewState = {
          currentIndex: nextIndex,
          focusedChildUid: undefined,
          maxVisitedChildIndex: 0,
        };
      } else {
        const nextIndex = findNextUnpracticedIndex(
          effectiveQueue,
          newFacts.latestByUid,
          cardSet.lblMeta,
          state.viewState.currentIndex
        );
        newViewState = {
          currentIndex: nextIndex,
          focusedChildUid: undefined,
          maxVisitedChildIndex: 0,
        };
      }
    } else {
      const { nextDueIndex, isDeckComplete } = resolveNextLblNavigation({
        childUidsList: childUidsList!,
        updatedChildSessionsForParent: updatedChildSessionsForParent!,
        lineByLineCurrentChildIndex: lineByLineCurrentChildIndex!,
      });

      if (
        currentChildIsLblNext &&
        lblNextReinsertOffset > 0 &&
        lineByLineCurrentChildIndex! < childUidsList!.length - 1
      ) {
        const afterUid = effectiveQueue[state.viewState.currentIndex] || parentUid!;
        newQueues = {
          ...newQueues,
          [queueId]: applyReinsert(queue, parentUid!, afterUid, lblNextReinsertOffset),
        };
        const newRemovedSet = new Set(newQueues[queueId].removedUids);
        const newEffectiveQueue = newQueues[queueId].uids.filter(
          (uid) => !newRemovedSet.has(uid)
        );
        const nextIndex = findNextUnpracticedIndex(
          newEffectiveQueue,
          newFacts.latestByUid,
          cardSet.lblMeta,
          state.viewState.currentIndex
        );
        newViewState = {
          currentIndex: nextIndex,
          focusedChildUid: undefined,
          maxVisitedChildIndex: 0,
        };
      } else if (isDeckComplete) {
        const nextIndex = findNextUnpracticedIndex(
          effectiveQueue,
          newFacts.latestByUid,
          cardSet.lblMeta,
          state.viewState.currentIndex
        );
        newViewState = {
          currentIndex: nextIndex,
          focusedChildUid: undefined,
          maxVisitedChildIndex: 0,
        };
      }

      if (nextDueIndex < childUidsList!.length) {
        newViewState = {
          ...newViewState,
          focusedChildUid: childUidsList![nextDueIndex],
          maxVisitedChildIndex: nextDueIndex,
        };
      }
    }
  }

  return { ...state, facts: newFacts, queues: newQueues, viewState: newViewState };
};

const handleChangeConfig = (state: ReviewState, payload: ChangeConfigPayload): ReviewState => {
  const { sessions, targetUid } = payload;
  return {
    ...state,
    facts: {
      ...state.facts,
      latestByUid: { ...state.facts.latestByUid, ...sessions },
      pendingByUid: { ...state.facts.pendingByUid, [targetUid]: 'updatingConfig' as const },
    },
  };
};
