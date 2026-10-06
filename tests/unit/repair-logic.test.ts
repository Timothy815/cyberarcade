import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { buildDeck, CORRECT_BONUS, firstTryPoints, RepairRun, START_TIME, WRONG_PENALTY } from '../../src/games/repair/logic';
import { PUZZLES } from '../../src/games/repair/puzzles';

const newRun = (seed = 1) => new RepairRun(PUZZLES, mulberry32(seed));
const wrongs = (run: RepairRun) => [0, 1, 2].filter((i) => i !== run.puzzle.answer);

/** Plays option `i` through to the result phase. */
function patch(run: RepairRun, i: number) {
  expect(run.choose(i)).not.toBeNull();
  return run.finishPlay()!;
}

describe('repair logic', () => {
  it('keeps the deck in tier order over 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const deck = buildDeck(PUZZLES, mulberry32(seed));
      expect(deck).toHaveLength(18);
      expect(deck.map((p) => p.tier)).toEqual([...Array(6).fill(1), ...Array(6).fill(2), ...Array(6).fill(3)]);
      expect(new Set(deck.map((p) => p.id)).size).toBe(18);
    }
  });

  it('runs the clock only in pick', () => {
    const run = newRun();
    expect(run.time).toBe(START_TIME);
    run.tick(5);
    expect(run.time).toBe(START_TIME - 5);
    run.choose(run.puzzle.answer);
    run.tick(5);
    expect(run.time).toBe(START_TIME - 5);
    run.finishPlay();
    expect(run.time).toBe(START_TIME - 5 + CORRECT_BONUS);
    run.tick(5);
    expect(run.time).toBe(START_TIME - 5 + CORRECT_BONUS);
  });

  it('scores a first try by tier and speed', () => {
    expect(firstTryPoints(1, 0)).toBe(200);
    expect(firstTryPoints(2, 7.9)).toBe(265);
    expect(firstTryPoints(3, 25)).toBe(300);
    const run = newRun();
    run.tick(7.5);
    const out = patch(run, run.puzzle.answer);
    expect(out).toMatchObject({ kind: 'correct', points: 165 });
    expect(run.score).toBe(165);
    expect(run.fixed).toBe(1);
  });

  it('takes time for a wrong patch, strikes it, and scores a second try at 25 × tier', () => {
    const run = newRun();
    const [w] = wrongs(run);
    const out = patch(run, w);
    expect(out.kind).toBe('wrong');
    expect(out.hint).toBe(run.puzzle.hints[w]);
    expect(run.time).toBe(START_TIME - WRONG_PENALTY);
    expect(run.struck.has(w)).toBe(true);
    expect(run.finishResult()).toBeNull();
    expect(run.phase).toBe('pick');
    expect(run.choose(w)).toBeNull(); // struck options are ignored
    expect(patch(run, run.puzzle.answer)).toMatchObject({ kind: 'correct', points: 25 });
  });

  it('auto-solves after both wrong options, for no points', () => {
    const run = newRun();
    const id = run.puzzle.id;
    for (const w of wrongs(run)) {
      patch(run, w);
      if (run.struck.size < 2) run.finishResult();
    }
    const auto = run.finishResult();
    expect(auto?.status).toBe('done');
    expect(run.phase).toBe('play');
    expect(run.finishPlay()).toMatchObject({ kind: 'auto', points: 0 });
    run.finishResult();
    expect(run.score).toBe(0);
    expect(run.fixed).toBe(0);
    expect(run.puzzle.id).not.toBe(id);
    expect(run.phase).toBe('pick');
  });

  it('ignores choices outside pick or out of range', () => {
    const run = newRun();
    expect(run.choose(3)).toBeNull();
    expect(run.choose(-1)).toBeNull();
    run.choose(0);
    expect(run.choose(1)).toBeNull();
  });

  it('loses the link when the clock runs out', () => {
    const run = newRun();
    run.tick(START_TIME);
    expect(run.phase).toBe('over');
    expect(run.ending).toBe('lost');
  });

  it('loses the link when a wrong patch empties the clock', () => {
    const run = newRun();
    run.tick(START_TIME - 4);
    patch(run, wrongs(run)[0]);
    expect(run.time).toBe(0);
    expect(run.phase).toBe('result');
    run.finishResult();
    expect(run.ending).toBe('lost');
  });

  it('restores the network after the last puzzle, with a time bonus', () => {
    const run = newRun();
    for (let i = 0; i < 18; i++) {
      patch(run, run.puzzle.answer); // instant: full speed bonus
      run.finishResult();
    }
    expect(run.phase).toBe('over');
    expect(run.ending).toBe('restored');
    expect(run.fixed).toBe(18);
    expect(run.time).toBe(START_TIME + 18 * CORRECT_BONUS);
    const base = 6 * (200 + 300 + 400);
    expect(run.score).toBe(base + 10 * (START_TIME + 18 * CORRECT_BONUS));
  });

  it('changes nothing once over', () => {
    const run = newRun();
    run.tick(START_TIME);
    const snapshot = { time: run.time, score: run.score, index: run.index };
    run.tick(5);
    expect(run.choose(0)).toBeNull();
    expect(run.finishPlay()).toBeNull();
    expect(run.finishResult()).toBeNull();
    expect({ time: run.time, score: run.score, index: run.index }).toEqual(snapshot);
  });
});
