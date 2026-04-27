import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import type { IconName, Intent } from '@blueprintjs/core';
import * as BlueprintSelect from '@blueprintjs/select';
import styled from '@emotion/styled';
import * as asyncUtils from '~/utils/async';
import * as dateUtils from '~/utils/date';
import { generatePracticeData } from '~/practice';
import Tooltip from '~/components/Tooltip';
import ButtonTags from '~/components/ButtonTags';
import {
  isFixedTimeAlgorithm,
  isGradingAlgorithm,
  SchedulingAlgorithm,
  FixedTimeUnit,
  InteractionStyle,
  ALGORITHM_META,
  INTERACTION_META,
  Session,
} from '~/models/session';
import { MainContext } from '~/components/overlay/PracticeOverlay';
import { usePracticeSession } from '~/contexts/PracticeSessionContext';
import { getIntentColor, colors } from '~/theme';

const formatDaysFromNow = (nextDueDate: Date | undefined): string => {
  if (!nextDueDate) return '';
  const days = dateUtils.daysBetween(new Date(), nextDueDate);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
};

/**
 * IntervalEstimate inherits all algorithm fields from Session (sm2_*, progressive_*, fixed_*).
 * Design intent: full inheritance ensures that when users switch between algorithms, each
 * algorithm's historical data is carried forward without discontinuity. For example, when
 * switching from SM2 to Fixed and back to SM2, SM2's eFactor and repetitions are still
 * preserved, allowing interval calculation to continue from the correct position.
 * baseSessionData is excluded because interval preview does not need this nested field.
 */
type IntervalEstimate = Omit<Session, 'baseSessionData'>;

type IntervalEstimates =
  | undefined
  | {
      [key: number]: IntervalEstimate;
    };
const Footer = ({
  setShowAnswers,
  showAnswers,
  refUid,
  onPracticeClick,
  onSkipClick,
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
  onSkipClick: () => void;
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
    usePracticeSession();

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
  const skipFn = React.useMemo(
    () => () => {
      const key = 'skip-button';
      activateButtonFn(key, () => onSkipClick());
    },
    [onSkipClick]
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
        combo: 'S',
        global: true,
        label: 'Skip',
        onKeyDown: skipFn,
      },
      {
        combo: 'right',
        global: true,
        label: 'Skip',
        onKeyDown: skipFn,
      },
      {
        combo: 'left',
        global: true,
        label: 'Previous',
        onKeyDown: onPrevClick,
      },
      /** LBL secondary queue navigation: ↑/↓ navigate between child blocks */
      {
        combo: 'up',
        global: true,
        label: 'Previous Line',
        onKeyDown: () => {
          if (isLineByLine && onLineByLinePrev) {
            onLineByLinePrev();
          }
        },
        disabled: !isLineByLine,
      },
      {
        combo: 'down',
        global: true,
        label: 'Next Line',
        onKeyDown: () => {
          if (isLineByLine && onLineByLineNext) {
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
      skipFn,
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
            onNextClick={skipFn}
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
            skipFn={skipFn}
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
  <div className="flex items-center gap-3">
    <button
      type="button"
      aria-label="Previous"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onPrevClick();
      }}
      className="bp3-button bp3-minimal"
      style={{
        minWidth: '44px',
        minHeight: '44px',
        padding: '0 10px',
        fontSize: '22px',
        lineHeight: 1,
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        border: '1px solid rgba(128, 128, 128, 0.25)',
      }}
    >
      ◀
    </button>
    {/* LBL secondary queue navigation: ▲ navigates back to previous lines for re-review */}
    <button
      type="button"
      aria-label="Previous Line"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onLineByLinePrev?.();
      }}
      className="bp3-button bp3-minimal"
      style={{
        minWidth: '44px',
        minHeight: '44px',
        padding: '0 10px',
        fontSize: '22px',
        lineHeight: 1,
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        border: '1px solid rgba(128, 128, 128, 0.25)',
      }}
    >
      ▲
    </button>
    <span className="text-sm opacity-60">All lines reviewed</span>
    <button
      type="button"
      aria-label="Next Line"
      disabled
      className="bp3-button bp3-minimal"
      style={{
        minWidth: '44px',
        minHeight: '44px',
        padding: '0 10px',
        fontSize: '22px',
        lineHeight: 1,
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        opacity: 0.3,
        border: '1px solid rgba(128, 128, 128, 0.25)',
      }}
    >
      ▼
    </button>
    <button
      type="button"
      aria-label="Next"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onNextClick();
      }}
      className="bp3-button bp3-minimal"
      style={{
        minWidth: '44px',
        minHeight: '44px',
        padding: '0 10px',
        fontSize: '22px',
        lineHeight: 1,
        touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent',
        border: '1px solid rgba(128, 128, 128, 0.25)',
      }}
    >
      ▶
    </button>
  </div>
);

const GradingControlsWrapper = ({
  activeButtonKey,
  skipFn,
  gradeFn,
  intervalEstimates,
  intervalPractice,
  isIntervalEditorOpen,
  toggleIntervalEditorOpen,
  onPrevClick,
}) => {
  const { algorithm, interaction, onSelectAlgorithm, onSelectInteraction } = usePracticeSession();

  const { isLineByLine, onLineByLinePrev, onLineByLineNext, currentChildAlgorithm } =
    React.useContext(MainContext);
  const effectiveAlgorithm = isLineByLine ? currentChildAlgorithm : algorithm;
  const isAutoAdvanceMode = !isGradingAlgorithm(effectiveAlgorithm);
  const effectiveInteraction = interaction;
  return (
    <div className="flex items-center flex-wrap justify-evenly gap-3 w-full">
      <button
        type="button"
        aria-label="Previous"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPrevClick();
        }}
        className="bp3-button bp3-minimal"
        style={{
          minWidth: '44px',
          minHeight: '44px',
          padding: '0 10px',
          fontSize: '22px',
          lineHeight: 1,
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          border: '1px solid rgba(128, 128, 128, 0.25)',
        }}
      >
        ◀
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          skipFn();
        }}
        className="bp3-button bp3-minimal"
        style={{
          minWidth: '44px',
          minHeight: '44px',
          padding: '0 10px',
          fontSize: '22px',
          lineHeight: 1,
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          border: '1px solid rgba(128, 128, 128, 0.25)',
        }}
      >
        ▶
      </button>
      {/* LBL secondary queue navigation buttons: ▲/▼ navigate between child blocks */}
      {isLineByLine && (
        <>
          <button
            type="button"
            aria-label="Previous Line"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLineByLinePrev?.();
            }}
            className="bp3-button bp3-minimal"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              padding: '0 10px',
              fontSize: '22px',
              lineHeight: 1,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              border: '1px solid rgba(128, 128, 128, 0.25)',
            }}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Next Line"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLineByLineNext?.();
            }}
            className="bp3-button bp3-minimal"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              padding: '0 10px',
              fontSize: '22px',
              lineHeight: 1,
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
              border: '1px solid rgba(128, 128, 128, 0.25)',
            }}
          >
            ▼
          </button>
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
      {/* InteractionSelector: in LBL mode, displays parent card's interaction; switching operates on parent card */}
      <InteractionSelector
        interaction={effectiveInteraction}
        onSelectInteraction={onSelectInteraction || (() => {})}
      />
    </div>
  );
};

const FixedIntervalEditor = () => {
  const { fixed_multiplier, setFixed_multiplier, fixed_unit, setFixed_unit } =
    React.useContext(MainContext);
  const handleInputValueChange = (numericValue) => {
    if (isNaN(numericValue)) return;
    setFixed_multiplier(numericValue);
  };

  const unitOptions = [
    { value: FixedTimeUnit.DAYS, label: 'Days' },
    { value: FixedTimeUnit.WEEKS, label: 'Weeks' },
    { value: FixedTimeUnit.MONTHS, label: 'Months' },
    { value: FixedTimeUnit.YEARS, label: 'Years' },
  ];

  return (
    <div className="flex p-2 items-center w-80 justify-evenly">
      <div className="">Every</div>
      <div className="w-24">
        <Blueprint.NumericInput
          min={1}
          max={365}
          stepSize={1}
          majorStepSize={30}
          minorStepSize={1}
          value={fixed_multiplier}
          onValueChange={handleInputValueChange}
          fill
        />
      </div>
      <Blueprint.HTMLSelect
        value={fixed_unit}
        onChange={(e) => setFixed_unit(e.currentTarget.value as FixedTimeUnit)}
        minimal
      >
        {unitOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Blueprint.HTMLSelect>
    </div>
  );
};

const IntervalString = ({ algorithm, fixed_multiplier, fixed_unit, nextDueDate }) => {
  if (algorithm === SchedulingAlgorithm.PROGRESSIVE) {
    const displayText = (nextDueDate ? formatDaysFromNow(nextDueDate) : null) || 'Progressive';
    return (
      <>
        Review <span className="font-medium mr-3">{displayText}</span>
      </>
    );
  }

  if (algorithm === SchedulingAlgorithm.FIXED_TIME) {
    const unit = fixed_unit || FixedTimeUnit.DAYS;
    const value = fixed_multiplier || 3;
    const unitLabelMap = {
      [FixedTimeUnit.DAYS]: 'Days',
      [FixedTimeUnit.WEEKS]: 'Weeks',
      [FixedTimeUnit.MONTHS]: 'Months',
      [FixedTimeUnit.YEARS]: 'Years',
    };
    const singularMap = {
      [FixedTimeUnit.DAYS]: 'Daily',
      [FixedTimeUnit.WEEKS]: 'Weekly',
      [FixedTimeUnit.MONTHS]: 'Monthly',
      [FixedTimeUnit.YEARS]: 'Yearly',
    };

    if (value === 1) {
      return (
        <>
          Review <span className="font-medium mr-3">{singularMap[unit]}</span>
        </>
      );
    }
    return (
      <>
        Review{' '}
        <span className="font-medium mr-3">
          Every {value} {unitLabelMap[unit]}
        </span>
      </>
    );
  }

  return null;
};

const FixedIntervalModeControls = ({
  activeButtonKey,
  intervalPractice,
  isIntervalEditorOpen,
  toggleIntervalEditorOpen,
  intervalEstimates,
  effectiveAlgorithm,
}: {
  activeButtonKey: string;
  intervalPractice: () => void;
  isIntervalEditorOpen: boolean;
  toggleIntervalEditorOpen: () => void;
  intervalEstimates: IntervalEstimates;
  effectiveAlgorithm: SchedulingAlgorithm | undefined;
}): JSX.Element => {
  const { fixed_multiplier, fixed_unit } = React.useContext(MainContext);
  // Uses effectiveAlgorithm from parent context (not usePracticeSession().algorithm)
  // to remain consistent with the rendering decision chain that selects this component.
  const isProgressive = effectiveAlgorithm === SchedulingAlgorithm.PROGRESSIVE;
  const onInteractionhandler = (nextState) => {
    if (!nextState && isIntervalEditorOpen) toggleIntervalEditorOpen();
  };
  if (!intervalEstimates) {
    console.error('Interval estimates not set');
    return <></>;
  }

  return (
    <>
      {isProgressive ? (
        <ControlButton
          icon="time"
          className="text-base font-normal py-1"
          intent="default"
          tooltipText={`Progressive Interval`}
          outlined
        >
          <span className="ml-2">
            <IntervalString
              algorithm={effectiveAlgorithm}
              fixed_multiplier={fixed_multiplier}
              fixed_unit={fixed_unit}
              nextDueDate={intervalEstimates[0]?.nextDueDate}
            />
          </span>
        </ControlButton>
      ) : (
        <Blueprint.Popover isOpen={isIntervalEditorOpen} onInteraction={onInteractionhandler}>
          <ControlButton
            icon="time"
            className="text-base font-normal py-1"
            intent="default"
            onClick={toggleIntervalEditorOpen}
            tooltipText={`Change Interval`}
            active={activeButtonKey === 'change-interval-button'}
            outlined
          >
            <span className="ml-2">
              <IntervalString
                algorithm={effectiveAlgorithm}
                fixed_multiplier={fixed_multiplier}
                fixed_unit={fixed_unit}
                nextDueDate={intervalEstimates[0]?.nextDueDate}
              />
              <ButtonTags>E</ButtonTags>
            </span>
          </ControlButton>
          <FixedIntervalEditor />
        </Blueprint.Popover>
      )}
      <ControlButton
        icon="tick"
        className="text-base font-medium py-1"
        intent="success"
        onClick={() => intervalPractice()}
        tooltipText={`Review ${formatDaysFromNow(intervalEstimates[0]?.nextDueDate)}`}
        active={activeButtonKey === 'next-button'}
        outlined
      >
        Next{' '}
        <span className="ml-2">
          <ButtonTags>SPACE</ButtonTags>
        </span>
      </ControlButton>
    </>
  );
};

const SpacedIntervalModeControls = ({
  activeButtonKey,
  gradeFn,
  intervalEstimates,
}: {
  activeButtonKey: string;
  gradeFn: (_sm2_grade: number) => void;
  intervalEstimates: IntervalEstimates;
}): JSX.Element => {
  if (!intervalEstimates) {
    console.error('Interval estimates not set');
    return <></>;
  }

  return (
    <>
      <ControlButton
        key="forget-button"
        className="text-base font-medium py-1"
        intent="danger"
        tooltipText={`Review ${formatDaysFromNow(intervalEstimates[0]?.nextDueDate)}`}
        onClick={() => gradeFn(0)}
        active={activeButtonKey === 'forgot-button'}
      >
        Forgot{' '}
        <span className="ml-2">
          <ButtonTags>F</ButtonTags>
        </span>
      </ControlButton>
      <ControlButton
        className="text-base font-medium py-1"
        intent="warning"
        onClick={() => gradeFn(2)}
        tooltipText={`Review ${formatDaysFromNow(intervalEstimates[2]?.nextDueDate)}`}
        active={activeButtonKey === 'hard-button'}
      >
        Hard{' '}
        <span className="ml-2">
          <ButtonTags>H</ButtonTags>
        </span>
      </ControlButton>
      <ControlButton
        className="text-base font-medium py-1"
        intent="primary"
        onClick={() => gradeFn(4)}
        tooltipText={`Review ${formatDaysFromNow(intervalEstimates[4]?.nextDueDate)}`}
        active={activeButtonKey === 'good-button'}
      >
        Good{' '}
        <span className="ml-2">
          <ButtonTags>G</ButtonTags>
        </span>
      </ControlButton>
      <ControlButton
        className="text-base font-medium py-1"
        intent="success"
        onClick={() => gradeFn(5)}
        tooltipText={`Review ${formatDaysFromNow(intervalEstimates[5]?.nextDueDate)}`}
        active={activeButtonKey === 'perfect-button'}
      >
        Perfect{' '}
        <span className="ml-2">
          <ButtonTags>SPACE</ButtonTags>
        </span>
      </ControlButton>
    </>
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

const ControlButtonWrapper = styled(Blueprint.Button, {
  shouldForwardProp: (prop) => prop !== '$intentTone',
})<{ $intentTone?: string }>`
  && {
    background: ${colors.overlayLight} !important;
    background-color: ${colors.overlayLight} !important;
    border: none !important;
    box-shadow: inset 0 0 0 1px ${colors.borderSubtle} !important;
  }

  color: ${(props) => getIntentColor(props.$intentTone)};

  & .bp3-button-text {
    color: ${(props) => getIntentColor(props.$intentTone)};
  }

  &&:hover {
    background: ${colors.overlayLightHover} !important;
    background-color: ${colors.overlayLightHover} !important;
    box-shadow: inset 0 0 0 1px rgba(128, 128, 128, 0.3) !important;
  }
`;

type ControlButtonIntent = Intent | 'default' | 'none';

interface ControlButtonProps extends Omit<Blueprint.IButtonProps, 'intent'> {
  tooltipText?: string;
  wrapperClassName?: string;
  intent?: ControlButtonIntent;
  children?: React.ReactNode;
}

const ControlButton = ({
  tooltipText,
  wrapperClassName = '',
  intent,
  ...props
}: ControlButtonProps) => {
  const buttonIntent = intent === 'default' || intent === 'none' ? undefined : intent;

  return (
    <Tooltip content={tooltipText || ''} placement="top" wrapperClassName={wrapperClassName}>
      <ControlButtonWrapper {...props} intent={buttonIntent} $intentTone={intent} />
    </Tooltip>
  );
};

interface AlgorithmOption {
  value: SchedulingAlgorithm;
  label: string;
}

interface InteractionOption {
  value: InteractionStyle;
  label: string;
  icon: IconName;
}

const ALGORITHM_OPTIONS: AlgorithmOption[] = Object.values(SchedulingAlgorithm).map((algo) => ({
  value: algo,
  label: ALGORITHM_META[algo].label,
}));

const INTERACTION_OPTIONS: InteractionOption[] = Object.values(InteractionStyle).map((style) => ({
  value: style,
  label: INTERACTION_META[style].label,
  icon: (INTERACTION_META[style].icon as IconName) || 'layers',
}));
const AlgorithmSelect = BlueprintSelect.Select.ofType<AlgorithmOption>();
const InteractionSelect = BlueprintSelect.Select.ofType<InteractionOption>();

const SelectorItemWrapper = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  position: relative;
  user-select: none;
  cursor: pointer;
  border-radius: 2px;
  font-size: 13px;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: currentColor;
    opacity: ${({ active }) => (active ? 0.08 : 0)};
    border-radius: 2px;
    pointer-events: none;
  }

  &:hover::before {
    opacity: ${({ active }) => (active ? 0.12 : 0.06)};
  }
`;

const AlgorithmSelector = ({
  algorithm,
  onSelectAlgorithm,
}: {
  algorithm: SchedulingAlgorithm | undefined;
  onSelectAlgorithm: (_algorithm: SchedulingAlgorithm) => void;
}) => {
  const activeOption = ALGORITHM_OPTIONS.find((o) => o.value === algorithm) || ALGORITHM_OPTIONS[0];

  return (
    <AlgorithmSelect
      items={ALGORITHM_OPTIONS}
      activeItem={activeOption}
      filterable={false}
      itemRenderer={(option: AlgorithmOption, { handleClick, modifiers }) => {
        const isActive = option.value === activeOption.value;
        return (
          <SelectorItemWrapper
            active={modifiers.active}
            key={option.value}
            onClick={handleClick}
            data-testid={`algorithm-option-${option.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <span style={{ fontWeight: isActive ? 600 : 400 }}>{option.label}</span>
            {isActive && (
              <Blueprint.Icon
                icon="tick"
                iconSize={12}
                style={{ marginLeft: 'auto', color: '#0d8050' }}
              />
            )}
          </SelectorItemWrapper>
        );
      }}
      onItemSelect={(option: AlgorithmOption) => {
        onSelectAlgorithm(option.value);
      }}
      popoverProps={{ minimal: true }}
      itemPredicate={() => true}
    >
      <Blueprint.Button
        rightIcon="caret-down"
        minimal
        data-testid="algorithm-button"
        style={{ fontSize: '12px' }}
      >
        {activeOption.label}
      </Blueprint.Button>
    </AlgorithmSelect>
  );
};

const InteractionSelector = ({
  interaction,
  onSelectInteraction,
}: {
  interaction: InteractionStyle | undefined;
  onSelectInteraction: (_interaction: InteractionStyle) => void;
}) => {
  const activeOption =
    INTERACTION_OPTIONS.find((o) => o.value === interaction) || INTERACTION_OPTIONS[0];

  return (
    <InteractionSelect
      items={INTERACTION_OPTIONS}
      activeItem={activeOption}
      filterable={false}
      itemRenderer={(option: InteractionOption, { handleClick, modifiers }) => {
        const isActive = option.value === activeOption.value;
        return (
          <SelectorItemWrapper
            active={modifiers.active}
            key={option.value}
            onClick={handleClick}
            data-testid={`interaction-option-${option.label.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Blueprint.Icon
              icon={option.icon}
              iconSize={14}
              style={{ opacity: isActive ? 1 : 0.6 }}
            />
            <span style={{ fontWeight: isActive ? 600 : 400 }}>{option.label}</span>
            {isActive && (
              <Blueprint.Icon
                icon="tick"
                iconSize={12}
                style={{ marginLeft: 'auto', color: '#0d8050' }}
              />
            )}
          </SelectorItemWrapper>
        );
      }}
      onItemSelect={(option: InteractionOption) => {
        onSelectInteraction(option.value);
      }}
      popoverProps={{ minimal: true }}
      itemPredicate={() => true}
    >
      <Blueprint.Button
        icon={activeOption.icon}
        rightIcon="caret-down"
        minimal
        data-testid="interaction-button"
        style={{ fontSize: '12px' }}
      >
        {activeOption.label}
      </Blueprint.Button>
    </InteractionSelect>
  );
};

export default Footer;
