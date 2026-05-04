import * as React from 'react';
import { RecordUid } from '~/models/session';
import { CardSet, QueuePatch, QueueSnapshot } from './types';
import { applyPatches } from './applyPatches';
import { buildQueue } from './buildQueue';

type QueueStore = {
  snapshot: QueueSnapshot;
  patches: QueuePatch[];
  removedUids: Set<RecordUid>;
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

export const useQueue = (cardSet: CardSet | null, queueId: string, tag: string) => {
  const [storeMap, setStoreMap] = React.useState<Map<string, QueueStore>>(new Map());
  const [activeQueueId, setActiveQueueId] = React.useState('');

  const hasCards =
    cardSet && cardSet.due.length + cardSet.new.length + cardSet.completed.length > 0;
  const currentStore = activeQueueId ? storeMap.get(activeQueueId) : undefined;
  const needsSnapshot = !currentStore || currentStore.snapshot.entries.length === 0;

  if (queueId !== activeQueueId || (needsSnapshot && hasCards)) {
    if (queueId !== activeQueueId) {
      setActiveQueueId(queueId);
    }
    if (!storeMap.has(queueId) && hasCards) {
      const newSnapshot = buildQueue(cardSet!, queueId, tag);
      setStoreMap((prev) => {
        const next = new Map(prev);
        next.set(queueId, { snapshot: newSnapshot, patches: [], removedUids: new Set() });
        return next;
      });
    }
  }

  const activeStore = activeQueueId ? storeMap.get(activeQueueId) : undefined;
  const snapshot = activeStore?.snapshot ?? null;
  const patches = activeStore?.patches;
  const removedUids = activeStore?.removedUids;

  const effectiveQueue = React.useMemo(
    () => applyPatches(snapshot, patches ?? [], removedUids ?? new Set()),
    [snapshot, patches, removedUids]
  );

  const appendPatches = React.useCallback(
    (newPatches: QueuePatch[]) => {
      setStoreMap((prev) => {
        const store = prev.get(activeQueueId);
        if (!store) return prev;
        const next = new Map(prev);
        next.set(activeQueueId, {
          ...store,
          patches: [...store.patches, ...newPatches],
        });
        return next;
      });
    },
    [activeQueueId]
  );

  const complete = React.useCallback(
    (uid: RecordUid) => appendPatches([{ type: 'complete', uid }]),
    [appendPatches]
  );

  const reinsert = React.useCallback(
    (uid: RecordUid, afterIndex: number, offset: number, reason: 'forgot' | 'lbl-next') =>
      appendPatches([{ type: 'reinsert', uid, afterIndex, offset, reason }]),
    [appendPatches]
  );

  const checkDeleted = React.useCallback(async () => {
    if (!snapshot || !activeQueueId) return;
    const uids = snapshot.entries.map((e) => e.uid);
    const deleted = await findDeletedUids(uids);
    const newRemovedUids = new Set(deleted);
    setStoreMap((prev) => {
      const store = prev.get(activeQueueId);
      if (!store) return prev;
      const next = new Map(prev);
      next.set(activeQueueId, {
        ...store,
        removedUids: newRemovedUids,
      });
      return next;
    });
  }, [snapshot, activeQueueId]);

  React.useEffect(() => {
    if (snapshot && snapshot.entries.length > 0) {
      checkDeleted();
    }
  }, [snapshot, checkDeleted]);

  return { effectiveQueue, complete, reinsert, checkDeleted };
};
