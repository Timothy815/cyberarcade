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
