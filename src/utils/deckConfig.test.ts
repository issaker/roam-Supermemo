import { parseDeckConfigs, parseDeckConfigNames } from './deckConfig';

describe('parseDeckConfigs', () => {
  it('returns fallback for undefined input', () => {
    expect(parseDeckConfigs(undefined)).toEqual([]);
  });

  it('returns fallback for null input', () => {
    expect(parseDeckConfigs(null)).toEqual([]);
  });

  it('returns fallback for empty string', () => {
    expect(parseDeckConfigs('')).toEqual([]);
  });

  it('parses valid JSON array', () => {
    const input = JSON.stringify([{ name: 'memo', swapQA: false, weight: 1 }]);
    expect(parseDeckConfigs(input)).toEqual([{ name: 'memo', swapQA: false, weight: 1 }]);
  });

  it('returns fallback for invalid JSON', () => {
    expect(parseDeckConfigs('not json')).toEqual([]);
  });

  it('returns fallback for non-array JSON', () => {
    expect(parseDeckConfigs('{}')).toEqual([]);
  });

  it('uses custom fallback', () => {
    const fallback = [{ name: 'default', swapQA: false, weight: 1, blacklist: false }];
    expect(parseDeckConfigs(undefined, fallback)).toEqual(fallback);
  });
});

describe('parseDeckConfigNames', () => {
  it('returns default fallback for undefined', () => {
    expect(parseDeckConfigNames(undefined)).toEqual(['memo']);
  });

  it('extracts names from valid config', () => {
    const input = JSON.stringify([
      { name: 'memo', swapQA: false, weight: 1 },
      { name: 'daily', swapQA: false, weight: 2 },
    ]);
    expect(parseDeckConfigNames(input)).toEqual(['memo', 'daily']);
  });

  it('returns default fallback for invalid JSON', () => {
    expect(parseDeckConfigNames('bad')).toEqual(['memo']);
  });

  it('uses custom fallback when parsed is empty', () => {
    expect(parseDeckConfigNames('{}')).toEqual(['memo']);
  });
});
