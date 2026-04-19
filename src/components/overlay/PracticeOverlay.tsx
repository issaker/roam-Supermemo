/**
 * PracticeOverlay Component
 *
 * Main review interface — displays cards one at a time and handles grading.
 *
 * Architecture:
 * - Receives practice data, settings, and callbacks as props from App
 * - useCurrentCardData derives card state from the session history (no polling)
 * - MainContext provides shared state (algorithm, interaction, fixed_multiplier editor state, etc.) to child components
 * - Footer handles grading buttons and keyboard shortcuts
 * - CardBlock renders the actual Roam block content
 *
 * Settings flow:
 * - All settings come from useSettings via App props (single source of truth)
 * - updateSetting is used to change settings, which handles extensionAPI + debounced page sync
 * - Settings dialog uses formSettings for responsive form state, commits via updateSetting
 */
import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import styled from '@emotion/styled';
import useBlockInfo from '~/hooks/useBlockInfo';
import * as asyncUtils from '~/utils/async';
import * as dateUtils from '~/utils/date';
import * as stringUtils from '~/utils/string';
import Lottie from 'react-lottie';
import doneAnimationData from '~/lotties/done.json';
import mediaQueries from '~/utils/mediaQueries';

import CardBlock from '~/components/overlay/CardBlock';
import Footer from '~/components/overlay/Footer';
import Header from '~/components/overlay/Header';
import LineByLineView from '~/components/overlay/LineByLineView';
import SettingsDialog from '~/components/overlay/SettingsDialog';
import {
  Session,
  isFixedAlgorithm,
  isLBLReviewMode,
  SchedulingAlgorithm,
  InteractionStyle,
  ALGORITHM_META,
  getDefaultIntervalMultiplier,
} from '~/models/session';
import useLineByLineReview, { shouldReinsertLblCard } from '~/hooks/useLineByLineReview';
export { shouldReinsertLblCard };
import useCurrentCardData from '~/hooks/useCurrentCardData';
import { generateNewSession, updateReviewConfig } from '~/queries';

import { generatePracticeData } from '~/practice';
import { CompletionStatus, RenderMode } from '~/models/practice';
import { handlePracticeProps } from '~/app';
import { colors } from '~/theme';
import { usePracticeSession, PracticeSessionContext } from '~/contexts/PracticeSessionContext';

interface MainContextProps {
  intervalMultiplier: number;
  setIntervalMultiplier: (multiplier: number) => void;
  onPracticeClick: (props: handlePracticeProps) => void;
  currentIndex: number;
  renderMode: RenderMode;
  isLineByLine: boolean;
  lineByLineCurrentIndex: number;
  lineByLineTotal: number;
  cardMeta: import('~/models/session').CardMeta | undefined;
  baseCardData: Session | undefined;
}

export const MainContext = React.createContext<MainContextProps>({} as MainContextProps);

interface Props {
  isOpen: boolean;
  onCloseCallback: () => void;
  onRestartCallback: () => void;
}

const PracticeOverlay = ({
  isOpen,
  onCloseCallback,
  onRestartCallback,
}: Props) => {
  const sessionContext = usePracticeSession();
  const {
    settings,
    practiceData,
    today,
    selectedTag,
    isCramming,
    setIsCramming,
    handlePracticeClick,
    handleMemoTagChange,
    fetchPracticeData,
    dataPageTitle,
    updateSetting,
  } = sessionContext;

  const {
    rtlEnabled,
    forgotReinsertOffset,
    lblNextReinsertOffset,
    showBreadcrumbs,
    showModeBorders,
  } = settings;
  const todaySelectedTag = today.tags[selectedTag];

  const newCardsUids = todaySelectedTag?.newUids || [];
  const dueCardsUids = todaySelectedTag?.dueUids || [];
  const initialCardUids = [...dueCardsUids, ...newCardsUids];
  const renderMode = todaySelectedTag?.renderMode;

  const [cardQueue, setCardQueue] = React.useState<string[]>(initialCardUids);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [sessionOverrides, setSessionOverrides] = React.useState<Record<string, Session>>({});

  const baseSessionDataMap = React.useRef<Record<string, Session>>({});

  React.useEffect(() => {
    const map: Record<string, Session> = {};
    for (const [uid, session] of Object.entries(practiceData)) {
      if ((session as Session).baseSessionData) {
        map[uid] = (session as Session).baseSessionData!;
      }
    }
    baseSessionDataMap.current = map;
  }, [practiceData]);

  const isFirst = currentIndex === 0;

  const currentCardRefUid = cardQueue[currentIndex] as string | undefined;
  const sessions = React.useMemo(() => {
    const currentSession = currentCardRefUid ? practiceData[currentCardRefUid] : undefined;
    const sessionOverride = currentCardRefUid ? sessionOverrides[currentCardRefUid] : undefined;
    const effectiveSession = sessionOverride || currentSession;
    return effectiveSession ? [effectiveSession] : [];
  }, [currentCardRefUid, practiceData, sessionOverrides]);
  const { currentCardData, cardMeta, algorithm, interaction, latestSession, applyOptimisticCardMeta } =
    useCurrentCardData({
      currentCardRefUid,
      sessions,
    });

  const totalCardsCount = (todaySelectedTag?.new || 0) + (todaySelectedTag?.due || 0);
  const hasCards = totalCardsCount > 0;

  const [intervalMultiplier, setIntervalMultiplier] = React.useState<number>(
    currentCardData?.fixed_multiplier || currentCardData?.progressive_interval || getDefaultIntervalMultiplier(algorithm)
  );

  const isDone = todaySelectedTag?.status === CompletionStatus.Finished || !currentCardData;

  const baseCardData = React.useMemo(() => {
    if (!currentCardRefUid) return currentCardData;
    const isForgotReReview = currentCardData?.sm2_grade === 0;
    if (baseSessionDataMap.current[currentCardRefUid] && !isForgotReReview) {
      return { ...generateNewSession(), ...baseSessionDataMap.current[currentCardRefUid] };
    }
    return practiceData[currentCardRefUid] || currentCardData;
  }, [currentCardRefUid, practiceData, currentCardData]);

  // Track previous card UID so the interval state is only initialised
  // when the card changes — not on every polling update that touches
  // currentCardData.  This prevents the 1s poll from overwriting a
  // user's manual intervalMultiplier selection.
  const prevCardRefUidRef = React.useRef<string | undefined>();

  // Reset interval state when navigating to a different card.
  // Uses latestSession (derived immediately from sessions via useMemo) instead
  // of currentCardData, because currentCardData is updated asynchronously by
  // useCurrentCardData's effect and is stale during the first render after
  // a card change. Using stale currentCardData would copy the PREVIOUS card's
  // intervalMultiplier into the new card, and the cardChanged guard would
  // prevent correction on the subsequent render.
  React.useEffect(() => {
    const cardChanged = prevCardRefUidRef.current !== currentCardRefUid;
    prevCardRefUidRef.current = currentCardRefUid;

    if (!latestSession) return;

    if (!cardChanged) return;

    const algo = latestSession.algorithm as SchedulingAlgorithm | undefined;

    if (algo === SchedulingAlgorithm.PROGRESSIVE) {
      setIntervalMultiplier(latestSession.progressive_interval || getDefaultIntervalMultiplier(algo));
    } else if (isFixedAlgorithm(algo)) {
      setIntervalMultiplier(latestSession.fixed_multiplier || getDefaultIntervalMultiplier(algo));
    } else {
      setIntervalMultiplier(getDefaultIntervalMultiplier(algo));
    }
  }, [latestSession, currentCardRefUid]);

  const hasNextDueDate = currentCardData && 'nextDueDate' in currentCardData;
  const isNew = currentCardData && 'isNew' in currentCardData && currentCardData.isNew;
  const nextDueDate = hasNextDueDate ? currentCardData.nextDueDate : undefined;

  const isDueToday = dateUtils.daysBetween(nextDueDate, new Date()) === 0;
  const status = isNew ? 'new' : isDueToday ? 'dueToday' : hasNextDueDate ? 'pastDue' : null;

  const { blockInfo } = useBlockInfo({ refUid: currentCardRefUid });
  const hasBlockChildren = !!blockInfo.children && !!blockInfo.children.length;
  const hasBlockChildrenUids = !!blockInfo.childrenUids && !!blockInfo.childrenUids.length;

  const [showAnswers, setShowAnswers] = React.useState(false);
  const [hasCloze, setHasCloze] = React.useState(true);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showOverwriteReminder, setShowOverwriteReminder] = React.useState(false);

  React.useEffect(() => {
    if (showOverwriteReminder) {
      const timer = setTimeout(() => setShowOverwriteReminder(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [showOverwriteReminder]);

  // Reset hasCloze on card change to prevent stale state from previous card
  React.useEffect(() => {
    setHasCloze(true);
  }, [currentCardRefUid]);

  const shouldShowAnswerFirst =
    renderMode === RenderMode.AnswerFirst && hasBlockChildrenUids && !showAnswers;

  // LBL 模式判断：interaction 为 LBL 且卡片有子 block
  const isLBLReview = isLBLReviewMode(interaction) && hasBlockChildrenUids;

  // LBL 活跃状态（用于传递给 useLineByLineReview）
  const isLineByLineActive = isLBLReview;

  const childUidsList = React.useMemo(() => blockInfo.childrenUids || [], [blockInfo.childrenUids]);

  const {
    lineByLineRevealedCount,
    lineByLineCurrentChildIndex,
    lineByLineIsCardComplete,
    lineByLineProgress,
    onLineByLineGrade,
    onLineByLineShowAnswer,
  } = useLineByLineReview({
    currentCardRefUid,
    childUidsList,
    isLBLReviewMode: isLineByLineActive,
    isLBLReview,
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
    lineByLineProgressStr: currentCardData?.lbl_progress,
  });

  React.useEffect(() => {
    const effectiveInteraction = (latestSession?.interaction || interaction) as InteractionStyle | undefined;
    const effectiveAlgorithm = (latestSession?.algorithm || algorithm) as SchedulingAlgorithm | undefined;
    const effectiveIsLBL = isLBLReviewMode(effectiveInteraction) && hasBlockChildrenUids;
    const effectiveIsLblNext = effectiveIsLBL && isFixedAlgorithm(effectiveAlgorithm);

    if (effectiveIsLblNext) {
      setShowAnswers(true);
    } else if (effectiveIsLBL) {
      setShowAnswers(false);
    } else if (isFixedAlgorithm(effectiveAlgorithm)) {
      setShowAnswers(true);
    } else if (hasBlockChildren || hasCloze) {
      setShowAnswers(false);
    } else {
      setShowAnswers(true);
    }
  }, [hasBlockChildren, hasCloze, hasBlockChildrenUids, algorithm, interaction, currentCardRefUid, latestSession]);

  const onTagChange = async (tag) => {
    setCurrentIndex(0);
    handleMemoTagChange(tag);
    setIsCramming(false);

    // To prevent 'space' key event from triggering dropdown
    await asyncUtils.sleep(200);

    if (document.activeElement instanceof HTMLElement) {
      document?.activeElement.blur();
    }
  };

  React.useEffect(() => {
    setCardQueue(initialCardUids);
    setCurrentIndex(0);
  }, [selectedTag]);

  // When today data loads and initialCardUids becomes available, sync cardQueue
  const initialCardUidsLengthRef = React.useRef(initialCardUids.length);
  React.useEffect(() => {
    const wasEmpty = initialCardUidsLengthRef.current === 0;
    const nowHasCards = initialCardUids.length > 0;
    initialCardUidsLengthRef.current = initialCardUids.length;

    if (wasEmpty && nowHasCards) {
      setCardQueue(initialCardUids);
      setCurrentIndex(0);
    }
  }, [todaySelectedTag]);

  const onPracticeClick = React.useCallback(
    (gradeData) => {
      if (isDone) return;

      if (isLineByLineActive && !lineByLineIsCardComplete) {
        onLineByLineGrade(gradeData.sm2_grade);
        return;
      }

      const isForgotReReview = currentCardData?.sm2_grade === 0;
      const baseData = (currentCardRefUid && baseSessionDataMap.current[currentCardRefUid] && !isForgotReReview)
        ? { ...generateNewSession(), ...baseSessionDataMap.current[currentCardRefUid] }
        : (currentCardRefUid ? practiceData[currentCardRefUid] : currentCardData) || currentCardData;

      const practiceProps = {
        ...baseData,
        ...gradeData,
        fixed_multiplier: intervalMultiplier,
        algorithm,
        interaction,
      };

      const isReScoring = currentCardData?.dateCreated
        && dateUtils.isSameDay(currentCardData.dateCreated, new Date())
        && currentCardData.sm2_grade !== 0;
      if (isReScoring) {
        setShowOverwriteReminder(true);
      }

      if (!isCramming && currentCardRefUid) {
        const now = new Date();
        const optimisticSession = generatePracticeData({
          ...practiceProps,
          dateCreated: now,
        });

        setSessionOverrides((prev) => ({
          ...prev,
          [currentCardRefUid]: {
            ...baseData,
            ...optimisticSession,
            dateCreated: now,
          },
        }));
      }

      handlePracticeClick(practiceProps);
      setShowAnswers(false);

      const isForgot = gradeData.sm2_grade === 0;
      const insertIndex = currentIndex + 1 + forgotReinsertOffset;

      if (isForgot && forgotReinsertOffset > 0 && currentCardRefUid) {
        setCardQueue((prev) => {
          const newQueue = [...prev];
          const targetIndex = Math.min(insertIndex, newQueue.length);
          newQueue.splice(targetIndex, 0, currentCardRefUid);
          return newQueue;
        });
      }

      setCurrentIndex((prev) => prev + 1);
    },
    [
      handlePracticeClick,
      isDone,
      practiceData,
      currentCardData,
      algorithm,
      interaction,
      intervalMultiplier,
      currentCardRefUid,
      forgotReinsertOffset,
      isCramming,
      isLineByLineActive,
      lineByLineIsCardComplete,
      onLineByLineGrade,
    ]
  );

  const onSkipClick = React.useCallback(() => {
    if (isDone) return;
    setCurrentIndex((prev) => prev + 1);
  }, [isDone]);

  const onPrevClick = React.useCallback(() => {
    if (isFirst) return;
    setCurrentIndex((prev) => prev - 1);
  }, [isFirst]);

  const onStartCrammingClick = () => {
    setIsCramming(true);
    setCurrentIndex(0);
  };

  const lottieAnimationOption = {
    loop: true,
    autoplay: true,
    animationData: doneAnimationData,
    rendererSettings: {
      preserveAspectRatio: 'xMidYMid meet',
    },
  };
  const lottieStyle = {
    height: 150,
    width: 'auto',
    maxHeight: '40vh',
  };

  const toggleBreadcrumbs = React.useCallback(() => {
    updateSetting('showBreadcrumbs', !showBreadcrumbs);
  }, [showBreadcrumbs, updateSetting]);

  const handleApplyAndClose = React.useCallback((formSettings: import('~/components/SettingsForm').SettingsFormSettings) => {
    (Object.keys(formSettings) as (keyof import('~/components/SettingsForm').SettingsFormSettings)[]).forEach((key) => {
      updateSetting(key, formSettings[key]);
    });
    setShowSettings(false);
    onRestartCallback();
  }, [updateSetting, onRestartCallback]);

  const hotkeys = React.useMemo(
    () => [
      {
        combo: 'B',
        global: true,
        label: 'Show BreadCrumbs',
        onKeyDown: toggleBreadcrumbs,
      },
    ],
    [showBreadcrumbs]
  );
  Blueprint.useHotkeys(hotkeys);

  // Detect editing state and adjust bottom spacing
  const [isEditing, setIsEditing] = React.useState(false);

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
        setTimeout(() => {
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
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isOpen]);

  const onSelectAlgorithm = React.useCallback(
    async (newAlgorithm: SchedulingAlgorithm) => {
      if (!currentCardRefUid) return;

      const currentInteraction = interaction || InteractionStyle.NORMAL;

      setSessionOverrides((prev) => ({
        ...prev,
        [currentCardRefUid]: {
          ...currentCardData,
          algorithm: newAlgorithm,
          interaction: currentInteraction,
        },
      }));

      applyOptimisticCardMeta({
        ...cardMeta,
        algorithm: newAlgorithm,
        interaction: currentInteraction,
      });

      await updateReviewConfig({
        refUid: currentCardRefUid,
        dataPageTitle,
        algorithm: newAlgorithm,
        interaction: currentInteraction,
      });

      fetchPracticeData();
    },
    [
      currentCardRefUid,
      dataPageTitle,
      cardMeta,
      currentCardData,
      applyOptimisticCardMeta,
      fetchPracticeData,
      interaction,
    ]
  );

  const onSelectInteraction = React.useCallback(
    async (newInteraction: InteractionStyle) => {
      if (!currentCardRefUid) return;

      const currentAlgorithm = algorithm || SchedulingAlgorithm.SM2;

      setSessionOverrides((prev) => ({
        ...prev,
        [currentCardRefUid]: {
          ...currentCardData,
          algorithm: currentAlgorithm,
          interaction: newInteraction,
        },
      }));

      applyOptimisticCardMeta({
        ...cardMeta,
        algorithm: currentAlgorithm,
        interaction: newInteraction,
      });

      await updateReviewConfig({
        refUid: currentCardRefUid,
        dataPageTitle,
        algorithm: currentAlgorithm,
        interaction: newInteraction,
      });

      fetchPracticeData();
    },
    [
      currentCardRefUid,
      dataPageTitle,
      cardMeta,
      currentCardData,
      applyOptimisticCardMeta,
      fetchPracticeData,
      algorithm,
    ]
  );

  if (!todaySelectedTag) {
    return null;
  }

  return (
    <PracticeSessionContext.Provider
      value={{
        ...sessionContext,
        algorithm,
        interaction,
        onSelectAlgorithm,
        onSelectInteraction,
      }}
    >
    <MainContext.Provider
      value={{
        intervalMultiplier,
        setIntervalMultiplier,
        onPracticeClick,
        currentIndex,
        renderMode,
        isLineByLine: isLineByLineActive,
        lineByLineCurrentIndex: isLineByLineActive ? lineByLineCurrentChildIndex + 1 : 0,
        lineByLineTotal: isLineByLineActive ? childUidsList.length : 0,
        cardMeta,
        baseCardData,
      }}
    >
      <style>{mobileOverlayStyles()}</style>
      <Dialog
        $isEditing={isEditing}
        $algorithm={algorithm}
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
          status={status}
          isDone={isDone}
          nextDueDate={nextDueDate}
          onToggleBreadcrumbs={toggleBreadcrumbs}
          onSettingsClick={() => setShowSettings(true)}
        />

        <DialogBody
          className="bp3-dialog-body overflow-y-scroll m-0 pt-6 pb-8 px-4"
          dir={rtlEnabled ? 'rtl' : undefined}
        >
          {currentCardRefUid ? (
            <>
              {isLineByLineActive && !lineByLineIsCardComplete ? (
                <LineByLineView
                  currentCardRefUid={currentCardRefUid}
                  childUidsList={childUidsList}
                  lineByLineRevealedCount={lineByLineRevealedCount}
                  lineByLineCurrentChildIndex={lineByLineCurrentChildIndex}
                  lineByLineProgress={lineByLineProgress}
                  setHasCloze={setHasCloze}
                  showBreadcrumbs={showBreadcrumbs}
                />
              ) : shouldShowAnswerFirst ? (
                blockInfo.childrenUids?.map((uid) => (
                  <CardBlock
                    key={uid}
                    refUid={uid}
                    showAnswers={showAnswers}
                    setHasCloze={setHasCloze}
                    breadcrumbs={blockInfo.breadcrumbs}
                    showBreadcrumbs={false}
                    onRenderComplete={() => {}}
                  />
                ))
              ) : (
                <CardBlock
                  refUid={currentCardRefUid}
                  showAnswers={showAnswers}
                  setHasCloze={setHasCloze}
                  breadcrumbs={blockInfo.breadcrumbs}
                  showBreadcrumbs={showBreadcrumbs}
                  onRenderComplete={() => {}}
                />
              )}
            </>
          ) : (
            <div data-testid="practice-overlay-done-state" className="flex items-center flex-col">
              <Lottie options={lottieAnimationOption} style={lottieStyle} />
              <div>
                You&apos;re all caught up! 🌟{' '}
                {todaySelectedTag.completed > 0
                  ? `Reviewed ${todaySelectedTag.completed} ${stringUtils.pluralize(
                      todaySelectedTag.completed,
                      'card',
                      'cards'
                    )} today.`
                  : ''}
              </div>
            </div>
          )}
        </DialogBody>
        {showOverwriteReminder && (
          <OverwriteReminder>今日已学习，此次学习将覆盖今日数据</OverwriteReminder>
        )}
        <Footer
          refUid={currentCardRefUid}
          onPracticeClick={onPracticeClick}
          onSkipClick={onSkipClick}
          onPrevClick={onPrevClick}
          setShowAnswers={
            isLineByLineActive && !lineByLineIsCardComplete ? onLineByLineShowAnswer : setShowAnswers
          }
          showAnswers={
            isLineByLineActive ? lineByLineRevealedCount > lineByLineCurrentChildIndex : showAnswers
          }
          isDone={isDone || lineByLineIsCardComplete}
          hasCards={hasCards}
          onCloseCallback={onCloseCallback}
          currentCardData={currentCardData}
          onStartCrammingClick={onStartCrammingClick}
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

  border: 2px solid
    ${({ $algorithm }) =>
      $algorithm && ALGORITHM_META[$algorithm]?.group === 'Spaced'
        ? colors.modeSpaced
        : $algorithm && ALGORITHM_META[$algorithm]?.group === 'Fixed'
        ? colors.modeFixed
        : colors.borderSubtle};
  border-color: ${({ $showModeBorders, $algorithm }) =>
    $showModeBorders === false
      ? colors.borderSubtle
      : $algorithm && ALGORITHM_META[$algorithm]?.group === 'Spaced'
      ? colors.modeSpaced
      : $algorithm && ALGORITHM_META[$algorithm]?.group === 'Fixed'
      ? colors.modeFixed
      : colors.borderSubtle};

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

const mobileOverlayStyles = () => `
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

const OverwriteReminder = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.75);
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  z-index: 100;
  animation: fadeInOut 2.5s ease-in-out;
  pointer-events: none;

  @keyframes fadeInOut {
    0% { opacity: 0; }
    15% { opacity: 1; }
    75% { opacity: 1; }
    100% { opacity: 0; }
  }
`;

export default PracticeOverlay;
