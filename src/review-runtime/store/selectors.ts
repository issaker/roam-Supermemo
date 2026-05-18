import {
  RecordUid,
  Session,
  DEFAULT_REVIEW_CONFIG,
  SchedulingAlgorithm,
  InteractionStyle,
} from '~/models/session';
import { isCardCompletedToday } from '~/review-runtime/reviewLogic';
import { ReviewState, SessionFacts, LatestSessionRecord } from './types';
import {
  computeQueueId,
  computeCardSet,
  computeTodayEnd,
  computeEffectiveQueue,
} from './queue-logic';

export const selectEffectiveQueue = (state: ReviewState): RecordUid[] => {
  const queueId = computeQueueId(state.selectedTag);
  const queue = state.queues[queueId];
  if (!queue) return [];
  const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
  return computeEffectiveQueue(queue.uids, queue.removedUids, cardSet);
};

export const selectCurrentCardRefUid = (state: ReviewState): string | undefined => {
  const queue = selectEffectiveQueue(state);
  const index = state.viewState.currentIndex;
  return index >= 0 && index < queue.length ? queue[index] : undefined;
};

// Returns the raw session record — both Session and NewSession.
// New cards have isNew:true and no nextDueDate, but still carry algorithm/interaction
// set by the user via changeConfig. Downstream selectors extract these fields;
// code that cares about scheduling (isLearned, nextDueDate) checks 'nextDueDate' in record.
export const selectCurrentCardData = (state: ReviewState): LatestSessionRecord => {
  const uid = selectCurrentCardRefUid(state);
  if (!uid) return undefined;
  return state.facts.latestByUid[uid];
};

export const selectCardMeta = (
  state: ReviewState
):
  | { algorithm: SchedulingAlgorithm; interaction: InteractionStyle; nextDueDate?: Date }
  | undefined => {
  const record = selectCurrentCardData(state);
  if (!record) return undefined;
  return {
    algorithm: record.algorithm ?? DEFAULT_REVIEW_CONFIG.algorithm,
    interaction: record.interaction ?? DEFAULT_REVIEW_CONFIG.interaction,
    nextDueDate: 'nextDueDate' in record ? (record as Session).nextDueDate : undefined,
  };
};

export const selectAlgorithm = (state: ReviewState): SchedulingAlgorithm => {
  const meta = selectCardMeta(state);
  return meta?.algorithm ?? DEFAULT_REVIEW_CONFIG.algorithm;
};

export const selectInteraction = (state: ReviewState): InteractionStyle => {
  const meta = selectCardMeta(state);
  return meta?.interaction ?? DEFAULT_REVIEW_CONFIG.interaction;
};

export const selectCardQueueLength = (state: ReviewState): number => {
  return selectEffectiveQueue(state).length;
};

export const selectRemainingCount = (state: ReviewState): number => {
  const queue = selectEffectiveQueue(state);
  const todayEnd = computeTodayEnd();
  const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
  let remaining = 0;
  for (const uid of queue) {
    if (!isCardCompletedToday(uid, state.facts.latestByUid, cardSet.lblMeta, todayEnd)) {
      remaining++;
    }
  }
  return remaining;
};

export const selectCurrentRemainingPosition = (state: ReviewState): number => {
  const queue = selectEffectiveQueue(state);
  const todayEnd = computeTodayEnd();
  const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
  const currentIndex = state.viewState.currentIndex;
  let position = 0;
  for (let i = 0; i <= currentIndex && i < queue.length; i++) {
    if (!isCardCompletedToday(queue[i], state.facts.latestByUid, cardSet.lblMeta, todayEnd)) {
      position++;
    }
  }
  return position;
};

export const selectIsDone = (state: ReviewState): boolean => {
  return !selectCurrentCardRefUid(state);
};

export const selectCompletedCount = (state: ReviewState): number => {
  const tagData = state.tagCardSets[state.selectedTag];
  if (!tagData) return 0;
  return tagData.completedUids.length;
};

export const selectSidebarCounts = (state: ReviewState): { dueCount: number; newCount: number } => {
  let dueCount = 0;
  let newCount = 0;
  for (const tagData of Object.values(state.tagCardSets)) {
    dueCount += tagData.dueUids.length;
    newCount += tagData.newUids.length;
  }
  return { dueCount, newCount };
};

export const selectTagCounts = (
  state: ReviewState,
  tag: string
): { dueCount: number; newCount: number } => {
  const tagData = state.tagCardSets[tag];
  if (!tagData) return { dueCount: 0, newCount: 0 };
  return { dueCount: tagData.dueUids.length, newCount: tagData.newUids.length };
};

export const selectRenderMode = (state: ReviewState): import('~/models/practice').RenderMode => {
  const tagData = state.tagCardSets[state.selectedTag];
  return tagData?.renderMode ?? 'normal';
};

export const deriveChildSessionMap = (args: {
  childUidsList: string[];
  facts: SessionFacts['latestByUid'];
}): Record<string, Session> => {
  const result: Record<string, Session> = {};
  for (const uid of args.childUidsList) {
    const session = args.facts[uid];
    if (session && 'nextDueDate' in session) {
      result[uid] = session as Session;
    }
  }
  return result;
};
