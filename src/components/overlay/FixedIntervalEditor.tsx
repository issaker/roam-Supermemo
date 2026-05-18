import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import {
  FixedTimeUnit,
  SchedulingAlgorithm,
  Session,
} from '~/models/session';
import { MainContext } from '~/components/overlay/PracticeOverlay';
import ButtonTags from '~/components/ButtonTags';
import { ControlButton } from './ControlButton';
import * as dateUtils from '~/utils/date';

const formatDaysFromNow = (nextDueDate: Date | undefined): string => {
  if (!nextDueDate) return '';
  const days = dateUtils.daysBetween(new Date(), nextDueDate);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days} days`;
};

type IntervalEstimate = Omit<Session, 'baseSessionData'>;

type IntervalEstimates =
  | undefined
  | {
      [key: number]: IntervalEstimate;
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
  const isProgressive = effectiveAlgorithm === SchedulingAlgorithm.PROGRESSIVE;
  const onInteractionhandler = (nextState) => {
    if (!nextState && isIntervalEditorOpen) toggleIntervalEditorOpen();
  };

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
              nextDueDate={intervalEstimates![0]?.nextDueDate}
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
                nextDueDate={intervalEstimates![0]?.nextDueDate}
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
        tooltipText={`Review ${formatDaysFromNow(intervalEstimates![0]?.nextDueDate)}`}
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

const GRADE_BUTTONS = [
  { key: 'forgot-button', grade: 0, intent: 'danger' as const, label: 'Forgot', tag: 'F' },
  { key: 'hard-button', grade: 2, intent: 'warning' as const, label: 'Hard', tag: 'H' },
  { key: 'good-button', grade: 4, intent: 'primary' as const, label: 'Good', tag: 'G' },
  { key: 'perfect-button', grade: 5, intent: 'success' as const, label: 'Perfect', tag: 'SPACE' },
];

const SpacedIntervalModeControls = ({
  activeButtonKey,
  gradeFn,
  intervalEstimates,
}: {
  activeButtonKey: string;
  gradeFn: (_sm2_grade: number) => void;
  intervalEstimates: IntervalEstimates;
}): JSX.Element => (
  <>
    {GRADE_BUTTONS.map(({ key, grade, intent, label, tag }) => (
      <ControlButton
        key={key}
        className="text-base font-medium py-1"
        intent={intent}
        onClick={() => gradeFn(grade)}
        tooltipText={`Review ${formatDaysFromNow(intervalEstimates![grade]?.nextDueDate)}`}
        active={activeButtonKey === key}
      >
        {label}{' '}
        <span className="ml-2">
          <ButtonTags>{tag}</ButtonTags>
        </span>
      </ControlButton>
    ))}
  </>
);

export { FixedIntervalEditor, FixedIntervalModeControls, SpacedIntervalModeControls };
export type { IntervalEstimate, IntervalEstimates };
