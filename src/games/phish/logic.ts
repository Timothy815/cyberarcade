import { shuffle, type Rng } from '../../core/random';
import type { PhishItem } from './items';

export const STRIKES = 3;
export const START_TIME = 8; // seconds for the first card
export const MIN_TIME = 3;
export const TIME_STEP = 0.25; // seconds removed per correct answer
export const DECK_BONUS = 1000;

/** Combo multiplier from the streak *before* this answer: ×1, then +1 every 3 in a row, max ×5. */
export function multiplier(streak: number): number {
  return Math.min(5, 1 + Math.floor(streak / 3));
}

/** Seconds allowed for the next card after `correct` right answers. */
export function timeLimit(correct: number): number {
  return Math.max(MIN_TIME, START_TIME - TIME_STEP * correct);
}

/** 5 easy cards, then 10 easy/medium, then everything else. No level-3 card in the first 15. */
export function buildDeck(items: readonly PhishItem[], rng: Rng = Math.random): PhishItem[] {
  const l1 = shuffle(items.filter((i) => i.level === 1), rng);
  const l2 = items.filter((i) => i.level === 2);
  const l3 = items.filter((i) => i.level === 3);
  const opening = l1.slice(0, 5);
  const middle = shuffle([...l1.slice(5), ...l2], rng);
  return [...opening, ...middle.slice(0, 10), ...shuffle([...middle.slice(10), ...l3], rng)];
}

export interface RunState {
  deck: PhishItem[];
  index: number;
  score: number;
  streak: number;
  strikes: number;
  correct: number;
  over: boolean;
}

export interface AnswerResult {
  right: boolean;
  points: number;
  /** DECK_BONUS when this answer finished the deck, else 0. */
  bonus: number;
  over: boolean;
}

export function createRun(items: readonly PhishItem[], rng: Rng = Math.random): RunState {
  return { deck: buildDeck(items, rng), index: 0, score: 0, streak: 0, strikes: 0, correct: 0, over: false };
}

export function current(s: RunState): PhishItem | null {
  return s.over ? null : (s.deck[s.index] ?? null);
}

/**
 * Applies the player's verdict (true = "phish") for the current card. `null` means the timer ran out,
 * which counts as a strike. Moves on to the next card.
 */
export function answer(s: RunState, saidPhish: boolean | null, secondsLeft: number): AnswerResult {
  const item = current(s);
  if (!item) return { right: false, points: 0, bonus: 0, over: true };
  const right = saidPhish !== null && saidPhish === item.phish;
  let points = 0;
  if (right) {
    points = 100 * multiplier(s.streak) + Math.round(Math.max(0, secondsLeft) * 10);
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
  return { right, points, bonus, over: s.over };
}
