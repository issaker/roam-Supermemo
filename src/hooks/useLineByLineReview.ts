/**
 * LBL (Line by Line) Review Hook.
 *
 * Core architecture: child blocks have complete, independent Session Data.
 * - Each child block has its own ((childUid)) entry in the data page
 * - The parent LBL block only stores algorithm, interaction, and nextDueDate
 * - Child blocks can join any deck at any time as independent cards
 *
 * Auto-skip logic:
 * - Due/unread child blocks: require user interaction (Show Answer + grade / Read+Next)
 * - Mastered child blocks: auto-displayed (reduced opacity + green border), no user interaction needed
 * - After reviewing a due child block, auto-advance to the next due child block
 *
 * Reinsertion mechanism:
 * - LBL + Fixed (LblNext): reinserted after Read, continues sequential line-by-line after N cards
 * - LBL + SM2 Forgot: reinserted after Forgot, continues sequential line-by-line after N cards
 * - After reinsertion returns, resume from the next due child block (not from the beginning)
 *
 * Algorithm independence principle:
 * - Each algorithm only operates on its own fields; other algorithm fields are passed through unchanged
 * - sessionOverrides must include algorithm and interaction to ensure card mode is not lost after reinsertion
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
  setChildSessionData: React.Dispatch<React.SetStateAction<Record<string, Session>>>;
}

interface UseLineByLineReviewOutput {
  lineByLineRevealedCount: number;
  lineByLineCurrentChildIndex: number;
  lineByLineIsCardComplete: boolean;
  dueChildCount: number;
  onLineByLineGrade: (grade: number) => void;
  onLineByLineShowAnswer: () => void;
  onLineByLineUp: () => void;
  onLineByLineDown: () => void;
  currentChildAlgorithm: SchedulingAlgorithm;
  currentChildIsLblNext: boolean;
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
  setChildSessionData,
}: UseLineByLineReviewInput): UseLineByLineReviewOutput {
  const [lineByLineRevealedCount, setLineByLineRevealedCount] = React.useState(0);
  const [lineByLineCurrentChildIndex, setLineByLineCurrentChildIndex] = React.useState(0);

  const currentChildAlgorithm = React.useMemo(() => {
    if (!isLBLReviewMode || !childUidsList.length || lineByLineCurrentChildIndex >= childUidsList.length) {
      return algorithm;
    }
    const childUid = childUidsList[lineByLineCurrentChildIndex];
    const childSession = childSessionData[childUid];
    return childSession?.algorithm || algorithm;
  }, [isLBLReviewMode, childUidsList, lineByLineCurrentChildIndex, childSessionData, algorithm]);

  const currentChildIsLblNext = !isGradingAlgorithm(currentChildAlgorithm);

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

    if (currentChildIsLblNext) {
      setLineByLineRevealedCount(firstDueIndex + 1);
    } else {
      setLineByLineRevealedCount(firstDueIndex);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLBLReviewMode, currentCardRefUid, childUidsList, childSessionData]);

  const lineByLineIsCardComplete =
    isLBLReviewMode && lineByLineCurrentChildIndex >= childUidsList.length;

  const onLineByLineGrade = React.useCallback(
    async (grade: number) => {
      if (!currentCardRefUid || lineByLineCurrentChildIndex >= childUidsList.length) return;

      const childUid = childUidsList[lineByLineCurrentChildIndex];
      const existingChildSession = childSessionData[childUid] || generateNewSession({ algorithm: currentChildAlgorithm });
      const now = new Date();

      if (currentChildIsLblNext) {
        const childPracticeProps = {
          ...existingChildSession,
          refUid: childUid,
          dataPageTitle,
          algorithm: currentChildAlgorithm,
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

        setChildSessionData((prev) => ({
          ...prev,
          [childUid]: { ...existingChildSession, ...childResult, dateCreated: now },
        }));

        setSessionOverrides((prev) => ({
          ...prev,
          [childUid]: { ...existingChildSession, ...childResult, dateCreated: now },
          [currentCardRefUid]: {
            ...currentCardData,
            algorithm: currentChildAlgorithm,
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
        algorithm: currentChildAlgorithm,
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

      setChildSessionData((prev) => ({
        ...prev,
        [childUid]: { ...existingChildSession, ...childResult, dateCreated: now },
      }));

      setSessionOverrides((prev) => ({
        ...prev,
        [childUid]: { ...existingChildSession, ...childResult, dateCreated: now },
        [currentCardRefUid]: {
          ...currentCardData,
          algorithm: currentChildAlgorithm,
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
      currentChildIsLblNext,
      currentCardData,
      currentChildAlgorithm,
      interaction,
      lblNextReinsertOffset,
      forgotReinsertOffset,
      currentIndex,
      setSessionOverrides,
      setChildSessionData,
      setCardQueue,
      setShowAnswers,
    ]
  );

  const onLineByLineShowAnswer = React.useCallback(() => {
    setLineByLineRevealedCount((prev) => prev + 1);
    setShowAnswers(true);
  }, [setShowAnswers]);

  const onLineByLineUp = React.useCallback(() => {
    if (lineByLineCurrentChildIndex <= 0) return;

    const prevIndex = lineByLineCurrentChildIndex - 1;
    const prevChildUid = childUidsList[prevIndex];
    const prevChildSession = childSessionData[prevChildUid];
    const prevChildAlgorithm = prevChildSession?.algorithm || algorithm;
    const isTargetLblNext = !isGradingAlgorithm(prevChildAlgorithm);

    setLineByLineCurrentChildIndex(prevIndex);
    setLineByLineRevealedCount((prev) => Math.max(prev, prevIndex + 1));
    setShowAnswers(isTargetLblNext);
  }, [
    lineByLineCurrentChildIndex,
    childUidsList,
    childSessionData,
    algorithm,
    setLineByLineCurrentChildIndex,
    setShowAnswers,
  ]);

  const onLineByLineDown = React.useCallback(() => {
    if (lineByLineCurrentChildIndex >= childUidsList.length - 1) return;

    const nextIndex = lineByLineCurrentChildIndex + 1;
    const nextChildUid = childUidsList[nextIndex];
    const nextChildSession = childSessionData[nextChildUid];
    const nextChildAlgorithm = nextChildSession?.algorithm || algorithm;
    const isTargetLblNext = !isGradingAlgorithm(nextChildAlgorithm);

    setLineByLineCurrentChildIndex(nextIndex);
    setLineByLineRevealedCount((prev) => Math.max(prev, nextIndex + 1));
    setShowAnswers(isTargetLblNext);
  }, [
    lineByLineCurrentChildIndex,
    childUidsList,
    childSessionData,
    algorithm,
    setLineByLineCurrentChildIndex,
    setShowAnswers,
  ]);

  return {
    lineByLineRevealedCount,
    lineByLineCurrentChildIndex,
    lineByLineIsCardComplete,
    dueChildCount,
    onLineByLineGrade,
    onLineByLineShowAnswer,
    onLineByLineUp,
    onLineByLineDown,
    currentChildAlgorithm,
    currentChildIsLblNext,
  };
}
