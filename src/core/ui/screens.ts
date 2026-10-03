import type { Audio } from '../audio';
import type { Input } from '../input';
import { formatScore, type ScoreEntry } from '../scores';
import { timing } from '../theme';
import type { GameCabinet } from '../types';
import { el, html } from './dom';
import { ICONS } from './icons';
import { initialInitials, reduceInitials } from './initials-model';
import { runScreen } from './screen';

export interface ScreenDeps {
  host: HTMLElement;
  input: Input;
  audio: Audio;
  signal: AbortSignal;
}

const accent = (cab: { category: string }) => `accent-${cab.category}`;

/** Game title + controls. Enter/Space/click → 'start', Esc → 'back' (also after 30 s idle). */
export function titleCard(d: ScreenDeps, cab: GameCabinet) {
  return runScreen<'start' | 'back'>(d.host, `title-card ${accent(cab)}`, d.signal, (root, done) => {
    root.append(
      html('div.title-icon', ICONS[cab.id] ?? ''),
      el('h1.title-name', {}, cab.title),
      el('p.title-tagline', {}, cab.tagline),
      el(
        'div.controls',
        {},
        ...cab.controls.map(([k, a]) => el('div.control', {}, el('kbd', {}, k), el('span', {}, a))),
      ),
      el('p.blink', {}, 'PRESS ENTER TO START'),
      el('p.hint', {}, 'ESC BACK'),
    );
    const start = () => {
      d.audio.sfx('select');
      done('start');
    };
    const off = d.input.onKey((e) => {
      if (e.repeat) return;
      if (e.key === 'Enter' || e.key === ' ') start();
      else if (e.key === 'Escape') {
        d.audio.sfx('back');
        done('back');
      }
    });
    root.addEventListener('click', start);
    const idle = setTimeout(() => done('back'), timing.titleIdleMs);
    return () => {
      off();
      clearTimeout(idle);
    };
  });
}

export function loadingScreen(host: HTMLElement): () => void {
  const root = el('div.screen.loading', {}, el('div.spinner'), el('p', {}, 'LOADING…'));
  host.append(root);
  return () => root.remove();
}

/** GAME OVER with a score count-up. Continues on key/click after a short delay, or automatically. */
export function gameOver(d: ScreenDeps, score: number) {
  return runScreen<void>(d.host, 'game-over', d.signal, (root, done) => {
    const value = el('div.final-score', {}, '0');
    root.append(
      el('h1.glitch', { 'data-text': 'GAME OVER' }, 'GAME OVER'),
      el('p.label', {}, 'FINAL SCORE'),
      value,
      el('p.hint', {}, 'PRESS ANY KEY'),
    );
    d.audio.sfx('explode');
    const started = Date.now();
    const steps = 30;
    let step = 0;
    const counter = setInterval(() => {
      step++;
      value.textContent = formatScore(Math.round((score * step) / steps));
      if (step >= steps) clearInterval(counter);
    }, 30);
    const proceed = () => {
      if (Date.now() - started < timing.gameOverMinMs) return;
      done();
    };
    const off = d.input.onKey((e) => !e.repeat && proceed());
    root.addEventListener('click', proceed);
    const auto = setTimeout(() => done(), timing.gameOverAutoMs);
    return () => {
      off();
      clearInterval(counter);
      clearTimeout(auto);
    };
  });
}

/** NEW HIGH SCORE initials picker. Resolves to the 3 raw letters (sanitized by Scores.add). */
export function initialsEntry(d: ScreenDeps, score: number) {
  return runScreen<string>(d.host, 'initials', d.signal, (root, done) => {
    let state = initialInitials();
    const slots = state.letters.map(() => el('div.slot'));
    const render = () =>
      slots.forEach((s, i) => {
        s.textContent = state.letters[i];
        s.classList.toggle('active', i === state.slot);
      });
    root.append(
      el('h1.neon', {}, 'NEW HIGH SCORE!'),
      el('div.final-score', {}, formatScore(score)),
      el('p.label', {}, 'ENTER YOUR INITIALS'),
      el('div.slots', {}, ...slots),
      el('p.hint', {}, '↑ ↓ LETTER · ← → MOVE · OR JUST TYPE · ENTER DONE'),
    );
    render();
    document.body.dataset.textEntry = '1';
    const finish = () => done(state.letters.join(''));
    const off = d.input.onKey((e) => {
      const next = reduceInitials(state, e.key);
      if (next === state) return;
      state = next;
      d.audio.sfx(state.done ? 'select' : 'type');
      render();
      if (state.done) finish();
    });
    const idle = setTimeout(finish, timing.initialsIdleMs);
    return () => {
      off();
      clearTimeout(idle);
      delete document.body.dataset.textEntry;
    };
  });
}

/** Top-10 board. Enter → 'again', Esc → 'hub', auto 'hub' after 15 s. */
export function leaderboard(d: ScreenDeps, cab: GameCabinet, entries: ScoreEntry[], highlight: number) {
  return runScreen<'again' | 'hub'>(d.host, `leaderboard ${accent(cab)}`, d.signal, (root, done) => {
    const rows = entries.length
      ? entries.map((e, i) =>
          el(
            `li${i === highlight ? '.me' : ''}`,
            {},
            el('span.rank', {}, String(i + 1).padStart(2, '0')),
            el('span.who', {}, e.initials),
            el('span.pts', {}, formatScore(e.score)),
          ),
        )
      : [el('li.empty', {}, 'NO SCORES YET')];
    root.append(
      el('h1.neon', {}, cab.title.toUpperCase()),
      el('p.label', {}, 'TOP 10 · THIS STATION'),
      el('ol.board', {}, ...rows),
      el('p.hint', {}, 'ENTER PLAY AGAIN · ESC ARCADE'),
    );
    const off = d.input.onKey((e) => {
      if (e.repeat) return;
      if (e.key === 'Enter') {
        d.audio.sfx('select');
        done('again');
      } else if (e.key === 'Escape') {
        d.audio.sfx('back');
        done('hub');
      }
    });
    const auto = setTimeout(() => done('hub'), timing.leaderboardMs);
    return () => {
      off();
      clearTimeout(auto);
    };
  });
}

/** SYSTEM ERROR // REBOOTING, shown after a game crash. Not abortable. */
export function systemError(host: HTMLElement): Promise<void> {
  const root = el(
    'div.screen.system-error',
    {},
    el('h1.glitch', { 'data-text': 'SYSTEM ERROR' }, 'SYSTEM ERROR'),
    el('p', {}, '// REBOOTING'),
  );
  host.append(root);
  return new Promise((resolve) =>
    setTimeout(() => {
      root.remove();
      resolve();
    }, timing.errorScreenMs),
  );
}
