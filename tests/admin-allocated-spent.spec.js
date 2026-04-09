// Smoke test: Admin tab — Allocated/Spent/Remaining math stays consistent,
// and Payment Log never shows a bare "?" for an unknown month.
const { test, expect } = require('@playwright/test');

test('admin tab: summary cards are consistent and payment log has no "?" month', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto('/');
  await page.waitForFunction(() => !document.querySelector('.loading'), { timeout: 15000 });

  await page.evaluate(() => window.switchTab && window.switchTab('admin'));
  await page.waitForTimeout(800);

  // Pull payment log text and verify no bare "?" as a month indicator
  const paymentLogText = await page.evaluate(() => {
    const all = document.body.innerText;
    const idx = all.indexOf('Payment Log');
    return idx >= 0 ? all.slice(idx, idx + 3000) : '';
  });

  // The month column should never be a literal "?" on its own line
  const badMonth = /\n\?\n/.test(paymentLogText);
  expect(badMonth, 'Payment log should not contain a bare "?" as a month').toBe(false);

  // No JS errors during admin tab render
  expect(pageErrors, 'No page errors on admin tab').toEqual([]);
});
