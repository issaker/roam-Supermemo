import { RecordUid } from '~/models/session';
import { EffectiveQueue, QueuePatch, QueueSnapshot } from './types';

export const applyPatches = (
  snapshot: QueueSnapshot | null,
  patches: QueuePatch[]
): EffectiveQueue => {
  if (!snapshot)
    return { uids: [], completedUids: new Set(), preCompletedCount: 0, uniqueCount: 0 };

  const completedUids = new Set<RecordUid>();
  const reinserts: { uid: RecordUid; afterIndex: number; offset: number }[] = [];

  for (const patch of patches) {
    switch (patch.type) {
      case 'complete':
        completedUids.add(patch.uid);
        break;
      case 'reinsert':
        reinserts.push({ uid: patch.uid, afterIndex: patch.afterIndex, offset: patch.offset });
        break;
    }
  }

  const baseUids = snapshot.entries.map((e) => e.uid);
  const uids = [...baseUids];

  const sorted = [...reinserts].sort(
    (a, b) => b.afterIndex + 1 + b.offset - (a.afterIndex + 1 + a.offset)
  );

  for (const r of sorted) {
    const insertAt = Math.min(r.afterIndex + 1 + r.offset, uids.length);
    uids.splice(insertAt, 0, r.uid);
  }

  return {
    uids,
    completedUids,
    preCompletedCount: snapshot.preCompletedCount,
    uniqueCount: snapshot.entries.length,
  };
};
