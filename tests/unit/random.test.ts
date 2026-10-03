import { describe, expect, it } from 'vitest';
import { between, mulberry32, pick, shuffle } from '../../src/core/random';

describe('random', () => {
  it('mulberry32 is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('shuffle returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, mulberry32(7));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(out).not.toEqual(input);
    expect(shuffle(input, mulberry32(7))).toEqual(out);
  });

  it('pick and between stay in range', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 200; i++) {
      expect(['a', 'b', 'c']).toContain(pick(['a', 'b', 'c'], rng));
      const v = between(5, 10, rng);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
  });
});
