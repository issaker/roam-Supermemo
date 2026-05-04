/**
 * PracticeOverlay Component
 *
 * Main review interface — displays cards one at a time and handles grading.
 *
 * Architecture:
 * - Receives practice data, settings, and callbacks as props from App
 * - useReviewRuntime provides unified facts store, view state, selectors, and actions
 * - useCurrentCardData derives card meta from the session history (no polling)
 * - MainContext provides shared state (algorithm, interaction, fixed_multiplier/fixed_unit editor state, etc.) to child components
 * - Footer handles grading buttons and keyboard shortcuts
 * - CardBlock renders the actual Roam block content
 *
 * Runtime architecture:
 * - reviewUnit and updateReviewConfigAction go through unified runtime actions
 * - Undo is a CARD operation (undoCardSession in queries/save.ts), not a queue operation
 * - This component is a container that wires runtime actions to UI callbacks
 *
 * Settings flow:
 * - All settings come from useSettings via App props (single source of truth)
 * - updateSetting is used to change settings, which handles extensionAPI + debounced page sync
 * - Settings dialog uses formSettings for responsive form state, commits via updateSetting
 */
import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import styled from '@emotion/styled';

import * as asyncUtils from '~/utils/async';
import * as stringUtils from '~/utils/string';
import mediaQueries from '~/utils/mediaQueries';

import CardBlock from '~/components/overlay/CardBlock';
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
import useLineByLineReview, { shouldReinsertLblCard } from '~/hooks/useLineByLineReview';
export { shouldReinsertLblCard };
import useAutoCollapseBlocks from '~/hooks/useAutoCollapseBlocks';
import usePracticeOverlayHotkeys from '~/hooks/usePracticeOverlayHotkeys';
import useBlockInfo from '~/hooks/useBlockInfo';
import useCurrentCardData from '~/hooks/useCurrentCardData';
import useCardBlock from '~/hooks/useCardBlock';
import { generateNewSession } from '~/queries';
import { undoCardSession } from '~/queries/save';

import { RenderMode } from '~/models/practice';
import { colors, getAlgorithmColor } from '~/theme';
import { usePracticeSession, PracticeSessionContext } from '~/contexts/PracticeSessionContext';
import { AlgorithmProvider } from '~/contexts/AlgorithmContext';
import { useReviewRuntime } from '~/review-runtime/useReviewRuntime';
import { deriveChildSessionMap } from '~/review-runtime/selectors';

/**
 * MainContext: shared state for the review overlay.
 *
 * Dual-queue architecture:
 * - Primary queue: ◀/▶ navigate between cards
 * - Secondary queue (LBL): ▲/▼ navigate between child blocks
 * - onLineByLinePrev/onLineByLineNext are only available when isLineByLine is true
 * - Interaction mode (Normal/LBL) is a parent-level property only; InteractionSelector always shows parent's interaction
 *
 * Maintenance rule:
 * Index-based props in this context are derived from uid-based runtime state
 * for UI compatibility. Do not expand them into new sources of truth.
 */
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
}

// Stable reference: prevent inline functions from invalidating React.memo
const NOOP = () => {};

// CSS animation keeps the completion state lightweight; shipping lottie-web for
// a single terminal-state illustration adds a large bundle cost for little gain.
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
  const sessionContext = usePracticeSession();
  const {
    settings,
    practiceData,
    tagCardSets,
    selectedTag,
    isCramming,
    setIsCramming,
    handleMemoTagChange,
    dataPageTitle,
    updateSetting,
    fetchPracticeData,
  } = sessionContext;

  const {
    rtlEnabled,
    forgotReinsertOffset,
    lblNextReinsertOffset,
    showBreadcrumbs,
    showModeBorders,
    autoCollapseBlocks,
  } = settings;
  const runtime = useReviewRuntime({
    practiceData,
    tagCardSets,
    selectedTag,
    isCramming,
    dataPageTitle,
  });
  const {
    facts,
    viewState,
    renderMode,
    completedCount,
    currentPrimaryEntryId,
    currentCardRefUid,
    currentIndex,
    cardQueueLength,
    focusPrimaryByOffset,
    setFocusedPrimaryUid,
    setFocusedChildUid,
    resetChildViewState,
    setMaxVisitedChildIndex,
    resetToFirstUnpracticed,
    navigateToNextUnpracticed,
    ensureLatestSessions,
    reviewUnit,
    upsertLatestSessions,
    updateReviewConfigAction,
    checkDeleted,
  } = runtime;

  const prevIsOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      resetToFirstUnpracticed();
      checkDeleted();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, resetToFirstUnpracticed, checkDeleted]);

  const effectiveRenderMode = renderMode || RenderMode.Normal;
  const sessions = React.useMemo(() => {
    const effectiveSession = currentCardRefUid ? facts.latestByUid[currentCardRefUid] : undefined;
    return effectiveSession ? [effectiveSession] : [];
  }, [currentCardRefUid, facts.latestByUid]);
  const {
    currentCardData,
    cardMeta,
    algorithm,
    interaction,
    latestSession,
    applyOptimisticCardMeta,
  } = useCurrentCardData({
    currentCardRefUid,
    sessions,
  });

  const [fixed_multiplier, setFixed_multiplier] = React.useState<number>(
    isFixedTimeAlgorithm(algorithm) ? currentCardData?.fixed_multiplier || 3 : 3
  );
  const [fixed_unit, setFixed_unit] = React.useState<FixedTimeUnit>(
    currentCardData?.fixed_unit || FixedTimeUnit.DAYS
  );

  const isDone = !currentCardRefUid;

  // Resolve the base session for SM2/Progressive/FixedTime calculation.
  // On same-day re-scoring, rewinds to baseSessionData (Forgot or previous day)
  // to prevent interval inflation. See resolveBaseForCalculation in session.ts.
  const baseCardData = React.useMemo(
    () => (currentCardData ? resolveBaseForCalculation(currentCardData) : currentCardData),
    [currentCardData]
  );

  // Track previous card UID so the interval state is only initialised
  // when the card changes — not on every polling update that touches
  // currentCardData.  This prevents the 1s poll from overwriting a
  // user's manual fixed_multiplier selection.
  const prevCardRefUidRef = React.useRef<string | undefined>();

  // Reset interval state when navigating to a different card.
  // Uses latestSession (derived immediately from sessions via useMemo) instead
  // of currentCardData, because currentCardData is updated asynchronously by
  // useCurrentCardData's effect and is stale during the first render after
  // a card change. Using stale currentCardData would copy the PREVIOUS card's
  // fixed_multiplier into the new card, and the cardChanged guard would
  // prevent correction on the subsequent render.
  React.useEffect(() => {
    const cardChanged = prevCardRefUidRef.current !== currentCardRefUid;
    prevCardRefUidRef.current = currentCardRefUid;

    if (!latestSession) return;

    if (!cardChanged) return;

    const algo = latestSession.algorithm as SchedulingAlgorithm | undefined;

    if (isFixedTimeAlgorithm(algo)) {
      setFixed_multiplier(latestSession.fixed_multiplier || 3);
      setFixed_unit((latestSession as any).fixed_unit || FixedTimeUnit.DAYS);
    } else {
      setFixed_multiplier(3);
      setFixed_unit(FixedTimeUnit.DAYS);
    }
  }, [latestSession, currentCardRefUid]);

  const isNew = currentCardData && 'isNew' in currentCardData && currentCardData.isNew;

  // Normal card block data — same hook used for LBL children.
  // Parent card structural data (childrenUids, breadcrumbs) — always
  // the X-axis entry.  Separate from activeCard below.
  const { blockInfo } = useBlockInfo({ refUid: currentCardRefUid, refreshKey: interaction });
  const hasBlockChildrenUids = !!blockInfo.childrenUids && !!blockInfo.childrenUids.length;

  const [showSettings, setShowSettings] = React.useState(false);

  // LBL mode check: interaction is LBL and card has child blocks
  const isLBLReview = isLBLReviewMode(interaction) && hasBlockChildrenUids;
  const isLineByLineActive = isLBLReview;

  const childUidsList = React.useMemo(() => blockInfo.childrenUids || [], [blockInfo.childrenUids]);
  const childSessionData = React.useMemo(
    () => deriveChildSessionMap({ childUidsList, facts: facts.latestByUid }),
    [childUidsList, facts.latestByUid]
  );
  // Fetch child sessions for the current LBL card.
  // ensureLatestSessions merges fetched data into facts.latestByUid internally.
  // The merge is additive (keyed by uid) so stale responses for old card's
  // children just add harmless extra data — they don't overwrite the new card's
  // child sessions (which have different uids).  No cancellation needed.
  React.useEffect(() => {
    if (!isLineByLineActive || !childUidsList.length) {
      return;
    }
    ensureLatestSessions(childUidsList);
  }, [isLineByLineActive, childUidsList, ensureLatestSessions]);

  // setShowAnswers must exist before useLineByLineReview.
  // activeCard is created after the hook — the ref bridges the gap.
  const activeSetShowAnswersRef = React.useRef<(show: boolean) => void>(() => {});
  const setShowAnswers = React.useCallback((show: boolean) => {
    activeSetShowAnswersRef.current(show);
  }, []);

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
    reviewUnit,
    forgotReinsertOffset,
    lblNextReinsertOffset,
    currentPrimaryEntryId,
    interaction,
    setShowAnswers,
  });

  useAutoCollapseBlocks({
    enabled: autoCollapseBlocks,
    currentCardRefUid,
    isLineByLineActive,
    childUidsList,
  });

  // There is only ONE kind of card.  One data source.
  // Both latestSession and childSessionData[uid] are facts.latestByUid[uid].
  const activeUid =
    isLineByLineActive && !lineByLineIsCardComplete ? currentChildUid : currentCardRefUid;
  const activeSession = activeUid ? facts.latestByUid[activeUid] : undefined;
  // LBL children without their own session inherit the parent's algorithm
  // so the UI shows the correct grade buttons (SM2 → Good/Hard, etc.)
  const activeCard = useCardBlock(
    activeUid,
    activeSession,
    isLineByLineActive ? algorithm : undefined
  );
  activeSetShowAnswersRef.current = activeCard.setShowAnswers;
  const { showAnswers } = activeCard;

  // Resolve the visible learning unit once and derive all user-facing state from it.
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
    if (!currentCardData) return null;
    return getReviewStatus({
      session: currentReviewSession,
      isNew: Boolean(!isLineByLineActive && isNew),
      now: new Date(),
    });
  }, [currentCardData, currentReviewSession, isLineByLineActive, isNew]);

  const isLearned = React.useMemo(() => {
    return isSessionMastered(currentReviewSession, new Date());
  }, [currentReviewSession]);

  // LBL mode: resolve base from child session; Normal mode: use parent's baseCardData.
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

  const onTagChange = async (tag) => {
    handleMemoTagChange(tag);
    setIsCramming(false);

    await asyncUtils.sleep(200);

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement?.blur();
    }
  };

  const onPracticeClick = React.useCallback(
    (gradeData) => {
      if (isLineByLineActive && !lineByLineIsCardComplete) {
        onLineByLineGrade(gradeData.sm2_grade);
        return;
      }

      if (isLineByLineActive && lineByLineIsCardComplete) {
        navigateToNextUnpracticed();
        return;
      }

      if (!currentCardRefUid) return;

      void reviewUnit({
        targetUid: currentCardRefUid,
        grade: gradeData.sm2_grade,
        algorithm,
        interaction,
        forgotReinsertOffset,
        currentPrimaryEntryId,
        baseCardData,
        currentCardData,
        ...(isFixedTimeAlgorithm(algorithm) && { fixed_multiplier, fixed_unit }),
        setShowAnswers,
      });
    },
    [
      algorithm,
      interaction,
      fixed_multiplier,
      fixed_unit,
      currentCardRefUid,
      forgotReinsertOffset,
      isLineByLineActive,
      lineByLineIsCardComplete,
      onLineByLineGrade,
      currentPrimaryEntryId,
      baseCardData,
      currentCardData,
      navigateToNextUnpracticed,
      reviewUnit,
      setShowAnswers,
    ]
  );

  const onNextClick = React.useCallback(() => {
    focusPrimaryByOffset(1);
  }, [focusPrimaryByOffset]);

  const onPrevClick = React.useCallback(() => {
    focusPrimaryByOffset(-1);
  }, [focusPrimaryByOffset]);

  const onStartCrammingClick = () => {
    setIsCramming(true);
    setFocusedPrimaryUid(undefined);
    resetChildViewState();
  };

  // Undo is a CARD operation, not a queue operation.
  // Per architecture: "Card is the atom. It does not know which queue
  // it sits in."  undoCardSession only touches Roam data blocks.
  // upsertLatestSessions then syncs the rolled-back session into facts.
  // Queue and currentIndex are never touched.
  const onUndoLearning = React.useCallback(async () => {
    if (!currentCardRefUid) return;
    const undoRefUid =
      isLineByLineActive && !lineByLineIsCardComplete
        ? childUidsList[lineByLineCurrentChildIndex]
        : currentCardRefUid;
    if (!undoRefUid) return;

    const freshData = await undoCardSession({
      targetUid: undoRefUid,
      parentUid: isLineByLineActive && !lineByLineIsCardComplete ? currentCardRefUid : undefined,
      childUidsList: isLineByLineActive ? childUidsList : undefined,
      dataPageTitle,
    });
    if (Object.keys(freshData).length) {
      upsertLatestSessions(freshData);
    }
    setShowAnswers(false);
  }, [
    currentCardRefUid,
    isLineByLineActive,
    lineByLineIsCardComplete,
    childUidsList,
    lineByLineCurrentChildIndex,
    dataPageTitle,
    upsertLatestSessions,
    setShowAnswers,
  ]);

  const toggleBreadcrumbs = React.useCallback(() => {
    updateSetting('showBreadcrumbs', !showBreadcrumbs);
  }, [showBreadcrumbs, updateSetting]);

  const handleApplyAndClose = React.useCallback(
    (formSettings: import('~/components/SettingsForm').SettingsFormSettings) => {
      (
        Object.keys(
          formSettings
        ) as (keyof import('~/components/SettingsForm').SettingsFormSettings)[]
      ).forEach((key) => {
        updateSetting(key, formSettings[key]);
      });
      setShowSettings(false);
      resetToFirstUnpracticed();
      fetchPracticeData();
    },
    [updateSetting, resetToFirstUnpracticed, fetchPracticeData]
  );

  usePracticeOverlayHotkeys({ onToggleBreadcrumbs: toggleBreadcrumbs });

  // Detect editing state and adjust bottom spacing
  const [isEditing, setIsEditing] = React.useState(false);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      // Check if the focused element is an input/textarea
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        setIsEditing(true);
      }
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // Small delay to check if another input gets focus
        // Unmount guard: prevent state updates after component unmount
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

        await updateReviewConfigAction({
          targetUid: childUid,
          isChild: true,
          algorithm: newAlgorithm,
          interaction,
          childSessionData,
          applyOptimisticCardMeta,
          cardMeta,
        });
        // Reset showAnswers so the new algorithm's default behavior
        // (e.g. SM2 hides answer, Progressive auto-shows) takes effect.
        setShowAnswers(false);
        return;
      }

      if (!interaction) throw new Error('interaction is undefined in onSelectAlgorithm');

      await updateReviewConfigAction({
        targetUid: currentCardRefUid,
        isChild: false,
        algorithm: newAlgorithm,
        interaction,
        applyOptimisticCardMeta,
        cardMeta,
      });
    },
    [
      currentCardRefUid,
      cardMeta,
      applyOptimisticCardMeta,
      interaction,
      isLineByLineActive,
      lineByLineIsCardComplete,
      childUidsList,
      lineByLineCurrentChildIndex,
      childSessionData,
      updateReviewConfigAction,
      setShowAnswers,
    ]
  );

  const onSelectInteraction = React.useCallback(
    async (newInteraction: InteractionStyle) => {
      if (!currentCardRefUid) return;
      if (!algorithm) throw new Error('algorithm is undefined in onSelectInteraction');

      await updateReviewConfigAction({
        targetUid: currentCardRefUid,
        isChild: false,
        algorithm,
        interaction: newInteraction,
        applyOptimisticCardMeta,
        cardMeta,
      });
    },
    [currentCardRefUid, cardMeta, applyOptimisticCardMeta, algorithm, updateReviewConfigAction]
  );

  const algorithmContextValue = React.useMemo(
    () => ({
      algorithm,
      interaction,
      onSelectAlgorithm,
      onSelectInteraction,
    }),
    [algorithm, interaction, onSelectAlgorithm, onSelectInteraction]
  );

  // useMemo: stable reference to prevent unnecessary re-renders in MainContext consumers
  const mainContextValue = React.useMemo(
    () => ({
      fixed_multiplier,
      setFixed_multiplier,
      fixed_unit,
      setFixed_unit,
      onPracticeClick,
      currentIndex,
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
    }),
    [
      fixed_multiplier,
      setFixed_multiplier,
      fixed_unit,
      setFixed_unit,
      onPracticeClick,
      currentIndex,
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
    ]
  );

  if (!tagCardSets[selectedTag]) {
    return null;
  }

  return (
    <PracticeSessionContext.Provider value={sessionContext}>
      <AlgorithmProvider {...algorithmContextValue}>
        <MainContext.Provider value={mainContextValue}>
          <style>{MOBILE_OVERLAY_STYLES}</style>
          <Dialog
            $isEditing={isEditing}
            $algorithm={isLineByLineActive ? activeCard.algorithm : algorithm}
            $showModeBorders={showModeBorders}
            isOpen={isOpen}
            onClose={onCloseCallback}
            className="pb-0"
            canEscapeKeyClose={true}
          >
            <Header
              className="bp3-dialog-header outline-none focus:outline-none focus-visible:outline-none"
              onCloseCallback={onCloseCallback}
              onTagChange={onTagChange}
              status={reviewStatus}
              isDone={isDone}
              nextDueDate={currentReviewSession?.nextDueDate}
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
                      autoCollapseBlocks={autoCollapseBlocks}
                      showAnswers={showAnswers}
                      currentChildAlgorithm={activeCard.algorithm}
                      dueChildCount={dueChildCount}
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
                <div
                  data-testid="practice-overlay-done-state"
                  className="flex items-center flex-col"
                >
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
            {/* LBL showAnswers unified: internal showAnswers state controls both CardBlock and Footer.
            lineByLineRevealedCount only controls LineByLineView row rendering range. */}
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
              onCloseCallback={onCloseCallback}
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
      </AlgorithmProvider>
    </PracticeSessionContext.Provider>
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

  /* Full-screen on mobile */
  @media (max-width: 768px) {
    max-height: 100dvh;
    width: 100vw;
    height: 100dvh;
    margin: 0;
    border-radius: 0;
    /* Adapt to browser bottom toolbar using safe-area-inset-bottom */
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
`;

// Static CSS constant: independent of component state, avoids regeneration on every render
const MOBILE_OVERLAY_STYLES = `
  @media (max-width: 768px) {
    /* Mobile: Make backdrop transparent and clickable-through */
    .bp3-overlay.bp3-overlay-open > .bp3-overlay-backdrop {
      opacity: 0 !important;
      background: transparent !important;
      pointer-events: none !important;
    }

    /* Overlay itself doesn't block clicks */
    .bp3-overlay.bp3-overlay-open {
      pointer-events: none !important;
    }

    /* Dialog content remains interactive */
    .bp3-overlay.bp3-overlay-open .bp3-dialog-container,
    .bp3-overlay.bp3-overlay-open .bp3-dialog,
    .bp3-overlay.bp3-overlay-open [role="dialog"],
    .bp3-overlay.bp3-overlay-open .bp3-dialog * {
      pointer-events: auto !important;
    }

    /* Internal menus remain clickable */
    .bp3-overlay.bp3-overlay-open .bp3-popover,
    .bp3-overlay.bp3-overlay-open .bp3-popover * {
      pointer-events: auto !important;
    }

    /* Full-screen positioning - must override Blueprint defaults */
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
  overflow-x: hidden; // because of tweaks we do in ContentWrapper container overflows
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
