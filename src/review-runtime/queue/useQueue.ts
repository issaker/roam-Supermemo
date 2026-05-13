import * as React from 'react';
import { RecordUid } from '~/models/session';
import { CardSet } from './types';

const STORAGE_PREFIX = 'roam-memo:queue:';

const buildInitialUids = (cardSet: CardSet): RecordUid[] => {
  const seen = new Set<RecordUid>();
  const uids: RecordUid[] = [];
  const add = (uid: RecordUid) => {
    if (seen.has(uid)) return;
    seen.add(uid);
    uids.push(uid);
  };
  cardSet.completed.forEach(add);
  cardSet.due.forEach(add);
  cardSet.new.forEach(add);
  return uids;
};

type PersistedQueue = {
  uids: RecordUid[];
  removedUids: RecordUid[];
};

const loadPersistedQueue = (queueId: string): PersistedQueue | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + queueId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.uids)) return null;
    return {
      uids: parsed.uids,
      removedUids: Array.isArray(parsed.removedUids) ? parsed.removedUids : [],
    };
  } catch {
    return null;
  }
};

const savePersistedQueue = (queueId: string, state: PersistedQueue) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + queueId, JSON.stringify(state));
  } catch (e) {
    console.warn('Memo: Failed to persist queue state', e);
  }
};

const cleanStaleQueueKeys = (currentQueueId: string) => {
  try {
    const todayPrefix = currentQueueId.slice(0, 10);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      if (!key.includes(todayPrefix)) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    console.warn('Memo: Failed to clean stale queue keys', e);
  }
};

const findDeletedUids = async (uids: string[]): Promise<string[]> => {
  if (!uids.length) return [];
  try {
    const existing = await window.roamAlphaAPI.q(
      `[:find ?uid :in $ [?uid ...] :where [?block :block/uid ?uid]]`,
      uids
    );
    const existingSet = new Set(existing.map((r: any[]) => r[0]));
    return uids.filter((uid) => !existingSet.has(uid));
  } catch {
    return [];
  }
};

type QueueState = {
  uids: RecordUid[];
  removedUids: RecordUid[];
};

/**
 * 快照截停策略 — 每日一次排序，之后仅响应用户操作（"帧间补丁"模式）
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  state.uids（快照）                                           │
 * │  每日首次构建时按 classifyAllCards 排序，写入 localStorage       │
 * │  之后不再重排序——分类变化（due→completed/scheduled）不改变快照   │
 * └───────────────────────────┬──────────────────────────────────┘
 *                             │
 *   ┌─────────────────────────┴─────────────────────────────┐
 *   │  补丁层（仅这些操作修改快照，类似帧间差分）               │
 *   │  ① reinsert：Forgot 重插入 / LBL 插队                   │
 *   │  ② append：日内新增卡片默认追加到队尾                     │
 *   └─────────────────────────┬─────────────────────────────┘
 *                             │
 *   ┌─────────────────────────┴─────────────────────────────┐
 *   │  遮罩层（纯展示过滤，不修改快照，用户可撤销）              │
 *   │  ① quotaTrim：每日配额限制（allocateDailyCards 截断）   │
 *   │  ② blacklist：黑名单牌组过滤（filterBlacklistedDecks）   │
 *   │  ③ removedUids：已删除 block 的 uid 隐藏（可撤回）       │
 *   └─────────────────────────┬─────────────────────────────┘
 *                             │
 *                             ▼
 *                        展示队列 uids
 */

export const useQueue = (cardSet: CardSet | null, queueId: string) => {
  const [state, setState] = React.useState<QueueState>(() => {
    const persisted = loadPersistedQueue(queueId);
    if (persisted) return persisted;
    if (cardSet) return { uids: buildInitialUids(cardSet), removedUids: [] };
    return { uids: [], removedUids: [] };
  });

  const hasCards =
    cardSet && cardSet.due.length + cardSet.new.length + cardSet.completed.length > 0;

  // 懒初始化：localStorage 无缓存且 cardSet 非空时，从 cardSet 构建（state 初始值未覆盖的情况）
  if (!state.uids.length && hasCards) {
    const initialUids = buildInitialUids(cardSet!);
    setState({ uids: initialUids, removedUids: [] });
  }

  // 首次挂载时清理非当日的旧缓存
  React.useEffect(() => {
    cleanStaleQueueKeys(queueId);
  }, [queueId]);

  // 补丁层 — 日内新增：cardSet 中出现的新 uid，追加到快照末尾
  React.useEffect(() => {
    if (!cardSet || !hasCards) return;
    setState((prev) => {
      const existingSet = new Set(prev.uids);
      const allCardUids = [...cardSet.completed, ...cardSet.due, ...cardSet.new];
      const newUids = allCardUids.filter((uid) => !existingSet.has(uid));
      if (newUids.length === 0) return prev;
      return { ...prev, uids: [...prev.uids, ...newUids] };
    });
  }, [queueId, cardSet, hasCards]);

  // 遮罩层 — quotaAllowed：快照中的 uid 全部可见
  const quotaAllowed = React.useMemo(() => new Set(state.uids), [state.uids]);

  const removedUidsSet = React.useMemo(() => new Set(state.removedUids), [state.removedUids]);

  // 展示层：快照 → quota 遮罩 → 删除遮罩
  const uids = React.useMemo(() => {
    return state.uids.filter((uid) => quotaAllowed.has(uid) && !removedUidsSet.has(uid));
  }, [state.uids, quotaAllowed, removedUidsSet]);

  // 补丁层 — reinsert：Forgot / LBL 插队操作
  const reinsert = React.useCallback((uid: RecordUid, afterUid: RecordUid, offset: number) => {
    setState((prev) => {
      const nextUids = [...prev.uids];

      const existingIndex = nextUids.indexOf(uid);

      let insertAt: number;
      const afterPos = nextUids.indexOf(afterUid);
      if (afterPos >= 0) {
        insertAt = Math.min(afterPos + 1 + offset, nextUids.length);
      } else if (existingIndex >= 0) {
        insertAt = Math.min(existingIndex + 1 + offset, nextUids.length);
      } else {
        insertAt = nextUids.length;
      }

      if (existingIndex >= 0) {
        nextUids.splice(existingIndex, 1);
        const adjustedInsertAt = existingIndex < insertAt ? insertAt - 1 : insertAt;
        nextUids.splice(adjustedInsertAt, 0, uid);
      } else {
        nextUids.splice(insertAt, 0, uid);
      }

      return { ...prev, uids: nextUids };
    });
  }, []);

  // 遮罩层 — checkDeleted：检测已被物理删除的 block，加入 removedUids
  const checkDeleted = React.useCallback(async () => {
    if (!state.uids.length) return;
    const deleted = await findDeletedUids(state.uids);
    setState((prev) => {
      const newRemoved = Array.from(new Set([...prev.removedUids, ...deleted]));
      if (newRemoved.length === prev.removedUids.length) return prev;
      return { ...prev, removedUids: newRemoved };
    });
  }, [state.uids]);

  React.useEffect(() => {
    if (state.uids.length > 0) {
      checkDeleted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, state.uids]);

  // 持久化：state 变更时自动写入 localStorage
  React.useEffect(() => {
    if (!state.uids.length) return;
    savePersistedQueue(queueId, state);
  }, [queueId, state]);

  return { uids, reinsert, checkDeleted };
};
