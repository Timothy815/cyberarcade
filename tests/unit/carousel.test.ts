import { describe, expect, it, vi } from 'vitest';
import { createCarousel, slotStyle, wrapOffset } from '../../src/hub/carousel';
import { CABINETS } from '../../src/games/registry';

describe('carousel math', () => {
  it('wraps offsets the short way around a ring of 8', () => {
    expect(wrapOffset(0, 0, 8)).toBe(0);
    expect(wrapOffset(1, 0, 8)).toBe(1);
    expect(wrapOffset(7, 0, 8)).toBe(-1);
    expect(wrapOffset(6, 0, 8)).toBe(-2);
    expect(wrapOffset(0, 7, 8)).toBe(1);
    expect(wrapOffset(4, 0, 8)).toBe(-4);
  });

  it('shows the centre plus two neighbours per side', () => {
    expect(slotStyle(0)).toMatchObject({ x: 0, scale: 1, opacity: 1, dim: false });
    expect(slotStyle(-1).x).toBe(-470);
    expect(slotStyle(2).opacity).toBeGreaterThan(0);
    expect(slotStyle(3).opacity).toBe(0);
    expect(slotStyle(-4).opacity).toBe(0);
  });
});

describe('carousel', () => {
  const make = () => {
    const onActivate = vi.fn();
    const onChange = vi.fn();
    const c = createCarousel(CABINETS, { onActivate, onChange, topScore: () => '★ TOP ZAK 900' });
    document.body.append(c.el);
    return { c, onActivate, onChange };
  };

  it('wraps next/prev and reports changes', () => {
    const { c, onChange } = make();
    c.prev();
    expect(c.selected).toBe(8);
    expect(c.current().id).toBe('classic');
    c.next();
    expect(c.selected).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);
    c.el.remove();
  });

  it('click on a side cabinet rotates; click on the centre activates', () => {
    const { c, onActivate } = make();
    const cards = c.el.querySelectorAll<HTMLButtonElement>('.cabinet');
    cards[1].click();
    expect(c.selected).toBe(1);
    expect(onActivate).not.toHaveBeenCalled();
    cards[1].click();
    expect(onActivate).toHaveBeenCalledWith(CABINETS[1]);
    expect(cards[1].classList.contains('is-center')).toBe(true);
    c.el.remove();
  });

  it('marks unbuilt games COMING SOON and shows the Classic note', () => {
    // Every real game is built now, so an unbuilt one is faked to keep COMING SOON covered.
    const unbuilt = CABINETS.map((cab) => (cab.kind === 'game' && cab.id === 'defense' ? { ...cab, load: undefined } : cab));
    const c = createCarousel(unbuilt, { onActivate: vi.fn(), topScore: () => '' });
    document.body.append(c.el);
    expect(c.el.querySelector('[data-id="defense"] .soon')).not.toBeNull();
    expect(c.el.querySelector('[data-id="phish"] .soon')).toBeNull();
    expect(c.el.querySelector('[data-id="classic"] .cab-note')?.textContent).toContain('Alt+');
    c.el.remove();
  });
});
