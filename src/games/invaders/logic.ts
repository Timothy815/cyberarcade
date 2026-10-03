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
