import * as React from 'react';
import {
  CardMeta,
  InteractionStyle,
  Records,
  RecordUid,
  Session,
  SchedulingAlgorithm,
} from '~/models/session';
import { savePracticeData, updateParentNextDueDate, updateReviewConfig } from '~/queries';
import { generateNewSession } from '~/queries/utils';
import { SessionFacts, ReviewViewState } from './types';
import {
  omitIsNew,
  calculateChildReview,
  calculateNormalReview,
  resolveNextLblNavigation,
} from './reviewLogic';

type QueueOperations = {
  queueReinsert: (uid: RecordUid, afterUid: RecordUid, offset: number) => void;
  filteredQueueRef: React.MutableRefObject<string[]>;
  viewStateRef: React.MutableRefObject<ReviewViewState>;
};

type NavigationOperations = {
  navigateToNextUnpracticed: () => void;
  setFocusedChildUid: (uid?: string) => void;
  setMaxVisitedChildIndex: (index: number) => void;
};

type ReviewOperationDeps = {
  facts: SessionFacts;
  isCramming: boolean;
  dataPageTitle: string;
  setPendingState: (uid: RecordUid, state: SessionFacts['pendingByUid'][string]) => void;
  upsertLatestSessions: (sessions: Partial<Records>) => void;
  queueOps: QueueOperations;
  navigationOps: NavigationOperations;
};

export const useReviewOperation = (deps: ReviewOperationDeps) => {
  const depsRef = React.useRef(deps);
  depsRef.current = deps;

  const reviewUnit = React.useCallback(
    async (args: {
      targetUid: RecordUid;
      grade?: number;
      algorithm: SchedulingAlgorithm;
      interaction: InteractionStyle;
      forgotReinsertOffset: number;
      currentPrimaryEntryId?: string;
      baseCardData?: Session;
      currentCardData?: Session;
      fixed_multiplier?: number;
      fixed_unit?: import('~/models/session').FixedTimeUnit;
      isChild?: boolean;
      parentUid?: RecordUid;
      childUidsList?: string[];
      childSessionData?: Record<string, Session>;
      currentChildIsLblNext?: boolean;
      lineByLineCurrentChildIndex?: number;
      lblNextReinsertOffset?: number;
    }) => {
      const {
        targetUid,
        grade,
        algorithm,
        interaction,
        forgotReinsertOffset,
        baseCardData,
        currentCardData,
        fixed_multiplier,
        fixed_unit,
        isChild,
        parentUid,
        childUidsList,
        childSessionData,
        currentChildIsLblNext,
        lineByLineCurrentChildIndex,
        lblNextReinsertOffset,
      } = args;

      const {
        facts,
        isCramming,
        dataPageTitle,
        setPendingState,
        upsertLatestSessions,
        queueOps,
        navigationOps,
      } = depsRef.current;

      const now = new Date();

      let practiceResult: ReturnType<typeof calculateNormalReview>['practiceResult'];
      let updatedChildSessionsForParent: Record<string, Session> | undefined;
      let updatedParentSession: Session | undefined;

      if (isChild) {
        const childResult = calculateChildReview({
          targetUid,
          grade,
          algorithm,
          interaction,
          childUidsList: childUidsList!,
          childSessionData: childSessionData!,
          parentUid: parentUid!,
          parentSession: facts.latestByUid[parentUid!] as Session | undefined,
          now,
        });
        practiceResult = childResult.practiceResult;
        updatedChildSessionsForParent = childResult.updatedChildSessionsForParent;
        updatedParentSession = childResult.updatedParentSession;
      } else {
        const normalResult = calculateNormalReview({
          grade,
          algorithm,
          interaction,
          baseCardData,
          currentCardData,
          fixed_multiplier,
          fixed_unit,
          now,
        });
        practiceResult = normalResult.practiceResult;
      }

      if (!isCramming) {
        setPendingState(targetUid, 'saving');
        if (isChild) {
          upsertLatestSessions({
            [targetUid]: {
              ...omitIsNew(childSessionData![targetUid] || generateNewSession({ algorithm })),
              ...practiceResult,
              dateCreated: now,
            } as Session,
            [parentUid!]: updatedParentSession!,
          });
        } else {
          const baseData = baseCardData || currentCardData;
          upsertLatestSessions({
            [targetUid]: {
              ...omitIsNew(baseData),
              ...practiceResult,
              dateCreated: now,
            } as Session,
          });
        }
      }

      const isForgot = grade === 0;

      if (!isChild || isForgot) {
        const reinsertUid = isChild ? parentUid! : targetUid;
        if (isForgot && forgotReinsertOffset > 0) {
          const afterUid =
            queueOps.filteredQueueRef.current[queueOps.viewStateRef.current.currentIndex];
          queueOps.queueReinsert(reinsertUid, afterUid, forgotReinsertOffset);
        }
        navigationOps.navigateToNextUnpracticed();
      } else {
        const { nextDueIndex, isDeckComplete } = resolveNextLblNavigation({
          childUidsList: childUidsList!,
          updatedChildSessionsForParent: updatedChildSessionsForParent!,
          lineByLineCurrentChildIndex: lineByLineCurrentChildIndex!,
        });

        if (
          currentChildIsLblNext &&
          lblNextReinsertOffset! > 0 &&
          lineByLineCurrentChildIndex! < childUidsList!.length - 1
        ) {
          queueOps.queueReinsert(
            parentUid!,
            queueOps.filteredQueueRef.current[queueOps.viewStateRef.current.currentIndex],
            lblNextReinsertOffset!
          );
          navigationOps.navigateToNextUnpracticed();
        } else if (isDeckComplete) {
          navigationOps.navigateToNextUnpracticed();
        }

        if (nextDueIndex < childUidsList!.length) {
          navigationOps.setFocusedChildUid(childUidsList![nextDueIndex]);
          navigationOps.setMaxVisitedChildIndex(nextDueIndex);
        }
      }

      try {
        await savePracticeData({
          refUid: targetUid,
          dataPageTitle,
          dateCreated: now,
          ...practiceResult,
        });
        if (isChild) {
          await updateParentNextDueDate({
            refUid: parentUid!,
            childUids: childUidsList!,
            dataPageTitle,
            childSessions: updatedChildSessionsForParent,
          });
        }
      } catch (err) {
        console.error('Memo: Failed to save practice data', err);
      } finally {
        setPendingState(targetUid, undefined);
      }
    },
    []
  );

  const updateReviewConfigAction = React.useCallback(
    async (args: {
      targetUid: RecordUid;
      isChild: boolean;
      algorithm?: SchedulingAlgorithm;
      interaction?: InteractionStyle;
      childSessionData?: Record<string, Session>;
      applyOptimisticCardMeta: (meta: CardMeta) => void;
      cardMeta: CardMeta | undefined;
    }) => {
      const {
        targetUid,
        isChild,
        algorithm,
        interaction,
        childSessionData,
        applyOptimisticCardMeta,
        cardMeta,
      } = args;

      const { facts, dataPageTitle, setPendingState, upsertLatestSessions } = depsRef.current;

      try {
        setPendingState(targetUid, 'updatingConfig');

        if (isChild) {
          const existingChildSession =
            childSessionData?.[targetUid] || generateNewSession({ algorithm });
          upsertLatestSessions({
            [targetUid]: {
              ...existingChildSession,
              algorithm,
            } as Session,
          });
        } else {
          const currentSession = facts.latestByUid[targetUid] as Session | undefined;
          upsertLatestSessions({
            [targetUid]: {
              ...(currentSession || {}),
              algorithm,
              interaction,
            } as Session,
          });

          applyOptimisticCardMeta({
            ...cardMeta,
            algorithm: (algorithm ?? cardMeta?.algorithm) as SchedulingAlgorithm,
            interaction: (interaction ?? cardMeta?.interaction) as InteractionStyle,
          });
        }

        await updateReviewConfig({
          refUid: targetUid,
          dataPageTitle,
          algorithm,
          ...(isChild ? {} : { interaction }),
        });
      } catch (err) {
        console.error('Memo: Failed to update review config', err);
      } finally {
        setPendingState(targetUid, undefined);
      }
    },
    []
  );

  return { reviewUnit, updateReviewConfigAction };
};
