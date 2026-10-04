import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import {
  call,
  createRun,
  describeRule,
  evaluate,
  inNet,
  ipIn,
  makePacket,
  makeRulebook,
  matches,
  parseIp,
  PER_SHIFT,
  PORTS,
  SERVICES,
  SHIFT_BONUS,
  STRIKES,
  timeLimit,
  type Packet,
  type Rulebook,
} from '../../src/games/port/logic';

const pkt = (src: string, port: number, proto: Packet['proto'] = 'TCP'): Packet => ({ src, port, proto });

describe('parseIp / inNet', () => {
  it('parses dotted quads', () => {
    expect(parseIp('0.0.0.0')).toBe(0);
    expect(parseIp('10.66.1.2')).toBe(10 * 2 ** 24 + 66 * 2 ** 16 + 1 * 256 + 2);
    expect(parseIp('255.255.255.255')).toBe(2 ** 32 - 1);
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['10.66.1', '10.66.1.256', '1.2.3.4.5', 'a.b.c.d', '1..2.3']) expect(() => parseIp(bad)).toThrow();
  });

  it('checks CIDR membership', () => {
    expect(inNet('10.66.200.7', '10.66.0.0/16')).toBe(true);
    expect(inNet('10.67.0.1', '10.66.0.0/16')).toBe(false);
    expect(inNet('203.0.113.99', '203.0.113.0/24')).toBe(true);
    expect(inNet('203.0.114.1', '203.0.113.0/24')).toBe(false);
    expect(inNet('172.31.255.255', '172.16.0.0/12')).toBe(true);
    expect(inNet('172.32.0.0', '172.16.0.0/12')).toBe(false);
    expect(inNet('8.8.8.8', '0.0.0.0/0')).toBe(true);
    expect(inNet('1.2.3.4', '1.2.3.4/32')).toBe(true);
    expect(inNet('1.2.3.5', '1.2.3.4/32')).toBe(false);
    expect(() => inNet('1.2.3.4', '1.2.3.0/33')).toThrow();
  });

  it('ipIn stays inside the network', () => {
    const rng = mulberry32(3);
    for (const net of ['10.66.0.0/16', '203.0.113.0/24', '10.0.0.0/8']) {
      for (let i = 0; i < 50; i++) expect(inNet(ipIn(net, rng), net)).toBe(true);
    }
  });
});

describe('evaluate', () => {
  const book: Rulebook = {
    rules: [
      { action: 'deny', net: '10.66.0.0/16' },
      { action: 'allow', port: 53, proto: 'UDP' },
      { action: 'allow', port: 443 },
      { action: 'deny', port: 23 },
    ],
    fallback: 'deny',
  };

  it('first matching rule wins', () => {
    expect(evaluate(book, pkt('10.66.4.4', 443))).toEqual({ action: 'deny', rule: 0 });
    expect(evaluate(book, pkt('8.8.8.8', 443))).toEqual({ action: 'allow', rule: 2 });
    expect(evaluate(book, pkt('8.8.8.8', 23))).toEqual({ action: 'deny', rule: 3 });
  });

  it('protocol must match when the rule names one', () => {
    expect(evaluate(book, pkt('8.8.8.8', 53, 'UDP'))).toEqual({ action: 'allow', rule: 1 });
    expect(evaluate(book, pkt('8.8.8.8', 53, 'TCP'))).toEqual({ action: 'deny', rule: -1 });
  });

  it('falls back when nothing matches', () => {
    expect(evaluate(book, pkt('8.8.8.8', 80))).toEqual({ action: 'deny', rule: -1 });
    expect(evaluate({ ...book, fallback: 'allow' }, pkt('8.8.8.8', 80))).toEqual({ action: 'allow', rule: -1 });
  });

  it('a rule with every field needs all of them', () => {
    const r = { action: 'allow' as const, net: '192.168.1.0/24', port: 22 };
    expect(matches(r, pkt('192.168.1.9', 22))).toBe(true);
    expect(matches(r, pkt('192.168.2.9', 22))).toBe(false);
    expect(matches(r, pkt('192.168.1.9', 23))).toBe(false);
  });
});

describe('describeRule', () => {
  it('reads like a rulebook line', () => {
    expect(describeRule({ action: 'deny', net: '10.66.0.0/16' })).toBe('BLOCK 10.66.0.0/16');
    expect(describeRule({ action: 'allow', port: 443 })).toBe('ALLOW 443 HTTPS');
    expect(describeRule({ action: 'deny', port: 23 })).toBe('DENY 23 TELNET');
    expect(describeRule({ action: 'allow', port: 53, proto: 'UDP' })).toBe('ALLOW 53 UDP DNS');
    expect(describeRule({ action: 'allow', net: '192.168.1.0/24', port: 22 })).toBe('ALLOW 192.168.1.0/24 → 22 SSH');
  });
});

describe('makeRulebook', () => {
  it('only uses the real ports from the spec', () => {
    expect(PORTS).toEqual([22, 23, 25, 53, 80, 443, 3389]);
    for (let shift = 1; shift <= 6; shift++) {
      const book = makeRulebook(shift, mulberry32(shift));
      for (const r of book.rules) if (r.port !== undefined) expect(SERVICES[r.port]).toBeDefined();
    }
  });

  it('adds a new idea each shift', () => {
    const rng = mulberry32(9);
    const s1 = makeRulebook(1, rng);
    expect(s1.rules).toHaveLength(3);
    expect(s1.rules.every((r) => r.net === undefined)).toBe(true);
    expect(s1.fallback).toBe('deny');
    const s2 = makeRulebook(2, rng);
    expect(s2.rules[0]).toMatchObject({ action: 'deny' });
    expect(s2.rules[0].net).toBeDefined();
    const s3 = makeRulebook(3, rng);
    expect(s3.rules.some((r) => r.net !== undefined && r.port === 22)).toBe(true);
    const s4 = makeRulebook(4, rng);
    expect(s4.rules.some((r) => r.proto === 'UDP')).toBe(true);
  });

  it('later shifts sometimes default to ALLOW', () => {
    const fallbacks = new Set(Array.from({ length: 20 }, (_, i) => makeRulebook(5, mulberry32(i)).fallback));
    expect(fallbacks).toEqual(new Set(['allow', 'deny']));
  });
});

describe('makePacket', () => {
  it('exercises every rule and the fallback', () => {
    const rng = mulberry32(5);
    const book = makeRulebook(4, rng);
    const hit = new Set<number>();
    for (let i = 0; i < 400; i++) hit.add(evaluate(book, makePacket(book, rng)).rule);
    for (let r = -1; r < book.rules.length; r++) expect(hit.has(r)).toBe(true);
  });

  it('produces valid packets', () => {
    const rng = mulberry32(6);
    const book = makeRulebook(3, rng);
    for (let i = 0; i < 100; i++) {
      const p = makePacket(book, rng);
      expect(() => parseIp(p.src)).not.toThrow();
      expect(PORTS).toContain(p.port);
      expect(['TCP', 'UDP']).toContain(p.proto);
    }
  });
});

describe('run', () => {
  const rightCall = (s: ReturnType<typeof createRun>) => evaluate(s.book, s.packet).action;
  const wrongCall = (s: ReturnType<typeof createRun>) => (rightCall(s) === 'allow' ? 'deny' : 'allow');

  it('scores right calls with combo and time bonus', () => {
    const s = createRun(mulberry32(1));
    const r = call(s, rightCall(s), 4.2);
    expect(r).toMatchObject({ right: true, points: 142, bonus: 0, newShift: false, over: false });
    expect(s.score).toBe(142);
    call(s, rightCall(s), 0);
    call(s, rightCall(s), 0);
    expect(call(s, rightCall(s), 0).points).toBe(200); // fourth in a row: ×2
  });

  it('a wrong call or a timeout is a strike and resets the combo', () => {
    const s = createRun(mulberry32(2));
    call(s, rightCall(s), 0);
    expect(call(s, wrongCall(s), 5)).toMatchObject({ right: false, points: 0 });
    expect(call(s, null, 0)).toMatchObject({ right: false, points: 0 });
    expect(s.strikes).toBe(2);
    expect(s.streak).toBe(0);
  });

  it('reports the deciding rule of the packet that was judged', () => {
    const s = createRun(mulberry32(4));
    const expected = evaluate(s.book, s.packet);
    const r = call(s, 'allow', 0);
    expect(r.action).toBe(expected.action);
    expect(r.rule).toBe(expected.rule);
  });

  it('three strikes is a breach', () => {
    const s = createRun(mulberry32(3));
    for (let i = 0; i < STRIKES - 1; i++) expect(call(s, wrongCall(s), 0).over).toBe(false);
    expect(call(s, wrongCall(s), 0).over).toBe(true);
    expect(s.over).toBe(true);
    expect(call(s, 'allow', 3)).toMatchObject({ points: 0, over: true });
  });

  it('a shift lasts PER_SHIFT packets, then the rulebook changes and pays a bonus', () => {
    const s = createRun(mulberry32(8));
    const first = s.book;
    for (let i = 0; i < PER_SHIFT - 1; i++) expect(call(s, rightCall(s), 0).newShift).toBe(false);
    const r = call(s, rightCall(s), 0);
    expect(r).toMatchObject({ newShift: true, bonus: SHIFT_BONUS });
    expect(s.shift).toBe(2);
    expect(s.handled).toBe(0);
    expect(s.book).not.toBe(first);
    expect(s.book.rules.length).toBeGreaterThan(first.rules.length);
  });

  it('the clock tightens but never below the floor', () => {
    expect(timeLimit(0)).toBe(7);
    expect(timeLimit(10)).toBeCloseTo(5.5);
    expect(timeLimit(1000)).toBe(3);
  });
});
