import type { Audio } from '../audio';
import { el } from './dom';

const ON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';
const OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l6 6M22 9l-6 6"/></svg>';

/** Fixed speaker icon in the top-right corner. Click toggles mute; call update() after M. */
export function createMuteIndicator(audio: Audio): { el: HTMLElement; update(): void } {
  const button = el('button.mute-indicator', { type: 'button', tabindex: -1, 'aria-label': 'Toggle sound' });
  const update = () => {
    button.innerHTML = audio.muted ? OFF : ON;
    button.classList.toggle('is-muted', audio.muted);
  };
  button.addEventListener('click', () => {
    audio.toggleMute();
    update();
  });
  update();
  return { el: button, update };
}
