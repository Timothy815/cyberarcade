import { expect, test } from '@playwright/test';
import { boot, startSelftest, trackErrors } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('full flow: title → play → game over → initials → leaderboard → hub', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '?selftest');
  await startSelftest(page);

  await page.keyboard.press('KeyQ');
  await expect(page.locator('[data-test="keys"]')).toHaveText('1');

  await page.locator('[data-test="end"]').click();
  await expect(page.locator('.selftest')).toHaveCount(0);
  await expect(page.locator('.game-over .final-score')).toHaveText('4,242');
  await page.waitForTimeout(1100); // game-over ignores input for the first second
  await page.keyboard.press('Enter');

  await expect(page.locator('.initials')).toBeVisible();
  await page.keyboard.type('ZAK');
  await page.keyboard.press('Enter');

  await expect(page.locator('.leaderboard li.me .who')).toHaveText('ZAK');
  await expect(page.locator('.leaderboard li.me .pts')).toHaveText('4,242');
  await page.keyboard.press('Escape');

  await expect(page.locator('.cabinet.is-center .cab-score')).toContainText('ZAK');
  expect(errors).toEqual([]);
});

test('a crashing game shows SYSTEM ERROR and returns to the hub', async ({ page }) => {
  await boot(page, '?selftest');
  await startSelftest(page);
  await page.locator('[data-test="throw"]').click();
  await expect(page.locator('.system-error')).toBeVisible();
  await expect(page.locator('.selftest')).toHaveCount(0);
  await expect(page.locator('.cabinet.is-center')).toBeVisible({ timeout: 6000 });
  await expect(page.locator('.game-layer')).toBeHidden();
});

test('Esc in a game returns to the hub and removes the game', async ({ page }) => {
  await boot(page, '?selftest');
  await startSelftest(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('.game-layer')).toBeHidden();
  await expect(page.locator('.game-root')).toHaveCount(0);
  expect(await page.evaluate(() => window.__selftest)).toEqual({ mounts: 1, unmounts: 1 });
});

test('20 launch/exit cycles leave no listeners or DOM behind', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page, '?selftest');
  const baseline = await page.evaluate(() => window.__arcadeDebug!.handlerCount());
  const baseNodes = await page.evaluate(() => document.getElementsByTagName('*').length);

  for (let i = 0; i < 20; i++) {
    await startSelftest(page);
    await page.locator('[data-test="exit"]').click();
    await expect(page.locator('.game-layer')).toBeHidden();
  }

  expect(await page.evaluate(() => window.__selftest)).toEqual({ mounts: 20, unmounts: 20 });
  expect(await page.evaluate(() => window.__arcadeDebug!.handlerCount())).toBe(baseline);
  expect(await page.evaluate(() => document.getElementsByTagName('*').length)).toBe(baseNodes);
  expect(errors).toEqual([]);
});
