import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { judge, MAX_INPUT, ROUND_SECONDS, ROUNDS, type Verdict } from './logic';

const RIG_MS = 1800; // length of the "cracking" animation
const RESULT_MIN_MS = 1000; // Enter can't skip the result before this
const RESULT_MS = 6000; // result auto-advances after this
const GLYPHS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*?';

function noise(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  return s;
}

export function createGame(): GameModule {
  let root: HTMLElement | null = null;
  let raf = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const hud = createHud([['score', 'SCORE'], ['round', 'ROUND'], ['time', 'TIME']]);
      const title = el('div.pw-round');
      const rule = el('div.pw-rule');
      const target = el('div.pw-target');
      const field = el<'input'>('input.pw-input', {
        type: 'text',
        maxlength: MAX_INPUT,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Password',
      });
      const hint = el('div.pw-hint', {}, 'PRESS ENTER TO CRACK IT');
      const entry = el('div.pw-entry', {}, field, hint);
      const rig = el('pre.pw-rig');
      const meter = el('div.pw-meter-fill');
      const stamp = el('div.pw-stamp');
      const time = el('div.pw-time');
      const chips = el('div.pw-chips');
      const warning = el('div.pw-warning');
      const points = el('div.pw-points');
      const result = el('div.pw-result', {}, stamp, time, chips, warning, points);
      const stage = el('div.pw-stage', {}, entry, rig, result);
      root = el(
        'div.password',
        {},
        hud.el,
        title,
        rule,
        target,
        stage,
        el('div.pw-meter', {}, meter),
        el('div.pw-privacy', {}, '🔒 Checked on this computer only — never sent or saved. Don\'t use a real password!'),
      );
      container.append(root);

      let round = 0;
      let score = 0;
      let phase: 'typing' | 'cracking' | 'result' = 'typing';
      let deadline = 0;
      let resultAt = 0;

      const setPhase = (p: typeof phase) => {
        phase = p;
        root!.dataset.phase = p;
      };

      const startRound = () => {
        const r = ROUNDS[round];
        hud.set('round', `${round + 1}/${ROUNDS.length}`);
        title.textContent = `ROUND ${round + 1}: ${r.name}`;
        rule.textContent = `RULE: ${r.rule}`;
        target.textContent = `SURVIVE ${r.targetLabel}`;
        meter.style.transform = 'scaleX(0)';
        field.value = '';
        field.disabled = false;
        setPhase('typing');
        deadline = performance.now() + ROUND_SECONDS * 1000;
        field.focus();
      };

      const reveal = (v: Verdict) => {
        const r = ROUNDS[round];
        score += v.points;
        hud.set('score', score.toLocaleString('en-US'));
        stamp.textContent = v.broken ? `RULE BROKEN: ${v.broken}` : v.survived ? 'SURVIVED!' : 'CRACKED!';
        stamp.className = `pw-stamp ${v.survived ? 'is-good' : 'is-bad'}`;
        time.textContent = v.broken === 'EMPTY' ? '' : `CRACKED IN ${v.crackTime}`;
        chips.replaceChildren(...v.chips.map((c) => el(`span.pw-chip.${c.good ? 'is-good' : 'is-bad'}`, {}, c.label)));
        warning.textContent = v.warning;
        points.textContent = `+${v.points.toLocaleString('en-US')}${v.survived ? ' (INCLUDES 500 BONUS)' : ''}`;
        meter.style.transform = `scaleX(${Math.min(1, v.guessesLog10 / r.target)})`;
        ctx.audio.sfx(v.survived ? 'score' : 'explode');
        setPhase('result');
        resultAt = performance.now();
        later(next, RESULT_MS);
      };

      const submit = () => {
        if (phase !== 'typing') return;
        const verdict = judge(field.value, ROUNDS[round]);
        const length = Math.max(8, field.value.length);
        field.value = ''; // never keep the password around longer than needed
        field.disabled = true;
        setPhase('cracking');
        ctx.audio.sfx('select');
        const started = performance.now();
        const spin = () => {
          const t = (performance.now() - started) / RIG_MS;
          if (t >= 1) return reveal(verdict);
          rig.textContent = Array.from({ length: 6 }, () => `TRYING  ${noise(length)}`).join('\n');
          later(spin, 50);
        };
        spin();
      };

      const next = () => {
        if (phase !== 'result') return;
        for (const t of timers) clearTimeout(t);
        timers.clear();
        round++;
        if (round >= ROUNDS.length) ctx.endRun(score);
        else startRound();
      };

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (phase !== 'typing') return;
        const left = Math.max(0, deadline - performance.now());
        hud.set('time', String(Math.ceil(left / 1000)));
        if (left === 0) submit();
      };

      ctx.input.onKey((e) => {
        if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
        if (e.repeat) return;
        if (phase === 'typing') {
          if (field.value === '') return;
          submit();
        } else if (phase === 'result' && performance.now() - resultAt >= RESULT_MIN_MS) next();
      });
      ctx.input.onKey((e) => {
        if (phase === 'typing' && e.target !== field && e.key.length === 1) field.focus();
        if (phase === 'typing' && e.target === field) ctx.audio.sfx('type');
      });
      root.addEventListener('pointerdown', () => phase === 'typing' && later(() => field.focus(), 0));

      hud.set('score', '0');
      startRound();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      root?.remove();
      root = null;
    },
  };
}
