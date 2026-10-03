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
