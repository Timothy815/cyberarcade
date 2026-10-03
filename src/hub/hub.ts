import type { Audio } from '../core/audio';
import { createIdleTimer } from '../core/idle';
import type { Input } from '../core/input';
import { formatScore, type Scores } from '../core/scores';
import { createStage } from '../core/stage';
import { timing } from '../core/theme';
import type { Cabinet, GameCabinet } from '../core/types';
import { el } from '../core/ui/dom';
import { createBackground } from './background';
import { createCarousel } from './carousel';

export interface HubOptions {
  layer: HTMLElement;
  cabinets: Cabinet[];
  audio: Audio;
  input: Input;
  scores: Scores;
  onLaunch: (cab: GameCabinet) => void;
  /** Navigation for link cabinets. Injected so tests don't leave the page. */
  nav?: { assign(url: string): void };
}

export interface Hub {
  readonly visible: boolean;
  readonly attract: boolean;
  show(): void;
  hide(): void;
}

export function createHub(opts: HubOptions): Hub {
  const { layer, audio, input, scores } = opts;
  const nav = opts.nav ?? location;
  layer.hidden = true;
  layer.append(createBackground());
  const stage = createStage(layer, 'hub-stage');

  let autoAdvancing = false;
  const carousel = createCarousel(opts.cabinets, {
    onActivate: (cab) => activate(cab),
    onChange: () => {
      if (!autoAdvancing) audio.sfx('move');
    },
    topScore: (cab) => {
      const best = scores.top(cab.id)[0];
      return best ? `★ TOP  ${best.initials}  ${formatScore(best.score)}` : 'NO SCORES YET · BE THE FIRST';
    },
  });
  const attractOverlay = el('div.attract', {}, el('p.blink', {}, 'PRESS ANY KEY'));
  const confirm = el(
    'div.confirm',
    {},
    el('h2', {}, 'CLEAR ALL HIGH SCORES?'),
    el('p', {}, 'Y = YES · N = NO'),
  );
  confirm.hidden = true;

  stage.el.append(
    el('header.hub-logo', {}, el('h1.chrome', {}, 'CYBER ARCADE'), el('p.hub-sub', {}, 'DEFEND THE NETWORK · PRESS START')),
    carousel.el,
    el('footer.hub-footer', {}, '◀ ▶ SELECT  ·  ENTER PLAY  ·  M MUTE'),
    attractOverlay,
    confirm,
  );

  let visible = false;
  let attract = false;
  let attractTimer: ReturnType<typeof setInterval> | undefined;
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;
  let wakeEvent: Event | null = null;
  let offs: (() => void)[] = [];

  const idle = createIdleTimer(timing.hubIdleMs, () => setAttract(true));

  function closeConfirm() {
    clearTimeout(confirmTimer);
    confirmTimer = undefined;
    confirm.hidden = true;
  }

  function setAttract(on: boolean) {
    if (on) closeConfirm(); // attract mode must never start behind a stuck confirm dialog
    attract = on;
    layer.classList.toggle('is-attract', on);
    clearInterval(attractTimer);
    attractTimer = on
      ? setInterval(() => {
          autoAdvancing = true;
          carousel.select(carousel.selected + 1);
          autoAdvancing = false;
        }, timing.attractStepMs)
      : undefined;
    if (!on && visible) idle.start();
  }

  function shake(cab: Cabinet) {
    const card = carousel.el.querySelector<HTMLElement>(`[data-id="${cab.id}"]`);
    if (!card) return;
    card.classList.remove('shake');
    void card.offsetWidth; // restart the animation
    card.classList.add('shake');
    // Without this, the card is left permanently on the (non-infinite) shake animation,
    // which cascades over cab-float and freezes the centre cabinet from floating again.
    card.addEventListener('animationend', () => card.classList.remove('shake'), { once: true });
  }

  function activate(cab: Cabinet) {
    if (cab.kind === 'link') {
      audio.sfx('select');
      nav.assign(cab.href);
      return;
    }
    if (!cab.load) {
      audio.sfx('error');
      shake(cab);
      return;
    }
    audio.sfx('select');
    hub.hide();
    opts.onLaunch(cab);
  }

  function onKey(e: KeyboardEvent) {
    if (e === wakeEvent) return; // the key that ended attract mode does nothing else
    if (!confirm.hidden) {
      if (e.key === 'y' || e.key === 'Y') {
        scores.clearAll();
        carousel.refresh();
        audio.sfx('explode');
        closeConfirm();
      } else if (['n', 'N', 'Escape'].includes(e.key)) {
        audio.sfx('back');
        closeConfirm();
      }
      return;
    }
    if (e.ctrlKey && e.altKey && e.code === 'KeyX') {
      confirm.hidden = false;
      // Auto-cancel so a dangling confirm (e.g. the attendant walked away) never blocks the
      // station from returning to attract mode and the normal idle/attract flow.
      confirmTimer = setTimeout(() => closeConfirm(), 10_000);
      return;
    }
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
        carousel.prev();
        break;
      case 'ArrowRight':
      case 'd':
        carousel.next();
        break;
      case 'Enter':
      case ' ':
        if (!e.repeat) activate(carousel.current());
        break;
    }
  }

  function onAny(e: Event) {
    if (attract && e.type !== 'pointermove') {
      wakeEvent = e;
      setAttract(false);
      return;
    }
    idle.reset();
  }

  const hub: Hub = {
    get visible() {
      return visible;
    },
    get attract() {
      return attract;
    },
    show() {
      if (visible) return;
      visible = true;
      layer.hidden = false;
      stage.fit();
      carousel.refresh();
      offs = [input.onAny(onAny), input.onKey(onKey)];
      idle.start();
      audio.playMusic();
    },
    hide() {
      if (!visible) return;
      visible = false;
      for (const off of offs) off();
      offs = [];
      idle.stop();
      setAttract(false);
      closeConfirm();
      layer.hidden = true;
    },
  };
  return hub;
}
