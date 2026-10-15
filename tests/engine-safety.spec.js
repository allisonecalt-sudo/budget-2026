// Engine-safety checks (2026-10-15 batch): undo lands in the right month, a Biz
// undo restores private income, undo/redo are written to the history log, and
// the Budget tab no longer writes anything just by being opened.
// All on the in-memory fake Supabase (tests/fixtures.js).
const { test, expect } = require('./fixtures');

async function openBudget(page) {
  await page.goto('/');
  await page.waitForSelector('.cat-row', { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector('.loading'));
}

const monthRow = (db, id) => db.rowsOf('months').find((m) => m.id === id);

test('opening the Budget tab writes nothing when nothing changed', async ({ page, db }) => {
  await openBudget(page);
  await page.waitForTimeout(1500);
  expect(db.writes, JSON.stringify(db.writes)).toEqual([]);
});

test('charity auto-save writes and logs only when the stored amount differs', async ({
  page,
  db,
}) => {
  // Make the stored charity row wrong in every month, then open the tab.
  db.table('budgets')
    .filter((b) => b.category === 'charity')
    .forEach((b) => (b.amount = 1));
  await openBudget(page);
  await expect
    .poll(() => db.writes.filter((w) => w.table === 'budgets').length, { timeout: 5000 })
    .toBe(1);
  await expect
    .poll(
      () =>
        db
          .rowsOf('change_log')
          .filter((r) => /charity/.test(r.description) && /auto/.test(r.description)).length,
      { timeout: 5000 },
    )
    .toBe(1);
  // Reload: the row is right now, so there is no second write.
  const before = db.writes.length;
  await page.reload();
  await page.waitForSelector('.cat-row');
  await page.waitForTimeout(1000);
  expect(db.writes.length).toBe(before);
});

test('undo goes back to the month the edit was made in, even from another month', async ({
  page,
  db,
}) => {
  await openBudget(page);
  const { editId, otherId, original } = await page.evaluate(() => {
    const cur = window.state.months.find((m) => m.id === window.state.currentMonthId);
    const other = window.state.months.find((m) => m.id !== cur.id);
    return { editId: cur.id, otherId: other.id, original: cur.income_petachya };
  });
  await page.evaluate(() => window.saveIncomeField('income_petachya', '12345'));
  await expect.poll(() => monthRow(db, editId).income_petachya).toBe(12345);

  await page.evaluate((id) => window.switchMonth(id), otherId);
  await page.waitForFunction((id) => window.state.currentMonthId === id, otherId);
  const otherBefore = monthRow(db, otherId).income_petachya;

  await page.evaluate(() => window.doUndo());
  await expect.poll(() => monthRow(db, editId).income_petachya).toBe(original);
  // The month she was looking at is untouched.
  expect(monthRow(db, otherId).income_petachya).toBe(otherBefore);
  // And the undo is in the history log with the month on it.
  await expect.poll(() => db.rowsOf('change_log').some((r) => r.action === 'undo')).toBe(true);
  const undoRow = db.rowsOf('change_log').find((r) => r.action === 'undo');
  expect(undoRow.description).toMatch(/^\[app undo\]/);
  expect(undoRow.month_id).toBe(editId);

  await page.evaluate(() => window.doRedo());
  await expect.poll(() => monthRow(db, editId).income_petachya).toBe(12345);
  await expect.poll(() => db.rowsOf('change_log').some((r) => r.action === 'redo')).toBe(true);
  const redoRow = db.rowsOf('change_log').find((r) => r.action === 'redo');
  expect(redoRow.description).toMatch(/^\[app redo\]/);
});

test('undoing a Biz edit also restores private income', async ({ page, db }) => {
  await openBudget(page);
  await page.evaluate(() => window.switchTab('biz'));
  await page.waitForFunction(() => window.state.biz);
  const { monthId, bizId, privateBefore, confirmedBefore } = await page.evaluate(() => ({
    monthId: window.state.currentMonthId,
    bizId: window.state.biz.id,
    privateBefore: window.state.months.find((m) => m.id === window.state.currentMonthId)
      .income_private,
    confirmedBefore: window.state.biz.confirmed_amount,
  }));
  await page.evaluate(() => window.saveBizField('confirmed_amount', 5200));
  // net = 5200 - 200 fee - 0 spending
  await expect.poll(() => monthRow(db, monthId).income_private).toBe(5000);

  // Look at a different month, then undo.
  await page.evaluate(() => {
    const other = window.state.months.find((m) => m.id !== window.state.currentMonthId);
    return window.switchMonth(other.id);
  });
  await page.evaluate(() => window.doUndo());
  await expect
    .poll(() => db.rowsOf('biz_months').find((b) => b.id === bizId).confirmed_amount)
    .toBe(confirmedBefore);
  expect(monthRow(db, monthId).income_private).toBe(privateBefore);
});

test('a failed income save shows a plain error line', async ({ page, db }) => {
  await openBudget(page);
  // Make the fake refuse writes to months.
  await page.context().route(/\/rest\/v1\/months/, (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'boom' }),
        })
      : route.fallback(),
  );
  await page.evaluate(() => window.saveIncomeField('income_petachya', '777'));
  await expect(page.locator('#app-error-line')).toContainText("didn't save");
  expect(db.rowsOf('months').some((m) => m.income_petachya === 777)).toBe(false);
});

test('Tracker outage says so instead of "No sessions found"', async ({ page }) => {
  await openBudget(page);
  await page.context().route(/functions\/v1\/pt-sessions/, (route) =>
    route.fulfill({
      status: 503,
      headers: { 'access-control-allow-origin': '*' },
      body: 'down',
    }),
  );
  await page.evaluate(() => window.switchTab('biz'));
  await expect(page.locator('body')).toContainText("Couldn't reach the Tracker");
  await expect(page.locator('body')).not.toContainText('No sessions found');
});

test('forgot-login link asks for the live app URL, not localhost', async ({ page }) => {
  // Logged-out page: no stored session.
  await page.context().clearCookies();
  await page.addInitScript(() => localStorage.clear());
  let body = '';
  await page.context().route(/\/auth\/v1\/recover/, (route) => {
    body = route.request().url() + ' ' + (route.request().postData() || '');
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: '{}',
    });
  });
  await page.goto('/');
  await page.waitForSelector('#login-forgot');
  await page.click('#login-forgot');
  await expect.poll(() => body).toContain('redirect_to=');
  expect(decodeURIComponent(body)).toContain('https://allisonecalt-sudo.github.io/budget-2026/');
});
