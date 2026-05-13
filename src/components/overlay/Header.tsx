import * as Blueprint from '@blueprintjs/core';
import * as BlueprintSelect from '@blueprintjs/select';
import styled from '@emotion/styled';
import { SelectorItemBase } from './selectorStyles';
import * as dateUtils from '~/utils/date';
import Tooltip from '~/components/Tooltip';
import ButtonTags from '~/components/ButtonTags';
import {
  ALGORITHM_META,
  INTERACTION_META,
  SchedulingAlgorithm,
  InteractionStyle,
  getAlgorithmIntent,
} from '~/models/session';
import { MainContext } from '~/components/overlay/PracticeOverlay';
import { colors } from '~/theme';
import { useSafeContext } from '~/hooks/useSafeContext';
import { usePracticeSession } from '~/contexts/PracticeSessionContext';
import { useAlgorithmContext } from '~/hooks/useAlgorithmContext';

interface HeaderProps {
  onCloseCallback: () => void;
  onTagChange: (_tag: string) => void;
  className?: string;
  status: string | null;
  isDone: boolean;
  nextDueDate?: Date;
  onToggleBreadcrumbs: () => void;
  onSettingsClick: () => void;
}

const HeaderWrapper = styled.div`
  justify-content: space-between;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-wrap: normal;
  line-height: inherit;
  margin: 0;
  min-height: 50px;
  border-bottom: 1px solid ${colors.borderSubtle};

  @media (max-width: 768px) {
    .mobile-hide {
      display: none !important;
    }
  }
`;

const TagSelector = ({ tagsList, selectedTag, onTagChange }) => {
  return (
    <TagSelect
      items={tagsList}
      activeItem={selectedTag}
      filterable={false}
      itemRenderer={(tag, { handleClick, modifiers }) => {
        return (
          <TagSelectorItem
            text={tag}
            tagsList={tagsList}
            active={modifiers.active}
            key={tag}
            onClick={handleClick}
          />
        );
      }}
      onItemSelect={(tag) => {
        onTagChange(tag);
      }}
      popoverProps={{ minimal: true }}
    >
      <Blueprint.Button
        text={selectedTag}
        icon={selectedTag === 'DailyNote' ? 'calendar' : undefined}
        rightIcon="caret-down"
        minimal
        data-testid="tag-selector-cta"
      />
    </TagSelect>
  );
};
const TagSelect = BlueprintSelect.Select.ofType<string>();

const TagSelectorItemWrapper = styled(SelectorItemBase)`
  display: flex;
  justify-content: space-between;
  padding: 4px 6px;
`;

const Tag = styled(Blueprint.Tag)`
  &.bp3-tag {
    font-size: 11px;
    padding: 1px 3px;
    min-height: auto;
    min-width: auto;
  }
`;

const TagSelectorItem = ({ text, onClick, active, tagsList }) => {
  const { liveTagCardCounts } = usePracticeSession();
  const dueCount = liveTagCardCounts?.[text]?.dueCount ?? 0;
  const newCount = liveTagCardCounts?.[text]?.newCount ?? 0;

  const index = tagsList.indexOf(text);
  const placement = index === tagsList.length - 1 ? 'bottom' : 'top';

  return (
    <TagSelectorItemWrapper
      onClick={onClick}
      active={active}
      key={text}
      tabIndex={-1}
      data-testid="tag-selector-item"
      className="flex-col"
    >
      <div className="flex">
        <div className="flex items-center">
          {text === 'DailyNote' && (
            <Blueprint.Icon icon="calendar" size={11} style={{ marginRight: '4px' }} />
          )}
          {text}
        </div>
        <div className="ml-2">
          {dueCount > 0 && (
            <Tooltip content="Due" placement={placement}>
              <Tag
                active
                minimal
                intent="primary"
                className="text-center"
                data-testid="tag-selector-due"
              >
                {dueCount}
              </Tag>
            </Tooltip>
          )}
          {newCount > 0 && (
            <Tooltip content="New" placement={placement}>
              <Tag
                active
                minimal
                intent="success"
                className="text-center ml-2"
                data-testid="tag-selector-new"
              >
                {newCount}
              </Tag>
            </Tooltip>
          )}
        </div>
      </div>
    </TagSelectorItemWrapper>
  );
};

const StatusBadge = ({ status, nextDueDate, isCramming }) => {
  if (isCramming) {
    return (
      <Tooltip content="Reviews don't affect scheduling" placement="left">
        <Blueprint.Tag intent="none">Cramming</Blueprint.Tag>
      </Tooltip>
    );
  }
  switch (status) {
    case 'new':
      return (
        <Blueprint.Tag intent="success" minimal>
          New
        </Blueprint.Tag>
      );

    case 'dueToday':
      return (
        <Blueprint.Tag intent="primary" minimal>
          Due Today
        </Blueprint.Tag>
      );

    case 'pastDue': {
      const timeAgo = dateUtils.customFromNow(nextDueDate);
      return (
        <Blueprint.Tag intent="warning" title={`Due ${timeAgo}`} minimal>
          Past Due
        </Blueprint.Tag>
      );
    }
    default:
      return null;
  }
};

const ModeBadge = ({
  algorithm,
  interaction,
}: {
  algorithm?: SchedulingAlgorithm;
  interaction?: InteractionStyle;
}) => {
  if (!algorithm && !interaction) return null;

  const algoMeta = algorithm ? ALGORITHM_META[algorithm] : undefined;
  const interactionMeta = interaction ? INTERACTION_META[interaction] : undefined;
  const groupIntent = getAlgorithmIntent(algorithm);
  const interactionLabel = interactionMeta?.label;

  return (
    <>
      {algoMeta && (
        <Blueprint.Tag intent={groupIntent} minimal>
          {algoMeta.label}
        </Blueprint.Tag>
      )}
      {interactionLabel && interaction !== InteractionStyle.NORMAL && (
        <Blueprint.Tag intent="none" minimal style={{ marginLeft: '2px' }}>
          {interactionLabel === 'Line by Line' ? 'LBL' : interactionLabel}
        </Blueprint.Tag>
      )}
    </>
  );
};

const BoxIcon = styled(Blueprint.Icon)`
  margin-right: 5px !important;
`;

const BreadcrumbTooltipContent = ({ showBreadcrumbs }) => {
  return (
    <div className="flex align-center">
      {`${showBreadcrumbs ? 'Hide' : 'Show'} Breadcrumbs`}
      <span>
        <ButtonTags kind="light" className="mx-2">
          B
        </ButtonTags>
      </span>
    </div>
  );
};

const Header = ({
  onCloseCallback,
  onTagChange,
  className,
  status,
  isDone,
  nextDueDate,
  onToggleBreadcrumbs,
  onSettingsClick,
}: HeaderProps) => {
  const { selectedTag, tagsList, isCramming, settings } = usePracticeSession();
  const { algorithm, interaction } = useAlgorithmContext();
  const { showBreadcrumbs } = settings;
  const { currentIndex, cardQueueLength } = useSafeContext(MainContext);

  const currentDisplayCount = currentIndex + 1;

  const toggleBreadcrumbs = () => {
    onToggleBreadcrumbs();
  };

  return (
    <HeaderWrapper className={className} tabIndex={0}>
      <div className="flex items-center">
        <BoxIcon icon="box" size={14} />
        <div tabIndex={-1}>
          <TagSelector tagsList={tagsList} selectedTag={selectedTag} onTagChange={onTagChange} />
        </div>
      </div>
      <div className="flex items-center justify-end">
        {!isDone && (
          <div onClick={toggleBreadcrumbs} className="px-1 cursor-pointer">
            <Tooltip
              content={<BreadcrumbTooltipContent showBreadcrumbs={showBreadcrumbs} />}
              placement="left"
            >
              <Blueprint.Icon
                icon={showBreadcrumbs ? 'eye-open' : 'eye-off'}
                className={showBreadcrumbs ? 'opacity-100' : 'opacity-60'}
              />
            </Tooltip>
          </div>
        )}
        <div onClick={onSettingsClick} className="px-1 cursor-pointer">
          <Tooltip content="Settings" placement="left">
            <Blueprint.Icon icon="cog" />
          </Tooltip>
        </div>
        <span data-testid="mode-badge" className="mobile-hide">
          {!isDone && <ModeBadge algorithm={algorithm} interaction={interaction} />}
        </span>
        <span data-testid="status-badge" className="mobile-hide">
          <StatusBadge
            status={status}
            nextDueDate={nextDueDate}
            isCramming={isCramming}
            data-testid="status-badge"
          />
        </span>
        <span className="text-sm mx-2 font-medium">
          <span data-testid="display-count-current">
            {isDone ? cardQueueLength : currentDisplayCount}
          </span>
          <span className="opacity-50 mx-1">/</span>
          <span className="opacity-50" data-testid="display-count-total">
            {cardQueueLength}
          </span>
        </span>
        <button
          aria-label="Close"
          className="bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross"
          onClick={onCloseCallback}
        ></button>
      </div>
    </HeaderWrapper>
  );
};

export default Header;
