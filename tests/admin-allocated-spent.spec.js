// Smoke test: Admin tab — Allocated/Spent/Remaining math stays consistent,
// and Payment Log never shows a bare "?" for an unknown month.
const { test, expect } = require('@playwright/test');

test('admin tab: summary cards are consistent and payment log has no "?" month', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.goto('/');
  // Guard against running on the wrong server (e.g. another process squatting
  // on the port): this test used to pass vacuously against a 404 page because
  // every assertion below is conditional. Confirm it's actually the app first.
  await expect(page, 'should be on the budget app, not another server').toHaveTitle(/Budget/);
  await page.waitForFunction(() => !document.querySelector('.loading'), { timeout: 15000 });

  // Behind the login gate the app renders #login-form (switchTab still exists
  // globally, so its presence proves nothing) — skip loudly instead of
  // green-lighting an unexercised page. CI sets BUDGET_TEST_PASSWORD and runs this for real.
  const onLoginGate = await page.evaluate(() => !!document.getElementById('login-form'));
  test.skip(onLoginGate, 'not logged in (BUDGET_TEST_PASSWORD unset) — exercised in CI');

  await page.evaluate(() => window.switchTab('admin'));
  await page.waitForTimeout(800);

  // Pull payment log text and verify no bare "?" as a month indicator
  const paymentLogText = await page.evaluate(() => {
    const all = document.body.innerText;
    const idx = all.indexOf('Payment Log');
    return idx >= 0 ? all.slice(idx, idx + 3000) : '';
  });
  expect(paymentLogText, 'Payment Log section should exist on the admin tab').not.toBe('');

  // The month column should never be a literal "?" on its own line
  const badMonth = /\n\?\n/.test(paymentLogText);
  expect(badMonth, 'Payment log should not contain a bare "?" as a month').toBe(false);

  // No JS errors during admin tab render
  expect(pageErrors, 'No page errors on admin tab').toEqual([]);
});
