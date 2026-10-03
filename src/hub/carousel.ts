import type { Cabinet } from '../core/types';
import { el, html } from '../core/ui/dom';
import { ICONS } from '../core/ui/icons';

/** Signed distance of cabinet i from the selected one, the short way around the ring. */
export function wrapOffset(i: number, selected: number, n: number): number {
  const half = Math.floor(n / 2);
  return ((((i - selected) % n) + n + half) % n) - half;
}

export interface SlotStyle {
  x: number;
  scale: number;
  opacity: number;
  z: number;
  dim: boolean;
}

/** Layout for each ring position: centre, two visible neighbours per side, the rest hidden off to the side. */
export function slotStyle(offset: number): SlotStyle {
  const a = Math.abs(offset);
  const side = Math.sign(offset);
  if (a === 0) return { x: 0, scale: 1, opacity: 1, z: 10, dim: false };
  if (a === 1) return { x: side * 470, scale: 0.56, opacity: 1, z: 8, dim: true };
  if (a === 2) return { x: side * 760, scale: 0.44, opacity: 0.85, z: 6, dim: true };
  return { x: side * 1000, scale: 0.36, opacity: 0, z: 4, dim: true };
}

const TAGS: Record<Cabinet['category'], string> = { arcade: 'ARCADE', learn: 'LEARN', classic: 'LAST YEAR' };

export interface CarouselOptions {
  /** Enter or a click on the centre cabinet. */
  onActivate: (cab: Cabinet) => void;
  onChange?: (cab: Cabinet) => void;
  /** Text for the station top score line, or '' for none. */
  topScore: (cab: Cabinet) => string;
}

export interface Carousel {
  el: HTMLElement;
  readonly selected: number;
  current(): Cabinet;
  select(i: number): void;
  next(): void;
  prev(): void;
  /** Re-reads top scores (after a run). */
  refresh(): void;
}

export function createCarousel(cabinets: Cabinet[], opts: CarouselOptions): Carousel {
  const n = cabinets.length;
  let selected = 0;
  const root = el('div.carousel');

  const cards = cabinets.map((cab, i) => {
    const score = el('div.cab-score');
    const card = el(
      `button.cabinet.accent-${cab.category}`,
      { type: 'button', 'data-id': cab.id, tabindex: -1 },
      html('div.cab-icon', ICONS[cab.id] ?? ''),
      el('div.cab-title', {}, cab.title),
      el('div.cab-tag', {}, TAGS[cab.category]),
      el('div.cab-tagline', {}, cab.tagline),
      cab.kind === 'link'
        ? el('div.cab-note', {}, cab.note)
        : cab.load
          ? score
          : el('div.cab-note.soon', {}, 'COMING SOON'),
    );
    card.addEventListener('click', () => {
      if (i === selected) opts.onActivate(cab);
      else carousel.select(i);
    });
    root.append(card);
    return { card, score, cab };
  });

  const layout = () => {
    cards.forEach(({ card }, i) => {
      const s = slotStyle(wrapOffset(i, selected, n));
      card.style.transform = `translate(-50%, -50%) translateX(${s.x}px) scale(${s.scale})`;
      card.style.opacity = String(s.opacity);
      card.style.zIndex = String(s.z);
      card.classList.toggle('is-center', s.x === 0);
      card.classList.toggle('is-dim', s.dim);
      card.style.pointerEvents = s.opacity === 0 ? 'none' : '';
    });
  };

  const refresh = () => {
    for (const { score, cab } of cards) score.textContent = opts.topScore(cab);
  };

  const carousel: Carousel = {
    el: root,
    get selected() {
      return selected;
    },
    current: () => cabinets[selected],
    select(i) {
      const next = ((i % n) + n) % n;
      if (next === selected) return;
      selected = next;
      layout();
      opts.onChange?.(cabinets[selected]);
    },
    next: () => carousel.select(selected + 1),
    prev: () => carousel.select(selected - 1),
    refresh,
  };

  refresh();
  layout();
  return carousel;
}
