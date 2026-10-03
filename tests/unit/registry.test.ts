import { describe, expect, it } from 'vitest';
import { CABINETS, getCabinets } from '../../src/games/registry';
import { ICONS } from '../../src/core/ui/icons';

describe('registry', () => {
  it('has the seven games plus Classic 25, with unique ids', () => {
    expect(CABINETS).toHaveLength(8);
    expect(new Set(CABINETS.map((c) => c.id)).size).toBe(8);
    expect(CABINETS.at(-1)).toMatchObject({ kind: 'link', id: 'classic' });
  });

  it('gives every game cabinet controls and every cabinet an icon', () => {
    for (const c of CABINETS) {
      expect(ICONS[c.id], c.id).toContain('<svg');
      if (c.kind === 'game') expect(c.controls.length).toBeGreaterThan(0);
    }
  });

  it('adds the self-test cabinet only with ?selftest', () => {
    expect(getCabinets(new URLSearchParams(''))[0].id).toBe('invaders');
    const withTest = getCabinets(new URLSearchParams('selftest'));
    expect(withTest[0].id).toBe('selftest');
    expect(withTest).toHaveLength(9);
    expect(ICONS.selftest).toContain('<svg');
  });
});
