import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { buildWave, WAVE_COUNT, WAVES, type Kind, type Spawn } from '../../src/games/defense/waves';

function counts(spawns: Spawn[]): Partial<Record<Kind, number>> {
  const out: Partial<Record<Kind, number>> = {};
  for (const s of spawns) out[s.kind] = (out[s.kind] ?? 0) + 1;
  return out;
}

const TABLE: Partial<Record<Kind, number>>[] = [
  { malware: 8 },
  { malware: 12 },
  { malware: 8, stealth: 4 },
  { malware: 10, stealth: 6 },
  { malware: 8, brute: 4 },
  { malware: 10, stealth: 5, brute: 4 },
  { malware: 12, stealth: 6, brute: 6 },
  { malware: 8, ddos: 12 },
  { malware: 14, stealth: 8, brute: 6, ddos: 16 },
  { ddos: 40, stealth: 6, brute: 4 },
];

describe('defense waves', () => {
  it('has 10 waves whose composition matches the spec table', () => {
    expect(WAVE_COUNT).toBe(10);
    expect(WAVES).toHaveLength(10);
    TABLE.forEach((want, i) => expect(counts(buildWave(i + 1, mulberry32(1)))).toEqual(want));
  });

  it('waves 1 and 2 are identical across seeds', () => {
    for (const n of [1, 2]) expect(buildWave(n, mulberry32(5))).toEqual(buildWave(n, mulberry32(999)));
  });

  it('shuffled waves keep their composition, start at once and have positive gaps', () => {
    for (let seed = 0; seed < 250; seed++) {
      const rng = mulberry32(seed);
      for (let n = 3; n <= WAVE_COUNT; n++) {
        const w = buildWave(n, rng);
        expect(counts(w)).toEqual(TABLE[n - 1]);
        expect(w[0].delay).toBe(0);
        for (const s of w.slice(1)) expect(s.delay).toBeGreaterThan(0);
      }
    }
  });

  it('later waves vary with the seed', () => {
    const a = buildWave(6, mulberry32(1)).map((s) => s.kind).join();
    const b = buildWave(6, mulberry32(2)).map((s) => s.kind).join();
    expect(a).not.toBe(b);
  });
});
