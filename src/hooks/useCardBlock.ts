import * as React from 'react';
import useBlockInfo from '~/hooks/useBlockInfo';
import {
  Session,
  SchedulingAlgorithm,
  DEFAULT_REVIEW_CONFIG,
  getSessionAlgorithm,
  isGradingAlgorithm,
} from '~/models/session';

const CLOZE_PATTERN = /\{.+?\}/;

const useCardBlock = (
  refUid: string | undefined,
  session: Session | undefined,
  fallbackAlgorithm?: SchedulingAlgorithm
) => {
  const { blockInfo } = useBlockInfo({ refUid: refUid || '' });
  const hasBlockChildren = !!blockInfo.children && !!blockInfo.children.length;

  const hasCloze = hasBlockChildren || CLOZE_PATTERN.test(blockInfo.string || '');

  const algorithm = React.useMemo<SchedulingAlgorithm>(
    () => getSessionAlgorithm(session, fallbackAlgorithm ?? DEFAULT_REVIEW_CONFIG.algorithm),
    [session, fallbackAlgorithm]
  );

  const defaultShowAnswers = React.useMemo(() => {
    if (!isGradingAlgorithm(algorithm)) return true;
    if (hasCloze) return false;
    return true;
  }, [algorithm, hasCloze]);

  const [overrideMap, setOverrideMap] = React.useState<Record<string, boolean>>({});

  const setShowAnswers = React.useCallback((show: boolean) => {
    if (!refUid) return;
    setOverrideMap((prev) => {
      if (prev[refUid] === show) return prev;
      return { ...prev, [refUid]: show };
    });
  }, [refUid]);

  const showAnswersOverride = refUid ? (overrideMap[refUid] ?? false) : false;
  const showAnswers = showAnswersOverride || defaultShowAnswers;

  return {
    blockInfo,
    hasBlockChildren,
    hasCloze,
    showAnswers,
    setShowAnswers,
    algorithm,
  };
};

export default useCardBlock;
