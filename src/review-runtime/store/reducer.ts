import {
  isCardCompletedToday,
  mergeSourceIntoFacts,
  resolveNextLblNavigation,
} from '~/review-runtime/reviewLogic';
import { ReviewState, ReviewAction, GradeCardPayload, ChangeConfigPayload } from './types';
import {
  computeQueueId,
  computeCardSet,
  computeEffectiveQueue,
  reconcileUids,
  hasCardsInSet,
  applyReinsert,
  computeTodayEnd,
  truncateQueueToCardSet,
} from './queue-logic';
import { selectEffectiveQueue } from './selectors';
import { defaultSettings } from '~/hooks/useSettings';
import { filterBlacklistedDecks, allocateDailyCards } from '~/queries/dataProcessing';
import { parseDeckConfigNames } from '~/utils/deckConfig';

export const initialReviewState: ReviewState = {
  facts: { latestByUid: {}, pendingByUid: {} },
  viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
  queues: {},
  selectedTag: '',
  isCramming: false,
  rawTagCardSets: {},
  tagCardSets: {},
  dataPageTitle: '',
  practiceData: {},
  settings: defaultSettings,
  tagsList: parseDeckConfigNames(defaultSettings.deckConfigs),
};

const computeTagsList = (deckConfigs: string): string[] => parseDeckConfigNames(deckConfigs);

const computeFilteredTagCardSets = (state: ReviewState): ReviewState['tagCardSets'] => {
  const { rawTagCardSets, settings, isCramming, tagsList } = state;
  const { dailyLimit, deckConfigs } = settings;

  if (!Object.keys(rawTagCardSets).length) return rawTagCardSets;

  const blacklisted = filterBlacklistedDecks({ tagCardSets: rawTagCardSets, deckConfigs });

  if (!dailyLimit || isCramming) return blacklisted;

  return allocateDailyCards({
    tagCardSets: blacklisted,
    dailyLimit,
    tagsList,
    isCramming,
    deckConfigs,
  });
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
      const newQueues = reconcileQueueForTag(state.queues, action.tag, state.tagCardSets);
      const queueId = computeQueueId(action.tag);
      const queue = newQueues[queueId];
      const cardSet = computeCardSet(state.tagCardSets, action.tag);
      const effectiveQueue = queue
        ? computeEffectiveQueue(queue.uids, queue.removedUids, cardSet)
        : [];
      const nextIndex = findNextUnpracticedIndex(
        effectiveQueue,
        state.facts.latestByUid,
        cardSet.lblMeta,
        0
      );
      return {
        ...state,
        selectedTag: action.tag,
        queues: newQueues,
        viewState: { currentIndex: nextIndex, focusedChildUid: undefined, maxVisitedChildIndex: 0 },
      };
    }

    case 'SET_CRAMMING': {
      const newState = { ...state, isCramming: action.value };
      return { ...newState, tagCardSets: computeFilteredTagCardSets(newState) };
    }

    case 'SET_TAG_CARD_SETS': {
      const mergedLatest = mergeSourceIntoFacts(
        state.facts.latestByUid,
        action.practiceData,
        state.facts.pendingByUid
      );
      const withRaw = {
        ...state,
        rawTagCardSets: action.tagCardSets,
        practiceData: action.practiceData,
        facts: { ...state.facts, latestByUid: mergedLatest },
      };
      const withFiltered = { ...withRaw, tagCardSets: computeFilteredTagCardSets(withRaw) };
      const newQueues = withFiltered.selectedTag
        ? reconcileQueueForTag(
            withFiltered.queues,
            withFiltered.selectedTag,
            withFiltered.tagCardSets
          )
        : withFiltered.queues;
      return { ...withFiltered, queues: newQueues };
    }

    case 'UPDATE_SETTINGS': {
      const newSettings = { ...state.settings, ...action.settings };
      const newTagsList = computeTagsList(newSettings.deckConfigs);
      const selectedTagValid =
        state.selectedTag && newTagsList.includes(state.selectedTag)
          ? state.selectedTag
          : newTagsList[0] || '';
      const withSettings = {
        ...state,
        settings: newSettings,
        tagsList: newTagsList,
        selectedTag: selectedTagValid,
      };
      const withFiltered = {
        ...withSettings,
        tagCardSets: computeFilteredTagCardSets(withSettings),
      };

      if (!selectedTagValid) return withFiltered;

      // 设置变更后，始终对当前选中牌组做队列对账 + 遮罩层截断：
      // reconcileQueueForTag 追加新出现的 UID（配额增大时），
      // truncateQueueToCardSet 移除不在新 cardSet 中的 UID（配额缩小时）。
      let newQueues = reconcileQueueForTag(
        withFiltered.queues,
        selectedTagValid,
        withFiltered.tagCardSets
      );
      const queueId = computeQueueId(selectedTagValid);
      const queue = newQueues[queueId];
      if (queue) {
        const cardSet = computeCardSet(withFiltered.tagCardSets, selectedTagValid);
        const truncated = truncateQueueToCardSet(queue, cardSet);
        if (truncated !== queue) {
          newQueues = { ...newQueues, [queueId]: truncated };
        }
      }

      const cardSet = computeCardSet(withFiltered.tagCardSets, selectedTagValid);
      const finalQueue = newQueues[queueId];
      const effectiveQueue = finalQueue
        ? computeEffectiveQueue(finalQueue.uids, finalQueue.removedUids, cardSet)
        : [];
      const nextIndex = findNextUnpracticedIndex(
        effectiveQueue,
        withFiltered.facts.latestByUid,
        cardSet.lblMeta,
        0
      );

      return {
        ...withFiltered,
        queues: newQueues,
        viewState: {
          currentIndex: nextIndex,
          focusedChildUid: undefined,
          maxVisitedChildIndex: 0,
        },
      };
    }

    case 'SET_DATA_PAGE_TITLE': {
      return { ...state, dataPageTitle: action.dataPageTitle };
    }

    case 'QUEUE_INIT': {
      const newQueues = {
        ...state.queues,
        [action.queueId]: { uids: action.uids, removedUids: action.removedUids },
      };
      const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
      const effectiveQueue = computeEffectiveQueue(action.uids, action.removedUids, cardSet);
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

const reclassifyInTagCardSets = (
  tagCardSets: ReviewState['tagCardSets'],
  selectedTag: string,
  uid: string,
  latestByUid: ReviewState['facts']['latestByUid'],
  lblMeta: Record<string, string[]>
): ReviewState['tagCardSets'] => {
  const tagData = tagCardSets[selectedTag];
  if (!tagData) return tagCardSets;

  const todayEnd = computeTodayEnd();
  const isCompleted = isCardCompletedToday(uid, latestByUid, lblMeta, todayEnd);

  if (!isCompleted) return tagCardSets;

  const isInDue = tagData.dueUids.includes(uid);
  const isInNew = tagData.newUids.includes(uid);
  const isInCompleted = tagData.completedUids.includes(uid);

  if (!isInDue && !isInNew) return tagCardSets;
  if (isInCompleted) return tagCardSets;

  return {
    ...tagCardSets,
    [selectedTag]: {
      ...tagData,
      dueUids: tagData.dueUids.filter((u) => u !== uid),
      newUids: tagData.newUids.filter((u) => u !== uid),
      completedUids: [...tagData.completedUids, uid],
    },
  };
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
    const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
    const effectiveQueue = computeEffectiveQueue(queue.uids, queue.removedUids, cardSet);

    // grade=undefined → Next mode (PROGRESSIVE/FIXED), enters LBL Next path.
    // grade=0 → Forgot (SM2), enters Forgot reinsert path.
    // grade>0 → SM2 grading, advances normally.
    if (!isChild || (grade !== undefined && grade === 0)) {
      const reinsertUid = isChild ? parentUid! : targetUid;
      if (grade === 0 && forgotReinsertOffset > 0) {
        const afterUid = effectiveQueue[state.viewState.currentIndex] || reinsertUid;
        newQueues = {
          ...newQueues,
          [queueId]: applyReinsert(queue, reinsertUid, afterUid, forgotReinsertOffset),
        };
        const newEffectiveQueue = computeEffectiveQueue(
          newQueues[queueId].uids,
          newQueues[queueId].removedUids,
          cardSet
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
        const newEffectiveQueue = computeEffectiveQueue(
          newQueues[queueId].uids,
          newQueues[queueId].removedUids,
          cardSet
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

  const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
  let newTagCardSets = reclassifyInTagCardSets(
    state.tagCardSets,
    state.selectedTag,
    targetUid,
    newFacts.latestByUid,
    cardSet.lblMeta
  );
  let newRawTagCardSets = reclassifyInTagCardSets(
    state.rawTagCardSets,
    state.selectedTag,
    targetUid,
    newFacts.latestByUid,
    cardSet.lblMeta
  );

  if (isChild && parentUid) {
    const parentIsCompleted = isCardCompletedToday(
      parentUid,
      newFacts.latestByUid,
      cardSet.lblMeta,
      computeTodayEnd()
    );
    if (parentIsCompleted) {
      const parentTagData = newTagCardSets[state.selectedTag];
      if (parentTagData && !parentTagData.completedUids.includes(parentUid)) {
        newTagCardSets = {
          ...newTagCardSets,
          [state.selectedTag]: {
            ...parentTagData,
            dueUids: parentTagData.dueUids.filter((u) => u !== parentUid),
            newUids: parentTagData.newUids.filter((u) => u !== parentUid),
            completedUids: [...parentTagData.completedUids, parentUid],
          },
        };
      }
      const rawParentTagData = newRawTagCardSets[state.selectedTag];
      if (rawParentTagData && !rawParentTagData.completedUids.includes(parentUid)) {
        newRawTagCardSets = {
          ...newRawTagCardSets,
          [state.selectedTag]: {
            ...rawParentTagData,
            dueUids: rawParentTagData.dueUids.filter((u) => u !== parentUid),
            newUids: rawParentTagData.newUids.filter((u) => u !== parentUid),
            completedUids: [...rawParentTagData.completedUids, parentUid],
          },
        };
      }
    }
  }

  return {
    ...state,
    facts: newFacts,
    queues: newQueues,
    viewState: newViewState,
    rawTagCardSets: newRawTagCardSets,
    tagCardSets: newTagCardSets,
  };
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
