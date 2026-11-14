import { assert, assertEquals, assertThrows } from '@std/assert';
import {
  GENERIC_ERROR,
  ValidationError,
  ag,
  CATEGORIES,
  computeMonth,
  isAuthorized,
  payMonthFor,
  safeErrorMessage,
  shapeCategories,
  shapeIncome,
  shapeSpending,
  validateLimit,
  validateMonth,
  type MonthInput,
  type MonthRow,
} from './logic.ts';

const S = 'Zk3-correct_horse_battery_staple-0123456789';

Deno.test('auth: unset or short secret fails closed', async () => {
  assertEquals(await isAuthorized(undefined, '/budget-mcp/mcp', `Bearer ${S}`), false);
  assertEquals(await isAuthorized('', '/budget-mcp/mcp', 'Bearer '), false);
  const short = 'a'.repeat(31);
  assertEquals(await isAuthorized(short, '/budget-mcp/mcp', `Bearer ${short}`), false);
  const ok32 = 'a'.repeat(32);
  assert(await isAuthorized(ok32, '/budget-mcp/mcp', `Bearer ${ok32}`));
});
Deno.test('auth: bearer works, URL-path secret and wrong/missing refused', async () => {
  assert(await isAuthorized(S, '/budget-mcp/mcp', `Bearer ${S}`));
  assert(await isAuthorized(S, '/mcp', `bearer ${S}`));
  assertEquals(await isAuthorized(S, `/budget-mcp/${S}/mcp`, null), false);
  assertEquals(await isAuthorized(S, '/budget-mcp/mcp', null), false);
  assertEquals(await isAuthorized(S, '/budget-mcp/mcp', 'Bearer nope'), false);
  assertEquals(await isAuthorized(S, '/budget-mcp/mcp', S), false);
  assertEquals(await isAuthorized(S, '/budget-mcp/admin', `Bearer ${S}`), false);
});

Deno.test('errors: only validation messages pass through', () => {
  assertEquals(safeErrorMessage(new ValidationError('month must look like 2026-11')), 'month must look like 2026-11');
  assertEquals(safeErrorMessage(new Error('key=abc upstream 502')), GENERIC_ERROR);
  assertEquals(safeErrorMessage('boom'), GENERIC_ERROR);
});

Deno.test('validateMonth', () => {
  assertEquals(validateMonth(undefined), null);
  assertEquals(validateMonth(''), null);
  assertEquals(validateMonth('2026-11'), { year: 2026, month: 11 });
  for (const bad of ['2026-13', '2026-00', '26-11', '2026-1', '2026-11&x=1', 'nov', 5, '1999-05']) {
    assertThrows(() => validateMonth(bad), ValidationError);
  }
});
Deno.test('validateLimit: default 20, max 100', () => {
  assertEquals(validateLimit(undefined), 20);
  assertEquals(validateLimit(500), 100);
  assertThrows(() => validateLimit(0));
  assertThrows(() => validateLimit(2.5));
  assertThrows(() => validateLimit('3'));
});

Deno.test('payMonthFor: pay months run 10th to 10th', () => {
  assertEquals(payMonthFor(2026, 11, 14), { year: 2026, month: 11 });
  assertEquals(payMonthFor(2026, 11, 10), { year: 2026, month: 11 });
  assertEquals(payMonthFor(2026, 11, 9), { year: 2026, month: 10 });
  assertEquals(payMonthFor(2027, 1, 5), { year: 2026, month: 12 });
});

Deno.test('ag snaps float drift', () => {
  assertEquals(ag(0.1 + 0.2), 0.3);
  assertEquals(ag(null), 0);
});

const month = (o: Partial<MonthRow> = {}): MonthRow => ({
  id: 'm1', year: 2026, month_num: 11,
  income_petachya: 5000, income_clalit: 10000.1, income_private: 200, income_other: 0, charity_pct: null, ...o,
});
const base = (o: Partial<MonthInput> = {}): MonthInput => ({
  month: month(), budgets: [], budgetItems: [], transactions: [], incomeItems: [],
  travelPayments: [], charityPayments: [], adminSubItems: [], adminItemIdsThisYear: [], ...o,
});
const cat = (r: ReturnType<typeof computeMonth>, k: string) => r.categories.find((c) => c.key === k)!;
const tx = (category: string, amount: number) => ({
  category, amount, store: null, item: null, date: '2026-11-12', notes: null, month_id: 'm1',
});

Deno.test('income = months.income_* + extra income items', () => {
  const r = computeMonth(base({ incomeItems: [{ month_id: 'm1', label: 'gift', amount: 99.9, created_at: 'x' }] }));
  assertEquals(r.income.extra_items, 99.9);
  assertEquals(r.income.total, 15300);
  assertEquals(r.month, '2026-11');
});

Deno.test('planned = budget_items total when items exist, else budgets row', () => {
  const r = computeMonth(base({
    budgets: [{ category: 'groceries', amount: 1000 }, { category: 'takeout', amount: 300 }],
    budgetItems: [{ category: 'groceries', amount: 400 }, { category: 'groceries', amount: 250.5 }],
  }));
  assertEquals(cat(r, 'groceries').planned, 650.5);
  assertEquals(cat(r, 'groceries').planned_from, 'budget_items');
  assertEquals(cat(r, 'takeout').planned, 300);
  assertEquals(cat(r, 'takeout').planned_from, 'budgets');
});

Deno.test('left to budget = income - (categories + savings)', () => {
  const r = computeMonth(base({
    budgets: [
      { category: 'groceries', amount: 2000 },
      { category: 'savings_bank', amount: 3000 },
      { category: 'savings_invested', amount: 1000 },
    ],
    budgetItems: [{ category: 'housing', amount: 5000 }],
  }));
  assertEquals(r.budgeted_total, 11000);
  assertEquals(r.left_to_budget, ag(15200.1 - 11000));
  assertEquals(r.savings, { bank: 3000, invested: 1000 });
});

Deno.test('spent: transactions, hasLines floor, tab payments for this month only', () => {
  const r = computeMonth(base({
    budgetItems: [{ category: 'housing', amount: 5000 }],
    transactions: [tx('groceries', 100.1), tx('groceries', 50.2), tx('housing', 100), tx('nonsense', 9)],
    travelPayments: [{ month_num: 11, amount: 700 }, { month_num: 3, amount: 9999 }],
    charityPayments: [{ month_num: 11, amount: 50 }],
    adminItemIdsThisYear: ['a1'],
    adminSubItems: [
      { item_id: 'a1', amount: 120, is_paid: true, month_num: 11 },
      { item_id: 'a1', amount: 500, is_paid: false, month_num: 11 },
      { item_id: 'old', amount: 777, is_paid: true, month_num: 11 },
    ],
  }));
  assertEquals(cat(r, 'groceries').spent, 150.3);
  assertEquals(cat(r, 'housing').spent, 5000); // floored at committed lines
  assertEquals(cat(r, 'travel').spent, 700);
  assertEquals(cat(r, 'admin').spent, 120);
  assertEquals(cat(r, 'charity').spent, 50);
});

Deno.test('charity_pct overrides the charity budget row (like the app render)', () => {
  const r = computeMonth(base({ month: month({ charity_pct: 10 }), budgets: [{ category: 'charity', amount: 1 }] }));
  assertEquals(cat(r, 'charity').planned, Math.round(15200.1 * 0.1));
  assertEquals(cat(r, 'charity').planned_from, 'charity_pct x income');
});

Deno.test('every app category is present, in order', () => {
  const r = computeMonth(base());
  assertEquals(r.categories.map((c) => c.key), CATEGORIES.map((c) => c.key));
  assertEquals(r.currency, 'ILS');
});

Deno.test('shapers keep amounts as numbers and map pay month', () => {
  const labels = new Map([['m1', '2026-11']]);
  const s = shapeSpending([{ ...tx('groceries', 12.5), notes: 'n' }], labels);
  assertEquals(s[0].amount, 12.5);
  assertEquals(s[0].pay_month, '2026-11');
  assertEquals(s[0].note, 'n');
  const i = shapeIncome([{ month_id: 'zz', label: 'a', amount: 3, created_at: 't' }], labels);
  assertEquals(i[0].pay_month, null);
  assertEquals(shapeCategories().length, 16);
});

Deno.test('left_to_budget_shown rounds to whole shekels, never -0', () => {
  // income 15200.1, budgeted 15200.52 -> -0.42
  const r = computeMonth(base({ budgets: [{ category: 'groceries', amount: 15200.52 }] }));
  assertEquals(r.left_to_budget, -0.42);
  assertEquals(r.left_to_budget_shown, 0);
  assert(Object.is(r.left_to_budget_shown, 0));
});

Deno.test('caveats: income_caveat present, tab categories carry spent_basis', () => {
  const r = computeMonth(base());
  assert(r.income_caveat.includes('estimated'));
  assert(cat(r, 'travel').spent_basis!.includes('payments so far'));
  assertEquals(cat(r, 'groceries').spent_basis, undefined);
});
