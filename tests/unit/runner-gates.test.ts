import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { labelMatches, labelNet, makeGate, tierFor } from '../../src/games/runner/gates';

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);

describe('runner gates', () => {
  it('follows the tier schedule: prefix, then /24, then look-alike networks', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(tierFor)).toEqual(['prefix', 'prefix', 'prefix', 'cidr', 'cidr', 'cidr', 'near', 'near']);
  });

  it('reads a prefix label as its /24 network', () => {
    expect(labelNet('192.168.4.x')).toBe('192.168.4.0/24');
    expect(labelNet('10.0.7.0/24')).toBe('10.0.7.0/24');
    expect(labelMatches('192.168.4.17', '192.168.4.x')).toBe(true);
    expect(labelMatches('192.168.5.17', '192.168.4.0/24')).toBe(false);
  });

  it('always has exactly one matching label, in the correct lane, for every tier', () => {
    for (const seed of SEEDS) {
      const rng = mulberry32(seed);
      for (let n = 1; n <= 12; n++) {
        const g = makeGate(n, rng);
        expect(g.tier).toBe(tierFor(n));
        expect(new Set(g.labels).size).toBe(3);
        expect(g.labels.filter((l) => labelMatches(g.dest, l))).toEqual([g.labels[g.correct]]);
      }
    }
  });

  it('writes prefix labels with .x and later labels with /24', () => {
    const rng = mulberry32(9);
    expect(makeGate(1, rng).labels.every((l) => /^\d+\.\d+\.\d+\.x$/.test(l))).toBe(true);
    expect(makeGate(4, rng).labels.every((l) => /^\d+\.\d+\.\d+\.0\/24$/.test(l))).toBe(true);
    expect(makeGate(8, rng).labels.every((l) => /^\d+\.\d+\.\d+\.0\/24$/.test(l))).toBe(true);
  });

  it('makes near-tier distractors share the first two octets with the destination', () => {
    for (const seed of SEEDS) {
      const g = makeGate(7, mulberry32(seed));
      const head = g.dest.split('.').slice(0, 2).join('.');
      for (const l of g.labels) expect(l.startsWith(`${head}.`)).toBe(true);
    }
  });

  it('puts the correct lane in every position across seeds', () => {
    const lanes = new Set(SEEDS.map((s) => makeGate(1, mulberry32(s)).correct));
    expect([...lanes].sort()).toEqual([0, 1, 2]);
  });
});
