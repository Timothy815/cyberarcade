import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import type { PhishItem } from '../../src/games/phish/items';
import { ITEMS } from '../../src/games/phish/items';
import { answer, buildDeck, createRun, current, DECK_BONUS, multiplier, timeLimit } from '../../src/games/phish/logic';

const item = (id: string, phish: boolean, level: 1 | 2 | 3 = 1): PhishItem => ({
  id, kind: 'text', from: 'x', body: 'y', phish, level, clue: 'y', why: 'z',
});

describe('phish logic', () => {
  it('multiplier grows every 3 in a row and caps at 5', () => {
    expect([0, 2, 3, 5, 6, 9, 12, 30].map(multiplier)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });

  it('time limit shrinks from 8 s to a 3 s floor', () => {
    expect(timeLimit(0)).toBe(8);
    expect(timeLimit(4)).toBe(7);
    expect(timeLimit(20)).toBe(3);
    expect(timeLimit(100)).toBe(3);
  });

  it('deck uses every item once, starts easy and keeps level 3 out of the first 15', () => {
    const deck = buildDeck(ITEMS, mulberry32(1));
    expect(deck).toHaveLength(ITEMS.length);
    expect(new Set(deck.map((d) => d.id)).size).toBe(ITEMS.length);
    expect(deck.slice(0, 5).every((d) => d.level === 1)).toBe(true);
    expect(deck.slice(0, 15).every((d) => d.level < 3)).toBe(true);
  });

  it('scores right answers with multiplier and time bonus', () => {
    const s = createRun([item('a', true), item('b', false), item('c', true), item('d', true), item('e', false)], mulberry32(2));
    const first = current(s)!;
    const r = answer(s, first.phish, 5.04);
    expect(r).toEqual({ right: true, points: 150, bonus: 0, over: false });
    expect(s.streak).toBe(1);
    expect(s.score).toBe(150);
  });

  it('applies ×2 on the 4th answer in a row', () => {
    const s = createRun(Array.from({ length: 8 }, (_, i) => item(`i${i}`, i % 2 === 0)), mulberry32(3));
    for (let i = 0; i < 3; i++) answer(s, current(s)!.phish, 0);
    expect(answer(s, current(s)!.phish, 0).points).toBe(200);
  });

  it('wrong answers and timeouts are strikes; three strikes ends the run', () => {
    const s = createRun(Array.from({ length: 8 }, (_, i) => item(`i${i}`, true)), mulberry32(4));
    answer(s, true, 3);
    expect(answer(s, false, 3)).toMatchObject({ right: false, points: 0, over: false });
    expect(s.streak).toBe(0);
    expect(answer(s, null, 0)).toMatchObject({ right: false, over: false });
    expect(answer(s, false, 3)).toMatchObject({ over: true });
    expect(current(s)).toBeNull();
    expect(answer(s, true, 3)).toMatchObject({ points: 0, over: true });
  });

  it('clearing the deck adds the bonus once', () => {
    const s = createRun([item('a', true), item('b', false)], mulberry32(5));
    answer(s, current(s)!.phish, 0);
    const last = answer(s, current(s)!.phish, 0);
    expect(last).toMatchObject({ right: true, bonus: DECK_BONUS, over: true });
    expect(s.score).toBe(100 + 100 + DECK_BONUS);
  });
});
