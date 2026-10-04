import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { buildDeck, createRun, current, DECK_BONUS, multiplier, pick, timeLimit } from '../../src/games/bughunt/logic';
import { SNIPPETS, type Snippet } from '../../src/games/bughunt/snippets';

const snip = (id: string, level: 1 | 2 | 3 = 1, bug = 2): Snippet => ({
  id, level, kind: 'logic', goal: 'g', code: ['a', 'b', 'c', 'd', 'e', 'f'], bug, fix: 'x', why: 'w', check: 'c',
});

describe('bug hunt logic', () => {
  it('multiplier grows every 3 in a row and caps at 5', () => {
    expect([0, 2, 3, 6, 12, 30].map(multiplier)).toEqual([1, 1, 2, 3, 5, 5]);
  });

  it('time limit depends on level and shrinks to a 10 s floor', () => {
    expect(timeLimit(1, 0)).toBe(20);
    expect(timeLimit(2, 0)).toBe(25);
    expect(timeLimit(3, 0)).toBe(30);
    expect(timeLimit(1, 4)).toBe(18);
    expect(timeLimit(1, 100)).toBe(10);
    expect(timeLimit(3, 100)).toBe(10);
  });

  it('deck uses every snippet once, opens easy and saves level 3 for last', () => {
    const deck = buildDeck(SNIPPETS, mulberry32(1));
    expect(deck).toHaveLength(SNIPPETS.length);
    expect(new Set(deck.map((d) => d.id)).size).toBe(SNIPPETS.length);
    expect(deck.slice(0, 5).every((d) => d.level === 1)).toBe(true);
    const firstHard = deck.findIndex((d) => d.level === 3);
    expect(deck.slice(firstHard).every((d) => d.level === 3)).toBe(true);
  });

  it('scores a right pick by level, multiplier and time left', () => {
    const s = createRun([snip('a', 2), snip('b', 2)], mulberry32(2));
    const r = pick(s, current(s)!.bug, 7.04);
    expect(r).toMatchObject({ right: true, points: 270, bonus: 0, over: false });
    expect(r!.snippet.id).toBeTruthy();
    expect(s.score).toBe(270);
    expect(s.streak).toBe(1);
  });

  it('applies ×2 on the 4th right pick in a row', () => {
    const s = createRun(Array.from({ length: 6 }, (_, i) => snip(`i${i}`)), mulberry32(3));
    for (let i = 0; i < 3; i++) pick(s, current(s)!.bug, 0);
    expect(pick(s, current(s)!.bug, 0)!.points).toBe(200);
  });

  it('wrong picks and timeouts are strikes; three strikes ends the run', () => {
    const s = createRun(Array.from({ length: 6 }, (_, i) => snip(`i${i}`)), mulberry32(4));
    pick(s, 2, 3);
    expect(pick(s, 0, 3)).toMatchObject({ right: false, points: 0, over: false });
    expect(s.streak).toBe(0);
    expect(pick(s, null, 0)).toMatchObject({ right: false, over: false });
    expect(pick(s, 5, 3)).toMatchObject({ over: true });
    expect(current(s)).toBeNull();
    expect(pick(s, 2, 3)).toBeNull();
  });

  it('clearing the deck adds the bonus once', () => {
    const s = createRun([snip('a'), snip('b')], mulberry32(5));
    pick(s, 2, 0);
    const last = pick(s, 2, 0)!;
    expect(last).toMatchObject({ bonus: DECK_BONUS, over: true });
    expect(s.score).toBe(200 + DECK_BONUS);
  });
});
