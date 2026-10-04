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
// A fixed substep so the rng is consumed in the same order regardless of frame cadence:
// spawn() and inClear() decide things at the END of a step, so a variable dt would let
// different frame rates (or jitter) walk through spawn windows differently and diverge.
export const FIXED_DT = 1 / 120;

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
  /** Leftover sim time not yet consumed by a FIXED_DT tick. */
  private acc = 0;

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
    const events: GameEvent[] = [];
    this.acc += Math.min(rawDt, MAX_DT);
    // Fixed substeps: however this call's dt is chopped up by the caller, the sim always
    // advances in FIXED_DT increments, so the rng is consumed in the same order every time.
    while (this.acc >= FIXED_DT - 1e-9 && !this.over) {
      this.acc -= FIXED_DT;
      this.tick(FIXED_DT, events);
    }
    return events;
  }

  private tick(dt: number, events: GameEvent[]): void {
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
