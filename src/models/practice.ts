/**
 * Practice Status & Queue Models
 *
 * Defines render modes and queue strategies for practice sessions.
 * - TagCardSet/TagCardSets: per-tag card classification (due/new/completed UIDs)
 * - sortNormalDueCardUids: primary queue ordering (urgency → difficulty → maturity)
 * - getLblQueueState / deriveLblSubQueue: LBL sub-queue (sequential reading order)
 */
import {
  RecordUid,
  Records,
  Session,
  findNextDueChildIndex,
  getDueChildIndices,
  isSessionDue,
} from './session';

export enum RenderMode {
  Normal = 'normal',
  AnswerFirst = 'answerFirst',
}

export type TagCardSet = {
  dueUids: RecordUid[];
  newUids: RecordUid[];
  completedUids: RecordUid[];
  renderMode: RenderMode;
  lblDeckMeta: Record<string, string[]>;
};

export type TagCardSets = Record<string, TagCardSet>;

// Primary queue strategy: NORMAL cards are selected by due status, then ordered by
// urgency, difficulty, and maturity. This is the only place that defines that order.
export const sortNormalDueCardUids = (
  sessionData: Records,
  {
    isCramming = false,
    shuffle = false,
    shuffleFn,
    now = new Date(),
  }: {
    isCramming?: boolean;
    shuffle?: boolean;
    shuffleFn?: <T>(items: T[]) => T[];
    now?: Date;
  } = {}
): RecordUid[] => {
  const dueUids = Object.keys(sessionData).filter((cardUid) => {
    const latestSession = sessionData[cardUid] as Session & { isNew?: boolean };
    if (!latestSession || latestSession.isNew) return false;
    return isCramming || isSessionDue(latestSession, now);
  });

  if (shuffle) {
    return shuffleFn ? shuffleFn(dueUids) : dueUids;
  }

  return dueUids.sort((a, b) => {
    const aLatestSession = sessionData[a] as Session;
    const bLatestSession = sessionData[b] as Session;

    const aDueDate = aLatestSession?.nextDueDate || new Date(0);
    const bDueDate = bLatestSession?.nextDueDate || new Date(0);
    if (aDueDate.getTime() !== bDueDate.getTime()) {
      return aDueDate.getTime() - bDueDate.getTime();
    }

    const aEfactor = aLatestSession?.sm2_eFactor ?? 2.5;
    const bEfactor = bLatestSession?.sm2_eFactor ?? 2.5;
    if (aEfactor !== bEfactor) {
      return aEfactor - bEfactor;
    }

    const aReps = aLatestSession?.sm2_repetitions ?? 0;
    const bReps = bLatestSession?.sm2_repetitions ?? 0;
    return aReps - bReps;
  });
};

// Secondary queue strategy: LBL always scans child blocks in reading order and jumps
// to the first due line at or after fromIndex. It never reorders child blocks.
export const getLblQueueState = (
  childUidsList: string[],
  childSessionData: Record<string, Session>,
  fromIndex = 0,
  now = new Date()
) => {
  const dueChildIndices = getDueChildIndices(childUidsList, childSessionData, now);
  const nextDueChildIndex = findNextDueChildIndex(childUidsList, childSessionData, fromIndex, now);

  return {
    dueChildIndices,
    dueChildCount: dueChildIndices.length,
    nextDueChildIndex,
    isComplete: nextDueChildIndex >= childUidsList.length,
  };
};

// Single derivation point for LBL sub-queue state.
// All consumers should use this instead of calling getLblQueueState directly.
export const deriveLblSubQueue = (
  childUids: string[],
  childSessionData: Record<string, Session | undefined>,
  fromIndex = 0,
  now = new Date()
) => getLblQueueState(childUids, childSessionData as Record<string, Session>, fromIndex, now);
