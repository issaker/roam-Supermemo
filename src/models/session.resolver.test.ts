import {
  resolveBaseForCalculation,
  Session,
  SchedulingAlgorithm,
  InteractionStyle,
} from '~/models/session';

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  algorithm: SchedulingAlgorithm.SM2,
  interaction: InteractionStyle.NORMAL,
  ...overrides,
});

describe('resolveBaseForCalculation', () => {
  const today = new Date('2026-05-01T10:00:00.000Z');
  const yesterday = new Date('2026-04-30T10:00:00.000Z');

  it('returns currentSession when dateCreated is not today (not same-day review)', () => {
    const session = makeSession({
      dateCreated: yesterday,
      sm2_grade: 3,
      sm2_interval: 6,
      sm2_repetitions: 2,
      sm2_eFactor: 2.5,
    });

    const result = resolveBaseForCalculation(session, today);
    expect(result).toBe(session);
  });

  it('returns currentSession when dateCreated is undefined', () => {
    const session = makeSession({
      sm2_grade: 3,
    });

    const result = resolveBaseForCalculation(session, today);
    expect(result).toBe(session);
  });

  it('returns currentSession when same-day and sm2_grade is 0 (forgot)', () => {
    const baseSession = makeSession({
      dateCreated: yesterday,
      sm2_grade: 3,
      sm2_interval: 6,
    });
    const session = makeSession({
      dateCreated: today,
      sm2_grade: 0,
      baseSessionData: baseSession,
    });

    const result = resolveBaseForCalculation(session, today);
    expect(result).toBe(session);
  });

  it('returns baseSessionData when same-day, not forgot, and baseSessionData exists', () => {
    const baseSession = makeSession({
      dateCreated: yesterday,
      sm2_grade: 0,
      sm2_interval: 0,
      sm2_repetitions: 0,
      sm2_eFactor: 2.5,
    });
    const session = makeSession({
      dateCreated: today,
      sm2_grade: 3,
      sm2_interval: 1,
      sm2_repetitions: 1,
      sm2_eFactor: 2.6,
      baseSessionData: baseSession,
    });

    const result = resolveBaseForCalculation(session, today);
    expect(result).toBe(baseSession);
  });

  it('returns currentSession when same-day, not forgot, but no baseSessionData', () => {
    const session = makeSession({
      dateCreated: today,
      sm2_grade: 3,
      sm2_interval: 1,
    });

    const result = resolveBaseForCalculation(session, today);
    expect(result).toBe(session);
  });

  it('returns baseSessionData pointing to same-day forgot session when present', () => {
    const sameDayForgot = makeSession({
      dateCreated: today,
      sm2_grade: 0,
      sm2_interval: 0,
      sm2_repetitions: 0,
      sm2_eFactor: 2.3,
    });
    const session = makeSession({
      dateCreated: today,
      sm2_grade: 4,
      sm2_interval: 1,
      sm2_repetitions: 1,
      sm2_eFactor: 2.4,
      baseSessionData: sameDayForgot,
    });

    const result = resolveBaseForCalculation(session, today);
    expect(result).toBe(sameDayForgot);
  });
});
