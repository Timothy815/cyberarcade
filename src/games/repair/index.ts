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
          // Each animated tick's chip flight lasts the tick: clear the previous tick's chips before adding new ones.
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
          chip.style.cssText = `--x0:${x0}px;--y0:${y0}px;--x1:${x1}px;--y1:${y1}px;--ms:${play!.ms}ms`;
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
        const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
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
