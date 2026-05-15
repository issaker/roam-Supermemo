import {
  mergeSourceIntoFacts,
  omitIsNew,
  isCardCompletedToday,
  calculateChildReview,
  calculateNormalReview,
  resolveNextLblNavigation,
} from '~/review-runtime/reviewLogic';
import {
  SchedulingAlgorithm,
  InteractionStyle,
  Session,
  FixedTimeUnit,
} from '~/models/session';
import { LatestSessionRecord } from '~/review-runtime/store/types';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  algorithm: SchedulingAlgorithm.SM2,
  interaction: InteractionStyle.NORMAL,
  sm2_repetitions: 0,
  sm2_interval: 0,
  sm2_eFactor: 2.5,
  ...overrides,
});

describe('mergeSourceIntoFacts', () => {
  it('merges source into latestByUid', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({ nextDueDate: new Date('2026-05-01T00:00:00.000Z') }),
    };
    const source = {
      card_b: makeSession({ nextDueDate: new Date('2026-05-02T00:00:00.000Z') }),
    };
    const pendingByUid: Record<string, 'saving' | 'updatingConfig' | undefined> = {};

    const result = mergeSourceIntoFacts(latestByUid, source, pendingByUid);

    expect(result).toEqual({
      card_a: latestByUid.card_a,
      card_b: source.card_b,
    });
  });

  it('overwrites existing keys in latestByUid with source values', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({ sm2_eFactor: 2.5 }),
    };
    const source = {
      card_a: makeSession({ sm2_eFactor: 1.3 }),
    };
    const pendingByUid: Record<string, 'saving' | 'updatingConfig' | undefined> = {};

    const result = mergeSourceIntoFacts(latestByUid, source, pendingByUid);

    expect(result.card_a).toEqual(source.card_a);
  });

  it('skips keys that have pending state "saving"', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({ sm2_eFactor: 2.5 }),
    };
    const source = {
      card_a: makeSession({ sm2_eFactor: 1.3 }),
      card_b: makeSession({ sm2_eFactor: 2.0 }),
    };
    const pendingByUid: Record<string, 'saving' | 'updatingConfig' | undefined> = {
      card_a: 'saving',
    };

    const result = mergeSourceIntoFacts(latestByUid, source, pendingByUid);

    expect(result.card_a).toEqual(latestByUid.card_a);
    expect(result.card_b).toEqual(source.card_b);
  });

  it('skips keys that have pending state "updatingConfig"', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({ algorithm: SchedulingAlgorithm.PROGRESSIVE }),
    };
    const source = {
      card_a: makeSession({ algorithm: SchedulingAlgorithm.SM2 }),
    };
    const pendingByUid: Record<string, 'saving' | 'updatingConfig' | undefined> = {
      card_a: 'updatingConfig',
    };

    const result = mergeSourceIntoFacts(latestByUid, source, pendingByUid);

    expect(result.card_a).toEqual(latestByUid.card_a);
  });

  it('returns same reference when source is empty', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession(),
    };
    const source = {};
    const pendingByUid: Record<string, 'saving' | 'updatingConfig' | undefined> = {};

    const result = mergeSourceIntoFacts(latestByUid, source, pendingByUid);

    expect(result).toBe(latestByUid);
  });

  it('returns same reference when all source keys are pending', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession(),
    };
    const source = {
      card_a: makeSession({ sm2_eFactor: 1.3 }),
      card_b: makeSession({ sm2_eFactor: 2.0 }),
    };
    const pendingByUid: Record<string, 'saving' | 'updatingConfig' | undefined> = {
      card_a: 'saving',
      card_b: 'updatingConfig',
    };

    const result = mergeSourceIntoFacts(latestByUid, source, pendingByUid);

    expect(result).toBe(latestByUid);
  });

  it('does not skip keys where pendingByUid value is undefined', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({ sm2_eFactor: 2.5 }),
    };
    const source = {
      card_a: makeSession({ sm2_eFactor: 1.3 }),
    };
    const pendingByUid: Record<string, 'saving' | 'updatingConfig' | undefined> = {
      card_a: undefined,
    };

    const result = mergeSourceIntoFacts(latestByUid, source, pendingByUid);

    expect(result.card_a).toEqual(source.card_a);
  });
});

describe('omitIsNew', () => {
  it('strips isNew from a Session-like object', () => {
    const data = {
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      interaction: InteractionStyle.NORMAL,
      isNew: true,
    } as Session & { isNew?: boolean };

    const result = omitIsNew(data as Session);

    expect('isNew' in result).toBe(false);
    expect(result.algorithm).toBe(SchedulingAlgorithm.PROGRESSIVE);
    expect(result.interaction).toBe(InteractionStyle.NORMAL);
  });

  it('returns empty object when data is undefined', () => {
    const result = omitIsNew(undefined);

    expect(result).toEqual({});
  });

  it('returns same data when object does not have isNew', () => {
    const data = makeSession({ sm2_eFactor: 2.5, sm2_repetitions: 3 });

    const result = omitIsNew(data);

    expect(result).toEqual(data);
    expect('isNew' in result).toBe(false);
  });

  it('preserves all other fields when stripping isNew', () => {
    const data = {
      ...makeSession({
        sm2_eFactor: 2.3,
        sm2_interval: 6,
        sm2_repetitions: 2,
        nextDueDate: new Date('2026-05-01T00:00:00.000Z'),
      }),
      isNew: true,
    } as Session & { isNew?: boolean };

    const result = omitIsNew(data as Session);

    expect(result.sm2_eFactor).toBe(2.3);
    expect(result.sm2_interval).toBe(6);
    expect(result.sm2_repetitions).toBe(2);
    expect(result.nextDueDate).toEqual(new Date('2026-05-01T00:00:00.000Z'));
    expect('isNew' in result).toBe(false);
  });
});

describe('isCardCompletedToday', () => {
  const now = new Date('2026-04-25T08:00:00.000Z');

  it('returns true for a normal card that is mastered and created today', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({
        nextDueDate: new Date('2026-05-01T00:00:00.000Z'),
        dateCreated: now,
      }),
    };
    const lblMeta = {};

    expect(isCardCompletedToday('card_a', latestByUid, lblMeta, now)).toBe(true);
  });

  it('returns false for a normal card that is not mastered (due)', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({
        nextDueDate: now,
        dateCreated: now,
      }),
    };
    const lblMeta = {};

    expect(isCardCompletedToday('card_a', latestByUid, lblMeta, now)).toBe(false);
  });

  it('returns false for a normal card mastered previously (not today)', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: makeSession({
        nextDueDate: new Date('2026-05-01T00:00:00.000Z'),
        dateCreated: new Date('2026-04-20T00:00:00.000Z'),
      }),
    };
    const lblMeta = {};

    expect(isCardCompletedToday('card_a', latestByUid, lblMeta, now)).toBe(false);
  });

  it('returns false for a new card with no session', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      card_a: undefined,
    };
    const lblMeta = {};

    expect(isCardCompletedToday('card_a', latestByUid, lblMeta, now)).toBe(false);
  });

  it('returns true for an LBL deck where all children mastered and one graded today', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      parent: makeSession({ interaction: InteractionStyle.LBL }),
      child_a: makeSession({
        nextDueDate: new Date('2026-05-01T00:00:00.000Z'),
        dateCreated: now,
      }),
      child_b: makeSession({
        nextDueDate: new Date('2026-05-02T00:00:00.000Z'),
        dateCreated: now,
      }),
    };
    const lblMeta = { parent: ['child_a', 'child_b'] };

    expect(isCardCompletedToday('parent', latestByUid, lblMeta, now)).toBe(true);
  });

  it('returns false for an LBL deck where some children are still due', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      parent: makeSession({ interaction: InteractionStyle.LBL }),
      child_a: makeSession({
        nextDueDate: new Date('2026-05-01T00:00:00.000Z'),
        dateCreated: now,
      }),
      child_b: makeSession({
        nextDueDate: now,
      }),
    };
    const lblMeta = { parent: ['child_a', 'child_b'] };

    expect(isCardCompletedToday('parent', latestByUid, lblMeta, now)).toBe(false);
  });

  it('returns false for an LBL deck where all children are new (no sessions)', () => {
    const latestByUid: Record<string, LatestSessionRecord> = {
      parent: makeSession({ interaction: InteractionStyle.LBL }),
      child_a: undefined,
      child_b: undefined,
    };
    const lblMeta = { parent: ['child_a', 'child_b'] };

    expect(isCardCompletedToday('parent', latestByUid, lblMeta, now)).toBe(false);
  });
});

describe('calculateChildReview', () => {
  const now = new Date('2026-04-25T08:00:00.000Z');

  it('calculates practice result for a child with existing session', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a', 'child_b'],
      childSessionData: {
        child_a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          sm2_interval: 0,
          sm2_repetitions: 0,
          sm2_eFactor: 2.5,
        }),
        child_b: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          nextDueDate: new Date('2026-05-01T00:00:00.000Z'),
        }),
      },
      parentUid: 'parent',
      parentSession: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.LBL,
      }),
      now,
    });

    expect(result.practiceResult.algorithm).toBe(SchedulingAlgorithm.SM2);
    expect(result.practiceResult.sm2_grade).toBe(5);
    expect(result.practiceResult.sm2_repetitions).toBe(1);
    expect(result.practiceResult.sm2_interval).toBe(1);
    expect(result.practiceResult.dateCreated).toEqual(now);
    expect(result.practiceResult.nextDueDate).toBeTruthy();
  });

  it('generates new session for child without existing session', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: 4,
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a'],
      childSessionData: {},
      parentUid: 'parent',
      parentSession: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        interaction: InteractionStyle.LBL,
      }),
      now,
    });

    expect(result.practiceResult.algorithm).toBe(SchedulingAlgorithm.PROGRESSIVE);
    expect(result.practiceResult.progressive_repetitions).toBe(1);
    expect(result.practiceResult.progressive_interval).toBe(2);
    expect(result.practiceResult.dateCreated).toEqual(now);
  });

  it('omits sm2_grade when grade is undefined (Next mode)', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: undefined,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a'],
      childSessionData: {
        child_a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          sm2_interval: 6,
          sm2_repetitions: 2,
          sm2_eFactor: 2.5,
        }),
      },
      parentUid: 'parent',
      parentSession: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.LBL,
      }),
      now,
    });

    expect(result.practiceResult.sm2_grade).toBeUndefined();
  });

  it('includes sm2_grade when grade is provided (SM2 grading)', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: 4,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a'],
      childSessionData: {
        child_a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          sm2_interval: 0,
          sm2_repetitions: 0,
          sm2_eFactor: 2.5,
        }),
      },
      parentUid: 'parent',
      parentSession: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.LBL,
      }),
      now,
    });

    expect(result.practiceResult.sm2_grade).toBe(4);
  });

  it('updates child session data with practice result', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a', 'child_b'],
      childSessionData: {
        child_a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          sm2_interval: 0,
          sm2_repetitions: 0,
          sm2_eFactor: 2.5,
        }),
        child_b: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          nextDueDate: new Date('2026-05-01T00:00:00.000Z'),
        }),
      },
      parentUid: 'parent',
      parentSession: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.LBL,
      }),
      now,
    });

    expect(result.updatedChildSessionsForParent.child_a.dateCreated).toEqual(now);
    expect(result.updatedChildSessionsForParent.child_a.algorithm).toBe(SchedulingAlgorithm.SM2);
    expect(result.updatedChildSessionsForParent.child_b).toEqual(
      expect.objectContaining({ nextDueDate: new Date('2026-05-01T00:00:00.000Z') })
    );
  });

  it('derives parent nextDueDate from earliest child due date', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a', 'child_b'],
      childSessionData: {
        child_a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          sm2_interval: 0,
          sm2_repetitions: 0,
          sm2_eFactor: 2.5,
        }),
        child_b: makeSession({
          algorithm: SchedulingAlgorithm.PROGRESSIVE,
          nextDueDate: new Date('2026-05-03T00:00:00.000Z'),
        }),
      },
      parentUid: 'parent',
      parentSession: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.LBL,
      }),
      now,
    });

    expect(result.updatedParentSession.nextDueDate).toBeTruthy();
    expect(result.updatedParentSession.algorithm).toBe(SchedulingAlgorithm.SM2);
    expect(result.updatedParentSession.interaction).toBe(InteractionStyle.LBL);
    expect(result.updatedParentSession.dateCreated).toEqual(now);
  });

  it('sets parent nextDueDate to now when any child is still due', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a', 'child_b'],
      childSessionData: {
        child_a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          sm2_interval: 0,
          sm2_repetitions: 0,
          sm2_eFactor: 2.5,
        }),
        child_b: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
        }),
      },
      parentUid: 'parent',
      parentSession: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.LBL,
      }),
      now,
    });

    expect(result.updatedParentSession.nextDueDate).toEqual(now);
  });

  it('handles missing parentSession by using empty object spread', () => {
    const result = calculateChildReview({
      targetUid: 'child_a',
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      childUidsList: ['child_a'],
      childSessionData: {
        child_a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          sm2_interval: 0,
          sm2_repetitions: 0,
          sm2_eFactor: 2.5,
        }),
      },
      parentUid: 'parent',
      parentSession: undefined,
      now,
    });

    expect(result.updatedParentSession.algorithm).toBe(SchedulingAlgorithm.SM2);
    expect(result.updatedParentSession.interaction).toBe(InteractionStyle.LBL);
  });
});

describe('calculateNormalReview', () => {
  const now = new Date('2026-04-25T08:00:00.000Z');

  it('calculates SM2 practice result', () => {
    const result = calculateNormalReview({
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      baseCardData: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      }),
      currentCardData: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      }),
      now,
    });

    expect(result.practiceResult.algorithm).toBe(SchedulingAlgorithm.SM2);
    expect(result.practiceResult.sm2_grade).toBe(5);
    expect(result.practiceResult.sm2_repetitions).toBe(1);
    expect(result.practiceResult.sm2_interval).toBe(1);
    expect(result.practiceResult.sm2_eFactor).toBe(2.6);
    expect(result.practiceResult.dateCreated).toEqual(now);
    expect(result.practiceResult.nextDueDate).toBeTruthy();
  });

  it('calculates Progressive practice result', () => {
    const result = calculateNormalReview({
      grade: 3,
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      interaction: InteractionStyle.NORMAL,
      baseCardData: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        progressive_repetitions: 0,
      }),
      currentCardData: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        progressive_repetitions: 0,
      }),
      now,
    });

    expect(result.practiceResult.algorithm).toBe(SchedulingAlgorithm.PROGRESSIVE);
    expect(result.practiceResult.progressive_repetitions).toBe(1);
    expect(result.practiceResult.progressive_interval).toBe(2);
    expect(result.practiceResult.dateCreated).toEqual(now);
  });

  it('calculates FixedTime practice result', () => {
    const result = calculateNormalReview({
      grade: 3,
      algorithm: SchedulingAlgorithm.FIXED_TIME,
      interaction: InteractionStyle.NORMAL,
      fixed_multiplier: 7,
      fixed_unit: FixedTimeUnit.DAYS,
      now,
    });

    expect(result.practiceResult.algorithm).toBe(SchedulingAlgorithm.FIXED_TIME);
    expect(result.practiceResult.fixed_multiplier).toBe(7);
    expect(result.practiceResult.fixed_unit).toBe(FixedTimeUnit.DAYS);
    expect(result.practiceResult.nextDueDate).toEqual(new Date('2026-05-02T08:00:00.000Z'));
  });

  it('uses baseCardData as base when both baseCardData and currentCardData are provided', () => {
    const result = calculateNormalReview({
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      baseCardData: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        sm2_interval: 6,
        sm2_repetitions: 2,
        sm2_eFactor: 2.5,
      }),
      currentCardData: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      }),
      now,
    });

    expect(result.practiceResult.sm2_repetitions).toBe(3);
    expect(result.practiceResult.sm2_interval).toBe(15);
  });

  it('falls back to currentCardData when baseCardData is undefined', () => {
    const result = calculateNormalReview({
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      baseCardData: undefined,
      currentCardData: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      }),
      now,
    });

    expect(result.practiceResult.sm2_repetitions).toBe(1);
    expect(result.practiceResult.sm2_interval).toBe(1);
  });

  it('passes fixed_multiplier and fixed_unit to FixedTime calculation', () => {
    const result = calculateNormalReview({
      grade: 3,
      algorithm: SchedulingAlgorithm.FIXED_TIME,
      interaction: InteractionStyle.NORMAL,
      fixed_multiplier: 2,
      fixed_unit: FixedTimeUnit.WEEKS,
      now,
    });

    expect(result.practiceResult.fixed_multiplier).toBe(2);
    expect(result.practiceResult.fixed_unit).toBe(FixedTimeUnit.WEEKS);
    expect(result.practiceResult.nextDueDate).toEqual(new Date('2026-05-09T08:00:00.000Z'));
  });

  it('omits fixed_multiplier and fixed_unit when undefined for non-FixedTime algorithms', () => {
    const result = calculateNormalReview({
      grade: 5,
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      baseCardData: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      }),
      fixed_multiplier: undefined,
      fixed_unit: undefined,
      now,
    });

    expect(result.practiceResult.fixed_multiplier).toBeUndefined();
    expect(result.practiceResult.fixed_unit).toBeUndefined();
  });
});

describe('resolveNextLblNavigation', () => {
  it('finds next due child after current index', () => {
    const childUidsList = ['line1', 'line2', 'line3', 'line4'];
    const childSessions: Record<string, Session> = {
      line1: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        nextDueDate: new Date('2026-12-01T00:00:00.000Z'),
      }),
      line2: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        nextDueDate: new Date('2026-12-02T00:00:00.000Z'),
      }),
      line3: makeSession({
        algorithm: SchedulingAlgorithm.FIXED_TIME,
      }),
      line4: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
      }),
    };

    const result = resolveNextLblNavigation({
      childUidsList,
      updatedChildSessionsForParent: childSessions,
      lineByLineCurrentChildIndex: 1,
    });

    expect(result.nextDueIndex).toBe(2);
    expect(result.isDeckComplete).toBe(false);
  });

  it('returns deck complete when no due children after current', () => {
    const childUidsList = ['line1', 'line2'];
    const childSessions: Record<string, Session> = {
      line1: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        nextDueDate: new Date('2026-12-01T00:00:00.000Z'),
      }),
      line2: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        nextDueDate: new Date('2026-12-02T00:00:00.000Z'),
      }),
    };

    const result = resolveNextLblNavigation({
      childUidsList,
      updatedChildSessionsForParent: childSessions,
      lineByLineCurrentChildIndex: 1,
    });

    expect(result.nextDueIndex).toBe(childUidsList.length);
    expect(result.isDeckComplete).toBe(true);
  });

  it('finds due child at the very next index', () => {
    const childUidsList = ['line1', 'line2', 'line3'];
    const childSessions: Record<string, Session> = {
      line1: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        nextDueDate: new Date('2026-12-01T00:00:00.000Z'),
      }),
      line2: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
      }),
      line3: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        nextDueDate: new Date('2026-12-01T00:00:00.000Z'),
      }),
    };

    const result = resolveNextLblNavigation({
      childUidsList,
      updatedChildSessionsForParent: childSessions,
      lineByLineCurrentChildIndex: 0,
    });

    expect(result.nextDueIndex).toBe(1);
    expect(result.isDeckComplete).toBe(false);
  });

  it('skips mastered children to find next due one', () => {
    const childUidsList = ['line1', 'line2', 'line3', 'line4'];
    const childSessions: Record<string, Session> = {
      line1: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        nextDueDate: new Date('2026-12-01T00:00:00.000Z'),
      }),
      line2: makeSession({
        algorithm: SchedulingAlgorithm.SM2,
        nextDueDate: new Date('2026-12-02T00:00:00.000Z'),
      }),
      line3: makeSession({
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        nextDueDate: new Date('2026-12-03T00:00:00.000Z'),
      }),
      line4: makeSession({
        algorithm: SchedulingAlgorithm.FIXED_TIME,
      }),
    };

    const result = resolveNextLblNavigation({
      childUidsList,
      updatedChildSessionsForParent: childSessions,
      lineByLineCurrentChildIndex: 0,
    });

    expect(result.nextDueIndex).toBe(3);
    expect(result.isDeckComplete).toBe(false);
  });
});
