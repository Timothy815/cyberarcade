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

  /** Stealth attackers become targetable once an IDS spots them, and stay that way. */
  private reveal(): void {
    for (const a of this.attackers) {
      if (a.kind !== 'stealth' || a.revealed) continue;
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
