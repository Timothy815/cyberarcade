# Password Cracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Password Smash with Password Cracker, a Wheel-of-Fortune-style game. The player cracks six made-up users' passwords one character at a time, using clues from each user's profile. Hack challenges (trivia, Caesar and binary decodes) earn extra turns or reveal a letter.

**Architecture:** The game keeps the cabinet id `password`, its registry slot, its lazy chunk and its CSS import, so the hub, leaderboard and leak loop are unchanged. Each concern is a pure, DOM-free module with unit tests:
- `profiles.ts`: the made-up user bank.
- `patterns.ts`: how each of the 6 rounds builds a password from a profile.
- `logic.ts`: the round state machine and scoring.
- `challenges.ts`: the trivia bank and the generated decodes.

`index.ts` is a thin plain-DOM UI driven by a `data-phase` attribute, and `password.css` shows the right panel for each phase. A `?seed=N` query makes a run repeatable for the e2e tests.

**Tech Stack:** Vite 8, TypeScript 5.9 strict, Vitest 5 (jsdom), Playwright 1.63. This plan **removes** the `zxcvbn` and `@types/zxcvbn` dependencies and adds none.

**Spec:** `docs/superpowers/specs/2026-10-03-password-cracker-design.md`

**Starting point:** branch `password-cracker` (from `main` at d65aaa6, plus the spec commit 84268ae). Every code block below was built and verified in a prototype:
- `npm test`: 24 files, 233 tests
- `npx tsc --noEmit`: clean
- `npm run build`: OK
- `npm run e2e`: 16 tests

## Global Constraints

- Event: Sophomore Day, 2026-10-08. The plan ends with a working, deployable build.
- Target: Windows 11 lab PCs (~3 years old), Chrome/Edge, keyboard + mouse, one player per station. 60 fps target. No mobile/touch, no gamepad.
- No new dependencies. Remove `zxcvbn` and `@types/zxcvbn` with `npm uninstall` so `package-lock.json` stays in sync. All other pins stay unchanged.
- Palette (`--c-*` tokens): cyan `#00f0ff`, pink `#ff2e88`, yellow `#ffe259`, deep `#0e0020`, purple `#2a0750`, ink `#fff`, ink-dim `#ffd1f0`, grey `#b9b9d0`, danger `#ff3b5c`, ok `#3dff9a`. Fonts: `--f-display` (Audiowide), `--f-ui` (Space Grotesk), `--f-mono` (JetBrains Mono).
- Stage: fixed 1920×1080. No image files. CSS animates only `transform` and `opacity`. No `backdrop-filter`.
- Games talk to the outside only through `GameContext`: `ctx.audio.sfx(name)`, `ctx.input.onKey`, `ctx.endRun(score)`.
  - Never add `window`/`document` key listeners.
  - Esc is handled by the shell.
  - Use `!e.repeat` on confirm keys (Enter) so a held key can't answer twice.
- Every `unmount()` releases its rAF, timers and DOM. The 20-cycle leak test in `tests/e2e/games.spec.ts` enforces this, and it already includes `password`.
- Build DOM with `el()` from `src/core/ui/dom.ts` and the HUD with `createHud()` from `src/core/ui/hud.ts`. Set text with `textContent` only, never `innerHTML`.
- **Mute key:** M is the global mute key except while a text field has focus (`isTextEntry` in `src/core/input.ts`). The game therefore keeps one of its two inputs focused at all times, so typing M is a guess and never mutes.
- Every profile is made up. The screen says so: "Every profile in this game is made up."
- Passwords use only typeable characters: letters, digits, `! @ # $`, and spaces (boss round only).
- Shell commands: zsh is the shell. Don't put a bare `===` in commands, and quote globs.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/games/password/profiles.ts` (create) | `Profile` type, 12 made-up profiles, 60 boss passphrase words |
| `src/games/password/patterns.ts` (create) | The 6 round patterns (name, turns, lesson, `build`), `planRun` |
| `src/games/password/challenges.ts` (create) | 40-question trivia bank, Caesar and binary decode generators, `createChallenges` mixer |
| `src/games/password/logic.ts` (replace) | Round state: guess a character, solve, add turns, reveal a random letter, scoring |
| `src/games/password/index.ts` (replace) | Profile card, board, tried chips, guess/solve inputs, challenge/reward/result overlay |
| `src/games/password/password.css` (replace) | Layout and per-phase panel visibility |
| `src/games/registry.ts` (modify) | Title, tagline and controls for the `password` cabinet |
| `package.json`, `package-lock.json` (modify) | Drop `zxcvbn` and `@types/zxcvbn` |
| `tests/unit/password-patterns.test.ts` (create) | Profile/word bank validation, pattern shapes, `planRun` |
| `tests/unit/password-challenges.test.ts` (create) | Trivia bank validation, Caesar/binary generators, the mix |
| `tests/unit/password-logic.test.ts` (replace) | Round logic and scoring |
| `tests/e2e/games.spec.ts` (modify) | The two old Password Smash tests become two Password Cracker tests |

`src/main.ts` already imports `./games/password/password.css` and does not change. The leak loop in `games.spec.ts` already cycles `password` and does not change.

---

### Task 1: Profiles and round patterns

The content and the password recipes. Each profile has single-word facts of 3–10 letters, which the patterns combine. `planRun` deals six different profiles, one per round, and builds each password from it. It consumes the rng first. That ordering is load-bearing: the e2e test rebuilds a run's passwords with `planRun(mulberry32(seed))`.

**Files:**
- Create: `src/games/password/profiles.ts`
- Create: `src/games/password/patterns.ts`
- Test: `tests/unit/password-patterns.test.ts`

**Interfaces:**
- Consumes: `Rng`, `pick` and `shuffle` from `src/core/random.ts`.
- Produces (used by Tasks 4 and the e2e test):
  - `Profile {name, age, pet, petKind, birthYear, sport, jersey, team, artist, food}`, `PROFILES`, `BOSS_WORDS`.
  - `Pattern {name, turns, lesson, build(p, rng)}`, `PATTERNS` (6), `SYMBOLS`, `lower`, `cap`, `l33t`.
  - `RoundPlan {profile, pattern, password}`, `planRun(rng?): RoundPlan[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/password-patterns.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/password-patterns.test.ts`
Expected: FAIL, because `../../src/games/password/patterns` cannot be resolved.

- [ ] **Step 3: Write the profiles**

Create `src/games/password/profiles.ts`:

```ts
// Every profile is made up. Single-word facts (pet, sport, team, artist, food) are 3–10 letters
// so the round patterns can build passwords from them.

export interface Profile {
  name: string;
  age: number;
  pet: string;
  petKind: string;
  birthYear: number;
  sport: string;
  jersey: number;
  team: string;
  artist: string;
  food: string;
}

export const PROFILES: Profile[] = [
  { name: 'Maya', age: 15, pet: 'Pepper', petKind: 'dog', birthYear: 2010, sport: 'Soccer', jersey: 7, team: 'Eagles', artist: 'Drake', food: 'Tacos' },
  { name: 'Jordan', age: 16, pet: 'Biscuit', petKind: 'cat', birthYear: 2009, sport: 'Hockey', jersey: 19, team: 'Rangers', artist: 'Adele', food: 'Pizza' },
  { name: 'Priya', age: 15, pet: 'Mango', petKind: 'parrot', birthYear: 2010, sport: 'Tennis', jersey: 3, team: 'Lakers', artist: 'Shakira', food: 'Noodles' },
  { name: 'Diego', age: 14, pet: 'Rocket', petKind: 'dog', birthYear: 2011, sport: 'Baseball', jersey: 24, team: 'Yankees', artist: 'Usher', food: 'Burritos' },
  { name: 'Emma', age: 16, pet: 'Waffles', petKind: 'hamster', birthYear: 2009, sport: 'Swimming', jersey: 11, team: 'Celtics', artist: 'Rihanna', food: 'Sushi' },
  { name: 'Liam', age: 15, pet: 'Shadow', petKind: 'cat', birthYear: 2010, sport: 'Football', jersey: 88, team: 'Steelers', artist: 'Eminem', food: 'Wings' },
  { name: 'Aisha', age: 14, pet: 'Coco', petKind: 'rabbit', birthYear: 2011, sport: 'Track', jersey: 5, team: 'Warriors', artist: 'Beyonce', food: 'Pasta' },
  { name: 'Noah', age: 16, pet: 'Ziggy', petKind: 'lizard', birthYear: 2009, sport: 'Lacrosse', jersey: 12, team: 'Bruins', artist: 'Weeknd', food: 'Burgers' },
  { name: 'Sofia', age: 15, pet: 'Luna', petKind: 'dog', birthYear: 2010, sport: 'Volleyball', jersey: 9, team: 'Dodgers', artist: 'Olivia', food: 'Ramen' },
  { name: 'Ethan', age: 14, pet: 'Nugget', petKind: 'guinea pig', birthYear: 2011, sport: 'Wrestling', jersey: 32, team: 'Packers', artist: 'Travis', food: 'Nachos' },
  { name: 'Chloe', age: 16, pet: 'Oreo', petKind: 'cat', birthYear: 2009, sport: 'Softball', jersey: 21, team: 'Cubs', artist: 'Swift', food: 'Pancakes' },
  { name: 'Mason', age: 15, pet: 'Bandit', petKind: 'ferret', birthYear: 2010, sport: 'Golf', jersey: 4, team: 'Raiders', artist: 'Bieber', food: 'Steak' },
];

/** Boss-round passphrase words: short, common, nothing to do with any profile. */
export const BOSS_WORDS: string[] = [
  'purple', 'tractor', 'moon', 'pickle', 'river', 'candle', 'thunder', 'velvet', 'giraffe', 'pocket',
  'marble', 'cactus', 'lantern', 'walrus', 'meadow', 'rocket', 'button', 'glacier', 'orbit', 'pepper',
  'sandal', 'violin', 'oyster', 'blanket', 'comet', 'puzzle', 'saddle', 'tunnel', 'wizard', 'yogurt',
  'basket', 'dragon', 'falcon', 'helmet', 'island', 'jungle', 'kettle', 'ladder', 'magnet', 'noodle',
  'olive', 'parrot', 'quilt', 'robot', 'silver', 'tomato', 'umbrella', 'volcano', 'window', 'zebra',
  'anchor', 'bubble', 'copper', 'desert', 'engine', 'forest', 'garden', 'hammer', 'igloo', 'jacket',
];
```

- [ ] **Step 4: Write the patterns**

Create `src/games/password/patterns.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/password-patterns.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add src/games/password/profiles.ts src/games/password/patterns.ts tests/unit/password-patterns.test.ts
git commit -m "feat(password): made-up profiles and the six round patterns"
```

---

### Task 2: Hack challenges

Trivia comes from a hand-written bank and never repeats until the bank is used up. Decodes are generated:
- **Caesar:** a word shifted forward 1–3, with 4 word choices.
- **Binary:** an 8-bit number, 1–255. The distractors differ from the answer by one bit, so every bit has to be read.

About 30% of challenges are decodes.

**Files:**
- Create: `src/games/password/challenges.ts`
- Test: `tests/unit/password-challenges.test.ts`

**Interfaces:**
- Consumes: `Rng`, `pick` and `shuffle` from `src/core/random.ts`.
- Produces (used by Task 4 and the e2e test):
  - Trivia: `Trivia {q, choices: [4 strings], answer: 0|1|2|3}`, `TRIVIA`.
  - Challenges: `ChallengeKind = 'trivia'|'caesar'|'binary'`, `Challenge {kind, prompt, detail, choices: string[], answer: number, seconds}`.
  - Constants: `TRIVIA_SECONDS`, `DECODE_SECONDS`, `DECODE_SHARE`, `CAESAR_WORDS`.
  - Functions:
    - `caesar(word, shift)`
    - `bits(n)`
    - `makeCaesar(rng?)`
    - `makeBinary(rng?)`
    - `createChallenges(rng?): () => Challenge`
  - For a Caesar challenge, `detail` is exactly `SHIFT BACK n`. The e2e test parses the digit out of it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/password-challenges.test.ts`:

```ts
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/password-challenges.test.ts`
Expected: FAIL, because `../../src/games/password/challenges` cannot be resolved.

- [ ] **Step 3: Write the challenges module**

Create `src/games/password/challenges.ts`. Note that the question on line 50 uses double quotes because it contains an apostrophe:

```ts
import { pick, shuffle, type Rng } from '../../core/random';

export interface Trivia {
  q: string;
  choices: [string, string, string, string];
  /** Index of the right choice. */
  answer: 0 | 1 | 2 | 3;
}

export const TRIVIA: Trivia[] = [
  { q: 'What does the S in HTTPS stand for?', choices: ['Secure', 'Simple', 'Server', 'Speed'], answer: 0 },
  { q: 'What is MFA?', choices: ['Multi-factor authentication', 'Main file access', 'Malware found alert', 'Many fast apps'], answer: 0 },
  { q: 'Which is the strongest password?', choices: ['Pepper2010!', 'P@ssw0rd', 'purple tractor moonlight', 'qwerty123'], answer: 2 },
  { q: 'A text says your package is stuck and links to a strange site. This is…', choices: ['A delivery update', 'Smishing (SMS phishing)', 'A firewall alert', 'A software update'], answer: 1 },
  { q: 'Which email sender is most likely a phish?', choices: ['support@apple.com', 'no-reply@amazon.com', 'security@paypa1-help.com', 'news@nytimes.com'], answer: 2 },
  { q: 'Why install software updates?', choices: ['They fix security holes', 'They change the colours', 'They free up battery', 'They delete viruses you have'], answer: 0 },
  { q: 'Malware that locks your files and demands payment is…', choices: ['Adware', 'Spyware', 'Ransomware', 'A worm'], answer: 2 },
  { q: 'Malware disguised as a useful program is a…', choices: ['Trojan', 'Worm', 'Cookie', 'Firewall'], answer: 0 },
  { q: 'Malware that spreads by itself across a network is a…', choices: ['Trojan', 'Worm', 'Keylogger', 'Patch'], answer: 1 },
  { q: 'A keylogger records…', choices: ['Your screen brightness', 'Every key you type', 'Your Wi-Fi speed', 'Your battery level'], answer: 1 },
  { q: 'What does a firewall do?', choices: ['Cools the computer', 'Filters network traffic', 'Speeds up downloads', 'Backs up files'], answer: 1 },
  { q: 'Which port does HTTPS usually use?', choices: ['21', '23', '80', '443'], answer: 3 },
  { q: 'Which port is plain, unencrypted web traffic (HTTP)?', choices: ['80', '443', '22', '3389'], answer: 0 },
  { q: 'SSH, for secure remote logins, uses port…', choices: ['22', '25', '53', '110'], answer: 0 },
  { q: 'Public Wi-Fi at a café is risky because…', choices: ['It is always slow', 'Others on it may see your traffic', 'It drains your battery', 'It needs a password'], answer: 1 },
  { q: 'What is phishing?', choices: ['Tricking people into giving up info', 'Fixing a slow network', 'Testing a firewall', 'Encrypting files'], answer: 0 },
  { q: 'A password manager helps you…', choices: ['Use one password everywhere', 'Use a unique strong password for every site', 'Share passwords with friends', 'Skip passwords'], answer: 1 },
  { q: 'Reusing one password on many sites is risky because…', choices: ['Sites charge more', 'One leak unlocks all your accounts', 'It is hard to type', 'It expires faster'], answer: 1 },
  { q: 'Social engineering attacks target…', choices: ['Hardware', 'People', 'Cables', 'Printers'], answer: 1 },
  { q: 'Which is personal info you should NOT post publicly?', choices: ['Your favourite colour', 'Your home address', 'A meme', 'A sunset photo'], answer: 1 },
  { q: 'What does VPN stand for?', choices: ['Virtual private network', 'Very public network', 'Verified password number', 'Video play node'], answer: 0 },
  { q: 'Encryption turns data into…', choices: ['A bigger file', 'Unreadable code without the key', 'A printed page', 'A virus'], answer: 1 },
  { q: 'A "brute force" attack…', choices: ['Breaks the screen', 'Tries every possible password', 'Sends spam email', 'Unplugs the router'], answer: 1 },
  { q: 'A "dictionary attack" tries…', choices: ['Only numbers', 'Common words and passwords', 'Random symbols only', 'Your fingerprint'], answer: 1 },
  { q: 'Which makes a password hardest to crack?', choices: ['Adding !', 'Swapping o for 0', 'Making it much longer', 'Capitalising the first letter'], answer: 2 },
  { q: 'A pop-up says "Your PC has 5 viruses! Call now!" You should…', choices: ['Call the number', 'Close it, it is a scam', 'Pay to fix it', 'Download its cleaner'], answer: 1 },
  { q: 'What is a "zero-day"?', choices: ['A holiday', 'A flaw with no fix yet', 'A new computer', 'A deleted file'], answer: 1 },
  { q: 'The padlock icon in your browser means…', choices: ['The site is safe and honest', 'The connection is encrypted', 'The site is government run', 'Pop-ups are blocked'], answer: 1 },
  { q: 'Which is a sign of a phishing email?', choices: ['Urgent "act now" pressure', 'Your correct name', 'A known sender', 'No links at all'], answer: 0 },
  { q: 'A DDoS attack tries to…', choices: ['Steal one password', 'Flood a site so nobody can use it', 'Fix broken links', 'Encrypt backups'], answer: 1 },
  { q: 'What is a "patch"?', choices: ['A fix for software', 'A type of virus', 'A network cable', 'A backup drive'], answer: 0 },
  { q: 'An attacker posing as IT on the phone asking for your password is…', choices: ['Normal', 'Vishing (voice phishing)', 'A firewall test', 'Encryption'], answer: 1 },
  { q: 'Why back up your files?', choices: ['To recover from ransomware or loss', 'To make them load faster', 'To hide them', 'To share them'], answer: 0 },
  { q: 'A strong passphrase is…', choices: ['Your pet and birth year', 'Several random words', 'One dictionary word', '123456'], answer: 1 },
  { q: 'Which is an authentication factor?', choices: ['Something you know', 'Your screen size', 'Your browser colour', 'Your typing speed'], answer: 0 },
  { q: 'An app asks for your contacts, camera and location just to be a flashlight. You…', choices: ['Allow all', 'Deny, it does not need them', 'Share it with friends', 'Turn off updates'], answer: 1 },
  { q: 'What does a "white hat" hacker do?', choices: ['Steals data', 'Finds flaws with permission to fix them', 'Spreads worms', 'Sells passwords'], answer: 1 },
  { q: 'Telnet (port 23) is unsafe because…', choices: ['It is too fast', 'It sends everything in plain text', 'It only works on phones', 'It needs a VPN'], answer: 1 },
  { q: 'Before clicking a link in an email, you should…', choices: ['Click it fast', 'Hover to check where it really goes', 'Forward it to everyone', 'Reply with your password'], answer: 1 },
  { q: "Your friend's account messages you a weird link. Most likely…", choices: ['Their account was hacked', 'It is a gift', 'Your Wi-Fi is broken', 'A software update'], answer: 0 },
];

export type ChallengeKind = 'trivia' | 'caesar' | 'binary';

export interface Challenge {
  kind: ChallengeKind;
  /** The big line: the question, the scrambled word, or the bits. */
  prompt: string;
  /** Small helper line, e.g. 'SHIFT BACK 3'. '' for trivia. */
  detail: string;
  choices: string[];
  /** Index of the right choice. */
  answer: number;
  seconds: number;
}

export const TRIVIA_SECONDS = 10;
export const DECODE_SECONDS = 15;
export const DECODE_SHARE = 0.3;
export const CAESAR_WORDS = ['VIRUS', 'PATCH', 'CYBER', 'LOGIN', 'TOKEN', 'ROUTER', 'HACKER', 'SECRET', 'BACKUP', 'SHIELD', 'PIXEL', 'CODE', 'WORM', 'LOCK', 'KEY', 'DATA'];

const A = 'A'.charCodeAt(0);

/** Shifts each A–Z letter forward by `shift` (wrapping Z→A). */
export function caesar(word: string, shift: number): string {
  return word.replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - A + shift + 26) % 26) + A));
}

/** Puts `answer` among `others` in a random slot. */
function withAnswer(answer: string, others: string[], rng: Rng): { choices: string[]; answer: number } {
  const choices = shuffle([answer, ...others], rng);
  return { choices, answer: choices.indexOf(answer) };
}

export function makeCaesar(rng: Rng = Math.random): Challenge {
  const word = pick(CAESAR_WORDS, rng);
  const shift = 1 + Math.floor(rng() * 3);
  const others = shuffle(CAESAR_WORDS.filter((w) => w !== word), rng).slice(0, 3);
  return { kind: 'caesar', prompt: caesar(word, shift), detail: `SHIFT BACK ${shift}`, seconds: DECODE_SECONDS, ...withAnswer(word, others, rng) };
}

export const bits = (n: number) => n.toString(2).padStart(8, '0');

export function makeBinary(rng: Rng = Math.random): Challenge {
  const n = 1 + Math.floor(rng() * 255);
  // Distractors differ by exactly one bit, so every bit has to be read.
  const others = shuffle([0, 1, 2, 3, 4, 5, 6, 7].map((k) => n ^ (1 << k)).filter((m) => m >= 1), rng).slice(0, 3);
  return { kind: 'binary', prompt: bits(n), detail: '128 64 32 16 8 4 2 1', seconds: DECODE_SECONDS, ...withAnswer(String(n), others.map(String), rng) };
}

function fromTrivia(t: Trivia): Challenge {
  return { kind: 'trivia', prompt: t.q, detail: '', choices: [...t.choices], answer: t.answer, seconds: TRIVIA_SECONDS };
}

/** Endless challenge source: about 30% decodes, the rest trivia with no repeats until the bank runs out. */
export function createChallenges(rng: Rng = Math.random): () => Challenge {
  let deck: Trivia[] = [];
  return () => {
    if (rng() < DECODE_SHARE) return rng() < 0.5 ? makeCaesar(rng) : makeBinary(rng);
    if (deck.length === 0) deck = shuffle(TRIVIA, rng);
    return fromTrivia(deck.pop()!);
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/password-challenges.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/games/password/challenges.ts tests/unit/password-challenges.test.ts
git commit -m "feat(password): trivia bank and Caesar/binary hack challenges"
```

---

### Task 3: Round logic

This task replaces the zxcvbn-based Password Smash logic with the round state machine:
- **Characters:** a typed character reveals every match, in either case. A miss costs 1 turn and a repeat is free.
- **Solving:** a solve is exact and case-sensitive. A wrong solve costs 2 turns.
- **Out of turns:** at 0 turns the round is `out`. The UI then offers one LAST CHANCE challenge, and `addTurns` brings the round back into play.

**Expected temporary break:** the old `src/games/password/index.ts` imports functions this task deletes. After this task, `npx tsc --noEmit` and `npm run build` fail in that file until Task 4 replaces it. `npm test` still passes, because no unit test imports `index.ts`. Do not edit `index.ts` in this task.

**Files:**
- Replace: `src/games/password/logic.ts`
- Replace: `tests/unit/password-logic.test.ts`

**Interfaces:**
- Consumes: `Rng` from `src/core/random.ts`. The tests use `mulberry32`.
- Produces (used by Task 4):
  - Constants: `MISS_COST`, `SOLVE_COST`, `REWARD_TURNS`, `CHALLENGE_POINTS`, `ALL_CRACKED_BONUS`.
  - Types: `RoundStatus`, `RoundState {password, revealed, tried, turns, status}`, `GuessResult`.
  - Functions:
    - `createRound(password, turns)`
    - `guessChar(r, ch): GuessResult`
    - `solve(r, guess): boolean`
    - `addTurns(r, n)`
    - `revealRandom(r, rng?): string | null`
    - `board(r): string[]`
    - `crackPoints(index, turnsLeft)`

- [ ] **Step 1: Write the failing test**

Replace the whole of `tests/unit/password-logic.test.ts` with:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/password-logic.test.ts`
Expected: FAIL. The old `logic.ts` has no `createRound`, `guessChar` and so on, so the imports are undefined.

- [ ] **Step 3: Write the logic**

Replace the whole of `src/games/password/logic.ts` with:

```ts
import type { Rng } from '../../core/random';

export const MISS_COST = 1;
export const SOLVE_COST = 2;
export const REWARD_TURNS = 2;
export const CHALLENGE_POINTS = 25;
export const ALL_CRACKED_BONUS = 1000;

/** 'out' = no turns left and not cracked yet (the UI offers a LAST CHANCE challenge). */
export type RoundStatus = 'playing' | 'cracked' | 'out';

export interface RoundState {
  password: string;
  /** One flag per character of the password. Spaces start revealed. */
  revealed: boolean[];
  /** Every character tried so far, lowercased, in order. */
  tried: string[];
  turns: number;
  status: RoundStatus;
}

export type GuessResult = 'hit' | 'miss' | 'repeat' | 'invalid';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function createRound(password: string, turns: number): RoundState {
  return { password, revealed: [...password].map((c) => c === ' '), tried: [], turns, status: 'playing' };
}

function settle(r: RoundState): void {
  if (r.revealed.every(Boolean)) r.status = 'cracked';
  else if (r.turns <= 0) {
    r.turns = 0;
    r.status = 'out';
  } else r.status = 'playing';
}

function revealAll(r: RoundState, ch: string): void {
  [...r.password].forEach((c, i) => {
    if (same(c, ch)) r.revealed[i] = true;
  });
}

/** One typed character. Letters match either case. A miss costs a turn; a hit or a repeat is free. */
export function guessChar(r: RoundState, ch: string): GuessResult {
  if (r.status !== 'playing' || ch.length !== 1 || ch === ' ') return 'invalid';
  const key = ch.toLowerCase();
  if (r.tried.includes(key)) return 'repeat';
  r.tried.push(key);
  const hit = [...r.password].some((c) => same(c, key));
  if (hit) revealAll(r, key);
  else r.turns -= MISS_COST;
  settle(r);
  return hit ? 'hit' : 'miss';
}

/** A whole-password guess: exact and case-sensitive. Wrong costs SOLVE_COST turns. */
export function solve(r: RoundState, guess: string): boolean {
  if (r.status !== 'playing') return false;
  if (guess === r.password) {
    r.revealed = r.revealed.map(() => true);
    r.status = 'cracked';
    return true;
  }
  r.turns -= SOLVE_COST;
  settle(r);
  return false;
}

export function addTurns(r: RoundState, n: number): void {
  if (r.status === 'cracked') return;
  r.turns += n;
  settle(r);
}

/** Reveals every occurrence of one random still-hidden character. Returns it, or null if none is hidden. */
export function revealRandom(r: RoundState, rng: Rng = Math.random): string | null {
  const hidden = [...r.password].filter((_, i) => !r.revealed[i]);
  if (hidden.length === 0) return null;
  const ch = hidden[Math.floor(rng() * hidden.length)];
  revealAll(r, ch);
  if (!r.tried.includes(ch.toLowerCase())) r.tried.push(ch.toLowerCase());
  settle(r);
  return ch;
}

/** The board as the player sees it: the character where revealed, '' where still hidden. */
export function board(r: RoundState): string[] {
  return [...r.password].map((c, i) => (r.revealed[i] ? c : ''));
}

/** Points for cracking round `index` (0-based) with `turnsLeft` turns to spare. */
export function crackPoints(index: number, turnsLeft: number): number {
  return 100 * (index + 1) + 50 * turnsLeft;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/password-logic.test.ts`
Expected: PASS (18 tests).

Run: `npm test`
Expected: all unit test files pass.

- [ ] **Step 5: Commit**

```bash
git add src/games/password/logic.ts tests/unit/password-logic.test.ts
git commit -m "feat(password): round logic for guessing, solving and turns"
```

---

### Task 4: Password Cracker UI, registry, dependency removal and full verification

The screen. A fixed profile card sits on the left. On the right are the round title, the board, the tried chips, a message line and the entry row. One overlay holds three panels: challenge, reward and result. `root.dataset.phase` decides what is shown and which keys do what.

| Phase | Shown | Keys |
|---|---|---|
| `guess` | guess input, HACK button | a typed character guesses it; ENTER opens solve; TAB opens a challenge |
| `solve` | solve input (yellow) | type the password; ENTER submits (empty = back to guess); TAB opens a challenge |
| `wait` | (brief pause after running out of turns) | none |
| `challenge` | challenge panel with timer | 1–4 or click answers; timeout counts as wrong |
| `feedback` | challenge panel with right/wrong marked, 900 ms | none |
| `reward` | reward panel | 1 = +2 TURNS, 2 = REVEAL A LETTER |
| `crack` | result panel: CRACKED!, password, points, lesson | ENTER after 1 s, or auto-advance after 3 s |
| `locked` | result panel: ACCOUNT LOCKED, final score | none; the run ends after 3 s |

Focus rules keep the M mute key from firing while the player types:
- one input is always focused, chosen by `focusActive()` on every `setPhase`;
- root `mousedown` is preventDefaulted unless it lands on an input;
- `pointerdown` refocuses.

Outside `solve`, typed characters are preventDefaulted so the guess field never fills up, and TAB is always preventDefaulted.

`?seed=N` (digits only) seeds the run, and `planRun` is the first consumer of that rng.

**Files:**
- Replace: `src/games/password/index.ts`
- Replace: `src/games/password/password.css`
- Modify: `src/games/registry.ts` (the `password` cabinet entry)
- Modify: `package.json`, `package-lock.json` (via `npm uninstall`)
- Modify: `tests/e2e/games.spec.ts` (imports at the top, and the two `password:` tests)

**Interfaces:**
- Consumes everything that Tasks 1–3 produce. From core:
  - `mulberry32`, `Rng`
  - `GameContext`, `GameModule`
  - `el`, `createHud`
- Produces: `createGame(): GameModule`. This is unchanged: `registry.ts` already loads it with `import('./password/index').then((m) => m.createGame())`.
- DOM hooks used by the e2e tests:
  - Root and phase: `.password[data-phase]`.
  - Inputs and round title: `.pc-guess`, `.pc-solve`, `.pc-round`.
  - Board and chips: `.pc-slot.is-shown`, `.pc-chip.is-miss`.
  - Challenge panel: `.pc-challenge[data-kind]` (`.is-last` on LAST CHANCE), with children `.pc-q`, `.pc-detail` and `.pc-choice-text`.
  - Reward and result: `.pc-reward`, `.pc-stamp`.
  - HUD: `[data-hud="turns"]`, `[data-hud="score"]`.

- [ ] **Step 1: Write the failing e2e tests**

In `tests/e2e/games.spec.ts`, add these imports right after the `SNIPPETS` import line:

```ts
import { mulberry32 } from '../../src/core/random';
import { caesar, TRIVIA } from '../../src/games/password/challenges';
import { planRun } from '../../src/games/password/patterns';
```

Then delete the two tests `test('password: five rounds, input cleared, score adds up', …)` and `test('password: Enter on an empty field does not submit the round', …)` completely. Put the following in their place, before the `invaders:` test:

```ts
/** Picks `n` distinct characters that are not in `pw` (either case). Skips m, the mute key outside text fields. */
function missesFor(pw: string, n: number): string[] {
  const used = pw.toLowerCase();
  return [...'qzxjvkwyfgbhupdtcnlrsoaie0123456789'].filter((c) => !used.includes(c)).slice(0, n);
}

/** Reads the open challenge from the DOM and returns the 0-based index of the right choice. */
async function challengeAnswer(page: Page): Promise<number> {
  const panel = page.locator('.pc-challenge');
  const kind = await panel.getAttribute('data-kind');
  const q = (await panel.locator('.pc-q').textContent()) ?? '';
  const choices = await panel.locator('.pc-choice-text').allTextContents();
  let right: string;
  if (kind === 'trivia') {
    const t = TRIVIA.find((x) => x.q === q)!;
    right = t.choices[t.answer];
  } else if (kind === 'caesar') {
    const shift = Number(((await panel.locator('.pc-detail').textContent()) ?? '').replace(/\D/g, ''));
    right = caesar(q, -shift);
  } else right = String(parseInt(q, 2));
  return choices.indexOf(right);
}

test('password cracker: crack round 1, earn turns, then get locked out', async ({ page }) => {
  const errors = trackErrors(page);
  const [r1, r2] = planRun(mulberry32(7));
  await boot(page, '?seed=7');
  await launch(page, 'password');
  const turns = page.locator('[data-hud="turns"]');
  await expect(page.locator('.pc-round')).toContainText('ROUND 1');
  await expect(page.locator('.pc-guess')).toBeFocused();
  await expect(turns).toHaveText('8');

  const [miss] = missesFor(r1.password, 1);
  await page.keyboard.press(miss);
  await expect(turns).toHaveText('7');
  await expect(page.locator('.pc-chip.is-miss')).toHaveText(miss.toUpperCase());

  const hit = [...r1.password].find((c) => /[a-z]/i.test(c) && c.toLowerCase() !== 'm')!;
  await page.keyboard.press(hit);
  await expect(page.locator('.pc-slot.is-shown').first()).toBeVisible();
  await expect(turns).toHaveText('7');

  await page.keyboard.press('Enter');
  await expect(page.locator('.pc-solve')).toBeFocused();
  await page.keyboard.type(r1.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.pc-stamp')).toHaveText('CRACKED!');
  await expect(page.locator('[data-hud="score"]')).toHaveText('450'); // 100 × round 1 + 50 × 7 turns
  await page.waitForTimeout(1050); // the result ignores Enter for the first second
  await page.keyboard.press('Enter');

  await expect(page.locator('.pc-round')).toContainText('ROUND 2');
  await expect(turns).toHaveText('8');
  await page.keyboard.press('Tab');
  await expect(page.locator('.pc-challenge')).toBeVisible();
  await page.keyboard.press(String((await challengeAnswer(page)) + 1));
  await expect(page.locator('.pc-reward')).toBeVisible();
  await page.keyboard.press('1');
  await expect(turns).toHaveText('10');
  await expect(page.locator('[data-hud="score"]')).toHaveText('475');

  for (const c of missesFor(r2.password, 10)) {
    await expect(page.locator('.password')).toHaveAttribute('data-phase', 'guess');
    await page.keyboard.press(c);
  }
  await expect(page.locator('.pc-challenge.is-last')).toBeVisible();
  const right = await challengeAnswer(page);
  await page.keyboard.press(String(((right + 1) % 4) + 1));
  await expect(page.locator('.pc-stamp')).toHaveText('ACCOUNT LOCKED');
  await expect(page.locator('.game-over .final-score')).toHaveText('475', { timeout: 6000 });
  expect(errors).toEqual([]);
});

test('password cracker: Enter on an empty solve field goes back to guessing', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'password');
  const root = page.locator('.password');
  await expect(page.locator('.pc-guess')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-phase', 'solve');
  await expect(page.locator('.pc-solve')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(root).toHaveAttribute('data-phase', 'guess');
  await expect(page.locator('[data-hud="turns"]')).toHaveText('8');
  await expect(page.locator('.pc-guess')).toBeFocused();
  await expect(page.locator('.pc-stamp')).not.toBeVisible();
  expect(errors).toEqual([]);
});
```

Leave the leak test (`20 launch/exit cycles across the five games leave nothing behind`) as it is.

- [ ] **Step 2: Remove zxcvbn**

Run: `npm uninstall zxcvbn @types/zxcvbn`
Expected: `package.json` loses `"zxcvbn": "4.4.2"` from `dependencies` and `"@types/zxcvbn": "4.4.5"` from `devDependencies`, and `package-lock.json` is updated. No other package changes.

- [ ] **Step 3: Write the UI**

Replace the whole of `src/games/password/index.ts` with:

```ts
import { mulberry32, type Rng } from '../../core/random';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { createChallenges, type Challenge } from './challenges';
import {
  addTurns,
  ALL_CRACKED_BONUS,
  board,
  CHALLENGE_POINTS,
  crackPoints,
  createRound,
  guessChar,
  revealRandom,
  REWARD_TURNS,
  solve,
  type RoundState,
} from './logic';
import { planRun } from './patterns';
import type { Profile } from './profiles';

const FEEDBACK_MS = 900; // right/wrong shown on the choices before moving on
const LAST_CHANCE_DELAY_MS = 600; // pause after the last turn goes before LAST CHANCE opens
const CRACK_MIN_MS = 1000; // Enter can't skip the lesson card before this
const CRACK_MS = 3000; // lesson card auto-advances after this
const LOCKED_MS = 3000; // ACCOUNT LOCKED stays up this long before the run ends
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type Phase = 'guess' | 'solve' | 'wait' | 'challenge' | 'feedback' | 'reward' | 'crack' | 'locked';

/** `?seed=N` makes a run repeatable (used by the e2e tests). */
function runRng(): Rng {
  const seed = new URLSearchParams(location.search).get('seed');
  return seed !== null && /^\d+$/.test(seed) ? mulberry32(Number(seed)) : Math.random;
}

function profileRows(p: Profile): [string, string][] {
  return [
    ['NAME', p.name],
    ['AGE', String(p.age)],
    ['PET', `${p.pet} (${p.petKind})`],
    ['BORN', String(p.birthYear)],
    ['SPORT', `${p.sport} · #${p.jersey}`],
    ['TEAM', p.team],
    ['FAVE ARTIST', p.artist],
    ['FAVE FOOD', p.food],
  ];
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const rng = runRng();
      const plan = planRun(rng); // first use of rng, so tests can rebuild the plan from the seed
      const nextChallenge = createChallenges(rng);

      const hud = createHud([['score', 'SCORE'], ['round', 'ROUND'], ['turns', 'TURNS']]);
      const profile = el('div.pc-profile');
      const title = el('div.pc-round');
      const slots = el('div.pc-board');
      const tried = el('div.pc-tried');
      const msg = el('div.pc-msg');
      const guessField = el<'input'>('input.pc-guess', {
        type: 'text',
        maxlength: 1,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Guess a character',
        placeholder: 'TYPE A CHARACTER',
      });
      const solveField = el<'input'>('input.pc-solve', {
        type: 'text',
        maxlength: 40,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Solve the password',
        placeholder: 'TYPE THE WHOLE PASSWORD',
      });
      const hackBtn = el<'button'>('button.pc-hack', { type: 'button' }, 'HACK (TAB)');
      const keys = el('div.pc-keys', {}, 'TYPE guess a character · ENTER solve · TAB hack challenge');

      // Challenge panel
      const chTitle = el('div.pc-ch-title');
      const chPlaces = el('div.pc-places');
      const chPrompt = el('div.pc-q');
      const chDetail = el('div.pc-detail');
      const chAlpha = el('div.pc-alpha');
      const chChoices = el('div.pc-choices');
      const chTimer = el('div.pc-timer-fill');
      const challengePanel = el(
        'div.pc-challenge',
        {},
        chTitle,
        chPlaces,
        chPrompt,
        chDetail,
        chAlpha,
        chChoices,
        el('div.pc-timer', {}, chTimer),
      );

      // Reward picker
      const rewardTurns = el<'button'>('button.pc-pick', { type: 'button' }, el('span.pc-key', {}, '1'), `+${REWARD_TURNS} TURNS`);
      const rewardReveal = el<'button'>('button.pc-pick', { type: 'button' }, el('span.pc-key', {}, '2'), 'REVEAL A LETTER');
      const rewardPanel = el('div.pc-reward', {}, el('div.pc-ch-title', {}, 'ACCESS GRANTED: PICK A REWARD'), el('div.pc-picks', {}, rewardTurns, rewardReveal));

      // Crack / lockout card
      const stamp = el('div.pc-stamp');
      const reveal = el('div.pc-reveal');
      const points = el('div.pc-points');
      const lesson = el('div.pc-lesson');
      const resultPanel = el('div.pc-result', {}, stamp, reveal, points, lesson);

      root = el(
        'div.password',
        {},
        hud.el,
        el(
          'div.pc-main',
          {},
          profile,
          el('div.pc-play', {}, title, slots, tried, msg, el('div.pc-entry', {}, guessField, solveField, hackBtn), keys),
        ),
        el('div.pc-overlay', {}, challengePanel, rewardPanel, resultPanel),
        el('div.pc-note', {}, 'Every profile in this game is made up.'),
      );
      container.append(root);

      let index = 0;
      let score = 0;
      let round: RoundState = createRound(plan[0].password, plan[0].pattern.turns);
      let phase: Phase = 'guess';
      let challenge: Challenge | null = null;
      let lastChance = false;
      let deadline = 0;
      let crackAt = 0;

      const setPhase = (p: Phase) => {
        phase = p;
        root!.dataset.phase = p;
        focusActive();
      };
      const focusActive = () => (phase === 'solve' ? solveField : guessField).focus();

      const say = (text: string, tone: 'good' | 'bad' | '' = '') => {
        msg.textContent = text;
        msg.className = tone ? `pc-msg is-${tone}` : 'pc-msg';
      };

      const flash = (node: HTMLElement) => {
        node.classList.remove('is-flash');
        void node.offsetWidth; // restart the CSS animation
        node.classList.add('is-flash');
      };

      const render = (popped = '') => {
        hud.set('score', score.toLocaleString('en-US'));
        hud.set('turns', String(round.turns));
        root!.classList.toggle('is-low', round.turns <= 2);
        slots.replaceChildren(
          ...board(round).map((c, i) => {
            const space = round.password[i] === ' ';
            const cls = space ? '.is-space' : c ? `.is-shown${popped && c.toLowerCase() === popped ? '.is-pop' : ''}` : '';
            return el(`div.pc-slot${cls}`, {}, space ? '' : c);
          }),
        );
        tried.replaceChildren(
          ...round.tried.map((c) => {
            const hit = [...round.password].some((p) => p.toLowerCase() === c);
            return el(`span.pc-chip.${hit ? 'is-hit' : 'is-miss'}`, {}, c.toUpperCase());
          }),
        );
      };

      const startRound = () => {
        const r = plan[index];
        round = createRound(r.password, r.pattern.turns);
        hud.set('round', `${index + 1}/${plan.length}`);
        title.textContent = `ROUND ${index + 1}: ${r.pattern.name}`;
        title.classList.toggle('is-boss', index === plan.length - 1);
        profile.replaceChildren(
          el('div.pc-profile-title', {}, 'TARGET PROFILE'),
          ...profileRows(r.profile).map(([k, v]) => el('div.pc-row', {}, el('span.pc-row-key', {}, k), el('span.pc-row-val', {}, v))),
        );
        say(`${r.password.length} CHARACTERS. USE THE PROFILE!`);
        render();
        setPhase('guess');
      };

      // ---- rounds ----

      const afterTurnLoss = () => {
        if (round.status !== 'out') return;
        setPhase('wait');
        say('OUT OF TURNS!', 'bad');
        later(() => openChallenge(true), LAST_CHANCE_DELAY_MS);
      };

      const cracked = () => {
        const gained = crackPoints(index, round.turns);
        const last = index === plan.length - 1;
        score += gained + (last ? ALL_CRACKED_BONUS : 0);
        render();
        stamp.textContent = 'CRACKED!';
        stamp.className = 'pc-stamp is-good';
        reveal.textContent = round.password;
        points.textContent = `+${gained.toLocaleString('en-US')}${last ? ` · ALL CRACKED +${ALL_CRACKED_BONUS.toLocaleString('en-US')}` : ''}`;
        lesson.textContent = plan[index].pattern.lesson;
        ctx.audio.sfx('score');
        crackAt = performance.now();
        setPhase('crack');
        later(nextRound, CRACK_MS);
      };

      const nextRound = () => {
        if (phase !== 'crack') return;
        clearTimers();
        index++;
        if (index >= plan.length) ctx.endRun(score);
        else startRound();
      };

      const locked = () => {
        round.revealed = round.revealed.map(() => true);
        render();
        stamp.textContent = 'ACCOUNT LOCKED';
        stamp.className = 'pc-stamp is-bad';
        reveal.textContent = round.password;
        points.textContent = `FINAL SCORE ${score.toLocaleString('en-US')}`;
        lesson.textContent = 'Too many wrong guesses: real accounts lock attackers out too.';
        ctx.audio.sfx('explode');
        setPhase('locked');
        later(() => ctx.endRun(score), LOCKED_MS);
      };

      const guess = (ch: string) => {
        const result = guessChar(round, ch);
        if (result === 'invalid') return;
        if (result === 'repeat') {
          say(`ALREADY TRIED ${ch.toUpperCase()}`);
          flash(tried);
          ctx.audio.sfx('back');
          return;
        }
        render(result === 'hit' ? ch.toLowerCase() : '');
        if (result === 'hit') {
          const n = [...round.password].filter((c) => c.toLowerCase() === ch.toLowerCase()).length;
          say(`HIT! ${n} × ${ch.toUpperCase()}`, 'good');
          ctx.audio.sfx('coin');
        } else {
          say(`NO ${ch.toUpperCase()}: −1 TURN`, 'bad');
          ctx.audio.sfx('error');
        }
        if (round.status === 'cracked') cracked();
        else afterTurnLoss();
      };

      const openSolve = () => {
        solveField.value = '';
        say('TYPE THE WHOLE PASSWORD. CAPITALS COUNT! (ENTER ON EMPTY TO CANCEL)');
        ctx.audio.sfx('select');
        setPhase('solve');
      };

      const submitSolve = () => {
        const attempt = solveField.value;
        solveField.value = '';
        if (attempt === '') {
          say('');
          setPhase('guess');
          return;
        }
        if (solve(round, attempt)) return cracked();
        render();
        say('WRONG PASSWORD: −2 TURNS', 'bad');
        ctx.audio.sfx('hit');
        setPhase('guess');
        afterTurnLoss();
      };

      // ---- challenges ----

      const openChallenge = (isLastChance: boolean) => {
        lastChance = isLastChance;
        challenge = nextChallenge();
        const c = challenge;
        challengePanel.dataset.kind = c.kind;
        challengePanel.classList.toggle('is-last', isLastChance);
        chTitle.textContent = isLastChance ? `LAST CHANCE! RIGHT = +${REWARD_TURNS} TURNS, WRONG = LOCKED` : 'HACK CHALLENGE';
        if (c.kind === 'binary') {
          chPlaces.replaceChildren(...c.detail.split(' ').map((v) => el('span', {}, v)));
          chPrompt.replaceChildren(...[...c.prompt].map((b) => el('span', {}, b)));
          chDetail.textContent = 'WHAT NUMBER IS THIS? ADD THE PLACES WITH A 1';
        } else {
          chPlaces.replaceChildren();
          chPrompt.textContent = c.prompt;
          chDetail.textContent = c.detail;
        }
        chAlpha.textContent = c.kind === 'caesar' ? ALPHABET.split('').join(' ') : '';
        chChoices.replaceChildren(
          ...c.choices.map((text, i) => {
            const b = el<'button'>('button.pc-choice', { type: 'button' }, el('span.pc-key', {}, String(i + 1)), el('span.pc-choice-text', {}, text));
            b.addEventListener('click', () => answer(i));
            return b;
          }),
        );
        deadline = performance.now() + c.seconds * 1000;
        chTimer.style.transform = 'scaleX(1)';
        ctx.audio.sfx('powerup');
        setPhase('challenge');
      };

      const answer = (i: number) => {
        if (phase !== 'challenge' || !challenge) return;
        const right = i === challenge.answer;
        [...chChoices.children].forEach((b, j) => {
          if (j === challenge!.answer) b.classList.add('is-right');
          else if (j === i) b.classList.add('is-wrong');
        });
        if (right) {
          score += CHALLENGE_POINTS;
          hud.set('score', score.toLocaleString('en-US'));
        }
        ctx.audio.sfx(right ? 'coin' : 'error');
        setPhase('feedback');
        later(() => {
          if (lastChance) {
            if (!right) return locked();
            addTurns(round, REWARD_TURNS);
            render();
            say(`SAVED! +${REWARD_TURNS} TURNS`, 'good');
            setPhase('guess');
          } else if (right) {
            setPhase('reward');
          } else {
            say(i < 0 ? 'TOO SLOW: NO REWARD' : 'WRONG: NO REWARD', 'bad');
            setPhase('guess');
          }
        }, FEEDBACK_MS);
      };

      const reward = (which: 'turns' | 'reveal') => {
        if (phase !== 'reward') return;
        ctx.audio.sfx('powerup');
        if (which === 'turns') {
          addTurns(round, REWARD_TURNS);
          render();
          say(`+${REWARD_TURNS} TURNS`, 'good');
          return setPhase('guess');
        }
        const ch = revealRandom(round, rng);
        render(ch ? ch.toLowerCase() : '');
        say(ch ? `REVEALED ${ch.toUpperCase()}` : '', 'good');
        if (round.status === 'cracked') cracked();
        else setPhase('guess');
      };
      rewardTurns.addEventListener('click', () => reward('turns'));
      rewardReveal.addEventListener('click', () => reward('reveal'));
      hackBtn.addEventListener('click', () => phase === 'guess' && openChallenge(false));

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (phase !== 'challenge' || !challenge) return;
        const left = Math.max(0, deadline - performance.now());
        chTimer.style.transform = `scaleX(${left / (challenge.seconds * 1000)})`;
        if (left === 0) answer(-1);
      };

      // ---- input ----

      const isEnter = (e: KeyboardEvent) => e.code === 'Enter' || e.code === 'NumpadEnter';
      const choiceKey = (e: KeyboardEvent) => (/^[1-4]$/.test(e.key) ? Number(e.key) - 1 : -1);

      ctx.input.onKey((e) => {
        if (e.key === 'Tab') e.preventDefault(); // TAB is the hack key, never a focus move
        const typed = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
        // The guess field is only a focus anchor (it keeps the global M mute key quiet); it never holds text.
        if (typed && phase !== 'solve') e.preventDefault();

        if (phase === 'guess') {
          if (isEnter(e)) {
            if (!e.repeat) openSolve();
          } else if (e.key === 'Tab') openChallenge(false);
          else if (typed && e.key !== ' ') guess(e.key);
        } else if (phase === 'solve') {
          if (isEnter(e)) {
            if (!e.repeat) submitSolve();
          } else if (e.key === 'Tab') {
            solveField.value = '';
            openChallenge(false);
          } else if (typed) ctx.audio.sfx('type');
        } else if (phase === 'challenge') {
          const i = choiceKey(e);
          if (i >= 0 && i < (challenge?.choices.length ?? 0)) answer(i);
        } else if (phase === 'reward') {
          if (e.key === '1') reward('turns');
          else if (e.key === '2') reward('reveal');
        } else if (phase === 'crack') {
          if (isEnter(e) && !e.repeat && performance.now() - crackAt >= CRACK_MIN_MS) nextRound();
        }
      });
      // Clicks never move focus off the active field (buttons still get their click).
      root.addEventListener('mousedown', (e) => {
        if (e.target !== guessField && e.target !== solveField) e.preventDefault();
      });
      root.addEventListener('pointerdown', () => later(focusActive, 0));

      startRound();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimers();
      root?.remove();
      root = null;
    },
  };
}
```

- [ ] **Step 4: Write the styles**

Replace the whole of `src/games/password/password.css` with:

```css
.password {
  position: absolute;
  inset: 0;
}
.pc-main {
  position: absolute;
  top: 150px;
  left: 80px;
  right: 80px;
  display: flex;
  gap: 48px;
}

/* ---- profile card ---- */
.pc-profile {
  flex: 0 0 540px;
  padding: 28px 32px;
  border-radius: 18px;
  background: rgba(18, 0, 38, 0.92);
  border: 3px solid var(--c-pink);
  box-shadow: 0 0 30px rgba(255, 46, 136, 0.45), inset 0 0 24px rgba(255, 46, 136, 0.12);
}
.pc-profile-title {
  margin-bottom: 18px;
  font-family: var(--f-display);
  font-size: 38px;
  letter-spacing: 0.12em;
  color: var(--c-pink);
  text-shadow: 0 0 14px var(--c-pink);
}
.pc-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 30px;
}
.pc-row:last-child { border-bottom: 0; }
.pc-row-key {
  font-family: var(--f-mono);
  font-size: 22px;
  letter-spacing: 0.15em;
  color: var(--c-ink-dim);
  align-self: center;
}
.pc-row-val {
  font-weight: 700;
  color: #fff;
  text-align: right;
}

/* ---- play area ---- */
.pc-play {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
}
.pc-round {
  font-family: var(--f-display);
  font-size: 54px;
  color: var(--c-cyan);
  text-shadow: 0 0 18px var(--c-cyan);
}
.pc-round.is-boss {
  color: var(--c-yellow);
  text-shadow: 0 0 18px var(--c-yellow);
}
.pc-board {
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 6px;
}
.pc-slot {
  flex: 0 1 64px;
  min-width: 0;
  height: 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-bottom: 5px solid var(--c-cyan);
  font-family: var(--f-mono);
  font-size: 52px;
  font-weight: 700;
  color: #fff;
}
.pc-slot.is-space {
  flex-basis: 28px;
  background: none;
  border-bottom-color: transparent;
}
.pc-slot.is-shown {
  background: rgba(0, 240, 255, 0.16);
  text-shadow: 0 0 12px var(--c-cyan);
}
.pc-slot.is-pop { animation: pc-pop 0.35s ease-out; }
@keyframes pc-pop {
  from { transform: scale(1.5); opacity: 0.2; }
}
.pc-tried {
  min-height: 52px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
}
.pc-tried.is-flash { animation: pc-flash 0.5s ease-out; }
@keyframes pc-flash {
  50% { opacity: 0.2; }
}
.pc-chip {
  min-width: 46px;
  padding: 6px 12px;
  border-radius: 8px;
  font-family: var(--f-mono);
  font-size: 28px;
  font-weight: 700;
  text-align: center;
}
.pc-chip.is-hit { background: rgba(61, 255, 154, 0.15); color: var(--c-ok); border: 2px solid var(--c-ok); }
.pc-chip.is-miss { background: rgba(255, 59, 92, 0.15); color: #ff9aac; border: 2px solid var(--c-danger); }
.pc-msg {
  min-height: 44px;
  font-family: var(--f-display);
  font-size: 34px;
  color: var(--c-ink);
}
.pc-msg.is-good { color: var(--c-ok); }
.pc-msg.is-bad { color: var(--c-danger); }
.pc-entry {
  display: flex;
  gap: 20px;
  align-items: center;
}
.pc-guess,
.pc-solve {
  padding: 18px 28px;
  font-family: var(--f-mono);
  font-size: 38px;
  color: #fff;
  background: rgba(18, 0, 38, 0.92);
  border: 3px solid var(--c-cyan);
  border-radius: 14px;
  outline: none;
  text-align: center;
  caret-color: transparent;
}
.pc-guess { width: 520px; }
.pc-guess::placeholder { color: var(--c-ink-dim); opacity: 0.8; }
.pc-solve {
  display: none;
  width: 820px;
  border-color: var(--c-yellow);
  box-shadow: 0 0 26px rgba(255, 230, 0, 0.35);
  caret-color: var(--c-yellow);
}
.password[data-phase='solve'] .pc-solve { display: block; }
.password[data-phase='solve'] .pc-guess,
.password[data-phase='solve'] .pc-hack { display: none; }
.pc-hack {
  padding: 18px 30px;
  font-family: var(--f-display);
  font-size: 32px;
  color: var(--c-deep);
  background: var(--c-pink);
  border: 0;
  border-radius: 14px;
  box-shadow: 0 0 24px rgba(255, 46, 136, 0.6);
  cursor: pointer;
}
.pc-keys {
  font-family: var(--f-mono);
  font-size: 24px;
  letter-spacing: 0.08em;
  color: var(--c-ink-dim);
}
.password.is-low [data-hud='turns'] { color: var(--c-danger); }

/* ---- overlay panels ---- */
.pc-overlay {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(10, 0, 24, 0.86);
}
.password[data-phase='challenge'] .pc-overlay,
.password[data-phase='feedback'] .pc-overlay,
.password[data-phase='reward'] .pc-overlay,
.password[data-phase='crack'] .pc-overlay,
.password[data-phase='locked'] .pc-overlay {
  display: flex;
}
.pc-challenge,
.pc-reward,
.pc-result {
  display: none;
  width: 1300px;
  padding: 44px 56px;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  border-radius: 22px;
  background: rgba(18, 0, 38, 0.97);
  border: 3px solid var(--c-cyan);
  box-shadow: 0 0 40px rgba(0, 240, 255, 0.4);
  animation: pc-panel-in 0.25s ease-out;
}
@keyframes pc-panel-in {
  from { transform: scale(0.92); opacity: 0; }
}
.password[data-phase='challenge'] .pc-challenge,
.password[data-phase='feedback'] .pc-challenge,
.password[data-phase='reward'] .pc-reward,
.password[data-phase='crack'] .pc-result,
.password[data-phase='locked'] .pc-result {
  display: flex;
}
.pc-challenge.is-last { border-color: var(--c-danger); box-shadow: 0 0 40px rgba(255, 59, 92, 0.5); }
.pc-ch-title {
  font-family: var(--f-display);
  font-size: 40px;
  color: var(--c-cyan);
  text-align: center;
}
.pc-challenge.is-last .pc-ch-title { color: var(--c-danger); }
.pc-q {
  font-size: 44px;
  font-weight: 700;
  text-align: center;
  color: #fff;
}
.pc-challenge[data-kind='caesar'] .pc-q {
  font-family: var(--f-mono);
  font-size: 84px;
  letter-spacing: 0.25em;
  color: var(--c-yellow);
}
.pc-places,
.pc-challenge[data-kind='binary'] .pc-q {
  display: grid;
  grid-template-columns: repeat(8, 96px);
  gap: 10px;
  font-family: var(--f-mono);
  text-align: center;
}
.pc-places { font-size: 28px; color: var(--c-ink-dim); }
.pc-places:empty { display: none; }
.pc-challenge[data-kind='binary'] .pc-q { font-size: 76px; color: var(--c-yellow); }
.pc-detail {
  font-family: var(--f-mono);
  font-size: 30px;
  letter-spacing: 0.1em;
  color: var(--c-pink);
}
.pc-detail:empty,
.pc-alpha:empty { display: none; }
.pc-alpha {
  font-family: var(--f-mono);
  font-size: 30px;
  color: var(--c-ink-dim);
}
.pc-choices {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.pc-choice,
.pc-pick {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 18px 22px;
  border-radius: 14px;
  border: 3px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-family: var(--f-ui);
  font-size: 30px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.pc-choice.is-right { border-color: var(--c-ok); background: rgba(61, 255, 154, 0.2); }
.pc-choice.is-wrong { border-color: var(--c-danger); background: rgba(255, 59, 92, 0.2); }
.pc-key {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--c-cyan);
  color: var(--c-deep);
  font-family: var(--f-mono);
  font-weight: 700;
}
.pc-timer {
  width: 100%;
  height: 14px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.pc-timer-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-danger), var(--c-yellow), var(--c-ok));
  transform-origin: left;
}
.pc-picks {
  display: flex;
  gap: 28px;
}
.pc-pick { font-size: 38px; padding: 26px 36px; }
.pc-stamp {
  font-family: var(--f-display);
  font-size: 88px;
}
.pc-stamp.is-good { color: var(--c-ok); text-shadow: 0 0 24px var(--c-ok); }
.pc-stamp.is-bad { color: var(--c-danger); text-shadow: 0 0 24px var(--c-danger); }
.pc-result:has(.is-bad) { border-color: var(--c-danger); }
.pc-reveal {
  font-family: var(--f-mono);
  font-size: 60px;
  font-weight: 700;
  color: #fff;
}
.pc-points {
  font-family: var(--f-display);
  font-size: 40px;
  color: var(--c-cyan);
}
.pc-lesson {
  max-width: 1100px;
  font-size: 34px;
  text-align: center;
  color: var(--c-yellow);
}
.pc-note {
  position: absolute;
  bottom: 36px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 24px;
  color: var(--c-ink-dim);
  opacity: 0.85;
}
```

- [ ] **Step 5: Update the registry entry**

In `src/games/registry.ts`, change only the `password` cabinet's `title`, `tagline` and `controls`. Leave `kind`, `id`, `category` and `load` as they are:

```diff
-    title: 'Password Smash',
-    tagline: 'Build a password and watch the cracking rig try to break it. How long will it last?',
+    title: 'Password Cracker',
+    tagline: 'Crack fake users\' passwords from clues in their profiles, one character at a time.',
     category: 'learn',
-    controls: [['TYPE', 'Password'], ['ENTER', 'Crack it']],
+    controls: [['TYPE', 'Guess a character'], ['ENTER', 'Solve'], ['TAB', 'Hack challenge']],
```

- [ ] **Step 6: Run the full verification**

Run each command and check its result:

| Command | Expected |
|---|---|
| `npm test` | 24 files, 233 tests pass |
| `npx tsc --noEmit` | no output; the Task 3 break is gone |
| `grep -rn zxcvbn src tests package.json` | no output |
| `npm run build` | succeeds; `dist/assets` has a `password-*.js` chunk |
| `npm run e2e` | 16 tests pass, including both `password cracker:` tests and the 20-cycle leak loop |

The seeded test is deterministic: it rebuilds seed 7's passwords with `planRun(mulberry32(7))`. If it fails, read the failure before touching timings.

- [ ] **Step 7: Commit**

```bash
git add src/games/password/index.ts src/games/password/password.css src/games/registry.ts package.json package-lock.json tests/e2e/games.spec.ts
git commit -m "feat(password): Password Cracker replaces Password Smash"
```
