import { RecordUid } from '~/models/session';
import { CardSet, QueueState } from './types';

const STORAGE_PREFIX = 'roam-memo:queue:';
const PERSIST_VERSION = 1;

type PersistedQueue = {
  version: number;
  uids: RecordUid[];
  removedUids: RecordUid[];
};

export const buildInitialUids = (cardSet: CardSet): RecordUid[] => {
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

export const applyReinsert = (prev: QueueState, uid: RecordUid, afterUid: RecordUid, offset: number): QueueState => {
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
  const validUidSet = new Set([...cardSet.completed, ...cardSet.due, ...cardSet.new]);
  const prunedUids = prev.uids.filter((uid) => validUidSet.has(uid));
  const newUids = Array.from(validUidSet).filter((uid) => !prunedUids.includes(uid));
  const mergedUids = [...prunedUids, ...newUids];
  const changed = mergedUids.length !== prev.uids.length || newUids.length > 0;
  if (!changed) return prev;
  return { ...prev, uids: mergedUids };
};

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
  const today = new Date().toISOString().slice(0, 10);
  const [y, m, d] = today.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59);
};
