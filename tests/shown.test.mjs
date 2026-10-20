// What this is: pure unit tests pinning lib/shown.ts - "what is shown".
// Why it exists: three review rounds found "shown parts don't add to the shown total" in a new
//   card each time. Rounding each part and adding them made the stack disagree with the Budget
//   ribbon and the Cash tab; apportioning the total's shekels over the parts made the SAME
//   figure print a shekel apart in two places. Her rule (round 3): every figure prints ITS OWN
//   rounding (roundZ, the app's rule); every total prints its SOURCE's rounded number; when the
//   printed parts don't add, ONE visible "agorot, rounded" row closes the sum. These tests pin
//   that with the cases that went wrong.
// What's decided: runs against the COMPILED module (dist/lib/shown.js), so `npm run build`
//   must run first. Uses node:test.
// Links: lib/shown.ts · tests/analyze-stack.spec.js (the page-wide invariant + cross-group test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'shown.js');
assert.ok(existsSync(compiled), 'dist/lib/shown.js missing - run `npm run build` first');
const S = await import(pathToFileURL(compiled).href);

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('there is no half-away-from-zero helper and no apportioning any more', () => {
  assert.equal(S.whole, undefined);
  assert.equal(S.apportion, undefined);
  assert.equal(S.ROUNDING_LABEL, 'agorot, rounded');
  assert.equal(S.ROUNDING_LABEL_AVG, 'rounding'); // gaps from averages / ÷ 12
});

test('trueSum / totalOf: exact to the agorot, then rounded ONCE with the app’s rule (Math.round)', () => {
  assert.equal(S.trueSum([0.1, 0.2, 0.2]), 0.5);
  assert.equal(S.totalOf([0.1, 0.2, 0.2]), 1);
  assert.equal(S.totalOf([7090.5, 2100.67]), 9191);
  assert.equal(S.totalOf([24000.4, 2100.4, -50.3]), 26051);
  assert.equal(S.totalOf([-0.5]), 0); // roundZ(-0.5): never -0
  assert.ok(Object.is(S.totalOf([-0.5]), 0));
  assert.equal(S.totalOf([-4300.5]), -4300); // Math.round goes toward +infinity on a half
  assert.equal(S.totalOf([]), 0);
});

test('shownSum: parts print their own rounding, the total is the true sum rounded, the residual closes it', () => {
  const s = S.shownSum([7090.5, 2100.67]);
  assert.deepEqual(s.parts, [7091, 2101]);
  assert.equal(s.total, 9191);
  assert.equal(s.residual, -1);
  assert.equal(sum(s.parts) + s.residual, s.total);
  const exact = S.shownSum([10.2, 20.3]);
  assert.deepEqual([exact.total, exact.residual], [31, 1]); // 10.2 + 20.3 = 30.5 -> 31; parts 10 + 20
  assert.equal(S.shownSum([]).residual, 0);
});

test('shownChain: the old Left now case - parts 24,000 + 2,100 − 50, total 26,051, one row of +1', () => {
  const c = S.shownChain([{ value: 24000.4 }, { value: 2100.4 }, { value: 50.3, minus: true }]);
  assert.deepEqual(c.parts, [24000, 2100, 50]);
  assert.deepEqual(c.signed, [24000, 2100, -50]);
  assert.equal(c.total, 26051);
  assert.equal(c.residual, 1);
  assert.equal(sum(c.signed) + c.residual, c.total);
});

test('shownDiff', () => {
  assert.deepEqual(S.shownDiff(20000.4, 15000.6), { a: 20000, b: 15001, diff: 5000, residual: 1 });
  assert.deepEqual(S.shownDiff(100.2, 100.2), { a: 100, b: 100, diff: 0, residual: 0 });
});

test('shownByKey: lines print their own rounding; the total is the true sum rounded', () => {
  const k = S.shownByKey({ a: 100.5, b: 200.4, c: 300.4 });
  assert.deepEqual(k.lines, { a: 101, b: 200, c: 300 });
  assert.equal(k.total, 601);
  assert.equal(k.residual, 0);
  const j = S.shownByKey({ a: 0.4, b: 0.4, c: 0.4 });
  assert.deepEqual([j.total, j.residual], [1, 1]);
});

test('cashShown: Left now is roundZ(Total Liquid − the whole-shekel what-if); each figure is its own rounding', () => {
  const base = { holdings: 24000.4, owed: 2100.4, debts: [50.3], liquid: 26050.5 };
  const none = S.cashShown({ ...base, oneOff: 0 });
  assert.deepEqual(
    [none.holdings, none.owed, none.debts, none.oneOff, none.liquid, none.leftNow, none.residual],
    [24000, 2100, [50], 0, 26051, 26051, 1], // the Cash tab prints Holdings 24,000 and Total Liquid 26,051
  );
  const w = S.cashShown({ ...base, oneOff: 1000 });
  assert.equal(w.leftNow, 25051); // = Total Liquid 26,051 − 1,000
  assert.equal(w.leftNow, none.liquid - 1000);
  // A negative .50: liquid 1,000.50 with a ₪2,000 what-if is −999.50 -> Math.round -> −999 = 1,001 − 2,000.
  const neg = S.cashShown({ holdings: 1000.5, owed: 0, debts: [], liquid: 1000.5, oneOff: 2000 });
  assert.equal(neg.leftNow, -999);
  assert.equal(neg.leftNow, neg.liquid - 2000);
  assert.equal(neg.residual, neg.leftNow - (neg.holdings - 2000));
  // The what-if is whole shekels: a typed agorot value is rounded once, and every chain uses that.
  assert.equal(S.cashShown({ ...base, oneOff: 1234.56 }).oneOff, 1235);
});

test('ribbonLeftShown: the ribbon’s own left; Jan 2027 ₪3,000.50 line, no income -> −₪4,300 with a +1 row', () => {
  const r = S.ribbonLeftShown({ income: 0, budgeted: 4300.5, left: -4300.5 });
  assert.deepEqual(r, { income: 0, budgeted: 4301, left: -4300, residual: 1 });
  const z = S.ribbonLeftShown({ income: 100.1, budgeted: 100.6, left: -0.5 });
  assert.deepEqual([z.left, z.income, z.budgeted], [0, 100, 101]);
  assert.ok(Object.is(z.left, 0));
});

test('planIncomeShown: petachya + gan 2 + clients − US tax = income', () => {
  const p = S.planIncomeShown({ petachya: 9700.4, gan2: 1819.6, clients: 3389.5, se: 12.5 });
  assert.deepEqual(p, {
    petachya: 9700,
    gan2: 1820,
    clients: 3390,
    se: 13,
    income: 14897,
    residual: 0,
  });
});

test('monthNowShown: every figure its own rounding; headline = the true month rounded; residuals close each sum', () => {
  const m = S.monthNowShown({
    bills: 4650,
    everydayByCat: [
      { key: 'groceries', value: 1040.6 },
      { key: 'takeout', value: 40.5 },
      { key: 'health', value: 310.4 },
    ],
    charity: 1050.4,
    oneOffsMo: 2563.3,
    oneOffsLeanMo: 2100.67,
  });
  assert.deepEqual(
    m.everydayRows.map((r) => r.value),
    [1041, 41, 310],
  );
  assert.deepEqual([m.everyday, m.everydayResidual], [1392, 0]);
  assert.deepEqual([m.bills, m.charity, m.base, m.baseResidual], [4650, 1050, 7092, 0]);
  assert.deepEqual([m.lean, m.headline, m.headlineResidual], [2101, 9193, 0]);
  assert.equal(m.withNormal, 9655);
});

test('monthNowShown: the old 9,192 case - base 7,090.5 + trips 2,100.67 is 9,191; the face parts 7,091 + 2,101 need a −1 row', () => {
  const m = S.monthNowShown({
    bills: 7090.5,
    everydayByCat: [],
    charity: 0,
    oneOffsMo: 2563.3,
    oneOffsLeanMo: 2100.67,
  });
  assert.deepEqual([m.base, m.lean, m.headline, m.headlineResidual], [7091, 2101, 9191, -1]);
  const none = S.monthNowShown({
    bills: 10,
    everydayByCat: [],
    charity: 0,
    oneOffsMo: 0,
    oneOffsLeanMo: 0,
  });
  assert.equal(none.headline, 10);
});

test('yearWayShown: whole-year pill case - income not yet budgeted + budgeted-not-spent = the gap', () => {
  const y = S.yearWayShown({
    partsAvg: [4650.2, 2410.4, 790.2, 1050.2],
    incomeAvg: 21000,
    savingsAvg: 1500,
    unspentAvg: 2562.6,
  });
  assert.deepEqual(y.parts, [4650, 2410, 790, 1050]);
  assert.deepEqual([y.realSpend, y.realResidual], [8901, 1]);
  assert.deepEqual([y.herWay, y.wayResidual], [19500, 0]);
  assert.deepEqual([y.gap, y.gapResidual], [10599, 0]);
  assert.deepEqual([y.unspent, y.notBudgeted, y.splitResidual], [2563, 8036, 0]);
  assert.equal(y.kind, 'split');
});

test('yearWayShown: the old page’s gap is the TRUE gap rounded - 19,501 − 7,992 prints 11,508 with a −1 row', () => {
  const y = S.yearWayShown({
    partsAvg: [7992.4],
    incomeAvg: 21001,
    savingsAvg: 1500.4,
    unspentAvg: 3400,
  });
  assert.deepEqual([y.herWay, y.realSpend, y.gap, y.gapResidual], [19501, 7992, 11508, -1]);
});

test('yearWayShown: under 50 says nothing; negative gap = less than real spend, no split; a negative part shows only the gap', () => {
  const base = { partsAvg: [5000, 3000], savingsAvg: 1000 };
  assert.equal(S.yearWayShown({ ...base, incomeAvg: 9020, unspentAvg: 10 }).kind, 'none');
  const over = S.yearWayShown({ ...base, incomeAvg: 8000, unspentAvg: -300 });
  assert.equal(over.kind, 'over-spent');
  assert.equal(over.gap, -1000);
  const negPart = S.yearWayShown({ ...base, incomeAvg: 9500, unspentAvg: -200 });
  assert.equal(negPart.kind, 'gap-only');
  assert.equal(negPart.gap, 500);
  const negNotBudgeted = S.yearWayShown({ ...base, incomeAvg: 9500, unspentAvg: 800 });
  assert.equal(negNotBudgeted.kind, 'gap-only');
  assert.equal(negNotBudgeted.notBudgeted, -300);
});

test('gapChainShown: own roundings; when it closes the +1 row ties the terms to the Year tab’s own figure', () => {
  const g = S.gapChainShown({
    windowAvg: 7983.4,
    windowEffect: 10.4,
    envEffect: -229.4,
    otherEffect: 0.4,
    yearTabAvg: 7764.8,
  });
  assert.deepEqual(
    [g.windowAvg, g.windowEffect, g.envEffect, g.otherEffect, g.yearTab, g.residual, g.unexplained],
    [7983, 10, -229, 0, 7765, 1, 0],
  );
  const open = S.gapChainShown({
    windowAvg: 7000,
    windowEffect: 0,
    envEffect: 0,
    otherEffect: 0,
    yearTabAvg: 7100,
  });
  assert.deepEqual([open.yearTab, open.unexplained, open.residual], [7100, 100, 0]);
});

test('bridgeShown: early and recent are the true averages rounded; each move its own rounding; a row closes it', () => {
  const b = S.bridgeShown(
    [
      { key: 'a', early: 100.4, recent: 130.6 },
      { key: 'b', early: 50.5, recent: 40.4 },
      { key: 'c', early: 0.2, recent: 0.3 },
    ],
    151.1,
    171.3,
  );
  assert.deepEqual(
    b.rows.map((r) => r.delta),
    [30, -10, 0],
  );
  assert.deepEqual([b.earlyReal, b.recentReal, b.delta, b.residual], [151, 171, 20, 0]);
});

test('billsShown: lines print their own rounding; a category and the total are the true sums rounded', () => {
  const b = S.billsShown([
    { key: 'housing', raw: 3500.4, lines: [3000.2, 500.2] },
    { key: 'recurring', raw: 851.2, lines: [200.4, 300.4, 350.4] },
  ]);
  assert.equal(b.total, 4352); // 4,351.6
  assert.deepEqual(
    b.cats.map((c) => [c.total, c.residual]),
    [
      [3500, 0],
      [851, 1], // 200 + 300 + 350 = 850 printed lines, 851 true
    ],
  );
  assert.deepEqual(b.cats[1].lines, [200, 300, 350]);
  assert.equal(b.residual, 1);
  const fb = S.billsShown([{ key: 'recurring', raw: 1150.6, lines: [] }]);
  assert.deepEqual(fb, {
    total: 1151,
    residual: 0,
    cats: [{ key: 'recurring', total: 1151, lines: [], residual: 0 }],
  });
});

test('billMovesShown: each line its own start and now; the total is the true move rounded; a row closes it', () => {
  const lines = [
    { id: 'rent', start: 3000.4, now: 3200.4 },
    { id: 'gym', start: 300.5, now: 300.4 },
    { id: 'net', start: 60.6, now: 90.4 },
    { id: 'old', start: 100.4, now: 0 },
    { id: 'tiny', start: 10.2, now: 10.3 },
  ];
  const m = S.billMovesShown(lines, 2);
  assert.deepEqual(
    m.rows.map((r) => [r.id, r.start, r.now, r.delta]),
    [
      ['rent', 3000, 3200, 200],
      ['old', 100, 0, -100],
    ],
  );
  assert.deepEqual([m.othersCount, m.others], [2, 28]);
  assert.equal(m.total, 129); // 3,601.5 − 3,472.1 = 129.4
  assert.equal(m.residual, 1); // 200 − 100 + 28 = 128 printed
});

test('billMonthsSeen: Z9 - a year that has only January has one month', () => {
  const jan = Array(12).fill(0);
  jan[0] = 3500;
  assert.deepEqual(S.billMonthsSeen([{ byMonth: jan }]), [1]);
  assert.deepEqual(S.billMonthsSeen([{ byMonth: Array(12).fill(0.4) }]), []);
  assert.deepEqual(S.billMonthsSeen([]), []);
});

test('potCounts: a trip counts its plan or what was paid, whichever is more', () => {
  assert.equal(S.potCounts({ planned: 100, paid: 150 }), 150);
  assert.equal(S.potCounts({ planned: 100, paid: 20 }), 100);
});

test('potsShown: items print their own rounding; kinds and years are the true sums rounded; rows close them', () => {
  const p = S.potsShown([
    { y0: [1200.4, 600.4], app: [100.5], plan: [3000.3] },
    { y0: [40.4, 40.4, 40.4], app: [], plan: [] },
  ]);
  assert.deepEqual(
    p.kinds.map((k) => [k.v0, k.y0Residual]),
    [
      [1801, 1],
      [121, 1],
    ],
  );
  assert.deepEqual(p.kinds[0].y0Rows, [1200, 600]);
  assert.equal(p.kinds[0].planWins, true);
  assert.deepEqual([p.kinds[0].planRows, p.kinds[0].appRows], [[3000], [101]]);
  assert.deepEqual([p.y0Total, p.y0Residual, p.y1Total, p.y1Residual], [1922, 0, 3000, 0]);
});
