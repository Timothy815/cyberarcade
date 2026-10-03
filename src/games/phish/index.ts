import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { ITEMS, type PhishItem } from './items';
import { answer, createRun, current, multiplier, STRIKES, timeLimit, type RunState } from './logic';

const RIGHT_MS = 450; // pause after a correct answer
const WRONG_MS = 2000; // the clue stays highlighted this long after a mistake
const KIND_LABEL: Record<PhishItem['kind'], string> = { email: 'EMAIL', text: 'TEXT MESSAGE', url: 'LINK' };

/** Renders `text`, wrapping the first occurrence of `clue` in a highlight span. Returns whether it was found. */
function fill(node: HTMLElement, text: string, clue: string | null): boolean {
  node.replaceChildren();
  const at = clue ? text.indexOf(clue) : -1;
  if (at < 0) {
    node.textContent = text;
    return false;
  }
  node.append(text.slice(0, at), el('mark.clue', {}, clue!), text.slice(at + clue!.length));
  return true;
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const run: RunState = createRun(ITEMS);
      const hud = createHud([['score', 'SCORE'], ['combo', 'COMBO'], ['strikes', 'STRIKES']]);
      const kind = el('div.phish-kind');
      const from = el('div.phish-from');
      const subject = el('div.phish-subject');
      const body = el('div.phish-body');
      const card = el('div.phish-card', {}, kind, from, subject, body);
      const bar = el('div.phish-timer-fill');
      const verdict = el('div.phish-verdict');
      const why = el('div.phish-why');
      root = el(
        'div.phish',
        {},
        hud.el,
        el('div.phish-timer', {}, bar),
        card,
        verdict,
        why,
        el('div.phish-keys', {}, el('span.key-phish', {}, '← PHISH'), el('span.key-legit', {}, 'LEGIT →')),
      );
      container.append(root);

      let deadline = 0;
      let limit = 0;
      let busy = false;

      const updateHud = () => {
        hud.set('score', run.score.toLocaleString('en-US'));
        hud.set('combo', `×${multiplier(run.streak)}`);
        hud.set('strikes', '✖'.repeat(run.strikes) + '·'.repeat(STRIKES - run.strikes));
      };

      const show = () => {
        const item = current(run)!;
        card.className = `phish-card is-${item.kind}`;
        card.dataset.id = item.id;
        kind.textContent = KIND_LABEL[item.kind];
        fill(from, item.from, null);
        subject.hidden = item.subject === undefined;
        fill(subject, item.subject ?? '', null);
        fill(body, item.body, null);
        verdict.textContent = '';
        verdict.className = 'phish-verdict';
        why.textContent = '';
        limit = timeLimit(run.correct) * 1000;
        deadline = performance.now() + limit;
        busy = false;
      };

      const decide = (saidPhish: boolean | null) => {
        if (busy) return;
        busy = true;
        const item = current(run)!;
        const secondsLeft = Math.max(0, deadline - performance.now()) / 1000;
        const result = answer(run, saidPhish, secondsLeft);
        updateHud();
        verdict.textContent = `${result.right ? 'CORRECT' : saidPhish === null ? "TIME'S UP" : 'WRONG'} — IT WAS ${item.phish ? 'PHISH' : 'LEGIT'}`;
        verdict.className = `phish-verdict ${result.right ? 'is-right' : 'is-wrong'}`;
        card.classList.add(result.right ? 'is-right' : 'is-wrong');
        if (!result.right) {
          // Highlight the telltale sign in whichever field holds it.
          if (!fill(from, item.from, item.clue) && !fill(subject, item.subject ?? '', item.clue)) fill(body, item.body, item.clue);
          why.textContent = item.why;
        }
        ctx.audio.sfx(result.right ? 'coin' : 'error');
        pause = setTimeout(() => {
          if (result.over) ctx.endRun(run.score);
          else show();
        }, result.right ? RIGHT_MS : WRONG_MS);
      };

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (busy) return;
        const left = deadline - performance.now();
        bar.style.transform = `scaleX(${Math.max(0, left / limit)})`;
        if (left <= 0) decide(null);
      };

      ctx.input.onKey((e) => {
        if (e.repeat) return;
        if (e.code === 'ArrowLeft') decide(true);
        else if (e.code === 'ArrowRight') decide(false);
      });

      updateHud();
      show();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimeout(pause);
      root?.remove();
      root = null;
    },
  };
}
