// The ribbon's Saved drop-down must show the year on screen.
// Her words, Nov 19 2026: "also fix the saved drop down for 2027 it shoudl show 2027".
// Two bugs it had: (1) after switching years it read the Year-tab data of the year
// she LEFT, so 2027 showed nothing; (2) it counted "so far this year" up to today's
// month even for a year that hasn't started.
const { test, expect } = require('./fixtures');

test('Saved drop-down on a future year shows that year’s plan', async ({ page, db }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+02:00'));
  // Every 2027 month plans ₪3,000 to the bank.
  db.table('months')
    .filter((m) => m.year === 2027)
    .forEach((m, i) =>
      db.table('budgets').push({
        id: `b-sav27-${i}`,
        month_id: m.id,
        category: 'savings_bank',
        amount: 3000,
        created_at: '2026-11-19T00:00:00Z',
      }),
    );
  await page.setViewportSize({ width: 412, height: 892 });
  await page.goto('/');
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });

  // Load the 2026 Year tab first, so 2026 year data is in memory before the switch.
  await page.evaluate(() => window.switchTab('year'));
  await page.waitForFunction(() => !!window.state.yearData, null, { timeout: 30000 });
  await page.evaluate(() => window.switchTab('budget'));
  await page.evaluate(() => window.switchYear(2027));
  await page.waitForFunction(
    () => window.state.currentYear === 2027 && !window.state.loading,
    null,
    { timeout: 30000 },
  );

  await page.evaluate(() => window.showSavedPop(document.getElementById('saved-dp')));
  const pop = page.locator('#saved-pop');
  await expect(pop).toContainText('Saved in 2027');
  await expect(pop).toContainText('Planned for the year');
  await expect(pop).toContainText('36,000');
  await expect(pop).not.toContainText('So far this year');
  await expect(pop).not.toContainText('No savings');
  if (process.env.SAVED_SHOT) await page.screenshot({ path: process.env.SAVED_SHOT });
});
