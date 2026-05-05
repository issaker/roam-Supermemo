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

  // refUid 变化时清除旧卡片覆盖，确保回访时答案默认隐藏
  const prevRefUidRef = React.useRef<string | undefined>(refUid);
  if (prevRefUidRef.current && prevRefUidRef.current !== refUid) {
    const oldUid = prevRefUidRef.current;
    setOverrideMap((prev) => {
      if (!(oldUid in prev)) return prev;
      const next = { ...prev };
      delete next[oldUid];
      return next;
    });
  }
  prevRefUidRef.current = refUid;

  // resetKey 变化（同一卡片被"刷新"）时清除当前卡片覆盖
  // 仅在卡片实际显示时同步 key，避免 refUid=undefined 的过渡渲染消耗掉 key 变化
  const prevResetKeyRef = React.useRef<number | undefined>(resetKey);
  if (resetKey !== undefined && prevResetKeyRef.current !== resetKey && refUid) {
    setOverrideMap((prev) => {
      if (!(refUid in prev)) return prev;
      const next = { ...prev };
      delete next[refUid];
      return next;
    });
  }
  if (refUid) {
    prevResetKeyRef.current = resetKey;
  }

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
