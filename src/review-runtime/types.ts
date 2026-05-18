import { NewSession, RecordUid, Session } from '~/models/session';

export type LatestSessionRecord = Session | NewSession | undefined;

export type SessionFacts = {
  latestByUid: Record<RecordUid, LatestSessionRecord>;
  pendingByUid: Record<RecordUid, 'saving' | 'updatingConfig' | undefined>;
};

export type ReviewViewState = {
  currentIndex: number;
  focusedChildUid?: RecordUid;
  maxVisitedChildIndex: number;
};
