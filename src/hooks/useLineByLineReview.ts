/**
 * LBL review is the secondary queue for a parent card.
 * Child blocks keep independent session data and algorithms; the parent only
 * chooses whether this card is rendered as NORMAL or LBL.
 */
import * as React from 'react';
import {
  SchedulingAlgorithm,
  InteractionStyle,
  Session,
  isGradingAlgorithm,
  getSessionAlgorithm,
  deriveParentNextDueDateFromChildSessions,
} from '~/models/session';
import { getLblQueueState } from '~/models/practice';
import { savePracticeData, updateParentNextDueDate } from '~/queries';
import { generatePracticeData } from '~/practice';
import { generateNewSession } from '~/queries/utils';
import * as dateUtils from '~/utils/date';

export const shouldReinsertLblCard = ({
  currentChildIndex,
  totalChildren,
  lblNextReinsertOffset,
}: {
  currentChildIndex: number;
  totalChildren: number;
  lblNextReinsertOffset: number;
}) => lblNextReinsertOffset > 0 && currentChildIndex < totalChildren - 1;

interface UseLineByLineReviewInput {
  currentCardRefUid: string | undefined;
  childUidsList: string[];
  isLBLReviewMode: boolean;
  isChildSessionLoading: boolean;
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
  onLineByLineGrade: (_grade: number) => void;
  onLineByLineShowAnswer: () => void;
  currentChildAlgorithm: SchedulingAlgorithm;
  currentChildIsLblNext: boolean;
  onLineByLinePrev: () => void;
  onLineByLineNext: () => void;
}

export default function useLineByLineReview({
  currentCardRefUid,
  childUidsList,
  isLBLReviewMode,
  isChildSessionLoading,
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
    return getSessionAlgorithm(childSession, algorithm);
  }, [isLBLReviewMode, childUidsList, lineByLineCurrentChildIndex, childSessionData, algorithm]);

  const currentChildIsLblNext = !isGradingAlgorithm(currentChildAlgorithm);

  const lblQueueState = React.useMemo(
    () => getLblQueueState(childUidsList, childSessionData, 0),
    [childUidsList, childSessionData]
  );
  const dueChildCount = lblQueueState.dueChildCount;

  const needsPositioningRef = React.useRef(true);

  React.useEffect(() => {
    if (!isLBLReviewMode || !childUidsList.length) {
      setLineByLineRevealedCount(0);
      setLineByLineCurrentChildIndex(0);
      needsPositioningRef.current = false;
      return;
    }
    needsPositioningRef.current = true;
  }, [isLBLReviewMode, currentCardRefUid, childUidsList, currentIndex]);

  // Reposition only after the secondary queue for the new parent card has loaded.
  React.useEffect(() => {
    if (!isLBLReviewMode || !childUidsList.length) return;
    if (!needsPositioningRef.current) return;
    if (isChildSessionLoading) return;

    needsPositioningRef.current = false;

    const firstDueIndex = lblQueueState.nextDueChildIndex;
    setLineByLineCurrentChildIndex(firstDueIndex);
    setLineByLineRevealedCount(firstDueIndex + 1);
  }, [isLBLReviewMode, childUidsList, childSessionData, isChildSessionLoading, lblQueueState]);

  const lineByLineIsCardComplete =
    isLBLReviewMode && lineByLineCurrentChildIndex >= childUidsList.length;

  const onLineByLineGrade = React.useCallback(
    async (grade: number) => {
      if (!currentCardRefUid || lineByLineCurrentChildIndex >= childUidsList.length) return;

      try {
      const childUid = childUidsList[lineByLineCurrentChildIndex];
      const existingChildSession = childSessionData[childUid] || generateNewSession({ algorithm: currentChildAlgorithm });
      const now = new Date();

      const isSameDayReScoring = !!existingChildSession.dateCreated
        && dateUtils.isSameDay(existingChildSession.dateCreated, now);

      if (currentChildIsLblNext) {
        const baseForCalculation = (isSameDayReScoring && existingChildSession.baseSessionData)
          ? existingChildSession.baseSessionData
          : existingChildSession;
        const childPracticeProps = {
          ...baseForCalculation,
          refUid: childUid,
          dataPageTitle,
          algorithm: currentChildAlgorithm,
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
          [childUid]: {
            ...existingChildSession,
            ...childResult,
            dateCreated: now,
          },
          [currentCardRefUid]: {
            ...currentCardData,
            algorithm: currentChildAlgorithm,
            interaction,
            dateCreated: now,
            nextDueDate: deriveParentNextDueDateFromChildSessions(
              childUidsList,
              {
                ...childSessionData,
                [childUid]: { ...existingChildSession, ...childResult, nextDueDate: childNextDueDate },
              },
              now
            ),
          },
        }));

        const nextDueIndex = getLblQueueState(
          childUidsList,
          {
            ...childSessionData,
            [childUid]: { ...existingChildSession, ...childResult, nextDueDate: childNextDueDate },
          },
          lineByLineCurrentChildIndex + 1
        ).nextDueChildIndex;

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

      const baseForCalculation = (isSameDayReScoring && grade !== 0 && existingChildSession.baseSessionData)
        ? existingChildSession.baseSessionData
        : existingChildSession;
      const childPracticeProps = {
        ...baseForCalculation,
        refUid: childUid,
        dataPageTitle,
        algorithm: currentChildAlgorithm,
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
        [childUid]: {
          ...existingChildSession,
          ...childResult,
          dateCreated: now,
        },
        [currentCardRefUid]: {
          ...currentCardData,
          algorithm: currentChildAlgorithm,
          interaction,
          dateCreated: now,
          nextDueDate: deriveParentNextDueDateFromChildSessions(
            childUidsList,
            {
              ...childSessionData,
              [childUid]: { ...existingChildSession, ...childResult, nextDueDate: childNextDueDate },
            },
            now
          ),
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
      const nextQueueState = getLblQueueState(
        childUidsList,
        updatedChildSessions,
        lineByLineCurrentChildIndex + 1
      );
      const nextDueIndex = nextQueueState.nextDueChildIndex;
      const isCardFinished = nextQueueState.isComplete;

      if (isCardFinished) {
        setCurrentIndex((prev) => prev + 1);
        setLineByLineCurrentChildIndex(nextDueIndex);
        setLineByLineRevealedCount(nextDueIndex);
        setShowAnswers(false);
        return;
      }

      setLineByLineCurrentChildIndex(nextDueIndex);
      setLineByLineRevealedCount(nextDueIndex + 1);
      setShowAnswers(false);
      } catch (err) {
        console.error('Memo: Failed to grade LBL card', err);
      }
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
      isChildSessionLoading,
    ]
  );

  const onLineByLineShowAnswer = React.useCallback(() => {
    setLineByLineRevealedCount((prev) => Math.max(prev, lineByLineCurrentChildIndex + 1));
    setShowAnswers(true);
  }, [lineByLineCurrentChildIndex, setShowAnswers]);

  const onLineByLinePrev = React.useCallback(() => {
    if (lineByLineCurrentChildIndex <= 0) return;
    const newIndex = lineByLineCurrentChildIndex - 1;
    setLineByLineCurrentChildIndex(newIndex);
    setLineByLineRevealedCount(newIndex + 1);
  }, [lineByLineCurrentChildIndex]);

  const onLineByLineNext = React.useCallback(() => {
    if (lineByLineCurrentChildIndex >= childUidsList.length - 1) return;
    const newIndex = lineByLineCurrentChildIndex + 1;
    setLineByLineCurrentChildIndex(newIndex);
    setLineByLineRevealedCount((prev) => Math.max(prev, newIndex + 1));
  }, [lineByLineCurrentChildIndex, childUidsList.length]);

  return {
    lineByLineRevealedCount,
    lineByLineCurrentChildIndex,
    lineByLineIsCardComplete,
    dueChildCount,
    onLineByLineGrade,
    onLineByLineShowAnswer,
    currentChildAlgorithm,
    currentChildIsLblNext,
    onLineByLinePrev,
    onLineByLineNext,
  };
}
