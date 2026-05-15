import type {
  NewSession,
  RecordUid,
  Session,
  Records,
  SchedulingAlgorithm,
  InteractionStyle,
  FixedTimeUnit,
} from '~/models/session';
import type { TagCardSets } from '~/models/practice';
import type { Settings } from '~/hooks/useSettings';

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

export type CardSet = {
  due: RecordUid[];
  new: RecordUid[];
  completed: RecordUid[];
  lblMeta: Record<RecordUid, RecordUid[]>;
};

export type QueueState = {
  uids: RecordUid[];
  removedUids: RecordUid[];
};

export type ReviewState = {
  facts: SessionFacts;
  viewState: ReviewViewState;
  queues: Record<string, QueueState>;
  selectedTag: string;
  isCramming: boolean;
  rawTagCardSets: TagCardSets;
  tagCardSets: TagCardSets;
  dataPageTitle: string;
  practiceData: Records;
  settings: Settings;
  tagsList: string[];
};

export type GradeCardInput = {
  targetUid: RecordUid;
  grade: number;
  algorithm: SchedulingAlgorithm;
  interaction: InteractionStyle;
  isChild: boolean;
  parentUid?: RecordUid;
  childUidsList?: string[];
  childSessionData?: Record<string, Session>;
  currentChildIsLblNext?: boolean;
  lineByLineCurrentChildIndex?: number;
  forgotReinsertOffset: number;
  lblNextReinsertOffset: number;
  baseCardData?: Session;
  currentCardData?: Session;
  fixed_multiplier?: number;
  fixed_unit?: FixedTimeUnit;
};

export type GradeCardPayload = {
  sessions: Partial<Records>;
  targetUid: RecordUid;
  grade: number;
  isChild: boolean;
  parentUid?: RecordUid;
  forgotReinsertOffset: number;
  lblNextReinsertOffset: number;
  currentChildIsLblNext?: boolean;
  lineByLineCurrentChildIndex?: number;
  childUidsList?: string[];
  updatedChildSessionsForParent?: Record<string, Session>;
};

export type ChangeConfigInput = {
  targetUid: RecordUid;
  isChild: boolean;
  algorithm?: SchedulingAlgorithm;
  interaction?: InteractionStyle;
  childSessionData?: Record<string, Session>;
};

export type ChangeConfigPayload = {
  sessions: Partial<Records>;
  targetUid: RecordUid;
};

export type ReviewAction =
  | { type: 'UPSERT_SESSIONS'; sessions: Partial<Records> }
  | { type: 'SET_PENDING'; uid: RecordUid; pendingState: SessionFacts['pendingByUid'][string] }
  | { type: 'FOCUS_BY_OFFSET'; offset: number }
  | { type: 'FOCUS_TO_UID'; uid: string }
  | { type: 'RESET_TO_FIRST' }
  | { type: 'NAVIGATE_NEXT_UNPRACTICED' }
  | { type: 'SET_FOCUSED_CHILD'; childUid?: RecordUid }
  | { type: 'RESET_CHILD_VIEW' }
  | { type: 'SET_MAX_VISITED_CHILD_INDEX'; index: number }
  | { type: 'CHANGE_TAG'; tag: string }
  | { type: 'SET_CRAMMING'; value: boolean }
  | { type: 'SET_TAG_CARD_SETS'; tagCardSets: TagCardSets; practiceData: Records }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<Settings> }
  | { type: 'SET_DATA_PAGE_TITLE'; dataPageTitle: string }
  | { type: 'QUEUE_INIT'; queueId: string; uids: RecordUid[]; removedUids: RecordUid[] }
  | { type: 'QUEUE_REINSERT'; queueId: string; uid: RecordUid; afterUid: RecordUid; offset: number }
  | { type: 'QUEUE_ADD_REMOVED'; queueId: string; uids: RecordUid[] }
  | { type: 'GRADE_CARD'; payload: GradeCardPayload }
  | { type: 'CHANGE_CONFIG'; payload: ChangeConfigPayload };
