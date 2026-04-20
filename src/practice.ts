import { savePracticeData } from '~/queries/save';
import * as dateUtils from '~/utils/date';
import {
  SchedulingAlgorithm,
  FixedTimeUnit,
  Session,
} from '~/models/session';

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
 * 核心调度函数：根据算法计算下一次复习数据。
 *
 * 字段归属与透传原则：
 * 每个算法输出自己的核心字段 + 通用字段（algorithm, interaction, nextDueDate），
 * 同时透传其他算法的已有字段，防止 savePracticeData 重写 session block 时丢失数据。
 * 透传的字段在下次切换回对应算法时仍可使用，实现算法间无缝切换。
 *
 * 三条独立路径：
 * - SM2 路径：输出 sm2_grade, sm2_interval, sm2_repetitions, sm2_eFactor
 *              透传 progressive_repetitions, progressive_interval
 * - Progressive 路径：输出 progressive_repetitions, progressive_interval
 *              透传 sm2_grade, sm2_interval, sm2_repetitions, sm2_eFactor
 * - FixedTime 路径：输出 fixed_multiplier, fixed_unit
 *              透传 progressive_repetitions, progressive_interval, sm2_grade, sm2_interval, sm2_repetitions, sm2_eFactor
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
      { sm2_interval: sm2_interval || 0, sm2_repetitions: sm2_repetitions || 0, sm2_eFactor: sm2_eFactor || 2.5 },
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
      ...(progressive_repetitions !== undefined && { progressive_repetitions }),
      ...(progressive_interval !== undefined && { progressive_interval }),
      dateCreated: referenceDate,
      nextDueDate,
    };
  }

  if (algorithm === SchedulingAlgorithm.PROGRESSIVE) {
    const {
      progressive_repetitions,
      sm2_repetitions,
      sm2_eFactor,
      sm2_interval,
      sm2_grade,
    } = props;
    const currentProgReps = progressive_repetitions || 0;
    const calculatedInterval = progressiveInterval(currentProgReps);
    const nextDueDate = dateUtils.addDays(referenceDate, calculatedInterval);

    return {
      algorithm,
      interaction,
      progressive_interval: calculatedInterval,
      progressive_repetitions: currentProgReps + 1,
      ...(sm2_repetitions !== undefined && { sm2_repetitions }),
      ...(sm2_eFactor !== undefined && { sm2_eFactor }),
      ...(sm2_interval !== undefined && { sm2_interval }),
      ...(sm2_grade !== undefined && { sm2_grade }),
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
      ...(progressive_repetitions !== undefined && { progressive_repetitions }),
      ...(progressive_interval !== undefined && { progressive_interval }),
      ...(sm2_repetitions !== undefined && { sm2_repetitions }),
      ...(sm2_eFactor !== undefined && { sm2_eFactor }),
      ...(sm2_interval !== undefined && { sm2_interval }),
      ...(sm2_grade !== undefined && { sm2_grade }),
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
