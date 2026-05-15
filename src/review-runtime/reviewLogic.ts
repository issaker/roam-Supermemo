import { RecordUid, Session, SchedulingAlgorithm, classifyCard, Records } from '~/models/session';
import { generateNewSession } from '~/queries/utils';
import { generatePracticeData } from '~/practice';
import { getLblQueueState } from '~/models/practice';
import { omitUndefined } from '~/utils/object';
import {
  deriveParentNextDueDateFromChildSessions,
  resolveBaseForCalculation,
} from '~/models/session';
import { LatestSessionRecord } from './types';
import { CardSet } from './store/types';

export const mergeSourceIntoFacts = (
  latestByUid: Record<RecordUid, LatestSessionRecord>,
  source: Records,
  pendingByUid: Record<RecordUid, 'saving' | 'updatingConfig' | undefined>
): Record<RecordUid, LatestSessionRecord> => {
  const safeSource = { ...source };
  for (const key of Object.keys(pendingByUid)) {
    if (pendingByUid[key] != null) {
      delete safeSource[key];
    }
  }
  if (Object.keys(safeSource).length === 0) return latestByUid;
  return { ...latestByUid, ...safeSource };
};

export const omitIsNew = (data: Session | undefined): Session => {
  if (!data) return {} as Session;
  const result = { ...data } as Session & { isNew?: boolean };
  delete result.isNew;
  return result;
};

export const isCardCompletedToday = (
  uid: RecordUid,
  latestByUid: Record<RecordUid, LatestSessionRecord>,
  lblMeta: CardSet['lblMeta'],
  now: Date
): boolean => {
  const session = latestByUid[uid] as Session | undefined;
  const lblChildren = lblMeta[uid]
    ? {
        uids: lblMeta[uid],
        sessions: Object.fromEntries(
          lblMeta[uid].map((childUid) => [childUid, latestByUid[childUid] as Session | undefined])
        ),
      }
    : undefined;
  return classifyCard({ session, lblChildren, now }) === 'completed';
};

export type ChildReviewResult = {
  practiceResult: ReturnType<typeof generatePracticeData>;
  updatedChildSessionsForParent: Record<string, Session>;
  updatedParentSession: Session;
};

export const calculateChildReview = ({
  targetUid,
  grade,
  algorithm,
  interaction,
  childUidsList,
  childSessionData,
  parentUid: _parentUid,
  parentSession,
  now,
}: {
  targetUid: RecordUid;
  grade?: number;
  algorithm: SchedulingAlgorithm;
  interaction: import('~/models/session').InteractionStyle;
  childUidsList: string[];
  childSessionData: Record<string, Session>;
  parentUid: RecordUid;
  parentSession: Session | undefined;
  now: Date;
}): ChildReviewResult => {
  const existingChildSession = childSessionData[targetUid] || generateNewSession({ algorithm });
  const baseForCalc = resolveBaseForCalculation(existingChildSession, now);

  const practiceResult = generatePracticeData({
    ...baseForCalc,
    algorithm,
    ...omitUndefined({ sm2_grade: grade }),
    dateCreated: now,
  });

  const updatedChildSessionsForParent = {
    ...childSessionData,
    [targetUid]: { ...existingChildSession, ...practiceResult, dateCreated: now },
  };

  const updatedParentSession: Session = {
    ...(parentSession || {}),
    algorithm,
    interaction,
    dateCreated: now,
    nextDueDate: deriveParentNextDueDateFromChildSessions(
      childUidsList,
      updatedChildSessionsForParent,
      now
    ),
  };

  return { practiceResult, updatedChildSessionsForParent, updatedParentSession };
};

export type NormalReviewResult = {
  practiceResult: ReturnType<typeof generatePracticeData>;
};

export const calculateNormalReview = ({
  grade,
  algorithm,
  interaction,
  baseCardData,
  currentCardData,
  fixed_multiplier,
  fixed_unit,
  now,
}: {
  grade?: number;
  algorithm: SchedulingAlgorithm;
  interaction: import('~/models/session').InteractionStyle;
  baseCardData?: Session;
  currentCardData?: Session;
  fixed_multiplier?: number;
  fixed_unit?: import('~/models/session').FixedTimeUnit;
  now: Date;
}): NormalReviewResult => {
  const baseData = baseCardData || currentCardData;
  const practiceResult = generatePracticeData({
    ...baseData,
    ...omitUndefined({ sm2_grade: grade }),
    algorithm,
    interaction,
    ...omitUndefined({ fixed_multiplier, fixed_unit }),
    dateCreated: now,
  });

  return { practiceResult };
};

export const resolveNextLblNavigation = ({
  childUidsList,
  updatedChildSessionsForParent,
  lineByLineCurrentChildIndex,
}: {
  childUidsList: string[];
  updatedChildSessionsForParent: Record<string, Session>;
  lineByLineCurrentChildIndex: number;
}): { nextDueIndex: number; isDeckComplete: boolean } => {
  const nextDueIndex = getLblQueueState(
    childUidsList,
    updatedChildSessionsForParent,
    lineByLineCurrentChildIndex + 1
  ).nextDueChildIndex;

  return {
    nextDueIndex,
    isDeckComplete: nextDueIndex >= childUidsList.length,
  };
};
