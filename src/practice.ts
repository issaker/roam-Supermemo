import { savePracticeData } from '~/queries/save';
import * as dateUtils from '~/utils/date';
import { omitUndefined } from '~/utils/object';
import { SchedulingAlgorithm, FixedTimeUnit, Session } from '~/models/session';

export const supermemo = (
  item: { sm2_interval: number; sm2_repetitions: number; sm2_eFactor: number },
  sm2_grade: number
) => {
  let nextInterval;
  let nextRepetition;
  let nextEfactor;

  if (sm2_grade === 0) {
    nextInterval = 0;
    nextRepetition = 0;
  } else if (sm2_grade < 3) {
    nextInterval = 1;
    nextRepetition = 0;
  } else {
    if (item.sm2_repetitions === 0) {
      nextInterval = 1;
      nextRepetition = 1;
    } else if (item.sm2_repetitions === 1) {
      nextInterval = 6;
      nextRepetition = 2;
    } else {
      nextInterval = Math.round(item.sm2_interval * item.sm2_eFactor * (sm2_grade / 5));
      nextRepetition = item.sm2_repetitions + 1;
    }
  }

  nextEfactor = item.sm2_eFactor + (0.1 - (5 - sm2_grade) * (0.08 + (5 - sm2_grade) * 0.02));
  if (nextEfactor < 1.3) nextEfactor = 1.3;
  nextEfactor = parseFloat(nextEfactor.toFixed(2));

  return { sm2_interval: nextInterval, sm2_repetitions: nextRepetition, sm2_eFactor: nextEfactor };
};

export const progressiveInterval = (progressive_repetitions: number): number => {
  if (progressive_repetitions <= 0) return 2;
  if (progressive_repetitions === 1) return 6;
  return 6 * Math.pow(2, progressive_repetitions - 1);
};

type PracticeDataResult = Session;

/**
 * Core scheduling function: computes next review data based on the algorithm.
 *
 * Field ownership and pass-through principle:
 * Each algorithm outputs its own core fields + common fields (algorithm, interaction, nextDueDate),
 * while passing through existing fields from other algorithms, preventing data loss when
 * savePracticeData rewrites the session block. Passed-through fields remain available when
 * switching back to the corresponding algorithm, enabling seamless algorithm switching.
 *
 * Three independent paths:
 * - SM2 path: outputs sm2_grade, sm2_interval, sm2_repetitions, sm2_eFactor
 *              passes through progressive_repetitions, progressive_interval
 * - Progressive path: outputs progressive_repetitions, progressive_interval
 *              passes through sm2_grade, sm2_interval, sm2_repetitions, sm2_eFactor
 * - FixedTime path: outputs fixed_multiplier, fixed_unit
 *              passes through progressive_repetitions, progressive_interval, sm2_grade, sm2_interval, sm2_repetitions, sm2_eFactor
 */
export const generatePracticeData = ({
  dateCreated,
  algorithm,
  interaction,
  ...props
}: Session): PracticeDataResult => {
  const referenceDate = dateCreated || new Date();

  if (algorithm === SchedulingAlgorithm.SM2) {
    const {
      sm2_grade,
      sm2_interval,
      sm2_repetitions,
      sm2_eFactor,
      progressive_repetitions,
      progressive_interval,
    } = props;
    const sm2Result = supermemo(
      {
        sm2_interval: sm2_interval || 0,
        sm2_repetitions: sm2_repetitions || 0,
        sm2_eFactor: sm2_eFactor || 2.5,
      },
      sm2_grade || 0
    );
    const nextDueDate = dateUtils.addDays(referenceDate, sm2Result.sm2_interval);

    return {
      algorithm,
      interaction,
      sm2_grade,
      sm2_repetitions: sm2Result.sm2_repetitions,
      sm2_interval: sm2Result.sm2_interval,
      sm2_eFactor: sm2Result.sm2_eFactor,
      ...omitUndefined({ progressive_repetitions, progressive_interval }),
      dateCreated: referenceDate,
      nextDueDate,
    };
  }

  if (algorithm === SchedulingAlgorithm.PROGRESSIVE) {
    const { progressive_repetitions, sm2_repetitions, sm2_eFactor, sm2_interval, sm2_grade } =
      props;
    const currentProgReps = progressive_repetitions || 0;
    const calculatedInterval = progressiveInterval(currentProgReps);
    const nextDueDate = dateUtils.addDays(referenceDate, calculatedInterval);

    return {
      algorithm,
      interaction,
      progressive_interval: calculatedInterval,
      progressive_repetitions: currentProgReps + 1,
      ...omitUndefined({ sm2_repetitions, sm2_eFactor, sm2_interval, sm2_grade }),
      dateCreated: referenceDate,
      nextDueDate,
    };
  }

  if (algorithm === SchedulingAlgorithm.FIXED_TIME) {
    const {
      fixed_multiplier,
      fixed_unit,
      progressive_repetitions,
      progressive_interval,
      sm2_repetitions,
      sm2_eFactor,
      sm2_interval,
      sm2_grade,
    } = props;

    const value = fixed_multiplier || 3;
    const unit = fixed_unit || FixedTimeUnit.DAYS;
    const unitDays: Record<FixedTimeUnit, number> = {
      [FixedTimeUnit.DAYS]: 1,
      [FixedTimeUnit.WEEKS]: 7,
      [FixedTimeUnit.MONTHS]: 30,
      [FixedTimeUnit.YEARS]: 365,
    };
    const nextDueDate = dateUtils.addDays(referenceDate, value * unitDays[unit]);

    return {
      algorithm,
      interaction,
      fixed_multiplier: value,
      fixed_unit: unit,
      ...omitUndefined({
        progressive_repetitions,
        progressive_interval,
        sm2_repetitions,
        sm2_eFactor,
        sm2_interval,
        sm2_grade,
      }),
      nextDueDate,
    };
  }

  throw new Error(`Unknown algorithm: ${algorithm}`);
};

export type PracticeProps = Session & {
  refUid: string;
  dataPageTitle: string;
  isCramming?: boolean;
};

const practice = async (practiceProps: PracticeProps, isDryRun = false) => {
  const {
    refUid,
    dataPageTitle,
    dateCreated,
    isCramming,
    sm2_grade,
    sm2_interval,
    sm2_repetitions,
    sm2_eFactor,
    fixed_multiplier,
    fixed_unit,
    progressive_repetitions,
    algorithm,
    interaction,
  } = practiceProps;

  const practiceResultData = generatePracticeData({
    sm2_grade,
    sm2_interval,
    sm2_repetitions,
    sm2_eFactor,
    dateCreated,
    fixed_multiplier,
    fixed_unit,
    progressive_repetitions,
    algorithm,
    interaction,
  });

  if (!isDryRun && !isCramming) {
    await savePracticeData({ refUid, dataPageTitle, dateCreated, ...practiceResultData });
  }

  return practiceResultData;
};

export default practice;
