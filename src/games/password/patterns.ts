import { pick, shuffle, type Rng } from '../../core/random';
import { BOSS_WORDS, PROFILES, type Profile } from './profiles';

/** How one round builds its password from a profile. */
export interface Pattern {
  name: string;
  turns: number;
  /** Shown after the crack: why this kind of password is weak (or, for the boss, strong). */
  lesson: string;
  build(p: Profile, rng: Rng): string;
}

export const SYMBOLS = ['!', '@', '#', '$'];
const L33T: Record<string, string> = { e: '3', o: '0', i: '1', a: '4' };

export const lower = (s: string) => s.toLowerCase();
export const cap = (s: string) => s[0].toUpperCase() + s.slice(1).toLowerCase();
/** Swaps e→3, o→0, i→1, a→4 in lowercase letters only, so a capital first letter stays. */
export const l33t = (s: string) => s.replace(/[eoia]/g, (c) => L33T[c]);
const yy = (p: Profile) => String(p.birthYear % 100).padStart(2, '0');

export const PATTERNS: Pattern[] = [
  {
    name: 'ONE FACT',
    turns: 8,
    lesson: 'Pet names, teams and favourite foods are the first words attackers try.',
    build: (p, rng) => lower(pick([p.pet, p.sport, p.team, p.artist, p.food], rng)),
  },
  {
    name: 'FACT + NUMBER',
    turns: 8,
    lesson: 'Adding your birth year or jersey number barely helps. Attackers add them too.',
    build: (p, rng) => lower(pick([p.pet, p.team, p.artist, p.food], rng)) + pick([p.birthYear, p.jersey], rng),
  },
  {
    name: 'CAPITAL + SYMBOL',
    turns: 7,
    lesson: '"Must have a capital and a symbol" rules make everyone pick the same shapes.',
    build: (p, rng) => cap(pick([p.pet, p.sport, p.team], rng)) + pick(SYMBOLS, rng) + pick([String(p.jersey), yy(p)], rng),
  },
  {
    name: 'L33T SPEAK',
    turns: 7,
    lesson: 'Swapping e for 3 and o for 0 is the first trick a cracking tool tries.',
    build: (p, rng) => l33t(cap(pick([p.pet, p.team, p.artist].filter((w) => /[eoia]/.test(w.slice(1).toLowerCase())), rng))) + p.birthYear,
  },
  {
    name: 'TWO FACTS',
    turns: 6,
    lesson: 'Mixing two of your own details is still just your details.',
    build: (p, rng) => cap(p.name) + cap(pick([p.pet, p.team, p.artist], rng)) + yy(p),
  },
  {
    name: 'BOSS: PASSPHRASE',
    turns: 10,
    lesson: 'Long, random words that have nothing to do with you: the strongest password in the game.',
    build: (_p, rng) => shuffle(BOSS_WORDS, rng).slice(0, 3).join(' '),
  },
];

export interface RoundPlan {
  profile: Profile;
  pattern: Pattern;
  password: string;
}

/** One run: a different profile for each of the 6 rounds, password built by that round's pattern. */
export function planRun(rng: Rng = Math.random): RoundPlan[] {
  const profiles = shuffle(PROFILES, rng);
  return PATTERNS.map((pattern, i) => ({ profile: profiles[i], pattern, password: pattern.build(profiles[i], rng) }));
}
