// The Charity tab STARTS FROM THE PERCENT (her words, Nov 22 2026: "it should
// start form percentage"). Its year target must be the sum of each month's
// income × charity %, never the saved budgets rows, which go stale when income
// changes outside the app. Real case, Nov 22 2026: gan 2 went 5 → 4 kids in nine
// 2027 months by a direct DB write; the tab read ₪10,217 while every other
// screen read ₪10,038. Opening the tab also repairs a drifted saved row (with a
// history row), the same self-repair the month page does on open.
const { test, expect } = require('./fixtures');

test('Charity tab starts from income × % and repairs drifted saved amounts', async ({
  page,
  db,
}) => {
  await page.clock.setFixedTime(new Date('2026-11-22T12:00:00+02:00'));
  const months = db.table('months').filter((m) => m.year === 2026);
  const income = (m) => m.income_petachya + m.income_clalit + m.income_private + m.income_other;
  const right = months.reduce((s, m) => s + Math.round((income(m) * m.charity_pct) / 100), 0);

  // Make three saved charity rows stale, as an outside income change would.
  const staleIds = months.filter((m) => [1, 5, 10].includes(m.month_num)).map((m) => m.id);
  db.table('budgets')
    .filter((b) => b.category === 'charity' && staleIds.includes(b.month_id))
    .forEach((b) => {
      b.amount = Number(b.amount) + 20;
    });

  await page.setViewportSize({ width: 412, height: 892 });
  await page.goto('/');
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
  await page.evaluate(() => window.switchTab('charity'));
  await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });

  const tabTotal = await page.evaluate(() =>
    Object.values(window.state.charity.allocations).reduce((s, a) => s + Number(a.amount), 0),
  );
  expect(tabTotal).toBe(right);

  // The drifted rows are brought back to income × %, each with a history row.
  await expect
    .poll(() =>
      db
        .table('budgets')
        .filter((b) => b.category === 'charity' && staleIds.includes(b.month_id))
        .map((b) => Number(b.amount)),
    )
    .toEqual(
      staleIds.map((id) => {
        const m = months.find((x) => x.id === id);
        return Math.round((income(m) * m.charity_pct) / 100);
      }),
    );
  await expect
    .poll(
      () =>
        db
          .table('change_log')
          .filter(
            (c) =>
              staleIds.includes(c.month_id) &&
              String(c.description || '').includes('follows income × charity %'),
          ).length,
    )
    .toBe(3);
});
