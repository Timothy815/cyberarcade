import { describe, expect, it } from 'vitest';
import type { Puzzle } from '../../src/games/repair/puzzles';
import { expected, patched, runGrid, TICK_CAP } from '../../src/games/repair/run';

/**
 * A throwaway puzzle around `nodes`. Option 0 replaces the line marked `@@`; with no marker,
 * the first node's first line is "broken" and option 0 is that same line.
 */
function grid(
  nodes: Puzzle['nodes'],
  inputs: number[],
  layout: Partial<Pick<Puzzle, 'cols' | 'rows' | 'inCol' | 'outCol'>> = {},
  options: [string, string, string] = ['', 'pass', 'pass'],
): Puzzle {
  let broken = { node: 0, line: 0 };
  nodes.forEach((n, i) =>
    n.code.forEach((l, j) => {
      if (l.trim() === '@@') broken = { node: i, line: j };
    }),
  );
  const first = nodes[broken.node].code[broken.line].trim();
  return {
    id: 't',
    tier: 1,
    title: 't',
    goal: 't',
    display: 'num',
    cols: 1,
    rows: 1,
    inCol: 0,
    outCol: 0,
    ...layout,
    nodes,
    broken,
    glitch: '@@',
    options: [options[0] || first, options[1], options[2]],
    answer: 0,
    hints: ['', '', ''],
    inputs,
  };
}

const echo = ['while True:', '    write(DOWN, read(UP))'];

describe('repair run', () => {
  it('echoes inputs through a single node', () => {
    const p = grid([{ col: 0, row: 0, code: echo }], [3, 1, 4, 1, 5]);
    expect(expected(p)).toEqual([3, 1, 4, 1, 5]);
    const r = runGrid(p, 0);
    expect(r.status).toBe('done');
    expect(r.outputs).toEqual([3, 1, 4, 1, 5]);
    expect(r.culprits).toEqual([]);
  });

  it('runs a two-node pipeline', () => {
    const p = grid(
      [
        { col: 0, row: 0, code: ['while True:', '    write(RIGHT, read(UP) * 2)'] },
        { col: 1, row: 0, code: ['while True:', '    write(DOWN, read(LEFT) + 1)'] },
      ],
      [1, 2, 3],
      { cols: 2, outCol: 1 },
    );
    expect(runGrid(p, 0)).toMatchObject({ status: 'done', outputs: [3, 5, 7] });
  });

  it('makes a written value readable only on the next tick', () => {
    const p = grid(
      [
        { col: 0, row: 0, code: ['write(RIGHT, 7)'] },
        { col: 1, row: 0, code: ['write(DOWN, read(LEFT))'] },
      ],
      [],
      { cols: 2, outCol: 1 },
    );
    const { trace, outputs } = runGrid(p, 0);
    expect(outputs).toEqual([7]);
    expect(trace[0].moves).toEqual([{ from: 0, to: 1, value: 7 }]);
    expect(trace[0].active).toEqual([0, null]); // the reader is still blocked in the same tick
    expect(trace[1].moves).toEqual([{ from: 1, to: 'OUT', value: 7 }]);
  });

  it('gives the same result whatever order the nodes are listed in', () => {
    const a = { col: 0, row: 0, code: ['while True:', '    write(RIGHT, read(UP))'] };
    const b = { col: 1, row: 0, code: ['while True:', '    write(DOWN, read(LEFT))'] };
    const layout = { cols: 2 as const, outCol: 1 };
    const fwd = runGrid(grid([a, b], [1, 2, 3, 4], layout), 0);
    const rev = runGrid(grid([b, a], [1, 2, 3, 4], layout), 0);
    expect(rev.outputs).toEqual(fwd.outputs);
    expect(rev.trace.length).toBe(fwd.trace.length);
  });

  it('blocks a write while the link is full and a read while it is empty', () => {
    const p = grid(
      [
        { col: 0, row: 0, code: ['write(RIGHT, 1)', 'write(RIGHT, 2)', 'write(RIGHT, 3)'] },
        { col: 1, row: 0, code: ['x = 0', 'x = 0', 'x = 0', 'x = 0', 'while True:', '    write(DOWN, read(LEFT))'] },
      ],
      [],
      { cols: 2, outCol: 1 },
    );
    const { trace, outputs } = runGrid(p, 0);
    expect(outputs).toEqual([1, 2, 3]);
    expect(trace[1].active[0]).toBeNull(); // second write waits: the link still holds 1
    expect(trace[3].active[0]).toBeNull();
  });

  it('stalls when the inputs run out', () => {
    const p = grid([{ col: 0, row: 0, code: ['while True:', '    x = read(UP)', '    @@'] }], [1, 2, 3], {}, [
      'write(DOWN, x)',
      'x = x',
      'pass',
    ]);
    expect(runGrid(p, 1)).toMatchObject({ status: 'stalled', outputs: [], culprits: [0] });
  });

  it('stalls at the tick cap on a loop with no I/O', () => {
    const p = grid([{ col: 0, row: 0, code: ['while True:', '    @@'] }], [1], {}, ['write(DOWN, read(UP))', 'pass', 'pass']);
    const r = runGrid(p, 1);
    expect(r.status).toBe('stalled');
    expect(r.trace.length).toBe(TICK_CAP);
  });

  it('stalls on a read from an unlinked port', () => {
    const p = grid([{ col: 0, row: 0, code: ['while True:', '    @@'] }], [1], {}, ['write(DOWN, read(UP))', 'write(DOWN, read(LEFT))', 'pass']);
    expect(runGrid(p, 1).status).toBe('stalled');
  });

  it('faults on an unknown variable and on division by zero', () => {
    const p = grid([{ col: 0, row: 0, code: ['while True:', '    x = read(UP)', '    @@'] }], [4, 0], {}, [
      'write(DOWN, x)',
      'write(DOWN, y)',
      'write(DOWN, 8 // x)',
    ]);
    expect(runGrid(p, 1)).toMatchObject({ status: 'fault', culprits: [0] });
    const div = runGrid(p, 2);
    expect(div.status).toBe('fault');
    expect(div.outputs).toEqual([2]);
  });

  it('uses Python floor division and modulo', () => {
    const p = grid([{ col: 0, row: 0, code: ['write(DOWN, -7 // 2)', 'write(DOWN, -7 % 3)', 'write(DOWN, 7 % -3)', 'write(DOWN, 6 ^ 3)', 'write(DOWN, not 0)'] }], []);
    expect(expected(p)).toEqual([-4, 2, -2, 5, 1]);
  });

  it('records OUT moves that match the outputs', () => {
    const p = grid([{ col: 0, row: 0, code: echo }], [9, 8, 7]);
    const r = runGrid(p, 0);
    const out = r.trace.flatMap((t) => t.moves.filter((m) => m.to === 'OUT').map((m) => m.value));
    expect(out).toEqual(r.outputs);
    expect(r.trace[0].moves).toEqual([]); // the `while True:` check takes tick 0
    expect(r.trace[1].moves[0]).toEqual({ from: 'IN', to: 0, value: 9 });
  });

  it('patches the broken line, keeping its indentation', () => {
    const p = grid([{ col: 0, row: 0, code: ['while True:', '    @@'] }], [], {}, ['pass', 'x = 1', 'pass']);
    expect(patched(p, 1)).toEqual([['while True:', '    x = 1']]);
  });
});
