import * as practice from '~/practice';
import { SchedulingAlgorithm, FixedTimeUnit, InteractionStyle } from '~/models/session';

describe('supermemo: simulate practice', () => {
  let initInput;
  let result;

  describe('Easy Path', () => {
    beforeAll(() => {
      initInput = {
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      };
      result = undefined;
    });
    test('First practice', () => {
      result = practice.supermemo(initInput, 5);
      expect(result).toEqual({ sm2_eFactor: 2.6, sm2_interval: 1, sm2_repetitions: 1 });
    });

    test('Second practice', () => {
      result = practice.supermemo(result, 5);
      expect(result).toEqual({ sm2_eFactor: 2.7, sm2_interval: 6, sm2_repetitions: 2 });
    });

    test('Next practice', () => {
      result = practice.supermemo(result, 5);
      expect(result).toEqual({ sm2_eFactor: 2.8, sm2_interval: 16, sm2_repetitions: 3 });
    });

    test('Next practice', () => {
      result = practice.supermemo(result, 5);
      expect(result).toEqual({ sm2_eFactor: 2.9, sm2_interval: 45, sm2_repetitions: 4 });
    });

    test('Next practice', () => {
      result = practice.supermemo(result, 5);
      expect(result).toEqual({ sm2_eFactor: 3, sm2_interval: 131, sm2_repetitions: 5 });
    });
  });

  describe('Regressions', () => {
    beforeEach(() => {
      initInput = { sm2_eFactor: 3, sm2_interval: 131, sm2_repetitions: 5 };
      result = undefined;
    });

    test('Grade 0: Reset and review today', () => {
      result = practice.supermemo(initInput, 0);
      expect(result).toEqual({ sm2_eFactor: 2.2, sm2_interval: 0, sm2_repetitions: 0 });
    });

    test('Grade 1: Review tomorrow', () => {
      result = practice.supermemo(initInput, 1);
      expect(result).toEqual({ sm2_eFactor: 2.46, sm2_interval: 1, sm2_repetitions: 0 });
    });
  });

  describe('Relative', () => {
    const initInput = { sm2_eFactor: 3, sm2_interval: 131, sm2_repetitions: 5 };
    const gradeResultsArr = new Array(6)
      .fill(undefined)
      .map((_, i) => ({ grade: i, ...practice.supermemo(initInput, i) }));

    const [result0, result1, result2, result3, result4, result5] = gradeResultsArr;

    test('Grade 0 should produce interval less all the rest', () => {
      const [result0, ...otherResults] = gradeResultsArr;
      for (const otherResult of otherResults) {
        expect(result0.sm2_interval).toBeLessThan(otherResult.sm2_interval);
      }
    });

    test('Grade 0 should be relative to Grade 1', () => {
      expect(result0.sm2_eFactor).toBeLessThan(result1.sm2_eFactor);
      expect(result0.sm2_interval).toBeLessThan(result1.sm2_interval);
    });

    test('1 and two both reset interval to 1 (review tomorrow)', () => {
      expect(result1.sm2_interval).toBe(1);
      expect(result2.sm2_interval).toBe(1);
    });

    test('Grade 1 should be relative to Grade 2', () => {
      expect(result1.sm2_eFactor).toBeLessThan(result2.sm2_eFactor);
    });

    test('Grade 2 should be relative to Grade 3', () => {
      expect(result2.sm2_eFactor).toBeLessThan(result3.sm2_eFactor);
      expect(result2.sm2_interval).toBeLessThan(result3.sm2_interval);
    });

    test('Grade 3 should be relative to Grade 4', () => {
      expect(result3.sm2_eFactor).toBeLessThan(result4.sm2_eFactor);
      expect(result3.sm2_interval).toBeLessThan(result4.sm2_interval);
    });

    test('Grade 4 should be relative to Grade 5', () => {
      expect(result4.sm2_eFactor).toBeLessThan(result5.sm2_eFactor);
      expect(result4.sm2_interval).toBeLessThan(result5.sm2_interval);
    });
  });

  describe('Progressive interval curve', () => {
    test('progressiveInterval produces correct schedule: 2, 6, 12, 24, 48, 96', () => {
      expect(practice.progressiveInterval(0)).toBe(2);
      expect(practice.progressiveInterval(1)).toBe(6);
      expect(practice.progressiveInterval(2)).toBe(12);
      expect(practice.progressiveInterval(3)).toBe(24);
      expect(practice.progressiveInterval(4)).toBe(48);
      expect(practice.progressiveInterval(5)).toBe(96);
    });

    test('progressiveInterval handles negative input as 0', () => {
      expect(practice.progressiveInterval(-1)).toBe(2);
    });
  });

  describe('Line-by-line metadata', () => {
    test('generatePracticeData does not pass through line-by-line fields (managed separately)', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-14T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        sm2_grade: 5,
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      });

      expect(result.algorithm).toBe(SchedulingAlgorithm.SM2);
      expect('lblNextReinsertOffset' in result).toBe(false);
      expect('lbl_progress' in result).toBe(false);
    });
  });

  describe('Mode independence: Progressive mode must not pollute SM2 fields', () => {
    test('Progressive mode does not increment SM2 repetitions', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        interaction: InteractionStyle.NORMAL,
        sm2_interval: 11,
        sm2_repetitions: 3,
        sm2_eFactor: 2.26,
        progressive_repetitions: 1,
        progressive_interval: 2,
      });

      expect(result.sm2_repetitions).toBe(3);
      expect(result.progressive_repetitions).toBe(2);
    });

    test('Progressive mode inherits SM2 interval and eFactor unchanged', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        interaction: InteractionStyle.NORMAL,
        sm2_interval: 11,
        sm2_repetitions: 3,
        sm2_eFactor: 2.26,
        progressive_repetitions: 1,
        progressive_interval: 2,
      });

      expect(result.sm2_interval).toBe(11);
      expect(result.sm2_eFactor).toBe(2.26);
    });

    test('Progressive mode does not write SM2 fields when they are undefined', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        interaction: InteractionStyle.NORMAL,
        progressive_repetitions: 0,
      });

      expect(result.sm2_interval).toBeUndefined();
      expect(result.sm2_repetitions).toBeUndefined();
      expect(result.sm2_eFactor).toBeUndefined();
      expect(result.progressive_repetitions).toBe(1);
    });
  });

  describe('Mode independence: SM2 mode preserves Progressive fields', () => {
    test('SM2 mode inherits progressive_repetitions and progressive_interval', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        sm2_grade: 4,
        sm2_interval: 6,
        sm2_repetitions: 2,
        sm2_eFactor: 2.26,
        progressive_repetitions: 3,
        progressive_interval: 12,
      });

      expect(result.progressive_repetitions).toBe(3);
      expect(result.progressive_interval).toBe(12);
      expect(result.sm2_repetitions).toBe(3);
      expect(result.sm2_interval).toBe(11);
    });

    test('SM2 mode does not write Progressive fields when they are undefined', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        sm2_grade: 5,
        sm2_interval: 0,
        sm2_repetitions: 0,
        sm2_eFactor: 2.5,
      });

      expect(result.progressive_repetitions).toBeUndefined();
      expect(result.progressive_interval).toBeUndefined();
    });
  });

  describe('Mode switching: full field inheritance across mode switches', () => {
    test('Switching SM2 -> Progressive preserves SM2 fields', () => {
      const sm2Result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        sm2_grade: 4,
        sm2_interval: 6,
        sm2_repetitions: 2,
        sm2_eFactor: 2.26,
      });

      const progResult = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        interaction: InteractionStyle.NORMAL,
        sm2_interval: sm2Result.sm2_interval,
        sm2_repetitions: sm2Result.sm2_repetitions,
        sm2_eFactor: sm2Result.sm2_eFactor,
        progressive_repetitions: sm2Result.progressive_repetitions,
        progressive_interval: sm2Result.progressive_interval,
      });

      expect(progResult.sm2_interval).toBe(sm2Result.sm2_interval);
      expect(progResult.sm2_repetitions).toBe(sm2Result.sm2_repetitions);
      expect(progResult.sm2_eFactor).toBe(sm2Result.sm2_eFactor);
      expect(progResult.progressive_repetitions).toBe(1);
    });

    test('Switching Progressive -> SM2 preserves Progressive fields', () => {
      const progResult = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.PROGRESSIVE,
        interaction: InteractionStyle.NORMAL,
        sm2_interval: 11,
        sm2_repetitions: 3,
        sm2_eFactor: 2.26,
        progressive_repetitions: 2,
        progressive_interval: 12,
      });

      const sm2Result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        sm2_grade: 4,
        sm2_interval: progResult.sm2_interval,
        sm2_repetitions: progResult.sm2_repetitions,
        sm2_eFactor: progResult.sm2_eFactor,
        progressive_repetitions: progResult.progressive_repetitions,
        progressive_interval: progResult.progressive_interval,
      });

      expect(sm2Result.progressive_repetitions).toBe(3);
      expect(sm2Result.progressive_interval).toBe(12);
      expect(sm2Result.sm2_repetitions).toBe(4);
    });
  });

  describe('FixedTime mode', () => {
    test('FixedTime with days unit calculates correct nextDueDate', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.FIXED_TIME,
        interaction: InteractionStyle.NORMAL,
        fixed_multiplier: 3,
        fixed_unit: FixedTimeUnit.DAYS,
      });

      expect(result.fixed_multiplier).toBe(3);
      expect(result.fixed_unit).toBe(FixedTimeUnit.DAYS);
      expect(result.nextDueDate).toEqual(new Date('2026-04-18T00:00:00.000Z'));
    });

    test('FixedTime with weeks unit calculates correct nextDueDate', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.FIXED_TIME,
        interaction: InteractionStyle.NORMAL,
        fixed_multiplier: 2,
        fixed_unit: FixedTimeUnit.WEEKS,
      });

      expect(result.fixed_multiplier).toBe(2);
      expect(result.fixed_unit).toBe(FixedTimeUnit.WEEKS);
      expect(result.nextDueDate).toEqual(new Date('2026-04-29T00:00:00.000Z'));
    });

    test('FixedTime with months unit calculates correct nextDueDate', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.FIXED_TIME,
        interaction: InteractionStyle.NORMAL,
        fixed_multiplier: 1,
        fixed_unit: FixedTimeUnit.MONTHS,
      });

      expect(result.fixed_multiplier).toBe(1);
      expect(result.fixed_unit).toBe(FixedTimeUnit.MONTHS);
      expect(result.nextDueDate).toEqual(new Date('2026-05-15T00:00:00.000Z'));
    });

    test('FixedTime with years unit calculates correct nextDueDate', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.FIXED_TIME,
        interaction: InteractionStyle.NORMAL,
        fixed_multiplier: 1,
        fixed_unit: FixedTimeUnit.YEARS,
      });

      expect(result.fixed_multiplier).toBe(1);
      expect(result.fixed_unit).toBe(FixedTimeUnit.YEARS);
      expect(result.nextDueDate).toEqual(new Date('2027-04-15T00:00:00.000Z'));
    });

    test('FixedTime defaults to 3 days when no multiplier or unit provided', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.FIXED_TIME,
        interaction: InteractionStyle.NORMAL,
      });

      expect(result.fixed_multiplier).toBe(3);
      expect(result.fixed_unit).toBe(FixedTimeUnit.DAYS);
      expect(result.nextDueDate).toEqual(new Date('2026-04-18T00:00:00.000Z'));
    });

    test('FixedTime preserves SM2 and Progressive fields', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.FIXED_TIME,
        interaction: InteractionStyle.NORMAL,
        fixed_multiplier: 5,
        fixed_unit: FixedTimeUnit.DAYS,
        sm2_repetitions: 3,
        sm2_eFactor: 2.26,
        sm2_interval: 11,
        sm2_grade: 4,
        progressive_repetitions: 2,
        progressive_interval: 12,
      });

      expect(result.sm2_repetitions).toBe(3);
      expect(result.sm2_eFactor).toBe(2.26);
      expect(result.sm2_interval).toBe(11);
      expect(result.sm2_grade).toBe(4);
      expect(result.progressive_repetitions).toBe(2);
      expect(result.progressive_interval).toBe(12);
    });

    test('FixedTime does not write SM2/Progressive fields when they are undefined', () => {
      const result = practice.generatePracticeData({
        dateCreated: new Date('2026-04-15T00:00:00.000Z'),
        algorithm: SchedulingAlgorithm.FIXED_TIME,
        interaction: InteractionStyle.NORMAL,
        fixed_multiplier: 3,
        fixed_unit: FixedTimeUnit.DAYS,
      });

      expect(result.sm2_repetitions).toBeUndefined();
      expect(result.sm2_eFactor).toBeUndefined();
      expect(result.sm2_interval).toBeUndefined();
      expect(result.sm2_grade).toBeUndefined();
      expect(result.progressive_repetitions).toBeUndefined();
      expect(result.progressive_interval).toBeUndefined();
    });
  });
});
