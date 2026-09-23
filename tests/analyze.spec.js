// Read-only checks for the Analyze tab against the live app.
//
// RULES (per feedback_playwright_tests_isolate_db): the page is local but the
// data is her real Supabase project. This spec NEVER fills, presses or clicks a
// save. It navigates with window.switchTab (localStorage only), reads what is
// rendered, and cross-checks the tab's arithmetic against the Year tab's own
// Total Used through the window-exposed pure helper. Any non-GET Supabase call
// is aborted so a regression that starts writing fails loudly here.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

async function openApp(page) {
  await page.route('**/rest/v1/**', (route) =>
    route.request().method() === 'GET' ? route.continue() : route.abort(),
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
  await page.waitForSelector('.an-wrap', { timeout: 30000 });
}

test.describe('Analyze tab', () => {
  test('is reachable from the desktop tab row and the mobile More sheet', async ({ page }) => {
    await openApp(page);
    const tabs = await page.locator('.ptab').allTextContents();
    expect(tabs.some((t) => t.includes('Analyze'))).toBeTruthy();
    const more = await page.evaluate(() => window.MOBILE_TABS_MORE.map((t) => t.key));
    expect(more).toContain('analyze');
  });

  test('renders the KPI strip, the by-month grid and the floor table', async ({ page }) => {
    await openAnalyze(page);
    const labels = await page.locator('.an-kpis .year-sum-label').allTextContents();
    expect(labels).toEqual([
      'Real spend / mo',
      'Floor / mo',
      'Above floor / mo',
      'Savings rate',
      'Year real spend',
    ]);
    // 12 month columns + Avg + Year
    const headers = await page.locator('.an-table thead th').count();
    expect(headers).toBe(1 + 12 + 2);
    const rows = await page.locator('.an-table tbody tr td.year-col-label').allTextContents();
    // Strip the leading emoji (if any), keep the words.
    expect(rows.map((r) => r.replace(/^[^A-Za-z]+/, '').trim())).toEqual(
      expect.arrayContaining(['Fixed', 'Envelopes', 'Pots', 'Charity', 'Real spend', 'Used']),
    );
    // One floor input per category, none of them touched
    const cats = await page.evaluate(() => window.CATEGORIES.length);
    expect(await page.locator('.an-floor').count()).toBe(cats);
    await page.screenshot({ path: 'test-results/analyze-desktop.png', fullPage: true });
  });

  test('Used on a past month equals the Year tab Total Used to the shekel', async ({ page }) => {
    await openAnalyze(page);
    // Both surfaces read the same state.yearData; compare their arithmetic.
    const r = await page.evaluate(() => {
      const a = window.computeAnalyze();
      const past = a.months.filter((m) => m.status === 'past');
      // Rebuild the Year tab's Total Used from the same rows (mirrors totalSpentFor).
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
        incomeItems
          .filter((i) => i.month_id === m.id)
          .reduce((s, i) => s + (Number(i.amount) || 0), 0);
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
      return past.map((pm) => {
        const m = window.state.months.find((x) => x.id === pm.id);
        let used = 0;
        for (const c of window.CATEGORIES) {
          if (c.hasTab) used += catBudget(m, c.key);
          else if (c.hasLines)
            used += Math.max(sum(budgetItems, m.id, c.key), sum(txns, m.id, c.key));
          else used += sum(txns, m.id, c.key);
        }
        used += budgetOf(m.id, 'savings_bank') + budgetOf(m.id, 'savings_invested');
        return { month: pm.month_num, analyze: pm.used, yearTab: used };
      });
    });
    expect(r.length).toBeGreaterThan(0);
    for (const row of r) {
      expect(
        Math.abs(row.analyze - row.yearTab),
        `month ${row.month}: analyze ${row.analyze} vs year ${row.yearTab}`,
      ).toBeLessThan(1);
    }
  });

  test('the floor total is the sum of the floors shown, and the KPI matches', async ({ page }) => {
    await openAnalyze(page);
    const r = await page.evaluate(() => {
      const a = window.computeAnalyze();
      const sum = a.cats.reduce((s, c) => s + c.floor, 0);
      const kpi = document.querySelectorAll('.an-kpis .year-sum-val')[1].textContent;
      return {
        sum,
        floorTotal: a.summary.floorTotal,
        kpi,
        above: a.summary.aboveFloor,
        real: a.summary.realAvg,
      };
    });
    expect(Math.abs(r.sum - r.floorTotal)).toBeLessThan(0.01);
    expect(r.kpi.replace(/[^\d]/g, '')).toBe(String(Math.round(r.floorTotal)));
    expect(Math.abs(r.real - r.floorTotal - r.above)).toBeLessThan(0.01);
  });

  test('phone width: the grid scrolls sideways inside the page, nothing overflows', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 412, height: 892 });
    await openAnalyze(page);
    const r = await page.evaluate(() => ({
      docWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      gridScrolls: (() => {
        const w = document.querySelector('.an-table')?.closest('.year-table-wrap');
        return w ? getComputedStyle(w).overflowX : 'none';
      })(),
      tabRowHidden: getComputedStyle(document.querySelector('.hdr-tabs')).display === 'none',
    }));
    expect(r.docWidth).toBeLessThanOrEqual(r.viewport);
    expect(r.gridScrolls).toBe('auto');
    expect(r.tabRowHidden).toBe(true);
    await page.screenshot({ path: 'test-results/analyze-412-top.png' });
    await page.screenshot({ path: 'test-results/analyze-412.png', fullPage: true });
  });
});
