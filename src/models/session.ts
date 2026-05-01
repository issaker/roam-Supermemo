/**
 * Session & Card Data Models
 *
 * Unified Data Architecture:
 *   All card data is stored in session blocks — no separate meta block.
 *   The latest session block is the single source of truth.
 *
 *   Field naming convention: {owner}_{purpose}
 *   - sm2_*:      SM2 algorithm fields
 *   - progressive_*: Progressive algorithm fields
 *   - fixed_*:    FixedTime algorithm fields (user input, not algorithm state)
 *   - (no prefix): Universal/config fields
 *
 *   Session block fields:
 *   - algorithm:          Scheduling algorithm (PROGRESSIVE, SM2, FIXED_TIME)
 *   - interaction:        Interaction style (NORMAL, LBL)
 *   - nextDueDate:        Next due date for the card.
 *   - sm2_grade, sm2_interval, sm2_repetitions, sm2_eFactor: SM2-specific parameters.
 *   - progressive_repetitions, progressive_interval: Progressive-specific parameters.
 *   - fixed_multiplier:   FixedTime user-configured interval value.
 *   - fixed_unit:         FixedTime user-configured time unit (days/weeks/months/years).
 *   - baseSessionData:   Previous-day session snapshot for same-day re-scoring scenarios.
 *                        When a same-day Forgot session exists before the latest non-Forgot
 *                        session, baseSessionData points to the Forgot session instead,
 *                        ensuring the SM2 algorithm accounts for the Forgot in calculations.
 *
 *   Three algorithms:
 *   - SM2:        Memory card — adaptive intervals based on grading (green border)
 *   - Progressive: Reading card — exponential curve 2→6→12→24→48→96 days (orange border)
 *   - FixedTime:  Custom time card — user-defined interval via number + unit (blue border)
 *
 *   No backward compatibility policy:
 *   The plugin does not provide runtime backward compatibility. Old data must be migrated
 *   via the data migration panel in a single pass. resolveReviewConfig falls back to the
 *   default (PROGRESSIVE) for invalid algorithm values without legacy name mapping.
 *   This is an intentional design decision to avoid long-term technical debt.
 *
 *   LBL architecture:
 *   Child blocks in LBL mode have their own independent Session entries
 *   in the data page (same structure as any other card). The parent block
 *   only stores algorithm, interaction, and nextDueDate (computed from children).
 */

import * as dateUtils from '~/utils/date';

interface SessionCommon {
  nextDueDate?: Date;
  dateCreated?: Date;
}

export type Session = {
  algorithm: SchedulingAlgorithm;
  interaction: InteractionStyle;
  sm2_repetitions?: number;
  sm2_interval?: number;
  sm2_eFactor?: number;
  sm2_grade?: number;
  progressive_repetitions?: number;
  progressive_interval?: number;
  fixed_multiplier?: number;
  fixed_unit?: FixedTimeUnit;
  baseSessionData?: Session;
} & SessionCommon;

export interface CardMeta {
  algorithm: SchedulingAlgorithm;
  interaction: InteractionStyle;
  nextDueDate?: Date;
}

export interface NewSession
  extends Omit<
    Session,
    'nextDueDate' | 'sm2_grade' | 'sm2_interval' | 'progressive_interval' | 'baseSessionData'
  > {
  isNew: boolean;
}

export type RecordUid = string;

export interface Records {
  [key: RecordUid]: Session | NewSession;
}

export interface CompleteRecords {
  [key: RecordUid]: Session[];
}

export enum SchedulingAlgorithm {
  PROGRESSIVE = 'PROGRESSIVE',
  SM2 = 'SM2',
  FIXED_TIME = 'FIXED_TIME',
}

export enum FixedTimeUnit {
  DAYS = 'days',
  WEEKS = 'weeks',
  MONTHS = 'months',
  YEARS = 'years',
}

export enum InteractionStyle {
  NORMAL = 'NORMAL',
  LBL = 'LBL',
}

export type ReviewConfig = {
  algorithm: SchedulingAlgorithm;
  interaction: InteractionStyle;
};

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  algorithm: SchedulingAlgorithm.PROGRESSIVE,
  interaction: InteractionStyle.NORMAL,
};

export type AlgorithmGroup = 'SM2' | 'Progressive' | 'FixedTime';

export type AlgorithmMeta = {
  group: AlgorithmGroup;
  label: string;
};

export type InteractionMeta = {
  label: string;
  icon?: string;
};

export const ALGORITHM_META: Record<SchedulingAlgorithm, AlgorithmMeta> = {
  [SchedulingAlgorithm.PROGRESSIVE]: { group: 'Progressive', label: 'Progressive' },
  [SchedulingAlgorithm.SM2]: { group: 'SM2', label: 'SM2' },
  [SchedulingAlgorithm.FIXED_TIME]: { group: 'FixedTime', label: 'Fixed Time' },
};

export const INTERACTION_META: Record<InteractionStyle, InteractionMeta> = {
  [InteractionStyle.NORMAL]: { label: 'Normal', icon: 'layers' },
  [InteractionStyle.LBL]: { label: 'Line by Line', icon: 'list' },
};

export const isFixedTimeAlgorithm = (algorithm: SchedulingAlgorithm | undefined): boolean => {
  return algorithm === SchedulingAlgorithm.FIXED_TIME;
};

export const isLBLReviewMode = (interaction?: InteractionStyle): boolean =>
  interaction === InteractionStyle.LBL;

export const isGradingAlgorithm = (algorithm: SchedulingAlgorithm | undefined): boolean => {
  return algorithm === SchedulingAlgorithm.SM2;
};

type SessionLike = Pick<Session, 'algorithm' | 'nextDueDate'> | undefined;

export const getSessionAlgorithm = (
  session: SessionLike,
  fallback = DEFAULT_REVIEW_CONFIG.algorithm
): SchedulingAlgorithm => {
  return session?.algorithm || fallback;
};

export const isSessionDue = (
  session: Pick<Session, 'nextDueDate'> | undefined,
  now = new Date()
): boolean => {
  if (!session?.nextDueDate) return true;
  const dueDate = dateUtils.normalizeToDay(session.nextDueDate);
  const today = dateUtils.normalizeToDay(now);
  return dueDate <= today;
};

export const isSessionMastered = (
  session: Pick<Session, 'nextDueDate'> | undefined,
  now = new Date()
): boolean => {
  if (!session?.nextDueDate) return false;
  const dueDate = dateUtils.normalizeToDay(session.nextDueDate);
  const today = dateUtils.normalizeToDay(now);
  return dueDate > today;
};

export type ReviewStatus = 'new' | 'dueToday' | 'scheduled' | 'pastDue';

/**
 * Resolve the current review status from the displayed learning unit's session.
 *
 * First principle:
 * - due / not learned: nextDueDate <= now, or missing nextDueDate
 * - scheduled / learned: nextDueDate > now
 *
 * New cards remain a separate UI state because they have not entered scheduling yet.
 */
export const getReviewStatus = ({
  session,
  isNew,
  now = new Date(),
}: {
  session: Pick<Session, 'nextDueDate'> | undefined;
  isNew?: boolean;
  now?: Date;
}): ReviewStatus | null => {
  if (isNew) return 'new';

  const nextDueDate = session?.nextDueDate;
  if (!nextDueDate) return 'dueToday';
  if (nextDueDate > now) return 'scheduled';
  if (nextDueDate.toDateString() === now.toDateString()) return 'dueToday';
  return 'pastDue';
};

// Shared scheduling semantics used by both NORMAL and LBL queue strategies.
export const getDueChildIndices = (
  childUidsList: string[],
  childSessionData: Record<string, Session>,
  now = new Date()
): number[] => {
  return childUidsList.reduce((indices, uid, index) => {
    if (isSessionDue(childSessionData[uid], now)) {
      indices.push(index);
    }
    return indices;
  }, [] as number[]);
};

export const findNextDueChildIndex = (
  childUidsList: string[],
  childSessionData: Record<string, Session>,
  fromIndex: number,
  now = new Date()
): number => {
  for (let i = fromIndex; i < childUidsList.length; i++) {
    if (isSessionDue(childSessionData[childUidsList[i]], now)) {
      return i;
    }
  }
  return childUidsList.length;
};

export const deriveParentNextDueDateFromChildSessions = (
  childUidsList: string[],
  childSessionData: Record<string, Session>,
  now = new Date()
): Date => {
  let earliestFutureDueDate: Date | null = null;

  for (const uid of childUidsList) {
    const session = childSessionData[uid];
    if (isSessionDue(session, now)) {
      return now;
    }

    if (!earliestFutureDueDate || session!.nextDueDate! < earliestFutureDueDate) {
      earliestFutureDueDate = session!.nextDueDate!;
    }
  }

  return earliestFutureDueDate || now;
};

export const getAlgorithmIntent = (
  algorithm: SchedulingAlgorithm | undefined
): 'success' | 'warning' | 'primary' | 'none' => {
  switch (algorithm) {
    case SchedulingAlgorithm.SM2:
      return 'success';
    case SchedulingAlgorithm.PROGRESSIVE:
      return 'warning';
    case SchedulingAlgorithm.FIXED_TIME:
      return 'primary';
    default:
      return 'none';
  }
};

/**
 * Resolve the base session data for SM2/Progressive/FixedTime calculation.
 *
 * When a card is re-scored on the same day, the scheduling algorithm must use
 * the "pre-re-score" state as input, not the already-overwritten same-day state.
 * This prevents interval inflation (e.g., Good→Perfect on same day stacking intervals).
 *
 * Three rules (replacing 5 scattered same-day checks across the codebase):
 *   1. Non-same-day session → use as-is (normal review, no re-score)
 *   2. Same-day Forgot (grade=0) → use as-is (Forgot is the new baseline)
 *   3. Same-day non-Forgot → use baseSessionData (rewind to Forgot or previous day)
 *
 * baseSessionData is populated by parseLatestSession():
 *   - If a same-day Forgot session exists before the latest non-Forgot session,
 *     baseSessionData points to the Forgot session (preserving the reset effect).
 *   - Otherwise, baseSessionData points to the most recent non-same-day session.
 */
export const resolveBaseForCalculation = (
  currentSession: Session,
  now: Date = new Date()
): Session => {
  const isSameDay =
    !!currentSession.dateCreated &&
    now.getFullYear() === currentSession.dateCreated.getFullYear() &&
    now.getMonth() === currentSession.dateCreated.getMonth() &&
    now.getDate() === currentSession.dateCreated.getDate();
  const isForgot = currentSession.sm2_grade === 0;

  if (!isSameDay) return currentSession;
  if (isForgot) return currentSession;
  if (currentSession.baseSessionData) return currentSession.baseSessionData;
  return currentSession;
};

/**
 * Resolve algorithm and interaction config. Invalid values fall back to defaults (PROGRESSIVE + NORMAL).
 * No legacy name mapping — old data must be migrated via the data migration panel in a single pass.
 */
export const resolveReviewConfig = (
  rawAlgorithm?: string,
  rawInteraction?: string
): ReviewConfig => {
  const algorithm =
    Object.values(SchedulingAlgorithm).find((a) => a === rawAlgorithm) ||
    DEFAULT_REVIEW_CONFIG.algorithm;
  const interaction =
    Object.values(InteractionStyle).find((i) => i === rawInteraction) ||
    DEFAULT_REVIEW_CONFIG.interaction;
  return { algorithm, interaction };
};
