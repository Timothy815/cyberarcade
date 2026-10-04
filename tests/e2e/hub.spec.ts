import { expect, test } from '@playwright/test';
import { boot, trackErrors } from './helpers';

test('boots to the hub with eight cabinets and no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await boot(page);
  await expect(page.locator('.hub-logo h1')).toHaveText('CYBER ARCADE');
  await expect(page.locator('.cabinet')).toHaveCount(8);
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'invaders');
  expect(errors).toEqual([]);
});

test('arrow keys rotate the carousel with wraparound', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'phish');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'classic');
});

test('a coming-soon cabinet shakes instead of launching', async ({ page }) => {
  await boot(page);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'defense');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cabinet.is-center')).toHaveClass(/shake/);
  await expect(page.locator('.title-card')).toHaveCount(0);
});

test('M toggles the mute indicator', async ({ page }) => {
  await boot(page);
  const mute = page.locator('.mute-indicator');
  const muted = () => mute.evaluate((b) => b.classList.contains('is-muted'));
  const before = await muted();
  await page.keyboard.press('m');
  await expect.poll(muted).toBe(!before);
});
