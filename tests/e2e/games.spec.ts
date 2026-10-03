import { expect, test, type Page } from '@playwright/test';
import { ITEMS } from '../../src/games/phish/items';
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

test('password: five rounds, input cleared, score adds up', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'password');
  const field = page.locator('.pw-input');
  const entries = ['password', 'Xq7#vL2!pR', 'correct horse battery staple', 'kT9$wQ3&zM8^bNx', 'neon taco wizard galaxy 77!'];
  for (const [i, pw] of entries.entries()) {
    await expect(page.locator('.pw-round')).toContainText(`ROUND ${i + 1}`);
    await expect(field).toBeFocused();
    await page.keyboard.type(pw);
    await page.keyboard.press('Enter');
    await expect(field).toHaveValue('');
    await expect(page.locator('.pw-stamp')).toBeVisible();
    if (i === 0) await expect(page.locator('.pw-chip')).toContainText(['COMMON PASSWORD']);
    if (i === 2) await expect(page.locator('.pw-stamp')).toHaveText('SURVIVED!');
    await page.waitForTimeout(1050); // result ignores Enter for the first second
    await page.keyboard.press('Enter');
  }
  // 48 + (1000 + 500) + (2000 + 500) + (1500 + 500) + (2000 + 500)
  await expect(page.locator('.game-over .final-score')).toHaveText('8,548');
  expect(errors).toEqual([]);
});

test('password: Enter on an empty field does not submit the round', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await launch(page, 'password');
  const field = page.locator('.pw-input');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');

  // Simulates a double-tap/held Enter landing on an empty field: must not crack/submit.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await expect(page.locator('.password')).toHaveAttribute('data-phase', 'typing');
  await expect(page.locator('.pw-round')).toContainText('ROUND 1');
  await expect(page.locator('.pw-stamp')).not.toBeVisible();
  await expect(field).toBeEnabled();
  await expect(field).toBeFocused();
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

test('20 launch/exit cycles across the three games leave nothing behind', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  // Records every WebGL/WebGL2 context any canvas hands out, so a regression in invaders'
  // destroyGame (context not released) fails this test even though handler/node counts stay clean.
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
  const games = ['phish', 'password', 'invaders'];
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
