import * as React from 'react';
import { Position, Tooltip as BluePrintTooltip } from '@blueprintjs/core';
import styled from '@emotion/styled';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

interface Props {
  className?: string;
  wrapperClassName?: string;
  children: React.ReactElement;
  content: string | JSX.Element;
  placement: TooltipPlacement;
}

const Wrapper = ({ className, wrapperClassName, ...restProps }: Props) => {
  // Detect if device is mobile/touch-enabled
  const isTouchDevice = typeof window !== 'undefined' && 
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  
  // On touch devices, don't render tooltip to prevent flickering
  if (isTouchDevice) {
    return <>{restProps.children}</>;
  }
  
  const position =
    restProps.placement === 'top'
      ? Position.TOP
      : restProps.placement === 'bottom'
      ? Position.BOTTOM
      : restProps.placement === 'left'
      ? Position.LEFT
      : Position.RIGHT;

  return (
    <BluePrintTooltip
      className={wrapperClassName}
      popoverClassName={className}
      content={restProps.content}
      position={position}
    >
      {restProps.children}
    </BluePrintTooltip>
  );
};

const Tooltip = styled(Wrapper)`
  &.bp3-tooltip .bp3-popover-content {
    font-size: 12px;
    padding: 2px 5px;
  }
`;

export default Tooltip;
