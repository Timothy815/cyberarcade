# Firewall Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Firewall Defense, a 10-wave tower-defense game on a neon circuit board. Attackers run a trace from INTERNET to SERVER, and the player builds Firewall, IDS, Honeypot and Rate Limiter towers on 12 pads, learning which defense counters which attack. It plugs into the live hub through the existing `GameModule` contract.

**Architecture:** The same split as Malware Invaders and Packet Runner. `path.ts` is pure map data (waypoints, pads, `pointAt`, `distToPath`). `waves.ts` holds the 10 wave compositions and `buildWave(n, rng)`. A pure, seeded `World` in `logic.ts` owns every rule on a fixed 1/120 s timestep and returns `GameEvent[]` from `step(dt)`. `DefenseScene` only draws and turns events into effects. `index.ts` implements mount/unmount and the DOM overlays: HUD, invisible pad buttons over the canvas, the build/upgrade bar, the countdown with SEND NOW, lesson callouts and the end banner.

**Tech Stack:** Vite 8, TypeScript 5.9 strict, Phaser 3.90.0, Vitest (jsdom), Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-04-firewall-defense-design.md`

**Starting point:** branch `firewall-defense` (from `main`). Every code block below was built and verified in a prototype: `npm run build`, `npm test` (29 files, 284 tests) and `npx playwright test` (21 tests) all pass. A balance sim won seeds 1–3 with sensible builds.

## Global Constraints

- The game contract is unchanged: `createGame(): GameModule { mount(container, ctx), unmount() }`. Input goes only through `ctx.input.onKey` (plus DOM mouse events on the game's own elements), and sound only through `ctx.audio.sfx`.
- The stage is a fixed 1920×1080. CSS uses px and the theme tokens (`var(--c-*)`, `var(--f-*)`).
- `?seed=N` makes every random choice repeatable. A given seed and input sequence give the same run whatever the frame rate.
- `unmount()` leaves nothing behind: no listeners, DOM, timers or live WebGL context (the 20-cycle leak test enforces this).
- Shared Phaser plumbing comes from `src/games/phaser-util.ts` (`destroyGame`, `bake`, `neonPoly`, `neonCircle`, types `G`, `Pt`). Do not duplicate it.
- Commands: `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test` (it builds and serves the preview itself). The shell is zsh, so quote globs.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push or merge.

## Rulings carried into this plan

- **Callout placement:** the lesson callout is 710 px wide at top 120 / left 400, so it sits between pads 0 and 5 above the trace instead of covering them. Long callouts wrap to two lines.
- **HUD wave cell:** during a build pause it shows the *upcoming* wave (`min(wave + 1, 10)/10`), so a fresh run reads 1/10, not 0/10. `data-wave` on the root stays the World's actual wave (0 before wave 1) for e2e.
- **COMING SOON tests:** Defense was the last unbuilt cabinet. The carousel unit test fakes an unbuilt `defense` entry (`load: undefined`) to keep the COMING SOON badge covered. The hub unit test already uses its own fake list, so it is unchanged. The e2e test that walked to COMING SOON now walks to Firewall Defense and launches it.
- **E2E credits check:** the build test asserts credits are no longer 120 rather than exactly 70, because wave timing in a real browser is not frame-exact.
- **Trace drawing:** `strokePoints(trace)` is called without `closeShape`/`closePath`; passing `closePath = true` draws a diagonal from SERVER back to INTERNET.
- **Run length:** about 340 s without SEND NOW, longer than the spec's 3–4 min. Tune it at the lab playtest, not in this plan.

## File map

| File | Task | Role |
|---|---|---|
| `src/games/defense/path.ts` | 1 | `Pt`, `WAYPOINTS`, `PADS`, `PAD_CLEAR`, `PATH_LENGTH`, `pointAt(d)`, `distToPath(p)` |
| `src/games/defense/waves.ts` | 1 | `Kind`, `Spawn`, `WAVE_COUNT`, `WAVES`, `GAP`, `buildWave(n, rng)` |
| `src/games/defense/logic.ts` | 2 | `World`, constants, `ATTACKERS`, `TOWERS`, `GameEvent` |
| `src/games/defense/textures.ts`, `scene.ts`, `index.ts`, `defense.css` | 3 | drawing, mount/unmount, overlays |
| `src/main.ts`, `src/games/registry.ts` | 3 | CSS import, `load()` and controls |
| `tests/unit/defense-path.test.ts`, `defense-waves.test.ts` | 1 | map and wave tests |
| `tests/unit/defense-logic.test.ts` | 2 | World rules and determinism |
| `tests/unit/carousel.test.ts`, `tests/e2e/hub.spec.ts`, `tests/e2e/games.spec.ts` | 3 | COMING SOON swap, defense e2e, leak loop |

---

### Task 1: Map and waves

**Files:**
- Create: `src/games/defense/path.ts`, `src/games/defense/waves.ts`
- Test: `tests/unit/defense-path.test.ts`, `tests/unit/defense-waves.test.ts`

**Interfaces:**
- Consumes: `Rng`, `shuffle` and `mulberry32` from `src/core/random`.
- Produces: `Pt { x, y }`; `WAYPOINTS: readonly Pt[]`; `PADS: readonly Pt[]` (12); `PAD_CLEAR`; `PATH_LENGTH`; `pointAt(d: number): Pt`; `distToPath(p: Pt): number`; `Kind = 'malware' | 'stealth' | 'brute' | 'ddos'`; `Spawn { kind, delay }`; `WAVE_COUNT = 10`; `WAVES`; `GAP`; `buildWave(n: number, rng: Rng): Spawn[]` (n is 1-based).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/defense-path.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { distToPath, PAD_CLEAR, PADS, PATH_LENGTH, pointAt, WAYPOINTS } from '../../src/games/defense/path';

describe('defense path', () => {
  it('has the expected total length', () => {
    expect(PATH_LENGTH).toBe(3340);
  });

  it('pointAt hits every waypoint at its cumulative distance', () => {
    let d = 0;
    WAYPOINTS.forEach((w, i) => {
      if (i > 0) d += Math.hypot(w.x - WAYPOINTS[i - 1].x, w.y - WAYPOINTS[i - 1].y);
      const p = pointAt(d);
      expect(p.x).toBeCloseTo(w.x, 6);
      expect(p.y).toBeCloseTo(w.y, 6);
    });
  });

  it('pointAt interpolates and clamps to the ends', () => {
    expect(pointAt(190)).toEqual({ x: 330, y: 300 });
    expect(pointAt(-50)).toEqual({ x: 140, y: 300 });
    expect(pointAt(PATH_LENGTH + 500)).toEqual({ x: 1800, y: 540 });
  });

  it('has 12 pads, none overlapping the trace, all within firewall reach of it', () => {
    expect(PADS).toHaveLength(12);
    for (const p of PADS) {
      expect(distToPath(p)).toBeGreaterThanOrEqual(PAD_CLEAR);
      expect(distToPath(p)).toBeLessThanOrEqual(230);
    }
  });
});
```

Create `tests/unit/defense-waves.test.ts` (full file):

```ts
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/defense-path.test.ts tests/unit/defense-waves.test.ts`
Expected: FAIL, the modules `../../src/games/defense/path` and `waves` do not exist.

- [ ] **Step 3: Implement the map**

Create `src/games/defense/path.ts` (full file):

```ts
// Pure map data for Firewall Defense: the circuit trace attackers follow and the build pads
// beside it. Coordinates are canvas pixels on the 1920×1080 stage.

export interface Pt {
  x: number;
  y: number;
}

/** The trace, from INTERNET (left) to the SERVER (right). Segments are axis-aligned. */
export const WAYPOINTS: readonly Pt[] = [
  { x: 140, y: 300 },
  { x: 520, y: 300 },
  { x: 520, y: 780 },
  { x: 960, y: 780 },
  { x: 960, y: 300 },
  { x: 1400, y: 300 },
  { x: 1400, y: 780 },
  { x: 1640, y: 780 },
  { x: 1640, y: 540 },
  { x: 1800, y: 540 },
];

/** Build pad centres. None of them overlaps the trace (see PAD_CLEAR). */
export const PADS: readonly Pt[] = [
  { x: 330, y: 180 },
  { x: 330, y: 420 },
  { x: 740, y: 420 },
  { x: 740, y: 660 },
  { x: 740, y: 900 },
  { x: 1180, y: 180 },
  { x: 1180, y: 420 },
  { x: 1180, y: 660 },
  { x: 1560, y: 420 },
  { x: 1560, y: 660 },
  { x: 1560, y: 900 },
  { x: 1780, y: 420 },
];

/** Pad radius plus half the trace width: every pad centre is at least this far from the trace. */
export const PAD_CLEAR = 70;

const SEG_LENGTHS = WAYPOINTS.slice(1).map((p, i) => Math.hypot(p.x - WAYPOINTS[i].x, p.y - WAYPOINTS[i].y));

/** Total length of the trace in pixels. */
export const PATH_LENGTH = SEG_LENGTHS.reduce((a, b) => a + b, 0);

/** The point `d` pixels along the trace, clamped to its ends. */
export function pointAt(d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 0; i < SEG_LENGTHS.length; i++) {
    const len = SEG_LENGTHS[i];
    if (left <= len || i === SEG_LENGTHS.length - 1) {
      const a = WAYPOINTS[i];
      const b = WAYPOINTS[i + 1];
      const t = Math.min(1, left / len);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= len;
  }
  return { ...WAYPOINTS[WAYPOINTS.length - 1] };
}

/** Shortest distance from `p` to the trace. */
export function distToPath(p: Pt): number {
  let best = Infinity;
  for (let i = 1; i < WAYPOINTS.length; i++) {
    const a = WAYPOINTS[i - 1];
    const b = WAYPOINTS[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return best;
}
```

- [ ] **Step 4: Implement the waves**

Create `src/games/defense/waves.ts` (full file):

```ts
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
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/defense-path.test.ts tests/unit/defense-waves.test.ts && npm run typecheck`
Expected: 8 tests pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/games/defense/path.ts src/games/defense/waves.ts tests/unit/defense-path.test.ts tests/unit/defense-waves.test.ts
git commit -m "feat(defense): circuit map and wave definitions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The World

**Files:**
- Create: `src/games/defense/logic.ts`
- Test: `tests/unit/defense-logic.test.ts`

**Interfaces:**
- Consumes: from Task 1, `PADS`, `PATH_LENGTH`, `pointAt`, `Kind`, `Spawn`, `WAVE_COUNT`, `buildWave`; `Rng` from `src/core/random`.
- Produces: `World` (constructor `new World(rng, opts?: WorldOptions)` where `WorldOptions { waves?: boolean; firstWave?: number; buildWave?: (n, rng) => Spawn[] }` lets tests turn off the spawner; fields `wave`, `phase: 'build' | 'wave' | 'over'`, `credits`, `integrity`, `score`, `buildLeft`, `towers: (Tower | null)[]`, `attackers: Attacker[]`; getter `over`; methods `step(dt): GameEvent[]`, `build(pad, kind)`, `upgrade(pad)`, `sell(pad)`, `sendNow()` returning booleans, `spawn(kind, dist?)`, `range(pad)`); `TowerKind`; `TOWERS`; `upgradeCost(kind)`; `SELL_RATE`; `HONEYPOT_SLOW`; `GameEvent` with types `waveStart { wave }`, `waveClear { wave, credits, points }`, `firstSeen { kind }`, `shot { pad, x, y }`, `kill { kind, x, y, credits, points }`, `leak { kind, damage }`, `win { bonus }`, `breach`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/defense-logic.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { PATH_LENGTH } from '../../src/games/defense/path';
import { World, type GameEvent } from '../../src/games/defense/logic';

/** A world with no wave timer or spawner, for placing attackers by hand. */
function manual(credits = 1000): World {
  const w = new World(mulberry32(1), { waves: false });
  w.credits = credits;
  return w;
}

function run(w: World, seconds: number, dt = 1 / 60): GameEvent[] {
  const out: GameEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) out.push(...w.step(dt));
  return out;
}

const of = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('defense economy', () => {
  it('building costs credits and fails on an occupied pad, a bad pad or short credits', () => {
    const w = new World(mulberry32(1));
    expect(w.credits).toBe(120);
    expect(w.build(1, 'firewall')).toBe(true);
    expect(w.credits).toBe(70);
    expect(w.towers[1]).toMatchObject({ kind: 'firewall', level: 1 });
    expect(w.build(1, 'ids')).toBe(false);
    expect(w.build(12, 'ids')).toBe(false);
    expect(w.build(2, 'firewall')).toBe(true);
    expect(w.build(3, 'ids')).toBe(false); // 20 < 40
    expect(w.credits).toBe(20);
  });

  it('upgrades once for round(1.5 × cost), and selling refunds 60% of everything spent', () => {
    const w = new World(mulberry32(1));
    w.build(1, 'firewall');
    expect(w.upgrade(1)).toBe(false); // 70 < 75
    w.credits = 100;
    expect(w.upgrade(1)).toBe(true);
    expect(w.credits).toBe(25);
    expect(w.towers[1]?.level).toBe(2);
    expect(w.upgrade(1)).toBe(false);
    expect(w.upgrade(0)).toBe(false);
    expect(w.sell(1)).toBe(true);
    expect(w.credits).toBe(25 + 75); // floor(0.6 × 125)
    expect(w.towers[1]).toBeNull();
    expect(w.sell(1)).toBe(false);
  });

  it('a kill pays credits and 10 × credits in score', () => {
    const w = manual(120);
    w.build(1, 'firewall');
    w.spawn('malware', 100);
    const kills = of(run(w, 1.5), 'kill');
    expect(kills).toHaveLength(1);
    expect(kills[0]).toMatchObject({ kind: 'malware', credits: 5, points: 50 });
    expect(w.credits).toBe(75);
    expect(w.score).toBe(50);
    expect(w.attackers).toHaveLength(0);
  });
});

describe('defense movement and leaks', () => {
  it('attackers follow the trace at their speed', () => {
    const w = manual();
    const a = w.spawn('malware', 0);
    run(w, 1);
    expect(a.dist).toBeCloseTo(200, 6);
    expect(a.x).toBeCloseTo(340, 6);
    expect(a.y).toBeCloseTo(300, 6);
  });

  it('a leak costs integrity by type', () => {
    const w = manual();
    w.spawn('malware', PATH_LENGTH - 1);
    w.spawn('stealth', PATH_LENGTH - 1);
    const leaks = of(run(w, 0.05), 'leak');
    expect(leaks.map((e) => e.damage).sort()).toEqual([1, 2]);
    expect(w.integrity).toBe(17);
    expect(w.attackers).toHaveLength(0);
  });

  it('breaches at 0 integrity, and step does nothing afterwards', () => {
    const w = manual();
    w.integrity = 1;
    w.spawn('ddos', PATH_LENGTH - 1);
    const events = run(w, 0.05);
    expect(of(events, 'breach')).toHaveLength(1);
    expect(w.phase).toBe('over');
    expect(w.integrity).toBe(0);
    w.spawn('malware', 0);
    expect(w.step(0.05)).toEqual([]);
    expect(w.attackers[0].dist).toBe(0);
    expect(w.build(0, 'ids')).toBe(false);
  });
});

describe('defense towers', () => {
  it('a firewall shoots the attacker furthest along', () => {
    const w = manual();
    w.build(1, 'firewall');
    const near = w.spawn('malware', 100);
    const far = w.spawn('malware', 300);
    const shots = of(w.step(1 / 120), 'shot');
    expect(shots).toHaveLength(1);
    expect(shots[0].pad).toBe(1);
    expect(far.hp).toBe(26);
    expect(near.hp).toBe(40);
  });

  it('a firewall never targets a stealth attacker no IDS covers', () => {
    const w = manual();
    w.build(1, 'firewall');
    const sneak = w.spawn('stealth', 300);
    const m = w.spawn('malware', 100);
    run(w, 0.5);
    expect(sneak.revealed).toBe(false);
    expect(sneak.hp).toBe(50);
    expect(m.hp).toBeLessThan(40);
  });

  it('an IDS reveal makes a stealth attacker killable', () => {
    const w = manual();
    w.build(0, 'ids');
    w.upgrade(0);
    w.build(1, 'firewall');
    w.upgrade(1);
    w.spawn('stealth', 200);
    const kills = of(run(w, 1), 'kill');
    expect(kills).toEqual([expect.objectContaining({ kind: 'stealth', credits: 8, points: 80 })]);
  });

  it('a honeypot holds a brute-force bot for 2 s, once, then slows it by 30%', () => {
    const w = manual();
    w.build(0, 'honeypot');
    const bot = w.spawn('brute', 100);
    run(w, 1.9);
    expect(bot.held).toBe(true);
    expect(bot.dist).toBe(100);
    run(w, 0.2);
    expect(bot.held).toBe(false);
    expect(bot.dist).toBeGreaterThan(100);
    const before = bot.dist;
    run(w, 0.1);
    expect(bot.held).toBe(false); // not grabbed a second time by the same honeypot
    expect(bot.dist - before).toBeCloseTo(300 * 0.7 * 0.1, 6);
  });

  it('a honeypot holds one bot at a time, two once upgraded', () => {
    const w = manual();
    w.build(0, 'honeypot');
    const back = w.spawn('brute', 100);
    const front = w.spawn('brute', 150);
    run(w, 0.5);
    expect(front.dist).toBe(150);
    expect(back.dist).toBeGreaterThan(100);

    const u = manual();
    u.build(0, 'honeypot');
    u.upgrade(0);
    const a = u.spawn('brute', 100);
    const b = u.spawn('brute', 150);
    run(u, 0.5);
    expect([a.dist, b.dist]).toEqual([100, 150]);
  });

  it('a honeypot slows other attackers by 30%', () => {
    const w = manual();
    w.build(0, 'honeypot');
    const m = w.spawn('malware', 60);
    run(w, 0.5);
    expect(m.dist).toBeCloseTo(60 + 70, 6);
  });

  it('a rate limiter slows by 50%, DDoS by 70%', () => {
    const w = manual();
    w.build(0, 'limiter');
    const m = w.spawn('malware', 60);
    const d = w.spawn('ddos', 60);
    run(w, 0.5);
    expect(m.dist).toBeCloseTo(60 + 50, 6);
    expect(d.dist).toBeCloseTo(60 + 57, 6);
  });

  it('slows do not stack: only the strongest applies', () => {
    const w = manual();
    w.build(0, 'honeypot');
    w.build(1, 'limiter');
    const m = w.spawn('malware', 200);
    run(w, 0.5);
    expect(m.dist).toBeCloseTo(200 + 50, 6);
  });
});

describe('defense waves and the run', () => {
  const oneMalware = () => [{ kind: 'malware' as const, delay: 0 }];

  it('SEND NOW pays per whole second skipped and starts the next wave', () => {
    const w = new World(mulberry32(1), { buildWave: oneMalware });
    run(w, 2.5);
    expect(w.phase).toBe('build');
    expect(w.sendNow()).toBe(true);
    expect(w.credits).toBe(120 + 9); // floor(12 - 2.5)
    expect(w.phase).toBe('wave');
    expect(w.wave).toBe(1);
    expect(w.sendNow()).toBe(false);
    expect(of(w.step(1 / 60), 'waveStart')).toEqual([{ type: 'waveStart', wave: 1 }]);
    expect(manual().sendNow()).toBe(false);
  });

  it('the first wave starts by itself after the 12 s pause', () => {
    const w = new World(mulberry32(1), { buildWave: oneMalware });
    expect(of(run(w, 11.9), 'waveStart')).toHaveLength(0);
    expect(of(run(w, 0.2), 'waveStart')).toHaveLength(1);
  });

  it('clearing a wave pays credits and 100 × wave, then opens an 8 s pause', () => {
    const w = new World(mulberry32(1), { buildWave: oneMalware });
    w.build(1, 'firewall');
    w.sendNow();
    let clears: GameEvent[] = [];
    for (let i = 0; i < 600 && clears.length === 0; i++) clears = of(w.step(1 / 120), 'waveClear');
    expect(clears).toEqual([{ type: 'waveClear', wave: 1, credits: 25, points: 100 }]);
    expect(w.credits).toBe(120 - 50 + 12 + 5 + 25);
    expect(w.score).toBe(50 + 100);
    expect(w.phase).toBe('build');
    expect(w.buildLeft).toBe(8);
  });

  it('firstSeen fires once per attacker type', () => {
    const w = new World(mulberry32(1), {
      buildWave: () => [
        { kind: 'malware', delay: 0 },
        { kind: 'malware', delay: 0.1 },
        { kind: 'ddos', delay: 0.1 },
      ],
    });
    w.sendNow();
    expect(of(run(w, 1), 'firstSeen').map((e) => e.kind)).toEqual(['malware', 'ddos']);
  });

  it('clearing wave 10 wins with 50 × integrity', () => {
    const w = new World(mulberry32(1), { firstWave: 10, buildWave: () => [{ kind: 'ddos', delay: 0 }] });
    w.sendNow();
    const events = run(w, 12);
    expect(w.integrity).toBe(19);
    expect(of(events, 'win')).toEqual([{ type: 'win', bonus: 950 }]);
    expect(w.score).toBe(1000 + 950);
    expect(w.phase).toBe('over');
  });

  it('is deterministic for one seed at any frame rate', () => {
    const play = (dts: () => number) => {
      const w = new World(mulberry32(42));
      w.credits = 1000;
      for (const pad of [1, 3, 6, 9]) {
        w.build(pad, 'firewall');
        w.upgrade(pad);
      }
      w.build(0, 'ids');
      w.build(7, 'ids');
      w.build(2, 'honeypot');
      w.build(8, 'limiter');
      const log: GameEvent[] = [];
      for (let i = 0; i < 200000 && !w.over; i++) log.push(...w.step(dts()));
      return { log, score: w.score, credits: w.credits, integrity: w.integrity, wave: w.wave };
    };
    const jitter = mulberry32(99);
    const a = play(() => 1 / 60);
    expect(a.log.length).toBeGreaterThan(100);
    expect(a.wave).toBeGreaterThanOrEqual(3);
    expect(play(() => 1 / 144)).toEqual(a);
    expect(play(() => 0.004 + jitter() * 0.03)).toEqual(a);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/defense-logic.test.ts`
Expected: FAIL, the module `../../src/games/defense/logic` does not exist.

- [ ] **Step 3: Implement the World**

Create `src/games/defense/logic.ts` (full file):

```ts
import type { Rng } from '../../core/random';
import { PADS, PATH_LENGTH, pointAt } from './path';
import { buildWave, WAVE_COUNT, type Kind, type Spawn } from './waves';

// Pure game rules for Firewall Defense: no Phaser, no DOM. Distances are pixels along the
// trace (path.ts); time is in seconds.

export const START_CREDITS = 120;
export const START_INTEGRITY = 20;
export const FIRST_PAUSE = 12; // build time before wave 1
export const PAUSE = 8; // build time between waves
export const WAVE_CREDITS = 25;
export const WAVE_POINTS = 100; // × the wave number
export const WIN_POINTS = 50; // × the integrity left
export const POINTS_PER_CREDIT = 10; // every kill scores 10 × its credit value
export const SELL_RATE = 0.6;
export const HOLD_S = 2; // a honeypot holds a brute-force bot this long
export const HOLD_CAP = [1, 2] as const; // bots one honeypot holds at once, by level
export const HONEYPOT_SLOW = 0.3;
export const LIMITER_SLOW = 0.5;
export const LIMITER_DDOS_SLOW = 0.7;
export const MAX_DT = 0.05;
// A fixed substep so spawns, shots and holds happen on the same ticks at any frame rate.
export const FIXED_DT = 1 / 120;

export interface AttackerStats {
  hp: number;
  speed: number; // pixels per second
  damage: number; // integrity lost if it leaks
  credits: number; // paid on a kill
}

export const ATTACKERS: Record<Kind, AttackerStats> = {
  malware: { hp: 40, speed: 200, damage: 1, credits: 5 },
  stealth: { hp: 50, speed: 190, damage: 2, credits: 8 },
  brute: { hp: 160, speed: 300, damage: 1, credits: 10 },
  ddos: { hp: 12, speed: 380, damage: 1, credits: 2 },
};

export type TowerKind = 'firewall' | 'ids' | 'honeypot' | 'limiter';

export interface TowerStats {
  cost: number;
  /** Range in pixels at level 1 and level 2. */
  range: readonly [number, number];
}

export const TOWERS: Record<TowerKind, TowerStats> = {
  firewall: { cost: 50, range: [230, 230] },
  ids: { cost: 40, range: [220, 300] },
  honeypot: { cost: 60, range: [180, 180] },
  limiter: { cost: 70, range: [200, 280] },
};

/** Firewall seconds between shots and damage per shot, by level. */
export const FIRE_INTERVAL = [0.6, 0.4] as const;
export const FIRE_DAMAGE = [14, 22] as const;

export function upgradeCost(kind: TowerKind): number {
  return Math.round(1.5 * TOWERS[kind].cost);
}

export interface Tower {
  kind: TowerKind;
  level: 1 | 2;
  /** Credits spent on this tower so far (build + upgrade); selling refunds 60% of it. */
  spent: number;
  /** Firewall: seconds until it can fire again. */
  cooldown: number;
  /** Honeypot: the bots it is holding now and the seconds each has left. */
  holding: { id: number; left: number }[];
  /** Honeypot: every bot it has ever held. Each bot is held once per honeypot. */
  used: Set<number>;
}

export interface Attacker {
  id: number;
  kind: Kind;
  hp: number;
  maxHp: number;
  dist: number;
  x: number;
  y: number;
  /** Targetable by firewalls. Always true except for stealth attackers outside every IDS. */
  revealed: boolean;
  /** Held by a honeypot: not moving. */
  held: boolean;
}

export type Phase = 'build' | 'wave' | 'over';

export type GameEvent =
  | { type: 'waveStart'; wave: number }
  | { type: 'waveClear'; wave: number; credits: number; points: number }
  | { type: 'firstSeen'; kind: Kind }
  | { type: 'shot'; pad: number; x: number; y: number }
  | { type: 'kill'; kind: Kind; x: number; y: number; credits: number; points: number }
  | { type: 'leak'; kind: Kind; damage: number }
  | { type: 'win'; bonus: number }
  | { type: 'breach' };

export interface WorldOptions {
  /** false turns off the wave timer and spawner, so unit tests can place attackers by hand. */
  waves?: boolean;
  /** The first wave the run sends (default 1). */
  firstWave?: number;
  /** Replaces the wave table (tests). */
  buildWave?: (n: number, rng: Rng) => Spawn[];
}

export class World {
  credits = START_CREDITS;
  integrity = START_INTEGRITY;
  score = 0;
  /** The last wave started; 0 before wave 1. */
  wave: number;
  phase: Phase = 'build';
  /** Seconds left in the build pause. */
  buildLeft = FIRST_PAUSE;
  towers: (Tower | null)[] = PADS.map(() => null);
  attackers: Attacker[] = [];

  private acc = 0;
  private nextId = 1;
  private queue: Spawn[] = [];
  private nextIn = 0;
  private seen = new Set<Kind>();
  private pending: GameEvent[] = [];
  private readonly auto: boolean;
  private readonly makeWave: (n: number, rng: Rng) => Spawn[];

  constructor(
    private readonly rng: Rng,
    opts: WorldOptions = {},
  ) {
    this.auto = opts.waves ?? true;
    this.wave = (opts.firstWave ?? 1) - 1;
    this.makeWave = opts.buildWave ?? buildWave;
  }

  get over(): boolean {
    return this.phase === 'over';
  }

  /** Builds a tower on an empty pad. */
  build(pad: number, kind: TowerKind): boolean {
    const cost = TOWERS[kind].cost;
    if (this.over || !(pad in this.towers) || this.towers[pad] || this.credits < cost) return false;
    this.credits -= cost;
    this.towers[pad] = { kind, level: 1, spent: cost, cooldown: 0, holding: [], used: new Set() };
    return true;
  }

  /** Upgrades the tower on a pad to level 2 (once). */
  upgrade(pad: number): boolean {
    const t = this.towers[pad];
    if (this.over || !t || t.level === 2) return false;
    const cost = upgradeCost(t.kind);
    if (this.credits < cost) return false;
    this.credits -= cost;
    t.spent += cost;
    t.level = 2;
    return true;
  }

  /** Sells the tower on a pad for 60% of what was spent on it, rounded down. */
  sell(pad: number): boolean {
    const t = this.towers[pad];
    if (this.over || !t) return false;
    this.credits += Math.floor(t.spent * SELL_RATE);
    this.towers[pad] = null;
    return true;
  }

  /** Ends the build pause now; pays 1 credit per whole second skipped. */
  sendNow(): boolean {
    if (!this.auto || this.phase !== 'build') return false;
    this.credits += Math.floor(this.buildLeft);
    this.startWave(this.pending);
    return true;
  }

  /** Puts an attacker on the trace by hand (tests). */
  spawn(kind: Kind, dist = 0): Attacker {
    const s = ATTACKERS[kind];
    const p = pointAt(dist);
    const a: Attacker = {
      id: this.nextId++,
      kind,
      hp: s.hp,
      maxHp: s.hp,
      dist,
      x: p.x,
      y: p.y,
      revealed: kind !== 'stealth',
      held: false,
    };
    this.attackers.push(a);
    return a;
  }

  /** Range of the tower on `pad`, in pixels. */
  range(pad: number): number {
    const t = this.towers[pad];
    return t ? TOWERS[t.kind].range[t.level - 1] : 0;
  }

  step(rawDt: number): GameEvent[] {
    if (this.over) return [];
    const events = this.pending;
    this.pending = [];
    this.acc += Math.min(rawDt, MAX_DT);
    while (this.acc >= FIXED_DT - 1e-9 && !this.over) {
      this.acc -= FIXED_DT;
      this.tick(FIXED_DT, events);
    }
    return events;
  }

  private startWave(events: GameEvent[]): void {
    this.wave++;
    this.phase = 'wave';
    this.buildLeft = 0;
    this.queue = this.makeWave(this.wave, this.rng);
    this.nextIn = this.queue[0]?.delay ?? 0;
    events.push({ type: 'waveStart', wave: this.wave });
  }

  private inRange(pad: number, a: Attacker): boolean {
    const p = PADS[pad];
    return Math.hypot(a.x - p.x, a.y - p.y) <= this.range(pad);
  }

  private tick(dt: number, events: GameEvent[]): void {
    this.runClock(dt, events);
    this.runHoneypots(dt);
    this.move(dt, events);
    if (this.over) return;
    this.reveal();
    this.fire(dt, events);
    this.checkClear(events);
  }

  private runClock(dt: number, events: GameEvent[]): void {
    if (!this.auto) return;
    if (this.phase === 'build') {
      this.buildLeft -= dt;
      if (this.buildLeft <= 1e-9) this.startWave(events);
    }
    if (this.phase !== 'wave') return;
    this.nextIn -= dt;
    while (this.queue.length > 0 && this.nextIn <= 1e-9) {
      const s = this.queue.shift()!;
      this.spawn(s.kind);
      if (!this.seen.has(s.kind)) {
        this.seen.add(s.kind);
        events.push({ type: 'firstSeen', kind: s.kind });
      }
      if (this.queue.length > 0) this.nextIn += this.queue[0].delay;
    }
  }

  /** Releases finished holds and grabs new brute-force bots, furthest along first. */
  private runHoneypots(dt: number): void {
    const alive = new Set(this.attackers.map((a) => a.id));
    const heldNow = new Set<number>();
    this.towers.forEach((t) => {
      if (t?.kind !== 'honeypot') return;
      for (const h of t.holding) h.left -= dt;
      t.holding = t.holding.filter((h) => h.left > 1e-9 && alive.has(h.id));
      for (const h of t.holding) heldNow.add(h.id);
    });
    this.towers.forEach((t, pad) => {
      if (t?.kind !== 'honeypot') return;
      const cap = HOLD_CAP[t.level - 1];
      const prey = this.attackers
        .filter((a) => a.kind === 'brute' && !t.used.has(a.id) && !heldNow.has(a.id) && this.inRange(pad, a))
        .sort((a, b) => b.dist - a.dist);
      for (const a of prey) {
        if (t.holding.length >= cap) break;
        t.holding.push({ id: a.id, left: HOLD_S });
        t.used.add(a.id);
        heldNow.add(a.id);
      }
    });
    for (const a of this.attackers) a.held = heldNow.has(a.id);
  }

  /** The strongest slow on `a`: slows don't stack. */
  private slowOf(a: Attacker): number {
    let slow = 0;
    this.towers.forEach((t, pad) => {
      if (!t || !this.inRange(pad, a)) return;
      if (t.kind === 'honeypot') slow = Math.max(slow, HONEYPOT_SLOW);
      else if (t.kind === 'limiter') slow = Math.max(slow, a.kind === 'ddos' ? LIMITER_DDOS_SLOW : LIMITER_SLOW);
    });
    return slow;
  }

  private move(dt: number, events: GameEvent[]): void {
    const slows = this.attackers.map((a) => (a.held ? 1 : this.slowOf(a)));
    const leaked: Attacker[] = [];
    this.attackers.forEach((a, i) => {
      a.dist += ATTACKERS[a.kind].speed * (1 - slows[i]) * dt;
      if (a.dist >= PATH_LENGTH) {
        leaked.push(a);
        return;
      }
      const p = pointAt(a.dist);
      a.x = p.x;
      a.y = p.y;
    });
    for (const a of leaked) {
      this.attackers.splice(this.attackers.indexOf(a), 1);
      const damage = ATTACKERS[a.kind].damage;
      this.integrity = Math.max(0, this.integrity - damage);
      events.push({ type: 'leak', kind: a.kind, damage });
      if (this.integrity === 0) {
        this.phase = 'over';
        events.push({ type: 'breach' });
        return;
      }
    }
  }

  /** Stealth attackers are targetable only while an IDS covers them. */
  private reveal(): void {
    for (const a of this.attackers) {
      if (a.kind !== 'stealth') continue;
      a.revealed = this.towers.some((t, pad) => t?.kind === 'ids' && this.inRange(pad, a));
    }
  }

  private fire(dt: number, events: GameEvent[]): void {
    this.towers.forEach((t, pad) => {
      if (t?.kind !== 'firewall') return;
      t.cooldown = Math.max(0, t.cooldown - dt);
      if (t.cooldown > 1e-9) return;
      let target: Attacker | undefined;
      for (const a of this.attackers) {
        if (a.revealed && this.inRange(pad, a) && (!target || a.dist > target.dist)) target = a;
      }
      if (!target) return;
      t.cooldown = FIRE_INTERVAL[t.level - 1];
      target.hp -= FIRE_DAMAGE[t.level - 1];
      events.push({ type: 'shot', pad, x: target.x, y: target.y });
      if (target.hp <= 0) this.kill(target, events);
    });
  }

  private kill(a: Attacker, events: GameEvent[]): void {
    this.attackers.splice(this.attackers.indexOf(a), 1);
    const credits = ATTACKERS[a.kind].credits;
    const points = credits * POINTS_PER_CREDIT;
    this.credits += credits;
    this.score += points;
    events.push({ type: 'kill', kind: a.kind, x: a.x, y: a.y, credits, points });
  }

  private checkClear(events: GameEvent[]): void {
    if (this.phase !== 'wave' || this.queue.length > 0 || this.attackers.length > 0) return;
    const points = WAVE_POINTS * this.wave;
    this.credits += WAVE_CREDITS;
    this.score += points;
    events.push({ type: 'waveClear', wave: this.wave, credits: WAVE_CREDITS, points });
    if (this.wave >= WAVE_COUNT) {
      const bonus = WIN_POINTS * this.integrity;
      this.score += bonus;
      this.phase = 'over';
      events.push({ type: 'win', bonus });
      return;
    }
    this.phase = 'build';
    this.buildLeft = PAUSE;
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/defense-logic.test.ts && npm run typecheck`
Expected: 20 tests pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/games/defense/logic.ts tests/unit/defense-logic.test.ts
git commit -m "feat(defense): World with towers, attackers, waves and scoring" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scene, overlays and hub wiring

**Files:**
- Create: `src/games/defense/textures.ts`, `src/games/defense/scene.ts`, `src/games/defense/index.ts`, `src/games/defense/defense.css`
- Modify: `src/main.ts`, `src/games/registry.ts`, `tests/unit/carousel.test.ts`, `tests/e2e/hub.spec.ts`, `tests/e2e/games.spec.ts`

**Interfaces:**
- Consumes: from Tasks 1–2, `PADS`, `WAYPOINTS`, `WAVE_COUNT`, `Kind`, `World`, `GameEvent`, `TowerKind`, `TOWERS`, `upgradeCost`, `SELL_RATE`, `HONEYPOT_SLOW`. From the codebase: `destroyGame`, `bake`, `neonPoly`, `neonCircle`, `G`, `Pt` (`src/games/phaser-util`); `palette`, `fonts`, `hexToInt` (`src/core/theme`); `mulberry32`, `Rng` (`src/core/random`); `el` (`src/core/ui/dom`); `createHud` (`src/core/ui/hud`); `SfxName` (`src/core/audio`); `GameContext`, `GameModule` (`src/core/types`).
- Produces: `createGame(): GameModule` from `src/games/defense/index.ts`. DOM hooks for e2e: `.defense[data-phase][data-wave]`, `.fd-pad[data-pad][data-tower]`, `.fd-build[data-kind]`, `.hud` cells `wave`, `integrity`, `credits`, `score`.

- [ ] **Step 1: Write the failing e2e and swap the COMING SOON tests**

`tests/e2e/games.spec.ts`, apply this change:

```diff
@@ -231,6 +231,50 @@ test('runner: the first router gate scores when the packet takes the matching la
   expect(errors).toEqual([]);
 });
 
+test('defense: build a firewall, send wave 1, the score rises, Esc tears the canvas down', async ({ page }) => {
+  const errors = trackErrors(page);
+  await boot(page, '?seed=1');
+  await launch(page, 'defense');
+  const root = page.locator('.defense');
+  await expect(page.locator('.fd-canvas canvas')).toHaveCount(1);
+  await expect(root).toHaveAttribute('data-phase', 'build');
+  await expect(page.locator('[data-hud="credits"]')).toHaveText('120');
+  await page.locator('[data-pad="1"]').click();
+  await page.locator('.fd-build[data-kind="firewall"]').click();
+  await expect(page.locator('[data-pad="1"]')).toHaveAttribute('data-tower', 'firewall');
+  await expect(page.locator('[data-hud="credits"]')).not.toHaveText('120');
+  await page.locator('[data-pad="0"]').click();
+  await page.keyboard.press('1');
+  await expect(page.locator('[data-pad="0"]')).toHaveAttribute('data-tower', 'firewall');
+  await page.keyboard.press('n');
+  await expect(root).toHaveAttribute('data-phase', 'wave');
+  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0', { timeout: 30_000 });
+  await page.keyboard.press('Escape');
+  await expect(page.locator('.game-layer')).toBeHidden();
+  await expect(page.locator('canvas')).toHaveCount(0);
+  expect(errors).toEqual([]);
+});
+
+test('defense: a seeded run with firewalls clears wave 1 and starts wave 2', async ({ page }) => {
+  test.setTimeout(90_000);
+  const errors = trackErrors(page);
+  await boot(page, '?seed=2');
+  await launch(page, 'defense');
+  const root = page.locator('.defense');
+  for (const pad of ['0', '1']) {
+    await page.locator(`[data-pad="${pad}"]`).click();
+    await page.keyboard.press('1');
+    await expect(page.locator(`[data-pad="${pad}"]`)).toHaveAttribute('data-tower', 'firewall');
+  }
+  await page.keyboard.press('n');
+  await expect(root).toHaveAttribute('data-wave', '1');
+  await expect(root).toHaveAttribute('data-phase', 'wave');
+  await expect(root).toHaveAttribute('data-phase', 'build', { timeout: 60_000 });
+  await page.keyboard.press('n');
+  await expect(root).toHaveAttribute('data-wave', '2');
+  expect(errors).toEqual([]);
+});
+
 /** Rebuilds the rulebook and packet from the page's data attributes and asks the real firewall logic. */
 async function portAnswer(page: Page): Promise<Action> {
   const rows = await page.locator('.pg-rule').evaluateAll((els) => els.map((e) => ({ ...(e as HTMLElement).dataset })));
@@ -344,7 +388,7 @@ test('bughunt: right picks score, misses show the fix, three strikes end the run
   expect(errors).toEqual([]);
 });
 
-test('20 launch/exit cycles across the six games leave nothing behind', async ({ page }) => {
+test('20 launch/exit cycles across the seven games leave nothing behind', async ({ page }) => {
   test.setTimeout(240_000);
   const errors = trackErrors(page);
   // Records every WebGL/WebGL2 context any canvas hands out, so a regression in the Phaser
@@ -361,7 +405,7 @@ test('20 launch/exit cycles across the six games leave nothing behind', async ({
     } as typeof HTMLCanvasElement.prototype.getContext;
   });
   await boot(page, '?selftest');
-  const games = ['phish', 'password', 'invaders', 'port', 'bughunt', 'runner'];
+  const games = ['phish', 'password', 'invaders', 'port', 'bughunt', 'runner', 'defense'];
   const cycle = async (id: string) => {
     await launch(page, id);
     await expect(page.locator('.game-root')).toHaveCount(1);
```

`tests/e2e/hub.spec.ts`, apply this change:

```diff
@@ -19,13 +19,14 @@ test('arrow keys rotate the carousel with wraparound', async ({ page }) => {
   await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'classic');
 });
 
-test('a coming-soon cabinet shakes instead of launching', async ({ page }) => {
+test('Firewall Defense launches from the carousel', async ({ page }) => {
   await boot(page);
   for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
   await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'defense');
   await page.keyboard.press('Enter');
-  await expect(page.locator('.cabinet.is-center')).toHaveClass(/shake/);
-  await expect(page.locator('.title-card')).toHaveCount(0);
+  await expect(page.locator('.title-card')).toContainText('Firewall Defense');
+  await page.keyboard.press('Enter');
+  await expect(page.locator('.defense canvas')).toHaveCount(1);
 });
 
 test('M toggles the mute indicator', async ({ page }) => {
```

`tests/unit/carousel.test.ts`, apply this change:

```diff
@@ -54,8 +54,12 @@ describe('carousel', () => {
   });
 
   it('marks unbuilt games COMING SOON and shows the Classic note', () => {
-    const { c } = make();
+    // Every real game is built now, so an unbuilt one is faked to keep COMING SOON covered.
+    const unbuilt = CABINETS.map((cab) => (cab.kind === 'game' && cab.id === 'defense' ? { ...cab, load: undefined } : cab));
+    const c = createCarousel(unbuilt, { onActivate: vi.fn(), topScore: () => '' });
+    document.body.append(c.el);
     expect(c.el.querySelector('[data-id="defense"] .soon')).not.toBeNull();
+    expect(c.el.querySelector('[data-id="phish"] .soon')).toBeNull();
     expect(c.el.querySelector('[data-id="classic"] .cab-note')?.textContent).toContain('Alt+');
     c.el.remove();
   });
```

- [ ] **Step 2: Run the e2e and watch it fail**

Run: `npx playwright test tests/e2e/hub.spec.ts tests/e2e/games.spec.ts`
Expected: the defense tests FAIL (no `.defense canvas`; the cabinet still shows COMING SOON). The other tests pass.

- [ ] **Step 3: Textures**

Create `src/games/defense/textures.ts` (full file):

```ts
import type * as Phaser from 'phaser';
import { hexToInt, palette } from '../../core/theme';
import { bake, neonCircle, neonPoly, type G, type Pt } from '../phaser-util';
import type { TowerKind } from './logic';

// Every sprite is drawn in code once, at scene start, and baked into a texture.

const CYAN = hexToInt(palette.cyan);
const PINK = hexToInt(palette.pink);
const YELLOW = hexToInt(palette.yellow);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const GREY = hexToInt(palette.grey);
const WHITE = 0xffffff;

/** Each tower's color, also used for its range ring and slow field. */
export const TOWER_COLOR: Record<TowerKind, number> = { firewall: CYAN, ids: OK, honeypot: YELLOW, limiter: PINK };

/** A regular polygon with `n` corners, the first one pointing up. */
function ring(cx: number, cy: number, n: number, r: number, turn = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + turn) / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function glyph(g: G, kind: TowerKind): void {
  g.lineStyle(5, WHITE, 1);
  g.fillStyle(WHITE, 1);
  if (kind === 'firewall') {
    // A brick wall.
    for (const y of [36, 48, 60]) g.lineBetween(30, y, 66, y);
    g.lineBetween(48, 36, 48, 48);
    g.lineBetween(39, 48, 39, 60);
    g.lineBetween(57, 48, 57, 60);
  } else if (kind === 'ids') {
    // An eye.
    g.strokeEllipse(48, 48, 40, 24);
    g.fillCircle(48, 48, 7);
  } else if (kind === 'honeypot') {
    // A honey pot.
    g.strokeRoundedRect(32, 40, 32, 24, 8);
    g.lineBetween(36, 36, 60, 36);
  } else {
    // A speed gauge.
    g.beginPath();
    g.arc(48, 56, 20, Math.PI, 0);
    g.strokePath();
    g.lineBetween(48, 56, 60, 42);
  }
}

/** Makes every texture the scene uses. */
export function makeTextures(scene: Phaser.Scene): void {
  // Towers: 96 × 96 hexagon badges with a white glyph.
  for (const [kind, color] of Object.entries(TOWER_COLOR) as [TowerKind, number][]) {
    bake(scene, `tower-${kind}`, 96, 96, (g) => {
      neonPoly(g, ring(48, 48, 6, 36), color, 0.3);
      glyph(g, kind);
    });
  }

  // Level-2 pip: a small star shown on upgraded towers.
  bake(scene, 'pip', 28, 28, (g) => {
    g.fillStyle(YELLOW, 1);
    g.fillPoints(ring(14, 14, 4, 11).flatMap((p, i, all) => [p, mid(p, all[(i + 1) % all.length], 14, 14)]), true);
  });

  // Empty pad: a dashed-looking socket.
  bake(scene, 'pad', 96, 96, (g) => {
    g.lineStyle(10, CYAN, 0.08);
    g.strokePoints(ring(48, 48, 6, 36), true, true);
    g.lineStyle(3, CYAN, 0.55);
    g.strokePoints(ring(48, 48, 6, 36), true, true);
    g.fillStyle(CYAN, 0.6);
    g.fillRect(44, 36, 8, 24);
    g.fillRect(36, 44, 24, 8);
  });

  // Attackers.
  bake(scene, 'malware', 64, 64, (g) => {
    neonPoly(g, ring(32, 32, 8, 18).flatMap((p, i, all) => [p, mid(p, all[(i + 1) % all.length], 32, 32, 0.55)]), PINK);
    g.fillStyle(WHITE, 1);
    g.fillCircle(26, 30, 3);
    g.fillCircle(38, 30, 3);
  });
  bake(scene, 'stealth', 64, 64, (g) => {
    neonPoly(g, [{ x: 32, y: 12 }, { x: 50, y: 44 }, { x: 32, y: 36 }, { x: 14, y: 44 }], GREY, 0.2);
  });
  bake(scene, 'brute', 76, 76, (g) => {
    neonPoly(g, ring(38, 38, 4, 24, 0.5), DANGER, 0.45);
    g.lineStyle(4, WHITE, 1);
    g.lineBetween(30, 30, 46, 46);
    g.lineBetween(46, 30, 30, 46);
  });
  bake(scene, 'ddos', 40, 40, (g) => {
    neonCircle(g, 20, 20, 9, YELLOW, 0.7);
  });

  // Server core at the end of the trace.
  bake(scene, 'server', 140, 160, (g) => {
    neonPoly(g, [{ x: 30, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 140 }, { x: 30, y: 140 }], OK, 0.2);
    g.fillStyle(OK, 1);
    for (const y of [44, 76, 108]) {
      g.fillRect(46, y, 48, 8);
      g.fillCircle(100, y + 4, 3);
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

/** The point between two star tips, pulled toward the center (cx, cy) by `k`. */
function mid(a: Pt, b: Pt, cx: number, cy: number, k = 0.45): Pt {
  return { x: cx + ((a.x + b.x) / 2 - cx) * k, y: cy + ((a.y + b.y) / 2 - cy) * k };
}
```

- [ ] **Step 4: The scene**

Create `src/games/defense/scene.ts` (full file):

```ts
import * as Phaser from 'phaser';
import { fonts, hexToInt, palette } from '../../core/theme';
import { HONEYPOT_SLOW, type GameEvent, type World } from './logic';
import { PADS, WAYPOINTS } from './path';
import { makeTextures, TOWER_COLOR } from './textures';

export const W = 1920;
export const H = 1080;

/** What the DOM overlay shares with the scene: the pad under the mouse and the selected pad. */
export interface View {
  selected: number | null;
  hover: number | null;
}

export interface SceneHooks {
  /** Called every frame with what happened, after the scene has drawn it. */
  onEvents(events: GameEvent[], world: World): void;
}

const CYAN = hexToInt(palette.cyan);
const OK = hexToInt(palette.ok);
const DANGER = hexToInt(palette.danger);
const GRID = 60;
const BEAM_S = 0.12; // how long a firewall beam stays on screen
const HP_W = 44;

type Burst = 'pink' | 'ok' | 'danger';
const BURST_COLOR: Record<Burst, string> = { pink: palette.pink, ok: palette.ok, danger: palette.danger };

type Beam = { x1: number; y1: number; x2: number; y2: number; left: number };

/**
 * Draws the World. All game rules live in logic.ts; this class mirrors the towers and attackers
 * every frame and turns events into effects.
 */
export class DefenseScene extends Phaser.Scene {
  private readonly attackers = new Map<number, Phaser.GameObjects.Image>();
  private readonly towers: Phaser.GameObjects.Image[] = [];
  private readonly pips: Phaser.GameObjects.Image[] = [];
  private readonly bursts = new Map<Burst, Phaser.GameObjects.Particles.ParticleEmitter>();
  private beams: Beam[] = [];
  private fields!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;

  constructor(
    private readonly world: World,
    private readonly view: View,
    private readonly hooks: SceneHooks,
  ) {
    super('defense');
  }

  create(): void {
    makeTextures(this);
    this.drawBoard();
    this.fields = this.add.graphics().setDepth(1);
    PADS.forEach((p) => {
      this.towers.push(this.add.image(p.x, p.y, 'pad').setDepth(2));
      this.pips.push(this.add.image(p.x + 30, p.y - 30, 'pip').setDepth(3).setVisible(false));
    });
    this.fx = this.add.graphics().setDepth(6);
    for (const [name, hex] of Object.entries(BURST_COLOR) as [Burst, string][]) {
      const emitter = this.add.particles(0, 0, 'spark', {
        speed: { min: 80, max: 360 },
        lifespan: { min: 250, max: 600 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: hexToInt(hex),
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      emitter.setDepth(7);
      this.bursts.set(name, emitter);
    }
  }

  update(time: number, delta: number): void {
    const events = this.world.step(delta / 1000);
    this.draw(time / 1000, delta / 1000);
    for (const e of events) this.effect(e);
    this.hooks.onEvents(events, this.world);
  }

  /** The static board: circuit grid, the trace from INTERNET to SERVER, and the end labels. */
  private drawBoard(): void {
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, CYAN, 0.07);
    for (let x = 0; x <= W; x += GRID) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += GRID) g.lineBetween(0, y, W, y);
    const trace = [...WAYPOINTS]; // strokePoints wants a mutable array
    for (const [w, a] of [[60, 0.06], [40, 0.1], [24, 0.18]] as const) {
      g.lineStyle(w, CYAN, a);
      g.strokePoints(trace);
    }
    g.lineStyle(4, CYAN, 0.9);
    g.strokePoints(trace);
    for (const p of WAYPOINTS) {
      g.fillStyle(CYAN, 1);
      g.fillCircle(p.x, p.y, 6);
    }
    const start = WAYPOINTS[0];
    const end = WAYPOINTS[WAYPOINTS.length - 1];
    this.add.image(end.x + 30, end.y, 'server').setDepth(0);
    const label = (x: number, y: number, text: string, color: string) =>
      this.add
        .text(x, y, text, { fontFamily: fonts.display, fontSize: '28px', color })
        .setOrigin(0.5)
        .setShadow(0, 0, color, 10, false, true);
    label(start.x, start.y - 60, 'INTERNET', palette.pink);
    label(end.x + 30, end.y + 110, 'SERVER', palette.ok);
  }

  private draw(t: number, dt: number): void {
    const w = this.world;

    // Towers and the slow fields of honeypots and rate limiters.
    const f = this.fields;
    f.clear();
    w.towers.forEach((tower, pad) => {
      const img = this.towers[pad];
      img.setTexture(tower ? `tower-${tower.kind}` : 'pad');
      this.pips[pad].setVisible(tower?.level === 2);
      if (tower && (tower.kind === 'honeypot' || tower.kind === 'limiter')) {
        const color = TOWER_COLOR[tower.kind];
        f.fillStyle(color, tower.kind === 'honeypot' ? HONEYPOT_SLOW * 0.2 : 0.08);
        f.fillCircle(PADS[pad].x, PADS[pad].y, w.range(pad));
      }
    });
    for (const pad of [this.view.hover, this.view.selected]) {
      const tower = pad === null ? null : w.towers[pad];
      if (pad === null || !tower) continue;
      f.lineStyle(3, TOWER_COLOR[tower.kind], 0.8);
      f.strokeCircle(PADS[pad].x, PADS[pad].y, w.range(pad));
    }
    if (this.view.selected !== null) {
      const p = PADS[this.view.selected];
      f.lineStyle(4, 0xffffff, 0.9);
      f.strokeCircle(p.x, p.y, 46);
    }

    // Attackers: stealth shimmers until an IDS reveals it; held bots glow yellow.
    const fx = this.fx;
    fx.clear();
    const seen = new Set<number>();
    for (const a of w.attackers) {
      seen.add(a.id);
      let img = this.attackers.get(a.id);
      if (!img) {
        img = this.add.image(a.x, a.y, a.kind).setDepth(4);
        this.attackers.set(a.id, img);
      }
      img.setPosition(a.x, a.y);
      img.setAlpha(a.revealed ? 1 : 0.2 + 0.15 * Math.sin(t * 14 + a.id));
      if (a.held) img.setTint(hexToInt(palette.yellow));
      else img.clearTint();
      if (a.kind === 'malware') img.setAngle(t * 90);
      if (a.hp < a.maxHp && a.revealed) {
        fx.fillStyle(0x000000, 0.6);
        fx.fillRect(a.x - HP_W / 2, a.y - 40, HP_W, 6);
        fx.fillStyle(a.hp / a.maxHp > 0.4 ? OK : DANGER, 1);
        fx.fillRect(a.x - HP_W / 2, a.y - 40, HP_W * (a.hp / a.maxHp), 6);
      }
    }
    for (const [id, img] of this.attackers) {
      if (!seen.has(id)) {
        img.destroy();
        this.attackers.delete(id);
      }
    }

    // Firewall beams fade out over BEAM_S.
    this.beams = this.beams.filter((b) => (b.left -= dt) > 0);
    for (const b of this.beams) {
      const k = b.left / BEAM_S;
      fx.lineStyle(10, CYAN, 0.25 * k);
      fx.lineBetween(b.x1, b.y1, b.x2, b.y2);
      fx.lineStyle(3, 0xffffff, k);
      fx.lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
  }

  private effect(e: GameEvent): void {
    switch (e.type) {
      case 'shot': {
        const p = PADS[e.pad];
        this.beams.push({ x1: p.x, y1: p.y, x2: e.x, y2: e.y, left: BEAM_S });
        break;
      }
      case 'kill':
        this.burst(e.kind === 'ddos' ? 'pink' : 'ok', e.kind === 'ddos' ? 10 : 24, e.x, e.y);
        this.float(`+${e.credits}`, e.x, e.y - 30, palette.yellow, 28);
        break;
      case 'leak': {
        const end = WAYPOINTS[WAYPOINTS.length - 1];
        this.burst('danger', 30, end.x, end.y);
        this.cameras.main.shake(200, 0.008);
        break;
      }
      case 'breach':
        this.cameras.main.flash(300, 255, 59, 92);
        break;
      case 'win':
        this.cameras.main.flash(300, 61, 255, 154);
        break;
      default:
        break;
    }
  }

  private burst(kind: Burst, count: number, x: number, y: number): void {
    this.bursts.get(kind)!.explode(count, x, y);
  }

  /** A short text that drifts up and fades: +5, +10, ... */
  private float(text: string, x: number, y: number, color: string, size: number): void {
    const label = this.add
      .text(x, y, text, { fontFamily: fonts.display, fontSize: `${size}px`, color })
      .setOrigin(0.5)
      .setDepth(10)
      .setShadow(0, 0, color, 12, false, true);
    this.tweens.add({
      targets: label,
      y: y - 60,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}
```

- [ ] **Step 5: Mount and unmount**

Create `src/games/defense/index.ts` (full file):

```ts
import * as Phaser from 'phaser';
import type { SfxName } from '../../core/audio';
import { mulberry32, type Rng } from '../../core/random';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { destroyGame } from '../phaser-util';
import { SELL_RATE, TOWERS, upgradeCost, World, type GameEvent, type TowerKind } from './logic';
import { PADS } from './path';
import { DefenseScene, H, W, type View } from './scene';
import { WAVE_COUNT, type Kind } from './waves';

const END_DELAY_MS = 2000; // let the end banner and final effects play before game over
const CALLOUT_MS = 4000;
const PAD_SIZE = 96;

const KINDS: TowerKind[] = ['firewall', 'ids', 'honeypot', 'limiter'];
const NAMES: Record<TowerKind, string> = { firewall: 'FIREWALL', ids: 'IDS', honeypot: 'HONEYPOT', limiter: 'RATE LIMITER' };

const CALLOUTS: Record<Kind, string> = {
  malware: 'MALWARE — malicious code trying to reach the server. Firewalls block it.',
  stealth: "STEALTH ATTACK — firewalls can't block what they can't see. Place an IDS.",
  brute: 'BRUTE FORCE — a bot hammering logins. A honeypot traps it while you strike.',
  ddos: 'DDoS — a flood of junk traffic. Rate limiting slows the flood so your defenses can keep up.',
};

// 'shot' is left out: it is played at most once per frame below, or a full board would buzz.
const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
  kill: 'hit',
  leak: 'error',
  waveStart: 'select',
  waveClear: 'score',
  win: 'powerup',
  breach: 'explode',
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
  let calloutTimer: ReturnType<typeof setTimeout> | undefined;
  // Phaser's VisibilityHandler overwrites window.onblur/onfocus; destroy() restores them here.
  let savedBlur: typeof window.onblur = null;
  let savedFocus: typeof window.onfocus = null;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const world = new World(runRng());
      const view: View = { selected: null, hover: null };
      const hud = createHud([['wave', 'WAVE'], ['integrity', 'INTEGRITY'], ['credits', 'CREDITS'], ['score', 'SCORE']]);

      // Pads: invisible buttons over the canvas, so clicks are hit-tested by the DOM.
      const pads = PADS.map((p, i) => {
        const pad = el('button.fd-pad', { type: 'button', 'data-pad': i, 'data-tower': '', 'aria-label': `Pad ${i + 1}` });
        pad.style.left = `${p.x - PAD_SIZE / 2}px`;
        pad.style.top = `${p.y - PAD_SIZE / 2}px`;
        pad.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus off, so keys stay game keys
        pad.addEventListener('pointerenter', () => (view.hover = i));
        pad.addEventListener('pointerleave', () => {
          if (view.hover === i) view.hover = null;
        });
        pad.addEventListener('click', () => select(view.selected === i ? null : i));
        return pad;
      });

      // The bottom bar: build buttons for an empty pad, upgrade and sell for a tower.
      const builds = KINDS.map((kind, i) => {
        const b = el(
          'button.fd-build',
          { type: 'button', 'data-kind': kind },
          el('span.fd-key', {}, String(i + 1)),
          el('span.fd-name', {}, NAMES[kind]),
          el('span.fd-cost', {}, String(TOWERS[kind].cost)),
        );
        b.addEventListener('click', () => build(kind));
        return b;
      });
      const upgradeBtn = el('button.fd-upgrade', { type: 'button' });
      upgradeBtn.addEventListener('click', () => upgrade());
      const sellBtn = el('button.fd-sell', { type: 'button' });
      sellBtn.addEventListener('click', () => sell());
      const hint = el('div.fd-hint', {}, 'Click a pad to build a defense');
      const bar = el('div.fd-bar', { 'data-mode': 'none' }, hint, ...builds, upgradeBtn, sellBtn);
      for (const b of bar.querySelectorAll('button')) b.addEventListener('mousedown', (e) => e.preventDefault());

      const countdown = el('span.fd-count');
      const sendBtn = el('button.fd-send', { type: 'button' }, 'SEND NOW (N)');
      sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
      sendBtn.addEventListener('click', () => sendNow());
      const next = el('div.fd-next', {}, countdown, sendBtn);

      const callout = el('div.fd-callout');
      const banner = el('div.fd-banner');
      const host = el('div.fd-canvas');
      const gameRoot = el('div.defense', { 'data-phase': world.phase, 'data-wave': world.wave }, host, ...pads, hud.el, next, bar, callout, banner);
      root = gameRoot;
      container.append(gameRoot);

      function select(pad: number | null): void {
        view.selected = pad;
        for (const [i, p] of pads.entries()) p.classList.toggle('is-selected', i === pad);
        ctx.audio.sfx(pad === null ? 'back' : 'move');
        refresh(world);
      }

      /** Runs a World action on the selected pad; a refused action buzzes. */
      function act(ok: boolean, sound: SfxName): void {
        ctx.audio.sfx(ok ? sound : 'error');
        refresh(world);
      }
      const build = (kind: TowerKind) => act(view.selected !== null && world.build(view.selected, kind), 'select');
      const upgrade = () => act(view.selected !== null && world.upgrade(view.selected), 'powerup');
      const sell = () => act(view.selected !== null && world.sell(view.selected), 'coin');
      const sendNow = () => act(world.sendNow(), 'select');

      ctx.input.onKey((e) => {
        if (e.repeat || world.over) return;
        const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
        if (digit) build(KINDS[Number(digit[1]) - 1]);
        else if (e.code === 'KeyU') upgrade();
        else if (e.code === 'KeyS') sell();
        else if (e.code === 'KeyN') sendNow();
      });

      const showCallout = (text: string) => {
        callout.textContent = text;
        callout.classList.add('is-on');
        clearTimeout(calloutTimer);
        calloutTimer = setTimeout(() => callout.classList.remove('is-on'), CALLOUT_MS);
      };

      /** Mirrors the World into the DOM: HUD, pads, the bar and the countdown. */
      function refresh(w: World): void {
        const shownWave = w.phase === 'build' ? Math.min(w.wave + 1, WAVE_COUNT) : w.wave;
        hud.set('wave', `${shownWave}/${WAVE_COUNT}`);
        hud.set('integrity', String(w.integrity));
        hud.set('credits', String(w.credits));
        hud.set('score', w.score.toLocaleString('en-US'));
        gameRoot.dataset.phase = w.phase;
        gameRoot.dataset.wave = String(w.wave);
        w.towers.forEach((t, i) => {
          const tower = t?.kind ?? '';
          if (pads[i].dataset.tower !== tower) pads[i].dataset.tower = tower;
        });

        const t = view.selected === null ? null : w.towers[view.selected];
        const mode = view.selected === null ? 'none' : t ? 'tower' : 'build';
        if (bar.dataset.mode !== mode) bar.dataset.mode = mode;
        for (const [i, b] of builds.entries()) b.classList.toggle('is-poor', w.credits < TOWERS[KINDS[i]].cost);
        if (t) {
          const up = t.level === 2 ? 'MAX LEVEL' : `U  UPGRADE ${upgradeCost(t.kind)}`;
          if (upgradeBtn.textContent !== up) upgradeBtn.textContent = up;
          upgradeBtn.classList.toggle('is-poor', t.level === 2 || w.credits < upgradeCost(t.kind));
          const sellText = `S  SELL +${Math.floor(t.spent * SELL_RATE)}`;
          if (sellBtn.textContent !== sellText) sellBtn.textContent = sellText;
        }

        next.classList.toggle('is-on', w.phase === 'build');
        const count = `WAVE ${Math.min(w.wave + 1, WAVE_COUNT)} IN ${Math.ceil(w.buildLeft)}`;
        if (countdown.textContent !== count) countdown.textContent = count;
      }

      const onEvents = (events: GameEvent[], w: World) => {
        let shot = false;
        for (const e of events) {
          const name = SFX[e.type];
          if (name) ctx.audio.sfx(name);
          if (e.type === 'shot') shot = true;
          if (e.type === 'firstSeen') showCallout(CALLOUTS[e.kind]);
          if (e.type === 'win' || e.type === 'breach') {
            banner.textContent = e.type === 'win' ? 'SYSTEM SECURED' : 'SERVER BREACHED';
            banner.className = e.type === 'win' ? 'fd-banner is-on is-ok' : 'fd-banner is-on is-danger';
            endTimer = setTimeout(() => ctx.endRun(w.score), END_DELAY_MS);
          }
        }
        if (shot) ctx.audio.sfx('shoot');
        refresh(w);
      };
      refresh(world);

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
        input: { keyboard: false, mouse: false, touch: false, gamepad: false }, // the DOM owns input
        audio: { noAudio: true }, // sounds go through the shared ZzFX audio
        scene: new DefenseScene(world, view, { onEvents }),
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
      clearTimeout(calloutTimer);
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

Create `src/games/defense/defense.css` (full file):

```css
.defense {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse 40% 35% at 92% 50%, rgba(61, 255, 154, 0.14), transparent 70%),
    radial-gradient(ellipse 40% 35% at 6% 28%, rgba(255, 46, 136, 0.14), transparent 70%),
    linear-gradient(180deg, #05000f 0%, var(--c-deep) 50%, var(--c-purple) 100%);
}
.fd-canvas {
  position: absolute;
  inset: 0;
}
.fd-canvas canvas {
  display: block;
}
.defense .hud {
  z-index: 2;
}

/* Pads: invisible hit areas over the canvas pads; the canvas draws the pad and the tower. */
.fd-pad {
  position: absolute;
  z-index: 1;
  width: 96px;
  height: 96px;
  border-radius: 50%;
}

/* Bottom bar: build buttons for an empty pad, upgrade and sell for a tower. */
.fd-bar {
  position: absolute;
  left: 48px;
  bottom: 24px;
  z-index: 2;
  display: flex;
  gap: 16px;
  align-items: center;
  height: 84px;
}
.fd-bar > * {
  display: none;
}
.fd-bar[data-mode='none'] .fd-hint,
.fd-bar[data-mode='build'] .fd-build,
.fd-bar[data-mode='tower'] .fd-upgrade,
.fd-bar[data-mode='tower'] .fd-sell {
  display: flex;
}
.fd-hint {
  align-items: center;
  font-family: var(--f-ui);
  font-weight: 600;
  font-size: 28px;
  color: var(--c-ink-dim);
}
.fd-build,
.fd-upgrade,
.fd-sell {
  align-items: center;
  gap: 12px;
  height: 100%;
  padding: 0 22px;
  border: 3px solid var(--c-cyan);
  border-radius: 12px;
  background: rgba(14, 0, 32, 0.85);
  box-shadow: 0 0 14px rgba(0, 240, 255, 0.35);
  font-family: var(--f-ui);
  font-weight: 700;
  font-size: 26px;
  color: var(--c-ink);
  white-space: pre;
}
.fd-build:hover,
.fd-upgrade:hover,
.fd-sell:hover {
  background: rgba(42, 7, 80, 0.95);
}
.fd-key {
  font-family: var(--f-mono);
  color: var(--c-cyan);
}
.fd-cost {
  font-family: var(--f-mono);
  color: var(--c-yellow);
}
.fd-sell {
  border-color: var(--c-yellow);
  box-shadow: 0 0 14px rgba(255, 226, 89, 0.35);
}
.fd-bar .is-poor {
  opacity: 0.4;
}

/* Countdown and SEND NOW, bottom right, during the build pause. */
.fd-next {
  position: absolute;
  right: 48px;
  bottom: 24px;
  z-index: 2;
  display: flex;
  gap: 18px;
  align-items: center;
  height: 84px;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s;
}
.fd-next.is-on {
  opacity: 1;
  visibility: visible;
}
.fd-count {
  font-family: var(--f-display);
  font-size: 32px;
  letter-spacing: 3px;
  color: var(--c-ink);
  text-shadow: 0 0 12px var(--c-cyan);
}
.fd-send {
  height: 100%;
  padding: 0 26px;
  border: 3px solid var(--c-ok);
  border-radius: 12px;
  background: rgba(14, 0, 32, 0.85);
  box-shadow: 0 0 16px rgba(61, 255, 154, 0.45);
  font-family: var(--f-display);
  font-size: 26px;
  letter-spacing: 2px;
  color: var(--c-ok);
}
.fd-send:hover {
  background: rgba(42, 7, 80, 0.95);
}

/* Lesson callout: the first time an attacker type spawns. It fits between pads 0 and 5 (x 378–1132) above the trace. */
.fd-callout {
  position: absolute;
  top: 120px;
  left: 400px;
  z-index: 3;
  box-sizing: border-box;
  width: 710px;
  padding: 12px 24px;
  text-align: center;
  border: 3px solid var(--c-yellow);
  border-radius: 14px;
  background: rgba(14, 0, 32, 0.88);
  box-shadow: 0 0 24px rgba(255, 226, 89, 0.45);
  font-family: var(--f-ui);
  font-weight: 700;
  font-size: 26px;
  line-height: 1.3;
  color: var(--c-ink);
  opacity: 0;
  transform: translateY(-20px);
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: none;
}
.fd-callout.is-on {
  opacity: 1;
  transform: translateY(0);
}

/* End banner: SYSTEM SECURED / SERVER BREACHED. */
.fd-banner {
  position: absolute;
  top: 470px;
  left: 0;
  right: 0;
  z-index: 3;
  text-align: center;
  font-family: var(--f-display);
  font-size: 96px;
  letter-spacing: 6px;
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: none;
}
.fd-banner.is-on {
  opacity: 1;
  transform: scale(1);
}
.fd-banner.is-ok {
  color: var(--c-ok);
  text-shadow: 0 0 18px var(--c-ok), 0 0 42px var(--c-cyan);
}
.fd-banner.is-danger {
  color: var(--c-danger);
  text-shadow: 0 0 18px var(--c-danger), 0 0 42px var(--c-yellow);
}
```

- [ ] **Step 7: Wire the cabinet and the stylesheet**

`src/main.ts`, apply this change:

```diff
@@ -13,6 +13,7 @@ import './games/invaders/invaders.css';
 import './games/port/port.css';
 import './games/bughunt/bughunt.css';
 import './games/runner/runner.css';
+import './games/defense/defense.css';
 
 import { createAudio } from './core/audio';
 import { watchFullscreen } from './core/fullscreen';
```

`src/games/registry.ts`, apply this change:

```diff
@@ -44,7 +44,8 @@ export const CABINETS: Cabinet[] = [
     title: 'Firewall Defense',
     tagline: 'Place firewalls, IDS sensors and honeypots. Stop the botnet before it hits the server.',
     category: 'arcade',
-    controls: [['MOUSE', 'Place & upgrade']],
+    controls: [['MOUSE', 'Build & upgrade'], ['1–4 / N', 'Tower / Next wave']],
+    load: () => import('./defense/index').then((m) => m.createGame()),
   },
   {
     kind: 'game',
```

- [ ] **Step 8: Run everything**

Run: `npm run build && npm test && npx playwright test`
Expected: build clean; 29 files / 284 unit tests pass; 21 e2e tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/games/defense src/main.ts src/games/registry.ts tests/unit/carousel.test.ts tests/e2e/hub.spec.ts tests/e2e/games.spec.ts
git commit -m "feat(defense): scene, overlays and hub cabinet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
