import {
  classifyCard,
  RecordUid,
  Session,
  DEFAULT_REVIEW_CONFIG,
  SchedulingAlgorithm,
  InteractionStyle,
} from '~/models/session';
import { isCardCompletedToday } from '~/review-runtime/reviewLogic';
import { ReviewState, SessionFacts, LatestSessionRecord } from './types';
import { computeQueueId, computeCardSet, computeTodayEnd } from './queue-logic';

export const selectEffectiveQueue = (state: ReviewState): RecordUid[] => {
  const queueId = computeQueueId(state.selectedTag);
  const queue = state.queues[queueId];
  if (!queue) return [];
  const removedSet = new Set(queue.removedUids);
  return queue.uids.filter((uid) => !removedSet.has(uid));
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

export const selectIsDone = (state: ReviewState): boolean => {
  return !selectCurrentCardRefUid(state);
};

export const selectCompletedCount = (state: ReviewState): number => {
  const tagData = state.tagCardSets[state.selectedTag];
  if (!tagData) return 0;
  const todayEnd = computeTodayEnd();
  const cardSet = computeCardSet(state.tagCardSets, state.selectedTag);
  let count = tagData.completedUids.length;
  for (const uid of [...tagData.dueUids, ...tagData.newUids]) {
    if (isCardCompletedToday(uid, state.facts.latestByUid, cardSet.lblMeta, todayEnd)) {
      count++;
    }
  }
  return count;
};

export const selectSidebarCounts = (state: ReviewState): { dueCount: number; newCount: number } => {
  const now = new Date();
  let dueCount = 0;
  let newCount = 0;
  for (const tagData of Object.values(state.tagCardSets)) {
    for (const uid of tagData.dueUids) {
      const session = state.facts.latestByUid[uid];
      const cls = session ? classifyCard({ session, now }) : 'due';
      if (cls === 'due') dueCount++;
    }
    for (const uid of tagData.newUids) {
      const session = state.facts.latestByUid[uid];
      const cls = session ? classifyCard({ session, now }) : 'new';
      if (cls === 'new') newCount++;
      else if (cls === 'due') dueCount++;
    }
  }
  return { dueCount, newCount };
};

export const selectTagCounts = (
  state: ReviewState,
  tag: string
): { dueCount: number; newCount: number } => {
  const tagData = state.tagCardSets[tag];
  if (!tagData) return { dueCount: 0, newCount: 0 };
  const now = new Date();
  let dueCount = 0;
  let newCount = 0;
  for (const uid of tagData.dueUids) {
    const session = state.facts.latestByUid[uid];
    const cls = session ? classifyCard({ session, now }) : 'due';
    if (cls === 'due') dueCount++;
  }
  for (const uid of tagData.newUids) {
    const session = state.facts.latestByUid[uid];
    const cls = session ? classifyCard({ session, now }) : 'new';
    if (cls === 'new') newCount++;
    else if (cls === 'due') dueCount++;
  }
  return { dueCount, newCount };
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
