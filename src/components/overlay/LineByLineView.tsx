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

const NOOP = () => {};

interface LineByLineViewProps {
  currentCardRefUid: string;
  childUidsList: string[];
  lineByLineRevealedCount: number;
  lineByLineCurrentChildIndex: number;
  childSessionData: Record<string, Session>;
  showBreadcrumbs: boolean;
  showAnswers: boolean;
  currentChildAlgorithm: SchedulingAlgorithm;
  dueChildCount: number;
  parentBlockInfo: import('~/queries').BlockInfo;
}

const LineByLineView = ({
  currentCardRefUid,
  childUidsList,
  lineByLineRevealedCount,
  lineByLineCurrentChildIndex,
  childSessionData,
  showBreadcrumbs,
  showAnswers,
  currentChildAlgorithm,
  dueChildCount,
  parentBlockInfo,
}: LineByLineViewProps) => {

  return (
    <>
      <CardBlock
        refUid={currentCardRefUid}
        showAnswers={true}
        breadcrumbs={parentBlockInfo.breadcrumbs}
        showBreadcrumbs={showBreadcrumbs}
        onRenderComplete={NOOP}
        hideChildren={true}
      />
      <LineByLineSeparator>
        {lineByLineCurrentChildIndex >= childUidsList.length
          ? `Complete ✓ (${dueChildCount} due)`
          : `Line ${lineByLineCurrentChildIndex + 1} / ${
              childUidsList.length
            } (${dueChildCount} due)`}
      </LineByLineSeparator>
      {childUidsList.slice(0, lineByLineRevealedCount).map((uid, index) => {
        const isCurrentLine = index === lineByLineCurrentChildIndex;
        const childSession = childSessionData[uid];
        const isMastered = isSessionMastered(childSession);
        const isCurrentGrading =
          isCurrentLine && isGradingAlgorithm(currentChildAlgorithm) && !isMastered;
        return (
          <LineByLineItem key={uid} $isCurrent={isCurrentLine} $isMastered={!!isMastered}>
            <CardBlock
              refUid={uid}
              showAnswers={isCurrentGrading ? showAnswers : isMastered || showAnswers}
              breadcrumbs={[]}
              showBreadcrumbs={false}
              onRenderComplete={NOOP}
              skipExpand={!isCurrentLine}
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
