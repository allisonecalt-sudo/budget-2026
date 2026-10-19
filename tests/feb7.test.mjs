// Pins lib/feb7.ts — "what is left on Feb 7 if I quit": the window of months, the
// month-by-month projection (with every fill named), the trips and one-offs due
// before then, the 2027 cash path, and the answer by spending level. Runs under
// node:test with no browser and no Supabase (npm run test:unit builds dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const feb7Js = resolve(here, '..', 'dist', 'lib', 'feb7.js');
const scenariosJs = resolve(here, '..', 'dist', 'lib', 'scenarios.js');
assert.ok(existsSync(feb7Js), 'dist/lib/feb7.js is missing — run `npm run build` first.');
const {
  feb7Window,
  feb7Passed,
  projectFeb7,
  potsDueBefore,
  cashPath,
  answerByLevel,
  buildFeb7Input,
} = await import(pathToFileURL(feb7Js).href);
const { planIncomeForMonth } = await import(pathToFileURL(scenariosJs).href);

test('feb7Window: months after today through January 2027 (Feb 7 is in the Jan 10 – Feb 10 pay month)', () => {
  assert.deepEqual(feb7Window({ year: 2026, month: 10 }), [
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
    { year: 2027, month: 1 },
  ]);
  assert.deepEqual(feb7Window({ year: 2026, month: 12 }), [{ year: 2027, month: 1 }]);
  assert.deepEqual(feb7Window({ year: 2027, month: 1 }), []);
  assert.deepEqual(feb7Window({ year: 2027, month: 3 }), []);
  assert.equal(feb7Passed('2027-02-06'), false);
  assert.equal(feb7Passed('2027-02-07'), true);
});

const base = () => ({
  liquidNow: 20000,
  thisMonth: { year: 2026, month: 10 },
  thisMonthIncome: 14000,
  restOfThisMonth: 1500,
  fixedKeys: ['housing', 'recurring'],
  envelopeKeys: ['groceries', 'takeout'],
  fallback: {
    fixedByCat: { housing: 3500, recurring: 1500 },
    envelopeByCat: { groceries: 1200, takeout: 300 },
  },
  months: [
    {
      ym: { year: 2026, month: 11 },
      income: 15000,
      fixedByCat: { housing: 3500, recurring: 1500 },
      envelopeByCat: { groceries: 1800, takeout: 400 },
      charity: 750,
      invested: 0,
    },
    {
      ym: { year: 2026, month: 12 },
      income: 15000,
      fixedByCat: { housing: 3500, recurring: 1500 },
      envelopeByCat: { groceries: 0, takeout: 400 },
      charity: 750,
      invested: 1000,
    },
    {
      ym: { year: 2027, month: 1 },
      income: 0,
      fixedByCat: { housing: 3500 },
      envelopeByCat: {},
      charity: 0,
      invested: 0,
    },
  ],
  potsDue: { total: 2000, lines: [{ label: 'Trip', amount: 2000 }] },
});

test('projectFeb7 worked example: 20,000 now, 1,500 left of this month, three months, 2,000 of trips → 38,700 (estimate)', () => {
  const r = projectFeb7(base());
  assert.deepEqual(r.rows, [
    {
      ym: { year: 2026, month: 11 },
      income: 15000,
      spend: 7950,
      net: 7050,
      cashAfter: 25550,
      incomeFrom: null,
      filled: [],
      usual: [],
    },
    {
      ym: { year: 2026, month: 12 },
      income: 15000,
      spend: 8350,
      net: 6650,
      cashAfter: 32200,
      incomeFrom: null,
      filled: ['groceries'],
      usual: [],
    },
    {
      ym: { year: 2027, month: 1 },
      income: 15000,
      spend: 6500,
      net: 8500,
      cashAfter: 40700,
      incomeFrom: { year: 2026, month: 12 },
      filled: ['recurring', 'groceries', 'takeout'],
      usual: [],
    },
  ]);
  assert.equal(r.start, 20000);
  assert.equal(r.restOfThisMonth, 1500);
  assert.equal(r.potsDue, 2000);
  assert.equal(r.end, 38700);
  assert.equal(r.estimate, true);
});

test('Y2: every row adds up on screen — a filled pace with agorot is rounded before it is summed, so in − out === net as displayed', () => {
  const input = base();
  // A pace with agorot, like 1,000 ÷ 6 months: the old code summed 166.67 and showed a row that did not add up.
  input.fallback = {
    fixedByCat: { housing: 3500, recurring: 1500.4 },
    envelopeByCat: { groceries: 1200.6, takeout: 166.67 },
  };
  const r = projectFeb7(input);
  assert.ok(
    r.rows.some((m) => m.filled.length > 0),
    'the fixture must exercise a fill',
  );
  for (const m of r.rows) {
    assert.equal(
      Math.round(m.income) - Math.round(m.spend),
      Math.round(m.net),
      m.ym.year + '-' + m.ym.month + ': ' + m.income + ' - ' + m.spend + ' != ' + m.net,
    );
  }
  // Jan 2027 fills recurring, groceries, takeout: 3500 + 1500 + 1201 + 167 = 6368 out.
  assert.equal(r.rows[2].spend, 3500 + 1500 + 1201 + 167);
  assert.equal(r.rows[2].net, 15000 - (3500 + 1500 + 1201 + 167));
});

test('projectFeb7: nothing guessed → not an estimate; no months → start − rest of month − trips', () => {
  const full = base();
  full.months[1].envelopeByCat.groceries = 1200;
  full.months[2] = {
    ym: { year: 2027, month: 1 },
    income: 15000,
    fixedByCat: { housing: 3500, recurring: 1500 },
    envelopeByCat: { groceries: 1200, takeout: 300 },
    charity: 0,
    invested: 0,
  };
  assert.equal(projectFeb7(full).estimate, false);
  const empty = { ...base(), months: [] };
  assert.equal(projectFeb7(empty).end, 20000 - 1500 - 2000);
});

test('potsDueBefore: unpaid on this year’s rows + later rows up to Jan 2027, largest first', () => {
  const rows = [
    { label: 'Trip', group: 'Trips', planned: 3000, paid: 1000, estimate: false },
    { label: 'Course', group: 'Professional', planned: 1200, paid: 1200, estimate: false },
    { label: 'Paid, not tied to an item', group: 'Other', planned: 0, paid: 500, estimate: false },
  ];
  const later = [
    { label: 'Car test', year: 2027, month: 1, amount: 400 },
    { label: 'Dentist', year: 2027, month: 3, amount: 750 },
  ];
  const r = potsDueBefore(rows, later, { year: 2027, month: 1 }, { year: 2026, month: 10 });
  assert.equal(r.total, 2400);
  assert.deepEqual(r.lines, [
    { label: 'Trip', amount: 2000 },
    { label: 'Car test', amount: 400 },
  ]);
});

test('cashPath: cash after each month at a steady spend; the soft line flags only what is UNDER it', () => {
  const months = [
    { ym: { year: 2027, month: 2 }, income: 10000, notes: [] },
    { ym: { year: 2027, month: 3 }, income: 12000, notes: [] },
    { ym: { year: 2027, month: 4 }, income: 8000, notes: [] },
  ];
  const a = cashPath(30000, months, 11000, 25000);
  assert.deepEqual(
    a.rows.map((x) => x.cash),
    [29000, 30000, 27000],
  );
  assert.deepEqual(a.lowest, { ym: { year: 2027, month: 4 }, cash: 27000 });
  assert.equal(a.end, 27000);
  assert.equal(a.firstUnder, null);
  const b = cashPath(26000, months, 11000, 25000);
  assert.deepEqual(
    b.rows.map((x) => x.cash),
    [25000, 26000, 23000],
  );
  assert.deepEqual(b.firstUnder, { year: 2027, month: 4 }); // 25,000 itself is not under
});

test('answerByLevel: Normal 14,429 against 14,609–15,431 → +180 to +1,002, cash never below ₪48,007 (Aug 2027)', () => {
  const pathMonths = [];
  for (let m = 2; m <= 12; m++) {
    const p = planIncomeForMonth({ year: 2027, month: m }, 4);
    pathMonths.push({ ym: { year: 2027, month: m }, income: p.total, notes: p.notes });
  }
  const [a] = answerByLevel(
    [{ key: 'normal', total: 14429 }],
    14609,
    15431,
    26000,
    53260,
    64000,
    25000,
    pathMonths,
  );
  assert.equal(a.resLow, 180);
  assert.equal(a.resHigh, 1002);
  assert.equal(a.lastsFromNow, null);
  assert.equal(a.lastsFromFeb7, null);
  assert.deepEqual(a.path.lowest.ym, { year: 2027, month: 8 });
  assert.equal(a.path.lowest.cash, 48007);
  assert.equal(a.path.firstUnder, null);
  const [x] = answerByLevel(
    [{ key: 'x', total: 15000 }],
    14000,
    15431,
    26000,
    53260,
    64000,
    25000,
    [],
  );
  assert.equal(x.resLow, -1000);
  assert.deepEqual(x.lastsFromFeb7, { months: 53.3, extraWithReserve: 64 });
});

test('buildFeb7Input: rest of this month 900, Nov/Dec/Jan read from their own rows, gaps left for the fills', () => {
  const months = [];
  for (let m = 1; m <= 12; m++)
    months.push({
      id: 'm' + m,
      year: 2026,
      month_num: m,
      month_name: 'M' + m,
      income_petachya: 10000,
      income_clalit: 0,
      income_private: 0,
      income_other: 0,
      charity_pct: 0,
    });
  months.push({
    id: 'j27',
    year: 2027,
    month_num: 1,
    month_name: 'January',
    income_petachya: 0,
    income_clalit: 0,
    income_private: 0,
    income_other: 0,
    charity_pct: 0,
  });
  const budgetItems = [9, 10, 11, 12].map((m) => ({
    month_id: 'm' + m,
    category: 'housing',
    label: 'Rent',
    amount: 3000,
  }));
  const d = {
    today: { year: 2026, month: 10 },
    months,
    txns: [
      { month_id: 'm9', category: 'groceries', amount: 1000 },
      { month_id: 'm10', category: 'groceries', amount: 600 },
    ],
    budgetItems,
    budgets: [
      { month_id: 'm10', category: 'groceries', amount: 1500 },
      { month_id: 'm11', category: 'groceries', amount: 1400 },
      { month_id: 'm12', category: 'groceries', amount: 1400 },
    ],
    incomeItems: [],
    travelItems: [{ id: 't1', year: 2026, label: 'Trip', projected_amount: 2000 }],
    travelPaid: [],
    adminItems: [],
    adminPaid: [],
    laterUnpaid: [],
  };
  const categories = [
    { key: 'groceries', label: 'Groceries', emoji: '' },
    { key: 'housing', label: 'Housing', emoji: '', hasLines: true },
    { key: 'travel', label: 'Travel', emoji: '', hasTab: true },
    { key: 'charity', label: 'Charity', emoji: '' },
  ];
  const i = buildFeb7Input(d, categories, { fromMonth: {}, zero: [] }, 5000);
  assert.equal(i.liquidNow, 5000);
  assert.equal(i.thisMonthIncome, 10000);
  assert.equal(i.restOfThisMonth, 900);
  assert.deepEqual(
    i.months.map((m) => m.ym),
    [
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ],
  );
  assert.equal(i.months[0].fixedByCat.housing, 3000);
  assert.equal(i.months[0].envelopeByCat.groceries, 1400);
  assert.equal(i.months[2].income, 0);
  assert.deepEqual(i.months[2].fixedByCat, {});
  assert.deepEqual(i.months[2].envelopeByCat, {});
  assert.equal(i.fallback.fixedByCat.housing, 3000);
  assert.ok(Math.abs(i.fallback.envelopeByCat.groceries - 1000 / 6) < 0.01);
  assert.equal(i.potsDue.total, 2000);
});

// ── X1 · five formulas the chunk A mutation check got past ────────────────

// A tiny year: today Oct 2026; Nov 2026 is the month under test. `nov` holds the
// extra rows that make it different, `novMonth` overrides its month row.
function buildNov({ novMonth = {}, budgets = [], budgetItems = [], templates } = {}) {
  const row = (id, year, month_num, extra = {}) => ({
    id,
    year,
    month_num,
    month_name: 'M' + month_num,
    income_petachya: 10000,
    income_clalit: 0,
    income_private: 0,
    income_other: 0,
    charity_pct: 0,
    ...extra,
  });
  const months = [];
  for (let m = 1; m <= 12; m++) months.push(row('m' + m, 2026, m, m === 11 ? novMonth : {}));
  months.push(row('j27', 2027, 1, { income_petachya: 0 }));
  const d = {
    today: { year: 2026, month: 10 },
    months,
    txns: [],
    budgetItems,
    budgets,
    incomeItems: [],
    travelItems: [],
    travelPaid: [],
    adminItems: [],
    adminPaid: [],
    laterUnpaid: [],
    templates,
  };
  const categories = [
    { key: 'groceries', label: 'Groceries', emoji: '' },
    { key: 'housing', label: 'Housing', emoji: '', hasLines: true },
    { key: 'charity', label: 'Charity', emoji: '' },
  ];
  return buildFeb7Input(d, categories, { fromMonth: {}, zero: [] }, 5000);
}
const nov = (i) => i.months.find((m) => m.ym.month === 11);

test('charity: income × her percent, exactly — and the budgets row only when no percent is set', () => {
  // 10,000 income at 5% = 500 (a /10 or ×10 slip would give 50 or 5,000).
  assert.equal(nov(buildNov({ novMonth: { charity_pct: 5 } })).charity, 500);
  assert.equal(nov(buildNov({ novMonth: { charity_pct: 2.5 } })).charity, 250);
  // No percent: what the month's budgets row holds.
  const rows = [{ month_id: 'm11', category: 'charity', amount: 321 }];
  assert.equal(nov(buildNov({ budgets: rows })).charity, 321);
  // A percent with no income cannot make charity: it falls back to the row.
  const noIncome = buildNov({ novMonth: { charity_pct: 5, income_petachya: 0 }, budgets: rows });
  assert.equal(nov(noIncome).charity, 321);
});

test('investing: the money moved to investing is read from the month and comes off the cash', () => {
  const none = buildNov();
  const some = buildNov({
    budgets: [{ month_id: 'm11', category: 'savings_invested', amount: 750 }],
  });
  assert.equal(nov(none).invested, 0);
  assert.equal(nov(some).invested, 750);
  // …and it changes the answer by exactly that much (savings to the bank do not).
  const a = projectFeb7(none);
  const b = projectFeb7(some);
  assert.equal(a.rows[0].spend - b.rows[0].spend, -750);
  assert.equal(a.end - b.end, 750);
  const bank = buildNov({ budgets: [{ month_id: 'm11', category: 'savings_bank', amount: 900 }] });
  assert.equal(projectFeb7(bank).end, a.end);
});

test('a ₪0 fill is not an estimate: nothing to fill with means nothing marked, nothing in `filled`', () => {
  const zeroFallback = {
    ...base(),
    fallback: {
      fixedByCat: { housing: 0, recurring: 0 },
      envelopeByCat: { groceries: 0, takeout: 0 },
    },
    months: [
      {
        ym: { year: 2026, month: 11 },
        income: 15000,
        fixedByCat: { housing: 3500 }, // recurring missing, and bills-now is ₪0
        envelopeByCat: { groceries: 1000 }, // takeout missing, and its pace is ₪0
        charity: 0,
        invested: 0,
      },
    ],
  };
  const r = projectFeb7(zeroFallback);
  assert.deepEqual(r.rows[0].filled, []);
  assert.equal(r.rows[0].spend, 4500);
  assert.equal(r.estimate, false);
  // The same gaps WITH something to fill them are named, so the guard is not vacuous.
  const filled = projectFeb7({
    ...zeroFallback,
    fallback: {
      fixedByCat: { housing: 0, recurring: 1500 },
      envelopeByCat: { groceries: 0, takeout: 300 },
    },
  });
  assert.deepEqual(filled.rows[0].filled, ['recurring', 'takeout']);
  assert.equal(filled.rows[0].spend, 6300);
  assert.equal(filled.estimate, true);
});

test('bills reading order: a month with BOTH lines and a budgets row — lines win for bills, the budgets row wins for everyday', () => {
  const both = buildNov({
    budgetItems: [
      { month_id: 'm11', category: 'housing', label: 'Rent', amount: 3000 },
      { month_id: 'm11', category: 'housing', label: 'Arnona', amount: 400 },
      { month_id: 'm11', category: 'groceries', label: 'Shop', amount: 900 },
    ],
    budgets: [
      { month_id: 'm11', category: 'housing', amount: 2500 },
      { month_id: 'm11', category: 'groceries', amount: 1400 },
    ],
  });
  assert.equal(nov(both).fixedByCat.housing, 3400); // the lines (3,000 + 400), not the 2,500 row
  assert.equal(nov(both).envelopeByCat.groceries, 1400); // the budgets row, not the 900 line
  // Lines that add to 0 do not count as "has lines": the budgets row is read.
  const zeroLines = buildNov({
    budgetItems: [{ month_id: 'm11', category: 'housing', label: 'Rent', amount: 0 }],
    budgets: [{ month_id: 'm11', category: 'housing', amount: 2500 }],
  });
  assert.equal(nov(zeroLines).fixedByCat.housing, 2500);
  // No budgets row for an everyday category: its lines are read.
  const linesOnly = buildNov({
    budgetItems: [{ month_id: 'm11', category: 'groceries', label: 'Shop', amount: 900 }],
  });
  assert.equal(nov(linesOnly).envelopeByCat.groceries, 900);
});

test('trips due later: after today, and no later than the pay month Feb 7 falls in — both edges pinned', () => {
  const later = (month, year = 2027) => ({
    label: 'Y' + year + '-' + month,
    year,
    month,
    amount: 100,
  });
  const today = { year: 2026, month: 10 };
  const until = { year: 2027, month: 1 };
  const labels = (rows) =>
    potsDueBefore([], rows, until, today)
      .lines.map((l) => l.label)
      .sort();
  // The bound itself (January 2027) is in; the month after (February) is out.
  assert.deepEqual(labels([later(1), later(2)]), ['Y2027-1']);
  // Today's own month is out (its rows are already in the pot rows); the next month is in.
  assert.deepEqual(labels([{ ...later(10, 2026) }, { ...later(11, 2026) }]), ['Y2026-11']);
  // An undated or earlier row is not due "later".
  assert.deepEqual(labels([later(9, 2026), later(12, 2026)]), ['Y2026-12']);
  assert.equal(potsDueBefore([], [later(1), later(2)], until, today).total, 100);
});

test('Z2: agorot in, whole shekels out - every chain adds exactly as shown', () => {
  // The checker's repro: cash ₪58,806.66 + a month of +₪8,225.67 must read ₪58,807 + ₪8,226 = ₪67,033.
  const path = cashPath(
    58806.66,
    [{ ym: { year: 2027, month: 3 }, income: 15270.67, notes: [] }],
    7045.33,
    25000,
  );
  assert.equal(path.start, 58807);
  assert.equal(path.rows[0].income, 15271);
  assert.equal(path.rows[0].spend, 7045);
  assert.equal(path.rows[0].net, 8226);
  assert.equal(path.rows[0].cash, 67033);
  assert.equal(path.start + path.rows[0].net, path.rows[0].cash);
  // Every row of a longer path: previous cash + net === cash, in − out === net, all whole.
  const months = [];
  for (let m = 1; m <= 11; m++)
    months.push({ ym: { year: 2027, month: m }, income: 9000.4 + m * 313.37, notes: [] });
  const long = cashPath(12345.67, months, 7045.33, 25000);
  let prev = long.start;
  for (const r of long.rows) {
    assert.ok(Number.isInteger(r.cash) && Number.isInteger(r.net), JSON.stringify(r));
    assert.equal(r.income - r.spend, r.net);
    assert.equal(prev + r.net, r.cash);
    prev = r.cash;
  }
  assert.equal(long.end, prev);
  // answerByLevel takes agorot in and hands whole shekels back.
  const [a] = answerByLevel(
    [{ key: 'lean', total: 7045.33 }],
    14608.6,
    15431.4,
    26000.5,
    53258.7,
    64000,
    25000,
    months,
  );
  assert.equal(a.total, 7045);
  assert.equal(a.resLow, 14609 - 7045);
  assert.equal(a.resHigh, 15431 - 7045);
  assert.equal(a.path.start, 53259);
});

test('Z2: projectFeb7 sums whole shekels - left now, rest of the month, each month, each pot line', () => {
  const r = projectFeb7({
    liquidNow: 26000.4,
    thisMonth: { year: 2026, month: 10 },
    thisMonthIncome: 21000,
    restOfThisMonth: 259.67,
    fixedKeys: ['housing'],
    envelopeKeys: ['groceries'],
    fallback: { fixedByCat: {}, envelopeByCat: {} },
    months: [
      {
        ym: { year: 2026, month: 11 },
        income: 20999.6,
        fixedByCat: { housing: 3500.4 },
        envelopeByCat: { groceries: 1800.4 },
        charity: 1049.8,
        invested: 0,
      },
    ],
    potsDue: {
      total: 1300.9,
      lines: [
        { label: 'a', amount: 1000.4 },
        { label: 'b', amount: 300.5 },
      ],
    },
  });
  assert.equal(r.start, 26000);
  assert.equal(r.restOfThisMonth, 260);
  const m = r.rows[0];
  assert.equal(m.income - m.spend, m.net);
  assert.equal(r.start - r.restOfThisMonth + m.net - r.potsDue, r.end);
  assert.equal(
    r.potsLines.reduce((a, l) => a + l.amount, 0),
    r.potsDue,
  );
  for (const v of [r.start, r.restOfThisMonth, m.income, m.spend, m.net, r.potsDue, r.end])
    assert.ok(Number.isInteger(v), String(v));
});

test('W6: a January with no bill lines reads her usual bill lines (templates), not this month; with none it falls back', () => {
  const tpl = [
    { category: 'housing', amount: 3000.4 },
    { category: 'housing', amount: 500 },
    { category: 'groceries', amount: 999 }, // not a bill: ignored
  ];
  const jan = (i) => i.months.find((m) => m.ym.year === 2027);
  const withTpl = buildNov({ templates: tpl });
  assert.equal(jan(withTpl).fixedByCat.housing, 3500.4);
  assert.deepEqual(jan(withTpl).usualKeys, ['housing']);
  assert.equal(jan(withTpl).envelopeByCat.groceries, undefined);
  // No templates: January stays empty and projectFeb7 fills it from this month's bills.
  const none = buildNov({});
  assert.deepEqual(jan(none).fixedByCat, {});
  assert.equal(jan(none).usualKeys, undefined);
  // Lines in January win over the templates.
  const lines = buildNov({
    templates: tpl,
    budgetItems: [{ month_id: 'j27', category: 'housing', label: 'Rent', amount: 3200 }],
  });
  assert.equal(jan(lines).fixedByCat.housing, 3200);
  assert.equal(jan(lines).usualKeys, undefined);
  // The row says where the number came from.
  const r = projectFeb7({
    ...withTpl,
    fallback: { fixedByCat: { housing: 9999 }, envelopeByCat: {} },
  });
  assert.deepEqual(r.rows[r.rows.length - 1].usual, ['housing']);
  assert.deepEqual(r.rows[r.rows.length - 1].filled, []);
  assert.equal(r.estimate, true);
});

test('R7: an item with under ₪1 left unpaid is not a "still to pay" line (no "Licence renewal ₪0")', () => {
  const rows = [
    { label: 'Licence renewal', group: 'Professional', planned: 600.4, paid: 600, estimate: false },
    { label: 'Postage', group: 'Other', planned: 100.75, paid: 0, estimate: false },
    { label: 'Almost', group: 'Other', planned: 10.99, paid: 10, estimate: false },
    { label: 'One shekel', group: 'Other', planned: 11, paid: 10, estimate: false },
  ];
  const later = [{ label: 'Crumb', year: 2027, month: 1, amount: 0.6 }];
  const r = potsDueBefore(rows, later, { year: 2027, month: 1 }, { year: 2026, month: 10 });
  assert.deepEqual(
    r.lines.map((l) => l.label),
    ['Postage', 'One shekel'],
  );
  assert.ok(r.lines.every((l) => l.amount >= 1));
});
