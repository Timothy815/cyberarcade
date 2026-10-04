import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { cap, l33t, PATTERNS, planRun, SYMBOLS } from '../../src/games/password/patterns';
import { BOSS_WORDS, PROFILES } from '../../src/games/password/profiles';

const TYPEABLE = /^[A-Za-z0-9!@#$ ]+$/;
const WORD_FACTS = ['pet', 'sport', 'team', 'artist', 'food', 'name'] as const;

describe('profiles bank', () => {
  it('has about 12 made-up profiles with unique names', () => {
    expect(PROFILES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(PROFILES.map((p) => p.name)).size).toBe(PROFILES.length);
  });

  it('single-word facts are 3–10 letters', () => {
    for (const p of PROFILES) for (const k of WORD_FACTS) expect(p[k], `${p.name}.${k}`).toMatch(/^[A-Za-z]{3,10}$/);
  });

  it('every profile has a pet, team or artist that l33t can change', () => {
    for (const p of PROFILES) expect([p.pet, p.team, p.artist].some((w) => /[eoia]/.test(w.slice(1).toLowerCase())), p.name).toBe(true);
  });

  it('has about 60 unique lowercase boss words', () => {
    expect(BOSS_WORDS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(BOSS_WORDS).size).toBe(BOSS_WORDS.length);
    for (const w of BOSS_WORDS) expect(w).toMatch(/^[a-z]{3,10}$/);
  });

  it('no boss word equals any profile fact, case-insensitively', () => {
    const facts = PROFILES.flatMap((p) => Object.values(p))
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.toLowerCase());
    for (const w of BOSS_WORDS) expect(facts, w).not.toContain(w.toLowerCase());
  });
});

describe('helpers', () => {
  it('cap capitalises the first letter only', () => {
    expect(cap('pEPPER')).toBe('Pepper');
  });
  it('l33t swaps lowercase e o i a and keeps a capital first letter', () => {
    expect(l33t('Pepper')).toBe('P3pp3r');
    expect(l33t('Oreo')).toBe('Or30');
    expect(l33t('Aisha')).toBe('A1sh4');
  });
});

describe('patterns', () => {
  it('has 6 rounds with the spec turn counts', () => {
    expect(PATTERNS.map((p) => p.turns)).toEqual([8, 8, 7, 7, 6, 10]);
    for (const p of PATTERNS) expect(p.lesson.length).toBeGreaterThan(10);
  });

  it('every profile can fill every pattern with a typeable password', () => {
    for (const profile of PROFILES) {
      for (const [i, pattern] of PATTERNS.entries()) {
        for (let seed = 0; seed < 20; seed++) {
          const pw = pattern.build(profile, mulberry32(seed));
          expect(pw, `${profile.name} round ${i + 1}`).toMatch(TYPEABLE);
          expect(pw.length).toBeGreaterThanOrEqual(3);
          if (i < 5) expect(pw).not.toContain(' ');
        }
      }
    }
  });

  it('builds each round in its documented shape', () => {
    const maya = PROFILES.find((p) => p.name === 'Maya')!;
    for (let seed = 0; seed < 30; seed++) {
      const rng = mulberry32(seed);
      const [r1, r2, r3, r4, r5, r6] = PATTERNS.map((p) => p.build(maya, rng));
      expect(['pepper', 'soccer', 'eagles', 'drake', 'tacos']).toContain(r1);
      expect(r2).toMatch(/^(pepper|eagles|drake|tacos)(2010|7)$/);
      expect(r3).toMatch(new RegExp(`^(Pepper|Soccer|Eagles)[${SYMBOLS.map((s) => '\\' + s).join('')}](7|10)$`));
      expect(['P3pp3r2010', 'E4gl3s2010', 'Dr4k32010']).toContain(r4);
      expect(r5).toMatch(/^Maya(Pepper|Eagles|Drake)10$/);
      const words = r6.split(' ');
      expect(words).toHaveLength(3);
      expect(new Set(words).size).toBe(3);
      for (const w of words) expect(BOSS_WORDS).toContain(w);
    }
  });
});

describe('planRun', () => {
  it('uses a different profile each round and builds each password from it', () => {
    const plan = planRun(mulberry32(7));
    expect(plan).toHaveLength(6);
    expect(new Set(plan.map((r) => r.profile.name)).size).toBe(6);
    plan.forEach((r, i) => expect(r.pattern).toBe(PATTERNS[i]));
  });

  it('is repeatable from a seed', () => {
    expect(planRun(mulberry32(42)).map((r) => r.password)).toEqual(planRun(mulberry32(42)).map((r) => r.password));
  });
});
