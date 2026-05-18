import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import styled from '@emotion/styled';

import * as asyncUtils from '~/utils/async';
import * as stringUtils from '~/utils/string';
import mediaQueries from '~/utils/mediaQueries';

import CardBlock, { restoreAllBlocks } from '~/components/overlay/CardBlock';
import Footer from '~/components/overlay/Footer';
import Header from '~/components/overlay/Header';
import LineByLineView from '~/components/overlay/LineByLineView';
import SettingsDialog from '~/components/overlay/SettingsDialog';
import {
  Session,
  DEFAULT_REVIEW_CONFIG,
  isFixedTimeAlgorithm,
  isLBLReviewMode,
  isSessionMastered,
  getReviewStatus,
  getSessionAlgorithm,
  resolveBaseForCalculation,
  SchedulingAlgorithm,
  FixedTimeUnit,
  InteractionStyle,
  ReviewStatus,
} from '~/models/session';
import useLineByLineReview from '~/hooks/useLineByLineReview';
import usePracticeOverlayHotkeys from '~/hooks/usePracticeOverlayHotkeys';
import useBlockInfo from '~/hooks/useBlockInfo';
import useCardBlock from '~/hooks/useCardBlock';
import { generateNewSession } from '~/queries';

import { RenderMode } from '~/models/practice';
import { colors, getAlgorithmColor } from '~/theme';
import { useReviewStore } from '~/review-runtime/store/context';
import type { ReviewState } from '~/review-runtime/store/types';
import {
  selectCurrentCardRefUid,
  selectCurrentCardData,
  selectCardMeta,
  selectAlgorithm,
  selectInteraction,
  selectCardQueueLength,
  selectCompletedCount,
  selectRenderMode,
  deriveChildSessionMap,
} from '~/review-runtime/store/selectors';

interface MainContextProps {
  fixed_multiplier: number;
  setFixed_multiplier: (_multiplier: number) => void;
  fixed_unit: FixedTimeUnit;
  setFixed_unit: (_unit: FixedTimeUnit) => void;
  onPracticeClick: (_props: { sm2_grade?: number; refUid?: string }) => void;
  currentIndex: number;
  renderMode: RenderMode;
  isLineByLine: boolean;
  lineByLineCurrentIndex: number;
  lineByLineTotal: number;
  lineByLineDueCount: number;
  cardQueueLength: number;
  cardMeta: import('~/models/session').CardMeta | undefined;
  baseCardData: Session | undefined;
  currentChildAlgorithm: SchedulingAlgorithm | undefined;
  lineByLineIsCardComplete: boolean;
  onLineByLinePrev: (() => void) | undefined;
  onLineByLineNext: (() => void) | undefined;
  algorithm: SchedulingAlgorithm;
  interaction: InteractionStyle;
  onSelectAlgorithm: (_algorithm: SchedulingAlgorithm) => void;
  onSelectInteraction: (_interaction: InteractionStyle) => void;
}

const NOOP = () => {};

const DoneIllustration = () => (
  <DoneIllustrationWrap aria-hidden="true">
    <DoneIllustrationHalo />
    <DoneIllustrationBadge>
      <Blueprint.Icon icon="endorsed" iconSize={44} />
    </DoneIllustrationBadge>
    <DoneIllustrationSpark $top="-4px" $left="8px">
      <Blueprint.Icon icon="star" iconSize={12} />
    </DoneIllustrationSpark>
    <DoneIllustrationSpark $top="18px" $right="-2px">
      <Blueprint.Icon icon="star-empty" iconSize={14} />
    </DoneIllustrationSpark>
    <DoneIllustrationSpark $bottom="10px" $left="-6px">
      <Blueprint.Icon icon="endorsed" iconSize={10} />
    </DoneIllustrationSpark>
  </DoneIllustrationWrap>
);

export const MainContext = React.createContext<MainContextProps>({} as MainContextProps);

interface Props {
  isOpen: boolean;
  onCloseCallback: () => void;
}

const PracticeOverlay = ({ isOpen, onCloseCallback }: Props) => {
  const { state, dispatch, actions, updateSetting } = useReviewStore();
  const { facts, viewState, selectedTag, tagCardSets, settings, dataPageTitle } = state;
  const {
    rtlEnabled,
    forgotReinsertOffset,
    lblNextReinsertOffset,
    showBreadcrumbs,
    showModeBorders,
  } = settings;

  const handleClose = React.useCallback(() => {
    restoreAllBlocks();
    dispatch({ type: 'SET_CRAMMING', value: false });
    onCloseCallback();
  }, [dispatch, onCloseCallback]);

  const {
    currentCardRefUid,
    currentCardData,
    cardMeta,
    algorithm,
    interaction,
    cardQueueLength,
    completedCount,
    renderMode,
  } = React.useMemo(
    () => ({
      currentCardRefUid: selectCurrentCardRefUid(state),
      currentCardData: selectCurrentCardData(state),
      cardMeta: selectCardMeta(state),
      algorithm: selectAlgorithm(state),
      interaction: selectInteraction(state),
      cardQueueLength: selectCardQueueLength(state),
      completedCount: selectCompletedCount(state),
      renderMode: selectRenderMode(state),
    }),
    [state]
  );
  const effectiveRenderMode = renderMode || RenderMode.Normal;

  const prevIsOpenRef = React.useRef(false);
  const [cardRefreshKey, setCardRefreshKey] = React.useState(0);

  React.useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      dispatch({ type: 'RESET_TO_FIRST' });
      actions.checkDeleted();
      setCardRefreshKey((k) => k + 1);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, dispatch, actions]);

  React.useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      actions.checkDeleted();
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen, actions]);

  const [fixed_multiplier, setFixed_multiplier] = React.useState<number>(
    isFixedTimeAlgorithm(algorithm) ? currentCardData?.fixed_multiplier || 3 : 3
  );
  const [fixed_unit, setFixed_unit] = React.useState<FixedTimeUnit>(
    currentCardData?.fixed_unit || FixedTimeUnit.DAYS
  );

  const isDone = !currentCardRefUid;

  const baseCardData = React.useMemo(
    () => (currentCardData ? resolveBaseForCalculation(currentCardData) : currentCardData),
    [currentCardData]
  );

  const prevCardRefUidRef = React.useRef<string | undefined>();
  React.useEffect(() => {
    const cardChanged = prevCardRefUidRef.current !== currentCardRefUid;
    prevCardRefUidRef.current = currentCardRefUid;
    if (!currentCardData) return;
    if (!cardChanged) return;
    const algo = currentCardData.algorithm as SchedulingAlgorithm | undefined;
    if (isFixedTimeAlgorithm(algo)) {
      setFixed_multiplier(currentCardData.fixed_multiplier || 3);
      setFixed_unit((currentCardData as any).fixed_unit || FixedTimeUnit.DAYS);
    } else {
      setFixed_multiplier(3);
      setFixed_unit(FixedTimeUnit.DAYS);
    }
  }, [currentCardData, currentCardRefUid]);

  const isNew = currentCardData && 'isNew' in currentCardData && currentCardData.isNew;

  const { blockInfo } = useBlockInfo({ refUid: currentCardRefUid, refreshKey: interaction });
  const hasBlockChildrenUids = !!blockInfo.childrenUids && !!blockInfo.childrenUids.length;

  const [showSettings, setShowSettings] = React.useState(false);

  const isLBLReview = isLBLReviewMode(interaction) && hasBlockChildrenUids;
  const isLineByLineActive = isLBLReview;

  const childUidsList = React.useMemo(() => blockInfo.childrenUids || [], [blockInfo.childrenUids]);
  const childSessionData = React.useMemo(
    () => deriveChildSessionMap({ childUidsList, facts: facts.latestByUid }),
    [childUidsList, facts.latestByUid]
  );

  React.useEffect(() => {
    if (!isLineByLineActive || !childUidsList.length) return;
    actions.ensureLatestSessions(childUidsList);
  }, [isLineByLineActive, childUidsList, actions]);

  const activeSetShowAnswersRef = React.useRef<(show: boolean) => void>(() => {});
  const setShowAnswers = React.useCallback((show: boolean) => {
    activeSetShowAnswersRef.current(show);
  }, []);

  const setFocusedChildUid = React.useCallback(
    (uid?: string) => dispatch({ type: 'SET_FOCUSED_CHILD', childUid: uid }),
    [dispatch]
  );
  const setMaxVisitedChildIndex = React.useCallback(
    (index: number) => dispatch({ type: 'SET_MAX_VISITED_CHILD_INDEX', index }),
    [dispatch]
  );
  const resetChildViewState = React.useCallback(
    () => dispatch({ type: 'RESET_CHILD_VIEW' }),
    [dispatch]
  );
  const focusPrimaryByOffset = React.useCallback(
    (offset: number) => dispatch({ type: 'FOCUS_BY_OFFSET', offset }),
    [dispatch]
  );
  const setFocusedPrimaryUid = React.useCallback(
    (uid: string) => dispatch({ type: 'FOCUS_TO_UID', uid }),
    [dispatch]
  );
  const resetToFirstUnpracticed = React.useCallback(
    () => dispatch({ type: 'RESET_TO_FIRST' }),
    [dispatch]
  );
  const navigateToNextUnpracticed = React.useCallback(
    () => dispatch({ type: 'NAVIGATE_NEXT_UNPRACTICED' }),
    [dispatch]
  );

  const lblReviewUnit = React.useCallback(
    (args: Parameters<typeof actions.gradeCard>[0] & { currentChildIsLblNext?: boolean; lineByLineCurrentChildIndex?: number }) => {
      return actions.gradeCard({
        targetUid: args.targetUid,
        grade: args.grade,
        algorithm: args.algorithm,
        interaction: args.interaction,
        isChild: true,
        parentUid: args.parentUid,
        childUidsList: args.childUidsList,
        childSessionData: args.childSessionData,
        currentChildIsLblNext: args.currentChildIsLblNext,
        lineByLineCurrentChildIndex: args.lineByLineCurrentChildIndex,
        forgotReinsertOffset: args.forgotReinsertOffset,
        lblNextReinsertOffset: args.lblNextReinsertOffset,
      });
    },
    [actions]
  );

  const {
    lineByLineRevealedCount,
    lineByLineCurrentChildIndex,
    currentChildUid,
    lineByLineIsCardComplete,
    dueChildCount,
    onLineByLineGrade,
    onLineByLineShowAnswer,
    onLineByLinePrev,
    onLineByLineNext,
  } = useLineByLineReview({
    currentCardRefUid,
    childUidsList,
    isLBLReviewMode: isLineByLineActive,
    hasLoadedChildSessionsForCurrentCard: true,
    algorithm,
    focusedChildUid: viewState.focusedChildUid,
    setFocusedChildUid,
    setMaxVisitedChildIndex,
    childSessionData,
    reviewUnit: lblReviewUnit,
    forgotReinsertOffset,
    lblNextReinsertOffset,
    currentPrimaryEntryId: currentCardRefUid ? `card:${currentCardRefUid}` : undefined,
    interaction,
    setShowAnswers,
  });

  const activeUid =
    isLineByLineActive && !lineByLineIsCardComplete ? currentChildUid : currentCardRefUid;
  const activeSession = activeUid ? facts.latestByUid[activeUid] : undefined;
  const activeCard = useCardBlock(
    activeUid,
    activeSession,
    isLineByLineActive ? algorithm : undefined,
    cardRefreshKey
  );
  activeSetShowAnswersRef.current = activeCard.setShowAnswers;
  const { showAnswers } = activeCard;

  const currentReviewSession = React.useMemo(() => {
    if (isLineByLineActive && !lineByLineIsCardComplete) {
      return currentChildUid ? childSessionData[currentChildUid] : undefined;
    }
    return currentCardData;
  }, [
    isLineByLineActive,
    lineByLineIsCardComplete,
    currentChildUid,
    childSessionData,
    currentCardData,
  ]);

  const reviewStatus = React.useMemo<ReviewStatus | null>(() => {
    if (!currentCardData) {
      if (
        currentCardRefUid &&
        selectedTag &&
        tagCardSets[selectedTag]?.newUids?.includes(currentCardRefUid)
      ) {
        return 'new';
      }
      return null;
    }
    return getReviewStatus({
      session: currentReviewSession as Session | undefined,
      isNew: Boolean(!isLineByLineActive && isNew),
      now: new Date(),
    });
  }, [
    currentCardData,
    currentReviewSession,
    isLineByLineActive,
    isNew,
    currentCardRefUid,
    tagCardSets,
    selectedTag,
  ]);

  const isLearned = React.useMemo(() => {
    return isSessionMastered(currentReviewSession as Session | undefined, new Date());
  }, [currentReviewSession]);

  const effectiveBaseCardData = React.useMemo(() => {
    if (!isLineByLineActive) return baseCardData;
    if (!currentChildUid) return baseCardData;
    const childSession = childSessionData[currentChildUid];
    if (childSession) {
      const resolvedBase = resolveBaseForCalculation(childSession);
      return {
        ...resolvedBase,
        algorithm: getSessionAlgorithm(childSession, DEFAULT_REVIEW_CONFIG.algorithm),
      };
    }
    return generateNewSession({ algorithm });
  }, [isLineByLineActive, baseCardData, currentChildUid, childSessionData, algorithm]);

  const shouldShowAnswerFirst =
    effectiveRenderMode === RenderMode.AnswerFirst &&
    hasBlockChildrenUids &&
    !activeCard.showAnswers;

  const onTagChange = async (tag: string) => {
    dispatch({ type: 'CHANGE_TAG', tag });
    dispatch({ type: 'SET_CRAMMING', value: false });
    await asyncUtils.sleep(200);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement?.blur();
    }
  };

  const onPracticeClick = React.useCallback(
    (gradeData: { sm2_grade?: number; refUid?: string }) => {
      if (isLineByLineActive && !lineByLineIsCardComplete) {
        onLineByLineGrade(gradeData.sm2_grade);
        return;
      }
      if (isLineByLineActive && lineByLineIsCardComplete) {
        navigateToNextUnpracticed();
        return;
      }
      if (!currentCardRefUid) return;

      void actions.gradeCard({
        targetUid: currentCardRefUid,
        grade: gradeData.sm2_grade,
        algorithm,
        interaction,
        isChild: false,
        forgotReinsertOffset,
        lblNextReinsertOffset,
        baseCardData,
        currentCardData,
        ...(isFixedTimeAlgorithm(algorithm) && { fixed_multiplier, fixed_unit }),
      });
    },
    [
      isLineByLineActive,
      lineByLineIsCardComplete,
      onLineByLineGrade,
      navigateToNextUnpracticed,
      currentCardRefUid,
      actions,
      algorithm,
      interaction,
      forgotReinsertOffset,
      lblNextReinsertOffset,
      baseCardData,
      currentCardData,
      fixed_multiplier,
      fixed_unit,
    ]
  );

  const onNextClick = React.useCallback(() => focusPrimaryByOffset(1), [focusPrimaryByOffset]);
  const onPrevClick = React.useCallback(() => focusPrimaryByOffset(-1), [focusPrimaryByOffset]);

  const onStartCrammingClick = React.useCallback(() => {
    dispatch({ type: 'SET_CRAMMING', value: true });
    setFocusedPrimaryUid('');
    resetChildViewState();
  }, [dispatch, setFocusedPrimaryUid, resetChildViewState]);

  const onUndoLearning = React.useCallback(async () => {
    if (!currentCardRefUid) return;
    const undoRefUid =
      isLineByLineActive && !lineByLineIsCardComplete
        ? childUidsList[lineByLineCurrentChildIndex]
        : currentCardRefUid;
    if (!undoRefUid) return;

    await actions.undoCard({
      targetUid: undoRefUid,
      parentUid: isLineByLineActive && !lineByLineIsCardComplete ? currentCardRefUid : undefined,
      childUidsList: isLineByLineActive ? childUidsList : undefined,
    });
    setCardRefreshKey((k) => k + 1);
  }, [
    currentCardRefUid,
    isLineByLineActive,
    lineByLineIsCardComplete,
    childUidsList,
    lineByLineCurrentChildIndex,
    actions,
  ]);

  const toggleBreadcrumbs = React.useCallback(() => {
    const newShow = !state.settings.showBreadcrumbs;
    dispatch({ type: 'UPDATE_SETTINGS', settings: { showBreadcrumbs: newShow } });
  }, [state.settings.showBreadcrumbs, dispatch]);

  const handleApplyAndClose = React.useCallback(
    (formSettings: import('~/components/SettingsForm').SettingsFormSettings) => {
      for (const [key, value] of Object.entries(formSettings)) {
        updateSetting(key as keyof typeof formSettings, value);
      }
      dispatch({
        type: 'UPDATE_SETTINGS',
        settings: formSettings as Partial<ReviewState['settings']>,
      });
      setShowSettings(false);
      resetToFirstUnpracticed();
    },
    [dispatch, resetToFirstUnpracticed, updateSetting]
  );

  usePracticeOverlayHotkeys({ onToggleBreadcrumbs: toggleBreadcrumbs });

  const [isEditing, setIsEditing] = React.useState(false);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') setIsEditing(true);
    };
    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setTimeout(() => {
          if (!isMountedRef.current) return;
          const activeElement = document.activeElement;
          if (
            !activeElement ||
            (activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA')
          ) {
            setIsEditing(false);
          }
        }, 100);
      }
    };
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      isMountedRef.current = false;
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isOpen]);

  const onSelectAlgorithm = React.useCallback(
    async (newAlgorithm: SchedulingAlgorithm) => {
      if (!currentCardRefUid) return;
      if (isLineByLineActive && !lineByLineIsCardComplete) {
        const childUid = childUidsList[lineByLineCurrentChildIndex];
        if (!childUid) return;
        await actions.changeConfig({
          targetUid: childUid,
          isChild: true,
          algorithm: newAlgorithm,
          childSessionData,
        });
        setCardRefreshKey((k) => k + 1);
        return;
      }
      await actions.changeConfig({
        targetUid: currentCardRefUid,
        isChild: false,
        algorithm: newAlgorithm,
        interaction,
      });
    },
    [
      currentCardRefUid,
      isLineByLineActive,
      lineByLineIsCardComplete,
      childUidsList,
      lineByLineCurrentChildIndex,
      childSessionData,
      interaction,
      actions,
    ]
  );

  const onSelectInteraction = React.useCallback(
    async (newInteraction: InteractionStyle) => {
      if (!currentCardRefUid) return;
      await actions.changeConfig({
        targetUid: currentCardRefUid,
        isChild: false,
        algorithm,
        interaction: newInteraction,
      });
    },
    [currentCardRefUid, algorithm, actions]
  );

  const mainContextValue = React.useMemo(
    () => ({
      fixed_multiplier,
      setFixed_multiplier,
      fixed_unit,
      setFixed_unit,
      onPracticeClick,
      currentIndex: viewState.currentIndex,
      renderMode: effectiveRenderMode,
      isLineByLine: isLineByLineActive,
      lineByLineCurrentIndex: isLineByLineActive ? lineByLineCurrentChildIndex + 1 : 0,
      lineByLineTotal: isLineByLineActive ? childUidsList.length : 0,
      lineByLineDueCount: isLineByLineActive ? dueChildCount : 0,
      cardQueueLength,
      cardMeta,
      baseCardData: effectiveBaseCardData,
      currentChildAlgorithm: isLineByLineActive ? activeCard.algorithm : undefined,
      lineByLineIsCardComplete: isLineByLineActive ? lineByLineIsCardComplete : false,
      onLineByLinePrev: isLineByLineActive ? onLineByLinePrev : undefined,
      onLineByLineNext: isLineByLineActive ? onLineByLineNext : undefined,
      algorithm,
      interaction,
      onSelectAlgorithm,
      onSelectInteraction,
    }),
    [
      fixed_multiplier,
      setFixed_multiplier,
      fixed_unit,
      setFixed_unit,
      onPracticeClick,
      viewState.currentIndex,
      effectiveRenderMode,
      isLineByLineActive,
      lineByLineCurrentChildIndex,
      childUidsList,
      dueChildCount,
      cardQueueLength,
      cardMeta,
      effectiveBaseCardData,
      activeCard.algorithm,
      lineByLineIsCardComplete,
      onLineByLinePrev,
      onLineByLineNext,
      algorithm,
      interaction,
      onSelectAlgorithm,
      onSelectInteraction,
    ]
  );

  if (!tagCardSets[selectedTag]) {
    return null;
  }

  return (
    <MainContext.Provider value={mainContextValue}>
      <style>{MOBILE_OVERLAY_STYLES}</style>
      <Dialog
        $isEditing={isEditing}
        $algorithm={isLineByLineActive ? activeCard.algorithm : algorithm}
        $showModeBorders={showModeBorders}
        isOpen={isOpen}
        onClose={handleClose}
        className="pb-0"
        canEscapeKeyClose={true}
      >
        <Header
          className="bp3-dialog-header outline-none focus:outline-none focus-visible:outline-none"
          onCloseCallback={handleClose}
          onTagChange={onTagChange}
          status={reviewStatus}
          isDone={isDone}
          nextDueDate={(currentReviewSession as Session | undefined)?.nextDueDate}
          onToggleBreadcrumbs={toggleBreadcrumbs}
          onSettingsClick={() => setShowSettings(true)}
        />

        <DialogBody
          className="bp3-dialog-body overflow-y-scroll m-0 pt-6 pb-8 px-4"
          dir={rtlEnabled ? 'rtl' : undefined}
        >
          {currentCardRefUid ? (
            <>
              {isLineByLineActive ? (
                <LineByLineView
                  currentCardRefUid={currentCardRefUid}
                  childUidsList={childUidsList}
                  lineByLineRevealedCount={lineByLineRevealedCount}
                  lineByLineCurrentChildIndex={lineByLineCurrentChildIndex}
                  childSessionData={childSessionData}
                  showBreadcrumbs={showBreadcrumbs}
                  showAnswers={showAnswers}
                  currentChildAlgorithm={activeCard.algorithm}
                  dueChildCount={dueChildCount}
                  parentBlockInfo={blockInfo}
                />
              ) : shouldShowAnswerFirst ? (
                blockInfo.childrenUids?.map((uid) => (
                  <CardBlock
                    key={uid}
                    refUid={uid}
                    showAnswers={showAnswers}
                    breadcrumbs={blockInfo.breadcrumbs}
                    showBreadcrumbs={false}
                    onRenderComplete={NOOP}
                  />
                ))
              ) : (
                <CardBlock
                  refUid={currentCardRefUid}
                  showAnswers={showAnswers}
                  breadcrumbs={blockInfo.breadcrumbs}
                  showBreadcrumbs={showBreadcrumbs}
                  onRenderComplete={NOOP}
                />
              )}
            </>
          ) : (
            <div data-testid="practice-overlay-done-state" className="flex items-center flex-col">
              <DoneIllustration />
              <div>
                You&apos;re all caught up! 🌟{' '}
                {completedCount > 0
                  ? `Reviewed ${completedCount} ${stringUtils.pluralize(
                      completedCount,
                      'card',
                      'cards'
                    )} today.`
                  : ''}
              </div>
            </div>
          )}
        </DialogBody>
        <Footer
          refUid={currentCardRefUid}
          onPracticeClick={onPracticeClick}
          onNextClick={onNextClick}
          onPrevClick={onPrevClick}
          setShowAnswers={
            isLineByLineActive && !lineByLineIsCardComplete
              ? onLineByLineShowAnswer
              : setShowAnswers
          }
          showAnswers={showAnswers}
          onCloseCallback={handleClose}
          currentCardData={currentCardData}
          onStartCrammingClick={onStartCrammingClick}
          isLearned={isLearned}
          onUndoLearning={onUndoLearning}
        />
      </Dialog>

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onApplyAndClose={handleApplyAndClose}
        dataPageTitle={dataPageTitle}
      />
    </MainContext.Provider>
  );
};

const Dialog = styled(Blueprint.Dialog)<{
  $isEditing?: boolean;
  $algorithm?: SchedulingAlgorithm;
  $showModeBorders?: boolean;
}>`
  display: grid;
  grid-template-rows: 50px 1fr auto;
  max-height: 80vh;
  width: 90vw;

  border: 2px solid ${({ $algorithm }) => getAlgorithmColor($algorithm)};
  border-color: ${({ $showModeBorders, $algorithm }) =>
    $showModeBorders === false ? colors.borderSubtle : getAlgorithmColor($algorithm)};

  ${mediaQueries.lg} {
    width: 80vw;
  }

  ${mediaQueries.xl} {
    width: 70vw;
  }

  @media (max-width: 768px) {
    max-height: 100dvh;
    width: 100vw;
    height: 100dvh;
    margin: 0;
    border-radius: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
`;

const MOBILE_OVERLAY_STYLES = `
  @media (max-width: 768px) {
    .bp3-overlay.bp3-overlay-open > .bp3-overlay-backdrop {
      opacity: 0 !important;
      background: transparent !important;
      pointer-events: none !important;
    }

    .bp3-overlay.bp3-overlay-open {
      pointer-events: none !important;
    }

    .bp3-overlay.bp3-overlay-open .bp3-dialog-container,
    .bp3-overlay.bp3-overlay-open .bp3-dialog,
    .bp3-overlay.bp3-overlay-open [role="dialog"],
    .bp3-overlay.bp3-overlay-open .bp3-dialog * {
      pointer-events: auto !important;
    }

    .bp3-overlay.bp3-overlay-open .bp3-popover,
    .bp3-overlay.bp3-overlay-open .bp3-popover * {
      pointer-events: auto !important;
    }

    .bp3-overlay.bp3-overlay-open {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100dvh !important;
      margin: 0 !important;
      padding: 0 !important;
      padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    }
    .bp3-overlay .bp3-dialog-container {
      position: static !important;
      width: 100% !important;
      height: 100% !important;
      display: flex !important;
      align-items: stretch !important;
      justify-content: stretch !important;
      margin: 0 !important;
    }
  }
`;

const DialogBody = styled.div`
  overflow-x: hidden;
  min-height: 200px;
`;

const DoneIllustrationWrap = styled.div`
  position: relative;
  display: grid;
  place-items: center;
  width: 140px;
  height: 140px;
  margin: 8px 0 16px;
`;

const DoneIllustrationHalo = styled.div`
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: radial-gradient(circle, ${colors.overlayLightHover} 0%, transparent 70%);
  animation: memoDonePulse 2.2s ease-in-out infinite;

  @keyframes memoDonePulse {
    0%,
    100% {
      transform: scale(0.92);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.04);
      opacity: 1;
    }
  }
`;

const DoneIllustrationBadge = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 88px;
  height: 88px;
  border-radius: 50%;
  color: white;
  background: linear-gradient(135deg, ${colors.modeProgressive}, ${colors.modeSM2});
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);
`;

const DoneIllustrationSpark = styled.div<{
  $top?: string;
  $right?: string;
  $bottom?: string;
  $left?: string;
}>`
  position: absolute;
  z-index: 2;
  color: ${colors.modeProgressive};
  opacity: 0.9;
  top: ${({ $top }) => $top || 'auto'};
  right: ${({ $right }) => $right || 'auto'};
  bottom: ${({ $bottom }) => $bottom || 'auto'};
  left: ${({ $left }) => $left || 'auto'};
  animation: memoDoneFloat 2.6s ease-in-out infinite;

  @keyframes memoDoneFloat {
    0%,
    100% {
      transform: translateY(0);
      opacity: 0.65;
    }
    50% {
      transform: translateY(-6px);
      opacity: 1;
    }
  }
`;

export default PracticeOverlay;
