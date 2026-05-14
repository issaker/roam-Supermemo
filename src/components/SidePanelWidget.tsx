import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import styled from '@emotion/styled';
import Tooltip from '~/components/Tooltip';
import { useReviewStore } from '~/review-runtime/store/context';
import { selectSidebarCounts } from '~/review-runtime/store/selectors';

const Wrapper = styled.span`
  display: flex;
`;

const Tag = styled(Blueprint.Tag)`
  &.bp3-tag {
    padding: 1px 3px;
    min-height: auto;
    min-width: auto;
  }
`;

interface SidePanelWidgetProps {
  onClickCallback: () => void;
}
const SidePanelWidget = ({ onClickCallback }: SidePanelWidgetProps) => {
  const { state } = useReviewStore();
  const { dueCount, newCount } = React.useMemo(() => selectSidebarCounts(state), [state]);

  const allDoneToday = dueCount + newCount === 0;

  const iconClass = allDoneToday ? 'bp3-icon-confirm' : 'bp3-icon-box';

  return (
    <Wrapper
      data-testid="side-panel-wrapper"
      className="w-full justify-between"
      onClick={onClickCallback}
    >
      <div>
        <div className="flex">
          <span className={`bp3-icon ${iconClass} icon bp3-icon-small flex items-center`}></span>
          <div>Review</div>
        </div>
      </div>
      <div className="ml-2">
        {dueCount > 0 && (
          <Tooltip content="Due" placement="top">
            <Tag active minimal intent="primary" className="text-center" data-testid="due-tag">
              {dueCount}
            </Tag>
          </Tooltip>
        )}
        {newCount > 0 && (
          <Tooltip content="New" placement="top">
            <Tag active minimal intent="success" className="text-center ml-2" data-testid="new-tag">
              {newCount}
            </Tag>
          </Tooltip>
        )}
      </div>
    </Wrapper>
  );
};

export default SidePanelWidget;
