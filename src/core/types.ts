import type { Audio } from './audio';
import type { Input } from './input';

/**
 * A playable game. Metadata (title, controls...) lives in the registry, so the hub
 * never downloads game code. Each load() returns a fresh instance.
 */
export interface GameModule {
  mount(container: HTMLElement, ctx: GameContext): void | Promise<void>;
  /** Releases every listener, timer, canvas and audio node. Must be safe to call at any time, even mid-mount. */
  unmount(): void;
}

export interface GameContext {
  audio: Audio;
  /** Scoped to this run: every handler is removed automatically when the game ends. */
  input: Input;
  /** Ends the run and starts game over → initials → leaderboard. Only the first call counts. */
  endRun(score: number): void;
  /** Back to the hub without a score. */
  exit(): void;
}

export type Category = 'arcade' | 'learn' | 'classic';

interface CabinetBase {
  id: string;
  title: string;
  tagline: string;
  category: Category;
}

export interface GameCabinet extends CabinetBase {
  kind: 'game';
  /** [keys, action] pairs shown on the title card, e.g. ['← →', 'Move']. */
  controls: [string, string][];
  /** Missing while the game is still being built: the hub shows COMING SOON. */
  load?: () => Promise<GameModule>;
}

export interface LinkCabinet extends CabinetBase {
  kind: 'link';
  href: string;
  note: string;
}

export type Cabinet = GameCabinet | LinkCabinet;
