import { limitRemainingPracticeData } from './dataProcessing';
import { Today } from '~/models/practice';

type TagData = Today['tags'][string];

const makeTag = (overrides: Partial<TagData> = {}): TagData => ({
  status: 'unstarted' as any,
  due: 0,
  new: 0,
  dueUids: [],
  newUids: [],
  completed: 0,
  completedUids: [],
  renderMode: 'normal' as any,
  ...overrides,
});

const makeToday = (tags: Record<string, TagData>): Today => ({
  tags,
  combinedToday: {
    status: 'unstarted' as any,
    due: 0,
    new: 0,
    dueUids: [],
    newUids: [],
    completed: 0,
    completedUids: [],
  },
});

describe('limitRemainingPracticeData', () => {
  it('returns early without modification when dailyLimit is 0', () => {
    const today = makeToday({
      memo: makeTag({
        dueUids: ['a', 'b'],
        newUids: ['c'],
        due: 2,
        new: 1,
      }),
    });

    limitRemainingPracticeData({
      today,
      dailyLimit: 0,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: '',
    });

    expect(today.tags.memo.dueUids).toEqual(['a', 'b']);
    expect(today.tags.memo.newUids).toEqual(['c']);
  });

  it('clears all deck due/new when remainingLimit is 0 (all quota used)', () => {
    const today = makeToday({
      memo: makeTag({
        dueUids: ['a', 'b'],
        newUids: ['c'],
        due: 2,
        new: 1,
        completed: 10,
      }),
      daily: makeTag({
        dueUids: ['d'],
        newUids: ['e', 'f'],
        due: 1,
        new: 2,
        completed: 0,
      }),
    });

    limitRemainingPracticeData({
      today,
      dailyLimit: 5,
      tagsList: ['memo', 'daily'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'memo', weight: 50, swapQA: false },
        { name: 'daily', weight: 50, swapQA: false },
      ]),
    });

    expect(today.tags.memo.dueUids).toEqual([]);
    expect(today.tags.memo.newUids).toEqual([]);
    expect(today.tags.memo.due).toBe(0);
    expect(today.tags.memo.new).toBe(0);
    expect(today.tags.daily.dueUids).toEqual([]);
    expect(today.tags.daily.newUids).toEqual([]);
    expect(today.tags.daily.due).toBe(0);
    expect(today.tags.daily.new).toBe(0);
  });

  it('allocates full quota to single deck', () => {
    const today = makeToday({
      memo: makeTag({
        dueUids: ['a', 'b', 'c', 'd', 'e'],
        newUids: ['f', 'g', 'h', 'i', 'j'],
        due: 5,
        new: 5,
        completed: 0,
      }),
    });

    limitRemainingPracticeData({
      today,
      dailyLimit: 4,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    const totalDue = today.tags.memo.dueUids.length;
    const totalNew = today.tags.memo.newUids.length;
    expect(totalDue + totalNew).toBe(4);
  });

  it('allocates quota proportionally by weight across multiple decks', () => {
    const today = makeToday({
      memo: makeTag({
        dueUids: Array.from({ length: 20 }, (_, i) => `m-due-${i}`),
        newUids: Array.from({ length: 20 }, (_, i) => `m-new-${i}`),
        due: 20,
        new: 20,
        completed: 0,
      }),
      daily: makeTag({
        dueUids: Array.from({ length: 20 }, (_, i) => `d-due-${i}`),
        newUids: Array.from({ length: 20 }, (_, i) => `d-new-${i}`),
        due: 20,
        new: 20,
        completed: 0,
      }),
    });

    limitRemainingPracticeData({
      today,
      dailyLimit: 20,
      tagsList: ['memo', 'daily'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'memo', weight: 75, swapQA: false },
        { name: 'daily', weight: 25, swapQA: false },
      ]),
    });

    const memoTotal = today.tags.memo.dueUids.length + today.tags.memo.newUids.length;
    const dailyTotal = today.tags.daily.dueUids.length + today.tags.daily.newUids.length;
    expect(memoTotal + dailyTotal).toBe(20);
    expect(memoTotal).toBeGreaterThan(dailyTotal);
  });

  it('zeroes out weight=0 decks', () => {
    const today = makeToday({
      memo: makeTag({
        dueUids: ['a', 'b'],
        newUids: ['c'],
        due: 2,
        new: 1,
      }),
      disabled: makeTag({
        dueUids: ['d', 'e', 'f'],
        newUids: ['g'],
        due: 3,
        new: 1,
      }),
    });

    limitRemainingPracticeData({
      today,
      dailyLimit: 5,
      tagsList: ['memo', 'disabled'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'memo', weight: 100, swapQA: false },
        { name: 'disabled', weight: 0, swapQA: false },
      ]),
    });

    expect(today.tags.disabled.dueUids).toEqual([]);
    expect(today.tags.disabled.newUids).toEqual([]);
    expect(today.tags.disabled.due).toBe(0);
    expect(today.tags.disabled.new).toBe(0);
    expect(today.tags.memo.dueUids.length + today.tags.memo.newUids.length).toBeGreaterThan(0);
  });

  it('redistributes unused quota when a deck has fewer cards than its allocation', () => {
    const today = makeToday({
      small: makeTag({
        dueUids: ['a'],
        newUids: [],
        due: 1,
        new: 0,
        completed: 0,
      }),
      large: makeTag({
        dueUids: Array.from({ length: 30 }, (_, i) => `l-due-${i}`),
        newUids: Array.from({ length: 30 }, (_, i) => `l-new-${i}`),
        due: 30,
        new: 30,
        completed: 0,
      }),
    });

    limitRemainingPracticeData({
      today,
      dailyLimit: 20,
      tagsList: ['small', 'large'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'small', weight: 50, swapQA: false },
        { name: 'large', weight: 50, swapQA: false },
      ]),
    });

    const smallTotal = today.tags.small.dueUids.length + today.tags.small.newUids.length;
    const largeTotal = today.tags.large.dueUids.length + today.tags.large.newUids.length;
    expect(smallTotal).toBe(1);
    expect(smallTotal + largeTotal).toBe(20);
  });

  it('does not trim when total cards are fewer than dailyLimit', () => {
    const today = makeToday({
      memo: makeTag({
        dueUids: ['a', 'b'],
        newUids: ['c'],
        due: 2,
        new: 1,
        completed: 0,
      }),
    });

    limitRemainingPracticeData({
      today,
      dailyLimit: 100,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    expect(today.tags.memo.dueUids).toEqual(['a', 'b']);
    expect(today.tags.memo.newUids).toEqual(['c']);
    expect(today.tags.memo.due).toBe(2);
    expect(today.tags.memo.new).toBe(1);
  });
});
