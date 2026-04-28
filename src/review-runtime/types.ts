/**
 * review-runtime types
 *
 * The runtime has exactly two kinds of mutable state:
 *   1. SessionFacts  — one latest session per uid (source of truth)
 *   2. ViewState     — where the user is looking and what's been reviewed
 *
 * The primary queue is a STATIC array generated once at session start.
 * Cards are never removed from the queue after grading.  The only
 * modifications are Forgot and LBL-Next reinserts (duplicate entries).
 * Navigation is purely index-based.
 */
import { Today } from '~/models/practice';
import { NewSession, RecordUid, Session } from '~/models/session';

export type LatestSessionRecord = Session | NewSession | undefined;

export type SessionFacts = {
  latestByUid: Record<RecordUid, LatestSessionRecord>;
  pendingByUid: Record<RecordUid, 'saving' | 'undoing' | 'updatingConfig' | undefined>;
};

export type RevisitDirective = {
  id: string;
  primaryUid: RecordUid;
  insertAtIndex: number;
  reason: 'forgot' | 'lbl-next';
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
  previousPrimaryUid?: RecordUid;
  focusedChildUid?: RecordUid;
  revisitDirectives: RevisitDirective[];
  maxVisitedChildIndex: number;
};
