import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { highlight } from './highlight';
import { createRun, current, multiplier, pick, STRIKES, timeLimit } from './logic';
import { KIND_LABEL, SNIPPETS } from './snippets';

const RIGHT_MS = 1800; // the fix stays on screen this long after a right pick
const WRONG_MS = 3500; // longer after a mistake so the explanation can be read

/** One line of code as coloured token spans. textContent only — never innerHTML. */
function codeSpan(line: string): HTMLElement {
  return el('span.bh-code', {}, ...highlight(line).map((t) => el(`span.bh-tok-${t.kind}`, {}, t.text)));
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const run = createRun(SNIPPETS);
      const hud = createHud([['score', 'SCORE'], ['bugs', 'BUGS'], ['combo', 'COMBO'], ['strikes', 'STRIKES']]);
      const goal = el('div.bh-goal-text');
      const lines = el('div.bh-lines');
      const panel = el('div.bh-panel', {}, el('div.bh-panel-title', {}, 'main.py'), lines);
      const bar = el('div.bh-timer-fill');
      const verdict = el('div.bh-verdict');
      const tag = el('div.bh-tag');
      const why = el('div.bh-why');
      root = el(
        'div.bughunt',
        {},
        hud.el,
        el('div.bh-goal', {}, el('span.bh-goal-label', {}, 'GOAL'), goal),
        panel,
        el('div.bh-side', {}, el('div.bh-timer', {}, bar), verdict, tag, why),
        el('div.bh-keys', {}, '↑ ↓ pick a line · ENTER or click to squash'),
      );
      container.append(root);

      let cursor = 0;
      let deadline = 0;
      let limit = 0;
      let busy = true;

      const updateHud = () => {
        hud.set('score', run.score.toLocaleString('en-US'));
        hud.set('bugs', String(run.correct));
        hud.set('combo', `×${multiplier(run.streak)}`);
        hud.set('strikes', '✖'.repeat(run.strikes) + '·'.repeat(STRIKES - run.strikes));
      };

      const moveCursor = (to: number) => {
        lines.children[cursor]?.classList.remove('is-cursor');
        cursor = Math.max(0, Math.min(lines.children.length - 1, to));
        lines.children[cursor]?.classList.add('is-cursor');
      };

      const showSnippet = () => {
        const s = current(run)!;
        panel.dataset.id = s.id;
        panel.className = 'bh-panel is-in';
        goal.textContent = s.goal;
        lines.replaceChildren(
          ...s.code.map((line, i) => {
            const row = el('div.bh-line', { 'data-line': i }, el('span.bh-n', {}, String(i + 1)), codeSpan(line));
            row.addEventListener('click', () => {
              if (busy) return; // during the post-answer pause the fix row has shifted the indexes
              moveCursor(i);
              squash(i);
            });
            return row;
          }),
        );
        cursor = 0;
        moveCursor(0);
        verdict.textContent = '';
        verdict.className = 'bh-verdict';
        tag.textContent = '';
        tag.className = 'bh-tag';
        why.textContent = '';
        limit = timeLimit(s.level, run.correct) * 1000;
        deadline = performance.now() + limit;
        busy = false;
      };

      const squash = (line: number | null) => {
        if (busy) return;
        busy = true;
        const secondsLeft = Math.max(0, deadline - performance.now()) / 1000;
        const result = pick(run, line, secondsLeft)!;
        const s = result.snippet;
        updateHud();
        lines.children[cursor]?.classList.remove('is-cursor');
        if (line !== null && !result.right) lines.children[line]?.classList.add('is-miss');
        const bugRow = lines.children[s.bug];
        bugRow?.classList.add('is-bug');
        bugRow?.after(el('div.bh-line.is-fix', {}, el('span.bh-n', {}, '✓'), codeSpan(s.fix)));
        verdict.textContent = result.right
          ? `SQUASHED! +${result.points.toLocaleString('en-US')}`
          : `${line === null ? "TIME'S UP" : 'MISSED'} — LINE ${s.bug + 1}`;
        verdict.className = `bh-verdict ${result.right ? 'is-right' : 'is-wrong'}`;
        panel.className = `bh-panel ${result.right ? 'is-right' : 'is-wrong'}`;
        tag.textContent = KIND_LABEL[s.kind];
        tag.className = 'bh-tag is-on';
        why.textContent = s.why;
        ctx.audio.sfx(result.right ? 'coin' : 'error');
        pause = setTimeout(() => {
          if (result.over) ctx.endRun(run.score);
          else showSnippet();
        }, result.right ? RIGHT_MS : WRONG_MS);
      };

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (busy) return;
        const left = deadline - performance.now();
        bar.style.transform = `scaleX(${Math.max(0, left / limit)})`;
        if (left <= 0) squash(null);
      };

      ctx.input.onKey((e) => {
        if (busy) return;
        if (e.code === 'ArrowUp') moveCursor(cursor - 1);
        else if (e.code === 'ArrowDown') moveCursor(cursor + 1);
        else if (e.code === 'Enter' && !e.repeat) squash(cursor);
      });

      updateHud();
      showSnippet();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimeout(pause);
      root?.remove(); // the line click listeners go with their elements
      root = null;
    },
  };
}
