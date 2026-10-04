import type { Rng } from '../../core/random';

export const MISS_COST = 1;
export const SOLVE_COST = 2;
export const REWARD_TURNS = 2;
export const CHALLENGE_POINTS = 25;
export const ALL_CRACKED_BONUS = 1000;
/** Voluntary TAB/HACK challenges allowed per round. The automatic LAST CHANCE challenge never counts. */
export const HACKS_PER_ROUND = 2;

/** 'out' = no turns left and not cracked yet (the UI offers a LAST CHANCE challenge). */
export type RoundStatus = 'playing' | 'cracked' | 'out';

export interface RoundState {
  password: string;
  /** One flag per character of the password. Spaces start revealed. */
  revealed: boolean[];
  /** Every character tried so far, lowercased, in order. */
  tried: string[];
  turns: number;
  status: RoundStatus;
}

export type GuessResult = 'hit' | 'miss' | 'repeat' | 'invalid';

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function createRound(password: string, turns: number): RoundState {
  return { password, revealed: [...password].map((c) => c === ' '), tried: [], turns, status: 'playing' };
}

function settle(r: RoundState): void {
  if (r.revealed.every(Boolean)) r.status = 'cracked';
  else if (r.turns <= 0) {
    r.turns = 0;
    r.status = 'out';
  } else r.status = 'playing';
}

function revealAll(r: RoundState, ch: string): void {
  [...r.password].forEach((c, i) => {
    if (same(c, ch)) r.revealed[i] = true;
  });
}

/** One typed character. Letters match either case. A miss costs a turn; a hit or a repeat is free. */
export function guessChar(r: RoundState, ch: string): GuessResult {
  if (r.status !== 'playing' || ch.length !== 1 || ch === ' ') return 'invalid';
  const key = ch.toLowerCase();
  if (r.tried.includes(key)) return 'repeat';
  r.tried.push(key);
  const hit = [...r.password].some((c) => same(c, key));
  if (hit) revealAll(r, key);
  else r.turns -= MISS_COST;
  settle(r);
  return hit ? 'hit' : 'miss';
}

/** A whole-password guess: exact and case-sensitive. Wrong costs SOLVE_COST turns. */
export function solve(r: RoundState, guess: string): boolean {
  if (r.status !== 'playing') return false;
  if (guess === r.password) {
    r.revealed = r.revealed.map(() => true);
    r.status = 'cracked';
    return true;
  }
  r.turns -= SOLVE_COST;
  settle(r);
  return false;
}

export function addTurns(r: RoundState, n: number): void {
  if (r.status === 'cracked') return;
  r.turns += n;
  settle(r);
}

/** Reveals every occurrence of one random still-hidden character. Returns it, or null if none is hidden. */
export function revealRandom(r: RoundState, rng: Rng = Math.random): string | null {
  const hidden = [...r.password].filter((_, i) => !r.revealed[i]);
  if (hidden.length === 0) return null;
  const ch = hidden[Math.floor(rng() * hidden.length)];
  revealAll(r, ch);
  if (!r.tried.includes(ch.toLowerCase())) r.tried.push(ch.toLowerCase());
  settle(r);
  return ch;
}

/** The board as the player sees it: the character where revealed, '' where still hidden. */
export function board(r: RoundState): string[] {
  return [...r.password].map((c, i) => (r.revealed[i] ? c : ''));
}

/** Points for cracking round `index` (0-based) with `turnsLeft` turns to spare. */
export function crackPoints(index: number, turnsLeft: number): number {
  return 100 * (index + 1) + 50 * turnsLeft;
}
