// Read-only checks for the Analyze tab's links to the rest of the app. Until v73 this file
// drove the v72 page (five question tiles); v74 deleted that page. What is kept here is
// what still applies to the card stack: the tab is reachable, its numbers equal the Year
// tab's, its pots equal the Travel and Admin tabs', and the Cash tab ladder it points at.
// The card-by-card checks live in analyze-stack.spec.js.
//
// RULES (per feedback_playwright_tests_isolate_db): the page is local but the data is fake
// (tests/fake-supabase.js). This spec NEVER fills, presses or clicks a save; any non-GET
// Supabase call is aborted so a regression that starts writing fails loudly here.
const { test, expect } = require('./fixtures');

test.use({ serviceWorkers: 'block' });

async function openApp(page) {
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET' ? route.fallback() : route.abort(),
  );
  await page.goto('/');
  await expect(page).toHaveTitle(/Budget/);
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
  const onLogin = await page.evaluate(() => !!document.querySelector('#login-email'));
  test.skip(onLogin, 'Auth-gated: set BUDGET_TEST_PASSWORD to run');
}

async function openAnalyze(page) {
  await openApp(page);
  await page.evaluate(() => window.switchTab('analyze'));
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
  await page.waitForSelector('.an2-wrap [data-an2-card="answer"]', { timeout: 30000 });
}

// Mirrors the Year tab's totalSpentFor for one month, from the same rows:
// envelopes = transactions only (any month), bills = max(lines, paid), pots and
// charity = what was set aside, + savings.
function yearTabUsedScript() {
  const { txns, budgetItems, allBudgets, incomeItems } = window.state.yearData;
  const sum = (rows, mid, cat) =>
    rows
      .filter((x) => x.month_id === mid && x.category === cat)
      .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const budgetOf = (mid, cat) => {
    const b = allBudgets.find((x) => x.month_id === mid && x.category === cat);
    return b ? Number(b.amount) || 0 : 0;
  };
  const inc = (m) =>
    (Number(m.income_petachya) || 0) +
    (Number(m.income_clalit) || 0) +
    (Number(m.income_private) || 0) +
    (Number(m.income_other) || 0) +
    incomeItems.filter((i) => i.month_id === m.id).reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const catBudget = (m, key) => {
    if (key === 'charity') {
      const pct = Number(m.charity_pct) || 0;
      const i = inc(m);
      if (pct && i) return Math.round((i * pct) / 100);
    }
    const items = budgetItems.filter((b) => b.month_id === m.id && b.category === key);
    if (items.length) return items.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    return budgetOf(m.id, key);
  };
  return window.state.months.map((m) => {
    let used = 0;
    for (const c of window.CATEGORIES) {
      if (c.hasTab) used += catBudget(m, c.key);
      else if (c.hasLines) used += Math.max(sum(budgetItems, m.id, c.key), sum(txns, m.id, c.key));
      else used += sum(txns, m.id, c.key);
    }
    const savings = budgetOf(m.id, 'savings_bank') + budgetOf(m.id, 'savings_invested');
    return { id: m.id, month_num: m.month_num, used: used + savings, savings };
  });
}

test.describe('Analyze tab', () => {
  test('is reachable from the desktop tab row and the mobile More sheet', async ({ page }) => {
    await openApp(page);
    const tabs = await page.locator('.ptab').allTextContents();
    expect(tabs.some((t) => t.includes('Analyze'))).toBeTruthy();
    const more = await page.evaluate(() => window.MOBILE_TABS_MORE.map((t) => t.key));
    expect(more).toContain('analyze');
  });

  test('Used on a past month equals the Year tab Total Used to the shekel', async ({ page }) => {
    await openAnalyze(page);
    const r = await page.evaluate((fn) => {
      const yt = new Function('return (' + fn + ')()')();
      const a = window.computeAnalyze();
      return a.months
        .filter((m) => m.status === 'past')
        .map((pm) => ({
          month: pm.month_num,
          analyze: pm.used,
          yearTab: yt.find((x) => x.id === pm.id).used,
        }));
    }, yearTabUsedScript.toString());
    expect(r.length).toBeGreaterThan(0);
    for (const row of r) {
      expect(
        Math.abs(row.analyze - row.yearTab),
        `month ${row.month}: analyze ${row.analyze} vs year ${row.yearTab}`,
      ).toBeLessThan(1);
    }
  });

  test('the Year-tab gap: its ÷12 average matches the Year tab, and the bridge adds up', async ({
    page,
  }) => {
    await openAnalyze(page);
    const r = await page.evaluate(async (fn) => {
      // The same module instance the app loaded (the browser caches it by URL).
      const { yearTabGap } = await import('/dist/lib/analyze.js');
      const yt = new Function('return (' + fn + ')()')();
      const a = window.computeAnalyze();
      const g = yearTabGap(a);
      const yearTabAvg = yt.reduce((s, m) => s + m.used - m.savings, 0) / 12;
      return { g, yearTabAvg };
    }, yearTabUsedScript.toString());
    if (!r.g) test.skip(true, 'no complete months this year');
    expect(Math.abs(r.g.yearTabAvg - r.yearTabAvg)).toBeLessThan(1);
    const bridged = r.g.windowAvg + r.g.windowEffect + r.g.envEffect + r.g.otherEffect;
    expect(Math.abs(bridged - r.g.yearTabAvg)).toBeLessThan(0.05);
  });

  test('Travel & admin: this year matches the Travel and Admin tabs’ items', async ({ page }) => {
    await openAnalyze(page);
    await page.waitForFunction(() => !!window.state.potsCmp, null, { timeout: 30000 });
    const r = await page.evaluate(() => {
      const pc = window.state.potsCmp;
      return {
        years: pc.years,
        year: window.state.currentYear,
        travelPlanned: pc.travel[0].planned,
        travelItems: (window.state.travel.items || []).reduce(
          (s, i) => s + (Number(i.projected_amount) || 0),
          0,
        ),
        adminPlanned: pc.admin[0].planned,
        adminItems: (window.state.admin.items || []).reduce(
          (s, i) => s + (Number(i.projected_amount) || 0),
          0,
        ),
      };
    });
    expect(r.years).toEqual([r.year, r.year + 1]);
    if (r.travelItems) expect(Math.abs(r.travelPlanned - r.travelItems)).toBeLessThan(1);
    if (r.adminItems) expect(Math.abs(r.adminPlanned - r.adminItems)).toBeLessThan(1);
    await page.locator('[data-an2-card="pots"] .an2-more').click();
    expect(await page.locator('[data-an2-card="pots"]').innerText()).toContain(String(r.year + 1));
  });

  test('Cash tab ladder reads Total Liquid after cards, and the ₪25K line is soft', async ({
    page,
  }) => {
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize({ width: 412, height: 892 });
    await openApp(page);
    await page.evaluate(() => window.switchTab('cash'));
    await page.waitForFunction(() => !document.querySelector('.loading'), null, {
      timeout: 30000,
    });
    const ladder = page.locator('div', { hasText: 'Reserve Ladder' }).last();
    await expect(ladder).toContainText('reads Total Liquid after cards');
    // Holdings 24,000 would give the under-25K status; liquid 26,000 (24,000 + 2,000 owed) = build.
    await expect(ladder).toContainText('Build zone — invest ₪0 this month');
    await expect(ladder).not.toContainText('Under the soft line');
    const text = await page.locator('body').innerText();
    expect(text).toContain('soft line');
    expect(text).not.toContain('red line');
    expect(errors).toEqual([]);
  });
});
