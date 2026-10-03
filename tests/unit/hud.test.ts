import { describe, expect, it } from 'vitest';
import { createHud } from '../../src/core/ui/hud';

describe('createHud', () => {
  it('renders one labelled cell per key and updates values', () => {
    const hud = createHud([['score', 'SCORE'], ['wave', 'WAVE']]);
    expect(hud.el.querySelectorAll('.hud-cell')).toHaveLength(2);
    expect(hud.el.querySelector('.hud-label')!.textContent).toBe('SCORE');
    hud.set('score', '1,200');
    expect(hud.el.querySelector('[data-hud="score"]')!.textContent).toBe('1,200');
    hud.set('missing', 'x'); // unknown keys are ignored
  });
});
