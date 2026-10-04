import { mulberry32, type Rng } from '../../core/random';
import type { GameContext, GameModule } from '../../core/types';
import { el } from '../../core/ui/dom';
import { createHud } from '../../core/ui/hud';
import { createChallenges, type Challenge } from './challenges';
import {
  addTurns,
  ALL_CRACKED_BONUS,
  board,
  CHALLENGE_POINTS,
  crackPoints,
  createRound,
  guessChar,
  revealRandom,
  REWARD_TURNS,
  solve,
  type RoundState,
} from './logic';
import { planRun } from './patterns';
import type { Profile } from './profiles';

const FEEDBACK_MS = 900; // right/wrong shown on the choices before moving on
const LAST_CHANCE_DELAY_MS = 600; // pause after the last turn goes before LAST CHANCE opens
const CRACK_MIN_MS = 1000; // Enter can't skip the lesson card before this
const CRACK_MS = 3000; // lesson card auto-advances after this
const LOCKED_MS = 3000; // ACCOUNT LOCKED stays up this long before the run ends
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type Phase = 'guess' | 'solve' | 'wait' | 'challenge' | 'feedback' | 'reward' | 'crack' | 'locked';

/** `?seed=N` makes a run repeatable (used by the e2e tests). */
function runRng(): Rng {
  const seed = new URLSearchParams(location.search).get('seed');
  return seed !== null && /^\d+$/.test(seed) ? mulberry32(Number(seed)) : Math.random;
}

function profileRows(p: Profile): [string, string][] {
  return [
    ['NAME', p.name],
    ['AGE', String(p.age)],
    ['PET', `${p.pet} (${p.petKind})`],
    ['BORN', String(p.birthYear)],
    ['SPORT', `${p.sport} · #${p.jersey}`],
    ['TEAM', p.team],
    ['FAVE ARTIST', p.artist],
    ['FAVE FOOD', p.food],
  ];
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
  const clearTimers = () => {
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };

  return {
    mount(container: HTMLElement, ctx: GameContext) {
      const rng = runRng();
      const plan = planRun(rng); // first use of rng, so tests can rebuild the plan from the seed
      const nextChallenge = createChallenges(rng);

      const hud = createHud([['score', 'SCORE'], ['round', 'ROUND'], ['turns', 'TURNS']]);
      const profile = el('div.pc-profile');
      const title = el('div.pc-round');
      const slots = el('div.pc-board');
      const tried = el('div.pc-tried');
      const msg = el('div.pc-msg');
      const guessField = el<'input'>('input.pc-guess', {
        type: 'text',
        maxlength: 1,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Guess a character',
        placeholder: 'TYPE A CHARACTER',
      });
      const solveField = el<'input'>('input.pc-solve', {
        type: 'text',
        maxlength: 40,
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'aria-label': 'Solve the password',
        placeholder: 'TYPE THE WHOLE PASSWORD',
      });
      const hackBtn = el<'button'>('button.pc-hack', { type: 'button' }, 'HACK (TAB)');
      const keys = el('div.pc-keys', {}, 'TYPE guess a character · ENTER solve · TAB hack challenge');

      // Challenge panel
      const chTitle = el('div.pc-ch-title');
      const chPlaces = el('div.pc-places');
      const chPrompt = el('div.pc-q');
      const chDetail = el('div.pc-detail');
      const chAlpha = el('div.pc-alpha');
      const chChoices = el('div.pc-choices');
      const chTimer = el('div.pc-timer-fill');
      const challengePanel = el(
        'div.pc-challenge',
        {},
        chTitle,
        chPlaces,
        chPrompt,
        chDetail,
        chAlpha,
        chChoices,
        el('div.pc-timer', {}, chTimer),
      );

      // Reward picker
      const rewardTurns = el<'button'>('button.pc-pick', { type: 'button' }, el('span.pc-key', {}, '1'), `+${REWARD_TURNS} TURNS`);
      const rewardReveal = el<'button'>('button.pc-pick', { type: 'button' }, el('span.pc-key', {}, '2'), 'REVEAL A LETTER');
      const rewardPanel = el('div.pc-reward', {}, el('div.pc-ch-title', {}, 'ACCESS GRANTED: PICK A REWARD'), el('div.pc-picks', {}, rewardTurns, rewardReveal));

      // Crack / lockout card
      const stamp = el('div.pc-stamp');
      const reveal = el('div.pc-reveal');
      const points = el('div.pc-points');
      const lesson = el('div.pc-lesson');
      const resultPanel = el('div.pc-result', {}, stamp, reveal, points, lesson);

      root = el(
        'div.password',
        {},
        hud.el,
        el(
          'div.pc-main',
          {},
          profile,
          el('div.pc-play', {}, title, slots, tried, msg, el('div.pc-entry', {}, guessField, solveField, hackBtn), keys),
        ),
        el('div.pc-overlay', {}, challengePanel, rewardPanel, resultPanel),
        el('div.pc-note', {}, 'Every profile in this game is made up.'),
      );
      container.append(root);

      let index = 0;
      let score = 0;
      let round: RoundState = createRound(plan[0].password, plan[0].pattern.turns);
      let phase: Phase = 'guess';
      let challenge: Challenge | null = null;
      let lastChance = false;
      let deadline = 0;
      let crackAt = 0;

      const setPhase = (p: Phase) => {
        phase = p;
        root!.dataset.phase = p;
        focusActive();
      };
      const focusActive = () => (phase === 'solve' ? solveField : guessField).focus();

      const say = (text: string, tone: 'good' | 'bad' | '' = '') => {
        msg.textContent = text;
        msg.className = tone ? `pc-msg is-${tone}` : 'pc-msg';
      };

      const flash = (node: HTMLElement) => {
        node.classList.remove('is-flash');
        void node.offsetWidth; // restart the CSS animation
        node.classList.add('is-flash');
      };

      const render = (popped = '') => {
        hud.set('score', score.toLocaleString('en-US'));
        hud.set('turns', String(round.turns));
        root!.classList.toggle('is-low', round.turns <= 2);
        slots.replaceChildren(
          ...board(round).map((c, i) => {
            const space = round.password[i] === ' ';
            const cls = space ? '.is-space' : c ? `.is-shown${popped && c.toLowerCase() === popped ? '.is-pop' : ''}` : '';
            return el(`div.pc-slot${cls}`, {}, space ? '' : c);
          }),
        );
        tried.replaceChildren(
          ...round.tried.map((c) => {
            const hit = [...round.password].some((p) => p.toLowerCase() === c);
            return el(`span.pc-chip.${hit ? 'is-hit' : 'is-miss'}`, {}, c.toUpperCase());
          }),
        );
      };

      const startRound = () => {
        const r = plan[index];
        round = createRound(r.password, r.pattern.turns);
        hud.set('round', `${index + 1}/${plan.length}`);
        title.textContent = `ROUND ${index + 1}: ${r.pattern.name}`;
        title.classList.toggle('is-boss', index === plan.length - 1);
        profile.replaceChildren(
          el('div.pc-profile-title', {}, 'TARGET PROFILE'),
          ...profileRows(r.profile).map(([k, v]) => el('div.pc-row', {}, el('span.pc-row-key', {}, k), el('span.pc-row-val', {}, v))),
        );
        say(`${r.password.length} CHARACTERS. USE THE PROFILE!`);
        render();
        setPhase('guess');
      };

      // ---- rounds ----

      const afterTurnLoss = () => {
        if (round.status !== 'out') return;
        setPhase('wait');
        say('OUT OF TURNS!', 'bad');
        later(() => openChallenge(true), LAST_CHANCE_DELAY_MS);
      };

      const cracked = () => {
        const gained = crackPoints(index, round.turns);
        const last = index === plan.length - 1;
        score += gained + (last ? ALL_CRACKED_BONUS : 0);
        render();
        stamp.textContent = 'CRACKED!';
        stamp.className = 'pc-stamp is-good';
        reveal.textContent = round.password;
        points.textContent = `+${gained.toLocaleString('en-US')}${last ? ` · ALL CRACKED +${ALL_CRACKED_BONUS.toLocaleString('en-US')}` : ''}`;
        lesson.textContent = plan[index].pattern.lesson;
        ctx.audio.sfx('score');
        crackAt = performance.now();
        setPhase('crack');
        later(nextRound, CRACK_MS);
      };

      const nextRound = () => {
        if (phase !== 'crack') return;
        clearTimers();
        index++;
        if (index >= plan.length) ctx.endRun(score);
        else startRound();
      };

      const locked = () => {
        round.revealed = round.revealed.map(() => true);
        render();
        stamp.textContent = 'ACCOUNT LOCKED';
        stamp.className = 'pc-stamp is-bad';
        reveal.textContent = round.password;
        points.textContent = `FINAL SCORE ${score.toLocaleString('en-US')}`;
        lesson.textContent = 'Too many wrong guesses: real accounts lock attackers out too.';
        ctx.audio.sfx('explode');
        setPhase('locked');
        later(() => ctx.endRun(score), LOCKED_MS);
      };

      const guess = (ch: string) => {
        const result = guessChar(round, ch);
        if (result === 'invalid') return;
        if (result === 'repeat') {
          say(`ALREADY TRIED ${ch.toUpperCase()}`);
          flash(tried);
          ctx.audio.sfx('back');
          return;
        }
        render(result === 'hit' ? ch.toLowerCase() : '');
        if (result === 'hit') {
          const n = [...round.password].filter((c) => c.toLowerCase() === ch.toLowerCase()).length;
          say(`HIT! ${n} × ${ch.toUpperCase()}`, 'good');
          ctx.audio.sfx('coin');
        } else {
          say(`NO ${ch.toUpperCase()}: −1 TURN`, 'bad');
          ctx.audio.sfx('error');
        }
        if (round.status === 'cracked') cracked();
        else afterTurnLoss();
      };

      const openSolve = () => {
        solveField.value = '';
        say('TYPE THE WHOLE PASSWORD. CAPITALS COUNT! (ENTER ON EMPTY TO CANCEL)');
        ctx.audio.sfx('select');
        setPhase('solve');
      };

      const submitSolve = () => {
        const attempt = solveField.value;
        solveField.value = '';
        if (attempt === '') {
          say('');
          setPhase('guess');
          return;
        }
        if (solve(round, attempt)) return cracked();
        render();
        say('WRONG PASSWORD: −2 TURNS', 'bad');
        ctx.audio.sfx('hit');
        setPhase('guess');
        afterTurnLoss();
      };

      // ---- challenges ----

      const openChallenge = (isLastChance: boolean) => {
        lastChance = isLastChance;
        challenge = nextChallenge();
        const c = challenge;
        challengePanel.dataset.kind = c.kind;
        challengePanel.classList.toggle('is-last', isLastChance);
        chTitle.textContent = isLastChance ? `LAST CHANCE! RIGHT = +${REWARD_TURNS} TURNS, WRONG = LOCKED` : 'HACK CHALLENGE';
        if (c.kind === 'binary') {
          chPlaces.replaceChildren(...c.detail.split(' ').map((v) => el('span', {}, v)));
          chPrompt.replaceChildren(...[...c.prompt].map((b) => el('span', {}, b)));
          chDetail.textContent = 'WHAT NUMBER IS THIS? ADD THE PLACES WITH A 1';
        } else {
          chPlaces.replaceChildren();
          chPrompt.textContent = c.prompt;
          chDetail.textContent = c.detail;
        }
        chAlpha.textContent = c.kind === 'caesar' ? ALPHABET.split('').join(' ') : '';
        chChoices.replaceChildren(
          ...c.choices.map((text, i) => {
            const b = el<'button'>('button.pc-choice', { type: 'button' }, el('span.pc-key', {}, String(i + 1)), el('span.pc-choice-text', {}, text));
            b.addEventListener('click', () => answer(i));
            return b;
          }),
        );
        deadline = performance.now() + c.seconds * 1000;
        chTimer.style.transform = 'scaleX(1)';
        ctx.audio.sfx('powerup');
        setPhase('challenge');
      };

      const answer = (i: number) => {
        if (phase !== 'challenge' || !challenge) return;
        const right = i === challenge.answer;
        [...chChoices.children].forEach((b, j) => {
          if (j === challenge!.answer) b.classList.add('is-right');
          else if (j === i) b.classList.add('is-wrong');
        });
        if (right) {
          score += CHALLENGE_POINTS;
          hud.set('score', score.toLocaleString('en-US'));
        }
        ctx.audio.sfx(right ? 'coin' : 'error');
        setPhase('feedback');
        later(() => {
          if (lastChance) {
            if (!right) return locked();
            addTurns(round, REWARD_TURNS);
            render();
            say(`SAVED! +${REWARD_TURNS} TURNS`, 'good');
            setPhase('guess');
          } else if (right) {
            setPhase('reward');
          } else {
            say(i < 0 ? 'TOO SLOW: NO REWARD' : 'WRONG: NO REWARD', 'bad');
            setPhase('guess');
          }
        }, FEEDBACK_MS);
      };

      const reward = (which: 'turns' | 'reveal') => {
        if (phase !== 'reward') return;
        ctx.audio.sfx('powerup');
        if (which === 'turns') {
          addTurns(round, REWARD_TURNS);
          render();
          say(`+${REWARD_TURNS} TURNS`, 'good');
          return setPhase('guess');
        }
        const ch = revealRandom(round, rng);
        render(ch ? ch.toLowerCase() : '');
        say(ch ? `REVEALED ${ch.toUpperCase()}` : '', 'good');
        if (round.status === 'cracked') cracked();
        else setPhase('guess');
      };
      rewardTurns.addEventListener('click', () => reward('turns'));
      rewardReveal.addEventListener('click', () => reward('reveal'));
      hackBtn.addEventListener('click', () => phase === 'guess' && openChallenge(false));

      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (phase !== 'challenge' || !challenge) return;
        const left = Math.max(0, deadline - performance.now());
        chTimer.style.transform = `scaleX(${left / (challenge.seconds * 1000)})`;
        if (left === 0) answer(-1);
      };

      // ---- input ----

      const isEnter = (e: KeyboardEvent) => e.code === 'Enter' || e.code === 'NumpadEnter';
      const choiceKey = (e: KeyboardEvent) => (/^[1-4]$/.test(e.key) ? Number(e.key) - 1 : -1);

      ctx.input.onKey((e) => {
        if (e.key === 'Tab') e.preventDefault(); // TAB is the hack key, never a focus move
        const typed = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
        // The guess field is only a focus anchor (it keeps the global M mute key quiet); it never holds text.
        if (typed && phase !== 'solve') e.preventDefault();

        if (phase === 'guess') {
          if (isEnter(e)) {
            if (!e.repeat) openSolve();
          } else if (e.key === 'Tab') openChallenge(false);
          else if (typed && e.key !== ' ') guess(e.key);
        } else if (phase === 'solve') {
          if (isEnter(e)) {
            if (!e.repeat) submitSolve();
          } else if (e.key === 'Tab') {
            solveField.value = '';
            openChallenge(false);
          } else if (typed) ctx.audio.sfx('type');
        } else if (phase === 'challenge') {
          const i = choiceKey(e);
          if (i >= 0 && i < (challenge?.choices.length ?? 0)) answer(i);
        } else if (phase === 'reward') {
          if (e.key === '1') reward('turns');
          else if (e.key === '2') reward('reveal');
        } else if (phase === 'crack') {
          if (isEnter(e) && !e.repeat && performance.now() - crackAt >= CRACK_MIN_MS) nextRound();
        }
      });
      // Clicks never move focus off the active field (buttons still get their click).
      root.addEventListener('mousedown', (e) => {
        if (e.target !== guessField && e.target !== solveField) e.preventDefault();
      });
      root.addEventListener('pointerdown', () => later(focusActive, 0));

      startRound();
      raf = requestAnimationFrame(tick);
    },
    unmount() {
      cancelAnimationFrame(raf);
      clearTimers();
      root?.remove();
      root = null;
    },
  };
}
