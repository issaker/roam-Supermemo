/**
 * PracticeOverlay Component
 *
 * Main review interface — displays cards one at a time and handles grading.
 *
 * Architecture:
 * - Receives practice data, settings, and callbacks as props from App
 * - useCurrentCardData derives card state from the session history (no polling)
 * - MainContext provides shared state (algorithm, interaction, fixed_multiplier/fixed_unit editor state, etc.) to child components
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
import mediaQueries from '~/utils/mediaQueries';

import CardBlock from '~/components/overlay/CardBlock';
import Footer from '~/components/overlay/Footer';
import Header from '~/components/overlay/Header';
import LineByLineView from '~/components/overlay/LineByLineView';
import SettingsDialog from '~/components/overlay/SettingsDialog';
import {
  Session,
  isFixedTimeAlgorithm,
  isGradingAlgorithm,
  isLBLReviewMode,
  isSessionMastered,
  getSessionAlgorithm,
  resolveBaseForCalculation,
  SchedulingAlgorithm,
  FixedTimeUnit,
  InteractionStyle,
} from '~/models/session';
import useLineByLineReview, { shouldReinsertLblCard } from '~/hooks/useLineByLineReview';
export { shouldReinsertLblCard };
import useAutoCollapseBlocks from '~/hooks/useAutoCollapseBlocks';
import useCurrentCardData from '~/hooks/useCurrentCardData';
import {
  generateNewSession,
  updateReviewConfig,
  getChildSessionData,
  undoLatestSession,
} from '~/queries';

import { generatePracticeData } from '~/practice';
import { CompletionStatus, RenderMode } from '~/models/practice';
import { handlePracticeProps } from '~/app';
import { colors, getAlgorithmColor } from '~/theme';
import { usePracticeSession, PracticeSessionContext } from '~/contexts/PracticeSessionContext';

/**
 * MainContext: shared state for the review overlay.
 *
 * Dual-queue architecture:
 * - Primary queue: ◀/▶ navigate between cards (cardQueue + currentIndex)
 * - Secondary queue (LBL): ▲/▼ navigate between child blocks (childUidsList + lineByLineCurrentChildIndex)
 * - onLineByLinePrev/onLineByLineNext are only available when isLineByLine is true
 * - Interaction mode (Normal/LBL) is a parent-level property only; InteractionSelector always shows parent's interaction
 */
interface MainContextProps {
  fixed_multiplier: number;
  setFixed_multiplier: (_multiplier: number) => void;
  fixed_unit: FixedTimeUnit;
  setFixed_unit: (_unit: FixedTimeUnit) => void;
  onPracticeClick: (_props: handlePracticeProps) => void;
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
  onRestartCallback: () => void;
}

const PracticeOverlay = ({ isOpen, onCloseCallback, onRestartCallback }: Props) => {
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
    dataPageTitle,
    updateSetting,
  } = sessionContext;

  const {
    rtlEnabled,
    forgotReinsertOffset,
    lblNextReinsertOffset,
    showBreadcrumbs,
    showModeBorders,
    autoCollapseBlocks,
  } = settings;
  const todaySelectedTag = today.tags[selectedTag];

  const initialCardUids = React.useMemo(() => {
    const newUids = todaySelectedTag?.newUids || [];
    const dueUids = todaySelectedTag?.dueUids || [];
    return [...dueUids, ...newUids];
  }, [todaySelectedTag]);
  const renderMode = todaySelectedTag?.renderMode;

  const [cardQueue, setCardQueue] = React.useState<string[]>(initialCardUids);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [sessionOverrides, setSessionOverrides] = React.useState<Record<string, Session>>({});

  const isFirst = currentIndex === 0;

  const currentCardRefUid = cardQueue[currentIndex] as string | undefined;
  const sessions = React.useMemo(() => {
    const currentSession = currentCardRefUid ? practiceData[currentCardRefUid] : undefined;
    const sessionOverride = currentCardRefUid ? sessionOverrides[currentCardRefUid] : undefined;
    const effectiveSession = sessionOverride || currentSession;
    return effectiveSession ? [effectiveSession] : [];
  }, [currentCardRefUid, practiceData, sessionOverrides]);
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

  const totalCardsCount = (todaySelectedTag?.new || 0) + (todaySelectedTag?.due || 0);
  const hasCards = totalCardsCount > 0;

  const [fixed_multiplier, setFixed_multiplier] = React.useState<number>(
    isFixedTimeAlgorithm(algorithm) ? currentCardData?.fixed_multiplier || 3 : 3
  );
  const [fixed_unit, setFixed_unit] = React.useState<FixedTimeUnit>(
    currentCardData?.fixed_unit || FixedTimeUnit.DAYS
  );

  const isDone = todaySelectedTag?.status === CompletionStatus.Finished || !currentCardData;

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

  const hasNextDueDate = currentCardData && 'nextDueDate' in currentCardData;
  const isNew = currentCardData && 'isNew' in currentCardData && currentCardData.isNew;
  const nextDueDate = hasNextDueDate ? currentCardData.nextDueDate : undefined;

  const isDueToday = nextDueDate ? dateUtils.daysBetween(nextDueDate, new Date()) === 0 : false;
  const status = isNew ? 'new' : isDueToday ? 'dueToday' : hasNextDueDate ? 'pastDue' : null;

  const { blockInfo } = useBlockInfo({ refUid: currentCardRefUid, refreshKey: interaction });
  const hasBlockChildren = !!blockInfo.children && !!blockInfo.children.length;
  const hasBlockChildrenUids = !!blockInfo.childrenUids && !!blockInfo.childrenUids.length;

  const [showAnswers, setShowAnswers] = React.useState(false);
  const [hasCloze, setHasCloze] = React.useState(true);
  const [showSettings, setShowSettings] = React.useState(false);

  // Reset hasCloze on card change to prevent stale state from previous card
  React.useEffect(() => {
    setHasCloze(true);
  }, [currentCardRefUid]);

  const shouldShowAnswerFirst =
    renderMode === RenderMode.AnswerFirst && hasBlockChildrenUids && !showAnswers;

  // LBL mode check: interaction is LBL and card has child blocks
  const isLBLReview = isLBLReviewMode(interaction) && hasBlockChildrenUids;

  // LBL active state (passed to useLineByLineReview)
  const isLineByLineActive = isLBLReview;

  const childUidsList = React.useMemo(() => blockInfo.childrenUids || [], [blockInfo.childrenUids]);
  const childSessionScopeKey = React.useMemo(
    () => `${currentCardRefUid || 'none'}::${currentIndex}::${childUidsList.join(',')}`,
    [currentCardRefUid, currentIndex, childUidsList]
  );

  const [childSessionData, setChildSessionData] = React.useState<Record<string, Session>>({});
  const [isChildSessionLoading, setIsChildSessionLoading] = React.useState(false);
  const [loadedChildSessionScopeKey, setLoadedChildSessionScopeKey] = React.useState<string | null>(
    null
  );
  const childSessionDataRef = React.useRef<Record<string, Session>>({});
  React.useEffect(() => {
    childSessionDataRef.current = childSessionData;
  }, [childSessionData]);
  const [childHasBlockChildren, setChildHasBlockChildren] = React.useState(false);
  const [childHasCloze, setChildHasCloze] = React.useState(false);

  React.useEffect(() => {
    if (!isLineByLineActive || !childUidsList.length || !dataPageTitle) {
      setChildSessionData({});
      setIsChildSessionLoading(false);
      setLoadedChildSessionScopeKey(null);
      return;
    }
    let cancelled = false;
    setChildSessionData({});
    setIsChildSessionLoading(true);
    setLoadedChildSessionScopeKey(null);
    getChildSessionData({ childUids: childUidsList, dataPageTitle })
      .then((data) => {
        if (!cancelled) {
          const mergedChildSessions = {
            ...(data as Record<string, Session>),
            ...childUidsList.reduce((acc, uid) => {
              if (sessionOverrides[uid]) {
                acc[uid] = sessionOverrides[uid];
              }
              return acc;
            }, {} as Record<string, Session>),
          };
          setChildSessionData(mergedChildSessions);
          setIsChildSessionLoading(false);
          setLoadedChildSessionScopeKey(childSessionScopeKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsChildSessionLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    isLineByLineActive,
    childUidsList,
    dataPageTitle,
    currentCardRefUid,
    currentIndex,
    sessionOverrides,
    childSessionScopeKey,
  ]);

  const {
    lineByLineRevealedCount,
    lineByLineCurrentChildIndex,
    lineByLineIsCardComplete,
    dueChildCount,
    onLineByLineGrade,
    onLineByLineShowAnswer,
    onLineByLinePrev,
    onLineByLineNext,
    currentChildAlgorithm,
    currentChildIsLblNext,
  } = useLineByLineReview({
    currentCardRefUid,
    childUidsList,
    isLBLReviewMode: isLineByLineActive,
    hasLoadedChildSessionsForCurrentCard:
      loadedChildSessionScopeKey === childSessionScopeKey && !isChildSessionLoading,
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
  });

  useAutoCollapseBlocks({
    enabled: autoCollapseBlocks,
    currentCardRefUid,
    isLineByLineActive,
    childUidsList,
  });

  // isLearned: whether the current card (or LBL child) has been learned/mastered.
  // Based on `isSessionMastered` (i.e., `nextDueDate > now`), which unifies the
  // learning status judgment for both Normal and LBL child cards.
  // Replaces the old `isSameDay(dateCreated) && sm2_grade !== 0` check.
  const isLearned = React.useMemo(() => {
    if (isDone) return false;
    const now = new Date();
    if (isLineByLineActive && !lineByLineIsCardComplete) {
      const currentChildUid = childUidsList[lineByLineCurrentChildIndex];
      const childSession = currentChildUid ? childSessionData[currentChildUid] : undefined;
      return isSessionMastered(childSession, now);
    }
    return isSessionMastered(currentCardData, now);
  }, [
    isDone,
    isLineByLineActive,
    lineByLineIsCardComplete,
    childUidsList,
    lineByLineCurrentChildIndex,
    childSessionData,
    currentCardData,
  ]);

  // LBL mode: resolve base from child session; Normal mode: use parent's baseCardData.
  // Algorithm is overridden to the child's actual algorithm (may differ from parent).
  const effectiveBaseCardData = React.useMemo(() => {
    if (!isLineByLineActive) return baseCardData;
    const currentChildUid = childUidsList[lineByLineCurrentChildIndex];
    if (!currentChildUid) return baseCardData;
    const childSession = childSessionData[currentChildUid];
    if (childSession) {
      const resolvedBase = resolveBaseForCalculation(childSession);
      return { ...resolvedBase, algorithm: getSessionAlgorithm(childSession, algorithm) };
    }
    return generateNewSession({ algorithm });
  }, [
    isLineByLineActive,
    baseCardData,
    childUidsList,
    lineByLineCurrentChildIndex,
    childSessionData,
    algorithm,
  ]);

  React.useEffect(() => {
    const effectiveInteraction = (latestSession?.interaction || interaction) as
      | InteractionStyle
      | undefined;
    const effectiveIsLBL = isLBLReviewMode(effectiveInteraction) && hasBlockChildrenUids;

    if (effectiveIsLBL) {
      if (lineByLineIsCardComplete) {
        setShowAnswers(true);
      } else {
        const currentChildUid = childUidsList[lineByLineCurrentChildIndex];
        const childSession = currentChildUid ? childSessionData[currentChildUid] : undefined;
        const isChildMastered = isSessionMastered(childSession);

        if (isChildMastered) {
          setShowAnswers(true);
        } else if (currentChildIsLblNext) {
          setShowAnswers(true);
        } else if (childHasBlockChildren || childHasCloze) {
          setShowAnswers(false);
        } else {
          setShowAnswers(true);
        }
      }
    } else if (!isGradingAlgorithm(algorithm)) {
      setShowAnswers(true);
    } else if (hasBlockChildren || hasCloze) {
      setShowAnswers(false);
    } else {
      setShowAnswers(true);
    }
  }, [
    hasBlockChildren,
    hasCloze,
    hasBlockChildrenUids,
    algorithm,
    interaction,
    currentCardRefUid,
    latestSession,
    currentChildIsLblNext,
    lineByLineCurrentChildIndex,
    childSessionData,
    childUidsList,
    lineByLineIsCardComplete,
    childHasBlockChildren,
    childHasCloze,
  ]);

  const onTagChange = async (tag) => {
    setCurrentIndex(0);
    handleMemoTagChange(tag);
    setIsCramming(false);

    // To prevent 'space' key event from triggering dropdown
    await asyncUtils.sleep(200);

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement?.blur();
    }
  };

  const prevInitialCardUidsRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    const prevUids = prevInitialCardUidsRef.current;
    const uidSetChanged =
      prevUids.length !== initialCardUids.length ||
      initialCardUids.some((uid, i) => uid !== prevUids[i]);

    if (uidSetChanged) {
      prevInitialCardUidsRef.current = initialCardUids;
      setCardQueue(initialCardUids);
      setCurrentIndex(0);
    }
  }, [selectedTag, initialCardUids]);

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
  }, [todaySelectedTag, initialCardUids]);

  const onPracticeClick = React.useCallback(
    (gradeData) => {
      if (isDone) return;

      if (isLineByLineActive && !lineByLineIsCardComplete) {
        onLineByLineGrade(gradeData.sm2_grade);
        return;
      }

      if (isLineByLineActive && lineByLineIsCardComplete) {
        setCurrentIndex((prev) => prev + 1);
        return;
      }

      const baseData = baseCardData || currentCardData;

      const practiceProps = {
        ...baseData,
        ...gradeData,
        ...(isFixedTimeAlgorithm(algorithm) && { fixed_multiplier, fixed_unit }),
        algorithm,
        interaction,
      };

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
      baseCardData,
      algorithm,
      interaction,
      fixed_multiplier,
      fixed_unit,
      currentCardRefUid,
      forgotReinsertOffset,
      isCramming,
      isLineByLineActive,
      lineByLineIsCardComplete,
      onLineByLineGrade,
      currentIndex,
      childUidsList,
      lineByLineCurrentChildIndex,
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

  const onUndoLearning = React.useCallback(async () => {
    if (!currentCardRefUid) return;
    const undoRefUid =
      isLineByLineActive && !lineByLineIsCardComplete
        ? childUidsList[lineByLineCurrentChildIndex]
        : currentCardRefUid;
    if (!undoRefUid) return;
    try {
      await undoLatestSession({ refUid: undoRefUid, dataPageTitle });
    } catch (err) {
      console.error('Memo: Failed to undo today session', err);
    }
    setSessionOverrides((prev) => {
      const next = { ...prev };
      delete next[undoRefUid];
      if (undoRefUid !== currentCardRefUid) {
        delete next[currentCardRefUid];
      }
      return next;
    });
    if (isLineByLineActive && !lineByLineIsCardComplete) {
      setChildSessionData((prev) => {
        const next = { ...prev };
        delete next[undoRefUid];
        return next;
      });
    }
    setShowAnswers(false);
  }, [
    currentCardRefUid,
    dataPageTitle,
    isLineByLineActive,
    lineByLineIsCardComplete,
    childUidsList,
    lineByLineCurrentChildIndex,
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
      onRestartCallback();
    },
    [updateSetting, onRestartCallback]
  );

  const hotkeys = React.useMemo(
    () => [
      {
        combo: 'B',
        global: true,
        label: 'Show BreadCrumbs',
        onKeyDown: toggleBreadcrumbs,
      },
    ],
    [toggleBreadcrumbs]
  );
  Blueprint.useHotkeys(hotkeys);

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
        const currentChildUid = childUidsList[lineByLineCurrentChildIndex];
        if (!currentChildUid) return;

        try {
          const existingChildSession =
            childSessionData[currentChildUid] || generateNewSession({ algorithm: newAlgorithm });

          setChildSessionData((prev) => ({
            ...prev,
            [currentChildUid]: {
              ...existingChildSession,
              algorithm: newAlgorithm,
            },
          }));

          setSessionOverrides((prev) => ({
            ...prev,
            [currentChildUid]: {
              ...existingChildSession,
              algorithm: newAlgorithm,
            },
          }));

          applyOptimisticCardMeta({
            ...cardMeta,
            algorithm: newAlgorithm,
            interaction: interaction,
          });

          await updateReviewConfig({
            refUid: currentChildUid,
            dataPageTitle,
            algorithm: newAlgorithm,
          });
        } catch (err) {
          console.error('Memo: Failed to update algorithm', err);
        }

        return;
      }

      if (!interaction) throw new Error('interaction is undefined in onSelectAlgorithm');

      try {
        setSessionOverrides((prev) => ({
          ...prev,
          [currentCardRefUid]: {
            ...currentCardData,
            algorithm: newAlgorithm,
            interaction: interaction,
          },
        }));

        applyOptimisticCardMeta({
          ...cardMeta,
          algorithm: newAlgorithm,
          interaction: interaction,
        });

        await updateReviewConfig({
          refUid: currentCardRefUid,
          dataPageTitle,
          algorithm: newAlgorithm,
          interaction: interaction,
        });
      } catch (err) {
        console.error('Memo: Failed to update algorithm', err);
      }
    },
    [
      currentCardRefUid,
      dataPageTitle,
      cardMeta,
      currentCardData,
      applyOptimisticCardMeta,
      interaction,
      isLineByLineActive,
      lineByLineIsCardComplete,
      childUidsList,
      lineByLineCurrentChildIndex,
      childSessionData,
      setChildSessionData,
      setSessionOverrides,
    ]
  );

  const onSelectInteraction = React.useCallback(
    async (newInteraction: InteractionStyle) => {
      if (!currentCardRefUid) return;
      if (!algorithm) throw new Error('algorithm is undefined in onSelectInteraction');

      try {
        setSessionOverrides((prev) => ({
          ...prev,
          [currentCardRefUid]: {
            ...currentCardData,
            algorithm: algorithm,
            interaction: newInteraction,
          },
        }));

        applyOptimisticCardMeta({
          ...cardMeta,
          algorithm: algorithm,
          interaction: newInteraction,
        });

        await updateReviewConfig({
          refUid: currentCardRefUid,
          dataPageTitle,
          algorithm: algorithm,
          interaction: newInteraction,
        });
      } catch (err) {
        console.error('Memo: Failed to update interaction', err);
      }
    },
    [
      currentCardRefUid,
      dataPageTitle,
      cardMeta,
      currentCardData,
      applyOptimisticCardMeta,
      algorithm,
    ]
  );

  // useMemo: stable reference to prevent unnecessary re-renders in PracticeSessionContext consumers
  const sessionContextValue = React.useMemo(
    () => ({
      ...sessionContext,
      algorithm,
      interaction,
      onSelectAlgorithm,
      onSelectInteraction,
    }),
    [sessionContext, algorithm, interaction, onSelectAlgorithm, onSelectInteraction]
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
      renderMode,
      isLineByLine: isLineByLineActive,
      lineByLineCurrentIndex: isLineByLineActive ? lineByLineCurrentChildIndex + 1 : 0,
      lineByLineTotal: isLineByLineActive ? childUidsList.length : 0,
      lineByLineDueCount: isLineByLineActive ? dueChildCount : 0,
      cardQueueLength: cardQueue.length,
      cardMeta,
      baseCardData: effectiveBaseCardData,
      currentChildAlgorithm: isLineByLineActive ? currentChildAlgorithm : undefined,
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
      renderMode,
      isLineByLineActive,
      lineByLineCurrentChildIndex,
      childUidsList,
      dueChildCount,
      cardQueue.length,
      cardMeta,
      effectiveBaseCardData,
      currentChildAlgorithm,
      lineByLineIsCardComplete,
      onLineByLinePrev,
      onLineByLineNext,
    ]
  );

  if (!todaySelectedTag) {
    return null;
  }

  return (
    <PracticeSessionContext.Provider value={sessionContextValue}>
      <MainContext.Provider value={mainContextValue}>
        <style>{MOBILE_OVERLAY_STYLES}</style>
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
                {isLineByLineActive ? (
                  <LineByLineView
                    currentCardRefUid={currentCardRefUid}
                    childUidsList={childUidsList}
                    lineByLineRevealedCount={lineByLineRevealedCount}
                    lineByLineCurrentChildIndex={lineByLineCurrentChildIndex}
                    childSessionData={childSessionData}
                    setHasCloze={setHasCloze}
                    showBreadcrumbs={showBreadcrumbs}
                    autoCollapseBlocks={autoCollapseBlocks}
                    showAnswers={showAnswers}
                    currentChildAlgorithm={currentChildAlgorithm}
                    setChildHasBlockChildren={setChildHasBlockChildren}
                    setChildHasCloze={setChildHasCloze}
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
                      onRenderComplete={NOOP}
                    />
                  ))
                ) : (
                  <CardBlock
                    refUid={currentCardRefUid}
                    showAnswers={showAnswers}
                    setHasCloze={setHasCloze}
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
          {/* LBL showAnswers unified: internal showAnswers state controls both CardBlock and Footer.
            lineByLineRevealedCount only controls LineByLineView row rendering range. */}
          <Footer
            refUid={currentCardRefUid}
            onPracticeClick={onPracticeClick}
            onSkipClick={onSkipClick}
            onPrevClick={onPrevClick}
            setShowAnswers={
              isLineByLineActive && !lineByLineIsCardComplete
                ? onLineByLineShowAnswer
                : setShowAnswers
            }
            showAnswers={showAnswers}
            isDone={isDone}
            hasCards={hasCards}
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
