import { el } from './dom';

export interface Hud {
  el: HTMLElement;
  /** Updates one cell's value. Skips the DOM write when the text is unchanged. */
  set(key: string, text: string): void;
}

/** A row of LABEL / value cells across the top of a game, e.g. SCORE 1,200 · WAVE 3. */
export function createHud(cells: [key: string, label: string][]): Hud {
  const values = new Map<string, HTMLElement>();
  const root = el(
    'div.hud',
    {},
    ...cells.map(([key, label]) => {
      const value = el('span.hud-value', { 'data-hud': key }, '');
      values.set(key, value);
      return el('div.hud-cell', {}, el('span.hud-label', {}, label), value);
    }),
  );
  return {
    el: root,
    set(key, text) {
      const v = values.get(key);
      if (v && v.textContent !== text) v.textContent = text;
    },
  };
}
