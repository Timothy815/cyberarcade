# Router Repair — Design

**Status:** approved in brainstorming, 2026-10-05
**Parent spec:** `docs/superpowers/specs/2026-10-03-cyber-arcade-design.md`
**Deadline:** Sophomore Day, 2026-10-08 (build budget about one day, including playtest fixes)

## 1. Summary

Router Repair is a TIS-100-inspired puzzle cabinet in the **learn** category. The screen shows a small grid of router nodes. Each node runs a few lines of a tiny Python subset, and values flow from IN, through the nodes' ports, to OUT. The router firmware is corrupted: one line in one node is broken, so the output is wrong.

The player picks the right patch from 3 candidate lines. The patched program then **really runs**, and the player watches the values move node to node. ACTUAL fills in green where it matches EXPECTED and red where it doesn't.

It differs from Bug Hunt on purpose. Bug Hunt asks "which line is wrong?" Router Repair marks the broken line and asks "what code makes the data come out right?" The node grid and the visible dataflow are the centrepiece.

Tagline: "Corrupted firmware is mangling network traffic. Patch the node code so the data comes out clean."

Controls: **1–3** pick a patch, and **SPACE** fast-forwards the run. Esc exits through the shell as usual.

## 2. Gameplay

All numbers are starting values to tune in playtest.

### Screen
- **Left:** the node grid, at most 3 columns × 2 rows. IN feeds the top of one column and OUT leaves the bottom of one column. Each node is a panel showing its code. The broken line is marked **⚠ CORRUPTED** and shows the glitched line.
- **Right:** the puzzle title and goal (for example "Shift every letter forward by 3"), then three columns: INPUT, EXPECTED and ACTUAL.
- **Bottom:** the 3 candidate lines, labelled 1–3. An option that was tried and failed is struck out.
- **Letter puzzles:** a puzzle with `display: 'letter'` shows the values 0–25 as A–Z in the columns. Any other value shows as its number.

### Puzzle loop
The phases are `pick`, then `play`, then `result`, and back to `pick`. The phase becomes `over` when the run ends.

1. **pick.** The clock runs. Pressing 1–3, or clicking an option, chooses a patch. Struck-out options ignore input.
2. **play.** The chosen line replaces the broken one and the trace is replayed (see §3). The clock is paused. SPACE jumps to the end of the replay.
3. **result.** The verdict and that option's hint line are shown. The clock stays paused. The verdict lasts **1.5 s** after a correct patch and **3 s** after a wrong one, so the hint can be read.
   - **Correct:** score and time are added, and the next puzzle comes up.
   - **Wrong:** time is taken away and the option is struck out. The real wrong output stays in ACTUAL, and the player returns to `pick` on the same puzzle.
   - **Both wrong options used:** the correct patch is auto-applied and replayed for 0 points, then the next puzzle comes up.

### Clock and scoring

| Event | Clock | Score |
|---|---|---|
| Run start | 120 s | 0 |
| Correct on the first try | +8 s | 100 × tier + speed bonus |
| Correct on the second try | +8 s | 25 × tier |
| Wrong patch | −10 s | — |
| Auto-solve | — | 0 |
| All 18 puzzles fixed (**NETWORK RESTORED**) | — | +10 × whole seconds left |

- **Speed bonus:** `max(0, 100 − 5 × s)`, where `s` is the clock seconds spent in `pick` on this puzzle (playback and result time excluded), rounded down.
- The clock never goes below 0. If it reaches 0 during `pick`, the run ends with **LINK LOST**.
- A wrong patch that takes the clock to 0 also ends the run, once its result phase finishes.
- After an end banner of about 2 s, the game calls `ctx.endRun(score)`.
- **HUD:** SCORE, TIME (whole seconds), TIER, FIXED (count).

### Ramp
There are 18 puzzles, 6 per tier. The deck is tier 1 shuffled, then tier 2 shuffled, then tier 3 shuffled, using the seeded rng. Puzzle order changes between runs, but difficulty always rises.

| Tier | Shape | Themes |
|---|---|---|
| 1 | 1 node, about 3–5 lines | Caesar shift, double each value, add a checksum constant, clamp to a max, subtract an offset, count up |
| 2 | 2 nodes in a pipeline | XOR decrypt then forward, parity bit, port filter (drop values > 1023), checksum of pairs, mask low bits, threshold alarm |
| 3 | 3–4 nodes, with branching or merging | route packets left or right by value, "alert after 3 failed logins" counter, rate limiter, decrypt-and-filter chain, max-of-pairs, run-length count |

Every puzzle has a hint line for each option. A wrong option's hint says why it fails, for example "That shifts backwards: decrypting, not encrypting". The correct option's hint says why it works.

### Example puzzle (tier 1)

```python
# node (0,0) — IN above, OUT below
while True:
    x = read(UP)
    write(DOWN, (x + 3) % 26)   # ⚠ CORRUPTED
```

Inputs: `H E L L O X Y Z`. The options are:

1. `write(DOWN, (x + 3) % 26)` (correct)
2. `write(DOWN, (x - 3) % 26)` (shifts backwards)
3. `write(DOWN, x + 3)` (doesn't wrap: X, Y and Z come out as 26, 27 and 28)

Inputs that include X, Y and Z are what make option 3 visibly wrong. Every puzzle's inputs must expose every wrong option, and the content test enforces this (§4).

### Idle
The default `gameIdleMs` (60 s) applies. A run never goes that long without a keypress unless the player has walked away, which is exactly when the idle timeout should fire.

## 3. Architecture

Everything is DOM, with no Phaser. The interpreter and run rules are pure and unit-tested. The DOM only draws and handles input.

| File | Responsibility |
|---|---|
| `src/games/repair/parse.ts` | Tokenizer and parser for the subset (below). `parse(lines: string[]): Program`. It throws `ParseError` with a line number. Pure. |
| `src/games/repair/run.ts` | Node steppers, links and the scheduler. `runGrid(puzzle, choice): RunResult`, where `RunResult = { outputs: number[], status: 'done' \| 'stalled' \| 'fault', trace: Tick[] }`. Pure. |
| `src/games/repair/puzzles.ts` | The 18 `Puzzle` definitions. |
| `src/games/repair/logic.ts` | Pure run state. It holds the deck, clock, score, current puzzle, struck-out options and phase. Actions:<ul><li>`choose(i)`: runs `runGrid` and returns the result</li><li>`finishPlay()`: moves `play` to `result` and applies score and clock</li><li>`finishResult()`: moves `result` to `pick` (or to the next puzzle, or to `over`)</li><li>`tick(dt)`: counts down only in `pick`, and does nothing once the run is `over`</li></ul>It takes an `Rng` for the deck. |
| `src/games/repair/index.ts` | `createGame()`, mount and unmount. Builds the DOM, replays traces, maps keys through `ctx.input.onKey`, and plays sounds through `ctx.audio.sfx`. Code is coloured with `highlight()` from `../bughunt/highlight`, inserted as text nodes only, never innerHTML. |
| `src/games/repair/repair.css` | Theme tokens. Node panels, link arrows that pulse while a value is in flight, the glitch effect on the corrupted line, and the green/red cells in ACTUAL. |
| `src/games/registry.ts` | A new `repair` cabinet after Bug Hunt: `category: 'learn'`, `controls: [['1–3', 'Patch'], ['SPACE', 'Fast-forward']]`, `load: () => import('./repair/index').then((m) => m.createGame())`. |

### The Python subset
- **Indentation:** 4 spaces per level. Tabs, and indentation that isn't a multiple of 4, are parse errors. Blank lines and `#` comments are allowed.
- **Statements:**
  - `NAME = expr`
  - `write(PORT, expr)`
  - `if expr:`, `elif expr:` and `else:`, each with a block
  - `while expr:` with a block
  - `pass`
- **Expressions:**
  - **Atoms:** integer literals, `True`/`False` (as 1/0), variable names, `read(PORT)`, and `( expr )`.
  - **Operators, tightest first:** unary `-`; `* // %`; `+ -`; `^`; comparisons `== != < > <= >=` (no chaining); `not`; `and`; `or`.
  - The order above is Python's precedence for these operators.
- **Semantics:**
  - Values are integers, and comparisons give 1 or 0.
  - `//` and `%` follow Python's rules for negative operands (floor division, and the result of `%` takes the sign of the divisor). Division by zero is a fault.
  - `and` and `or` short-circuit and return 1 or 0.
- **Ports:** `UP`, `DOWN`, `LEFT` and `RIGHT`. A port name anywhere other than the first argument of `read` or `write` is a parse error.
- **One `read` per statement:** a statement (or `if`/`elif`/`while` condition) may contain at most one `read(...)`; a second one is a parse error. This keeps every step's blocking simple: a step either gets its one value or waits.
- **Faults:** reading a variable before it is assigned is a runtime fault. So is dividing by zero. Wrong options may cause faults on purpose.

### Execution model
- Each node is a stepper with its own variables and a program counter. One **step** runs one simple statement (an assignment, `write` or `pass`) or evaluates one `if`/`elif`/`while` condition. A `read` inside an expression blocks the whole step until a value is available.
- **Links:**
  - Every pair of grid neighbours has one link per direction, and each link holds at most one value.
  - `write(P, v)` blocks while the link toward P is full. `read(P)` blocks while the link from P is empty.
  - IN is a queue of the puzzle's `inputs`, attached to the top of column `inCol` on row 0. Only that node's `read(UP)` reads it.
  - OUT collects every value written `DOWN` from the bottom of column `outCol` on the last row.
  - A read or write toward a port with no link blocks forever.
- **Scheduler:**
  - Every tick, each node takes at most one step, in reading order (row by row, left to right).
  - Writes made during a tick become readable on the next tick, so the result doesn't depend on node order.
  - The run ends when one of these happens, checked in this order:
    1. **fault:** any node faulted.
    2. **done:** OUT holds `expected.length` values.
    3. **stalled:** no node made progress this tick.
    4. **stalled:** the tick cap of **5000** has been reached.
- **Expected output:** `expected(puzzle)` runs the puzzle with `puzzle.answer` and returns its outputs. It is never hand-written.
- **Trace:** `Tick = { active: (number | null)[], moves: { from: NodeRef | 'IN', to: NodeRef | 'OUT', value: number }[] }`.
  - `active` gives each node's source line index this tick, or `null` if the node is blocked.
  - `moves` lists the values written onto links this tick.

### Puzzle shape

```ts
interface Puzzle {
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
  broken: { node: number; line: number }; // index into nodes, then into that node's code
  glitch: string;                         // the corrupted text shown on the broken line
  options: [string, string, string];      // candidate replacement lines, without indentation
  answer: 0 | 1 | 2;
  hints: [string, string, string];
  inputs: number[];
}
```

- A candidate line keeps the broken line's indentation when it is swapped in.
- A grid cell with no node is empty and has no links.

### Playback
- `index.ts` replays the trace at `min(150, 3000 / trace.length)` ms per tick, so every run takes 3 s or less. For each tick it:
  - highlights each node's active line
  - animates each move as a value chip sliding along its link arrow
  - appends values that reach OUT to ACTUAL, coloured by whether they match EXPECTED at that index
- After the last tick, `stalled` or `fault` shows **NODE STALLED** or **NODE FAULT** on the node that caused it. For a stall, that is every node still blocked.
- SPACE renders the final state immediately.

### Data attributes for e2e
- The root exposes `data-phase` (`pick`, `play`, `result`, `over`), `data-puzzle` (the puzzle id) and `data-time` (whole seconds).
- Each option exposes `data-option` (0–2) and `data-struck`.
- `?seed=N` fixes the deck order.

### Teardown
`unmount()` cancels the rAF clock loop, the playback timer, the result and end delays, and the key subscriptions, then removes the root. Use the same `tornDown` guard as Bug Hunt. Repeated mount and unmount must leak nothing.

## 4. Testing

### Unit tests (Vitest)

`tests/unit/repair-parse.test.ts`
- Every statement and expression form parses.
- Operator precedence matches Python.
- `//` and `%` give Python results for negative operands.
- These are all rejected with the right line number: bad indentation, tabs, an unknown statement, a port used as a value, and a missing colon.

`tests/unit/repair-run.test.ts`
- Single-node echo: the outputs equal the inputs.
- `write` blocks while the link is full, and `read` blocks while it is empty.
- A 2-node pipeline works.
- A value written in a tick isn't readable until the next tick.
- These end as `stalled`: inputs exhausted, an infinite loop with no I/O (the tick cap), and a read from an unlinked port.
- These end as `fault`: an unknown variable, and division by zero.
- The trace's OUT moves equal `outputs`.

`tests/unit/repair-puzzles.test.ts` (content safety)
- There are 18 puzzles, 6 per tier, with unique ids.
- Node positions fit the grid, and `inCol` and `outCol` point at existing nodes.
- Every node's code parses with every option swapped in.
- The answer option finishes `done` with at least 4 outputs.
- Each wrong option fails in one of two ways:
  - its outputs differ from `expected` in some position (or it produced fewer outputs), or
  - its status is `stalled` or `fault`.
- `broken.line` points at a real code line.

`tests/unit/repair-logic.test.ts`
- The clock rules work: start at 120, +8 for a correct patch, −10 for a wrong one, and the clock pauses outside `pick`.
- Scoring works: first try 100 × tier + speed bonus (checked at 0 s, 7 s and 25 s), second try 25 × tier, auto-solve 0, and the win bonus.
- A struck option ignores `choose`.
- Two wrong options lead to an auto-solve.
- The deck stays in tier order over 200 seeds.
- LINK LOST at 0, including through a wrong patch.
- Nothing changes once the run is `over`.

### E2E (Playwright, `tests/e2e/games.spec.ts`)
- Router Repair boots and shows its node grid.
- With a fixed seed, pressing the first puzzle's answer key reaches `result`, raises the score, and then changes `data-puzzle`.
- Pressing a wrong key lowers `data-time` by about 10 and sets `data-struck` on that option.
- Esc tears it down.
- `repair` is added to the existing mount/unmount leak loop.

## 5. Out of scope
- A free-typing "lab mode" where students write node code. The interpreter makes this possible later.
- Patching more than one line, and lists, strings or functions in the subset.
- Touch controls, saving between runs, and a puzzle editor.
