// Pins lib/analyze.ts — the arithmetic behind the Analyze tab.
//
// Every number the tab shows is derived here from plain rows, so these tests
// are the contract: month status, what each behaviour counts, the Used = real
// + savings identity that must match the Year tab, averaging windows, low/high
// months, floor defaults, and the fixed-lines audit. Runs under node:test with
// no browser and no Supabase (npm run test:unit builds dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'analyze.js');
assert.ok(existsSync(compiled), 'dist/lib/analyze.js is missing — run `npm run build` first.');
const { analyzeYear, pickAvgMonths, lineKey, monthStatus, catKind } = await import(
  pathToFileURL(compiled).href
);

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

test('fixed = max(lines, transactions); pots and charity mirror yearCatBudget', () => {
  const [jan, feb] = run().months;
  assert.equal(jan.byCat.housing, 2100); // lines 2100 beat the ₪100 transaction
  assert.equal(jan.byCat.recurring, 300);
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
  const totalUsed = 1000 + 200 + 2100 + 300 + 500 + 700 + 541 + (1500 + 500);
  assert.equal(jan.fixed, 2400);
  assert.equal(jan.envelope, 1200);
  assert.equal(jan.pots, 1200);
  assert.equal(jan.charity, 541);
  assert.equal(jan.real, 1200 + 2400 + 1200 + 541);
  assert.equal(jan.savings, 2000);
  assert.equal(jan.used, totalUsed);
  assert.equal(jan.used, jan.real + jan.savings);
});

test('entries counts transactions per month, unjudged', () => {
  const r = run();
  assert.deepEqual(
    r.months.map((m) => m.entries),
    [5, 3, 1, 0],
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

test('low/high read complete-month ACTUALS for envelopes', () => {
  const g = run().cats.find((c) => c.key === 'groceries');
  assert.deepEqual(g.low, { month_num: 2, amount: 400 });
  assert.deepEqual(g.high, { month_num: 1, amount: 1000 });
  const none = run({ todayMonth: 1 });
  assert.equal(none.cats[0].low, null);
});

test('floor defaults: envelope → lowest month, fixed → this month, pot → 0, charity → avg', () => {
  const r = run();
  const by = Object.fromEntries(r.cats.map((c) => [c.key, c]));
  assert.equal(by.groceries.floorDefault, 400);
  assert.equal(by.housing.floorDefault, 2100); // reference = current month (Mar)
  assert.equal(by.recurring.floorDefault, 0); // Mar lines are 0
  assert.equal(by.travel.floorDefault, 0);
  assert.equal(by.admin.floorDefault, 0);
  assert.equal(by.charity.floorDefault, by.charity.avg);
  assert.equal(by.groceries.floorSet, false);
  assert.equal(by.groceries.floor, 400);
  assert.equal(by.groceries.aboveFloor, 300); // avg 700 − floor 400
});

test('her stored floor wins over the default; junk is ignored', () => {
  const r = run({ floors: { groceries: 650, travel: 100, admin: NaN } });
  const by = Object.fromEntries(r.cats.map((c) => [c.key, c]));
  assert.equal(by.groceries.floorSet, true);
  assert.equal(by.groceries.floor, 650);
  assert.equal(by.groceries.aboveFloor, 50);
  assert.equal(by.travel.floor, 100);
  assert.equal(by.admin.floorSet, false);
  assert.equal(by.admin.floor, 0);
  const floorTotal = r.cats.reduce((s, c) => s + c.floor, 0);
  assert.equal(r.summary.floorTotal, Math.round(floorTotal * 100) / 100);
  assert.equal(
    r.summary.aboveFloor,
    Math.round((r.summary.realAvg - r.summary.floorTotal) * 100) / 100,
  );
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
