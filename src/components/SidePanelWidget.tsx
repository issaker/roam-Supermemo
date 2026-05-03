import * as Blueprint from '@blueprintjs/core';
import styled from '@emotion/styled';
import Tooltip from '~/components/Tooltip';
import { TagCardSets } from '~/models/practice';

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
  tagCardSets: TagCardSets;
}
const SidePanelWidget = ({ onClickCallback, tagCardSets }: SidePanelWidgetProps) => {
  const combinedDue = Object.values(tagCardSets).reduce((sum, cs) => sum + cs.dueUids.length, 0);
  const combinedNew = Object.values(tagCardSets).reduce((sum, cs) => sum + cs.newUids.length, 0);
  const allDoneToday = combinedDue + combinedNew === 0;

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
        {combinedDue > 0 && (
          <Tooltip content="Due" placement="top">
            <Tag active minimal intent="primary" className="text-center" data-testid="due-tag">
              {combinedDue}
            </Tag>
          </Tooltip>
        )}
        {combinedNew > 0 && (
          <Tooltip content="New" placement="top">
            <Tag active minimal intent="success" className="text-center ml-2" data-testid="new-tag">
              {combinedNew}
            </Tag>
          </Tooltip>
        )}
      </div>
    </Wrapper>
  );
};

export default SidePanelWidget;
