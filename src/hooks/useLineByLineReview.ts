/**
 * LBL review is the secondary queue for a parent card.
 * Child blocks keep independent session data and algorithms; the parent only
 * chooses whether this card is rendered as NORMAL or LBL.
 *
 * This hook owns LBL navigation (prev/next/show-answer), child focus
 * positioning, and progressive reveal.  Grading is delegated to the unified
 * runtime action (reviewUnit).
 *
 * `lineByLineRevealedCount` is local view-state, backed by facts.latestByUid.
 * It controls progressive reveal: moving down reveals one more line;
 * moving up hides all lines below the current one.
 */
import * as React from 'react';
import {
  SchedulingAlgorithm,
  InteractionStyle,
  Session,
  isGradingAlgorithm,
  getSessionAlgorithm,
} from '~/models/session';
import { getLblQueueState } from '~/models/practice';

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
  hasLoadedChildSessionsForCurrentCard: boolean;
  algorithm: SchedulingAlgorithm;
  focusedChildUid?: string;
  setFocusedChildUid: (_uid?: string) => void;
  setMaxVisitedChildIndex: (_index: number) => void;
  childSessionData: Record<string, Session>;
  reviewUnit: (args: {
    targetUid: string;
    parentUid: string;
    grade?: number;
    algorithm: SchedulingAlgorithm;
    interaction: InteractionStyle;
    isChild: true;
    forgotReinsertOffset: number;
    lblNextReinsertOffset: number;
    currentPrimaryEntryId?: string;
    childUidsList: string[];
    childSessionData: Record<string, Session>;
    currentChildIsLblNext: boolean;
    lineByLineCurrentChildIndex: number;
  }) => Promise<void>;
  forgotReinsertOffset: number;
  lblNextReinsertOffset: number;
  currentPrimaryEntryId?: string;
  interaction: InteractionStyle;
  setShowAnswers: (_show: boolean) => void;
}

interface UseLineByLineReviewOutput {
  lineByLineRevealedCount: number;
  lineByLineCurrentChildIndex: number;
  currentChildUid: string | undefined;
  lineByLineIsCardComplete: boolean;
  dueChildCount: number;
  onLineByLineGrade: (_grade?: number) => void;
  onLineByLineShowAnswer: () => void;
  currentChildIsLblNext: boolean;
  onLineByLinePrev: () => void;
  onLineByLineNext: () => void;
}

export default function useLineByLineReview({
  currentCardRefUid,
  childUidsList,
  isLBLReviewMode,
  hasLoadedChildSessionsForCurrentCard,
  algorithm,
  focusedChildUid,
  setFocusedChildUid,
  setMaxVisitedChildIndex,
  childSessionData,
  reviewUnit,
  forgotReinsertOffset,
  lblNextReinsertOffset,
  currentPrimaryEntryId,
  interaction,
  setShowAnswers,
}: UseLineByLineReviewInput): UseLineByLineReviewOutput {
  // Local view-state for progressive reveal.  Moves up when the user
  // navigates backward (▲) and down when they move forward (▼) or grade.
  const [lineByLineRevealedCount, setLineByLineRevealedCount] = React.useState(0);

  const lblQueueState = React.useMemo(
    () => getLblQueueState(childUidsList, childSessionData, 0),
    [childUidsList, childSessionData]
  );
  const dueChildCount = lblQueueState.dueChildCount;
  const lineByLineCurrentChildIndex = React.useMemo(() => {
    if (!isLBLReviewMode || !childUidsList.length) return 0;
    if (focusedChildUid) {
      const focusedIndex = childUidsList.indexOf(focusedChildUid);
      if (focusedIndex >= 0) return focusedIndex;
    }
    return lblQueueState.nextDueChildIndex;
  }, [isLBLReviewMode, childUidsList, focusedChildUid, lblQueueState.nextDueChildIndex]);

  const currentChildUid =
    lineByLineCurrentChildIndex >= 0 && lineByLineCurrentChildIndex < childUidsList.length
      ? childUidsList[lineByLineCurrentChildIndex]
      : undefined;

  const currentChildAlgorithm = React.useMemo(() => {
    if (!isLBLReviewMode || !currentChildUid) return algorithm;
    const childSession = childSessionData[currentChildUid];
    return getSessionAlgorithm(childSession, algorithm);
  }, [isLBLReviewMode, currentChildUid, childSessionData, algorithm]);

  const currentChildIsLblNext = !isGradingAlgorithm(currentChildAlgorithm);

  const needsPositioningRef = React.useRef(true);

  React.useEffect(() => {
    if (!isLBLReviewMode || !childUidsList.length) {
      setLineByLineRevealedCount(0);
      needsPositioningRef.current = false;
      return;
    }
    needsPositioningRef.current = true;
  }, [isLBLReviewMode, currentCardRefUid, childUidsList]);

  React.useEffect(() => {
    if (!isLBLReviewMode || !childUidsList.length) return;
    if (!needsPositioningRef.current) return;
    if (!hasLoadedChildSessionsForCurrentCard) return;

    needsPositioningRef.current = false;

    const preservedIndex = focusedChildUid ? childUidsList.indexOf(focusedChildUid) : -1;
    const nextFocusIndex = preservedIndex >= 0 ? preservedIndex : lblQueueState.nextDueChildIndex;
    setFocusedChildUid(childUidsList[nextFocusIndex]);
    setMaxVisitedChildIndex(nextFocusIndex);
    setLineByLineRevealedCount(nextFocusIndex + 1);
  }, [
    isLBLReviewMode,
    childUidsList,
    childSessionData,
    hasLoadedChildSessionsForCurrentCard,
    lblQueueState,
    focusedChildUid,
    setFocusedChildUid,
    setMaxVisitedChildIndex,
  ]);

  const lineByLineIsCardComplete =
    isLBLReviewMode && lineByLineCurrentChildIndex >= childUidsList.length;

  React.useEffect(() => {
    if (!isLBLReviewMode || needsPositioningRef.current) return;

    if (!currentChildUid) {
      if (focusedChildUid) setFocusedChildUid(undefined);
      return;
    }

    if (focusedChildUid !== currentChildUid) {
      setFocusedChildUid(currentChildUid);
    }
    setMaxVisitedChildIndex(lineByLineCurrentChildIndex);
    setLineByLineRevealedCount((prev) => Math.max(prev, lineByLineCurrentChildIndex + 1));
  }, [
    isLBLReviewMode,
    currentChildUid,
    focusedChildUid,
    lineByLineCurrentChildIndex,
    setFocusedChildUid,
    setMaxVisitedChildIndex,
  ]);

  const onLineByLineGrade = React.useCallback(
    (grade?: number) => {
      if (
        !currentCardRefUid ||
        !currentChildUid ||
        lineByLineCurrentChildIndex >= childUidsList.length
      )
        return;

      void reviewUnit({
        targetUid: currentChildUid,
        parentUid: currentCardRefUid,
        grade,
        algorithm: currentChildAlgorithm,
        interaction,
        isChild: true,
        forgotReinsertOffset,
        lblNextReinsertOffset,
        currentPrimaryEntryId,
        childUidsList,
        childSessionData,
        currentChildIsLblNext,
        lineByLineCurrentChildIndex,
      });
    },
    [
      currentCardRefUid,
      currentChildUid,
      lineByLineCurrentChildIndex,
      childUidsList,
      childSessionData,
      currentChildAlgorithm,
      interaction,
      forgotReinsertOffset,
      lblNextReinsertOffset,
      currentPrimaryEntryId,
      currentChildIsLblNext,
      reviewUnit,
    ]
  );

  const onLineByLineShowAnswer = React.useCallback(() => {
    setLineByLineRevealedCount((prev) => Math.max(prev, lineByLineCurrentChildIndex + 1));
    setShowAnswers(true);
  }, [lineByLineCurrentChildIndex, setShowAnswers]);

  const onLineByLinePrev = React.useCallback(() => {
    if (lineByLineCurrentChildIndex <= 0) return;
    const newIndex = lineByLineCurrentChildIndex - 1;
    setFocusedChildUid(childUidsList[newIndex]);
    setLineByLineRevealedCount(newIndex + 1);
  }, [lineByLineCurrentChildIndex, childUidsList, setFocusedChildUid]);

  const onLineByLineNext = React.useCallback(() => {
    if (lineByLineCurrentChildIndex >= childUidsList.length - 1) return;
    const newIndex = lineByLineCurrentChildIndex + 1;
    setFocusedChildUid(childUidsList[newIndex]);
    setLineByLineRevealedCount((prev) => Math.max(prev, newIndex + 1));
  }, [lineByLineCurrentChildIndex, childUidsList, setFocusedChildUid]);

  return {
    lineByLineRevealedCount,
    lineByLineCurrentChildIndex,
    currentChildUid,
    lineByLineIsCardComplete,
    dueChildCount,
    onLineByLineGrade,
    onLineByLineShowAnswer,
    currentChildIsLblNext,
    onLineByLinePrev,
    onLineByLineNext,
  };
}
