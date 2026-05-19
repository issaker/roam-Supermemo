import { RecordUid } from '~/models/session';
import { CardSet, QueueState } from './types';

const STORAGE_PREFIX = 'roam-memo:queue:';
const PERSIST_VERSION = 1;

type PersistedQueue = {
  version: number;
  uids: RecordUid[];
  removedUids: RecordUid[];
};

export const loadPersistedQueue = (queueId: string): PersistedQueue | null => {
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

export const savePersistedQueue = (queueId: string, state: QueueState) => {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + queueId,
      JSON.stringify({ version: PERSIST_VERSION, uids: state.uids, removedUids: state.removedUids })
    );
  } catch (e) {
    console.warn('Memo: Failed to persist queue state', e);
  }
};

export const cleanStaleQueueKeys = (today: string) => {
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

export const findDeletedUids = async (uids: string[]): Promise<string[]> => {
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

export const applyReinsert = (
  prev: QueueState,
  uid: RecordUid,
  afterUid: RecordUid,
  offset: number
): QueueState => {
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
};

export const syncQueueWithCardSet = (prev: QueueState, cardSet: CardSet): QueueState => {
  const { uids, removedUids } = reconcileUids(prev.uids, prev.removedUids, cardSet);
  if (uids.length === prev.uids.length && removedUids.length === prev.removedUids.length) {
    return prev;
  }
  return { uids, removedUids };
};

// Only-add reconciliation: preserves existing queue order (review progress),
// appends cardSet UIDs that are missing. Never removes — cards already in the
// queue stay even if temporarily absent from cardSet (e.g. completed cards,
// scheduled LBL decks). Removed cards are tracked via removedUids, not by
// omitting from cardSet.
//
// completed 不加入 toAdd：已完成卡片通过评分从 due/new 移入 completed，
// 已在队列中无需重复添加；跨天场景下 cardSet.completed 可能包含过时数据，
// 排除可防止昨天的已完成卡片进入新一天的队列。同日重新打开时通过持久化
// 队列恢复已完成卡片（它们在 existingUids 中，不会被移除）。
export const reconcileUids = (
  existingUids: RecordUid[],
  existingRemoved: RecordUid[],
  cardSet: CardSet
): { uids: RecordUid[]; removedUids: RecordUid[] } => {
  const existingSet = new Set(existingUids);
  const toAdd = [...cardSet.due, ...cardSet.new].filter((uid) => !existingSet.has(uid));

  const cardSetUids = getCardSetUidSet(cardSet);
  const reconciledRemoved = existingRemoved.filter((uid) => !cardSetUids.has(uid));

  return {
    uids: [...existingUids, ...toAdd],
    removedUids: reconciledRemoved,
  };
};

export const getCardSetUidSet = (cardSet: CardSet): Set<RecordUid> =>
  new Set([...cardSet.completed, ...cardSet.due, ...cardSet.new]);

// 遮罩层截断：将队列中不在 cardSet 范围内的 UID 移除。
// 当用户调低 dailyLimit 或 weight 导致配额缩小时，
// allocateDailyCards 会从 tagCardSets 中移除超配额的 UID，
// 但 reconcileUids（only-add 设计）不会移除已在队列中的旧 UID。
// 此函数弥补这一缺口，确保遮罩层既能增也能减。
export const truncateQueueToCardSet = (
  prev: QueueState,
  cardSet: CardSet
): QueueState => {
  const cardSetUids = getCardSetUidSet(cardSet);
  const truncatedUids = prev.uids.filter((uid) => cardSetUids.has(uid));
  if (truncatedUids.length === prev.uids.length) return prev;
  return { ...prev, uids: truncatedUids };
};

// Effective queue: snapshot uids minus removedUids. No cardSet filtering —
// once a card enters the daily queue snapshot it stays until the user
// explicitly removes it or the session ends. Completed/scheduled cards
// remain visible for undo and review progress tracking.
export const computeEffectiveQueue = (
  uids: RecordUid[],
  removedUids: RecordUid[],
  _cardSet: CardSet
): RecordUid[] => {
  const removedSet = new Set(removedUids);
  return uids.filter((uid) => !removedSet.has(uid));
};

export const hasCardsInSet = (cardSet: CardSet): boolean =>
  cardSet.due.length + cardSet.new.length + cardSet.completed.length > 0;

export const computeQueueId = (selectedTag: string): string => {
  const today = new Date().toISOString().slice(0, 10);
  return `${today}-${selectedTag}`;
};

export const computeCardSet = (
  tagCardSets: import('~/models/practice').TagCardSets,
  selectedTag: string
): CardSet => {
  const tagData = tagCardSets[selectedTag];
  if (!tagData) return { due: [], new: [], completed: [], lblMeta: {} };
  return {
    due: tagData.dueUids,
    new: tagData.newUids,
    completed: tagData.completedUids,
    lblMeta: tagData.lblDeckMeta,
  };
};

export const computeTodayEnd = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
};
