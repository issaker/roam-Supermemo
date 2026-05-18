import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import type { Intent } from '@blueprintjs/core';
import styled from '@emotion/styled';
import Tooltip from '~/components/Tooltip';
import { getIntentColor, colors } from '~/theme';

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

export { ControlButton, ControlButtonWrapper };
export type { ControlButtonProps, ControlButtonIntent };
