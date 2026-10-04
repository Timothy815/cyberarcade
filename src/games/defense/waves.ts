import { shuffle, type Rng } from '../../core/random';

export type Kind = 'malware' | 'stealth' | 'brute' | 'ddos';

/** One attacker to release: `delay` seconds after the previous spawn (the first after the wave starts). */
export interface Spawn {
  kind: Kind;
  delay: number;
}

export const WAVE_COUNT = 10;

/** Attackers per wave, in table order. Waves 1–2 keep this order; later waves are shuffled. */
export const WAVES: readonly Partial<Record<Kind, number>>[] = [
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

/** Seconds between spawns, by the kind being released. A DDoS swarm arrives in a tight burst. */
export const GAP: Record<Kind, number> = { malware: 1.3, stealth: 1.4, brute: 1.6, ddos: 0.25 };
/** Waves 3+ scale each gap by a random factor in [JITTER_MIN, JITTER_MIN + JITTER_SPAN). */
const JITTER_MIN = 0.7;
const JITTER_SPAN = 0.6;

/** The spawn list for wave `n` (1-based). Waves 1–2 are fixed; later waves use `rng`. */
export function buildWave(n: number, rng: Rng): Spawn[] {
  const kinds = Object.entries(WAVES[n - 1]).flatMap(([kind, count]) => Array<Kind>(count).fill(kind as Kind));
  if (n <= 2) return kinds.map((kind, i) => ({ kind, delay: i === 0 ? 0 : GAP[kind] }));
  return shuffle(kinds, rng).map((kind, i) => ({
    kind,
    delay: i === 0 ? 0 : GAP[kind] * (JITTER_MIN + rng() * JITTER_SPAN),
  }));
}
