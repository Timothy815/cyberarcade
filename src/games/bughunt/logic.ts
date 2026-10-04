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
