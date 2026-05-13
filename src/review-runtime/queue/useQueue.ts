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

// 缓存版本号：结构变更时递增，旧缓存自动作废
const PERSIST_VERSION = 1;

type PersistedQueue = {
  version: number;
  uids: RecordUid[];
  removedUids: RecordUid[];
};

const loadPersistedQueue = (queueId: string): PersistedQueue | null => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + queueId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== PERSIST_VERSION || !Array.isArray(parsed?.uids)) return null;
    return {
      version: parsed.version,
      uids: parsed.uids,
      removedUids: Array.isArray(parsed.removedUids) ? parsed.removedUids : [],
    };
  } catch {
    return null;
  }
};

const savePersistedQueue = (queueId: string, state: QueueState) => {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + queueId,
      JSON.stringify({ version: PERSIST_VERSION, uids: state.uids, removedUids: state.removedUids })
    );
  } catch (e) {
    console.warn('Memo: Failed to persist queue state', e);
  }
};

const cleanStaleQueueKeys = (today: string) => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      if (!key.includes(today)) {
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
 * 快照截停 + 帧间补丁
 *
 * 每个牌组独立管理：queueId = "{date}-{tag}"，切换牌组 = 切换 queueId。
 *
 * 生命周期：
 *   访问牌组 → 无缓存：从 cardSet 构建全量快照（一次性排序）
 *          → 有缓存：从 localStorage 恢复（含补丁修改）
 *   操作牌组 → reinsert / append / removedUids（补丁层修改快照）
 *   切换牌组 → 切到另一个 queueId，重复上述流程
 *
 * 遮罩：quotaTrim + blacklist 在 app.tsx 构建 cardSet 时完成；
 *       removedUids 由 useQueue 运行时管理。
 */

export const useQueue = (cardSet: CardSet | null, queueId: string) => {
  const queueIdRef = React.useRef(queueId);
  const stateRef = React.useRef<QueueState>({ uids: [], removedUids: [] });

  const [store, setStore] = React.useState<Record<string, QueueState>>({});

  queueIdRef.current = queueId;

  const state: QueueState = store[queueId] || { uids: [], removedUids: [] };
  stateRef.current = state;

  const hasCards =
    cardSet && cardSet.due.length + cardSet.new.length + cardSet.completed.length > 0;

  // ====== 快照初始化：首次访问牌组 → 建快照 ======

  React.useEffect(() => {
    if (store[queueId]) return;
    const persisted = loadPersistedQueue(queueId);
    const initial: QueueState = persisted
      ? persisted
      : cardSet
        ? { uids: buildInitialUids(cardSet), removedUids: [] }
        : { uids: [], removedUids: [] };
    setStore((prev) => {
      if (prev[queueId]) return prev;
      return { ...prev, [queueId]: initial };
    });
  }, [queueId]);

  // ====== 异步数据到达：cardSet 首次有数据 → 补建快照 ======

  React.useEffect(() => {
    if (!hasCards) return;
    setStore((prev) => {
      const s = prev[queueId];
      if (!s || s.uids.length > 0) return prev;
      return { ...prev, [queueId]: { uids: buildInitialUids(cardSet!), removedUids: [] } };
    });
  }, [queueId, hasCards]);

  // ====== 补丁写入口 ======

  const updateState = (updater: (prev: QueueState) => QueueState) => {
    setStore((prev) => {
      const qId = queueIdRef.current;
      const current = prev[qId];
      if (!current) return prev;
      const next = updater(current);
      if (next === current) return prev;
      return { ...prev, [qId]: next };
    });
  };

  // ====== 清理旧缓存（仅挂载时一次） ======

  const today = queueId.slice(0, 10);
  React.useEffect(() => {
    cleanStaleQueueKeys(today);
  }, [today]);

  // ====== 补丁层：日内新增卡片追加队尾 ======

  React.useEffect(() => {
    if (!hasCards) return;
    updateState((prev) => {
      const existingSet = new Set(prev.uids);
      const allCardUids = [...cardSet!.completed, ...cardSet!.due, ...cardSet!.new];
      const newUids = allCardUids.filter((uid) => !existingSet.has(uid));
      if (newUids.length === 0) return prev;
      return { ...prev, uids: [...prev.uids, ...newUids] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, hasCards]);

  // ====== 遮罩层：removedUids ======

  const removedUidsSet = React.useMemo(() => new Set(state.removedUids), [state.removedUids]);

  // ====== 展示队列 ======

  const uids = React.useMemo(() => {
    return state.uids.filter((uid) => !removedUidsSet.has(uid));
  }, [state.uids, removedUidsSet]);

  // ====== 补丁层：reinsert（插队） ======

  const reinsert = React.useCallback((uid: RecordUid, afterUid: RecordUid, offset: number) => {
    updateState((prev) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== 遮罩层：checkDeleted ======

  const checkDeleted = React.useCallback(async () => {
    const currentUids = stateRef.current.uids;
    if (!currentUids.length) return;
    const deleted = await findDeletedUids(currentUids);
    updateState((prev) => {
      const newRemoved = Array.from(new Set([...prev.removedUids, ...deleted]));
      if (newRemoved.length === prev.removedUids.length) return prev;
      return { ...prev, removedUids: newRemoved };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (state.uids.length > 0) {
      checkDeleted();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, state.uids]);

  // ====== 持久化 ======

  React.useEffect(() => {
    const s = store[queueId];
    if (!s || !s.uids.length) return;
    savePersistedQueue(queueId, s);
  }, [queueId, store]);

  return { uids, reinsert, checkDeleted };
};