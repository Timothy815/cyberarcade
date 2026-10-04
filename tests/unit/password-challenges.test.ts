import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import {
  bits,
  caesar,
  CAESAR_WORDS,
  createChallenges,
  DECODE_SECONDS,
  makeBinary,
  makeCaesar,
  TRIVIA,
  TRIVIA_SECONDS,
} from '../../src/games/password/challenges';

describe('trivia bank', () => {
  it('has about 40 unique questions', () => {
    expect(TRIVIA.length).toBeGreaterThanOrEqual(40);
    expect(new Set(TRIVIA.map((t) => t.q)).size).toBe(TRIVIA.length);
  });

  it('every item has 4 unique choices and a valid answer', () => {
    for (const t of TRIVIA) {
      expect(t.choices, t.q).toHaveLength(4);
      expect(new Set(t.choices).size, t.q).toBe(4);
      expect([0, 1, 2, 3]).toContain(t.answer);
    }
  });
});

describe('caesar', () => {
  it('shifts forward and wraps', () => {
    expect(caesar('ABC', 1)).toBe('BCD');
    expect(caesar('XYZ', 3)).toBe('ABC');
    expect(caesar(caesar('HACKER', 3), -3)).toBe('HACKER');
  });

  it('makeCaesar: shift 1–3, 4 unique word choices, the answer decodes the prompt', () => {
    for (let seed = 0; seed < 200; seed++) {
      const c = makeCaesar(mulberry32(seed));
      const shift = Number(c.detail.replace('SHIFT BACK ', ''));
      expect([1, 2, 3]).toContain(shift);
      expect(c.choices).toHaveLength(4);
      expect(new Set(c.choices).size).toBe(4);
      for (const w of c.choices) expect(CAESAR_WORDS).toContain(w);
      expect(caesar(c.prompt, -shift)).toBe(c.choices[c.answer]);
      expect(c.seconds).toBe(DECODE_SECONDS);
    }
  });

  it('every choice has the same length as the answer, so length cannot give it away', () => {
    for (let seed = 0; seed < 200; seed++) {
      const c = makeCaesar(mulberry32(seed));
      const rightLength = c.choices[c.answer].length;
      for (const w of c.choices) expect(w.length).toBe(rightLength);
    }
  });
});

describe('binary', () => {
  it('bits pads to 8', () => {
    expect(bits(5)).toBe('00000101');
    expect(bits(255)).toBe('11111111');
  });

  it('makeBinary: 1–255, 4 unique choices in range, the answer is the value', () => {
    for (let seed = 0; seed < 300; seed++) {
      const c = makeBinary(mulberry32(seed));
      const n = parseInt(c.prompt, 2);
      expect(c.prompt).toMatch(/^[01]{8}$/);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(255);
      expect(c.choices[c.answer]).toBe(String(n));
      expect(new Set(c.choices).size).toBe(4);
      for (const s of c.choices) {
        const v = Number(s);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(255);
      }
      expect(c.detail).toBe('128 64 32 16 8 4 2 1');
    }
  });
});

describe('createChallenges', () => {
  it('mixes about 70% trivia and 30% decode', () => {
    const next = createChallenges(mulberry32(3));
    const kinds = Array.from({ length: 1000 }, () => next().kind);
    const trivia = kinds.filter((k) => k === 'trivia').length;
    expect(trivia).toBeGreaterThan(620);
    expect(trivia).toBeLessThan(780);
    expect(kinds).toContain('caesar');
    expect(kinds).toContain('binary');
  });

  it('does not repeat a trivia question until the bank is used up', () => {
    const next = createChallenges(mulberry32(5));
    const seen: string[] = [];
    while (seen.length < TRIVIA.length) {
      const c = next();
      if (c.kind === 'trivia') seen.push(c.prompt);
    }
    expect(new Set(seen).size).toBe(TRIVIA.length);
  });

  it('trivia challenges carry the bank answer and a 10 s timer', () => {
    const next = createChallenges(mulberry32(9));
    for (let i = 0; i < 50; i++) {
      const c = next();
      if (c.kind !== 'trivia') continue;
      const t = TRIVIA.find((x) => x.q === c.prompt)!;
      expect(c.choices[c.answer]).toBe(t.choices[t.answer]);
      expect(c.seconds).toBe(TRIVIA_SECONDS);
    }
  });

  it('shuffles trivia choices across positions, always keeping the bank answer at `answer`', () => {
    const next = createChallenges(mulberry32(11));
    const positionsByQuestion = new Map<string, Set<number>>();
    let seen = 0;
    while (seen < 800) {
      const c = next();
      if (c.kind !== 'trivia') continue;
      seen++;
      const t = TRIVIA.find((x) => x.q === c.prompt)!;
      expect(c.choices[c.answer]).toBe(t.choices[t.answer]);
      expect(new Set(c.choices)).toEqual(new Set(t.choices));
      const positions = positionsByQuestion.get(c.prompt) ?? new Set<number>();
      positions.add(c.answer);
      positionsByQuestion.set(c.prompt, positions);
    }
    // At least one question is seen at more than one position across its repeated draws: proof it is reshuffled, not bank order.
    expect([...positionsByQuestion.values()].some((s) => s.size >= 2)).toBe(true);
    const allPositions = new Set([...positionsByQuestion.values()].flatMap((s) => [...s]));
    expect(allPositions.size).toBeGreaterThanOrEqual(3);
  });
});
