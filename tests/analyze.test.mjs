// Pins lib/analyze.ts — the arithmetic behind the Analyze tab.
//
// Every number the tab shows is derived here from plain rows, so these tests
// are the contract: month status, what each behaviour counts, the Used = real
// + savings identity that must match the Year tab, "so far" at actual,
// averaging windows, low/high months, the floor rule (average of the N lowest
// normal months, with her per-line vetoes), and the fixed-lines audit. Runs
// under node:test with no browser and no Supabase (npm run test:unit builds
// dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'analyze.js');
assert.ok(existsSync(compiled), 'dist/lib/analyze.js is missing — run `npm run build` first.');
const { analyzeYear, pickAvgMonths, lineKey, monthStatus, catKind, clampAvgN, cleanExcluded } =
  await import(pathToFileURL(compiled).href);

// A stored floor row as the math sees it.
const F = (amount, avgN = 3, excluded = []) => ({ amount, avgN, excluded });

// ── Fixture: a 4-month year, today = month 3 ─────────────────────────────
const CATS = [
  { key: 'groceries', label: 'Groceries', emoji: '🛒' },
  { key: 'retail', label: 'Retail', emoji: '🛍️' },
  { key: 'housing', label: 'Housing', emoji: '🏠', hasLines: true },
  { key: 'recurring', label: 'Recurring', emoji: '🔄', hasLines: true },
  { key: 'travel', label: 'Travel', emoji: '✈️', hasTab: true },
  { key: 'admin', label: 'Admin', emoji: '📋', hasTab: true },
  { key: 'charity', label: 'Charity', emoji: '💚', hasTab: true },
];
const M = (num, extra = {}) => ({
  id: 'm' + num,
  month_num: num,
  month_name: ['', 'January', 'February', 'March', 'April'][num],
  income_petachya: 10000,
  income_clalit: 0,
  income_private: 0,
  income_other: 0,
  charity_pct: 5,
  ...extra,
});
const MONTHS = [M(1), M(2, { income_private: -200 }), M(3), M(4)];
const TXNS = [
  // groceries: 1000 (Jan), 400 (Feb, the low), 300 so far (Mar, current)
  { month_id: 'm1', category: 'groceries', amount: 600 },
  { month_id: 'm1', category: 'groceries', amount: 400 },
  { month_id: 'm2', category: 'groceries', amount: 400 },
  { month_id: 'm3', category: 'groceries', amount: 300 },
  // retail: 200 Jan, refund -50 Feb → 150 total; nothing in Mar
  { month_id: 'm1', category: 'retail', amount: 200 },
  { month_id: 'm2', category: 'retail', amount: 200 },
  { month_id: 'm2', category: 'retail', amount: -50 },
  // a housing transaction BELOW the lines — Used must take the lines
  { month_id: 'm1', category: 'housing', amount: 100 },
  // a recurring payment ABOVE its lines (300) — fixed must take the payment
  { month_id: 'm1', category: 'recurring', amount: 350 },
  // current month: retail spent 400 against a 250 budget — the higher-of rule
  // must take the spend (and "so far" must take it as actual)
  { month_id: 'm3', category: 'retail', amount: 400 },
  // junk amount → 0
  { month_id: 'm1', category: 'groceries', amount: 'oops' },
];
const LINES = [];
for (const num of [1, 2, 3, 4]) {
  LINES.push({ month_id: 'm' + num, category: 'housing', amount: 2000, label: 'Rent' });
  LINES.push({ month_id: 'm' + num, category: 'housing', amount: 100, label: 'Water' });
  LINES.push({
    month_id: 'm' + num,
    category: 'recurring',
    amount: num <= 2 ? 300 : 0,
    label: `Mattress (${num + 5}/12)`,
    subcategory: 'tashlumim',
  });
  LINES.push({ month_id: 'm' + num, category: 'recurring', amount: 0, label: 'Tennis' });
}
const BUDGETS = [];
for (const num of [1, 2, 3, 4]) {
  BUDGETS.push({ month_id: 'm' + num, category: 'groceries', amount: 900 });
  BUDGETS.push({ month_id: 'm' + num, category: 'retail', amount: 250 });
  BUDGETS.push({ month_id: 'm' + num, category: 'travel', amount: 500 });
  BUDGETS.push({ month_id: 'm' + num, category: 'admin', amount: 700 });
  BUDGETS.push({ month_id: 'm' + num, category: 'savings_bank', amount: 1500 });
}
BUDGETS.push({ month_id: 'm1', category: 'savings_invested', amount: 500 });
const INCOME_ITEMS = [{ month_id: 'm1', amount: 819 }];

const run = (over = {}) =>
  analyzeYear({
    months: MONTHS,
    txns: TXNS,
    budgetItems: LINES,
    budgets: BUDGETS,
    incomeItems: INCOME_ITEMS,
    categories: CATS,
    todayMonth: 3,
    avgWindow: 0,
    floors: {},
    ...over,
  });

test('month status follows the Year-tab rule (past < today = current < future)', () => {
  assert.equal(monthStatus(2, 3), 'past');
  assert.equal(monthStatus(3, 3), 'current');
  assert.equal(monthStatus(4, 3), 'future');
  // A past year (13) is all past; a future year (0) is all future.
  assert.equal(monthStatus(12, 13), 'past');
  assert.equal(monthStatus(1, 0), 'future');
  const r = run();
  assert.deepEqual(
    r.months.map((m) => m.status),
    ['past', 'past', 'current', 'future'],
  );
});

test('catKind: charity first, then pot, then fixed, else envelope', () => {
  assert.equal(catKind({ key: 'charity', hasTab: true }), 'charity');
  assert.equal(catKind({ key: 'travel', hasTab: true }), 'pot');
  assert.equal(catKind({ key: 'housing', hasLines: true }), 'fixed');
  assert.equal(catKind({ key: 'groceries' }), 'envelope');
});

test('envelopes: past = actual, future = budget, current = the higher of the two', () => {
  const [jan, feb, mar, apr] = run().months;
  assert.equal(jan.byCat.groceries, 1000); // 600 + 400 (+ junk 0)
  assert.equal(feb.byCat.retail, 150); // refund stays in the sum
  assert.equal(mar.byCat.groceries, 900); // spent 300 so far, budget 900 → 900
  assert.equal(apr.byCat.groceries, 900); // future → budget
  assert.equal(apr.byCat.retail, 250);
  // actualByCat is always the raw transactions
  assert.equal(mar.actualByCat.groceries, 300);
  assert.equal(apr.actualByCat.groceries, 0);
});

test('fixed = max(lines, transactions) in BOTH directions; pots and charity mirror yearCatBudget', () => {
  const [jan, feb, mar] = run().months;
  assert.equal(jan.byCat.housing, 2100); // lines 2100 beat the ₪100 transaction
  assert.equal(jan.byCat.recurring, 350); // the ₪350 payment beats the ₪300 line
  assert.equal(jan.fixed, 2450);
  // Envelope higher-of, the other direction: current-month spend above budget
  assert.equal(mar.byCat.retail, 400); // budget 250, spent 400 → 400
  assert.equal(mar.actualByCat.retail, 400);
  assert.equal(jan.byCat.travel, 500);
  assert.equal(jan.byCat.admin, 700);
  // charity = round(income × pct / 100); Jan income = 10000 + 819 items
  assert.equal(jan.income, 10819);
  assert.equal(jan.byCat.charity, Math.round((10819 * 5) / 100));
  // negative private income flows into the base, like the app
  assert.equal(feb.income, 9800);
  assert.equal(feb.byCat.charity, 490);
});

test('Used = real + savings, and on a past month equals the Year tab Total Used formula', () => {
  const [jan] = run().months;
  // Year tab: Σ envelopes(tx) + Σ fixed max(lines,tx) + Σ pots(budget) + charity + savings
  //   housing max(2100, 100) = 2100 · recurring max(300, 350) = 350
  const totalUsed = 1000 + 200 + 2100 + 350 + 500 + 700 + 541 + (1500 + 500);
  assert.equal(jan.fixed, 2450);
  assert.equal(jan.envelope, 1200);
  assert.equal(jan.pots, 1200);
  assert.equal(jan.charity, 541);
  assert.equal(jan.real, 1200 + 2450 + 1200 + 541);
  assert.equal(jan.savings, 2000);
  assert.equal(jan.used, totalUsed);
  assert.equal(jan.used, jan.real + jan.savings);
});

test('"so far" is at actual: the current month splits into realActual + projected remainder', () => {
  const r = run();
  const [jan, feb, mar, apr] = r.months;
  // Mar (current): groceries max(300, 900) = 900, retail max(400, 250) = 400
  // → counted 1300, actual 700; fixed 2100 + 0; pots 1200; charity 500
  assert.equal(mar.real, 1300 + 2100 + 1200 + 500);
  assert.equal(mar.realActual, 700 + 2100 + 1200 + 500);
  // Past = the same number both ways; future = nothing spent yet
  assert.equal(jan.realActual, jan.real);
  assert.equal(feb.realActual, feb.real);
  assert.equal(apr.realActual, 0);
  const s = r.summary;
  assert.equal(s.yearRealActual, jan.real + feb.real + mar.realActual);
  assert.equal(s.yearRealProjected, apr.real + (mar.real - mar.realActual));
  assert.equal(s.yearReal, s.yearRealActual + s.yearRealProjected);
  assert.equal(s.yearReal, jan.real + feb.real + mar.real + apr.real);
  // Per-category ytd follows the same rule: groceries counts 300 in Mar, not 900
  const g = r.cats.find((c) => c.key === 'groceries');
  assert.equal(g.ytd, 1000 + 400 + 300);
});

test('entries counts transactions per month, unjudged; a month still ahead has none', () => {
  const r = run();
  assert.deepEqual(
    r.months.map((m) => m.entries),
    [6, 3, 2, 0],
  );
});

test('averages use complete months only; the window takes the last N of them', () => {
  assert.deepEqual(pickAvgMonths([1, 2, 3, 4, 5, 6], 5, 0), [1, 2, 3, 4]);
  assert.deepEqual(pickAvgMonths([1, 2, 3, 4, 5, 6], 5, 3), [2, 3, 4]);
  assert.deepEqual(pickAvgMonths([1, 2], 5, 6), [1, 2]); // fewer than N → all
  assert.deepEqual(pickAvgMonths([1, 2, 3], 0, 0), []); // future year → none
  const all = run();
  assert.deepEqual(all.summary.avgMonths, [1, 2]);
  const g = all.cats.find((c) => c.key === 'groceries');
  assert.equal(g.avg, 700); // (1000 + 400) / 2
  const last1 = run({ avgWindow: 1 });
  assert.deepEqual(last1.summary.avgMonths, [2]);
  assert.equal(last1.cats.find((c) => c.key === 'groceries').avg, 400);
  // No complete months → averages are 0, not NaN
  const none = run({ todayMonth: 1 });
  assert.equal(none.summary.realAvg, 0);
  assert.equal(none.cats[0].avg, 0);
});

test('low/high come from COMPLETE months only, by actual transactions for envelopes — the current month (Mar, 300 so far) is never the low', () => {
  const g = run().cats.find((c) => c.key === 'groceries');
  assert.deepEqual(g.low, { month_num: 2, amount: 400 });
  assert.deepEqual(g.high, { month_num: 1, amount: 1000 });
  const none = run({ todayMonth: 1 });
  assert.equal(none.cats[0].low, null);
});

test('floor defaults: envelope → average of the N lowest complete months, fixed → this month, pot → 0, charity → avg', () => {
  const r = run();
  const by = Object.fromEntries(r.cats.map((c) => [c.key, c]));
  // Two complete months, N = 3 → fewer than N, so both are averaged
  assert.equal(by.groceries.floorDefault, 700); // (1000 + 400) / 2
  assert.deepEqual(by.groceries.floorMonths, [
    { month_num: 2, amount: 400 },
    { month_num: 1, amount: 1000 },
  ]);
  assert.equal(by.groceries.avgN, 3);
  assert.deepEqual(by.groceries.excluded, []);
  assert.equal(by.housing.floorDefault, 2100); // reference = current month (Mar)
  assert.equal(by.recurring.floorDefault, 0); // Mar lines are 0
  assert.equal(by.travel.floorDefault, 0);
  assert.equal(by.admin.floorDefault, 0);
  assert.equal(by.charity.floorDefault, by.charity.avg);
  assert.deepEqual(by.housing.floorMonths, []); // fixed and pots average nothing
  assert.deepEqual(by.travel.floorMonths, []);
  assert.equal(by.groceries.floorSet, false);
  assert.equal(by.groceries.floor, 700);
  assert.equal(by.groceries.aboveFloor, 0); // avg 700 − floor 700
  // N = 1 → the lowest month alone (the old rule)
  const one = run({ floors: { groceries: F(null, 1) } });
  const g1 = one.cats.find((c) => c.key === 'groceries');
  assert.equal(g1.floorDefault, 400);
  assert.deepEqual(g1.floorMonths, [{ month_num: 2, amount: 400 }]);
  assert.equal(g1.aboveFloor, 300);
});

test('her stored floor wins over the default; null or junk = not set', () => {
  const r = run({
    floors: { groceries: F(650), travel: F(100), admin: F(NaN), retail: F(null) },
  });
  const by = Object.fromEntries(r.cats.map((c) => [c.key, c]));
  assert.equal(by.groceries.floorSet, true);
  assert.equal(by.groceries.floor, 650);
  assert.equal(by.groceries.aboveFloor, 50);
  assert.equal(by.travel.floor, 100);
  assert.equal(by.admin.floorSet, false);
  assert.equal(by.admin.floor, 0);
  assert.equal(by.retail.floorSet, false);
  assert.equal(by.retail.floor, by.retail.floorDefault);
  const floorTotal = r.cats.reduce((s, c) => s + c.floor, 0);
  assert.equal(r.summary.floorTotal, Math.round(floorTotal * 100) / 100);
  assert.equal(
    r.summary.aboveFloor,
    Math.round((r.summary.realAvg - r.summary.floorTotal) * 100) / 100,
  );
});

// ── Floor rule fixture: 7 complete months of groceries, today = Aug ──────
// Jan 500 · Feb 300 · Mar 700 · Apr 200 · May 900 · Jun 400 · Jul 600 · Aug 100 so far
const FY_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8].map((num) => ({
  id: 'y' + num,
  month_num: num,
  month_name: ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August'][num],
  income_petachya: 10000,
  charity_pct: 5,
}));
const FY_GROC = { 1: 500, 2: 300, 3: 700, 4: 200, 5: 900, 6: 400, 7: 600, 8: 100 };
const FY_TXNS = Object.entries(FY_GROC).map(([num, amt]) => ({
  month_id: 'y' + num,
  category: 'groceries',
  amount: amt,
}));
const runFloor = (over = {}) =>
  analyzeYear({
    months: FY_MONTHS,
    txns: FY_TXNS,
    budgetItems: [],
    budgets: FY_MONTHS.map((m) => ({ month_id: m.id, category: 'groceries', amount: 800 })),
    incomeItems: [],
    categories: CATS,
    todayMonth: 8,
    avgWindow: 0,
    floors: {},
    ...over,
  });
const groc = (r) => r.cats.find((c) => c.key === 'groceries');

test('floor rule: the suggestion averages the 3 lowest complete months by default', () => {
  const g = groc(runFloor());
  assert.deepEqual(g.floorMonths, [
    { month_num: 4, amount: 200 },
    { month_num: 2, amount: 300 },
    { month_num: 6, amount: 400 },
  ]);
  assert.equal(g.floorDefault, 300);
  assert.equal(g.floor, 300);
  assert.equal(g.avg, Math.round((3600 / 7) * 100) / 100); // all 7 complete months, agorot-snapped
  assert.deepEqual(g.low, { month_num: 4, amount: 200 });
  assert.deepEqual(g.high, { month_num: 5, amount: 900 });
});

test('floor rule: avgN = 5 averages five (her Household ask)', () => {
  const g = groc(runFloor({ floors: { groceries: F(null, 5) } }));
  assert.equal(g.avgN, 5);
  assert.equal(g.floorMonths.length, 5);
  assert.deepEqual(
    g.floorMonths.map((x) => x.amount),
    [200, 300, 400, 500, 600],
  );
  assert.equal(g.floorDefault, 400);
});

test('floor rule: a vetoed month leaves avg, low, high and floorMonths — realAvg does not move', () => {
  const plain = runFloor();
  const r = runFloor({ floors: { groceries: F(null, 3, [4, 5]) } });
  const g = groc(r);
  assert.deepEqual(g.excluded, [4, 5]);
  // Apr (200, the low) and May (900, the high) are out
  assert.deepEqual(g.floorMonths, [
    { month_num: 2, amount: 300 },
    { month_num: 6, amount: 400 },
    { month_num: 1, amount: 500 },
  ]);
  assert.ok(!g.floorMonths.some((x) => x.month_num === 4 || x.month_num === 5));
  assert.equal(g.floorDefault, 400);
  assert.deepEqual(g.low, { month_num: 2, amount: 300 });
  assert.deepEqual(g.high, { month_num: 3, amount: 700 });
  assert.equal(g.avg, (500 + 300 + 700 + 400 + 600) / 5);
  // The year's real average is one number over one window — vetoes are per line
  assert.equal(r.summary.realAvg, plain.summary.realAvg);
  // Other categories are untouched by groceries' vetoes
  assert.equal(
    r.cats.find((c) => c.key === 'charity').avg,
    plain.cats.find((c) => c.key === 'charity').avg,
  );
});

test('floor rule: fewer than N normal months left → average what is there; none → 0', () => {
  const two = groc(runFloor({ floors: { groceries: F(null, 3, [1, 2, 3, 4, 5]) } }));
  assert.equal(two.floorMonths.length, 2);
  assert.equal(two.floorDefault, (400 + 600) / 2);
  const none = groc(runFloor({ floors: { groceries: F(null, 3, [1, 2, 3, 4, 5, 6, 7]) } }));
  assert.deepEqual(none.floorMonths, []);
  assert.equal(none.floorDefault, 0);
  assert.equal(none.floor, 0);
  assert.equal(none.low, null);
  assert.equal(none.high, null);
  assert.equal(none.avg, 0);
  // Vetoing the current month changes nothing: it was never a complete month
  const cur = groc(runFloor({ floors: { groceries: F(null, 3, [8]) } }));
  assert.equal(cur.floorDefault, 300);
});

test('floor rule: stored avg_n / excluded_months are cleaned, never trusted raw', () => {
  assert.equal(clampAvgN(undefined), 3);
  assert.equal(clampAvgN('5'), 5);
  assert.equal(clampAvgN(0), 3);
  assert.equal(clampAvgN(99), 12);
  assert.deepEqual(cleanExcluded(null), []);
  assert.deepEqual(cleanExcluded([8, '3', 3, 0, 13, 'x']), [3, 8]);
  const g = groc(runFloor({ floors: { groceries: F(null, 99, [4, 4, 'x']) } }));
  assert.equal(g.avgN, 12);
  assert.deepEqual(g.excluded, [4]);
  assert.equal(g.floorMonths.length, 6); // 7 complete − 1 vetoed, capped by N = 12
});

test('share of real ytd sums to 1 across categories', () => {
  const r = run();
  const total = r.cats.reduce((s, c) => s + c.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares sum to ${total}`);
});

test('summary: ytd = past + current, year = actual + projected, savings rate', () => {
  const s = run().summary;
  // ytd months 1-3: income 10819 + 9800 + 10000
  assert.equal(s.ytdIncome, 30619);
  // savings: Jan 2000, Feb 1500, Mar 1500
  assert.equal(s.ytdSavings, 5000);
  assert.ok(Math.abs(s.savingsRate - 5000 / 30619) < 1e-12);
  assert.equal(s.referenceMonth, 3);
  assert.equal(s.yearReal, s.yearRealActual + s.yearRealProjected);
  assert.equal(s.yearSavings, 6500);
  assert.equal(s.yearIncome, 40619);
  // A year with no income cannot divide by zero
  const zero = run({
    months: MONTHS.map((m) => ({ ...m, income_petachya: 0, income_private: 0 })),
    incomeItems: [],
  });
  assert.equal(zero.summary.ytdIncome, 0);
  assert.equal(zero.summary.savingsRate, 0);
});

test('lineKey folds installment suffixes so one line is one line', () => {
  assert.equal(lineKey('Mattress (6/12)'), 'mattress');
  assert.equal(lineKey('Esther Taub Fitness 7/12'), 'esther taub fitness');
  assert.equal(lineKey('  Rent '), 'rent');
  assert.equal(lineKey(null), '');
});

test('fixed lines: annual = sum across the year, dead lines flagged, sorted by annual', () => {
  const lines = run().lines;
  assert.deepEqual(
    lines.map((l) => l.label),
    ['Rent', 'Mattress (8/12)', 'Water', 'Tennis'],
  );
  const rent = lines[0];
  assert.equal(rent.monthly, 2000);
  assert.equal(rent.annual, 8000);
  assert.equal(rent.monthsPresent, 4);
  assert.equal(rent.dead, false);
  const mattress = lines[1];
  assert.equal(mattress.monthly, 0); // Mar line is 0
  assert.equal(mattress.annual, 600);
  assert.equal(mattress.monthsPresent, 4);
  assert.equal(mattress.subcategory, 'tashlumim');
  const tennis = lines[3];
  assert.equal(tennis.dead, true);
});
