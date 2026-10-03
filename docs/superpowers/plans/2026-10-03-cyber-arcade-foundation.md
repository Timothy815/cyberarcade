# Cyber Arcade Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployed, polished Cyber Arcade hub (splash, synthwave carousel of 8 cabinets, attract mode, shared title/game-over/initials/leaderboard flow, crash-guarded game shell, Classic '25 link) to GitHub Pages, ready for game plans 2–5 to drop games in.

**Architecture:** Vite + TypeScript, no UI framework. Everything renders on a fixed 1920×1080 `.stage` scaled by a CSS transform. `main.ts` boots a hub layer and a game layer; the shell runs the per-game flow in the game layer and talks to games only through the `GameModule` / `GameContext` contract. The registry holds all cabinet metadata plus a lazy `load()` per game, so the hub never loads game code and each game (and later Phaser) is its own chunk.

**Tech Stack:** Vite 8, TypeScript 5.9, Vitest 5 (jsdom), Playwright 1.63 (Chromium), ZzFX 1.4.0, @fontsource (Audiowide, Space Grotesk, JetBrains Mono), GitHub Actions + GitHub Pages. Phaser 3.90.0 arrives in Plan 2, lazy-loaded.

**Spec:** `docs/superpowers/specs/2026-10-03-cyber-arcade-design.md`

## Global Constraints

- Event: Sophomore Day, 2026-10-08. Each plan ends with a working, deployable build; later games are cut if time runs out.
- Target: Windows 11 lab PCs (~3 years old), Chrome/Edge, keyboard + mouse, one player per station. 60 fps target. No mobile/touch, no gamepad.
- Hosting: GitHub Pages at `https://timothy815.github.io/cyberarcade/` from `git@github.com:Timothy815/cyberarcade.git`; Vite `base: '/cyberarcade/'` (`'./'` in `offline` mode, Plan 6). The USB offline build is a backup only.
- Pinned versions: `zzfx` 1.4.0, `@fontsource/*` 5.3.0, `@playwright/test` 1.63.0, `jsdom` 29.1.1, `typescript` ~5.9.3, `vite` ^8.3.2, `vitest` ^5.0.3. Node 22 in CI.
- Palette (from `theme.ts`, mirrored as `--c-*`): cyan `#00f0ff`, pink `#ff2e88`, yellow `#ffe259`, deep `#0e0020`, purple `#2a0750`, ink `#fff`, inkDim `#ffd1f0`, grey `#b9b9d0`, danger `#ff3b5c`, ok `#3dff9a`. Fonts: Audiowide (display, `--f-display`), Space Grotesk (UI, `--f-ui`), JetBrains Mono (data/HUD, `--f-mono`). Self-hosted; no Google Fonts requests.
- Stage: fixed 1920×1080, scaled to fit; background is full-bleed outside the stage.
- Graphics are drawn in code (SVG/CSS/canvas). No sprite sheets. Animate only `transform` and `opacity`; no `backdrop-filter`.
- Keys: ← → select, Enter play, Esc back to hub, M mute (ignored while typing), hidden **Ctrl+Alt+X** in the hub clears all boards after an on-screen confirm.
- Idle: 60 s in a game → hub; 30 s in the hub → attract mode.
- Storage keys: `cyberarcade.scores.v1` (top 10 per game) and `cyberarcade.muted`. All storage access goes through `safeLocalStorage()` and never throws.
- No cipher games (the Cipher Museum covers those). No network leaderboards or accounts.
- Classic '25 cabinet opens `https://timothy815.github.io/Mini-Arcade/` in the same tab; its note says "Press Alt+← to return".
- Every game's `unmount()` must release all listeners, timers, canvases and audio nodes; the Playwright 20-cycle test enforces this.

## File Structure

| File | Responsibility |
|---|---|
| `src/core/theme.ts` | Palette, fonts, timings; writes CSS variables |
| `src/core/stage.ts` | 1920×1080 stage element and fit scaling |
| `src/core/storage.ts` | localStorage wrapper that never throws |
| `src/core/scores.ts` | Per-game top 10, initials sanitizing, blocklist |
| `src/core/idle.ts` | Inactivity timer |
| `src/core/input.ts` | Root key/pointer routing and disposable scoped inputs |
| `src/core/audio.ts`, `music.ts` | ZzFX sfx, procedural synthwave loop, mute |
| `src/core/types.ts` | `GameModule`, `GameContext`, cabinet types |
| `src/core/ui/*` | DOM helper, icons, shared screens, initials reducer, mute button |
| `src/core/shell.ts` | Game launch flow, crash guard, idle exit |
| `src/games/registry.ts` | Cabinet list (hub order) and `?selftest` cabinet |
| `src/games/selftest/` | Minimal game for tests |
| `src/hub/*` | Carousel, background, hub controller, start splash, hub CSS |
| `src/styles/*` | Base styles and shared screen styles |
| `src/main.ts` | Boot entry |
| `tests/unit/*`, `tests/e2e/*` | Vitest unit tests, Playwright smoke tests |
| `.github/workflows/deploy.yml` | Test, build, publish to Pages |

Run every command from the repository root. The spec already exists on `main` (commit `5cf4f81`) and the `origin` remote is set.

---

### Task 1: Project scaffold and theme tokens

Sets up Vite + TypeScript + Vitest and the single source of truth for colors, fonts and timings. Every later visual file reads from `theme.ts` (TS side) or the `--c-*` / `--f-*` CSS variables that `applyTheme()` writes (CSS side).

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `public/favicon.svg`
- Create: `src/core/theme.ts`
- Test: `tests/unit/theme.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `src/core/theme.ts`:

    ```ts
    export const palette = …
    export const fonts = …
    export const timing = …
    export function cssVars(): Record<string, string>;
    export function applyTheme(root: HTMLElement = document.documentElement): void;
    export function hexToInt(hex: string): number;
    ```


- [ ] **Step 1: Create the project files**

Create the project files. `index.html` points at `src/main.ts`, which is created in Task 12; nothing builds the page until then, but tests run from this task on.

`package.json`:

```json
{
  "name": "cyberarcade",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "typecheck": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@fontsource/audiowide": "5.3.0",
    "@fontsource/jetbrains-mono": "5.3.0",
    "@fontsource/space-grotesk": "5.3.0",
    "zzfx": "1.4.0"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "jsdom": "29.1.1",
    "typescript": "~5.9.3",
    "vite": "^8.3.2",
    "vitest": "^5.0.3"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  // GitHub Pages serves the site from /cyberarcade/. The offline USB build (Plan 6) uses relative paths.
  base: mode === 'offline' ? './' : '/cyberarcade/',
  build: { target: 'es2022' },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
}));
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Cyber Arcade</title>
    <link rel="icon" type="image/svg+xml" href="favicon.svg" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`.gitignore`:

```gitignore
.superpowers/
node_modules/
dist/
dist-offline/
test-results/
playwright-report/
.DS_Store
```

`public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0e0020"/><path d="M32 8l20 7v14c0 13-9 22-20 27C21 51 12 42 12 29V15z" fill="none" stroke="#00f0ff" stroke-width="4"/><circle cx="32" cy="30" r="7" fill="#ff2e88"/></svg>
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs with no errors and writes `package-lock.json`. Commit the lockfile; CI uses `npm ci`.

- [ ] **Step 3: Write the failing test**

`tests/unit/theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyTheme, cssVars, hexToInt, palette } from '../../src/core/theme';

describe('theme', () => {
  it('exposes palette and fonts as kebab-case CSS variables', () => {
    const vars = cssVars();
    expect(vars['--c-cyan']).toBe('#00f0ff');
    expect(vars['--c-ink-dim']).toBe(palette.inkDim);
    expect(vars['--f-display']).toContain('Audiowide');
    expect(vars['--f-mono']).toContain('JetBrains Mono');
  });

  it('applies variables to an element', () => {
    const el = document.createElement('div');
    applyTheme(el);
    expect(el.style.getPropertyValue('--c-pink')).toBe('#ff2e88');
  });

  it('converts hex colors to Phaser integers', () => {
    expect(hexToInt('#00f0ff')).toBe(0x00f0ff);
    expect(hexToInt('ff2e88')).toBe(0xff2e88);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/theme.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 5: Write the implementation**

`src/core/theme.ts`:

```ts
// Single source of truth for colors, fonts and timings.
// HTML/CSS reads these through CSS custom properties (applyTheme); Phaser games use hexToInt().

export const palette = {
  cyan: '#00f0ff',
  pink: '#ff2e88',
  yellow: '#ffe259',
  deep: '#0e0020',
  purple: '#2a0750',
  ink: '#ffffff',
  inkDim: '#ffd1f0',
  grey: '#b9b9d0',
  danger: '#ff3b5c',
  ok: '#3dff9a',
} as const;

export const fonts = {
  display: "'Audiowide', sans-serif",
  ui: "'Space Grotesk', sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const;

export const timing = {
  hubIdleMs: 30_000, // hub → attract mode
  gameIdleMs: 60_000, // game → hub
  attractStepMs: 4_000,
  titleIdleMs: 30_000,
  gameOverMinMs: 1_000,
  gameOverAutoMs: 5_000,
  initialsIdleMs: 30_000,
  leaderboardMs: 15_000,
  errorScreenMs: 2_500,
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function cssVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(palette)) vars[`--c-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(fonts)) vars[`--f-${kebab(k)}`] = v;
  return vars;
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(cssVars())) root.style.setProperty(k, v);
}

export function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `npx vitest run tests/unit/theme.test.ts && npm run typecheck`
Expected: all tests in `theme.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html .gitignore public/favicon.svg package-lock.json src/core/theme.ts tests/unit/theme.test.ts
git commit -m "chore: scaffold Vite + TS project and add theme tokens"
```

---

### Task 2: Stage scaling

The hub and every game draw on a fixed 1920×1080 `.stage` element scaled with a CSS transform, so layout math never depends on the lab monitor size (1366×768 or 1920×1080).

**Files:**
- Create: `src/core/stage.ts`
- Test: `tests/unit/stage.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `src/core/stage.ts`:

    ```ts
    export const STAGE_W = 1920;
    export const STAGE_H = 1080;
    export function fitScale(width: number, height: number): number;
    export interface Stage {
      el: HTMLElement;
      fit(): void;
      dispose(): void;
    }
    export function createStage(parent: HTMLElement, className = ''): Stage;
    ```

- [ ] **Step 1: Write the failing test**

`tests/unit/stage.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createStage, fitScale } from '../../src/core/stage';

describe('fitScale', () => {
  it('is 1 at the design resolution', () => {
    expect(fitScale(1920, 1080)).toBe(1);
  });
  it('scales down to 1366x768', () => {
    expect(fitScale(1366, 768)).toBeCloseTo(0.7111, 3);
  });
  it('letterboxes by the tighter dimension', () => {
    expect(fitScale(1920, 1200)).toBe(1);
    expect(fitScale(2560, 1080)).toBe(1);
  });
  it('falls back to 1 for a zero-size parent', () => {
    expect(fitScale(0, 0)).toBe(1);
  });
});

describe('createStage', () => {
  it('appends a stage element and removes it on dispose', () => {
    const parent = document.createElement('div');
    const stage = createStage(parent, 'extra');
    expect(parent.querySelector('.stage.extra')).toBe(stage.el);
    expect(stage.el.style.getPropertyValue('--stage-scale')).not.toBe('');
    stage.dispose();
    expect(parent.children.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/stage.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/core/stage.ts`:

```ts
// A fixed 1920×1080 design surface, scaled to fit its parent (letterboxed).
// Every HTML screen is laid out in stage pixels, so 1366×768 looks identical to 1920×1080.

export const STAGE_W = 1920;
export const STAGE_H = 1080;

export function fitScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1;
  return Math.min(width / STAGE_W, height / STAGE_H);
}

export interface Stage {
  el: HTMLElement;
  fit(): void;
  dispose(): void;
}

export function createStage(parent: HTMLElement, className = ''): Stage {
  const el = document.createElement('div');
  el.className = `stage ${className}`.trim();
  parent.append(el);
  const fit = () => {
    const w = parent.clientWidth || window.innerWidth;
    const h = parent.clientHeight || window.innerHeight;
    el.style.setProperty('--stage-scale', String(fitScale(w, h)));
  };
  fit();
  window.addEventListener('resize', fit);
  return {
    el,
    fit,
    dispose() {
      window.removeEventListener('resize', fit);
      el.remove();
    },
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/stage.test.ts && npm run typecheck`
Expected: all tests in `stage.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/stage.ts tests/unit/stage.test.ts
git commit -m "feat: add 1920x1080 stage with fit scaling"
```

---

### Task 3: Safe storage and per-station scores

localStorage access that never throws, plus the top-10 boards with initials sanitizing and a word blocklist. If storage is unavailable, games still run and scores are simply not kept.

**Files:**
- Create: `src/core/storage.ts`
- Create: `src/core/scores.ts`
- Test: `tests/unit/scores.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `src/core/storage.ts`:

    ```ts
    export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
    export function safeLocalStorage(): KeyValueStore | null;
    ```

  - `src/core/scores.ts`:

    ```ts
    export interface ScoreEntry {
      initials: string;
      score: number;
      date: string; // ISO timestamp
    }
    export interface Scores {
      top(gameId: string): ScoreEntry[];
      qualifies(gameId: string, score: number): boolean;
      /** Inserts the score; returns its 0-based rank, or -1 if it did not make the board. */
      add(gameId: string, initials: string, score: number, date?: Date): number;
      clearAll(): void;
    }
    export const SCORES_KEY = 'cyberarcade.scores.v1';
    export const MAX_ENTRIES = 10;
    export const BLOCKLIST: ReadonlySet<string> = …
    export function sanitizeInitials(raw: string): string;
    export function formatScore(n: number): string;
    export function createScores(store: KeyValueStore | null = safeLocalStorage()): Scores;
    ```

- [ ] **Step 1: Write the failing test**

`tests/unit/scores.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createScores, formatScore, sanitizeInitials, SCORES_KEY, type Scores } from '../../src/core/scores';
import type { KeyValueStore } from '../../src/core/storage';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); },
};

describe('sanitizeInitials', () => {
  it('uppercases and keeps three letters', () => {
    expect(sanitizeInitials('zak')).toBe('ZAK');
  });
  it('rejects blocklisted and malformed initials', () => {
    expect(sanitizeInitials('ass')).toBe('???');
    expect(sanitizeInitials('A1')).toBe('???');
    expect(sanitizeInitials('')).toBe('???');
  });
});

describe('formatScore', () => {
  it('adds thousands separators', () => {
    expect(formatScore(48200)).toBe('48,200');
    expect(formatScore(-5)).toBe('0');
  });
});

describe('scores', () => {
  let store: ReturnType<typeof memoryStore>;
  let scores: Scores;
  beforeEach(() => {
    store = memoryStore();
    scores = createScores(store);
  });

  it('starts empty', () => {
    expect(scores.top('invaders')).toEqual([]);
  });

  it('inserts in descending order and returns the rank', () => {
    expect(scores.add('invaders', 'AAA', 100)).toBe(0);
    expect(scores.add('invaders', 'BBB', 300)).toBe(0);
    expect(scores.add('invaders', 'CCC', 200)).toBe(1);
    expect(scores.top('invaders').map((e) => e.score)).toEqual([300, 200, 100]);
  });

  it('ranks ties below the existing score', () => {
    scores.add('phish', 'AAA', 100);
    expect(scores.add('phish', 'BBB', 100)).toBe(1);
  });

  it('keeps only the top 10', () => {
    for (let i = 1; i <= 12; i++) scores.add('port', 'AAA', i * 10);
    const list = scores.top('port');
    expect(list).toHaveLength(10);
    expect(list[9].score).toBe(30);
    expect(scores.add('port', 'LOW', 5)).toBe(-1);
  });

  it('reports whether a score qualifies', () => {
    expect(scores.qualifies('port', 0)).toBe(false);
    expect(scores.qualifies('port', 1)).toBe(true);
    for (let i = 1; i <= 10; i++) scores.add('port', 'AAA', i * 10);
    expect(scores.qualifies('port', 10)).toBe(false);
    expect(scores.qualifies('port', 11)).toBe(true);
  });

  it('sanitizes initials on insert', () => {
    scores.add('invaders', 'ass', 50);
    expect(scores.top('invaders')[0].initials).toBe('???');
  });

  it('persists under one namespaced key and keeps games separate', () => {
    scores.add('invaders', 'AAA', 10);
    scores.add('phish', 'BBB', 20);
    expect([...store.data.keys()]).toEqual([SCORES_KEY]);
    const reloaded = createScores(store);
    expect(reloaded.top('invaders')[0].initials).toBe('AAA');
    expect(reloaded.top('phish')[0].initials).toBe('BBB');
  });

  it('clears all boards', () => {
    scores.add('invaders', 'AAA', 10);
    scores.clearAll();
    expect(scores.top('invaders')).toEqual([]);
  });

  it('survives corrupt JSON', () => {
    store.data.set(SCORES_KEY, '{not json');
    expect(createScores(store).top('invaders')).toEqual([]);
  });

  it('keeps working in memory when storage throws', () => {
    const s = createScores(throwingStore);
    expect(s.add('invaders', 'AAA', 10)).toBe(0);
    expect(s.top('invaders')[0].score).toBe(10);
    expect(() => s.clearAll()).not.toThrow();
  });

  it('keeps working in memory when there is no storage at all', () => {
    const s = createScores(null);
    s.add('invaders', 'AAA', 10);
    expect(s.top('invaders')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/scores.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/core/storage.ts`:

```ts
// localStorage can throw (private mode, disabled storage, quota). Callers get null instead.
export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function safeLocalStorage(): KeyValueStore | null {
  try {
    const ls = window.localStorage;
    const probe = '__cyberarcade_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
```

`src/core/scores.ts`:

```ts
import { safeLocalStorage, type KeyValueStore } from './storage';

export interface ScoreEntry {
  initials: string;
  score: number;
  date: string; // ISO timestamp
}

export interface Scores {
  top(gameId: string): ScoreEntry[];
  qualifies(gameId: string, score: number): boolean;
  /** Inserts the score; returns its 0-based rank, or -1 if it did not make the board. */
  add(gameId: string, initials: string, score: number, date?: Date): number;
  clearAll(): void;
}

export const SCORES_KEY = 'cyberarcade.scores.v1';
export const MAX_ENTRIES = 10;

// Three-letter combos that are rejected as initials. Kept short on purpose.
export const BLOCKLIST: ReadonlySet<string> = new Set([
  'ASS', 'CUM', 'COK', 'DIC', 'DIK', 'FAG', 'FCK', 'FKU', 'FUC', 'FUK', 'FUQ', 'HOE', 'JIZ',
  'KKK', 'KYS', 'NAZ', 'NGR', 'NIG', 'PNS', 'PUS', 'SEX', 'SHT', 'STD', 'TIT', 'VAG', 'WTF',
]);

export function sanitizeInitials(raw: string): string {
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (letters.length !== 3 || BLOCKLIST.has(letters)) return '???';
  return letters;
}

export function formatScore(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString('en-US');
}

type Boards = Record<string, ScoreEntry[]>;

export function createScores(store: KeyValueStore | null = safeLocalStorage()): Scores {
  let memory: Boards = {}; // used when storage is unavailable or broken

  const read = (): Boards => {
    if (!store) return memory;
    try {
      const parsed: unknown = JSON.parse(store.getItem(SCORES_KEY) ?? '{}');
      return parsed && typeof parsed === 'object' ? (parsed as Boards) : {};
    } catch {
      return memory;
    }
  };

  const write = (boards: Boards) => {
    memory = boards;
    if (!store) return;
    try {
      store.setItem(SCORES_KEY, JSON.stringify(boards));
    } catch {
      // Storage full or blocked: keep the in-memory copy, never crash the game.
    }
  };

  const top = (gameId: string): ScoreEntry[] => {
    const list = read()[gameId];
    return Array.isArray(list) ? list.slice(0, MAX_ENTRIES) : [];
  };

  return {
    top,
    qualifies(gameId, score) {
      if (!(score > 0)) return false;
      const list = top(gameId);
      return list.length < MAX_ENTRIES || score > list[list.length - 1].score;
    },
    add(gameId, initials, score, date = new Date()) {
      if (!(score > 0)) return -1;
      const boards = read();
      const list = top(gameId);
      // Ties rank below existing equal scores: first to reach a score keeps the spot.
      let rank = list.findIndex((e) => score > e.score);
      if (rank === -1) rank = list.length;
      if (rank >= MAX_ENTRIES) return -1;
      list.splice(rank, 0, { initials: sanitizeInitials(initials), score: Math.floor(score), date: date.toISOString() });
      boards[gameId] = list.slice(0, MAX_ENTRIES);
      write(boards);
      return rank;
    },
    clearAll() {
      memory = {};
      if (!store) return;
      try {
        store.removeItem(SCORES_KEY);
      } catch {
        // ignore
      }
    },
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/scores.test.ts && npm run typecheck`
Expected: all tests in `scores.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage.ts src/core/scores.ts tests/unit/scores.test.ts
git commit -m "feat: add safe storage and per-game top-10 scores"
```

---

### Task 4: Idle timer and input routing

`createIdleTimer` drives "idle 60 s in a game → hub" and "idle 30 s in hub → attract". `createInput` is the one window-level listener hub; games get a `ScopedInput` whose `dispose()` removes everything they registered, which is how the shell guarantees no leaked listeners.

**Files:**
- Create: `src/core/idle.ts`
- Create: `src/core/input.ts`
- Test: `tests/unit/idle.test.ts`
- Test: `tests/unit/input.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `src/core/idle.ts`:

    ```ts
    export interface IdleTimer {
      readonly running: boolean;
      /** Starts (or restarts) the countdown. */
      start(): void;
      /** Restarts the countdown if it is running; does nothing otherwise. */
      reset(): void;
      stop(): void;
    }
    export function createIdleTimer(timeoutMs: number, onIdle: () => void): IdleTimer;
    ```

  - `src/core/input.ts`:

    ```ts
    export type KeyHandler = (e: KeyboardEvent) => void;
    export type AnyHandler = (e: Event) => void;
    export interface Input {
      /** keydown handler. Returns an unsubscribe function. Menus should read e.key. */
      onKey(handler: KeyHandler): () => void;
      onKeyUp(handler: KeyHandler): () => void;
      /** Any keydown, pointerdown, pointermove or wheel. Used for idle timers and attract mode. */
      onAny(handler: AnyHandler): () => void;
      /** Held-key state by e.code ('ArrowLeft', 'Space', 'KeyA'). Used by action games. */
      isDown(code: string): boolean;
      /** Number of live handlers. Used by leak tests. */
      handlerCount(): number;
    }
    export interface RootInput extends Input {
      destroy(): void;
    }
    export interface ScopedInput extends Input {
      /** Removes every handler registered through this scope. */
      dispose(): void;
    }
    export function isEditable(target: EventTarget | null): boolean;
    export function isTextEntry(e: Event): boolean;
    export function createInput(target: Window = window): RootInput;
    export function createScopedInput(parent: Input): ScopedInput;
    ```

- [ ] **Step 1: Write the failing tests**

`tests/unit/idle.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleTimer } from '../../src/core/idle';

describe('idle timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after the timeout', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.start();
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(t.running).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('reset pushes the deadline back', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.start();
    vi.advanceTimersByTime(800);
    t.reset();
    vi.advanceTimersByTime(800);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('reset does nothing when stopped', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.reset();
    vi.advanceTimersByTime(2000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('stop cancels the countdown', () => {
    const onIdle = vi.fn();
    const t = createIdleTimer(1000, onIdle);
    t.start();
    t.stop();
    vi.advanceTimersByTime(2000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
```

`tests/unit/input.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput, createScopedInput, isTextEntry, type RootInput } from '../../src/core/input';

const key = (type: 'keydown' | 'keyup', k: string, code = k) => {
  const e = new KeyboardEvent(type, { key: k, code, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

describe('input', () => {
  let input: RootInput;
  beforeEach(() => {
    input = createInput(window);
  });
  afterEach(() => {
    input.destroy();
    delete document.body.dataset.textEntry;
  });

  it('delivers keydown to handlers until unsubscribed', () => {
    const h = vi.fn();
    const off = input.onKey(h);
    key('keydown', 'Enter');
    off();
    key('keydown', 'Enter');
    expect(h).toHaveBeenCalledTimes(1);
    expect(h.mock.calls[0][0].key).toBe('Enter');
  });

  it('tracks held keys by code', () => {
    key('keydown', 'ArrowLeft');
    expect(input.isDown('ArrowLeft')).toBe(true);
    key('keyup', 'ArrowLeft');
    expect(input.isDown('ArrowLeft')).toBe(false);
  });

  it('clears held keys on window blur', () => {
    key('keydown', ' ', 'Space');
    window.dispatchEvent(new Event('blur'));
    expect(input.isDown('Space')).toBe(false);
  });

  it('suppresses default for arrows and space', () => {
    expect(key('keydown', 'ArrowDown').defaultPrevented).toBe(true);
    expect(key('keydown', 'a', 'KeyA').defaultPrevented).toBe(false);
  });

  it('reports any input for keys and pointer events', () => {
    const h = vi.fn();
    input.onAny(h);
    key('keydown', 'x', 'KeyX');
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('wheel'));
    expect(h).toHaveBeenCalledTimes(3);
  });

  it('a handler added during dispatch does not receive the same event', () => {
    const late = vi.fn();
    input.onKey(() => input.onKey(late));
    key('keydown', 'Enter');
    expect(late).not.toHaveBeenCalled();
  });

  it('counts handlers', () => {
    const off = input.onKey(() => {});
    input.onAny(() => {});
    expect(input.handlerCount()).toBe(2);
    off();
    expect(input.handlerCount()).toBe(1);
  });

  it('scoped input removes all of its handlers on dispose', () => {
    const scoped = createScopedInput(input);
    const h = vi.fn();
    scoped.onKey(h);
    scoped.onAny(h);
    scoped.onKeyUp(h);
    expect(input.handlerCount()).toBe(3);
    scoped.dispose();
    expect(input.handlerCount()).toBe(0);
    key('keydown', 'Enter');
    expect(h).not.toHaveBeenCalled();
    scoped.onKey(h); // late subscribe after dispose is ignored
    expect(input.handlerCount()).toBe(0);
  });

  it('detects text entry from the body flag or a focused input', () => {
    const e = new KeyboardEvent('keydown', { key: 'm' });
    expect(isTextEntry(e)).toBe(false);
    document.body.dataset.textEntry = '1';
    expect(isTextEntry(e)).toBe(true);
    delete document.body.dataset.textEntry;
    const field = document.createElement('input');
    document.body.append(field);
    const typed = new KeyboardEvent('keydown', { key: 'm', bubbles: true });
    let seen = false;
    field.addEventListener('keydown', (ev) => (seen = isTextEntry(ev)));
    field.dispatchEvent(typed);
    expect(seen).toBe(true);
    field.remove();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/idle.test.ts tests/unit/input.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/core/idle.ts`:

```ts
export interface IdleTimer {
  readonly running: boolean;
  /** Starts (or restarts) the countdown. */
  start(): void;
  /** Restarts the countdown if it is running; does nothing otherwise. */
  reset(): void;
  stop(): void;
}

export function createIdleTimer(timeoutMs: number, onIdle: () => void): IdleTimer {
  let handle: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  const clear = () => {
    if (handle !== undefined) clearTimeout(handle);
    handle = undefined;
  };
  const schedule = () => {
    clear();
    handle = setTimeout(() => {
      running = false;
      handle = undefined;
      onIdle();
    }, timeoutMs);
  };

  return {
    get running() {
      return running;
    },
    start() {
      running = true;
      schedule();
    },
    reset() {
      if (running) schedule();
    },
    stop() {
      running = false;
      clear();
    },
  };
}
```

`src/core/input.ts`:

```ts
export type KeyHandler = (e: KeyboardEvent) => void;
export type AnyHandler = (e: Event) => void;

export interface Input {
  /** keydown handler. Returns an unsubscribe function. Menus should read e.key. */
  onKey(handler: KeyHandler): () => void;
  onKeyUp(handler: KeyHandler): () => void;
  /** Any keydown, pointerdown, pointermove or wheel. Used for idle timers and attract mode. */
  onAny(handler: AnyHandler): () => void;
  /** Held-key state by e.code ('ArrowLeft', 'Space', 'KeyA'). Used by action games. */
  isDown(code: string): boolean;
  /** Number of live handlers. Used by leak tests. */
  handlerCount(): number;
}

export interface RootInput extends Input {
  destroy(): void;
}

export interface ScopedInput extends Input {
  /** Removes every handler registered through this scope. */
  dispose(): void;
}

// Keys whose browser default (scrolling, activating a focused button) we always suppress.
const SUPPRESS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** True while the player is typing (text field focused, or a screen set data-text-entry on <body>). */
export function isTextEntry(e: Event): boolean {
  return document.body.dataset.textEntry === '1' || isEditable(e.target);
}

export function createInput(target: Window = window): RootInput {
  const keyHandlers = new Set<KeyHandler>();
  const keyUpHandlers = new Set<KeyHandler>();
  const anyHandlers = new Set<AnyHandler>();
  const down = new Set<string>();

  const emit = <T>(set: Set<(e: T) => void>, e: T) => {
    for (const h of [...set]) h(e);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (SUPPRESS.has(e.key) && !isEditable(e.target)) e.preventDefault();
    down.add(e.code);
    emit(anyHandlers, e);
    emit(keyHandlers, e);
  };
  const onKeyUpEvt = (e: KeyboardEvent) => {
    down.delete(e.code);
    emit(keyUpHandlers, e);
  };
  const onOther = (e: Event) => emit(anyHandlers, e);
  const onBlur = () => down.clear();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUpEvt);
  target.addEventListener('pointerdown', onOther);
  target.addEventListener('pointermove', onOther);
  target.addEventListener('wheel', onOther);
  target.addEventListener('blur', onBlur);

  const sub = <T>(set: Set<T>, h: T) => {
    set.add(h);
    return () => void set.delete(h);
  };

  return {
    onKey: (h) => sub(keyHandlers, h),
    onKeyUp: (h) => sub(keyUpHandlers, h),
    onAny: (h) => sub(anyHandlers, h),
    isDown: (code) => down.has(code),
    handlerCount: () => keyHandlers.size + keyUpHandlers.size + anyHandlers.size,
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUpEvt);
      target.removeEventListener('pointerdown', onOther);
      target.removeEventListener('pointermove', onOther);
      target.removeEventListener('wheel', onOther);
      target.removeEventListener('blur', onBlur);
      keyHandlers.clear();
      keyUpHandlers.clear();
      anyHandlers.clear();
      down.clear();
    },
  };
}

/** Wraps an Input so everything a game subscribes can be removed in one call. */
export function createScopedInput(parent: Input): ScopedInput {
  const offs = new Set<() => void>();
  let disposed = false;
  const track = (off: () => void) => {
    if (disposed) {
      off();
      return () => {};
    }
    offs.add(off);
    return () => {
      off();
      offs.delete(off);
    };
  };
  return {
    onKey: (h) => track(parent.onKey(h)),
    onKeyUp: (h) => track(parent.onKeyUp(h)),
    onAny: (h) => track(parent.onAny(h)),
    isDown: (code) => !disposed && parent.isDown(code),
    handlerCount: () => offs.size,
    dispose() {
      disposed = true;
      for (const off of offs) off();
      offs.clear();
    },
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/idle.test.ts tests/unit/input.test.ts && npm run typecheck`
Expected: all tests in `idle.test.ts`, `input.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/idle.ts src/core/input.ts tests/unit/idle.test.ts tests/unit/input.test.ts
git commit -m "feat: add idle timer and scoped input routing"
```

---

### Task 5: Audio: ZzFX sound effects, synthwave music, global mute

ZzFX and the music generator are loaded with dynamic `import()` on first unlock, so they stay out of the main chunk. Mute is persisted under `cyberarcade.muted`.

**Files:**
- Create: `src/types/zzfx.d.ts`
- Create: `src/core/music.ts`
- Create: `src/core/audio.ts`
- Test: `tests/unit/audio.test.ts`

**Interfaces:**
- Consumes:
  - `src/core/storage.ts`: `KeyValueStore`, `safeLocalStorage`
- Produces:
  - `src/core/music.ts`:

    ```ts
    export interface Music {
      readonly playing: boolean;
      start(): void;
      stop(): void;
      setMuted(muted: boolean): void;
    }
    export function createMusic(ctx: AudioContext): Music;
    ```

  - `src/core/audio.ts`:

    ```ts
    export type SfxName = 'move' | 'select' | 'back' | 'error' | 'coin' | 'hit' | 'explode' | 'score' | 'type';
    export const SFX: Record<SfxName, ZzfxParams> = …
    export const MUTE_KEY = 'cyberarcade.muted';
    export interface Audio {
      readonly muted: boolean;
      readonly unlocked: boolean;
      /** Must be called from a user gesture (the start splash). Loads ZzFX and resumes the AudioContext. */
      unlock(): Promise<void>;
      sfx(name: SfxName): void;
      playMusic(): void;
      stopMusic(): void;
      setMuted(muted: boolean): void;
      toggleMute(): boolean;
    }
    export function createAudio(store: KeyValueStore | null = safeLocalStorage()): Audio;
    ```

- [ ] **Step 1: Write the failing test**

`tests/unit/audio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createAudio, MUTE_KEY, SFX } from '../../src/core/audio';
import type { KeyValueStore } from '../../src/core/storage';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('audio (before unlock)', () => {
  it('reads the saved mute setting', () => {
    expect(createAudio(memoryStore({ [MUTE_KEY]: '1' })).muted).toBe(true);
    expect(createAudio(memoryStore()).muted).toBe(false);
  });

  it('toggles and persists mute', () => {
    const store = memoryStore();
    const audio = createAudio(store);
    expect(audio.toggleMute()).toBe(true);
    expect(store.getItem(MUTE_KEY)).toBe('1');
    expect(createAudio(store).muted).toBe(true);
    expect(audio.toggleMute()).toBe(false);
    expect(store.getItem(MUTE_KEY)).toBe('0');
  });

  it('is a silent no-op before unlock', () => {
    const audio = createAudio(memoryStore());
    expect(audio.unlocked).toBe(false);
    expect(() => {
      audio.sfx('select');
      audio.playMusic();
      audio.stopMusic();
    }).not.toThrow();
  });

  it('works without storage', () => {
    const audio = createAudio(null);
    expect(audio.toggleMute()).toBe(true);
  });

  it('defines every sound effect', () => {
    for (const params of Object.values(SFX)) expect(params.length).toBeGreaterThan(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/audio.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/types/zzfx.d.ts`:

```ts
declare module 'zzfx' {
  export type ZzfxParams = (number | undefined)[];
  export const ZZFX: {
    volume: number;
    sampleRate: number;
    audioContext: AudioContext;
    buildSamples(...params: ZzfxParams): number[];
    playSamples(
      channels: number[][],
      volumeScale?: number,
      rate?: number,
      pan?: number,
      loop?: boolean,
    ): AudioBufferSourceNode;
  };
  export function zzfx(...params: ZzfxParams): AudioBufferSourceNode;
}
```

`src/core/music.ts`:

```ts
// Procedural synthwave loop: A minor → F → C → G, 104 BPM.
// Bass + arpeggio (through a dotted-eighth delay) + kick/snare/hat, scheduled ahead with a lookahead timer.

export interface Music {
  readonly playing: boolean;
  start(): void;
  stop(): void;
  setMuted(muted: boolean): void;
}

const BPM = 104;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const LOOKAHEAD = 0.12; // seconds scheduled ahead
const TICK_MS = 25;
const VOLUME = 0.32;

// One chord per bar (16 steps): [bass root, triad...] as MIDI notes.
const BARS: number[][] = [
  [45, 57, 60, 64], // Am
  [41, 53, 57, 60], // F
  [48, 60, 64, 67], // C
  [43, 55, 59, 62], // G
];
const ARP = [1, 2, 3, 2, 1, 2, 3, 1]; // indexes into the chord's triad

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

export function createMusic(ctx: AudioContext): Music {
  const master = ctx.createGain();
  master.gain.value = VOLUME;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);

  // Echo bus for the arpeggio.
  const delay = ctx.createDelay(1);
  delay.delayTime.value = STEP * 3;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  delay.connect(feedback).connect(delay);
  delay.connect(master);

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;
  let nextTime = 0;
  let muted = false;

  const env = (t: number, peak: number, decay: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return g;
  };

  const tone = (type: OscillatorType, hz: number, t: number, peak: number, decay: number, cutoff: number, dest: AudioNode) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = env(t, peak, decay);
    osc.connect(filter).connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  };

  const kick = (t: number) => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = env(t, 0.9, 0.3);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.35);
  };

  const hiss = (t: number, type: BiquadFilterType, hz: number, peak: number, decay: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    const g = env(t, peak, decay);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + decay + 0.05);
  };

  const schedule = (s: number, t: number) => {
    const chord = BARS[Math.floor(s / 16) % BARS.length];
    const beat = s % 16;
    if (beat % 2 === 0) {
      const octave = beat % 4 === 2 ? 12 : 0;
      tone('sawtooth', midiHz(chord[0] + octave), t, 0.22, STEP * 1.8, 700, master);
    }
    tone('square', midiHz(chord[ARP[beat % ARP.length]] + 12), t, 0.05, STEP * 1.5, 2600, master);
    tone('square', midiHz(chord[ARP[beat % ARP.length]] + 12), t, 0.025, STEP * 1.5, 2600, delay);
    if (beat % 4 === 0) kick(t);
    if (beat === 4 || beat === 12) hiss(t, 'bandpass', 1800, 0.35, 0.16);
    if (beat % 4 === 2) hiss(t, 'highpass', 7000, 0.12, 0.05);
  };

  const tick = () => {
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      schedule(step, nextTime);
      step = (step + 1) % (16 * BARS.length);
      nextTime += STEP;
    }
  };

  return {
    get playing() {
      return timer !== undefined;
    },
    start() {
      if (timer !== undefined) return;
      step = 0;
      nextTime = ctx.currentTime + 0.05;
      tick();
      timer = setInterval(tick, TICK_MS);
    },
    stop() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
    setMuted(m) {
      muted = m;
      master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.05);
    },
  };
}
```

`src/core/audio.ts`:

```ts
import type { ZzfxParams } from 'zzfx';
import type { Music } from './music';
import { safeLocalStorage, type KeyValueStore } from './storage';

export type SfxName = 'move' | 'select' | 'back' | 'error' | 'coin' | 'hit' | 'explode' | 'score' | 'type';

// ZzFX parameter lists (design new ones at https://killedbyapixel.github.io/ZzFX/).
export const SFX: Record<SfxName, ZzfxParams> = {
  move: [0.5, 0, 320, 0.01, 0.01, 0.04, 1, 1.6, , , , , , , , , , 0.5],
  select: [0.9, 0, 520, 0.02, 0.08, 0.2, 1, 1.8, , , 260, 0.06, , , , , , 0.7],
  back: [0.6, 0, 260, 0.01, 0.03, 0.08, 1, 1.2, -8],
  error: [0.9, 0, 140, 0.01, 0.1, 0.2, 2, 2.5, , , , , , 4],
  coin: [0.9, 0, 1200, , 0.04, 0.25, 1, 1.6, , , 500, 0.06],
  hit: [0.9, 0, 400, , 0.02, 0.12, 4, 2.4, , , , , , 1.5],
  explode: [1.1, 0, 80, 0.01, 0.2, 0.5, 4, 2.8, , , , , , 1.2, , 0.4],
  score: [0.9, 0, 700, 0.02, 0.1, 0.3, 1, 1.5, , , 300, 0.08, 0.05],
  type: [0.3, 0, 900, , 0.005, 0.02, 1, 1.2],
};

export const MUTE_KEY = 'cyberarcade.muted';
const SFX_VOLUME = 0.3;

export interface Audio {
  readonly muted: boolean;
  readonly unlocked: boolean;
  /** Must be called from a user gesture (the start splash). Loads ZzFX and resumes the AudioContext. */
  unlock(): Promise<void>;
  sfx(name: SfxName): void;
  playMusic(): void;
  stopMusic(): void;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
}

type Zzfx = (typeof import('zzfx'))['ZZFX'];

export function createAudio(store: KeyValueStore | null = safeLocalStorage()): Audio {
  let muted = false;
  try {
    muted = store?.getItem(MUTE_KEY) === '1';
  } catch {
    muted = false;
  }
  let zz: Zzfx | null = null;
  let music: Music | null = null;
  let wantMusic = false;
  const samples = new Map<SfxName, number[]>();

  const persist = () => {
    try {
      store?.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // ignore
    }
  };

  return {
    get muted() {
      return muted;
    },
    get unlocked() {
      return zz !== null;
    },
    async unlock() {
      if (!zz) {
        // ZzFX creates its AudioContext at import time, so import only after a user gesture.
        const [{ ZZFX }, { createMusic }] = await Promise.all([import('zzfx'), import('./music')]);
        zz = ZZFX;
        zz.volume = SFX_VOLUME;
        music = createMusic(zz.audioContext);
        music.setMuted(muted);
      }
      if (zz.audioContext.state !== 'running') await zz.audioContext.resume().catch(() => {});
      if (wantMusic) music?.start();
    },
    sfx(name) {
      if (muted || !zz) return;
      try {
        let s = samples.get(name);
        if (!s) {
          s = zz.buildSamples(...SFX[name]);
          samples.set(name, s);
        }
        zz.playSamples([s]);
      } catch {
        // Audio must never break a game.
      }
    },
    playMusic() {
      wantMusic = true;
      music?.start();
    },
    stopMusic() {
      wantMusic = false;
      music?.stop();
    },
    setMuted(m) {
      muted = m;
      music?.setMuted(m);
      persist();
    },
    toggleMute() {
      this.setMuted(!muted);
      return muted;
    },
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/audio.test.ts && npm run typecheck`
Expected: all tests in `audio.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/types/zzfx.d.ts src/core/music.ts src/core/audio.ts tests/unit/audio.test.ts
git commit -m "feat: add ZzFX sfx, procedural synthwave music and mute"
```

---

### Task 6: Game contract, cabinet registry, icons and self-test game

Defines `GameModule` / `GameContext` (spec §3) and the cabinet registry. **Deviation from the spec, on purpose:** title, tagline, category and controls live on the registry entry (`GameCabinet`) rather than on the module, so the hub can render every cabinet without loading any game code. A cabinet with no `load` shows "COMING SOON". The hidden `selftest` cabinet (enabled by `?selftest`) is a tiny game used by the shell tests and the Playwright suite.

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/ui/icons.ts`
- Create: `src/games/selftest/index.ts`
- Create: `src/games/registry.ts`
- Test: `tests/unit/registry.test.ts`

**Interfaces:**
- Consumes:
  - `src/core/audio.ts`: `Audio`
  - `src/core/input.ts`: `Input`
- Produces:
  - `src/core/types.ts`:

    ```ts
    export interface GameModule {
      mount(container: HTMLElement, ctx: GameContext): void | Promise<void>;
      /** Releases every listener, timer, canvas and audio node. Must be safe to call at any time, even mid-mount. */
      unmount(): void;
    }
    export interface GameContext {
      audio: Audio;
      /** Scoped to this run: every handler is removed automatically when the game ends. */
      input: Input;
      /** Ends the run and starts game over → initials → leaderboard. Only the first call counts. */
      endRun(score: number): void;
      /** Back to the hub without a score. */
      exit(): void;
    }
    export type Category = 'arcade' | 'learn' | 'classic';
    export interface GameCabinet extends CabinetBase {
      kind: 'game';
      /** [keys, action] pairs shown on the title card, e.g. ['← →', 'Move']. */
      controls: [string, string][];
      /** Missing while the game is still being built: the hub shows COMING SOON. */
      load?: () => Promise<GameModule>;
    }
    export interface LinkCabinet extends CabinetBase {
      kind: 'link';
      href: string;
      note: string;
    }
    export type Cabinet = GameCabinet | LinkCabinet;
    ```

  - `src/core/ui/icons.ts`:

    ```ts
    export const ICONS: Record<string, string> = …
    ```

  - `src/games/selftest/index.ts`:

    ```ts
    export function createGame(): GameModule;
    ```

  - `src/games/registry.ts`:

    ```ts
    export const CABINETS: Cabinet[] = …
    export const SELFTEST: GameCabinet = …
    export function getCabinets(params: URLSearchParams = new URLSearchParams(location.search)): Cabinet[];
    ```

- [ ] **Step 1: Write the failing test**

`tests/unit/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CABINETS, getCabinets } from '../../src/games/registry';
import { ICONS } from '../../src/core/ui/icons';

describe('registry', () => {
  it('has the seven games plus Classic 25, with unique ids', () => {
    expect(CABINETS).toHaveLength(8);
    expect(new Set(CABINETS.map((c) => c.id)).size).toBe(8);
    expect(CABINETS.at(-1)).toMatchObject({ kind: 'link', id: 'classic' });
  });

  it('gives every game cabinet controls and every cabinet an icon', () => {
    for (const c of CABINETS) {
      expect(ICONS[c.id], c.id).toContain('<svg');
      if (c.kind === 'game') expect(c.controls.length).toBeGreaterThan(0);
    }
  });

  it('adds the self-test cabinet only with ?selftest', () => {
    expect(getCabinets(new URLSearchParams(''))[0].id).toBe('invaders');
    const withTest = getCabinets(new URLSearchParams('selftest'));
    expect(withTest[0].id).toBe('selftest');
    expect(withTest).toHaveLength(9);
    expect(ICONS.selftest).toContain('<svg');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/registry.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/core/types.ts`:

```ts
import type { Audio } from './audio';
import type { Input } from './input';

/**
 * A playable game. Metadata (title, controls...) lives in the registry, so the hub
 * never downloads game code. Each load() returns a fresh instance.
 */
export interface GameModule {
  mount(container: HTMLElement, ctx: GameContext): void | Promise<void>;
  /** Releases every listener, timer, canvas and audio node. Must be safe to call at any time, even mid-mount. */
  unmount(): void;
}

export interface GameContext {
  audio: Audio;
  /** Scoped to this run: every handler is removed automatically when the game ends. */
  input: Input;
  /** Ends the run and starts game over → initials → leaderboard. Only the first call counts. */
  endRun(score: number): void;
  /** Back to the hub without a score. */
  exit(): void;
}

export type Category = 'arcade' | 'learn' | 'classic';

interface CabinetBase {
  id: string;
  title: string;
  tagline: string;
  category: Category;
}

export interface GameCabinet extends CabinetBase {
  kind: 'game';
  /** [keys, action] pairs shown on the title card, e.g. ['← →', 'Move']. */
  controls: [string, string][];
  /** Missing while the game is still being built: the hub shows COMING SOON. */
  load?: () => Promise<GameModule>;
}

export interface LinkCabinet extends CabinetBase {
  kind: 'link';
  href: string;
  note: string;
}

export type Cabinet = GameCabinet | LinkCabinet;
```

`src/core/ui/icons.ts`:

```ts
// Neon line icons, one per cabinet. 64×64 viewBox, stroked with currentColor so CSS sets the glow color.
const svg = (body: string) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  invaders: svg(
    '<path d="M20 14l6 8M44 14l-6 8"/><rect x="14" y="22" width="36" height="22" rx="4"/>' +
      '<circle cx="25" cy="32" r="3"/><circle cx="39" cy="32" r="3"/><path d="M14 36H6v10M50 36h8v10M22 44l-4 8M42 44l4 8M28 44v6M36 44v6"/>',
  ),
  phish: svg(
    '<rect x="6" y="16" width="38" height="28" rx="3"/><path d="M6 18l19 14 19-14"/>' +
      '<path d="M52 6v26a8 8 0 1 1-8-8"/><path d="M44 24l-3 5"/>',
  ),
  runner: svg(
    '<path d="M32 6L6 58M32 6l26 52M32 6v52"/><path d="M14 44h36M20 32h24"/>' +
      '<rect x="27" y="40" width="10" height="10" rx="2" fill="currentColor"/>',
  ),
  password: svg(
    '<rect x="12" y="28" width="40" height="28" rx="4"/><path d="M20 28v-8a12 12 0 0 1 24 0v8"/>' +
      '<circle cx="32" cy="40" r="4"/><path d="M32 44v6"/>',
  ),
  defense: svg(
    '<path d="M32 6l22 8v16c0 14-10 24-22 28C20 54 10 44 10 30V14z"/>' +
      '<path d="M10 24h44M10 36h44M24 14v10M40 14v10M32 24v12M22 36v12M42 36v10"/>',
  ),
  port: svg(
    '<rect x="8" y="10" width="48" height="16" rx="3"/><rect x="8" y="38" width="48" height="16" rx="3"/>' +
      '<circle cx="18" cy="18" r="2"/><circle cx="18" cy="46" r="2"/><path d="M28 18h20M28 46h20M32 26v12"/>',
  ),
  bughunt: svg(
    '<ellipse cx="32" cy="36" rx="12" ry="16"/><path d="M32 20v32M24 14l4 6M40 14l-4 6"/>' +
      '<path d="M20 30H8M20 40H8M20 48l-10 6M44 30h12M44 40h12M44 48l10 6"/>',
  ),
  classic: svg(
    '<rect x="8" y="30" width="48" height="24" rx="6"/><path d="M32 30V14"/><circle cx="32" cy="10" r="5"/>' +
      '<circle cx="44" cy="40" r="3"/><circle cx="50" cy="46" r="3"/><path d="M16 42h12M22 36v12"/>',
  ),
  selftest: svg(
    '<circle cx="32" cy="32" r="10"/><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13 13l6 6M45 45l6 6M13 51l6-6M45 19l6-6"/>',
  ),
};
```

`src/games/selftest/index.ts`:

```ts
import type { GameContext, GameModule } from '../../core/types';

// Hidden diagnostics game (?selftest). Lets Playwright drive the whole shell flow:
// END RUN → results flow, THROW → crash guard, EXIT → hub. Counts mounts/unmounts for leak tests.

declare global {
  interface Window {
    __selftest?: { mounts: number; unmounts: number };
  }
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let offKey: (() => void) | null = null;
  let throwTimer: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const stats = (window.__selftest ??= { mounts: 0, unmounts: 0 });
      stats.mounts++;
      root = document.createElement('div');
      root.className = 'selftest';
      root.innerHTML = `
        <h1>SELF TEST</h1>
        <p>keys: <span data-test="keys">0</span></p>
        <button data-test="end">END RUN</button>
        <button data-test="throw">THROW</button>
        <button data-test="exit">EXIT</button>`;
      container.append(root);
      const keys = root.querySelector<HTMLElement>('[data-test="keys"]')!;
      let count = 0;
      offKey = ctx.input.onKey(() => (keys.textContent = String(++count)));
      root.querySelector('[data-test="end"]')!.addEventListener('click', () => ctx.endRun(4242));
      root.querySelector('[data-test="exit"]')!.addEventListener('click', () => ctx.exit());
      root.querySelector('[data-test="throw"]')!.addEventListener('click', () => {
        throwTimer = setTimeout(() => {
          throw new Error('selftest crash');
        });
      });
    },
    unmount() {
      if (!root) return;
      window.__selftest!.unmounts++;
      clearTimeout(throwTimer);
      offKey?.();
      root.remove();
      root = null;
    },
  };
}
```

`src/games/registry.ts`:

```ts
import type { Cabinet, GameCabinet } from '../core/types';

// Hub order. Each game plan adds a `load` line to its cabinet when the game ships.
export const CABINETS: Cabinet[] = [
  {
    kind: 'game',
    id: 'invaders',
    title: 'Malware Invaders',
    tagline: 'Viruses, worms and trojans are swarming the network. Blast them before they land.',
    category: 'arcade',
    controls: [['← →', 'Move'], ['SPACE', 'Fire']],
  },
  {
    kind: 'game',
    id: 'phish',
    title: 'Phish or Legit',
    tagline: 'Emails, texts and links fly in fast. Can you spot the scam before the clock runs out?',
    category: 'learn',
    controls: [['←', 'Phish'], ['→', 'Legit']],
  },
  {
    kind: 'game',
    id: 'runner',
    title: 'Packet Runner',
    tagline: 'Race a data packet through the network. Dodge DDoS floods and take the right route.',
    category: 'arcade',
    controls: [['← →', 'Switch lane']],
  },
  {
    kind: 'game',
    id: 'password',
    title: 'Password Smash',
    tagline: 'Build a password and watch the cracking rig try to break it. How long will it last?',
    category: 'learn',
    controls: [['TYPE', 'Password'], ['ENTER', 'Crack it']],
  },
  {
    kind: 'game',
    id: 'defense',
    title: 'Firewall Defense',
    tagline: 'Place firewalls, IDS sensors and honeypots. Stop the botnet before it hits the server.',
    category: 'arcade',
    controls: [['MOUSE', 'Place & upgrade']],
  },
  {
    kind: 'game',
    id: 'port',
    title: 'Port Guardian',
    tagline: 'You are the firewall. Check each packet against the rulebook: allow or deny?',
    category: 'learn',
    controls: [['←', 'Allow'], ['→', 'Deny']],
  },
  {
    kind: 'game',
    id: 'bughunt',
    title: 'Bug Hunt',
    tagline: 'Every Python snippet hides one bug. Find the broken line before time runs out.',
    category: 'learn',
    controls: [['↑ ↓', 'Pick line'], ['ENTER', 'Squash']],
  },
  {
    kind: 'link',
    id: 'classic',
    title: "Classic '25",
    tagline: "Last year's Mini-Arcade. See how far we've come.",
    category: 'classic',
    href: 'https://timothy815.github.io/Mini-Arcade/',
    note: 'Press Alt+← to return',
  },
];

// Hidden test cabinet used by the Playwright suite (?selftest in the URL).
export const SELFTEST: GameCabinet = {
  kind: 'game',
  id: 'selftest',
  title: 'Self Test',
  tagline: 'Diagnostics cabinet for automated tests.',
  category: 'arcade',
  controls: [['CLICK', 'Buttons']],
  load: () => import('./selftest/index').then((m) => m.createGame()),
};

export function getCabinets(params: URLSearchParams = new URLSearchParams(location.search)): Cabinet[] {
  return params.has('selftest') ? [SELFTEST, ...CABINETS] : CABINETS;
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/registry.test.ts && npm run typecheck`
Expected: all tests in `registry.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/ui/icons.ts src/games/selftest/index.ts src/games/registry.ts tests/unit/registry.test.ts
git commit -m "feat: add game contract, cabinet registry, icons and selftest game"
```

---

### Task 7: Shared screens: title card, loading, game over, initials, leaderboard, system error

Every game shares these HTML screens. `runScreen` gives each screen its own scoped input and resolves a promise with the screen result, so the shell can `await` the flow. `initials-model` is a pure reducer so the 3-letter entry is unit-testable.

**Files:**
- Create: `src/core/ui/dom.ts`
- Create: `src/core/ui/screen.ts`
- Create: `src/core/ui/initials-model.ts`
- Create: `src/core/ui/screens.ts`
- Test: `tests/unit/initials-model.test.ts`
- Test: `tests/unit/screens.test.ts`

**Interfaces:**
- Consumes:
  - `src/core/audio.ts`: `Audio`
  - `src/core/input.ts`: `Input`
  - `src/core/scores.ts`: `ScoreEntry`, `formatScore`
  - `src/core/theme.ts`: `timing`
  - `src/core/types.ts`: `GameCabinet`
  - `src/core/ui/icons.ts`: `ICONS`
- Produces:
  - `src/core/ui/dom.ts`:

    ```ts
    export function el<K extends keyof HTMLElementTagNameMap = 'div'>( spec: string, attrs: Attrs = {}, ...children: (Node | string)[] ): HTMLElementTagNameMap[K];
    export function html(spec: string, markup: string): HTMLElement;
    ```

  - `src/core/ui/screen.ts`:

    ```ts
    export function runScreen<R>( host: HTMLElement, className: string, signal: AbortSignal, build: (root: HTMLElement, done: (result: R) => void) => () => void, ): Promise<R | null>;
    ```

  - `src/core/ui/initials-model.ts`:

    ```ts
    export interface InitialsState {
      letters: [string, string, string];
      slot: 0 | 1 | 2;
      done: boolean;
    }
    export function initialInitials(): InitialsState;
    export function reduceInitials(s: InitialsState, key: string): InitialsState;
    ```

  - `src/core/ui/screens.ts`:

    ```ts
    export interface ScreenDeps {
      host: HTMLElement;
      input: Input;
      audio: Audio;
      signal: AbortSignal;
    }
    export function titleCard(d: ScreenDeps, cab: GameCabinet);
    export function loadingScreen(host: HTMLElement): () => void;
    export function gameOver(d: ScreenDeps, score: number);
    export function initialsEntry(d: ScreenDeps, score: number);
    export function leaderboard(d: ScreenDeps, cab: GameCabinet, entries: ScoreEntry[], highlight: number);
    export function systemError(host: HTMLElement): Promise<void>;
    ```

- [ ] **Step 1: Write the failing tests**

`tests/unit/initials-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialInitials, reduceInitials, type InitialsState } from '../../src/core/ui/initials-model';

const run = (keys: string[], s: InitialsState = initialInitials()) => keys.reduce(reduceInitials, s);

describe('initials model', () => {
  it('starts at AAA on the first slot', () => {
    expect(initialInitials()).toEqual({ letters: ['A', 'A', 'A'], slot: 0, done: false });
  });

  it('cycles letters with up/down and wraps', () => {
    expect(run(['ArrowUp', 'ArrowUp']).letters[0]).toBe('C');
    expect(run(['ArrowDown']).letters[0]).toBe('Z');
  });

  it('moves between slots and clamps at the ends', () => {
    expect(run(['ArrowRight', 'ArrowRight', 'ArrowRight']).slot).toBe(2);
    expect(run(['ArrowLeft']).slot).toBe(0);
    expect(run(['ArrowRight', 'Backspace']).slot).toBe(0);
  });

  it('typing a letter sets it and advances', () => {
    expect(run(['z', 'a', 'k'])).toEqual({ letters: ['Z', 'A', 'K'], slot: 2, done: false });
  });

  it('Enter finishes, and later keys are ignored', () => {
    const s = run(['b', 'Enter']);
    expect(s.done).toBe(true);
    expect(reduceInitials(s, 'c')).toBe(s);
  });

  it('returns the same object for keys that change nothing', () => {
    const s = initialInitials();
    expect(reduceInitials(s, 'Shift')).toBe(s);
    expect(reduceInitials(s, '1')).toBe(s);
    expect(reduceInitials(s, 'ArrowLeft')).toBe(s);
  });
});
```

`tests/unit/screens.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/core/audio';
import { createInput, type RootInput } from '../../src/core/input';
import { gameOver, initialsEntry, leaderboard, titleCard, type ScreenDeps } from '../../src/core/ui/screens';
import type { GameCabinet } from '../../src/core/types';

const cab: GameCabinet = {
  kind: 'game',
  id: 'invaders',
  title: 'Malware Invaders',
  tagline: 't',
  category: 'arcade',
  controls: [['SPACE', 'Fire']],
};
const press = (key: string, repeat = false) => window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat }));

describe('shared screens', () => {
  let input: RootInput;
  let deps: ScreenDeps;
  let ac: AbortController;
  beforeEach(() => {
    vi.useFakeTimers();
    input = createInput(window);
    ac = new AbortController();
    deps = { host: document.body, input, audio: createAudio(null), signal: ac.signal };
  });
  afterEach(() => {
    input.destroy();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('title card starts on Enter, ignores key repeat, and removes itself', async () => {
    const p = titleCard(deps, cab);
    expect(document.querySelector('.title-card')?.textContent).toContain('Malware Invaders');
    press('Enter', true);
    press('Enter');
    await expect(p).resolves.toBe('start');
    expect(document.querySelector('.screen')).toBeNull();
    expect(input.handlerCount()).toBe(0);
  });

  it('title card goes back after 30 s idle', async () => {
    const p = titleCard(deps, cab);
    vi.advanceTimersByTime(30_000);
    await expect(p).resolves.toBe('back');
  });

  it('aborting resolves null and cleans up', async () => {
    const p = titleCard(deps, cab);
    ac.abort();
    await expect(p).resolves.toBeNull();
    expect(document.querySelector('.screen')).toBeNull();
    expect(input.handlerCount()).toBe(0);
  });

  it('game over ignores keys for the first second, then continues', async () => {
    const p = gameOver(deps, 1234);
    let settled = false;
    p.then(() => (settled = true));
    press('x');
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.final-score')?.textContent).toBe('1,234');
    press('x');
    await p;
    expect(settled).toBe(true);
  });

  it('initials entry flags text entry and returns typed letters', async () => {
    const p = initialsEntry(deps, 500);
    expect(document.body.dataset.textEntry).toBe('1');
    for (const k of ['z', 'a', 'k', 'Enter']) press(k);
    await expect(p).resolves.toBe('ZAK');
    expect(document.body.dataset.textEntry).toBeUndefined();
  });

  it('leaderboard highlights the new entry and returns again/hub', async () => {
    const entries = [
      { initials: 'AAA', score: 900, date: '' },
      { initials: 'ZAK', score: 500, date: '' },
    ];
    const p = leaderboard(deps, cab, entries, 1);
    expect(document.querySelector('li.me')?.textContent).toContain('ZAK');
    press('Enter');
    await expect(p).resolves.toBe('again');
    const p2 = leaderboard(deps, cab, [], -1);
    expect(document.querySelector('li.empty')).not.toBeNull();
    vi.advanceTimersByTime(15_000);
    await expect(p2).resolves.toBe('hub');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/initials-model.test.ts tests/unit/screens.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/core/ui/dom.ts`:

```ts
type Attrs = Record<string, string | number | boolean | undefined>;

/** Tiny element builder: el('div.card.big', { 'data-id': 'x' }, 'text', childNode). */
export function el<K extends keyof HTMLElementTagNameMap = 'div'>(
  spec: string,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div') as HTMLElementTagNameMap[K];
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  node.append(...children);
  return node;
}

/** Element whose content is trusted, hard-coded markup (icons). Never pass user text here. */
export function html(spec: string, markup: string): HTMLElement {
  const node = el(spec);
  node.innerHTML = markup;
  return node;
}
```

`src/core/ui/screen.ts`:

```ts
/**
 * Shows a full-stage screen until build() calls done(result), or the signal aborts (result null).
 * build() returns a cleanup function that removes its timers and handlers.
 */
export function runScreen<R>(
  host: HTMLElement,
  className: string,
  signal: AbortSignal,
  build: (root: HTMLElement, done: (result: R) => void) => () => void,
): Promise<R | null> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(null);
    const root = document.createElement('div');
    root.className = `screen ${className}`;
    host.append(root);
    let finished = false;
    let cleanup: () => void = () => {};
    const finish = (result: R | null) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', onAbort);
      cleanup();
      root.remove();
      resolve(result);
    };
    const onAbort = () => finish(null);
    signal.addEventListener('abort', onAbort);
    cleanup = build(root, finish);
    if (finished) cleanup();
  });
}
```

`src/core/ui/initials-model.ts`:

```ts
// Pure state machine for the 3-letter initials picker (arcade style: ↑↓ letters, ←→ slot, or just type).

export interface InitialsState {
  letters: [string, string, string];
  slot: 0 | 1 | 2;
  done: boolean;
}

const A = 'A'.charCodeAt(0);
const shift = (ch: string, d: number) => String.fromCharCode(A + ((ch.charCodeAt(0) - A + d + 26) % 26));

export function initialInitials(): InitialsState {
  return { letters: ['A', 'A', 'A'], slot: 0, done: false };
}

export function reduceInitials(s: InitialsState, key: string): InitialsState {
  if (s.done) return s;
  const setLetter = (ch: string): InitialsState['letters'] => {
    const l = [...s.letters] as InitialsState['letters'];
    l[s.slot] = ch;
    return l;
  };
  const move = (d: number) => Math.max(0, Math.min(2, s.slot + d)) as InitialsState['slot'];
  switch (key) {
    case 'ArrowUp':
      return { ...s, letters: setLetter(shift(s.letters[s.slot], 1)) };
    case 'ArrowDown':
      return { ...s, letters: setLetter(shift(s.letters[s.slot], -1)) };
    case 'ArrowLeft':
    case 'Backspace':
      return s.slot === 0 ? s : { ...s, slot: move(-1) };
    case 'ArrowRight':
      return s.slot === 2 ? s : { ...s, slot: move(1) };
    case 'Enter':
      return { ...s, done: true };
  }
  if (/^[a-z]$/i.test(key)) return { ...s, letters: setLetter(key.toUpperCase()), slot: move(1) };
  return s;
}
```

`src/core/ui/screens.ts`:

```ts
import type { Audio } from '../audio';
import type { Input } from '../input';
import { formatScore, type ScoreEntry } from '../scores';
import { timing } from '../theme';
import type { GameCabinet } from '../types';
import { el, html } from './dom';
import { ICONS } from './icons';
import { initialInitials, reduceInitials } from './initials-model';
import { runScreen } from './screen';

export interface ScreenDeps {
  host: HTMLElement;
  input: Input;
  audio: Audio;
  signal: AbortSignal;
}

const accent = (cab: { category: string }) => `accent-${cab.category}`;

/** Game title + controls. Enter/Space/click → 'start', Esc → 'back' (also after 30 s idle). */
export function titleCard(d: ScreenDeps, cab: GameCabinet) {
  return runScreen<'start' | 'back'>(d.host, `title-card ${accent(cab)}`, d.signal, (root, done) => {
    root.append(
      html('div.title-icon', ICONS[cab.id] ?? ''),
      el('h1.title-name', {}, cab.title),
      el('p.title-tagline', {}, cab.tagline),
      el(
        'div.controls',
        {},
        ...cab.controls.map(([k, a]) => el('div.control', {}, el('kbd', {}, k), el('span', {}, a))),
      ),
      el('p.blink', {}, 'PRESS ENTER TO START'),
      el('p.hint', {}, 'ESC BACK'),
    );
    const start = () => {
      d.audio.sfx('select');
      done('start');
    };
    const off = d.input.onKey((e) => {
      if (e.repeat) return;
      if (e.key === 'Enter' || e.key === ' ') start();
      else if (e.key === 'Escape') {
        d.audio.sfx('back');
        done('back');
      }
    });
    root.addEventListener('click', start);
    const idle = setTimeout(() => done('back'), timing.titleIdleMs);
    return () => {
      off();
      clearTimeout(idle);
    };
  });
}

export function loadingScreen(host: HTMLElement): () => void {
  const root = el('div.screen.loading', {}, el('div.spinner'), el('p', {}, 'LOADING…'));
  host.append(root);
  return () => root.remove();
}

/** GAME OVER with a score count-up. Continues on key/click after a short delay, or automatically. */
export function gameOver(d: ScreenDeps, score: number) {
  return runScreen<void>(d.host, 'game-over', d.signal, (root, done) => {
    const value = el('div.final-score', {}, '0');
    root.append(
      el('h1.glitch', { 'data-text': 'GAME OVER' }, 'GAME OVER'),
      el('p.label', {}, 'FINAL SCORE'),
      value,
      el('p.hint', {}, 'PRESS ANY KEY'),
    );
    d.audio.sfx('explode');
    const started = Date.now();
    const steps = 30;
    let step = 0;
    const counter = setInterval(() => {
      step++;
      value.textContent = formatScore(Math.round((score * step) / steps));
      if (step >= steps) clearInterval(counter);
    }, 30);
    const proceed = () => {
      if (Date.now() - started < timing.gameOverMinMs) return;
      done();
    };
    const off = d.input.onKey((e) => !e.repeat && proceed());
    root.addEventListener('click', proceed);
    const auto = setTimeout(() => done(), timing.gameOverAutoMs);
    return () => {
      off();
      clearInterval(counter);
      clearTimeout(auto);
    };
  });
}

/** NEW HIGH SCORE initials picker. Resolves to the 3 raw letters (sanitized by Scores.add). */
export function initialsEntry(d: ScreenDeps, score: number) {
  return runScreen<string>(d.host, 'initials', d.signal, (root, done) => {
    let state = initialInitials();
    const slots = state.letters.map(() => el('div.slot'));
    const render = () =>
      slots.forEach((s, i) => {
        s.textContent = state.letters[i];
        s.classList.toggle('active', i === state.slot);
      });
    root.append(
      el('h1.neon', {}, 'NEW HIGH SCORE!'),
      el('div.final-score', {}, formatScore(score)),
      el('p.label', {}, 'ENTER YOUR INITIALS'),
      el('div.slots', {}, ...slots),
      el('p.hint', {}, '↑ ↓ LETTER · ← → MOVE · OR JUST TYPE · ENTER DONE'),
    );
    render();
    document.body.dataset.textEntry = '1';
    const finish = () => done(state.letters.join(''));
    const off = d.input.onKey((e) => {
      const next = reduceInitials(state, e.key);
      if (next === state) return;
      state = next;
      d.audio.sfx(state.done ? 'select' : 'type');
      render();
      if (state.done) finish();
    });
    const idle = setTimeout(finish, timing.initialsIdleMs);
    return () => {
      off();
      clearTimeout(idle);
      delete document.body.dataset.textEntry;
    };
  });
}

/** Top-10 board. Enter → 'again', Esc → 'hub', auto 'hub' after 15 s. */
export function leaderboard(d: ScreenDeps, cab: GameCabinet, entries: ScoreEntry[], highlight: number) {
  return runScreen<'again' | 'hub'>(d.host, `leaderboard ${accent(cab)}`, d.signal, (root, done) => {
    const rows = entries.length
      ? entries.map((e, i) =>
          el(
            `li${i === highlight ? '.me' : ''}`,
            {},
            el('span.rank', {}, String(i + 1).padStart(2, '0')),
            el('span.who', {}, e.initials),
            el('span.pts', {}, formatScore(e.score)),
          ),
        )
      : [el('li.empty', {}, 'NO SCORES YET')];
    root.append(
      el('h1.neon', {}, cab.title.toUpperCase()),
      el('p.label', {}, 'TOP 10 · THIS STATION'),
      el('ol.board', {}, ...rows),
      el('p.hint', {}, 'ENTER PLAY AGAIN · ESC ARCADE'),
    );
    const off = d.input.onKey((e) => {
      if (e.repeat) return;
      if (e.key === 'Enter') {
        d.audio.sfx('select');
        done('again');
      } else if (e.key === 'Escape') {
        d.audio.sfx('back');
        done('hub');
      }
    });
    const auto = setTimeout(() => done('hub'), timing.leaderboardMs);
    return () => {
      off();
      clearTimeout(auto);
    };
  });
}

/** SYSTEM ERROR // REBOOTING, shown after a game crash. Not abortable. */
export function systemError(host: HTMLElement): Promise<void> {
  const root = el(
    'div.screen.system-error',
    {},
    el('h1.glitch', { 'data-text': 'SYSTEM ERROR' }, 'SYSTEM ERROR'),
    el('p', {}, '// REBOOTING'),
  );
  host.append(root);
  return new Promise((resolve) =>
    setTimeout(() => {
      root.remove();
      resolve();
    }, timing.errorScreenMs),
  );
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/initials-model.test.ts tests/unit/screens.test.ts && npm run typecheck`
Expected: all tests in `initials-model.test.ts`, `screens.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/dom.ts src/core/ui/screen.ts src/core/ui/initials-model.ts src/core/ui/screens.ts tests/unit/initials-model.test.ts tests/unit/screens.test.ts
git commit -m "feat: add shared title, game-over, initials and leaderboard screens"
```

---

### Task 8: Shell: launch flow, crash guard, idle exit

The shell owns the game layer: title card → loading → mount → play → results, Esc and idle-60 s exits, and the crash guard (mount errors and window `error` / `unhandledrejection` while a game runs → unmount → "SYSTEM ERROR // REBOOTING" → hub). Note for tests: after triggering an async step, call `await vi.advanceTimersByTimeAsync(0)` before asserting.

**Files:**
- Create: `src/core/shell.ts`
- Test: `tests/unit/shell.test.ts`

**Interfaces:**
- Consumes:
  - `src/core/audio.ts`: `Audio`
  - `src/core/idle.ts`: `createIdleTimer`
  - `src/core/input.ts`: `Input`, `createScopedInput`
  - `src/core/scores.ts`: `Scores`
  - `src/core/stage.ts`: `Stage`, `createStage`
  - `src/core/theme.ts`: `timing`
  - `src/core/types.ts`: `GameCabinet`, `GameModule`
  - `src/core/ui/screens.ts`: `ScreenDeps`, `gameOver`, `initialsEntry`, `leaderboard`, `loadingScreen`, `systemError`, `titleCard`
- Produces:
  - `src/core/shell.ts`:

    ```ts
    export type ShellState = 'idle' | 'title' | 'loading' | 'playing' | 'results' | 'error';
    export interface ShellOptions {
      /** Full-window layer the shell owns while a game is running. Hidden otherwise. */
      layer: HTMLElement;
      audio: Audio;
      input: Input;
      scores: Scores;
      /** Called after the shell has cleaned up and hidden its layer. */
      onExit: () => void;
    }
    export interface Shell {
      readonly state: ShellState;
      /** Runs title → play → results for one cabinet. Resolves once the player is back in the hub. */
      launch(cab: GameCabinet, skipTitle?: boolean): Promise<void>;
    }
    export function createShell(opts: ShellOptions): Shell;
    ```

- [ ] **Step 1: Write the failing test**

`tests/unit/shell.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { createAudio } from '../../src/core/audio';
import { createInput, type RootInput } from '../../src/core/input';
import { createScores } from '../../src/core/scores';
import { createShell, type Shell } from '../../src/core/shell';
import type { GameCabinet, GameContext, GameModule } from '../../src/core/types';

interface FakeGame extends GameModule {
  ctx?: GameContext;
  unmounts: number;
}

function fakeGame(mountImpl?: (ctx: GameContext) => void): FakeGame {
  const g: FakeGame = {
    unmounts: 0,
    mount(container, ctx) {
      g.ctx = ctx;
      container.append(Object.assign(document.createElement('p'), { className: 'fake' }));
      mountImpl?.(ctx);
    },
    unmount() {
      g.unmounts++;
    },
  };
  return g;
}

const cabFor = (game: GameModule): GameCabinet => ({
  kind: 'game',
  id: 'fake',
  title: 'Fake',
  tagline: '',
  category: 'arcade',
  controls: [['X', 'Y']],
  load: () => Promise.resolve(game),
});
const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));

describe('shell', () => {
  let input: RootInput;
  let layer: HTMLElement;
  let onExit: Mock<() => void>;
  let shell: Shell;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    input = createInput(window);
    layer = document.createElement('div');
    document.body.append(layer);
    onExit = vi.fn<() => void>();
    shell = createShell({ layer, audio: createAudio(null), input, scores: createScores(null), onExit });
  });
  afterEach(() => {
    input.destroy();
    layer.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mounts the game in a game root and Esc returns to the hub cleanly', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    expect(layer.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('playing');
    expect(layer.querySelector('.game-root .fake')).not.toBeNull();
    press('Escape');
    await done;
    expect(game.unmounts).toBe(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(layer.hidden).toBe(true);
    expect(layer.children).toHaveLength(0);
    expect(input.handlerCount()).toBe(0);
    expect(shell.state).toBe('idle');
  });

  it('shows the title card first unless skipped', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game));
    expect(shell.state).toBe('title');
    expect(layer.querySelector('.title-card')).not.toBeNull();
    press('Escape');
    await done;
    expect(game.ctx).toBeUndefined();
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a throwing mount shows SYSTEM ERROR, then returns to the hub', async () => {
    const game = fakeGame(() => {
      throw new Error('boom');
    });
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('error');
    expect(layer.querySelector('.system-error')).not.toBeNull();
    expect(game.unmounts).toBe(1);
    await vi.advanceTimersByTimeAsync(2_500);
    await done;
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a runtime window error while playing triggers the crash guard', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('late') }));
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('error');
    await vi.advanceTimersByTimeAsync(2_500);
    await done;
    expect(game.unmounts).toBe(1);
  });

  it('endRun tears the game down once and runs the results flow', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    game.ctx!.endRun(0);
    game.ctx!.endRun(999);
    expect(game.unmounts).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(shell.state).toBe('results');
    expect(layer.querySelector('.game-over')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(5_000); // game over auto-continues; score 0 never qualifies
    expect(layer.querySelector('.leaderboard')).not.toBeNull();
    press('Escape');
    await done;
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('a qualifying score asks for initials and saves them', async () => {
    const scores = createScores(null);
    shell = createShell({ layer, audio: createAudio(null), input, scores, onExit });
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    game.ctx!.endRun(1500);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(layer.querySelector('.initials')).not.toBeNull();
    for (const k of ['z', 'a', 'k', 'Enter']) press(k);
    await vi.advanceTimersByTimeAsync(0);
    expect(layer.querySelector('li.me')?.textContent).toContain('ZAK');
    expect(scores.top('fake')[0]).toMatchObject({ initials: 'ZAK', score: 1500 });
    press('Escape');
    await done;
  });

  it('leaving the game idle for 60 s returns to the hub', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    expect(game.unmounts).toBe(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('ignores a second launch while one is running', async () => {
    const game = fakeGame();
    const done = shell.launch(cabFor(game), true);
    await shell.launch(cabFor(fakeGame()), true);
    await vi.advanceTimersByTimeAsync(0);
    expect(layer.querySelectorAll('.game-root')).toHaveLength(1);
    press('Escape');
    await done;
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/shell.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/core/shell.ts`:

```ts
import type { Audio } from './audio';
import { createIdleTimer } from './idle';
import { createScopedInput, type Input } from './input';
import type { Scores } from './scores';
import { createStage, type Stage } from './stage';
import { timing } from './theme';
import type { GameCabinet, GameModule } from './types';
import { gameOver, initialsEntry, leaderboard, loadingScreen, systemError, titleCard, type ScreenDeps } from './ui/screens';

export type ShellState = 'idle' | 'title' | 'loading' | 'playing' | 'results' | 'error';

export interface ShellOptions {
  /** Full-window layer the shell owns while a game is running. Hidden otherwise. */
  layer: HTMLElement;
  audio: Audio;
  input: Input;
  scores: Scores;
  /** Called after the shell has cleaned up and hidden its layer. */
  onExit: () => void;
}

export interface Shell {
  readonly state: ShellState;
  /** Runs title → play → results for one cabinet. Resolves once the player is back in the hub. */
  launch(cab: GameCabinet, skipTitle?: boolean): Promise<void>;
}

type RunOutcome = { kind: 'score'; score: number } | { kind: 'exit' } | { kind: 'crash'; error: unknown };

export function createShell(opts: ShellOptions): Shell {
  const { layer, audio, input, scores } = opts;
  let state: ShellState = 'idle';
  layer.hidden = true;

  /** Loads and runs one game until endRun / exit / Esc / idle / crash. Always tears the game down. */
  function play(cab: GameCabinet, ui: Stage): Promise<RunOutcome> {
    return new Promise<RunOutcome>((resolve) => {
      let finished = false;
      let game: GameModule | null = null;
      let root: Stage | null = null;
      const scoped = createScopedInput(input);
      const idle = createIdleTimer(timing.gameIdleMs, () => finish({ kind: 'exit' }));
      const hideLoading = loadingScreen(ui.el);

      const onError = (e: ErrorEvent) => finish({ kind: 'crash', error: e.error ?? e.message });
      const onRejection = (e: PromiseRejectionEvent) => finish({ kind: 'crash', error: e.reason });
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);

      function finish(outcome: RunOutcome) {
        if (finished) return;
        finished = true;
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        hideLoading();
        idle.stop();
        scoped.dispose();
        try {
          game?.unmount();
        } catch (err) {
          console.error('[shell] unmount failed', err);
        }
        root?.dispose();
        if (outcome.kind === 'crash') console.error('[shell] game crashed', outcome.error);
        resolve(outcome);
      }

      state = 'loading';
      const load = cab.load ?? (() => Promise.reject(new Error(`${cab.id} has no load()`)));
      load()
        .then(async (mod) => {
          if (finished) return;
          game = mod;
          hideLoading();
          root = createStage(layer, 'game-root');
          layer.prepend(root.el);
          scoped.onAny(() => idle.reset());
          scoped.onKey((e) => {
            if (e.key === 'Escape') {
              audio.sfx('back');
              finish({ kind: 'exit' });
            }
          });
          state = 'playing';
          idle.start();
          await mod.mount(root.el, {
            audio,
            input: scoped,
            endRun: (score) => finish({ kind: 'score', score: Math.max(0, Math.floor(score)) }),
            exit: () => finish({ kind: 'exit' }),
          });
        })
        .catch((error) => finish({ kind: 'crash', error }));
    });
  }

  async function launch(cab: GameCabinet, skipTitle = false): Promise<void> {
    if (state !== 'idle') return;
    audio.stopMusic();
    layer.hidden = false;
    const ui = createStage(layer, 'shell-ui');
    const ac = new AbortController();
    const deps: ScreenDeps = { host: ui.el, input, audio, signal: ac.signal };

    try {
      if (!skipTitle) {
        state = 'title';
        if ((await titleCard(deps, cab)) !== 'start') return;
      }
      for (;;) {
        const outcome = await play(cab, ui);
        if (outcome.kind === 'exit') return;
        if (outcome.kind === 'crash') {
          state = 'error';
          await systemError(ui.el);
          return;
        }
        state = 'results';
        await gameOver(deps, outcome.score);
        let rank = -1;
        if (scores.qualifies(cab.id, outcome.score)) {
          const initials = await initialsEntry(deps, outcome.score);
          rank = scores.add(cab.id, initials ?? '???', outcome.score);
        }
        if ((await leaderboard(deps, cab, scores.top(cab.id), rank)) !== 'again') return;
      }
    } finally {
      ac.abort();
      ui.dispose();
      layer.hidden = true;
      state = 'idle';
      opts.onExit();
    }
  }

  return {
    get state() {
      return state;
    },
    launch,
  };
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/shell.test.ts && npm run typecheck`
Expected: all tests in `shell.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/shell.ts tests/unit/shell.test.ts
git commit -m "feat: add game shell with crash guard and idle exit"
```

---

### Task 9: Carousel and synthwave background

Pure slot math (`wrapOffset`, `slotStyle`) is unit-tested; `createCarousel` positions 8 cabinets with transforms only (no layout thrash). Offsets ±1 and ±2 are visible; ±3 and beyond are hidden. The background is the striped sun, mountains and scrolling perspective grid, animated with transforms only for the 3-year-old lab PCs.

**Files:**
- Create: `src/hub/carousel.ts`
- Create: `src/hub/background.ts`
- Test: `tests/unit/carousel.test.ts`

**Interfaces:**
- Consumes:
  - `src/core/types.ts`: `Cabinet`
  - `src/core/ui/dom.ts`: `el`, `html`
  - `src/core/ui/icons.ts`: `ICONS`
- Produces:
  - `src/hub/carousel.ts`:

    ```ts
    export function wrapOffset(i: number, selected: number, n: number): number;
    export interface SlotStyle {
      x: number;
      scale: number;
      opacity: number;
      z: number;
      dim: boolean;
    }
    export function slotStyle(offset: number): SlotStyle;
    export interface CarouselOptions {
      /** Enter or a click on the centre cabinet. */
      onActivate: (cab: Cabinet) => void;
      onChange?: (cab: Cabinet) => void;
      /** Text for the station top score line, or '' for none. */
      topScore: (cab: Cabinet) => string;
    }
    export interface Carousel {
      el: HTMLElement;
      readonly selected: number;
      current(): Cabinet;
      select(i: number): void;
      next(): void;
      prev(): void;
      /** Re-reads top scores (after a run). */
      refresh(): void;
    }
    export function createCarousel(cabinets: Cabinet[], opts: CarouselOptions): Carousel;
    ```

  - `src/hub/background.ts`:

    ```ts
    export function createBackground(): HTMLElement;
    ```

- [ ] **Step 1: Write the failing test**

`tests/unit/carousel.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createCarousel, slotStyle, wrapOffset } from '../../src/hub/carousel';
import { CABINETS } from '../../src/games/registry';

describe('carousel math', () => {
  it('wraps offsets the short way around a ring of 8', () => {
    expect(wrapOffset(0, 0, 8)).toBe(0);
    expect(wrapOffset(1, 0, 8)).toBe(1);
    expect(wrapOffset(7, 0, 8)).toBe(-1);
    expect(wrapOffset(6, 0, 8)).toBe(-2);
    expect(wrapOffset(0, 7, 8)).toBe(1);
    expect(wrapOffset(4, 0, 8)).toBe(-4);
  });

  it('shows the centre plus two neighbours per side', () => {
    expect(slotStyle(0)).toMatchObject({ x: 0, scale: 1, opacity: 1, dim: false });
    expect(slotStyle(-1).x).toBe(-470);
    expect(slotStyle(2).opacity).toBeGreaterThan(0);
    expect(slotStyle(3).opacity).toBe(0);
    expect(slotStyle(-4).opacity).toBe(0);
  });
});

describe('carousel', () => {
  const make = () => {
    const onActivate = vi.fn();
    const onChange = vi.fn();
    const c = createCarousel(CABINETS, { onActivate, onChange, topScore: () => '★ TOP ZAK 900' });
    document.body.append(c.el);
    return { c, onActivate, onChange };
  };

  it('wraps next/prev and reports changes', () => {
    const { c, onChange } = make();
    c.prev();
    expect(c.selected).toBe(7);
    expect(c.current().id).toBe('classic');
    c.next();
    expect(c.selected).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);
    c.el.remove();
  });

  it('click on a side cabinet rotates; click on the centre activates', () => {
    const { c, onActivate } = make();
    const cards = c.el.querySelectorAll<HTMLButtonElement>('.cabinet');
    cards[1].click();
    expect(c.selected).toBe(1);
    expect(onActivate).not.toHaveBeenCalled();
    cards[1].click();
    expect(onActivate).toHaveBeenCalledWith(CABINETS[1]);
    expect(cards[1].classList.contains('is-center')).toBe(true);
    c.el.remove();
  });

  it('marks unbuilt games COMING SOON and shows the Classic note', () => {
    const { c } = make();
    expect(c.el.querySelector('[data-id="invaders"] .soon')).not.toBeNull();
    expect(c.el.querySelector('[data-id="classic"] .cab-note')?.textContent).toContain('Alt+');
    c.el.remove();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/carousel.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/hub/carousel.ts`:

```ts
import type { Cabinet } from '../core/types';
import { el, html } from '../core/ui/dom';
import { ICONS } from '../core/ui/icons';

/** Signed distance of cabinet i from the selected one, the short way around the ring. */
export function wrapOffset(i: number, selected: number, n: number): number {
  const half = Math.floor(n / 2);
  return ((((i - selected) % n) + n + half) % n) - half;
}

export interface SlotStyle {
  x: number;
  scale: number;
  opacity: number;
  z: number;
  dim: boolean;
}

/** Layout for each ring position: centre, two visible neighbours per side, the rest hidden off to the side. */
export function slotStyle(offset: number): SlotStyle {
  const a = Math.abs(offset);
  const side = Math.sign(offset);
  if (a === 0) return { x: 0, scale: 1, opacity: 1, z: 10, dim: false };
  if (a === 1) return { x: side * 470, scale: 0.56, opacity: 1, z: 8, dim: true };
  if (a === 2) return { x: side * 760, scale: 0.44, opacity: 0.85, z: 6, dim: true };
  return { x: side * 1000, scale: 0.36, opacity: 0, z: 4, dim: true };
}

const TAGS: Record<Cabinet['category'], string> = { arcade: 'ARCADE', learn: 'LEARN', classic: 'LAST YEAR' };

export interface CarouselOptions {
  /** Enter or a click on the centre cabinet. */
  onActivate: (cab: Cabinet) => void;
  onChange?: (cab: Cabinet) => void;
  /** Text for the station top score line, or '' for none. */
  topScore: (cab: Cabinet) => string;
}

export interface Carousel {
  el: HTMLElement;
  readonly selected: number;
  current(): Cabinet;
  select(i: number): void;
  next(): void;
  prev(): void;
  /** Re-reads top scores (after a run). */
  refresh(): void;
}

export function createCarousel(cabinets: Cabinet[], opts: CarouselOptions): Carousel {
  const n = cabinets.length;
  let selected = 0;
  const root = el('div.carousel');

  const cards = cabinets.map((cab, i) => {
    const score = el('div.cab-score');
    const card = el(
      `button.cabinet.accent-${cab.category}`,
      { type: 'button', 'data-id': cab.id, tabindex: -1 },
      html('div.cab-icon', ICONS[cab.id] ?? ''),
      el('div.cab-title', {}, cab.title),
      el('div.cab-tag', {}, TAGS[cab.category]),
      el('div.cab-tagline', {}, cab.tagline),
      cab.kind === 'link'
        ? el('div.cab-note', {}, cab.note)
        : cab.load
          ? score
          : el('div.cab-note.soon', {}, 'COMING SOON'),
    );
    card.addEventListener('click', () => {
      if (i === selected) opts.onActivate(cab);
      else carousel.select(i);
    });
    root.append(card);
    return { card, score, cab };
  });

  const layout = () => {
    cards.forEach(({ card }, i) => {
      const s = slotStyle(wrapOffset(i, selected, n));
      card.style.transform = `translate(-50%, -50%) translateX(${s.x}px) scale(${s.scale})`;
      card.style.opacity = String(s.opacity);
      card.style.zIndex = String(s.z);
      card.classList.toggle('is-center', s.x === 0);
      card.classList.toggle('is-dim', s.dim);
      card.style.pointerEvents = s.opacity === 0 ? 'none' : '';
    });
  };

  const refresh = () => {
    for (const { score, cab } of cards) score.textContent = opts.topScore(cab);
  };

  const carousel: Carousel = {
    el: root,
    get selected() {
      return selected;
    },
    current: () => cabinets[selected],
    select(i) {
      const next = ((i % n) + n) % n;
      if (next === selected) return;
      selected = next;
      layout();
      opts.onChange?.(cabinets[selected]);
    },
    next: () => carousel.select(selected + 1),
    prev: () => carousel.select(selected - 1),
    refresh,
  };

  refresh();
  layout();
  return carousel;
}
```

`src/hub/background.ts`:

```ts
import { el } from '../core/ui/dom';

/** Full-bleed synthwave scene: stars, striped sun, mountains, scrolling perspective grid. Pure CSS animation. */
export function createBackground(): HTMLElement {
  const stars = el('div.bg-stars');
  for (let i = 0; i < 90; i++) {
    const s = el('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 55}%`;
    s.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
    s.style.opacity = (0.3 + Math.random() * 0.7).toFixed(2);
    stars.append(s);
  }
  const mountains = el('div.bg-mountains');
  mountains.innerHTML =
    '<svg viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0 200 L120 110 L210 160 L340 60 L470 150 L560 100 L700 170 L800 120 L900 170 L1040 90 L1150 150 L1260 70 L1400 160 L1500 110 L1600 150 L1600 200Z"/>' +
    '</svg>';
  return el(
    'div.hub-bg',
    { 'aria-hidden': 'true' },
    stars,
    el('div.bg-sun-glow'),
    el('div.bg-sun'),
    mountains,
    el('div.bg-horizon'),
    el('div.bg-floor', {}, el('div.bg-grid')),
  );
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/carousel.test.ts && npm run typecheck`
Expected: all tests in `carousel.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/hub/carousel.ts src/hub/background.ts tests/unit/carousel.test.ts
git commit -m "feat: add cabinet carousel and synthwave background"
```

---

### Task 10: Hub: navigation, attract mode, reset shortcut

Arrow keys / click rotate, Enter launches (coming-soon cabinets shake), link cabinets navigate in the same tab, 30 s idle starts attract mode, and the hidden **Ctrl+Alt+X** clears all boards after an on-screen confirm.

**Files:**
- Create: `src/hub/hub.ts`
- Test: `tests/unit/hub.test.ts`

**Interfaces:**
- Consumes:
  - `src/core/audio.ts`: `Audio`
  - `src/core/idle.ts`: `createIdleTimer`
  - `src/core/input.ts`: `Input`
  - `src/core/scores.ts`: `Scores`, `formatScore`
  - `src/core/stage.ts`: `createStage`
  - `src/core/theme.ts`: `timing`
  - `src/core/types.ts`: `Cabinet`, `GameCabinet`
  - `src/core/ui/dom.ts`: `el`
  - `src/hub/background.ts`: `createBackground`
  - `src/hub/carousel.ts`: `createCarousel`
- Produces:
  - `src/hub/hub.ts`:

    ```ts
    export interface HubOptions {
      layer: HTMLElement;
      cabinets: Cabinet[];
      audio: Audio;
      input: Input;
      scores: Scores;
      onLaunch: (cab: GameCabinet) => void;
      /** Navigation for link cabinets. Injected so tests don't leave the page. */
      nav?: { assign(url: string): void };
    }
    export interface Hub {
      readonly visible: boolean;
      readonly attract: boolean;
      show(): void;
      hide(): void;
    }
    export function createHub(opts: HubOptions): Hub;
    ```

- [ ] **Step 1: Write the failing test**

`tests/unit/hub.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/core/audio';
import { createInput, type RootInput } from '../../src/core/input';
import { createScores, type Scores } from '../../src/core/scores';
import type { Cabinet, GameCabinet } from '../../src/core/types';
import { createHub, type Hub } from '../../src/hub/hub';

const game = (id: string, load = true): GameCabinet => ({
  kind: 'game',
  id,
  title: id,
  tagline: '',
  category: 'arcade',
  controls: [],
  load: load ? () => Promise.reject(new Error('not used')) : undefined,
});
const cabinets: Cabinet[] = [
  game('one'),
  game('soon', false),
  game('three'),
  { kind: 'link', id: 'classic', title: 'C', tagline: '', category: 'classic', href: 'https://example.com/', note: 'n' },
];
const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));
const selected = () => document.querySelector('.cabinet.is-center')?.getAttribute('data-id');

describe('hub', () => {
  let input: RootInput;
  let layer: HTMLElement;
  let scores: Scores;
  let hub: Hub;
  let onLaunch: ReturnType<typeof vi.fn<(cab: GameCabinet) => void>>;
  let assign: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    input = createInput(window);
    layer = document.createElement('div');
    document.body.append(layer);
    scores = createScores(null);
    onLaunch = vi.fn();
    assign = vi.fn();
    hub = createHub({ layer, cabinets, audio: createAudio(null), input, scores, onLaunch, nav: { assign } });
    hub.show();
  });
  afterEach(() => {
    hub.hide();
    input.destroy();
    layer.remove();
    vi.useRealTimers();
  });

  it('rotates with the arrow keys', () => {
    expect(selected()).toBe('one');
    press('ArrowRight');
    expect(selected()).toBe('soon');
    press('ArrowLeft');
    press('ArrowLeft');
    expect(selected()).toBe('classic');
  });

  it('launches a playable game and hides itself', () => {
    press('Enter');
    expect(onLaunch).toHaveBeenCalledWith(cabinets[0]);
    expect(hub.visible).toBe(false);
    expect(layer.hidden).toBe(true);
    expect(input.handlerCount()).toBe(0);
  });

  it('does not launch a COMING SOON cabinet', () => {
    press('ArrowRight');
    press('Enter');
    expect(onLaunch).not.toHaveBeenCalled();
    expect(document.querySelector('[data-id="soon"]')?.classList.contains('shake')).toBe(true);
  });

  it('navigates for link cabinets', () => {
    press('ArrowLeft');
    press('Enter');
    expect(assign).toHaveBeenCalledWith('https://example.com/');
  });

  it('enters attract mode after 30 s and auto-advances', () => {
    vi.advanceTimersByTime(30_000);
    expect(hub.attract).toBe(true);
    vi.advanceTimersByTime(4_000);
    expect(selected()).toBe('soon');
  });

  it('the key that wakes attract mode does nothing else', () => {
    vi.advanceTimersByTime(30_000);
    press('Enter');
    expect(hub.attract).toBe(false);
    expect(onLaunch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(29_000);
    expect(hub.attract).toBe(false);
  });

  it('Ctrl+Alt+X asks before clearing scores', () => {
    scores.add('one', 'ZAK', 900);
    press('x', { ctrlKey: true, altKey: true, code: 'KeyX' });
    expect(document.querySelector<HTMLElement>('.confirm')!.hidden).toBe(false);
    press('n');
    expect(scores.top('one')).toHaveLength(1);
    press('x', { ctrlKey: true, altKey: true, code: 'KeyX' });
    press('y');
    expect(scores.top('one')).toHaveLength(0);
    expect(document.querySelector('[data-id="one"] .cab-score')?.textContent).toContain('NO SCORES');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/hub.test.ts`
Expected: FAIL with `Failed to resolve import` for the module(s) below, because they do not exist yet.

- [ ] **Step 3: Write the implementation**

`src/hub/hub.ts`:

```ts
import type { Audio } from '../core/audio';
import { createIdleTimer } from '../core/idle';
import type { Input } from '../core/input';
import { formatScore, type Scores } from '../core/scores';
import { createStage } from '../core/stage';
import { timing } from '../core/theme';
import type { Cabinet, GameCabinet } from '../core/types';
import { el } from '../core/ui/dom';
import { createBackground } from './background';
import { createCarousel } from './carousel';

export interface HubOptions {
  layer: HTMLElement;
  cabinets: Cabinet[];
  audio: Audio;
  input: Input;
  scores: Scores;
  onLaunch: (cab: GameCabinet) => void;
  /** Navigation for link cabinets. Injected so tests don't leave the page. */
  nav?: { assign(url: string): void };
}

export interface Hub {
  readonly visible: boolean;
  readonly attract: boolean;
  show(): void;
  hide(): void;
}

export function createHub(opts: HubOptions): Hub {
  const { layer, audio, input, scores } = opts;
  const nav = opts.nav ?? location;
  layer.hidden = true;
  layer.append(createBackground());
  const stage = createStage(layer, 'hub-stage');

  const carousel = createCarousel(opts.cabinets, {
    onActivate: (cab) => activate(cab),
    onChange: () => audio.sfx('move'),
    topScore: (cab) => {
      const best = scores.top(cab.id)[0];
      return best ? `★ TOP  ${best.initials}  ${formatScore(best.score)}` : 'NO SCORES YET · BE THE FIRST';
    },
  });
  const attractOverlay = el('div.attract', {}, el('p.blink', {}, 'PRESS ANY KEY'));
  const confirm = el(
    'div.confirm',
    {},
    el('h2', {}, 'CLEAR ALL HIGH SCORES?'),
    el('p', {}, 'Y = YES · N = NO'),
  );
  confirm.hidden = true;

  stage.el.append(
    el('header.hub-logo', {}, el('h1.chrome', {}, 'CYBER ARCADE'), el('p.hub-sub', {}, 'DEFEND THE NETWORK · PRESS START')),
    carousel.el,
    el('footer.hub-footer', {}, '◀ ▶ SELECT  ·  ENTER PLAY  ·  M MUTE'),
    attractOverlay,
    confirm,
  );

  let visible = false;
  let attract = false;
  let attractTimer: ReturnType<typeof setInterval> | undefined;
  let wakeEvent: Event | null = null;
  let offs: (() => void)[] = [];

  const idle = createIdleTimer(timing.hubIdleMs, () => setAttract(true));

  function setAttract(on: boolean) {
    attract = on;
    layer.classList.toggle('is-attract', on);
    clearInterval(attractTimer);
    attractTimer = on ? setInterval(() => carousel.select(carousel.selected + 1), timing.attractStepMs) : undefined;
    if (!on && visible) idle.start();
  }

  function shake(cab: Cabinet) {
    const card = carousel.el.querySelector<HTMLElement>(`[data-id="${cab.id}"]`);
    card?.classList.remove('shake');
    void card?.offsetWidth; // restart the animation
    card?.classList.add('shake');
  }

  function activate(cab: Cabinet) {
    if (cab.kind === 'link') {
      audio.sfx('select');
      nav.assign(cab.href);
      return;
    }
    if (!cab.load) {
      audio.sfx('error');
      shake(cab);
      return;
    }
    audio.sfx('select');
    hub.hide();
    opts.onLaunch(cab);
  }

  function onKey(e: KeyboardEvent) {
    if (e === wakeEvent) return; // the key that ended attract mode does nothing else
    if (!confirm.hidden) {
      if (e.key === 'y' || e.key === 'Y') {
        scores.clearAll();
        carousel.refresh();
        audio.sfx('explode');
        confirm.hidden = true;
      } else if (['n', 'N', 'Escape'].includes(e.key)) {
        audio.sfx('back');
        confirm.hidden = true;
      }
      return;
    }
    if (e.ctrlKey && e.altKey && e.code === 'KeyX') {
      confirm.hidden = false;
      return;
    }
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
        carousel.prev();
        break;
      case 'ArrowRight':
      case 'd':
        carousel.next();
        break;
      case 'Enter':
      case ' ':
        if (!e.repeat) activate(carousel.current());
        break;
    }
  }

  function onAny(e: Event) {
    if (attract && e.type !== 'pointermove') {
      wakeEvent = e;
      setAttract(false);
      return;
    }
    idle.reset();
  }

  const hub: Hub = {
    get visible() {
      return visible;
    },
    get attract() {
      return attract;
    },
    show() {
      if (visible) return;
      visible = true;
      layer.hidden = false;
      stage.fit();
      carousel.refresh();
      offs = [input.onAny(onAny), input.onKey(onKey)];
      idle.start();
      audio.playMusic();
    },
    hide() {
      if (!visible) return;
      visible = false;
      for (const off of offs) off();
      offs = [];
      idle.stop();
      setAttract(false);
      confirm.hidden = true;
      layer.hidden = true;
    },
  };
  return hub;
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/unit/hub.test.ts && npm run typecheck`
Expected: all tests in `hub.test.ts` PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/hub/hub.ts tests/unit/hub.test.ts
git commit -m "feat: add hub with attract mode and score reset"
```

---

### Task 11: Start splash, mute indicator, boot entry and styles

Wires everything into a running page. The "CLICK TO START" splash is required anyway, because browsers only allow audio and fullscreen after a user gesture; it calls `requestFullscreen()` synchronously inside the gesture, then unlocks audio. The game layer gets its own (dimmed) copy of the background so title and results screens are never a flat color; `.game-layer:has(.game-root) .hub-bg` hides it while a game runs, so games pay no background cost.

Performance rules for all CSS (the lab PCs are 3 years old): animate only `transform` and `opacity`; no `backdrop-filter`; no animated `filter` or `background-position`.

**Files:**
- Create: `src/hub/splash.ts`
- Create: `src/core/ui/mute-indicator.ts`
- Create: `src/main.ts`
- Create: `src/styles/base.css`
- Create: `src/styles/screens.css`
- Create: `src/hub/hub.css`

**Interfaces:**
- Consumes:
  - `src/core/audio.ts`: `Audio`, `createAudio`
  - `src/core/input.ts`: `createInput`, `isTextEntry`
  - `src/core/scores.ts`: `createScores`
  - `src/core/shell.ts`: `createShell`
  - `src/core/theme.ts`: `applyTheme`
  - `src/core/ui/dom.ts`: `el`
  - `src/games/registry.ts`: `getCabinets`
  - `src/hub/background.ts`: `createBackground`
  - `src/hub/hub.ts`: `createHub`
- Produces:
  - `src/hub/splash.ts`:

    ```ts
    export function showSplash(parent: HTMLElement, audio: Audio, onStart: () => void): void;
    ```

  - `src/core/ui/mute-indicator.ts`:

    ```ts
    export function createMuteIndicator(audio: Audio): { el: HTMLElement; update(): void };
    ```


- [ ] **Step 1: Write the splash and mute indicator**

`src/hub/splash.ts`:

```ts
import type { Audio } from '../core/audio';
import { el } from '../core/ui/dom';

/**
 * First screen. Browsers allow audio and fullscreen only after a user gesture,
 * so one click (or key) here unlocks both, then hands over to the hub.
 */
export function showSplash(parent: HTMLElement, audio: Audio, onStart: () => void): void {
  const root = el(
    'div.splash',
    {},
    el('h1.chrome', {}, 'CYBER ARCADE'),
    el('p.blink', {}, 'CLICK TO START'),
    el('p.splash-note', {}, 'Fullscreen · sound on · M to mute'),
  );
  parent.append(root);

  const start = async () => {
    root.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
    // Must run synchronously inside the gesture handler.
    document.documentElement.requestFullscreen?.().catch(() => {});
    await audio.unlock().catch(() => {});
    root.classList.add('leaving');
    setTimeout(() => root.remove(), 400);
    onStart();
  };
  root.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}
```

`src/core/ui/mute-indicator.ts`:

```ts
import type { Audio } from '../audio';
import { el } from './dom';

const ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6"/></svg>';

/** Fixed speaker icon in the top-right corner. Click toggles mute; call update() after M. */
export function createMuteIndicator(audio: Audio): { el: HTMLElement; update(): void } {
  const button = el('button.mute-indicator', { type: 'button', tabindex: -1, 'aria-label': 'Toggle sound' });
  const update = () => {
    button.innerHTML = audio.muted ? OFF : ON;
    button.classList.toggle('is-muted', audio.muted);
  };
  button.addEventListener('click', () => {
    audio.toggleMute();
    update();
  });
  update();
  return { el: button, update };
}
```

- [ ] **Step 2: Write the boot entry**

`src/main.ts`:

```ts
import '@fontsource/audiowide/400.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import './styles/base.css';
import './styles/screens.css';
import './hub/hub.css';

import { createAudio } from './core/audio';
import { createInput, isTextEntry } from './core/input';
import { createScores } from './core/scores';
import { createShell } from './core/shell';
import { applyTheme } from './core/theme';
import { el } from './core/ui/dom';
import { createMuteIndicator } from './core/ui/mute-indicator';
import { getCabinets } from './games/registry';
import { createBackground } from './hub/background';
import { createHub } from './hub/hub';
import { showSplash } from './hub/splash';

declare global {
  interface Window {
    __arcadeDebug?: { handlerCount(): number };
  }
}

applyTheme();
const app = document.getElementById('app')!;
const hubLayer = el('div.layer.hub-layer');
const gameLayer = el('div.layer.game-layer');
gameLayer.append(createBackground()); // backdrop for title / results screens
app.append(hubLayer, gameLayer);

const input = createInput(window);
const audio = createAudio();
const scores = createScores();
const mute = createMuteIndicator(audio);
app.append(mute.el);

const shell = createShell({ layer: gameLayer, audio, input, scores, onExit: () => hub.show() });
const hub = createHub({
  layer: hubLayer,
  cabinets: getCabinets(),
  audio,
  input,
  scores,
  onLaunch: (cab) => void shell.launch(cab),
});

input.onKey((e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey && !isTextEntry(e)) {
    audio.toggleMute();
    mute.update();
  }
});

if (new URLSearchParams(location.search).has('selftest')) {
  window.__arcadeDebug = { handlerCount: () => input.handlerCount() };
}

showSplash(app, audio, () => hub.show());
```

- [ ] **Step 3: Write the styles**

`src/styles/base.css`:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: var(--c-deep);
  color: var(--c-ink);
  font-family: var(--f-ui);
  -webkit-font-smoothing: antialiased;
  user-select: none;
  cursor: default;
}

#app {
  position: fixed;
  inset: 0;
}

[hidden] {
  display: none !important;
}

button {
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

button:focus {
  outline: none;
}

/* Fixed 1920×1080 design surface, scaled to fit and centred (see core/stage.ts). */
.stage {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1920px;
  height: 1080px;
  transform: translate(-50%, -50%) scale(var(--stage-scale, 1));
  transform-origin: center;
}

.layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.game-layer {
  background: var(--c-deep);
}

/* Paint order inside the game layer: backdrop, then the game, then shell screens. */
.game-layer > .hub-bg {
  z-index: 0;
}

.game-layer > .game-root {
  z-index: 1;
}

.game-layer > .shell-ui {
  z-index: 2;
}

.shell-ui {
  pointer-events: none;
}

.shell-ui > * {
  pointer-events: auto;
}

/* Category accents: every screen and cabinet sets --accent from its category. */
.accent-arcade {
  --accent: var(--c-cyan);
}

.accent-learn {
  --accent: var(--c-pink);
}

.accent-classic {
  --accent: var(--c-grey);
}

/* Chrome logo lettering. */
.chrome {
  margin: 0;
  font-family: var(--f-display);
  font-weight: 400;
  letter-spacing: 0.08em;
  background: linear-gradient(180deg, #fff 0%, #fff 38%, #7ab8ff 50%, #2a0750 52%, #ffb6e6 62%, #fff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 12px var(--c-pink)) drop-shadow(0 0 32px rgba(255, 46, 136, 0.5));
}

.neon {
  margin: 0;
  font-family: var(--f-display);
  font-weight: 400;
  color: #fff;
  text-shadow:
    0 0 6px var(--accent, var(--c-cyan)),
    0 0 18px var(--accent, var(--c-cyan)),
    0 0 42px var(--accent, var(--c-cyan));
}

.blink {
  animation: blink 1.2s steps(1) infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* Glitch heading: needs data-text equal to its text. */
.glitch {
  position: relative;
  margin: 0;
  font-family: var(--f-display);
  font-weight: 400;
  color: #fff;
  text-shadow: 0 0 20px var(--c-pink);
}

.glitch::before,
.glitch::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.glitch::before {
  color: var(--c-cyan);
  animation: glitch-a 2.4s infinite linear alternate-reverse;
}

.glitch::after {
  color: var(--c-pink);
  animation: glitch-b 1.9s infinite linear alternate-reverse;
}

@keyframes glitch-a {
  0%, 82%, 100% { clip-path: inset(0 0 100% 0); transform: none; }
  84% { clip-path: inset(10% 0 60% 0); transform: translateX(-6px); }
  88% { clip-path: inset(55% 0 20% 0); transform: translateX(6px); }
  92% { clip-path: inset(30% 0 45% 0); transform: translateX(-3px); }
}

@keyframes glitch-b {
  0%, 76%, 100% { clip-path: inset(0 0 100% 0); transform: none; }
  78% { clip-path: inset(65% 0 5% 0); transform: translateX(5px); }
  83% { clip-path: inset(20% 0 62% 0); transform: translateX(-5px); }
  87% { clip-path: inset(40% 0 35% 0); transform: translateX(4px); }
}

/* Splash */
.splash {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2vh;
  background: radial-gradient(ellipse at 50% 70%, #3a0a5e 0%, var(--c-deep) 65%);
  cursor: pointer;
  transition: opacity 0.4s;
}

.splash.leaving {
  opacity: 0;
  pointer-events: none;
}

.splash .chrome {
  font-size: min(9vw, 16vh);
}

.splash .blink {
  margin: 0;
  font-family: var(--f-display);
  font-size: min(2.4vw, 4vh);
  letter-spacing: 0.3em;
  color: var(--c-cyan);
  text-shadow: 0 0 12px var(--c-cyan);
}

.splash-note {
  margin: 0;
  font-family: var(--f-mono);
  font-size: min(1.1vw, 2vh);
  color: var(--c-ink-dim);
  opacity: 0.7;
  letter-spacing: 0.15em;
}

/* Mute indicator */
.mute-indicator {
  position: fixed;
  top: 1.6vh;
  right: 1.6vh;
  z-index: 90;
  width: 4.4vh;
  height: 4.4vh;
  padding: 0.8vh;
  border-radius: 50%;
  color: var(--c-cyan);
  background: rgba(14, 0, 32, 0.55);
  border: 1px solid rgba(0, 240, 255, 0.4);
  filter: drop-shadow(0 0 6px var(--c-cyan));
  opacity: 0.75;
}

.mute-indicator.is-muted {
  color: var(--c-pink);
  border-color: rgba(255, 46, 136, 0.5);
  filter: drop-shadow(0 0 6px var(--c-pink));
}

.mute-indicator svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* Self-test game (hidden, ?selftest) */
.selftest {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  font-size: 32px;
}

.selftest button {
  padding: 16px 48px;
  border: 2px solid var(--c-cyan);
  border-radius: 8px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

`src/styles/screens.css`:

```css
/* Shared full-stage screens: title card, loading, game over, initials, leaderboard, system error. */
.screen {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  text-align: center;
  background: radial-gradient(ellipse at 50% 45%, rgba(14, 0, 32, 0.55) 0%, rgba(14, 0, 32, 0.88) 75%);
  animation: screen-in 0.35s ease-out;
}

@keyframes screen-in {
  from {
    opacity: 0;
    transform: scale(1.04);
  }
}

.screen .label {
  margin: 0;
  font-family: var(--f-mono);
  font-size: 30px;
  letter-spacing: 0.3em;
  color: var(--c-ink-dim);
}

.screen .hint {
  position: absolute;
  bottom: 56px;
  margin: 0;
  font-family: var(--f-mono);
  font-size: 26px;
  letter-spacing: 0.2em;
  color: var(--c-ink-dim);
  opacity: 0.75;
}

.screen .blink {
  margin: 24px 0 0;
  font-family: var(--f-display);
  font-size: 44px;
  letter-spacing: 0.2em;
  color: var(--c-yellow);
  text-shadow: 0 0 16px var(--c-yellow);
}

/* Title card */
.title-icon {
  width: 220px;
  height: 220px;
  color: var(--accent);
  filter: drop-shadow(0 0 10px var(--accent)) drop-shadow(0 0 30px var(--accent));
}

.title-icon svg {
  width: 100%;
  height: 100%;
}

.title-name {
  margin: 0;
  font-family: var(--f-display);
  font-weight: 400;
  font-size: 120px;
  letter-spacing: 0.04em;
  color: #fff;
  text-shadow: 0 0 10px var(--accent), 0 0 40px var(--accent);
}

.title-tagline {
  max-width: 1200px;
  margin: 0;
  font-size: 38px;
  line-height: 1.35;
  color: var(--c-ink-dim);
}

.controls {
  display: flex;
  gap: 56px;
  margin-top: 16px;
}

.control {
  display: flex;
  align-items: center;
  gap: 20px;
  font-size: 34px;
  font-weight: 600;
}

kbd {
  min-width: 80px;
  padding: 12px 22px;
  border: 2px solid var(--accent);
  border-radius: 10px;
  font-family: var(--f-mono);
  font-size: 30px;
  font-weight: 700;
  color: var(--accent);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 0 14px color-mix(in srgb, var(--accent) 50%, transparent), inset 0 -4px 0 rgba(0, 0, 0, 0.4);
}

/* Loading */
.loading p {
  margin: 0;
  font-family: var(--f-mono);
  font-size: 36px;
  letter-spacing: 0.3em;
  color: var(--c-cyan);
}

.spinner {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: 6px solid rgba(0, 240, 255, 0.15);
  border-top-color: var(--c-cyan);
  border-right-color: var(--c-pink);
  animation: spin 0.9s linear infinite;
  filter: drop-shadow(0 0 12px var(--c-cyan));
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Game over */
.game-over .glitch {
  font-size: 200px;
}

.final-score {
  font-family: var(--f-mono);
  font-weight: 700;
  font-size: 140px;
  color: var(--c-yellow);
  text-shadow: 0 0 20px rgba(255, 226, 89, 0.7);
  font-variant-numeric: tabular-nums;
}

/* Initials */
.initials .neon {
  font-size: 110px;
  --accent: var(--c-pink);
}

.initials .final-score {
  font-size: 90px;
}

.slots {
  display: flex;
  gap: 40px;
}

.slot {
  width: 170px;
  height: 210px;
  display: grid;
  place-items: center;
  border: 3px solid rgba(0, 240, 255, 0.35);
  border-radius: 14px;
  font-family: var(--f-display);
  font-size: 150px;
  color: #fff;
  background: rgba(0, 240, 255, 0.05);
}

.slot.active {
  border-color: var(--c-cyan);
  box-shadow: 0 0 30px var(--c-cyan), inset 0 0 24px rgba(0, 240, 255, 0.3);
  animation: slot-pulse 0.9s ease-in-out infinite;
}

@keyframes slot-pulse {
  50% {
    box-shadow: 0 0 12px var(--c-cyan), inset 0 0 10px rgba(0, 240, 255, 0.2);
  }
}

/* Leaderboard */
.leaderboard .neon {
  font-size: 96px;
}

.board {
  width: 900px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--f-mono);
  font-size: 44px;
}

.board li {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  padding: 6px 28px;
  border-radius: 8px;
}

.board li:nth-child(odd) {
  background: rgba(255, 255, 255, 0.04);
}

.board .rank {
  color: var(--c-ink-dim);
  text-align: left;
}

.board .who {
  text-align: left;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.board .pts {
  color: var(--c-yellow);
  font-variant-numeric: tabular-nums;
}

.board li.me {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  box-shadow: 0 0 24px color-mix(in srgb, var(--accent) 60%, transparent);
  animation: blink 1s steps(1) 4;
}

.board li.empty {
  display: block;
  text-align: center;
  color: var(--c-ink-dim);
}

/* System error */
.system-error {
  background: rgba(40, 0, 10, 0.92);
}

.system-error .glitch {
  font-size: 150px;
  text-shadow: 0 0 24px var(--c-danger);
}

.system-error p {
  margin: 0;
  font-family: var(--f-mono);
  font-size: 48px;
  letter-spacing: 0.3em;
  color: var(--c-danger);
}
```

`src/hub/hub.css`:

```css
/* ---------- Background (full-bleed, outside the stage) ---------- */
/* Also used behind the shell screens; hidden while a game is mounted so it costs nothing during play. */
.game-layer .hub-bg {
  filter: brightness(0.55);
}

.game-layer:has(.game-root) .hub-bg {
  display: none;
}

.hub-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: linear-gradient(180deg, #07000f 0%, var(--c-deep) 25%, var(--c-purple) 52%, #5a0f5e 58%);
}

.bg-stars i {
  position: absolute;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: #fff;
  animation: twinkle 4s ease-in-out infinite;
}

@keyframes twinkle {
  50% {
    transform: scale(0.3);
  }
}

.bg-sun-glow {
  position: absolute;
  left: 50%;
  top: 58%;
  width: 90vh;
  height: 90vh;
  transform: translate(-50%, -62%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 46, 136, 0.45) 0%, rgba(255, 46, 136, 0.12) 40%, transparent 70%);
}

.bg-sun {
  position: absolute;
  left: 50%;
  top: 58%;
  width: 52vh;
  height: 52vh;
  transform: translate(-50%, -88%);
  border-radius: 50%;
  background: linear-gradient(180deg, var(--c-yellow) 0%, #ff8a4c 45%, var(--c-pink) 80%);
  -webkit-mask: linear-gradient(180deg, #000 0 45%, transparent 45% 49%, #000 49% 58%, transparent 58% 63%, #000 63% 70%, transparent 70% 76%, #000 76% 82%, transparent 82% 89%, #000 89% 93%, transparent 93%);
  mask: linear-gradient(180deg, #000 0 45%, transparent 45% 49%, #000 49% 58%, transparent 58% 63%, #000 63% 70%, transparent 70% 76%, #000 76% 82%, transparent 82% 89%, #000 89% 93%, transparent 93%);
  filter: drop-shadow(0 0 30px rgba(255, 46, 136, 0.8));
  opacity: 0.92;
}

.bg-mountains {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(58% - 12vh);
  height: 12vh;
}

.bg-mountains svg {
  width: 100%;
  height: 100%;
  display: block;
}

.bg-mountains path {
  fill: #12002a;
  stroke: var(--c-cyan);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 6px var(--c-cyan));
}

.bg-horizon {
  position: absolute;
  left: 0;
  right: 0;
  top: 58%;
  height: 3px;
  background: var(--c-pink);
  box-shadow: 0 0 18px 4px var(--c-pink);
}

.bg-floor {
  position: absolute;
  left: 0;
  right: 0;
  top: 58%;
  bottom: 0;
  overflow: hidden;
  perspective: 32vh;
  perspective-origin: 50% 0%;
  background: linear-gradient(180deg, #2a0640 0%, #0b0018 100%);
}

.bg-grid {
  position: absolute;
  left: -100%;
  right: -100%;
  top: 0;
  height: 200%;
  transform-origin: 50% 0;
  transform: rotateX(72deg);
  background-image:
    linear-gradient(var(--c-pink) 3px, transparent 3px),
    linear-gradient(90deg, var(--c-pink) 3px, transparent 3px);
  background-size: 9vh 9vh;
  background-position: center 0;
  animation: grid-scroll 1.6s linear infinite;
  will-change: transform;
}

/* Animates transform only (compositor), not background-position, which would repaint every frame. */
@keyframes grid-scroll {
  to {
    transform: rotateX(72deg) translateY(9vh);
  }
}

/* ---------- Stage content ---------- */
.hub-logo {
  position: absolute;
  top: 50px;
  left: 0;
  right: 0;
  text-align: center;
}

.hub-logo .chrome {
  font-size: 128px;
  line-height: 1;
}

.hub-sub {
  margin: 14px 0 0;
  font-family: var(--f-mono);
  font-size: 26px;
  letter-spacing: 0.5em;
  color: var(--c-ink-dim);
  text-shadow: 0 0 10px var(--c-pink);
}

.hub-footer {
  position: absolute;
  bottom: 40px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: var(--f-mono);
  font-size: 26px;
  letter-spacing: 0.25em;
  color: var(--c-ink-dim);
  white-space: pre;
}

/* ---------- Carousel ---------- */
.carousel {
  position: absolute;
  left: 0;
  right: 0;
  top: 300px;
  height: 620px;
}

.cabinet {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 600px;
  height: 600px;
  padding: 44px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  border-radius: 24px;
  border: 3px solid var(--accent);
  background: linear-gradient(180deg, #1e043c 0%, #0e0020 100%);
  box-shadow:
    0 0 24px color-mix(in srgb, var(--accent) 70%, transparent),
    inset 0 0 30px color-mix(in srgb, var(--accent) 22%, transparent);
  transition:
    transform 0.45s cubic-bezier(0.2, 0.9, 0.25, 1.1),
    opacity 0.45s,
    filter 0.45s;
  will-change: transform;
}

.cabinet.is-center {
  box-shadow:
    0 0 50px color-mix(in srgb, var(--accent) 80%, transparent),
    0 0 120px color-mix(in srgb, var(--accent) 30%, transparent),
    inset 0 0 40px color-mix(in srgb, var(--accent) 28%, transparent);
  animation: cab-float 3.2s ease-in-out infinite;
}

.cabinet.is-dim {
  filter: saturate(0.7) brightness(0.62);
}

.accent-classic.cabinet {
  filter: saturate(0.35);
}

@keyframes cab-float {
  50% {
    margin-top: -10px;
  }
}

.cab-icon {
  width: 200px;
  height: 200px;
  flex: none;
  color: var(--accent);
  filter: drop-shadow(0 0 8px var(--accent)) drop-shadow(0 0 24px var(--accent));
}

.cab-icon svg {
  width: 100%;
  height: 100%;
}

.cab-title {
  font-family: var(--f-display);
  font-size: 48px;
  line-height: 1.05;
  color: #fff;
}

.cab-tag {
  padding: 4px 14px;
  border-radius: 6px;
  font-family: var(--f-mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.25em;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

/* Details only on the centre cabinet */
.cab-tagline,
.cab-score,
.cab-note {
  opacity: 0;
  transition: opacity 0.3s;
}

.is-center .cab-tagline,
.is-center .cab-score,
.is-center .cab-note {
  opacity: 1;
  transition-delay: 0.2s;
}

.cab-tagline {
  font-size: 24px;
  line-height: 1.35;
  color: var(--c-ink-dim);
}

.cab-score,
.cab-note {
  margin-top: auto;
  font-family: var(--f-mono);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-yellow);
  white-space: pre;
}

.cab-note.soon {
  color: var(--c-grey);
  letter-spacing: 0.3em;
}

.cabinet.shake {
  animation: shake 0.4s;
}

@keyframes shake {
  20%, 60% { margin-left: -14px; }
  40%, 80% { margin-left: 14px; }
}

/* ---------- Attract mode & confirm ---------- */
.attract {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 120px;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.5s;
}

.is-attract .attract {
  opacity: 1;
}

.is-attract .hub-footer {
  opacity: 0;
}

.attract .blink {
  margin: 0;
  font-family: var(--f-display);
  font-size: 56px;
  letter-spacing: 0.3em;
  color: var(--c-yellow);
  text-shadow: 0 0 20px var(--c-yellow);
}

.confirm {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: rgba(14, 0, 32, 0.9);
}

.confirm h2 {
  margin: 0;
  font-family: var(--f-display);
  font-weight: 400;
  font-size: 80px;
  color: var(--c-danger);
  text-shadow: 0 0 20px var(--c-danger);
}

.confirm p {
  margin: 0;
  font-family: var(--f-mono);
  font-size: 36px;
  letter-spacing: 0.3em;
}
```

- [ ] **Step 4: Type check, unit tests and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: `tsc` clean; 12 test files, 75 tests PASS; Vite build succeeds with the main JS chunk around 22 kB and separate chunks for `zzfx`, `music` and `selftest`.

- [ ] **Step 5: Look at it**

Run: `npm run preview` and open `http://localhost:4173/cyberarcade/?selftest` in Chrome at 1920×1080.
Expected: splash with chrome "CYBER ARCADE" logo → click → hub with the sun, mountains and scrolling grid, Malware Invaders centered, two cabinets visible on each side. ← / → rotate; M toggles the mute icon (top right). Move to SELF TEST, press Enter twice, press Q a few times, click END: game over → initials → leaderboard → Esc → hub shows the new top score. Stop the server with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add src/hub/splash.ts src/core/ui/mute-indicator.ts src/main.ts src/styles/base.css src/styles/screens.css src/hub/hub.css
git commit -m "feat: add start splash, mute indicator, boot entry and styles"
```

---

### Task 12: Playwright smoke tests and GitHub Pages deploy

Browser-level proof that the hub boots with no console errors, the full score flow works, crashes recover, Esc cleans up, and 20 launch/exit cycles leak no listeners or DOM nodes (spec §8). Then CI that tests, builds and publishes to Pages on every push to `main`.

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/helpers.ts`
- Create: `tests/e2e/hub.spec.ts`
- Create: `tests/e2e/shell.spec.ts`
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: the built site served by `npm run preview` at `http://localhost:4173/cyberarcade/`; DOM hooks `.splash`, `.cabinet.is-center[data-id]`, `.cab-score`, `.title-card`, `.selftest`, `.hub-logo h1`, `.game-over .final-score`, `.initials`, `.leaderboard li.me .who` / `.pts`, `.system-error`, `.mute-indicator` (class `is-muted`), `.game-layer` (`hidden` attribute), `.game-root`; globals `window.__selftest = {mounts, unmounts}` and (with `?selftest`) `window.__arcadeDebug.handlerCount()`.
- Produces: `npm run e2e`; `.github/workflows/deploy.yml` (build job: `npm ci`, `npm test`, `npm run build`, upload `dist`; deploy job: `actions/deploy-pages@v4`).

- [ ] **Step 1: Install the Playwright browser**

Run: `npx playwright install chromium`
Expected: downloads Chromium and its headless shell (one time per machine).

- [ ] **Step 2: Write the Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build (vite preview), served at /cyberarcade/ like GitHub Pages.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/cyberarcade/',
    viewport: { width: 1366, height: 768 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/cyberarcade/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
```

(`reuseExistingServer: true` instead of `!process.env.CI`: the project has no `@types/node`, and `tsc` checks this file.)

- [ ] **Step 3: Write the smoke tests**

`tests/e2e/helpers.ts`:

```ts
import { expect, type Page } from '@playwright/test';

/** Collects console errors and uncaught page errors so tests can assert none happened. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Opens the arcade and clicks through the start splash. */
export async function boot(page: Page, query = ''): Promise<void> {
  await page.goto(query);
  await page.locator('.splash').click();
  await expect(page.locator('.splash')).toHaveCount(0);
  await expect(page.locator('.cabinet.is-center')).toBeVisible();
}

/** From the hub with ?selftest, starts the self-test game (it is the first, centred cabinet). */
export async function startSelftest(page: Page): Promise<void> {
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'selftest');
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-card')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.selftest')).toBeVisible();
}
```

`tests/e2e/hub.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { boot, trackErrors } from './helpers';

test('boots to the hub with eight cabinets and no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await expect(page.locator('.hub-logo h1')).toHaveText('CYBER ARCADE');
  await expect(page.locator('.cabinet')).toHaveCount(8);
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'invaders');
  expect(errors).toEqual([]);
});

test('arrow keys rotate the carousel with wraparound', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'phish');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'classic');
});

test('a coming-soon cabinet shakes instead of launching', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cabinet.is-center')).toHaveClass(/shake/);
  await expect(page.locator('.title-card')).toHaveCount(0);
});

test('M toggles the mute indicator', async ({ page }) => {
  await boot(page);
  const mute = page.locator('.mute-indicator');
  const muted = () => mute.evaluate((b) => b.classList.contains('is-muted'));
  const before = await muted();
  await page.keyboard.press('m');
  await expect.poll(muted).toBe(!before);
});
```

`tests/e2e/shell.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { boot, startSelftest, trackErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('full flow: title → play → game over → initials → leaderboard → hub', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '?selftest');
  await startSelftest(page);

  await page.keyboard.press('KeyQ');
  await expect(page.locator('[data-test="keys"]')).toHaveText('1');

  await page.locator('[data-test="end"]').click();
  await expect(page.locator('.selftest')).toHaveCount(0);
  await expect(page.locator('.game-over .final-score')).toHaveText('4,242');
  await page.waitForTimeout(1100); // game-over ignores input for the first second
  await page.keyboard.press('Enter');

  await expect(page.locator('.initials')).toBeVisible();
  await page.keyboard.type('ZAK');
  await page.keyboard.press('Enter');

  await expect(page.locator('.leaderboard li.me .who')).toHaveText('ZAK');
  await expect(page.locator('.leaderboard li.me .pts')).toHaveText('4,242');
  await page.keyboard.press('Escape');

  await expect(page.locator('.cabinet.is-center .cab-score')).toContainText('ZAK');
  expect(errors).toEqual([]);
});

test('a crashing game shows SYSTEM ERROR and returns to the hub', async ({ page }) => {
  await boot(page, '?selftest');
  await startSelftest(page);
  await page.locator('[data-test="throw"]').click();
  await expect(page.locator('.system-error')).toBeVisible();
  await expect(page.locator('.selftest')).toHaveCount(0);
  await expect(page.locator('.cabinet.is-center')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('.game-layer')).toBeHidden();
});

test('Esc in a game returns to the hub and removes the game', async ({ page }) => {
  await boot(page, '?selftest');
  await startSelftest(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-layer')).toBeHidden();
  await expect(page.locator('.game-root')).toHaveCount(0);
  expect(await page.evaluate(() => window.__selftest)).toEqual({ mounts: 1, unmounts: 1 });
});

test('20 launch/exit cycles leave no listeners or DOM behind', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '?selftest');
  const baseline = await page.evaluate(() => window.__arcadeDebug!.handlerCount());
  const baseNodes = await page.evaluate(() => document.getElementsByTagName('*').length);

  for (let i = 0; i < 20; i++) {
    await startSelftest(page);
    await page.locator('[data-test="exit"]').click();
    await expect(page.locator('.game-layer')).toBeHidden();
  }

  expect(await page.evaluate(() => window.__selftest)).toEqual({ mounts: 20, unmounts: 20 });
  expect(await page.evaluate(() => window.__arcadeDebug!.handlerCount())).toBe(baseline);
  expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBe(baseNodes);
  expect(errors).toEqual([]);
});
```

- [ ] **Step 4: Run them**

Run: `npm run e2e`
Expected: `8 passed`. Because the code under test already exists, these pass on the first run; to see one fail, temporarily change `hub.spec.ts` to expect 9 cabinets, run it, then revert.

- [ ] **Step 5: Write the deploy workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 6: Full local gate, then commit**

Run: `npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all green.

```bash
git add playwright.config.ts tests/e2e/helpers.ts tests/e2e/hub.spec.ts tests/e2e/shell.spec.ts .github/workflows/deploy.yml
git commit -m "test: add Playwright smoke tests; ci: deploy to GitHub Pages"
```

- [ ] **Step 7: Push and turn on Pages (confirm with the repo owner before pushing)**

1. Ask the repo owner for the go-ahead, then run `git push -u origin main`.
2. The repo owner sets **GitHub → Timothy815/cyberarcade → Settings → Pages → Build and deployment → Source: GitHub Actions** (one time). If the first workflow run failed at the deploy step because this was not set yet, re-run it from the Actions tab.
3. Expected: the Actions run is green and `https://timothy815.github.io/cyberarcade/` shows the splash. Click through: hub loads, M mutes, the Classic '25 cabinet opens last year's arcade, Alt+← returns.


---

## After this plan: roadmap

Each is its own plan, written when the previous one ships. Every game adds a `load: () => import('./<id>')` line to its cabinet in `src/games/registry.ts`, a `src/games/<id>/` folder that exports `createGame(): GameModule`, unit tests for its pure logic, and an entry in the Playwright launch/exit loop.

- **Plan 2:** Phish or Legit (question bank with label + highlight validation), Password Smash (zxcvbn, nothing stored), Malware Invaders (adds Phaser 3.90.0, lazy-loaded).
- **Plan 3:** Port Guardian (rule-evaluation tests), Bug Hunt (snippet validation: exactly one bug line and a fix).
- **Plan 4:** Packet Runner.
- **Plan 5:** Firewall Defense (stretch).
- **Plan 6:** Polish pass; offline build (`vite build --mode offline --outDir dist-offline` plus `serve.bat` running Python `http.server`, zipped as a release asset); 4× CPU throttle frame-rate check; manual playtest checklist for one real lab PC; kiosk setup notes.
