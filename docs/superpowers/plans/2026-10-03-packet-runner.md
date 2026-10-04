# Packet Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Packet Runner, a 3-lane Phaser endless runner. The player steers a data packet past DDoS floods and corrupted nodes and picks the lane whose subnet matches each router gate's destination IP. It plugs into the live hub through the existing `GameModule` contract.

**Architecture:** It uses the same split as Malware Invaders. A pure, seeded `World` in `logic.ts` owns every rule and returns `GameEvent[]` from `step(dt)`. `gates.ts` builds each router gate on top of the IP helpers in `src/games/port/logic.ts`. `RunnerScene` only draws: it projects `(lane, z)` to the screen with `s = F / (z + F)`. `index.ts` implements mount/unmount, the DOM overlays (HUD, ROUTER AHEAD banner, result flash) and sound. Phaser plumbing that both games share (`destroyGame` and the neon texture helpers) moves to `src/games/phaser-util.ts`.

**Tech Stack:** Vite 8, TypeScript 5.9 strict, Phaser 3.90.0, Vitest 5 (jsdom), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-packet-runner-design.md`

## Global Constraints

- The game contract is unchanged: `createGame(): GameModule { mount(container, ctx), unmount() }`. Input goes only through `ctx.input.onKey`, and sound only through `ctx.audio.sfx`.
- The stage is a fixed 1920×1080. CSS uses px and the theme tokens (`var(--c-*)`, `var(--f-*)`).
- `?seed=N` makes every random choice repeatable: spawn rows, gates and the correct lane.
- `unmount()` leaves nothing behind: no listeners, DOM, timers or live WebGL context (the 20-cycle leak test enforces this).
- Invaders' behaviour does not change in the `phaser-util` refactor.
- Commands: `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test` (it builds and serves the preview itself). The shell is zsh, so quote globs.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push or merge.

## Rulings carried into this plan

- **Warm-up:** the first gate spawns at 4 s, and no hazards spawn before it (ACK rows only). Every run starts with a calm CIDR lesson, and e2e can reach a gate without dodging. The spec says "every 15–20 s". This is a deliberate deviation for the first gate only.
- **The HUD gate cell** shows the number of gates routed correctly, labelled ROUTED.
- **`phaser-util`** also holds the texture helpers (`GLOW`, `neonPoly`, `neonCircle`, `bake`), so the runner does not duplicate them.
- **COMING SOON tests:** Packet Runner was the cabinet that the "coming soon" unit/e2e tests used. Those tests now use `defense` (Firewall Defense, still unbuilt). Hub order: invaders, phish, runner, password, defense, port, bughunt, classic.

## File map

| File | Task | Role |
|---|---|---|
| `src/games/phaser-util.ts` | 1 | `destroyGame`, `GLOW`, `neonPoly`, `neonCircle`, `bake`, types `G`, `Pt` |
| `src/games/invaders/index.ts`, `textures.ts` | 1 | import the moved helpers |
| `src/games/runner/gates.ts` | 2 | `makeGate(n, rng)`, tiers, label matching |
| `src/games/runner/logic.ts` | 3 | `World`, constants, `GameEvent` |
| `src/games/runner/textures.ts`, `scene.ts`, `index.ts`, `runner.css` | 4 | drawing, mount/unmount, overlays |
| `src/main.ts`, `src/games/registry.ts` | 4 | CSS import, `load()` and controls |
| `tests/unit/runner-gates.test.ts`, `runner-logic.test.ts` | 2, 3 | unit tests |
| `tests/unit/carousel.test.ts`, `tests/e2e/hub.spec.ts`, `tests/e2e/games.spec.ts` | 4 | COMING SOON swap, runner e2e, leak loop |

---

### Task 1: Move the shared Phaser helpers to `phaser-util.ts`

**Files:**
- Create: `src/games/phaser-util.ts`
- Modify: `src/games/invaders/index.ts`, `src/games/invaders/textures.ts`

**Interfaces:**
- Produces: `destroyGame(game: Phaser.Game): void`, `GLOW: [width: number, alpha: number][]`, `neonPoly(g: G, pts: Pt[], color: number, fillAlpha = 0.35): void`, `neonCircle(g: G, x, y, r, color, fillAlpha = 0.35): void`, `bake(scene, key, w, h, draw: (g: G) => void): void`, and `type G = Phaser.GameObjects.Graphics`, `type Pt = { x: number; y: number }`.

This is a pure move: the code is the same as today's private copies in invaders, now exported. The existing invaders e2e test and the leak test are the safety net.

- [ ] **Step 1: Create the shared module**

Create `src/games/phaser-util.ts` (full file):

```ts
import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../core/theme';

// Helpers shared by the Phaser games (Malware Invaders, Packet Runner).

const MAX_CONTEXT_WAIT_FRAMES = 60;

/**
 * Destroys a Phaser game completely. Phaser's destroy() runs on the game's next frame and never
 * releases the WebGL context, and Chrome only allows ~16 live contexts, so a kiosk that starts
 * hundreds of runs a day must free each one by hand once Phaser has finished with it.
 */
export function destroyGame(game: Phaser.Game): void {
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

// Every sprite is drawn in code once, at scene start, and baked into a texture.
// Neon glow is faked with wide, faint strokes under a bright core line, so it costs nothing per frame.

export type G = Phaser.GameObjects.Graphics;
export type Pt = { x: number; y: number };

const DEEP = hexToInt(palette.deep);

export const GLOW: [width: number, alpha: number][] = [
  [16, 0.06],
  [10, 0.12],
  [6, 0.25],
];

/** Draws a closed neon outline: soft glow passes, a dark fill, then a crisp core line. */
export function neonPoly(g: G, pts: Pt[], color: number, fillAlpha = 0.35): void {
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

export function neonCircle(g: G, x: number, y: number, r: number, color: number, fillAlpha = 0.35): void {
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

export function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}
```

- [ ] **Step 2: Make invaders import it**

`src/games/invaders/index.ts`, apply this change:

```diff
@@ -3,12 +3,12 @@ import type { SfxName } from '../../core/audio';
 import type { GameContext, GameModule } from '../../core/types';
 import { el } from '../../core/ui/dom';
 import { createHud } from '../../core/ui/hud';
+import { destroyGame } from '../phaser-util';
 import { H, W, World, type Controls, type GameEvent } from './logic';
 import { InvadersScene } from './scene';
 
 const END_DELAY_MS = 1500; // let the final explosion play before game over
 const BANNER_MS = 1800;
-const MAX_CONTEXT_WAIT_FRAMES = 60;
 
 const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
   shoot: 'shoot',
@@ -23,28 +23,6 @@ const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
   gameOver: 'explode',
 };
 
-/**
- * Destroys a Phaser game completely. Phaser's destroy() runs on the game's next frame and never
- * releases the WebGL context, and Chrome only allows ~16 live contexts, so a kiosk that starts
- * hundreds of runs a day must free each one by hand once Phaser has finished with it.
- */
-function destroyGame(game: Phaser.Game): void {
-  const gl = (game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer> | null)?.gl ?? null;
-  game.destroy(true);
-  if (!gl) return;
-  // pendingDestroy is public in Phaser's source but missing from its typings.
-  const pending = () => (game as unknown as { pendingDestroy: boolean }).pendingDestroy;
-  let frames = 0;
-  const release = () => {
-    if (pending() && ++frames < MAX_CONTEXT_WAIT_FRAMES) {
-      requestAnimationFrame(release);
-      return;
-    }
-    gl.getExtension('WEBGL_lose_context')?.loseContext();
-  };
-  requestAnimationFrame(release);
-}
-
 export function createGame(): GameModule {
   let root: HTMLElement | null = null;
   let game: Phaser.Game | null = null;
```

`src/games/invaders/textures.ts`, apply this change:

```diff
@@ -1,6 +1,7 @@
 import type * as Phaser from 'phaser';
 import { hexToInt, palette } from '../../core/theme';
 import { mulberry32 } from '../../core/random';
+import { bake, GLOW, neonCircle, neonPoly, type G, type Pt } from '../phaser-util';
 
 // Every sprite is drawn in code once, at scene start, and baked into a texture.
 // Neon glow is faked with wide, faint strokes under a bright core line, so it costs nothing per frame.
@@ -12,43 +13,6 @@ const OK = hexToInt(palette.ok);
 const DANGER = hexToInt(palette.danger);
 const GREY = hexToInt(palette.grey);
 const WHITE = 0xffffff;
-const DEEP = hexToInt(palette.deep);
-
-type G = Phaser.GameObjects.Graphics;
-type Pt = { x: number; y: number };
-
-const GLOW: [width: number, alpha: number][] = [
-  [16, 0.06],
-  [10, 0.12],
-  [6, 0.25],
-];
-
-/** Draws a closed neon outline: soft glow passes, a dark fill, then a crisp core line. */
-function neonPoly(g: G, pts: Pt[], color: number, fillAlpha = 0.35): void {
-  for (const [w, a] of GLOW) {
-    g.lineStyle(w, color, a);
-    g.strokePoints(pts, true, true);
-  }
-  g.fillStyle(DEEP, 0.9);
-  g.fillPoints(pts, true, true);
-  g.fillStyle(color, fillAlpha);
-  g.fillPoints(pts, true, true);
-  g.lineStyle(3, color, 1);
-  g.strokePoints(pts, true, true);
-}
-
-function neonCircle(g: G, x: number, y: number, r: number, color: number, fillAlpha = 0.35): void {
-  for (const [w, a] of GLOW) {
-    g.lineStyle(w, color, a);
-    g.strokeCircle(x, y, r);
-  }
-  g.fillStyle(DEEP, 0.9);
-  g.fillCircle(x, y, r);
-  g.fillStyle(color, fillAlpha);
-  g.fillCircle(x, y, r);
-  g.lineStyle(3, color, 1);
-  g.strokeCircle(x, y, r);
-}
 
 /** A star outline with `n` points: vertices alternate between radius r1 (tips) and r2 (dips). */
 function star(cx: number, cy: number, n: number, r1: number, r2: number): Pt[] {
@@ -61,14 +25,6 @@ function star(cx: number, cy: number, n: number, r1: number, r2: number): Pt[] {
   return pts;
 }
 
-function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
-  if (scene.textures.exists(key)) scene.textures.remove(key);
-  const g = scene.make.graphics({ x: 0, y: 0 }, false);
-  draw(g);
-  g.generateTexture(key, w, h);
-  g.destroy();
-}
-
 function eyes(g: G, cx: number, cy: number, gap: number, r: number): void {
   g.fillStyle(WHITE, 1);
   g.fillCircle(cx - gap, cy, r);
```

- [ ] **Step 3: Verify that nothing changed**

Run: `npm run typecheck && npm test`
Expected: tsc is clean and every unit test passes.

Run: `npx playwright test -g "invaders|20 launch"`
Expected: 3 passed. These are the invaders game test, the games leak loop and the shell leak loop.

- [ ] **Step 4: Commit**

```bash
git add src/games/phaser-util.ts src/games/invaders/index.ts src/games/invaders/textures.ts
git commit -m "refactor: share destroyGame and neon texture helpers in phaser-util" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Router gates (`gates.ts`)

**Files:**
- Create: `src/games/runner/gates.ts`
- Test: `tests/unit/runner-gates.test.ts`

**Interfaces:**
- Consumes: `pick`, `shuffle`, `type Rng` from `src/core/random.ts`. `inNet(ip, cidr)` and `ipIn(cidr, rng)` from `src/games/port/logic.ts` (both already exist).
- Produces: `type Tier = 'prefix' | 'cidr' | 'near'`, `type Lane = 0 | 1 | 2`, `interface Gate { dest: string; labels: [string, string, string]; correct: Lane; tier: Tier }`, `tierFor(n: number): Tier`, `labelNet(label: string): string`, `labelMatches(ip: string, label: string): boolean`, `makeGate(n: number, rng: Rng): Gate`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/runner-gates.test.ts` (full file):

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/runner-gates.test.ts`
Expected: FAIL, because `../../src/games/runner/gates` cannot be resolved.

- [ ] **Step 3: Implement**

Create `src/games/runner/gates.ts` (full file):

```ts
import { pick, shuffle, type Rng } from '../../core/random';
import { inNet, ipIn } from '../port/logic';

export type Tier = 'prefix' | 'cidr' | 'near';
export type Lane = 0 | 1 | 2;

export interface Gate {
  /** The address the packet is carrying, e.g. 192.168.4.17. */
  dest: string;
  /** One subnet label per lane, left to right. */
  labels: [string, string, string];
  /** The lane whose label contains `dest`. */
  correct: Lane;
  tier: Tier;
}

/** First two octets of the networks gates are drawn from. */
const BASES = ['10.0', '10.8', '172.16', '172.20', '192.168', '100.64'];

/** Gates 1–3 teach prefix matching, 4–6 introduce /24 notation, 7+ use look-alike networks. */
export function tierFor(n: number): Tier {
  return n <= 3 ? 'prefix' : n <= 6 ? 'cidr' : 'near';
}

/** The CIDR network a label stands for: a prefix label `a.b.c.x` means `a.b.c.0/24`. */
export function labelNet(label: string): string {
  return label.endsWith('.x') ? `${label.slice(0, -2)}.0/24` : label;
}

export function labelMatches(dest: string, label: string): boolean {
  return inNet(dest, labelNet(label));
}

const octet = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

/** Builds gate number `n`: a destination and three /24 labels of which exactly one contains it. */
export function makeGate(n: number, rng: Rng): Gate {
  const tier = tierFor(n);
  let nets: string[]; // three distinct "a.b.c" prefixes; nets[0] is the right one
  if (tier === 'near') {
    const base = pick(BASES, rng);
    const c = octet(rng, 1, 199);
    const lookAlikes = [...new Set([c - 1, c + 1, c + 10, c - 10, c * 10, c + 100])].filter((x) => x >= 0 && x <= 255 && x !== c);
    nets = [c, ...shuffle(lookAlikes, rng).slice(0, 2)].map((x) => `${base}.${x}`);
  } else {
    nets = shuffle(BASES, rng)
      .slice(0, 3)
      .map((b) => `${b}.${octet(rng, 0, 255)}`);
  }
  const dest = ipIn(`${nets[0]}.0/24`, rng);
  const correct = Math.floor(rng() * 3) as Lane;
  const wrong = nets.slice(1);
  const labels = [0, 1, 2].map((lane) => {
    const net = lane === correct ? nets[0] : wrong.shift()!;
    return tier === 'prefix' ? `${net}.x` : `${net}.0/24`;
  }) as [string, string, string];
  return { dest, labels, correct, tier };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/runner-gates.test.ts && npm run typecheck`
Expected: all tests pass and tsc is clean.

- [ ] **Step 5: Commit**

```bash
git add src/games/runner/gates.ts tests/unit/runner-gates.test.ts
git commit -m "feat(runner): router gates with prefix, cidr and near tiers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Game rules (`logic.ts`)

**Files:**
- Create: `src/games/runner/logic.ts`
- Test: `tests/unit/runner-logic.test.ts`

**Interfaces:**
- Consumes: `makeGate`, `type Gate` from Task 2. `type Rng` from `src/core/random.ts`.
- Produces: the constants `W`, `H`, `LANES`, `START_LIVES`, `BASE_SPEED`, `SPEED_STEP`, `SPEED_EVERY`, `MAX_MULT`, `SPAWN_Z`, `DESPAWN_Z`, `INVULN`, `ACK_POINTS`, `GATE_POINTS`, `DIST_TICK`, `ROW_GAP`, `FIRST_GATE_S`, `GATE_MIN_GAP`, `GATE_MAX_GAP`, `WARN_S`, `CLEAR_BEFORE_S`, `CLEAR_AFTER_S` and `MAX_DT`, plus `type Kind`, `interface Thing`, `type GameEvent` and `class World`. `World` is built as `new World(rng?: Rng, opts?: { spawn?: boolean })` and has the members `time`, `lane`, `lives`, `score`, `mult`, `invuln`, `things`, `gateCount`, `routed`, `over`, `distance`, `hinted` and `speed` (getter). Its methods are `steer(dir: -1 | 1): boolean`, `place(kind, lanes, z?, gate?, n?): Thing` and `step(dt: number): GameEvent[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/runner-logic.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { makeGate, tierFor } from '../../src/games/runner/gates';
import {
  ACK_POINTS,
  BASE_SPEED,
  CLEAR_AFTER_S,
  CLEAR_BEFORE_S,
  FIRST_GATE_S,
  GATE_MAX_GAP,
  GATE_MIN_GAP,
  INVULN,
  MAX_DT,
  MAX_MULT,
  SPEED_STEP,
  START_LIVES,
  WARN_S,
  World,
  type GameEvent,
} from '../../src/games/runner/logic';

const DT = 1 / 60;
const quiet = () => new World(mulberry32(1), { spawn: false });
const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('runner world', () => {
  it('starts in the middle lane with full lives and no score', () => {
    const w = quiet();
    expect([w.lane, w.lives, w.score, w.mult, w.over]).toEqual([1, START_LIVES, 0, 1, false]);
  });

  it('steers one lane at a time and clamps at the edges', () => {
    const w = quiet();
    expect(w.steer(-1)).toBe(true);
    expect(w.lane).toBe(0);
    expect(w.steer(-1)).toBe(false);
    expect(w.steer(1) && w.steer(1)).toBe(true);
    expect(w.lane).toBe(2);
    expect(w.steer(1)).toBe(false);
  });

  it('clamps a long frame to MAX_DT', () => {
    const w = quiet();
    w.step(1);
    expect(w.time).toBeCloseTo(MAX_DT);
  });

  it('a hazard in the packet lane costs one life and starts invulnerability', () => {
    const w = quiet();
    w.place('node', [1], 10);
    const events = w.step(DT);
    expect(events).toContainEqual({ type: 'hit', lane: 1, kind: 'node' });
    expect(w.lives).toBe(START_LIVES - 1);
    expect(w.invuln).toBe(INVULN);
  });

  it('ignores hits while invulnerable and hazards in other lanes', () => {
    const w = quiet();
    w.place('flood', [1, 2], 10);
    w.step(DT);
    w.place('node', [1], 10);
    expect(types(w.step(DT))).not.toContain('hit');
    w.invuln = 0;
    w.place('flood', [0], 10);
    expect(types(w.step(DT))).not.toContain('hit');
    expect(w.lives).toBe(START_LIVES - 1);
  });

  it('collects an ACK in the packet lane and removes it', () => {
    const w = quiet();
    const ack = w.place('ack', [1], 10);
    expect(w.step(DT)).toContainEqual({ type: 'ack', lane: 1 });
    expect(w.score).toBe(ACK_POINTS);
    expect(w.things).not.toContain(ack);
  });

  it('scores one point per 100 ms survived', () => {
    const w = quiet();
    for (let i = 0; i < 20; i++) w.step(0.05);
    expect(w.score).toBe(10);
  });

  it('speeds up every 10 s and stops at the cap', () => {
    const w = quiet();
    w.time = 9.99;
    expect(w.step(0.02)).toContainEqual({ type: 'speedUp', mult: SPEED_STEP });
    expect(w.speed).toBeCloseTo(BASE_SPEED * SPEED_STEP);
    w.time = 1000;
    w.step(DT);
    expect(w.mult).toBe(MAX_MULT);
  });

  it('a right gate scores 100 × the gate number', () => {
    const w = quiet();
    const gate = makeGate(2, mulberry32(4));
    w.lane = gate.correct;
    w.place('gate', [0, 1, 2], 10, gate, 2);
    expect(w.step(DT)).toContainEqual({ type: 'gateRight', n: 2, points: 200, lane: gate.correct });
    expect([w.score, w.routed, w.lives]).toEqual([200, 1, START_LIVES]);
  });

  it('a wrong gate costs a life even while invulnerable', () => {
    const w = quiet();
    const gate = makeGate(1, mulberry32(4));
    w.lane = (gate.correct + 1) % 3;
    w.invuln = INVULN;
    w.place('gate', [0, 1, 2], 10, gate, 1);
    expect(w.step(DT)).toContainEqual({ type: 'gateWrong', n: 1, lane: w.lane, correct: gate.correct });
    expect([w.lives, w.routed]).toEqual([START_LIVES - 1, 0]);
  });

  it('warns WARN_S before a gate arrives, once, with the /24 hint only on the first cidr gate', () => {
    const w = quiet();
    const first = makeGate(4, mulberry32(2));
    w.place('gate', [0, 1, 2], BASE_SPEED * WARN_S + 1, first, 4);
    expect(types(w.step(DT))).not.toContain('gateWarn');
    expect(w.step(DT)).toContainEqual({ type: 'gateWarn', gate: first, n: 4, hint: true });
    expect(types(w.step(DT))).not.toContain('gateWarn');
    const second = makeGate(5, mulberry32(3));
    w.place('gate', [0, 1, 2], 10, second, 5);
    expect(w.step(DT)).toContainEqual({ type: 'gateWarn', gate: second, n: 5, hint: false });
  });

  it('ends the run at 0 lives and then ignores steps and steering', () => {
    const w = quiet();
    w.lives = 1;
    w.place('node', [1], 10);
    expect(types(w.step(DT))).toContain('gameOver');
    expect(w.over).toBe(true);
    const t = w.time;
    expect(w.step(DT)).toEqual([]);
    expect(w.time).toBe(t);
    expect(w.steer(-1)).toBe(false);
  });

  it('spawns fair rows, clear zones around gates, and gates on schedule', () => {
    for (const seed of [1, 2, 3]) {
      const w = new World(mulberry32(seed));
      w.lives = 1e9;
      const gates: { t: number; n: number; tier: string }[] = [];
      const hazards: number[] = [];
      let blocked = 0;
      let seen = 0;
      for (let i = 0; i < 300 / DT; i++) {
        w.step(DT);
        const fresh = w.things.filter((t) => t.id > seen);
        seen = Math.max(seen, ...w.things.map((t) => t.id));
        const lanes = new Set(fresh.filter((t) => t.kind === 'flood' || t.kind === 'node').flatMap((t) => t.lanes));
        if (lanes.size === 3) blocked++;
        if (lanes.size > 0) hazards.push(w.time);
        for (const g of fresh.filter((t) => t.kind === 'gate')) gates.push({ t: w.time, n: g.n!, tier: g.gate!.tier });
      }
      expect(blocked).toBe(0);
      expect(hazards.length).toBeGreaterThan(50);
      expect(gates[0].t).toBeCloseTo(FIRST_GATE_S, 1);
      expect(Math.min(...hazards)).toBeGreaterThan(gates[0].t);
      gates.forEach((g, i) => {
        expect(g.n).toBe(i + 1);
        expect(g.tier).toBe(tierFor(i + 1));
        if (i > 0) {
          expect(g.t - gates[i - 1].t).toBeGreaterThanOrEqual(GATE_MIN_GAP - DT);
          expect(g.t - gates[i - 1].t).toBeLessThanOrEqual(GATE_MAX_GAP + DT);
        }
        expect(hazards.filter((h) => h > g.t - CLEAR_BEFORE_S && h < g.t + CLEAR_AFTER_S)).toEqual([]);
      });
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/runner-logic.test.ts`
Expected: FAIL, because `../../src/games/runner/logic` cannot be resolved.

- [ ] **Step 3: Implement**

Create `src/games/runner/logic.ts` (full file):

```ts
import type { Rng } from '../../core/random';
import { makeGate, type Gate } from './gates';

// Pure game rules for Packet Runner: no Phaser, no DOM. Distances are "z" units ahead of the
// packet (z = 0 is the packet's plane); time is in seconds.

export const W = 1920;
export const H = 1080;
export const LANES = 3;
export const START_LIVES = 3;
export const BASE_SPEED = 900; // z units per second
export const SPEED_STEP = 1.04; // speed multiplier gained every SPEED_EVERY seconds
export const SPEED_EVERY = 10;
export const MAX_MULT = 2.2;
export const SPAWN_Z = 6000;
export const DESPAWN_Z = -400;
export const INVULN = 1; // seconds of invulnerability after a hit
export const ACK_POINTS = 10;
export const GATE_POINTS = 100; // × the gate number
export const DIST_TICK = 0.1; // +1 point per DIST_TICK seconds survived
export const ROW_GAP = 1; // seconds between spawn rows at base speed
export const FIRST_GATE_S = 4; // no hazards spawn before the first gate: every run opens with a calm lesson
export const GATE_MIN_GAP = 15;
export const GATE_MAX_GAP = 20;
export const WARN_S = 3; // the ROUTER AHEAD banner shows this long before a gate arrives
export const CLEAR_BEFORE_S = 2; // no hazards spawn this long before a gate...
export const CLEAR_AFTER_S = 0.5; // ...or this long after it
export const FLOOD_CHANCE = 0.35;
export const NODE_CHANCE = 0.4;
export const ACK_CHANCE = 0.5;
export const MAX_DT = 0.05;

export type Kind = 'flood' | 'node' | 'ack' | 'gate';

export interface Thing {
  id: number;
  kind: Kind;
  lanes: number[];
  z: number;
  /** Reached the packet's plane and was resolved. */
  done: boolean;
  /** Collected (ACK): no longer drawn. */
  gone: boolean;
  /** gateWarn already sent (gates only). */
  warned: boolean;
  gate?: Gate;
  /** Gate number, from 1. */
  n?: number;
}

export type GameEvent =
  | { type: 'hit'; lane: number; kind: 'flood' | 'node' }
  | { type: 'ack'; lane: number }
  | { type: 'gateWarn'; gate: Gate; n: number; hint: boolean }
  | { type: 'gateRight'; n: number; points: number; lane: number }
  | { type: 'gateWrong'; n: number; lane: number; correct: number }
  | { type: 'speedUp'; mult: number }
  | { type: 'gameOver' };

export interface WorldOptions {
  /** false turns the spawner off, so unit tests can place things by hand. */
  spawn?: boolean;
}

export class World {
  time = 0;
  lane = 1;
  lives = START_LIVES;
  score = 0;
  mult = 1;
  invuln = 0;
  things: Thing[] = [];
  gateCount = 0;
  routed = 0;
  over = false;
  /** Total z travelled; the scene scrolls the tunnel rings with it. */
  distance = 0;
  /** The "/24 = first 3 numbers must match" hint has been shown. */
  hinted = false;
  private nextId = 1;
  private distPoints = 0;
  private nextRowAt = 0.5;
  private nextGateAt = FIRST_GATE_S;
  private lastGateAt = -Infinity;

  constructor(
    private readonly rng: Rng = Math.random,
    private readonly opts: WorldOptions = {},
  ) {}

  get speed(): number {
    return BASE_SPEED * this.mult;
  }

  /** Moves one lane left (-1) or right (1). Returns false at an edge or after game over. */
  steer(dir: -1 | 1): boolean {
    if (this.over) return false;
    const next = Math.max(0, Math.min(LANES - 1, this.lane + dir));
    if (next === this.lane) return false;
    this.lane = next;
    return true;
  }

  place(kind: Kind, lanes: number[], z = SPAWN_Z, gate?: Gate, n?: number): Thing {
    const thing: Thing = { id: this.nextId++, kind, lanes, z, done: false, gone: false, warned: false, gate, n };
    this.things.push(thing);
    return thing;
  }

  step(rawDt: number): GameEvent[] {
    if (this.over) return [];
    const dt = Math.min(rawDt, MAX_DT);
    const events: GameEvent[] = [];
    this.time += dt;

    const mult = Math.min(MAX_MULT, SPEED_STEP ** Math.floor(this.time / SPEED_EVERY));
    if (mult !== this.mult) {
      this.mult = mult;
      events.push({ type: 'speedUp', mult });
    }
    this.invuln = Math.max(0, this.invuln - dt);
    const points = Math.floor(this.time / DIST_TICK + 1e-9);
    this.score += points - this.distPoints;
    this.distPoints = points;
    this.distance += this.speed * dt;

    if (this.opts.spawn !== false) this.spawn();

    for (const t of this.things) {
      if (t.kind === 'gate' && !t.warned && t.z / this.speed <= WARN_S) {
        t.warned = true;
        const hint = t.gate!.tier === 'cidr' && !this.hinted;
        if (hint) this.hinted = true;
        events.push({ type: 'gateWarn', gate: t.gate!, n: t.n!, hint });
      }
      t.z -= this.speed * dt;
      if (!t.done && t.z <= 0) this.resolve(t, events);
      if (this.over) break;
    }
    this.things = this.things.filter((t) => !t.gone && t.z > DESPAWN_Z);
    return events;
  }

  /** True inside the hazard-free window around a gate. */
  private inClear(): boolean {
    return this.time > this.nextGateAt - CLEAR_BEFORE_S || this.time < this.lastGateAt + CLEAR_AFTER_S;
  }

  private spawn(): void {
    if (this.time >= this.nextGateAt) {
      this.gateCount++;
      this.place('gate', [0, 1, 2], SPAWN_Z, makeGate(this.gateCount, this.rng), this.gateCount);
      this.lastGateAt = this.time;
      this.nextGateAt += GATE_MIN_GAP + this.rng() * (GATE_MAX_GAP - GATE_MIN_GAP);
    }
    while (this.time >= this.nextRowAt) {
      this.nextRowAt += ROW_GAP / this.mult;
      this.spawnRow(this.gateCount >= 1 && !this.inClear());
    }
  }

  /** One row of objects at SPAWN_Z. At most two lanes ever hold a hazard. */
  private spawnRow(hazards: boolean): void {
    const free = [0, 1, 2];
    const claim = (lanes: number[]) => {
      for (const l of lanes) free.splice(free.indexOf(l), 1);
      return lanes;
    };
    if (hazards) {
      const r = this.rng();
      if (r < FLOOD_CHANCE) {
        const wide = this.rng() < 0.5;
        const s = Math.floor(this.rng() * (wide ? 2 : 3));
        this.place('flood', claim(wide ? [s, s + 1] : [s]));
      } else if (r < FLOOD_CHANCE + NODE_CHANCE) {
        this.place('node', claim([Math.floor(this.rng() * 3)]));
      }
    }
    if (this.rng() < ACK_CHANCE) this.place('ack', [free[Math.floor(this.rng() * free.length)]]);
  }

  private resolve(t: Thing, events: GameEvent[]): void {
    t.done = true;
    const { kind } = t;
    if (kind === 'gate') {
      const n = t.n!;
      if (this.lane === t.gate!.correct) {
        const points = GATE_POINTS * n;
        this.score += points;
        this.routed++;
        events.push({ type: 'gateRight', n, points, lane: this.lane });
      } else {
        // A wrong route is a decision, not a collision: invulnerability does not cover it.
        this.lives--;
        events.push({ type: 'gateWrong', n, lane: this.lane, correct: t.gate!.correct });
      }
    } else if (t.lanes.includes(this.lane)) {
      if (kind === 'ack') {
        this.score += ACK_POINTS;
        t.gone = true;
        events.push({ type: 'ack', lane: this.lane });
      } else if (this.invuln === 0) {
        this.lives--;
        this.invuln = INVULN;
        events.push({ type: 'hit', lane: this.lane, kind });
      }
    }
    if (this.lives <= 0) {
      this.lives = 0;
      this.over = true;
      events.push({ type: 'gameOver' });
    }
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run tests/unit/runner-logic.test.ts && npm run typecheck`
Expected: all tests pass and tsc is clean.

- [ ] **Step 5: Commit**

```bash
git add src/games/runner/logic.ts tests/unit/runner-logic.test.ts
git commit -m "feat(runner): pure World with lanes, hazards, gates and speed ramp" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Scene, mount and hub wiring

**Files:**
- Create: `src/games/runner/textures.ts`, `src/games/runner/scene.ts`, `src/games/runner/index.ts`, `src/games/runner/runner.css`
- Modify: `src/main.ts`, `src/games/registry.ts`, `tests/unit/carousel.test.ts`, `tests/e2e/hub.spec.ts`, `tests/e2e/games.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`destroyGame`, `bake`, `GLOW`, `neonPoly`, `neonCircle`), Task 3 (`World`, `W`, `H`, `SPAWN_Z`, `type GameEvent`, `type Thing`) and Task 2 (via `Thing.gate`: `labels`, `dest`, `correct`).
- Produces: `createGame(): GameModule`, loaded lazily by the `runner` cabinet. For e2e, the DOM exposes `.runner[data-lane]` (updated every frame), `.runner[data-correct]` (set when a gate warning fires), `.pr-canvas canvas`, `.pr-router.is-on`, `.pr-flash` and the HUD cells `score`, `lives` and `gates`.

The scene is drawing only and has no unit tests. The e2e tests below cover it: boot, steering, the first gate and teardown, plus the leak loop.

- [ ] **Step 1: Write the e2e tests and swap the COMING SOON cabinet**

`tests/e2e/games.spec.ts`, apply this change:

```diff
@@ -193,6 +193,40 @@ test('invaders: Phaser boots, firing scores, Esc tears the canvas down', async (
   expect(errors).toEqual([]);
 });
 
+test('runner: Phaser boots, steering moves the packet, Esc tears the canvas down', async ({ page }) => {
+  const errors = trackErrors(page);
+  await boot(page, '?seed=3');
+  await launch(page, 'runner');
+  const root = page.locator('.runner');
+  await expect(page.locator('.pr-canvas canvas')).toHaveCount(1);
+  await expect(root).toHaveAttribute('data-lane', '1');
+  await page.keyboard.press('ArrowLeft');
+  await expect(root).toHaveAttribute('data-lane', '0');
+  await page.keyboard.press('d');
+  await expect(root).toHaveAttribute('data-lane', '1');
+  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');
+  await page.keyboard.press('Escape');
+  await expect(page.locator('.game-layer')).toBeHidden();
+  await expect(page.locator('canvas')).toHaveCount(0);
+  expect(errors).toEqual([]);
+});
+
+test('runner: the first router gate scores when the packet takes the matching lane', async ({ page }) => {
+  const errors = trackErrors(page);
+  await boot(page, '?seed=5');
+  await launch(page, 'runner');
+  // No hazards spawn before the first gate, so the packet can wait in lane 1 for the banner.
+  await expect(page.locator('.pr-router')).toHaveClass(/is-on/, { timeout: 20_000 });
+  const correct = Number(await page.locator('.runner').getAttribute('data-correct'));
+  if (correct === 0) await page.keyboard.press('ArrowLeft');
+  if (correct === 2) await page.keyboard.press('ArrowRight');
+  await expect(page.locator('.runner')).toHaveAttribute('data-lane', String(correct));
+  await expect(page.locator('.pr-flash')).toContainText(/ROUTED \+100/, { timeout: 8000 });
+  await expect(page.locator('[data-hud="gates"]')).toHaveText('1');
+  await expect(page.locator('[data-hud="lives"]')).toHaveText('◆◆◆');
+  expect(errors).toEqual([]);
+});
+
 /** Rebuilds the rulebook and packet from the page's data attributes and asks the real firewall logic. */
 async function portAnswer(page: Page): Promise<Action> {
   const rows = await page.locator('.pg-rule').evaluateAll((els) => els.map((e) => ({ ...(e as HTMLElement).dataset })));
@@ -306,11 +340,11 @@ test('bughunt: right picks score, misses show the fix, three strikes end the run
   expect(errors).toEqual([]);
 });
 
-test('20 launch/exit cycles across the five games leave nothing behind', async ({ page }) => {
+test('20 launch/exit cycles across the six games leave nothing behind', async ({ page }) => {
   test.setTimeout(240_000);
   const errors = trackErrors(page);
-  // Records every WebGL/WebGL2 context any canvas hands out, so a regression in invaders'
-  // destroyGame (context not released) fails this test even though handler/node counts stay clean.
+  // Records every WebGL/WebGL2 context any canvas hands out, so a regression in the Phaser
+  // games' destroyGame (context not released) fails this test even though handler/node counts stay clean.
   await page.addInitScript(() => {
     type GLContext = WebGLRenderingContext | WebGL2RenderingContext;
     const contexts: GLContext[] = [];
@@ -323,7 +357,7 @@ test('20 launch/exit cycles across the five games leave nothing behind', async (
     } as typeof HTMLCanvasElement.prototype.getContext;
   });
   await boot(page, '?selftest');
-  const games = ['phish', 'password', 'invaders', 'port', 'bughunt'];
+  const games = ['phish', 'password', 'invaders', 'port', 'bughunt', 'runner'];
   const cycle = async (id: string) => {
     await launch(page, id);
     await expect(page.locator('.game-root')).toHaveCount(1);
```

`tests/unit/carousel.test.ts`, apply this change:

```diff
@@ -55,7 +55,7 @@ describe('carousel', () => {
 
   it('marks unbuilt games COMING SOON and shows the Classic note', () => {
     const { c } = make();
-    expect(c.el.querySelector('[data-id="runner"] .soon')).not.toBeNull();
+    expect(c.el.querySelector('[data-id="defense"] .soon')).not.toBeNull();
     expect(c.el.querySelector('[data-id="classic"] .cab-note')?.textContent).toContain('Alt+');
     c.el.remove();
   });
```

`tests/e2e/hub.spec.ts`, apply this change:

```diff
@@ -21,9 +21,8 @@ test('arrow keys rotate the carousel with wraparound', async ({ page }) => {
 
 test('a coming-soon cabinet shakes instead of launching', async ({ page }) => {
   await boot(page);
-  await page.keyboard.press('ArrowRight');
-  await page.keyboard.press('ArrowRight');
-  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'runner');
+  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
+  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'defense');
   await page.keyboard.press('Enter');
   await expect(page.locator('.cabinet.is-center')).toHaveClass(/shake/);
   await expect(page.locator('.title-card')).toHaveCount(0);
```

- [ ] **Step 2: Run them and watch the runner tests fail**

Run: `npm test && npx playwright test -g "runner|coming-soon"`
Expected: unit tests pass, and the coming-soon e2e passes against `defense`. The two `runner:` tests FAIL, because the runner cabinet still shakes as COMING SOON and `.title-card` never appears.

- [ ] **Step 3: Textures**

Create `src/games/runner/textures.ts` (full file):

```ts
import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../../core/theme';
import { bake, GLOW, neonCircle, neonPoly } from '../phaser-util';

// Texture sizes are world sizes at the packet's plane (z = 0); the scene scales them by depth.
// Every texture is drawn with its bottom edge on the floor (origin 0.5, 1).

const CYAN = hexToInt(palette.cyan);
const PINK = hexToInt(palette.pink);
const YELLOW = hexToInt(palette.yellow);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const WHITE = 0xffffff;

/** Width and height of the gate arch texture; the scene places labels relative to it. */
export const ARCH_W = 1300;
export const ARCH_H = 720;
/** Height of the label panels' centres above the floor. */
export const LABEL_Y = 520;

export function makeTextures(scene: Phaser.Scene): void {
  // The packet: a cyan arrowhead pointing down the tunnel, with a bright core.
  bake(scene, 'packet', 160, 120, (g) => {
    neonPoly(g, [{ x: 80, y: 14 }, { x: 146, y: 104 }, { x: 80, y: 82 }, { x: 14, y: 104 }], CYAN, 0.45);
    g.fillStyle(WHITE, 0.95);
    g.fillTriangle(80, 34, 98, 74, 62, 74);
  });

  // DDoS flood: a red wall of jagged traffic, one lane wide.
  bake(scene, 'flood', 340, 260, (g) => {
    neonPoly(g, [
      { x: 14, y: 250 }, { x: 14, y: 40 }, { x: 60, y: 14 }, { x: 110, y: 46 }, { x: 170, y: 12 },
      { x: 230, y: 46 }, { x: 280, y: 14 }, { x: 326, y: 40 }, { x: 326, y: 250 },
    ], DANGER, 0.5);
    g.lineStyle(4, PINK, 0.9);
    for (const y of [90, 140, 190]) g.lineBetween(40, y, 300, y);
  });

  // Corrupted node: a glitchy magenta block.
  bake(scene, 'node', 200, 200, (g) => {
    neonPoly(g, [{ x: 20, y: 30 }, { x: 180, y: 20 }, { x: 186, y: 186 }, { x: 14, y: 180 }], PINK, 0.4);
    g.fillStyle(YELLOW, 0.9);
    g.fillRect(40, 60, 70, 10);
    g.fillRect(90, 100, 70, 10);
    g.fillRect(50, 140, 50, 10);
  });

  // ACK token: a green ring with a tick.
  bake(scene, 'ack', 110, 110, (g) => {
    neonCircle(g, 55, 55, 38, OK, 0.25);
    g.lineStyle(8, OK, 1);
    g.beginPath();
    g.moveTo(36, 56);
    g.lineTo(50, 70);
    g.lineTo(76, 40);
    g.strokePath();
  });

  // Router gate: an arch across all three lanes with one label panel per lane.
  bake(scene, 'arch', ARCH_W, ARCH_H, (g) => {
    const posts = [
      [{ x: 14, y: ARCH_H }, { x: 14, y: 14 }, { x: ARCH_W - 14, y: 14 }, { x: ARCH_W - 14, y: ARCH_H }],
    ];
    for (const [w, a] of GLOW) {
      g.lineStyle(w, YELLOW, a);
      g.strokePoints(posts[0], false);
    }
    g.lineStyle(6, YELLOW, 1);
    g.strokePoints(posts[0], false);
    const cy = ARCH_H - LABEL_Y;
    for (let lane = 0; lane < 3; lane++) {
      const cx = ARCH_W / 2 + (lane - 1) * 360;
      neonPoly(g, [{ x: cx - 170, y: cy - 45 }, { x: cx + 170, y: cy - 45 }, { x: cx + 170, y: cy + 45 }, { x: cx - 170, y: cy + 45 }], CYAN, 0.15);
    }
  });

  // Soft white dot for particles (tinted per burst).
  bake(scene, 'spark', 16, 16, (g) => {
    g.fillStyle(WHITE, 0.3);
    g.fillCircle(8, 8, 8);
    g.fillStyle(WHITE, 1);
    g.fillCircle(8, 8, 4);
  });
}
```

- [ ] **Step 4: Scene**

Create `src/games/runner/scene.ts` (full file):

```ts
import * as Phaser from 'phaser';
import { fonts, hexToInt, palette } from '../../core/theme';
import { SPAWN_Z, type GameEvent, type Thing, type World } from './logic';
import { LABEL_Y, makeTextures } from './textures';

export interface SceneHooks {
  /** Called every frame with what happened, after the scene has drawn it. */
  onEvents(events: GameEvent[], world: World): void;
}

// Perspective: a point `z` units ahead of the packet is drawn at scale s = F / (z + F),
// shrinking toward the vanishing point (VX, VY). World x is lanes × LANE_W; world y is height above the floor.
const VX = 960;
const VY = 380;
const F = 700;
const LANE_W = 360;
const FLOOR_Y = 600; // the floor sits this far below the vanishing point at s = 1
const PACKET_Y = VY + FLOOR_Y; // 980
const RING_GAP = 600;
const RING_HALF_W = 640;
const RING_TOP = 200; // ring top edge, world units above the vanishing point
const FADE_Z = SPAWN_Z * 0.8; // things fade in over the far 20% of the spawn distance
const LANE_EASE = 14; // packet slide speed between lanes (≈120 ms)

type Burst = 'pink' | 'cyan' | 'ok' | 'danger';
const BURST_COLOR: Record<Burst, string> = { pink: palette.pink, cyan: palette.cyan, ok: palette.ok, danger: palette.danger };

type GateView = { arch: Phaser.GameObjects.Image; labels: Phaser.GameObjects.Text[] };

const scaleAt = (z: number) => F / (z + F);
const laneX = (lane: number, s: number) => VX + (lane - 1) * LANE_W * s;
const floorY = (s: number) => VY + FLOOR_Y * s;

/**
 * Draws the World. All game rules live in logic.ts; this class only mirrors the world's
 * things as images every frame and turns events into effects.
 */
export class RunnerScene extends Phaser.Scene {
  private readonly pool = new Map<string, Phaser.GameObjects.Image>();
  private readonly gates = new Map<number, GateView>();
  private readonly seen = new Set<string>();
  private readonly bursts = new Map<Burst, Phaser.GameObjects.Particles.ParticleEmitter>();
  private tunnel!: Phaser.GameObjects.Graphics;
  private packet!: Phaser.GameObjects.Image;
  private shownLane = 1;

  constructor(
    private readonly world: World,
    private readonly hooks: SceneHooks,
  ) {
    super('runner');
  }

  create(): void {
    makeTextures(this);
    this.tunnel = this.add.graphics().setDepth(-SPAWN_Z - 10);
    this.packet = this.add.image(VX, PACKET_Y, 'packet').setOrigin(0.5, 1).setDepth(5);
    this.shownLane = this.world.lane;
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
    const events = this.world.step(delta / 1000);
    this.draw(time / 1000, delta / 1000);
    for (const e of events) this.effect(e);
    this.hooks.onEvents(events, this.world);
  }

  private draw(t: number, dt: number): void {
    const w = this.world;
    this.drawTunnel(w.distance);

    this.seen.clear();
    for (const thing of w.things) {
      if (thing.kind === 'gate') this.drawGate(thing);
      else if (!thing.gone) for (const lane of thing.lanes) this.drawThing(thing, lane, t);
    }
    for (const [key, img] of this.pool) {
      if (!this.seen.has(key)) {
        img.destroy();
        this.pool.delete(key);
      }
    }
    for (const [id, view] of this.gates) {
      if (!this.seen.has(`gate:${id}`)) {
        view.arch.destroy();
        for (const label of view.labels) label.destroy();
        this.gates.delete(id);
      }
    }

    // The packet slides toward its lane, bobs, flickers while invulnerable and vanishes at game over.
    this.shownLane += (w.lane - this.shownLane) * Math.min(1, dt * LANE_EASE);
    this.packet.setPosition(laneX(this.shownLane, 1), PACKET_Y + Math.sin(t * 6) * 6);
    this.packet.setVisible(!w.over && (w.invuln === 0 || Math.floor(t * 12) % 2 === 0));
  }

  /** Neon rings streaming toward the camera, plus the lane lines on the floor. */
  private drawTunnel(distance: number): void {
    const g = this.tunnel;
    g.clear();
    const first = Math.floor(distance / RING_GAP);
    for (let idx = first + 12; idx >= first; idx--) {
      const z = idx * RING_GAP - distance;
      if (z > SPAWN_Z * 1.1 || z < -F * 0.5) continue;
      const s = scaleAt(z);
      const alpha = 0.85 * Math.min(1, Math.max(0, 1 - z / (SPAWN_Z * 1.1)));
      g.lineStyle(3, idx % 2 === 0 ? hexToInt(palette.cyan) : hexToInt(palette.pink), alpha);
      g.strokeRect(VX - RING_HALF_W * s, VY - RING_TOP * s, RING_HALF_W * 2 * s, (RING_TOP + FLOOR_Y) * s);
    }
    const far = scaleAt(SPAWN_Z);
    g.lineStyle(2, hexToInt(palette.cyan), 0.35);
    for (const x of [-540, -180, 180, 540]) g.lineBetween(VX + x, floorY(1), VX + x * far, floorY(far));
  }

  private drawThing(thing: Thing, lane: number, t: number): void {
    const key = `${thing.id}:${lane}`;
    this.seen.add(key);
    let img = this.pool.get(key);
    if (!img) {
      img = this.add.image(0, 0, thing.kind).setOrigin(0.5, 1);
      this.pool.set(key, img);
    }
    const s = scaleAt(thing.z);
    const pulse = thing.kind === 'ack' ? 1 + Math.sin(t * 8 + thing.id) * 0.08 : 1;
    img.setPosition(laneX(lane, s), floorY(s)).setScale(s * pulse).setDepth(-thing.z);
    img.setAlpha(Math.min(1, (SPAWN_Z - thing.z) / (SPAWN_Z - FADE_Z)));
    if (thing.kind === 'node') img.setAngle(Math.sin(t * 5 + thing.id) * 6);
  }

  private drawGate(thing: Thing): void {
    const gate = thing.gate!;
    this.seen.add(`gate:${thing.id}`);
    let view = this.gates.get(thing.id);
    if (!view) {
      view = {
        arch: this.add.image(0, 0, 'arch').setOrigin(0.5, 1),
        labels: gate.labels.map((label) =>
          this.add
            .text(0, 0, label, { fontFamily: fonts.mono, fontSize: '34px', fontStyle: 'bold', color: palette.yellow })
            .setOrigin(0.5),
        ),
      };
      this.gates.set(thing.id, view);
    }
    const s = scaleAt(thing.z);
    const alpha = Math.min(1, (SPAWN_Z - thing.z) / (SPAWN_Z - FADE_Z), 1 + thing.z / 300);
    view.arch.setPosition(VX, floorY(s)).setScale(s).setDepth(-thing.z).setAlpha(alpha);
    view.labels.forEach((label, lane) =>
      label.setPosition(laneX(lane, s), VY + (FLOOR_Y - LABEL_Y) * s).setScale(s).setDepth(-thing.z + 0.5).setAlpha(alpha),
    );
  }

  /** Colors the labels of gate `n` once it resolves: the right one green, a wrong pick red. */
  private markGate(n: number, correct: number, picked: number): void {
    const thing = this.world.things.find((th) => th.kind === 'gate' && th.n === n);
    const view = thing && this.gates.get(thing.id);
    if (!view) return;
    view.labels[correct].setColor(palette.ok);
    if (picked !== correct) view.labels[picked].setColor(palette.danger);
  }

  private effect(e: GameEvent): void {
    switch (e.type) {
      case 'hit':
        this.burst('danger', 40, laneX(e.lane, 1), PACKET_Y - 60);
        this.cameras.main.shake(250, 0.012);
        break;
      case 'ack':
        this.burst('cyan', 16, laneX(e.lane, 1), PACKET_Y - 60);
        this.float('+10', laneX(e.lane, 1), PACKET_Y - 140, palette.cyan, 30);
        break;
      case 'gateRight':
        this.markGate(e.n, e.lane, e.lane);
        this.burst('ok', 50, laneX(e.lane, 1), PACKET_Y - 60);
        this.float(`+${e.points.toLocaleString('en-US')}`, laneX(e.lane, 1), PACKET_Y - 160, palette.ok, 44);
        break;
      case 'gateWrong':
        this.markGate(e.n, e.correct, e.lane);
        this.cameras.main.flash(250, 255, 59, 92);
        break;
      case 'gameOver':
        this.burst('pink', 90, laneX(this.world.lane, 1), PACKET_Y - 60);
        break;
      default:
        break;
    }
  }

  private burst(kind: Burst, count: number, x: number, y: number): void {
    this.bursts.get(kind)!.explode(count, x, y);
  }

  /** A short text that drifts up and fades: +10, +200, ... */
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

- [ ] **Step 5: Mount/unmount**

Create `src/games/runner/index.ts` (full file):

```ts
import * as Phaser from 'phaser';
import type { SfxName } from '../../core/audio';
import { mulberry32, type Rng } from '../../core/random';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { destroyGame } from '../phaser-util';
import { H, W, World, type GameEvent } from './logic';
import { RunnerScene } from './scene';

const END_DELAY_MS = 1500; // let the final burst play before game over
const FLASH_MS = 1200;
const HINT = '/24 = first 3 numbers must match';

const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
  hit: 'hit',
  ack: 'coin',
  gateWarn: 'select',
  gateRight: 'score',
  gateWrong: 'error',
  gameOver: 'explode',
};

/** `?seed=N` makes the run repeatable (tests, debugging); otherwise it is random. */
function runRng(): Rng {
  const seed = new URLSearchParams(location.search).get('seed');
  return seed !== null && /^\d+$/.test(seed) ? mulberry32(Number(seed)) : Math.random;
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let game: Phaser.Game | null = null;
  let ready = false;
  let tornDown = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  // Phaser's VisibilityHandler overwrites window.onblur/onfocus; destroy() restores them here.
  let savedBlur: typeof window.onblur = null;
  let savedFocus: typeof window.onfocus = null;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const world = new World(runRng());
      const hud = createHud([['score', 'SCORE'], ['lives', 'LIVES'], ['gates', 'ROUTED']]);
      const dest = el('div.pr-dest');
      const hint = el('div.pr-hint');
      const router = el('div.pr-router', {}, el('div.pr-router-title', {}, 'ROUTER AHEAD'), dest, hint);
      const flash = el('div.pr-flash');
      const host = el('div.pr-canvas');
      const gameRoot = el('div.runner', {}, host, hud.el, router, flash);
      root = gameRoot;
      gameRoot.dataset.lane = String(world.lane);
      container.append(gameRoot);

      const showFlash = (text: string, ok: boolean) => {
        flash.textContent = text;
        flash.className = ok ? 'pr-flash is-on is-ok' : 'pr-flash is-on is-danger';
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => flash.classList.remove('is-on'), FLASH_MS);
      };

      ctx.input.onKey((e) => {
        if (e.repeat || world.over) return;
        const dir = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0;
        if (dir !== 0 && world.steer(dir)) ctx.audio.sfx('move');
      });

      const onEvents = (events: GameEvent[], w: World) => {
        for (const e of events) {
          const name = SFX[e.type];
          if (name) ctx.audio.sfx(name);
          if (e.type === 'gateWarn') {
            dest.textContent = `DEST ${e.gate.dest}`;
            hint.textContent = e.hint ? HINT : '';
            gameRoot.dataset.correct = String(e.gate.correct);
            router.classList.add('is-on');
          }
          if (e.type === 'gateRight') {
            router.classList.remove('is-on');
            showFlash(`ROUTED +${e.points.toLocaleString('en-US')}`, true);
          }
          if (e.type === 'gateWrong') {
            router.classList.remove('is-on');
            showFlash('PACKET DROPPED', false);
          }
          if (e.type === 'gameOver') {
            router.classList.remove('is-on');
            showFlash('CONNECTION LOST', false);
            endTimer = setTimeout(() => ctx.endRun(w.score), END_DELAY_MS);
          }
        }
        gameRoot.dataset.lane = String(w.lane);
        hud.set('score', w.score.toLocaleString('en-US'));
        hud.set('lives', '◆'.repeat(w.lives) || '—');
        hud.set('gates', String(w.routed));
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
        scene: new RunnerScene(world, { onEvents }),
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
      clearTimeout(flashTimer);
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

- [ ] **Step 6: Styles**

Create `src/games/runner/runner.css` (full file):

```css
.runner {
  position: absolute;
  inset: 0;
  overflow: hidden;
  /* A cyan glow at the vanishing point behind the transparent Phaser canvas. */
  background:
    radial-gradient(ellipse 30% 22% at 50% 35%, rgba(0, 240, 255, 0.28), transparent 70%),
    linear-gradient(180deg, #05000f 0%, var(--c-deep) 45%, var(--c-purple) 100%);
}
.pr-canvas {
  position: absolute;
  inset: 0;
}
.pr-canvas canvas {
  display: block;
}
.runner .hud {
  z-index: 2;
}
.pr-router {
  position: absolute;
  top: 130px;
  left: 50%;
  z-index: 2;
  width: 760px;
  margin-left: -380px;
  padding: 18px 24px 22px;
  text-align: center;
  border: 3px solid var(--c-yellow);
  border-radius: 14px;
  background: rgba(14, 0, 32, 0.82);
  box-shadow: 0 0 24px rgba(255, 226, 89, 0.45);
  opacity: 0;
  transform: translateY(-24px);
  transition: opacity 0.25s, transform 0.25s;
  pointer-events: none;
}
.pr-router.is-on {
  opacity: 1;
  transform: translateY(0);
}
.pr-router-title {
  font-family: var(--f-display);
  font-size: 30px;
  letter-spacing: 6px;
  color: var(--c-yellow);
}
.pr-dest {
  margin-top: 6px;
  font-family: var(--f-mono);
  font-weight: 700;
  font-size: 54px;
  color: var(--c-ink);
  text-shadow: 0 0 16px var(--c-cyan);
}
.pr-hint {
  margin-top: 8px;
  font-family: var(--f-ui);
  font-weight: 600;
  font-size: 26px;
  color: var(--c-cyan);
}
.pr-hint:empty {
  display: none;
}
.pr-flash {
  position: absolute;
  top: 470px;
  left: 0;
  right: 0;
  z-index: 2;
  text-align: center;
  font-family: var(--f-display);
  font-size: 80px;
  letter-spacing: 6px;
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: none;
}
.pr-flash.is-on {
  opacity: 1;
  transform: scale(1);
}
.pr-flash.is-ok {
  color: var(--c-ok);
  text-shadow: 0 0 18px var(--c-ok), 0 0 42px var(--c-cyan);
}
.pr-flash.is-danger {
  color: var(--c-danger);
  text-shadow: 0 0 18px var(--c-danger), 0 0 42px var(--c-yellow);
}
```

- [ ] **Step 7: Wire the cabinet and the stylesheet**

`src/main.ts`, apply this change:

```diff
@@ -12,6 +12,7 @@ import './games/password/password.css';
 import './games/invaders/invaders.css';
 import './games/port/port.css';
 import './games/bughunt/bughunt.css';
+import './games/runner/runner.css';
 
 import { createAudio } from './core/audio';
 import { watchFullscreen } from './core/fullscreen';
```

`src/games/registry.ts`, apply this change:

```diff
@@ -26,7 +26,8 @@ export const CABINETS: Cabinet[] = [
     title: 'Packet Runner',
     tagline: 'Race a data packet through the network. Dodge DDoS floods and take the right route.',
     category: 'arcade',
-    controls: [['← →', 'Switch lane']],
+    controls: [['← → / A D', 'Switch lane']],
+    load: () => import('./runner/index').then((m) => m.createGame()),
   },
   {
     kind: 'game',
```

- [ ] **Step 8: Run everything**

Run: `npm run typecheck && npm test && npm run build`
Expected: tsc is clean, all unit tests pass and the build succeeds.

Run: `npx playwright test`
Expected: the whole e2e suite passes, including both `runner:` tests, the invaders test and both 20-cycle leak loops.

- [ ] **Step 9: Commit**

```bash
git add src/games/runner src/main.ts src/games/registry.ts tests/unit/carousel.test.ts tests/e2e/hub.spec.ts tests/e2e/games.spec.ts
git commit -m "feat(runner): Packet Runner scene, overlays and hub cabinet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
