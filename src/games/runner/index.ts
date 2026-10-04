import * as Phaser from 'phaser';
import type { SfxName } from '../../core/audio';
import { mulberry32, type Rng } from '../../core/random';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { destroyGame } from '../phaser-util';
import { H, W, World, type GameEvent } from './logic';
import { RunnerScene } from './scene';

const END_DELAY_MS = 1500; // let the final burst play before game over
const FLASH_MS = 1200;
const HINT = '/24 = first 3 numbers must match';

const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
  hit: 'hit',
  ack: 'coin',
  gateWarn: 'select',
  gateRight: 'score',
  gateWrong: 'error',
  gameOver: 'explode',
};

/** `?seed=N` makes the run repeatable (tests, debugging); otherwise it is random. */
function runRng(): Rng {
  const seed = new URLSearchParams(location.search).get('seed');
  return seed !== null && /^\d+$/.test(seed) ? mulberry32(Number(seed)) : Math.random;
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let game: Phaser.Game | null = null;
  let ready = false;
  let tornDown = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  // Phaser's VisibilityHandler overwrites window.onblur/onfocus; destroy() restores them here.
  let savedBlur: typeof window.onblur = null;
  let savedFocus: typeof window.onfocus = null;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const world = new World(runRng());
      const hud = createHud([['score', 'SCORE'], ['lives', 'LIVES'], ['gates', 'ROUTED']]);
      const dest = el('div.pr-dest');
      const hint = el('div.pr-hint');
      const router = el('div.pr-router', {}, el('div.pr-router-title', {}, 'ROUTER AHEAD'), dest, hint);
      const flash = el('div.pr-flash');
      const host = el('div.pr-canvas');
      const gameRoot = el('div.runner', {}, host, hud.el, router, flash);
      root = gameRoot;
      gameRoot.dataset.lane = String(world.lane);
      container.append(gameRoot);

      const showFlash = (text: string, ok: boolean) => {
        flash.textContent = text;
        flash.className = ok ? 'pr-flash is-on is-ok' : 'pr-flash is-on is-danger';
        clearTimeout(flashTimer);
        flashTimer = setTimeout(() => flash.classList.remove('is-on'), FLASH_MS);
      };

      ctx.input.onKey((e) => {
        if (e.repeat || world.over) return;
        const dir = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : e.code === 'ArrowRight' || e.code === 'KeyD' ? 1 : 0;
        if (dir !== 0 && world.steer(dir)) ctx.audio.sfx('move');
      });

      const onEvents = (events: GameEvent[], w: World) => {
        for (const e of events) {
          const name = SFX[e.type];
          if (name) ctx.audio.sfx(name);
          if (e.type === 'gateWarn') {
            dest.textContent = `DEST ${e.gate.dest}`;
            hint.textContent = e.hint ? HINT : '';
            gameRoot.dataset.correct = String(e.gate.correct);
            router.classList.add('is-on');
          }
          if (e.type === 'gateRight') {
            router.classList.remove('is-on');
            showFlash(`ROUTED +${e.points.toLocaleString('en-US')}`, true);
          }
          if (e.type === 'gateWrong') {
            router.classList.remove('is-on');
            showFlash('PACKET DROPPED', false);
          }
          if (e.type === 'gameOver') {
            router.classList.remove('is-on');
            showFlash('CONNECTION LOST', false);
            endTimer = setTimeout(() => ctx.endRun(w.score), END_DELAY_MS);
          }
        }
        gameRoot.dataset.lane = String(w.lane);
        hud.set('score', w.score.toLocaleString('en-US'));
        hud.set('lives', '◆'.repeat(w.lives) || '—');
        hud.set('gates', String(w.routed));
      };

      savedBlur = window.onblur;
      savedFocus = window.onfocus;
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        width: W,
        height: H,
        transparent: true,
        banner: false,
        autoFocus: false,
        scale: { mode: Phaser.Scale.NONE },
        input: { keyboard: false, mouse: false, touch: false, gamepad: false }, // the shell owns input
        audio: { noAudio: true }, // sounds go through the shared ZzFX audio
        scene: new RunnerScene(world, { onEvents }),
      });

      return new Promise<void>((resolve) => {
        game!.events.once(Phaser.Core.Events.READY, () => {
          ready = true;
          // unmount() arrived while Phaser was still booting: finish the teardown now.
          if (tornDown && game) {
            destroyGame(game);
            game = null;
          }
          resolve();
        });
      });
    },

    unmount() {
      tornDown = true;
      clearTimeout(endTimer);
      clearTimeout(flashTimer);
      // Phaser can only be destroyed once it has booted; mount() finishes the job on READY otherwise.
      if (game && ready) {
        destroyGame(game);
        game = null;
      }
      window.onblur = savedBlur;
      window.onfocus = savedFocus;
      root?.remove();
      root = null;
    },
  };
}
