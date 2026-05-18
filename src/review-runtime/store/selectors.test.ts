import {
  selectEffectiveQueue,
  selectCurrentCardRefUid,
  selectCurrentCardData,
  selectCardMeta,
  selectAlgorithm,
  selectInteraction,
  selectCardQueueLength,
  selectRemainingCount,
  selectCurrentRemainingPosition,
  selectIsDone,
  selectCompletedCount,
  selectSidebarCounts,
  selectTagCounts,
  selectRenderMode,
  deriveChildSessionMap,
} from './selectors';
import { ReviewState, SessionFacts } from './types';
import {
  Session,
  SchedulingAlgorithm,
  InteractionStyle,
  NewSession,
} from '~/models/session';
import { TagCardSets, RenderMode } from '~/models/practice';
import { defaultSettings } from '~/hooks/useSettings';
import { computeTodayEnd } from './queue-logic';

jest.mock('./queue-logic', () => {
  const actual = jest.requireActual('./queue-logic');
  return {
    ...actual,
    computeTodayEnd: jest.fn(),
  };
});

const mockedComputeTodayEnd = computeTodayEnd as jest.MockedFunction<
  typeof computeTodayEnd
>;

const FIXED_TODAY_END = new Date('2025-06-15T23:59:59Z');

beforeEach(() => {
  mockedComputeTodayEnd.mockReturnValue(FIXED_TODAY_END);
});

const queueIdForTag = (tag: string): string => {
  const today = new Date().toISOString().slice(0, 10);
  return `${today}-${tag}`;
};

type TagCardSetValue = TagCardSets[string];

const makeTagCardSet = (
  partial: Partial<TagCardSetValue> = {}
): TagCardSetValue => ({
  dueUids: [],
  newUids: [],
  completedUids: [],
  renderMode: RenderMode.Normal,
  lblDeckMeta: {},
  ...partial,
});

const makeSession = (partial: Partial<Session> = {}): Session => ({
  algorithm: SchedulingAlgorithm.PROGRESSIVE,
  interaction: InteractionStyle.NORMAL,
  ...partial,
});

const makeNewSession = (partial: Partial<NewSession> = {}): NewSession => ({
  isNew: true,
  algorithm: SchedulingAlgorithm.PROGRESSIVE,
  interaction: InteractionStyle.NORMAL,
  ...partial,
});

const makeFacts = (
  latestByUid: SessionFacts['latestByUid'] = {}
): SessionFacts => ({
  latestByUid,
  pendingByUid: {},
});

const makeState = (partial: Partial<ReviewState> = {}): ReviewState => ({
  facts: makeFacts(),
  viewState: {
    currentIndex: 0,
    maxVisitedChildIndex: 0,
  },
  queues: {},
  selectedTag: 'memo',
  isCramming: false,
  rawTagCardSets: {},
  tagCardSets: {},
  dataPageTitle: 'roam/Supermemo',
  practiceData: {},
  settings: defaultSettings,
  tagsList: ['memo'],
  ...partial,
});

describe('selectEffectiveQueue', () => {
  it('returns filtered queue uids excluding removedUids and those outside cardSet', () => {
    const state = makeState({
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b', 'c', 'd'],
          removedUids: ['b'],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a', 'c'],
          newUids: ['d'],
          completedUids: [],
        }),
      },
    });

    const result = selectEffectiveQueue(state);
    expect(result).toEqual(['a', 'c', 'd']);
  });

  it('returns empty array when no queue exists for the computed queueId', () => {
    const state = makeState({
      selectedTag: 'memo',
      queues: {},
      tagCardSets: {},
    });

    expect(selectEffectiveQueue(state)).toEqual([]);
  });

  it('keeps uids not in cardSet (e.g. scheduled/completed cards)', () => {
    const state = makeState({
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b', 'x'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a'],
          newUids: [],
          completedUids: ['b'],
        }),
      },
    });

    expect(selectEffectiveQueue(state)).toEqual(['a', 'b', 'x']);
  });

  it('filters out removedUids but keeps uids absent from cardSet', () => {
    const state = makeState({
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b', 'c', 'd', 'e'],
          removedUids: ['c'],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a'],
          newUids: ['b'],
          completedUids: [],
        }),
      },
    });

    expect(selectEffectiveQueue(state)).toEqual(['a', 'b', 'd', 'e']);
  });
});

describe('selectCurrentCardRefUid', () => {
  it('returns uid at currentIndex in effective queue', () => {
    const state = makeState({
      viewState: { currentIndex: 1, maxVisitedChildIndex: 1 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b', 'c'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a', 'b', 'c'],
        }),
      },
    });

    expect(selectCurrentCardRefUid(state)).toBe('b');
  });

  it('returns undefined when currentIndex is out of bounds', () => {
    const state = makeState({
      viewState: { currentIndex: 5, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a', 'b'] }),
      },
    });

    expect(selectCurrentCardRefUid(state)).toBeUndefined();
  });

  it('returns undefined when queue is empty', () => {
    const state = makeState({
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      queues: {},
      tagCardSets: {},
    });

    expect(selectCurrentCardRefUid(state)).toBeUndefined();
  });

  it('returns undefined when currentIndex is negative', () => {
    const state = makeState({
      viewState: { currentIndex: -1, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectCurrentCardRefUid(state)).toBeUndefined();
  });
});

describe('selectCurrentCardData', () => {
  it('returns Session record for the current card', () => {
    const session: Session = makeSession({
      algorithm: SchedulingAlgorithm.SM2,
      nextDueDate: new Date('2025-06-10'),
      sm2_grade: 3,
      sm2_eFactor: 2.5,
    });

    const state = makeState({
      facts: makeFacts({ a: session }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectCurrentCardData(state)).toEqual(session);
  });

  it('returns NewSession record (no nextDueDate) — must NOT filter by nextDueDate', () => {
    const newSession: NewSession = makeNewSession({
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
    });

    const state = makeState({
      facts: makeFacts({ a: newSession }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ newUids: ['a'] }),
      },
    });

    const result = selectCurrentCardData(state);
    expect(result).toEqual(newSession);
    expect(result).not.toHaveProperty('nextDueDate');
  });

  it('returns undefined when no uid is at currentIndex', () => {
    const state = makeState({
      viewState: { currentIndex: 5, maxVisitedChildIndex: 0 },
      queues: {},
      tagCardSets: {},
    });

    expect(selectCurrentCardData(state)).toBeUndefined();
  });

  it('returns undefined when uid exists but has no session record', () => {
    const state = makeState({
      facts: makeFacts(),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectCurrentCardData(state)).toBeUndefined();
  });
});

describe('selectCardMeta', () => {
  it('returns meta from Session record with nextDueDate', () => {
    const dueDate = new Date('2025-06-10');
    const state = makeState({
      facts: makeFacts({
        a: makeSession({
          algorithm: SchedulingAlgorithm.SM2,
          interaction: InteractionStyle.LBL,
          nextDueDate: dueDate,
        }),
      }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    const meta = selectCardMeta(state);
    expect(meta).toEqual({
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      nextDueDate: dueDate,
    });
  });

  it('returns meta from NewSession (algorithm present, no nextDueDate)', () => {
    const state = makeState({
      facts: makeFacts({
        a: makeNewSession({
          algorithm: SchedulingAlgorithm.FIXED_TIME,
          interaction: InteractionStyle.NORMAL,
        }),
      }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ newUids: ['a'] }),
      },
    });

    const meta = selectCardMeta(state);
    expect(meta).toEqual({
      algorithm: SchedulingAlgorithm.FIXED_TIME,
      interaction: InteractionStyle.NORMAL,
      nextDueDate: undefined,
    });
  });

  it('returns undefined when no card data exists', () => {
    const state = makeState({
      facts: makeFacts(),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      queues: {},
      tagCardSets: {},
    });

    expect(selectCardMeta(state)).toBeUndefined();
  });

  it('defaults algorithm and interaction when record fields are undefined', () => {
    const state = makeState({
      facts: makeFacts({
        a: makeSession({
          algorithm: undefined as any,
          interaction: undefined as any,
          nextDueDate: new Date('2025-06-10'),
        }),
      }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    const meta = selectCardMeta(state);
    expect(meta?.algorithm).toBe(SchedulingAlgorithm.PROGRESSIVE);
    expect(meta?.interaction).toBe(InteractionStyle.NORMAL);
  });
});

describe('selectAlgorithm', () => {
  it('returns algorithm from session', () => {
    const state = makeState({
      facts: makeFacts({
        a: makeSession({ algorithm: SchedulingAlgorithm.SM2 }),
      }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectAlgorithm(state)).toBe(SchedulingAlgorithm.SM2);
  });

  it('returns algorithm from NewSession', () => {
    const state = makeState({
      facts: makeFacts({
        a: makeNewSession({ algorithm: SchedulingAlgorithm.FIXED_TIME }),
      }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ newUids: ['a'] }),
      },
    });

    expect(selectAlgorithm(state)).toBe(SchedulingAlgorithm.FIXED_TIME);
  });

  it('defaults to PROGRESSIVE when no card data', () => {
    const state = makeState({
      facts: makeFacts(),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      queues: {},
      tagCardSets: {},
    });

    expect(selectAlgorithm(state)).toBe(SchedulingAlgorithm.PROGRESSIVE);
  });
});

describe('selectInteraction', () => {
  it('returns interaction from session', () => {
    const state = makeState({
      facts: makeFacts({
        a: makeSession({ interaction: InteractionStyle.LBL }),
      }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectInteraction(state)).toBe(InteractionStyle.LBL);
  });

  it('defaults to NORMAL when no card data', () => {
    const state = makeState({
      facts: makeFacts(),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      queues: {},
      tagCardSets: {},
    });

    expect(selectInteraction(state)).toBe(InteractionStyle.NORMAL);
  });
});

describe('selectCardQueueLength', () => {
  it('returns effective queue length', () => {
    const state = makeState({
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b', 'c'],
          removedUids: ['b'],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a', 'c'],
        }),
      },
    });

    expect(selectCardQueueLength(state)).toBe(2);
  });

  it('returns 0 for empty queue', () => {
    const state = makeState({ queues: {}, tagCardSets: {} });
    expect(selectCardQueueLength(state)).toBe(0);
  });
});

describe('selectRemainingCount', () => {
  it('counts uncompleted cards in effective queue', () => {
    const completedSession = makeSession({
      nextDueDate: new Date('2025-12-01'),
      dateCreated: new Date('2025-06-15'),
    });
    const dueSession = makeSession({
      nextDueDate: new Date('2025-06-10'),
    });

    const state = makeState({
      facts: makeFacts({
        a: completedSession,
        b: dueSession,
        c: dueSession,
      }),
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b', 'c'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a', 'b', 'c'],
        }),
      },
    });

    const remaining = selectRemainingCount(state);
    expect(typeof remaining).toBe('number');
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 when queue is empty', () => {
    const state = makeState({ queues: {}, tagCardSets: {} });
    expect(selectRemainingCount(state)).toBe(0);
  });
});

describe('selectCurrentRemainingPosition', () => {
  it('returns position of current card among remaining uncompleted', () => {
    const state = makeState({
      facts: makeFacts({
        a: makeSession({ nextDueDate: new Date('2025-06-10') }),
        b: makeSession({ nextDueDate: new Date('2025-06-10') }),
      }),
      viewState: { currentIndex: 1, maxVisitedChildIndex: 1 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a', 'b'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a', 'b'],
        }),
      },
    });

    const position = selectCurrentRemainingPosition(state);
    expect(typeof position).toBe('number');
    expect(position).toBeGreaterThanOrEqual(0);
  });

  it('returns 0 when queue is empty', () => {
    const state = makeState({ queues: {}, tagCardSets: {} });
    expect(selectCurrentRemainingPosition(state)).toBe(0);
  });
});

describe('selectIsDone', () => {
  it('returns true when no current card', () => {
    const state = makeState({
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      queues: {},
      tagCardSets: {},
    });

    expect(selectIsDone(state)).toBe(true);
  });

  it('returns true when currentIndex exceeds queue length', () => {
    const state = makeState({
      viewState: { currentIndex: 5, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectIsDone(state)).toBe(true);
  });

  it('returns false when a card exists at currentIndex', () => {
    const state = makeState({
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: {
          uids: ['a'],
          removedUids: [],
        },
      },
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectIsDone(state)).toBe(false);
  });
});

describe('selectCompletedCount', () => {
  it('counts completed uids for the selected tag', () => {
    const state = makeState({
      selectedTag: 'memo',
      tagCardSets: {
        memo: makeTagCardSet({
          completedUids: ['a', 'b', 'c'],
        }),
      },
    });

    expect(selectCompletedCount(state)).toBe(3);
  });

  it('returns 0 when no tag data for selected tag', () => {
    const state = makeState({
      selectedTag: 'nonexistent',
      tagCardSets: {},
    });

    expect(selectCompletedCount(state)).toBe(0);
  });

  it('returns 0 when completedUids is empty', () => {
    const state = makeState({
      selectedTag: 'memo',
      tagCardSets: {
        memo: makeTagCardSet({ completedUids: [] }),
      },
    });

    expect(selectCompletedCount(state)).toBe(0);
  });
});

describe('selectSidebarCounts', () => {
  it('sums due and new counts across all tags', () => {
    const state = makeState({
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a', 'b'],
          newUids: ['c'],
        }),
        daily: makeTagCardSet({
          dueUids: ['d'],
          newUids: ['e', 'f'],
        }),
      },
    });

    expect(selectSidebarCounts(state)).toEqual({
      dueCount: 3,
      newCount: 3,
    });
  });

  it('returns zeros when no tags', () => {
    const state = makeState({ tagCardSets: {} });
    expect(selectSidebarCounts(state)).toEqual({ dueCount: 0, newCount: 0 });
  });
});

describe('selectTagCounts', () => {
  it('returns due and new counts for a specific tag', () => {
    const state = makeState({
      tagCardSets: {
        memo: makeTagCardSet({
          dueUids: ['a', 'b'],
          newUids: ['c'],
        }),
      },
    });

    expect(selectTagCounts(state, 'memo')).toEqual({
      dueCount: 2,
      newCount: 1,
    });
  });

  it('returns zeros for a nonexistent tag', () => {
    const state = makeState({
      tagCardSets: {
        memo: makeTagCardSet({ dueUids: ['a'] }),
      },
    });

    expect(selectTagCounts(state, 'nonexistent')).toEqual({
      dueCount: 0,
      newCount: 0,
    });
  });
});

describe('selectRenderMode', () => {
  it('returns renderMode for the selected tag', () => {
    const state = makeState({
      selectedTag: 'memo',
      tagCardSets: {
        memo: makeTagCardSet({ renderMode: RenderMode.AnswerFirst }),
      },
    });

    expect(selectRenderMode(state)).toBe(RenderMode.AnswerFirst);
  });

  it('defaults to normal when tag is missing', () => {
    const state = makeState({
      selectedTag: 'nonexistent',
      tagCardSets: {},
    });

    expect(selectRenderMode(state)).toBe('normal');
  });

  it('returns normal when renderMode is Normal', () => {
    const state = makeState({
      selectedTag: 'memo',
      tagCardSets: {
        memo: makeTagCardSet({ renderMode: RenderMode.Normal }),
      },
    });

    expect(selectRenderMode(state)).toBe('normal');
  });
});

describe('deriveChildSessionMap', () => {
  it('returns only children with nextDueDate (Session records)', () => {
    const sessionA: Session = makeSession({
      algorithm: SchedulingAlgorithm.SM2,
      nextDueDate: new Date('2025-06-10'),
      sm2_grade: 3,
    });
    const sessionB: Session = makeSession({
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      nextDueDate: new Date('2025-07-01'),
    });

    const facts: SessionFacts['latestByUid'] = {
      childA: sessionA,
      childB: sessionB,
    };

    const result = deriveChildSessionMap({
      childUidsList: ['childA', 'childB'],
      facts,
    });

    expect(result).toEqual({
      childA: sessionA,
      childB: sessionB,
    });
  });

  it('skips NewSession records (no nextDueDate)', () => {
    const sessionA: Session = makeSession({
      nextDueDate: new Date('2025-06-10'),
    });
    const newSession: NewSession = makeNewSession({
      algorithm: SchedulingAlgorithm.SM2,
    });

    const facts: SessionFacts['latestByUid'] = {
      childA: sessionA,
      childB: newSession,
    };

    const result = deriveChildSessionMap({
      childUidsList: ['childA', 'childB'],
      facts,
    });

    expect(result).toEqual({ childA: sessionA });
    expect(result).not.toHaveProperty('childB');
  });

  it('skips uids with undefined records', () => {
    const sessionA: Session = makeSession({
      nextDueDate: new Date('2025-06-10'),
    });

    const facts: SessionFacts['latestByUid'] = {
      childA: sessionA,
    };

    const result = deriveChildSessionMap({
      childUidsList: ['childA', 'childB'],
      facts,
    });

    expect(result).toEqual({ childA: sessionA });
  });

  it('returns empty object when all children are NewSession or undefined', () => {
    const facts: SessionFacts['latestByUid'] = {
      childA: makeNewSession(),
      childB: undefined,
    };

    const result = deriveChildSessionMap({
      childUidsList: ['childA', 'childB'],
      facts,
    });

    expect(result).toEqual({});
  });

  it('returns empty object for empty childUidsList', () => {
    const result = deriveChildSessionMap({
      childUidsList: [],
      facts: {},
    });

    expect(result).toEqual({});
  });
});

describe('selector chain integrity', () => {
  it('selectCardMeta correctly chains from selectCurrentCardData for NewSession', () => {
    const newSession: NewSession = makeNewSession({
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
    });

    const state = makeState({
      facts: makeFacts({ a: newSession }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ newUids: ['a'] }),
      },
    });

    const data = selectCurrentCardData(state);
    expect(data).toEqual(newSession);

    const meta = selectCardMeta(state);
    expect(meta?.algorithm).toBe(SchedulingAlgorithm.SM2);
    expect(meta?.interaction).toBe(InteractionStyle.LBL);
    expect(meta?.nextDueDate).toBeUndefined();

    expect(selectAlgorithm(state)).toBe(SchedulingAlgorithm.SM2);
    expect(selectInteraction(state)).toBe(InteractionStyle.LBL);
  });

  it('selectCurrentCardData returns NewSession — never filters by nextDueDate', () => {
    const newSession: NewSession = makeNewSession({
      algorithm: SchedulingAlgorithm.FIXED_TIME,
    });

    const state = makeState({
      facts: makeFacts({ a: newSession }),
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      selectedTag: 'memo',
      queues: {
        [queueIdForTag('memo')]: { uids: ['a'], removedUids: [] },
      },
      tagCardSets: {
        memo: makeTagCardSet({ newUids: ['a'] }),
      },
    });

    const result = selectCurrentCardData(state);
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty('nextDueDate');
    expect((result as NewSession).isNew).toBe(true);
  });
});
