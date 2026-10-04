import { describe, expect, it } from 'vitest';
import { KIND_LABEL, SNIPPETS } from '../../src/games/bughunt/snippets';

describe('bug hunt snippets', () => {
  it('has unique ids and enough of each level', () => {
    expect(new Set(SNIPPETS.map((s) => s.id)).size).toBe(SNIPPETS.length);
    const count = (l: number) => SNIPPETS.filter((s) => s.level === l).length;
    expect(count(1)).toBeGreaterThanOrEqual(10);
    expect(count(2)).toBeGreaterThanOrEqual(10);
    expect(count(3)).toBeGreaterThanOrEqual(8);
  });

  it.each(SNIPPETS.map((s) => [s.id, s] as const))('%s is well formed', (_id, s) => {
    expect(s.code.length).toBeGreaterThanOrEqual(6);
    expect(s.code.length).toBeLessThanOrEqual(12);
    expect(s.bug).toBeGreaterThanOrEqual(0);
    expect(s.bug).toBeLessThan(s.code.length);
    expect(s.fix).not.toBe(s.code[s.bug]);
    expect(KIND_LABEL[s.kind]).toBeTruthy();
    expect(s.goal.length).toBeGreaterThan(0);
    expect(s.why.length).toBeGreaterThan(0);
    expect(s.check.length).toBeGreaterThan(0);
    for (const line of [...s.code, s.fix]) {
      expect(line).not.toMatch(/\t/);
      expect(line.length).toBeLessThanOrEqual(56); // fits the code panel at 34px mono
    }
  });
});
