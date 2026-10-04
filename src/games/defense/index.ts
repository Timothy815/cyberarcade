import * as Phaser from 'phaser';
import type { SfxName } from '../../core/audio';
import { mulberry32, type Rng } from '../../core/random';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { destroyGame } from '../phaser-util';
import { SELL_RATE, TOWERS, upgradeCost, World, type GameEvent, type TowerKind } from './logic';
import { PADS } from './path';
import { DefenseScene, H, W, type View } from './scene';
import { WAVE_COUNT, type Kind } from './waves';

const END_DELAY_MS = 2000; // let the end banner and final effects play before game over
const CALLOUT_MS = 4000;
const PAD_SIZE = 96;

const KINDS: TowerKind[] = ['firewall', 'ids', 'honeypot', 'limiter'];
const NAMES: Record<TowerKind, string> = { firewall: 'FIREWALL', ids: 'IDS', honeypot: 'HONEYPOT', limiter: 'RATE LIMITER' };

const CALLOUTS: Record<Kind, string> = {
  malware: 'MALWARE — malicious code trying to reach the server. Firewalls block it.',
  stealth: "STEALTH ATTACK — firewalls can't block what they can't see. Place an IDS.",
  brute: 'BRUTE FORCE — a bot hammering logins. A honeypot traps it while you strike.',
  ddos: 'DDoS — a flood of junk traffic. Rate limiting slows the flood so your defenses can keep up.',
};

// 'shot' is left out: it is played at most once per frame below, or a full board would buzz.
const SFX: Partial<Record<GameEvent['type'], SfxName>> = {
  kill: 'hit',
  leak: 'error',
  waveStart: 'select',
  waveClear: 'score',
  win: 'powerup',
  breach: 'explode',
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
  let calloutTimer: ReturnType<typeof setTimeout> | undefined;
  // Phaser's VisibilityHandler overwrites window.onblur/onfocus; destroy() restores them here.
  let savedBlur: typeof window.onblur = null;
  let savedFocus: typeof window.onfocus = null;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const world = new World(runRng());
      const view: View = { selected: null, hover: null };
      const hud = createHud([['wave', 'WAVE'], ['integrity', 'INTEGRITY'], ['credits', 'CREDITS'], ['score', 'SCORE']]);

      // Pads: invisible buttons over the canvas, so clicks are hit-tested by the DOM.
      const pads = PADS.map((p, i) => {
        const pad = el('button.fd-pad', { type: 'button', 'data-pad': i, 'data-tower': '', 'aria-label': `Pad ${i + 1}` });
        pad.style.left = `${p.x - PAD_SIZE / 2}px`;
        pad.style.top = `${p.y - PAD_SIZE / 2}px`;
        pad.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus off, so keys stay game keys
        pad.addEventListener('pointerenter', () => (view.hover = i));
        pad.addEventListener('pointerleave', () => {
          if (view.hover === i) view.hover = null;
        });
        pad.addEventListener('click', () => select(view.selected === i ? null : i));
        return pad;
      });

      // The bottom bar: build buttons for an empty pad, upgrade and sell for a tower.
      const builds = KINDS.map((kind, i) => {
        const b = el(
          'button.fd-build',
          { type: 'button', 'data-kind': kind },
          el('span.fd-key', {}, String(i + 1)),
          el('span.fd-name', {}, NAMES[kind]),
          el('span.fd-cost', {}, String(TOWERS[kind].cost)),
        );
        b.addEventListener('click', () => build(kind));
        return b;
      });
      const upgradeBtn = el('button.fd-upgrade', { type: 'button' });
      upgradeBtn.addEventListener('click', () => upgrade());
      const sellBtn = el('button.fd-sell', { type: 'button' });
      sellBtn.addEventListener('click', () => sell());
      const hint = el('div.fd-hint', {}, 'Click a pad to build a defense');
      const bar = el('div.fd-bar', { 'data-mode': 'none' }, hint, ...builds, upgradeBtn, sellBtn);
      for (const b of bar.querySelectorAll('button')) b.addEventListener('mousedown', (e) => e.preventDefault());

      const countdown = el('span.fd-count');
      const sendBtn = el('button.fd-send', { type: 'button' }, 'SEND NOW (N)');
      sendBtn.addEventListener('mousedown', (e) => e.preventDefault());
      sendBtn.addEventListener('click', () => sendNow());
      const next = el('div.fd-next', {}, countdown, sendBtn);

      const callout = el('div.fd-callout');
      const banner = el('div.fd-banner');
      const host = el('div.fd-canvas');
      const gameRoot = el('div.defense', { 'data-phase': world.phase, 'data-wave': world.wave }, host, ...pads, hud.el, next, bar, callout, banner);
      root = gameRoot;
      container.append(gameRoot);

      function select(pad: number | null): void {
        view.selected = pad;
        for (const [i, p] of pads.entries()) p.classList.toggle('is-selected', i === pad);
        ctx.audio.sfx(pad === null ? 'back' : 'move');
        refresh(world);
      }

      /** Runs a World action on the selected pad; a refused action buzzes. */
      function act(ok: boolean, sound: SfxName): void {
        ctx.audio.sfx(ok ? sound : 'error');
        refresh(world);
      }
      const build = (kind: TowerKind) => act(view.selected !== null && world.build(view.selected, kind), 'select');
      const upgrade = () => act(view.selected !== null && world.upgrade(view.selected), 'powerup');
      const sell = () => act(view.selected !== null && world.sell(view.selected), 'coin');
      const sendNow = () => act(world.sendNow(), 'select');

      ctx.input.onKey((e) => {
        if (e.repeat || world.over) return;
        const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
        if (digit) build(KINDS[Number(digit[1]) - 1]);
        else if (e.code === 'KeyU') upgrade();
        else if (e.code === 'KeyS') sell();
        else if (e.code === 'KeyN') sendNow();
      });

      const showCallout = (text: string) => {
        callout.textContent = text;
        callout.classList.add('is-on');
        clearTimeout(calloutTimer);
        calloutTimer = setTimeout(() => callout.classList.remove('is-on'), CALLOUT_MS);
      };

      /** Mirrors the World into the DOM: HUD, pads, the bar and the countdown. */
      function refresh(w: World): void {
        const shownWave = w.phase === 'build' ? Math.min(w.wave + 1, WAVE_COUNT) : w.wave;
        hud.set('wave', `${shownWave}/${WAVE_COUNT}`);
        hud.set('integrity', String(w.integrity));
        hud.set('credits', String(w.credits));
        hud.set('score', w.score.toLocaleString('en-US'));
        gameRoot.dataset.phase = w.phase;
        gameRoot.dataset.wave = String(w.wave);
        w.towers.forEach((t, i) => {
          const tower = t?.kind ?? '';
          if (pads[i].dataset.tower !== tower) pads[i].dataset.tower = tower;
        });

        const t = view.selected === null ? null : w.towers[view.selected];
        const mode = view.selected === null ? 'none' : t ? 'tower' : 'build';
        if (bar.dataset.mode !== mode) bar.dataset.mode = mode;
        for (const [i, b] of builds.entries()) b.classList.toggle('is-poor', w.credits < TOWERS[KINDS[i]].cost);
        if (t) {
          const up = t.level === 2 ? 'MAX LEVEL' : `U  UPGRADE ${upgradeCost(t.kind)}`;
          if (upgradeBtn.textContent !== up) upgradeBtn.textContent = up;
          upgradeBtn.classList.toggle('is-poor', t.level === 2 || w.credits < upgradeCost(t.kind));
          const sellText = `S  SELL +${Math.floor(t.spent * SELL_RATE)}`;
          if (sellBtn.textContent !== sellText) sellBtn.textContent = sellText;
        }

        next.classList.toggle('is-on', w.phase === 'build');
        const count = `WAVE ${Math.min(w.wave + 1, WAVE_COUNT)} IN ${Math.ceil(w.buildLeft)}`;
        if (countdown.textContent !== count) countdown.textContent = count;
      }

      const onEvents = (events: GameEvent[], w: World) => {
        let shot = false;
        for (const e of events) {
          const name = SFX[e.type];
          if (name) ctx.audio.sfx(name);
          if (e.type === 'shot') shot = true;
          if (e.type === 'firstSeen') showCallout(CALLOUTS[e.kind]);
          if (e.type === 'win' || e.type === 'breach') {
            banner.textContent = e.type === 'win' ? 'SYSTEM SECURED' : 'SERVER BREACHED';
            banner.className = e.type === 'win' ? 'fd-banner is-on is-ok' : 'fd-banner is-on is-danger';
            endTimer = setTimeout(() => ctx.endRun(w.score), END_DELAY_MS);
          }
        }
        if (shot) ctx.audio.sfx('shoot');
        refresh(w);
      };
      refresh(world);

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
        input: { keyboard: false, mouse: false, touch: false, gamepad: false }, // the DOM owns input
        audio: { noAudio: true }, // sounds go through the shared ZzFX audio
        scene: new DefenseScene(world, view, { onEvents }),
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
      clearTimeout(calloutTimer);
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
