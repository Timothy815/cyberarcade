import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { call, createRun, describeRule, multiplier, SERVICES, STRIKES, timeLimit, type Action, type Rule } from './logic';

const RIGHT_MS = 450; // pause after a correct call
const WRONG_MS = 2200; // the deciding rule stays highlighted this long after a mistake
const SHIFT_MS = 2400; // "NEW RULES" banner between shifts

/** One rulebook row. The data-* attributes describe the rule for the e2e tests. */
function ruleRow(rule: Rule, n: number): HTMLElement {
  return el(
    `div.pg-rule.is-${rule.action}`,
    { 'data-action': rule.action, 'data-port': rule.port, 'data-proto': rule.proto, 'data-net': rule.net },
    el('span.pg-rule-n', {}, String(n)),
    el('span.pg-rule-text', {}, describeRule(rule)),
  );
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  let pause: ReturnType<typeof setTimeout> | undefined;

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const run = createRun();
      const hud = createHud([['score', 'SCORE'], ['shift', 'SHIFT'], ['combo', 'COMBO'], ['strikes', 'STRIKES']]);
      const rules = el('div.pg-rules');
      const book = el(
        'div.pg-book',
        {},
        el('div.pg-book-title', {}, 'RULEBOOK'),
        el('div.pg-book-note', {}, 'Top to bottom · first match wins'),
        rules,
      );
      const src = el('span.pg-value');
      const port = el('span.pg-value');
      const service = el('span.pg-service');
      const proto = el('span.pg-value');
      const card = el(
        'div.pg-packet',
        {},
        el('div.pg-packet-title', {}, 'INCOMING PACKET'),
        el('div.pg-field', {}, el('span.pg-label', {}, 'FROM'), src),
        el('div.pg-field', {}, el('span.pg-label', {}, 'TO PORT'), port, service),
        el('div.pg-field', {}, el('span.pg-label', {}, 'PROTOCOL'), proto),
      );
      const bar = el('div.pg-timer-fill');
      const verdict = el('div.pg-verdict');
      const why = el('div.pg-why');
      const allowBtn = el('div.pg-btn.is-allow', { role: 'button' }, '← ALLOW');
      const denyBtn = el('div.pg-btn.is-deny', { role: 'button' }, 'DENY →');
      const banner = el('div.pg-banner');
      root = el(
        'div.port',
        {},
        hud.el,
        book,
        el('div.pg-side', {}, card, el('div.pg-timer', {}, bar), verdict, why),
        el('div.pg-keys', {}, allowBtn, denyBtn),
        banner,
      );
      container.append(root);

      let deadline = 0;
      let limit = 0;
      let busy = true;

      const updateHud = () => {
        hud.set('score', run.score.toLocaleString('en-US'));
        hud.set('shift', String(run.shift));
        hud.set('combo', `×${multiplier(run.streak)}`);
        hud.set('strikes', '✖'.repeat(run.strikes) + '·'.repeat(STRIKES - run.strikes));
      };

      const showBook = () => {
        root!.dataset.shift = String(run.shift);
        rules.replaceChildren(
          ...run.book.rules.map((r, i) => ruleRow(r, i + 1)),
          el(
            `div.pg-rule.is-fallback.is-${run.book.fallback}`,
            { 'data-action': run.book.fallback, 'data-fallback': '' },
            el('span.pg-rule-n', {}, '*'),
            el('span.pg-rule-text', {}, `${run.book.fallback === 'allow' ? 'ALLOW' : 'DENY'} everything else`),
          ),
        );
      };

      const showPacket = () => {
        const p = run.packet;
        src.textContent = p.src;
        port.textContent = String(p.port);
        service.textContent = SERVICES[p.port].name;
        proto.textContent = p.proto;
        card.className = 'pg-packet is-in';
        Object.assign(card.dataset, { src: p.src, port: String(p.port), proto: p.proto });
        for (const row of rules.children) row.classList.remove('is-hit');
        verdict.textContent = '';
        verdict.className = 'pg-verdict';
        why.textContent = '';
        limit = timeLimit(run.correct) * 1000;
        deadline = performance.now() + limit;
        busy = false;
      };

      const decide = (said: Action | null) => {
        if (busy) return;
        busy = true;
        const judged = run.book; // call() may swap in the next shift's rulebook
        const secondsLeft = Math.max(0, deadline - performance.now()) / 1000;
        const result = call(run, said, secondsLeft);
        updateHud();
        const word = result.action === 'allow' ? 'ALLOW' : 'DENY';
        verdict.textContent = result.right ? `CORRECT — ${word}` : `${said === null ? "TIME'S UP" : 'WRONG'} — SHOULD ${word}`;
        verdict.className = `pg-verdict ${result.right ? 'is-right' : 'is-wrong'}`;
        card.className = `pg-packet ${result.right ? 'is-right' : 'is-wrong'}`;
        // Point at the rule that decided it (the fallback row is last).
        const row = rules.children[result.rule < 0 ? rules.children.length - 1 : result.rule];
        row?.classList.add('is-hit');
        if (!result.right) {
          why.textContent =
            result.rule < 0
              ? `No rule matched, so the default applies: ${word} everything else.`
              : `Rule ${result.rule + 1} matched first: ${describeRule(judged.rules[result.rule])}.`;
        }
        ctx.audio.sfx(result.right ? 'coin' : 'error');
        pause = setTimeout(() => {
          if (result.over) {
            ctx.endRun(run.score);
          } else if (result.newShift) {
            banner.textContent = `SHIFT ${run.shift} · NEW RULES  +${result.bonus.toLocaleString('en-US')}`;
            banner.classList.add('is-on');
            ctx.audio.sfx('powerup');
            showBook();
            pause = setTimeout(() => {
              banner.classList.remove('is-on');
              showPacket();
            }, SHIFT_MS);
          } else {
            showPacket();
          }
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
        if (e.code === 'ArrowLeft') decide('allow');
        else if (e.code === 'ArrowRight') decide('deny');
      });
      allowBtn.addEventListener('click', () => decide('allow'));
      denyBtn.addEventListener('click', () => decide('deny'));

      updateHud();
      showBook();
      showPacket();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimeout(pause);
      root?.remove(); // the button click listeners go with their elements
      root = null;
    },
  };
}
