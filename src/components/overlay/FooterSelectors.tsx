import * as Blueprint from '@blueprintjs/core';
import type { IconName } from '@blueprintjs/core';
import * as BlueprintSelect from '@blueprintjs/select';
import styled from '@emotion/styled';
import { SelectorItemBase } from './selectorStyles';
import {
  SchedulingAlgorithm,
  InteractionStyle,
  ALGORITHM_META,
  INTERACTION_META,
} from '~/models/session';

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

const SelectorItemWrapper = styled(SelectorItemBase)`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 13px;
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
      onItemSelect={(option: AlgorithmOption) => onSelectAlgorithm(option.value)}
      popoverProps={{ minimal: true }}
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
      onItemSelect={(option: InteractionOption) => onSelectInteraction(option.value)}
      popoverProps={{ minimal: true }}
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

export { AlgorithmSelector, InteractionSelector };
