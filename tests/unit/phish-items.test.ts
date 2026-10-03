import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/games/phish/items';

describe('phish item bank', () => {
  it('has at least 60 items with unique ids', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
  });

  it('every clue appears in the item text and every explanation fits on screen', () => {
    for (const it of ITEMS) {
      const text = [it.from, it.subject ?? '', it.body].join('\n');
      expect(text, it.id).toContain(it.clue);
      expect(it.clue.length, it.id).toBeGreaterThan(0);
      expect(it.why.length, `${it.id}: "${it.why}"`).toBeLessThanOrEqual(60);
    }
  });

  it('only emails have subjects', () => {
    for (const it of ITEMS) if (it.kind !== 'email') expect(it.subject, it.id).toBeUndefined();
  });

  it('each level has phish and legit items, roughly balanced', () => {
    for (const level of [1, 2, 3] as const) {
      const items = ITEMS.filter((i) => i.level === level);
      const phish = items.filter((i) => i.phish).length;
      expect(items.length, `level ${level}`).toBeGreaterThanOrEqual(15);
      expect(phish / items.length).toBeGreaterThanOrEqual(0.35);
      expect(phish / items.length).toBeLessThanOrEqual(0.65);
    }
  });
});
