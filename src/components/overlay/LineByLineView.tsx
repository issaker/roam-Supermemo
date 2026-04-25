import * as React from 'react';
import styled from '@emotion/styled';
import CardBlock from '~/components/overlay/CardBlock';
import { colors } from '~/theme';
import {
  Session,
  SchedulingAlgorithm,
  isGradingAlgorithm,
  isSessionMastered,
} from '~/models/session';
import { getLblQueueState } from '~/models/practice';
import useBlockInfo from '~/hooks/useBlockInfo';

// Stable reference: prevent inline functions from invalidating React.memo
const NOOP = () => {};

interface LineByLineViewProps {
  currentCardRefUid: string;
  childUidsList: string[];
  lineByLineRevealedCount: number;
  lineByLineCurrentChildIndex: number;
  childSessionData: Record<string, Session>;
  setHasCloze: (_hasCloze: boolean) => void;
  showBreadcrumbs: boolean;
  autoCollapseBlocks: boolean;
  showAnswers: boolean;
  currentChildAlgorithm: SchedulingAlgorithm;
  setChildHasBlockChildren: (_hasBlockChildren: boolean) => void;
  setChildHasCloze: (_hasCloze: boolean) => void;
}

const LineByLineView = ({
  currentCardRefUid,
  childUidsList,
  lineByLineRevealedCount,
  lineByLineCurrentChildIndex,
  childSessionData,
  setHasCloze,
  showBreadcrumbs,
  autoCollapseBlocks,
  showAnswers,
  currentChildAlgorithm,
  setChildHasBlockChildren,
  setChildHasCloze,
}: LineByLineViewProps) => {
  const { blockInfo } = useBlockInfo({ refUid: currentCardRefUid });

  const currentChildUid = childUidsList[lineByLineCurrentChildIndex] || '';
  const { blockInfo: currentChildBlockInfo } = useBlockInfo({ refUid: currentChildUid });
  const currentChildHasBlockChildren = !!currentChildBlockInfo.children && !!currentChildBlockInfo.children.length;

  React.useEffect(() => {
    setChildHasBlockChildren(currentChildHasBlockChildren);
  }, [currentChildHasBlockChildren, setChildHasBlockChildren]);

  const { dueChildCount: dueCount } = React.useMemo(
    () => getLblQueueState(childUidsList, childSessionData),
    [childUidsList, childSessionData]
  );

  return (
    <>
      <CardBlock
        refUid={currentCardRefUid}
        showAnswers={true}
        setHasCloze={setHasCloze}
        breadcrumbs={blockInfo.breadcrumbs}
        showBreadcrumbs={showBreadcrumbs}
        onRenderComplete={NOOP}
        hideChildren={true}
      />
      <LineByLineSeparator>
        {lineByLineCurrentChildIndex >= childUidsList.length
          ? `Complete ✓ (${dueCount} due)`
          : `Line ${lineByLineCurrentChildIndex + 1} / ${childUidsList.length} (${dueCount} due)`}
      </LineByLineSeparator>
      {childUidsList.slice(0, lineByLineRevealedCount).map((uid, index) => {
        const isCurrentLine = index === lineByLineCurrentChildIndex;
        const childSession = childSessionData[uid];
        const isMastered = isSessionMastered(childSession);
        const isCurrentGrading = isCurrentLine && isGradingAlgorithm(currentChildAlgorithm) && !isMastered;
        return (
          <LineByLineItem key={uid} $isCurrent={isCurrentLine} $isMastered={!!isMastered}>
            <CardBlock
              refUid={uid}
              showAnswers={isCurrentGrading ? showAnswers : true}
              setHasCloze={isCurrentLine ? setChildHasCloze : NOOP}
              breadcrumbs={[]}
              showBreadcrumbs={false}
              onRenderComplete={NOOP}
              autoExpand={isCurrentLine || !autoCollapseBlocks}
            />
          </LineByLineItem>
        );
      })}
    </>
  );
};

const LineByLineSeparator = styled.div`
  font-size: 11px;
  opacity: 0.5;
  text-align: center;
  padding: 4px 0;
  border-top: 1px dashed ${colors.borderSubtle};
  margin-top: 8px;
`;

const LineByLineItem = styled.div<{ $isCurrent: boolean; $isMastered: boolean }>`
  border-left: 3px solid
    ${(props) =>
      props.$isCurrent
        ? colors.lineByLineCurrentBorder
        : props.$isMastered
        ? colors.lineByLineMasteredBorder
        : colors.borderSubtle};
  padding-left: 8px;
  margin-left: 4px;
  margin-top: 4px;
  opacity: ${(props) => (props.$isMastered && !props.$isCurrent ? 0.6 : 1)};
`;

export default React.memo(LineByLineView);
