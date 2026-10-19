// What this is: the cash arithmetic behind "what is left on Feb 7 if I quit" —
//   the month-by-month projection from today's balance to her last Clalit day,
//   the trips and one-offs due before it, the cash path through 2027 under a
//   spending level, and the answer for every level at once. Pure: no DOM, no
//   Supabase; app.ts GETs the rows and hands them over.
// Why it exists: her Oct 18 14:11 — "and also projected what's left from Feb if
//   I quit" (HQ §8d 2f: the month path belongs in lib/, not in the renderer).
// What's decided (v73 spec D4, §A4):
//   - left on Feb 7 = left now − the rest of this month's everyday money
//     + Σ over the window months (income − spending) − trips & one-offs due
//     before Feb 7. Pay months run 10th→10th, so Feb 7 falls in January's.
//   - Spending = bills + everyday + charity + money moved to investing. Savings
//     to the bank and set-asides for travel/admin stay in the bank until spent,
//     so they are NOT spending (her rule: "unspent set-asides count as savings").
//   - Gaps are filled, never hidden, and every fill is NAMED (`filled`,
//     `incomeFrom`) so the screen can say "estimate": an unbudgeted bill/envelope
//     takes the bills-now / month-now figure; a month with no income takes the
//     previous month's. A fill with ₪0 is not an estimate and is not named.
// What's built: feb7Window, feb7Passed, projectFeb7, buildFeb7Input,
//   potsDueBefore, cashPath, answerByLevel.
// What's next: tabs/analyze.ts (chunk B) renders these; app.ts loadFeb7Data GETs
//   the rows (read-only).
// Links: tests/feb7.test.mjs · lib/analyze.ts · lib/pay.ts (cashLasts) ·
//   lib/scenarios.ts (planIncomeForMonth) · second-brain
//   projects/budget-app/v73-analyze-rebuild-spec-2026-10-18.md §A4 ·
//   projects/leaving-clalit/README.md (last day).

import { ag } from './budget-math.js';
import { analyzeYear, monthNow, billsMonthFor, catKind, potYear } from './analyze.js';
import type {
  AnalyzeBudget,
  AnalyzeBudgetItem,
  AnalyzeCategory,
  AnalyzeIncomeItem,
  AnalyzeMonthIn,
  AnalyzeTxn,
  PotItemIn,
  PotPaidIn,
  PotRow,
} from './analyze.js';
import { cashLasts } from './pay.js';

export interface YM {
  year: number;
  month: number;
}
export const LAST_DAY = '2027-02-07'; // her last Clalit day (projects/leaving-clalit/README.md)
export const FEB7_PAY_MONTH: YM = { year: 2027, month: 1 }; // pay months run 10th→10th: Feb 7 falls in January's (Jan 10 – Feb 10)

const n = (v: unknown): number => Number(v) || 0;
/** A figure in whole shekels (what the screen shows), 0 for anything that is not a number. */
const whole = (v: unknown): number => Math.round(n(v));

/** year × 12 + month − 1: months in a row compare and subtract as plain numbers. */
export function ymIndex(x: YM): number {
  return x.year * 12 + x.month - 1;
}
const ymOf = (i: number): YM => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });

/** Every month AFTER today's, through the pay month Feb 7 falls in; [] when today is already there. */
export function feb7Window(today: YM): YM[] {
  const out: YM[] = [];
  for (let i = ymIndex(today) + 1; i <= ymIndex(FEB7_PAY_MONTH); i++) out.push(ymOf(i));
  return out;
}

/** True once the last day has come (ISO date, yyyy-mm-dd). */
export function feb7Passed(todayISO: string): boolean {
  return String(todayISO) >= LAST_DAY;
}

// ── The projection ────────────────────────────────────────────────────────

export interface Feb7MonthIn {
  ym: YM;
  income: number;
  fixedByCat: Record<string, number>;
  envelopeByCat: Record<string, number>;
  charity: number;
  invested: number;
  /** Bill categories that had no lines that month and were filled from her usual bill lines (W6). */
  usualKeys?: string[];
}
export interface Feb7Input {
  liquidNow: number;
  thisMonth: YM;
  thisMonthIncome: number;
  restOfThisMonth: number;
  fixedKeys: string[];
  envelopeKeys: string[];
  fallback: { fixedByCat: Record<string, number>; envelopeByCat: Record<string, number> };
  months: Feb7MonthIn[];
  potsDue: { total: number; lines: { label: string; amount: number }[] };
}
export interface Feb7Row {
  ym: YM;
  income: number;
  spend: number;
  net: number;
  cashAfter: number;
  incomeFrom: YM | null;
  filled: string[];
  /** Bill categories filled from her usual bill lines (the templates) - never guessed from this month. */
  usual: string[];
}
export interface Feb7Result {
  start: number;
  restOfThisMonth: number;
  rows: Feb7Row[];
  potsDue: number;
  potsLines: { label: string; amount: number }[];
  end: number;
  estimate: boolean;
}

/**
 * Left on Feb 7 if she quits, month by month. start = left now; the rest of this
 * month's everyday money comes off first; each window month adds its net; the
 * trips and one-offs due before Feb 7 come off last.
 */
export function projectFeb7(input: Feb7Input): Feb7Result {
  // Whole shekels BEFORE anything is summed (Z2): every figure the screen shows
  // is a whole shekel, so every chain it shows adds up exactly.
  const start = whole(input.liquidNow);
  const rest = whole(input.restOfThisMonth);
  let running = start - rest;
  let prevIncome = whole(input.thisMonthIncome);
  let prevYm: YM = input.thisMonth;
  const rows: Feb7Row[] = [];
  for (const m of input.months) {
    const filled: string[] = [];
    let income = whole(m.income);
    let incomeFrom: YM | null = null;
    if (income <= 0) {
      income = prevIncome;
      incomeFrom = prevYm;
    }
    let spend = 0;
    for (const key of input.fixedKeys) {
      let v = whole(m.fixedByCat[key]);
      if (v <= 0) {
        const f = n(input.fallback.fixedByCat[key]);
        if (f > 0) {
          // Whole shekels BEFORE it is summed, so the row's in − out → net adds up on screen.
          v = Math.round(f);
          filled.push(key);
        }
      }
      spend += v;
    }
    for (const key of input.envelopeKeys) {
      let v = whole(m.envelopeByCat[key]);
      if (v <= 0) {
        const f = n(input.fallback.envelopeByCat[key]);
        if (f > 0) {
          // Whole shekels BEFORE it is summed, so the row's in − out → net adds up on screen.
          v = Math.round(f);
          filled.push(key);
        }
      }
      spend += v;
    }
    spend += whole(m.charity) + whole(m.invested);
    const net = income - spend;
    running += net;
    rows.push({
      ym: m.ym,
      income: ag(income),
      spend: ag(spend),
      net: ag(net),
      cashAfter: ag(running),
      incomeFrom,
      filled,
      usual: m.usualKeys ?? [],
    });
    prevIncome = income;
    prevYm = m.ym;
  }
  const potsLines = input.potsDue.lines.map((l) => ({ label: l.label, amount: whole(l.amount) }));
  const potsDue = potsLines.reduce((a, l) => a + l.amount, 0);
  return {
    start,
    restOfThisMonth: rest,
    rows,
    potsDue,
    potsLines,
    end: running - potsDue,
    estimate: rows.some((r) => r.incomeFrom !== null || r.filled.length > 0 || r.usual.length > 0),
  };
}

// ── Assembling the input from raw rows ────────────────────────────────────

export interface Feb7Data {
  today: YM;
  months: (AnalyzeMonthIn & { year: number })[]; // today's year + Jan 2027
  txns: AnalyzeTxn[];
  budgetItems: AnalyzeBudgetItem[];
  budgets: AnalyzeBudget[];
  incomeItems: AnalyzeIncomeItem[];
  travelItems: PotItemIn[];
  travelPaid: PotPaidIn[];
  adminItems: PotItemIn[];
  adminPaid: PotPaidIn[];
  laterUnpaid: { label: string; year: number; month: number; amount: number }[];
  /**
   * Her usual bill lines (budget_item_templates, read only). A month with no bill lines of a
   * category yet (January 2027 before its lines are copied in) reads these, so the Feb 7
   * number does not jump when the lines are copied. Absent/empty = fall back to this month's bills.
   */
  templates?: { category: string; amount: unknown }[];
}

/**
 * Trips & one-offs still to pay before `until`: every row of this year with
 * something unpaid, plus every later row dated after today and no later than
 * `until`. Largest first.
 */
export function potsDueBefore(
  rowsThisYear: PotRow[],
  laterUnpaid: Feb7Data['laterUnpaid'],
  until: YM,
  today: YM,
): { total: number; lines: { label: string; amount: number }[] } {
  const lines: { label: string; amount: number }[] = [];
  for (const r of rowsThisYear) {
    const unpaid = ag(Math.max(0, n(r.planned) - n(r.paid)));
    // R7: under ₪1 left unpaid is a rounding crumb, not something still to pay (no "Licence ₪0" line).
    if (unpaid >= 1) lines.push({ label: r.label, amount: unpaid });
  }
  for (const l of laterUnpaid) {
    const i = ymIndex({ year: l.year, month: l.month });
    if (i > ymIndex(today) && i <= ymIndex(until) && n(l.amount) >= 1)
      lines.push({ label: l.label, amount: ag(n(l.amount)) });
  }
  lines.sort((a, b) => b.amount - a.amount);
  return { total: ag(lines.reduce((s, l) => s + l.amount, 0)), lines };
}

/**
 * From the raw GET rows to what projectFeb7 reads. Runs the same analysis the
 * Analyze page runs on today's year (analyzeYear, monthNow with her rules) for
 * "the rest of this month", "bills now" and "a month now's pace"; reads each
 * window month straight from its own rows.
 */
export function buildFeb7Input(
  d: Feb7Data,
  categories: AnalyzeCategory[],
  rules: { fromMonth: Record<string, number>; zero: string[] },
  liquidNow: number,
): Feb7Input {
  const yearMonths = d.months.filter((m) => m.year === d.today.year);
  const r = analyzeYear({
    months: yearMonths,
    txns: d.txns,
    budgetItems: d.budgetItems,
    budgets: d.budgets,
    incomeItems: d.incomeItems,
    categories,
    todayMonth: d.today.month,
    avgWindow: 0,
    floors: {},
  });
  const current = r.months.find((m) => m.month_num === d.today.month) || null;
  const refNum = r.summary.referenceMonth;
  const refMonth = r.months.find((m) => m.month_num === refNum) || null;
  const mNow = monthNow(r, {
    billsMonth: billsMonthFor(refNum),
    recentN: 6,
    fromMonth: rules.fromMonth,
    zero: rules.zero,
  });

  const fixedKeys = categories.filter((c) => catKind(c) === 'fixed').map((c) => c.key);
  const envelopeKeys = categories.filter((c) => catKind(c) === 'envelope').map((c) => c.key);

  const fallback = {
    fixedByCat: Object.fromEntries(
      fixedKeys.map((k) => [k, refMonth ? refMonth.byCat[k] || 0 : 0]),
    ),
    envelopeByCat: mNow ? { ...mNow.byCat } : {},
  };

  // Per-month sums from the raw rows (a window month is read as it is budgeted).
  const sumBy = (
    rows: { month_id: string; category: string; amount: unknown }[],
    monthId: string,
    key: string,
  ): number | undefined => {
    let found = false;
    let s = 0;
    for (const x of rows) {
      if (x.month_id === monthId && x.category === key) {
        found = true;
        s += n(x.amount);
      }
    }
    return found ? s : undefined;
  };
  const monthFor = (ym: YM): (AnalyzeMonthIn & { year: number }) | undefined =>
    d.months.find((m) => m.year === ym.year && m.month_num === ym.month);
  const incomeOf = (m: AnalyzeMonthIn): number =>
    n(m.income_petachya) +
    n(m.income_clalit) +
    n(m.income_private) +
    n(m.income_other) +
    d.incomeItems.filter((i) => i.month_id === m.id).reduce((s, i) => s + n(i.amount), 0);

  // Her usual bill lines, summed by category (W6).
  const usual: Record<string, number> = {};
  for (const t of d.templates ?? [])
    if (fixedKeys.includes(t.category)) usual[t.category] = (usual[t.category] ?? 0) + n(t.amount);

  const months: Feb7MonthIn[] = feb7Window(d.today).map((ym) => {
    const m = monthFor(ym);
    const out: Feb7MonthIn = {
      ym,
      income: 0,
      fixedByCat: {},
      envelopeByCat: {},
      charity: 0,
      invested: 0,
    };
    if (!m) return out;
    out.income = ag(incomeOf(m));
    for (const k of fixedKeys) {
      const items = sumBy(d.budgetItems, m.id, k);
      let v = items !== undefined && items !== 0 ? items : (sumBy(d.budgets, m.id, k) ?? 0);
      if (!v && usual[k] !== undefined) {
        v = usual[k];
        (out.usualKeys ||= []).push(k);
      }
      if (v) out.fixedByCat[k] = ag(v);
    }
    for (const k of envelopeKeys) {
      const bud = sumBy(d.budgets, m.id, k);
      const v = bud ? bud : (sumBy(d.budgetItems, m.id, k) ?? 0);
      if (v) out.envelopeByCat[k] = ag(v);
    }
    const pctv = n(m.charity_pct);
    out.charity =
      pctv && out.income
        ? Math.round((out.income * pctv) / 100)
        : ag(sumBy(d.budgets, m.id, 'charity') ?? sumBy(d.budgetItems, m.id, 'charity') ?? 0);
    out.invested = ag(sumBy(d.budgets, m.id, 'savings_invested') ?? 0);
    return out;
  });

  const potRows: PotRow[] = [
    ...potYear(d.today.year, d.travelItems, d.travelPaid, 'label').rows,
    ...potYear(d.today.year, d.adminItems, d.adminPaid, 'id').rows,
  ];

  return {
    liquidNow,
    thisMonth: d.today,
    thisMonthIncome: current ? current.income : 0,
    restOfThisMonth: current ? ag(Math.max(0, current.envelope - current.envelopeActual)) : 0,
    fixedKeys,
    envelopeKeys,
    fallback,
    months,
    potsDue: potsDueBefore(potRows, d.laterUnpaid, FEB7_PAY_MONTH, d.today),
  };
}

// ── The cash path through 2027 under one spending level ───────────────────

export interface PathMonthIn {
  ym: YM;
  income: number;
  notes: string[];
}
export interface PathRow {
  ym: YM;
  income: number;
  spend: number;
  net: number;
  cash: number;
  notes: string[];
}
export interface PathResult {
  start: number;
  rows: PathRow[];
  lowest: { ym: YM; cash: number };
  end: number;
  firstUnder: YM | null;
}

/**
 * Cash after each month at a steady monthly `spend`. `lowest` is the lowest
 * month-end (the first, on a tie; the start itself with no months).
 * `firstUnder` = the first month-end STRICTLY under the soft line (null if none).
 */
export function cashPath(
  start: number,
  months: PathMonthIn[],
  spend: number,
  softLine: number,
): PathResult {
  // Whole shekels before summing (Z2): cash + in − out → next adds up as shown.
  let cash = whole(start);
  const out = whole(spend);
  const rows: PathRow[] = [];
  let lowest: { ym: YM; cash: number } = { ym: { year: 0, month: 0 }, cash };
  let firstUnder: YM | null = null;
  for (const m of months) {
    const income = whole(m.income);
    const net = income - out;
    cash += net;
    const row: PathRow = {
      ym: m.ym,
      income,
      spend: out,
      net,
      cash,
      notes: m.notes,
    };
    rows.push(row);
    if (rows.length === 1 || row.cash < lowest.cash) lowest = { ym: m.ym, cash: row.cash };
    if (firstUnder === null && row.cash < n(softLine)) firstUnder = m.ym;
  }
  return { start: whole(start), rows, lowest, end: cash, firstUnder };
}

// ── The answer, level by level ────────────────────────────────────────────

export interface LevelAnswer {
  key: string;
  total: number;
  resLow: number; // income(4 clients) − total
  resHigh: number; // income(5 clients) − total
  lastsFromNow: { months: number; extraWithReserve: number } | null;
  lastsFromFeb7: { months: number; extraWithReserve: number } | null;
  path: PathResult; // 4-client edge, from feb7Start
}

/** Each level's monthly result against her plan (the two client edges), how long cash lasts from now and from Feb 7, and the 2027 path. */
export function answerByLevel(
  levels: { key: string; total: number }[],
  incomeLow: number,
  incomeHigh: number,
  leftNow: number,
  feb7Start: number,
  reserve: number,
  softLine: number,
  pathMonths: PathMonthIn[],
): LevelAnswer[] {
  // Z2: every input is taken in whole shekels here, where the stack consumes it
  // (the Lean total comes from her floors with agorot; the screen shows shekels).
  const lowIn = whole(incomeLow);
  const highIn = whole(incomeHigh);
  const now = whole(leftNow);
  const feb7 = whole(feb7Start);
  return levels.map((lv) => {
    const total = whole(lv.total);
    const resLow = lowIn - total;
    const resHigh = highIn - total;
    return {
      key: lv.key,
      total,
      resLow,
      resHigh,
      lastsFromNow: cashLasts(now, resLow, reserve),
      lastsFromFeb7: cashLasts(feb7, resLow, reserve),
      path: cashPath(feb7, pathMonths, total, softLine),
    };
  });
}
