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

/**
 * showAnswer 全局性质：
 * - 评分算法(SM2)默认隐藏，非评分算法(PROGRESSIVE/FIXED_TIME)默认展示
 * - refUid 变化（翻页/导航）→ 自动清除旧卡片覆盖
 * - resetKey 变化（重插入/undo/换算法）→ 自动清除当前卡片覆盖
 *
 * 外部无需散落 setShowAnswers(false) 调用，所有重置由本 hook 内部自动处理。
 */
const useCardBlock = (
  refUid: string | undefined,
  session: Session | undefined,
  fallbackAlgorithm?: SchedulingAlgorithm,
  resetKey?: number
) => {
  const { blockInfo } = useBlockInfo({ refUid: refUid || '' });
  const hasBlockChildren = !!blockInfo.children && !!blockInfo.children.length;

  const hasCloze = hasBlockChildren || CLOZE_PATTERN.test(blockInfo.string || '');

  const algorithm = React.useMemo<SchedulingAlgorithm>(
    () => getSessionAlgorithm(session, fallbackAlgorithm ?? DEFAULT_REVIEW_CONFIG.algorithm),
    [session, fallbackAlgorithm]
  );

  const [overrideMap, setOverrideMap] = React.useState<Record<string, boolean>>({});

  const prevRefUidRef = React.useRef<string | undefined>(refUid);

  // refUid 变化时清除旧卡片覆盖，确保回访时答案默认隐藏
  React.useEffect(() => {
    const prevUid = prevRefUidRef.current;
    prevRefUidRef.current = refUid;
    if (prevUid && prevUid !== refUid) {
      setOverrideMap((prev) => {
        if (!(prevUid in prev)) return prev;
        const next = { ...prev };
        delete next[prevUid];
        return next;
      });
    }
  }, [refUid]);

  const prevResetKeyRef = React.useRef<number | undefined>(resetKey);

  // resetKey 变化（同一卡片被"刷新"）时清除当前卡片覆盖
  React.useEffect(() => {
    if (resetKey === undefined || !refUid) return;
    const prevKey = prevResetKeyRef.current;
    prevResetKeyRef.current = resetKey;
    if (prevKey !== resetKey) {
      setOverrideMap((prev) => {
        if (!(refUid in prev)) return prev;
        const next = { ...prev };
        delete next[refUid];
        return next;
      });
    }
  }, [resetKey, refUid]);

  const setShowAnswers = React.useCallback(
    (show: boolean) => {
      if (!refUid) return;
      setOverrideMap((prev) => {
        if (prev[refUid] === show) return prev;
        return { ...prev, [refUid]: show };
      });
    },
    [refUid]
  );

  const showAnswers = refUid ? overrideMap[refUid] ?? !isGradingAlgorithm(algorithm) : false;

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
