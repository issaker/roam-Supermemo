import { RecordUid } from '~/models/session';

export type QueueEntry = {
  uid: RecordUid;
  kind: 'normal' | 'lbl';
  childUids?: RecordUid[];
};

export type QueueSnapshot = {
  sessionId: string;
  tag: string;
  entries: QueueEntry[];
  preCompletedCount: number;
  createdAt: Date;
};

export type QueuePatch =
  | { type: 'complete'; uid: RecordUid }
  | {
      type: 'reinsert';
      uid: RecordUid;
      afterIndex: number;
      offset: number;
      reason: 'forgot' | 'lbl-next';
    };

export type EffectiveQueue = {
  uids: RecordUid[];
  completedUids: Set<RecordUid>;
  preCompletedCount: number;
  uniqueCount: number;
};

export type CardSet = {
  due: RecordUid[];
  new: RecordUid[];
  completed: RecordUid[];
  lblMeta: Record<RecordUid, RecordUid[]>;
};
