import type { Audio } from '../core/audio';
import { enterFullscreen } from '../core/fullscreen';
import { el } from '../core/ui/dom';

/**
 * First screen. Browsers allow audio and fullscreen only after a user gesture,
 * so one click (or key) here unlocks both, then hands over to the hub.
 */
export function showSplash(parent: HTMLElement, audio: Audio, onStart: () => void): void {
  const root = el(
    'div.splash',
    {},
    el('h1.chrome', {}, 'CYBER ARCADE'),
    el('p.blink', {}, 'CLICK TO START'),
    el('p.splash-note', {}, 'Fullscreen · sound on · M to mute'),
  );
  parent.append(root);

  const start = () => {
    root.removeEventListener('pointerdown', start);
    window.removeEventListener('keydown', start);
    // Must be kicked off synchronously inside the gesture handler, but neither needs to be
    // awaited: the hub must appear immediately even if fullscreen/audio never resolve.
    void enterFullscreen().catch(() => {});
    void audio.unlock().catch(() => {});
    root.classList.add('leaving');
    setTimeout(() => root.remove(), 400);
    onStart();
  };
  root.addEventListener('pointerdown', start);
  window.addEventListener('keydown', start);
}
