import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import {
  addTurns,
  ALL_CRACKED_BONUS,
  board,
  CHALLENGE_POINTS,
  crackPoints,
  createRound,
  guessChar,
  revealRandom,
  solve,
} from '../../src/games/password/logic';

describe('createRound', () => {
  it('starts with everything hidden except spaces', () => {
    const r = createRound('ab c', 5);
    expect(r.revealed).toEqual([false, false, true, false]);
    expect(board(r)).toEqual(['', '', ' ', '']);
    expect(r).toMatchObject({ tried: [], turns: 5, status: 'playing' });
  });
});

describe('guessChar', () => {
  it('a hit reveals every occurrence, either case, and is free', () => {
    const r = createRound('Pepper', 8);
    expect(guessChar(r, 'p')).toBe('hit');
    expect(board(r)).toEqual(['P', '', 'p', 'p', '', '']);
    expect(r.turns).toBe(8);
    expect(guessChar(r, 'E')).toBe('hit');
    expect(board(r)).toEqual(['P', 'e', 'p', 'p', 'e', '']);
  });

  it('a miss costs one turn and is recorded lowercased', () => {
    const r = createRound('Pepper', 8);
    expect(guessChar(r, 'Z')).toBe('miss');
    expect(r.turns).toBe(7);
    expect(r.tried).toEqual(['z']);
  });

  it('a repeat (either case) is free and not recorded twice', () => {
    const r = createRound('Pepper', 8);
    guessChar(r, 'z');
    expect(guessChar(r, 'Z')).toBe('repeat');
    expect(r.turns).toBe(7);
    expect(r.tried).toEqual(['z']);
  });

  it('digits and symbols match themselves', () => {
    const r = createRound('Soccer#7', 7);
    expect(guessChar(r, '#')).toBe('hit');
    expect(guessChar(r, '7')).toBe('hit');
    expect(guessChar(r, '8')).toBe('miss');
    expect(board(r)).toEqual(['', '', '', '', '', '', '#', '7']);
  });

  it('rejects spaces, multi-character keys and guesses after the round is over', () => {
    const r = createRound('ab', 1);
    expect(guessChar(r, ' ')).toBe('invalid');
    expect(guessChar(r, 'Shift')).toBe('invalid');
    guessChar(r, 'z');
    expect(r.status).toBe('out');
    expect(guessChar(r, 'a')).toBe('invalid');
  });

  it('revealing every character cracks the round', () => {
    const r = createRound('a b', 3);
    guessChar(r, 'a');
    expect(r.status).toBe('playing');
    guessChar(r, 'B');
    expect(r.status).toBe('cracked');
  });

  it('the last turn lost makes the round "out"', () => {
    const r = createRound('abc', 1);
    guessChar(r, 'z');
    expect(r).toMatchObject({ turns: 0, status: 'out' });
  });
});

describe('solve', () => {
  it('an exact match cracks and reveals everything', () => {
    const r = createRound('P3pp3r2010', 7);
    expect(solve(r, 'P3pp3r2010')).toBe(true);
    expect(r.status).toBe('cracked');
    expect(board(r).join('')).toBe('P3pp3r2010');
    expect(r.turns).toBe(7);
  });

  it('is case-sensitive and a wrong guess costs two turns', () => {
    const r = createRound('Pepper', 8);
    expect(solve(r, 'pepper')).toBe(false);
    expect(r.turns).toBe(6);
    expect(r.status).toBe('playing');
  });

  it('never drops below zero turns', () => {
    const r = createRound('Pepper', 1);
    solve(r, 'nope');
    expect(r).toMatchObject({ turns: 0, status: 'out' });
    expect(solve(r, 'Pepper')).toBe(false); // out: must win LAST CHANCE first
  });
});

describe('addTurns', () => {
  it('brings an out round back into play', () => {
    const r = createRound('abc', 1);
    guessChar(r, 'z');
    addTurns(r, 2);
    expect(r).toMatchObject({ turns: 2, status: 'playing' });
  });

  it('does nothing to a cracked round', () => {
    const r = createRound('a', 3);
    guessChar(r, 'a');
    addTurns(r, 2);
    expect(r).toMatchObject({ turns: 3, status: 'cracked' });
  });
});

describe('revealRandom', () => {
  it('reveals all occurrences of one hidden character and marks it tried', () => {
    const r = createRound('Pepper', 8);
    guessChar(r, 'p');
    const ch = revealRandom(r, mulberry32(1));
    expect(ch).not.toBeNull();
    expect('err').toContain(ch!.toLowerCase());
    const shown = board(r).filter((c) => c.toLowerCase() === ch!.toLowerCase()).length;
    expect(shown).toBe([...'Pepper'].filter((c) => c.toLowerCase() === ch!.toLowerCase()).length);
    expect(r.tried).toContain(ch!.toLowerCase());
    expect(r.turns).toBe(8);
  });

  it('can crack the round, and returns null when nothing is hidden', () => {
    const r = createRound('aa', 3);
    expect(revealRandom(r, mulberry32(2))).toBe('a');
    expect(r.status).toBe('cracked');
    expect(revealRandom(r, mulberry32(2))).toBeNull();
  });

  it('never reveals a space', () => {
    for (let seed = 0; seed < 50; seed++) {
      const r = createRound('a b', 3);
      expect(revealRandom(r, mulberry32(seed))).not.toBe(' ');
    }
  });
});

describe('scoring', () => {
  it('pays 100 × round number + 50 × turns left', () => {
    expect(crackPoints(0, 7)).toBe(450);
    expect(crackPoints(5, 0)).toBe(600);
    expect(crackPoints(2, 3)).toBe(450);
  });

  it('has the spec constants', () => {
    expect(CHALLENGE_POINTS).toBe(25);
    expect(ALL_CRACKED_BONUS).toBe(1000);
  });
});
