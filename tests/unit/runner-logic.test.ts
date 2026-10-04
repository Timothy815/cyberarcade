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
