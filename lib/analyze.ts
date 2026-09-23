// What this is: the arithmetic behind the Analyze tab — what a year REALLY
//   costs, month by month and by behaviour (fixed / envelope / pot / charity),
//   the rolling average and low/high month per category, a per-category
//   "floor" (the least she would spend) and the gap between real and floor.
// Why it exists: her ask, 2026-09-23 — "what is my real spend… what's the
//   littlest I can spend". The Year tab is a ledger (what happened); this is
//   the reading of it. Pure so it runs under node:test with no browser and no
//   Supabase, and so every number here can be pinned against the Year tab.
// What's decided:
//   - Month status comes from the SAME rule as the Year tab: past = month_num
//     < todayMonth, current = equal, future = greater (todayMonthForYear()).
//   - Envelope value: past → actual transactions; future → budget (budgets row,
//     else budget_items); current → the HIGHER of spent-so-far and budget, so a
//     half-logged month never drags the year projection down.
//   - Fixed (housing, recurring) = max(lines, transactions) — exactly what the
//     Year tab's "Total Used" counts. Pots (travel, admin) and charity mirror
//     yearCatBudget: pct-derived charity, else items, else budgets row.
//   - "Real spend" = fixed + envelopes + pots + charity. Savings is NOT spend
//     (it is the score). "Used" = real + savings, and on a past month it equals
//     the Year tab's Total Used to the agora — that identity is a test.
//   - Averages use COMPLETE months only (past), optionally the last N of them.
//     Never the current month: it is half-logged by definition.
//   - Floor defaults: envelope → lowest complete month; fixed → this month's
//     lines; pots → 0; charity → its average. Her typed floor always wins.
//   - Every returned number is agorot-snapped (ag). Display rounds separately.
// What's built: analyzeYear (everything), plus the small helpers it uses.
// What's next: runway (liquid ÷ floor) once "liquid" has one agreed meaning.
// Links: consumed by app.ts renderAnalyzeTab; pinned by tests/analyze.test.mjs.

import { ag } from './budget-math.js';

export interface AnalyzeMonthIn {
  id: string;
  month_num: number;
  month_name?: string | null;
  income_petachya?: unknown;
  income_clalit?: unknown;
  income_private?: unknown;
  income_other?: unknown;
  charity_pct?: unknown;
}
export interface AnalyzeTxn {
  month_id: string;
  category: string;
  amount: unknown;
}
export interface AnalyzeBudgetItem {
  month_id: string;
  category: string;
  amount: unknown;
  label?: string | null;
  subcategory?: string | null;
}
export interface AnalyzeBudget {
  month_id: string;
  category: string;
  amount: unknown;
}
export interface AnalyzeIncomeItem {
  month_id: string;
  amount: unknown;
}
export interface AnalyzeCategory {
  key: string;
  label: string;
  emoji: string;
  hasTab?: boolean;
  hasLines?: boolean;
}

export type CatKind = 'envelope' | 'fixed' | 'pot' | 'charity';
export type MonthStatus = 'past' | 'current' | 'future';

export interface AnalyzeInput {
  months: AnalyzeMonthIn[];
  txns: AnalyzeTxn[];
  budgetItems: AnalyzeBudgetItem[];
  budgets: AnalyzeBudget[];
  incomeItems: AnalyzeIncomeItem[];
  categories: AnalyzeCategory[];
  /** todayMonthForYear(): 1–12 for the current year, 13 = all past, 0 = all future. */
  todayMonth: number;
  /** 0 = every complete month; N = the last N complete months. */
  avgWindow: number;
  /** Her stored floors by category key. Missing = not set. */
  floors: Record<string, number | undefined>;
}

export interface AnalyzeMonth {
  id: string;
  month_num: number;
  name: string;
  status: MonthStatus;
  income: number;
  fixed: number;
  envelope: number;
  pots: number;
  charity: number;
  /** fixed + envelope + pots + charity. Savings excluded. */
  real: number;
  savings: number;
  /** real + savings — the Year tab's "Total Used" on a past month. */
  used: number;
  /** The value counted for each category this month. */
  byCat: Record<string, number>;
  /** Transactions only, per category — what low/high months are read from. */
  actualByCat: Record<string, number>;
  /** How many transactions were logged. Thin months show here, unjudged. */
  entries: number;
}

export interface AnalyzeCatStat {
  key: string;
  label: string;
  emoji: string;
  kind: CatKind;
  /** Average over the averaging window (complete months). */
  avg: number;
  low: { month_num: number; amount: number } | null;
  high: { month_num: number; amount: number } | null;
  /** Past + current months. */
  ytd: number;
  /** ytd ÷ real ytd across all categories, 0–1. */
  share: number;
  /** The category's value in the reference month (current, else last). */
  now: number;
  floorDefault: number;
  floor: number;
  floorSet: boolean;
  /** avg − floor. Negative means the floor sits above her average. */
  aboveFloor: number;
}

export interface AnalyzeLine {
  label: string;
  category: string;
  subcategory: string | null;
  /** Amount in the reference month. */
  monthly: number;
  /** Sum across every month of the year that carries this line. */
  annual: number;
  monthsPresent: number;
  /** No money in any month — a line that is finished or was never real. */
  dead: boolean;
}

export interface AnalyzeSummary {
  /** month_nums the averages are taken over. */
  avgMonths: number[];
  referenceMonth: number | null;
  realAvg: number;
  floorTotal: number;
  aboveFloor: number;
  ytdIncome: number;
  ytdSavings: number;
  /** ytdSavings ÷ ytdIncome, 0–1 (0 when income is 0). */
  savingsRate: number;
  yearReal: number;
  yearRealActual: number;
  yearRealProjected: number;
  yearIncome: number;
  yearSavings: number;
}

export interface AnalyzeResult {
  months: AnalyzeMonth[];
  cats: AnalyzeCatStat[];
  lines: AnalyzeLine[];
  summary: AnalyzeSummary;
}

const n = (v: unknown): number => Number(v) || 0;

export function catKind(c: AnalyzeCategory): CatKind {
  if (c.key === 'charity') return 'charity';
  if (c.hasTab) return 'pot';
  if (c.hasLines) return 'fixed';
  return 'envelope';
}

export function monthStatus(monthNum: number, todayMonth: number): MonthStatus {
  if (monthNum < todayMonth) return 'past';
  if (monthNum === todayMonth) return 'current';
  return 'future';
}

/** The complete months an average is taken over: all past months, or the last N of them. */
export function pickAvgMonths(monthNums: number[], todayMonth: number, window: number): number[] {
  const past = [...monthNums].filter((m) => m < todayMonth).sort((a, b) => a - b);
  if (window > 0 && past.length > window) return past.slice(past.length - window);
  return past;
}

/** "Mattress (6/12)" and "Mattress 7/12" are one line. Case-insensitive key. */
export function lineKey(label: unknown): string {
  return String(label || '')
    .replace(/\s*\(?\d+\s*\/\s*\d+\)?\s*$/, '')
    .trim()
    .toLowerCase();
}

export function analyzeYear(input: AnalyzeInput): AnalyzeResult {
  const months = [...input.months].sort((a, b) => a.month_num - b.month_num);
  const cats = input.categories;
  const today = input.todayMonth;

  // ── Index the raw rows once ────────────────────────────────────────────
  const txByMonthCat: Record<string, Record<string, number>> = {};
  const txCount: Record<string, number> = {};
  for (const t of input.txns) {
    const bucket = (txByMonthCat[t.month_id] ||= {});
    bucket[t.category] = (bucket[t.category] || 0) + n(t.amount);
    txCount[t.month_id] = (txCount[t.month_id] || 0) + 1;
  }
  const biByMonthCat: Record<string, Record<string, number>> = {};
  for (const b of input.budgetItems) {
    const bucket = (biByMonthCat[b.month_id] ||= {});
    bucket[b.category] = (bucket[b.category] || 0) + n(b.amount);
  }
  const budgetMap: Record<string, Record<string, number>> = {};
  for (const b of input.budgets) {
    const bucket = (budgetMap[b.month_id] ||= {});
    bucket[b.category] = n(b.amount);
  }
  const incItems: Record<string, number> = {};
  for (const i of input.incomeItems)
    incItems[i.month_id] = (incItems[i.month_id] || 0) + n(i.amount);

  const tx = (mid: string, key: string): number => txByMonthCat[mid]?.[key] || 0;
  const bi = (mid: string, key: string): number => biByMonthCat[mid]?.[key] || 0;
  const hasBi = (mid: string, key: string): boolean => biByMonthCat[mid]?.[key] !== undefined;
  const bud = (mid: string, key: string): number => budgetMap[mid]?.[key] || 0;

  const incomeOf = (m: AnalyzeMonthIn): number =>
    n(m.income_petachya) +
    n(m.income_clalit) +
    n(m.income_private) +
    n(m.income_other) +
    (incItems[m.id] || 0);

  // Mirrors yearCatBudget in app.ts: charity from % of income, else lines, else budgets row.
  const catBudget = (m: AnalyzeMonthIn, key: string): number => {
    if (key === 'charity') {
      const pctv = n(m.charity_pct);
      const inc = incomeOf(m);
      if (pctv && inc) return Math.round((inc * pctv) / 100);
    }
    return hasBi(m.id, key) ? bi(m.id, key) : bud(m.id, key);
  };
  // Mirrors spendV(future) in app.ts: budgets row, else lines.
  const envelopeBudget = (m: AnalyzeMonthIn, key: string): number =>
    bud(m.id, key) || bi(m.id, key);

  // ── Per month ──────────────────────────────────────────────────────────
  const out: AnalyzeMonth[] = months.map((m) => {
    const status = monthStatus(m.month_num, today);
    const byCat: Record<string, number> = {};
    const actualByCat: Record<string, number> = {};
    let fixed = 0,
      envelope = 0,
      pots = 0,
      charity = 0;
    for (const c of cats) {
      const kind = catKind(c);
      const actual = tx(m.id, c.key);
      actualByCat[c.key] = ag(actual);
      let v = 0;
      if (kind === 'envelope') {
        const budget = envelopeBudget(m, c.key);
        v = status === 'past' ? actual : status === 'future' ? budget : Math.max(actual, budget);
        envelope += v;
      } else if (kind === 'fixed') {
        v = Math.max(bi(m.id, c.key), actual);
        fixed += v;
      } else if (kind === 'pot') {
        v = catBudget(m, c.key);
        pots += v;
      } else {
        v = catBudget(m, c.key);
        charity += v;
      }
      byCat[c.key] = ag(v);
    }
    const savings = bud(m.id, 'savings_bank') + bud(m.id, 'savings_invested');
    const real = fixed + envelope + pots + charity;
    return {
      id: m.id,
      month_num: m.month_num,
      name: String(m.month_name || '').slice(0, 3),
      status,
      income: ag(incomeOf(m)),
      fixed: ag(fixed),
      envelope: ag(envelope),
      pots: ag(pots),
      charity: ag(charity),
      real: ag(real),
      savings: ag(savings),
      used: ag(real + savings),
      byCat,
      actualByCat,
      entries: txCount[m.id] || 0,
    };
  });

  // ── Windows ────────────────────────────────────────────────────────────
  const avgMonths = pickAvgMonths(
    out.map((m) => m.month_num),
    today,
    input.avgWindow,
  );
  const avgSet = new Set(avgMonths);
  const inAvg = out.filter((m) => avgSet.has(m.month_num));
  const complete = out.filter((m) => m.status === 'past');
  const ytd = out.filter((m) => m.status !== 'future');
  const reference =
    out.find((m) => m.status === 'current') || (out.length ? out[out.length - 1] : null);

  const mean = (xs: number[]): number =>
    xs.length ? ag(xs.reduce((s, x) => s + x, 0) / xs.length) : 0;

  // ── Per category ───────────────────────────────────────────────────────
  const realYtd = ytd.reduce((s, m) => s + m.real, 0);
  const catStats: AnalyzeCatStat[] = cats.map((c) => {
    const kind = catKind(c);
    const avg = mean(inAvg.map((m) => m.byCat[c.key] || 0));
    // Low/high read the ACTUAL for envelopes (what she really spent) and the
    // counted value for everything else, over every complete month.
    let low: AnalyzeCatStat['low'] = null;
    let high: AnalyzeCatStat['high'] = null;
    for (const m of complete) {
      const v = kind === 'envelope' ? m.actualByCat[c.key] || 0 : m.byCat[c.key] || 0;
      if (!low || v < low.amount) low = { month_num: m.month_num, amount: ag(v) };
      if (!high || v > high.amount) high = { month_num: m.month_num, amount: ag(v) };
    }
    const catYtd = ag(ytd.reduce((s, m) => s + (m.byCat[c.key] || 0), 0));
    const now = reference ? reference.byCat[c.key] || 0 : 0;
    const floorDefault =
      kind === 'envelope'
        ? low
          ? low.amount
          : 0
        : kind === 'fixed'
          ? ag(now)
          : kind === 'pot'
            ? 0
            : avg;
    const stored = input.floors[c.key];
    const floorSet = typeof stored === 'number' && Number.isFinite(stored);
    const floor = floorSet ? ag(stored) : floorDefault;
    return {
      key: c.key,
      label: c.label,
      emoji: c.emoji,
      kind,
      avg,
      low,
      high,
      ytd: catYtd,
      share: realYtd ? catYtd / realYtd : 0,
      now: ag(now),
      floorDefault,
      floor,
      floorSet,
      aboveFloor: ag(avg - floor),
    };
  });

  // ── Fixed lines, annualized ────────────────────────────────────────────
  const lines: AnalyzeLine[] = [];
  if (reference) {
    const byKey: Record<string, AnalyzeLine> = {};
    const seenMonths: Record<string, Set<string>> = {};
    for (const b of input.budgetItems) {
      const c = cats.find((x) => x.key === b.category);
      if (!c || catKind(c) !== 'fixed') continue;
      const k = b.category + '|' + lineKey(b.label);
      const line = (byKey[k] ||= {
        label: String(b.label || '').trim() || '(unnamed)',
        category: b.category,
        subcategory: b.subcategory || null,
        monthly: 0,
        annual: 0,
        monthsPresent: 0,
        dead: true,
      });
      line.annual += n(b.amount);
      (seenMonths[k] ||= new Set()).add(b.month_id);
      if (b.month_id === reference.id) {
        line.monthly += n(b.amount);
        // The reference month's spelling is the one she sees on the Budget tab.
        line.label = String(b.label || '').trim() || line.label;
        line.subcategory = b.subcategory || line.subcategory;
      }
    }
    for (const k of Object.keys(byKey)) {
      const line = byKey[k];
      line.monthly = ag(line.monthly);
      line.annual = ag(line.annual);
      line.monthsPresent = seenMonths[k]?.size || 0;
      line.dead = Math.round(line.annual) === 0;
      lines.push(line);
    }
    lines.sort((a, b) => b.annual - a.annual || a.label.localeCompare(b.label));
  }

  // ── Summary ────────────────────────────────────────────────────────────
  const realAvg = mean(inAvg.map((m) => m.real));
  const floorTotal = ag(catStats.reduce((s, c) => s + c.floor, 0));
  const ytdIncome = ag(ytd.reduce((s, m) => s + m.income, 0));
  const ytdSavings = ag(ytd.reduce((s, m) => s + m.savings, 0));
  const yearRealActual = ag(realYtd);
  const yearRealProjected = ag(
    out.filter((m) => m.status === 'future').reduce((s, m) => s + m.real, 0),
  );

  return {
    months: out,
    cats: catStats,
    lines,
    summary: {
      avgMonths,
      referenceMonth: reference ? reference.month_num : null,
      realAvg,
      floorTotal,
      aboveFloor: ag(realAvg - floorTotal),
      ytdIncome,
      ytdSavings,
      savingsRate: ytdIncome ? ytdSavings / ytdIncome : 0,
      yearReal: ag(yearRealActual + yearRealProjected),
      yearRealActual,
      yearRealProjected,
      yearIncome: ag(out.reduce((s, m) => s + m.income, 0)),
      yearSavings: ag(out.reduce((s, m) => s + m.savings, 0)),
    },
  };
}
