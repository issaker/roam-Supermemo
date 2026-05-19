import {
  applyReinsert,
  reconcileUids,
  computeEffectiveQueue,
  syncQueueWithCardSet,
  hasCardsInSet,
  computeQueueId,
  computeCardSet,
  computeTodayEnd,
  getCardSetUidSet,
  truncateQueueToCardSet,
  loadPersistedQueue,
  savePersistedQueue,
  cleanStaleQueueKeys,
  findDeletedUids,
} from '~/review-runtime/store/queue-logic';
import { RenderMode } from '~/models/practice';
import type { CardSet, QueueState } from '~/review-runtime/store/types';

const emptyCardSet: CardSet = { due: [], new: [], completed: [], lblMeta: {} };

const makeCardSet = (partial: Partial<CardSet> = {}): CardSet => ({
  due: [],
  new: [],
  completed: [],
  lblMeta: {},
  ...partial,
});

const makeQueue = (uids: string[] = [], removedUids: string[] = []): QueueState => ({
  uids,
  removedUids,
});

describe('applyReinsert', () => {
  it('reinserts uid after afterUid with offset 0', () => {
    const prev = makeQueue(['a', 'b', 'c', 'd']);
    const result = applyReinsert(prev, 'd', 'b', 0);
    expect(result.uids).toEqual(['a', 'b', 'd', 'c']);
  });

  it('reinserts uid after afterUid with offset 1', () => {
    const prev = makeQueue(['a', 'b', 'c', 'd']);
    const result = applyReinsert(prev, 'd', 'b', 1);
    expect(result.uids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('reinserts uid at end when offset exceeds remaining', () => {
    const prev = makeQueue(['a', 'b', 'c', 'd']);
    const result = applyReinsert(prev, 'a', 'b', 100);
    expect(result.uids).toEqual(['b', 'c', 'd', 'a']);
  });

  it('keeps uid in place when afterUid not found and uid exists with offset 0', () => {
    const prev = makeQueue(['a', 'b', 'c']);
    const result = applyReinsert(prev, 'a', 'z', 0);
    expect(result.uids).toEqual(['a', 'b', 'c']);
  });

  it('moves uid forward when afterUid not found and uid exists with offset > 0', () => {
    const prev = makeQueue(['a', 'b', 'c']);
    const result = applyReinsert(prev, 'a', 'z', 1);
    expect(result.uids).toEqual(['b', 'a', 'c']);
  });

  it('appends uid at end when both uid and afterUid not in queue', () => {
    const prev = makeQueue(['a', 'b', 'c']);
    const result = applyReinsert(prev, 'x', 'z', 0);
    expect(result.uids).toEqual(['a', 'b', 'c', 'x']);
  });

  it('appends uid at end when uid not in queue and afterUid found', () => {
    const prev = makeQueue(['a', 'b', 'c']);
    const result = applyReinsert(prev, 'x', 'b', 0);
    expect(result.uids).toEqual(['a', 'b', 'x', 'c']);
  });

  it('handles reinsert when uid is already at target position', () => {
    const prev = makeQueue(['a', 'b', 'c']);
    const result = applyReinsert(prev, 'b', 'a', 0);
    expect(result.uids).toEqual(['a', 'b', 'c']);
  });

  it('adjusts insertAt when existingIndex < insertAt', () => {
    const prev = makeQueue(['a', 'b', 'c', 'd']);
    const result = applyReinsert(prev, 'a', 'c', 0);
    expect(result.uids).toEqual(['b', 'c', 'a', 'd']);
  });

  it('preserves removedUids', () => {
    const prev = makeQueue(['a', 'b', 'c'], ['x']);
    const result = applyReinsert(prev, 'c', 'a', 0);
    expect(result.removedUids).toEqual(['x']);
  });

  it('returns new object reference', () => {
    const prev = makeQueue(['a', 'b', 'c']);
    const result = applyReinsert(prev, 'c', 'a', 0);
    expect(result).not.toBe(prev);
    expect(result.uids).not.toBe(prev.uids);
  });
});

describe('reconcileUids', () => {
  it('returns cardSet uids when existing is empty', () => {
    const cardSet = makeCardSet({ due: ['a', 'b'], new: ['c'], completed: [] });
    const result = reconcileUids([], [], cardSet);
    expect(result.uids).toEqual(['a', 'b', 'c']);
    expect(result.removedUids).toEqual([]);
  });

  it('preserves existing order when existing matches cardSet', () => {
    const cardSet = makeCardSet({ due: ['a', 'b'], new: ['c'], completed: [] });
    const result = reconcileUids(['b', 'a', 'c'], [], cardSet);
    expect(result.uids).toEqual(['b', 'a', 'c']);
  });

  it('appends new cards from cardSet to existing', () => {
    const cardSet = makeCardSet({ due: ['a', 'b'], new: ['c', 'd'], completed: [] });
    const result = reconcileUids(['b', 'a'], [], cardSet);
    expect(result.uids).toEqual(['b', 'a', 'c', 'd']);
  });

  it('clears removedUids for cards that reappear in cardSet', () => {
    const cardSet = makeCardSet({ due: ['a', 'b'], new: [], completed: [] });
    const result = reconcileUids(['a', 'b'], ['a', 'x'], cardSet);
    expect(result.removedUids).toEqual(['x']);
  });

  it('keeps existing uids even if absent from cardSet', () => {
    const cardSet = makeCardSet({ due: ['a'], new: [], completed: [] });
    const result = reconcileUids(['a', 'b'], [], cardSet);
    expect(result.uids).toEqual(['a', 'b']);
  });

  it('excludes completed when creating new queue from scratch', () => {
    const cardSet = makeCardSet({ due: ['d1'], new: ['n1'], completed: ['c1'] });
    const result = reconcileUids([], [], cardSet);
    expect(result.uids).toEqual(['d1', 'n1']);
  });

  it('never adds completed cards even when not in existing queue', () => {
    const cardSet = makeCardSet({ due: ['d1'], new: ['n1'], completed: ['c1'] });
    const result = reconcileUids(['d1'], [], cardSet);
    expect(result.uids).toEqual(['d1', 'n1']);
    expect(result.uids).not.toContain('c1');
  });

  it('cross-day: stale completed cards do not enter new day queue', () => {
    const staleCardSet = makeCardSet({
      due: ['due1', 'due2'],
      new: ['new1'],
      completed: ['old1', 'old2', 'old3'],
    });
    const result = reconcileUids([], [], staleCardSet);
    expect(result.uids).toEqual(['due1', 'due2', 'new1']);
    expect(result.uids).not.toContain('old1');
    expect(result.uids).not.toContain('old2');
    expect(result.uids).not.toContain('old3');
  });

  it('same-day reopen: persisted queue preserves completed cards in existingUids', () => {
    const cardSet = makeCardSet({ due: ['due1'], new: [], completed: ['c1', 'c2'] });
    const persisted = makeQueue(['c1', 'c2', 'due1'], []);
    const result = reconcileUids(persisted.uids, persisted.removedUids, cardSet);
    expect(result.uids).toEqual(['c1', 'c2', 'due1']);
  });

  it('handles empty cardSet with existing uids', () => {
    const result = reconcileUids(['a', 'b'], ['x'], emptyCardSet);
    expect(result.uids).toEqual(['a', 'b']);
    expect(result.removedUids).toEqual(['x']);
  });
});

describe('computeEffectiveQueue', () => {
  it('filters out removedUids only', () => {
    const cardSet = makeCardSet({ due: ['a', 'b', 'c'], new: [], completed: [] });
    const result = computeEffectiveQueue(['a', 'b', 'c', 'd'], ['b'], cardSet);
    expect(result).toEqual(['a', 'c', 'd']);
  });

  it('returns empty when all uids are removed', () => {
    const cardSet = makeCardSet({ due: ['a', 'b'], new: [], completed: [] });
    const result = computeEffectiveQueue(['a', 'b'], ['a', 'b'], cardSet);
    expect(result).toEqual([]);
  });

  it('returns all uids when no removedUids', () => {
    const cardSet = makeCardSet({ due: ['a', 'b'], new: ['c'], completed: [] });
    const result = computeEffectiveQueue(['a', 'b', 'c'], [], cardSet);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('keeps uids not in cardSet (e.g. scheduled/completed cards)', () => {
    const result = computeEffectiveQueue(['a', 'b'], [], emptyCardSet);
    expect(result).toEqual(['a', 'b']);
  });

  it('preserves queue order', () => {
    const cardSet = makeCardSet({ due: ['c', 'a', 'b'], new: [], completed: [] });
    const result = computeEffectiveQueue(['c', 'a', 'b'], [], cardSet);
    expect(result).toEqual(['c', 'a', 'b']);
  });
});

describe('syncQueueWithCardSet', () => {
  it('returns same reference when no change', () => {
    const prev = makeQueue(['a', 'b'], []);
    const cardSet = makeCardSet({ due: ['a', 'b'], new: [], completed: [] });
    const result = syncQueueWithCardSet(prev, cardSet);
    expect(result).toBe(prev);
  });

  it('returns new object when uids change', () => {
    const prev = makeQueue(['a'], []);
    const cardSet = makeCardSet({ due: ['a', 'b'], new: [], completed: [] });
    const result = syncQueueWithCardSet(prev, cardSet);
    expect(result).not.toBe(prev);
    expect(result.uids).toEqual(['a', 'b']);
  });

  it('returns new object when removedUids change', () => {
    const prev = makeQueue(['a', 'b'], ['b']);
    const cardSet = makeCardSet({ due: ['a', 'b'], new: [], completed: [] });
    const result = syncQueueWithCardSet(prev, cardSet);
    expect(result).not.toBe(prev);
    expect(result.removedUids).toEqual([]);
  });
});

describe('hasCardsInSet', () => {
  it('returns false for empty cardSet', () => {
    expect(hasCardsInSet(emptyCardSet)).toBe(false);
  });

  it('returns true when due has cards', () => {
    expect(hasCardsInSet(makeCardSet({ due: ['a'] }))).toBe(true);
  });

  it('returns true when new has cards', () => {
    expect(hasCardsInSet(makeCardSet({ new: ['a'] }))).toBe(true);
  });

  it('returns true when completed has cards', () => {
    expect(hasCardsInSet(makeCardSet({ completed: ['a'] }))).toBe(true);
  });
});

describe('computeQueueId', () => {
  it('returns today-date hyphen tag format', () => {
    const result = computeQueueId('memo');
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toBe(`${today}-memo`);
  });
});

describe('computeCardSet', () => {
  it('returns empty cardSet when tag not found', () => {
    const result = computeCardSet({}, 'missing');
    expect(result).toEqual(emptyCardSet);
  });

  it('returns correct cardSet for valid tag', () => {
    const tagCardSets = {
      memo: {
        dueUids: ['a', 'b'],
        newUids: ['c'],
        completedUids: ['d'],
        renderMode: RenderMode.Normal,
        lblDeckMeta: { parent1: ['child1', 'child2'] },
      },
    };
    const result = computeCardSet(tagCardSets, 'memo');
    expect(result.due).toEqual(['a', 'b']);
    expect(result.new).toEqual(['c']);
    expect(result.completed).toEqual(['d']);
    expect(result.lblMeta).toEqual({ parent1: ['child1', 'child2'] });
  });
});

describe('computeTodayEnd', () => {
  it('returns end of today at 23:59:59', () => {
    const result = computeTodayEnd();
    const now = new Date();
    expect(result.getFullYear()).toBe(now.getFullYear());
    expect(result.getMonth()).toBe(now.getMonth());
    expect(result.getDate()).toBe(now.getDate());
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
  });
});

describe('getCardSetUidSet', () => {
  it('combines due, new, and completed into a Set', () => {
    const cardSet = makeCardSet({ due: ['a'], new: ['b'], completed: ['c'] });
    const result = getCardSetUidSet(cardSet);
    expect(result).toBeInstanceOf(Set);
    expect(result.has('a')).toBe(true);
    expect(result.has('b')).toBe(true);
    expect(result.has('c')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('deduplicates across arrays', () => {
    const cardSet = makeCardSet({ due: ['a'], new: ['a'], completed: ['a'] });
    const result = getCardSetUidSet(cardSet);
    expect(result.size).toBe(1);
  });

  it('returns empty Set for empty cardSet', () => {
    const result = getCardSetUidSet(emptyCardSet);
    expect(result.size).toBe(0);
  });
});

describe('truncateQueueToCardSet', () => {
  it('removes uids not in cardSet when cap shrinks', () => {
    const queue = makeQueue(['a', 'b', 'c', 'd', 'e']);
    const cardSet = makeCardSet({ due: ['a', 'b'], new: [], completed: ['c'] });
    const result = truncateQueueToCardSet(queue, cardSet);
    expect(result.uids).toEqual(['a', 'b', 'c']);
  });

  it('returns same reference when no uids are removed', () => {
    const queue = makeQueue(['a', 'b']);
    const cardSet = makeCardSet({ due: ['a', 'b'], new: [], completed: [] });
    const result = truncateQueueToCardSet(queue, cardSet);
    expect(result).toBe(queue);
  });

  it('preserves queue order after truncation', () => {
    const queue = makeQueue(['c', 'a', 'b', 'd']);
    const cardSet = makeCardSet({ due: ['a'], new: ['b'], completed: ['c'] });
    const result = truncateQueueToCardSet(queue, cardSet);
    expect(result.uids).toEqual(['c', 'a', 'b']);
  });

  it('removes all uids when cardSet is empty', () => {
    const queue = makeQueue(['a', 'b']);
    const result = truncateQueueToCardSet(queue, emptyCardSet);
    expect(result.uids).toEqual([]);
  });

  it('preserves removedUids', () => {
    const queue = makeQueue(['a', 'b', 'c'], ['b']);
    const cardSet = makeCardSet({ due: ['a', 'c'], new: [], completed: [] });
    const result = truncateQueueToCardSet(queue, cardSet);
    expect(result.uids).toEqual(['a', 'c']);
    expect(result.removedUids).toEqual(['b']);
  });

  it('handles completed cards staying in queue', () => {
    const queue = makeQueue(['c1', 'c2', 'd1', 'd2']);
    const cardSet = makeCardSet({ due: ['d1'], new: [], completed: ['c1', 'c2'] });
    const result = truncateQueueToCardSet(queue, cardSet);
    expect(result.uids).toEqual(['c1', 'c2', 'd1']);
  });
});

describe('loadPersistedQueue / savePersistedQueue', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips queue state', () => {
    const state = makeQueue(['a', 'b', 'c'], ['d']);
    savePersistedQueue('test-id', state);
    const loaded = loadPersistedQueue('test-id');
    expect(loaded).not.toBeNull();
    expect(loaded!.uids).toEqual(['a', 'b', 'c']);
    expect(loaded!.removedUids).toEqual(['d']);
    expect(loaded!.version).toBe(1);
  });

  it('returns null when no data exists', () => {
    expect(loadPersistedQueue('nonexistent')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    localStorage.setItem('roam-memo:queue:bad', 'not-json');
    expect(loadPersistedQueue('bad')).toBeNull();
  });

  it('returns null for wrong version', () => {
    localStorage.setItem('roam-memo:queue:old', JSON.stringify({ version: 99, uids: ['a'] }));
    expect(loadPersistedQueue('old')).toBeNull();
  });

  it('returns null when uids is not an array', () => {
    localStorage.setItem('roam-memo:queue:bad', JSON.stringify({ version: 1, uids: 'not-array' }));
    expect(loadPersistedQueue('bad')).toBeNull();
  });

  it('defaults removedUids to empty array when missing', () => {
    localStorage.setItem(
      'roam-memo:queue:partial',
      JSON.stringify({ version: 1, uids: ['a'] })
    );
    const loaded = loadPersistedQueue('partial');
    expect(loaded).not.toBeNull();
    expect(loaded!.removedUids).toEqual([]);
  });
});

describe('cleanStaleQueueKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes keys not matching today', () => {
    localStorage.setItem('roam-memo:queue:2025-01-01-memo', '{}');
    localStorage.setItem('roam-memo:queue:2025-01-02-memo', '{}');
    const today = '2025-01-03';
    localStorage.setItem(`roam-memo:queue:${today}-memo`, '{}');
    cleanStaleQueueKeys(today);
    expect(localStorage.getItem('roam-memo:queue:2025-01-01-memo')).toBeNull();
    expect(localStorage.getItem('roam-memo:queue:2025-01-02-memo')).toBeNull();
    expect(localStorage.getItem(`roam-memo:queue:${today}-memo`)).not.toBeNull();
  });

  it('does not remove non-queue localStorage keys', () => {
    localStorage.setItem('other-key', 'value');
    cleanStaleQueueKeys('2025-01-01');
    expect(localStorage.getItem('other-key')).toBe('value');
  });
});

describe('findDeletedUids', () => {
  const originalRoamAlpha = window.roamAlphaAPI;

  beforeEach(() => {
    window.roamAlphaAPI = {
      q: jest.fn(),
    } as any;
  });

  afterAll(() => {
    window.roamAlphaAPI = originalRoamAlpha;
  });

  it('returns empty array for empty input', async () => {
    const result = await findDeletedUids([]);
    expect(result).toEqual([]);
    expect(window.roamAlphaAPI.q).not.toHaveBeenCalled();
  });

  it('returns uids not found in roam', async () => {
    (window.roamAlphaAPI.q as jest.Mock).mockResolvedValue([['a'], ['b']]);
    const result = await findDeletedUids(['a', 'b', 'c']);
    expect(result).toEqual(['c']);
  });

  it('returns all uids when none found in roam', async () => {
    (window.roamAlphaAPI.q as jest.Mock).mockResolvedValue([]);
    const result = await findDeletedUids(['a', 'b']);
    expect(result).toEqual(['a', 'b']);
  });

  it('returns empty array when all found in roam', async () => {
    (window.roamAlphaAPI.q as jest.Mock).mockResolvedValue([['a'], ['b']]);
    const result = await findDeletedUids(['a', 'b']);
    expect(result).toEqual([]);
  });

  it('returns empty array on roamAlphaAPI error', async () => {
    (window.roamAlphaAPI.q as jest.Mock).mockRejectedValue(new Error('fail'));
    const result = await findDeletedUids(['a']);
    expect(result).toEqual([]);
  });
});
