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
