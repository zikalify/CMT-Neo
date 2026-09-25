const { test, expect } = require('@playwright/test');

test('service worker serves the app offline', async ({ page, context }) => {
  await page.goto('.');
  await expect(page.locator('#fab')).toBeVisible();

  // Wait until the service worker takes control.
  await page.waitForFunction(
    () => navigator.serviceWorker && navigator.serviceWorker.controller !== null,
    null,
    { timeout: 15000 }
  );

  await context.setOffline(true);
  await page.reload();
  // Cached shell still renders from the service worker.
  // (phaseBadge is :empty-hidden until stats exist, so check attachment.)
  await expect(page.locator('#fab')).toBeVisible();
  await expect(page.locator('#phaseBadge')).toBeAttached();
  await expect(page.locator('#heroLabel')).toBeAttached();
  await context.setOffline(false);
});
