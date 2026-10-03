import { expect, type Page } from '@playwright/test';

/** Collects console errors and uncaught page errors so tests can assert none happened. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Opens the arcade and clicks through the start splash. */
export async function boot(page: Page, query = ''): Promise<void> {
  await page.goto(query);
  await page.locator('.splash').click();
  await expect(page.locator('.splash')).toHaveCount(0);
  await expect(page.locator('.cabinet.is-center')).toBeVisible();
}

/** From the hub with ?selftest, starts the self-test game (it is the first, centred cabinet). */
export async function startSelftest(page: Page): Promise<void> {
  await expect(page.locator('.cabinet.is-center')).toHaveAttribute('data-id', 'selftest');
  await page.keyboard.press('Enter');
  await expect(page.locator('.title-card')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.selftest')).toBeVisible();
}
