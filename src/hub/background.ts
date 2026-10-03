import { el } from '../core/ui/dom';

/** Full-bleed synthwave scene: stars, striped sun, mountains, scrolling perspective grid. Pure CSS animation. */
export function createBackground(): HTMLElement {
  const stars = el('div.bg-stars');
  for (let i = 0; i < 90; i++) {
    const s = el('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 55}%`;
    s.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
    s.style.opacity = (0.3 + Math.random() * 0.7).toFixed(2);
    stars.append(s);
  }
  const mountains = el('div.bg-mountains');
  mountains.innerHTML =
    '<svg viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="M0 200 L120 110 L210 160 L340 60 L470 150 L560 100 L700 170 L800 120 L900 170 L1040 90 L1150 150 L1260 70 L1400 160 L1500 110 L1600 150 L1600 200Z"/>' +
    '</svg>';
  return el(
    'div.hub-bg',
    { 'aria-hidden': 'true' },
    stars,
    el('div.bg-sun-glow'),
    el('div.bg-sun'),
    mountains,
    el('div.bg-horizon'),
    el('div.bg-floor', {}, el('div.bg-grid')),
  );
}
