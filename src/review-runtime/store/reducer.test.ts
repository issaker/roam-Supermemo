import { reviewReducer, initialReviewState } from './reducer';
import {
  ReviewState,
  CardSet,
  QueueState,
} from './types';
import { Session, SchedulingAlgorithm, InteractionStyle } from '~/models/session';
import { TagCardSets, RenderMode } from '~/models/practice';
import { defaultSettings } from '~/hooks/useSettings';
import { computeQueueId } from './queue-logic';

const makeState = (overrides: Partial<ReviewState> = {}): ReviewState => {
  const state = { ...initialReviewState, ...overrides };
  if (!('rawTagCardSets' in overrides) && 'tagCardSets' in overrides) {
    state.rawTagCardSets = overrides.tagCardSets!;
  }
  return state;
};

const makeQueueState = (uids: string[], removedUids: string[] = []): QueueState => ({
  uids,
  removedUids,
});

const makeCardSet = (
  due: string[] = [],
  newCards: string[] = [],
  completed: string[] = [],
  lblMeta: Record<string, string[]> = {}
): CardSet => ({ due, new: newCards, completed, lblMeta });

const makeTagCardSets = (
  tag: string,
  cardSet: CardSet
): TagCardSets => ({
  [tag]: {
    dueUids: cardSet.due,
    newUids: cardSet.new,
    completedUids: cardSet.completed,
    lblDeckMeta: cardSet.lblMeta,
    renderMode: RenderMode.Normal,
  },
});

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  algorithm: SchedulingAlgorithm.PROGRESSIVE,
  interaction: InteractionStyle.NORMAL,
  dateCreated: new Date(),
  ...overrides,
});

describe('initialReviewState', () => {
  it('has empty facts', () => {
    expect(initialReviewState.facts.latestByUid).toEqual({});
    expect(initialReviewState.facts.pendingByUid).toEqual({});
  });

  it('has viewState with currentIndex 0', () => {
    expect(initialReviewState.viewState.currentIndex).toBe(0);
    expect(initialReviewState.viewState.maxVisitedChildIndex).toBe(0);
    expect(initialReviewState.viewState.focusedChildUid).toBeUndefined();
  });

  it('has empty queues', () => {
    expect(initialReviewState.queues).toEqual({});
  });

  it('has default settings', () => {
    expect(initialReviewState.settings).toBe(defaultSettings);
  });

  it('has empty rawTagCardSets', () => {
    expect(initialReviewState.rawTagCardSets).toEqual({});
  });

  it('derives tagsList from default deckConfigs', () => {
    expect(initialReviewState.tagsList).toEqual(['memo', 'DailyNote']);
  });
});

describe('UPSERT_SESSIONS', () => {
  it('merges sessions into latestByUid', () => {
    const session: Session = makeSession({ nextDueDate: new Date('2026-06-01') });
    const state = makeState();
    const result = reviewReducer(state, {
      type: 'UPSERT_SESSIONS',
      sessions: { uid1: session },
    });
    expect(result.facts.latestByUid.uid1).toBe(session);
  });

  it('preserves existing sessions when merging', () => {
    const existing: Session = makeSession({ nextDueDate: new Date('2026-05-01') });
    const incoming: Session = makeSession({ nextDueDate: new Date('2026-06-01') });
    const state = makeState({
      facts: { latestByUid: { uid1: existing }, pendingByUid: {} },
    });
    const result = reviewReducer(state, {
      type: 'UPSERT_SESSIONS',
      sessions: { uid2: incoming },
    });
    expect(result.facts.latestByUid.uid1).toBe(existing);
    expect(result.facts.latestByUid.uid2).toBe(incoming);
  });

  it('overwrites existing uid with new session', () => {
    const old: Session = makeSession({ nextDueDate: new Date('2026-05-01') });
    const updated: Session = makeSession({ nextDueDate: new Date('2026-07-01') });
    const state = makeState({
      facts: { latestByUid: { uid1: old }, pendingByUid: {} },
    });
    const result = reviewReducer(state, {
      type: 'UPSERT_SESSIONS',
      sessions: { uid1: updated },
    });
    expect(result.facts.latestByUid.uid1).toBe(updated);
  });
});

describe('SET_PENDING', () => {
  it('sets pending state for a uid', () => {
    const state = makeState();
    const result = reviewReducer(state, {
      type: 'SET_PENDING',
      uid: 'uid1',
      pendingState: 'saving',
    });
    expect(result.facts.pendingByUid.uid1).toBe('saving');
  });

  it('sets pending state to updatingConfig', () => {
    const state = makeState();
    const result = reviewReducer(state, {
      type: 'SET_PENDING',
      uid: 'uid1',
      pendingState: 'updatingConfig',
    });
    expect(result.facts.pendingByUid.uid1).toBe('updatingConfig');
  });

  it('clears pending state by setting to undefined', () => {
    const state = makeState({
      facts: { latestByUid: {}, pendingByUid: { uid1: 'saving' } },
    });
    const result = reviewReducer(state, {
      type: 'SET_PENDING',
      uid: 'uid1',
      pendingState: undefined,
    });
    expect(result.facts.pendingByUid.uid1).toBeUndefined();
  });

  it('preserves other pending entries', () => {
    const state = makeState({
      facts: { latestByUid: {}, pendingByUid: { uid1: 'saving' } },
    });
    const result = reviewReducer(state, {
      type: 'SET_PENDING',
      uid: 'uid2',
      pendingState: 'updatingConfig',
    });
    expect(result.facts.pendingByUid.uid1).toBe('saving');
    expect(result.facts.pendingByUid.uid2).toBe('updatingConfig');
  });
});

describe('FOCUS_BY_OFFSET', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);
  const cardSet = makeCardSet(['a', 'b', 'c', 'd']);

  const state = makeState({
    selectedTag: tag,
    tagCardSets: makeTagCardSets(tag, cardSet),
    queues: { [queueId]: makeQueueState(['a', 'b', 'c', 'd']) },
    viewState: { currentIndex: 1, maxVisitedChildIndex: 0 },
  });

  it('moves forward by positive offset', () => {
    const result = reviewReducer(state, { type: 'FOCUS_BY_OFFSET', offset: 2 });
    expect(result.viewState.currentIndex).toBe(3);
  });

  it('moves backward by negative offset', () => {
    const result = reviewReducer(state, { type: 'FOCUS_BY_OFFSET', offset: -1 });
    expect(result.viewState.currentIndex).toBe(0);
  });

  it('clamps to 0 when going below', () => {
    const result = reviewReducer(state, { type: 'FOCUS_BY_OFFSET', offset: -10 });
    expect(result.viewState.currentIndex).toBe(0);
  });

  it('clamps to queue length when going above', () => {
    const result = reviewReducer(state, { type: 'FOCUS_BY_OFFSET', offset: 100 });
    expect(result.viewState.currentIndex).toBe(4);
  });

  it('zero offset keeps same index', () => {
    const result = reviewReducer(state, { type: 'FOCUS_BY_OFFSET', offset: 0 });
    expect(result.viewState.currentIndex).toBe(1);
  });
});

describe('FOCUS_TO_UID', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);
  const cardSet = makeCardSet(['a', 'b', 'c']);
  const state = makeState({
    selectedTag: tag,
    tagCardSets: makeTagCardSets(tag, cardSet),
    queues: { [queueId]: makeQueueState(['a', 'b', 'c']) },
    viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
  });

  it('sets currentIndex to uid position', () => {
    const result = reviewReducer(state, { type: 'FOCUS_TO_UID', uid: 'c' });
    expect(result.viewState.currentIndex).toBe(2);
  });

  it('returns unchanged state if uid not in queue', () => {
    const result = reviewReducer(state, { type: 'FOCUS_TO_UID', uid: 'z' });
    expect(result).toBe(state);
  });
});

describe('RESET_TO_FIRST', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);

  it('resets to first unpracticed card', () => {
    const completedSession: Session = makeSession({
      nextDueDate: new Date('2027-01-01'),
      dateCreated: new Date(),
    });
    const cardSet = makeCardSet(['a', 'b', 'c']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
      queues: { [queueId]: makeQueueState(['a', 'b', 'c']) },
      facts: {
        latestByUid: { a: completedSession },
        pendingByUid: {},
      },
      viewState: { currentIndex: 2, focusedChildUid: 'x', maxVisitedChildIndex: 3 },
    });
    const result = reviewReducer(state, { type: 'RESET_TO_FIRST' });
    expect(result.viewState.currentIndex).toBe(1);
    expect(result.viewState.focusedChildUid).toBeUndefined();
    expect(result.viewState.maxVisitedChildIndex).toBe(0);
  });

  it('resets to 0 when no cards are completed', () => {
    const cardSet = makeCardSet(['a', 'b']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
      queues: { [queueId]: makeQueueState(['a', 'b']) },
      viewState: { currentIndex: 1, focusedChildUid: 'x', maxVisitedChildIndex: 2 },
    });
    const result = reviewReducer(state, { type: 'RESET_TO_FIRST' });
    expect(result.viewState.currentIndex).toBe(0);
  });

  it('returns queue length when all cards are completed', () => {
    const completedSession: Session = makeSession({
      nextDueDate: new Date('2027-01-01'),
      dateCreated: new Date(),
    });
    const cardSet = makeCardSet(['a', 'b']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
      queues: { [queueId]: makeQueueState(['a', 'b']) },
      facts: {
        latestByUid: { a: completedSession, b: completedSession },
        pendingByUid: {},
      },
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
    });
    const result = reviewReducer(state, { type: 'RESET_TO_FIRST' });
    expect(result.viewState.currentIndex).toBe(2);
  });
});

describe('NAVIGATE_NEXT_UNPRACTICED', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);

  it('moves to next unpracticed from current index', () => {
    const completedSession: Session = makeSession({
      nextDueDate: new Date('2027-01-01'),
      dateCreated: new Date(),
    });
    const cardSet = makeCardSet(['a', 'b', 'c']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
      queues: { [queueId]: makeQueueState(['a', 'b', 'c']) },
      facts: {
        latestByUid: { a: completedSession },
        pendingByUid: {},
      },
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
    });
    const result = reviewReducer(state, { type: 'NAVIGATE_NEXT_UNPRACTICED' });
    expect(result.viewState.currentIndex).toBe(1);
  });

  it('stays at current if current is unpracticed', () => {
    const cardSet = makeCardSet(['a', 'b']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
      queues: { [queueId]: makeQueueState(['a', 'b']) },
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
    });
    const result = reviewReducer(state, { type: 'NAVIGATE_NEXT_UNPRACTICED' });
    expect(result.viewState.currentIndex).toBe(0);
  });
});

describe('SET_FOCUSED_CHILD', () => {
  it('sets focusedChildUid', () => {
    const state = makeState({
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
    });
    const result = reviewReducer(state, { type: 'SET_FOCUSED_CHILD', childUid: 'child1' });
    expect(result.viewState.focusedChildUid).toBe('child1');
  });

  it('clears focusedChildUid with undefined', () => {
    const state = makeState({
      viewState: { currentIndex: 0, focusedChildUid: 'child1', maxVisitedChildIndex: 2 },
    });
    const result = reviewReducer(state, { type: 'SET_FOCUSED_CHILD', childUid: undefined });
    expect(result.viewState.focusedChildUid).toBeUndefined();
  });
});

describe('RESET_CHILD_VIEW', () => {
  it('clears focusedChildUid and resets maxVisitedChildIndex', () => {
    const state = makeState({
      viewState: { currentIndex: 0, focusedChildUid: 'child1', maxVisitedChildIndex: 5 },
    });
    const result = reviewReducer(state, { type: 'RESET_CHILD_VIEW' });
    expect(result.viewState.focusedChildUid).toBeUndefined();
    expect(result.viewState.maxVisitedChildIndex).toBe(0);
  });
});

describe('SET_MAX_VISITED_CHILD_INDEX', () => {
  it('sets maxVisitedChildIndex', () => {
    const state = makeState({
      viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
    });
    const result = reviewReducer(state, { type: 'SET_MAX_VISITED_CHILD_INDEX', index: 3 });
    expect(result.viewState.maxVisitedChildIndex).toBe(3);
  });
});

describe('CHANGE_TAG', () => {
  it('changes selectedTag and reconciles queue', () => {
    const newTag = 'newTag';
    const newQueueId = computeQueueId(newTag);
    const cardSet = makeCardSet(['x', 'y']);
    const state = makeState({
      selectedTag: 'oldTag',
      tagCardSets: {
        ...makeTagCardSets('oldTag', makeCardSet(['a'])),
        ...makeTagCardSets(newTag, cardSet),
      },
      queues: {},
    });
    const result = reviewReducer(state, { type: 'CHANGE_TAG', tag: newTag });
    expect(result.selectedTag).toBe(newTag);
    expect(result.queues[newQueueId]).toBeDefined();
    expect(result.queues[newQueueId].uids).toContain('x');
    expect(result.queues[newQueueId].uids).toContain('y');
  });

  it('resets viewState', () => {
    const newTag = 'newTag';
    const cardSet = makeCardSet(['x']);
    const state = makeState({
      selectedTag: 'oldTag',
      tagCardSets: makeTagCardSets(newTag, cardSet),
      viewState: { currentIndex: 5, focusedChildUid: 'c', maxVisitedChildIndex: 3 },
    });
    const result = reviewReducer(state, { type: 'CHANGE_TAG', tag: newTag });
    expect(result.viewState.focusedChildUid).toBeUndefined();
    expect(result.viewState.maxVisitedChildIndex).toBe(0);
  });

  it('finds first unpracticed index in new tag queue', () => {
    const newTag = 'newTag';
    const cardSet = makeCardSet(['x', 'y']);
    const completedSession: Session = makeSession({
      nextDueDate: new Date('2027-01-01'),
      dateCreated: new Date(),
    });
    const state = makeState({
      selectedTag: 'oldTag',
      tagCardSets: makeTagCardSets(newTag, cardSet),
      facts: {
        latestByUid: { x: completedSession },
        pendingByUid: {},
      },
    });
    const result = reviewReducer(state, { type: 'CHANGE_TAG', tag: newTag });
    expect(result.viewState.currentIndex).toBe(1);
  });
});

describe('SET_CRAMMING', () => {
  it('sets cramming to true', () => {
    const state = makeState({ isCramming: false });
    const result = reviewReducer(state, { type: 'SET_CRAMMING', value: true });
    expect(result.isCramming).toBe(true);
  });

  it('sets cramming to false', () => {
    const state = makeState({ isCramming: true });
    const result = reviewReducer(state, { type: 'SET_CRAMMING', value: false });
    expect(result.isCramming).toBe(false);
  });

  it('recomputes tagCardSets when toggling cramming with dailyLimit', () => {
    const tag = 'memo';
    const cardSet = makeCardSet(['a', 'b', 'c'], ['d', 'e']);
    const tagCardSets = makeTagCardSets(tag, cardSet);
    const state = makeState({
      isCramming: false,
      selectedTag: tag,
      rawTagCardSets: tagCardSets,
      tagCardSets,
      settings: { ...defaultSettings, dailyLimit: 2 },
      tagsList: [tag],
    });
    const result = reviewReducer(state, { type: 'SET_CRAMMING', value: true });
    expect(result.isCramming).toBe(true);
    expect(result.tagCardSets[tag].dueUids.length + result.tagCardSets[tag].newUids.length).toBeGreaterThan(2);
  });
});

describe('SET_TAG_CARD_SETS', () => {
  it('stores rawTagCardSets and computes tagCardSets', () => {
    const newCardSet = makeCardSet(['a', 'b']);
    const newTagCardSets = makeTagCardSets('tag1', newCardSet);
    const newPracticeData = { uid1: makeSession() };
    const state = makeState();
    const result = reviewReducer(state, {
      type: 'SET_TAG_CARD_SETS',
      tagCardSets: newTagCardSets,
      practiceData: newPracticeData,
    });
    expect(result.rawTagCardSets).toBe(newTagCardSets);
    expect(result.practiceData).toBe(newPracticeData);
  });

  it('merges practiceData into facts.latestByUid (skipping pending)', () => {
    const session: Session = makeSession({ nextDueDate: new Date('2026-06-01') });
    const pendingSession: Session = makeSession({ nextDueDate: new Date('2026-07-01') });
    const newTagCardSets = makeTagCardSets('tag1', makeCardSet(['a']));
    const newPracticeData = { uid1: session, uid2: pendingSession };
    const state = makeState({
      facts: { latestByUid: {}, pendingByUid: { uid2: 'saving' } },
    });
    const result = reviewReducer(state, {
      type: 'SET_TAG_CARD_SETS',
      tagCardSets: newTagCardSets,
      practiceData: newPracticeData,
    });
    expect(result.facts.latestByUid.uid1).toBe(session);
    expect(result.facts.latestByUid.uid2).toBeUndefined();
  });

  it('reconciles queue when selectedTag is set', () => {
    const tag = 'myTag';
    const newTagCardSets = makeTagCardSets(tag, makeCardSet(['a', 'b']));
    const state = makeState({ selectedTag: tag });
    const result = reviewReducer(state, {
      type: 'SET_TAG_CARD_SETS',
      tagCardSets: newTagCardSets,
      practiceData: {},
    });
    const queueId = computeQueueId(tag);
    expect(result.queues[queueId]).toBeDefined();
  });

  it('does not reconcile queue when selectedTag is empty', () => {
    const newTagCardSets = makeTagCardSets('tag1', makeCardSet(['a']));
    const state = makeState({ selectedTag: '' });
    const result = reviewReducer(state, {
      type: 'SET_TAG_CARD_SETS',
      tagCardSets: newTagCardSets,
      practiceData: {},
    });
    expect(Object.keys(result.queues)).toHaveLength(0);
  });
});

describe('UPDATE_SETTINGS', () => {
  it('merges partial settings', () => {
    const state = makeState();
    const result = reviewReducer(state, {
      type: 'UPDATE_SETTINGS',
      settings: { dailyLimit: 50, shuffleCards: true },
    });
    expect(result.settings.dailyLimit).toBe(50);
    expect(result.settings.shuffleCards).toBe(true);
    expect(result.settings.forgotReinsertOffset).toBe(defaultSettings.forgotReinsertOffset);
  });

  it('recomputes tagsList when deckConfigs changes', () => {
    const state = makeState();
    const result = reviewReducer(state, {
      type: 'UPDATE_SETTINGS',
      settings: { deckConfigs: '[{"name":"memo","swapQA":false,"weight":50,"blacklist":false}]' },
    });
    expect(result.tagsList).toEqual(['memo']);
  });

  it('resets selectedTag to first tag when current tag is no longer in tagsList', () => {
    const state = makeState({ selectedTag: 'DailyNote' });
    const result = reviewReducer(state, {
      type: 'UPDATE_SETTINGS',
      settings: { deckConfigs: '[{"name":"memo","swapQA":false,"weight":50,"blacklist":false}]' },
    });
    expect(result.selectedTag).toBe('memo');
  });

  it('keeps selectedTag when it is still in new tagsList', () => {
    const state = makeState({ selectedTag: 'memo' });
    const result = reviewReducer(state, {
      type: 'UPDATE_SETTINGS',
      settings: { deckConfigs: '[{"name":"memo","swapQA":false,"weight":50,"blacklist":false},{"name":"newTag","swapQA":false,"weight":50,"blacklist":false}]' },
    });
    expect(result.selectedTag).toBe('memo');
    expect(result.tagsList).toEqual(['memo', 'newTag']);
  });

  it('truncates queue when dailyLimit is reduced (mask can decrease)', () => {
    const tag = 'memo';
    const queueId = computeQueueId(tag);
    const cardSet = makeCardSet(['a', 'b', 'c', 'd', 'e']);
    const tagCardSets = makeTagCardSets(tag, cardSet);
    const state = makeState({
      selectedTag: tag,
      rawTagCardSets: tagCardSets,
      tagCardSets,
      queues: { [queueId]: makeQueueState(['a', 'b', 'c', 'd', 'e']) },
      settings: { ...defaultSettings, dailyLimit: 0 },
      tagsList: [tag],
    });
    const result = reviewReducer(state, {
      type: 'UPDATE_SETTINGS',
      settings: { dailyLimit: 2 },
    });
    const effectiveUids = result.queues[queueId].uids;
    expect(effectiveUids.length).toBeLessThanOrEqual(2);
  });

  it('adds cards to queue when dailyLimit is increased (mask can increase)', () => {
    const tag = 'memo';
    const queueId = computeQueueId(tag);
    const cardSet = makeCardSet(['a', 'b', 'c', 'd', 'e']);
    const tagCardSets = makeTagCardSets(tag, cardSet);
    const limitedTagCardSets = {
      [tag]: {
        ...tagCardSets[tag],
        dueUids: ['a'],
        newUids: [],
      },
    };
    const state = makeState({
      selectedTag: tag,
      rawTagCardSets: tagCardSets,
      tagCardSets: limitedTagCardSets,
      queues: { [queueId]: makeQueueState(['a']) },
      settings: { ...defaultSettings, dailyLimit: 1 },
      tagsList: [tag],
    });
    const result = reviewReducer(state, {
      type: 'UPDATE_SETTINGS',
      settings: { dailyLimit: 5 },
    });
    expect(result.queues[queueId].uids.length).toBeGreaterThan(1);
  });

  it('resets viewState after settings change', () => {
    const tag = 'memo';
    const queueId = computeQueueId(tag);
    const cardSet = makeCardSet(['a', 'b']);
    const tagCardSets = makeTagCardSets(tag, cardSet);
    const state = makeState({
      selectedTag: tag,
      rawTagCardSets: tagCardSets,
      tagCardSets,
      queues: { [queueId]: makeQueueState(['a', 'b']) },
      settings: { ...defaultSettings, dailyLimit: 0 },
      tagsList: [tag],
      viewState: { currentIndex: 1, focusedChildUid: 'x', maxVisitedChildIndex: 3 },
    });
    const result = reviewReducer(state, {
      type: 'UPDATE_SETTINGS',
      settings: { dailyLimit: 5 },
    });
    expect(result.viewState.focusedChildUid).toBeUndefined();
    expect(result.viewState.maxVisitedChildIndex).toBe(0);
  });
});

describe('SET_DATA_PAGE_TITLE', () => {
  it('sets dataPageTitle', () => {
    const state = makeState({ dataPageTitle: '' });
    const result = reviewReducer(state, {
      type: 'SET_DATA_PAGE_TITLE',
      dataPageTitle: 'roam/Supermemo',
    });
    expect(result.dataPageTitle).toBe('roam/Supermemo');
  });
});

describe('QUEUE_INIT', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);

  it('initializes queue with uids and removedUids', () => {
    const cardSet = makeCardSet(['a', 'b', 'c']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
    });
    const result = reviewReducer(state, {
      type: 'QUEUE_INIT',
      queueId,
      uids: ['a', 'b', 'c'],
      removedUids: ['b'],
    });
    expect(result.queues[queueId].uids).toEqual(['a', 'b', 'c']);
    expect(result.queues[queueId].removedUids).toEqual(['b']);
  });

  it('finds first unpracticed index', () => {
    const completedSession: Session = makeSession({
      nextDueDate: new Date('2027-01-01'),
      dateCreated: new Date(),
    });
    const cardSet = makeCardSet(['a', 'b', 'c']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
      facts: {
        latestByUid: { a: completedSession },
        pendingByUid: {},
      },
    });
    const result = reviewReducer(state, {
      type: 'QUEUE_INIT',
      queueId,
      uids: ['a', 'b', 'c'],
      removedUids: [],
    });
    expect(result.viewState.currentIndex).toBe(1);
  });

  it('resets child view state', () => {
    const cardSet = makeCardSet(['a']);
    const state = makeState({
      selectedTag: tag,
      tagCardSets: makeTagCardSets(tag, cardSet),
      viewState: { currentIndex: 0, focusedChildUid: 'x', maxVisitedChildIndex: 5 },
    });
    const result = reviewReducer(state, {
      type: 'QUEUE_INIT',
      queueId,
      uids: ['a'],
      removedUids: [],
    });
    expect(result.viewState.focusedChildUid).toBeUndefined();
    expect(result.viewState.maxVisitedChildIndex).toBe(0);
  });
});

describe('QUEUE_REINSERT', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);

  it('reinserts uid after specified uid with offset', () => {
    const state = makeState({
      selectedTag: tag,
      queues: { [queueId]: makeQueueState(['a', 'b', 'c', 'd']) },
    });
    const result = reviewReducer(state, {
      type: 'QUEUE_REINSERT',
      queueId,
      uid: 'a',
      afterUid: 'c',
      offset: 0,
    });
    expect(result.queues[queueId].uids).toEqual(['b', 'c', 'a', 'd']);
  });

  it('returns unchanged state if queue does not exist', () => {
    const state = makeState({ selectedTag: tag, queues: {} });
    const result = reviewReducer(state, {
      type: 'QUEUE_REINSERT',
      queueId: 'nonexistent',
      uid: 'a',
      afterUid: 'b',
      offset: 0,
    });
    expect(result).toBe(state);
  });
});

describe('QUEUE_ADD_REMOVED', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);

  it('adds uids to removedUids', () => {
    const state = makeState({
      selectedTag: tag,
      queues: { [queueId]: makeQueueState(['a', 'b', 'c'], ['x']) },
    });
    const result = reviewReducer(state, {
      type: 'QUEUE_ADD_REMOVED',
      queueId,
      uids: ['a', 'y'],
    });
    expect(result.queues[queueId].removedUids).toContain('x');
    expect(result.queues[queueId].removedUids).toContain('a');
    expect(result.queues[queueId].removedUids).toContain('y');
  });

  it('deduplicates removedUids', () => {
    const state = makeState({
      selectedTag: tag,
      queues: { [queueId]: makeQueueState(['a', 'b'], ['x']) },
    });
    const result = reviewReducer(state, {
      type: 'QUEUE_ADD_REMOVED',
      queueId,
      uids: ['x'],
    });
    expect(result.queues[queueId].removedUids).toEqual(['x']);
  });

  it('returns unchanged state if no new uids added', () => {
    const state = makeState({
      selectedTag: tag,
      queues: { [queueId]: makeQueueState(['a'], ['x']) },
    });
    const result = reviewReducer(state, {
      type: 'QUEUE_ADD_REMOVED',
      queueId,
      uids: ['x'],
    });
    expect(result).toBe(state);
  });

  it('returns unchanged state if queue does not exist', () => {
    const state = makeState({ selectedTag: tag, queues: {} });
    const result = reviewReducer(state, {
      type: 'QUEUE_ADD_REMOVED',
      queueId: 'nonexistent',
      uids: ['a'],
    });
    expect(result).toBe(state);
  });
});

describe('GRADE_CARD', () => {
  const tag = 'testTag';
  const queueId = computeQueueId(tag);

  describe('normal card grade (not Forgot)', () => {
    it('merges sessions and sets pending to saving', () => {
      const cardSet = makeCardSet(['a', 'b']);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a', 'b']) },
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 3,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      expect(result.facts.latestByUid.a).toBe(practiceResult);
      expect(result.facts.pendingByUid.a).toBe('saving');
    });

    it('advances to next unpracticed card', () => {
      const cardSet = makeCardSet(['a', 'b']);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a', 'b']) },
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 3,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      expect(result.viewState.currentIndex).toBe(1);
    });

    it('resets child view state after grading normal card', () => {
      const cardSet = makeCardSet(['a', 'b']);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a', 'b']) },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 2 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 3,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      expect(result.viewState.focusedChildUid).toBeUndefined();
      expect(result.viewState.maxVisitedChildIndex).toBe(0);
    });
  });

  describe('normal card Forgot (grade=0)', () => {
    it('reinserts card into queue with forgotReinsertOffset', () => {
      const cardSet = makeCardSet(['a', 'b', 'c', 'd', 'e']);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date(),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a', 'b', 'c', 'd', 'e']) },
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 0,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      expect(result.queues[queueId].uids.indexOf('a')).toBeGreaterThan(0);
      expect(result.queues[queueId].uids).toContain('a');
    });

    it('does not reinsert when forgotReinsertOffset is 0', () => {
      const cardSet = makeCardSet(['a', 'b']);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date(),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a', 'b']) },
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 0,
          isChild: false,
          forgotReinsertOffset: 0,
          lblNextReinsertOffset: 0,
        },
      });
      expect(result.queues[queueId].uids).toEqual(['a', 'b']);
    });
  });

  describe('LBL child grade (not Forgot, not LBL-Next)', () => {
    it('sets focusedChildUid to next due child', () => {
      const childUids = ['c1', 'c2', 'c3'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const masteredChild: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: masteredChild,
            c2: dueChild,
            c3: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c1: practiceResult },
          targetUid: 'c1',
          grade: 3,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
          currentChildIsLblNext: false,
          lineByLineCurrentChildIndex: 0,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: { ...masteredChild, ...practiceResult },
            c2: dueChild,
            c3: dueChild,
          },
        },
      });
      expect(result.viewState.focusedChildUid).toBe('c2');
      expect(result.viewState.maxVisitedChildIndex).toBe(1);
    });

    it('when deck is complete, advances to next primary card', () => {
      const childUids = ['c1'];
      const cardSet = makeCardSet(['parent', 'next'], [], [], { parent: childUids });
      const masteredChild: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent', 'next']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: masteredChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c1: practiceResult },
          targetUid: 'c1',
          grade: 3,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
          currentChildIsLblNext: false,
          lineByLineCurrentChildIndex: 0,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: { ...masteredChild, ...practiceResult },
          },
        },
      });
      expect(result.viewState.currentIndex).toBe(1);
      expect(result.viewState.focusedChildUid).toBeUndefined();
    });
  });

  describe('LBL child LBL-Next reinsert', () => {
    it('reinserts parent when currentChildIsLblNext and not last child', () => {
      const childUids = ['c1', 'c2', 'c3'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: dueChild,
            c2: dueChild,
            c3: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c1: practiceResult },
          targetUid: 'c1',
          grade: 3,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 2,
          currentChildIsLblNext: true,
          lineByLineCurrentChildIndex: 0,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: { ...dueChild, ...practiceResult },
            c2: dueChild,
            c3: dueChild,
          },
        },
      });
      expect(result.queues[queueId].uids).toContain('parent');
    });

    it('does not reinsert when lblNextReinsertOffset is 0', () => {
      const childUids = ['c1', 'c2'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: dueChild,
            c2: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c1: practiceResult },
          targetUid: 'c1',
          grade: 3,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
          currentChildIsLblNext: true,
          lineByLineCurrentChildIndex: 0,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: { ...dueChild, ...practiceResult },
            c2: dueChild,
          },
        },
      });
      expect(result.queues[queueId].uids).toEqual(['parent']);
    });

    it('LBL Next with undefined grade enters LBL Next path, not Forgot path', () => {
      const childUids = ['c1', 'c2'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: dueChild,
            c2: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c1: practiceResult },
          targetUid: 'c1',
          grade: undefined,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
          currentChildIsLblNext: true,
          lineByLineCurrentChildIndex: 0,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: { ...dueChild, ...practiceResult },
            c2: dueChild,
          },
        },
      });
      expect(result.queues[queueId].uids).toEqual(['parent']);
      expect(result.viewState.focusedChildUid).toBe('c2');
      expect(result.viewState.currentIndex).toBe(0);
    });

    it('LBL Next with undefined grade and lblNextReinsertOffset>0 reinserts parent', () => {
      const childUids = ['c1', 'c2', 'c3'];
      const otherCard: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const cardSet = makeCardSet(['parent', 'other'], [], [], { parent: childUids });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent', 'other']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            other: otherCard,
            c1: dueChild,
            c2: dueChild,
            c3: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c1: practiceResult },
          targetUid: 'c1',
          grade: undefined,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 2,
          currentChildIsLblNext: true,
          lineByLineCurrentChildIndex: 0,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: { ...dueChild, ...practiceResult },
            c2: dueChild,
            c3: dueChild,
          },
        },
      });
      expect(result.queues[queueId].uids).toEqual(['other', 'parent']);
    });

    it('does not reinsert when child is last in list', () => {
      const childUids = ['c1', 'c2'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: makeSession({ nextDueDate: new Date('2027-01-01'), dateCreated: new Date() }),
            c2: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c2', maxVisitedChildIndex: 1 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c2: practiceResult },
          targetUid: 'c2',
          grade: 3,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 2,
          currentChildIsLblNext: true,
          lineByLineCurrentChildIndex: 1,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: makeSession({ nextDueDate: new Date('2027-01-01'), dateCreated: new Date() }),
            c2: { ...dueChild, ...practiceResult },
          },
        },
      });
      expect(result.queues[queueId].uids).toEqual(['parent']);
    });
  });

  describe('reclassification in tagCardSets', () => {
    it('moves card from due to completed when completed today', () => {
      const cardSet = makeCardSet(['a', 'b']);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a', 'b']) },
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 3,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      const tagData = result.tagCardSets[tag];
      expect(tagData.dueUids).not.toContain('a');
      expect(tagData.completedUids).toContain('a');
    });

    it('moves card from new to completed when completed today', () => {
      const cardSet = makeCardSet([], ['a'], []);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a']) },
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 3,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      const tagData = result.tagCardSets[tag];
      expect(tagData.newUids).not.toContain('a');
      expect(tagData.completedUids).toContain('a');
    });

    it('does not reclassify card that is not completed', () => {
      const cardSet = makeCardSet(['a']);
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['a']) },
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 0,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      const tagData = result.tagCardSets[tag];
      expect(tagData.dueUids).toContain('a');
      expect(tagData.completedUids).not.toContain('a');
    });

    it('does not reclassify when tag data does not exist', () => {
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: 'nonexistent',
        tagCardSets: {},
        queues: {},
        viewState: { currentIndex: 0, maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { a: practiceResult },
          targetUid: 'a',
          grade: 3,
          isChild: false,
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      expect(result.tagCardSets).toEqual({});
    });
  });

  describe('LBL parent reclassification when all children completed', () => {
    it('moves parent from due to completed when all children mastered and one graded today', () => {
      const childUids = ['c1', 'c2'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const masteredChild: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: masteredChild,
            c2: masteredChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c2', maxVisitedChildIndex: 1 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c2: practiceResult },
          targetUid: 'c2',
          grade: 3,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
          currentChildIsLblNext: false,
          lineByLineCurrentChildIndex: 1,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: masteredChild,
            c2: { ...masteredChild, ...practiceResult },
          },
        },
      });
      const tagData = result.tagCardSets[tag];
      expect(tagData.dueUids).not.toContain('parent');
      expect(tagData.completedUids).toContain('parent');
    });

    it('does not reclassify parent when not all children completed', () => {
      const childUids = ['c1', 'c2'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const masteredChild: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: masteredChild,
            c2: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c1', maxVisitedChildIndex: 0 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c1: practiceResult },
          targetUid: 'c1',
          grade: 3,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
          currentChildIsLblNext: false,
          lineByLineCurrentChildIndex: 0,
          childUidsList: childUids,
          updatedChildSessionsForParent: {
            c1: { ...masteredChild, ...practiceResult },
            c2: dueChild,
          },
        },
      });
      const tagData = result.tagCardSets[tag];
      expect(tagData.dueUids).toContain('parent');
      expect(tagData.completedUids).not.toContain('parent');
    });
  });

  describe('child Forgot reinserts parent', () => {
    it('reinserts parent uid when child gets Forgot', () => {
      const childUids = ['c1', 'c2'];
      const cardSet = makeCardSet(['parent'], [], [], { parent: childUids });
      const masteredChild: Session = makeSession({
        nextDueDate: new Date('2027-01-01'),
        dateCreated: new Date(),
      });
      const dueChild: Session = makeSession({
        nextDueDate: new Date('2020-01-01'),
        dateCreated: new Date(),
      });
      const practiceResult: Session = makeSession({
        nextDueDate: new Date(),
        dateCreated: new Date(),
      });
      const state = makeState({
        selectedTag: tag,
        tagCardSets: makeTagCardSets(tag, cardSet),
        queues: { [queueId]: makeQueueState(['parent']) },
        facts: {
          latestByUid: {
            parent: makeSession({ interaction: InteractionStyle.LBL }),
            c1: masteredChild,
            c2: dueChild,
          },
          pendingByUid: {},
        },
        viewState: { currentIndex: 0, focusedChildUid: 'c2', maxVisitedChildIndex: 1 },
      });
      const result = reviewReducer(state, {
        type: 'GRADE_CARD',
        payload: {
          sessions: { c2: practiceResult },
          targetUid: 'c2',
          grade: 0,
          isChild: true,
          parentUid: 'parent',
          forgotReinsertOffset: 3,
          lblNextReinsertOffset: 0,
        },
      });
      expect(result.queues[queueId].uids).toContain('parent');
    });
  });
});

describe('CHANGE_CONFIG', () => {
  it('merges sessions and sets pending to updatingConfig', () => {
    const updatedSession: Session = makeSession({
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
    });
    const state = makeState({
      facts: { latestByUid: {}, pendingByUid: {} },
    });
    const result = reviewReducer(state, {
      type: 'CHANGE_CONFIG',
      payload: {
        sessions: { uid1: updatedSession },
        targetUid: 'uid1',
      },
    });
    expect(result.facts.latestByUid.uid1).toBe(updatedSession);
    expect(result.facts.pendingByUid.uid1).toBe('updatingConfig');
  });

  it('preserves existing latestByUid entries', () => {
    const existing: Session = makeSession({ nextDueDate: new Date('2026-05-01') });
    const updated: Session = makeSession({ algorithm: SchedulingAlgorithm.SM2 });
    const state = makeState({
      facts: { latestByUid: { uid1: existing }, pendingByUid: {} },
    });
    const result = reviewReducer(state, {
      type: 'CHANGE_CONFIG',
      payload: {
        sessions: { uid2: updated },
        targetUid: 'uid2',
      },
    });
    expect(result.facts.latestByUid.uid1).toBe(existing);
    expect(result.facts.latestByUid.uid2).toBe(updated);
    expect(result.facts.pendingByUid.uid2).toBe('updatingConfig');
  });
});

describe('unknown action type', () => {
  it('returns state unchanged for unknown action', () => {
    const state = makeState();
    const result = reviewReducer(state, { type: 'UNKNOWN_ACTION' } as any);
    expect(result).toBe(state);
  });
});
