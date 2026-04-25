import {
  SchedulingAlgorithm,
  InteractionStyle,
  isFixedTimeAlgorithm,
  isGradingAlgorithm,
  isLBLReviewMode,
  getAlgorithmIntent,
  ALGORITHM_META,
  INTERACTION_META,
  isSessionDue,
  isSessionMastered,
  getDueChildIndices,
  findNextDueChildIndex,
  deriveParentNextDueDateFromChildSessions,
} from '~/models/session';

describe('mode classification functions', () => {
  it('isFixedTimeAlgorithm returns true only for FIXED_TIME', () => {
    expect(isFixedTimeAlgorithm(SchedulingAlgorithm.PROGRESSIVE)).toBe(false);
    expect(isFixedTimeAlgorithm(SchedulingAlgorithm.FIXED_TIME)).toBe(true);
    expect(isFixedTimeAlgorithm(SchedulingAlgorithm.SM2)).toBe(false);
  });

  it('isGradingAlgorithm returns true only for SM2', () => {
    expect(isGradingAlgorithm(SchedulingAlgorithm.SM2)).toBe(true);
    expect(isGradingAlgorithm(SchedulingAlgorithm.PROGRESSIVE)).toBe(false);
    expect(isGradingAlgorithm(SchedulingAlgorithm.FIXED_TIME)).toBe(false);
  });

  it('isLBLReviewMode returns true only for LBL interaction', () => {
    expect(isLBLReviewMode(InteractionStyle.LBL)).toBe(true);
    expect(isLBLReviewMode(InteractionStyle.NORMAL)).toBe(false);
  });

  it('all classification functions return false for undefined', () => {
    expect(isFixedTimeAlgorithm(undefined)).toBe(false);
    expect(isGradingAlgorithm(undefined)).toBe(false);
    expect(isLBLReviewMode(undefined)).toBe(false);
  });
});

describe('getAlgorithmIntent', () => {
  it('returns correct intent for each algorithm', () => {
    expect(getAlgorithmIntent(SchedulingAlgorithm.SM2)).toBe('success');
    expect(getAlgorithmIntent(SchedulingAlgorithm.PROGRESSIVE)).toBe('warning');
    expect(getAlgorithmIntent(SchedulingAlgorithm.FIXED_TIME)).toBe('primary');
  });

  it('returns none for undefined', () => {
    expect(getAlgorithmIntent(undefined)).toBe('none');
  });
});

describe('ALGORITHM_META', () => {
  it('has an entry for every SchedulingAlgorithm enum value', () => {
    const allAlgorithms = Object.values(SchedulingAlgorithm);
    for (const algo of allAlgorithms) {
      expect(algo in ALGORITHM_META).toBe(true);
    }
  });

  it('every entry has a valid group', () => {
    const validGroups: string[] = ['SM2', 'Progressive', 'FixedTime'];
    const entries = Object.values(ALGORITHM_META);
    for (const entry of entries) {
      expect(validGroups).toContain(entry.group);
    }
  });

  it('every entry has a non-empty label', () => {
    const entries = Object.values(ALGORITHM_META);
    for (const entry of entries) {
      expect(entry.label).toBeTruthy();
      expect(typeof entry.label).toBe('string');
    }
  });
});

describe('INTERACTION_META', () => {
  it('has an entry for every InteractionStyle enum value', () => {
    const allInteractions = Object.values(InteractionStyle);
    for (const inter of allInteractions) {
      expect(inter in INTERACTION_META).toBe(true);
    }
  });

  it('every entry has a non-empty label', () => {
    const entries = Object.values(INTERACTION_META);
    for (const entry of entries) {
      expect(entry.label).toBeTruthy();
      expect(typeof entry.label).toBe('string');
    }
  });
});

describe('session scheduling helpers', () => {
  it('treats missing or past nextDueDate as due, and future nextDueDate as mastered', () => {
    const now = new Date('2026-04-25T08:00:00.000Z');

    expect(isSessionDue(undefined, now)).toBe(true);
    expect(isSessionDue({ nextDueDate: new Date('2026-04-25T08:00:00.000Z') } as any, now)).toBe(true);
    expect(isSessionDue({ nextDueDate: new Date('2026-04-26T00:00:00.000Z') } as any, now)).toBe(false);

    expect(isSessionMastered(undefined, now)).toBe(false);
    expect(isSessionMastered({ nextDueDate: new Date('2026-04-26T00:00:00.000Z') } as any, now)).toBe(true);
  });

  it('finds due child indices in reading order', () => {
    const now = new Date('2026-04-25T08:00:00.000Z');
    const childUids = ['a', 'b', 'c'];
    const childSessions = {
      a: { algorithm: SchedulingAlgorithm.PROGRESSIVE, interaction: InteractionStyle.NORMAL, nextDueDate: new Date('2026-05-01T00:00:00.000Z') },
      b: { algorithm: SchedulingAlgorithm.SM2, interaction: InteractionStyle.NORMAL, nextDueDate: new Date('2026-04-24T00:00:00.000Z') },
      c: { algorithm: SchedulingAlgorithm.FIXED_TIME, interaction: InteractionStyle.NORMAL },
    };

    expect(getDueChildIndices(childUids, childSessions as any, now)).toEqual([1, 2]);
    expect(findNextDueChildIndex(childUids, childSessions as any, 0, now)).toBe(1);
    expect(findNextDueChildIndex(childUids, childSessions as any, 2, now)).toBe(2);
  });

  it('derives parent nextDueDate from the whole child queue instead of the current child only', () => {
    const now = new Date('2026-04-25T08:00:00.000Z');
    const childUids = ['a', 'b', 'c'];
    const childSessions = {
      a: { algorithm: SchedulingAlgorithm.PROGRESSIVE, interaction: InteractionStyle.NORMAL, nextDueDate: new Date('2026-05-01T00:00:00.000Z') },
      b: { algorithm: SchedulingAlgorithm.SM2, interaction: InteractionStyle.NORMAL, nextDueDate: new Date('2026-05-03T00:00:00.000Z') },
      c: { algorithm: SchedulingAlgorithm.FIXED_TIME, interaction: InteractionStyle.NORMAL, nextDueDate: new Date('2026-05-02T00:00:00.000Z') },
    };

    expect(deriveParentNextDueDateFromChildSessions(childUids, childSessions as any, now))
      .toEqual(new Date('2026-05-01T00:00:00.000Z'));
  });

  it('keeps parent due today when any child is still due or unread', () => {
    const now = new Date('2026-04-25T08:00:00.000Z');
    const childUids = ['a', 'b'];
    const childSessions = {
      a: { algorithm: SchedulingAlgorithm.PROGRESSIVE, interaction: InteractionStyle.NORMAL, nextDueDate: new Date('2026-05-01T00:00:00.000Z') },
      b: { algorithm: SchedulingAlgorithm.SM2, interaction: InteractionStyle.NORMAL },
    };

    expect(deriveParentNextDueDateFromChildSessions(childUids, childSessions as any, now)).toEqual(now);
  });
});
