const { test, expect } = require('@playwright/test');

function localISODate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test('empty state prompts to log a period', async ({ page }) => {
  await page.goto('.');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#heroLabel')).toHaveText('log a period');
  await expect(page.locator('#fab')).toBeVisible();
});

test('fertile phase is labeled "ovulation window"', async ({ page }) => {
  // Single period 12 days ago -> cycle day 13, inside default [10,17] window.
  const ref = localISODate(12);
  await page.addInitScript((date) => {
    localStorage.setItem(
      'cmt.neo.periods.v1',
      JSON.stringify([{ date, paused: false, pregnant: false }])
    );
  }, ref);
  await page.goto('.');
  await expect(page.locator('#phaseBadge')).toHaveText('ovulation window');
  await expect(page.locator('#heroLabel')).toHaveText('fertile days left');
});

test('luteal phase shows days to period', async ({ page }) => {
  // Single period 25 days ago -> cycle day 26, past the fertile window.
  const ref = localISODate(25);
  await page.addInitScript((date) => {
    localStorage.setItem(
      'cmt.neo.periods.v1',
      JSON.stringify([{ date, paused: false, pregnant: false }])
    );
  }, ref);
  await page.goto('.');
  await expect(page.locator('#phaseBadge')).toHaveText('luteal');
  await expect(page.locator('#heroLabel')).toHaveText('days to period');
});
