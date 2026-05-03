import {
  RenderMode,
  sortNormalDueCardUids,
  getLblQueueState,
} from '~/models/practice';
import { InteractionStyle, Records, SchedulingAlgorithm, Session } from '~/models/session';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  algorithm: SchedulingAlgorithm.SM2,
  interaction: InteractionStyle.NORMAL,
  sm2_repetitions: 0,
  sm2_interval: 0,
  sm2_eFactor: 2.5,
  ...overrides,
});

describe('practice models', () => {
  it('RenderMode exposes stable review render options', () => {
    expect(RenderMode.Normal).toBe('normal');
    expect(RenderMode.AnswerFirst).toBe('answerFirst');
  });
});

describe('sortNormalDueCardUids', () => {
  it('sorts due cards by urgency, difficulty, then maturity', () => {
    const now = new Date('2026-04-25T08:00:00.000Z');
    const sessionData: Records = {
      card_a: makeSession({ nextDueDate: new Date('2026-04-22T00:00:00.000Z'), sm2_eFactor: 2.8, sm2_repetitions: 10 }),
      card_b: makeSession({ nextDueDate: new Date('2026-04-24T00:00:00.000Z'), sm2_eFactor: 1.3, sm2_repetitions: 0 }),
      card_c: makeSession({ nextDueDate: new Date('2026-04-22T00:00:00.000Z'), sm2_eFactor: 1.3, sm2_repetitions: 5 }),
      card_d: makeSession({ nextDueDate: new Date('2026-04-22T00:00:00.000Z'), sm2_eFactor: 1.3, sm2_repetitions: 1 }),
      card_future: makeSession({ nextDueDate: new Date('2026-05-01T00:00:00.000Z') }),
    };

    expect(sortNormalDueCardUids(sessionData, { now })).toEqual([
      'card_d',
      'card_c',
      'card_a',
      'card_b',
    ]);
  });

  it('can return shuffled due cards when requested', () => {
    const now = new Date('2026-04-25T08:00:00.000Z');
    const sessionData: Records = {
      a: makeSession({ nextDueDate: new Date('2026-04-22T00:00:00.000Z') }),
      b: makeSession({ nextDueDate: new Date('2026-04-23T00:00:00.000Z') }),
    };

    const result = sortNormalDueCardUids(sessionData, {
      now,
      shuffle: true,
      shuffleFn: (items) => [...items].reverse(),
    });

    expect(result).toEqual(['b', 'a']);
  });
});

describe('getLblQueueState', () => {
  it('keeps LBL due selection sequential and reports completion from a starting line', () => {
    const now = new Date('2026-04-25T08:00:00.000Z');
    const childUids = ['line1', 'line2', 'line3', 'line4'];
    const childSessions = {
      line1: makeSession({ algorithm: SchedulingAlgorithm.PROGRESSIVE, nextDueDate: new Date('2026-05-01T00:00:00.000Z') }),
      line2: makeSession({ algorithm: SchedulingAlgorithm.SM2, nextDueDate: new Date('2026-05-02T00:00:00.000Z') }),
      line3: makeSession({ algorithm: SchedulingAlgorithm.FIXED_TIME, nextDueDate: new Date('2026-04-24T00:00:00.000Z') }),
      line4: makeSession({ algorithm: SchedulingAlgorithm.PROGRESSIVE }),
    };

    expect(getLblQueueState(childUids, childSessions as any, 0, now)).toMatchObject({
      dueChildIndices: [2, 3],
      dueChildCount: 2,
      nextDueChildIndex: 2,
      isComplete: false,
    });

    expect(getLblQueueState(childUids, childSessions as any, 3, now)).toMatchObject({
      dueChildIndices: [2, 3],
      dueChildCount: 2,
      nextDueChildIndex: 3,
      isComplete: false,
    });

    expect(getLblQueueState(childUids, childSessions as any, 4, now)).toMatchObject({
      dueChildIndices: [2, 3],
      dueChildCount: 2,
      nextDueChildIndex: 4,
      isComplete: true,
    });
  });
});
