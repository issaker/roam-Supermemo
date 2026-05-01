import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import styled from '@emotion/styled';
import * as asyncUtils from '~/utils/async';

const NavButton = styled.button<{ disabled?: boolean }>`
  min-width: 44px;
  min-height: 44px;
  padding: 0 10px;
  font-size: 22px;
  line-height: 1;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  border: 1px solid rgba(128, 128, 128, 0.25);
  opacity: ${({ disabled }) => (disabled ? 0.3 : 1)};
`;
import { generatePracticeData } from '~/practice';
import Tooltip from '~/components/Tooltip';
import ButtonTags from '~/components/ButtonTags';
import {
  isFixedTimeAlgorithm,
  isGradingAlgorithm,
  SchedulingAlgorithm,
  InteractionStyle,
} from '~/models/session';
import { MainContext } from '~/components/overlay/PracticeOverlay';
import { useAlgorithmContext } from '~/hooks/useAlgorithmContext';
import { colors } from '~/theme';
import { ControlButton } from './ControlButton';
import { AlgorithmSelector, InteractionSelector } from './FooterSelectors';
import { FixedIntervalModeControls, SpacedIntervalModeControls } from './FixedIntervalEditor';
import type { IntervalEstimates } from './FixedIntervalEditor';

const Footer = ({
  setShowAnswers,
  showAnswers,
  refUid,
  onPracticeClick,
  onNextClick,
  onPrevClick,
  isDone,
  hasCards,
  onCloseCallback,
  currentCardData,
  onStartCrammingClick,
  isLearned,
  onUndoLearning,
}: {
  setShowAnswers: (_show: boolean) => void;
  showAnswers: boolean;
  refUid: string | undefined;
  onPracticeClick: (_props: { sm2_grade?: number; refUid?: string }) => void;
  onNextClick: () => void;
  onPrevClick: () => void;
  isDone: boolean;
  hasCards: boolean;
  onCloseCallback: () => void;
  currentCardData: any;
  onStartCrammingClick: () => void;
  isLearned: boolean;
  onUndoLearning: () => void;
}) => {
  const {
    fixed_multiplier,
    fixed_unit,
    baseCardData,
    currentChildAlgorithm,
    isLineByLine,
    lineByLineIsCardComplete,
    onLineByLinePrev,
    onLineByLineNext,
  } = React.useContext(MainContext);
  const { algorithm: algorithmFromSession, interaction: interactionFromSession } =
    useAlgorithmContext();

  const [isIntervalEditorOpen, setIsIntervalEditorOpen] = React.useState(false);

  const toggleIntervalEditorOpen = () => setIsIntervalEditorOpen((prev) => !prev);
  const [activeButtonKey, setActiveButtonKey] = React.useState(null);
  const activateButtonFn = async (key, callbackFn) => {
    setActiveButtonKey(key);
    await asyncUtils.sleep(150);
    callbackFn();
    setActiveButtonKey(null);
  };

  const showAnswerFn = React.useMemo(() => {
    return () => {
      setShowAnswers(true);
    };
  }, [setShowAnswers]);
  const gradeFn = React.useMemo(
    () => (grade) => {
      let key;
      switch (grade) {
        case 0:
          key = 'forgot-button';
          break;
        case 2:
          key = 'hard-button';
          break;
        case 4:
          key = 'good-button';
          break;
        case 5:
          key = 'perfect-button';
          break;

        default:
          break;
      }
      activateButtonFn(key, () => onPracticeClick({ sm2_grade: grade, refUid: refUid }));
    },
    [onPracticeClick, refUid]
  );

  const intervalPractice = React.useMemo(
    () => () => {
      activateButtonFn('next-button', () => onPracticeClick({ refUid: refUid }));
    },
    [onPracticeClick, refUid]
  );
  const nextFn = React.useMemo(
    () => () => {
      const key = 'next-button';
      activateButtonFn(key, () => onNextClick());
    },
    [onNextClick]
  );

  const hotkeys = React.useMemo(
    () => [
      {
        combo: 'space',
        global: true,
        label: 'Primary Action Trigger',
        onKeyDown: () => {
          if (!showAnswers) {
            activateButtonFn('space-button', showAnswerFn);
          } else {
            if (!isGradingAlgorithm(algorithmFromSession)) {
              intervalPractice();
            } else {
              gradeFn(5);
            }
          }
        },
      },
      {
        combo: 'right',
        global: true,
        label: 'Next',
        onKeyDown: nextFn,
      },
      {
        combo: 'left',
        global: true,
        label: 'Previous',
        onKeyDown: onPrevClick,
      },
      {
        combo: 'up',
        global: true,
        label: 'Previous Line',
        onKeyDown: (e: KeyboardEvent) => {
          if (isLineByLine && onLineByLinePrev) {
            e.preventDefault();
            onLineByLinePrev();
          }
        },
        disabled: !isLineByLine,
      },
      {
        combo: 'down',
        global: true,
        label: 'Next Line',
        onKeyDown: (e: KeyboardEvent) => {
          if (isLineByLine && onLineByLineNext) {
            e.preventDefault();
            onLineByLineNext();
          }
        },
        disabled: !isLineByLine,
      },
      {
        combo: 'F',
        global: true,
        label: 'Grade 0',
        onKeyDown: () => gradeFn(0),
        disabled: !isGradingAlgorithm(algorithmFromSession),
      },
      {
        combo: 'H',
        global: true,
        label: 'Grade 2',
        onKeyDown: () => gradeFn(2),
        disabled: !isGradingAlgorithm(algorithmFromSession),
      },
      {
        combo: 'G',
        global: true,
        label: 'Grade 4',
        onKeyDown: () => gradeFn(4),
        disabled: !isGradingAlgorithm(algorithmFromSession),
      },
      {
        combo: 'E',
        global: true,
        label: 'Edit Interval',
        onKeyDown: toggleIntervalEditorOpen,
        disabled: !isFixedTimeAlgorithm(algorithmFromSession),
      },
    ],
    [
      nextFn,
      onPrevClick,
      showAnswers,
      showAnswerFn,
      intervalPractice,
      gradeFn,
      algorithmFromSession,
      isLineByLine,
      onLineByLinePrev,
      onLineByLineNext,
    ]
  );
  const { handleKeyDown, handleKeyUp } = Blueprint.useHotkeys(hotkeys);

  const intervalEstimates: IntervalEstimates = React.useMemo(() => {
    const dataForEstimates = baseCardData || currentCardData;
    if (!dataForEstimates) return;

    const effectiveAlgorithm = currentChildAlgorithm || algorithmFromSession;
    if (!effectiveAlgorithm) {
      console.error('Algorithm not set');
      return;
    }
    const grades = [0, 1, 2, 3, 4, 5];
    const {
      sm2_interval,
      sm2_repetitions,
      sm2_eFactor,
      progressive_repetitions,
      progressive_interval,
    } = dataForEstimates;
    const estimates = {};

    const iterateCount = !isGradingAlgorithm(effectiveAlgorithm) ? 1 : grades.length;
    for (let i = 0; i < iterateCount; i++) {
      const grade = grades[i];
      const practiceResultData = generatePracticeData({
        sm2_grade: grade,
        sm2_interval,
        sm2_repetitions,
        sm2_eFactor,
        dateCreated: new Date(),
        algorithm: effectiveAlgorithm,
        interaction: interactionFromSession || InteractionStyle.NORMAL,
        ...(isFixedTimeAlgorithm(effectiveAlgorithm) && { fixed_multiplier, fixed_unit }),
        progressive_repetitions,
        progressive_interval,
      });
      estimates[grade] = practiceResultData;
    }
    return estimates;
  }, [
    baseCardData,
    currentCardData,
    fixed_multiplier,
    fixed_unit,
    algorithmFromSession,
    interactionFromSession,
    currentChildAlgorithm,
  ]);

  return (
    <FooterWrapper
      className="bp3-multistep-dialog-footer flex items-center justify-center rounded-b-md p-0"
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      <FooterActionsWrapper
        className="bp3-dialog-footer-actions flex-wrap gap-4 justify-center w-full mx-5  my-3"
        data-testid="footer-actions-wrapper"
      >
        {isDone || !hasCards ? (
          <FinishedControls
            onStartCrammingClick={onStartCrammingClick}
            onCloseCallback={onCloseCallback}
          />
        ) : isLineByLine && lineByLineIsCardComplete ? (
          <LblCompletedControls
            onPrevClick={onPrevClick}
            onNextClick={nextFn}
            onLineByLinePrev={onLineByLinePrev}
          />
        ) : isLearned ? (
          <CompletedTodayControls
            onUndoLearning={onUndoLearning}
            algorithm={algorithmFromSession}
          />
        ) : !showAnswers ? (
          <AnswerHiddenControls
            activateButtonFn={activateButtonFn}
            showAnswerFn={showAnswerFn}
            activeButtonKey={activeButtonKey}
          />
        ) : (
          <GradingControlsWrapper
            activeButtonKey={activeButtonKey}
            nextFn={nextFn}
            gradeFn={gradeFn}
            intervalEstimates={intervalEstimates}
            intervalPractice={intervalPractice}
            isIntervalEditorOpen={isIntervalEditorOpen}
            toggleIntervalEditorOpen={toggleIntervalEditorOpen}
            onPrevClick={onPrevClick}
          />
        )}
      </FooterActionsWrapper>
    </FooterWrapper>
  );
};

const AnswerHiddenControls = ({ activateButtonFn, showAnswerFn, activeButtonKey }) => (
  <ControlButton
    className="text-base font-medium py-1"
    intent="none"
    onClick={() => {
      activateButtonFn('space-button', showAnswerFn);
    }}
    active={activeButtonKey === 'space-button'}
    outlined
  >
    Show Answer{' '}
    <span className="ml-2">
      <ButtonTags>SPACE</ButtonTags>
    </span>
  </ControlButton>
);

const FinishedControls = ({ onStartCrammingClick, onCloseCallback }) => {
  return (
    <>
      <Tooltip content="Review all cards without waiting for scheduling" placement="top">
        <Blueprint.Button
          className="text-base font-medium py-1"
          intent="none"
          onClick={onStartCrammingClick}
          outlined
        >
          Continue Cramming
        </Blueprint.Button>
      </Tooltip>
      <Blueprint.Button
        className="text-base font-medium py-1"
        intent="primary"
        onClick={onCloseCallback}
        outlined
      >
        Close
      </Blueprint.Button>
    </>
  );
};

const ALGORITHM_DISPLAY_NAME: Record<SchedulingAlgorithm, string> = {
  [SchedulingAlgorithm.SM2]: 'SM2',
  [SchedulingAlgorithm.PROGRESSIVE]: 'Progressive',
  [SchedulingAlgorithm.FIXED_TIME]: 'FixedTime',
};

const CompletedTodayControls = ({
  onUndoLearning,
  algorithm,
}: {
  onUndoLearning: () => void;
  algorithm: SchedulingAlgorithm | undefined;
}) => {
  const displayName = algorithm ? ALGORITHM_DISPLAY_NAME[algorithm] : '';
  return (
    <Tooltip content="Reset this card's learning record and re-learn" placement="top">
      <Blueprint.Button
        className="text-base font-medium py-1"
        intent="danger"
        onClick={onUndoLearning}
        outlined
      >
        Undo Learning ({displayName})
      </Blueprint.Button>
    </Tooltip>
  );
};

const LblCompletedControls = ({ onPrevClick, onNextClick, onLineByLinePrev }) => (
  <div className="flex items-center justify-evenly w-full">
    <NavButton
      type="button"
      aria-label="Previous"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPrevClick();
      }}
      className="bp3-button bp3-minimal"
    >
      ◀
    </NavButton>
    <NavButton
      type="button"
      aria-label="Previous Line"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onLineByLinePrev?.();
      }}
      className="bp3-button bp3-minimal"
    >
      ▲
    </NavButton>
    <span className="text-sm opacity-60">All lines reviewed</span>
    <NavButton type="button" aria-label="Next Line" disabled className="bp3-button bp3-minimal">
      ▼
    </NavButton>
    <NavButton
      type="button"
      aria-label="Next"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onNextClick();
      }}
      className="bp3-button bp3-minimal"
    >
      ▶
    </NavButton>
  </div>
);

const GradingControlsWrapper = ({
  activeButtonKey,
  nextFn,
  gradeFn,
  intervalEstimates,
  intervalPractice,
  isIntervalEditorOpen,
  toggleIntervalEditorOpen,
  onPrevClick,
}) => {
  const { algorithm, interaction, onSelectAlgorithm, onSelectInteraction } = useAlgorithmContext();

  const { isLineByLine, onLineByLinePrev, onLineByLineNext, currentChildAlgorithm } =
    React.useContext(MainContext);
  const effectiveAlgorithm = isLineByLine ? currentChildAlgorithm : algorithm;
  const isAutoAdvanceMode = !isGradingAlgorithm(effectiveAlgorithm);
  const effectiveInteraction = interaction;
  return (
    <div className="flex items-center flex-wrap justify-evenly gap-3 w-full">
      <NavButton
        type="button"
        aria-label="Previous"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPrevClick();
        }}
        className="bp3-button bp3-minimal"
      >
        ◀
      </NavButton>
      <NavButton
        type="button"
        aria-label="Next"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          nextFn();
        }}
        className="bp3-button bp3-minimal"
      >
        ▶
      </NavButton>
      {isLineByLine && (
        <>
          <NavButton
            type="button"
            aria-label="Previous Line"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLineByLinePrev?.();
            }}
            className="bp3-button bp3-minimal"
          >
            ▲
          </NavButton>
          <NavButton
            type="button"
            aria-label="Next Line"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLineByLineNext?.();
            }}
            className="bp3-button bp3-minimal"
          >
            ▼
          </NavButton>
        </>
      )}
      {isAutoAdvanceMode ? (
        <FixedIntervalModeControls
          activeButtonKey={activeButtonKey}
          intervalPractice={intervalPractice}
          isIntervalEditorOpen={isIntervalEditorOpen}
          toggleIntervalEditorOpen={toggleIntervalEditorOpen}
          intervalEstimates={intervalEstimates}
          effectiveAlgorithm={effectiveAlgorithm}
        />
      ) : (
        <SpacedIntervalModeControls
          activeButtonKey={activeButtonKey}
          gradeFn={gradeFn}
          intervalEstimates={intervalEstimates}
        />
      )}
      <AlgorithmSelector
        algorithm={effectiveAlgorithm}
        onSelectAlgorithm={onSelectAlgorithm || (() => {})}
      />
      <InteractionSelector
        interaction={effectiveInteraction}
        onSelectInteraction={onSelectInteraction || (() => {})}
      />
    </div>
  );
};

const FooterWrapper = styled.div`
  min-height: 50px;
  border-top: 1px solid ${colors.borderSubtle};

  & .bp3-button-text {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  background-color: transparent;
`;

const FooterActionsWrapper = styled.div`
  &.bp3-dialog-footer-actions .bp3-button {
    margin-left: 0;
  }
`;

export default Footer;
