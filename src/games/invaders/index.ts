import * as Phaser from 'phaser';
import type { SfxName } from '../../core/audio';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { H, W, World, type Controls, type GameEvent } from './logic';
import { InvadersScene } from './scene';

const END_DELAY_MS = 1500; // let the final explosion play before game over
const BANNER_MS = 1800;
const MAX_CONTEXT_WAIT_FRAMES = 60;

const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
  shoot: 'shoot',
  hit: 'hit',
  kill: 'explode',
  split: 'hit',
  reveal: 'back',
  landed: 'error',
  powerup: 'powerup',
  waveClear: 'score',
  waveStart: 'select',
  gameOver: 'explode',
};

/**
 * Destroys a Phaser game completely. Phaser's destroy() runs on the game's next frame and never
 * releases the WebGL context, and Chrome only allows ~16 live contexts, so a kiosk that starts
 * hundreds of runs a day must free each one by hand once Phaser has finished with it.
 */
function destroyGame(game: Phaser.Game): void {
  const gl = (game.renderer as Partial<Phaser.Renderer.WebGL.WebGLRenderer> | null)?.gl ?? null;
  game.destroy(true);
  if (!gl) return;
  // pendingDestroy is public in Phaser's source but missing from its typings.
  const pending = () => (game as unknown as { pendingDestroy: boolean }).pendingDestroy;
  let frames = 0;
  const release = () => {
    if (pending() && ++frames < MAX_CONTEXT_WAIT_FRAMES) {
      requestAnimationFrame(release);
      return;
    }
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  requestAnimationFrame(release);
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let game: Phaser.Game | null = null;
  let ready = false;
  let tornDown = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let bannerTimer: ReturnType<typeof setTimeout> | undefined;
  // Phaser's VisibilityHandler overwrites these and never restores them.
  let savedBlur: typeof window.onblur = null;
  let savedFocus: typeof window.onfocus = null;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const world = new World();
      const hud = createHud([['score', 'SCORE'], ['wave', 'WAVE'], ['lives', 'LIVES']]);
      const banner = el('div.inv-banner');
      const bossFill = el('div.inv-boss-fill');
      const bossBar = el('div.inv-boss', {}, el('span.inv-boss-label', {}, 'RANSOMWARE'), el('div.inv-boss-track', {}, bossFill));
      const host = el('div.inv-canvas');
      root = el('div.invaders', {}, host, hud.el, bossBar, banner);
      container.append(root);

      const showBanner = (text: string, danger = false) => {
        banner.textContent = text;
        banner.className = danger ? 'inv-banner is-on is-danger' : 'inv-banner is-on';
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => banner.classList.remove('is-on'), BANNER_MS);
      };

      const controls = (): Controls => ({
        left: ctx.input.isDown('ArrowLeft') || ctx.input.isDown('KeyA'),
        right: ctx.input.isDown('ArrowRight') || ctx.input.isDown('KeyD'),
        fire: ctx.input.isDown('Space'),
      });

      const onEvents = (events: GameEvent[], w: World) => {
        for (const e of events) {
          const name = e.type === 'playerHit' ? (e.shielded ? 'hit' : 'error') : SFX[e.type];
          if (name) ctx.audio.sfx(name);
          if (e.type === 'waveStart') showBanner(e.boss ? `WAVE ${e.wave} · RANSOMWARE ATTACK` : `WAVE ${e.wave}`, e.boss);
          if (e.type === 'waveClear') showBanner(`WAVE CLEAR  +${e.bonus.toLocaleString('en-US')}`);
          if (e.type === 'gameOver') {
            showBanner('SYSTEM COMPROMISED', true);
            endTimer = setTimeout(() => ctx.endRun(w.score), END_DELAY_MS);
          }
        }
        hud.set('score', w.score.toLocaleString('en-US'));
        hud.set('wave', String(Math.max(1, w.wave)));
        hud.set('lives', '◆'.repeat(w.lives) || '—');
        const boss = w.enemies.find((e) => e.kind === 'boss');
        bossBar.classList.toggle('is-on', boss !== undefined);
        if (boss) bossFill.style.transform = `scaleX(${boss.hp / boss.maxHp})`;
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
        scene: new InvadersScene(world, { controls, onEvents }),
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
      clearTimeout(bannerTimer);
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
