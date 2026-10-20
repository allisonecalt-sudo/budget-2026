// The Analyze card stack (v73): 💰 Left to Budget, 🧭 After Feb 7, 💵 Cash,
// 💼 Income after Feb 7, 📅 A month now, 🪜 My levels, ✈️📋 Trips & one-offs,
// 🏠 Bills now, 🧾 This year so far. The only Analyze page (v74 deleted the v72 page;
// ?analyze=classic and ?analyze=stack simply show the stack).
//
// Read-only like analyze.spec.js: the fixture gives every test its own in-memory
// fake Supabase, and every non-GET to /rest/v1/ is aborted, so a regression that
// starts writing fails loudly here. The clock is fixed so "today" is Oct 2026
// and the fake seed's past / current months are stable.
const { test, expect } = require('./fixtures');
const { allAgorot } = require('./agorot');

test.use({ serviceWorkers: 'block' });

// Every test that opened the stack ends with a clean console.
test.afterEach(async ({ page }) => {
  expect(page.__errs || [], 'console / page errors').toEqual([]);
});

async function openStack(
  page,
  { at = '2026-10-18T10:00:00+03:00', url = '/', width = 412, allowWrites = false } = {},
) {
  // Console errors and uncaught page errors, checked after every test below.
  page.__errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') page.__errs.push(m.text());
  });
  page.on('pageerror', (e) => page.__errs.push(String(e)));
  await page.clock.setFixedTime(new Date(at));
  await page.setViewportSize({ width, height: 892 });
  if (!allowWrites)
    await page.route('**/rest/v1/**', (r) =>
      r.request().method() === 'GET' ? r.fallback() : r.abort(),
    );
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
  await page.evaluate(() => window.switchTab('analyze'));
  await page.waitForSelector('.an2-wrap [data-an2-card="answer"]', { timeout: 30000 });
  await page.waitForFunction(() => window.state.feb7Status === 'ready', null, { timeout: 30000 });
}

// Open every toggle on the page (each click re-renders, so re-query every time):
// the cards, the four level tiles, every Lean line. Then the <details> folds.
async function openEverything(page, scope = '.an2-wrap') {
  for (let i = 0; i < 150; i++) {
    const t = page.locator(`${scope} [data-an2-toggle][aria-expanded="false"]`).first();
    if (!(await t.count())) break;
    await t.click();
  }
  await page.evaluate(
    (sc) => document.querySelectorAll(sc + ' details').forEach((d) => (d.open = true)),
    scope,
  );
}

const CARDS = ['left', 'answer', 'cash', 'income', 'month', 'levels', 'pots', 'bills', 'year'];

const digits = (t) =>
  Number(
    String(t)
      .replace(/[^\d−-]/g, '')
      .replace('−', '-'),
  );
const text = async (page, sel) =>
  (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ');

test.describe('Analyze stack · the answer half', () => {
  test('Left to Budget is the ribbon’s Unallocated, from the same place', async ({ page }) => {
    await openStack(page);
    await expect(page.locator('#an2-left')).toContainText('Left to Budget · October');
    const mine = await text(page, '#an2-left-value');
    expect(mine).toBe('₪8,100'); // fake seed, Oct: ₪21,000 in − ₪12,900 budgeted
    await page.evaluate(() => window.switchTab('budget'));
    await page.waitForSelector('.ribbon-stat.rs-key .ribbon-val', { timeout: 30000 });
    const ribbon = await text(page, '.ribbon-stat.rs-key .ribbon-val');
    expect(digits(ribbon)).toBe(digits(mine));
  });

  test('four levels side by side, collapsed; a tap opens exactly one', async ({ page }) => {
    await openStack(page);
    const tiles = page.locator('.an2-lv');
    await expect(tiles).toHaveCount(4);
    const names = (await page.locator('.an2-lv-name').allInnerTexts()).map((t) => t.trim());
    expect(names.map((t) => t.toLowerCase())).toEqual(['temp', 'lean', 'middle', 'normal']);
    for (let i = 0; i < 4; i++)
      await expect(tiles.nth(i)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.an2-lvdetail')).toHaveCount(0);

    const res = async (key) => text(page, `.an2-lv[data-level="${key}"] .an2-lv-res`);
    expect(await res('normal')).toBe('+₪180 to +₪1,002');
    expect(await res('temp')).toBe('+₪4,857 to +₪5,679');
    expect(await res('middle')).toBe('+₪1,895 to +₪2,717');
    const floorTotal = await page.evaluate(() => window.computeAnalyze().summary.floorTotal);
    const signed = (v) =>
      (Math.round(v) < 0 ? '−' : '+') + '₪' + Math.abs(Math.round(v)).toLocaleString('en-IL');
    expect(await res('lean')).toBe(
      signed(14609 - floorTotal) + ' to ' + signed(15431 - floorTotal),
    );
    const cashLines = await page.locator('.an2-lv-cash').allInnerTexts();
    for (const t of cashLines) expect(t.trim()).toBe('cash: covered');

    await page.locator('.an2-lv[data-level="lean"]').click();
    await expect(page.locator('.an2-lvdetail')).toHaveCount(1);
    await expect(page.locator('.an2-lvdetail[data-level="lean"]')).toHaveCount(1);
    await expect(page.locator('.an2-lv[data-level="lean"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('Feb 7 projection on the fake seed, and the detail adds up', async ({ page }) => {
    await openStack(page);
    expect(await text(page, '#an2-cash-now')).toBe('₪26,000');
    expect(await text(page, '#an2-cash-feb7')).toBe('≈ ₪53,609');
    await expect(page.locator('.an2-cash-feb7 .an2-chip')).toHaveText('estimate');

    await page.locator('[data-an2-card="cash"] [data-an2-toggle]').click();
    const detail = page.locator('[data-an2-card="cash"] .an2-detail');
    const rowOf = (label) => detail.locator('.an2-row', { hasText: label }).first();
    await expect(rowOf('− rest of October')).toContainText('−₪3,400');
    await expect(rowOf('Nov 2026')).toContainText('+₪10,000');
    await expect(rowOf('Dec 2026')).toContainText('+₪10,000');
    const jan = rowOf('Jan 2027');
    await expect(jan).toContainText('estimate');
    await expect(rowOf('− trips & one-offs not paid yet')).toContainText('−₪4,300');
    await expect(detail.locator('.an2-row-sub', { hasText: 'Summer trip' })).toContainText(
      '₪3,000',
    );
    await expect(detail.locator('.an2-row-sub', { hasText: 'Course fees' })).toContainText(
      '₪1,200',
    );
    await expect(detail.locator('.an2-row-sub', { hasText: 'Postage' })).toContainText('₪100');
    await expect(rowOf('= Left on Feb 7')).toContainText('₪53,609');
    const end = await page.evaluate(() => window.buildStackCtx().feb7.result.end);
    expect(Math.abs(end - 53609)).toBeLessThan(1);
  });

  test('the what-if moves both numbers and writes nothing', async ({ page }) => {
    const writes = [];
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/') && r.method() !== 'GET')
        writes.push(r.method() + ' ' + r.url());
    });
    await openStack(page);
    const before = writes.length;
    await page.evaluate(() => window.setAnalyzeOneOff('40000'));
    expect(await text(page, '#an2-cash-now')).toBe('−₪14,000');
    await expect(page.locator('#an2-cash-now')).toHaveClass(/an2-amber/);
    expect(await text(page, '#an2-cash-feb7')).toBe('≈ ₪13,609');
    expect(await text(page, '.an2-lv[data-level="normal"] .an2-lv-cash')).toBe(
      'cash: covered · under ~₪25K in Feb',
    );
    await page.locator('.an2-lv[data-level="normal"]').click();
    await expect(page.locator('.an2-lvdetail[data-level="normal"] .an2-flag')).toContainText(
      'Dips under the soft line (around ₪25K) in Feb 2027 — a flag to look at, not a failure.',
    );
    expect(writes.length).toBe(before); // nothing but GETs after the change
    await page.evaluate(() => window.setAnalyzeOneOff(''));
    expect(await text(page, '#an2-cash-now')).toBe('₪26,000');
  });

  test('the 2027 strip is month-aware: gan 2, clients, travel, havra’a', async ({ page }) => {
    await openStack(page);
    await page.locator('.an2-lv[data-level="normal"]').click();
    const detail = page.locator('.an2-lvdetail[data-level="normal"]');
    const months = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rows = months.map((m) => detail.locator('.an2-row', { hasText: m + ' 2027' }).first());
    for (const r of rows) await expect(r).toHaveCount(1);
    expect(months.length).toBe(11);
    await expect(rows[0]).toContainText('clients at today’s pace (2)');
    await expect(rows[5]).toContainText('gan 2 pays ₪0');
    await expect(rows[6]).toContainText(
      'gan 2 pays ₪0 · no clients in August · Petachya without travel',
    );
    await expect(rows[7]).toContainText('+ havra’a ₪1,380');
    await expect(detail.locator('.an2-row-bold', { hasText: 'Lowest: Aug 2027' })).toHaveCount(1);
  });

  test('the income card: your plan on the face, one mix per scenario, two in the plan', async ({
    page,
  }) => {
    await openStack(page);
    const face = await text(page, '[data-an2-card="income"] .an2-face');
    expect(face).toContain('₪14,609 – ₪15,431');
    // The plan is named as a range, never one row's label.
    expect(face).toContain('Petachya + gan 2 (Fri) + 4–5 private clients');
    await page.locator('[data-an2-card="income"] [data-an2-toggle]').click();
    const keys = await page.evaluate(() => window.buildStackCtx().scenarios.map((s) => s.key));
    expect(keys.length).toBe(10);
    const shown = await page
      .locator('.an2-mix')
      .evaluateAll((els) => els.map((e) => e.dataset.mix));
    expect(shown).toEqual(keys);
    const plan = await page
      .locator('.an2-mix-plan')
      .evaluateAll((els) => els.map((e) => e.dataset.mix));
    expect(plan.sort()).toEqual(['all4', 'all5']);
    // all4's own label says what its net is (4 clients).
    await expect(page.locator('.an2-mix[data-mix="all4"]')).toContainText(
      'Petachya + gan 2 (Fri) + 4 private clients',
    );
    const clalit = (await page.locator('.an2-mix[data-mix="clalit"]').innerText()).replace(
      /\s+/g,
      ' ',
    );
    expect(clalit).toContain('₪109 an hour · Clalit');
    expect(clalit).toContain('gross per paid hour, grants spread');
    expect(await page.locator('[data-an2-card="income"]').innerText()).not.toContain('₪54');
  });

  test('the stack is the only page: no query, ?analyze=stack and the old ?analyze=classic all show it', async ({
    page,
  }) => {
    await page.route('**/rest/v1/**', (r) =>
      r.request().method() === 'GET' ? r.fallback() : r.abort(),
    );
    const errs = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errs.push(m.text());
    });
    page.on('pageerror', (e) => errs.push(String(e)));
    for (const url of ['/', '/?analyze=stack', '/?analyze=classic']) {
      await page.goto(url);
      await page.waitForFunction(() => !document.querySelector('.loading'), null, {
        timeout: 30000,
      });
      await page.evaluate(() => window.switchTab('analyze'));
      await page.waitForSelector('.an2-wrap [data-an2-card="answer"]', { timeout: 30000 });
      await expect(page.locator('.an-tiles')).toHaveCount(0);
      expect(await page.evaluate(() => typeof window.renderAnalyzeTab), url).toBe('undefined');
    }
    expect(errs).toEqual([]);
  });

  // ── C4 · the whole stack on a phone ─────────────────────────────────────
  test('412 px: the answer is above the fold — Left to Budget and all four results', async ({
    page,
  }) => {
    await openStack(page);
    const bottoms = await page.evaluate(() =>
      [...document.querySelectorAll('#an2-left-value, .an2-lv-res')].map((e) => ({
        id: e.id || e.parentElement.dataset.level,
        bottom: Math.round(e.getBoundingClientRect().bottom + window.scrollY),
      })),
    );
    expect(bottoms.length).toBe(5);
    for (const b of bottoms) expect(b.bottom, JSON.stringify(b)).toBeLessThan(600);
    test.info().annotations.push({ type: 'bottoms', description: JSON.stringify(bottoms) });
  });

  test('412 px: no sideways scroll, collapsed and with every detail open', async ({ page }) => {
    await openStack(page);
    const check = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollWidth - window.innerWidth,
        over: [...document.querySelectorAll('.an2-card')]
          .filter((c) => c.scrollWidth - c.clientWidth > 1)
          .map((c) => c.dataset.an2Card),
      }));
    expect(await check()).toEqual({ page: 0, over: [] });
    await openEverything(page);
    expect(await check()).toEqual({ page: 0, over: [] });
  });

  test('412 px: nothing under 12 px, collapsed and open', async ({ page }) => {
    await openStack(page);
    const tiny = () =>
      page.evaluate(() => {
        const bad = [];
        const sizes = [];
        for (const el of document.querySelectorAll('.an2-wrap *')) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!own) continue;
          const px = parseFloat(getComputedStyle(el).fontSize);
          sizes.push(px);
          if (px < 12) bad.push(el.className + ' ' + px);
        }
        return { bad, smallest: Math.min(...sizes) };
      });
    const a = await tiny();
    expect(a.bad).toEqual([]);
    await openEverything(page);
    const b = await tiny();
    expect(b.bad).toEqual([]);
    test.info().annotations.push({ type: 'smallest-font-px', description: String(b.smallest) });
  });

  test('412 px: every tap target is 44 px tall, collapsed and open', async ({ page }) => {
    await openStack(page);
    const short = () =>
      page.evaluate(() => {
        const taps =
          '.an2-wrap button, .an2-wrap summary, .an2-wrap select, .an2-wrap input:not([type="checkbox"]), .an2-wrap label.an2-toggle';
        const bad = [];
        let min = 999;
        for (const el of document.querySelectorAll(taps)) {
          const b = el.getBoundingClientRect();
          if (!b.width) continue;
          min = Math.min(min, b.height);
          if (b.height < 44) bad.push(el.className + ' ' + Math.round(b.height));
        }
        return { bad, min };
      });
    const a = await short();
    expect(a.bad).toEqual([]);
    await openEverything(page);
    const b = await short();
    expect(b.bad).toEqual([]);
    test.info().annotations.push({ type: 'smallest-tap-px', description: String(b.min) });
  });

  test('adds up: every ₪ on a card face is somewhere in its own detail (all nine cards)', async ({
    page,
  }) => {
    await openStack(page);
    const tok = (t) => new Set(t.match(/₪[\d,]+K?/g) || []);
    for (const key of CARDS) {
      const face = await page.locator(`[data-an2-card="${key}"] .an2-face`).innerText();
      await openEverything(page, `[data-an2-card="${key}"]`);
      const detail = await page.locator(`[data-an2-card="${key}"]`).innerText();
      const have = tok(detail);
      const missing = [...tok(face)].filter((x) => !have.has(x));
      expect(missing, key + ' face amounts missing from its detail').toEqual([]);
    }
  });

  test('no red anywhere in the stack: default, everything open, and after a what-if', async ({
    page,
  }) => {
    await openStack(page);
    const red = () =>
      page.evaluate(() => {
        const bad = [];
        const isRed = (c) => /rgb\(192, 57, 43\)|rgba\(192, 57, 43/.test(c);
        for (const el of document.querySelectorAll('.an2-wrap, .an2-wrap *')) {
          const cs = getComputedStyle(el);
          for (const p of [
            'color',
            'backgroundColor',
            'borderTopColor',
            'borderBottomColor',
            'borderLeftColor',
            'borderRightColor',
          ])
            if (isRed(cs[p])) bad.push(el.className + ' ' + p);
        }
        return bad;
      });
    expect(await red()).toEqual([]);
    await openEverything(page);
    expect(await red()).toEqual([]);
    await page.evaluate(() => window.setAnalyzeOneOff('40000'));
    expect(await red()).toEqual([]);
  });

  test('2027 is not blank: every card says something, nothing reads —', async ({ page }) => {
    await openStack(page);
    await page.evaluate(() => window.switchYear(2027));
    await page.waitForFunction(
      () =>
        window.state.currentYear === 2027 &&
        !window.state.loading &&
        window.state.analyzeBase &&
        window.state.potsCmp &&
        window.state.potsCmp.years[0] === 2027 &&
        window.state.floors &&
        window.state.feb7Status === 'ready' &&
        document.querySelector('.an2-wrap[data-year="2027"]'),
      null,
      { timeout: 30000 },
    );
    const bigs = await page.locator('.an2-big').allInnerTexts();
    expect(bigs.length).toBeGreaterThan(5);
    for (const b of bigs) {
      expect(b.trim(), 'a card value reads — or is empty').not.toBe('—');
      expect(b.trim()).not.toBe('');
    }
    const body = await page.locator('.an2-wrap').innerText();
    for (const bad of ['Switch to 2026', 'NaN', 'undefined']) expect(body).not.toContain(bad);
    const face = (k) => text(page, `[data-an2-card="${k}"] .an2-face`);
    expect(await face('year')).toContain('2027 has no complete month yet — this is 2026');
    expect(await face('month')).toMatch(/₪[\d,]+/);
    expect(await face('month')).toContain('Based on 2026');
    expect(await face('levels')).toContain('Lean is 2026’s');
    expect(await face('bills')).toMatch(/₪[\d,]+/);
    expect(await face('pots')).toContain('your plan');
    const results = await page.locator('.an2-lv-res').allInnerTexts();
    expect(results.length).toBe(4);
    for (const t of results) expect(t).toMatch(/[+−]₪[\d,]+ to [+−]₪[\d,]+/);
    await expect(page.locator('#an2-left-value')).toHaveText(/₪/);
    // Loading 2027 makes the app's quiet writes (a derived charity row); this test aborts every
    // write, and the browser logs each aborted request. Those are not app errors.
    page.__errs = page.__errs.filter((e) => e !== 'Failed to load resource: net::ERR_FAILED');
    await page.evaluate(() => window.switchYear(2026));
    await page.waitForFunction(
      () =>
        window.state.currentYear === 2026 &&
        !window.state.loading &&
        document.querySelector('.an2-wrap[data-year="2026"]'),
      null,
      { timeout: 30000 },
    );
  });

  test('Feb 7 has passed: the second number is left now, and the basis says today', async ({
    page,
  }) => {
    await openStack(page, { at: '2027-02-15T10:00:00+02:00' });
    expect(await text(page, '#an2-cash-feb7')).toBe(await text(page, '#an2-cash-now'));
    await expect(page.locator('.an2-cash-feb7')).toContainText('this is left now');
    await expect(page.locator('[data-an2-card="answer"] .an2-face')).toContainText(
      'cash counted from today',
    );
  });

  test('Lean edits still save the old way: one spend_floors write and one change_log row', async ({
    page,
    db,
  }) => {
    // The one test that lets writes through — to the in-memory fake, never a real database.
    await openStack(page, { allowWrites: true });
    db.writes.length = 0; // the quiet charity sync on load
    await page.locator('[data-an2-card="levels"] .an2-more').click();
    const before = await text(page, '[data-an2-card="levels"] .an2-big');
    const input = page.locator('.an-floor[data-floor-cat="groceries"]');
    await input.fill('300');
    await input.blur();
    await expect
      .poll(() => db.writes.filter((w) => w.table === 'spend_floors').length, { timeout: 10000 })
      .toBe(1);
    await expect
      .poll(() => db.writes.filter((w) => w.table === 'change_log').length, { timeout: 10000 })
      .toBe(1);
    const log = JSON.stringify(db.writes.find((w) => w.table === 'change_log').body);
    expect(log).toContain('groceries');
    await expect
      .poll(() => text(page, '[data-an2-card="levels"] .an2-big'), { timeout: 10000 })
      .not.toBe(before);
  });

  test('writes nothing else: every card, driving, US tax and the what-if are view state', async ({
    page,
  }) => {
    const writes = [];
    page.on('request', (r) => {
      if (r.url().includes('/rest/v1/') && r.method() !== 'GET')
        writes.push(r.method() + ' ' + r.url());
    });
    await openStack(page);
    writes.length = 0; // the quiet charity sync on load (as in analyze.spec.js)
    await openEverything(page);
    await page.locator('.an2-toggle input').nth(0).check();
    await page.locator('.an2-toggle input').nth(1).check();
    await page.evaluate(() => window.setAnalyzeOneOff('8000'));
    await page.evaluate(() => window.setAnalyzeOneOff(''));
    await page.locator('.an2-toggle input').nth(0).uncheck();
    await page.locator('.an2-toggle input').nth(1).uncheck();
    expect(writes).toEqual([]);
  });

  test('screenshots for the checker: the top of the stack and the whole page, collapsed', async ({
    page,
  }) => {
    await openStack(page);
    await page.screenshot({ path: 'test-results/analyze-stack-412-top.png' });
    await page.screenshot({ path: 'test-results/analyze-stack-412-full.png', fullPage: true });
  });

  // ── Y · the chunk B checker's items ─────────────────────────────────────
  test('Y1: a signed amount in an answer tile never breaks inside itself (412 px)', async ({
    page,
  }) => {
    await openStack(page);
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll('.an2-lv-res .an2-nw')]
        .filter((el) => el.getClientRects().length > 1)
        .map((el) => el.textContent),
    );
    expect(broken).toEqual([]);
    expect(await page.locator('.an2-lv-res .an2-nw').count()).toBe(8);
    expect(await text(page, '.an2-lv[data-level="normal"] .an2-lv-res')).toBe('+₪180 to +₪1,002');
  });

  test('Y3: no double full stop after a note that already ends in punctuation', async ({
    page,
  }) => {
    await openStack(page);
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const t = await text(page, '[data-an2-card="cash"] .an2-detail');
    expect(t).not.toMatch(/\.\./);
    expect(t).toContain('pay for it”.');
  });

  test('Y4: the school legend has its “without it” numbers and names no one', async ({ page }) => {
    await openStack(page);
    await page.locator('[data-an2-card="income"] .an2-more').click();
    const t = await text(page, '[data-an2-card="income"] .an2-detail');
    const nums = await page.evaluate(() => window.buildStackCtx().schoolWithout);
    const f = (v) => '₪' + Math.round(v).toLocaleString('en-US');
    expect(t).toContain('confirm it before counting on it');
    expect(t).toContain(
      'Without it: net ' + f(nums.net) + ', net + funds ' + f(nums.netPlusFunds) + '.',
    );
    expect(nums.netPlusFunds).toBeGreaterThan(nums.net);
    expect(t).not.toContain('confirm it with');
  });

  test('Y5: “No balances set” only when there are no cash accounts', async ({ page, db }) => {
    // The fake seed has three accounts and no balance date.
    await openStack(page);
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const dated = await text(page, '[data-an2-card="cash"] .an2-detail');
    expect(dated).toContain('Balances have no date yet — update them on the Cash tab.');
    expect(dated).not.toContain('No balances set on the Cash tab yet.');
    // Now truly none.
    db.table('cash_accounts').length = 0;
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
    await page.evaluate(() => window.switchTab('analyze'));
    await page.waitForSelector('[data-an2-card="cash"]', { timeout: 30000 });
    await page.waitForFunction(() => window.state.feb7Status === 'ready', null, { timeout: 30000 });
    await openEverything(page, '[data-an2-card="cash"]');
    const none = await text(page, '[data-an2-card="cash"] .an2-detail');
    expect(none).toContain('No balances set on the Cash tab yet.');
    expect(none).not.toContain('Balances have no date yet');
  });

  test('Y6: while Feb 7 is loading or failed, every “from Feb 7” line is a dash, never “covered”', async ({
    page,
  }) => {
    await openStack(page);
    for (const status of ['loading', 'error']) {
      await page.evaluate((st) => {
        window.state.feb7Data = null;
        window.state.feb7Status = st;
        window.renderApp();
      }, status);
      await openEverything(page);
      const answer = await page.locator('[data-an2-card="answer"]').innerText();
      expect(answer, status).toContain('Starts at — on Feb 7.');
      expect(answer, status).toContain('Cash lasts from Feb 7: —');
      expect(answer, status).not.toContain('Covered on a typical month');
      expect(answer, status).not.toContain('cash: covered');
      expect(answer, status).not.toContain('₪26,000'); // left now never stands in for Feb 7
      expect(answer, status).not.toContain('Lowest: Aug');
      const cash = await page.locator('[data-an2-card="cash"]').innerText();
      expect(cash, status).toContain('from Feb 7: —');
      expect(cash, status).not.toContain('from Feb 7: covered');
      expect(await text(page, '#an2-cash-feb7')).toBe(status === 'error' ? '—' : '…');
    }
  });

  test('Y8: months after the current one carry an “expected” tag in the income detail', async ({
    page,
  }) => {
    await openStack(page);
    await page.locator('[data-an2-card="income"] .an2-more').click();
    await page.locator('[data-an2-card="income"] .an2-sub > summary').click();
    const months = await page.evaluate(() =>
      window.buildStackCtx().incomeMonths.map((m) => ({ label: m.label, status: m.status })),
    );
    const detail = page.locator('[data-an2-card="income"] .an2-sub');
    const tagged = await detail
      .locator('.an2-row-bold', { has: page.locator('.an2-chip') })
      .evaluateAll((els) =>
        els.map((e) => e.querySelector('span').innerText.split('\n')[0].trim()),
      );
    const expected = months.filter((m) => m.status === 'future').map((m) => m.label);
    expect(expected.length).toBeGreaterThan(0);
    expect(tagged.map((t) => t.replace(/\s*expected$/, ''))).toEqual(expected);
    // The current month is marked ◉, not “expected”.
    const oct = detail.locator('.an2-row-bold', { hasText: 'Oct ◉' });
    await expect(oct).toHaveCount(1);
    await expect(oct.locator('.an2-chip')).toHaveCount(0);
  });

  // ── Y7 · gaps the chunk B checker named ─────────────────────────────────
  test('Y7: Left to Budget names the Budget tab’s month when it is not today’s', async ({
    page,
  }) => {
    await openStack(page);
    await page.evaluate(async () => {
      const nov = window.state.months.find((m) => m.month_num === 11);
      await window.switchMonth(nov.id);
    });
    await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
    await page.evaluate(() => window.switchTab('analyze'));
    await expect(page.locator('#an2-left')).toContainText('Left to Budget · November');
    await expect(page.locator('#an2-left .an2-face')).toContainText(
      'the month open on the Budget tab',
    );
    const mine = await text(page, '#an2-left-value');
    await page.evaluate(() => window.switchTab('budget'));
    await page.waitForSelector('.ribbon-stat.rs-key .ribbon-val', { timeout: 30000 });
    expect(digits(await text(page, '.ribbon-stat.rs-key .ribbon-val'))).toBe(digits(mine));
    // And today's month carries no such caption.
    await page.evaluate(async () => {
      const oct = window.state.months.find((m) => m.month_num === 10);
      await window.switchMonth(oct.id);
    });
    await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
    await page.evaluate(() => window.switchTab('analyze'));
    await expect(page.locator('#an2-left')).toContainText('Left to Budget · October');
    await expect(page.locator('#an2-left .an2-face')).not.toContainText('the month open on');
  });

  test('Y7: a projection with nothing guessed carries no estimate chip', async ({ page, db }) => {
    // Give January 2027 what December 2026 has: income, bills, envelopes, charity.
    const months = db.table('months');
    const dec = months.find((m) => m.year === 2026 && m.month_num === 12);
    const jan = months.find((m) => m.year === 2027 && m.month_num === 1);
    for (const k of [
      'income_petachya',
      'income_clalit',
      'income_private',
      'income_other',
      'charity_pct',
    ])
      jan[k] = dec[k];
    for (const b of db.table('budgets').filter((b) => b.month_id === dec.id))
      db.table('budgets').push({ ...b, id: 'jan-b-' + b.category, month_id: jan.id });
    for (const i of db.table('budget_items').filter((i) => i.month_id === dec.id))
      db.table('budget_items').push({ ...i, id: 'jan-i-' + i.id, month_id: jan.id });
    await openStack(page);
    expect(await page.evaluate(() => window.buildStackCtx().feb7.result.estimate)).toBe(false);
    await expect(page.locator('.an2-cash-feb7 .an2-chip')).toHaveCount(0);
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    await expect(page.locator('[data-an2-card="cash"] .an2-chip')).toHaveCount(0);
    const end = await page.evaluate(() => window.buildStackCtx().feb7.result.end);
    expect(await text(page, '#an2-cash-feb7')).toBe(
      '≈ ₪' + Math.round(end).toLocaleString('en-US'),
    );
  });

  test('Y7: the answer card says what the cash is counted from — ₪53,609 on Feb 7 (projected)', async ({
    page,
  }) => {
    await openStack(page);
    await expect(page.locator('[data-an2-card="answer"] .an2-face')).toContainText(
      'cash counted from ₪53,609 on Feb 7 (projected)',
    );
  });

  test('Y7: a level that is SHORT says “cash lasts N months”, and “years” past 60', async ({
    page,
  }) => {
    await openStack(page);
    // US self-employment tax on: Normal drops under the plan's income.
    await page.evaluate(() => window.setAnalyzeSE(true));
    const normal = '.an2-lv[data-level="normal"]';
    expect(await text(page, normal + ' .an2-lv-res')).toMatch(/^−₪\d+ to /);
    await expect(page.locator(normal + ' .an2-lv-res')).toHaveClass(/an2-amber/);
    // 53,609 on Feb 7 against a small monthly gap runs past 60 months.
    expect(await text(page, normal + ' .an2-lv-cash')).toBe('cash lasts years');
    // A what-if one-off brings it under 60: a number of months.
    await page.evaluate(() => window.setAnalyzeOneOff('40000'));
    const months = await text(page, normal + ' .an2-lv-cash');
    expect(months).toMatch(/^cash lasts \d+(\.\d)? months$/);
    expect(Number(months.match(/[\d.]+/)[0])).toBeLessThanOrEqual(60);
    await page.locator(normal).click();
    const detail = await text(page, '.an2-lvdetail[data-level="normal"]');
    expect(detail).toMatch(/Short ₪\d+ a typical month: cash lasts \d+(\.\d)? months from Feb 7/);
    expect(detail).toContain('if the keren hishtalmut is used');
    expect(detail).not.toContain('Covered on a typical month');
    // The Cash card carries the same words.
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    expect(await text(page, '[data-an2-card="cash"] .an2-detail')).toMatch(
      /Normal · ₪14,429 from now: [^·]+ · from Feb 7: \d+(\.\d)? months/,
    );
  });

  test('Y7: July and August 2027 carry their AMOUNTS — gan 2 pays ₪0, August has no clients', async ({
    page,
  }) => {
    await openStack(page);
    await page.locator('.an2-lv[data-level="normal"]').click();
    const detail = page.locator('.an2-lvdetail[data-level="normal"]');
    const rowOf = (m) => detail.locator('.an2-row', { hasText: m + ' 2027' }).first();
    const jul = (await rowOf('Jul').innerText()).replace(/\s+/g, ' ');
    const aug = (await rowOf('Aug').innerText()).replace(/\s+/g, ' ');
    // Petachya ₪9,700 + gan 2 ₪0 + four clients ₪3,389 = ₪13,089 in; Normal is ₪14,429 out.
    expect(jul).toContain('₪13,089 in − ₪14,429 out');
    expect(jul).toContain('−₪1,340');
    // Petachya without travel ₪9,185 + gan 2 ₪0 + the accountant −₪200 = ₪8,985 in.
    expect(aug).toContain('₪8,985 in − ₪14,429 out');
    expect(aug).toContain('−₪5,444');
  });

  test('Y2 on screen: every Feb 7 row adds up as shown (in − out = net)', async ({ page }) => {
    await openStack(page);
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const rows = await page
      .locator('[data-an2-card="cash"] .an2-row', { hasText: /20\d\d: ₪[\d,]+ in − / })
      .allInnerTexts();
    expect(rows.length).toBe(3);
    const n = (t) => Number(t.replace(/[^\d]/g, ''));
    for (const r of rows) {
      const flat = r.replace(/\s+/g, ' ');
      const m = flat.match(/: ₪([\d,]+) in − ₪([\d,]+) out.*?([+−])₪([\d,]+)$/);
      expect(m, flat).not.toBeNull();
      const net = (m[3] === '−' ? -1 : 1) * n(m[4]);
      expect(n(m[1]) - n(m[2]), flat).toBe(net);
    }
  });
});

// ── v73 fix round (Z1–Z11) ───────────────────────────────────────────────
// Take-out ₪40.33 a month: the seed's whole-shekel amounts hide every rounding bug.
function agorot(db) {
  for (const t of db.table('transactions')) if (t.category === 'takeout') t.amount = 40.33;
}
const nums = (t) => (t.match(/₪[\d,]+/g) || []).map((x) => Number(x.replace(/[^\d]/g, '')));

test.describe('v73 fix round', () => {
  for (const variant of ['the fake seed', 'agorot (take-out ₪40.33)']) {
    test('Z1: 📅 A month now adds up as shown — ' + variant, async ({ page, db }) => {
      if (variant !== 'the fake seed') agorot(db);
      await openStack(page);
      const face = (await page.locator('[data-an2-card="month"] .an2-face').innerText()).replace(
        /\s+/g,
        ' ',
      );
      const m = face.match(
        /₪([\d,]+) a month ₪([\d,]+) bills, everyday and charity \+ ₪([\d,]+) trips[^·]*\)( · ±₪([\d,]+) rounding)?/,
      );
      expect(m, face).not.toBeNull();
      const [big, p1, p2] = [m[1], m[2], m[3]].map((x) => Number(x.replace(/,/g, '')));
      // Each part prints its own rounding. When they do not add to the month, the face says "≈"
      // and the detail has ONE rounding row ("rounding" here: it comes from averages and ÷ 12) that closes it - never a silent mismatch.
      expect(!!m[4], face).toBe(p1 + p2 !== big); // the marker, exactly when they do not add
      if (m[4]) expect(Number(m[5]), face).toBe(Math.abs(p1 + p2 - big));
      if (variant === 'the fake seed') expect([p1, p2, big]).toEqual([7091, 2101, 9191]);
      // The detail: bills + everyday + charity (+ its rounding row) = the base, then base +
      // trips (+ its rounding row) = the month.
      await page.locator('[data-an2-card="month"] .an2-more').click();
      const rows = (
        await page.locator('[data-an2-card="month"] .an2-detail .an2-row').allInnerTexts()
      ).map((x) => x.replace(/\s+/g, ' '));
      const at = (label) => rows.findIndex((x) => x.includes(label));
      const val = (label) => {
        const i = at(label);
        expect(i, label).toBeGreaterThan(-1);
        return nums(rows[i]).pop();
      };
      const rounding = (from, to) =>
        rows
          .slice(from, to)
          .filter((x) => x.startsWith('agorot, rounded') || x.startsWith('rounding'))
          .reduce((a, x) => a + (/−/.test(x) ? -1 : 1) * nums(x).pop(), 0);
      const iBase = at('Bills + everyday + charity');
      const iMonth = at('A month now');
      expect(val('Bills · ') + val('Everyday · ') + val('Charity · ') + rounding(0, iBase)).toBe(
        val('Bills + everyday + charity'),
      );
      expect(val('Bills + everyday + charity')).toBe(p1);
      expect(
        val('Bills + everyday + charity') + val('Trips & one-offs') + rounding(iBase, iMonth),
      ).toBe(val('A month now'));
      expect(val('A month now')).toBe(big);
    });
  }

  // Z2 · every displayed chain adds, with agorot in the data.
  test('Z2: with agorot in the data, every strip row and the Feb 7 chain add up as shown', async ({
    page,
    db,
  }) => {
    agorot(db); // take-out ₪40.33: Lean ₪7,045.33, rest of the month ₪259.67 ...
    await openStack(page);
    expect(await page.evaluate(() => window.state.floors && 1)).toBe(1);
    const signedN = (sign, v) => (sign === '−' ? -1 : 1) * Number(v.replace(/,/g, ''));
    // The 🧭 strip: for every level, start + net = cash, and in − out = net, row by row.
    let rowsChecked = 0;
    for (const lv of ['temp', 'lean', 'middle', 'normal']) {
      await page.locator(`.an2-lv[data-level="${lv}"]`).click();
      const d = page.locator(`.an2-lvdetail[data-level="${lv}"]`);
      const start = Number(
        (await d.locator('.an2-note', { hasText: /^Starts at/ }).innerText())
          .match(/₪([\d,]+)/)[1]
          .replace(/,/g, ''),
      );
      const rows = await d.locator('.an2-row', { hasText: /20\d\d.* in − .* out/ }).allInnerTexts();
      expect(rows.length).toBe(11);
      let prev = start;
      for (const r of rows) {
        const flat = r.replace(/\s+/g, ' ');
        const m = flat.match(/₪([\d,]+) in − ₪([\d,]+) out.*?([+−])₪([\d,]+) · (−?)₪([\d,]+)\s*$/);
        expect(m, flat).not.toBeNull();
        const inn = Number(m[1].replace(/,/g, ''));
        const out = Number(m[2].replace(/,/g, ''));
        const net = signedN(m[3], m[4]);
        const cash = signedN(m[5] || '+', m[6]);
        expect(inn - out, flat).toBe(net);
        expect(prev + net, flat).toBe(cash);
        prev = cash;
        rowsChecked++;
      }
      await page.locator(`.an2-lv[data-level="${lv}"]`).click();
    }
    expect(rowsChecked).toBe(44);
    // The detail's own sums: the plan's income parts add to the income it prints, and
    // income − level = the result it prints.
    await page.locator('.an2-lv[data-level="lean"]').click();
    const d = page.locator('.an2-lvdetail[data-level="lean"]');
    const val = async (label) =>
      nums(
        (await d.locator('.an2-row', { hasText: label }).first().innerText()).replace(/\s+/g, ' '),
      ).pop();
    expect(
      (await val('Petachya (2027')) +
        (await val('Gan 2 (Fridays')) +
        (await val('4 private clients')),
    ).toBe(await val('Income · 4 clients'));
    expect((await val('Income · 4 clients')) - 7045).toBe(
      nums(
        (await d.locator('.an2-row', { hasText: '4 clients: ' }).first().innerText()).replace(
          /\s+/g,
          ' ',
        ),
      ).pop(),
    );
    // The 💵 chain: left now − rest of the month + each month's net − trips due = Feb 7.
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const cd = page.locator('[data-an2-card="cash"] .an2-detail');
    const line = async (re) =>
      (await cd.locator('.an2-row', { hasText: re }).first().innerText()).replace(/\s+/g, ' ');
    const lastNum = (t) => {
      const m = t.match(/([+−]?)₪([\d,]+)\s*$/);
      return signedN(m[1] || '+', m[2]);
    };
    const leftNow = lastNum(await line(/^Left now/));
    const rest = lastNum(await line(/− rest of/));
    const monthRows = await cd
      .locator('.an2-row', { hasText: /20\d\d: ₪[\d,]+ in − / })
      .allInnerTexts();
    const nets = monthRows.map((t) => lastNum(t.replace(/\s+/g, ' ')));
    const pots = lastNum(await line(/− trips & one-offs not paid yet/));
    const end = lastNum(await line(/= Left on Feb 7/));
    expect(nets.length).toBe(3);
    expect(leftNow + rest + nets.reduce((a, b) => a + b, 0) + pots).toBe(end);
    // The pot lines add to the pots total.
    const potLines = await cd
      .locator('.an2-row-sub')
      .filter({ hasText: /^(Summer trip|Course fees|Postage)/ })
      .allInnerTexts();
    expect(potLines.length).toBeGreaterThan(0);
    expect(potLines.reduce((a, t) => a + lastNum(t.replace(/\s+/g, ' ')), 0)).toBe(-pots);
  });

  // ── Z4 / Z8 · 2027 reads 2026's Lean line by line ─────────────────────────
  async function view2027(page) {
    await page.evaluate(() => window.switchYear(2027));
    await page.waitForFunction(
      () =>
        window.state.currentYear === 2027 &&
        !window.state.loading &&
        window.state.analyzeBase &&
        window.state.potsCmp &&
        window.state.potsCmp.years[0] === 2027 &&
        window.state.floors &&
        window.state.feb7Status === 'ready' &&
        document.querySelector('.an2-wrap[data-year="2027"]'),
      null,
      { timeout: 30000 },
    );
  }

  test('Z4: 2027 Lean is 2026’s line by line - one line set leaves the other fifteen at 2026’s', async ({
    page,
    db,
  }) => {
    await openStack(page, { allowWrites: true });
    const lean26 = await page.evaluate(() => {
      const l = window.buildStackCtx().levels.find((x) => x.key === 'lean');
      return { total: l.total, groceries: l.lines.groceries, n: Object.keys(l.lines).length };
    });
    await view2027(page);
    const lean = () =>
      page.evaluate(() => {
        const c = window.buildStackCtx();
        return {
          total: c.levels.find((x) => x.key === 'lean').total,
          answer: c.answers.find((x) => x.key === 'lean').total,
        };
      });
    // Before any 2027 line: all of it is 2026's, said once.
    expect((await lean()).total).toBe(lean26.total);
    await expect(page.locator('[data-an2-card="levels"] .an2-face')).toContainText(
      'Lean is 2026’s until you set 2027’s (shown, not saved)',
    );
    db.writes.length = 0; // the quiet writes 2027 makes on load
    await page.locator('[data-an2-card="levels"] .an2-more').click();
    const input = page.locator('.an-floor[data-floor-cat="groceries"]');
    await input.fill('300');
    await input.blur();
    await expect
      .poll(() => db.writes.filter((w) => w.table === 'spend_floors').length, { timeout: 10000 })
      .toBe(1);
    await expect
      .poll(() => db.writes.filter((w) => w.table === 'change_log').length, { timeout: 10000 })
      .toBe(1);
    // Exactly one spend_floors row, for 2027, groceries, 300 - and nothing else written.
    const sf = db.writes.filter((w) => w.table === 'spend_floors');
    expect(sf.length).toBe(1);
    expect(sf[0].body).toMatchObject({ year: 2027, category: 'groceries', amount: 300 });
    expect(db.writes.filter((w) => w.table === 'change_log').length).toBe(1);
    // Lean = 2026's total with groceries replaced by 300 (the checker's probe5 read ₪4,600).
    const want = lean26.total - lean26.groceries + 300;
    await expect.poll(async () => (await lean()).total, { timeout: 10000 }).toBe(want);
    expect(want).not.toBe(4600);
    expect((await lean()).answer).toBe(want);
    // The card re-renders at once: the new label, no stale "(shown, not saved)".
    const face = await text(page, '[data-an2-card="levels"] .an2-face');
    expect(face).toContain('Lean ₪' + want.toLocaleString('en-US'));
    expect(face).toContain(lean26.n - 1 + ' lines from 2026');
    expect(face).not.toContain('shown, not saved');
    expect(face).not.toContain('Lean is 2026’s');
    // Each 2026 line says so; the line she set does not.
    const rows = await page.locator('[data-an2-card="levels"] .an2-frow').allInnerTexts();
    expect(rows.length).toBe(lean26.n);
    const set = rows.filter((r) => !r.includes('2026’s Lean'));
    expect(set.length).toBe(1);
    expect(set[0]).toContain('Groceries');
    // The 🧭 Lean tile moved with it.
    expect(await text(page, '.an2-lv[data-level="lean"] .an2-lv-spend')).toContain(
      '₪' + want.toLocaleString('en-US'),
    );
    expect(await text(page, '.an2-lv[data-level="lean"] .an2-lv-spend')).not.toContain('2026’s');

    // W3: it holds after switching to 2026 and back, and after a full page reload.
    const holds = async (where) => {
      await expect
        .poll(async () => (await lean()).total, { timeout: 15000, message: where })
        .toBe(want);
      const fc = await text(page, '[data-an2-card="levels"] .an2-face');
      expect(fc, where).toContain('Lean ₪' + want.toLocaleString('en-US'));
      expect(fc, where).toContain(lean26.n - 1 + ' lines from 2026');
      expect(await text(page, '.an2-lv[data-level="lean"] .an2-lv-spend'), where).toContain(
        '₪' + want.toLocaleString('en-US'),
      );
    };
    await page.evaluate(() => window.switchYear(2026));
    await page.waitForFunction(
      () =>
        window.state.currentYear === 2026 &&
        !window.state.loading &&
        document.querySelector('.an2-wrap[data-year="2026"]'),
      null,
      { timeout: 30000 },
    );
    await view2027(page);
    await holds('after 2026 and back');
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.loading'), null, {
      timeout: 30000,
    });
    await page.evaluate(() => window.switchTab('analyze'));
    await page.waitForSelector('.an2-wrap [data-an2-card="answer"]', { timeout: 30000 });
    await view2027(page);
    await holds('after a full reload');
    // Still exactly one floor write and one history row in the whole test.
    expect(db.writes.filter((w) => w.table === 'spend_floors').length).toBe(1);
    expect(db.writes.filter((w) => w.table === 'change_log').length).toBe(1);
  });

  test('W3: a 2027 line she CLEARS reads 2026’s floor, not 2027’s ₪0 suggestion', async ({
    page,
    db,
  }) => {
    await openStack(page, { allowWrites: true });
    const lean26 = await page.evaluate(
      () => window.buildStackCtx().levels.find((x) => x.key === 'lean').total,
    );
    await view2027(page);
    await page.locator('[data-an2-card="levels"] .an2-more').click();
    const input = page.locator('.an-floor[data-floor-cat="groceries"]');
    await input.fill('300');
    await input.blur();
    await expect
      .poll(() => db.writes.filter((w) => w.table === 'spend_floors').length, { timeout: 10000 })
      .toBe(1);
    await input.fill('');
    await input.blur();
    await expect
      .poll(() => db.writes.filter((w) => w.table === 'spend_floors').length, { timeout: 10000 })
      .toBe(2);
    await expect
      .poll(
        () =>
          page.evaluate(() => window.buildStackCtx().levels.find((x) => x.key === 'lean').total),
        { timeout: 10000 },
      )
      .toBe(lean26);
    const face = await text(page, '[data-an2-card="levels"] .an2-face');
    expect(face).toContain('Lean is 2026’s until you set 2027’s');
  });

  test('Z8: in the 2027 view a line’s average, leanest and room are 2026’s, labelled', async ({
    page,
  }) => {
    // Loading 2027 makes the app's quiet writes (to the in-memory fake only).
    await openStack(page, { allowWrites: true });
    await view2027(page);
    await page.locator('[data-an2-card="levels"] .an2-more').click();
    const g = (
      await page.locator('[data-an2-card="levels"] .an2-frow[data-cat="groceries"]').innerText()
    ).replace(/\s+/g, ' ');
    expect(g).toMatch(/2026’s average ₪[1-9][\d,]*/);
    expect(g).not.toMatch(/average ₪0/);
    expect(g).not.toContain('room −₪1,800');
    const all = (await page.locator('[data-an2-card="levels"] .an2-frow').allInnerTexts()).join(
      '|',
    );
    expect(all).not.toMatch(/(?<!2026’s )average/);
    // Room is 2026's average against the Lean line, not 2027's empty months.
    const avg = await page.evaluate(
      () => window.buildStackCtx().base.r.cats.find((c) => c.key === 'groceries').avg,
    );
    const lean = await page.evaluate(
      () => window.buildStackCtx().levels.find((l) => l.key === 'lean').lines.groceries,
    );
    const room = Math.round(avg - lean);
    expect(g).toContain(
      'room ' + (room < 0 ? '−' : '+') + '₪' + Math.abs(room).toLocaleString('en-US'),
    );
  });

  // ── Z3 · the four results stay above the fold in every ordinary state ───────
  const resultBottoms = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('#an2-left-value, .an2-lv-res')].map((e) => ({
        id: e.id || e.parentElement.dataset.level,
        bottom: Math.round(e.getBoundingClientRect().bottom + window.scrollY),
      })),
    );
  const expectAboveFold = async (page, state) => {
    const b = await resultBottoms(page);
    expect(b.length, state).toBe(5);
    for (const x of b) expect(x.bottom, state + ' ' + JSON.stringify(x)).toBeLessThanOrEqual(600);
    test.info().annotations.push({
      type: 'bottoms ' + state,
      description: Math.max(...b.map((x) => x.bottom)) + ' px',
    });
  };
  const toMonth = async (page, n) => {
    await page.evaluate(async (num) => {
      const m = window.state.months.find((x) => x.month_num === num);
      await window.switchMonth(m.id);
    }, n);
    await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
    await page.evaluate(() => window.switchTab('analyze'));
  };

  test('Z3: Budget tab on November with the soft-line flag - the four results end at or above 600 px', async ({
    page,
  }) => {
    await openStack(page);
    await toMonth(page, 11);
    await expectAboveFold(page, 'november');
    await page.evaluate(() => window.setAnalyzeOneOff('40000'));
    await expect(page.locator('.an2-lv[data-level="middle"] .an2-lv-cash')).toContainText(
      'under ~',
    );
    await expectAboveFold(page, 'november + soft line');
  });

  test('Z3: viewing 2027 during 2026 - the four results end at or above 600 px', async ({
    page,
  }) => {
    await openStack(page, { allowWrites: true });
    await view2027(page);
    await expect(page.locator('.an2-lv[data-level="lean"] .an2-lv-spend')).toContainText('2026’s');
    await expectAboveFold(page, '2027 view');
    await page.evaluate(() => window.setAnalyzeOneOff('40000'));
    await expectAboveFold(page, '2027 view + what-if');
  });

  // S4: the 2027 view, truly COLLAPSED (no card open), on the plain and the agorot seed. A card left
  // open in the 2026 view stays open after the year switch (open/closed is view state), which pushes
  // the results to 779 px - that is an open card, not a longer label.
  for (const agorot of [false, true]) {
    test(
      'S4: 2027 view collapsed - the four results end at or above 600 px (' +
        (agorot ? 'agorot' : 'plain') +
        ' seed)',
      async ({ page, db }) => {
        if (agorot) allAgorot(db);
        await openStack(page, { allowWrites: true });
        await view2027(page);
        expect(
          await page.locator('[data-an2-toggle][aria-expanded="true"]').count(),
          'nothing is open',
        ).toBe(0);
        await expectAboveFold(page, '2027 collapsed ' + (agorot ? 'agorot' : 'plain'));
        const b = await resultBottoms(page);
        expect(Math.max(...b.map((x) => x.bottom))).toBeLessThanOrEqual(600);
        // The state the last checker measured: a card left open before switching year.
        await page.evaluate(() => window.switchYear(2026));
        await page.waitForFunction(
          () => window.state.currentYear === 2026 && !window.state.loading,
        );
        await page.locator('[data-an2-card="left"] .an2-more').click();
        await view2027(page);
        const open = await resultBottoms(page);
        expect(
          Math.max(...open.map((x) => x.bottom)),
          'an open 💰 card pushes them down',
        ).toBeGreaterThan(600);
      },
    );
  }

  test('Z3: default and what-if stay above 600 px, and text stays 12 px, taps 44 px', async ({
    page,
  }) => {
    await openStack(page);
    await expectAboveFold(page, 'default');
    await page.evaluate(() => window.setAnalyzeOneOff('40000'));
    await expectAboveFold(page, 'what-if');
    const small = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.an2-levels-grid *, #an2-left *')) {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 12) bad.push(el.className);
      }
      for (const t of document.querySelectorAll('.an2-lv'))
        if (t.getBoundingClientRect().height < 44) bad.push('tap ' + t.dataset.level);
      return bad;
    });
    expect(small).toEqual([]);
  });

  // ── Z5 · the 🧾 "your way" gap, split ─────────────────────────────────────
  test('Z5: 🧾 your way - the gap is split in plain words and the two parts add to it', async ({
    page,
  }) => {
    await openStack(page);
    const face = await text(page, '[data-an2-card="year"] .an2-face');
    const m = face.match(
      /your way \(income − savings\): ₪([\d,]+) · ₪([\d,]+) more than real spend: ₪([\d,]+) income not yet budgeted \+ ₪([\d,]+) budgeted, not spent/,
    );
    expect(m, face).not.toBeNull();
    const [yourWay, gap, job, unspent] = m.slice(1).map((x) => Number(x.replace(/,/g, '')));
    expect(job + unspent).toBe(gap);
    // Fake seed: ₪21,000 in - ₪1,500 saved = ₪19,500; real spend ₪7,983; Left to Budget ₪8,100.
    expect(yourWay).toBe(19500);
    expect(job).toBe(8100);
    expect(gap).toBe(11517);
    expect(unspent).toBe(3417);
    const real = Number((face.match(/₪([\d,]+) a month real spend/) || [])[1].replace(/,/g, ''));
    expect(yourWay - real).toBe(gap);
    // Every number on the face is in the detail.
    await page.locator('[data-an2-card="year"] .an2-more').click();
    const detail = await text(page, '[data-an2-card="year"] .an2-detail');
    for (const x of [gap, job, unspent]) expect(detail).toContain('₪' + x.toLocaleString('en-US'));
  });

  // W4: the split is right on every window pill. "Budgeted, not spent" is budget minus the
  // real-spend figure, so months still ahead (counted at their budget) add nothing to it.
  test('W4: 🧾 the split adds up and never says “given a job” on every window', async ({
    page,
  }) => {
    await openStack(page);
    const seen = {};
    for (const w of [0, 3, 6, -1]) {
      await page.evaluate((n) => window.setAnalyzeAvgWindow(n), w);
      const face = await text(page, '[data-an2-card="year"] .an2-face');
      expect(face, 'window ' + w).not.toMatch(/given a job/);
      const m = face.match(
        /your way \(income − savings\): ₪([\d,]+) · ₪([\d,]+) (more|less) than real spend(?:: ₪([\d,-]+) income not yet budgeted \+ ₪([\d,-]+) budgeted, not spent| \(you spent more than you budgeted\))?( · .*rounding)?/,
      );
      expect(m, face).not.toBeNull();
      if (m[4] !== undefined) {
        const n = (x) => Number(x.replace(/,/g, ''));
        // Each part prints its own rounding; the caption ends with a rounding marker exactly
        // when they do not add to the gap (the detail has the rounding row).
        const adds = n(m[4]) + n(m[5]) === n(m[2]);
        if (adds) expect(m[6] || '', 'window ' + w).not.toMatch(/and/);
        expect(n(m[4]), 'parts are never negative').toBeGreaterThanOrEqual(0);
        expect(n(m[5])).toBeGreaterThanOrEqual(0);
      }
      seen[w] = face.replace(/^.*your way/, 'your way');
    }
    console.log('W4 windows', JSON.stringify(seen, null, 1));
    // Whole year on the fake seed: income not yet budgeted + budgeted-not-spent.
    expect(seen[-1]).toMatch(/₪8,100 income not yet budgeted \+ ₪2,563 budgeted, not spent/);
  });

  // ── V3a · the 📅 envelope rows, "What moved" and 🪜 "your pace now" print ONE pace ────
  // Each envelope row is roundZ(its true pace) - apportioning the everyday rounding onto a row
  // makes it read a shekel off the "What moved" line (same key) and off the true pace here.
  test('V3a: 📅 each envelope row is its own rounding of the pace, and "What moved" prints the same', async ({
    page,
    db,
  }) => {
    allAgorot(db);
    // Groceries ran hot in the last two complete months, so its pace moves against the average.
    for (const t of db.table('transactions'))
      if (t.category === 'groceries' && /0[89a]$/.test(t.month_id)) t.amount += 300.37;
    await openStack(page, { allowWrites: true });
    await page.locator('[data-an2-card="month"] .an2-more').click();
    const want = await page.evaluate(async () => {
      const { monthNow, billsMonthFor } = await import('/dist/lib/analyze.js');
      const ctx = window.buildStackCtx();
      const rules = ctx.text.MONTH_NOW_RULES[ctx.base.year] || { fromMonth: {}, zero: [] };
      const mNow = monthNow(ctx.base.r, {
        billsMonth: billsMonthFor(ctx.base.r.summary.referenceMonth),
        recentN: 6,
        fromMonth: rules.fromMonth,
        zero: rules.zero,
      });
      const r0 = (x) => (Math.round(x) === 0 ? 0 : Math.round(x));
      return Object.fromEntries(Object.entries(mNow.byCat).map(([k, v]) => [k, r0(v)]));
    });
    const prints = await page.evaluate(() =>
      [...document.querySelectorAll('[data-qty^="pace:"]')].map((e) => ({
        key: e.dataset.qty,
        text: e.textContent,
      })),
    );
    expect(prints.length).toBeGreaterThan(6);
    for (const p of prints)
      expect(digits(p.text), p.key).toBe(want[p.key.replace('pace:2026:', '')]);
    // Groceries prints on its envelope row AND in "What moved": two prints of one number.
    expect(prints.filter((p) => p.key === 'pace:2026:groceries').length).toBe(2);
  });

  // ── V3b · the 🧾 split, both parts, against the months (not against the page) ──────
  // Income not yet budgeted = roundZ(true gap − true unspent) and budgeted-not-spent =
  // roundZ(true unspent): each its own rounding. A split that apportions one onto the other
  // (not yet budgeted = shown gap − shown unspent) reads one shekel off on some window.
  test('V3b: 🧾 the split is each part rounded on its own, on every window (agorot everywhere)', async ({
    page,
    db,
  }) => {
    allAgorot(db);
    await openStack(page, { allowWrites: true });
    const n = (x) => Number(x.replace(/,/g, ''));
    let compared = 0;
    for (const w of [0, 3, 6, -1]) {
      await page.evaluate((k) => window.setAnalyzeAvgWindow(k), w);
      const want = await page.evaluate(() => {
        const r = window.buildStackCtx().base.r;
        const set = new Set(r.summary.avgMonths);
        const ms = r.months.filter((m) => set.has(m.month_num));
        const avg = (f) => ms.reduce((a, m) => a + f(m), 0) / ms.length;
        const gap =
          avg((m) => m.income) -
          avg((m) => m.savings) -
          (avg((m) => m.fixed) +
            avg((m) => m.envelope) +
            avg((m) => m.pots) +
            avg((m) => m.charity));
        const unspent = avg((m) => m.envelopeBudget - m.envelope);
        const r0 = (x) => (Math.round(x) === 0 ? 0 : Math.round(x));
        return { notBudgeted: r0(gap - unspent), unspent: r0(unspent), gap: r0(gap) };
      });
      const face = await text(page, '[data-an2-card="year"] .an2-face');
      const m = face.match(/₪([\d,-]+) income not yet budgeted \+ ₪([\d,-]+) budgeted, not spent/);
      if (want.gap < 50 || !m) continue; // not a split on this window
      compared++;
      expect(n(m[1]), 'face, window ' + w).toBe(want.notBudgeted);
      expect(n(m[2]), 'face, window ' + w).toBe(want.unspent);
      if (!(await page.locator('[data-an2-card="year"] .an2-detail').count()))
        await page.locator('[data-an2-card="year"] .an2-more').click();
      const detail = await text(page, '[data-an2-card="year"] .an2-detail');
      const d1 = detail.match(/Income not yet budgeted ₪([\d,-]+)/);
      const d2 = detail.match(/Budgeted for an everyday envelope, not spent ₪([\d,-]+)/);
      expect(n(d1[1]), 'detail, window ' + w).toBe(want.notBudgeted);
      expect(n(d2[1]), 'detail, window ' + w).toBe(want.unspent);
    }
    expect(compared, 'windows where the gap splits').toBeGreaterThan(1);
  });

  // ── V3c · the what-if is whole shekels the moment it is typed, on a value that shows it ──
  test('V3c: a what-if of ₪0.60 is ₪1 - Left now is the Cash tab’s ₪1,000 minus 1, not minus 0.60', async ({
    page,
    db,
  }) => {
    const cash = db.table('cash_accounts');
    cash[0].amount = 1000.4;
    cash[1].amount = 0;
    cash[2].amount = 0;
    await openStack(page, { allowWrites: true });
    await page.evaluate(() => window.setAnalyzeOneOff('0.6'));
    // Raw: 1,000.4 − 0.6 = 999.8 → ₪1,000. Whole at entry: ₪1,000 (the Cash tab) − ₪1 = ₪999.
    expect(digits(await text(page, '#an2-cash-now'))).toBe(999);
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    expect(await page.locator('#an2-oneoff').inputValue()).toBe('1');
    // 1,000.5 stays the half that rounds up, and a what-if of 1,000.5 is ₪1,001 (not 1,000.5).
    await page.evaluate(() => window.setAnalyzeOneOff('1000.5'));
    expect(await page.locator('#an2-oneoff').inputValue()).toBe('1001');
    expect(digits(await text(page, '#an2-cash-now'))).toBe(-1); // ₪1,000 − ₪1,001
  });

  // ── V5 · a SHORT result is one signed figure on three cards ──────────────────────
  // 🧭 tile, 🧭 "The result" row and 💼 "At your levels" print the same result; when it is
  // negative the 💼 line says "short ₪N" (a positive number): data-qty-sign reads it as −N.
  test('V5: a short Lean result reads −N on the tile, the result row and as “short N” on 💼', async ({
    page,
    db,
  }) => {
    const g = db.table('spend_floors').find((f) => f.year === 2026 && f.category === 'groceries');
    Object.assign(g, { amount: 30000 });
    await openStack(page, { allowWrites: true });
    await page.locator('.an2-lv[data-level="lean"]').click();
    await page.locator('[data-an2-card="income"] .an2-more').click();
    const prints = await page.evaluate(() =>
      [...document.querySelectorAll('[data-qty~="planres:low:lean:se0"]')].map((e) => {
        const m = e.textContent.match(/([−-])?\s*₪?\s*([\d,]+)/);
        const n = Number(m[2].replace(/,/g, ''));
        const neg = !!m[1] || e.dataset.qtySign === '-';
        return { text: e.textContent.trim(), v: neg ? -n : n, signAttr: e.dataset.qtySign || '' };
      }),
    );
    expect(prints.length).toBeGreaterThanOrEqual(3);
    expect(prints[0].v).toBeLessThan(0);
    expect(new Set(prints.map((p) => p.v)).size, JSON.stringify(prints)).toBe(1);
    expect(prints.some((p) => p.signAttr === '-')).toBe(true); // the 💼 “short N”
  });

  // ── U3 · 🧾 never says “the Year tab says” a number the Year tab does not print ─────────
  test('U3: the bridge starts from the Year tab’s own Total Used: ₪9,254 − savings ₪1,500 = ₪7,754', async ({
    page,
  }) => {
    await openStack(page);
    await page.locator('[data-an2-card="year"] .an2-more').click();
    const d = await text(page, '[data-an2-card="year"] .an2-detail');
    expect(d.toLowerCase()).toContain(
      'the year tab (full year, projected) says total used ₪9,254 a month — savings included',
    );
    expect(d).toMatch(/Year tab · Total Used, all 12 months ÷ 12 ₪9,254/);
    expect(d).toMatch(/− your savings, all 12 months ÷ 12 ₪1,500/);
    expect(d).toMatch(/= without savings \(what this card compares\) ₪7,754/);
    expect(d).not.toMatch(/the year tab says ₪/i);
  });

  // ── S1 · the 💵 Admin subtotal is “still to pay”, with its OWN key ──────────────────────
  // Cash still to go out: each item's max(0, planned − paid), crumbs under ₪1 dropped. The Admin
  // tab's Remaining is budget − everything paid (an overpaid item offsets another), a different
  // quantity - so the subtotal makes no claim about that tab and shares no key with it.
  test('S1: 💵 “of these, Admin items still to pay” - an overpaid item adds nothing, no claim about the Admin tab', async ({
    page,
    db,
  }) => {
    const course = db.table('admin_items').find((i) => i.label === 'Course fees');
    // Course fees planned ₪1,200, paid ₪1,250: overpaid by ₪50.
    db.table('admin_sub_items').push({
      id: 'sub-over',
      item_id: course.id,
      label: 'Fee',
      amount: 1250,
      is_paid: true,
      month_num: 5,
    });
    await openStack(page, { allowWrites: true });
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const row = page.locator('[data-an2-card="cash"] .an2-row-subtotal');
    await expect(row).toHaveCount(1);
    const t = (await row.innerText()).replace(/\s+/g, ' ');
    expect(t).toContain('of these, Admin items still to pay');
    expect(t).toContain('₪100');
    expect(t).not.toMatch(/Remaining/);
    // Course fees is not listed (nothing left to pay); Postage is the whole subtotal.
    const detail = await text(page, '[data-an2-card="cash"] .an2-detail');
    expect(detail).not.toMatch(/Course fees ₪/);
    // The Admin tab's own number is another quantity: the stack row shares no key with it.
    expect(await page.locator('[data-qty="admindue:2026"]').count()).toBe(1);
    expect(await page.locator('[data-qty^="adminremaining"]').count()).toBe(0);
    // The Admin tab keeps its own tag (the cross test below visits it): budget − everything paid.
    await page.evaluate(() => window.switchTab('admin'));
    await page.waitForSelector('[data-qty="adminremaining:2026"]', { timeout: 30000 });
    expect(digits(await text(page, '[data-qty="adminremaining:2026"]'))).toBe(50); // 1,900 − 1,850
  });

  // ── S2 · the subtotal row looks like a subtotal ─────────────────────────────────────────
  test('S2: the Admin subtotal is indented, dim, ruled off, 12 px or more, and not a part of the pots-due sum', async ({
    page,
  }) => {
    await openStack(page, { allowWrites: true });
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const look = await page.evaluate(() => {
      const sub = document.querySelector('.an2-row-subtotal');
      const item = [...document.querySelectorAll('[data-an2-card="cash"] .an2-row-sub')].find((r) =>
        /Course fees/.test(r.textContent),
      );
      const cs = getComputedStyle(sub);
      const ci = getComputedStyle(item);
      return {
        indent: parseFloat(cs.marginLeft) - parseFloat(ci.marginLeft),
        rule: cs.borderTopStyle + ' ' + cs.borderTopWidth,
        size: parseFloat(cs.fontSize),
        color: cs.color,
        itemColor: ci.color,
        inSum: !!sub.querySelector('[data-sum-group="pots-due"]'),
      };
    });
    expect(look.indent).toBeGreaterThan(8);
    expect(look.rule).toMatch(/solid 1px/);
    expect(look.size).toBeGreaterThanOrEqual(12);
    expect(look.inSum, 'the subtotal is not a part of the pots-due sum').toBe(false);
  });

  // ── R1 · the 💵 Admin subtotal is a sum of its own: lines as printed + a rounding row = subtotal ──
  for (const agorot of [false, true]) {
    test(
      'R1: 💵 Admin still-to-pay subtotal adds up as shown (' +
        (agorot ? 'agorot' : 'plain') +
        ' seed)',
      async ({ page, db }) => {
        if (agorot) allAgorot(db);
        await openStack(page, { allowWrites: true });
        await page.locator('[data-an2-card="cash"] .an2-more').click();
        const parts = await page.evaluate(() =>
          [...document.querySelectorAll('[data-sum-group="admindue-2026"][data-part]')].map((e) =>
            e.textContent.trim(),
          ),
        );
        const totals = await page.evaluate(() =>
          [...document.querySelectorAll('[data-sum-group="admindue-2026"][data-total]')].map((e) =>
            e.textContent.trim(),
          ),
        );
        const num = (t) => digits(t);
        expect(totals.length, 'one subtotal').toBe(1);
        const sum = parts.map(num).reduce((a, b) => a + b, 0);
        expect(sum, 'parts ' + parts.join(' + ') + ' = ' + totals[0]).toBe(num(totals[0]));
        const cash = await text(page, '[data-an2-card="cash"] .an2-detail');
        if (agorot) {
          // Each Admin line prints its own rounding (₪1,200 + ₪100 + ₪20 = ₪1,320); the subtotal is the
          // true sum rounded once (₪1,321); the visible row closes the ₪1.
          expect(totals[0]).toBe('₪1,321');
          expect(cash).toMatch(/agorot, rounded \+₪1 of these, Admin items still to pay ₪1,321/);
        } else {
          expect(totals[0]).toBe('₪1,300');
          expect(cash).not.toMatch(/rounded[^₪]*₪[^ ]* of these, Admin items/);
          expect(cash).toMatch(/of these, Admin items still to pay ₪1,300/);
        }
        // The subtotal is not a part of the trips & one-offs sum: that sum's parts are the lines only.
        const inPots = await page.evaluate(
          () =>
            [...document.querySelectorAll('[data-sum-group="pots-due"][data-part]')].filter((e) =>
              e.closest('.an2-row-subtotal'),
            ).length,
        );
        expect(inPots).toBe(0);
      },
    );
  }

  // ── T2 (restored) · the exact marker words on the seed state where it shows ──────────────────────
  test('T2: marker words - agorot seed, Jan–Sep: “±₪1 rounding in 2 sums” on 🧾; plain seed Apr–Sep: “±₪1 rounding”', async ({
    page,
    db,
  }) => {
    allAgorot(db);
    await openStack(page, { allowWrites: true });
    await page.evaluate(() => window.setAnalyzeAvgWindow(0));
    const yr = await text(page, '[data-an2-card="year"] .an2-face');
    expect(yr).toContain(' · ±₪1 rounding in 2 sums');
    expect(yr).not.toMatch(/ and /);
    expect(await text(page, '[data-an2-card="month"] .an2-face')).toContain(' · ±₪1 rounding');
    expect(await text(page, '[data-an2-card="bills"] .an2-face')).toContain(' · ±₪1 rounding');
  });

  // ── V7 · what the rounding row is called ─────────────────────────────────────────
  // ── U1 · no “≈” on a face; one “· ±₪N rounding” marker when shown parts ≠ shown total ──────
  // Faces that list parts: 📅 (bills… + trips), 🏠 (its categories), 🧾 (your way, the gap, its
  // split). Every figure prints plain, and the caption ends with the marker EXACTLY when the
  // shown parts do not add to the shown total, N = the shown difference.
  const faceChecks = (faces, label) => {
    const n = (x) => Number(String(x).replace(/,/g, ''));
    const marks = {};
    for (const f of faces) {
      if (!['month', 'bills', 'year'].includes(f.card)) continue;
      expect(f.t, label + ' ' + f.card).not.toContain('≈');
    }
    // 📅
    const mo = faces.find((f) => f.card === 'month').t;
    const m1 = mo.match(
      /₪([\d,]+) a month ₪([\d,]+) bills, everyday and charity \+ ₪([\d,]+) trips/,
    );
    if (m1) {
      const diff = Math.abs(n(m1[2]) + n(m1[3]) - n(m1[1]));
      const mk = mo.match(/±₪([\d,]+) rounding/);
      expect(mk ? n(mk[1]) : 0, label + ' 📅 ' + mo).toBe(diff);
      marks.month = diff;
    }
    // 🏠
    const bi = faces.find((f) => f.card === 'bills').t;
    const total = n((bi.match(/₪([\d,]+) a month/) || [])[1]);
    const cats = [...bi.matchAll(/(?:housing|recurring|[a-z ]+) ₪([\d,]+)/g)]
      .map((x) => n(x[1]))
      .slice(1);
    if (cats.length) {
      const diff = Math.abs(cats.reduce((a, b) => a + b, 0) - total);
      const mk = bi.match(/±₪([\d,]+) rounding/);
      expect(mk ? n(mk[1]) : 0, label + ' 🏠 ' + bi).toBe(diff);
      marks.bills = diff;
    }
    // 🧾
    const yr = faces.find((f) => f.card === 'year').t;
    const real = n((yr.match(/₪([\d,]+) a month real spend/) || [])[1]);
    const way = yr.match(
      /your way \(income − savings\): ₪([\d,]+)(?: ✓)?(?: · ₪([\d,]+) (more|less) than real spend)?/,
    );
    if (way && way[2]) {
      const gap = way[3] === 'more' ? n(way[2]) : -n(way[2]);
      const want = [Math.abs(n(way[1]) - real - gap)];
      const sp = yr.match(/₪([\d,-]+) income not yet budgeted \+ ₪([\d,-]+) budgeted, not spent/);
      if (sp) want.push(Math.abs(n(sp[1]) + n(sp[2]) - gap));
      // T2: ONE marker saying how many sums are off: “±₪N rounding” (one sum), “±₪N rounding in
      // K sums” (K sums, each N), “rounding in K sums (up to ±₪M)” (K sums, different amounts).
      const nz = want.filter((d) => d > 0);
      const fmt = (d) => '±₪' + d.toLocaleString('en-US');
      const exp = !nz.length
        ? null
        : nz.length === 1
          ? fmt(nz[0]) + ' rounding'
          : nz.every((d) => d === nz[0])
            ? fmt(nz[0]) + ' rounding in ' + nz.length + ' sums'
            : 'rounding in ' + nz.length + ' sums (up to ' + fmt(Math.max(...nz)) + ')';
      const found = yr.match(
        / · (±₪[\d,]+ rounding(?: in \d+ sums)?|rounding in \d+ sums \(up to ±₪[\d,]+\))/,
      );
      expect(found ? found[1] : null, label + ' 🧾 ' + yr).toBe(exp);
      expect((yr.match(/rounding/g) || []).length, 'one marker only').toBeLessThanOrEqual(1);
      marks.year = want;
    }
    return marks;
  };
  const readFaces = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-an2-card] .an2-face')].map((f) => ({
        card: f.closest('[data-an2-card]').dataset.an2Card,
        // The “≈” on the Carmei Gat / tax lines marks a real ESTIMATE (they carry the estimate chip),
        // not a rounding: they are left out; every other figure on a face must be plain.
        t: [...f.childNodes]
          .filter((c) => !(c.classList && c.classList.contains('an2-est')))
          .map((c) => c.innerText || c.textContent)
          .join(' ')
          .replace(/\s+/g, ' '),
      })),
    );
  for (const seed of ['plain', 'agorot']) {
    test(
      'U1: no “≈” on a face and the rounding marker is exact (' + seed + ' seed, all windows)',
      async ({ page, db }) => {
        if (seed === 'agorot') allAgorot(db);
        await openStack(page, { allowWrites: true });
        let markers = 0;
        for (const w of [0, 3, 6, -1]) {
          await page.evaluate((k) => window.setAnalyzeAvgWindow(k), w);
          const marks = faceChecks(await readFaces(page), seed + ' w' + w);
          markers += Object.values(marks)
            .flat()
            .filter((d) => d > 0).length;
        }
        // A marker that never appeared would pass vacuously.
        expect(markers, seed + ' seed shows at least one marker').toBeGreaterThan(0);
      },
    );
  }

  // ── S3 · the “you spent more than you budgeted” branch of the 🧾 face ────────────────────
  // Income is cut to ₪0 so your way (income − savings) falls below real spend: the gap is NEGATIVE
  // and the face says “less than real spend (you spent more than you budgeted)”. The marker must
  // appear exactly when your way − real spend is not the printed gap.
  for (const agorot of [false, true]) {
    test(
      'S3: negative gap - the rounding marker is exact (' +
        (agorot ? 'agorot' : 'plain') +
        ' seed)',
      async ({ page, db }) => {
        if (agorot) allAgorot(db);
        for (const m of db.table('months'))
          Object.assign(m, {
            income_petachya: 0,
            income_clalit: 0,
            income_private: 0,
            income_other: 0,
          });
        for (const i of db.table('income_items')) i.amount = 0;
        await openStack(page, { allowWrites: true });
        let overFaces = 0;
        let markers = 0;
        for (const w of [0, 3, 6, -1]) {
          await page.evaluate((k) => window.setAnalyzeAvgWindow(k), w);
          const faces = await readFaces(page);
          const yr = faces.find((f) => f.card === 'year').t;
          const n = (x) => Number(String(x).replace(/,/g, ''));
          const m = yr.match(
            /your way \(income − savings\): (−?)₪([\d,]+)[^·]*· ₪([\d,]+) less than real spend \(you spent more than you budgeted\)( · ±₪([\d,]+) rounding)?/,
          );
          if (!m) continue;
          overFaces++;
          const real = n((yr.match(/₪([\d,]+) a month real spend/) || [])[1]);
          const way = (m[1] ? -1 : 1) * n(m[2]);
          const printedGap = -n(m[3]); // “less than”: the gap is negative
          const diff = Math.abs(way - real - printedGap);
          expect(m[4] ? n(m[5]) : 0, 'window ' + w + ': ' + yr).toBe(diff);
          if (diff) markers++;
          expect((yr.match(/rounding/g) || []).length).toBeLessThanOrEqual(1);
        }
        expect(overFaces, 'the negative-gap face is reached').toBeGreaterThan(0);
        // On the agorot seed at least one window really is off, so the marker is not vacuous.
        if (agorot) expect(markers, 'a marker shows in the negative-gap face').toBeGreaterThan(0);
      },
    );
  }

  test('V7: the rounding row says “rounding” when the gap comes from averages, “agorot, rounded” when from agorot', async ({
    page,
    db,
  }) => {
    allAgorot(db);
    await openStack(page, { allowWrites: true });
    await openEverything(page);
    const rowsOf = (card) =>
      page.evaluate(
        (c) =>
          [
            ...document.querySelectorAll(
              '[data-an2-card="' + c + '"] .an2-row-sub span:first-child',
            ),
          ]
            .map((e) => e.textContent.trim())
            .filter((t) => /^(rounding|agorot, rounded)/.test(t)),
        card,
      );
    // (🧭 and 💼 mix both kinds: the Lean floors and the income months really carry agorot.)
    const avgCards = ['month', 'year'];
    const seen = [];
    for (const c of avgCards) {
      const r = await rowsOf(c);
      seen.push(...r);
      expect(
        r.filter((t) => t.startsWith('agorot, rounded')),
        c + ' is from averages',
      ).toEqual([]);
    }
    expect(seen.length, 'some averaged card needed a rounding row').toBeGreaterThan(0);
    expect(seen.every((t) => t.startsWith('rounding'))).toBe(true);
    // Agorot in her data keep the old words.
    expect(
      (await rowsOf('cash'))
        .concat(await rowsOf('left'))
        .some((t) => t.startsWith('agorot, rounded')),
    ).toBe(true);
  });

  // ── Z7 · "KH" is spelled out where the stack first prints it ──────────────
  test('Z7: the first "KH" on the stack is spelled out as keren hishtalmut (KH)', async ({
    page,
  }) => {
    await openStack(page);
    await openEverything(page);
    const all = await page.locator('.an2-wrap').innerText();
    const first = all.indexOf('KH');
    expect(first, 'the stack prints KH somewhere (the school lines)').toBeGreaterThan(-1);
    expect(all.indexOf('keren hishtalmut (KH)') + 'keren hishtalmut ('.length).toBe(first);
  });

  // ── Z9 · Bills in a year that has only January ────────────────────────────
  test('Z9: 🏠 Bills in 2027 - not ₪0, and no “per year” figure made from January alone', async ({
    page,
  }) => {
    await openStack(page, { allowWrites: true });
    // 2026 has its 12 months: a per-year figure is a year.
    await page.locator('[data-an2-card="bills"] .an2-more').click();
    expect(await text(page, '[data-an2-card="bills"] .an2-detail')).toContain('₪36,000/yr');
    await view2027(page);
    const face = await text(page, '[data-an2-card="bills"] .an2-face');
    expect(face).toMatch(/₪[1-9][\d,]* a month/);
    expect(face).not.toMatch(/₪0 a month/);
    await openEverything(page, '[data-an2-card="bills"]');
    const detail = await text(page, '[data-an2-card="bills"] .an2-detail');
    expect(detail).not.toMatch(/₪[\d,]+\/yr/);
    expect(detail).toContain('Jan only so far');
  });

  // ── Z10 · values pinned on the fake seed ──────────────────────────────────
  test('Z10: the ₪ faces of 📅 🧾 🏠 ✈️📋 on the fake seed, and 🏠 is not ₪0 in 2027', async ({
    page,
  }) => {
    await openStack(page, { allowWrites: true });
    const face = (k) => text(page, `[data-an2-card="${k}"] .an2-face`);
    const month = await face('month');
    expect(month).toContain('₪9,191 a month');
    expect(month).toContain('₪7,091 bills, everyday and charity + ₪2,101 trips & one-offs');
    expect(month).toContain('· ±₪1 rounding'); // 7,091 + 2,101 = 9,192 vs the true 9,191: the detail has the −₪1 row
    expect(month).toContain('Carmei Gat ≈ −₪86 a month (−₪336 with upkeep)');
    expect(month).toContain('Set aside for tax on private ≈ ₪260 a month');
    const year = await face('year');
    expect(year).toContain('₪7,983 a month real spend');
    expect(year).toContain('saved ₪1,500 a month, 7% of what came in · Jan–Sep');
    expect(year).toContain('your way (income − savings): ₪19,500');
    const bills = await face('bills');
    expect(bills).toContain('₪4,650 a month');
    expect(bills).toContain('housing ₪3,500 · recurring payments ₪1,150');
    const pots = await face('pots');
    expect(pots).toContain('₪6,100 → ₪39,761');
    await view2027(page);
    const bills27 = await face('bills');
    expect(bills27).toContain('₪4,300 a month');
    expect(bills27).not.toMatch(/₪0 a month/);
  });

  // ── Z10 · D19 wording on the stack ────────────────────────────────────────
  test('Z10: an unset Lean line says it uses the suggestion, and nothing says it counts as ₪0', async ({
    page,
  }) => {
    await openStack(page);
    await openEverything(page);
    const all = await page.locator('.an2-wrap').innerText();
    expect(all).toContain('they use the suggestion');
    expect(all).toContain('not set — uses the suggestion (');
    expect(all).not.toMatch(/counts? as ₪0|counted as ₪0/);
  });

  // ── Z11 · small words ─────────────────────────────────────────────────────
  test('Z11: the Feb 7 January fill names bills as “this month’s bills” and only envelopes as “your pace now”; Carmei Gat has its own icon', async ({
    page,
    db,
  }) => {
    db.table('budget_item_templates').length = 0; // no usual bills: January falls back to this month's
    await openStack(page);
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const jan = (
      await page
        .locator('[data-an2-card="cash"] .an2-row', { hasText: 'Jan 2027' })
        .first()
        .innerText()
    ).replace(/\s+/g, ' ');
    const bills = jan.match(/used this month’s bills: ([^·]*?)(?= · |estimate|$)/);
    expect(bills, jan).not.toBeNull();
    expect(bills[1]).toContain('Housing');
    expect(bills[1]).not.toContain('Groceries');
    const pace = jan.match(/used your pace now: ([^·]*?)(?= · |estimate|$)/);
    expect(pace, jan).not.toBeNull();
    expect(pace[1]).toContain('Groceries');
    expect(pace[1]).not.toContain('Housing');
    expect(pace[1]).not.toContain('Recurring');
    // 📅 Carmei Gat is 🏘️, not the 🏠 of Bills - on the face and in the detail.
    await page.locator('[data-an2-card="month"] .an2-more').click();
    const monthCard = await page.locator('[data-an2-card="month"]').innerText();
    expect(monthCard).toContain('🏘️ Carmei Gat');
    expect(monthCard).not.toContain('🏠 Carmei Gat');
  });
});

// ── W2 · the page-wide invariant: every sum on the stack adds up as shown ───
// Every number the stack prints beside its parts is wrapped in a span carrying
// data-sum-group ("part" or "total"; data-sign="-" = printed with a minus in front of
// a positive number). This walks the WHOLE page and, for every group, adds the shown
// parts and compares them with the shown total(s). Three rounds of review found the
// same bug in a new card each time; this is the test that finds the next one.
const readGroups = (page) =>
  page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.an2-wrap [data-sum-group]').forEach((el) => {
      let t = el.tagName === 'INPUT' ? el.value || el.placeholder : el.textContent;
      if (!String(t).trim()) {
        const i = el.querySelector('input');
        if (i) t = i.value || i.placeholder;
      }
      const m = String(t).match(/([−-])?\s*₪?\s*([\d,]+(?:\.\d+)?)/);
      const n = m ? Number(m[2].replace(/,/g, '')) * (m[1] ? -1 : 1) : NaN;
      const g = (out[el.dataset.sumGroup] ||= { parts: [], totals: [], texts: [] });
      const signed = el.dataset.sign === '-' ? -n : n;
      if ('part' in el.dataset) g.parts.push(signed);
      else g.totals.push(n);
      g.texts.push(
        ('part' in el.dataset ? 'part ' : 'total ') + (el.dataset.sign || '') + String(t).trim(),
      );
    });
    return out;
  });

function badGroups(groups, requireParts) {
  const bad = [];
  for (const [id, g] of Object.entries(groups)) {
    if ([...g.parts, ...g.totals].some((x) => Number.isNaN(x)))
      bad.push(id + ': unreadable ' + g.texts);
    if (!g.totals.length) bad.push(id + ': parts but no total ' + g.texts);
    else if (!g.parts.length) {
      if (requireParts && g.totals.some((t) => t !== 0))
        bad.push(id + ': total but no parts ' + g.texts);
      if (new Set(g.totals).size > 1) bad.push(id + ': the copies of its total differ ' + g.totals);
    } else {
      const sum = g.parts.reduce((a, b) => a + b, 0);
      for (const t of g.totals)
        if (t !== sum)
          bad.push(
            id + ': shown parts add to ' + sum + ' but the total shows ' + t + ' · ' + g.texts,
          );
    }
  }
  return bad;
}

// Switch the viewed year and wait until the stack has everything for it.
async function goYear(page, y) {
  await page.evaluate((yy) => window.switchYear(yy), y);
  await page.waitForFunction(
    (yy) =>
      window.state.currentYear === yy &&
      !window.state.loading &&
      window.state.floors &&
      window.state.potsCmp &&
      window.state.potsCmp.years[0] === yy &&
      window.state.feb7Status === 'ready' &&
      document.querySelector('.an2-wrap[data-year="' + yy + '"]'),
    y,
    { timeout: 30000 },
  );
  if (y === 2027)
    await page.waitForFunction(() => window.state.analyzeBase, null, { timeout: 30000 });
}

test.describe('W2 · every sum on the page adds up as shown (agorot everywhere)', () => {
  const EXPECT_2026 = [
    'left',
    'leftnow',
    'feb7',
    'pots-due',
    'lv-temp',
    'lv-lean',
    'lean-floors',
    'plan-low-lean',
    'res-low-lean',
    'pm-lean-0',
    'pc-lean-0',
    'pc-lean-1',
    'inc-1',
    'mn-base',
    'mn-everyday',
    'mn-month',
    'cg-a',
    'cg-b',
    'pots0-all',
    'pots1-all',
    'bills-total',
    'bills-cat-housing',
    'bills-moves',
    'yr-real',
    'yr-way',
    'yr-gap',
    'yr-split',
    'yr-ytab',
    'yr-why',
  ];

  for (const year of [2026, 2027]) {
    test(
      'every group adds up in ' + year + ', collapsed and fully expanded',
      async ({ page, db }) => {
        allAgorot(db);
        await openStack(page, { allowWrites: true });
        if (year === 2027) await goYear(page, 2027);
        const seen = {};
        const check = async (label, requireParts) => {
          const groups = await readGroups(page);
          for (const id of Object.keys(groups)) seen[id] = (seen[id] || 0) + 1;
          expect(badGroups(groups, requireParts), year + ' ' + label).toEqual([]);
          return groups;
        };
        // The seed really does carry agorot (a whole-shekel seed would hide every rounding bug).
        expect(
          await page.evaluate(() =>
            window.state.cashAccounts.some((a) => Number(a.amount) % 1 !== 0),
          ),
        ).toBe(true);
        await check('collapsed', false);
        await openEverything(page);
        const open = await check('expanded', true);
        if (year === 2026) {
          for (const id of EXPECT_2026)
            expect(Object.keys(open), 'group ' + id + ' is on the page').toContain(id);
        }
        expect(Object.keys(open).length).toBeGreaterThan(40);
        // The other averaging windows (2026 only: 2027 reads every complete month of its base year).
        if (year === 2026)
          for (const w of [3, 6, -1]) {
            await page.evaluate((n) => window.setAnalyzeAvgWindow(n), w);
            await openEverything(page);
            await check('window ' + w, true);
          }
        // A what-if one-off with agorot, the US self-employment tax, and driving on.
        await page.evaluate(() => window.setAnalyzeOneOff('1234.56'));
        await page.evaluate(() => window.setAnalyzeSE(true));
        await openEverything(page);
        await check('what-if + US tax', true);
        test.info().annotations.push({
          type: 'groups ' + year,
          description: Object.keys(open).sort().join(' '),
        });
        // Every console error but the aborted-write noise already filtered out by allowWrites.
      },
    );
  }
});

// ── W6 · Feb 7 does not jump when January's bill lines are copied in ──────
test.describe('W6 / W7 · Feb 7 and the bills fallback', () => {
  const janId = (db) => db.table('months').find((m) => m.year === 2027 && m.month_num === 1).id;
  const janLines = (db) => db.table('budget_items').filter((b) => b.month_id === janId(db));
  const feb7End = async (page) => {
    // The months reload after a year switch: wait until the projection is there again.
    await page.waitForFunction(
      () => {
        const c = window.buildStackCtx();
        return !!(c && c.feb7.result);
      },
      null,
      { timeout: 30000 },
    );
    return page.evaluate(() => window.buildStackCtx().feb7.result.end);
  };

  test('W6: the Feb 7 number is identical before and after the first 2027 visit copies the lines', async ({
    page,
    db,
  }) => {
    await openStack(page, { allowWrites: true });
    expect(janLines(db).length, 'January 2027 starts with no bill lines').toBe(0);
    const before = await feb7End(page);
    // Her usual lines (the templates) fill the bill categories - labelled as such.
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const jan = (
      await page
        .locator('[data-an2-card="cash"] .an2-row', { hasText: 'Jan 2027' })
        .first()
        .innerText()
    ).replace(/\s+/g, ' ');
    expect(jan).toContain('used your usual bills: Housing, Recurring Payments');
    expect(jan).not.toContain('used this month’s bills');
    await goYear(page, 2027);
    expect(janLines(db).length, 'the first 2027 visit copied the lines in').toBeGreaterThan(0);
    const during = await feb7End(page);
    await goYear(page, 2026);
    const after = await feb7End(page);
    expect(during).toBe(before);
    expect(after).toBe(before);
    // The copied lines now are the templates, so the "usual bills" label is gone and the number is not.
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.loading'), null, { timeout: 30000 });
    await page.evaluate(() => window.switchTab('analyze'));
    await page.waitForFunction(() => window.state.feb7Status === 'ready', null, { timeout: 30000 });
    expect(await feb7End(page)).toBe(before);
  });

  test('W6: with no templates it falls back to this month’s bills, as before', async ({
    page,
    db,
  }) => {
    db.table('budget_item_templates').length = 0;
    await openStack(page);
    expect(await feb7End(page)).toBe(53259);
  });

  // W7 · mutation M4: the 🏠 2027 base fallback. January has NO copied lines (no templates, so
  // the first visit copies nothing) - the card must still show last year's bills, labelled.
  test('W7: 🏠 Bills in 2027 with no January lines reads 2026’s bills and says so', async ({
    page,
    db,
  }) => {
    db.table('budget_item_templates').length = 0;
    await openStack(page, { allowWrites: true });
    await goYear(page, 2027);
    expect(janLines(db).length).toBe(0);
    const face = await text(page, '[data-an2-card="bills"] .an2-face');
    expect(face).toContain('₪4,650 a month');
    expect(face).toMatch(
      /Housing, Recurring Payments from Oct 2026 — not budgeted in Jan 2027 yet/,
    );
  });
});

// ── W9 · the stack's totals ARE the other tabs' numbers (agorot everywhere) ──
// Her rules: Left to Budget is the ribbon's number (D1), Left now is the Cash tab's Total
// Liquid (v72). (The v72 page's other totals were checked here until v74 deleted it.)
test.describe('W9 · one meaning of each number, on data full of agorot', () => {
  const digitsOf = (t) => digits(String(t).match(/[−-]?\s*₪?[\d,]+/)[0]);
  const stackBig = (page, sel) => text(page, sel);
  const liquidOnCashTab = async (page) => {
    await page.evaluate(() => window.switchTab('cash'));
    const card = page.locator('.year-sum-card', { hasText: 'Total Liquid' }).first();
    await expect(card).toBeVisible();
    return digitsOf(await card.innerText());
  };
  const ribbonLeft = async (page) => {
    await page.evaluate(() => window.switchTab('budget'));
    await page.waitForSelector('.ribbon-stat.rs-key .ribbon-val', { timeout: 30000 });
    return digitsOf(await text(page, '.ribbon-stat.rs-key .ribbon-val'));
  };

  test('💰 Left to Budget === the Budget ribbon, for the month open there (October and November)', async ({
    page,
    db,
  }) => {
    allAgorot(db);
    await openStack(page, { allowWrites: true });
    const seen = [];
    for (const month of [10, 11]) {
      await page.evaluate(async (num) => {
        const m = window.state.months.find((x) => x.month_num === num && x.year === 2026);
        await window.switchMonth(m.id);
      }, month);
      await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
      const ribbon = await ribbonLeft(page);
      await page.evaluate(() => window.switchTab('analyze'));
      await page.waitForSelector('#an2-left-value', { timeout: 30000 });
      const mine = digitsOf(await stackBig(page, '#an2-left-value'));
      seen.push([month, mine, ribbon]);
      expect(mine, 'month ' + month).toBe(ribbon);
    }
    test.info().annotations.push({ type: 'left vs ribbon', description: JSON.stringify(seen) });
  });

  test('💵 Left now === the Cash tab’s Total Liquid (minus the what-if)', async ({ page, db }) => {
    allAgorot(db);
    await openStack(page, { allowWrites: true });
    const liquid = await liquidOnCashTab(page);
    await page.evaluate(() => window.switchTab('analyze'));
    await page.waitForSelector('#an2-cash-now', { timeout: 30000 });
    const mine = digitsOf(await stackBig(page, '#an2-cash-now'));
    expect(mine).toBe(liquid);
    expect(mine).toBe(26051); // the true 24,000.4 + 2,100.4 − 50.3 = 26,050.5, rounded
    await page.evaluate(() => window.setAnalyzeOneOff('1234'));
    expect(digitsOf(await stackBig(page, '#an2-cash-now'))).toBe(liquid - 1234);
    // The Feb 7 chain starts from that same number.
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const first = await text(
      page,
      '[data-an2-card="cash"] .an2-detail .an2-row:has-text("Left now") >> nth=-1',
    );
    expect(first).toBeTruthy();
    expect(await page.evaluate(() => window.buildStackCtx().feb7.result.start)).toBe(liquid - 1234);
  });
});

// ── Round 3 · one rounding rule: each figure its own, each total its source's ───
test.describe('R2 / R4 / R5 / R7 / R8 · the round 3 rule, pinned', () => {
  const dg = (t) => digits(String(t).match(/[−-]?\s*₪?\s*-?[\d,]+/)[0]);
  const ribbonLeft = async (page) => {
    await page.evaluate(() => window.switchTab('budget'));
    await page.waitForSelector('.ribbon-stat.rs-key .ribbon-val', { timeout: 30000 });
    return dg(await text(page, '.ribbon-stat.rs-key .ribbon-val'));
  };
  const stackLeft = async (page) => {
    await page.evaluate(() => window.switchTab('analyze'));
    await page.waitForSelector('#an2-left-value', { timeout: 30000 });
    return dg(await text(page, '#an2-left-value'));
  };

  test('R2: Jan 2027 with a ₪3,000.50 line and no income: 💰 === the ribbon (−₪4,300), with a +₪1 row', async ({
    page,
    db,
  }) => {
    for (const t of db.table('budget_item_templates'))
      t.amount = t.label === 'Rent' ? 3000.5 : t.amount;
    await openStack(page, { allowWrites: true });
    await goYear(page, 2027);
    const month = await page.evaluate(() => window.buildStackCtx().left.monthNum);
    expect(month).toBe(1);
    const ribbon = await ribbonLeft(page);
    const mine = await stackLeft(page);
    expect(ribbon).toBe(-4300);
    expect(mine).toBe(ribbon);
    await page.locator('[data-an2-card="left"] .an2-more').click();
    const d = await text(page, '[data-an2-card="left"] .an2-detail');
    expect(d).toContain('Budgeted ₪4,301');
    expect(d).toMatch(/agorot, rounded \+₪1/);
    expect(d).toMatch(/Left to Budget −₪4,300/);
  });

  test('R2: income 100.10 and budgeted 100.60 are both ₪0 left, in the stack and on the ribbon', async ({
    page,
    db,
  }) => {
    const oct = db.table('months').find((m) => m.year === 2026 && m.month_num === 10);
    Object.assign(oct, {
      income_petachya: 100.1,
      income_clalit: 0,
      income_private: 0,
      charity_pct: 0,
    });
    for (const b of db.table('budgets').filter((b) => b.month_id === oct.id)) b.amount = 0;
    for (const b of db.table('budget_items').filter((b) => b.month_id === oct.id)) b.amount = 0;
    db.table('budgets').find((b) => b.month_id === oct.id && b.category === 'groceries').amount =
      100.6;
    await openStack(page, { allowWrites: true });
    const ribbon = await ribbonLeft(page);
    const mine = await stackLeft(page);
    expect(ribbon).toBe(0);
    expect(mine).toBe(0);
    await page.locator('[data-an2-card="left"] .an2-more').click();
    const d = await text(page, '[data-an2-card="left"] .an2-detail');
    expect(d).toContain('Income · Oct ₪100');
    expect(d).toContain('Budgeted ₪101');
    expect(d).toMatch(/agorot, rounded \+₪1/);
  });

  test('R2: Left now === the Cash tab’s Total Liquid minus the whole-shekel what-if, incl. a negative .50', async ({
    page,
    db,
  }) => {
    const cash = db.table('cash_accounts');
    cash[0].amount = 1000.5;
    cash[1].amount = 0;
    cash[2].amount = 0;
    await openStack(page, { allowWrites: true });
    await page.evaluate(() => window.switchTab('cash'));
    const liquid = dg(
      await page.locator('.year-sum-card', { hasText: 'Total Liquid' }).first().innerText(),
    );
    expect(liquid).toBe(1001);
    await page.evaluate(() => window.switchTab('analyze'));
    expect(dg(await text(page, '#an2-cash-now'))).toBe(liquid);
    await page.evaluate(() => window.setAnalyzeOneOff('2000'));
    expect(dg(await text(page, '#an2-cash-now'))).toBe(liquid - 2000); // −999, not −1,000
    // The what-if is whole shekels the moment it is typed: 1,234.56 is ₪1,235 everywhere.
    await page.evaluate(() => window.setAnalyzeOneOff('1234.56'));
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    expect(await page.locator('#an2-oneoff').inputValue()).toBe('1235');
    expect(dg(await text(page, '#an2-cash-now'))).toBe(liquid - 1235);
    const d = await text(page, '[data-an2-card="cash"] .an2-detail');
    expect(d).toContain('what-if one-off ₪1,235');
    expect(d).toContain('Showing cash after ₪1,235 goes out');
  });

  test('R1: on the agorot seed every 🪜 line prints its average the same everywhere on the line', async ({
    page,
    db,
  }) => {
    allAgorot(db);
    await openStack(page, { allowWrites: true });
    await page.locator('[data-an2-card="levels"] .an2-more').click();
    const rows = await page.locator('[data-an2-card="levels"] .an2-frow').allInnerTexts();
    let both = 0;
    for (const r of rows) {
      const flat = r.replace(/\s+/g, ' ');
      const a = flat.match(/\((?:avg|lean \(avg) ₪([\d,]*\d)/);
      const b = flat.match(/average ₪([\d,]*\d)/);
      if (a && b) {
        both++;
        expect(a[1], flat).toBe(b[1]);
      }
    }
    expect(both, 'at least one line prints the average twice').toBeGreaterThan(0);
    // V2 · each figure its own rounding: the average is roundZ(true average) and room is
    // roundZ(true average − true Lean) - NOT the shown average minus the shown Lean.
    const lines = await page.evaluate(() => {
      const cats = window.buildStackCtx().r.cats;
      return [...document.querySelectorAll('[data-an2-card="levels"] .an2-frow')].map((r) => {
        const t = r.innerText.replace(/\s+/g, ' ');
        const c = cats.find((x) => x.key === r.dataset.cat);
        const room = t.match(/room ([−+]?)₪([\d,]+)/);
        const avg = (t.match(/average ₪([\d,]+)/) || [])[1];
        const r0 = (n) => (Math.round(n) === 0 ? 0 : Math.round(n));
        return {
          cat: r.dataset.cat,
          avg: avg === undefined ? null : Number(avg.replace(/,/g, '')),
          avgWant: r0(c.avg),
          room: room ? (room[1] === '−' ? -1 : 1) * Number(room[2].replace(/,/g, '')) : null,
          roomWant: r0(c.avg - c.floor),
        };
      });
    });
    for (const l of lines) {
      expect(l.avg, l.cat + ' average').toBe(l.avgWant);
      expect(l.room, l.cat + ' room').toBe(l.roomWant);
    }
  });

  test('R5: bill lines that do not add when rounded one by one: the category prints its own total and ONE rounding row', async ({
    page,
    db,
  }) => {
    const oct = db.table('months').find((m) => m.year === 2026 && m.month_num === 10);
    for (const b of db.table('budget_items').filter((b) => b.month_id === oct.id)) {
      if (b.label === 'Rent') b.amount = 3000.4;
      if (b.label === 'Utilities') b.amount = 500.4;
    }
    await openStack(page, { allowWrites: true });
    expect(await text(page, '[data-an2-card="bills"] .an2-face')).toContain('housing ₪3,501');
    await openEverything(page, '[data-an2-card="bills"]');
    const d = await text(page, '[data-an2-card="bills"] .an2-detail');
    expect(d).toMatch(/housing · now ₪3,501 a month/i);
    expect(d).toMatch(/Rent[^₪]*₪3,000/);
    expect(d).toMatch(/Utilities[^₪]*₪500/);
    expect(d).toMatch(/agorot, rounded \+₪1/);
  });

  test('W5: an opened 🪜 line in 2027 reads 2026’s months - its low, its suggestion, its chips and its buttons', async ({
    page,
    db,
  }) => {
    // 2026's groceries floor averages the FOUR lowest months and vetoes Feb: a history the empty
    // 2027 months could never show.
    const g = db.table('spend_floors').find((f) => f.year === 2026 && f.category === 'groceries');
    Object.assign(g, { avg_n: 4, excluded_months: [2] });
    await openStack(page, { allowWrites: true });
    await goYear(page, 2027);
    await page.locator('[data-an2-card="levels"] .an2-more').click();
    await page.locator('.an2-frow[data-cat="groceries"] .an2-flabel').click();
    const detail = (
      await page.locator('.an2-frow[data-cat="groceries"] + .an2-fdetail').innerText()
    ).replace(/\s+/g, ' ');
    expect(detail).toContain('2026’s low ₪');
    expect(detail).not.toContain('No complete months yet');
    expect(detail).toContain('Suggestion = average of 2026’s lowest');
    expect(detail).toContain('(2026)');
    // Four months averaged, February left out - all 2026's.
    const chips = page.locator('.an2-frow[data-cat="groceries"] + .an2-fdetail .an2-mchip');
    expect(await chips.count()).toBe(5); // 4 used + the vetoed one
    await expect(chips.filter({ hasText: 'Feb' })).toHaveClass(/out/);
    await expect(
      page.locator('.an2-frow[data-cat="groceries"] + .an2-fdetail .an2-segbtn.active'),
    ).toHaveText('4');
  });

  test('R7: the Feb 7 "not paid yet" list has no ₪0 line, even on agorot data', async ({
    page,
    db,
  }) => {
    allAgorot(db);
    await openStack(page, { allowWrites: true });
    await page.locator('[data-an2-card="cash"] .an2-more').click();
    const rows = await page
      .locator('[data-an2-card="cash"] .an2-detail .an2-row-sub')
      .allInnerTexts();
    const due = rows
      .map((r) => r.replace(/\s+/g, ' '))
      .filter((r) => /Licence|Postage|Course|Summer/.test(r));
    expect(due.length).toBeGreaterThan(0);
    for (const r of due) expect(r, r).not.toMatch(/₪0$/);
  });

  test('R8: the US self-employment tax comes off every month of the 2027 path, like the typical month', async ({
    page,
  }) => {
    await openStack(page);
    const monthIncome = async () => {
      await page.locator('.an2-lv[data-level="normal"]').click();
      const d = page.locator('.an2-lvdetail[data-level="normal"]');
      const get = async (m) =>
        (
          await d
            .locator('.an2-row', { hasText: m + ' 2027' })
            .first()
            .innerText()
        ).replace(/\s+/g, ' ');
      const out = { mar: await get('Mar'), aug: await get('Aug') };
      await page.locator('.an2-lv[data-level="normal"]').click();
      return out;
    };
    const income = (t) => Number(t.match(/₪([\d,]+) in/)[1].replace(/,/g, ''));
    const off = await monthIncome();
    await page.evaluate(() => window.setAnalyzeSE(true));
    const on = await monthIncome();
    const tax = income(off.mar) - income(on.mar);
    expect(tax, 'March (4 clients) pays about 15.3% × 92.35% of the private net').toBeGreaterThan(
      300,
    );
    expect(tax).toBeLessThan(700);
    expect(on.mar).toContain('US tax −₪' + tax.toLocaleString('en-US'));
    // August has no clients: no private net, so no tax - the same rule as the typical month.
    expect(income(on.aug)).toBe(income(off.aug));
    const typical = await page.evaluate(() => window.buildStackCtx().planParts);
    expect(typical.seLow).toBeGreaterThan(0);
  });
});

// ── R3 · ONE FIGURE, ONE PRINT: the cross-group test ─────────────────────────
// Every figure that names a quantity carries a stable data-qty key (e.g. bills:2026-10:recurring,
// cash:holdings, income:2026-10, potdue:Postage, floor:2026:household:avg). This visits the stack
// (collapsed and fully expanded, with a what-if), the Budget ribbon, the Cash tab, the Year tab and
// and asserts that EVERY element with the same key prints the same number across
// the whole app. Round 2's apportionment printed one bill 1,153 here and 1,154 there; this is the
// test that finds the next such split.
test.describe('R3 · one figure, one print, across the whole app (agorot everywhere)', () => {
  const readQty = (page) =>
    page.evaluate(() => {
      const out = [];
      document.querySelectorAll('[data-qty]').forEach((el) => {
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return; // hidden
        let t = el.tagName === 'INPUT' ? el.value || el.placeholder : el.textContent;
        // An amount box holds the raw number (1000.5): read it as the whole shekels it stands for.
        if (el.tagName === 'INPUT' && el.type === 'number' && el.value !== '')
          t = String(Math.round(Number(el.value)));
        const m = String(t).match(/([−-])?\s*₪?\s*([−-])?([\d,]+)/);
        const v = m
          ? (m[1] || m[2] ? '-' : '') + m[3].replace(/,/g, '')
          : 'NaN:' + String(t).trim();
        // data-qty-sign="-": printed as a positive number ("short ₪150") for a negative value.
        const sv = el.dataset.qtySign === '-' && !v.startsWith('-') && v !== '0' ? '-' + v : v;
        for (const key of el.dataset.qty.split(' ')) out.push({ key, v: sv, t: String(t).trim() });
      });
      return out;
    });
  const gather = async (page, where, store) => {
    for (const q of await readQty(page)) (store[q.key] ||= []).push({ where, v: q.v, t: q.t });
  };
  const wrong = (store) => {
    const bad = [];
    for (const [key, prints] of Object.entries(store)) {
      const vals = [...new Set(prints.map((p) => p.v))];
      if (vals.length > 1)
        bad.push(
          key +
            ' prints ' +
            vals.join(' / ') +
            ' · ' +
            prints.map((p) => p.where + ':' + p.t).join(' | '),
        );
    }
    return bad;
  };
  const sources = (store, key) => new Set((store[key] || []).map((p) => p.where.split(' ')[0]));
  const goTab = async (page, tab, ready) => {
    await page.evaluate((t) => window.switchTab(t), tab);
    if (ready) await page.waitForSelector(ready, { timeout: 30000 });
    await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
  };

  for (const year of [2026, 2027]) {
    test('every data-qty key prints one number in ' + year, async ({ page, db }) => {
      allAgorot(db);
      // An overpaid Admin item (Course fees planned ₪1,200, paid ₪1,250): the stack's still-to-pay and
      // the Admin tab's Remaining (budget − all paid) differ here, so a shared key would be caught.
      const course = db.table('admin_items').find((i) => i.label === 'Course fees');
      db.table('admin_sub_items').push({
        id: 'sub-over',
        item_id: course.id,
        label: 'Fee',
        amount: 1250,
        is_paid: true,
        month_num: 5,
      });
      await openStack(page, { allowWrites: true });
      if (year === 2027) await goYear(page, 2027);
      // U2/T4: every averaging window x US-tax off/on x year state goes into the SAME store as the
      // other tabs: a key names everything it depends on, so one key must print one number across
      // ALL of these states - a key that forgot the window, the US-tax state or the Lean's year
      // meets a different number from another state and fails here.
      const store = {};
      const whatIf = {};
      const roomOnly = (st) =>
        Object.fromEntries(Object.entries(st).filter(([k]) => /:room:/.test(k)));
      for (const w of [0, 3, 6, -1])
        for (const se of [false, true]) {
          await page.evaluate(
            ([k, on]) => {
              window.setAnalyzeAvgWindow(k);
              window.setAnalyzeSE(on);
            },
            [w, se],
          );
          await gather(page, 'stack collapsed', store);
          await openEverything(page);
          await gather(page, 'stack expanded', store);
        }
      if (year === 2027) {
        // A second Lean state: one 2027 line set, so its room is measured against 2027's Lean now
        // (not 2026's). The room keys of both states are compared in one store.
        await page.evaluate(() => {
          window.setAnalyzeAvgWindow(0);
          window.setAnalyzeSE(false);
        });
        const before = roomOnly(store);
        await page.evaluate(() => window.saveSpendFloor('groceries', '777'));
        await page.waitForTimeout(600);
        const after = {};
        await openEverything(page);
        await gather(page, 'stack lean-set', after);
        const merged = {};
        for (const st of [before, roomOnly(after)])
          for (const [k, v] of Object.entries(st)) (merged[k] ||= []).push(...v);
        expect(wrong(merged), 'room keys across the 2026-Lean and 2027-Lean states').toEqual([]);
        expect(
          Object.keys(roomOnly(after)).some((k) => /groceries:room:0:lean2027/.test(k)),
          'the set line is measured against 2027’s Lean',
        ).toBe(true);
        // Put the Lean back for the rest of the run.
        await page.evaluate(() => window.saveSpendFloor('groceries', ''));
        await page.waitForTimeout(600);
      }
      await page.evaluate(() => {
        window.setAnalyzeAvgWindow(0);
        window.setAnalyzeSE(false);
      });
      await gather(page, 'stack collapsed', store);
      await openEverything(page);
      await gather(page, 'stack expanded', store);
      // The same stack with a what-if: its own run (Left now is a different number with one).
      await page.evaluate(() => window.setAnalyzeOneOff('1235'));
      await openEverything(page);
      await gather(page, 'stack what-if', whatIf);
      await page.evaluate(() => window.setAnalyzeOneOff('0'));
      // U4: on the Whole-year window the 🧾 saved + income averages mean what the Year tab's
      // Avg/mo means, so that window's prints join the cross-app store too.
      await page.evaluate(() => window.setAnalyzeAvgWindow(-1));
      await openEverything(page);
      await gather(page, 'stack wholeyear', store);
      await page.evaluate(() => window.setAnalyzeAvgWindow(0));
      await goTab(page, 'budget', '.ribbon-stat.rs-key .ribbon-val');
      await gather(page, 'ribbon', store);
      // The bill lines sit in the housing / recurring sections: open them so their boxes are read.
      await page.evaluate(() => {
        for (const k of ['housing', 'recurring'])
          if (!window.state.openCats.has(k)) window.toggleCat(k);
      });
      await gather(page, 'budget lines', store);
      await goTab(page, 'cash', '.year-sum-card');
      await gather(page, 'cash tab', store);
      // T1: the Year tab through BOTH of its views. Its keys end :full (projected) or :actual
      // ("Actual Only" zeroes future months); the stack's figures are the full-year projected ones.
      await goTab(page, 'year', '.year-mobile');
      for (const view of ['projected', 'actual']) {
        await page.evaluate((v) => {
          localStorage.setItem('yearViewMode', v);
          window.renderApp();
        }, view);
        await page.waitForSelector('.year-mobile', { timeout: 30000 });
        await gather(page, 'year tab', store);
        // The Year tab's Avg/mo column and income ribbon are on the wide layout.
        await page.setViewportSize({ width: 1280, height: 900 });
        await gather(page, 'year wide', store);
        await page.setViewportSize({ width: 412, height: 892 });
      }
      await page.evaluate(() => {
        localStorage.setItem('yearViewMode', 'projected');
        window.renderApp();
      });
      // S1: the Admin tab's Remaining (budget − all paid) is visited too: no stack figure may share
      // its key (the seed has an overpaid item, where it and the stack's still-to-pay differ).
      await page.setViewportSize({ width: 1280, height: 900 });
      await goTab(page, 'admin', '[data-qty="adminremaining:' + year + '"]');
      await gather(page, 'admin', store);
      await page.setViewportSize({ width: 412, height: 892 });
      const keys = Object.keys(store);
      expect(keys.length, 'keys seen: ' + keys.join(' ')).toBeGreaterThan(20);
      expect(wrong(store), year + ': the same figure prints two numbers').toEqual([]);
      expect(wrong(whatIf), year + ' with a what-if: the same figure prints two numbers').toEqual(
        [],
      );
      // The keys that MUST be printed in two different places (so a lost tag fails the test).
      const mustCross =
        year === 2026
          ? {
              'cash:holdings': ['stack', 'cash'],
              'cash:owed': ['stack', 'cash'],
              'cash:liquid': ['stack', 'cash'],
              'left:2026-10': ['stack', 'ribbon'],
              'income:2026-10': ['stack', 'ribbon'],
              'budgeted:2026-10': ['stack', 'ribbon'],
              'bills:2026-10:recurring': ['stack', 'year'],
              'bills:2026-10:housing': ['stack', 'year'],
              // V5: a bill line is also an amount box on the Budget tab; a month's savings is the
              // Year tab's Total Savings.
              'billline:2026-10:housing:Rent': ['stack', 'budget'],
              'billline:2026-10:recurring:Phone': ['stack', 'budget'],
              'billline:2026-10:recurring:Cloud%20storage': ['stack', 'budget'],
              'monthsaved:2026-10:full': ['stack', 'year'],
              // U3/U4: the Year tab's own Total Used avg/mo, savings avg/mo, income avg/mo and the
              // month's charity are printed on the stack too.
              'yeartab:used:2026:full': ['stack', 'year'],
              'saved:2026:-1:full': ['stack', 'year'],
              'incomeavg:2026:-1:full': ['stack', 'year'],
              'charity:2026-10:full': ['stack', 'year'],
            }
          : {
              'cash:holdings': ['stack', 'cash'],
              'cash:liquid': ['stack', 'cash'],
              'left:2027-01': ['stack', 'ribbon'],
              'income:2027-01': ['stack', 'ribbon'],
              'budgeted:2027-01': ['stack', 'ribbon'],
            };
      for (const [key, need] of Object.entries(mustCross)) {
        const got = sources(store, key);
        for (const n of need) expect([...got], key + ' is printed on the ' + n).toContain(n);
      }
      // Several prints inside the stack itself: the potdue pair, the 🪜 averages, the what-if.
      if (year === 2026) {
        expect((store['potdue:Postage'] || []).length, 'potdue:Postage').toBeGreaterThan(1);
        // T1: "Actual Only" reads another number for the same words (future months are 0), so it
        // has its OWN key and never meets the stack's full-year figure.
        const actual = (store['saved:2026:-1:actual'] || [])[0];
        const full = (store['saved:2026:-1:full'] || []).find((p) => p.where.startsWith('stack'));
        expect(actual, 'the Year tab prints its Actual-Only savings average').toBeTruthy();
        expect(actual.v, 'Actual Only is a different number').not.toBe(full.v);
        // V4: a name with a space keeps one key (percent-encoded), and still prints twice.
        expect((store['potdue:Summer%20trip'] || []).length, 'potdue:Summer trip').toBeGreaterThan(
          1,
        );
        expect(
          Object.keys(store).filter((k) => /^floor:2026:.*:avg:0$/.test(k)).length,
          'floor averages tagged',
        ).toBeGreaterThan(3);
        // V3a: the everyday pace prints on the 📅 envelope row, in "What moved" and as the 🪜
        // "your pace now" (the second and third only when this month's numbers call for them -
        // V3a pins that case); every envelope row carries its key.
        const paceKeys = Object.keys(store).filter((k) => /^pace:2026:/.test(k));
        expect(paceKeys.length, 'pace keys tagged').toBeGreaterThan(1);
        // V5: the 💼 face range, the 🧭 "Income · 4/5 clients" rows, the 🧭 tiles and 💼 "At your
        // levels" are the same figures; the 🧾 "what moved" averages print in the sentence and a row.
        for (const [k, n] of [
          ['planincome:low:se0', 5],
          ['planincome:high:se0', 5],
          ['planres:low:lean:se0', 3],
          ['planres:high:normal:se0', 3],
          ['whyrecent:2026:0', 2],
          ['whyearly:2026:0', 2],
        ])
          expect((store[k] || []).length, k).toBeGreaterThanOrEqual(n);
        // V3b: both parts of the 🧾 split print on the face and again in the detail.
        for (const k of ['notbudgeted:2026:0', 'unspent:2026:0'])
          expect((store[k] || []).length, k).toBeGreaterThan(1);
        expect((whatIf['cash:oneoff'] || []).length, 'cash:oneoff').toBeGreaterThan(2);
        expect(new Set((whatIf['cash:oneoff'] || []).map((p) => p.v))).toEqual(new Set(['1235']));
      }
    });
  }
});
