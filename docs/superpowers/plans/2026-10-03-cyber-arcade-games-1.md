# Cyber Arcade Games 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first three playable games: Phish or Legit, Password Smash and Malware Invaders. They plug into the deployed hub through the existing `GameModule` contract and are enforced leak-free by a 20-cycle Playwright test.

**Architecture:** Each game lives in `src/games/<id>/`. Its rules sit in a pure, DOM-free `logic.ts` that has unit tests, and a thin `index.ts` renders it and implements `mount`/`unmount`. Phish and Password are plain DOM/CSS. Invaders runs on Phaser 3. The Phaser scene only draws the pure `World` simulation in `logic.ts`, all input comes from the shell's `ctx.input` (Phaser's own input, audio and focus handling are switched off), and `unmount()` frees the WebGL context by hand. Two shared helpers, `random.ts` (a seedable RNG) and `ui/hud.ts` (the score bar), are added to `src/core/`. Each game is its own lazy chunk through `registry.ts` `load()`.

**Tech Stack:** Vite 8, TypeScript 5.9 strict, Vitest 5 (jsdom), Playwright 1.63, ZzFX 1.4.0. New in this plan: **Phaser 3.90.0** and **zxcvbn 4.4.2** (+ `@types/zxcvbn` 4.4.5).

**Spec:** `docs/superpowers/specs/2026-10-03-cyber-arcade-design.md` (§5 Games 1, 4 and 6; §8 Testing; §9 step 2)

**Starting point:** branch `games-1` (from `main` after the foundation merge, HEAD 67ee4a0). Every code block below was built and verified in a prototype: `npm test` (131 tests), `npx tsc --noEmit`, `npm run build` and `npm run e2e` (12 tests) all pass.

## Global Constraints

- Event: Sophomore Day, 2026-10-08. Each plan ends with a working, deployable build; later games are cut if time runs out.
- Target: Windows 11 lab PCs (~3 years old), Chrome/Edge, keyboard + mouse, one player per station. 60 fps target. No mobile/touch, no gamepad.
- Pinned versions: `phaser` **3.90.0**, `zxcvbn` **4.4.2**, `@types/zxcvbn` **4.4.5** (dev), all installed with `--save-exact`. Existing pins are unchanged: `zzfx` 1.4.0, `@fontsource/*` 5.3.0, `@playwright/test` 1.63.0, `jsdom` 29.1.1, `typescript` ~5.9.3, `vite` ^8.3.2, `vitest` ^5.0.3.
- Import Phaser as `import * as Phaser from 'phaser'` (its ESM build has no default export), or `import type * as Phaser from 'phaser'` for type-only use. Phaser is loaded only by `src/games/invaders/`, never by the hub.
- Palette (from `theme.ts`, mirrored as `--c-*`): cyan `#00f0ff`, pink `#ff2e88`, yellow `#ffe259`, deep `#0e0020`, purple `#2a0750`, ink `#fff`, inkDim `#ffd1f0`, grey `#b9b9d0`, danger `#ff3b5c`, ok `#3dff9a`. Fonts: Audiowide (`--f-display`), Space Grotesk (`--f-ui`), JetBrains Mono (`--f-mono`).
- Stage: fixed 1920×1080. Graphics are drawn in code (SVG/CSS/canvas); no sprite sheets or image files. Animate only `transform` and `opacity` in CSS; no `backdrop-filter`.
- Games talk to the outside only through `GameContext`: `ctx.audio.sfx(name)`, `ctx.input.onKey/onKeyUp/onAny/isDown`, `ctx.endRun(score)` and `ctx.exit()`. Games never add `window`/`document` key listeners of their own; Esc is handled by the shell.
- Every game's `unmount()` must release all listeners, timers, canvases and WebGL contexts. The Playwright 20-cycle test (Task 9) enforces this.
- Password Smash: passwords never leave the page and are never stored; an on-screen notice says so; the input is cleared after each round.
- `World.step(dt)` clamps `dt` to 0.05 s, so unit tests step at 1/60 s rather than in big jumps.
- Shell commands: zsh is the shell, so don't put a bare `===` in commands.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/shell.ts` (modify) | Bug fix: the 15 s load timeout is cleared once the game has mounted |
| `src/core/random.ts` | `Rng` type, seedable `mulberry32`, `shuffle`, `pick`, `between` |
| `src/core/ui/hud.ts` | `createHud(cells)`: the in-game score/lives bar (`[data-hud=key]` values) |
| `src/core/audio.ts` (modify) | Adds the `shoot` and `powerup` SFX |
| `src/styles/base.css` (modify) | Shared `.hud` styles |
| `src/games/phish/items.ts` | 60 hand-written email/text/URL items, each with a level, a clue and a "why" |
| `src/games/phish/logic.ts` | Deck building (difficulty ramp), the shrinking timer, combo multiplier, strikes and scoring |
| `src/games/phish/index.ts` + `phish.css` | The card UI, ←/→ answers, a 2 s clue highlight on mistakes |
| `src/games/password/logic.ts` | Five rounds of rules, zxcvbn judging, crack-time text, feedback chips and scoring |
| `src/games/password/index.ts` + `password.css` | Typing UI, privacy notice, cracking-rig animation, result stamp |
| `src/games/invaders/logic.ts` | Pure `World` simulation: waves, enemy types, power-ups, the boss, collisions, events |
| `src/games/invaders/textures.ts` | Draws every neon sprite into a Phaser texture at scene start |
| `src/games/invaders/scene.ts` | Phaser scene that mirrors the `World` as images and turns events into effects |
| `src/games/invaders/index.ts` + `invaders.css` | Phaser boot/teardown, HUD, banners, boss bar, SFX mapping |
| `src/games/registry.ts`, `src/main.ts` (modify) | `load()` for the three games, CSS imports |
| `vite.config.ts` (modify) | `chunkSizeWarningLimit` for the lazy Phaser chunk |
| `tests/unit/*.test.ts` | random, hud, phish-items, phish-logic, password-logic, invaders-logic, and one new shell test |
| `tests/e2e/games.spec.ts` | One smoke test per game plus the 20-cycle leak loop |
| `tests/unit/carousel.test.ts`, `tests/e2e/hub.spec.ts` (modify) | The "coming soon" checks move from invaders to runner |

---
### Task 1: Shell load-timeout fix

This changes code already merged to `main`. The shell starts a 15 s timer that crashes a game that never finishes loading, but it never cleared that timer once the game mounted. So every run longer than 15 s was killed as a "crash". Phaser games make this obvious, and the bug has to be fixed before any real game ships.

**Files:**
- Modify: `src/core/shell.ts` (in `launch`, inside the `.then` after `mount(...)`)
- Test: `tests/unit/shell.test.ts`

**Interfaces:**
- Consumes: the existing `createShell`, `fakeGame()`, `cabFor()` and `press()` helpers in `tests/unit/shell.test.ts`.
- Produces: no new API.

- [ ] **Step 1: Write the failing test**

`tests/unit/shell.test.ts`, apply this change:

```diff
@@ -170,6 +170,17 @@ describe('shell', () => {
     expect(layer.hidden).toBe(true);
   });
 
+  it('a game that mounted keeps running past the 15 s load timeout', async () => {
+    const game = fakeGame();
+    const done = shell.launch(cabFor(game), true);
+    await vi.advanceTimersByTimeAsync(0);
+    await vi.advanceTimersByTimeAsync(20_000);
+    expect(shell.state).toBe('playing');
+    expect(game.unmounts).toBe(0);
+    press('Escape');
+    await done;
+  });
+
   it('Esc while a game is still loading returns to the hub', async () => {
     const cab = cabFor(fakeGame());
     cab.load = () => new Promise<GameModule>(() => {}); // never resolves
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/shell.test.ts -t "past the 15 s"`
Expected: FAIL. The timeout fires at 15 s, so the state is `'error'` and the game has been unmounted, not `'playing'`.

- [ ] **Step 3: Implement the fix**

`src/core/shell.ts`, apply this change:

```diff
@@ -98,6 +98,7 @@ export function createShell(opts: ShellOptions): Shell {
             endRun: (score) => finish({ kind: 'score', score: Math.max(0, Math.floor(score)) }),
             exit: () => finish({ kind: 'exit' }),
           });
+          clearTimeout(loadTimeout); // mounted: the timeout only guards loading, not the run itself
         })
         .catch((error) => finish({ kind: 'crash', error }));
     });
```

- [ ] **Step 4: Run the shell tests**

Run: `npx vitest run tests/unit/shell.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/shell.ts tests/unit/shell.test.ts
git commit -m "fix(shell): clear the load timeout once a game has mounted" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared game kit (dependencies, RNG, HUD, SFX)

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Create: `src/core/random.ts`, `src/core/ui/hud.ts`
- Modify: `src/core/audio.ts`, `src/styles/base.css`
- Test: `tests/unit/random.test.ts`, `tests/unit/hud.test.ts`

**Interfaces:**
- Consumes: `el(selector, attrs, ...children)` from `src/core/ui/dom.ts`.
- Produces:
  - `type Rng = () => number`
  - `mulberry32(seed: number): Rng`
  - `shuffle<T>(items: readonly T[], rng?: Rng): T[]`
  - `pick<T>(items: readonly T[], rng?: Rng): T`
  - `between(min: number, max: number, rng?: Rng): number`
  - `createHud(cells: [key: string, label: string][]): Hud`, where `Hud = { el: HTMLElement; set(key: string, value: string): void }`. Each value element has `data-hud="<key>"` and starts as `'0'`.
  - `SfxName` gains `'shoot' | 'powerup'`.

- [ ] **Step 1: Install the new dependencies (exact versions)**

```bash
npm install --save-exact phaser@3.90.0 zxcvbn@4.4.2
npm install --save-exact --save-dev @types/zxcvbn@4.4.5
```

Expected: `package.json` now lists `"phaser": "3.90.0"` and `"zxcvbn": "4.4.2"` under dependencies, and `"@types/zxcvbn": "4.4.5"` under devDependencies.

- [ ] **Step 2: Write the failing tests**

`tests/unit/random.test.ts` (full file):

```ts
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
```

`tests/unit/hud.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { createHud } from '../../src/core/ui/hud';

describe('createHud', () => {
  it('renders one labelled cell per key and updates values', () => {
    const hud = createHud([['score', 'SCORE'], ['wave', 'WAVE']]);
    expect(hud.el.querySelectorAll('.hud-cell')).toHaveLength(2);
    expect(hud.el.querySelector('.hud-label')!.textContent).toBe('SCORE');
    hud.set('score', '1,200');
    expect(hud.el.querySelector('[data-hud="score"]')!.textContent).toBe('1,200');
    hud.set('missing', 'x'); // unknown keys are ignored
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/unit/random.test.ts tests/unit/hud.test.ts`
Expected: FAIL. The modules `src/core/random` and `src/core/ui/hud` cannot be resolved.

- [ ] **Step 4: Implement**

`src/core/random.ts` (full file):

```ts
// Small seeded randomness helpers so game logic can be unit-tested deterministically.

export type Rng = () => number;

/** Deterministic PRNG returning floats in [0, 1). Same seed → same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns a shuffled copy (Fisher–Yates). The input array is not changed. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Random element of a non-empty array. */
export function pick<T>(items: readonly T[], rng: Rng = Math.random): T {
  return items[Math.floor(rng() * items.length)];
}

/** Random float in [min, max). */
export function between(min: number, max: number, rng: Rng = Math.random): number {
  return min + rng() * (max - min);
}
```

`src/core/ui/hud.ts` (full file):

```ts
import { el } from './dom';

export interface Hud {
  el: HTMLElement;
  /** Updates one cell's value. Skips the DOM write when the text is unchanged. */
  set(key: string, text: string): void;
}

/** A row of LABEL / value cells across the top of a game, e.g. SCORE 1,200 · WAVE 3. */
export function createHud(cells: [key: string, label: string][]): Hud {
  const values = new Map<string, HTMLElement>();
  const root = el(
    'div.hud',
    {},
    ...cells.map(([key, label]) => {
      const value = el('span.hud-value', { 'data-hud': key }, '');
      values.set(key, value);
      return el('div.hud-cell', {}, el('span.hud-label', {}, label), value);
    }),
  );
  return {
    el: root,
    set(key, text) {
      const v = values.get(key);
      if (v && v.textContent !== text) v.textContent = text;
    },
  };
}
```

`src/core/audio.ts`, apply this change:

```diff
@@ -2,7 +2,7 @@ import type { ZzfxParams } from 'zzfx';
 import type { Music } from './music';
 import { safeLocalStorage, type KeyValueStore } from './storage';
 
-export type SfxName = 'move' | 'select' | 'back' | 'error' | 'coin' | 'hit' | 'explode' | 'score' | 'type';
+export type SfxName = 'move' | 'select' | 'back' | 'error' | 'coin' | 'hit' | 'explode' | 'score' | 'type' | 'shoot' | 'powerup';
 
 // ZzFX parameter lists (design new ones at https://killedbyapixel.github.io/ZzFX/).
 export const SFX: Record<SfxName, ZzfxParams> = {
@@ -15,6 +15,8 @@ export const SFX: Record<SfxName, ZzfxParams> = {
   explode: [1.1, 0, 80, 0.01, 0.2, 0.5, 4, 2.8, , , , , , 1.2, , 0.4],
   score: [0.9, 0, 700, 0.02, 0.1, 0.3, 1, 1.5, , , 300, 0.08, 0.05],
   type: [0.3, 0, 900, , 0.005, 0.02, 1, 1.2],
+  shoot: [0.4, 0, 880, , 0.01, 0.06, 2, 1.4, -18],
+  powerup: [0.8, 0, 440, 0.02, 0.12, 0.25, 1, 1.6, , , 440, 0.05, 0.05],
 };
 
 export const MUTE_KEY = 'cyberarcade.muted';
```

`src/styles/base.css`, apply this change:

```diff
@@ -268,3 +268,36 @@ button:focus {
     transition-duration: 0.01ms !important;
   }
 }
+
+/* Shared in-game HUD (createHud) */
+.hud {
+  position: absolute;
+  top: 28px;
+  left: 48px;
+  right: 120px; /* clear of the mute indicator in the top-right corner */
+  display: flex;
+  justify-content: space-between;
+  gap: 32px;
+  pointer-events: none;
+  font-family: var(--f-mono);
+}
+
+.hud-cell {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+}
+
+.hud-label {
+  font-size: 22px;
+  letter-spacing: 0.25em;
+  color: var(--c-ink-dim);
+  opacity: 0.8;
+}
+
+.hud-value {
+  font-size: 44px;
+  font-weight: 700;
+  color: #fff;
+  text-shadow: 0 0 12px var(--c-cyan);
+}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run tests/unit/random.test.ts tests/unit/hud.test.ts && npx tsc --noEmit`
Expected: all PASS, and tsc reports no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/core/random.ts src/core/ui/hud.ts src/core/audio.ts src/styles/base.css tests/unit/random.test.ts tests/unit/hud.test.ts
git commit -m "feat(core): shared game kit - seedable RNG, HUD, shoot/powerup SFX, phaser + zxcvbn" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Phish or Legit — items and rules

Spec §5.4 calls for about 60 hand-written items tagged by difficulty, a shrinking timer, a combo multiplier, a ramping difficulty, and a telltale clue for every item. The bank-validation test in spec §8 checks that every item has a label and a highlight.

**Files:**
- Create: `src/games/phish/items.ts`, `src/games/phish/logic.ts`
- Test: `tests/unit/phish-items.test.ts`, `tests/unit/phish-logic.test.ts`

**Interfaces:**
- Consumes: `shuffle`, `Rng` from `src/core/random.ts` (Task 2).
- Produces:
  - `items.ts`: `ItemKind`, `PhishItem` (`id, kind, from, subject?, body, phish, level: 1|2|3, clue, why`), `ITEMS: PhishItem[]` (60 items).
  - `logic.ts`:
    - constants `STRIKES`, `START_TIME`, `MIN_TIME`, `TIME_STEP`, `DECK_BONUS`
    - `multiplier(streak)`, `timeLimit(correct)`, `buildDeck(items, rng?)`
    - `RunState`, `AnswerResult`, `createRun(items, rng?)`, `current(s)`
    - `answer(s, saidPhish: boolean | null, secondsLeft)`, where `null` means the timer ran out.

- [ ] **Step 1: Write the failing tests**

`tests/unit/phish-items.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/games/phish/items';

describe('phish item bank', () => {
  it('has at least 60 items with unique ids', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('every clue appears in the item text and every explanation fits on screen', () => {
    for (const it of ITEMS) {
      const text = [it.from, it.subject ?? '', it.body].join('\n');
      expect(text, it.id).toContain(it.clue);
      expect(it.clue.length, it.id).toBeGreaterThan(0);
      expect(it.why.length, `${it.id}: "${it.why}"`).toBeLessThanOrEqual(60);
    }
  });

  it('only emails have subjects', () => {
    for (const it of ITEMS) if (it.kind !== 'email') expect(it.subject, it.id).toBeUndefined();
  });

  it('each level has phish and legit items, roughly balanced', () => {
    for (const level of [1, 2, 3] as const) {
      const items = ITEMS.filter((i) => i.level === level);
      const phish = items.filter((i) => i.phish).length;
      expect(items.length, `level ${level}`).toBeGreaterThanOrEqual(15);
      expect(phish / items.length).toBeGreaterThanOrEqual(0.35);
      expect(phish / items.length).toBeLessThanOrEqual(0.65);
    }
  });
});
```

`tests/unit/phish-logic.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import type { PhishItem } from '../../src/games/phish/items';
import { ITEMS } from '../../src/games/phish/items';
import { answer, buildDeck, createRun, current, DECK_BONUS, multiplier, timeLimit } from '../../src/games/phish/logic';

const item = (id: string, phish: boolean, level: 1 | 2 | 3 = 1): PhishItem => ({
  id, kind: 'text', from: 'x', body: 'y', phish, level, clue: 'y', why: 'z',
});

describe('phish logic', () => {
  it('multiplier grows every 3 in a row and caps at 5', () => {
    expect([0, 2, 3, 5, 6, 9, 12, 30].map(multiplier)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });

  it('time limit shrinks from 8 s to a 3 s floor', () => {
    expect(timeLimit(0)).toBe(8);
    expect(timeLimit(4)).toBe(7);
    expect(timeLimit(20)).toBe(3);
    expect(timeLimit(100)).toBe(3);
  });

  it('deck uses every item once, starts easy and keeps level 3 out of the first 15', () => {
    const deck = buildDeck(ITEMS, mulberry32(1));
    expect(deck).toHaveLength(ITEMS.length);
    expect(new Set(deck.map((d) => d.id)).size).toBe(ITEMS.length);
    expect(deck.slice(0, 5).every((d) => d.level === 1)).toBe(true);
    expect(deck.slice(0, 15).every((d) => d.level < 3)).toBe(true);
  });

  it('scores right answers with multiplier and time bonus', () => {
    const s = createRun([item('a', true), item('b', false), item('c', true), item('d', true), item('e', false)], mulberry32(2));
    const first = current(s)!;
    const r = answer(s, first.phish, 5.04);
    expect(r).toEqual({ right: true, points: 150, bonus: 0, over: false });
    expect(s.streak).toBe(1);
    expect(s.score).toBe(150);
  });

  it('applies ×2 on the 4th answer in a row', () => {
    const s = createRun(Array.from({ length: 8 }, (_, i) => item(`i${i}`, i % 2 === 0)), mulberry32(3));
    for (let i = 0; i < 3; i++) answer(s, current(s)!.phish, 0);
    expect(answer(s, current(s)!.phish, 0).points).toBe(200);
  });

  it('wrong answers and timeouts are strikes; three strikes ends the run', () => {
    const s = createRun(Array.from({ length: 8 }, (_, i) => item(`i${i}`, true)), mulberry32(4));
    answer(s, true, 3);
    expect(answer(s, false, 3)).toMatchObject({ right: false, points: 0, over: false });
    expect(s.streak).toBe(0);
    expect(answer(s, null, 0)).toMatchObject({ right: false, over: false });
    expect(answer(s, false, 3)).toMatchObject({ over: true });
    expect(current(s)).toBeNull();
    expect(answer(s, true, 3)).toMatchObject({ points: 0, over: true });
  });

  it('clearing the deck adds the bonus once', () => {
    const s = createRun([item('a', true), item('b', false)], mulberry32(5));
    answer(s, current(s)!.phish, 0);
    const last = answer(s, current(s)!.phish, 0);
    expect(last).toMatchObject({ right: true, bonus: DECK_BONUS, over: true });
    expect(s.score).toBe(100 + 100 + DECK_BONUS);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/phish-items.test.ts tests/unit/phish-logic.test.ts`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement**

`src/games/phish/items.ts` (full file):

```ts
// Hand-written practice items. Every brand detail is illustrative; all phishing domains are fake.
export type ItemKind = 'email' | 'text' | 'url';

export interface PhishItem {
  id: string;
  kind: ItemKind;
  /** Sender (email/text) or where the link was seen (url). */
  from: string;
  subject?: string;
  /** Message text, or the URL itself for kind 'url'. */
  body: string;
  phish: boolean;
  level: 1 | 2 | 3;
  /** Exact substring of from, subject or body that gives it away (or proves it's real). */
  clue: string;
  /** Shown after a mistake. Max 60 characters. */
  why: string;
}

export const ITEMS: PhishItem[] = [
  // ── Level 1: obvious ───────────────────────────────────────────────
  { id: 'l1-amazon-lock', kind: 'email', from: 'security@amaz0n-security.co', subject: 'URGENT: Account locked!!!',
    body: 'Your account will be DELETED in 24 hours. Verify your card now: amaz0n-security.co/verify',
    phish: true, level: 1, clue: 'amaz0n-security.co', why: 'Zero instead of O: a fake Amazon domain.' },
  { id: 'l1-counseling', kind: 'email', from: 'counseling@school.edu', subject: 'Schedule change: period 3',
    body: 'Your period 3 class moved to room 214 starting Monday. No reply needed.',
    phish: false, level: 1, clue: 'No reply needed', why: 'School address, no link, no request. Legit.' },
  { id: 'l1-walmart-win', kind: 'text', from: '+1 (302) 555-0199',
    body: 'CONGRATS! You won a $1000 Walmart gift card! Claim now: bit.ly/fr33-g1ft',
    phish: true, level: 1, clue: 'bit.ly/fr33-g1ft', why: "You didn't enter. Prize + short link = scam." },
  { id: 'l1-mom', kind: 'text', from: 'Mom',
    body: 'Running late, can you start the rice? Home by 6.',
    phish: false, level: 1, clue: 'Home by 6', why: 'Saved contact, normal message, no link.' },
  { id: 'l1-robux', kind: 'url', from: 'Link in a game chat',
    body: 'https://free-robux-generator.xyz/claim',
    phish: true, level: 1, clue: 'free-robux-generator.xyz', why: 'Free currency generators steal accounts.' },
  { id: 'l1-google', kind: 'url', from: 'Typed into the address bar',
    body: 'https://www.google.com/',
    phish: false, level: 1, clue: 'www.google.com', why: 'The real Google domain.' },
  { id: 'l1-netflix-pay', kind: 'email', from: 'billing@netflix-payments-help.com', subject: 'Payment declined',
    body: 'Your membership is on hold. Update payment within 12 hours or lose access.',
    phish: true, level: 1, clue: 'netflix-payments-help.com', why: "Netflix doesn't use netflix-payments-help.com." },
  { id: 'l1-netflix-signin', kind: 'email', from: 'info@account.netflix.com', subject: 'New sign-in to your account',
    body: 'We noticed a new sign-in on a TV in your home. If this was you, you can ignore this email.',
    phish: false, level: 1, clue: 'account.netflix.com', why: 'Real Netflix subdomain, no pressure, no link.' },
  { id: 'l1-usps', kind: 'text', from: '+1 (415) 555-0123',
    body: 'USPS: Your package is held. Pay $1.99 redelivery fee: usps-redeliver.top',
    phish: true, level: 1, clue: 'usps-redeliver.top', why: 'USPS never texts payment links on .top sites.' },
  { id: 'l1-coach', kind: 'text', from: 'Coach Dana',
    body: 'Practice moved to the gym today because of rain. Same time.',
    phish: false, level: 1, clue: 'Same time', why: 'Known contact, no link, nothing asked.' },
  { id: 'l1-school-it', kind: 'email', from: 'helpdesk@schoo1-it.com', subject: 'Password expires today',
    body: 'Keep your school login active. Enter your current password here: schoo1-it.com/keep',
    phish: true, level: 1, clue: 'schoo1-it.com', why: 'A 1 instead of an L, and it asks for a password.' },
  { id: 'l1-library', kind: 'email', from: 'library@school.edu', subject: 'Book due Friday',
    body: '"The Hunger Games" is due Friday. Renew at the front desk.',
    phish: false, level: 1, clue: 'Renew at the front desk', why: 'School sender, no link, nothing risky.' },
  { id: 'l1-insta-badge', kind: 'url', from: 'Link in a DM from a stranger',
    body: 'https://instagram.verify-badge.net/apply',
    phish: true, level: 1, clue: 'verify-badge.net', why: 'The real domain here is verify-badge.net.' },
  { id: 'l1-classroom', kind: 'url', from: 'Link your teacher posted',
    body: 'https://classroom.google.com/c/NjQ1MjM',
    phish: false, level: 1, clue: 'classroom.google.com', why: 'Real Google Classroom domain.' },
  { id: 'l1-giftcard-friend', kind: 'text', from: '+1 (213) 555-0166',
    body: "Hey it's Jordan, lost my phone. Can you buy me a $100 Apple gift card and send the code?",
    phish: true, level: 1, clue: 'send the code', why: 'Gift card codes = cash. Classic scam.' },
  { id: 'l1-spotify', kind: 'email', from: 'no-reply@spotify.com', subject: 'Your receipt',
    body: 'Thanks for your payment of $5.99 for Spotify Premium Student.',
    phish: false, level: 1, clue: 'no-reply@spotify.com', why: 'Real Spotify address, no action needed.' },
  { id: 'l1-lottery', kind: 'email', from: 'claims@intl-lotto-winners.com', subject: 'YOU WON $2,500,000',
    body: 'Send a $50 processing fee to release your prize.',
    phish: true, level: 1, clue: '$50 processing fee', why: 'Real prizes never ask you to pay first.' },
  { id: 'l1-bank-alert', kind: 'text', from: 'Chase',
    body: 'Chase: A $42.10 purchase was made at Target. Not you? Call the number on your card.',
    phish: false, level: 1, clue: 'Call the number on your card', why: 'No link; it sends you to a number you trust.' },
  { id: 'l1-paypa1', kind: 'url', from: 'Link in an email',
    body: 'https://paypa1.com/login',
    phish: true, level: 1, clue: 'paypa1.com', why: 'paypa1 with a 1 is not PayPal.' },
  { id: 'l1-paypal', kind: 'url', from: 'Your saved bookmark',
    body: 'https://www.paypal.com/signin',
    phish: false, level: 1, clue: 'www.paypal.com', why: 'Real PayPal domain from your own bookmark.' },

  // ── Level 2: needs a closer look ──────────────────────────────────
  { id: 'l2-ms365', kind: 'email', from: 'alerts@microsoft365-alerts.com', subject: 'Unusual sign-in activity',
    body: 'We blocked a sign-in from Russia. Review your account: microsoft365-alerts.com/review',
    phish: true, level: 2, clue: 'microsoft365-alerts.com', why: 'Microsoft uses microsoft.com, not this.' },
  { id: 'l2-google-alert', kind: 'email', from: 'no-reply@accounts.google.com', subject: 'Security alert',
    body: 'A new device signed in to your account. Check activity in your Google Account settings.',
    phish: false, level: 2, clue: 'accounts.google.com', why: 'Real Google sender, points you to settings.' },
  { id: 'l2-apple-unlock', kind: 'url', from: 'Link in a text message',
    body: 'https://apple.com-id-unlock.info/login',
    phish: true, level: 2, clue: 'com-id-unlock.info', why: 'The real domain is com-id-unlock.info.' },
  { id: 'l2-closings', kind: 'url', from: 'Link on the school website',
    body: 'https://www.school.edu/closings',
    phish: false, level: 2, clue: 'school.edu', why: "Your school's own domain." },
  { id: 'l2-principal', kind: 'email', from: 'principal.office.school@gmail.com', subject: 'Quick favor',
    body: "I'm in a meeting. I need 5 Google Play gift cards for a staff surprise. Keep this quiet.",
    phish: true, level: 2, clue: 'principal.office.school@gmail.com', why: 'Staff email from Gmail + gift cards = fake.' },
  { id: 'l2-discord-verify', kind: 'email', from: 'noreply@discord.com', subject: 'Verify your email',
    body: "Thanks for signing up! Tap Verify Email to finish. Didn't sign up? Ignore this email.",
    phish: false, level: 2, clue: "Didn't sign up? Ignore this email.", why: 'Expected after signup, real domain, no pressure.' },
  { id: 'l2-wellsfargo-sub', kind: 'url', from: 'Link in an email',
    body: 'https://secure-login.wellsfargo.account-verify.com',
    phish: true, level: 2, clue: 'account-verify.com', why: 'Read right to left: the domain is account-verify.' },
  { id: 'l2-wellsfargo', kind: 'url', from: 'Typed into the address bar',
    body: 'https://www.wellsfargo.com/help/',
    phish: false, level: 2, clue: 'www.wellsfargo.com', why: 'Real bank domain, typed in yourself.' },
  { id: 'l2-steam', kind: 'text', from: 'Discord friend',
    body: 'bro is this you in this video?? steamcommunnity.com/id/clip',
    phish: true, level: 2, clue: 'steamcommunnity.com', why: 'Extra N: steamcommunnity is a fake Steam site.' },
  { id: 'l2-insta-login', kind: 'email', from: 'security@mail.instagram.com', subject: 'New login to Instagram',
    body: 'We noticed a login from Chrome on Windows. If this was you, no action needed. Review it from the Instagram app.',
    phish: false, level: 2, clue: 'from the Instagram app', why: 'Points you to the app, not a link.' },
  { id: 'l2-fedex', kind: 'email', from: 'tracking@fedex-delivery-help.com', subject: 'Delivery attempt failed',
    body: 'Download the attached label to reschedule. Package returned in 48 hours.',
    phish: true, level: 2, clue: 'fedex-delivery-help.com', why: "Not fedex.com, and it's pushing an attachment." },
  { id: 'l2-dentist', kind: 'text', from: 'Bright Smiles Dental',
    body: 'Reminder: cleaning appointment Tue 3:30 PM. Reply C to confirm.',
    phish: false, level: 2, clue: 'Reply C to confirm', why: 'Expected reminder, no link, no info asked.' },
  { id: 'l2-scholarship', kind: 'email', from: 'awards@national-student-grants.org', subject: "You've been selected!",
    body: "You qualify for a $10,000 scholarship you didn't apply for. Pay the $25 application fee today.",
    phish: true, level: 2, clue: '$25 application fee', why: 'Real scholarships never charge to receive.' },
  { id: 'l2-psat', kind: 'email', from: 'noreply@collegeboard.org', subject: 'Your PSAT scores are ready',
    body: 'Sign in to your College Board account to see your scores.',
    phish: false, level: 2, clue: 'collegeboard.org', why: 'Real College Board domain, expected email.' },
  { id: 'l2-qr-parking', kind: 'url', from: 'QR code stuck on a parking meter',
    body: 'https://pay-parking-now.co/meter',
    phish: true, level: 2, clue: 'pay-parking-now.co', why: 'Sticker QR codes on meters steal card numbers.' },
  { id: 'l2-gdoc', kind: 'url', from: 'Link your lab partner sent',
    body: 'https://docs.google.com/document/d/1x9Fq/edit',
    phish: false, level: 2, clue: 'docs.google.com', why: 'Real Google Docs domain from someone you know.' },
  { id: 'l2-wrong-number', kind: 'text', from: '+1 (646) 555-0187',
    body: 'Hi Emily! Are we still on for dinner? Oh sorry, wrong number. You seem nice though!',
    phish: true, level: 2, clue: 'wrong number', why: '"Wrong number" chats lead into scams.' },
  { id: 'l2-discord-code', kind: 'text', from: '43501',
    body: "Your Discord verification code is 482913. Don't share it with anyone.",
    phish: false, level: 2, clue: "Don't share it with anyone", why: 'A code you asked for. Just never share it.' },
  { id: 'l2-roblox', kind: 'email', from: 'events@roblox-rewards.gg', subject: 'Limited event: 10,000 Robux',
    body: 'Log in with your Roblox password to claim before midnight!',
    phish: true, level: 2, clue: 'roblox-rewards.gg', why: 'Not roblox.com, and it wants your password.' },
  { id: 'l2-amazon-ship', kind: 'email', from: 'shipment-tracking@amazon.com', subject: 'Your package has shipped',
    body: 'Your order of "USB-C Cable" is on the way. Track it in Your Orders.',
    phish: false, level: 2, clue: 'shipment-tracking@amazon.com', why: 'Real Amazon address, matches an order.' },

  // ── Level 3: tricky ───────────────────────────────────────────────
  { id: 'l3-ms-co', kind: 'email', from: 'account-security@accountprotection.microsoft.co', subject: 'Microsoft account security code',
    body: 'Someone may have your password. Confirm your identity within 1 hour or your account will be closed.',
    phish: true, level: 3, clue: 'microsoft.co', why: '.co, not .com, plus a 1-hour threat.' },
  { id: 'l3-ms-com', kind: 'email', from: 'account-security-noreply@accountprotection.microsoft.com', subject: 'Microsoft account security code',
    body: 'Your security code is 739204. If you did not request it, you can safely ignore this.',
    phish: false, level: 3, clue: 'accountprotection.microsoft.com', why: 'Real Microsoft domain, no link, no threat.' },
  { id: 'l3-docs-dash', kind: 'email', from: 'Ms. Lee via Google Docs', subject: 'Ms. Lee shared "Final Exam Review"',
    body: 'Open the document: https://docs-google.com/d/exam-review',
    phish: true, level: 3, clue: 'docs-google.com', why: 'Dash, not dot: docs-google.com is fake.' },
  { id: 'l3-docs-real', kind: 'email', from: 'Ms. Lee via Google Docs', subject: 'Ms. Lee shared "Lab Notes"',
    body: 'Open the document: https://docs.google.com/document/d/8hT2/edit',
    phish: false, level: 3, clue: 'docs.google.com', why: 'docs.google.com with a dot is real.' },
  { id: 'l3-paypal-session', kind: 'url', from: 'Link in an email',
    body: 'https://www.paypal.com.secure-session.io/signin',
    phish: true, level: 3, clue: 'secure-session.io', why: 'The domain is secure-session.io, not PayPal.' },
  { id: 'l3-paypal-real', kind: 'url', from: 'Link in the PayPal app',
    body: 'https://www.paypal.com/myaccount/transactions',
    phish: false, level: 3, clue: 'www.paypal.com/', why: 'Ends at paypal.com, then a normal path.' },
  { id: 'l3-punycode', kind: 'url', from: 'Link in a pop-up ad',
    body: 'https://xn--pple-43d.com/id',
    phish: true, level: 3, clue: 'xn--pple-43d.com', why: 'xn-- means lookalike letters: fake "apple".' },
  { id: 'l3-ms-login', kind: 'url', from: "Your school's sign-in page",
    body: 'https://login.microsoftonline.com/',
    phish: false, level: 3, clue: 'login.microsoftonline.com', why: "Microsoft's real school/work sign-in page." },
  { id: 'l3-venmo-call', kind: 'email', from: 'venmo@venmo-support-team.com', subject: 'Payment of $499.00 sent',
    body: 'You sent $499.00 to Alex R. Not you? Call 1-888-555-0143 now to cancel.',
    phish: true, level: 3, clue: 'Call 1-888-555-0143 now', why: 'Fake receipt + phone number = callback scam.' },
  { id: 'l3-venmo-real', kind: 'email', from: 'venmo@venmo.com', subject: 'You paid Sam $12.00',
    body: 'Pizza 🍕. Questions? Open the Venmo app and go to Help.',
    phish: false, level: 3, clue: 'Open the Venmo app', why: 'Real domain, sends you to the app.' },
  { id: 'l3-dropbox', kind: 'email', from: 'no-reply@dropbox.com', subject: 'Taylor shared "Grades.pdf" with you',
    body: 'View file: https://dropbox-share.web.app/grades',
    phish: true, level: 3, clue: 'dropbox-share.web.app', why: 'Real sender look, but the link is web.app.' },
  { id: 'l3-canvas', kind: 'email', from: 'notifications@instructure.com', subject: 'New assignment: Lab 4',
    body: 'Lab 4 is due Friday. View it in Canvas.',
    phish: false, level: 3, clue: 'instructure.com', why: 'Canvas is made by Instructure. Legit.' },
  { id: 'l3-apple-cancel', kind: 'email', from: 'receipts@apple-receipt-cancel.com', subject: 'Your receipt from Apple',
    body: 'Final Cut Pro, $299.99. If you did not make this purchase, cancel here within 24 hours.',
    phish: true, level: 3, clue: 'apple-receipt-cancel.com', why: 'Fake receipt to panic you into clicking.' },
  { id: 'l3-apple-real', kind: 'email', from: 'no_reply@email.apple.com', subject: 'Your receipt from Apple',
    body: 'iCloud+ 50GB, $0.99. Manage subscriptions in Settings on your device.',
    phish: false, level: 3, clue: 'Settings on your device', why: 'Real sender, sends you to Settings.' },
  { id: 'l3-netflix-help', kind: 'url', from: 'Link in a text message',
    body: 'https://netflix.com.restore-access.help/',
    phish: true, level: 3, clue: 'restore-access.help', why: 'The domain is restore-access.help.' },
  { id: 'l3-google-code', kind: 'text', from: '22000',
    body: 'G-662041 is your Google verification code.',
    phish: false, level: 3, clue: 'G-662041', why: 'A code you asked for, no link. Never share it.' },
  { id: 'l3-insta-check', kind: 'email', from: 'security@mail.instagram.com', subject: 'Copyright violation',
    body: 'Your account will be removed for copyright. Appeal: https://instagram-security-check.com',
    phish: true, level: 3, clue: 'instagram-security-check.com', why: 'Sender can be faked. Check the link domain.' },
  { id: 'l3-zoom', kind: 'url', from: 'Link in your class calendar',
    body: 'https://zoom.us/j/93184420571',
    phish: false, level: 3, clue: 'zoom.us', why: "Zoom's real domain is zoom.us." },
  { id: 'l3-nitro', kind: 'text', from: 'Discord friend',
    body: 'free nitro for 3 months!! discord.gift-nitro.com/claim',
    phish: true, level: 3, clue: 'gift-nitro.com', why: 'Real gifts use discord.gift/, not gift-nitro.com.' },
  { id: 'l3-wiki', kind: 'url', from: 'Search result',
    body: 'https://en.wikipedia.org/wiki/Phishing',
    phish: false, level: 3, clue: 'en.wikipedia.org', why: 'The real Wikipedia domain.' },
];
```

`src/games/phish/logic.ts` (full file):

```ts
import { shuffle, type Rng } from '../../core/random';
import type { PhishItem } from './items';

export const STRIKES = 3;
export const START_TIME = 8; // seconds for the first card
export const MIN_TIME = 3;
export const TIME_STEP = 0.25; // seconds removed per correct answer
export const DECK_BONUS = 1000;

/** Combo multiplier from the streak *before* this answer: ×1, then +1 every 3 in a row, max ×5. */
export function multiplier(streak: number): number {
  return Math.min(5, 1 + Math.floor(streak / 3));
}

/** Seconds allowed for the next card after `correct` right answers. */
export function timeLimit(correct: number): number {
  return Math.max(MIN_TIME, START_TIME - TIME_STEP * correct);
}

/** 5 easy cards, then 10 easy/medium, then everything else. No level-3 card in the first 15. */
export function buildDeck(items: readonly PhishItem[], rng: Rng = Math.random): PhishItem[] {
  const l1 = shuffle(items.filter((i) => i.level === 1), rng);
  const l2 = items.filter((i) => i.level === 2);
  const l3 = items.filter((i) => i.level === 3);
  const opening = l1.slice(0, 5);
  const middle = shuffle([...l1.slice(5), ...l2], rng);
  return [...opening, ...middle.slice(0, 10), ...shuffle([...middle.slice(10), ...l3], rng)];
}

export interface RunState {
  deck: PhishItem[];
  index: number;
  score: number;
  streak: number;
  strikes: number;
  correct: number;
  over: boolean;
}

export interface AnswerResult {
  right: boolean;
  points: number;
  /** DECK_BONUS when this answer finished the deck, else 0. */
  bonus: number;
  over: boolean;
}

export function createRun(items: readonly PhishItem[], rng: Rng = Math.random): RunState {
  return { deck: buildDeck(items, rng), index: 0, score: 0, streak: 0, strikes: 0, correct: 0, over: false };
}

export function current(s: RunState): PhishItem | null {
  return s.over ? null : (s.deck[s.index] ?? null);
}

/**
 * Applies the player's verdict (true = "phish") for the current card. `null` means the timer ran out,
 * which counts as a strike. Moves on to the next card.
 */
export function answer(s: RunState, saidPhish: boolean | null, secondsLeft: number): AnswerResult {
  const item = current(s);
  if (!item) return { right: false, points: 0, bonus: 0, over: true };
  const right = saidPhish !== null && saidPhish === item.phish;
  let points = 0;
  if (right) {
    points = 100 * multiplier(s.streak) + Math.round(Math.max(0, secondsLeft) * 10);
    s.streak++;
    s.correct++;
  } else {
    s.streak = 0;
    s.strikes++;
  }
  s.index++;
  let bonus = 0;
  if (s.strikes >= STRIKES) s.over = true;
  else if (s.index >= s.deck.length) {
    s.over = true;
    bonus = DECK_BONUS;
  }
  s.score += points + bonus;
  return { right, points, bonus, over: s.over };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/phish-items.test.ts tests/unit/phish-logic.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/phish/items.ts src/games/phish/logic.ts tests/unit/phish-items.test.ts tests/unit/phish-logic.test.ts
git commit -m "feat(phish): 60-item bank and run rules (ramp, timer, combo, strikes)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Phish or Legit — UI, wiring, first e2e

**Files:**
- Create: `src/games/phish/index.ts`, `src/games/phish/phish.css`, `tests/e2e/games.spec.ts`
- Modify: `src/games/registry.ts` (phish cabinet), `src/main.ts` (CSS import)

**Interfaces:**
- Consumes:
  - From Task 3: `ITEMS`, `answer`, `createRun`, `current`, `multiplier`, `STRIKES`, `timeLimit`, `RunState`.
  - From Task 2: `createHud`.
  - `GameContext` / `GameModule` from `src/core/types.ts`.
  - `boot(page, query?)` and `trackErrors(page)` from `tests/e2e/helpers.ts`.
- Produces:
  - `createGame(): GameModule`.
  - DOM hooks used by e2e: `.phish-card[data-id]` (gets `is-right`/`is-wrong` classes), `.phish-verdict`, `.phish-why`, `mark.clue`, `[data-hud="score"]`.
  - In `tests/e2e/games.spec.ts`: a `launch(page, id)` helper that later tasks reuse.

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/games.spec.ts` with exactly this content. Tasks 6, 8 and 9 append to it.

```ts
import { expect, test, type Page } from '@playwright/test';
import { ITEMS } from '../../src/games/phish/items';
import { boot, trackErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

/** Rotates the hub to the cabinet with `id` and starts it through the title card. */
async function launch(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 9; i++) {
    if ((await page.locator('.cabinet.is-center').getAttribute('data-id')) === id) break;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
  }
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', id);
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-card')).toBeVisible();
  await page.keyboard.press('Enter');
}

const phishOf = (id: string | null) => ITEMS.find((i) => i.id === id)!.phish;

test('phish: right answer scores, three wrong answers end the run', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'phish');
  const card = page.locator('.phish-card');
  await expect(card).toBeVisible();

  const first = await card.getAttribute('data-id');
  await page.keyboard.press(phishOf(first) ? 'ArrowLeft' : 'ArrowRight');
  await expect(page.locator('.phish-verdict')).toContainText('CORRECT');
  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');

  for (let i = 0; i < 3; i++) {
    await expect(card).not.toHaveClass(/is-(right|wrong)/); // previous verdict cleared, next card shown
    const id = await card.getAttribute('data-id');
    await page.keyboard.press(phishOf(id) ? 'ArrowRight' : 'ArrowLeft');
    await expect(page.locator('.phish-why')).not.toBeEmpty();
    await expect(page.locator('mark.clue')).toBeVisible();
  }
  await expect(page.locator('.game-over .final-score')).toBeVisible({ timeout: 5000 });
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/games.spec.ts -g phish`
Expected: FAIL. Phish is still "coming soon", so no title card appears.

- [ ] **Step 3: Implement the game UI**

`src/games/phish/index.ts` (full file):

```ts
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { ITEMS, type PhishItem } from './items';
import { answer, createRun, current, multiplier, STRIKES, timeLimit, type RunState } from './logic';

const RIGHT_MS = 450; // pause after a correct answer
const WRONG_MS = 2000; // the clue stays highlighted this long after a mistake
const KIND_LABEL: Record<PhishItem['kind'], string> = { email: 'EMAIL', text: 'TEXT MESSAGE', url: 'LINK' };

/** Renders `text`, wrapping the first occurrence of `clue` in a highlight span. Returns whether it was found. */
function fill(node: HTMLElement, text: string, clue: string | null): boolean {
  node.replaceChildren();
  const at = clue ? text.indexOf(clue) : -1;
  if (at < 0) {
    node.textContent = text;
    return false;
  }
  node.append(text.slice(0, at), el('mark.clue', {}, clue!), text.slice(at + clue!.length));
  return true;
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const run: RunState = createRun(ITEMS);
      const hud = createHud([['score', 'SCORE'], ['combo', 'COMBO'], ['strikes', 'STRIKES']]);
      const kind = el('div.phish-kind');
      const from = el('div.phish-from');
      const subject = el('div.phish-subject');
      const body = el('div.phish-body');
      const card = el('div.phish-card', {}, kind, from, subject, body);
      const bar = el('div.phish-timer-fill');
      const verdict = el('div.phish-verdict');
      const why = el('div.phish-why');
      root = el(
        'div.phish',
        {},
        hud.el,
        el('div.phish-timer', {}, bar),
        card,
        verdict,
        why,
        el('div.phish-keys', {}, el('span.key-phish', {}, '← PHISH'), el('span.key-legit', {}, 'LEGIT →')),
      );
      container.append(root);

      let deadline = 0;
      let limit = 0;
      let busy = false;

      const updateHud = () => {
        hud.set('score', run.score.toLocaleString('en-US'));
        hud.set('combo', `×${multiplier(run.streak)}`);
        hud.set('strikes', '✖'.repeat(run.strikes) + '·'.repeat(STRIKES - run.strikes));
      };

      const show = () => {
        const item = current(run)!;
        card.className = `phish-card is-${item.kind}`;
        card.dataset.id = item.id;
        kind.textContent = KIND_LABEL[item.kind];
        fill(from, item.from, null);
        subject.hidden = item.subject === undefined;
        fill(subject, item.subject ?? '', null);
        fill(body, item.body, null);
        verdict.textContent = '';
        verdict.className = 'phish-verdict';
        why.textContent = '';
        limit = timeLimit(run.correct) * 1000;
        deadline = performance.now() + limit;
        busy = false;
      };

      const decide = (saidPhish: boolean | null) => {
        if (busy) return;
        busy = true;
        const item = current(run)!;
        const secondsLeft = Math.max(0, deadline - performance.now()) / 1000;
        const result = answer(run, saidPhish, secondsLeft);
        updateHud();
        verdict.textContent = `${result.right ? 'CORRECT' : saidPhish === null ? "TIME'S UP" : 'WRONG'} — IT WAS ${item.phish ? 'PHISH' : 'LEGIT'}`;
        verdict.className = `phish-verdict ${result.right ? 'is-right' : 'is-wrong'}`;
        card.classList.add(result.right ? 'is-right' : 'is-wrong');
        if (!result.right) {
          // Highlight the telltale sign in whichever field holds it.
          if (!fill(from, item.from, item.clue) && !fill(subject, item.subject ?? '', item.clue)) fill(body, item.body, item.clue);
          why.textContent = item.why;
        }
        ctx.audio.sfx(result.right ? 'coin' : 'error');
        pause = setTimeout(() => {
          if (result.over) ctx.endRun(run.score);
          else show();
        }, result.right ? RIGHT_MS : WRONG_MS);
      };

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (busy) return;
        const left = deadline - performance.now();
        bar.style.transform = `scaleX(${Math.max(0, left / limit)})`;
        if (left <= 0) decide(null);
      };

      ctx.input.onKey((e) => {
        if (e.repeat) return;
        if (e.code === 'ArrowLeft') decide(true);
        else if (e.code === 'ArrowRight') decide(false);
      });

      updateHud();
      show();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimeout(pause);
      root?.remove();
      root = null;
    },
  };
}
```

`src/games/phish/phish.css` (full file):

```css
.phish {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 150px;
  gap: 28px;
}
.phish-timer {
  width: 1100px;
  height: 14px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.phish-timer-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-pink), var(--c-yellow));
  box-shadow: 0 0 12px var(--c-yellow);
  transform-origin: left;
}
.phish-card {
  width: 1100px;
  min-height: 420px;
  padding: 36px 48px;
  border-radius: 18px;
  background: rgba(18, 0, 38, 0.92);
  border: 3px solid var(--c-cyan);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.5), inset 0 0 24px rgba(0, 240, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 18px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.phish-card.is-right {
  border-color: var(--c-ok);
  box-shadow: 0 0 40px var(--c-ok);
}
.phish-card.is-wrong {
  border-color: var(--c-danger);
  box-shadow: 0 0 40px var(--c-danger);
  animation: phish-shake 0.3s;
}
@keyframes phish-shake {
  25% { transform: translateX(-14px); }
  75% { transform: translateX(14px); }
}
.phish-kind {
  font-family: var(--f-mono);
  font-size: 22px;
  letter-spacing: 0.3em;
  color: var(--c-cyan);
}
.phish-from {
  font-family: var(--f-mono);
  font-size: 30px;
  color: var(--c-ink-dim);
  overflow-wrap: anywhere;
}
.phish-subject {
  font-size: 36px;
  font-weight: 700;
}
.phish-body {
  font-size: 34px;
  line-height: 1.4;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.phish-card.is-url .phish-body {
  font-family: var(--f-mono);
  font-size: 40px;
  color: var(--c-yellow);
}
mark.clue {
  background: rgba(255, 59, 92, 0.3);
  color: #fff;
  outline: 3px solid var(--c-danger);
  border-radius: 4px;
  padding: 0 4px;
}
.phish-verdict {
  min-height: 56px;
  font-family: var(--f-display);
  font-size: 44px;
  letter-spacing: 0.08em;
}
.phish-verdict.is-right { color: var(--c-ok); text-shadow: 0 0 16px var(--c-ok); }
.phish-verdict.is-wrong { color: var(--c-danger); text-shadow: 0 0 16px var(--c-danger); }
.phish-why {
  min-height: 44px;
  font-size: 34px;
  color: var(--c-yellow);
}
.phish-keys {
  position: absolute;
  bottom: 48px;
  left: 120px;
  right: 120px;
  display: flex;
  justify-content: space-between;
  font-family: var(--f-display);
  font-size: 40px;
}
.key-phish { color: var(--c-pink); text-shadow: 0 0 14px var(--c-pink); }
.key-legit { color: var(--c-cyan); text-shadow: 0 0 14px var(--c-cyan); }
```

- [ ] **Step 4: Wire it into the hub**

In `src/games/registry.ts`, add a `load` line to the `phish` cabinet, after its `controls` line:

```ts
    load: () => import('./phish/index').then((m) => m.createGame()),
```

In `src/main.ts`, add this line right after `import './hub/hub.css';`:

```ts
import './games/phish/phish.css';
```

- [ ] **Step 5: Run the e2e test and the unit suite**

Run: `npx playwright test tests/e2e/games.spec.ts -g phish && npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/games/phish/index.ts src/games/phish/phish.css src/games/registry.ts src/main.ts tests/e2e/games.spec.ts
git commit -m "feat(phish): playable Phish or Legit with clue highlight" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Password Smash — rules and scoring

Spec §5.6 and §8: zxcvbn crack-time estimates, feedback for dictionary words, patterns and short passwords, score derived from crack time, and challenge rounds. The Password Smash scoring logic gets unit tests.

**Files:**
- Create: `src/games/password/logic.ts`
- Test: `tests/unit/password-logic.test.ts`

**Interfaces:**
- Consumes: `zxcvbn` (default import) and its `Match` type through `zxcvbn`'s typings.
- Produces:
  - constants `ROUND_SECONDS = 30`, `MAX_INPUT = 64`
  - `Round`, `ROUNDS` (5 rounds)
  - `formatCrackTime(guessesLog10): string`
  - `brokenRule(password, round): string | null`
  - `Chip`, `chipsFor(password, sequence)`
  - `Verdict`, `judge(password, round): Verdict`

- [ ] **Step 1: Write the failing test**

`tests/unit/password-logic.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { brokenRule, chipsFor, formatCrackTime, judge, ROUNDS } from '../../src/games/password/logic';

const labels = (pw: string) => judge(pw, ROUNDS[0]).chips.map((c) => c.label);

describe('formatCrackTime', () => {
  it('formats each range', () => {
    expect(formatCrackTime(0.5)).toBe('INSTANTLY');
    expect(formatCrackTime(4)).toBe('1 SECOND');
    expect(formatCrackTime(5)).toBe('10 SECONDS');
    expect(formatCrackTime(6)).toBe('1 MINUTE');
    expect(formatCrackTime(8)).toBe('2 HOURS');
    expect(formatCrackTime(11.4)).toBe('290 DAYS');
    expect(formatCrackTime(11.5)).toBe('1 YEAR');
    expect(formatCrackTime(14)).toBe('316 YEARS');
    expect(formatCrackTime(14.5)).toBe('1 THOUSAND YEARS');
    expect(formatCrackTime(17.5)).toBe('1 MILLION YEARS');
    expect(formatCrackTime(20.33)).toBe('677 MILLION YEARS');
    expect(formatCrackTime(22.341)).toBe('69 BILLION YEARS');
    expect(formatCrackTime(30)).toBe('FOREVER');
  });
});

describe('round rules', () => {
  it('reports the broken rule', () => {
    expect(brokenRule('', ROUNDS[0])).toBe('EMPTY');
    expect(brokenRule('anything goes', ROUNDS[0])).toBeNull();
    expect(brokenRule('elevenchars', ROUNDS[1])).toBe('MAX 10 CHARACTERS');
    expect(brokenRule('tenchars!!', ROUNDS[1])).toBeNull();
    expect(brokenRule('Purple monkey', ROUNDS[2])).toBe('LOWERCASE AND SPACES ONLY');
    expect(brokenRule('purple monkey', ROUNDS[2])).toBeNull();
  });
});

describe('judge', () => {
  it('weak passwords crack instantly and score little', () => {
    const v = judge('password', ROUNDS[0]);
    expect(v.crackTime).toBe('INSTANTLY');
    expect(v.survived).toBe(false);
    expect(v.points).toBe(48);
    expect(v.chips).toContainEqual({ label: 'COMMON PASSWORD', good: false });
    expect(v.warning).not.toBe('');
  });

  it('passphrases survive the passphrase round and earn the bonus', () => {
    const v = judge('correct horse battery staple', ROUNDS[2]);
    expect(v.crackTime).toBe('677 MILLION YEARS');
    expect(v.survived).toBe(true);
    expect(v.points).toBe(2000 + 500);
  });

  it('breaking the rule scores zero even for a strong password', () => {
    const v = judge('kT9$wQ3&zM8^bNx', ROUNDS[1]);
    expect(v.broken).toBe('MAX 10 CHARACTERS');
    expect(v.points).toBe(0);
    expect(v.survived).toBe(false);
  });

  it('15 random characters survive FORTRESS', () => {
    const v = judge('kT9$wQ3&zM8^bNx', ROUNDS[3]);
    expect(v.survived).toBe(true);
    expect(v.points).toBe(1500 + 500);
  });

  it('empty input is a broken rule, no analysis', () => {
    expect(judge('', ROUNDS[0])).toMatchObject({ broken: 'EMPTY', points: 0, chips: [] });
  });

  it('labels the patterns the cracker found', () => {
    expect(labels('P@ssw0rd')).toEqual(expect.arrayContaining(['COMMON PASSWORD', 'L33T SWAP']));
    expect(labels('aaaaaaaa')).toContain('REPEATS');
    expect(labels('abcdefgh')).toContain('SEQUENCE');
    expect(labels('Tim2009')).toEqual(expect.arrayContaining(['NAME', 'YEAR', 'TOO SHORT']));
    expect(labels('Xq7#vL2!pR')).toEqual(['NO PATTERNS FOUND']);
    expect(labels('neon taco wizard galaxy 77!')).toContain('LONG');
  });

  it('dedupes chips and marks a partial password match as a dictionary word', () => {
    const chips = chipsFor('dragonfly', [
      { pattern: 'dictionary', token: 'dragon', dictionary_name: 'passwords' },
      { pattern: 'dictionary', token: 'fly', dictionary_name: 'english_wikipedia' },
    ]);
    expect(chips).toEqual([{ label: 'DICTIONARY WORD', good: false }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/password-logic.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/games/password/logic.ts` (full file):

```ts
import zxcvbn from 'zxcvbn';

// Scoring for Password Smash. All analysis happens in the page: passwords are never sent or stored.

export const ROUND_SECONDS = 30;
export const MAX_INPUT = 64;
const GUESSES_PER_SECOND_LOG10 = 4; // a slow online attack: 10,000 guesses per second
const YEAR = 31_557_600;

export interface Round {
  name: string;
  /** Shown on screen, e.g. 'MAX 10 CHARACTERS'. */
  rule: string;
  maxLength?: number;
  pattern?: RegExp;
  /** log10(guesses) needed to survive. */
  target: number;
  targetLabel: string;
}

export const ROUNDS: Round[] = [
  { name: 'WARM-UP', rule: 'ANY PASSWORD', target: 9, targetLabel: '1 DAY' },
  { name: 'SHORT', rule: 'MAX 10 CHARACTERS', maxLength: 10, target: 9.8, targetLabel: '1 WEEK' },
  { name: 'PASSPHRASE', rule: 'LOWERCASE AND SPACES ONLY', pattern: /^[a-z ]+$/, target: 14.5, targetLabel: '1,000 YEARS' },
  { name: 'FORTRESS', rule: 'MAX 16 CHARACTERS', maxLength: 16, target: 14.5, targetLabel: '1,000 YEARS' },
  { name: 'VAULT', rule: 'ANY PASSWORD', target: 17.5, targetLabel: '1 MILLION YEARS' },
];

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 'S'}`;

/** Human crack time for log10(guesses), assuming 10^4 guesses per second. */
export function formatCrackTime(guessesLog10: number): string {
  const seconds = 10 ** (guessesLog10 - GUESSES_PER_SECOND_LOG10);
  if (seconds < 1) return 'INSTANTLY';
  if (seconds < 60) return plural(Math.floor(seconds), 'SECOND');
  if (seconds < 3600) return plural(Math.floor(seconds / 60), 'MINUTE');
  if (seconds < 86_400) return plural(Math.floor(seconds / 3600), 'HOUR');
  if (seconds < YEAR) return plural(Math.floor(seconds / 86_400), 'DAY');
  const years = seconds / YEAR;
  if (years < 1e3) return plural(Math.floor(years), 'YEAR');
  if (years >= 1e15) return 'FOREVER';
  const [value, word] = years >= 1e12 ? [1e12, 'TRILLION'] : years >= 1e9 ? [1e9, 'BILLION'] : years >= 1e6 ? [1e6, 'MILLION'] : [1e3, 'THOUSAND'];
  return `${Math.floor(years / value).toLocaleString('en-US')} ${word} YEARS`;
}

/** The first rule the password breaks in this round, or null. */
export function brokenRule(password: string, round: Round): string | null {
  if (password.length === 0) return 'EMPTY';
  if (round.maxLength !== undefined && password.length > round.maxLength) return `MAX ${round.maxLength} CHARACTERS`;
  if (round.pattern && !round.pattern.test(password)) return round.rule;
  return null;
}

export interface Chip {
  label: string;
  good: boolean;
}

interface Match {
  pattern: string;
  token: string;
  dictionary_name?: string;
  l33t?: boolean;
}

/** Short feedback labels describing what the cracker found. */
export function chipsFor(password: string, sequence: readonly Match[]): Chip[] {
  const labels = new Map<string, boolean>();
  const bad = (label: string) => labels.set(label, false);
  for (const m of sequence) {
    switch (m.pattern) {
      case 'dictionary':
        if (m.dictionary_name === 'passwords') bad(m.token.length === password.length ? 'COMMON PASSWORD' : 'DICTIONARY WORD');
        else if (m.dictionary_name?.includes('names')) bad('NAME');
        else bad('DICTIONARY WORD');
        if (m.l33t) bad('L33T SWAP');
        break;
      case 'spatial': bad('KEYBOARD PATTERN'); break;
      case 'repeat': bad('REPEATS'); break;
      case 'sequence': bad('SEQUENCE'); break;
      case 'date': bad('DATE'); break;
      case 'regex': bad('YEAR'); break;
    }
  }
  if (password.length > 0 && password.length < 8) bad('TOO SHORT');
  if (password.length >= 16) labels.set('LONG', true);
  if (sequence.length > 0 && sequence.every((m) => m.pattern === 'bruteforce')) labels.set('NO PATTERNS FOUND', true);
  return [...labels].map(([label, good]) => ({ label, good }));
}

export interface Verdict {
  guessesLog10: number;
  crackTime: string;
  chips: Chip[];
  /** zxcvbn's one-line warning, '' if none. */
  warning: string;
  broken: string | null;
  survived: boolean;
  points: number;
}

export function judge(password: string, round: Round): Verdict {
  const broken = brokenRule(password, round);
  if (broken === 'EMPTY') return { guessesLog10: 0, crackTime: 'INSTANTLY', chips: [], warning: '', broken, survived: false, points: 0 };
  const result = zxcvbn(password.slice(0, MAX_INPUT));
  const g = result.guesses_log10;
  const survived = broken === null && g >= round.target;
  const points = broken ? 0 : Math.min(2000, Math.round(g * 100)) + (survived ? 500 : 0);
  return {
    guessesLog10: g,
    crackTime: formatCrackTime(g),
    chips: chipsFor(password, result.sequence as unknown as Match[]),
    warning: result.feedback.warning ?? '',
    broken,
    survived,
    points,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/password-logic.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/password/logic.ts tests/unit/password-logic.test.ts
git commit -m "feat(password): zxcvbn judging, challenge rounds and scoring" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Password Smash — UI, wiring, e2e

**Files:**
- Create: `src/games/password/index.ts`, `src/games/password/password.css`
- Modify: `src/games/registry.ts` (password cabinet), `src/main.ts` (CSS import), `tests/e2e/games.spec.ts` (append)

**Interfaces:**
- Consumes: from Task 5, `judge`, `MAX_INPUT`, `ROUND_SECONDS`, `ROUNDS` and `Verdict`; from Task 2, `createHud`; from Task 4, `launch()` in the e2e file.
- Produces:
  - `createGame(): GameModule`.
  - DOM hooks: `.pw-input`, `.pw-round`, `.pw-stamp`, `.pw-chip`, `.pw-privacy`.

- [ ] **Step 1: Append the failing e2e test**

Append this to the end of `tests/e2e/games.spec.ts`:

```ts

test('password: five rounds, input cleared, score adds up', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'password');
  const field = page.locator('.pw-input');
  const entries = ['password', 'Xq7#vL2!pR', 'correct horse battery staple', 'kT9$wQ3&zM8^bNx', 'neon taco wizard galaxy 77!'];
  for (const [i, pw] of entries.entries()) {
    await expect(page.locator('.pw-round')).toContainText(`ROUND ${i + 1}`);
    await expect(field).toBeFocused();
    await page.keyboard.type(pw);
    await page.keyboard.press('Enter');
    await expect(field).toHaveValue('');
    await expect(page.locator('.pw-stamp')).toBeVisible();
    if (i === 0) await expect(page.locator('.pw-chip')).toContainText(['COMMON PASSWORD']);
    if (i === 2) await expect(page.locator('.pw-stamp')).toHaveText('SURVIVED!');
    await page.waitForTimeout(1050); // result ignores Enter for the first second
    await page.keyboard.press('Enter');
  }
  // 48 + (1000 + 500) + (2000 + 500) + (1500 + 500) + (2000 + 500)
  await expect(page.locator('.game-over .final-score')).toHaveText('8,548');
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/games.spec.ts -g password`
Expected: FAIL. No title card appears for the password cabinet.

- [ ] **Step 3: Implement the game UI**

`src/games/password/index.ts` (full file):

```ts
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { judge, MAX_INPUT, ROUND_SECONDS, ROUNDS, type Verdict } from './logic';

const RIG_MS = 1800; // length of the "cracking" animation
const RESULT_MIN_MS = 1000; // Enter can't skip the result before this
const RESULT_MS = 6000; // result auto-advances after this
const GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*?';

function noise(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  return s;
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

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const hud = createHud([['score', 'SCORE'], ['round', 'ROUND'], ['time', 'TIME']]);
      const title = el('div.pw-round');
      const rule = el('div.pw-rule');
      const target = el('div.pw-target');
      const field = el<'input'>('input.pw-input', {
        type: 'text',
        maxlength: MAX_INPUT,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Password',
      });
      const hint = el('div.pw-hint', {}, 'PRESS ENTER TO CRACK IT');
      const entry = el('div.pw-entry', {}, field, hint);
      const rig = el('pre.pw-rig');
      const meter = el('div.pw-meter-fill');
      const stamp = el('div.pw-stamp');
      const time = el('div.pw-time');
      const chips = el('div.pw-chips');
      const warning = el('div.pw-warning');
      const points = el('div.pw-points');
      const result = el('div.pw-result', {}, stamp, time, chips, warning, points);
      const stage = el('div.pw-stage', {}, entry, rig, result);
      root = el(
        'div.password',
        {},
        hud.el,
        title,
        rule,
        target,
        stage,
        el('div.pw-meter', {}, meter),
        el('div.pw-privacy', {}, '🔒 Checked on this computer only — never sent or saved. Don\'t use a real password!'),
      );
      container.append(root);

      let round = 0;
      let score = 0;
      let phase: 'typing' | 'cracking' | 'result' = 'typing';
      let deadline = 0;
      let resultAt = 0;

      const setPhase = (p: typeof phase) => {
        phase = p;
        root!.dataset.phase = p;
      };

      const startRound = () => {
        const r = ROUNDS[round];
        hud.set('round', `${round + 1}/${ROUNDS.length}`);
        title.textContent = `ROUND ${round + 1}: ${r.name}`;
        rule.textContent = `RULE: ${r.rule}`;
        target.textContent = `SURVIVE ${r.targetLabel}`;
        meter.style.transform = 'scaleX(0)';
        field.value = '';
        field.disabled = false;
        setPhase('typing');
        deadline = performance.now() + ROUND_SECONDS * 1000;
        field.focus();
      };

      const reveal = (v: Verdict) => {
        const r = ROUNDS[round];
        score += v.points;
        hud.set('score', score.toLocaleString('en-US'));
        stamp.textContent = v.broken ? `RULE BROKEN: ${v.broken}` : v.survived ? 'SURVIVED!' : 'CRACKED!';
        stamp.className = `pw-stamp ${v.survived ? 'is-good' : 'is-bad'}`;
        time.textContent = v.broken === 'EMPTY' ? '' : `CRACKED IN ${v.crackTime}`;
        chips.replaceChildren(...v.chips.map((c) => el(`span.pw-chip.${c.good ? 'is-good' : 'is-bad'}`, {}, c.label)));
        warning.textContent = v.warning;
        points.textContent = `+${v.points.toLocaleString('en-US')}${v.survived ? ' (INCLUDES 500 BONUS)' : ''}`;
        meter.style.transform = `scaleX(${Math.min(1, v.guessesLog10 / r.target)})`;
        ctx.audio.sfx(v.survived ? 'score' : 'explode');
        setPhase('result');
        resultAt = performance.now();
        later(next, RESULT_MS);
      };

      const submit = () => {
        if (phase !== 'typing') return;
        const verdict = judge(field.value, ROUNDS[round]);
        const length = Math.max(8, field.value.length);
        field.value = ''; // never keep the password around longer than needed
        field.disabled = true;
        setPhase('cracking');
        ctx.audio.sfx('select');
        const started = performance.now();
        const spin = () => {
          const t = (performance.now() - started) / RIG_MS;
          if (t >= 1) return reveal(verdict);
          rig.textContent = Array.from({ length: 6 }, () => `TRYING  ${noise(length)}`).join('\n');
          later(spin, 50);
        };
        spin();
      };

      const next = () => {
        if (phase !== 'result') return;
        for (const t of timers) clearTimeout(t);
        timers.clear();
        round++;
        if (round >= ROUNDS.length) ctx.endRun(score);
        else startRound();
      };

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (phase !== 'typing') return;
        const left = Math.max(0, deadline - performance.now());
        hud.set('time', String(Math.ceil(left / 1000)));
        if (left === 0) submit();
      };

      ctx.input.onKey((e) => {
        if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
        if (phase === 'typing') submit();
        else if (phase === 'result' && performance.now() - resultAt >= RESULT_MIN_MS) next();
      });
      ctx.input.onKey((e) => {
        if (phase === 'typing' && e.target !== field && e.key.length === 1) field.focus();
        if (phase === 'typing' && e.target === field) ctx.audio.sfx('type');
      });
      root.addEventListener('pointerdown', () => phase === 'typing' && later(() => field.focus(), 0));

      hud.set('score', '0');
      startRound();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      root?.remove();
      root = null;
    },
  };
}
```

`src/games/password/password.css` (full file):

```css
.password {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 150px;
  gap: 18px;
}
.pw-round {
  font-family: var(--f-display);
  font-size: 64px;
  color: var(--c-cyan);
  text-shadow: 0 0 18px var(--c-cyan);
}
.pw-rule {
  font-family: var(--f-mono);
  font-size: 34px;
  color: var(--c-yellow);
}
.pw-target {
  font-family: var(--f-mono);
  font-size: 28px;
  letter-spacing: 0.15em;
  color: var(--c-ink-dim);
}
.pw-stage {
  width: 1300px;
  height: 400px;
  margin-top: 16px;
  position: relative;
}
.pw-entry,
.pw-rig,
.pw-result {
  position: absolute;
  inset: 0;
  display: none;
}
.password[data-phase='typing'] .pw-entry,
.password[data-phase='result'] .pw-result {
  display: flex;
}
.password[data-phase='cracking'] .pw-rig {
  display: block;
}
.pw-entry {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.pw-input {
  width: 100%;
  padding: 24px 32px;
  font-family: var(--f-mono);
  font-size: 52px;
  color: #fff;
  background: rgba(18, 0, 38, 0.92);
  border: 3px solid var(--c-pink);
  border-radius: 16px;
  box-shadow: 0 0 30px rgba(255, 46, 136, 0.5);
  outline: none;
  text-align: center;
}
.pw-hint {
  font-family: var(--f-display);
  font-size: 32px;
  color: var(--c-ink-dim);
  animation: pw-pulse 1.2s ease-in-out infinite;
}
@keyframes pw-pulse {
  50% { opacity: 0.4; }
}
.pw-rig {
  margin: 0;
  padding: 32px;
  font-family: var(--f-mono);
  font-size: 36px;
  line-height: 1.6;
  color: var(--c-ok);
  text-shadow: 0 0 10px var(--c-ok);
  background: rgba(0, 0, 0, 0.6);
  border-radius: 16px;
  overflow: hidden;
  white-space: pre;
}
.pw-result {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}
.pw-stamp {
  font-family: var(--f-display);
  font-size: 80px;
}
.pw-stamp.is-good { color: var(--c-ok); text-shadow: 0 0 24px var(--c-ok); }
.pw-stamp.is-bad { color: var(--c-danger); text-shadow: 0 0 24px var(--c-danger); }
.pw-time {
  font-family: var(--f-mono);
  font-size: 44px;
  font-weight: 700;
}
.pw-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 14px;
}
.pw-chip {
  padding: 8px 18px;
  border-radius: 999px;
  font-family: var(--f-mono);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.pw-chip.is-bad { background: rgba(255, 59, 92, 0.2); color: #ff9aac; border: 2px solid var(--c-danger); }
.pw-chip.is-good { background: rgba(61, 255, 154, 0.15); color: var(--c-ok); border: 2px solid var(--c-ok); }
.pw-warning {
  font-size: 30px;
  color: var(--c-yellow);
}
.pw-points {
  font-family: var(--f-display);
  font-size: 40px;
  color: var(--c-cyan);
}
.pw-meter {
  width: 1300px;
  height: 18px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.pw-meter-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-danger), var(--c-yellow), var(--c-ok));
  transform-origin: left;
  transition: transform 0.8s ease-out;
}
.pw-privacy {
  position: absolute;
  bottom: 40px;
  font-size: 26px;
  color: var(--c-ink-dim);
  opacity: 0.85;
}
```

- [ ] **Step 4: Wire it into the hub**

In `src/games/registry.ts`, add a `load` line to the `password` cabinet, after its `controls` line:

```ts
    load: () => import('./password/index').then((m) => m.createGame()),
```

In `src/main.ts`, add this line after the phish CSS import:

```ts
import './games/password/password.css';
```

- [ ] **Step 5: Run the e2e tests and the unit suite**

Run: `npx playwright test tests/e2e/games.spec.ts && npm test`
Expected: all PASS. The password test ends with a final score of `8,548`.

- [ ] **Step 6: Commit**

```bash
git add src/games/password/index.ts src/games/password/password.css src/games/registry.ts src/main.ts tests/e2e/games.spec.ts
git commit -m "feat(password): playable Password Smash with privacy notice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Malware Invaders — pure world simulation

Spec §5.1 lists the enemies (virus; worm, which splits into two when hit; trojan, which is disguised until it gets close), the power-ups (Patch for a spread shot, Antivirus for a shield, Backup for an extra life), and a ransomware boss every 5 waves. All of these rules live here without Phaser, so they can be unit-tested.

**Files:**
- Create: `src/games/invaders/logic.ts`
- Test: `tests/unit/invaders-logic.test.ts`

**Interfaces:**
- Consumes: `Rng` from Task 2 (the `World` constructor takes an optional `rng`, defaulting to `Math.random`).
- Produces:
  - constants `W`, `H`, `MARGIN`, `PLAYER_Y`, `FIRST_DELAY`, `INTERMISSION`, `FORMATION_TOP`, `LAND_Y`, `REVEAL_Y`, `MAX_LIVES`, `START_LIVES`, `PATCH_TIME`, `WAVE_BONUS`, `POINTS`, etc.
  - types `EnemyKind`, `PowerKind`, `Enemy`, `Shot`, `PowerUp`, `Controls` (`{left, right, fire}`), `GameEvent`, `WaveConfig`
  - `waveConfig(wave)`
  - `class World` with:
    - fields `player`, `enemies`, `shots`, `bombs`, `powerups`, `formation`, `score`, `wave`, `lives`, `over`, `fireTimer`
    - methods `step(dt, controls): GameEvent[]` and `spawnWave(n)`.

- [ ] **Step 1: Write the failing test**

`tests/unit/invaders-logic.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import {
  FIRST_DELAY,
  FORMATION_TOP,
  INTERMISSION,
  LAND_Y,
  MARGIN,
  MAX_LIVES,
  PATCH_TIME,
  PLAYER_Y,
  POINTS,
  REVEAL_Y,
  START_LIVES,
  W,
  WAVE_BONUS,
  waveConfig,
  World,
  type Controls,
  type GameEvent,
} from '../../src/games/invaders/logic';

const IDLE: Controls = { left: false, right: false, fire: false };
const DT = 1 / 60;

/** A world with wave 1 already spawned and enemy fire switched off, so tests control every bullet. */
function ready(seed = 1): World {
  const w = new World(mulberry32(seed));
  run(w, FIRST_DELAY + 0.05);
  w.fireTimer = Infinity;
  return w;
}

/** Runs `seconds` of simulation at 60 fps and returns every event (step clamps dt, so big steps don't skip time). */
function run(w: World, seconds: number, controls: Controls = IDLE): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = 0; t < seconds; t += DT) events.push(...w.step(DT, controls));
  return events;
}

const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('waveConfig', () => {
  it('starts small and adds worms, then trojans, as waves go up', () => {
    expect(waveConfig(1)).toMatchObject({ boss: false, cols: 6, rows: ['virus', 'virus', 'virus'] });
    expect(waveConfig(2).rows).toEqual(['worm', 'virus', 'virus']);
    expect(waveConfig(3).rows).toEqual(['trojan', 'worm', 'virus', 'virus']);
    expect(waveConfig(6).rows).toEqual(['trojan', 'worm', 'worm', 'virus', 'virus']);
    expect(waveConfig(14).cols).toBe(10);
    expect(waveConfig(4).speed).toBeGreaterThan(waveConfig(1).speed);
    expect(waveConfig(4).fireInterval).toBeLessThan(waveConfig(1).fireInterval);
  });

  it('every fifth wave is a ransomware boss that gets tougher', () => {
    expect(waveConfig(5)).toMatchObject({ boss: true, rows: [], cols: 0 });
    expect(waveConfig(10).boss).toBe(true);
    expect(waveConfig(10).bossHp).toBeGreaterThan(waveConfig(5).bossHp);
  });
});

describe('World', () => {
  it('spawns wave 1 after a short delay', () => {
    const w = new World(mulberry32(1));
    expect(run(w, FIRST_DELAY - 0.1)).toEqual([]);
    expect(w.step(1, IDLE)).toEqual([]); // one huge frame (a tab stall) only advances MAX_DT
    expect(run(w, 0.2)).toContainEqual({ type: 'waveStart', wave: 1, boss: false });
    expect(w.enemies).toHaveLength(18);
    expect(w.lives).toBe(START_LIVES);
  });

  it('moves the player and stops at the walls', () => {
    const w = ready();
    run(w, 3, { ...IDLE, right: true });
    expect(w.player.x).toBe(W - MARGIN);
    run(w, 3, { ...IDLE, left: true });
    expect(w.player.x).toBe(MARGIN);
  });

  it('fires one shot per cooldown while fire is held', () => {
    const w = ready();
    const shots = types(run(w, 1, { ...IDLE, fire: true })).filter((t) => t === 'shoot');
    expect(shots.length).toBeGreaterThanOrEqual(3);
    expect(shots.length).toBeLessThanOrEqual(4);
  });

  it('a Patch power-up makes every shot a three-way spread', () => {
    const w = ready();
    w.player.patch = PATCH_TIME;
    w.step(DT, { ...IDLE, fire: true });
    expect(w.shots).toHaveLength(3);
    expect(w.shots.map((s) => Math.sign(s.vx)).sort()).toEqual([-1, 0, 1]);
  });

  it('shooting a virus kills it and scores', () => {
    const w = ready();
    const target = w.enemies[0];
    w.shots.push({ id: 999, x: target.x, y: target.y, vx: 0, vy: 0 });
    const events = w.step(DT, IDLE);
    expect(events).toContainEqual(expect.objectContaining({ type: 'kill', kind: 'virus', points: POINTS.virus }));
    expect(w.score).toBe(POINTS.virus);
    expect(w.enemies).toHaveLength(17);
    expect(w.shots).toHaveLength(0);
  });

  it('a worm splits into two wormlets that dive at the player', () => {
    const w = new World(mulberry32(1));
    w.spawnWave(2);
    w.fireTimer = Infinity;
    const worm = w.enemies.find((e) => e.kind === 'worm')!;
    w.shots.push({ id: 999, x: worm.x, y: worm.y, vx: 0, vy: 0 });
    expect(types(w.step(DT, IDLE))).toContain('split');
    const wormlets = w.enemies.filter((e) => e.kind === 'wormlet');
    expect(wormlets).toHaveLength(2);
    expect(wormlets.every((e) => e.vy > 0)).toBe(true);
  });

  it('a wormlet that lands costs a life', () => {
    const w = ready();
    w.enemies.push({ id: 500, kind: 'wormlet', x: 400, y: LAND_Y - 1, hp: 1, maxHp: 1, disguised: false, col: -1, row: -1, vx: 0, vy: 200 });
    const events = w.step(DT, IDLE);
    expect(types(events)).toEqual(expect.arrayContaining(['landed', 'playerHit']));
    expect(w.lives).toBe(START_LIVES - 1);
    expect(w.enemies.some((e) => e.id === 500)).toBe(false);
  });

  it('trojans stay disguised until they get close', () => {
    const w = new World(mulberry32(1));
    w.spawnWave(3);
    w.fireTimer = Infinity;
    const trojans = () => w.enemies.filter((e) => e.kind === 'trojan');
    expect(trojans().every((e) => e.disguised)).toBe(true);
    w.formation.y = REVEAL_Y + 1;
    expect(types(w.step(DT, IDLE))).toContain('reveal');
    expect(trojans().every((e) => !e.disguised)).toBe(true);
  });

  it('the formation landing costs a life and pushes the swarm back up', () => {
    const w = ready();
    const rows = waveConfig(1).rows.length;
    w.formation.y = LAND_Y - (rows - 1) * 84 + 1;
    expect(types(w.step(DT, IDLE))).toContain('landed');
    expect(w.lives).toBe(START_LIVES - 1);
    expect(w.formation.y).toBe(FORMATION_TOP);
  });

  it('enemy bombs cost a life, then the player blinks safely for a moment', () => {
    const w = ready();
    const bomb = () => w.bombs.push({ id: 900 + w.bombs.length, x: w.player.x, y: PLAYER_Y, vx: 0, vy: 0 });
    bomb();
    expect(w.step(DT, IDLE)).toContainEqual(expect.objectContaining({ type: 'playerHit', shielded: false }));
    expect(w.lives).toBe(START_LIVES - 1);
    bomb();
    w.step(DT, IDLE);
    expect(w.lives).toBe(START_LIVES - 1);
    expect(w.bombs).toHaveLength(0);
  });

  it('an Antivirus shield absorbs one hit', () => {
    const w = ready();
    w.player.shield = true;
    w.bombs.push({ id: 900, x: w.player.x, y: PLAYER_Y, vx: 0, vy: 0 });
    expect(w.step(DT, IDLE)).toContainEqual(expect.objectContaining({ type: 'playerHit', shielded: true }));
    expect(w.lives).toBe(START_LIVES);
    expect(w.player.shield).toBe(false);
  });

  it('power-ups apply when caught, and Backup lives are capped', () => {
    const w = ready();
    const drop = (kind: 'patch' | 'antivirus' | 'backup') =>
      w.powerups.push({ id: 800 + w.powerups.length, kind, x: w.player.x, y: PLAYER_Y });
    drop('patch');
    drop('antivirus');
    expect(types(w.step(DT, IDLE)).filter((t) => t === 'powerup')).toHaveLength(2);
    expect(w.player.patch).toBeGreaterThan(0);
    expect(w.player.shield).toBe(true);
    for (let i = 0; i < 4; i++) {
      drop('backup');
      w.step(DT, IDLE);
    }
    expect(w.lives).toBe(MAX_LIVES);
  });

  it('clearing a wave pays a bonus and the next wave follows', () => {
    const w = ready();
    w.enemies = [];
    expect(w.step(DT, IDLE)).toContainEqual({ type: 'waveClear', wave: 1, bonus: WAVE_BONUS });
    expect(w.score).toBe(WAVE_BONUS);
    expect(types(run(w, INTERMISSION + 0.1))).toContain('waveStart');
    expect(w.wave).toBe(2);
  });

  it('wave 5 is the ransomware boss; it takes many hits and drops a Backup', () => {
    const w = new World(mulberry32(1));
    w.spawnWave(5);
    w.fireTimer = Infinity;
    expect(w.enemies).toHaveLength(1);
    const boss = w.enemies[0];
    expect(boss.kind).toBe('boss');
    let events: GameEvent[] = [];
    for (let i = 0; i < boss.maxHp; i++) {
      w.shots.push({ id: 700 + i, x: boss.x, y: boss.y, vx: 0, vy: 0 });
      events = w.step(DT, IDLE);
      if (i < boss.maxHp - 1) expect(types(events)).toContain('hit');
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'kill', kind: 'boss', points: POINTS.boss }));
    expect(w.powerups.map((p) => p.kind)).toEqual(['backup']);
  });

  it('the boss fires a five-way spread', () => {
    const w = new World(mulberry32(1));
    w.spawnWave(5);
    w.fireTimer = 0;
    w.step(DT, IDLE);
    expect(w.bombs).toHaveLength(5);
  });

  it('enemies fire on their own', () => {
    const w = new World(mulberry32(1));
    run(w, FIRST_DELAY + 0.05);
    w.player.invuln = Infinity; // keep the player alive; we only count bombs
    let seen = 0;
    for (let t = 0; t < 5; t += DT) {
      w.step(DT, IDLE);
      seen = Math.max(seen, w.bombs.length);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('losing the last life ends the game and freezes the world', () => {
    const w = ready();
    w.lives = 1;
    w.bombs.push({ id: 900, x: w.player.x, y: PLAYER_Y, vx: 0, vy: 0 });
    expect(types(w.step(DT, IDLE))).toContain('gameOver');
    expect(w.over).toBe(true);
    expect(w.lives).toBe(0);
    expect(w.step(DT, { ...IDLE, fire: true })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/invaders-logic.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/games/invaders/logic.ts` (full file):

```ts
import type { Rng } from '../../core/random';

// Pure simulation of Malware Invaders in stage pixels (1920×1080). No Phaser here:
// the scene only draws what this world contains, so every rule is unit-testable.

export const W = 1920;
export const H = 1080;
export const MARGIN = 70; // nothing moves closer than this to the side walls
export const PLAYER_Y = 990;
export const PLAYER_HW = 44; // player half-width / half-height for collisions
export const PLAYER_HH = 24;
export const PLAYER_SPEED = 900; // px/s
export const FIRE_COOLDOWN = 0.3; // s between player shots
export const SHOT_SPEED = 1300;
export const SPREAD_VX = 260; // sideways speed of the two outer Patch shots
export const START_LIVES = 3;
export const MAX_LIVES = 5;
export const INVULN_TIME = 2; // s of blinking after losing a life
export const PATCH_TIME = 10; // s of spread shot
export const POWER_FALL = 240; // px/s
export const DROP_CHANCE = 0.08; // per kill
export const FIRST_DELAY = 1; // s before wave 1
export const INTERMISSION = 2.2; // s between waves
export const FORMATION_TOP = 190;
export const SLOT_W = 120;
export const SLOT_H = 84;
export const DROP_STEP = 36; // formation moves down this much at each wall
export const REVEAL_Y = 560; // trojans drop their disguise below this line
export const LAND_Y = 900; // an enemy reaching this line has infected the system
export const WAVE_BONUS = 250; // × wave number
export const BOSS_EVERY = 5;
export const MAX_DT = 0.05;

export type EnemyKind = 'virus' | 'worm' | 'wormlet' | 'trojan' | 'boss';
export type PowerKind = 'patch' | 'antivirus' | 'backup';

export const POINTS: Record<EnemyKind, number> = { virus: 100, worm: 150, wormlet: 50, trojan: 250, boss: 3000 };
/** Collision half-sizes [half-width, half-height]. */
export const SIZE: Record<EnemyKind, readonly [number, number]> = {
  virus: [34, 28],
  worm: [38, 26],
  wormlet: [22, 18],
  trojan: [34, 30],
  boss: [150, 90],
};
const SHOT_HW = 5;
const SHOT_HH = 14;
const POWER_HALF = 26;

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Trojans look like a harmless file until they cross REVEAL_Y. */
  disguised: boolean;
  /** Formation slot. Free enemies (wormlets, boss) have col = row = -1 and move on their own. */
  col: number;
  row: number;
  vx: number;
  vy: number;
}

export interface Shot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface PowerUp {
  id: number;
  kind: PowerKind;
  x: number;
  y: number;
}

export interface Controls {
  left: boolean;
  right: boolean;
  fire: boolean;
}

export type GameEvent =
  | { type: 'waveStart'; wave: number; boss: boolean }
  | { type: 'waveClear'; wave: number; bonus: number }
  | { type: 'shoot' }
  | { type: 'hit'; x: number; y: number }
  | { type: 'kill'; kind: EnemyKind; x: number; y: number; points: number }
  | { type: 'split'; x: number; y: number }
  | { type: 'reveal'; x: number; y: number }
  | { type: 'playerHit'; x: number; y: number; shielded: boolean }
  | { type: 'landed'; x: number; y: number }
  | { type: 'powerup'; kind: PowerKind; x: number; y: number }
  | { type: 'gameOver' };

export interface WaveConfig {
  wave: number;
  boss: boolean;
  /** Enemy kind of each formation row, top row first. Empty on boss waves. */
  rows: EnemyKind[];
  cols: number;
  /** Formation sideways speed in px/s at full strength (it speeds up as enemies die). */
  speed: number;
  /** Average seconds between enemy shots. */
  fireInterval: number;
  bombSpeed: number;
  bossHp: number;
}

export function waveConfig(wave: number): WaveConfig {
  const boss = wave % BOSS_EVERY === 0;
  const rowCount = Math.min(5, 2 + Math.ceil(wave / 2));
  const rows: EnemyKind[] = [];
  if (!boss) {
    if (wave >= 3) rows.push('trojan');
    const worms = wave >= 6 ? 2 : wave >= 2 ? 1 : 0;
    for (let i = 0; i < worms; i++) rows.push('worm');
    while (rows.length < rowCount) rows.push('virus');
  }
  return {
    wave,
    boss,
    rows,
    cols: boss ? 0 : Math.min(10, 6 + Math.floor(wave / 2)),
    speed: 70 + 14 * wave,
    fireInterval: Math.max(0.3, 1.2 - 0.08 * wave),
    bombSpeed: Math.min(800, 480 + 25 * wave),
    bossHp: 40 + 25 * Math.floor((wave - 1) / BOSS_EVERY),
  };
}

const overlaps = (ax: number, ay: number, ahw: number, ahh: number, bx: number, by: number, bhw: number, bhh: number) =>
  Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;

export class World {
  wave = 0;
  score = 0;
  lives = START_LIVES;
  over = false;
  player = { x: W / 2, cooldown: 0, invuln: 0, patch: 0, shield: false };
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  bombs: Shot[] = [];
  powerups: PowerUp[] = [];
  /** Seconds until the next wave spawns; 0 while a wave is in progress. */
  intermission = FIRST_DELAY;
  fireTimer = 0;
  formation = { x: 0, y: FORMATION_TOP, dir: 1, total: 0 };
  cfg: WaveConfig = waveConfig(1);
  time = 0;
  private nextId = 1;
  private events: GameEvent[] = [];

  constructor(private rng: Rng = Math.random) {}

  /** Advances the world by dt seconds and returns what happened, for sounds and effects. */
  step(dt: number, controls: Controls): GameEvent[] {
    this.events = [];
    if (this.over) return this.events;
    dt = Math.min(Math.max(dt, 0), MAX_DT);
    this.time += dt;

    this.updatePlayer(dt, controls);
    this.moveShots(dt);
    this.movePowerups(dt);
    if (this.intermission > 0) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.spawnWave(this.wave + 1);
    } else {
      this.moveFormation(dt);
      this.moveFree(dt);
      this.enemyFire(dt);
      this.collide();
      if (!this.over && this.enemies.length === 0) this.clearWave();
    }
    this.moveBombs(dt);
    return this.events;
  }

  spawnWave(wave: number): void {
    this.wave = wave;
    this.cfg = waveConfig(wave);
    this.intermission = 0;
    this.enemies = [];
    this.bombs = [];
    this.formation = { x: 0, y: FORMATION_TOP, dir: 1, total: 0 };
    this.fireTimer = this.cfg.fireInterval * 1.5;
    if (this.cfg.boss) {
      this.enemies.push(this.makeEnemy('boss', W / 2, 230, -1, -1, this.cfg.bossHp));
    } else {
      this.cfg.rows.forEach((kind, row) => {
        for (let col = 0; col < this.cfg.cols; col++) this.enemies.push(this.makeEnemy(kind, 0, 0, col, row, 1));
      });
      this.formation.total = this.enemies.length;
      this.placeFormation();
    }
    this.events.push({ type: 'waveStart', wave, boss: this.cfg.boss });
  }

  private makeEnemy(kind: EnemyKind, x: number, y: number, col: number, row: number, hp: number): Enemy {
    return { id: this.nextId++, kind, x, y, hp, maxHp: hp, disguised: kind === 'trojan', col, row, vx: 0, vy: 0 };
  }

  private updatePlayer(dt: number, c: Controls): void {
    const p = this.player;
    const dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    p.x = Math.min(W - MARGIN, Math.max(MARGIN, p.x + dir * PLAYER_SPEED * dt));
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.patch = Math.max(0, p.patch - dt);
    if (c.fire && p.cooldown === 0) {
      p.cooldown = FIRE_COOLDOWN;
      const y = PLAYER_Y - 36;
      this.shots.push({ id: this.nextId++, x: p.x, y, vx: 0, vy: -SHOT_SPEED });
      if (p.patch > 0) {
        this.shots.push({ id: this.nextId++, x: p.x, y, vx: -SPREAD_VX, vy: -SHOT_SPEED });
        this.shots.push({ id: this.nextId++, x: p.x, y, vx: SPREAD_VX, vy: -SHOT_SPEED });
      }
      this.events.push({ type: 'shoot' });
    }
  }

  private moveShots(dt: number): void {
    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.shots = this.shots.filter((s) => s.y > -30 && s.x > -30 && s.x < W + 30);
  }

  private moveBombs(dt: number): void {
    const p = this.player;
    const kept: Shot[] = [];
    for (const b of this.bombs) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > H + 30 || b.x < -30 || b.x > W + 30) continue;
      if (!this.over && overlaps(b.x, b.y, SHOT_HW, SHOT_HH, p.x, PLAYER_Y, PLAYER_HW, PLAYER_HH)) {
        if (p.invuln === 0) this.hurt(p.x, PLAYER_Y);
        continue;
      }
      kept.push(b);
    }
    this.bombs = kept;
  }

  private movePowerups(dt: number): void {
    const p = this.player;
    const kept: PowerUp[] = [];
    for (const u of this.powerups) {
      u.y += POWER_FALL * dt;
      if (u.y > H + 40) continue;
      if (overlaps(u.x, u.y, POWER_HALF, POWER_HALF, p.x, PLAYER_Y, PLAYER_HW, PLAYER_HH)) {
        if (u.kind === 'patch') p.patch = PATCH_TIME;
        else if (u.kind === 'antivirus') p.shield = true;
        else this.lives = Math.min(MAX_LIVES, this.lives + 1);
        this.events.push({ type: 'powerup', kind: u.kind, x: u.x, y: u.y });
        continue;
      }
      kept.push(u);
    }
    this.powerups = kept;
  }

  private formationMembers(): Enemy[] {
    return this.enemies.filter((e) => e.col >= 0);
  }

  private placeFormation(): void {
    const left = (W - (this.cfg.cols - 1) * SLOT_W) / 2;
    for (const e of this.formationMembers()) {
      e.x = left + this.formation.x + e.col * SLOT_W;
      e.y = this.formation.y + e.row * SLOT_H;
    }
  }

  private moveFormation(dt: number): void {
    const members = this.formationMembers();
    if (members.length === 0) return;
    const f = this.formation;
    // Classic invaders rule: the fewer are left, the faster they march.
    const speed = this.cfg.speed * (1 + 1.2 * (1 - members.length / f.total));
    f.x += f.dir * speed * dt;
    this.placeFormation();
    const minX = Math.min(...members.map((e) => e.x));
    const maxX = Math.max(...members.map((e) => e.x));
    if ((f.dir > 0 && maxX > W - MARGIN) || (f.dir < 0 && minX < MARGIN)) {
      f.x -= f.dir * Math.max(0, f.dir > 0 ? maxX - (W - MARGIN) : MARGIN - minX);
      f.dir = -f.dir;
      f.y += DROP_STEP;
      this.placeFormation();
    }
    for (const e of members) {
      if (e.disguised && e.y >= REVEAL_Y) {
        e.disguised = false;
        this.events.push({ type: 'reveal', x: e.x, y: e.y });
      }
    }
    const lander = members.find((e) => e.y >= LAND_Y);
    if (lander) {
      this.events.push({ type: 'landed', x: lander.x, y: lander.y });
      this.hurt(lander.x, LAND_Y);
      f.y = FORMATION_TOP; // the infection costs a life; the swarm is pushed back to the top
      this.placeFormation();
    }
  }

  private moveFree(dt: number): void {
    for (const e of this.enemies) {
      if (e.kind === 'boss') {
        e.x = W / 2 + Math.sin(this.time * 0.8) * (W / 2 - 260);
        e.y = 230 + Math.sin(this.time * 1.7) * 30;
      } else if (e.col < 0) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if ((e.x < MARGIN && e.vx < 0) || (e.x > W - MARGIN && e.vx > 0)) e.vx = -e.vx;
      }
    }
    const landed = this.enemies.filter((e) => e.kind === 'wormlet' && e.y >= LAND_Y);
    if (landed.length === 0) return;
    this.enemies = this.enemies.filter((e) => !landed.includes(e));
    for (const e of landed) {
      this.events.push({ type: 'landed', x: e.x, y: e.y });
      if (!this.over) this.hurt(e.x, LAND_Y);
    }
  }

  private enemyFire(dt: number): void {
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;
    const cfg = this.cfg;
    const boss = this.enemies.find((e) => e.kind === 'boss');
    if (boss) {
      // Ransomware fires a five-way spread, faster once it is below half health.
      this.fireTimer = boss.hp * 2 < boss.maxHp ? 1.0 : 1.5;
      for (let i = -2; i <= 2; i++) {
        this.bombs.push({ id: this.nextId++, x: boss.x, y: boss.y + 70, vx: i * 150, vy: cfg.bombSpeed * 0.8 });
      }
      return;
    }
    this.fireTimer = cfg.fireInterval * (0.6 + 0.8 * this.rng());
    // Shooters: the lowest enemy in each column, plus every revealed trojan (twice as likely).
    const lowest = new Map<number, Enemy>();
    for (const e of this.formationMembers()) {
      const cur = lowest.get(e.col);
      if (!cur || e.row > cur.row) lowest.set(e.col, e);
    }
    const shooters = [...lowest.values()];
    for (const e of this.enemies) if (e.kind === 'trojan' && !e.disguised) shooters.push(e, e);
    if (shooters.length === 0) return;
    const s = shooters[Math.floor(this.rng() * shooters.length)];
    this.bombs.push({ id: this.nextId++, x: s.x, y: s.y + 24, vx: 0, vy: cfg.bombSpeed });
  }

  private collide(): void {
    const keptShots: Shot[] = [];
    for (const s of this.shots) {
      const e = this.enemies.find((en) => overlaps(s.x, s.y, SHOT_HW, SHOT_HH, en.x, en.y, SIZE[en.kind][0], SIZE[en.kind][1]));
      if (!e) {
        keptShots.push(s);
        continue;
      }
      e.hp -= 1;
      if (e.hp > 0) this.events.push({ type: 'hit', x: s.x, y: s.y });
      else this.kill(e);
    }
    this.shots = keptShots;
  }

  private kill(e: Enemy): void {
    this.enemies = this.enemies.filter((en) => en !== e);
    const points = POINTS[e.kind];
    this.score += points;
    this.events.push({ type: 'kill', kind: e.kind, x: e.x, y: e.y, points });
    if (e.kind === 'worm') {
      // A worm copies itself: two fast wormlets break off and dive at the player.
      const vy = 110 + 6 * this.wave;
      for (const side of [-1, 1]) {
        const w = this.makeEnemy('wormlet', e.x + side * 20, e.y, -1, -1, 1);
        w.vx = side * 240;
        w.vy = vy;
        this.enemies.push(w);
      }
      this.events.push({ type: 'split', x: e.x, y: e.y });
    }
    if (e.kind === 'boss') this.dropPowerup('backup', e.x, e.y);
    else if (this.rng() < DROP_CHANCE) this.dropPowerup(this.rollPowerup(), e.x, e.y);
  }

  private rollPowerup(): PowerKind {
    const r = this.rng();
    if (r < 0.45) return 'patch';
    if (r < 0.8 || this.lives >= MAX_LIVES) return 'antivirus';
    return 'backup';
  }

  private dropPowerup(kind: PowerKind, x: number, y: number): void {
    this.powerups.push({ id: this.nextId++, kind, x, y });
  }

  private hurt(x: number, y: number): void {
    const p = this.player;
    if (p.shield) {
      p.shield = false;
      p.invuln = 1;
      this.events.push({ type: 'playerHit', x, y, shielded: true });
      return;
    }
    this.lives -= 1;
    p.invuln = INVULN_TIME;
    p.patch = 0;
    this.events.push({ type: 'playerHit', x, y, shielded: false });
    if (this.lives <= 0) {
      this.lives = 0;
      this.over = true;
      this.events.push({ type: 'gameOver' });
    }
  }

  private clearWave(): void {
    const bonus = WAVE_BONUS * this.wave;
    this.score += bonus;
    this.bombs = [];
    this.intermission = INTERMISSION;
    this.events.push({ type: 'waveClear', wave: this.wave, bonus });
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/unit/invaders-logic.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/invaders/logic.ts tests/unit/invaders-logic.test.ts
git commit -m "feat(invaders): pure wave/enemy/power-up/boss simulation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Malware Invaders — Phaser rendering, wiring, e2e

Phaser rules that must not be lost:

- `game.destroy()` runs on Phaser's next frame and never frees the WebGL context. `destroyGame()` waits for `pendingDestroy` to clear, then calls `WEBGL_lose_context`. Chrome only allows about 16 live contexts, so skipping this would eventually break the kiosk.
- Calling `unmount()` before Phaser's READY event is handled inside the READY handler.
- Phaser overwrites `window.onblur`/`onfocus`, so `unmount()` restores them.

**Files:**
- Create: `src/games/invaders/textures.ts`, `src/games/invaders/scene.ts`, `src/games/invaders/index.ts`, `src/games/invaders/invaders.css`
- Modify:
  - `src/games/registry.ts` (invaders cabinet)
  - `src/main.ts` (CSS import)
  - `vite.config.ts`
  - `tests/unit/carousel.test.ts`
  - `tests/e2e/hub.spec.ts`
  - `tests/e2e/games.spec.ts` (append)

**Interfaces:**
- Consumes:
  - From Task 7: `World`, `W`, `H`, `PLAYER_Y`, `Controls`, `EnemyKind` and `GameEvent`.
  - From Task 2: `mulberry32` and `createHud`.
  - From `src/core/theme.ts`: `palette`, `fonts` and `hexToInt`.
  - From Task 4: `launch()` in the e2e file.
- Produces:
  - `createGame(): GameModule`.
  - DOM hooks: `.inv-canvas canvas`, `.inv-banner`, `.inv-boss`, `[data-hud="score"]`.

- [ ] **Step 1: Append the failing e2e test**

Append this to the end of `tests/e2e/games.spec.ts`:

```ts

test('invaders: Phaser boots, firing scores, Esc tears the canvas down', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'invaders');
  await expect(page.locator('.inv-canvas canvas')).toHaveCount(1);
  await expect(page.locator('.inv-banner')).toHaveText('WAVE 1');
  await page.keyboard.down('Space');
  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0', { timeout: 8000 });
  await page.keyboard.up('Space');
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-layer')).toBeHidden();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/games.spec.ts -g invaders`
Expected: FAIL. No title card appears for invaders.

- [ ] **Step 3: Implement textures and scene**

`src/games/invaders/textures.ts` (full file):

```ts
import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../../core/theme';
import { mulberry32 } from '../../core/random';

// Every sprite is drawn in code once, at scene start, and baked into a texture.
// Neon glow is faked with wide, faint strokes under a bright core line, so it costs nothing per frame.

const CYAN = hexToInt(palette.cyan);
const PINK = hexToInt(palette.pink);
const YELLOW = hexToInt(palette.yellow);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const GREY = hexToInt(palette.grey);
const WHITE = 0xffffff;
const DEEP = hexToInt(palette.deep);

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

const GLOW: [width: number, alpha: number][] = [
  [16, 0.06],
  [10, 0.12],
  [6, 0.25],
];

/** Draws a closed neon outline: soft glow passes, a dark fill, then a crisp core line. */
function neonPoly(g: G, pts: Pt[], color: number, fillAlpha = 0.35): void {
  for (const [w, a] of GLOW) {
    g.lineStyle(w, color, a);
    g.strokePoints(pts, true, true);
  }
  g.fillStyle(DEEP, 0.9);
  g.fillPoints(pts, true, true);
  g.fillStyle(color, fillAlpha);
  g.fillPoints(pts, true, true);
  g.lineStyle(3, color, 1);
  g.strokePoints(pts, true, true);
}

function neonCircle(g: G, x: number, y: number, r: number, color: number, fillAlpha = 0.35): void {
  for (const [w, a] of GLOW) {
    g.lineStyle(w, color, a);
    g.strokeCircle(x, y, r);
  }
  g.fillStyle(DEEP, 0.9);
  g.fillCircle(x, y, r);
  g.fillStyle(color, fillAlpha);
  g.fillCircle(x, y, r);
  g.lineStyle(3, color, 1);
  g.strokeCircle(x, y, r);
}

/** A star outline with `n` points: vertices alternate between radius r1 (tips) and r2 (dips). */
function star(cx: number, cy: number, n: number, r1: number, r2: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function eyes(g: G, cx: number, cy: number, gap: number, r: number): void {
  g.fillStyle(WHITE, 1);
  g.fillCircle(cx - gap, cy, r);
  g.fillCircle(cx + gap, cy, r);
}

/** Makes every texture the scene uses. Texture size = sprite size + room for the glow. */
export function makeTextures(scene: Phaser.Scene): void {
  // Player: a cyan delta-wing fighter.
  bake(scene, 'player', 120, 84, (g) => {
    neonPoly(g, [
      { x: 60, y: 10 }, { x: 74, y: 40 }, { x: 104, y: 60 }, { x: 104, y: 72 },
      { x: 70, y: 66 }, { x: 60, y: 74 }, { x: 50, y: 66 }, { x: 16, y: 72 },
      { x: 16, y: 60 }, { x: 46, y: 40 },
    ], CYAN);
    g.fillStyle(WHITE, 0.9);
    g.fillTriangle(60, 26, 66, 46, 54, 46);
  });

  // Virus: a pink spiky blob with eyes.
  bake(scene, 'virus', 96, 84, (g) => {
    neonPoly(g, star(48, 42, 9, 34, 24), PINK);
    eyes(g, 48, 40, 9, 5);
  });

  // Worm: a chain of green segments with a head.
  bake(scene, 'worm', 104, 76, (g) => {
    for (const [x, r] of [[22, 11], [40, 13], [60, 14]] as const) neonCircle(g, x, 38, r, OK, 0.3);
    neonCircle(g, 82, 38, 16, OK, 0.5);
    eyes(g, 82, 34, 6, 4);
  });

  // Wormlet: half a worm, after a split.
  bake(scene, 'wormlet', 68, 56, (g) => {
    neonCircle(g, 22, 28, 9, OK, 0.3);
    neonCircle(g, 42, 28, 12, OK, 0.5);
    eyes(g, 42, 25, 5, 3);
  });

  // Trojan, revealed: an angular red horse-head mask with yellow eyes.
  bake(scene, 'trojan', 96, 88, (g) => {
    neonPoly(g, [
      { x: 30, y: 12 }, { x: 40, y: 24 }, { x: 56, y: 24 }, { x: 66, y: 12 },
      { x: 80, y: 40 }, { x: 70, y: 76 }, { x: 48, y: 64 }, { x: 26, y: 76 }, { x: 16, y: 40 },
    ], DANGER, 0.4);
    g.fillStyle(YELLOW, 1);
    g.fillTriangle(30, 40, 44, 44, 32, 50);
    g.fillTriangle(66, 40, 52, 44, 64, 50);
  });

  // Trojan, disguised: an innocent-looking document icon.
  bake(scene, 'disguise', 96, 88, (g) => {
    neonPoly(g, [{ x: 26, y: 12 }, { x: 58, y: 12 }, { x: 72, y: 26 }, { x: 72, y: 76 }, { x: 26, y: 76 }], GREY, 0.15);
    g.lineStyle(3, GREY, 1);
    g.strokePoints([{ x: 58, y: 12 }, { x: 58, y: 26 }, { x: 72, y: 26 }], false);
    g.fillStyle(GREY, 0.8);
    for (const y of [38, 48, 58]) g.fillRect(34, y, 30, 4);
  });

  // Ransomware boss: a giant padlock.
  bake(scene, 'boss', 340, 230, (g) => {
    for (const [w, a] of GLOW) {
      g.lineStyle(w + 10, YELLOW, a);
      g.beginPath();
      g.arc(170, 92, 62, Math.PI, 0);
      g.strokePath();
    }
    g.lineStyle(16, YELLOW, 1);
    g.beginPath();
    g.arc(170, 92, 62, Math.PI, 0);
    g.strokePath();
    neonPoly(g, [{ x: 40, y: 88 }, { x: 300, y: 88 }, { x: 300, y: 210 }, { x: 40, y: 210 }], PINK, 0.45);
    g.fillStyle(YELLOW, 1);
    g.fillCircle(170, 136, 18);
    g.fillTriangle(162, 140, 178, 140, 170, 184);
  });

  // Player shot: a cyan bolt.
  bake(scene, 'shot', 22, 40, (g) => {
    g.fillStyle(CYAN, 0.25);
    g.fillRoundedRect(1, 1, 20, 38, 10);
    g.fillStyle(WHITE, 1);
    g.fillRoundedRect(7, 6, 8, 28, 4);
  });

  // Enemy bomb: a hot-pink diamond.
  bake(scene, 'bomb', 36, 36, (g) => {
    neonPoly(g, [{ x: 18, y: 4 }, { x: 30, y: 18 }, { x: 18, y: 32 }, { x: 6, y: 18 }], DANGER, 0.9);
  });

  // Power-ups: round badges with a glyph.
  bake(scene, 'patch', 76, 76, (g) => {
    neonCircle(g, 38, 38, 26, YELLOW, 0.25);
    g.lineStyle(5, YELLOW, 1);
    g.lineBetween(38, 52, 38, 24);
    g.lineBetween(38, 52, 26, 28);
    g.lineBetween(38, 52, 50, 28);
  });
  bake(scene, 'antivirus', 76, 76, (g) => {
    neonCircle(g, 38, 38, 26, OK, 0.25);
    g.fillStyle(OK, 1);
    g.fillPoints([{ x: 38, y: 20 }, { x: 52, y: 26 }, { x: 50, y: 44 }, { x: 38, y: 56 }, { x: 26, y: 44 }, { x: 24, y: 26 }], true);
  });
  bake(scene, 'backup', 76, 76, (g) => {
    neonCircle(g, 38, 38, 26, CYAN, 0.25);
    g.fillStyle(CYAN, 1);
    g.fillRect(34, 22, 8, 32);
    g.fillRect(22, 34, 32, 8);
  });

  // Shield bubble drawn around the player while Antivirus is active.
  bake(scene, 'shield', 150, 120, (g) => {
    for (const [w, a] of GLOW) {
      g.lineStyle(w, OK, a);
      g.strokeEllipse(75, 60, 130, 100);
    }
    g.fillStyle(OK, 0.08);
    g.fillEllipse(75, 60, 130, 100);
    g.lineStyle(3, OK, 0.9);
    g.strokeEllipse(75, 60, 130, 100);
  });

  // Soft white dot for particles (tinted per explosion).
  bake(scene, 'spark', 16, 16, (g) => {
    g.fillStyle(WHITE, 0.3);
    g.fillCircle(8, 8, 8);
    g.fillStyle(WHITE, 1);
    g.fillCircle(8, 8, 4);
  });

  // Starfield tile, scrolled in two parallax layers.
  bake(scene, 'stars', 512, 512, (g) => {
    const rng = mulberry32(7);
    for (let i = 0; i < 70; i++) {
      g.fillStyle(rng() < 0.2 ? CYAN : WHITE, 0.3 + rng() * 0.6);
      g.fillCircle(rng() * 512, rng() * 512, rng() < 0.85 ? 1.2 : 2.2);
    }
  });
}
```

`src/games/invaders/scene.ts` (full file):

```ts
import * as Phaser from 'phaser';
import { fonts, hexToInt, palette } from '../../core/theme';
import { H, PLAYER_Y, W, type Controls, type EnemyKind, type GameEvent, type World } from './logic';
import { makeTextures } from './textures';

export interface SceneHooks {
  /** Read every frame: which keys are held right now. */
  controls(): Controls;
  /** Called every frame with what happened, after the scene has drawn it. */
  onEvents(events: GameEvent[], world: World): void;
}

type Entity = { id: number; x: number; y: number };
type Pool = Map<number, Phaser.GameObjects.Image>;
type Burst = 'pink' | 'cyan' | 'yellow' | 'ok' | 'danger';

const BURST_COLOR: Record<Burst, string> = {
  pink: palette.pink,
  cyan: palette.cyan,
  yellow: palette.yellow,
  ok: palette.ok,
  danger: palette.danger,
};
const KILL_BURST: Record<EnemyKind, Burst> = { virus: 'pink', worm: 'ok', wormlet: 'ok', trojan: 'danger', boss: 'yellow' };

/**
 * Draws the World. All game rules live in logic.ts; this class only mirrors the
 * world's entities as images every frame and turns events into effects.
 */
export class InvadersScene extends Phaser.Scene {
  private readonly enemyPool: Pool = new Map();
  private readonly shotPool: Pool = new Map();
  private readonly bombPool: Pool = new Map();
  private readonly powerPool: Pool = new Map();
  private readonly seen = new Set<number>();
  private readonly bursts = new Map<Burst, Phaser.GameObjects.Particles.ParticleEmitter>();
  private starsNear!: Phaser.GameObjects.TileSprite;
  private starsFar!: Phaser.GameObjects.TileSprite;
  private player!: Phaser.GameObjects.Image;
  private shield!: Phaser.GameObjects.Image;

  constructor(
    private readonly world: World,
    private readonly hooks: SceneHooks,
  ) {
    super('invaders');
  }

  create(): void {
    makeTextures(this);
    this.starsFar = this.add.tileSprite(W / 2, H / 2, W, H, 'stars').setAlpha(0.45).setTileScale(0.6);
    this.starsNear = this.add.tileSprite(W / 2, H / 2, W, H, 'stars').setAlpha(0.8);
    this.player = this.add.image(this.world.player.x, PLAYER_Y, 'player').setDepth(5);
    this.shield = this.add.image(0, 0, 'shield').setDepth(6).setVisible(false);
    for (const [name, hex] of Object.entries(BURST_COLOR) as [Burst, string][]) {
      const emitter = this.add.particles(0, 0, 'spark', {
        speed: { min: 120, max: 560 },
        lifespan: { min: 300, max: 800 },
        scale: { start: 1.3, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: hexToInt(hex),
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      emitter.setDepth(8);
      this.bursts.set(name, emitter);
    }
  }

  update(time: number, delta: number): void {
    const events = this.world.step(delta / 1000, this.hooks.controls());
    this.draw(time / 1000, delta / 1000);
    for (const e of events) this.effect(e);
    this.hooks.onEvents(events, this.world);
  }

  private draw(t: number, dt: number): void {
    const w = this.world;
    this.starsFar.tilePositionY -= 40 * dt;
    this.starsNear.tilePositionY -= 110 * dt;

    // Blink while invulnerable after a hit; hide entirely once the game is over.
    this.player.setPosition(w.player.x, PLAYER_Y);
    this.player.setVisible(w.lives > 0 && (w.player.invuln === 0 || Math.floor(t * 12) % 2 === 0));
    this.shield.setVisible(w.player.shield && w.lives > 0);
    this.shield.setPosition(w.player.x, PLAYER_Y).setScale(1 + Math.sin(t * 6) * 0.04);

    this.sync(w.enemies, this.enemyPool, (e) => (e.kind === 'trojan' && e.disguised ? 'disguise' : e.kind), 3);
    for (const e of w.enemies) {
      const img = this.enemyPool.get(e.id)!;
      if (e.kind === 'boss') img.setAngle(Math.sin(t * 2) * 3);
      else img.setScale(1 + Math.sin(t * 7 + e.id) * 0.06);
    }
    this.sync(w.shots, this.shotPool, () => 'shot', 4);
    this.sync(w.bombs, this.bombPool, () => 'bomb', 4);
    this.sync(w.powerups, this.powerPool, (p) => p.kind, 4);
    for (const p of w.powerups) this.powerPool.get(p.id)!.setAngle(Math.sin(t * 4 + p.id) * 15);
  }

  /** Makes the pool hold exactly one image per entity, at its position, with the right texture. */
  private sync<T extends Entity>(items: T[], pool: Pool, texture: (item: T) => string, depth: number): void {
    this.seen.clear();
    for (const item of items) {
      this.seen.add(item.id);
      const key = texture(item);
      const img = pool.get(item.id);
      if (!img) {
        pool.set(item.id, this.add.image(item.x, item.y, key).setDepth(depth));
      } else {
        img.setPosition(item.x, item.y);
        if (img.texture.key !== key) img.setTexture(key);
      }
    }
    for (const [id, img] of pool) {
      if (!this.seen.has(id)) {
        img.destroy();
        pool.delete(id);
      }
    }
  }

  private effect(e: GameEvent): void {
    switch (e.type) {
      case 'hit':
        this.burst('yellow', 6, e.x, e.y);
        break;
      case 'kill':
        this.burst(KILL_BURST[e.kind], e.kind === 'boss' ? 120 : 22, e.x, e.y);
        this.float(`+${e.points.toLocaleString('en-US')}`, e.x, e.y, palette.yellow, e.kind === 'boss' ? 64 : 30);
        if (e.kind === 'boss') this.cameras.main.shake(600, 0.02);
        break;
      case 'split':
        this.burst('ok', 14, e.x, e.y);
        break;
      case 'reveal':
        this.burst('danger', 10, e.x, e.y);
        this.float('TROJAN!', e.x, e.y - 40, palette.danger, 28);
        break;
      case 'playerHit':
        if (e.shielded) {
          this.burst('ok', 30, e.x, e.y);
        } else {
          this.burst('cyan', 50, e.x, e.y);
          this.cameras.main.shake(300, 0.015);
        }
        break;
      case 'landed':
        this.burst('danger', 30, e.x, e.y);
        this.float('INFECTED!', e.x, e.y - 40, palette.danger, 36);
        this.cameras.main.flash(250, 255, 59, 92);
        break;
      case 'powerup':
        this.burst('cyan', 18, e.x, e.y);
        this.float(e.kind === 'patch' ? 'PATCH!' : e.kind === 'antivirus' ? 'ANTIVIRUS!' : 'BACKUP +1', e.x, e.y - 50, palette.cyan, 30);
        break;
      default:
        break;
    }
  }

  private burst(kind: Burst, count: number, x: number, y: number): void {
    this.bursts.get(kind)!.explode(count, x, y);
  }

  /** A short text that drifts up and fades: +100, TROJAN!, ... */
  private float(text: string, x: number, y: number, color: string, size: number): void {
    const label = this.add
      .text(x, y, text, { fontFamily: fonts.display, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 0, color, 12, false, true);
    this.tweens.add({
      targets: label,
      y: y - 70,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}
```

- [ ] **Step 4: Implement the module and its styles**

`src/games/invaders/index.ts` (full file):

```ts
import * as Phaser from 'phaser';
import type { SfxName } from '../../core/audio';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { H, W, World, type Controls, type GameEvent } from './logic';
import { InvadersScene } from './scene';

const END_DELAY_MS = 1500; // let the final explosion play before game over
const BANNER_MS = 1800;
const MAX_CONTEXT_WAIT_FRAMES = 60;

const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
  shoot: 'shoot',
  hit: 'hit',
  kill: 'explode',
  split: 'hit',
  reveal: 'back',
  landed: 'error',
  powerup: 'powerup',
  waveClear: 'score',
  waveStart: 'select',
  gameOver: 'explode',
};

/**
 * Destroys a Phaser game completely. Phaser's destroy() runs on the game's next frame and never
 * releases the WebGL context, and Chrome only allows ~16 live contexts, so a kiosk that starts
 * hundreds of runs a day must free each one by hand once Phaser has finished with it.
 */
function destroyGame(game: Phaser.Game): void {
  const gl = (game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer> | null)?.gl ?? null;
  game.destroy(true);
  if (!gl) return;
  // pendingDestroy is public in Phaser's source but missing from its typings.
  const pending = () => (game as unknown as { pendingDestroy: boolean }).pendingDestroy;
  let frames = 0;
  const release = () => {
    if (pending() && ++frames < MAX_CONTEXT_WAIT_FRAMES) {
      requestAnimationFrame(release);
      return;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  requestAnimationFrame(release);
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let game: Phaser.Game | null = null;
  let ready = false;
  let tornDown = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  // Phaser's VisibilityHandler overwrites these and never restores them.
  let savedBlur: typeof window.onblur = null;
  let savedFocus: typeof window.onfocus = null;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const world = new World();
      const hud = createHud([['score', 'SCORE'], ['wave', 'WAVE'], ['lives', 'LIVES']]);
      const banner = el('div.inv-banner');
      const bossFill = el('div.inv-boss-fill');
      const bossBar = el('div.inv-boss', {}, el('span.inv-boss-label', {}, 'RANSOMWARE'), el('div.inv-boss-track', {}, bossFill));
      const host = el('div.inv-canvas');
      root = el('div.invaders', {}, host, hud.el, bossBar, banner);
      container.append(root);

      const showBanner = (text: string, danger = false) => {
        banner.textContent = text;
        banner.className = danger ? 'inv-banner is-on is-danger' : 'inv-banner is-on';
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => banner.classList.remove('is-on'), BANNER_MS);
      };

      const controls = (): Controls => ({
        left: ctx.input.isDown('ArrowLeft') || ctx.input.isDown('KeyA'),
        right: ctx.input.isDown('ArrowRight') || ctx.input.isDown('KeyD'),
        fire: ctx.input.isDown('Space'),
      });

      const onEvents = (events: GameEvent[], w: World) => {
        for (const e of events) {
          const name = e.type === 'playerHit' ? (e.shielded ? 'hit' : 'error') : SFX[e.type];
          if (name) ctx.audio.sfx(name);
          if (e.type === 'waveStart') showBanner(e.boss ? `WAVE ${e.wave} · RANSOMWARE ATTACK` : `WAVE ${e.wave}`, e.boss);
          if (e.type === 'waveClear') showBanner(`WAVE CLEAR  +${e.bonus.toLocaleString('en-US')}`);
          if (e.type === 'gameOver') {
            showBanner('SYSTEM COMPROMISED', true);
            endTimer = setTimeout(() => ctx.endRun(w.score), END_DELAY_MS);
          }
        }
        hud.set('score', w.score.toLocaleString('en-US'));
        hud.set('wave', String(Math.max(1, w.wave)));
        hud.set('lives', '◆'.repeat(w.lives) || '—');
        const boss = w.enemies.find((e) => e.kind === 'boss');
        bossBar.classList.toggle('is-on', boss !== undefined);
        if (boss) bossFill.style.transform = `scaleX(${boss.hp / boss.maxHp})`;
      };

      savedBlur = window.onblur;
      savedFocus = window.onfocus;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        width: W,
        height: H,
        transparent: true,
        banner: false,
        autoFocus: false,
        scale: { mode: Phaser.Scale.NONE },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false }, // the shell owns input
        audio: { noAudio: true }, // sounds go through the shared ZzFX audio
        scene: new InvadersScene(world, { controls, onEvents }),
      });

      return new Promise<void>((resolve) => {
        game!.events.once(Phaser.Core.Events.READY, () => {
          ready = true;
          // unmount() arrived while Phaser was still booting: finish the teardown now.
          if (tornDown && game) {
            destroyGame(game);
            game = null;
          }
          resolve();
        });
      });
    },

    unmount() {
      tornDown = true;
      clearTimeout(endTimer);
      clearTimeout(bannerTimer);
      // Phaser can only be destroyed once it has booted; mount() finishes the job on READY otherwise.
      if (game && ready) {
        destroyGame(game);
        game = null;
      }
      window.onblur = savedBlur;
      window.onfocus = savedFocus;
      root?.remove();
      root = null;
    },
  };
}
```

`src/games/invaders/invaders.css` (full file):

```css
.invaders {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* Deep-space synthwave sky behind the transparent Phaser canvas. */
  background:
    radial-gradient(ellipse 70% 45% at 50% 108%, rgba(255, 46, 136, 0.35), transparent 70%),
    linear-gradient(180deg, #05000f 0%, var(--c-deep) 55%, var(--c-purple) 100%);
}
.invaders::after {
  /* Danger line: enemies that reach it infect the system (LAND_Y = 900). */
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 900px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--c-danger) 15%, var(--c-danger) 85%, transparent);
  box-shadow: 0 0 14px var(--c-danger);
  opacity: 0.45;
  pointer-events: none;
}
.inv-canvas {
  position: absolute;
  inset: 0;
}
.inv-canvas canvas {
  display: block;
}
.invaders .hud {
  z-index: 2;
}
.inv-banner {
  position: absolute;
  top: 440px;
  left: 0;
  right: 0;
  z-index: 2;
  text-align: center;
  font-family: var(--f-display);
  font-size: 84px;
  letter-spacing: 6px;
  color: var(--c-cyan);
  text-shadow: 0 0 18px var(--c-cyan), 0 0 42px var(--c-pink);
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: none;
}
.inv-banner.is-on {
  opacity: 1;
  transform: scale(1);
}
.inv-banner.is-danger {
  color: var(--c-danger);
  text-shadow: 0 0 18px var(--c-danger), 0 0 42px var(--c-yellow);
}
.inv-boss {
  position: absolute;
  top: 120px;
  left: 50%;
  z-index: 2;
  width: 900px;
  margin-left: -450px;
  display: flex;
  align-items: center;
  gap: 20px;
  font-family: var(--f-mono);
  font-weight: 700;
  font-size: 22px;
  letter-spacing: 3px;
  color: var(--c-yellow);
  opacity: 0;
  transition: opacity 0.3s;
}
.inv-boss.is-on {
  opacity: 1;
}
.inv-boss-track {
  flex: 1;
  height: 18px;
  border: 2px solid var(--c-yellow);
  border-radius: 9px;
  overflow: hidden;
  box-shadow: 0 0 12px var(--c-yellow);
}
.inv-boss-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-pink), var(--c-yellow));
  transform-origin: left;
  transition: transform 0.15s;
}
```

- [ ] **Step 5: Wire it in and allow the large lazy chunk**

In `src/games/registry.ts`, add a `load` line to the `invaders` cabinet, after its `controls` line:

```ts
    load: () => import('./invaders/index').then((m) => m.createGame()),
```

In `src/main.ts`, add this line after the password CSS import:

```ts
import './games/invaders/invaders.css';
```

`vite.config.ts`, apply this change:

```diff
@@ -3,7 +3,8 @@ import { defineConfig } from 'vitest/config';
 export default defineConfig(({ mode }) => ({
   // GitHub Pages serves the site from /cyberarcade/. The offline USB build (Plan 6) uses relative paths.
   base: mode === 'offline' ? './' : '/cyberarcade/',
-  build: { target: 'es2022' },
+  // Phaser is ~1.2 MB minified; it loads lazily, only when Malware Invaders starts.
+  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
   test: {
     environment: 'jsdom',
     include: ['tests/unit/**/*.test.ts'],
```

- [ ] **Step 6: Update the "coming soon" checks**

Invaders is no longer "coming soon", so the existing hub tests need to point at `runner` instead. `runner` is two cabinets to the right of the first one.

`tests/unit/carousel.test.ts`, apply this change:

```diff
@@ -55,7 +55,7 @@ describe('carousel', () => {
 
   it('marks unbuilt games COMING SOON and shows the Classic note', () => {
     const { c } = make();
-    expect(c.el.querySelector('[data-id="invaders"] .soon')).not.toBeNull();
+    expect(c.el.querySelector('[data-id="runner"] .soon')).not.toBeNull();
     expect(c.el.querySelector('[data-id="classic"] .cab-note')?.textContent).toContain('Alt+');
     c.el.remove();
   });
```

`tests/e2e/hub.spec.ts`, apply this change:

```diff
@@ -21,6 +21,9 @@ test('arrow keys rotate the carousel with wraparound', async ({ page }) => {
 
 test('a coming-soon cabinet shakes instead of launching', async ({ page }) => {
   await boot(page);
+  await page.keyboard.press('ArrowRight');
+  await page.keyboard.press('ArrowRight');
+  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'runner');
   await page.keyboard.press('Enter');
   await expect(page.locator('.cabinet.is-center')).toHaveClass(/shake/);
   await expect(page.locator('.title-card')).toHaveCount(0);
```

- [ ] **Step 7: Run everything touched**

Run: `npm test && npx tsc --noEmit && npx playwright test tests/e2e/games.spec.ts tests/e2e/hub.spec.ts`
Expected: all PASS. The invaders test shows exactly one canvas while playing and none after Esc.

- [ ] **Step 8: Commit**

```bash
git add src/games/invaders/textures.ts src/games/invaders/scene.ts src/games/invaders/index.ts src/games/invaders/invaders.css src/games/registry.ts src/main.ts vite.config.ts tests/unit/carousel.test.ts tests/e2e/hub.spec.ts tests/e2e/games.spec.ts
git commit -m "feat(invaders): playable Malware Invaders on Phaser with full WebGL teardown" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Leak loop and full verification

Spec §8: "A loop test cycles all games 20× to catch leaks." The first launch of each game makes Vite append `<link rel=modulepreload>` tags for that game's chunks. This happens once per game, by design, so the test warms up every game once before it takes its baseline.

**Files:**
- Modify: `tests/e2e/games.spec.ts` (append)

**Interfaces:**
- Consumes: `launch()`; `window.__arcadeDebug.handlerCount()`, which is exposed when the page boots with `?selftest` (from the foundation plan).
- Produces: nothing new.

- [ ] **Step 1: Append the leak test**

Append this to the end of `tests/e2e/games.spec.ts`:

```ts

test('20 launch/exit cycles across the three games leave nothing behind', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await boot(page, '?selftest');
  const games = ['phish', 'password', 'invaders'];
  const cycle = async (id: string) => {
    await launch(page, id);
    await expect(page.locator('.game-root')).toHaveCount(1);
    await page.waitForTimeout(400); // let the game get going before leaving
    await page.keyboard.press('Escape');
    await expect(page.locator('.game-layer')).toBeHidden();
  };

  // Warm-up: the first launch of each game makes Vite add <link rel=modulepreload> tags for its chunks (once, by design).
  for (const id of games) await cycle(id);
  const baseline = await page.evaluate(() => window.__arcadeDebug!.handlerCount());
  const baseNodes = await page.evaluate(() => document.getElementsByTagName('*').length);

  for (let i = 0; i < 20; i++) await cycle(games[i % games.length]);

  expect(await page.evaluate(() => window.__arcadeDebug!.handlerCount())).toBe(baseline);
  expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBe(baseNodes);
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/games.spec.ts -g "20 launch"`
Expected: PASS in about 1–2 minutes. If it fails, a game's `unmount()` is leaking a listener, a node or a canvas. Fix the game, not the test.

- [ ] **Step 3: Full verification**

Run each command and check the result:

```bash
npm test            # 18 files, 131 tests pass
npx tsc --noEmit    # no errors
npm run build       # succeeds; invaders chunk ~1.2 MB and password chunk ~820 KB, both lazy; no chunk-size warning
npm run e2e         # 12 tests pass
```

- [ ] **Step 4: Manual look**

Run `npm run dev`, play each game for about 30 seconds and check:
- Phish shows the card and timer, and highlights the clue on a mistake.
- Password shows the privacy notice and clears the input after each round.
- Invaders shows the neon sprites, the WAVE banner and particles.
- The HUD never overlaps the mute icon.
- Esc always returns to the hub.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/games.spec.ts
git commit -m "test(e2e): 20-cycle leak loop across the three games" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
