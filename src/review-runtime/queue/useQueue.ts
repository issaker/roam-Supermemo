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

const savePersistedQueue = (queueId: string, uids: RecordUid[], removedUids: RecordUid[]) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + queueId, JSON.stringify({ uids, removedUids }));
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
};

/**
 * 全量快照 + 两层遮罩 + 插入层
 *
 * ┌───────────────────┐
 * │  state.uids（快照） │  全量有序 uid 序列，每日首次构建，不可变基础
 * └─────────┬─────────┘
 *           │
 *   ┌───────┴───────┐
 *   │   插入层修改    │  reinsert(uid, afterUid) 用 uid 定位，不感知遮罩
 *   │  新卡片追加队尾  │
 *   └───────┬───────┘
 *           │
 *   ┌───────┴───────┐
 *   │   遮罩层过滤    │  纯展示过滤，不修改快照
 *   │ ① 配额遮罩     │  quotaAllowed：cardSet 的 due/new/completed 合集
 *   │ ② 黑名单遮罩   │  removedUidsMap：已删除 block 的 uid
 *   └───────┬───────┘
 *           │
 *           ▼
 *      展示队列 uids
 */

export const useQueue = (cardSet: CardSet | null, queueId: string, _tag: string) => {
  const [stateMap, setStateMap] = React.useState<Map<string, QueueState>>(() => {
    const persisted = loadPersistedQueue(queueId);
    if (persisted) {
      return new Map([[queueId, { uids: persisted.uids }]]);
    }
    return new Map();
  });
  const [removedUidsMap, setRemovedUidsMap] = React.useState<Map<string, Set<RecordUid>>>(() => {
    const persisted = loadPersistedQueue(queueId);
    if (persisted && persisted.removedUids.length > 0) {
      return new Map([[queueId, new Set(persisted.removedUids)]]);
    }
    return new Map();
  });

  const hasCards =
    cardSet && cardSet.due.length + cardSet.new.length + cardSet.completed.length > 0;

  // 懒初始化：localStorage 无缓存且 cardSet 非空时，从 cardSet 构建
  if (!stateMap.has(queueId) && hasCards) {
    const initialUids = buildInitialUids(cardSet!);
    setStateMap((prev) => {
      const next = new Map(prev);
      next.set(queueId, { uids: initialUids });
      return next;
    });
  }

  // 首次挂载时清理非当日的旧缓存
  React.useEffect(() => {
    cleanStaleQueueKeys(queueId);
  }, [queueId]);

  // 日内新增：cardSet 中出现的新 uid 追加到快照末尾
  React.useEffect(() => {
    if (!cardSet || !hasCards) return;
    setStateMap((prev) => {
      const state = prev.get(queueId);
      if (!state) {
        const allCardUids = [...cardSet.completed, ...cardSet.due, ...cardSet.new];
        const next = new Map(prev);
        next.set(queueId, { uids: allCardUids });
        return next;
      }
      const existingSet = new Set(state.uids);
      const allCardUids = [...cardSet.completed, ...cardSet.due, ...cardSet.new];
      const newUids = allCardUids.filter((uid) => !existingSet.has(uid));
      if (newUids.length === 0) return prev;
      const next = new Map(prev);
      next.set(queueId, { uids: [...state.uids, ...newUids] });
      return next;
    });
  }, [queueId, cardSet, hasCards]);

  // 配额遮罩集合：cardSet 中所有应展示的 uid
  const quotaAllowed = React.useMemo(() => {
    if (!cardSet) return new Set<RecordUid>();
    return new Set([...cardSet.completed, ...cardSet.due, ...cardSet.new]);
  }, [cardSet]);

  // 展示层：全量快照 → 配额遮罩 → 黑名单遮罩
  const uids = React.useMemo(() => {
    const state = stateMap.get(queueId);
    const removed = removedUidsMap.get(queueId);
    if (!state) return [];
    let result = state.uids;
    result = result.filter((uid) => quotaAllowed.has(uid));
    if (removed && removed.size > 0) {
      result = result.filter((uid) => !removed.has(uid));
    }
    return result;
  }, [queueId, stateMap, removedUidsMap, quotaAllowed]);

  const reinsert = React.useCallback(
    (uid: RecordUid, afterUid: RecordUid, offset: number) => {
      setStateMap((prev) => {
        const state = prev.get(queueId);
        if (!state) return prev;
        const nextUids = [...state.uids];

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

        const next = new Map(prev);
        next.set(queueId, { uids: nextUids });
        return next;
      });
    },
    [queueId]
  );

  const checkDeleted = React.useCallback(async () => {
    if (!queueId) return;
    const state = stateMap.get(queueId);
    if (!state || state.uids.length === 0) return;

    const deleted = await findDeletedUids(state.uids);

    setRemovedUidsMap((prev) => {
      const next = new Map(prev);
      if (deleted.length === 0) {
        next.delete(queueId);
      } else {
        next.set(queueId, new Set(deleted));
      }
      return next;
    });
  }, [queueId, stateMap]);

  React.useEffect(() => {
    const state = stateMap.get(queueId);
    if (state && state.uids.length > 0) {
      checkDeleted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, stateMap]);

  // 持久化：stateMap / removedUidsMap 变更时自动写入 localStorage
  React.useEffect(() => {
    const state = stateMap.get(queueId);
    if (!state) return;
    const removed = removedUidsMap.get(queueId);
    savePersistedQueue(queueId, state.uids, removed ? Array.from(removed) : []);
  }, [queueId, stateMap, removedUidsMap]);

  const removedUids = React.useMemo(() => {
    return removedUidsMap.get(queueId) ?? new Set<RecordUid>();
  }, [queueId, removedUidsMap]);

  console.log(
    'DEBUG useQueue return:',
    JSON.stringify({
      uids,
      hasCards,
      cardSetNew: cardSet?.new?.length,
      cardSetDue: cardSet?.due?.length,
      quotaSize: quotaAllowed.size,
      stateMapSize: stateMap.size,
    })
  );
  return { uids, removedUids, reinsert, checkDeleted };
};
