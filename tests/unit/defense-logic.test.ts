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
