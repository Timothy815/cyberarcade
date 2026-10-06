// Runs a puzzle's node grid: one stepper per node, one-value links between neighbours, a lock-step scheduler. Pure.
import { parse, type Expr, type Port, type Stmt } from './parse';
import type { Puzzle } from './puzzles';

/** Index into `puzzle.nodes`. */
export type NodeRef = number;

export interface Move {
  from: NodeRef | 'IN';
  to: NodeRef | 'OUT';
  value: number;
}

export interface Tick {
  /** Each node's source line this tick, or null when it was blocked (or had finished). */
  active: (number | null)[];
  moves: Move[];
}

export type RunStatus = 'done' | 'stalled' | 'fault';

export interface RunResult {
  outputs: number[];
  status: RunStatus;
  trace: Tick[];
  /** Nodes to flag when the run failed: the faulted node, or every node stuck in the last tick. Empty when done. */
  culprits: NodeRef[];
}

export const TICK_CAP = 5000;

type Instr =
  | { op: 'assign'; line: number; name: string; e: Expr }
  | { op: 'write'; line: number; port: Port; e: Expr }
  | { op: 'pass'; line: number }
  | { op: 'jf'; line: number; cond: Expr; to: number } // evaluate cond; jump to `to` when it is false
  | { op: 'jmp'; to: number }; // free: never costs a step

/** Flattens the statement tree into jumps, so a node is just a program counter. */
function compile(prog: Stmt[], out: Instr[] = []): Instr[] {
  for (const s of prog) {
    if (s.k === 'while') {
      const top = out.length;
      const jf: Instr = { op: 'jf', line: s.line, cond: s.cond, to: -1 };
      out.push(jf);
      compile(s.body, out);
      out.push({ op: 'jmp', to: top });
      jf.to = out.length;
    } else if (s.k === 'if') {
      const ends: { op: 'jmp'; to: number }[] = [];
      for (const b of s.branches) {
        const jf: Instr = { op: 'jf', line: b.line, cond: b.cond, to: -1 };
        out.push(jf);
        compile(b.body, out);
        const end = { op: 'jmp' as const, to: -1 };
        out.push(end);
        ends.push(end);
        jf.to = out.length;
      }
      if (s.orelse) compile(s.orelse, out);
      for (const e of ends) e.to = out.length;
    } else if (s.k === 'assign') out.push({ op: 'assign', line: s.line, name: s.name, e: s.e });
    else if (s.k === 'write') out.push({ op: 'write', line: s.line, port: s.port, e: s.e });
    else out.push({ op: 'pass', line: s.line });
  }
  return out;
}

const DELTA: Record<Port, [number, number]> = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };

class Blocked {}
const BLOCKED = new Blocked();
class Fault {}
const FAULT = new Fault();

/** Normalises -0 to 0 so outputs compare cleanly. */
const n0 = (v: number) => v || 0;

interface Link {
  value: number | null;
  readableAt: number; // tick from which the value may be read
  writableAt: number; // tick from which the emptied link may be written again
}

/** The puzzle's code with option `choice` swapped in for the broken line, keeping that line's indentation. */
export function patched(puzzle: Puzzle, choice: number): string[][] {
  return puzzle.nodes.map((n, i) =>
    n.code.map((line, j) =>
      i === puzzle.broken.node && j === puzzle.broken.line ? /^ */.exec(line)![0] + puzzle.options[choice] : line,
    ),
  );
}

/** Runs the grid until fault, `target` outputs (when given), no progress, or the tick cap. */
function simulate(puzzle: Puzzle, code: string[][], target: number | null): RunResult {
  const progs = code.map((src) => compile(parse(src)));
  const nodes = puzzle.nodes.map((n, i) => ({ ...n, i, prog: progs[i], pc: skip(progs[i], 0), vars: new Map<string, number>() }));
  const at = (col: number, row: number) => nodes.find((n) => n.col === col && n.row === row);
  const order = [...nodes].sort((a, b) => a.row - b.row || a.col - b.col);
  const links = new Map<string, Link>();
  const link = (from: number, to: number) => {
    const key = `${from}>${to}`;
    let l = links.get(key);
    if (!l) links.set(key, (l = { value: null, readableAt: 0, writableAt: 0 }));
    return l;
  };
  const inputs = [...puzzle.inputs];
  const outputs: number[] = [];
  const trace: Tick[] = [];
  const lastRow = puzzle.rows - 1;

  for (let t = 0; t < TICK_CAP; t++) {
    const tick: Tick = { active: nodes.map(() => null), moves: [] };
    trace.push(tick);
    let faulted: number | null = null;

    for (const node of order) {
      const ins = node.prog[node.pc];
      if (!ins || ins.op === 'jmp') continue; // finished (skip() never leaves pc on a jmp)

      const neighbour = (port: Port) => at(node.col + DELTA[port][0], node.row + DELTA[port][1]);
      const read = (port: Port): number => {
        if (port === 'UP' && node.row === 0 && node.col === puzzle.inCol) {
          if (inputs.length === 0) throw BLOCKED;
          const v = inputs.shift()!;
          tick.moves.push({ from: 'IN', to: node.i, value: v });
          return v;
        }
        const src = neighbour(port);
        if (!src) throw BLOCKED;
        const l = link(src.i, node.i);
        if (l.value === null || l.readableAt > t) throw BLOCKED;
        const v = l.value;
        l.value = null;
        l.writableAt = t + 1;
        return v;
      };
      const evaluate = (e: Expr): number => {
        switch (e.k) {
          case 'num':
            return e.v;
          case 'var': {
            const v = node.vars.get(e.name);
            if (v === undefined) throw FAULT;
            return v;
          }
          case 'read':
            return read(e.port);
          case 'un':
            return e.op === '-' ? n0(-evaluate(e.e)) : evaluate(e.e) ? 0 : 1;
          case 'bin': {
            if (e.op === 'and') return evaluate(e.a) && evaluate(e.b) ? 1 : 0;
            if (e.op === 'or') return evaluate(e.a) || evaluate(e.b) ? 1 : 0;
            const a = evaluate(e.a);
            const b = evaluate(e.b);
            switch (e.op) {
              case '+': return n0(a + b);
              case '-': return n0(a - b);
              case '*': return n0(a * b);
              case '//':
                if (b === 0) throw FAULT;
                return n0(Math.floor(a / b));
              case '%':
                if (b === 0) throw FAULT;
                return n0(a - b * Math.floor(a / b));
              case '^': return a ^ b;
              case '==': return a === b ? 1 : 0;
              case '!=': return a !== b ? 1 : 0;
              case '<': return a < b ? 1 : 0;
              case '>': return a > b ? 1 : 0;
              case '<=': return a <= b ? 1 : 0;
              case '>=': return a >= b ? 1 : 0;
            }
          }
        }
      };

      try {
        if (ins.op === 'pass') node.pc++;
        else if (ins.op === 'assign') {
          node.vars.set(ins.name, evaluate(ins.e));
          node.pc++;
        } else if (ins.op === 'jf') node.pc = evaluate(ins.cond) ? node.pc + 1 : ins.to;
        else {
          // write: check the destination first, so a blocked write never consumes its read
          const toOut = ins.port === 'DOWN' && node.row === lastRow && node.col === puzzle.outCol;
          const dst = toOut ? null : neighbour(ins.port);
          if (!toOut && (!dst || link(node.i, dst.i).value !== null || link(node.i, dst.i).writableAt > t)) throw BLOCKED;
          const v = evaluate(ins.e);
          if (toOut) {
            outputs.push(v);
            tick.moves.push({ from: node.i, to: 'OUT', value: v });
          } else {
            const l = link(node.i, dst!.i);
            l.value = v;
            l.readableAt = t + 1;
            tick.moves.push({ from: node.i, to: dst!.i, value: v });
          }
          node.pc++;
        }
        node.pc = skip(node.prog, node.pc);
        tick.active[node.i] = ins.line;
      } catch (err) {
        if (err === BLOCKED) continue;
        if (err === FAULT) {
          tick.active[node.i] = ins.line;
          faulted = node.i;
          break;
        }
        throw err;
      }
    }

    if (faulted !== null) return { outputs, status: 'fault', trace, culprits: [faulted] };
    if (target !== null && outputs.length >= target) return { outputs, status: 'done', trace, culprits: [] };
    if (tick.active.every((a) => a === null)) return { outputs, status: 'stalled', trace, culprits: nodes.map((n) => n.i) };
  }
  const last = trace[trace.length - 1];
  const stuck = nodes.filter((n) => last.active[n.i] === null).map((n) => n.i);
  return { outputs, status: 'stalled', trace, culprits: stuck.length > 0 ? stuck : nodes.map((n) => n.i) };
}

/** Follows free jumps so the program counter always rests on a real step (or past the end). */
function skip(prog: Instr[], pc: number): number {
  while (prog[pc]?.op === 'jmp') pc = (prog[pc] as { to: number }).to;
  return pc;
}

/** The correct output: the answer option run until the grid goes quiet. Never hand-written. */
export function expected(puzzle: Puzzle): number[] {
  return simulate(puzzle, patched(puzzle, puzzle.answer), null).outputs;
}

/** Runs the puzzle with option `choice` patched in, stopping once OUT holds as many values as expected. */
export function runGrid(puzzle: Puzzle, choice: number): RunResult {
  return simulate(puzzle, patched(puzzle, choice), expected(puzzle).length);
}
