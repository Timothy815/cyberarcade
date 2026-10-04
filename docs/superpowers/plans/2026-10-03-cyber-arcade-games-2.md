# Cyber Arcade Games 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the next two learning games, Port Guardian (you are the firewall) and Bug Hunt (find the buggy line of Python). They plug into the live hub through the existing `GameModule` contract and join the 20-cycle leak loop.

**Architecture:** Both games follow the games-1 pattern. Rules live in a pure, DOM-free `logic.ts` with unit tests, and a thin `index.ts` renders plain DOM/CSS and implements `mount`/`unmount`. Port Guardian generates its rulebooks and packets in code, and every packet is judged by one first-match `evaluate()`. Bug Hunt has a hand-written bank of 41 snippets (`snippets.ts`), a tiny Python tokenizer for syntax colours (`highlight.ts`) and a deck/scoring module (`logic.ts`). A dev-only script (`npm run check:snippets`) runs every snippet's Python check against both the buggy and the fixed code. Each game is its own lazy chunk through `registry.ts` `load()`.

**Tech Stack:** Vite 8, TypeScript 5.9 strict, Vitest 5 (jsdom), Playwright 1.63. No new dependencies. `check:snippets` needs `python3` and Node ≥ 22.18 (Node strips the TS types itself). It is a dev tool and is not part of `npm test` or CI.

**Spec:** `docs/superpowers/specs/2026-10-03-cyber-arcade-design.md` (§5 Games 5 and 7; §8 Testing; §9 step 3)

**Starting point:** branch `games-2` (from `main` at 85d25fe, after the games-1 and password-fix merges). Every code block below was built and verified in a prototype, one commit per task: `npm test` (22 files, 204 tests), `npx tsc --noEmit`, `npm run build`, `npm run e2e` (16 tests) and `npm run check:snippets` (all 41 pass).

## Global Constraints

- Event: Sophomore Day, 2026-10-08. Each plan ends with a working, deployable build.
- Target: Windows 11 lab PCs (~3 years old), Chrome/Edge, keyboard + mouse, one player per station. 60 fps target. No mobile/touch, no gamepad.
- No new dependencies. Existing pins are unchanged.
- Palette (`--c-*` tokens): cyan `#00f0ff`, pink `#ff2e88`, yellow `#ffe259`, deep `#0e0020`, purple `#2a0750`, ink `#fff`, ink-dim `#ffd1f0`, grey `#b9b9d0`, danger `#ff3b5c`, ok `#3dff9a`. Fonts: `--f-display` (Audiowide), `--f-ui` (Space Grotesk), `--f-mono` (JetBrains Mono).
- Stage: fixed 1920×1080. No image files. CSS animates only `transform` and `opacity`; no `backdrop-filter`.
- Games talk to the outside only through `GameContext`: `ctx.audio.sfx(name)`, `ctx.input.onKey`, `ctx.endRun(score)`. Never add `window`/`document` key listeners. Esc is handled by the shell. Use `!e.repeat` on confirm keys (Enter) so a held key can't answer twice.
- Every `unmount()` releases its rAF, timers and DOM. Per-element click listeners go with their elements when the root is removed. The 20-cycle leak test (Task 5) enforces this.
- Build DOM with `el()` from `src/core/ui/dom.ts` and the HUD with `createHud()` from `src/core/ui/hud.ts`. Put text in with `textContent` only, never `innerHTML`. This includes the syntax-highlighted code.
- Port Guardian uses the real ports 22, 23, 25, 53, 80, 443 and 3389 (spec §5). Three wrong calls end the run. The rulebook changes each shift.
- Bug Hunt snippets: 6–12 lines, exactly one bug line, a fix that differs from that line, 4-space indents (no tabs), at most 56 characters per line so they fit the 1180 px panel at 30 px mono. Each snippet's `check` must pass with the fix and fail with the bug (`npm run check:snippets`).
- Ruling: particles and screen shake for the DOM games are deferred to step 6 (polish). These games use CSS shake and glow on the panel only.
- Shell commands: zsh is the shell, so don't put a bare `===` in commands.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/games/port/logic.ts` | Packets, rules, CIDR matching, first-match `evaluate`, rulebook/packet generators per shift, timer, combo, strikes, scoring |
| `src/games/port/index.ts` + `port.css` | Rulebook panel, packet card, ALLOW/DENY via ←/→ or click, highlights the deciding rule and explains wrong calls |
| `src/games/bughunt/snippets.ts` | 41 hand-written buggy Python snippets: level, bug kind, goal, code, bug line, fix, why, check |
| `tools/check-snippets.mjs` | Dev script: runs each snippet's check in python3 against the fixed and the buggy code |
| `src/games/bughunt/highlight.ts` | Splits a Python line into coloured tokens; the text always round-trips |
| `src/games/bughunt/logic.ts` | Deck ramp, per-level timer, combo, strikes, scoring, deck-clear bonus |
| `src/games/bughunt/index.ts` + `bughunt.css` | Code panel, ↑/↓ cursor, Enter/click to squash, struck-through bug line with the fix shown below |
| `src/games/registry.ts`, `src/main.ts` (modify) | `load()` for both games, CSS imports |
| `package.json` (modify) | `check:snippets` script |
| `tests/unit/port-logic.test.ts`, `bughunt-snippets.test.ts`, `bughunt-highlight.test.ts`, `bughunt-logic.test.ts` | Unit tests |
| `tests/e2e/games.spec.ts` (modify) | Two Port Guardian tests, one Bug Hunt test, and both games added to the leak loop |

---
### Task 1: Port Guardian logic

The firewall model. Rules are checked top to bottom and the first match wins. A rule may set a port, a protocol and/or a source network (CIDR), and a packet matches when it fits every field the rule sets. When no rule matches, the rulebook's `fallback` applies. Each shift's rulebook is generated: shift 1 has only port rules; shift 2 adds a blocked network on top, shift 3 a trusted admin subnet for SSH, and shift 4+ a UDP-only DNS rule, with a default that may flip to ALLOW. `makePacket` aims packets at a random rule (or the fallback) so every rule gets exercised. Packets per shift, the timer and scoring are constants in this file.

**Files:**
- Create: `src/games/port/logic.ts`
- Test: `tests/unit/port-logic.test.ts`

**Interfaces:**
- Consumes: `Rng`, `pick` and `shuffle` from `src/core/random.ts`.
- Produces (used by Task 2 and the e2e helper): types `Proto`, `Action`, `Packet {src, port, proto}`, `Rule {action, port?, proto?, net?}`, `Rulebook {rules, fallback}`; `SERVICES`, `STRIKES`, `PER_SHIFT`; `evaluate(book, packet): {action, rule}` (where `rule` is -1 for the fallback); `describeRule(rule): string`; `multiplier(streak)`, `timeLimit(correct)`; `RunState`, `CallResult {right, action, rule, points, bonus, newShift, over}`; `createRun(rng?)`, `call(state, said: Action | null, secondsLeft)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/port-logic.test.ts` (full file):

```ts
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
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/port-logic.test.ts`
Expected: FAIL because `../../src/games/port/logic` can't be resolved.

- [ ] **Step 3: Implement the logic**

Create `src/games/port/logic.ts` (full file):

```ts
import { pick, shuffle, type Rng } from '../../core/random';

export type Proto = 'TCP' | 'UDP';
export type Action = 'allow' | 'deny';

export interface Packet {
  src: string;
  port: number;
  proto: Proto;
}

/** A firewall rule. A packet matches when it fits every field the rule sets. */
export interface Rule {
  action: Action;
  port?: number;
  proto?: Proto;
  /** Source network in CIDR form, e.g. 10.66.0.0/16. */
  net?: string;
}

/** Rules are checked top to bottom and the first match wins; `fallback` applies when none match. */
export interface Rulebook {
  rules: Rule[];
  fallback: Action;
}

export const SERVICES: Record<number, { name: string; proto: Proto }> = {
  22: { name: 'SSH', proto: 'TCP' },
  23: { name: 'TELNET', proto: 'TCP' },
  25: { name: 'SMTP', proto: 'TCP' },
  53: { name: 'DNS', proto: 'UDP' },
  80: { name: 'HTTP', proto: 'TCP' },
  443: { name: 'HTTPS', proto: 'TCP' },
  3389: { name: 'RDP', proto: 'TCP' },
};
export const PORTS = [22, 23, 25, 53, 80, 443, 3389];
export const RISKY_PORTS = [23, 3389]; // plaintext logins and remote desktop: the usual suspects
export const BAD_NETS = ['10.66.0.0/16', '45.13.0.0/16', '203.0.113.0/24'];
export const TRUSTED_NETS = ['192.168.1.0/24', '10.0.5.0/24'];

export const STRIKES = 3;
export const PER_SHIFT = 8; // packets per shift
export const START_TIME = 7; // seconds for the first packet
export const MIN_TIME = 3;
export const TIME_STEP = 0.15; // seconds removed per correct call
export const SHIFT_BONUS = 500; // × the shift number

/** Parses a dotted IPv4 address into an unsigned 32-bit number. Throws on anything else. */
export function parseIp(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) {
    throw new Error(`bad IPv4 address: ${ip}`);
  }
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}

/** True when `ip` is inside the CIDR network `net` (e.g. 10.66.0.0/16). */
export function inNet(ip: string, net: string): boolean {
  const [base, bitsText] = net.split('/');
  const bits = Number(bitsText);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error(`bad CIDR: ${net}`);
  const size = 2 ** (32 - bits);
  return Math.floor(parseIp(ip) / size) === Math.floor(parseIp(base) / size);
}

export function matches(rule: Rule, p: Packet): boolean {
  if (rule.port !== undefined && rule.port !== p.port) return false;
  if (rule.proto !== undefined && rule.proto !== p.proto) return false;
  if (rule.net !== undefined && !inNet(p.src, rule.net)) return false;
  return true;
}

/** What the firewall does with `p`, and which rule decided it (-1 = the fallback). */
export function evaluate(book: Rulebook, p: Packet): { action: Action; rule: number } {
  const i = book.rules.findIndex((r) => matches(r, p));
  return i < 0 ? { action: book.fallback, rule: -1 } : { action: book.rules[i].action, rule: i };
}

/** Human-readable rule, e.g. "BLOCK 10.66.0.0/16", "ALLOW 443 HTTPS", "ALLOW 53 UDP DNS". */
export function describeRule(r: Rule): string {
  if (r.port === undefined && r.net !== undefined) return `${r.action === 'deny' ? 'BLOCK' : 'TRUST'} ${r.net}`;
  const parts = [r.action === 'allow' ? 'ALLOW' : 'DENY'];
  if (r.net !== undefined) parts.push(`${r.net} →`);
  if (r.port !== undefined) parts.push(String(r.port));
  if (r.proto !== undefined) parts.push(r.proto);
  if (r.port !== undefined) parts.push(SERVICES[r.port].name);
  return parts.join(' ');
}

/**
 * The rulebook for a shift. Each shift adds a new idea:
 * 1 port rules · 2 a blocked network above them · 3 a trusted admin subnet for SSH ·
 * 4+ a protocol-specific DNS rule, and the default can flip to ALLOW.
 */
export function makeRulebook(shift: number, rng: Rng = Math.random): Rulebook {
  const [denied, ...rest] = shuffle(RISKY_PORTS, rng);
  const safe = shuffle(PORTS.filter((p) => !RISKY_PORTS.includes(p) && p !== 22 && p !== 53), rng);
  const rules: Rule[] = [];
  if (shift >= 2) rules.push({ action: 'deny', net: pick(BAD_NETS, rng) });
  if (shift >= 3) rules.push({ action: 'allow', net: pick(TRUSTED_NETS, rng), port: 22 });
  if (shift >= 4) rules.push({ action: 'allow', port: 53, proto: 'UDP' });
  rules.push({ action: 'allow', port: safe[0] }, { action: 'allow', port: safe[1] }, { action: 'deny', port: denied });
  if (shift >= 3) rules.push({ action: 'deny', port: 22 });
  const fallback: Action = shift >= 4 && rng() < 0.5 ? 'allow' : 'deny';
  if (fallback === 'allow') rules.push({ action: 'deny', port: rest[0] });
  return { rules, fallback };
}

function randomIp(rng: Rng): string {
  const o = () => Math.floor(rng() * 256);
  return `${11 + Math.floor(rng() * 180)}.${o()}.${o()}.${1 + Math.floor(rng() * 254)}`;
}

/** A random address inside `net` (only /8, /16 and /24 are used in the game). */
export function ipIn(net: string, rng: Rng): string {
  const [base, bits] = net.split('/');
  const keep = Number(bits) / 8;
  return base
    .split('.')
    .map((o, i) => (i < keep ? o : String(i === 3 ? 1 + Math.floor(rng() * 254) : Math.floor(rng() * 256))))
    .join('.');
}

function randomPacket(book: Rulebook, rng: Rng): Packet {
  const nets = book.rules.flatMap((r) => (r.net ? [r.net] : []));
  const src = nets.length > 0 && rng() < 0.45 ? ipIn(pick(nets, rng), rng) : randomIp(rng);
  const port = pick(PORTS, rng);
  const usual = SERVICES[port].proto;
  const proto: Proto = rng() < 0.8 ? usual : usual === 'TCP' ? 'UDP' : 'TCP';
  return { src, port, proto };
}

/**
 * A packet aimed at a random rule (or the fallback), so every line of the rulebook gets used.
 * The right answer always comes from evaluate(), never from the aim.
 */
export function makePacket(book: Rulebook, rng: Rng = Math.random): Packet {
  const target = Math.floor(rng() * (book.rules.length + 1)) - 1;
  let p = randomPacket(book, rng);
  for (let tries = 0; tries < 60 && evaluate(book, p).rule !== target; tries++) p = randomPacket(book, rng);
  return p;
}

/** Combo multiplier from the streak *before* this call: ×1, then +1 every 3 in a row, max ×5. */
export function multiplier(streak: number): number {
  return Math.min(5, 1 + Math.floor(streak / 3));
}

/** Seconds allowed for the next packet after `correct` right calls. */
export function timeLimit(correct: number): number {
  return Math.max(MIN_TIME, START_TIME - TIME_STEP * correct);
}

export interface RunState {
  rng: Rng;
  shift: number;
  book: Rulebook;
  packet: Packet;
  /** Packets already judged in this shift. */
  handled: number;
  score: number;
  streak: number;
  strikes: number;
  correct: number;
  over: boolean;
}

export interface CallResult {
  right: boolean;
  /** What the rulebook says. */
  action: Action;
  /** Index of the deciding rule, -1 = fallback. Refers to the rulebook the packet was judged against. */
  rule: number;
  points: number;
  /** SHIFT_BONUS × shift when this call finished a shift, else 0. */
  bonus: number;
  /** True when this call finished the shift: state.book is now the next shift's rulebook. */
  newShift: boolean;
  over: boolean;
}

export function createRun(rng: Rng = Math.random): RunState {
  const book = makeRulebook(1, rng);
  return { rng, shift: 1, book, packet: makePacket(book, rng), handled: 0, score: 0, streak: 0, strikes: 0, correct: 0, over: false };
}

/** Applies the player's call for the current packet (`null` = the timer ran out, a strike) and moves on. */
export function call(s: RunState, said: Action | null, secondsLeft: number): CallResult {
  const { action, rule } = evaluate(s.book, s.packet);
  if (s.over) return { right: false, action, rule, points: 0, bonus: 0, newShift: false, over: true };
  const right = said === action;
  let points = 0;
  if (right) {
    points = 100 * multiplier(s.streak) + Math.round(Math.max(0, secondsLeft) * 10);
    s.streak++;
    s.correct++;
  } else {
    s.streak = 0;
    s.strikes++;
  }
  s.handled++;
  let bonus = 0;
  let newShift = false;
  if (s.strikes >= STRIKES) {
    s.over = true;
  } else {
    if (s.handled >= PER_SHIFT) {
      bonus = SHIFT_BONUS * s.shift;
      s.shift++;
      s.handled = 0;
      s.book = makeRulebook(s.shift, s.rng);
      newShift = true;
    }
    s.packet = makePacket(s.book, s.rng);
  }
  s.score += points + bonus;
  return { right, action, rule, points, bonus, newShift, over: s.over };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/unit/port-logic.test.ts && npx tsc --noEmit`
Expected: all PASS, no type errors. The full suite (`npm test`) is now 19 files, 151 tests.

- [ ] **Step 5: Commit**

```bash
git add src/games/port/logic.ts tests/unit/port-logic.test.ts
git commit -m "feat(port): firewall rule logic, shifts and scoring" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Port Guardian UI

The rulebook panel sits on the left and lists every rule plus the default as `.pg-rule` rows, with `data-*` attributes describing each rule. The packet card (`.pg-packet`, also with data attributes) slides in on the right with a shrinking timer bar. ← or the ALLOW button allows the packet, → or DENY denies it. After each call the deciding rule is highlighted (`.is-hit`). A wrong call shows `WRONG` plus a `.pg-why` line such as "Rule 2 matched first: …" or "No rule matched, so the default applies". At the end of each shift a `SHIFT n` banner shows and the new rulebook appears.

The e2e helper `portAnswer` rebuilds the rulebook and packet from those data attributes and asks the real `evaluate()` for the answer, so the tests never guess.

**Files:**
- Create: `src/games/port/index.ts`, `src/games/port/port.css`
- Modify: `src/games/registry.ts` (the `port` cabinet), `src/main.ts` (CSS import), `tests/e2e/games.spec.ts`

**Interfaces:**
- Consumes: Task 1's `logic.ts` API; `GameContext`/`GameModule` from `src/core/types.ts`; `el()`; `createHud()`; the existing e2e helpers `boot`, `trackErrors` and `launch(page, id)` in `games.spec.ts`.
- Produces: `createGame(): GameModule` from `src/games/port/index.ts`. The DOM hooks the e2e test relies on are `.port[data-shift]`, `.pg-rule[data-action|port|proto|net|fallback]`, `.pg-rule.is-hit`, `.pg-packet[data-src|port|proto].is-in`, `.pg-btn.is-allow`, `.pg-btn.is-deny`, `.pg-verdict`, `.pg-why`, `.pg-banner`, and the HUD keys `score` and `shift`.

- [ ] **Step 1: Write the failing e2e tests**

`tests/e2e/games.spec.ts`, apply this change:

```diff
@@ -1,5 +1,6 @@
 import { expect, test, type Page } from '@playwright/test';
 import { ITEMS } from '../../src/games/phish/items';
+import { evaluate, type Action, type Proto, type Rule } from '../../src/games/port/logic';
 import { boot, trackErrors } from './helpers';
 
 test.beforeEach(async ({ page }) => {
@@ -102,6 +103,72 @@ test('invaders: Phaser boots, firing scores, Esc tears the canvas down', async (
   expect(errors).toEqual([]);
 });
 
+/** Rebuilds the rulebook and packet from the page's data attributes and asks the real firewall logic. */
+async function portAnswer(page: Page): Promise<Action> {
+  const rows = await page.locator('.pg-rule').evaluateAll((els) => els.map((e) => ({ ...(e as HTMLElement).dataset })));
+  const rules: Rule[] = rows
+    .filter((d) => d.fallback === undefined)
+    .map((d) => ({
+      action: d.action as Action,
+      ...(d.port ? { port: Number(d.port) } : {}),
+      ...(d.proto ? { proto: d.proto as Proto } : {}),
+      ...(d.net ? { net: d.net } : {}),
+    }));
+  const fallback = rows.find((d) => d.fallback !== undefined)!.action as Action;
+  const card = await page.locator('.pg-packet').evaluate((e) => ({ ...(e as HTMLElement).dataset }));
+  return evaluate({ rules, fallback }, { src: card.src!, port: Number(card.port), proto: card.proto as Proto }).action;
+}
+
+test('port: right calls score, wrong calls explain the rule, three strikes end the run', async ({ page }) => {
+  const errors = trackErrors(page);
+  await boot(page);
+  await launch(page, 'port');
+  const card = page.locator('.pg-packet');
+  await expect(card).toHaveClass(/is-in/);
+  await expect(page.locator('.pg-rule[data-fallback]')).toHaveCount(1);
+
+  await page.keyboard.press((await portAnswer(page)) === 'allow' ? 'ArrowLeft' : 'ArrowRight');
+  await expect(page.locator('.pg-verdict')).toContainText('CORRECT');
+  await expect(page.locator('.pg-rule.is-hit')).toHaveCount(1);
+  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');
+
+  // A click on the on-screen button counts too.
+  await expect(card).toHaveClass(/is-in/);
+  await page.locator((await portAnswer(page)) === 'allow' ? '.pg-btn.is-allow' : '.pg-btn.is-deny').click();
+  await expect(page.locator('.pg-verdict')).toContainText('CORRECT');
+
+  for (let i = 0; i < 3; i++) {
+    await expect(card).toHaveClass(/is-in/); // next packet is up
+    await page.keyboard.press((await portAnswer(page)) === 'allow' ? 'ArrowRight' : 'ArrowLeft');
+    await expect(page.locator('.pg-verdict')).toContainText('WRONG');
+    await expect(page.locator('.pg-why')).toContainText(/matched first|default applies/);
+    await expect(page.locator('.pg-rule.is-hit')).toHaveCount(1);
+  }
+  await expect(page.locator('.game-over .final-score')).toBeVisible({ timeout: 5000 });
+  expect(errors).toEqual([]);
+});
+
+test('port: a full shift brings a new rulebook', async ({ page }) => {
+  test.setTimeout(60_000);
+  const errors = trackErrors(page);
+  await boot(page);
+  await launch(page, 'port');
+  const card = page.locator('.pg-packet');
+  await expect(page.locator('.port')).toHaveAttribute('data-shift', '1');
+  const firstRules = await page.locator('.pg-rule').count();
+  for (let i = 0; i < 8; i++) {
+    await expect(card).toHaveClass(/is-in/);
+    await page.keyboard.press((await portAnswer(page)) === 'allow' ? 'ArrowLeft' : 'ArrowRight');
+    await expect(page.locator('.pg-verdict')).toContainText('CORRECT');
+  }
+  await expect(page.locator('.pg-banner')).toContainText('SHIFT 2');
+  await expect(page.locator('.port')).toHaveAttribute('data-shift', '2');
+  expect(await page.locator('.pg-rule').count()).toBeGreaterThan(firstRules);
+  await expect(page.locator('[data-hud="shift"]')).toHaveText('2');
+  await expect(card).toHaveClass(/is-in/, { timeout: 5000 });
+  expect(errors).toEqual([]);
+});
+
 test('20 launch/exit cycles across the three games leave nothing behind', async ({ page }) => {
   test.setTimeout(240_000);
   const errors = trackErrors(page);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx playwright test tests/e2e/games.spec.ts -g "port:"`
Expected: FAIL. The cabinet has no `load`, so the game never mounts and `.pg-packet` is never found.

- [ ] **Step 3: Implement the UI**

Create `src/games/port/index.ts` (full file):

```ts
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { call, createRun, describeRule, multiplier, SERVICES, STRIKES, timeLimit, type Action, type Rule } from './logic';

const RIGHT_MS = 450; // pause after a correct call
const WRONG_MS = 2200; // the deciding rule stays highlighted this long after a mistake
const SHIFT_MS = 2400; // "NEW RULES" banner between shifts

/** One rulebook row. The data-* attributes describe the rule for the e2e tests. */
function ruleRow(rule: Rule, n: number): HTMLElement {
  return el(
    `div.pg-rule.is-${rule.action}`,
    { 'data-action': rule.action, 'data-port': rule.port, 'data-proto': rule.proto, 'data-net': rule.net },
    el('span.pg-rule-n', {}, String(n)),
    el('span.pg-rule-text', {}, describeRule(rule)),
  );
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const run = createRun();
      const hud = createHud([['score', 'SCORE'], ['shift', 'SHIFT'], ['combo', 'COMBO'], ['strikes', 'STRIKES']]);
      const rules = el('div.pg-rules');
      const book = el(
        'div.pg-book',
        {},
        el('div.pg-book-title', {}, 'RULEBOOK'),
        el('div.pg-book-note', {}, 'Top to bottom · first match wins'),
        rules,
      );
      const src = el('span.pg-value');
      const port = el('span.pg-value');
      const service = el('span.pg-service');
      const proto = el('span.pg-value');
      const card = el(
        'div.pg-packet',
        {},
        el('div.pg-packet-title', {}, 'INCOMING PACKET'),
        el('div.pg-field', {}, el('span.pg-label', {}, 'FROM'), src),
        el('div.pg-field', {}, el('span.pg-label', {}, 'PORT'), port, service),
        el('div.pg-field', {}, el('span.pg-label', {}, 'PROTOCOL'), proto),
      );
      const bar = el('div.pg-timer-fill');
      const verdict = el('div.pg-verdict');
      const why = el('div.pg-why');
      const allowBtn = el('div.pg-btn.is-allow', { role: 'button' }, '← ALLOW');
      const denyBtn = el('div.pg-btn.is-deny', { role: 'button' }, 'DENY →');
      const banner = el('div.pg-banner');
      root = el(
        'div.port',
        {},
        hud.el,
        book,
        el('div.pg-side', {}, card, el('div.pg-timer', {}, bar), verdict, why),
        el('div.pg-keys', {}, allowBtn, denyBtn),
        banner,
      );
      container.append(root);

      let deadline = 0;
      let limit = 0;
      let busy = true;

      const updateHud = () => {
        hud.set('score', run.score.toLocaleString('en-US'));
        hud.set('shift', String(run.shift));
        hud.set('combo', `×${multiplier(run.streak)}`);
        hud.set('strikes', '✖'.repeat(run.strikes) + '·'.repeat(STRIKES - run.strikes));
      };

      const showBook = () => {
        root!.dataset.shift = String(run.shift);
        rules.replaceChildren(
          ...run.book.rules.map((r, i) => ruleRow(r, i + 1)),
          el(
            `div.pg-rule.is-fallback.is-${run.book.fallback}`,
            { 'data-action': run.book.fallback, 'data-fallback': '' },
            el('span.pg-rule-n', {}, '*'),
            el('span.pg-rule-text', {}, `${run.book.fallback === 'allow' ? 'ALLOW' : 'DENY'} everything else`),
          ),
        );
      };

      const showPacket = () => {
        const p = run.packet;
        src.textContent = p.src;
        port.textContent = String(p.port);
        service.textContent = SERVICES[p.port].name;
        proto.textContent = p.proto;
        card.className = 'pg-packet is-in';
        Object.assign(card.dataset, { src: p.src, port: String(p.port), proto: p.proto });
        for (const row of rules.children) row.classList.remove('is-hit');
        verdict.textContent = '';
        verdict.className = 'pg-verdict';
        why.textContent = '';
        limit = timeLimit(run.correct) * 1000;
        deadline = performance.now() + limit;
        busy = false;
      };

      const decide = (said: Action | null) => {
        if (busy) return;
        busy = true;
        const judged = run.book; // call() may swap in the next shift's rulebook
        const secondsLeft = Math.max(0, deadline - performance.now()) / 1000;
        const result = call(run, said, secondsLeft);
        updateHud();
        const word = result.action === 'allow' ? 'ALLOW' : 'DENY';
        verdict.textContent = result.right ? `CORRECT — ${word}` : `${said === null ? "TIME'S UP" : 'WRONG'} — SHOULD ${word}`;
        verdict.className = `pg-verdict ${result.right ? 'is-right' : 'is-wrong'}`;
        card.className = `pg-packet ${result.right ? 'is-right' : 'is-wrong'}`;
        // Point at the rule that decided it (the fallback row is last).
        const row = rules.children[result.rule < 0 ? rules.children.length - 1 : result.rule];
        row?.classList.add('is-hit');
        if (!result.right) {
          why.textContent =
            result.rule < 0
              ? `No rule matched, so the default applies: ${word} everything else.`
              : `Rule ${result.rule + 1} matched first: ${describeRule(judged.rules[result.rule])}.`;
        }
        ctx.audio.sfx(result.right ? 'coin' : 'error');
        pause = setTimeout(() => {
          if (result.over) {
            ctx.endRun(run.score);
          } else if (result.newShift) {
            banner.textContent = `SHIFT ${run.shift} · NEW RULES  +${result.bonus.toLocaleString('en-US')}`;
            banner.classList.add('is-on');
            ctx.audio.sfx('powerup');
            showBook();
            pause = setTimeout(() => {
              banner.classList.remove('is-on');
              showPacket();
            }, SHIFT_MS);
          } else {
            showPacket();
          }
        }, result.right ? RIGHT_MS : WRONG_MS);
      };

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (busy) return;
        const left = deadline - performance.now();
        bar.style.transform = `scaleX(${Math.max(0, left / limit)})`;
        if (left <= 0) decide(null);
      };

      ctx.input.onKey((e) => {
        if (e.repeat) return;
        if (e.code === 'ArrowLeft') decide('allow');
        else if (e.code === 'ArrowRight') decide('deny');
      });
      allowBtn.addEventListener('click', () => decide('allow'));
      denyBtn.addEventListener('click', () => decide('deny'));

      updateHud();
      showBook();
      showPacket();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimeout(pause);
      root?.remove(); // the button click listeners go with their elements
      root = null;
    },
  };
}
```

Create `src/games/port/port.css` (full file):

```css
.port {
  position: absolute;
  inset: 0;
}
.pg-book {
  position: absolute;
  top: 150px;
  left: 100px;
  width: 760px;
  padding: 28px 32px;
  border-radius: 18px;
  background: rgba(18, 0, 38, 0.92);
  border: 3px solid var(--c-pink);
  box-shadow: 0 0 30px rgba(255, 46, 136, 0.45), inset 0 0 24px rgba(255, 46, 136, 0.12);
}
.pg-book-title {
  font-family: var(--f-display);
  font-size: 40px;
  letter-spacing: 0.12em;
  color: var(--c-pink);
  text-shadow: 0 0 14px var(--c-pink);
}
.pg-book-note {
  margin: 6px 0 20px;
  font-size: 24px;
  color: var(--c-ink-dim);
}
.pg-rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pg-rule {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 12px 18px;
  border-radius: 10px;
  border: 2px solid transparent;
  background: rgba(255, 255, 255, 0.05);
  font-family: var(--f-mono);
  font-size: 30px;
  font-weight: 700;
  animation: pg-rule-in 0.4s both;
}
.pg-rule:nth-child(2) { animation-delay: 0.05s; }
.pg-rule:nth-child(3) { animation-delay: 0.1s; }
.pg-rule:nth-child(4) { animation-delay: 0.15s; }
.pg-rule:nth-child(5) { animation-delay: 0.2s; }
.pg-rule:nth-child(6) { animation-delay: 0.25s; }
.pg-rule:nth-child(7) { animation-delay: 0.3s; }
.pg-rule:nth-child(8) { animation-delay: 0.35s; }
@keyframes pg-rule-in {
  from { opacity: 0; transform: translateX(-30px); }
}
.pg-rule.is-allow .pg-rule-text { color: var(--c-ok); }
.pg-rule.is-deny .pg-rule-text { color: var(--c-danger); }
.pg-rule.is-fallback {
  margin-top: 8px;
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.25);
  font-weight: 400;
}
.pg-rule.is-hit {
  border-color: var(--c-yellow);
  border-style: solid;
  box-shadow: 0 0 22px var(--c-yellow);
  transform: scale(1.03);
}
.pg-rule-n {
  width: 40px;
  color: var(--c-grey);
  text-align: right;
}
.pg-side {
  position: absolute;
  top: 150px;
  left: 940px;
  width: 880px;
  display: flex;
  flex-direction: column;
  gap: 26px;
}
.pg-packet {
  padding: 32px 44px;
  border-radius: 18px;
  background: rgba(18, 0, 38, 0.92);
  border: 3px solid var(--c-cyan);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.5), inset 0 0 24px rgba(0, 240, 255, 0.15);
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.pg-packet.is-in { animation: pg-packet-in 0.3s ease-out; }
@keyframes pg-packet-in {
  from { opacity: 0; transform: translateX(80px); }
}
.pg-packet.is-right {
  border-color: var(--c-ok);
  box-shadow: 0 0 40px var(--c-ok);
}
.pg-packet.is-wrong {
  border-color: var(--c-danger);
  box-shadow: 0 0 40px var(--c-danger);
  animation: pg-shake 0.3s;
}
@keyframes pg-shake {
  25% { transform: translateX(-14px); }
  75% { transform: translateX(14px); }
}
.pg-packet-title {
  font-family: var(--f-mono);
  font-size: 22px;
  letter-spacing: 0.3em;
  color: var(--c-cyan);
}
.pg-field {
  display: flex;
  align-items: baseline;
  gap: 24px;
}
.pg-label {
  width: 210px;
  font-size: 26px;
  letter-spacing: 0.12em;
  color: var(--c-ink-dim);
}
.pg-value {
  font-family: var(--f-mono);
  font-size: 54px;
  font-weight: 700;
  color: var(--c-yellow);
}
.pg-service {
  font-family: var(--f-mono);
  font-size: 32px;
  color: var(--c-cyan);
}
.pg-timer {
  height: 14px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.pg-timer-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-pink), var(--c-yellow));
  box-shadow: 0 0 12px var(--c-yellow);
  transform-origin: left;
}
.pg-verdict {
  min-height: 56px;
  font-family: var(--f-display);
  font-size: 44px;
  letter-spacing: 0.08em;
}
.pg-verdict.is-right { color: var(--c-ok); text-shadow: 0 0 16px var(--c-ok); }
.pg-verdict.is-wrong { color: var(--c-danger); text-shadow: 0 0 16px var(--c-danger); }
.pg-why {
  min-height: 44px;
  font-size: 32px;
  color: var(--c-yellow);
}
.pg-keys {
  position: absolute;
  bottom: 48px;
  left: 940px;
  width: 880px;
  display: flex;
  justify-content: space-between;
}
.pg-btn {
  padding: 14px 40px;
  border-radius: 14px;
  border: 3px solid currentColor;
  font-family: var(--f-display);
  font-size: 40px;
  cursor: pointer;
  user-select: none;
}
.pg-btn.is-allow { color: var(--c-ok); text-shadow: 0 0 14px var(--c-ok); box-shadow: 0 0 16px rgba(61, 255, 154, 0.4); }
.pg-btn.is-deny { color: var(--c-danger); text-shadow: 0 0 14px var(--c-danger); box-shadow: 0 0 16px rgba(255, 59, 92, 0.4); }
.pg-banner {
  position: absolute;
  top: 470px;
  left: 0;
  right: 0;
  text-align: center;
  font-family: var(--f-display);
  font-size: 72px;
  letter-spacing: 6px;
  color: var(--c-cyan);
  text-shadow: 0 0 18px var(--c-cyan), 0 0 42px var(--c-pink);
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 0.3s, transform 0.3s;
  pointer-events: none;
}
.pg-banner.is-on {
  opacity: 1;
  transform: scale(1);
}
```

`src/games/registry.ts`, apply this change:

```diff
@@ -52,6 +52,7 @@ export const CABINETS: Cabinet[] = [
     tagline: 'You are the firewall. Check each packet against the rulebook: allow or deny?',
     category: 'learn',
     controls: [['←', 'Allow'], ['→', 'Deny']],
+    load: () => import('./port/index').then((m) => m.createGame()),
   },
   {
     kind: 'game',
```

`src/main.ts`, apply this change:

```diff
@@ -10,6 +10,7 @@ import './hub/hub.css';
 import './games/phish/phish.css';
 import './games/password/password.css';
 import './games/invaders/invaders.css';
+import './games/port/port.css';
 
 import { createAudio } from './core/audio';
 import { watchFullscreen } from './core/fullscreen';
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc --noEmit && npm test && npx playwright test tests/e2e/games.spec.ts -g "port:"`
Expected: no type errors; 151 unit tests pass; both port e2e tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/games/port/index.ts src/games/port/port.css src/games/registry.ts src/main.ts tests/e2e/games.spec.ts
git commit -m "feat(port): playable Port Guardian" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bug Hunt snippet bank and checker

Spec §5 asks for ~40 snippets tagged by difficulty. This bank has 41: 15 at level 1, 16 at level 2 and 10 at level 3. Each snippet has a `goal` (shown above the code), the `code` lines, the 0-based `bug` line, the `fix` line, a `kind` (shown as a tag via `KIND_LABEL`), a one-sentence `why` and a Python `check`. The check is a line of `assert`s that passes with the fix and fails with the bug. The unit test enforces the shape rules. `tools/check-snippets.mjs` proves each snippet's bug is real by running its check in python3 against both versions.

**Files:**
- Create: `src/games/bughunt/snippets.ts`, `tools/check-snippets.mjs`
- Modify: `package.json` (the `check:snippets` script)
- Test: `tests/unit/bughunt-snippets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 4 and 5): `BugKind`, `KIND_LABEL: Record<BugKind, string>`, `Snippet {id, level: 1|2|3, kind, goal, code: string[], bug: number, fix: string, why: string, check: string}`, `SNIPPETS: Snippet[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/bughunt-snippets.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { KIND_LABEL, SNIPPETS } from '../../src/games/bughunt/snippets';

describe('bug hunt snippets', () => {
  it('has unique ids and enough of each level', () => {
    expect(new Set(SNIPPETS.map((s) => s.id)).size).toBe(SNIPPETS.length);
    const count = (l: number) => SNIPPETS.filter((s) => s.level === l).length;
    expect(count(1)).toBeGreaterThanOrEqual(10);
    expect(count(2)).toBeGreaterThanOrEqual(10);
    expect(count(3)).toBeGreaterThanOrEqual(8);
  });

  it.each(SNIPPETS.map((s) => [s.id, s] as const))('%s is well formed', (_id, s) => {
    expect(s.code.length).toBeGreaterThanOrEqual(6);
    expect(s.code.length).toBeLessThanOrEqual(12);
    expect(s.bug).toBeGreaterThanOrEqual(0);
    expect(s.bug).toBeLessThan(s.code.length);
    expect(s.fix).not.toBe(s.code[s.bug]);
    expect(KIND_LABEL[s.kind]).toBeTruthy();
    expect(s.goal.length).toBeGreaterThan(0);
    expect(s.why.length).toBeGreaterThan(0);
    expect(s.check.length).toBeGreaterThan(0);
    for (const line of [...s.code, s.fix]) {
      expect(line).not.toMatch(/\t/);
      expect(line.length).toBeLessThanOrEqual(56); // fits the code panel at 34px mono
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/bughunt-snippets.test.ts`
Expected: FAIL because `../../src/games/bughunt/snippets` can't be resolved.

- [ ] **Step 3: Add the snippet bank**

Copy every snippet exactly as written. The `check` strings were verified against python3.

Create `src/games/bughunt/snippets.ts` (full file):

```ts
export type BugKind =
  | 'compare' // = vs ==, > vs >=
  | 'operator' // wrong arithmetic or logic operator
  | 'off-by-one'
  | 'missing-return'
  | 'indentation'
  | 'wrong-variable'
  | 'syntax'
  | 'type' // mixing text and numbers
  | 'logic';

export const KIND_LABEL: Record<BugKind, string> = {
  compare: 'COMPARISON',
  operator: 'WRONG OPERATOR',
  'off-by-one': 'OFF BY ONE',
  'missing-return': 'MISSING RETURN',
  indentation: 'INDENTATION',
  'wrong-variable': 'WRONG VARIABLE',
  syntax: 'SYNTAX',
  type: 'TYPE MIX-UP',
  logic: 'LOGIC',
};

export interface Snippet {
  id: string;
  level: 1 | 2 | 3;
  kind: BugKind;
  /** What the code is supposed to do, shown above it. */
  goal: string;
  /** 6–12 lines of Python, indented with 4 spaces. */
  code: string[];
  /** Index into `code` of the one buggy line. */
  bug: number;
  /** The corrected version of that line. */
  fix: string;
  why: string;
  /** Python statements that pass with the fix and fail with the bug. Never shown; used by the tests. */
  check: string;
}

export const SNIPPETS: Snippet[] = [
  // ── Level 1 ──────────────────────────────────────────────
  {
    id: 'even',
    level: 1,
    kind: 'compare',
    goal: 'Say whether a number is even.',
    code: ['def is_even(n):', '    if n % 2 = 0:', '        return True', '    else:', '        return False', '', 'print(is_even(4))'],
    bug: 1,
    fix: '    if n % 2 == 0:',
    why: '= stores a value. To compare, Python needs ==.',
    check: 'assert is_even(4) and not is_even(7)',
  },
  {
    id: 'greet',
    level: 1,
    kind: 'syntax',
    goal: 'Greet every name and count them.',
    code: [
      'def greet_all(names):',
      '    count = 0',
      '    for name in names',
      '        print("Hi, " + name)',
      '        count = count + 1',
      '    return count',
    ],
    bug: 2,
    fix: '    for name in names:',
    why: 'A for line must end with a colon.',
    check: 'assert greet_all(["a", "b"]) == 2',
  },
  {
    id: 'area',
    level: 1,
    kind: 'missing-return',
    goal: 'Return the area of a rectangle.',
    code: [
      'def area(width, height):',
      '    result = width * height',
      '',
      'def main():',
      '    a = area(3, 4)',
      '    print("Area:", a)',
      '    return a',
    ],
    bug: 1,
    fix: '    return width * height',
    why: 'area() works out the answer but never returns it, so it gives back None.',
    check: 'assert area(3, 4) == 12',
  },
  {
    id: 'average',
    level: 1,
    kind: 'operator',
    goal: 'Average three test scores.',
    code: [
      'def average(a, b, c):',
      '    total = a + b + c',
      '    avg = total * 3',
      '    return avg',
      '',
      'score = average(90, 80, 70)',
      'print("Average:", score)',
    ],
    bug: 2,
    fix: '    avg = total / 3',
    why: 'An average divides the total by the count. It does not multiply.',
    check: 'assert average(90, 80, 70) == 80',
  },
  {
    id: 'one-to-ten',
    level: 1,
    kind: 'off-by-one',
    goal: 'List the numbers 1 through 10.',
    code: ['def one_to_ten():', '    nums = []', '    for i in range(1, 10):', '        nums.append(i)', '    return nums', '', 'print(one_to_ten())'],
    bug: 2,
    fix: '    for i in range(1, 11):',
    why: 'range() stops BEFORE its end number, so range(1, 10) stops at 9.',
    check: 'assert one_to_ten() == list(range(1, 11))',
  },
  {
    id: 'age',
    level: 1,
    kind: 'compare',
    goal: 'Let someone join if they are 13 or older.',
    code: ['def can_join(age):', '    if age > 13:', '        return True', '    return False', '', 'print(can_join(13))', 'print(can_join(12))'],
    bug: 1,
    fix: '    if age >= 13:',
    why: '> 13 leaves out 13 itself. "13 or older" needs >=.',
    check: 'assert can_join(13) and not can_join(12)',
  },
  {
    id: 'score-msg',
    level: 1,
    kind: 'type',
    goal: "Build a message with the player's score.",
    code: [
      'def score_message(name, score):',
      '    msg = name + " scored " + score',
      '    msg = msg + " points!"',
      '    return msg',
      '',
      'print(score_message("Ana", 42))',
    ],
    bug: 1,
    fix: '    msg = name + " scored " + str(score)',
    why: 'You cannot + text and a number. str() turns the number into text first.',
    check: 'assert score_message("Ana", 42) == "Ana scored 42 points!"',
  },
  {
    id: 'bigger',
    level: 1,
    kind: 'wrong-variable',
    goal: 'Return the larger of two numbers.',
    code: ['def bigger(a, b):', '    if a > b:', '        return a', '    else:', '        return a', '', 'print(bigger(3, 9))'],
    bug: 4,
    fix: '        return b',
    why: 'When a is not bigger, the answer is b. This returns a both times.',
    check: 'assert bigger(3, 9) == 9 and bigger(9, 3) == 9',
  },
  {
    id: 'fahrenheit',
    level: 1,
    kind: 'operator',
    goal: 'Convert Celsius to Fahrenheit.',
    code: [
      'def to_fahrenheit(c):',
      '    f = c * 9 / 5 - 32',
      '    return f',
      '',
      'boiling = to_fahrenheit(100)',
      'print("Water boils at", boiling)',
    ],
    bug: 1,
    fix: '    f = c * 9 / 5 + 32',
    why: 'The formula is F = C × 9/5 + 32. This one subtracts the 32.',
    check: 'assert to_fahrenheit(100) == 212',
  },
  {
    id: 'last-item',
    level: 1,
    kind: 'off-by-one',
    goal: 'Return the last item in a list.',
    code: [
      'def last_item(items):',
      '    n = len(items)',
      '    return items[n]',
      '',
      'colors = ["red", "green", "blue"]',
      'print(last_item(colors))',
    ],
    bug: 2,
    fix: '    return items[n - 1]',
    why: 'Indexes start at 0, so the last item is at len - 1. items[n] is past the end.',
    check: 'assert last_item([1, 2, 3]) == 3',
  },
  {
    id: 'total',
    level: 1,
    kind: 'logic',
    goal: 'Add up all the numbers in a list.',
    code: ['def total(nums):', '    s = 0', '    for n in nums:', '        s = n', '    return s', '', 'print(total([4, 5, 6]))'],
    bug: 3,
    fix: '        s = s + n',
    why: 's = n replaces the running total each time instead of adding to it.',
    check: 'assert total([4, 5, 6]) == 15',
  },
  {
    id: 'vowels',
    level: 1,
    kind: 'logic',
    goal: 'Count the vowels in a word.',
    code: [
      'def count_vowels(word):',
      '    count = 0',
      '    for letter in word:',
      '        if letter in "aeiou":',
      '            count + 1',
      '    return count',
    ],
    bug: 4,
    fix: '            count += 1',
    why: 'count + 1 works out a number and throws it away. count += 1 saves it.',
    check: 'assert count_vowels("banana") == 3',
  },
  {
    id: 'traffic',
    level: 1,
    kind: 'compare',
    goal: 'Say if a traffic light means stop.',
    code: [
      'def must_stop(light):',
      '    if light == "red":',
      '        return True',
      '    elif light = "yellow":',
      '        return True',
      '    return False',
    ],
    bug: 3,
    fix: '    elif light == "yellow":',
    why: 'Comparing needs ==. A single = is a syntax error here.',
    check: 'assert must_stop("yellow") and must_stop("red") and not must_stop("green")',
  },
  {
    id: 'double',
    level: 1,
    kind: 'operator',
    goal: 'Double every number in a list.',
    code: [
      'def double_all(nums):',
      '    result = []',
      '    for n in nums:',
      '        result.append(n * n)',
      '    return result',
      '',
      'print(double_all([1, 2, 3]))',
    ],
    bug: 3,
    fix: '        result.append(n * 2)',
    why: 'n * n squares the number. Doubling is n * 2.',
    check: 'assert double_all([1, 2, 3]) == [2, 4, 6]',
  },
  {
    id: 'countdown',
    level: 1,
    kind: 'off-by-one',
    goal: 'Count down from 5 to 1.',
    code: ['def countdown():', '    out = []', '    for i in range(5, 0, 1):', '        out.append(i)', '    return out', '', 'print(countdown())'],
    bug: 2,
    fix: '    for i in range(5, 0, -1):',
    why: 'To count down, the step must be -1. With +1 the range is empty.',
    check: 'assert countdown() == [5, 4, 3, 2, 1]',
  },

  // ── Level 2 ──────────────────────────────────────────────
  {
    id: 'prices',
    level: 2,
    kind: 'indentation',
    goal: 'Add up all the prices.',
    code: [
      'def total_price(prices):',
      '    total = 0',
      '    for p in prices:',
      '        total += p',
      '        return total',
      '',
      'print(total_price([5, 10, 15]))',
    ],
    bug: 4,
    fix: '    return total',
    why: 'The return is inside the loop, so it quits after the first price.',
    check: 'assert total_price([5, 10, 15]) == 30',
  },
  {
    id: 'weekend',
    level: 2,
    kind: 'operator',
    goal: 'Say if a day is on the weekend.',
    code: [
      'def is_weekend(day):',
      '    if day == "Sat" and day == "Sun":',
      '        return True',
      '    return False',
      '',
      'print(is_weekend("Sat"))',
    ],
    bug: 1,
    fix: '    if day == "Sat" or day == "Sun":',
    why: 'A day cannot be Sat AND Sun at once. It needs or.',
    check: 'assert is_weekend("Sat") and is_weekend("Sun") and not is_weekend("Mon")',
  },
  {
    id: 'first-three',
    level: 2,
    kind: 'off-by-one',
    goal: 'Make a 3-letter city code, like BOS.',
    code: [
      'def first_three(word):',
      '    return word[1:3]',
      '',
      'def short_code(city):',
      '    code = first_three(city)',
      '    return code.upper()',
    ],
    bug: 1,
    fix: '    return word[0:3]',
    why: 'Slices start counting at 0. word[1:3] skips the first letter and keeps only two.',
    check: 'assert short_code("Boston") == "BOS"',
  },
  {
    id: 'largest',
    level: 2,
    kind: 'wrong-variable',
    goal: 'Find the largest number in a list.',
    code: [
      'def largest(nums):',
      '    best = nums[0]',
      '    for n in nums:',
      '        if n > best:',
      '            best = nums',
      '    return best',
    ],
    bug: 4,
    fix: '            best = n',
    why: 'It saves the whole list instead of the number n that just won.',
    check: 'assert largest([3, 9, 2]) == 9',
  },
  {
    id: 'eggs',
    level: 2,
    kind: 'operator',
    goal: 'Count the FULL boxes of 6 eggs.',
    code: ['def full_boxes(eggs):', '    boxes = eggs / 6', '    return boxes', '', 'print(full_boxes(20))', 'print(full_boxes(12))'],
    bug: 1,
    fix: '    boxes = eggs // 6',
    why: '/ gives 3.33 boxes. // divides and drops the leftover: 3 full boxes.',
    check: 'assert full_boxes(20) == 3',
  },
  {
    id: 'grade',
    level: 2,
    kind: 'missing-return',
    goal: 'Give a letter grade.',
    code: [
      'def grade(score):',
      '    if score >= 90:',
      '        return "A"',
      '    elif score >= 80:',
      '        return "B"',
      '    elif score >= 70:',
      '        "C"',
      '    return "F"',
    ],
    bug: 6,
    fix: '        return "C"',
    why: 'A bare "C" does nothing. Without return, a 75 falls through to "F".',
    check: 'assert grade(75) == "C" and grade(95) == "A" and grade(50) == "F"',
  },
  {
    id: 'pin',
    level: 2,
    kind: 'logic',
    goal: 'Check a PIN is exactly 4 digits.',
    code: [
      'def valid_pin(pin):',
      '    if len(pin) != 4:',
      '        return False',
      '    if not pin.isdigit():',
      '        return False',
      '    return False',
    ],
    bug: 5,
    fix: '    return True',
    why: 'Once both checks pass the PIN is good, but this still returns False.',
    check: 'assert valid_pin("1234") and not valid_pin("12a4") and not valid_pin("123")',
  },
  {
    id: 'bonus',
    level: 2,
    kind: 'indentation',
    goal: 'Add a 500 bonus only when the level is complete.',
    code: [
      'def finish(score, complete):',
      '    if complete:',
      '        print("Level complete!")',
      '    score += 500',
      '    return score',
      '',
      'print(finish(100, False))',
    ],
    bug: 3,
    fix: '        score += 500',
    why: 'The bonus line is not indented under the if, so everyone gets it.',
    check: 'assert finish(100, False) == 100 and finish(100, True) == 600',
  },
  {
    id: 'sum-to',
    level: 2,
    kind: 'off-by-one',
    goal: 'Add the numbers from 1 up to n.',
    code: [
      'def sum_to(n):',
      '    total = 0',
      '    i = 1',
      '    while i < n:',
      '        total += i',
      '        i += 1',
      '    return total',
    ],
    bug: 3,
    fix: '    while i <= n:',
    why: 'i < n stops before adding n itself.',
    check: 'assert sum_to(4) == 10',
  },
  {
    id: 'sort',
    level: 2,
    kind: 'logic',
    goal: 'Return the names in A–Z order.',
    code: [
      'def sorted_names(names):',
      '    names = names.sort()',
      '    return names',
      '',
      'roster = ["Zoe", "Al", "Mo"]',
      'print(sorted_names(roster))',
    ],
    bug: 1,
    fix: '    names = sorted(names)',
    why: '.sort() sorts in place and returns None. sorted() returns the new list.',
    check: 'assert sorted_names(["b", "a"]) == ["a", "b"]',
  },
  {
    id: 'word-count',
    level: 2,
    kind: 'logic',
    goal: 'Count how many times each word appears.',
    code: [
      'def word_counts(words):',
      '    counts = {}',
      '    for w in words:',
      '        if w in counts:',
      '            counts[w] += 1',
      '        else:',
      '            counts[w] = 0',
      '    return counts',
    ],
    bug: 6,
    fix: '            counts[w] = 1',
    why: 'The first time a word shows up, it has been seen once, not zero times.',
    check: 'assert word_counts(["a", "b", "a"]) == {"a": 2, "b": 1}',
  },
  {
    id: 'yes',
    level: 2,
    kind: 'compare',
    goal: 'Accept "yes" typed in any capitals.',
    code: [
      'def said_yes(answer):',
      '    answer = answer.strip()',
      '    if answer.lower() == "YES":',
      '        return True',
      '    return False',
      '',
      'print(said_yes(" Yes "))',
    ],
    bug: 2,
    fix: '    if answer.lower() == "yes":',
    why: '.lower() makes everything lowercase, so it can never equal "YES".',
    check: 'assert said_yes(" Yes ") and said_yes("YES") and not said_yes("no")',
  },
  {
    id: 'add-text',
    level: 2,
    kind: 'wrong-variable',
    goal: 'Add two numbers that were typed in as text.',
    code: [
      'def add_text(a, b):',
      '    x = int(a)',
      '    y = int(b)',
      '    total = a + y',
      '    return total',
      '',
      'print(add_text("2", "3"))',
    ],
    bug: 3,
    fix: '    total = x + y',
    why: 'a is still text. The converted number is x.',
    check: 'assert add_text("2", "3") == 5',
  },
  {
    id: 'odds',
    level: 2,
    kind: 'compare',
    goal: 'Keep only the odd numbers.',
    code: [
      'def odds(nums):',
      '    result = []',
      '    for n in nums:',
      '        if n % 2 == 0:',
      '            result.append(n)',
      '    return result',
    ],
    bug: 3,
    fix: '        if n % 2 == 1:',
    why: 'n % 2 == 0 picks the EVEN numbers. Odd numbers leave a remainder of 1.',
    check: 'assert odds([1, 2, 3, 4, 5]) == [1, 3, 5]',
  },
  {
    id: 'positive',
    level: 2,
    kind: 'off-by-one',
    goal: 'Check that every number in the list is positive.',
    code: [
      'def all_positive(nums):',
      '    for i in range(len(nums) - 1):',
      '        if nums[i] <= 0:',
      '            return False',
      '    return True',
      '',
      'print(all_positive([3, 5, -1]))',
    ],
    bug: 1,
    fix: '    for i in range(len(nums)):',
    why: 'range(len - 1) never checks the last number.',
    check: 'assert not all_positive([3, 5, -1]) and all_positive([1, 2])',
  },
  {
    id: 'ticket',
    level: 2,
    kind: 'logic',
    goal: 'Let you in with a ticket, unless you are banned.',
    code: [
      'def can_enter(has_ticket, banned):',
      '    if has_ticket and banned:',
      '        return True',
      '    return False',
      '',
      'print(can_enter(True, False))',
    ],
    bug: 1,
    fix: '    if has_ticket and not banned:',
    why: 'This only lets in banned people. It needs "and not banned".',
    check: 'assert can_enter(True, False) and not can_enter(True, True) and not can_enter(False, False)',
  },

  // ── Level 3 ──────────────────────────────────────────────
  {
    id: 'contains',
    level: 3,
    kind: 'indentation',
    goal: 'Say whether a list contains a target.',
    code: [
      'def contains(items, target):',
      '    for item in items:',
      '        if item == target:',
      '            return True',
      '        return False',
      '',
      'print(contains([1, 2, 3], 3))',
    ],
    bug: 4,
    fix: '    return False',
    why: 'return False is inside the loop, so it gives up after checking only the first item.',
    check: 'assert contains([1, 2, 3], 3) and not contains([1, 2], 5)',
  },
  {
    id: 'factorial',
    level: 3,
    kind: 'logic',
    goal: 'Work out a factorial: 5! = 5×4×3×2×1 = 120.',
    code: ['def factorial(n):', '    if n == 0:', '        return 0', '    return n * factorial(n - 1)', '', 'print(factorial(5))'],
    bug: 2,
    fix: '        return 1',
    why: 'The base case returns 0, and anything times 0 is 0. 0! is 1.',
    check: 'assert factorial(5) == 120 and factorial(0) == 1',
  },
  {
    id: 'shout',
    level: 3,
    kind: 'logic',
    goal: 'Turn a name into a SHOUT, like "ANA!".',
    code: [
      'def shout(name):',
      '    name = name.strip()',
      '    name.upper()',
      '    return name + "!"',
      '',
      'print(shout(" ana "))',
    ],
    bug: 2,
    fix: '    name = name.upper()',
    why: 'Strings never change in place. .upper() returns a new string, which must be saved.',
    check: 'assert shout(" ana ") == "ANA!"',
  },
  {
    id: 'first-negative',
    level: 3,
    kind: 'wrong-variable',
    goal: 'Find the POSITION of the first negative number.',
    code: [
      'def first_negative(nums):',
      '    for i in range(len(nums)):',
      '        if nums[i] < 0:',
      '            return nums[i]',
      '    return -1',
      '',
      'print(first_negative([4, 7, -2, 5]))',
    ],
    bug: 3,
    fix: '            return i',
    why: 'nums[i] is the number itself (-2). The position is i (2).',
    check: 'assert first_negative([4, 7, -2, 5]) == 2 and first_negative([1]) == -1',
  },
  {
    id: 'swap',
    level: 3,
    kind: 'wrong-variable',
    goal: 'Swap the first and last items.',
    code: [
      'def swap_ends(items):',
      '    first = items[0]',
      '    items[0] = items[-1]',
      '    items[-1] = items[0]',
      '    return items',
      '',
      'print(swap_ends([1, 2, 3]))',
    ],
    bug: 3,
    fix: '    items[-1] = first',
    why: 'items[0] was already overwritten. The saved copy in first holds the old value.',
    check: 'assert swap_ends([1, 2, 3]) == [3, 2, 1]',
  },
  {
    id: 'mean',
    level: 3,
    kind: 'wrong-variable',
    goal: 'Average the numbers in a list.',
    code: [
      'def mean(nums):',
      '    total = 0',
      '    for n in nums:',
      '        total += n',
      '    return total / len(total)',
      '',
      'print(mean([2, 4, 6]))',
    ],
    bug: 4,
    fix: '    return total / len(nums)',
    why: 'total is a number and has no length. Divide by how many numbers there are: len(nums).',
    check: 'assert mean([2, 4, 6]) == 4',
  },
  {
    id: 'pairs',
    level: 3,
    kind: 'off-by-one',
    goal: 'Count the pairs of different items that add up to 10.',
    code: [
      'def pairs_to_ten(nums):',
      '    count = 0',
      '    for i in range(len(nums)):',
      '        for j in range(i, len(nums)):',
      '            if nums[i] + nums[j] == 10:',
      '                count += 1',
      '    return count',
    ],
    bug: 3,
    fix: '        for j in range(i + 1, len(nums)):',
    why: 'Starting j at i pairs each item with itself, so a 5 counts as 5 + 5.',
    check: 'assert pairs_to_ten([5, 5, 3, 7]) == 2',
  },
  {
    id: 'reverse',
    level: 3,
    kind: 'logic',
    goal: 'Reverse a word.',
    code: ['def reverse(word):', '    out = ""', '    for ch in word:', '        out = out + ch', '    return out', '', 'print(reverse("python"))'],
    bug: 3,
    fix: '        out = ch + out',
    why: 'Adding each letter to the end rebuilds the word unchanged. Each new letter must go in front.',
    check: 'assert reverse("abc") == "cba"',
  },
  {
    id: 'smallest',
    level: 3,
    kind: 'logic',
    goal: 'Find the smallest number in a list.',
    code: [
      'def smallest(nums):',
      '    best = 0',
      '    for n in nums:',
      '        if n < best:',
      '            best = n',
      '    return best',
      '',
      'print(smallest([7, 3, 9]))',
    ],
    bug: 1,
    fix: '    best = nums[0]',
    why: 'Starting at 0 means no positive number is ever "smaller". Start with a real item.',
    check: 'assert smallest([7, 3, 9]) == 3 and smallest([-2, 5]) == -2',
  },
  {
    id: 'leap',
    level: 3,
    kind: 'logic',
    goal: 'Leap year: divisible by 4, except centuries, unless divisible by 400.',
    code: [
      'def is_leap(year):',
      '    if year % 400 == 0:',
      '        return True',
      '    if year % 100 == 0:',
      '        return True',
      '    return year % 4 == 0',
    ],
    bug: 4,
    fix: '        return False',
    why: 'Centuries like 1900 are NOT leap years (unless divisible by 400).',
    check: 'assert is_leap(2000) and not is_leap(1900) and is_leap(2024) and not is_leap(2023)',
  },
];
```

- [ ] **Step 4: Add the checker script**

Create `tools/check-snippets.mjs` (full file):

```js
// Proves every Bug Hunt snippet is honest: with the fix its check passes, with the bug it fails.
// Run: npm run check:snippets   (needs python3; Node strips the TypeScript types itself)
import { spawnSync } from 'node:child_process';
import { SNIPPETS } from '../src/games/bughunt/snippets.ts';

// print() output is swallowed so the checks run quietly.
const PRELUDE = 'import builtins\nbuiltins.print = lambda *a, **k: None\n';

function passes(lines, check) {
  const program = PRELUDE + lines.join('\n') + '\n' + check + '\n';
  return spawnSync('python3', ['-c', program], { encoding: 'utf8' }).status === 0;
}

let bad = 0;
for (const s of SNIPPETS) {
  const fixed = s.code.map((line, i) => (i === s.bug ? s.fix : line));
  const problems = [];
  if (!passes(fixed, s.check)) problems.push('fixed code fails its check');
  if (passes(s.code, s.check)) problems.push('buggy code passes its check');
  if (problems.length) {
    bad++;
    console.log(`✖ ${s.id}: ${problems.join('; ')}`);
  }
}
console.log(bad ? `${bad} of ${SNIPPETS.length} snippets are wrong` : `all ${SNIPPETS.length} snippets check out`);
process.exit(bad ? 1 : 0);
```

`package.json`, apply this change:

```diff
@@ -10,7 +10,8 @@
     "typecheck": "tsc",
     "test": "vitest run",
     "test:watch": "vitest",
-    "e2e": "playwright test"
+    "e2e": "playwright test",
+    "check:snippets": "node tools/check-snippets.mjs"
   },
   "dependencies": {
     "@fontsource/audiowide": "5.3.0",
```

- [ ] **Step 5: Run the tests and the checker**

Run: `npx vitest run tests/unit/bughunt-snippets.test.ts && npm run check:snippets && npx tsc --noEmit`
Expected: the unit test passes; the checker prints `all 41 snippets check out` and exits 0; no type errors. The `.mjs` file is outside `tsconfig`'s `include`, so tsc ignores it. If the checker reports a snippet, a line was mistyped. Compare it with the plan rather than changing the check.

- [ ] **Step 6: Commit**

```bash
git add src/games/bughunt/snippets.ts tools/check-snippets.mjs package.json tests/unit/bughunt-snippets.test.ts
git commit -m "feat(bughunt): 41-snippet bank with a python3 honesty checker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bug Hunt highlighter and game logic

`highlight(line)` is a small regex tokenizer. Rules are tried in order (whitespace, comment, string, number, name, operator), so comments and strings stay whole. An unclosed string runs to the end of the line. Names are then reclassified as keywords or builtins. Any character no rule recognises becomes a one-character `op` token, so the joined token texts always equal the input. The UI renders each token as a `span` with `textContent`.

`logic.ts` deals the deck: 5 level-1 snippets first, then the other level-1 and level-2 snippets shuffled together, then the level-3 snippets shuffled. The timer depends on the level and shrinks with each right answer. Points are `100 × level × multiplier + round(secondsLeft × 10)`. Three strikes end the run. Clearing the whole deck adds `DECK_BONUS`.

**Files:**
- Create: `src/games/bughunt/highlight.ts`, `src/games/bughunt/logic.ts`
- Test: `tests/unit/bughunt-highlight.test.ts`, `tests/unit/bughunt-logic.test.ts`

**Interfaces:**
- Consumes: Task 3's `Snippet` and `SNIPPETS`; `Rng` and `shuffle` from `src/core/random.ts`.
- Produces (used by Task 5): `TokenKind = 'kw'|'builtin'|'str'|'num'|'com'|'op'|'name'|'ws'`, `Token {kind, text}`, `highlight(line): Token[]`; `STRIKES`, `multiplier(streak)`, `timeLimit(level, correct)`, `RunState`, `PickResult {right, snippet, points, bonus, over}`, `createRun(snippets, rng?)`, `current(state): Snippet | null`, `pick(state, line: number | null, secondsLeft): PickResult | null`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/bughunt-highlight.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { highlight } from '../../src/games/bughunt/highlight';
import { SNIPPETS } from '../../src/games/bughunt/snippets';

const kinds = (line: string) => highlight(line).filter((t) => t.kind !== 'ws').map((t) => [t.kind, t.text]);

describe('bug hunt highlighter', () => {
  it('colours keywords, builtins, names, numbers and operators', () => {
    expect(kinds('def area(w, h):')).toEqual([
      ['kw', 'def'], ['name', 'area'], ['op', '('], ['name', 'w'], ['op', ','], ['name', 'h'], ['op', ')'], ['op', ':'],
    ]);
    expect(kinds('if len(x) >= 10.5:')).toEqual([
      ['kw', 'if'], ['builtin', 'len'], ['op', '('], ['name', 'x'], ['op', ')'], ['op', '>='], ['num', '10.5'], ['op', ':'],
    ]);
  });

  it('keeps strings and comments whole', () => {
    expect(kinds('print("a # b")  # say it')).toEqual([
      ['builtin', 'print'], ['op', '('], ['str', '"a # b"'], ['op', ')'], ['com', '# say it'],
    ]);
    expect(kinds("x = 'it\\'s'")).toEqual([['name', 'x'], ['op', '='], ['str', "'it\\'s'"]]);
  });

  it('copes with an unclosed string (a syntax-bug snippet)', () => {
    expect(kinds('print("hi)')).toEqual([['builtin', 'print'], ['op', '('], ['str', '"hi)']]);
  });

  it('round-trips every line of every snippet', () => {
    for (const s of SNIPPETS) {
      for (const line of [...s.code, s.fix]) {
        expect(highlight(line).map((t) => t.text).join('')).toBe(line);
      }
    }
  });
});
```

Create `tests/unit/bughunt-logic.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { buildDeck, createRun, current, DECK_BONUS, multiplier, pick, timeLimit } from '../../src/games/bughunt/logic';
import { SNIPPETS, type Snippet } from '../../src/games/bughunt/snippets';

const snip = (id: string, level: 1 | 2 | 3 = 1, bug = 2): Snippet => ({
  id, level, kind: 'logic', goal: 'g', code: ['a', 'b', 'c', 'd', 'e', 'f'], bug, fix: 'x', why: 'w', check: 'c',
});

describe('bug hunt logic', () => {
  it('multiplier grows every 3 in a row and caps at 5', () => {
    expect([0, 2, 3, 6, 12, 30].map(multiplier)).toEqual([1, 1, 2, 3, 5, 5]);
  });

  it('time limit depends on level and shrinks to a 10 s floor', () => {
    expect(timeLimit(1, 0)).toBe(20);
    expect(timeLimit(2, 0)).toBe(25);
    expect(timeLimit(3, 0)).toBe(30);
    expect(timeLimit(1, 4)).toBe(18);
    expect(timeLimit(1, 100)).toBe(10);
    expect(timeLimit(3, 100)).toBe(10);
  });

  it('deck uses every snippet once, opens easy and saves level 3 for last', () => {
    const deck = buildDeck(SNIPPETS, mulberry32(1));
    expect(deck).toHaveLength(SNIPPETS.length);
    expect(new Set(deck.map((d) => d.id)).size).toBe(SNIPPETS.length);
    expect(deck.slice(0, 5).every((d) => d.level === 1)).toBe(true);
    const firstHard = deck.findIndex((d) => d.level === 3);
    expect(deck.slice(firstHard).every((d) => d.level === 3)).toBe(true);
  });

  it('scores a right pick by level, multiplier and time left', () => {
    const s = createRun([snip('a', 2), snip('b', 2)], mulberry32(2));
    const r = pick(s, current(s)!.bug, 7.04);
    expect(r).toMatchObject({ right: true, points: 270, bonus: 0, over: false });
    expect(r!.snippet.id).toBeTruthy();
    expect(s.score).toBe(270);
    expect(s.streak).toBe(1);
  });

  it('applies ×2 on the 4th right pick in a row', () => {
    const s = createRun(Array.from({ length: 6 }, (_, i) => snip(`i${i}`)), mulberry32(3));
    for (let i = 0; i < 3; i++) pick(s, current(s)!.bug, 0);
    expect(pick(s, current(s)!.bug, 0)!.points).toBe(200);
  });

  it('wrong picks and timeouts are strikes; three strikes ends the run', () => {
    const s = createRun(Array.from({ length: 6 }, (_, i) => snip(`i${i}`)), mulberry32(4));
    pick(s, 2, 3);
    expect(pick(s, 0, 3)).toMatchObject({ right: false, points: 0, over: false });
    expect(s.streak).toBe(0);
    expect(pick(s, null, 0)).toMatchObject({ right: false, over: false });
    expect(pick(s, 5, 3)).toMatchObject({ over: true });
    expect(current(s)).toBeNull();
    expect(pick(s, 2, 3)).toBeNull();
  });

  it('clearing the deck adds the bonus once', () => {
    const s = createRun([snip('a'), snip('b')], mulberry32(5));
    pick(s, 2, 0);
    const last = pick(s, 2, 0)!;
    expect(last).toMatchObject({ bonus: DECK_BONUS, over: true });
    expect(s.score).toBe(200 + DECK_BONUS);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/unit/bughunt-highlight.test.ts tests/unit/bughunt-logic.test.ts`
Expected: FAIL because the modules can't be resolved.

- [ ] **Step 3: Implement the highlighter**

Create `src/games/bughunt/highlight.ts` (full file):

```ts
export type TokenKind = 'kw' | 'builtin' | 'str' | 'num' | 'com' | 'op' | 'name' | 'ws';

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'and', 'as', 'break', 'continue', 'def', 'elif', 'else', 'False', 'for', 'if', 'import',
  'in', 'is', 'None', 'not', 'or', 'pass', 'return', 'True', 'while',
]);
const BUILTINS = new Set(['int', 'len', 'list', 'print', 'range', 'sorted', 'str', 'sum', 'max', 'min']);

// Order matters: comments and strings first so their contents are never split up.
const RULES: [TokenKind, RegExp][] = [
  ['ws', /^\s+/],
  ['com', /^#.*/],
  ['str', /^"(?:[^"\\]|\\.)*"?|^'(?:[^'\\]|\\.)*'?/],
  ['num', /^\d+(?:\.\d+)?/],
  ['name', /^[A-Za-z_]\w*/],
  ['op', /^(?:\/\/|\*\*|[=!<>+\-*/%]=?|[()[\]{}:,.])/],
];

/** Splits one line of Python into coloured tokens. Joining the texts always gives back the line. */
export function highlight(line: string): Token[] {
  const out: Token[] = [];
  let rest = line;
  while (rest.length > 0) {
    let kind: TokenKind = 'op';
    let text = rest[0]; // anything unrecognised becomes a one-character token
    for (const [k, re] of RULES) {
      const m = re.exec(rest);
      if (m) {
        kind = k;
        text = m[0];
        break;
      }
    }
    if (kind === 'name') kind = KEYWORDS.has(text) ? 'kw' : BUILTINS.has(text) ? 'builtin' : 'name';
    out.push({ kind, text });
    rest = rest.slice(text.length);
  }
  return out;
}
```

- [ ] **Step 4: Implement the logic**

Create `src/games/bughunt/logic.ts` (full file):

```ts
import { shuffle, type Rng } from '../../core/random';
import type { Snippet } from './snippets';

export const STRIKES = 3;
/** Seconds for a snippet before any right answers, by level. Longer code gets longer. */
export const LEVEL_TIME: Record<Snippet['level'], number> = { 1: 20, 2: 25, 3: 30 };
export const MIN_TIME = 10;
export const TIME_STEP = 0.5; // seconds removed per right answer
export const DECK_BONUS = 2000;

/** Combo multiplier from the streak *before* this answer: ×1, then +1 every 3 in a row, max ×5. */
export function multiplier(streak: number): number {
  return Math.min(5, 1 + Math.floor(streak / 3));
}

/** Seconds allowed for a snippet of `level` after `correct` right answers. */
export function timeLimit(level: Snippet['level'], correct: number): number {
  return Math.max(MIN_TIME, LEVEL_TIME[level] - TIME_STEP * correct);
}

/** 5 easy snippets, then the other easy and medium ones mixed, then the hard ones. */
export function buildDeck(snippets: readonly Snippet[], rng: Rng = Math.random): Snippet[] {
  const l1 = shuffle(snippets.filter((s) => s.level === 1), rng);
  const l2 = snippets.filter((s) => s.level === 2);
  const l3 = snippets.filter((s) => s.level === 3);
  return [...l1.slice(0, 5), ...shuffle([...l1.slice(5), ...l2], rng), ...shuffle(l3, rng)];
}

export interface RunState {
  deck: Snippet[];
  index: number;
  score: number;
  streak: number;
  strikes: number;
  correct: number;
  over: boolean;
}

export interface PickResult {
  right: boolean;
  /** The snippet that was judged, so the UI can show its fix after the run moves on. */
  snippet: Snippet;
  points: number;
  /** DECK_BONUS when this answer finished the deck, else 0. */
  bonus: number;
  over: boolean;
}

export function createRun(snippets: readonly Snippet[], rng: Rng = Math.random): RunState {
  return { deck: buildDeck(snippets, rng), index: 0, score: 0, streak: 0, strikes: 0, correct: 0, over: false };
}

export function current(s: RunState): Snippet | null {
  return s.over ? null : (s.deck[s.index] ?? null);
}

/**
 * Applies the player's pick (a line index) for the current snippet. `null` means the timer ran out,
 * which counts as a strike. Moves on to the next snippet. Returns null when the run is already over.
 */
export function pick(s: RunState, line: number | null, secondsLeft: number): PickResult | null {
  const snippet = current(s);
  if (!snippet) return null;
  const right = line === snippet.bug;
  let points = 0;
  if (right) {
    points = 100 * snippet.level * multiplier(s.streak) + Math.round(Math.max(0, secondsLeft) * 10);
    s.streak++;
    s.correct++;
  } else {
    s.streak = 0;
    s.strikes++;
  }
  s.index++;
  let bonus = 0;
  if (s.strikes >= STRIKES) s.over = true;
  else if (s.index >= s.deck.length) {
    s.over = true;
    bonus = DECK_BONUS;
  }
  s.score += points + bonus;
  return { right, snippet, points, bonus, over: s.over };
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: 22 files, 204 tests pass; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/games/bughunt/highlight.ts src/games/bughunt/logic.ts tests/unit/bughunt-highlight.test.ts tests/unit/bughunt-logic.test.ts
git commit -m "feat(bughunt): Python highlighter, deck ramp and scoring" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bug Hunt UI, leak loop and full verification

The goal line sits on top. Below it, a `main.py` panel shows the numbered, highlighted code, and a side panel holds the timer bar, verdict, bug-kind tag and explanation. ↑/↓ move the yellow cursor, and Enter or a click squashes that line. After each pick:
- a wrong line is marked `.is-miss`;
- the bug line is struck through (`.is-bug`);
- the fix appears as a new green `.bh-line.is-fix` row right below it;
- the verdict reads `SQUASHED! +N`, `MISSED — LINE n` or `TIME'S UP — LINE n`.

The next snippet comes after 1.8 s (right) or 3.5 s (wrong, so the explanation can be read). The leak loop now cycles all five playable games.

**Files:**
- Create: `src/games/bughunt/index.ts`, `src/games/bughunt/bughunt.css`
- Modify: `src/games/registry.ts` (the `bughunt` cabinet), `src/main.ts` (CSS import), `tests/e2e/games.spec.ts`

**Interfaces:**
- Consumes: Task 3's `SNIPPETS`/`KIND_LABEL`; Task 4's `highlight` and `logic.ts` API; `el()`, `createHud()`; the e2e helpers `boot`, `trackErrors` and `launch`.
- Produces: `createGame(): GameModule` from `src/games/bughunt/index.ts`. The DOM hooks are `.bh-panel[data-id]`, `.bh-line[data-line]`, `.bh-line.is-cursor|is-miss|is-bug|is-fix`, `.bh-verdict`, `.bh-tag`, `.bh-why`, and the HUD keys `score` and `bugs`.

- [ ] **Step 1: Write the failing e2e test and extend the leak loop**

`tests/e2e/games.spec.ts`, apply this change:

```diff
@@ -1,4 +1,5 @@
 import { expect, test, type Page } from '@playwright/test';
+import { SNIPPETS } from '../../src/games/bughunt/snippets';
 import { ITEMS } from '../../src/games/phish/items';
 import { evaluate, type Action, type Proto, type Rule } from '../../src/games/port/logic';
 import { boot, trackErrors } from './helpers';
@@ -169,7 +170,54 @@ test('port: a full shift brings a new rulebook', async ({ page }) => {
   expect(errors).toEqual([]);
 });
 
-test('20 launch/exit cycles across the three games leave nothing behind', async ({ page }) => {
+/** The current Bug Hunt snippet, looked up from the panel's data-id. */
+async function bugSnippet(page: Page) {
+  const id = await page.locator('.bh-panel').getAttribute('data-id');
+  return SNIPPETS.find((s) => s.id === id)!;
+}
+
+test('bughunt: right picks score, misses show the fix, three strikes end the run', async ({ page }) => {
+  test.setTimeout(60_000);
+  const errors = trackErrors(page);
+  await boot(page);
+  await launch(page, 'bughunt');
+  const panel = page.locator('.bh-panel');
+  await expect(panel).toHaveClass(/is-in/);
+
+  // Keyboard: walk the cursor down to the buggy line and squash it.
+  const first = await bugSnippet(page);
+  await expect(page.locator('.bh-line[data-line="0"]')).toHaveClass(/is-cursor/);
+  for (let i = 0; i < first.bug; i++) await page.keyboard.press('ArrowDown');
+  await expect(page.locator(`.bh-line[data-line="${first.bug}"]`)).toHaveClass(/is-cursor/);
+  await page.keyboard.press('Enter');
+  await expect(page.locator('.bh-verdict')).toContainText('SQUASHED');
+  await expect(page.locator('.bh-line.is-fix')).toHaveCount(1);
+  await expect(page.locator('.bh-line.is-fix')).toHaveText(new RegExp(first.fix.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
+  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');
+  await expect(page.locator('[data-hud="bugs"]')).toHaveText('1');
+
+  // Mouse: clicking the buggy line counts too.
+  await expect(panel).toHaveClass(/is-in/, { timeout: 5000 });
+  const second = await bugSnippet(page);
+  await page.locator(`.bh-line[data-line="${second.bug}"]`).click();
+  await expect(page.locator('.bh-verdict')).toContainText('SQUASHED');
+
+  for (let i = 0; i < 3; i++) {
+    await expect(panel).toHaveClass(/is-in/, { timeout: 5000 }); // next snippet is up
+    const s = await bugSnippet(page);
+    const wrong = (s.bug + 1) % s.code.length;
+    await page.locator(`.bh-line[data-line="${wrong}"]`).click();
+    await expect(page.locator('.bh-verdict')).toContainText(`MISSED — LINE ${s.bug + 1}`);
+    await expect(page.locator('.bh-line.is-miss')).toHaveCount(1);
+    await expect(page.locator(`.bh-line[data-line="${s.bug}"]`)).toHaveClass(/is-bug/);
+    await expect(page.locator('.bh-tag')).not.toBeEmpty();
+    await expect(page.locator('.bh-why')).toHaveText(s.why);
+  }
+  await expect(page.locator('.game-over .final-score')).toBeVisible({ timeout: 6000 });
+  expect(errors).toEqual([]);
+});
+
+test('20 launch/exit cycles across the five games leave nothing behind', async ({ page }) => {
   test.setTimeout(240_000);
   const errors = trackErrors(page);
   // Records every WebGL/WebGL2 context any canvas hands out, so a regression in invaders'
@@ -186,7 +234,7 @@ test('20 launch/exit cycles across the three games leave nothing behind', async
     } as typeof HTMLCanvasElement.prototype.getContext;
   });
   await boot(page, '?selftest');
-  const games = ['phish', 'password', 'invaders'];
+  const games = ['phish', 'password', 'invaders', 'port', 'bughunt'];
   const cycle = async (id: string) => {
     await launch(page, id);
     await expect(page.locator('.game-root')).toHaveCount(1);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/games.spec.ts -g "bughunt"`
Expected: FAIL. The cabinet has no `load`, so `.bh-panel` is never found.

- [ ] **Step 3: Implement the UI**

Create `src/games/bughunt/index.ts` (full file):

```ts
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { highlight } from './highlight';
import { createRun, current, multiplier, pick, STRIKES, timeLimit } from './logic';
import { KIND_LABEL, SNIPPETS } from './snippets';

const RIGHT_MS = 1800; // the fix stays on screen this long after a right pick
const WRONG_MS = 3500; // longer after a mistake so the explanation can be read

/** One line of code as coloured token spans. textContent only — never innerHTML. */
function codeSpan(line: string): HTMLElement {
  return el('span.bh-code', {}, ...highlight(line).map((t) => el(`span.bh-tok-${t.kind}`, {}, t.text)));
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const run = createRun(SNIPPETS);
      const hud = createHud([['score', 'SCORE'], ['bugs', 'BUGS'], ['combo', 'COMBO'], ['strikes', 'STRIKES']]);
      const goal = el('div.bh-goal-text');
      const lines = el('div.bh-lines');
      const panel = el('div.bh-panel', {}, el('div.bh-panel-title', {}, 'main.py'), lines);
      const bar = el('div.bh-timer-fill');
      const verdict = el('div.bh-verdict');
      const tag = el('div.bh-tag');
      const why = el('div.bh-why');
      root = el(
        'div.bughunt',
        {},
        hud.el,
        el('div.bh-goal', {}, el('span.bh-goal-label', {}, 'GOAL'), goal),
        panel,
        el('div.bh-side', {}, el('div.bh-timer', {}, bar), verdict, tag, why),
        el('div.bh-keys', {}, '↑ ↓ pick a line · ENTER or click to squash'),
      );
      container.append(root);

      let cursor = 0;
      let deadline = 0;
      let limit = 0;
      let busy = true;

      const updateHud = () => {
        hud.set('score', run.score.toLocaleString('en-US'));
        hud.set('bugs', String(run.correct));
        hud.set('combo', `×${multiplier(run.streak)}`);
        hud.set('strikes', '✖'.repeat(run.strikes) + '·'.repeat(STRIKES - run.strikes));
      };

      const moveCursor = (to: number) => {
        lines.children[cursor]?.classList.remove('is-cursor');
        cursor = Math.max(0, Math.min(lines.children.length - 1, to));
        lines.children[cursor]?.classList.add('is-cursor');
      };

      const showSnippet = () => {
        const s = current(run)!;
        panel.dataset.id = s.id;
        panel.className = 'bh-panel is-in';
        goal.textContent = s.goal;
        lines.replaceChildren(
          ...s.code.map((line, i) => {
            const row = el('div.bh-line', { 'data-line': i }, el('span.bh-n', {}, String(i + 1)), codeSpan(line));
            row.addEventListener('click', () => {
              moveCursor(i);
              squash(i);
            });
            return row;
          }),
        );
        cursor = 0;
        moveCursor(0);
        verdict.textContent = '';
        verdict.className = 'bh-verdict';
        tag.textContent = '';
        tag.className = 'bh-tag';
        why.textContent = '';
        limit = timeLimit(s.level, run.correct) * 1000;
        deadline = performance.now() + limit;
        busy = false;
      };

      const squash = (line: number | null) => {
        if (busy) return;
        busy = true;
        const secondsLeft = Math.max(0, deadline - performance.now()) / 1000;
        const result = pick(run, line, secondsLeft)!;
        const s = result.snippet;
        updateHud();
        lines.children[cursor]?.classList.remove('is-cursor');
        if (line !== null && !result.right) lines.children[line]?.classList.add('is-miss');
        const bugRow = lines.children[s.bug];
        bugRow?.classList.add('is-bug');
        bugRow?.after(el('div.bh-line.is-fix', {}, el('span.bh-n', {}, '✓'), codeSpan(s.fix)));
        verdict.textContent = result.right
          ? `SQUASHED! +${result.points.toLocaleString('en-US')}`
          : `${line === null ? "TIME'S UP" : 'MISSED'} — LINE ${s.bug + 1}`;
        verdict.className = `bh-verdict ${result.right ? 'is-right' : 'is-wrong'}`;
        panel.className = `bh-panel ${result.right ? 'is-right' : 'is-wrong'}`;
        tag.textContent = KIND_LABEL[s.kind];
        tag.className = 'bh-tag is-on';
        why.textContent = s.why;
        ctx.audio.sfx(result.right ? 'coin' : 'error');
        pause = setTimeout(() => {
          if (result.over) ctx.endRun(run.score);
          else showSnippet();
        }, result.right ? RIGHT_MS : WRONG_MS);
      };

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (busy) return;
        const left = deadline - performance.now();
        bar.style.transform = `scaleX(${Math.max(0, left / limit)})`;
        if (left <= 0) squash(null);
      };

      ctx.input.onKey((e) => {
        if (busy) return;
        if (e.code === 'ArrowUp') moveCursor(cursor - 1);
        else if (e.code === 'ArrowDown') moveCursor(cursor + 1);
        else if (e.code === 'Enter' && !e.repeat) squash(cursor);
      });

      updateHud();
      showSnippet();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimeout(pause);
      root?.remove(); // the line click listeners go with their elements
      root = null;
    },
  };
}
```

Create `src/games/bughunt/bughunt.css` (full file):

```css
.bughunt {
  position: absolute;
  inset: 0;
}
.bh-goal {
  position: absolute;
  top: 140px;
  left: 80px;
  right: 100px;
  display: flex;
  align-items: baseline;
  gap: 24px;
  font-size: 36px;
}
.bh-goal-label {
  font-family: var(--f-display);
  font-size: 30px;
  letter-spacing: 0.12em;
  color: var(--c-pink);
  text-shadow: 0 0 12px var(--c-pink);
}
.bh-goal-text {
  color: var(--c-ink);
}
.bh-panel {
  position: absolute;
  top: 220px;
  left: 80px;
  width: 1180px;
  padding: 18px 28px 24px;
  border-radius: 18px;
  background: rgba(18, 0, 38, 0.94);
  border: 3px solid var(--c-cyan);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.45), inset 0 0 24px rgba(0, 240, 255, 0.12);
}
.bh-panel.is-in { animation: bh-panel-in 0.3s ease-out; }
@keyframes bh-panel-in {
  from { opacity: 0; transform: translateY(30px); }
}
.bh-panel.is-right {
  border-color: var(--c-ok);
  box-shadow: 0 0 40px var(--c-ok);
}
.bh-panel.is-wrong {
  border-color: var(--c-danger);
  box-shadow: 0 0 40px var(--c-danger);
  animation: bh-shake 0.3s;
}
@keyframes bh-shake {
  25% { transform: translateX(-14px); }
  75% { transform: translateX(14px); }
}
.bh-panel-title {
  margin-bottom: 10px;
  font-family: var(--f-mono);
  font-size: 22px;
  letter-spacing: 0.2em;
  color: var(--c-cyan);
}
.bh-line {
  display: flex;
  align-items: center;
  height: 50px;
  border-radius: 8px;
  border: 2px solid transparent;
  font-family: var(--f-mono);
  font-size: 30px;
  white-space: pre;
  cursor: pointer;
}
.bh-n {
  width: 60px;
  flex: none;
  padding-right: 18px;
  text-align: right;
  color: var(--c-grey);
  opacity: 0.6;
}
.bh-line.is-cursor {
  border-color: var(--c-yellow);
  background: rgba(255, 226, 89, 0.12);
  box-shadow: 0 0 18px rgba(255, 226, 89, 0.5);
}
.bh-line.is-cursor .bh-n { color: var(--c-yellow); opacity: 1; }
.bh-line.is-miss {
  border-color: var(--c-danger);
  border-style: dashed;
}
.bh-line.is-bug {
  background: rgba(255, 59, 92, 0.18);
}
.bh-line.is-bug .bh-code {
  text-decoration: line-through;
  text-decoration-color: var(--c-danger);
  text-decoration-thickness: 3px;
  opacity: 0.7;
}
.bh-line.is-fix {
  background: rgba(61, 255, 154, 0.15);
  border-color: var(--c-ok);
  animation: bh-fix-in 0.3s ease-out;
}
.bh-line.is-fix .bh-n { color: var(--c-ok); opacity: 1; }
@keyframes bh-fix-in {
  from { opacity: 0; transform: translateX(-30px); }
}
.bh-tok-kw { color: var(--c-pink); font-weight: 700; }
.bh-tok-builtin { color: var(--c-cyan); }
.bh-tok-str { color: var(--c-yellow); }
.bh-tok-num { color: #c49bff; }
.bh-tok-com { color: var(--c-grey); font-style: italic; }
.bh-tok-op { color: var(--c-ink-dim); }
.bh-tok-name { color: var(--c-ink); }
.bh-side {
  position: absolute;
  top: 220px;
  left: 1300px;
  width: 540px;
  display: flex;
  flex-direction: column;
  gap: 26px;
}
.bh-timer {
  height: 14px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}
.bh-timer-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--c-pink), var(--c-yellow));
  box-shadow: 0 0 12px var(--c-yellow);
  transform-origin: left;
}
.bh-verdict {
  min-height: 56px;
  font-family: var(--f-display);
  font-size: 42px;
  letter-spacing: 0.06em;
}
.bh-verdict.is-right { color: var(--c-ok); text-shadow: 0 0 16px var(--c-ok); }
.bh-verdict.is-wrong { color: var(--c-danger); text-shadow: 0 0 16px var(--c-danger); }
.bh-tag {
  align-self: flex-start;
  padding: 6px 18px;
  border-radius: 10px;
  border: 2px solid var(--c-pink);
  font-family: var(--f-mono);
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--c-pink);
  opacity: 0;
}
.bh-tag.is-on { opacity: 1; }
.bh-why {
  font-size: 32px;
  line-height: 1.35;
  color: var(--c-yellow);
}
.bh-keys {
  position: absolute;
  bottom: 48px;
  left: 80px;
  font-family: var(--f-mono);
  font-size: 28px;
  color: var(--c-ink-dim);
}
```

`src/games/registry.ts`, apply this change:

```diff
@@ -61,6 +61,7 @@ export const CABINETS: Cabinet[] = [
     tagline: 'Every Python snippet hides one bug. Find the broken line before time runs out.',
     category: 'learn',
     controls: [['↑ ↓', 'Pick line'], ['ENTER', 'Squash']],
+    load: () => import('./bughunt/index').then((m) => m.createGame()),
   },
   {
     kind: 'link',
```

`src/main.ts`, apply this change:

```diff
@@ -11,6 +11,7 @@ import './games/phish/phish.css';
 import './games/password/password.css';
 import './games/invaders/invaders.css';
 import './games/port/port.css';
+import './games/bughunt/bughunt.css';
 
 import { createAudio } from './core/audio';
 import { watchFullscreen } from './core/fullscreen';
```

- [ ] **Step 4: Full verification**

Run each command and check the result:

```bash
npx tsc --noEmit          # no errors
npm test                  # 22 files, 204 tests pass
npm run build             # succeeds; port and bughunt are separate lazy chunks
npm run e2e               # 16 tests pass, including the five-game leak loop
npm run check:snippets    # all 41 snippets check out
```

If the leak loop fails, a game's `unmount()` is leaking a listener, a timer or a node. Fix the game, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/games/bughunt/index.ts src/games/bughunt/bughunt.css src/games/registry.ts src/main.ts tests/e2e/games.spec.ts
git commit -m "feat(bughunt): playable Bug Hunt; leak loop covers five games" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Manual look (controller, before release)**

Run `npm run dev` and play each game for about 30 seconds. Check:
- Port Guardian: the rulebook is readable, the deciding rule lights up and the WRONG explanation names it, and the SHIFT banner shows.
- Bug Hunt: the colours are readable, the cursor is visible, the bug line is struck through with the fix right below it, and the tag and explanation appear.
- Esc always returns to the hub.
