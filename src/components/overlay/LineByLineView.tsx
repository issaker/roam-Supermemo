import * as React from 'react';
import styled from '@emotion/styled';
import CardBlock from '~/components/overlay/CardBlock';
import { colors } from '~/theme';
import { Session } from '~/models/session';
import useBlockInfo from '~/hooks/useBlockInfo';

// 稳定引用：避免内联函数导致 React.memo 失效
const NOOP = () => {};

interface LineByLineViewProps {
  currentCardRefUid: string;
  childUidsList: string[];
  lineByLineRevealedCount: number;
  lineByLineCurrentChildIndex: number;
  childSessionData: Record<string, Session>;
  setHasCloze: (hasCloze: boolean) => void;
  showBreadcrumbs: boolean;
}

const getDueChildCount = (
  childUidsList: string[],
  childSessionData: Record<string, Session>
): number => {
  const now = new Date();
  let count = 0;
  for (const uid of childUidsList) {
    const session = childSessionData[uid];
    if (!session || !session.nextDueDate || session.nextDueDate <= now) {
      count++;
    }
  }
  return count;
};

const LineByLineView = ({
  currentCardRefUid,
  childUidsList,
  lineByLineRevealedCount,
  lineByLineCurrentChildIndex,
  childSessionData,
  setHasCloze,
  showBreadcrumbs,
}: LineByLineViewProps) => {
  const { blockInfo } = useBlockInfo({ refUid: currentCardRefUid });

  const dueCount = React.useMemo(
    () => getDueChildCount(childUidsList, childSessionData),
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
        Line {lineByLineCurrentChildIndex + 1} / {childUidsList.length} ({dueCount} due)
      </LineByLineSeparator>
      {childUidsList.slice(0, lineByLineRevealedCount).map((uid, index) => {
        const isCurrentLine = index === lineByLineCurrentChildIndex;
        const childSession = childSessionData[uid];
        const isMastered =
          childSession && childSession.nextDueDate && childSession.nextDueDate > new Date();
        return (
          <LineByLineItem key={uid} $isCurrent={isCurrentLine} $isMastered={!!isMastered}>
            <CardBlock
              refUid={uid}
              showAnswers={true}
              setHasCloze={setHasCloze}
              breadcrumbs={[]}
              showBreadcrumbs={false}
              onRenderComplete={NOOP}
              hideChildren={!isCurrentLine}
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
