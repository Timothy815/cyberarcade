import { beforeEach, describe, expect, it } from 'vitest';
import { createScores, formatScore, sanitizeInitials, SCORES_KEY, type Scores } from '../../src/core/scores';
import type { KeyValueStore } from '../../src/core/storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

describe('sanitizeInitials', () => {
  it('uppercases and keeps three letters', () => {
    expect(sanitizeInitials('zak')).toBe('ZAK');
  });
  it('rejects blocklisted and malformed initials', () => {
    expect(sanitizeInitials('ass')).toBe('???');
    expect(sanitizeInitials('A1')).toBe('???');
    expect(sanitizeInitials('')).toBe('???');
  });
});

describe('formatScore', () => {
  it('adds thousands separators', () => {
    expect(formatScore(48200)).toBe('48,200');
    expect(formatScore(-5)).toBe('0');
  });
});

describe('scores', () => {
  let store: ReturnType<typeof memoryStore>;
  let scores: Scores;
  beforeEach(() => {
    store = memoryStore();
    scores = createScores(store);
  });

  it('starts empty', () => {
    expect(scores.top('invaders')).toEqual([]);
  });

  it('inserts in descending order and returns the rank', () => {
    expect(scores.add('invaders', 'AAA', 100)).toBe(0);
    expect(scores.add('invaders', 'BBB', 300)).toBe(0);
    expect(scores.add('invaders', 'CCC', 200)).toBe(1);
    expect(scores.top('invaders').map((e) => e.score)).toEqual([300, 200, 100]);
  });

  it('ranks ties below the existing score', () => {
    scores.add('phish', 'AAA', 100);
    expect(scores.add('phish', 'BBB', 100)).toBe(1);
  });

  it('keeps only the top 10', () => {
    for (let i = 1; i <= 12; i++) scores.add('port', 'AAA', i * 10);
    const list = scores.top('port');
    expect(list).toHaveLength(10);
    expect(list[9].score).toBe(30);
    expect(scores.add('port', 'LOW', 5)).toBe(-1);
  });

  it('reports whether a score qualifies', () => {
    expect(scores.qualifies('port', 0)).toBe(false);
    expect(scores.qualifies('port', 1)).toBe(true);
    for (let i = 1; i <= 10; i++) scores.add('port', 'AAA', i * 10);
    expect(scores.qualifies('port', 10)).toBe(false);
    expect(scores.qualifies('port', 11)).toBe(true);
  });

  it('sanitizes initials on insert', () => {
    scores.add('invaders', 'ass', 50);
    expect(scores.top('invaders')[0].initials).toBe('???');
  });

  it('persists under one namespaced key and keeps games separate', () => {
    scores.add('invaders', 'AAA', 10);
    scores.add('phish', 'BBB', 20);
    expect([...store.data.keys()]).toEqual([SCORES_KEY]);
    const reloaded = createScores(store);
    expect(reloaded.top('invaders')[0].initials).toBe('AAA');
    expect(reloaded.top('phish')[0].initials).toBe('BBB');
  });

  it('clears all boards', () => {
    scores.add('invaders', 'AAA', 10);
    scores.clearAll();
    expect(scores.top('invaders')).toEqual([]);
  });

  it('survives corrupt JSON', () => {
    store.data.set(SCORES_KEY, '{not json');
    expect(createScores(store).top('invaders')).toEqual([]);
  });

  it('keeps working in memory when storage throws', () => {
    const s = createScores(throwingStore);
    expect(s.add('invaders', 'AAA', 10)).toBe(0);
    expect(s.top('invaders')[0].score).toBe(10);
    expect(() => s.clearAll()).not.toThrow();
  });

  it('keeps working in memory when there is no storage at all', () => {
    const s = createScores(null);
    s.add('invaders', 'AAA', 10);
    expect(s.top('invaders')).toHaveLength(1);
  });
});
