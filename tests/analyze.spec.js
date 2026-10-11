// Read-only checks for the Analysis section (v56: five question tiles).
//
// RULES (per feedback_playwright_tests_isolate_db): the page is local but the
// data is her real Supabase project. This spec NEVER fills, presses or clicks a
// save. It switches tiles (view state in localStorage only), reads what is
// rendered, and cross-checks the arithmetic against the Year tab's own Total
// Used through the window-exposed pure helpers. Any non-GET Supabase call is
// aborted so a regression that starts writing fails loudly here.
const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

const SUBS = ['real', 'why', 'floor', 'cut', 'safe'];

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

async function openAnalyze(page, sub = 'real') {
  await openApp(page);
  await page.evaluate((s) => localStorage.setItem('analyzeSub', s), sub);
  await page.evaluate(() => window.switchTab('analyze'));
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
  await page.waitForSelector('.an-wrap .an-tiles', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('.an-loading'), null, {
    timeout: 30000,
  });
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

test.describe('Analysis section', () => {
  test('is reachable from the desktop tab row and the mobile More sheet', async ({ page }) => {
    await openApp(page);
    const tabs = await page.locator('.ptab').allTextContents();
    expect(tabs.some((t) => t.includes('Analyze'))).toBeTruthy();
    const more = await page.evaluate(() => window.MOBILE_TABS_MORE.map((t) => t.key));
    expect(more).toContain('analyze');
  });

  test('five question tiles, each opens its own section with a one-sentence answer', async ({
    page,
  }) => {
    await openAnalyze(page, 'real');
    const qs = await page.locator('.an-qtile .an-q').allTextContents();
    expect(qs).toEqual(['Real spend', 'Why so high', 'Floor', 'Where to cut', 'If it goes wrong']);
    for (const [i, sub] of SUBS.entries()) {
      await page.locator('.an-qtile').nth(i).click();
      await expect(page.locator('.an-section')).toHaveAttribute('data-sub', sub);
      await expect(page.locator('.an-qtile.active')).toHaveCount(1);
      expect(await page.locator('.an-section .an-say').count()).toBeGreaterThan(0);
      // No red anywhere in the section.
      const red = await page.evaluate(() => {
        const redRgb = getComputedStyle(document.documentElement).getPropertyValue('--red').trim();
        return [...document.querySelectorAll('.an-wrap *')].some((el) => {
          const c = getComputedStyle(el).color;
          return redRgb && (c === redRgb || c === 'rgb(192, 57, 43)');
        });
      });
      expect(red, `red text in ${sub}`).toBe(false);
    }
    // The choice is remembered per device.
    expect(await page.evaluate(() => localStorage.getItem('analyzeSub'))).toBe('safe');
  });

  test('Real spend: tile = summary average; desktop grid has 12 months + Avg + Year', async ({
    page,
  }) => {
    await openAnalyze(page, 'real');
    const r = await page.evaluate(() => ({
      avg: window.computeAnalyze().summary.realAvg,
      tile: document.querySelector('.an-qtile .an-a').textContent,
    }));
    expect(r.tile.replace(/[^\d]/g, '')).toBe(String(Math.round(r.avg)));
    expect(await page.locator('.an-table thead th').count()).toBe(1 + 12 + 2);
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
    const r = await page.evaluate((fn) => {
      const yt = new Function('return (' + fn + ')()')();
      const a = window.computeAnalyze();
      const g = window.yearTabGap(a);
      const yearTabAvg = yt.reduce((s, m) => s + m.used - m.savings, 0) / 12;
      return { g, yearTabAvg };
    }, yearTabUsedScript.toString());
    if (!r.g) test.skip(true, 'no complete months this year');
    expect(Math.abs(r.g.yearTabAvg - r.yearTabAvg)).toBeLessThan(1);
    const bridged = r.g.windowAvg + r.g.windowEffect + r.g.envEffect + r.g.otherEffect;
    expect(Math.abs(bridged - r.g.yearTabAvg)).toBeLessThan(0.05);
  });

  test('Why so high: the driver rows add up to the difference, each row opens', async ({
    page,
  }) => {
    await openAnalyze(page, 'why');
    const r = await page.evaluate(() => {
      const a = window.computeAnalyze();
      const w = window.whyBridge(a, []);
      if (!w) return null;
      const sum = w.rows.reduce((s, x) => s + x.delta, 0);
      const parts = a.months.every(
        (m) => Math.abs(Object.values(m.parts).reduce((s, v) => s + v, 0) - m.real) < 0.05,
      );
      return { sum, delta: w.delta, parts };
    });
    if (!r) test.skip(true, 'fewer than 4 complete months');
    expect(Math.abs(r.sum - r.delta)).toBeLessThan(0.1);
    expect(r.parts).toBe(true);
    const rows = page.locator('.an-section .an-open');
    expect(await rows.count()).toBeGreaterThan(3);
    await rows.first().click();
    await expect(page.locator('.an-section .an-detail')).toHaveCount(1);
  });

  test('Floor: one input per category, the total is their sum, untouched', async ({ page }) => {
    await openAnalyze(page, 'floor');
    const cats = await page.evaluate(() => window.CATEGORIES.map((c) => c.key));
    expect(await page.locator('.an-floor[data-floor-cat]').count()).toBe(cats.length);
    for (const key of cats) {
      await expect(page.locator(`.an-floor[data-floor-cat="${key}"]`)).toHaveCount(1);
    }
    expect(await page.locator('.an-floor:disabled').count()).toBe(0);
    const r = await page.evaluate(() => {
      const a = window.computeAnalyze();
      return {
        sum: a.cats.reduce((s, c) => s + c.floor, 0),
        floorTotal: a.summary.floorTotal,
        tile: document.querySelectorAll('.an-qtile .an-a')[2].textContent,
        above: a.summary.aboveFloor,
        real: a.summary.realAvg,
      };
    });
    expect(Math.abs(r.sum - r.floorTotal)).toBeLessThan(0.01);
    expect(r.tile.replace(/[^\d]/g, '')).toBe(String(Math.round(r.floorTotal)));
    expect(Math.abs(r.real - r.floorTotal - r.above)).toBeLessThan(0.01);
  });

  test('If it goes wrong: cash is the Cash tab Total Liquid, every scenario row renders', async ({
    page,
  }) => {
    await openAnalyze(page, 'safe');
    const r = await page.evaluate(() => {
      const t = window.cashTotals();
      return {
        liquid: t.liquid,
        identity: Math.abs(t.holdings + t.owed - t.debt - t.liquid) < 0.01,
        rows: document.querySelectorAll('.an-srow:not(.an-shead)').length,
        text: document.querySelector('.an-section').textContent,
      };
    });
    expect(r.identity).toBe(true);
    expect(r.rows).toBeGreaterThanOrEqual(4);
    expect(r.text).toContain('Petachya only');
    expect(r.text.replace(/,/g, '')).toContain(String(Math.round(r.liquid)));
  });

  test('Where to cut: lines above minus lines under = the net on the tile', async ({ page }) => {
    await openAnalyze(page, 'cut');
    const r = await page.evaluate(() => {
      const a = window.computeAnalyze();
      const net = a.cats.reduce((s, c) => s + c.aboveFloor, 0);
      return {
        net,
        summary: a.summary.aboveFloor,
        underShown: document.querySelectorAll('.an-section .an-open').length,
        underCount: a.cats.filter((c) => Math.round(c.aboveFloor) !== 0).length,
      };
    });
    expect(Math.abs(r.net - r.summary)).toBeLessThan(1);
    // Every line above OR under its floor is a visible row — nothing hidden.
    expect(r.underShown).toBe(r.underCount);
  });

  test('the what-if one-off moves cash and runway, and writes nothing', async ({ page }) => {
    const writes = [];
    page.on('request', (req) => {
      if (req.url().includes('/rest/v1/') && req.method() !== 'GET') writes.push(req.url());
    });
    await openAnalyze(page, 'safe');
    // Opening the app re-syncs this month's derived charity budget (income ×
    // her %, an existing quiet sync in renderApp) — only count writes made
    // after the what-if is used. The route aborts every write anyway.
    writes.length = 0;
    const before = await page.locator('.an-section').textContent();
    await page.evaluate(() => window.setAnalyzeOneOff('8000'));
    await expect(page.locator('.an-section')).toContainText('What-if one-off');
    const after = await page.locator('.an-section').textContent();
    expect(after).not.toBe(before);
    await page.evaluate(() => window.setAnalyzeOneOff(''));
    await expect(page.locator('.an-section')).not.toContainText('What-if one-off');
    expect(writes).toEqual([]);
  });

  test('Whole year: the pill averages all 12 months and says which are budgeted', async ({
    page,
  }) => {
    await openAnalyze(page, 'real');
    const pill = page.locator('.an-winbtn', { hasText: 'Whole year' });
    if (!(await pill.count())) test.skip(true, 'no months ahead this year');
    await pill.click();
    const r = await page.evaluate(() => {
      const a = window.computeAnalyze();
      const mean = a.months.reduce((s, m) => s + m.real, 0) / a.months.length;
      return {
        avg: a.summary.realAvg,
        mean,
        n: a.summary.avgMonths.length,
        stamp: document.querySelector('.an-stamp').textContent,
        tile: document.querySelector('.an-qtile .an-a').textContent,
      };
    });
    expect(r.n).toBe(12);
    expect(Math.abs(r.avg - r.mean)).toBeLessThan(0.01);
    expect(r.stamp).toContain('budgeted');
    expect(r.tile.replace(/[^\d]/g, '')).toBe(String(Math.round(r.avg)));
    // Why so high in whole-year mode compares against the year's last months.
    await page.locator('.an-qtile').nth(1).click();
    await expect(page.locator('.an-section')).toContainText('(budgeted)');
    await page.evaluate(() => localStorage.setItem('analyzeAvgWindow', '0'));
  });

  test('phone width: no sideways scroll on any section, tiles two across', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 892 });
    await openAnalyze(page, 'real');
    for (const [i, sub] of SUBS.entries()) {
      await page.locator('.an-qtile').nth(i).click();
      await expect(page.locator('.an-section')).toHaveAttribute('data-sub', sub);
      const r = await page.evaluate(() => ({
        docWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        cols: getComputedStyle(document.querySelector('.an-tiles')).gridTemplateColumns.split(' ')
          .length,
        tileH: Math.min(
          ...[...document.querySelectorAll('.an-qtile')].map(
            (t) => t.getBoundingClientRect().height,
          ),
        ),
      }));
      expect(r.docWidth, sub).toBeLessThanOrEqual(r.viewport);
      expect(r.cols).toBe(2);
      expect(r.tileH).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `test-results/analyze-412-${sub}.png`, fullPage: true });
    }
    expect(
      await page.evaluate(() => getComputedStyle(document.querySelector('.hdr-tabs')).display),
    ).toBe('none');
  });
});
