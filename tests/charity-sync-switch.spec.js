// Switching months must never write a WRONG charity amount.
// Charity's budget = income × charity % and is synced to the DB on render. The
// first render after a month switch runs BEFORE the new month's income items
// load, so it used to add the OLD month's extra income to the NEW month and
// write that (her real change_log, Nov 8 2026: Dec ₪842 → ₪802 → ₪842 in one
// minute). Found by a blind code check, Nov 19 2026. Fix: no sync while loading.
const { test, expect } = require('./fixtures');

test('switching months writes only the right charity amount', async ({ page, db }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+02:00'));
  const months = db.table('months').filter((m) => m.year === 2026);
  const nov = months.find((m) => m.month_num === 11);
  const dec = months.find((m) => m.month_num === 12);
  // November has an extra ₪5,000 income line; December has none.
  db.table('income_items').push({
    id: 'inc-nov-extra',
    month_id: nov.id,
    label: 'Extra',
    amount: 5000,
    created_at: '2026-11-01T00:00:00Z',
  });
  const income = (m) => m.income_petachya + m.income_clalit + m.income_private + m.income_other;
  const decRight = Math.round((income(dec) * dec.charity_pct) / 100);
  const decWrong = Math.round(((income(dec) + 5000) * dec.charity_pct) / 100);
  expect(decWrong).not.toBe(decRight);

  await page.setViewportSize({ width: 412, height: 892 });
  await page.goto('/');
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
  await page.evaluate((id) => window.switchMonth(id), nov.id);
  await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });

  // Watch every amount written to DECEMBER's charity row from here on.
  // (November's own right amount can equal December's wrong one, so match the row.)
  const decRow = db.table('budgets').find((b) => b.month_id === dec.id && b.category === 'charity');
  const written = [];
  page.on('request', (req) => {
    const m = req.method();
    const url = decodeURIComponent(req.url());
    if ((m === 'PATCH' || m === 'POST') && url.includes('/rest/v1/budgets')) {
      try {
        const body = JSON.parse(req.postData() || '{}');
        const rows = Array.isArray(body) ? body : [body];
        rows.forEach((r) => {
          const toDec =
            (decRow && url.includes(`id=eq.${decRow.id}`)) ||
            (r.month_id === dec.id && r.category === 'charity');
          if (toDec && r.amount != null) written.push(Number(r.amount));
        });
      } catch {
        /* not JSON: not a charity amount */
      }
    }
  });

  for (let i = 0; i < 3; i += 1) {
    await page.evaluate((id) => window.switchMonth(id), dec.id);
    await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
    await page.evaluate((id) => window.switchMonth(id), nov.id);
    await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
  }
  await page.waitForTimeout(500); // let the last quiet syncs land

  expect(written).not.toContain(decWrong);
  const decCharity = db
    .table('budgets')
    .find((b) => b.month_id === dec.id && b.category === 'charity');
  expect(Number(decCharity.amount)).toBe(decRight);
});
