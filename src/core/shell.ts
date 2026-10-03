import type { Audio } from './audio';
import { createIdleTimer } from './idle';
import { createScopedInput, type Input } from './input';
import type { Scores } from './scores';
import { createStage, type Stage } from './stage';
import { timing } from './theme';
import type { GameCabinet, GameModule } from './types';
import { gameOver, initialsEntry, leaderboard, loadingScreen, systemError, titleCard, type ScreenDeps } from './ui/screens';

export type ShellState = 'idle' | 'title' | 'loading' | 'playing' | 'results' | 'error';

export interface ShellOptions {
  /** Full-window layer the shell owns while a game is running. Hidden otherwise. */
  layer: HTMLElement;
  audio: Audio;
  input: Input;
  scores: Scores;
  /** Called after the shell has cleaned up and hidden its layer. */
  onExit: () => void;
}

export interface Shell {
  readonly state: ShellState;
  /** Runs title → play → results for one cabinet. Resolves once the player is back in the hub. */
  launch(cab: GameCabinet, skipTitle?: boolean): Promise<void>;
}

type RunOutcome = { kind: 'score'; score: number } | { kind: 'exit' } | { kind: 'crash'; error: unknown };

export function createShell(opts: ShellOptions): Shell {
  const { layer, audio, input, scores } = opts;
  let state: ShellState = 'idle';
  layer.hidden = true;

  /** Loads and runs one game until endRun / exit / Esc / idle / crash. Always tears the game down. */
  function play(cab: GameCabinet, ui: Stage): Promise<RunOutcome> {
    return new Promise<RunOutcome>((resolve) => {
      let finished = false;
      let game: GameModule | null = null;
      let root: Stage | null = null;
      const scoped = createScopedInput(input);
      const idle = createIdleTimer(timing.gameIdleMs, () => finish({ kind: 'exit' }));
      const hideLoading = loadingScreen(ui.el);

      const onError = (e: ErrorEvent) => finish({ kind: 'crash', error: e.error ?? e.message });
      const onRejection = (e: PromiseRejectionEvent) => finish({ kind: 'crash', error: e.reason });
      window.addEventListener('error', onError);
      window.addEventListener('unhandledrejection', onRejection);

      function finish(outcome: RunOutcome) {
        if (finished) return;
        finished = true;
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        hideLoading();
        idle.stop();
        scoped.dispose();
        try {
          game?.unmount();
        } catch (err) {
          console.error('[shell] unmount failed', err);
        }
        root?.dispose();
        if (outcome.kind === 'crash') console.error('[shell] game crashed', outcome.error);
        resolve(outcome);
      }

      state = 'loading';
      const load = cab.load ?? (() => Promise.reject(new Error(`${cab.id} has no load()`)));
      load()
        .then(async (mod) => {
          if (finished) return;
          game = mod;
          hideLoading();
          root = createStage(layer, 'game-root');
          layer.prepend(root.el);
          scoped.onAny(() => idle.reset());
          scoped.onKey((e) => {
            if (e.key === 'Escape') {
              audio.sfx('back');
              finish({ kind: 'exit' });
            }
          });
          state = 'playing';
          idle.start();
          await mod.mount(root.el, {
            audio,
            input: scoped,
            endRun: (score) => finish({ kind: 'score', score: Math.max(0, Math.floor(score)) }),
            exit: () => finish({ kind: 'exit' }),
          });
        })
        .catch((error) => finish({ kind: 'crash', error }));
    });
  }

  async function launch(cab: GameCabinet, skipTitle = false): Promise<void> {
    if (state !== 'idle') return;
    audio.stopMusic();
    layer.hidden = false;
    const ui = createStage(layer, 'shell-ui');
    const ac = new AbortController();
    const deps: ScreenDeps = { host: ui.el, input, audio, signal: ac.signal };

    try {
      if (!skipTitle) {
        state = 'title';
        if ((await titleCard(deps, cab)) !== 'start') return;
      }
      for (;;) {
        const outcome = await play(cab, ui);
        if (outcome.kind === 'exit') return;
        if (outcome.kind === 'crash') {
          state = 'error';
          await systemError(ui.el);
          return;
        }
        state = 'results';
        await gameOver(deps, outcome.score);
        let rank = -1;
        if (scores.qualifies(cab.id, outcome.score)) {
          const initials = await initialsEntry(deps, outcome.score);
          rank = scores.add(cab.id, initials ?? '???', outcome.score);
        }
        if ((await leaderboard(deps, cab, scores.top(cab.id), rank)) !== 'again') return;
      }
    } finally {
      ac.abort();
      ui.dispose();
      layer.hidden = true;
      state = 'idle';
      opts.onExit();
    }
  }

  return {
    get state() {
      return state;
    },
    launch,
  };
}
