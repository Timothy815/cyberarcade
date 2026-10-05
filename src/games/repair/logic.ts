// Router Repair's run rules: deck, clock, scoring and phases. Pure: no DOM, no timers.
import { shuffle, type Rng } from '../../core/random';
import type { Puzzle } from './puzzles';
import { runGrid, type RunResult } from './run';

export const START_TIME = 120;
export const CORRECT_BONUS = 8; // seconds added for a correct patch
export const WRONG_PENALTY = 10; // seconds removed for a wrong patch
export const RESTORE_BONUS = 10; // points per whole second left when the deck is cleared

export type Phase = 'pick' | 'play' | 'result' | 'over';
export type Ending = 'restored' | 'lost';

export interface Outcome {
  kind: 'correct' | 'wrong' | 'auto';
  points: number;
  choice: number;
  hint: string;
}

/** Each tier shuffled on its own; tiers stay in order 1, 2, 3. */
export function buildDeck(puzzles: readonly Puzzle[], rng: Rng = Math.random): Puzzle[] {
  return ([1, 2, 3] as const).flatMap((tier) => shuffle(puzzles.filter((p) => p.tier === tier), rng));
}

/** First-try points: 100 per tier, plus up to 100 for speed (5 lost per whole second of thinking). */
export function firstTryPoints(tier: number, pickSeconds: number): number {
  return 100 * tier + Math.max(0, 100 - 5 * Math.floor(pickSeconds));
}

export class RepairRun {
  readonly deck: Puzzle[];
  index = 0;
  time = START_TIME;
  score = 0;
  fixed = 0;
  phase: Phase = 'pick';
  ending: Ending | null = null;
  /** Options already tried and failed on the current puzzle. */
  readonly struck = new Set<number>();
  /** Seconds spent in `pick` on the current puzzle. */
  pickTime = 0;
  /** The option being played, or the answer during an auto-solve. */
  private playing: { choice: number; auto: boolean } | null = null;
  private last: Outcome | null = null;

  constructor(puzzles: readonly Puzzle[], rng: Rng = Math.random) {
    this.deck = buildDeck(puzzles, rng);
  }

  get puzzle(): Puzzle {
    return this.deck[this.index];
  }

  /** Advances the clock. It only runs in `pick`. */
  tick(dt: number): void {
    if (this.phase !== 'pick') return;
    this.pickTime += dt;
    this.time = Math.max(0, this.time - dt);
    if (this.time === 0) this.end('lost');
  }

  /** Tries option `i`. Returns the run to play back, or null when the choice is not allowed. */
  choose(i: number): RunResult | null {
    if (this.phase !== 'pick' || !Number.isInteger(i) || i < 0 || i > 2 || this.struck.has(i)) return null;
    this.phase = 'play';
    this.playing = { choice: i, auto: false };
    return runGrid(this.puzzle, i);
  }

  /** Playback finished: scores the patch and moves to `result`. */
  finishPlay(): Outcome | null {
    if (this.phase !== 'play' || !this.playing) return null;
    const { choice, auto } = this.playing;
    const p = this.puzzle;
    let outcome: Outcome;
    if (auto) outcome = { kind: 'auto', points: 0, choice, hint: p.hints[choice] };
    else if (choice === p.answer) {
      const points = this.struck.size === 0 ? firstTryPoints(p.tier, this.pickTime) : 25 * p.tier;
      this.score += points;
      this.time += CORRECT_BONUS;
      this.fixed++;
      outcome = { kind: 'correct', points, choice, hint: p.hints[choice] };
    } else {
      this.time = Math.max(0, this.time - WRONG_PENALTY);
      this.struck.add(choice);
      outcome = { kind: 'wrong', points: 0, choice, hint: p.hints[choice] };
    }
    this.phase = 'result';
    this.playing = null;
    this.last = outcome;
    return outcome;
  }

  /**
   * The verdict has been shown. Moves on: next puzzle, back to `pick`, an auto-solve, or `over`.
   * Returns the auto-solve run to play back when one starts, otherwise null.
   */
  finishResult(): RunResult | null {
    if (this.phase !== 'result' || !this.last) return null;
    const { kind } = this.last;
    this.last = null;
    if (kind === 'wrong') {
      if (this.time === 0) {
        this.end('lost');
        return null;
      }
      if (this.struck.size >= 2) {
        // Both wrong options used: show the fix, score nothing.
        this.phase = 'play';
        this.playing = { choice: this.puzzle.answer, auto: true };
        return runGrid(this.puzzle, this.puzzle.answer);
      }
      this.phase = 'pick';
      return null;
    }
    if (this.index + 1 >= this.deck.length) {
      this.score += RESTORE_BONUS * Math.floor(this.time);
      this.end('restored');
      return null;
    }
    this.index++;
    this.struck.clear();
    this.pickTime = 0;
    this.phase = 'pick';
    return null;
  }

  private end(ending: Ending): void {
    this.phase = 'over';
    this.ending = ending;
  }
}
