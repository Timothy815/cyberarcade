import { describe, expect, it } from 'vitest';
import { parse } from '../../src/games/repair/parse';
import { PUZZLES } from '../../src/games/repair/puzzles';
import { expected, patched, runGrid } from '../../src/games/repair/run';

describe('repair puzzles', () => {
  it('has 18 puzzles, 6 per tier, with unique ids', () => {
    expect(PUZZLES).toHaveLength(18);
    for (const tier of [1, 2, 3]) expect(PUZZLES.filter((p) => p.tier === tier)).toHaveLength(6);
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(18);
  });

  it.each(PUZZLES.map((p) => [p.id, p] as const))('%s is well formed and fair', (_id, p) => {
    // layout
    const cells = new Set<string>();
    for (const n of p.nodes) {
      expect(n.col).toBeGreaterThanOrEqual(0);
      expect(n.col).toBeLessThan(p.cols);
      expect(n.row).toBeGreaterThanOrEqual(0);
      expect(n.row).toBeLessThan(p.rows);
      cells.add(`${n.col},${n.row}`);
    }
    expect(cells.size).toBe(p.nodes.length);
    expect(cells.has(`${p.inCol},0`)).toBe(true);
    expect(cells.has(`${p.outCol},${p.rows - 1}`)).toBe(true);

    // the broken line
    const code = p.nodes[p.broken.node]?.code;
    expect(code).toBeDefined();
    expect(code![p.broken.line]?.trim()).toBe(p.glitch);
    expect(new Set(p.options).size).toBe(3);
    expect(p.hints.every((h) => h.length > 0)).toBe(true);
    if (p.display === 'letter') expect(p.inputs.every((v) => v >= 0 && v <= 25)).toBe(true);

    // every option parses
    for (const choice of [0, 1, 2]) for (const src of patched(p, choice)) expect(() => parse(src)).not.toThrow();

    // the answer works, and every wrong option visibly fails
    const want = expected(p);
    expect(want.length).toBeGreaterThanOrEqual(4);
    expect(runGrid(p, p.answer)).toMatchObject({ status: 'done', outputs: want });
    for (const choice of [0, 1, 2].filter((c) => c !== p.answer)) {
      const r = runGrid(p, choice);
      const differs = r.outputs.length < want.length || r.outputs.some((v, i) => v !== want[i]);
      expect(r.status !== 'done' || differs, `option ${choice} must fail`).toBe(true);
    }
  });
});
