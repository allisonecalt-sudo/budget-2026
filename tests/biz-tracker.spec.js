// Biz tab: the Accountant Fee Tracker shows "Paid so far" only.
// The "Due by now" row was removed Nov 19 2026, her words: "get rid of due by now on biz page".
// This test keeps it gone.
const { test, expect } = require('./fixtures');

test('Biz tab: accountant tracker has no "Due by" row', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 892 });
  await page.goto('/');
  // On a phone the tab bar is tucked behind the menu, so open Biz the way its tab button does.
  await page.waitForSelector('.ptab', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => window.switchTab('biz'));
  const tracker = page.locator('.biz-card', { hasText: 'Accountant Fee Tracker' });
  await expect(tracker).toBeVisible();
  await expect(tracker).toContainText('Paid so far');
  await expect(tracker).not.toContainText('Due by');
  if (process.env.BIZ_SHOT) await page.screenshot({ path: process.env.BIZ_SHOT, fullPage: true });
});
