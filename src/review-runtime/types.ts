/**
 * review-runtime types
 *
 * The runtime has exactly two kinds of mutable state:
 *   1. SessionFacts  — one latest session per uid (source of truth)
 *   2. ViewState     — where the user is looking
 *
 * The primary queue is state, built once at session start from initialUids.
 * Completed cards are removed from the queue on data refresh, and currentIndex
 * is adjusted to maintain the user's position. Forgot and LBL-Next reinserts
 * splice duplicate entries directly into the queue state.
 */
import { Today } from '~/models/practice';
import { NewSession, RecordUid, Session } from '~/models/session';

export type LatestSessionRecord = Session | NewSession | undefined;

export type SessionFacts = {
  latestByUid: Record<RecordUid, LatestSessionRecord>;
  pendingByUid: Record<RecordUid, 'saving' | 'undoing' | 'updatingConfig' | undefined>;
};

export type DeckSnapshot = {
  candidateUids: RecordUid[];
  dueUids: RecordUid[];
  newUids: RecordUid[];
  completedUids: RecordUid[];
  availablePrimaryQueue: RecordUid[];
  statusSummary: {
    due: number;
    new: number;
    completed: number;
  };
  renderMode: Today['tags'][string]['renderMode'] | undefined;
  status: Today['tags'][string]['status'] | undefined;
};

export type ReviewViewState = {
  currentIndex: number;
  focusedChildUid?: RecordUid;
  maxVisitedChildIndex: number;
};
