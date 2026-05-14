import { allocateDailyCards } from './dataProcessing';
import { TagCardSet, TagCardSets, RenderMode } from '~/models/practice';

const makeTag = (overrides: Partial<TagCardSet> = {}): TagCardSet => ({
  dueUids: [],
  newUids: [],
  completedUids: [],
  renderMode: RenderMode.Normal,
  lblDeckMeta: {},
  ...overrides,
});

const makeTagCardSets = (tags: Record<string, TagCardSet>): TagCardSets => tags;

describe('allocateDailyCards', () => {
  it('returns early without modification when dailyLimit is 0', () => {
    const sets = makeTagCardSets({
      memo: makeTag({ dueUids: ['a', 'b'], newUids: ['c'] }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 0,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: '',
    });

    expect(result.memo.dueUids).toEqual(['a', 'b']);
    expect(result.memo.newUids).toEqual(['c']);
  });

  it('clears all deck due/new when remainingLimit is 0 (all quota used)', () => {
    const sets = makeTagCardSets({
      memo: makeTag({
        dueUids: ['a', 'b'],
        newUids: ['c'],
        completedUids: Array.from({ length: 10 }, (_, i) => `done-${i}`),
      }),
      daily: makeTag({ dueUids: ['d'], newUids: ['e', 'f'] }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 5,
      tagsList: ['memo', 'daily'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'memo', weight: 50, swapQA: false },
        { name: 'daily', weight: 50, swapQA: false },
      ]),
    });

    expect(result.memo.dueUids).toEqual([]);
    expect(result.memo.newUids).toEqual([]);
    expect(result.daily.dueUids).toEqual([]);
    expect(result.daily.newUids).toEqual([]);
  });

  it('allocates full quota to single deck', () => {
    const sets = makeTagCardSets({
      memo: makeTag({ dueUids: ['a', 'b', 'c', 'd', 'e'], newUids: ['f', 'g', 'h', 'i', 'j'] }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 4,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    expect(result.memo.dueUids.length + result.memo.newUids.length).toBe(4);
  });

  it('allocates quota proportionally by weight across multiple decks', () => {
    const sets = makeTagCardSets({
      memo: makeTag({
        dueUids: Array.from({ length: 20 }, (_, i) => `m-due-${i}`),
        newUids: Array.from({ length: 20 }, (_, i) => `m-new-${i}`),
      }),
      daily: makeTag({
        dueUids: Array.from({ length: 20 }, (_, i) => `d-due-${i}`),
        newUids: Array.from({ length: 20 }, (_, i) => `d-new-${i}`),
      }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 20,
      tagsList: ['memo', 'daily'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'memo', weight: 75, swapQA: false },
        { name: 'daily', weight: 25, swapQA: false },
      ]),
    });

    const memoTotal = result.memo.dueUids.length + result.memo.newUids.length;
    const dailyTotal = result.daily.dueUids.length + result.daily.newUids.length;
    expect(memoTotal + dailyTotal).toBe(20);
    expect(memoTotal).toBeGreaterThan(dailyTotal);
  });

  it('zeroes out weight=0 decks', () => {
    const sets = makeTagCardSets({
      memo: makeTag({ dueUids: ['a', 'b'], newUids: ['c'] }),
      disabled: makeTag({ dueUids: ['d', 'e', 'f'], newUids: ['g'] }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 5,
      tagsList: ['memo', 'disabled'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'memo', weight: 100, swapQA: false },
        { name: 'disabled', weight: 0, swapQA: false },
      ]),
    });

    expect(result.disabled.dueUids).toEqual([]);
    expect(result.disabled.newUids).toEqual([]);
    expect(result.memo.dueUids.length + result.memo.newUids.length).toBeGreaterThan(0);
  });

  it('limits deck to its proportional cap when it has fewer cards than its allocation', () => {
    const sets = makeTagCardSets({
      small: makeTag({ dueUids: ['a'], newUids: [] }),
      large: makeTag({
        dueUids: Array.from({ length: 30 }, (_, i) => `l-due-${i}`),
        newUids: Array.from({ length: 30 }, (_, i) => `l-new-${i}`),
      }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 20,
      tagsList: ['small', 'large'],
      isCramming: false,
      deckConfigs: JSON.stringify([
        { name: 'small', weight: 50, swapQA: false },
        { name: 'large', weight: 50, swapQA: false },
      ]),
    });

    const smallTotal = result.small.dueUids.length + result.small.newUids.length;
    const largeTotal = result.large.dueUids.length + result.large.newUids.length;
    expect(smallTotal).toBe(1);
    expect(largeTotal).toBe(10);
    expect(smallTotal + largeTotal).toBe(11);
  });

  it('does not trim when total cards are fewer than dailyLimit', () => {
    const sets = makeTagCardSets({
      memo: makeTag({ dueUids: ['a', 'b'], newUids: ['c'] }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 100,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    expect(result.memo.dueUids).toEqual(['a', 'b']);
    expect(result.memo.newUids).toEqual(['c']);
  });

  it('returns as-is when isCramming is true', () => {
    const sets = makeTagCardSets({
      memo: makeTag({ dueUids: ['a', 'b', 'c'], newUids: ['d', 'e'] }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 2,
      tagsList: ['memo'],
      isCramming: true,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    expect(result.memo.dueUids).toEqual(['a', 'b', 'c']);
    expect(result.memo.newUids).toEqual(['d', 'e']);
  });

  it('preserves completedUids when trimming', () => {
    const completedIds = ['done-1', 'done-2'];
    const sets = makeTagCardSets({
      memo: makeTag({
        dueUids: ['a', 'b', 'c', 'd', 'e'],
        newUids: ['f', 'g', 'h'],
        completedUids: completedIds,
      }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 5,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    expect(result.memo.completedUids).toEqual(completedIds);
    expect(result.memo.dueUids.length + result.memo.newUids.length).toBe(3);
  });

  it('preserves renderMode and lblDeckMeta through allocation', () => {
    const lblMeta = { 'parent-uid': ['child-1', 'child-2'] };
    const sets = makeTagCardSets({
      memo: makeTag({
        dueUids: ['a', 'b', 'c', 'd', 'e'],
        newUids: ['f', 'g', 'h'],
        renderMode: RenderMode.AnswerFirst,
        lblDeckMeta: lblMeta,
      }),
    });

    const result = allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 3,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    expect(result.memo.renderMode).toBe(RenderMode.AnswerFirst);
    expect(result.memo.lblDeckMeta).toEqual(lblMeta);
  });

  it('does not mutate the input', () => {
    const originalDue = ['a', 'b', 'c', 'd', 'e'];
    const originalNew = ['f', 'g', 'h'];
    const sets = makeTagCardSets({
      memo: makeTag({ dueUids: [...originalDue], newUids: [...originalNew] }),
    });

    allocateDailyCards({
      tagCardSets: sets,
      dailyLimit: 3,
      tagsList: ['memo'],
      isCramming: false,
      deckConfigs: JSON.stringify([{ name: 'memo', weight: 100, swapQA: false }]),
    });

    expect(sets.memo.dueUids).toEqual(originalDue);
    expect(sets.memo.newUids).toEqual(originalNew);
  });

  describe('quota stability', () => {
    it('keeps per-deck queue length stable after completing cards', () => {
      const deckConfigs = JSON.stringify([
        { name: 'small', weight: 50, swapQA: false },
        { name: 'large', weight: 50, swapQA: false },
      ]);
      const dailyLimit = 20;

      const before = allocateDailyCards({
        tagCardSets: makeTagCardSets({
          small: makeTag({ dueUids: ['s1', 's2', 's3'], newUids: [] }),
          large: makeTag({
            dueUids: Array.from({ length: 30 }, (_, i) => `l-due-${i}`),
            newUids: Array.from({ length: 30 }, (_, i) => `l-new-${i}`),
          }),
        }),
        dailyLimit,
        tagsList: ['small', 'large'],
        isCramming: false,
        deckConfigs,
      });

      const beforeSmall = before.small.dueUids.length + before.small.newUids.length + before.small.completedUids.length;
      const beforeLarge = before.large.dueUids.length + before.large.newUids.length + before.large.completedUids.length;

      // Simulate completing 2 cards from small and 3 from large
      const after = allocateDailyCards({
        tagCardSets: makeTagCardSets({
          small: makeTag({ dueUids: ['s3'], newUids: [], completedUids: ['s1', 's2'] }),
          large: makeTag({
            dueUids: Array.from({ length: 27 }, (_, i) => `l-due-${i + 3}`),
            newUids: Array.from({ length: 30 }, (_, i) => `l-new-${i}`),
            completedUids: ['l-due-0', 'l-due-1', 'l-due-2'],
          }),
        }),
        dailyLimit,
        tagsList: ['small', 'large'],
        isCramming: false,
        deckConfigs,
      });

      const afterSmall = after.small.dueUids.length + after.small.newUids.length + after.small.completedUids.length;
      const afterLarge = after.large.dueUids.length + after.large.newUids.length + after.large.completedUids.length;

      expect(afterSmall).toBe(beforeSmall);
      expect(afterLarge).toBe(beforeLarge);
    });

    it('allocates proportionally by weight across decks', () => {
      const result = allocateDailyCards({
        tagCardSets: makeTagCardSets({
          tiny: makeTag({ dueUids: ['t1'], newUids: [] }),
          high: makeTag({
            dueUids: Array.from({ length: 30 }, (_, i) => `h-due-${i}`),
            newUids: [],
          }),
          low: makeTag({
            dueUids: Array.from({ length: 30 }, (_, i) => `lo-due-${i}`),
            newUids: [],
          }),
        }),
        dailyLimit: 20,
        tagsList: ['tiny', 'high', 'low'],
        isCramming: false,
        deckConfigs: JSON.stringify([
          { name: 'tiny', weight: 20, swapQA: false },
          { name: 'high', weight: 50, swapQA: false },
          { name: 'low', weight: 30, swapQA: false },
        ]),
      });

      const highTotal = result.high.dueUids.length + result.high.newUids.length;
      const lowTotal = result.low.dueUids.length + result.low.newUids.length;
      expect(highTotal).toBeGreaterThan(lowTotal);
    });

    it('breaks weight ties by tagsList order', () => {
      const result = allocateDailyCards({
        tagCardSets: makeTagCardSets({
          alpha: makeTag({ dueUids: ['a1'], newUids: [] }),
          beta: makeTag({ dueUids: ['b1'], newUids: [] }),
          gamma: makeTag({
            dueUids: Array.from({ length: 30 }, (_, i) => `g-due-${i}`),
            newUids: [],
          }),
        }),
        dailyLimit: 20,
        tagsList: ['alpha', 'beta', 'gamma'],
        isCramming: false,
        deckConfigs: JSON.stringify([
          { name: 'alpha', weight: 25, swapQA: false },
          { name: 'beta', weight: 25, swapQA: false },
          { name: 'gamma', weight: 50, swapQA: false },
        ]),
      });

      // alpha and beta both have 1 card but proportional cap of 5 each
      // gamma has proportional cap of 10
      // excess from alpha/beta is no longer redistributed
      const alphaTotal = result.alpha.dueUids.length + result.alpha.newUids.length;
      const betaTotal = result.beta.dueUids.length + result.beta.newUids.length;
      expect(alphaTotal).toBe(1);
      expect(betaTotal).toBe(1);
      const gammaTotal = result.gamma.dueUids.length + result.gamma.newUids.length;
      expect(gammaTotal).toBe(10);
    });
  });
});
