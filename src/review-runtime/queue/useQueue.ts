import * as React from 'react';
import { RecordUid } from '~/models/session';
import { CardSet, QueuePatch, QueueSnapshot } from './types';
import { applyPatches } from './applyPatches';
import { buildQueue } from './buildQueue';

type QueueStore = {
  snapshot: QueueSnapshot;
  patches: QueuePatch[];
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
        next.set(queueId, { snapshot: newSnapshot, patches: [] });
        return next;
      });
    }
  }

  const activeStore = activeQueueId ? storeMap.get(activeQueueId) : undefined;
  const snapshot = activeStore?.snapshot ?? null;
  const patches = activeStore?.patches;

  const effectiveQueue = React.useMemo(
    () => applyPatches(snapshot, patches ?? []),
    [snapshot, patches]
  );

  const complete = React.useCallback(
    (uid: RecordUid) => {
      setStoreMap((prev) => {
        const store = prev.get(activeQueueId);
        if (!store) return prev;
        const next = new Map(prev);
        next.set(activeQueueId, {
          ...store,
          patches: [...store.patches, { type: 'complete', uid }],
        });
        return next;
      });
    },
    [activeQueueId]
  );

  const reinsert = React.useCallback(
    (uid: RecordUid, afterIndex: number, offset: number, reason: 'forgot' | 'lbl-next') => {
      setStoreMap((prev) => {
        const store = prev.get(activeQueueId);
        if (!store) return prev;
        const next = new Map(prev);
        next.set(activeQueueId, {
          ...store,
          patches: [...store.patches, { type: 'reinsert', uid, afterIndex, offset, reason }],
        });
        return next;
      });
    },
    [activeQueueId]
  );

  return { effectiveQueue, complete, reinsert };
};
