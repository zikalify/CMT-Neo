const { test, expect } = require('@playwright/test');

function localISODate(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

test('log a period, reject duplicates, then delete it', async ({ page }) => {
  const today = localISODate(0);
  await page.goto('.');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Open the log sheet via FAB.
  await page.locator('#fab').click();
  await expect(page.locator('#logSheet.open')).toBeVisible();
  await expect(page.locator('#logDate')).toHaveValue(today);

  // Save today's period.
  await page.locator('#confirmLog').click();
  await expect(page.locator('#toast')).toHaveText('period logged');

  // It appears in history.
  await page.locator('#menuBtn').click();
  await expect(page.locator('#menuSheet.open')).toBeVisible();
  await expect(page.locator('#historyList')).not.toContainText('nothing yet');

  // Logging the same date again is rejected (close menu first: it overlays the FAB).
  await page.keyboard.press('Escape');
  await page.locator('#fab').click();
  await page.locator('#confirmLog').click();
  await expect(page.locator('#toast')).toHaveText('already logged');
  // Close sheets via Escape so the history delete button is clickable.
  await page.keyboard.press('Escape');

  // Delete the entry.
  await page.locator('#menuBtn').click();
  await page.locator('#historyList [data-delete]').first().click();
  await expect(page.locator('#toast')).toHaveText('deleted');
  await expect(page.locator('#historyList')).toContainText('nothing yet');
});

test('erase-all flow asks for confirmation', async ({ page }) => {
  const today = localISODate(0);
  await page.addInitScript((date) => {
    localStorage.setItem(
      'cmt.neo.periods.v1',
      JSON.stringify([{ date, paused: false, pregnant: false }])
    );
  }, today);
  await page.goto('.');

  await page.locator('#menuBtn').click();
  await page.locator('#clearAllBtn').click();
  await expect(page.locator('#confirmSheet.open')).toBeVisible();
  await page.locator('#confirmYes').click();
  await expect(page.locator('#toast')).toHaveText('erased');
  await expect(page.locator('#heroLabel')).toHaveText('log a period');
});
