import { RecordUid } from '~/models/session';
import { CardSet, QueueEntry, QueueSnapshot } from './types';

export const buildQueue = (cardSet: CardSet, sessionId: string, tag: string): QueueSnapshot => {
  const seen = new Set<RecordUid>();
  const entries: QueueEntry[] = [];

  const addEntry = (uid: RecordUid) => {
    if (seen.has(uid)) return;
    seen.add(uid);
    entries.push({
      uid,
      kind: cardSet.lblMeta[uid] ? 'lbl' : 'normal',
      childUids: cardSet.lblMeta[uid],
    });
  };

  cardSet.completed.forEach(addEntry);
  cardSet.due.forEach(addEntry);
  cardSet.new.forEach(addEntry);

  return {
    sessionId,
    tag,
    entries,
    preCompletedCount: cardSet.completed.length,
    createdAt: new Date(),
  };
};
