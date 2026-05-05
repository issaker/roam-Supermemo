import { RecordUid } from '~/models/session';

export type CardSet = {
  due: RecordUid[];
  new: RecordUid[];
  completed: RecordUid[];
  lblMeta: Record<RecordUid, RecordUid[]>;
};
