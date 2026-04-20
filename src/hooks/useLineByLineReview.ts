/**
 * LBL (Line by Line) 逐行复习 Hook。
 *
 * 核心架构：子 Block 拥有完整独立的 Session Data。
 * - 每个子 Block 在数据页中有自己的 ((childUid)) 条目
 * - 父级 LBL Block 仅存储 algorithm, interaction, nextDueDate
 * - 子 Block 可随时加入任意牌组成为独立卡片
 *
 * 自动跳过逻辑：
 * - 到期/未读子 Block：需要用户交互（Show Answer + 打分 / Read+Next）
 * - 已掌握子 Block：自动显示（降低透明度+绿色边框），无需用户交互
 * - 复习完一个到期子 Block 后，自动前进到下一个到期子 Block
 *
 * 插队机制：
 * - LBL + Fixed (LblNext)：Read 后插队，N 张后继续顺延逐行学习
 * - LBL + SM2 Forgot：Forgot 后插队，N 张后继续顺延逐行学习
 * - 插队回来后，从下一个到期子 Block 继续（不从头开始）
 *
 * 算法独立原则：
 * - 每个算法只操作自己的字段，其他算法字段原样传递
 * - sessionOverrides 必须包含 algorithm 和 interaction，确保插队后卡片模式不丢失
 */
import * as React from 'react';
import { SchedulingAlgorithm, InteractionStyle, Session, isGradingAlgorithm } from '~/models/session';
import { savePracticeData, updateParentNextDueDate } from '~/queries';
import { generatePracticeData } from '~/practice';
import { generateNewSession } from '~/queries/utils';

export const shouldReinsertLblCard = ({
  currentChildIndex,
  totalChildren,
  lblNextReinsertOffset,
}: {
  currentChildIndex: number;
  totalChildren: number;
  lblNextReinsertOffset: number;
}) => lblNextReinsertOffset > 0 && currentChildIndex < totalChildren - 1;

const getDueChildIndices = (
  childUidsList: string[],
  childSessionData: Record<string, Session>
): number[] => {
  const now = new Date();
  return childUidsList.reduce((indices, uid, index) => {
    const session = childSessionData[uid];
    if (!session || !session.nextDueDate || session.nextDueDate <= now) {
      indices.push(index);
    }
    return indices;
  }, [] as number[]);
};

const findNextDueChildIndex = (
  childUidsList: string[],
  childSessionData: Record<string, Session>,
  fromIndex: number
): number => {
  const now = new Date();
  for (let i = fromIndex; i < childUidsList.length; i++) {
    const uid = childUidsList[i];
    const session = childSessionData[uid];
    if (!session || !session.nextDueDate || session.nextDueDate <= now) {
      return i;
    }
  }
  return childUidsList.length;
};

interface UseLineByLineReviewInput {
  currentCardRefUid: string | undefined;
  childUidsList: string[];
  isLBLReviewMode: boolean;
  dataPageTitle: string;
  lblNextReinsertOffset: number;
  forgotReinsertOffset: number;
  currentIndex: number;
  currentCardData: any;
  algorithm: SchedulingAlgorithm;
  interaction: InteractionStyle;
  setSessionOverrides: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>;
  setShowAnswers: React.Dispatch<React.SetStateAction<boolean>>;
  setCardQueue: React.Dispatch<React.SetStateAction<string[]>>;
  childSessionData: Record<string, Session>;
}

interface UseLineByLineReviewOutput {
  lineByLineRevealedCount: number;
  lineByLineCurrentChildIndex: number;
  lineByLineIsCardComplete: boolean;
  dueChildCount: number;
  onLineByLineGrade: (grade: number) => void;
  onLineByLineShowAnswer: () => void;
}

export default function useLineByLineReview({
  currentCardRefUid,
  childUidsList,
  isLBLReviewMode,
  dataPageTitle,
  lblNextReinsertOffset,
  forgotReinsertOffset,
  currentIndex,
  currentCardData,
  algorithm,
  interaction,
  setSessionOverrides,
  setCurrentIndex,
  setShowAnswers,
  setCardQueue,
  childSessionData,
}: UseLineByLineReviewInput): UseLineByLineReviewOutput {
  const isLblNext = !isGradingAlgorithm(algorithm);

  const [lineByLineRevealedCount, setLineByLineRevealedCount] = React.useState(0);
  const [lineByLineCurrentChildIndex, setLineByLineCurrentChildIndex] = React.useState(0);

  const dueChildIndices = React.useMemo(
    () => getDueChildIndices(childUidsList, childSessionData),
    [childUidsList, childSessionData]
  );

  const dueChildCount = dueChildIndices.length;

  React.useEffect(() => {
    if (!isLBLReviewMode || !childUidsList.length) {
      setLineByLineRevealedCount(0);
      setLineByLineCurrentChildIndex(0);
      return;
    }

    const firstDueIndex = findNextDueChildIndex(childUidsList, childSessionData, 0);
    setLineByLineCurrentChildIndex(firstDueIndex);

    if (isLblNext) {
      setLineByLineRevealedCount(firstDueIndex + 1);
    } else {
      setLineByLineRevealedCount(firstDueIndex);
    }
  }, [isLBLReviewMode, isLblNext, currentCardRefUid, childUidsList, childSessionData]);

  const lineByLineIsCardComplete =
    isLBLReviewMode && lineByLineCurrentChildIndex >= childUidsList.length;

  const onLineByLineGrade = React.useCallback(
    async (grade: number) => {
      if (!currentCardRefUid || lineByLineCurrentChildIndex >= childUidsList.length) return;

      const childUid = childUidsList[lineByLineCurrentChildIndex];
      const existingChildSession = childSessionData[childUid] || generateNewSession({ algorithm });
      const now = new Date();

      if (isLblNext) {
        const childPracticeProps = {
          ...existingChildSession,
          refUid: childUid,
          dataPageTitle,
          algorithm,
          interaction: InteractionStyle.NORMAL,
        };
        const childResult = generatePracticeData({ ...childPracticeProps, dateCreated: now });
        const childNextDueDate = childResult.nextDueDate;

        await savePracticeData({
          refUid: childUid,
          dataPageTitle,
          dateCreated: now,
          ...childResult,
        });

        await updateParentNextDueDate({
          refUid: currentCardRefUid,
          childUids: childUidsList,
          dataPageTitle,
        });

        setSessionOverrides((prev) => ({
          ...prev,
          [childUid]: { ...existingChildSession, ...childResult, dateCreated: now },
          [currentCardRefUid]: {
            ...currentCardData,
            algorithm,
            interaction,
            dateCreated: now,
            nextDueDate: childNextDueDate,
          },
        }));

        const nextDueIndex = findNextDueChildIndex(
          childUidsList,
          {
            ...childSessionData,
            [childUid]: { ...existingChildSession, ...childResult, nextDueDate: childNextDueDate },
          },
          lineByLineCurrentChildIndex + 1
        );

        if (
          shouldReinsertLblCard({
            currentChildIndex: lineByLineCurrentChildIndex,
            totalChildren: childUidsList.length,
            lblNextReinsertOffset,
          }) &&
          currentCardRefUid
        ) {
          const readInsertIndex = currentIndex + 1 + lblNextReinsertOffset;
          setCardQueue((prev) => {
            const newQueue = [...prev];
            const targetIndex = Math.min(readInsertIndex, newQueue.length);
            newQueue.splice(targetIndex, 0, currentCardRefUid);
            return newQueue;
          });
        }

        setCurrentIndex((prev) => prev + 1);
        setLineByLineCurrentChildIndex(nextDueIndex);
        setLineByLineRevealedCount(nextDueIndex + 1);
        return;
      }

      const childPracticeProps = {
        ...existingChildSession,
        refUid: childUid,
        dataPageTitle,
        algorithm,
        interaction: InteractionStyle.NORMAL,
        sm2_grade: grade,
      };
      const childResult = generatePracticeData({ ...childPracticeProps, dateCreated: now });
      const childNextDueDate = childResult.nextDueDate;

      await savePracticeData({
        refUid: childUid,
        dataPageTitle,
        dateCreated: now,
        ...childResult,
      });

      await updateParentNextDueDate({
        refUid: currentCardRefUid,
        childUids: childUidsList,
        dataPageTitle,
      });

      setSessionOverrides((prev) => ({
        ...prev,
        [childUid]: { ...existingChildSession, ...childResult, dateCreated: now },
        [currentCardRefUid]: {
          ...currentCardData,
          algorithm,
          interaction,
          dateCreated: now,
          nextDueDate: childNextDueDate,
        },
      }));

      if (grade === 0 && forgotReinsertOffset > 0 && currentCardRefUid) {
        const forgotInsertIndex = currentIndex + 1 + forgotReinsertOffset;
        setCardQueue((prev) => {
          const newQueue = [...prev];
          const targetIndex = Math.min(forgotInsertIndex, newQueue.length);
          newQueue.splice(targetIndex, 0, currentCardRefUid);
          return newQueue;
        });
      }

      if (grade === 0) {
        setCurrentIndex((prev) => prev + 1);
        setShowAnswers(false);
        return;
      }

      const updatedChildSessions = {
        ...childSessionData,
        [childUid]: { ...existingChildSession, ...childResult, nextDueDate: childNextDueDate },
      };
      const nextDueIndex = findNextDueChildIndex(
        childUidsList,
        updatedChildSessions,
        lineByLineCurrentChildIndex + 1
      );
      const isCardFinished = nextDueIndex >= childUidsList.length;

      if (isCardFinished) {
        setCurrentIndex((prev) => prev + 1);
        setLineByLineCurrentChildIndex(nextDueIndex);
        setLineByLineRevealedCount(nextDueIndex);
        setShowAnswers(false);
        return;
      }

      setLineByLineCurrentChildIndex(nextDueIndex);
      setLineByLineRevealedCount(nextDueIndex);
      setShowAnswers(false);
    },
    [
      currentCardRefUid,
      lineByLineCurrentChildIndex,
      childUidsList,
      childSessionData,
      dataPageTitle,
      setCurrentIndex,
      isLblNext,
      currentCardData,
      algorithm,
      interaction,
      lblNextReinsertOffset,
      forgotReinsertOffset,
      currentIndex,
      setSessionOverrides,
      setCardQueue,
      setShowAnswers,
    ]
  );

  const onLineByLineShowAnswer = React.useCallback(() => {
    setLineByLineRevealedCount((prev) => prev + 1);
    setShowAnswers(true);
  }, [setShowAnswers]);

  return {
    lineByLineRevealedCount,
    lineByLineCurrentChildIndex,
    lineByLineIsCardComplete,
    dueChildCount,
    onLineByLineGrade,
    onLineByLineShowAnswer,
  };
}
