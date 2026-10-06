# Router Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Router Repair, a TIS-100-style puzzle cabinet in the **learn** category. Each puzzle shows a small grid of router nodes running a tiny Python subset with one corrupted line. The player picks one of 3 patches, and the patched grid really runs so the player can watch values flow from IN to OUT. It plugs into the live hub through the existing `GameModule` contract.

**Architecture:** Everything is DOM, with no Phaser. `parse.ts` turns a node's source lines into a statement tree. `run.ts` compiles each tree to a flat instruction list and runs every node in lock-step over one-value links, returning outputs, a status and a per-tick trace. `puzzles.ts` is pure data; EXPECTED is always derived by running the answer, never hand-written. `logic.ts` holds the pure run rules (deck, clock, scoring, phases). `index.ts` draws the grid, replays traces and maps keys; `repair.css` styles it.

**Tech Stack:** Vite 8, TypeScript strict, Vitest (jsdom), Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-router-repair-design.md`

**Starting point:** branch `router-repair` (from `main`, holding the spec commit). Every code block below was built and checked in a prototype copy of the repo: `npm run typecheck` is clean, `npm test` passes (33 files, 332 tests), `npm run build` passes (the repair chunk is about 30 kB) and `npx playwright test` passes (23 tests). The layout was checked in 1920×1080 screenshots of every grid shape.

## Global Constraints

- The game contract is unchanged: `createGame(): GameModule { mount(container, ctx), unmount() }`. Input goes only through `ctx.input.onKey` (plus DOM click events on the game's own option rows), and sound only through `ctx.audio.sfx`.
- The stage is a fixed 1920×1080. CSS uses px and the theme tokens (`var(--c-*)`, `var(--f-*)`).
- `?seed=N` fixes the deck order.
- Code is coloured with `highlight()` from `src/games/bughunt/highlight` and inserted as text only, never `innerHTML`.
- `unmount()` leaves nothing behind: no listeners, DOM, timers or rAF loops (the 20-cycle leak test enforces this). Use a `tornDown` guard as Bug Hunt does.
- `parse.ts`, `run.ts`, `puzzles.ts` and `logic.ts` are pure: no DOM, no timers.
- Commands: `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test` (it builds and serves the preview on port 4173 itself). The shell is zsh, so quote globs.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not push or merge.

## Rulings carried into this plan

- **`RunResult.culprits`:** an extension to the spec's `RunResult`. It lists the nodes to badge when a run fails: the faulted node, or every node stuck in the last tick. It is empty when the run is `done`.
- **Restored with auto-solves:** reaching the end of the deck counts as NETWORK RESTORED (with the time bonus) even if some puzzles were auto-solved.
- **FIXED:** counts only the player's own correct patches, never auto-solves.
- **Whole seconds:** `data-time` and the HUD TIME show `Math.ceil(time)`, so the display reads 0 only when the run is really out of time.
- **Clock:** the rAF loop advances `run.tick(dt)` with `dt` capped at 0.25 s, so a stalled tab doesn't eat the clock in one jump.
- **Hint after a wrong patch:** the hint stays visible when the player returns to `pick`, so it can be reread while choosing again.
- **Goal placement:** the title and goal sit in one line across the top (under the HUD) instead of above the right-hand columns. A long goal there gets the full width; the right side keeps the room for INPUT / EXPECTED / ACTUAL.
- **Chip pile-up:** a chip's flight is tied to the tick length (`--ms`, up to 150 ms), so it finishes within one tick; each animated tick still removes the previous chips before adding its own. The IN / OUT labels sit 32 px to the right of the chip path so chips never cover them.
- **Count updates:** adding a cabinet changes three existing counts: the registry unit test (8 → 9 cabinets, 9 → 10 with selftest), the carousel unit test (`prev()` from 0 wraps to index 8, previously 7) and the hub e2e (8 → 9 cabinets). The e2e `launch` helper's rotation loop grows from 9 to 10 steps.
- **Fallback if time runs short:** ship with 12 puzzles (4 per tier) by deleting puzzles and changing the counts in `repair-puzzles.test.ts`. Not planned; only if the 10-08 deadline forces it.

## File map

| File | Task | Role |
|---|---|---|
| `src/games/repair/parse.ts` | 1 | `parse(src)`, `ParseError`, `Program`, `Stmt`, `Expr`, `Port`, `PORTS`, `BinOp` |
| `src/games/repair/run.ts` | 2 | `runGrid`, `expected`, `patched`, `TICK_CAP`, `RunResult`, `Tick`, `Move`, `NodeRef`, `RunStatus` |
| `src/games/repair/puzzles.ts` | 2 (interface stub), 3 (content) | `Puzzle`, `PUZZLES` (18) |
| `src/games/repair/logic.ts` | 4 | `RepairRun`, `buildDeck`, `firstTryPoints`, constants, `Phase`, `Ending`, `Outcome` |
| `src/games/repair/index.ts`, `repair.css` | 5 | mount/unmount, grid drawing, playback, styles |
| `src/main.ts`, `src/games/registry.ts`, `src/core/ui/icons.ts` | 5 | CSS import, cabinet entry, cabinet icon |
| `tests/unit/repair-parse.test.ts` | 1 | parser |
| `tests/unit/repair-run.test.ts` | 2 | scheduler, links, statuses, trace |
| `tests/unit/repair-puzzles.test.ts` | 3 | content safety |
| `tests/unit/repair-logic.test.ts` | 4 | clock, scoring, deck, phases |
| `tests/unit/registry.test.ts`, `tests/unit/carousel.test.ts`, `tests/e2e/hub.spec.ts`, `tests/e2e/games.spec.ts` | 5 | count updates, repair e2e, leak loop |

---

### Task 1: Parser

**Files:**
- Create: `src/games/repair/parse.ts`
- Test: `tests/unit/repair-parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Port = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'`; `PORTS: readonly Port[]`.
  - `type BinOp`; `type Expr` (`num`, `var`, `read`, `un`, `bin`); `type Stmt` (`assign`, `write`, `pass`, `if` with `branches` and `orelse`, `while`). Every statement and branch carries `line`, the 0-based source line index.
  - `type Program = Stmt[]`.
  - `class ParseError extends Error { readonly line: number }` (0-based; the message shows it 1-based as `line N: ...`).
  - `parse(src: string[]): Program`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/repair-parse.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { parse, ParseError, type Expr } from '../../src/games/repair/parse';

/** The expression on the right of `x = <src>`. */
const expr = (src: string): Expr => {
  const [s] = parse([`x = ${src}`]);
  if (s.k !== 'assign') throw new Error('not an assignment');
  return s.e;
};

/** Renders an expression with full brackets, so precedence is easy to assert. */
const show = (e: Expr): string => {
  switch (e.k) {
    case 'num':
      return String(e.v);
    case 'var':
      return e.name;
    case 'read':
      return `read(${e.port})`;
    case 'un':
      return e.op === 'not' ? `(not ${show(e.e)})` : `(-${show(e.e)})`;
    case 'bin':
      return `(${show(e.a)} ${e.op} ${show(e.b)})`;
  }
};

const lineOf = (src: string[]): number => {
  try {
    parse(src);
  } catch (err) {
    if (err instanceof ParseError) return err.line;
    throw err;
  }
  throw new Error('parsed without error');
};

describe('repair parser', () => {
  it('parses every statement form', () => {
    const prog = parse([
      '# a comment',
      'n = 0',
      'while True:',
      '    x = read(UP)   # trailing comment',
      '',
      '    if x > 3:',
      '        write(DOWN, x)',
      '    elif x == 0:',
      '        pass',
      '    else:',
      '        n = n + 1',
    ]);
    expect(prog.map((s) => s.k)).toEqual(['assign', 'while']);
    const loop = prog[1];
    if (loop.k !== 'while') throw new Error();
    expect(loop.line).toBe(2);
    expect(loop.body.map((s) => s.k)).toEqual(['assign', 'if']);
    const branch = loop.body[1];
    if (branch.k !== 'if') throw new Error();
    expect(branch.branches.map((b) => b.line)).toEqual([5, 7]);
    expect(branch.branches[0].body[0]).toMatchObject({ k: 'write', line: 6, port: 'DOWN' });
    expect(branch.branches[1].body[0]).toMatchObject({ k: 'pass', line: 8 });
    expect(branch.orelse?.[0]).toMatchObject({ k: 'assign', line: 10, name: 'n' });
  });

  it('parses every expression form', () => {
    expect(show(expr('read(LEFT)'))).toBe('read(LEFT)');
    expect(show(expr('True'))).toBe('1');
    expect(show(expr('False'))).toBe('0');
    expect(show(expr('-x'))).toBe('(-x)');
    expect(show(expr('not x'))).toBe('(not x)');
    expect(show(expr('(a + b) * c'))).toBe('((a + b) * c)');
    for (const op of ['+', '-', '*', '//', '%', '^', '==', '!=', '<', '>', '<=', '>=', 'and', 'or']) {
      expect(show(expr(`a ${op} b`))).toBe(`(a ${op} b)`);
    }
  });

  it('follows Python precedence', () => {
    expect(show(expr('a + b * c'))).toBe('(a + (b * c))');
    expect(show(expr('a - b - c'))).toBe('((a - b) - c)');
    expect(show(expr('-a * b'))).toBe('((-a) * b)');
    expect(show(expr('a ^ b + c'))).toBe('(a ^ (b + c))');
    expect(show(expr('a < b ^ c'))).toBe('(a < (b ^ c))');
    expect(show(expr('not a == b'))).toBe('(not (a == b))');
    expect(show(expr('a or b and c'))).toBe('(a or (b and c))');
    expect(show(expr('not a and b'))).toBe('((not a) and b)');
    expect(show(expr('a % b // c'))).toBe('((a % b) // c)');
  });

  it('rejects mistakes with the right line number', () => {
    expect(lineOf(['x = 1', '  y = 2'])).toBe(1); // not a multiple of 4
    expect(lineOf(['while True:', '\tx = 1'])).toBe(1); // tab
    expect(lineOf(['x = 1', 'x = 2', '    y = 3'])).toBe(2); // unexpected indent
    expect(lineOf(['x = 1', 'print(x)'])).toBe(1); // unknown statement
    expect(lineOf(['x = UP'])).toBe(0); // port used as a value
    expect(lineOf(['x = 1', 'UP = 2'])).toBe(1); // port assigned
    expect(lineOf(['x = 1', 'while True', '    x = 2'])).toBe(1); // missing colon
    expect(lineOf(['if x:', 'y = 1'])).toBe(0); // missing block
    expect(lineOf(['x = 1', 'else:', '    x = 2'])).toBe(1); // else without if
    expect(lineOf(['x = read(UP) + read(LEFT)'])).toBe(0); // two reads
    expect(lineOf(['x = a < b < c'])).toBe(0); // chained comparison
    expect(lineOf(['x = 1 $ 2'])).toBe(0); // unknown character
    expect(lineOf(['write(SIDEWAYS, 1)'])).toBe(0); // bad port
  });

  it('shows 1-based line numbers in messages', () => {
    expect(() => parse(['x = 1', 'print(x)'])).toThrow('line 2: unknown statement');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/repair-parse.test.ts`
Expected: FAIL, because `src/games/repair/parse` does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/games/repair/parse.ts` (full file):

```ts
// Parser for Router Repair's tiny Python subset. Pure: lines of source in, a statement tree out.

export type Port = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
export const PORTS: readonly Port[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

export type BinOp = 'or' | 'and' | '==' | '!=' | '<' | '>' | '<=' | '>=' | '^' | '+' | '-' | '*' | '//' | '%';

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'read'; port: Port }
  | { k: 'un'; op: '-' | 'not'; e: Expr }
  | { k: 'bin'; op: BinOp; a: Expr; b: Expr };

/** `line` is the 0-based index into the source lines, so a trace can point at it. */
export type Stmt =
  | { k: 'assign'; line: number; name: string; e: Expr }
  | { k: 'write'; line: number; port: Port; e: Expr }
  | { k: 'pass'; line: number }
  | { k: 'if'; branches: { line: number; cond: Expr; body: Stmt[] }[]; orelse: Stmt[] | null }
  | { k: 'while'; line: number; cond: Expr; body: Stmt[] };

export type Program = Stmt[];

export class ParseError extends Error {
  /** 0-based source line. The message shows it 1-based. */
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`line ${line + 1}: ${message}`);
    this.name = 'ParseError';
  }
}

const KEYWORDS = new Set(['if', 'elif', 'else', 'while', 'pass', 'not', 'and', 'or', 'True', 'False', 'read', 'write']);
const COMPARE = new Set(['==', '!=', '<', '>', '<=', '>=']);
const TOKEN = /\s*(?:(\d+)|([A-Za-z_]\w*)|(\/\/|==|!=|<=|>=|[-+*%^<>=():,]))/y;

interface Line {
  line: number;
  level: number;
  toks: string[];
}

function tokenize(text: string, line: number): string[] {
  const toks: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < text.length) {
    if (text.slice(TOKEN.lastIndex).trim() === '') break;
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(text);
    if (!m) throw new ParseError(line, `unexpected character '${text.slice(at).trim()[0]}'`);
    toks.push(m[1] ?? m[2] ?? m[3]);
  }
  return toks;
}

function splitLines(src: string[]): Line[] {
  const out: Line[] = [];
  src.forEach((raw, line) => {
    const hash = raw.indexOf('#');
    const text = hash >= 0 ? raw.slice(0, hash) : raw;
    if (text.trim() === '') return;
    const lead = /^[ \t]*/.exec(text)![0];
    if (lead.includes('\t')) throw new ParseError(line, 'use 4 spaces to indent, not tabs');
    if (lead.length % 4 !== 0) throw new ParseError(line, 'indentation must be a multiple of 4 spaces');
    out.push({ line, level: lead.length / 4, toks: tokenize(text, line) });
  });
  return out;
}

/** Expression parser over one line's tokens. Precedence climbs from `or` (loosest) to atoms. */
class ExprParser {
  private i = 0;
  reads = 0;

  constructor(
    private readonly toks: string[],
    private readonly line: number,
  ) {}

  peek(): string | undefined {
    return this.toks[this.i];
  }

  next(): string | undefined {
    return this.toks[this.i++];
  }

  expect(tok: string): void {
    const got = this.next();
    if (got !== tok) throw new ParseError(this.line, got === undefined ? `expected '${tok}'` : `expected '${tok}' but found '${got}'`);
  }

  atEnd(): boolean {
    return this.i >= this.toks.length;
  }

  port(): Port {
    const t = this.next();
    if (!PORTS.includes(t as Port)) throw new ParseError(this.line, `expected a port (UP, DOWN, LEFT, RIGHT) but found '${t ?? 'end of line'}'`);
    return t as Port;
  }

  expr(): Expr {
    return this.or();
  }

  private or(): Expr {
    let a = this.and();
    while (this.peek() === 'or') {
      this.next();
      a = { k: 'bin', op: 'or', a, b: this.and() };
    }
    return a;
  }

  private and(): Expr {
    let a = this.not();
    while (this.peek() === 'and') {
      this.next();
      a = { k: 'bin', op: 'and', a, b: this.not() };
    }
    return a;
  }

  private not(): Expr {
    if (this.peek() === 'not') {
      this.next();
      return { k: 'un', op: 'not', e: this.not() };
    }
    return this.compare();
  }

  private compare(): Expr {
    const a = this.xor();
    const op = this.peek();
    if (op === undefined || !COMPARE.has(op)) return a;
    this.next();
    const b = this.xor();
    const again = this.peek();
    if (again !== undefined && COMPARE.has(again)) throw new ParseError(this.line, 'chained comparisons are not supported');
    return { k: 'bin', op: op as BinOp, a, b };
  }

  private xor(): Expr {
    let a = this.sum();
    while (this.peek() === '^') {
      this.next();
      a = { k: 'bin', op: '^', a, b: this.sum() };
    }
    return a;
  }

  private sum(): Expr {
    let a = this.term();
    for (let op = this.peek(); op === '+' || op === '-'; op = this.peek()) {
      this.next();
      a = { k: 'bin', op, a, b: this.term() };
    }
    return a;
  }

  private term(): Expr {
    let a = this.unary();
    for (let op = this.peek(); op === '*' || op === '//' || op === '%'; op = this.peek()) {
      this.next();
      a = { k: 'bin', op, a, b: this.unary() };
    }
    return a;
  }

  private unary(): Expr {
    if (this.peek() === '-') {
      this.next();
      return { k: 'un', op: '-', e: this.unary() };
    }
    return this.atom();
  }

  private atom(): Expr {
    const t = this.next();
    if (t === undefined) throw new ParseError(this.line, 'expected a value');
    if (/^\d+$/.test(t)) return { k: 'num', v: Number(t) };
    if (t === 'True') return { k: 'num', v: 1 };
    if (t === 'False') return { k: 'num', v: 0 };
    if (t === '(') {
      const e = this.expr();
      this.expect(')');
      return e;
    }
    if (t === 'read') {
      this.expect('(');
      const port = this.port();
      this.expect(')');
      if (++this.reads > 1) throw new ParseError(this.line, 'only one read() per line');
      return { k: 'read', port };
    }
    if (PORTS.includes(t as Port)) throw new ParseError(this.line, `${t} is a port: use it only inside read() or write()`);
    if (/^[A-Za-z_]/.test(t) && !KEYWORDS.has(t)) return { k: 'var', name: t };
    throw new ParseError(this.line, `unexpected '${t}'`);
  }
}

/** Parses a whole condition or value: every token must be used. */
function fullExpr(p: ExprParser, line: number): Expr {
  const e = p.expr();
  if (!p.atEnd()) throw new ParseError(line, `unexpected '${p.peek()}'`);
  return e;
}

/** `if x:` style header: keyword, condition, then a final ':'. */
function header(l: Line): Expr {
  if (l.toks[l.toks.length - 1] !== ':') throw new ParseError(l.line, `expected ':' at the end of the ${l.toks[0]} line`);
  return fullExpr(new ExprParser(l.toks.slice(1, -1), l.line), l.line);
}

function simple(l: Line): Stmt {
  const [first, second] = l.toks;
  if (first === 'pass') {
    if (l.toks.length > 1) throw new ParseError(l.line, `unexpected '${second}'`);
    return { k: 'pass', line: l.line };
  }
  if (first === 'write' && second === '(') {
    const p = new ExprParser(l.toks.slice(2), l.line);
    const port = p.port();
    p.expect(',');
    const e = p.expr();
    p.expect(')');
    if (!p.atEnd()) throw new ParseError(l.line, `unexpected '${p.peek()}'`);
    return { k: 'write', line: l.line, port, e };
  }
  if (second === '=' && /^[A-Za-z_]\w*$/.test(first)) {
    if (PORTS.includes(first as Port)) throw new ParseError(l.line, `${first} is a port: use it only inside read() or write()`);
    if (KEYWORDS.has(first)) throw new ParseError(l.line, `can't assign to '${first}'`);
    return { k: 'assign', line: l.line, name: first, e: fullExpr(new ExprParser(l.toks.slice(2), l.line), l.line) };
  }
  throw new ParseError(l.line, 'unknown statement');
}

function block(lines: Line[], at: { i: number }, level: number): Stmt[] {
  const out: Stmt[] = [];
  while (at.i < lines.length) {
    const l = lines[at.i];
    if (l.level < level) break;
    if (l.level > level) throw new ParseError(l.line, 'unexpected indent');
    const kw = l.toks[0];
    if (kw === 'elif' || kw === 'else') throw new ParseError(l.line, `'${kw}' without a matching 'if'`);
    at.i++;
    if (kw === 'while') {
      out.push({ k: 'while', line: l.line, cond: header(l), body: body(lines, at, l) });
    } else if (kw === 'if') {
      const branches = [{ line: l.line, cond: header(l), body: body(lines, at, l) }];
      let orelse: Stmt[] | null = null;
      while (at.i < lines.length && lines[at.i].level === level) {
        const n = lines[at.i];
        if (n.toks[0] === 'elif') {
          at.i++;
          branches.push({ line: n.line, cond: header(n), body: body(lines, at, n) });
        } else if (n.toks[0] === 'else') {
          at.i++;
          if (n.toks.length !== 2 || n.toks[1] !== ':') throw new ParseError(n.line, "expected 'else:'");
          orelse = body(lines, at, n);
          break;
        } else break;
      }
      out.push({ k: 'if', branches, orelse });
    } else {
      out.push(simple(l));
    }
  }
  return out;
}

/** The indented block after a header line. It must exist and sit exactly one level deeper. */
function body(lines: Line[], at: { i: number }, head: Line): Stmt[] {
  const n = lines[at.i];
  if (!n || n.level !== head.level + 1) throw new ParseError(head.line, `expected an indented block after '${head.toks[0]}'`);
  return block(lines, at, head.level + 1);
}

/** Parses a node's source. Throws ParseError (with a 0-based line) on anything outside the subset. */
export function parse(src: string[]): Program {
  const lines = splitLines(src);
  const at = { i: 0 };
  if (lines.length > 0 && lines[0].level !== 0) throw new ParseError(lines[0].line, 'unexpected indent');
  return block(lines, at, 0);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/repair-parse.test.ts && npm run typecheck`
Expected: 5 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/games/repair/parse.ts tests/unit/repair-parse.test.ts
git commit -m "feat(repair): parser for the node-code Python subset" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Grid runner

**Files:**
- Create: `src/games/repair/run.ts`, `src/games/repair/puzzles.ts` (interface stub only; Task 3 replaces the whole file)
- Test: `tests/unit/repair-run.test.ts`

**Interfaces:**
- Consumes: `parse`, `Expr`, `Port`, `Stmt` from `./parse` (Task 1).
- Produces:
  - `interface Puzzle` in `./puzzles` (fields: `id`, `tier`, `title`, `goal`, `display`, `cols`, `rows`, `inCol`, `outCol`, `nodes`, `broken`, `glitch`, `options`, `answer`, `hints`, `inputs`) and `PUZZLES: Puzzle[]` (empty until Task 3).
  - `type NodeRef = number` (index into `puzzle.nodes`).
  - `interface Move { from: NodeRef | 'IN'; to: NodeRef | 'OUT'; value: number }`.
  - `interface Tick { active: (number | null)[]; moves: Move[] }`.
  - `type RunStatus = 'done' | 'stalled' | 'fault'`.
  - `interface RunResult { outputs: number[]; status: RunStatus; trace: Tick[]; culprits: NodeRef[] }`.
  - `TICK_CAP = 5000`.
  - `patched(puzzle, choice): string[][]` (every node's code with option `choice` swapped in, keeping the broken line's indentation).
  - `expected(puzzle): number[]`.
  - `runGrid(puzzle, choice): RunResult`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/repair-run.test.ts` (full file):

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/repair-run.test.ts`
Expected: FAIL, because `src/games/repair/run` does not exist.

- [ ] **Step 3: Add the Puzzle interface**

`run.ts` needs the `Puzzle` type, and the content arrives in Task 3. Create `src/games/repair/puzzles.ts` with only the interface and an empty list (full file):

```ts
// Router Repair's puzzles. Task 3 fills PUZZLES.

export interface Puzzle {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  goal: string;
  display: 'num' | 'letter';
  cols: 1 | 2 | 3;
  rows: 1 | 2;
  inCol: number;
  outCol: number;
  nodes: { col: number; row: number; code: string[] }[];
  /** Index into nodes, then into that node's code. code[line] holds the indentation plus `glitch`. */
  broken: { node: number; line: number };
  glitch: string;
  /** Candidate replacement lines, without indentation. */
  options: [string, string, string];
  answer: 0 | 1 | 2;
  hints: [string, string, string];
  inputs: number[];
}

export const PUZZLES: Puzzle[] = [];
```

- [ ] **Step 4: Implement the runner**

Create `src/games/repair/run.ts` (full file):

```ts
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
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/repair-run.test.ts tests/unit/repair-parse.test.ts && npm run typecheck`
Expected: 17 tests pass (12 run + 5 parse); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/games/repair/run.ts src/games/repair/puzzles.ts tests/unit/repair-run.test.ts
git commit -m "feat(repair): lock-step grid runner with links, trace and culprits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The 18 puzzles

**Files:**
- Modify: `src/games/repair/puzzles.ts` (replace the Task 2 stub with the full file)
- Test: `tests/unit/repair-puzzles.test.ts`

**Interfaces:**
- Consumes: `Puzzle` (Task 2 stub, unchanged here); `parse` (Task 1); `expected`, `patched`, `runGrid` (Task 2).
- Produces: `PUZZLES: Puzzle[]`, 18 puzzles in tier order: 6 one-node puzzles, 6 two-node pipelines, 6 three- or four-node grids. Puzzle ids are unique. `index.ts` and the e2e tests look puzzles up by `id`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/repair-puzzles.test.ts` (full file):

```ts
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/repair-puzzles.test.ts`
Expected: FAIL on "has 18 puzzles" (the stub list is empty).

- [ ] **Step 3: Write the puzzles**

Replace `src/games/repair/puzzles.ts` with this full file. The `Puzzle` interface is the same as in Task 2. Each puzzle's `code[broken.line]` holds the broken line's indentation followed by `glitch`; every puzzle's inputs expose every wrong option.

```ts
// Router Repair's 18 puzzles, 6 per tier. EXPECTED is never written here: run.ts derives it from the answer.

export interface Puzzle {
  id: string;
  tier: 1 | 2 | 3;
  title: string;
  goal: string;
  display: 'num' | 'letter';
  cols: 1 | 2 | 3;
  rows: 1 | 2;
  inCol: number;
  outCol: number;
  nodes: { col: number; row: number; code: string[] }[];
  /** Index into nodes, then into that node's code. code[line] holds the indentation plus `glitch`. */
  broken: { node: number; line: number };
  glitch: string;
  /** Candidate replacement lines, without indentation. */
  options: [string, string, string];
  answer: 0 | 1 | 2;
  hints: [string, string, string];
  inputs: number[];
}

/** 'HELLO' → [7, 4, 11, 11, 14]: letters as 0–25. */
const letters = (s: string) => [...s].map((c) => c.charCodeAt(0) - 65);

/** Forwards every value from one port to another, forever. */
const relay = (from: string, to: string) => ['while True:', `    write(${to}, read(${from}))`];

export const PUZZLES: Puzzle[] = [
  // ---------------- Tier 1: one node ----------------
  {
    id: 'caesar',
    tier: 1,
    title: 'Caesar Shift',
    goal: 'Encrypt: shift every letter forward by 3, wrapping Z back to A.',
    display: 'letter',
    cols: 1,
    rows: 1,
    inCol: 0,
    outCol: 0,
    nodes: [{ col: 0, row: 0, code: ['while True:', '    x = read(UP)', '    ▓▓░▓▓(¤▓▓▓, (x ░ 3) ▓ 2░)'] }],
    broken: { node: 0, line: 2 },
    glitch: '▓▓░▓▓(¤▓▓▓, (x ░ 3) ▓ 2░)',
    options: ['write(DOWN, (x + 3) % 26)', 'write(DOWN, (x - 3) % 26)', 'write(DOWN, x + 3)'],
    answer: 0,
    hints: [
      'Add 3, then % 26 wraps X, Y, Z back around to A, B, C.',
      'That shifts backwards: decrypting, not encrypting.',
      "No wrap: X, Y and Z come out as 26, 27 and 28, which aren't letters.",
    ],
    inputs: letters('HELLOXYZ'),
  },
  {
    id: 'double',
    tier: 1,
    title: 'Bandwidth Doubler',
    goal: 'Double every packet size.',
    display: 'num',
    cols: 1,
    rows: 1,
    inCol: 0,
    outCol: 0,
    nodes: [{ col: 0, row: 0, code: ['while True:', '    size = read(UP)', '    ▓▓▓░ = ▓▓¤░ ▓ ░', '    write(DOWN, size)'] }],
    broken: { node: 0, line: 2 },
    glitch: '▓▓▓░ = ▓▓¤░ ▓ ░',
    options: ['size = size + 2', 'size = size * 2', 'size = size // 2'],
    answer: 1,
    hints: [
      'Adding 2 only doubles a size of 2. Doubling means multiplying.',
      '* 2 doubles every size.',
      '// 2 halves the size instead of doubling it.',
    ],
    inputs: [3, 5, 12, 7, 40, 1],
  },
  {
    id: 'checksum-key',
    tier: 1,
    title: 'Checksum Key',
    goal: 'Add the secret KEY to every value.',
    display: 'num',
    cols: 1,
    rows: 1,
    inCol: 0,
    outCol: 0,
    nodes: [{ col: 0, row: 0, code: ['KEY = 42', 'while True:', '    v = read(UP)', '    ░▓▓▓▓(▓¤▓░, v ▓ ░▓▓)'] }],
    broken: { node: 0, line: 3 },
    glitch: '░▓▓▓▓(▓¤▓░, v ▓ ░▓▓)',
    options: ['write(DOWN, v + key)', 'write(DOWN, KEY)', 'write(DOWN, v + KEY)'],
    answer: 2,
    hints: [
      'Names are case-sensitive: key is not KEY, so the node faults on an unknown name.',
      'That sends the key itself and throws the value away.',
      'v + KEY adds the secret key to each value.',
    ],
    inputs: [10, 7, 200, 0, 58],
  },
  {
    id: 'clamp',
    tier: 1,
    title: 'Signal Clamp',
    goal: 'Cap every reading at 100: anything bigger becomes 100.',
    display: 'num',
    cols: 1,
    rows: 1,
    inCol: 0,
    outCol: 0,
    nodes: [
      { col: 0, row: 0, code: ['while True:', '    v = read(UP)', '    ▓░ ▓ ¤ ░▓▓:', '        v = 100', '    write(DOWN, v)'] },
    ],
    broken: { node: 0, line: 2 },
    glitch: '▓░ ▓ ¤ ░▓▓:',
    options: ['if v < 100:', 'if v > 100:', 'if v == 100:'],
    answer: 1,
    hints: [
      'That turns every small reading into 100 and lets the big ones through.',
      'Only readings over 100 get replaced with 100.',
      '== only catches exactly 100, so 250 and 130 slip through.',
    ],
    inputs: [40, 250, 100, 7, 130, 99],
  },
  {
    id: 'offset',
    tier: 1,
    title: 'Port Offset',
    goal: 'The firmware stores ports with 1000 added. Subtract it to get the real port.',
    display: 'num',
    cols: 1,
    rows: 1,
    inCol: 0,
    outCol: 0,
    nodes: [{ col: 0, row: 0, code: ['while True:', '    p = read(UP)', '    ▓▓▓░▓(░▓▓▓, ▓ ¤ ▓░▓▓)'] }],
    broken: { node: 0, line: 2 },
    glitch: '▓▓▓░▓(░▓▓▓, ▓ ¤ ▓░▓▓)',
    options: ['write(DOWN, p - 1000)', 'write(DOWN, 1000 - p)', 'write(DOWN, p - 100)'],
    answer: 0,
    hints: [
      'p - 1000 strips the offset: 1080 becomes port 80.',
      'Backwards: 1000 - p gives negative ports.',
      'The offset is 1000, not 100.',
    ],
    inputs: [1080, 1443, 1022, 1025, 1000],
  },
  {
    id: 'count',
    tier: 1,
    title: 'Packet Counter',
    goal: 'Number the packets: send 1 for the first, 2 for the second, and so on.',
    display: 'num',
    cols: 1,
    rows: 1,
    inCol: 0,
    outCol: 0,
    nodes: [{ col: 0, row: 0, code: ['n = 0', 'while True:', '    x = read(UP)', '    ░ = ▓ ¤ ▓', '    write(DOWN, n)'] }],
    broken: { node: 0, line: 3 },
    glitch: '░ = ▓ ¤ ▓',
    options: ['n = 1', 'n = x + 1', 'n = n + 1'],
    answer: 2,
    hints: [
      'n never grows: every packet is numbered 1.',
      "That uses the packet's value, not how many packets have arrived.",
      'n = n + 1 counts up by one per packet.',
    ],
    inputs: [9, 4, 7, 2, 8],
  },

  // ---------------- Tier 2: two nodes ----------------
  {
    id: 'xor',
    tier: 2,
    title: 'XOR Decrypt',
    goal: 'Decrypt each letter by XOR-ing it with the key 5, then pass it on.',
    display: 'letter',
    cols: 2,
    rows: 1,
    inCol: 0,
    outCol: 1,
    nodes: [
      { col: 0, row: 0, code: ['while True:', '    c = read(UP)', '    ▓▓▓░▓(░▓¤▓▓, c ▓ 5)'] },
      { col: 1, row: 0, code: ['while True:', '    p = read(LEFT)', '    write(DOWN, p)'] },
    ],
    broken: { node: 0, line: 2 },
    glitch: '▓▓▓░▓(░▓¤▓▓, c ▓ 5)',
    options: ['write(DOWN, c ^ 5)', 'write(RIGHT, c ^ 5)', 'write(RIGHT, c)'],
    answer: 1,
    hints: [
      "This node has no link below it: OUT is under the other node. The write waits forever.",
      'Decrypt with ^ 5 and hand it RIGHT to the node above OUT.',
      'Forwards the ciphertext without decrypting it.',
    ],
    inputs: letters('PASSWORD').map((v) => v ^ 5),
  },
  {
    id: 'parity',
    tier: 2,
    title: 'Parity Bit',
    goal: 'After each value, send its parity bit: 0 if even, 1 if odd.',
    display: 'num',
    cols: 1,
    rows: 2,
    inCol: 0,
    outCol: 0,
    nodes: [
      { col: 0, row: 0, code: ['while True:', '    v = read(UP)', '    write(DOWN, v)'] },
      { col: 0, row: 1, code: ['while True:', '    v = read(UP)', '    write(DOWN, v)', '    ▓▓░▓▓(¤▓▓▓, v ░ ▓)'] },
    ],
    broken: { node: 1, line: 3 },
    glitch: '▓▓░▓▓(¤▓▓▓, v ░ ▓)',
    options: ['write(DOWN, v // 2)', 'write(UP, v % 2)', 'write(DOWN, v % 2)'],
    answer: 2,
    hints: [
      '// 2 halves the value. The remainder % 2 is the parity bit.',
      'UP sends the bit back to the first node, not out to OUT.',
      'v % 2 is the remainder after dividing by 2: 0 for even, 1 for odd.',
    ],
    inputs: [6, 7, 12, 3, 9],
  },
  {
    id: 'port-filter',
    tier: 2,
    title: 'Port Filter',
    goal: 'Let through only system ports, 0 to 1023. Drop everything above.',
    display: 'num',
    cols: 2,
    rows: 1,
    inCol: 0,
    outCol: 1,
    nodes: [
      { col: 0, row: 0, code: relay('UP', 'RIGHT') },
      { col: 1, row: 0, code: ['while True:', '    port = read(LEFT)', '    ▓▓ ░▓▓▓ ¤░ ▓▓▓▓:', '        write(DOWN, port)'] },
    ],
    broken: { node: 1, line: 2 },
    glitch: '▓▓ ░▓▓▓ ¤░ ▓▓▓▓:',
    options: ['if port <= 1023:', 'if port >= 1023:', 'if port < 1023:'],
    answer: 0,
    hints: [
      '<= 1023 keeps every port from 0 up to and including 1023.',
      'Backwards: that keeps the high ports and drops the system ones.',
      'Off by one: < 1023 drops port 1023, which is a system port.',
    ],
    inputs: [80, 8080, 443, 1023, 3389, 22, 1024, 53],
  },
  {
    id: 'checksum-pairs',
    tier: 2,
    title: 'Pair Checksum',
    goal: 'Add each pair of bytes and keep the checksum inside one byte (0–255).',
    display: 'num',
    cols: 1,
    rows: 2,
    inCol: 0,
    outCol: 0,
    nodes: [
      { col: 0, row: 0, code: ['while True:', '    a = read(UP)', '    b = read(UP)', '    write(DOWN, a + b)'] },
      { col: 0, row: 1, code: ['while True:', '    s = read(UP)', '    ▓░▓▓▓(▓▓¤▓, ▓ ░ ▓▓▓)'] },
    ],
    broken: { node: 1, line: 2 },
    glitch: '▓░▓▓▓(▓▓¤▓, ▓ ░ ▓▓▓)',
    options: ['write(DOWN, s // 256)', 'write(DOWN, s % 256)', 'write(DOWN, s)'],
    answer: 1,
    hints: [
      '// 256 keeps only the overflow, not the byte.',
      '% 256 wraps the sum so it fits in one byte.',
      'Sums like 300 and 510 are too big for one byte.',
    ],
    inputs: [200, 100, 17, 25, 255, 255, 90, 9],
  },
  {
    id: 'subnet',
    tier: 2,
    title: 'Subnet Mask',
    goal: 'Round each address down to the start of its block of 16.',
    display: 'num',
    cols: 2,
    rows: 1,
    inCol: 0,
    outCol: 1,
    nodes: [
      { col: 0, row: 0, code: ['while True:', '    ip = read(UP)', '    ▓▓▓▓░(▓░▓▓¤, ▓▓ ░▓ ▓▓)'] },
      { col: 1, row: 0, code: ['while True:', '    net = read(LEFT)', '    write(DOWN, net * 16)'] },
    ],
    broken: { node: 0, line: 2 },
    glitch: '▓▓▓▓░(▓░▓▓¤, ▓▓ ░▓ ▓▓)',
    options: ['write(LEFT, ip // 16)', 'write(RIGHT, ip // 16)', 'write(RIGHT, ip % 16)'],
    answer: 1,
    hints: [
      'There is no node to the LEFT, so the write waits forever.',
      '// 16 gives the block number, and the next node multiplies it back by 16.',
      '% 16 is the position inside the block, not the block itself.',
    ],
    inputs: [37, 200, 16, 75, 129, 250],
  },
  {
    id: 'threshold',
    tier: 2,
    title: 'Threshold Alarm',
    goal: 'Keep a running count of readings strictly over the LIMIT of 50.',
    display: 'num',
    cols: 1,
    rows: 2,
    inCol: 0,
    outCol: 0,
    nodes: [
      { col: 0, row: 0, code: ['LIMIT = 50', 'while True:', '    v = read(UP)', '    ▓▓▓░▓(▓¤▓▓, ▓ ░ ▓▓▓▓▓)'] },
      { col: 0, row: 1, code: ['total = 0', 'while True:', '    total = total + read(UP)', '    write(DOWN, total)'] },
    ],
    broken: { node: 0, line: 3 },
    glitch: '▓▓▓░▓(▓¤▓▓, ▓ ░ ▓▓▓▓▓)',
    options: ['write(DOWN, v >= LIMIT)', 'write(DOWN, v > LIMIT)', 'write(DOWN, v < LIMIT)'],
    answer: 1,
    hints: [
      '>= also counts a reading of exactly 50, which is not over the limit.',
      'v > LIMIT is 1 for readings over 50 and 0 otherwise, so the next node can add it up.',
      'That counts the readings under the limit.',
    ],
    inputs: [20, 75, 50, 90, 10, 51],
  },

  // ---------------- Tier 3: three or four nodes ----------------
  {
    id: 'route',
    tier: 3,
    title: 'Packet Router',
    goal: 'Send packets under 100 to OUT. Route the rest RIGHT into quarantine.',
    display: 'num',
    cols: 2,
    rows: 2,
    inCol: 0,
    outCol: 0,
    nodes: [
      {
        col: 0,
        row: 0,
        code: ['while True:', '    pkt = read(UP)', '    if pkt < 100:', '        write(DOWN, pkt)', '    else:', '        ▓░▓▓▓(░▓¤▓▓, ▓▓░)'],
      },
      { col: 1, row: 0, code: ['# quarantine', 'jailed = 0', 'while True:', '    bad = read(LEFT)', '    jailed = jailed + 1'] },
      { col: 0, row: 1, code: ['while True:', '    ok = read(UP)', '    write(DOWN, ok)'] },
    ],
    broken: { node: 0, line: 5 },
    glitch: '▓░▓▓▓(░▓¤▓▓, ▓▓░)',
    options: ['write(DOWN, pkt)', 'write(RIGHT, pkt)', 'write(LEFT, pkt)'],
    answer: 1,
    hints: [
      'That sends the big packets DOWN to OUT too, so nothing gets quarantined.',
      'Big packets go RIGHT to the quarantine node.',
      'There is no node to the LEFT: the router jams on the first big packet.',
    ],
    inputs: [12, 250, 40, 7, 999, 63, 101, 99],
  },
  {
    id: 'logins',
    tier: 3,
    title: 'Brute-Force Alarm',
    goal: 'Codes 401 are failed logins. Raise an alert (1) once 3 or more fail in a row.',
    display: 'num',
    cols: 2,
    rows: 2,
    inCol: 0,
    outCol: 1,
    nodes: [
      { col: 0, row: 0, code: ['while True:', '    code = read(UP)', '    write(RIGHT, code == 401)'] },
      {
        col: 1,
        row: 0,
        code: [
          'streak = 0',
          'while True:',
          '    failed = read(LEFT)',
          '    if failed:',
          '        streak = streak + 1',
          '    else:',
          '        ▓▓░▓▓▓ ¤ ▓',
          '    write(DOWN, streak)',
        ],
      },
      { col: 1, row: 1, code: ['while True:', '    n = read(UP)', '    write(DOWN, n >= 3)'] },
    ],
    broken: { node: 1, line: 6 },
    glitch: '▓▓░▓▓▓ ¤ ▓',
    options: ['pass', 'streak = 0', 'streak = streak - 1'],
    answer: 1,
    hints: [
      'A successful login never resets the streak, so old failures pile up.',
      'A success resets the streak to 0: only failures in a row count.',
      'One success should wipe the streak, not just knock one off.',
    ],
    inputs: [401, 401, 200, 401, 401, 401, 401, 200, 401],
  },
  {
    id: 'rate-limit',
    tier: 3,
    title: 'Rate Limiter',
    goal: 'Let at most 3 requests through per time window. A 0 starts a new window.',
    display: 'num',
    cols: 2,
    rows: 2,
    inCol: 0,
    outCol: 1,
    nodes: [
      { col: 0, row: 0, code: relay('UP', 'RIGHT') },
      {
        col: 1,
        row: 0,
        code: [
          'sent = 0',
          'while True:',
          '    req = read(LEFT)',
          '    if req == 0:',
          '        sent = 0',
          '    ▓▓░▓ ▓▓¤▓ ░ ▓:',
          '        write(DOWN, req)',
          '        sent = sent + 1',
        ],
      },
      { col: 1, row: 1, code: relay('UP', 'DOWN') },
    ],
    broken: { node: 1, line: 5 },
    glitch: '▓▓░▓ ▓▓¤▓ ░ ▓:',
    options: ['elif sent <= 3:', 'if sent < 3:', 'elif sent < 3:'],
    answer: 2,
    hints: [
      'Off by one: <= 3 lets a 4th request through.',
      "A plain if also runs after the reset, so the 0 marker leaks out as a request.",
      'elif skips the 0 marker, and < 3 allows requests 1, 2 and 3.',
    ],
    inputs: [5, 6, 7, 8, 9, 0, 3, 4, 0, 1, 2, 7, 8],
  },
  {
    id: 'decrypt-filter',
    tier: 3,
    title: 'Decrypt & Filter',
    goal: 'Decrypt (shift back by 7), then strip out the X padding letters.',
    display: 'letter',
    cols: 3,
    rows: 1,
    inCol: 0,
    outCol: 2,
    nodes: [
      { col: 0, row: 0, code: ['KEY = 7', 'while True:', '    c = read(UP)', '    write(RIGHT, (c - KEY) % 26)'] },
      { col: 1, row: 0, code: ['while True:', '    ch = read(LEFT)', '    ▓▓ ░▓ ¤▓ ▓▓:', '        write(RIGHT, ch)'] },
      { col: 2, row: 0, code: relay('LEFT', 'DOWN') },
    ],
    broken: { node: 1, line: 2 },
    glitch: '▓▓ ░▓ ¤▓ ▓▓:',
    options: ['if ch == 23:', 'if ch != 24:', 'if ch != 23:'],
    answer: 2,
    hints: [
      '== keeps only the X padding and drops the real message.',
      '24 is Y. X is letter 23 (A is 0).',
      'X is letter 23 (A is 0): pass everything that is not X.',
    ],
    inputs: letters('MEETXATXNOON').map((p) => (p + 7) % 26),
  },
  {
    id: 'max-pairs',
    tier: 3,
    title: 'Max of Pairs',
    goal: 'Values arrive in pairs. Send the larger of each pair.',
    display: 'num',
    cols: 2,
    rows: 2,
    inCol: 0,
    outCol: 1,
    nodes: [
      { col: 0, row: 0, code: ['while True:', '    a = read(UP)', '    write(RIGHT, a)', '    b = read(UP)', '    write(DOWN, b)'] },
      { col: 1, row: 0, code: relay('LEFT', 'DOWN') },
      { col: 0, row: 1, code: relay('UP', 'RIGHT') },
      {
        col: 1,
        row: 1,
        code: [
          'while True:',
          '    a = read(UP)',
          '    ▓ ░ ▓▓¤▓(▓▓░▓)',
          '    if a > b:',
          '        write(DOWN, a)',
          '    else:',
          '        write(DOWN, b)',
        ],
      },
    ],
    broken: { node: 3, line: 2 },
    glitch: '▓ ░ ▓▓¤▓(▓▓░▓)',
    options: ['b = read(UP)', 'b = read(RIGHT)', 'b = read(LEFT)'],
    answer: 2,
    hints: [
      'Both reads come from above, so a and b are the first values of two different pairs.',
      'There is no node to the RIGHT, so the read waits forever.',
      "b is the pair's second value, which arrives from the LEFT.",
    ],
    inputs: [3, 9, 14, 2, 7, 7, 20, 25, 11, 4],
  },
  {
    id: 'run-length',
    tier: 3,
    title: 'Run-Length Encoder',
    goal: 'Compress runs: send each value, then how many times in a row it appeared. The last 0 only ends the stream.',
    display: 'num',
    cols: 3,
    rows: 1,
    inCol: 0,
    outCol: 2,
    nodes: [
      { col: 0, row: 0, code: relay('UP', 'RIGHT') },
      {
        col: 1,
        row: 0,
        code: [
          'prev = read(LEFT)',
          'count = 1',
          'while True:',
          '    x = read(LEFT)',
          '    if x == prev:',
          '        count = count + 1',
          '    else:',
          '        write(RIGHT, prev)',
          '        write(RIGHT, count)',
          '        prev = x',
          '        ▓▓░▓▓ ¤ ▓',
        ],
      },
      { col: 2, row: 0, code: relay('LEFT', 'DOWN') },
    ],
    broken: { node: 1, line: 10 },
    glitch: '▓▓░▓▓ ¤ ▓',
    options: ['count = 0', 'count = 1', 'count = count + 1'],
    answer: 1,
    hints: [
      'The new value x has already appeared once, so its count starts at 1, not 0.',
      'A new run starts with the value just seen, so its count is 1.',
      "That carries the old run's count into the new run.",
    ],
    inputs: [4, 4, 4, 7, 7, 1, 1, 1, 1, 0],
  },
];
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/repair-*.test.ts && npm run typecheck`
Expected: 36 tests pass (19 puzzles + 12 run + 5 parse); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/games/repair/puzzles.ts tests/unit/repair-puzzles.test.ts
git commit -m "feat(repair): 18 puzzles across three tiers with content-safety tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Run rules

**Files:**
- Create: `src/games/repair/logic.ts`
- Test: `tests/unit/repair-logic.test.ts`

**Interfaces:**
- Consumes: `shuffle`, `Rng` from `src/core/random` (test also uses `mulberry32`); `Puzzle`, `PUZZLES` (Task 3); `runGrid`, `RunResult` (Task 2).
- Produces:
  - Constants `START_TIME = 120`, `CORRECT_BONUS = 8`, `WRONG_PENALTY = 10`, `RESTORE_BONUS = 10`.
  - `type Phase = 'pick' | 'play' | 'result' | 'over'`; `type Ending = 'restored' | 'lost'`.
  - `interface Outcome { kind: 'correct' | 'wrong' | 'auto'; points: number; choice: number; hint: string }`.
  - `buildDeck(puzzles, rng): Puzzle[]` and `firstTryPoints(tier, pickSeconds): number`.
  - `class RepairRun`:
    - fields: `deck`, `index`, `time`, `score`, `fixed`, `phase`, `ending: Ending | null`, `struck: Set<number>`, `pickTime`; getter `puzzle`.
    - `tick(dt): void`, which runs only in `pick`.
    - `choose(i): RunResult | null`, which returns null when not allowed.
    - `finishPlay(): Outcome | null`.
    - `finishResult(): RunResult | null`, which returns the auto-solve run when one starts.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/repair-logic.test.ts` (full file):

```ts
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/core/random';
import { buildDeck, CORRECT_BONUS, firstTryPoints, RepairRun, START_TIME, WRONG_PENALTY } from '../../src/games/repair/logic';
import { PUZZLES } from '../../src/games/repair/puzzles';

const newRun = (seed = 1) => new RepairRun(PUZZLES, mulberry32(seed));
const wrongs = (run: RepairRun) => [0, 1, 2].filter((i) => i !== run.puzzle.answer);

/** Plays option `i` through to the result phase. */
function patch(run: RepairRun, i: number) {
  expect(run.choose(i)).not.toBeNull();
  return run.finishPlay()!;
}

describe('repair logic', () => {
  it('keeps the deck in tier order over 200 seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const deck = buildDeck(PUZZLES, mulberry32(seed));
      expect(deck).toHaveLength(18);
      expect(deck.map((p) => p.tier)).toEqual([...Array(6).fill(1), ...Array(6).fill(2), ...Array(6).fill(3)]);
      expect(new Set(deck.map((p) => p.id)).size).toBe(18);
    }
  });

  it('runs the clock only in pick', () => {
    const run = newRun();
    expect(run.time).toBe(START_TIME);
    run.tick(5);
    expect(run.time).toBe(START_TIME - 5);
    run.choose(run.puzzle.answer);
    run.tick(5);
    expect(run.time).toBe(START_TIME - 5);
    run.finishPlay();
    expect(run.time).toBe(START_TIME - 5 + CORRECT_BONUS);
    run.tick(5);
    expect(run.time).toBe(START_TIME - 5 + CORRECT_BONUS);
  });

  it('scores a first try by tier and speed', () => {
    expect(firstTryPoints(1, 0)).toBe(200);
    expect(firstTryPoints(2, 7.9)).toBe(265);
    expect(firstTryPoints(3, 25)).toBe(300);
    const run = newRun();
    run.tick(7.5);
    const out = patch(run, run.puzzle.answer);
    expect(out).toMatchObject({ kind: 'correct', points: 165 });
    expect(run.score).toBe(165);
    expect(run.fixed).toBe(1);
  });

  it('takes time for a wrong patch, strikes it, and scores a second try at 25 × tier', () => {
    const run = newRun();
    const [w] = wrongs(run);
    const out = patch(run, w);
    expect(out.kind).toBe('wrong');
    expect(out.hint).toBe(run.puzzle.hints[w]);
    expect(run.time).toBe(START_TIME - WRONG_PENALTY);
    expect(run.struck.has(w)).toBe(true);
    expect(run.finishResult()).toBeNull();
    expect(run.phase).toBe('pick');
    expect(run.choose(w)).toBeNull(); // struck options are ignored
    expect(patch(run, run.puzzle.answer)).toMatchObject({ kind: 'correct', points: 25 });
  });

  it('auto-solves after both wrong options, for no points', () => {
    const run = newRun();
    const id = run.puzzle.id;
    for (const w of wrongs(run)) {
      patch(run, w);
      if (run.struck.size < 2) run.finishResult();
    }
    const auto = run.finishResult();
    expect(auto?.status).toBe('done');
    expect(run.phase).toBe('play');
    expect(run.finishPlay()).toMatchObject({ kind: 'auto', points: 0 });
    run.finishResult();
    expect(run.score).toBe(0);
    expect(run.fixed).toBe(0);
    expect(run.puzzle.id).not.toBe(id);
    expect(run.phase).toBe('pick');
  });

  it('ignores choices outside pick or out of range', () => {
    const run = newRun();
    expect(run.choose(3)).toBeNull();
    expect(run.choose(-1)).toBeNull();
    run.choose(0);
    expect(run.choose(1)).toBeNull();
  });

  it('loses the link when the clock runs out', () => {
    const run = newRun();
    run.tick(START_TIME);
    expect(run.phase).toBe('over');
    expect(run.ending).toBe('lost');
  });

  it('loses the link when a wrong patch empties the clock', () => {
    const run = newRun();
    run.tick(START_TIME - 4);
    patch(run, wrongs(run)[0]);
    expect(run.time).toBe(0);
    expect(run.phase).toBe('result');
    run.finishResult();
    expect(run.ending).toBe('lost');
  });

  it('restores the network after the last puzzle, with a time bonus', () => {
    const run = newRun();
    for (let i = 0; i < 18; i++) {
      patch(run, run.puzzle.answer); // instant: full speed bonus
      run.finishResult();
    }
    expect(run.phase).toBe('over');
    expect(run.ending).toBe('restored');
    expect(run.fixed).toBe(18);
    expect(run.time).toBe(START_TIME + 18 * CORRECT_BONUS);
    const base = 6 * (200 + 300 + 400);
    expect(run.score).toBe(base + 10 * (START_TIME + 18 * CORRECT_BONUS));
  });

  it('changes nothing once over', () => {
    const run = newRun();
    run.tick(START_TIME);
    const snapshot = { time: run.time, score: run.score, index: run.index };
    run.tick(5);
    expect(run.choose(0)).toBeNull();
    expect(run.finishPlay()).toBeNull();
    expect(run.finishResult()).toBeNull();
    expect({ time: run.time, score: run.score, index: run.index }).toEqual(snapshot);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/unit/repair-logic.test.ts`
Expected: FAIL, because `src/games/repair/logic` does not exist.

- [ ] **Step 3: Implement the run rules**

Create `src/games/repair/logic.ts` (full file):

```ts
// Router Repair's run rules: deck, clock, scoring and phases. Pure: no DOM, no timers.
import { shuffle, type Rng } from '../../core/random';
import type { Puzzle } from './puzzles';
import { runGrid, type RunResult } from './run';

export const START_TIME = 120;
export const CORRECT_BONUS = 8; // seconds added for a correct patch
export const WRONG_PENALTY = 10; // seconds removed for a wrong patch
export const RESTORE_BONUS = 10; // points per whole second left when the deck is cleared

export type Phase = 'pick' | 'play' | 'result' | 'over';
export type Ending = 'restored' | 'lost';

export interface Outcome {
  kind: 'correct' | 'wrong' | 'auto';
  points: number;
  choice: number;
  hint: string;
}

/** Each tier shuffled on its own; tiers stay in order 1, 2, 3. */
export function buildDeck(puzzles: readonly Puzzle[], rng: Rng = Math.random): Puzzle[] {
  return ([1, 2, 3] as const).flatMap((tier) => shuffle(puzzles.filter((p) => p.tier === tier), rng));
}

/** First-try points: 100 per tier, plus up to 100 for speed (5 lost per whole second of thinking). */
export function firstTryPoints(tier: number, pickSeconds: number): number {
  return 100 * tier + Math.max(0, 100 - 5 * Math.floor(pickSeconds));
}

export class RepairRun {
  readonly deck: Puzzle[];
  index = 0;
  time = START_TIME;
  score = 0;
  fixed = 0;
  phase: Phase = 'pick';
  ending: Ending | null = null;
  /** Options already tried and failed on the current puzzle. */
  readonly struck = new Set<number>();
  /** Seconds spent in `pick` on the current puzzle. */
  pickTime = 0;
  /** The option being played, or the answer during an auto-solve. */
  private playing: { choice: number; auto: boolean } | null = null;
  private last: Outcome | null = null;

  constructor(puzzles: readonly Puzzle[], rng: Rng = Math.random) {
    this.deck = buildDeck(puzzles, rng);
  }

  get puzzle(): Puzzle {
    return this.deck[this.index];
  }

  /** Advances the clock. It only runs in `pick`. */
  tick(dt: number): void {
    if (this.phase !== 'pick') return;
    this.pickTime += dt;
    this.time = Math.max(0, this.time - dt);
    if (this.time === 0) this.end('lost');
  }

  /** Tries option `i`. Returns the run to play back, or null when the choice is not allowed. */
  choose(i: number): RunResult | null {
    if (this.phase !== 'pick' || !Number.isInteger(i) || i < 0 || i > 2 || this.struck.has(i)) return null;
    this.phase = 'play';
    this.playing = { choice: i, auto: false };
    return runGrid(this.puzzle, i);
  }

  /** Playback finished: scores the patch and moves to `result`. */
  finishPlay(): Outcome | null {
    if (this.phase !== 'play' || !this.playing) return null;
    const { choice, auto } = this.playing;
    const p = this.puzzle;
    let outcome: Outcome;
    if (auto) outcome = { kind: 'auto', points: 0, choice, hint: p.hints[choice] };
    else if (choice === p.answer) {
      const points = this.struck.size === 0 ? firstTryPoints(p.tier, this.pickTime) : 25 * p.tier;
      this.score += points;
      this.time += CORRECT_BONUS;
      this.fixed++;
      outcome = { kind: 'correct', points, choice, hint: p.hints[choice] };
    } else {
      this.time = Math.max(0, this.time - WRONG_PENALTY);
      this.struck.add(choice);
      outcome = { kind: 'wrong', points: 0, choice, hint: p.hints[choice] };
    }
    this.phase = 'result';
    this.playing = null;
    this.last = outcome;
    return outcome;
  }

  /**
   * The verdict has been shown. Moves on: next puzzle, back to `pick`, an auto-solve, or `over`.
   * Returns the auto-solve run to play back when one starts, otherwise null.
   */
  finishResult(): RunResult | null {
    if (this.phase !== 'result' || !this.last) return null;
    const { kind } = this.last;
    this.last = null;
    if (kind === 'wrong') {
      if (this.time === 0) {
        this.end('lost');
        return null;
      }
      if (this.struck.size >= 2) {
        // Both wrong options used: show the fix, score nothing.
        this.phase = 'play';
        this.playing = { choice: this.puzzle.answer, auto: true };
        return runGrid(this.puzzle, this.puzzle.answer);
      }
      this.phase = 'pick';
      return null;
    }
    if (this.index + 1 >= this.deck.length) {
      this.score += RESTORE_BONUS * Math.floor(this.time);
      this.end('restored');
      return null;
    }
    this.index++;
    this.struck.clear();
    this.pickTime = 0;
    this.phase = 'pick';
    return null;
  }

  private end(ending: Ending): void {
    this.phase = 'over';
    this.ending = ending;
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npm test && npm run typecheck`
Expected: 33 files, 332 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/games/repair/logic.ts tests/unit/repair-logic.test.ts
git commit -m "feat(repair): run rules for deck, clock, scoring and phases" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Screen, playback and hub wiring

**Files:**
- Create: `src/games/repair/index.ts`, `src/games/repair/repair.css`
- Modify: `src/main.ts`, `src/games/registry.ts`, `src/core/ui/icons.ts`
- Test: `tests/unit/registry.test.ts`, `tests/unit/carousel.test.ts`, `tests/e2e/hub.spec.ts`, `tests/e2e/games.spec.ts`

**Interfaces:**
- Consumes:
  - `RepairRun`, `Outcome` (Task 4).
  - `PUZZLES`, `Puzzle` (Task 3).
  - `expected`, `Move`, `RunResult`, `Tick` (Task 2).
  - `highlight` from `src/games/bughunt/highlight`.
  - `el` from `src/core/ui/dom`, `createHud` from `src/core/ui/hud`, and `mulberry32` and `Rng` from `src/core/random`.
- Produces:
  - `createGame(): GameModule`.
  - DOM contract for e2e:
    - `.repair` root with `data-phase`, `data-puzzle` and `data-time`.
    - `.rr-line.is-corrupt` marks the broken line.
    - `.rr-option[data-option]`, which gets `data-struck` once struck.
    - `.rr-verdict` shows PATCHED! / PATCH FAILED / AUTO-PATCHED, and `.rr-hint` shows the hint.
    - `.rr-cell.is-ok` / `.is-bad` cells in ACTUAL.
    - The HUD exposes `[data-hud="score"]`, `[data-hud="fixed"]` and the other HUD cells.

- [ ] **Step 1: Write the failing e2e and update the counts**

Apply these changes.

`tests/e2e/games.spec.ts` gets the repair imports, the longer `launch` rotation, two repair tests and `repair` in the leak loop:

```diff
--- a/tests/e2e/games.spec.ts
+++ b/tests/e2e/games.spec.ts
@@ -5,6 +5,8 @@
 import { planRun } from '../../src/games/password/patterns';
 import { ITEMS } from '../../src/games/phish/items';
 import { evaluate, type Action, type Proto, type Rule } from '../../src/games/port/logic';
+import { PUZZLES } from '../../src/games/repair/puzzles';
+import { expected } from '../../src/games/repair/run';
 import { boot, trackErrors } from './helpers';
 
 test.beforeEach(async ({ page }) => {
@@ -13,7 +15,7 @@
 
 /** Rotates the hub to the cabinet with `id` and starts it through the title card. */
 async function launch(page: Page, id: string): Promise<void> {
-  for (let i = 0; i < 9; i++) {
+  for (let i = 0; i < 10; i++) {
     if ((await page.locator('.cabinet.is-center').getAttribute('data-id')) === id) break;
     await page.keyboard.press('ArrowRight');
     await page.waitForTimeout(120);
@@ -388,7 +390,68 @@
   expect(errors).toEqual([]);
 });
 
-test('20 launch/exit cycles across the seven games leave nothing behind', async ({ page }) => {
+/** The current Router Repair puzzle, looked up from the root's data-puzzle. */
+async function repairPuzzle(page: Page) {
+  const id = await page.locator('.repair').getAttribute('data-puzzle');
+  return PUZZLES.find((p) => p.id === id)!;
+}
+
+test('repair: the right patch plays back clean output, scores and moves on', async ({ page }) => {
+  const errors = trackErrors(page);
+  await boot(page, '?seed=1');
+  await launch(page, 'repair');
+  const root = page.locator('.repair');
+  await expect(root).toHaveAttribute('data-phase', 'pick');
+  const p = await repairPuzzle(page);
+  expect(p.tier).toBe(1);
+  await expect(page.locator('.rr-line.is-corrupt')).toHaveCount(1);
+  await expect(page.locator('.rr-option')).toHaveCount(3);
+
+  await page.keyboard.press(String(p.answer + 1));
+  await expect(page.locator('.rr-verdict')).toContainText('PATCHED!');
+  await expect(page.locator('.rr-cell.is-ok')).toHaveCount(expected(p).length);
+  await expect(page.locator('.rr-hint')).toHaveText(p.hints[p.answer]);
+  await expect(page.locator('[data-hud="fixed"]')).toHaveText('1');
+  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');
+
+  await expect(root).not.toHaveAttribute('data-puzzle', p.id, { timeout: 5000 });
+  await expect(root).toHaveAttribute('data-phase', 'pick');
+  await expect(page.locator('.rr-line.is-corrupt')).toHaveCount(1);
+  expect(errors).toEqual([]);
+});
+
+test('repair: two wrong patches cost time, strike options, then auto-patch for no points', async ({ page }) => {
+  test.setTimeout(60_000);
+  const errors = trackErrors(page);
+  await boot(page, '?seed=2');
+  await launch(page, 'repair');
+  const root = page.locator('.repair');
+  await expect(root).toHaveAttribute('data-phase', 'pick');
+  const p = await repairPuzzle(page);
+  const [w1, w2] = [0, 1, 2].filter((i) => i !== p.answer);
+
+  await page.keyboard.press(String(w1 + 1));
+  await page.keyboard.press('Space'); // fast-forward the playback
+  await expect(page.locator('.rr-verdict')).toContainText('PATCH FAILED');
+  await expect(page.locator('.rr-hint')).toHaveText(p.hints[w1]);
+  await expect(page.locator(`[data-option="${w1}"]`)).toHaveAttribute('data-struck', '');
+  expect(Number(await root.getAttribute('data-time'))).toBeLessThanOrEqual(110);
+
+  await expect(root).toHaveAttribute('data-phase', 'pick', { timeout: 5000 });
+  await page.keyboard.press(String(w1 + 1)); // struck: ignored
+  await expect(root).toHaveAttribute('data-phase', 'pick');
+  await page.keyboard.press(String(w2 + 1));
+  await expect(page.locator('.rr-verdict')).toContainText('PATCH FAILED');
+  await expect(page.locator('.rr-verdict')).toContainText('AUTO-PATCHED', { timeout: 8000 });
+  await expect(page.locator('.rr-cell.is-ok')).toHaveCount(expected(p).length);
+
+  await expect(root).not.toHaveAttribute('data-puzzle', p.id, { timeout: 5000 });
+  await expect(page.locator('[data-hud="fixed"]')).toHaveText('0');
+  await expect(page.locator('[data-hud="score"]')).toHaveText('0');
+  expect(errors).toEqual([]);
+});
+
+test('20 launch/exit cycles across the eight games leave nothing behind', async ({ page }) => {
   test.setTimeout(240_000);
   const errors = trackErrors(page);
   // Records every WebGL/WebGL2 context any canvas hands out, so a regression in the Phaser
@@ -405,7 +468,7 @@
     } as typeof HTMLCanvasElement.prototype.getContext;
   });
   await boot(page, '?selftest');
-  const games = ['phish', 'password', 'invaders', 'port', 'bughunt', 'runner', 'defense'];
+  const games = ['phish', 'password', 'invaders', 'port', 'bughunt', 'runner', 'defense', 'repair'];
   const cycle = async (id: string) => {
     await launch(page, id);
     await expect(page.locator('.game-root')).toHaveCount(1);
```

`tests/e2e/hub.spec.ts`:

```diff
--- a/tests/e2e/hub.spec.ts
+++ b/tests/e2e/hub.spec.ts
@@ -1,11 +1,11 @@
 import { expect, test } from '@playwright/test';
 import { boot, trackErrors } from './helpers';
 
-test('boots to the hub with eight cabinets and no errors', async ({ page }) => {
+test('boots to the hub with nine cabinets and no errors', async ({ page }) => {
   const errors = trackErrors(page);
   await boot(page);
   await expect(page.locator('.hub-logo h1')).toHaveText('CYBER ARCADE');
-  await expect(page.locator('.cabinet')).toHaveCount(8);
+  await expect(page.locator('.cabinet')).toHaveCount(9);
   await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'invaders');
   expect(errors).toEqual([]);
 });
```

`tests/unit/registry.test.ts`:

```diff
--- a/tests/unit/registry.test.ts
+++ b/tests/unit/registry.test.ts
@@ -3,9 +3,9 @@
 import { ICONS } from '../../src/core/ui/icons';
 
 describe('registry', () => {
-  it('has the seven games plus Classic 25, with unique ids', () => {
-    expect(CABINETS).toHaveLength(8);
-    expect(new Set(CABINETS.map((c) => c.id)).size).toBe(8);
+  it('has the eight games plus Classic 25, with unique ids', () => {
+    expect(CABINETS).toHaveLength(9);
+    expect(new Set(CABINETS.map((c) => c.id)).size).toBe(9);
     expect(CABINETS.at(-1)).toMatchObject({ kind: 'link', id: 'classic' });
   });
 
@@ -20,7 +20,7 @@
     expect(getCabinets(new URLSearchParams(''))[0].id).toBe('invaders');
     const withTest = getCabinets(new URLSearchParams('selftest'));
     expect(withTest[0].id).toBe('selftest');
-    expect(withTest).toHaveLength(9);
+    expect(withTest).toHaveLength(10);
     expect(ICONS.selftest).toContain('<svg');
   });
 });
```

`tests/unit/carousel.test.ts`:

```diff
--- a/tests/unit/carousel.test.ts
+++ b/tests/unit/carousel.test.ts
@@ -33,7 +33,7 @@
   it('wraps next/prev and reports changes', () => {
     const { c, onChange } = make();
     c.prev();
-    expect(c.selected).toBe(7);
+    expect(c.selected).toBe(8);
     expect(c.current().id).toBe('classic');
     c.next();
     expect(c.selected).toBe(0);
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run tests/unit/registry.test.ts tests/unit/carousel.test.ts && npx playwright test tests/e2e/hub.spec.ts tests/e2e/games.spec.ts -g "repair|nine cabinets"`
Expected: the registry and carousel unit tests fail on the counts; the hub test fails expecting 9 cabinets, and both repair e2e tests fail because there is no repair cabinet.

- [ ] **Step 3: Mount and unmount**

Create `src/games/repair/index.ts` (full file):

```ts
import { mulberry32, type Rng } from '../../core/random';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { highlight } from '../bughunt/highlight';
import { RepairRun, type Outcome } from './logic';
import { PUZZLES, type Puzzle } from './puzzles';
import { expected, type Move, type RunResult, type Tick } from './run';

const RIGHT_MS = 1500; // verdict time after a correct patch (or an auto-solve)
const WRONG_MS = 3000; // longer after a wrong one so the hint can be read
const END_MS = 2000; // NETWORK RESTORED / LINK LOST banner before endRun

// Grid geometry in stage pixels (the grid element sits at left 50, top 232; see repair.css).
const GRID_W = 1220;
const GRID_H = 520;
const GAP = 56;
const IO_LEN = 44; // length of the IN and OUT arrows outside the grid

/** `?seed=N` makes the deck order repeatable (tests, debugging); otherwise it is random. */
function runRng(): Rng {
  const seed = new URLSearchParams(location.search).get('seed');
  return seed !== null && /^\d+$/.test(seed) ? mulberry32(Number(seed)) : Math.random;
}

/** One line of code as coloured token spans. textContent only — never innerHTML. */
function codeSpan(line: string): HTMLElement {
  return el('span.rr-code', {}, ...highlight(line).map((t) => el(`span.rr-tok-${t.kind}`, {}, t.text)));
}

/** A value as the puzzle shows it: 0–25 as A–Z on letter puzzles, otherwise the number. */
function show(p: Puzzle, v: number): string {
  return p.display === 'letter' && Number.isInteger(v) && v >= 0 && v <= 25 ? String.fromCharCode(65 + v) : String(v);
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | null = null;
  let tornDown = false;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const run = new RepairRun(PUZZLES, runRng());
      const hud = createHud([['score', 'SCORE'], ['time', 'TIME'], ['tier', 'TIER'], ['fixed', 'FIXED']]);
      const title = el('span.rr-title');
      const goal = el('span.rr-goal-text');
      const grid = el('div.rr-grid');
      const inputCol = el('div.rr-col-body');
      const expectCol = el('div.rr-col-body');
      const actualCol = el('div.rr-col-body');
      const verdict = el('div.rr-verdict');
      const hint = el('div.rr-hint');
      const options = el('div.rr-options');
      const column = (label: string, body: HTMLElement) => el('div.rr-col', {}, el('div.rr-col-head', {}, label), body);
      root = el(
        'div.repair',
        {},
        hud.el,
        el('div.rr-goal', {}, title, goal),
        grid,
        el('div.rr-side', {}, el('div.rr-cols', {}, column('INPUT', inputCol), column('EXPECTED', expectCol), column('ACTUAL', actualCol))),
        verdict,
        hint,
        el('div.rr-options-head', {}, 'PATCH — press 1–3 · SPACE fast-forwards'),
        options,
      );
      container.append(root);

      // Per-puzzle view state, rebuilt by showPuzzle().
      let want: number[] = [];
      let lineEls: HTMLElement[][] = [];
      let nodeEls: HTMLElement[] = [];
      let links = new Map<string, HTMLElement>();
      let nodeW = 0;
      let nodeH = 0;
      let actualCount = 0;
      let play: { result: RunResult; start: number; ms: number; next: number } | null = null;
      let ended = false;
      let last = performance.now();

      const sync = () => {
        const r = root!;
        const time = String(Math.ceil(run.time));
        if (r.dataset.phase !== run.phase) r.dataset.phase = run.phase;
        if (r.dataset.time !== time) r.dataset.time = time;
        hud.set('time', time);
      };

      const updateHud = () => {
        hud.set('score', run.score.toLocaleString('en-US'));
        hud.set('tier', String(run.puzzle.tier));
        hud.set('fixed', String(run.fixed));
        sync();
      };

      const box = (i: number) => {
        const n = run.puzzle.nodes[i];
        return { x: n.col * (nodeW + GAP), y: n.row * (nodeH + GAP) };
      };

      /** Start and end points (grid pixels) of a value chip for one move. */
      const path = (m: Move): [number, number, number, number] => {
        const p = run.puzzle;
        if (m.from === 'IN') {
          const x = p.inCol * (nodeW + GAP) + nodeW / 2;
          return [x, -IO_LEN, x, 0];
        }
        const a = box(m.from);
        if (m.to === 'OUT') {
          const x = a.x + nodeW / 2;
          return [x, GRID_H, x, GRID_H + IO_LEN];
        }
        const b = box(m.to);
        if (a.y === b.y) {
          // Horizontal link; rightward chips run a little above the centre line, leftward a little below.
          const y = a.y + nodeH / 2 + (b.x > a.x ? -12 : 12);
          return b.x > a.x ? [a.x + nodeW, y, b.x, y] : [a.x, y, b.x + nodeW, y];
        }
        const x = a.x + nodeW / 2 + (b.y > a.y ? -12 : 12);
        return b.y > a.y ? [x, a.y + nodeH, x, b.y] : [x, a.y, x, b.y + nodeH];
      };

      const linkKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

      const setLine = (row: HTMLElement, text: string, corrupt: boolean) => {
        row.classList.toggle('is-corrupt', corrupt);
        row.classList.toggle('is-patched', !corrupt);
        const p = run.puzzle;
        if (corrupt) {
          const indent = /^ */.exec(p.nodes[p.broken.node].code[p.broken.line])![0];
          row.replaceChildren(el('span.rr-code', {}, indent, el('span.rr-glitch', {}, p.glitch)), el('span.rr-flag', {}, '⚠ CORRUPTED'));
        } else row.replaceChildren(codeSpan(text));
      };

      const brokenRow = () => lineEls[run.puzzle.broken.node][run.puzzle.broken.line];

      const showPuzzle = () => {
        const p = run.puzzle;
        want = expected(p);
        root!.dataset.puzzle = p.id;
        title.textContent = p.title;
        goal.textContent = p.goal;
        nodeW = (GRID_W - GAP * (p.cols - 1)) / p.cols;
        nodeH = (GRID_H - GAP * (p.rows - 1)) / p.rows;
        const lines = Math.max(...p.nodes.map((n) => n.code.length));
        const chars = Math.max(...p.nodes.flatMap((n) => n.code.map((l) => l.length)), ...p.options.map((o) => o.length + 4));
        const font = Math.floor(Math.min(28, (nodeW - 36) / (chars * 0.6), (nodeH - 56) / (lines * 1.3)));

        nodeEls = [];
        lineEls = [];
        links = new Map();
        const parts: HTMLElement[] = [];
        p.nodes.forEach((n, i) => {
          const { x, y } = box(i);
          const rows = n.code.map((line) => el('div.rr-line', {}, codeSpan(line)));
          lineEls.push(rows);
          const node = el('div.rr-node', { 'data-node': i }, el('div.rr-node-title', {}, `NODE ${n.col},${n.row}`), ...rows);
          node.style.cssText = `left:${x}px;top:${y}px;width:${nodeW}px;height:${nodeH}px;font-size:${font}px`;
          nodeEls.push(node);
          parts.push(node);
          // Links to the right and below; the other directions are the same links seen from the neighbour.
          for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
            const j = p.nodes.findIndex((m) => m.col === n.col + dc && m.row === n.row + dr);
            if (j < 0) continue;
            const link = el(`div.rr-link.${dc ? 'is-h' : 'is-v'}`);
            link.style.cssText = dc
              ? `left:${x + nodeW}px;top:${y + nodeH / 2 - 3}px;width:${GAP}px`
              : `left:${x + nodeW / 2 - 3}px;top:${y + nodeH}px;height:${GAP}px`;
            links.set(linkKey(i, j), link);
            parts.push(link);
          }
        });
        const io = (label: string, col: number, top: number) => {
          const arrow = el('div.rr-io', {}, label);
          arrow.style.cssText = `left:${col * (nodeW + GAP) + nodeW / 2}px;top:${top}px`;
          return arrow;
        };
        parts.push(io('IN ▼', p.inCol, -IO_LEN), io('▼ OUT', p.outCol, GRID_H));
        grid.replaceChildren(...parts);
        setLine(brokenRow(), '', true);

        inputCol.replaceChildren(...p.inputs.map((v) => el('div.rr-cell', {}, show(p, v))));
        expectCol.replaceChildren(...want.map((v) => el('div.rr-cell', {}, show(p, v))));
        actualCol.replaceChildren();
        actualCount = 0;
        options.replaceChildren(
          ...p.options.map((o, i) => {
            const opt = el('div.rr-option', { 'data-option': i }, el('span.rr-key', {}, String(i + 1)), codeSpan(o));
            opt.addEventListener('click', () => choose(i));
            return opt;
          }),
        );
        verdict.textContent = '';
        verdict.className = 'rr-verdict';
        hint.textContent = '';
        updateHud();
      };

      const clearActive = () => {
        for (const rows of lineEls) for (const r of rows) r.classList.remove('is-active');
        for (const l of links.values()) l.classList.remove('is-hot');
      };

      const applyTick = (t: Tick, animate: boolean) => {
        const p = run.puzzle;
        t.active.forEach((line, i) => {
          for (const [j, r] of lineEls[i].entries()) r.classList.toggle('is-active', j === line);
        });
        if (animate) {
          // At fast playback a tick lasts less than a chip's flight: keep only the newest chips.
          for (const l of links.values()) l.classList.remove('is-hot');
          for (const c of grid.querySelectorAll('.rr-chip')) c.remove();
        }
        for (const m of t.moves) {
          if (m.to === 'OUT') {
            const ok = m.value === want[actualCount];
            actualCol.append(el(`div.rr-cell.${ok ? 'is-ok' : 'is-bad'}`, {}, show(p, m.value)));
            actualCount++;
          }
          if (!animate) continue;
          if (m.from !== 'IN' && m.to !== 'OUT') links.get(linkKey(m.from, m.to))?.classList.add('is-hot');
          const [x0, y0, x1, y1] = path(m);
          const chip = el('div.rr-chip', {}, show(p, m.value));
          chip.style.cssText = `--x0:${x0}px;--y0:${y0}px;--x1:${x1}px;--y1:${y1}px`;
          chip.addEventListener('animationend', () => chip.remove());
          grid.append(chip);
        }
      };

      const startPlayback = (result: RunResult, choice: number) => {
        clearActive();
        for (const b of grid.querySelectorAll('.rr-badge')) b.remove();
        actualCol.replaceChildren();
        actualCount = 0;
        setLine(brokenRow(), /^ */.exec(run.puzzle.nodes[run.puzzle.broken.node].code[run.puzzle.broken.line])![0] + run.puzzle.options[choice], false);
        options.querySelector(`[data-option="${choice}"]`)?.classList.add('is-chosen');
        play = { result, start: performance.now(), ms: Math.min(150, 3000 / result.trace.length), next: 0 };
        sync();
      };

      const choose = (i: number) => {
        if (tornDown || play) return;
        const result = run.choose(i);
        if (!result) return;
        ctx.audio.sfx('select');
        startPlayback(result, i);
      };

      const finishPlayback = () => {
        const { result } = play!;
        play = null;
        clearActive();
        const p = run.puzzle;
        for (let k = actualCount; k < want.length; k++) actualCol.append(el('div.rr-cell.is-bad.is-missing', {}, '?'));
        if (result.status !== 'done')
          for (const i of result.culprits) nodeEls[i].append(el('div.rr-badge', {}, result.status === 'fault' ? 'NODE FAULT' : 'NODE STALLED'));
        const outcome = run.finishPlay()!;
        showOutcome(outcome, p);
        pause = setTimeout(afterResult, outcome.kind === 'wrong' ? WRONG_MS : RIGHT_MS);
      };

      const showOutcome = (o: Outcome, p: Puzzle) => {
        const text = { correct: `PATCHED! +${o.points.toLocaleString('en-US')}`, wrong: 'PATCH FAILED −10s', auto: 'AUTO-PATCHED' };
        verdict.textContent = text[o.kind];
        verdict.className = `rr-verdict is-${o.kind}`;
        hint.textContent = p.hints[o.choice];
        const opt = options.querySelector(`[data-option="${o.choice}"]`);
        opt?.classList.remove('is-chosen');
        if (o.kind === 'wrong') {
          opt?.setAttribute('data-struck', '');
          opt?.classList.add('is-struck');
        }
        ctx.audio.sfx(o.kind === 'correct' ? 'coin' : o.kind === 'wrong' ? 'error' : 'back');
        updateHud();
      };

      const afterResult = () => {
        if (tornDown) return;
        const before = run.index;
        const auto = run.finishResult();
        if (run.phase === 'over') return finish();
        if (auto) return startPlayback(auto, run.puzzle.answer);
        if (run.index !== before) return showPuzzle();
        // Wrong patch: back to pick on the same puzzle. ACTUAL keeps the wrong output.
        setLine(brokenRow(), '', true);
        for (const b of grid.querySelectorAll('.rr-badge')) b.remove();
        verdict.textContent = '';
        verdict.className = 'rr-verdict';
        sync();
      };

      const finish = () => {
        if (ended) return;
        ended = true;
        const restored = run.ending === 'restored';
        updateHud();
        root!.append(el(`div.rr-banner.${restored ? 'is-restored' : 'is-lost'}`, {}, restored ? 'NETWORK RESTORED' : 'LINK LOST'));
        ctx.audio.sfx(restored ? 'score' : 'explode');
        endTimer = setTimeout(() => {
          if (!tornDown) ctx.endRun(run.score);
        }, END_MS);
      };

      const fastForward = () => {
        if (!play) return;
        const { trace } = play.result;
        while (play.next < trace.length) applyTick(trace[play.next++], false);
        finishPlayback();
      };

      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.25, (now - last) / 1000);
        last = now;
        if (play) {
          const { trace } = play.result;
          const due = Math.min(trace.length, Math.floor((now - play.start) / play.ms) + 1);
          while (play.next < due) applyTick(trace[play.next], ++play.next === due);
          if (play.next >= trace.length) finishPlayback();
        } else if (run.phase === 'pick') {
          run.tick(dt);
          if (run.ending) finish();
          else sync();
        }
      };

      unsubscribe = ctx.input.onKey((e) => {
        if (e.repeat) return;
        const n = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
        if (n) choose(Number(n[1]) - 1);
        else if (e.code === 'Space') fastForward();
      });

      showPuzzle();
      raf = requestAnimationFrame(frame);
    },
    unmount() {
      tornDown = true;
      cancelAnimationFrame(raf);
      clearTimeout(pause);
      clearTimeout(endTimer);
      unsubscribe?.();
      unsubscribe = null;
      root?.remove(); // option click and chip listeners go with their elements
      root = null;
    },
  };
}
```

- [ ] **Step 4: Styles**

Create `src/games/repair/repair.css` (full file):

```css
.repair {
  position: absolute;
  inset: 0;
}
.rr-goal {
  position: absolute;
  top: 128px;
  left: 50px;
  right: 60px;
  display: flex;
  align-items: baseline;
  gap: 24px;
  font-size: 30px;
}
.rr-title {
  font-family: var(--f-display);
  font-size: 30px;
  letter-spacing: 0.1em;
  color: var(--c-pink);
  text-shadow: 0 0 12px var(--c-pink);
  white-space: nowrap;
}
.rr-goal-text { color: var(--c-ink); }

/* Node grid: 1220×520 at (50, 232). Children are positioned by index.ts in grid pixels. */
.rr-grid {
  position: absolute;
  top: 232px;
  left: 50px;
  width: 1220px;
  height: 520px;
}
.rr-node {
  position: absolute;
  box-sizing: border-box;
  padding: 8px 16px;
  border-radius: 14px;
  background: rgba(18, 0, 38, 0.94);
  border: 3px solid var(--c-cyan);
  box-shadow: 0 0 22px rgba(0, 240, 255, 0.35), inset 0 0 18px rgba(0, 240, 255, 0.1);
  font-family: var(--f-mono);
  overflow: hidden;
}
.rr-node-title {
  margin-bottom: 4px;
  font-size: 16px;
  letter-spacing: 0.2em;
  color: var(--c-cyan);
}
.rr-line {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 6px;
  border-radius: 6px;
  line-height: 1.3;
  white-space: pre;
}
.rr-line.is-active {
  background: rgba(255, 226, 89, 0.18);
  box-shadow: inset 4px 0 0 var(--c-yellow);
}
.rr-line.is-corrupt { background: rgba(255, 59, 92, 0.16); }
.rr-line.is-patched { background: rgba(0, 240, 255, 0.12); }
.rr-line.is-patched.is-active { background: rgba(255, 226, 89, 0.18); }
.rr-glitch {
  color: var(--c-danger);
  text-shadow: 2px 0 var(--c-cyan), -2px 0 var(--c-pink);
  animation: rr-glitch 0.9s steps(2) infinite;
}
@keyframes rr-glitch {
  50% { opacity: 0.55; transform: translateX(2px); }
}
.rr-flag {
  font-size: 0.6em;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--c-danger);
}
.rr-tok-kw { color: var(--c-pink); font-weight: 700; }
.rr-tok-builtin { color: var(--c-cyan); }
.rr-tok-str { color: var(--c-yellow); }
.rr-tok-num { color: #c49bff; }
.rr-tok-com { color: var(--c-grey); font-style: italic; }
.rr-tok-op { color: var(--c-ink-dim); }
.rr-tok-name { color: var(--c-ink); }
.rr-link {
  position: absolute;
  background: rgba(0, 240, 255, 0.3);
  border-radius: 3px;
}
.rr-link.is-h { height: 6px; }
.rr-link.is-v { width: 6px; }
.rr-link.is-hot {
  background: var(--c-yellow);
  box-shadow: 0 0 14px var(--c-yellow);
}
.rr-io {
  position: absolute;
  height: 44px;
  transform: translateX(32px); /* beside the chip path, not on it */
  display: flex;
  align-items: center;
  font-family: var(--f-mono);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--c-ok);
  white-space: nowrap;
}
.rr-chip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2;
  min-width: 40px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--c-yellow);
  color: #120026;
  font-family: var(--f-mono);
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  pointer-events: none;
  animation: rr-chip 0.3s linear forwards;
}
@keyframes rr-chip {
  from { transform: translate(calc(var(--x0) - 50%), calc(var(--y0) - 50%)); }
  to { transform: translate(calc(var(--x1) - 50%), calc(var(--y1) - 50%)); opacity: 0.4; }
}
.rr-badge {
  position: absolute;
  right: 10px;
  top: 8px;
  padding: 4px 12px;
  border-radius: 8px;
  background: var(--c-danger);
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

/* Right side: INPUT / EXPECTED / ACTUAL, verdict, hint. */
.rr-side {
  position: absolute;
  top: 220px;
  left: 1320px;
  width: 540px;
}
.rr-cols {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.rr-col-head {
  margin-bottom: 8px;
  font-family: var(--f-mono);
  font-size: 20px;
  letter-spacing: 0.15em;
  color: var(--c-cyan);
}
.rr-cell {
  height: 34px;
  font-family: var(--f-mono);
  font-size: 26px;
  line-height: 34px;
  color: var(--c-ink);
}
.rr-cell.is-ok { color: var(--c-ok); }
.rr-cell.is-bad { color: var(--c-danger); }
.rr-cell.is-missing { opacity: 0.6; }
.rr-verdict {
  position: absolute;
  top: 760px;
  left: 1320px;
  width: 540px;
  min-height: 52px;
  font-family: var(--f-display);
  font-size: 40px;
  letter-spacing: 0.06em;
}
.rr-verdict.is-correct { color: var(--c-ok); text-shadow: 0 0 16px var(--c-ok); }
.rr-verdict.is-wrong { color: var(--c-danger); text-shadow: 0 0 16px var(--c-danger); }
.rr-verdict.is-auto { color: var(--c-yellow); text-shadow: 0 0 16px var(--c-yellow); }
.rr-hint {
  position: absolute;
  top: 830px;
  left: 1320px;
  width: 540px;
  font-size: 28px;
  line-height: 1.35;
  color: var(--c-yellow);
}

/* Options: the three candidate patches, bottom left. */
.rr-options-head {
  position: absolute;
  top: 830px;
  left: 50px;
  font-family: var(--f-mono);
  font-size: 20px;
  letter-spacing: 0.15em;
  color: var(--c-ink-dim);
}
.rr-options {
  position: absolute;
  top: 866px;
  left: 50px;
  width: 1220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rr-option {
  display: flex;
  align-items: center;
  gap: 20px;
  height: 52px;
  padding: 0 16px;
  border-radius: 10px;
  border: 2px solid rgba(0, 240, 255, 0.5);
  background: rgba(18, 0, 38, 0.9);
  font-family: var(--f-mono);
  font-size: 28px;
  white-space: pre;
  cursor: pointer;
}
.rr-key {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--c-cyan);
  color: #120026;
  font-weight: 700;
  line-height: 36px;
  text-align: center;
}
.rr-option.is-chosen {
  border-color: var(--c-yellow);
  box-shadow: 0 0 18px rgba(255, 226, 89, 0.5);
}
.rr-option.is-struck {
  opacity: 0.35;
  cursor: default;
}
.rr-option.is-struck .rr-code {
  text-decoration: line-through;
  text-decoration-color: var(--c-danger);
  text-decoration-thickness: 3px;
}
.repair:not([data-phase='pick']) .rr-option { cursor: default; }

.rr-banner {
  position: absolute;
  top: 440px;
  left: 0;
  right: 0;
  z-index: 3;
  padding: 40px 0;
  background: rgba(10, 0, 24, 0.92);
  font-family: var(--f-display);
  font-size: 96px;
  letter-spacing: 0.08em;
  text-align: center;
  animation: rr-banner-in 0.35s ease-out;
}
.rr-banner.is-restored { color: var(--c-ok); text-shadow: 0 0 30px var(--c-ok); }
.rr-banner.is-lost { color: var(--c-danger); text-shadow: 0 0 30px var(--c-danger); }
@keyframes rr-banner-in {
  from { opacity: 0; transform: scale(1.2); }
}
```

- [ ] **Step 5: Wire the cabinet, icon and stylesheet**

`src/games/registry.ts` (the new entry goes after Bug Hunt, before Classic '25):

```diff
--- a/src/games/registry.ts
+++ b/src/games/registry.ts
@@ -67,6 +67,18 @@
     load: () => import('./bughunt/index').then((m) => m.createGame()),
   },
   {
+    kind: 'game',
+    id: 'repair',
+    title: 'Router Repair',
+    tagline: 'Corrupted firmware is mangling network traffic. Patch the node code so the data comes out clean.',
+    category: 'learn',
+    controls: [
+      ['1–3', 'Patch'],
+      ['SPACE', 'Fast-forward'],
+    ],
+    load: () => import('./repair/index').then((m) => m.createGame()),
+  },
+  {
     kind: 'link',
     id: 'classic',
     title: "Classic '25",
```

`src/main.ts`:

```diff
--- a/src/main.ts
+++ b/src/main.ts
@@ -14,6 +14,7 @@
 import './games/bughunt/bughunt.css';
 import './games/runner/runner.css';
 import './games/defense/defense.css';
+import './games/repair/repair.css';
 
 import { createAudio } from './core/audio';
 import { watchFullscreen } from './core/fullscreen';
```

`src/core/ui/icons.ts`:

```diff
--- a/src/core/ui/icons.ts
+++ b/src/core/ui/icons.ts
@@ -31,6 +31,10 @@
     '<ellipse cx="32" cy="36" rx="12" ry="16"/><path d="M32 20v32M24 14l4 6M40 14l-4 6"/>' +
       '<path d="M20 30H8M20 40H8M20 48l-10 6M44 30h12M44 40h12M44 48l10 6"/>',
   ),
+  repair: svg(
+    '<rect x="8" y="34" width="48" height="18" rx="4"/><path d="M18 34V22M46 34V22"/>' +
+      '<circle cx="18" cy="43" r="2"/><circle cx="26" cy="43" r="2"/><path d="M36 43h12M34 8l-6 10h8l-6 10"/>',
+  ),
   classic: svg(
     '<rect x="8" y="30" width="48" height="24" rx="6"/><path d="M32 30V14"/><circle cx="32" cy="10" r="5"/>' +
       '<circle cx="44" cy="40" r="3"/><circle cx="50" cy="46" r="3"/><path d="M16 42h12M22 36v12"/>',
```

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm test && npm run build && npx playwright test`
Expected: typecheck clean; 33 files / 332 unit tests pass; build clean; 23 e2e tests pass (including both repair tests, the nine-cabinet hub test and the 20-cycle leak test across eight games).

- [ ] **Step 7: Commit**

```bash
git add src/games/repair/index.ts src/games/repair/repair.css src/main.ts src/games/registry.ts src/core/ui/icons.ts tests/unit/registry.test.ts tests/unit/carousel.test.ts tests/e2e/hub.spec.ts tests/e2e/games.spec.ts
git commit -m "feat(repair): node grid screen, trace playback and hub cabinet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the plan (not tasks)

These happen before 2026-10-08 and are not part of this plan's execution:
- Lab playtest: tune the clock, scoring and hint text.
- A manual check of every cabinet on the lab machines.
- An fps check with 4× CPU throttling.
