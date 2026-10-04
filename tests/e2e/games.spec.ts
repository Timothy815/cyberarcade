import { expect, test, type Page } from '@playwright/test';
import { SNIPPETS } from '../../src/games/bughunt/snippets';
import { mulberry32 } from '../../src/core/random';
import { caesar, TRIVIA } from '../../src/games/password/challenges';
import { planRun } from '../../src/games/password/patterns';
import { ITEMS } from '../../src/games/phish/items';
import { evaluate, type Action, type Proto, type Rule } from '../../src/games/port/logic';
import { boot, trackErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

/** Rotates the hub to the cabinet with `id` and starts it through the title card. */
async function launch(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 9; i++) {
    if ((await page.locator('.cabinet.is-center').getAttribute('data-id')) === id) break;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
  }
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', id);
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-card')).toBeVisible();
  await page.keyboard.press('Enter');
}

const phishOf = (id: string | null) => ITEMS.find((i) => i.id === id)!.phish;

test('phish: right answer scores, three wrong answers end the run', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'phish');
  const card = page.locator('.phish-card');
  await expect(card).toBeVisible();

  const first = await card.getAttribute('data-id');
  await page.keyboard.press(phishOf(first) ? 'ArrowLeft' : 'ArrowRight');
  await expect(page.locator('.phish-verdict')).toContainText('CORRECT');
  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');

  for (let i = 0; i < 3; i++) {
    await expect(card).not.toHaveClass(/is-(right|wrong)/); // previous verdict cleared, next card shown
    const id = await card.getAttribute('data-id');
    await page.keyboard.press(phishOf(id) ? 'ArrowRight' : 'ArrowLeft');
    await expect(page.locator('.phish-why')).not.toBeEmpty();
    await expect(page.locator('mark.clue')).toBeVisible();
  }
  await expect(page.locator('.game-over .final-score')).toBeVisible({ timeout: 5000 });
  expect(errors).toEqual([]);
});

/** Picks `n` distinct characters that are not in `pw` (either case). Skips m, the mute key outside text fields. */
function missesFor(pw: string, n: number): string[] {
  const used = pw.toLowerCase();
  return [...'qzxjvkwyfgbhupdtcnlrsoaie0123456789'].filter((c) => !used.includes(c)).slice(0, n);
}

/** Reads the open challenge from the DOM and returns the 0-based index of the right choice. */
async function challengeAnswer(page: Page): Promise<number> {
  const panel = page.locator('.pc-challenge');
  const kind = await panel.getAttribute('data-kind');
  const q = (await panel.locator('.pc-q').textContent()) ?? '';
  const choices = await panel.locator('.pc-choice-text').allTextContents();
  let right: string;
  if (kind === 'trivia') {
    const t = TRIVIA.find((x) => x.q === q)!;
    right = t.choices[t.answer];
  } else if (kind === 'caesar') {
    const shift = Number(((await panel.locator('.pc-detail').textContent()) ?? '').replace(/\D/g, ''));
    right = caesar(q, -shift);
  } else right = String(parseInt(q, 2));
  return choices.indexOf(right);
}

test('password cracker: crack round 1, earn turns, then get locked out', async ({ page }) => {
  const errors = trackErrors(page);
  const [r1, r2] = planRun(mulberry32(7));
  await boot(page, '?seed=7');
  await launch(page, 'password');
  const turns = page.locator('[data-hud="turns"]');
  await expect(page.locator('.pc-round')).toContainText('ROUND 1');
  await expect(page.locator('.pc-guess')).toBeFocused();
  await expect(turns).toHaveText('8');

  const [miss] = missesFor(r1.password, 1);
  await page.keyboard.press(miss);
  await expect(turns).toHaveText('7');
  await expect(page.locator('.pc-chip.is-miss')).toHaveText(miss.toUpperCase());

  const hit = [...r1.password].find((c) => /[a-z]/i.test(c) && c.toLowerCase() !== 'm')!;
  await page.keyboard.press(hit);
  await expect(page.locator('.pc-slot.is-shown').first()).toBeVisible();
  await expect(turns).toHaveText('7');

  await page.keyboard.press('Enter');
  await expect(page.locator('.pc-solve')).toBeFocused();
  await page.keyboard.type(r1.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.pc-stamp')).toHaveText('CRACKED!');
  await expect(page.locator('[data-hud="score"]')).toHaveText('450'); // 100 × round 1 + 50 × 7 turns
  await page.waitForTimeout(1050); // the result ignores Enter for the first second
  await page.keyboard.press('Enter');

  await expect(page.locator('.pc-round')).toContainText('ROUND 2');
  await expect(turns).toHaveText('8');
  await page.keyboard.press('Tab');
  await expect(page.locator('.pc-challenge')).toBeVisible();
  await page.keyboard.press(String((await challengeAnswer(page)) + 1));
  await expect(page.locator('.pc-reward')).toBeVisible();
  await page.keyboard.press('1');
  await expect(turns).toHaveText('10');
  await expect(page.locator('[data-hud="score"]')).toHaveText('475');

  for (const c of missesFor(r2.password, 10)) {
    await expect(page.locator('.password')).toHaveAttribute('data-phase', 'guess');
    await page.keyboard.press(c);
  }
  await expect(page.locator('.pc-challenge.is-last')).toBeVisible();
  const right = await challengeAnswer(page);
  await page.keyboard.press(String(((right + 1) % 4) + 1));
  await expect(page.locator('.pc-stamp')).toHaveText('ACCOUNT LOCKED');
  await expect(page.locator('.game-over .final-score')).toHaveText('475', { timeout: 6000 });
  expect(errors).toEqual([]);
});

test('password cracker: hack challenges are capped at 2 per round', async ({ page }) => {
  const errors = trackErrors(page);
  const [r1] = planRun(mulberry32(7));
  await boot(page, '?seed=7');
  await launch(page, 'password');
  const hackBtn = page.locator('.pc-hack');
  await expect(hackBtn).toHaveText('HACK (TAB) ×2');

  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('Tab');
    await expect(page.locator('.pc-challenge')).toBeVisible();
    await page.keyboard.press(String((await challengeAnswer(page)) + 1));
    await expect(page.locator('.pc-reward')).toBeVisible();
    await page.keyboard.press('1'); // +2 turns, back to guessing
    await expect(page.locator('.password')).toHaveAttribute('data-phase', 'guess');
  }
  await expect(hackBtn).toHaveText('HACK (TAB) ×0');
  await expect(hackBtn).toBeDisabled();

  await page.keyboard.press('Tab'); // 3rd hack this round: blocked
  await expect(page.locator('.pc-challenge')).toBeHidden();
  await expect(page.locator('.pc-msg')).toHaveText('NO HACKS LEFT THIS ROUND');

  await page.keyboard.press('Enter');
  await page.keyboard.type(r1.password);
  await page.keyboard.press('Enter');
  await expect(page.locator('.pc-stamp')).toHaveText('CRACKED!');
  await page.waitForTimeout(1050);
  await page.keyboard.press('Enter');

  await expect(page.locator('.pc-round')).toContainText('ROUND 2');
  await expect(hackBtn).toHaveText('HACK (TAB) ×2'); // cap resets each round
  await expect(hackBtn).not.toBeDisabled();
  expect(errors).toEqual([]);
});

test('password cracker: Enter on an empty solve field goes back to guessing', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'password');
  const root = page.locator('.password');
  await expect(page.locator('.pc-guess')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(root).toHaveAttribute('data-phase', 'solve');
  await expect(page.locator('.pc-solve')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(root).toHaveAttribute('data-phase', 'guess');
  await expect(page.locator('[data-hud="turns"]')).toHaveText('8');
  await expect(page.locator('.pc-guess')).toBeFocused();
  await expect(page.locator('.pc-stamp')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('invaders: Phaser boots, firing scores, Esc tears the canvas down', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'invaders');
  await expect(page.locator('.inv-canvas canvas')).toHaveCount(1);
  await expect(page.locator('.inv-banner')).toHaveText('WAVE 1');
  await page.keyboard.down('Space');
  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0', { timeout: 8000 });
  await page.keyboard.up('Space');
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-layer')).toBeHidden();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('runner: Phaser boots, steering moves the packet, Esc tears the canvas down', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '?seed=3');
  await launch(page, 'runner');
  const root = page.locator('.runner');
  await expect(page.locator('.pr-canvas canvas')).toHaveCount(1);
  await expect(root).toHaveAttribute('data-lane', '1');
  await page.keyboard.press('ArrowLeft');
  await expect(root).toHaveAttribute('data-lane', '0');
  await page.keyboard.press('d');
  await expect(root).toHaveAttribute('data-lane', '1');
  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-layer')).toBeHidden();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('runner: the first router gate scores when the packet takes the matching lane', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '?seed=5');
  await launch(page, 'runner');
  // No hazards spawn before the first gate, so the packet can wait in lane 1 for the banner.
  await expect(page.locator('.pr-router')).toHaveClass(/is-on/, { timeout: 20_000 });
  const correct = Number(await page.locator('.runner').getAttribute('data-correct'));
  if (correct === 0) await page.keyboard.press('ArrowLeft');
  if (correct === 2) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.runner')).toHaveAttribute('data-lane', String(correct));
  const scoreOf = async () => Number((await page.locator('[data-hud="score"]').textContent())!.replace(/,/g, ''));
  const before = await scoreOf();
  await expect(page.locator('.pr-flash')).toContainText(/ROUTED \+100/, { timeout: 8000 });
  // Distance points also accrue, so just check the gate's 100 landed on top of them.
  expect((await scoreOf()) - before).toBeGreaterThanOrEqual(100);
  await expect(page.locator('[data-hud="gates"]')).toHaveText('1');
  await expect(page.locator('[data-hud="lives"]')).toHaveText('◆◆◆');
  expect(errors).toEqual([]);
});

/** Rebuilds the rulebook and packet from the page's data attributes and asks the real firewall logic. */
async function portAnswer(page: Page): Promise<Action> {
  const rows = await page.locator('.pg-rule').evaluateAll((els) => els.map((e) => ({ ...(e as HTMLElement).dataset })));
  const rules: Rule[] = rows
    .filter((d) => d.fallback === undefined)
    .map((d) => ({
      action: d.action as Action,
      ...(d.port ? { port: Number(d.port) } : {}),
      ...(d.proto ? { proto: d.proto as Proto } : {}),
      ...(d.net ? { net: d.net } : {}),
    }));
  const fallback = rows.find((d) => d.fallback !== undefined)!.action as Action;
  const card = await page.locator('.pg-packet').evaluate((e) => ({ ...(e as HTMLElement).dataset }));
  return evaluate({ rules, fallback }, { src: card.src!, port: Number(card.port), proto: card.proto as Proto }).action;
}

test('port: right calls score, wrong calls explain the rule, three strikes end the run', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'port');
  const card = page.locator('.pg-packet');
  await expect(card).toHaveClass(/is-in/);
  await expect(page.locator('.pg-rule[data-fallback]')).toHaveCount(1);

  await page.keyboard.press((await portAnswer(page)) === 'allow' ? 'ArrowLeft' : 'ArrowRight');
  await expect(page.locator('.pg-verdict')).toContainText('CORRECT');
  await expect(page.locator('.pg-rule.is-hit')).toHaveCount(1);
  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');

  // A click on the on-screen button counts too.
  await expect(card).toHaveClass(/is-in/);
  await page.locator((await portAnswer(page)) === 'allow' ? '.pg-btn.is-allow' : '.pg-btn.is-deny').click();
  await expect(page.locator('.pg-verdict')).toContainText('CORRECT');

  for (let i = 0; i < 3; i++) {
    await expect(card).toHaveClass(/is-in/); // next packet is up
    await page.keyboard.press((await portAnswer(page)) === 'allow' ? 'ArrowRight' : 'ArrowLeft');
    await expect(page.locator('.pg-verdict')).toContainText('WRONG');
    await expect(page.locator('.pg-why')).toContainText(/matched first|default applies/);
    await expect(page.locator('.pg-rule.is-hit')).toHaveCount(1);
  }
  await expect(page.locator('.game-over .final-score')).toBeVisible({ timeout: 5000 });
  expect(errors).toEqual([]);
});

test('port: a full shift brings a new rulebook', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'port');
  const card = page.locator('.pg-packet');
  await expect(page.locator('.port')).toHaveAttribute('data-shift', '1');
  const firstRules = await page.locator('.pg-rule').count();
  for (let i = 0; i < 8; i++) {
    await expect(card).toHaveClass(/is-in/);
    await page.keyboard.press((await portAnswer(page)) === 'allow' ? 'ArrowLeft' : 'ArrowRight');
    await expect(page.locator('.pg-verdict')).toContainText('CORRECT');
  }
  await expect(page.locator('.pg-banner')).toContainText('SHIFT 2');
  await expect(page.locator('.port')).toHaveAttribute('data-shift', '2');
  expect(await page.locator('.pg-rule').count()).toBeGreaterThan(firstRules);
  await expect(page.locator('[data-hud="shift"]')).toHaveText('2');
  await expect(card).toHaveClass(/is-in/, { timeout: 5000 });
  expect(errors).toEqual([]);
});

/** The current Bug Hunt snippet, looked up from the panel's data-id. */
async function bugSnippet(page: Page) {
  const id = await page.locator('.bh-panel').getAttribute('data-id');
  return SNIPPETS.find((s) => s.id === id)!;
}

test('bughunt: right picks score, misses show the fix, three strikes end the run', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'bughunt');
  const panel = page.locator('.bh-panel');
  await expect(panel).toHaveClass(/is-in/);

  // Keyboard: walk the cursor down to the buggy line and squash it.
  const first = await bugSnippet(page);
  await expect(page.locator('.bh-line[data-line="0"]')).toHaveClass(/is-cursor/);
  for (let i = 0; i < first.bug; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator(`.bh-line[data-line="${first.bug}"]`)).toHaveClass(/is-cursor/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.bh-verdict')).toContainText('SQUASHED');
  await expect(page.locator('.bh-line.is-fix')).toHaveCount(1);
  await expect(page.locator('.bh-line.is-fix')).toHaveText(new RegExp(first.fix.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await expect(page.locator('[data-hud="score"]')).not.toHaveText('0');
  await expect(page.locator('[data-hud="bugs"]')).toHaveText('1');

  // Mouse: clicking the buggy line counts too.
  await expect(panel).toHaveClass(/is-in/, { timeout: 5000 });
  const second = await bugSnippet(page);
  await page.locator(`.bh-line[data-line="${second.bug}"]`).click();
  await expect(page.locator('.bh-verdict')).toContainText('SQUASHED');

  for (let i = 0; i < 3; i++) {
    await expect(panel).toHaveClass(/is-in/, { timeout: 5000 }); // next snippet is up
    const s = await bugSnippet(page);
    const wrong = (s.bug + 1) % s.code.length;
    await page.locator(`.bh-line[data-line="${wrong}"]`).click();
    await expect(page.locator('.bh-verdict')).toContainText(`MISSED — LINE ${s.bug + 1}`);
    await expect(page.locator('.bh-line.is-miss')).toHaveCount(1);
    await expect(page.locator(`.bh-line[data-line="${s.bug}"]`)).toHaveClass(/is-bug/);
    await expect(page.locator('.bh-tag')).not.toBeEmpty();
    await expect(page.locator('.bh-why')).toHaveText(s.why);
  }
  await expect(page.locator('.game-over .final-score')).toBeVisible({ timeout: 6000 });
  expect(errors).toEqual([]);
});

test('20 launch/exit cycles across the six games leave nothing behind', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  // Records every WebGL/WebGL2 context any canvas hands out, so a regression in the Phaser
  // games' destroyGame (context not released) fails this test even though handler/node counts stay clean.
  await page.addInitScript(() => {
    type GLContext = WebGLRenderingContext | WebGL2RenderingContext;
    const contexts: GLContext[] = [];
    (window as unknown as { __glContexts: GLContext[] }).__glContexts = contexts;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
      const ctx = (original as (type: string, options?: unknown) => RenderingContext | null).call(this, type, options);
      if (ctx && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) contexts.push(ctx as GLContext);
      return ctx;
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await boot(page, '?selftest');
  const games = ['phish', 'password', 'invaders', 'port', 'bughunt', 'runner'];
  const cycle = async (id: string) => {
    await launch(page, id);
    await expect(page.locator('.game-root')).toHaveCount(1);
    await page.waitForTimeout(400); // let the game get going before leaving
    await page.keyboard.press('Escape');
    await expect(page.locator('.game-layer')).toBeHidden();
  };

  // Warm-up: the first launch of each game makes Vite add <link rel=modulepreload> tags for its chunks (once, by design).
  for (const id of games) await cycle(id);
  const baseline = await page.evaluate(() => window.__arcadeDebug!.handlerCount());
  const baseNodes = await page.evaluate(() => document.getElementsByTagName('*').length);

  for (let i = 0; i < 20; i++) await cycle(games[i % games.length]);

  expect(await page.evaluate(() => window.__arcadeDebug!.handlerCount())).toBe(baseline);
  expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBe(baseNodes);
  await expect(page.locator('canvas')).toHaveCount(0);
  const liveGlContexts = await page.evaluate(
    () => (window as unknown as { __glContexts: { isContextLost(): boolean }[] }).__glContexts.filter((c) => !c.isContextLost()).length,
  );
  expect(liveGlContexts).toBeLessThanOrEqual(1); // Phaser keeps one feature-detect context
  expect(errors).toEqual([]);
});
