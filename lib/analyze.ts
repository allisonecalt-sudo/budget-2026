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
//   - Floor rule (her words, 2026-09-23: "sometimes the lowest is not the
//     floor… there's a month I spent very little money because of other
//     reasons… on average what I could spend"): an envelope's suggested floor
//     is the AVERAGE of its N lowest NORMAL complete months — N per category
//     (default 3), and she can veto months per category (August was America).
//     Fewer than N normal months → average what is there; none → 0. Fixed →
//     this month's lines; pots → 0; charity → its average. Her typed floor
//     always wins (amount null = not set).
//   - A vetoed month is out of that category's avg / low / high / floor too.
//     summary.realAvg is NOT affected — the vetoes are per line, the year's
//     real average is one number over one window.
//   - "So far" means money at ACTUAL: the current month's envelopes count what
//     is logged, not the higher-of rule; the budget-over-actual remainder is
//     projected. realActual carries that per month; yearReal is unchanged.
//   - Every returned number is agorot-snapped (ag). Display rounds separately.
// What's built: analyzeYear (everything), plus the small helpers it uses —
//   catKind, monthStatus, pickAvgMonths, lineKey, and clampAvgN / cleanExcluded
//   (stored avg_n / excluded_months are cleaned, never trusted raw).
//   v56 (2026-10-11, the Analysis section): per-month `parts` (the "why so
//   high" drivers: rent / ended fixed lines / each fixed category / own
//   envelopes / lifestyle / each pot / charity — they sum to real),
//   `envelopeActual`, and three helpers: yearTabGap (why the Year tab's ÷12
//   average differs from this one), whyBridge (early vs recent months, driver
//   by driver, thin months flagged) and runway (one income mix vs one spend).
//   Runway's cash = the Cash tab's Total Liquid, passed in — never a third
//   meaning of "liquid".
//   v57: WHOLE_YEAR window — averages over all 12 months, the ones ahead as
//   budgeted; whyBridge(…, wholeYear) compares the first months with the
//   last months of the year.
// What's next: a cross-year view so January 2027 can read 2026's months.
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

/** One spend_floors row as the math needs it. */
export interface AnalyzeFloorIn {
  /** Her typed floor; null = not set, the suggestion shows. */
  amount: number | null;
  /** How many of the lowest normal months the envelope suggestion averages (1–12). */
  avgN: number;
  /** month_nums she has vetoed for this category ("that month was not normal"). */
  excluded: number[];
}

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
  /** Her stored floors by category key. Missing = no row: not set, N = 3, no vetoes. */
  floors: Record<string, AnalyzeFloorIn | undefined>;
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
  /**
   * real with envelopes at what is actually logged — what "spent so far" means.
   * Equals real on a past month; on the current month it drops the higher-of
   * rule (the budget-over-actual remainder is projected); 0 on a future month.
   */
  realActual: number;
  savings: number;
  /** real + savings — the Year tab's "Total Used" on a past month. */
  used: number;
  /** The value counted for each category this month. */
  byCat: Record<string, number>;
  /** Transactions only, per category — what low/high months are read from. */
  actualByCat: Record<string, number>;
  /** Envelopes at what is actually logged (transactions only), any status. */
  envelopeActual: number;
  /** What the envelopes were budgeted for (the money given an everyday job), any status. */
  envelopeBudget: number;
  /**
   * real split into the "why so high" drivers (keys: BUCKETS). Sums to real.
   * Fixed money is split three ways: rent, lines that have ENDED (money in a
   * past month, none in the reference month or after), and the rest.
   */
  parts: Record<string, number>;
  /** How many transactions were logged. Thin months show here, unjudged. */
  entries: number;
}

export interface AnalyzeCatStat {
  key: string;
  label: string;
  emoji: string;
  kind: CatKind;
  /** Average over the averaging window (complete months), minus this category's vetoed months. */
  avg: number;
  low: { month_num: number; amount: number } | null;
  high: { month_num: number; amount: number } | null;
  /** Past months + the current month at actual. */
  ytd: number;
  /** ytd ÷ real ytd across all categories, 0–1. */
  share: number;
  /** The category's value in the reference month (current, else last). */
  now: number;
  /** How many lowest normal months the suggestion averages (envelopes). */
  avgN: number;
  /** The months she vetoed for this category, ascending. */
  excluded: number[];
  /** The months actually averaged into the suggestion, ascending by amount. Empty for fixed and pots. */
  floorMonths: { month_num: number; amount: number }[];
  floorDefault: number;
  floor: number;
  /** True when her stored amount is a finite number. */
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
  /** yearRealActual + yearRealProjected — every month's real. */
  yearReal: number;
  /** Past months' real + the current month at actual. */
  yearRealActual: number;
  /** Future months' real + the current month's budget-over-actual remainder. */
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

/**
 * The "why so high" drivers, in display order. Envelopes in OWN_ENVELOPES get
 * their own row; every other envelope is "lifestyle". Each pot is its own row
 * (travel, admin). Fixed money splits into rent / ended lines / the rest of
 * its category.
 */
export const OWN_ENVELOPES = ['groceries', 'transport', 'health', 'therapy'];
export function bucketOf(c: AnalyzeCategory): string {
  const kind = catKind(c);
  if (kind === 'charity') return 'charity';
  if (kind === 'pot') return c.key;
  if (kind === 'fixed') return c.key;
  return OWN_ENVELOPES.includes(c.key) ? c.key : 'lifestyle';
}
/** "Rent" and "Rent (Sep)" are rent; "Rental insurance" is not. */
export function isRentLabel(label: unknown): boolean {
  return /^rent\b/.test(lineKey(label));
}

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
/** window = WHOLE_YEAR: every month of the year — the complete ones as they
 *  happened, the current and future ones as budgeted (her ask 2026-10-11:
 *  "do this with the projection with the whole year as well"). */
export const WHOLE_YEAR = -1;
export function pickAvgMonths(monthNums: number[], todayMonth: number, window: number): number[] {
  if (window === WHOLE_YEAR) return [...monthNums].sort((a, b) => a - b);
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

/** avg_n as stored → 1–12, default 3. */
export function clampAvgN(v: unknown): number {
  const k = Math.round(Number(v));
  return Number.isFinite(k) && k >= 1 ? Math.min(12, k) : 3;
}

/** excluded_months as stored → unique month_nums 1–12, ascending. */
export function cleanExcluded(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const set = new Set<number>();
  for (const x of v) {
    const k = Math.round(Number(x));
    if (k >= 1 && k <= 12) set.add(k);
  }
  return [...set].sort((a, b) => a - b);
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

  // ── Fixed lines: rent, and lines that have ended ───────────────────────
  // A line has ENDED when it carried money in some past month and carries
  // none in the reference month (current, else the last month) or any month
  // after it. Read from her own budget_items, nothing inferred from labels
  // except "rent".
  const statusById: Record<string, MonthStatus> = {};
  for (const m of months) statusById[m.id] = monthStatus(m.month_num, today);
  const refIn = months.find((m) => m.month_num === today) || months[months.length - 1] || null;
  const fixedKeys = new Set(cats.filter((c) => catKind(c) === 'fixed').map((c) => c.key));
  const lineMoney: Record<string, { past: number; refOn: number }> = {};
  for (const b of input.budgetItems) {
    if (!fixedKeys.has(b.category)) continue;
    const k = b.category + '|' + lineKey(b.label);
    const rec = (lineMoney[k] ||= { past: 0, refOn: 0 });
    const st = statusById[b.month_id];
    const mn = months.find((m) => m.id === b.month_id)?.month_num ?? 0;
    if (st === 'past' && (!refIn || mn < refIn.month_num)) rec.past += Math.abs(n(b.amount));
    if (refIn && mn >= refIn.month_num) rec.refOn += Math.abs(n(b.amount));
  }
  // Renamed lines are not ended: "Claude Pro" → "Claude Code Max" → "Claude
  // Max" is one bill under five labels (2026). A line only counts as ended
  // when no line still carrying money in the same category starts with the
  // same first word.
  const firstWord = (k: string): string => (k.split('|')[1] || '').split(/[\s\-–(]/)[0];
  const liveFirst = new Set(
    Object.keys(lineMoney)
      .filter((k) => Math.round(lineMoney[k].refOn) !== 0)
      .map((k) => k.split('|')[0] + '|' + firstWord(k)),
  );
  const endedKeys = new Set(
    Object.keys(lineMoney).filter(
      (k) =>
        lineMoney[k].past > 0 &&
        Math.round(lineMoney[k].refOn) === 0 &&
        !isRentLabel(k.split('|')[1]) &&
        !liveFirst.has(k.split('|')[0] + '|' + firstWord(k)),
    ),
  );
  const rentByMonthCat: Record<string, Record<string, number>> = {};
  const endedByMonthCat: Record<string, Record<string, number>> = {};
  for (const b of input.budgetItems) {
    if (!fixedKeys.has(b.category)) continue;
    if (isRentLabel(b.label)) {
      const r = (rentByMonthCat[b.month_id] ||= {});
      r[b.category] = (r[b.category] || 0) + n(b.amount);
    } else if (endedKeys.has(b.category + '|' + lineKey(b.label))) {
      const e = (endedByMonthCat[b.month_id] ||= {});
      e[b.category] = (e[b.category] || 0) + n(b.amount);
    }
  }

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
    const parts: Record<string, number> = {};
    const addPart = (k: string, v: number): void => {
      parts[k] = (parts[k] || 0) + v;
    };
    let fixed = 0,
      envelope = 0,
      envelopeActual = 0,
      envelopeBudgeted = 0,
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
        envelopeActual += actual;
        envelopeBudgeted += budget;
        addPart(bucketOf(c), v);
      } else if (kind === 'fixed') {
        v = Math.max(bi(m.id, c.key), actual);
        fixed += v;
        // Rent first, then ended lines, each capped by what is left of v, so
        // the three parts always sum to exactly what fixed counts.
        const rentP = Math.min(Math.max(0, rentByMonthCat[m.id]?.[c.key] || 0), v);
        const endedP = Math.min(Math.max(0, endedByMonthCat[m.id]?.[c.key] || 0), v - rentP);
        addPart('rent', rentP);
        addPart('ended', endedP);
        addPart(c.key, v - rentP - endedP);
      } else if (kind === 'pot') {
        v = catBudget(m, c.key);
        pots += v;
        addPart(bucketOf(c), v);
      } else {
        v = catBudget(m, c.key);
        charity += v;
        addPart('charity', v);
      }
      byCat[c.key] = ag(v);
    }
    for (const k of Object.keys(parts)) parts[k] = ag(parts[k]);
    const savings = bud(m.id, 'savings_bank') + bud(m.id, 'savings_invested');
    const real = fixed + envelope + pots + charity;
    // Only envelopes differ at actual: fixed is already max(lines, paid) and
    // pots/charity are the allocation either way. A future month has no "so far".
    const realActual = status === 'future' ? 0 : fixed + envelopeActual + pots + charity;
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
      realActual: ag(realActual),
      savings: ag(savings),
      used: ag(real + savings),
      byCat,
      actualByCat,
      envelopeActual: ag(envelopeActual),
      envelopeBudget: ag(envelopeBudgeted),
      parts,
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
  // The month in progress; else, for a year that has not started (nothing
  // complete, nothing current — January 2027), its FIRST month, so "bills now"
  // reads the first budgeted month instead of an empty December; else the last.
  const reference =
    out.find((m) => m.status === 'current') ||
    (out.length ? (complete.length ? out[out.length - 1] : out[0]) : null);

  const mean = (xs: number[]): number =>
    xs.length ? ag(xs.reduce((s, x) => s + x, 0) / xs.length) : 0;

  // ── Per category ───────────────────────────────────────────────────────
  // "So far" is at actual, so shares are taken over realActual (they sum to 1).
  const realYtd = ytd.reduce((s, m) => s + m.realActual, 0);
  const byAmount = (a: { month_num: number; amount: number }, b: typeof a): number =>
    a.amount - b.amount || a.month_num - b.month_num;
  const catStats: AnalyzeCatStat[] = cats.map((c) => {
    const kind = catKind(c);
    const stored = input.floors[c.key];
    const avgN = clampAvgN(stored ? stored.avgN : 3);
    const excluded = cleanExcluded(stored ? stored.excluded : []);
    const exSet = new Set(excluded);
    // Her vetoes take the month out of everything this line reads —
    // avg, low, high and the suggestion. Never out of summary.realAvg.
    const catAvgMonths = inAvg.filter((m) => !exSet.has(m.month_num));
    const catComplete = complete.filter((m) => !exSet.has(m.month_num));
    const avg = mean(catAvgMonths.map((m) => m.byCat[c.key] || 0));
    // Low/high read the ACTUAL for envelopes (what she really spent) and the
    // counted value for everything else, over every normal complete month.
    const valueOf = (m: AnalyzeMonth): number =>
      kind === 'envelope' ? m.actualByCat[c.key] || 0 : m.byCat[c.key] || 0;
    let low: AnalyzeCatStat['low'] = null;
    let high: AnalyzeCatStat['high'] = null;
    for (const m of catComplete) {
      const v = valueOf(m);
      if (!low || v < low.amount) low = { month_num: m.month_num, amount: ag(v) };
      if (!high || v > high.amount) high = { month_num: m.month_num, amount: ag(v) };
    }
    // ytd counts the current month at actual (envelopes = what is logged).
    const catYtd = ag(
      ytd.reduce(
        (s, m) =>
          s +
          (m.status === 'current' && kind === 'envelope'
            ? m.actualByCat[c.key] || 0
            : m.byCat[c.key] || 0),
        0,
      ),
    );
    const now = reference ? reference.byCat[c.key] || 0 : 0;
    // The suggestion: envelopes average their N lowest normal complete months;
    // charity averages its window. Fixed and pots average nothing.
    const floorMonths: AnalyzeCatStat['floorMonths'] =
      kind === 'envelope'
        ? catComplete
            .map((m) => ({ month_num: m.month_num, amount: ag(valueOf(m)) }))
            .sort(byAmount)
            .slice(0, avgN)
        : kind === 'charity'
          ? catAvgMonths
              .map((m) => ({ month_num: m.month_num, amount: ag(valueOf(m)) }))
              .sort(byAmount)
          : [];
    const floorDefault =
      kind === 'envelope'
        ? mean(floorMonths.map((x) => x.amount))
        : kind === 'fixed'
          ? ag(now)
          : kind === 'pot'
            ? 0
            : avg;
    const storedAmt = stored ? stored.amount : null;
    const floorSet = typeof storedAmt === 'number' && Number.isFinite(storedAmt);
    const floor = floorSet ? ag(storedAmt) : floorDefault;
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
      avgN,
      excluded,
      floorMonths,
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
  // realAvg is over the GLOBAL averaging window, on purpose: a per-category
  // veto says "that month was not normal for groceries", not "that month did
  // not happen". The year's real average stays one number over one window.
  const realAvg = mean(inAvg.map((m) => m.real));
  const floorTotal = ag(catStats.reduce((s, c) => s + c.floor, 0));
  const ytdIncome = ag(ytd.reduce((s, m) => s + m.income, 0));
  const ytdSavings = ag(ytd.reduce((s, m) => s + m.savings, 0));
  // Actual = past months + the current month at actual. Projected = future
  // months + whatever of the current month's budget is not spent yet.
  const yearRealActual = ag(realYtd);
  const yearRealProjected = ag(out.reduce((s, m) => s + (m.real - m.realActual), 0));

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

// ── Analysis section helpers (v56) ───────────────────────────────────────

/**
 * Why the Year tab's average and this tab's differ (her ₪13,910 vs ₪14,580,
 * 2026-10-09). The Year tab divides the whole year by 12: complete months at
 * real, the current and future months with ONLY what is logged in the
 * envelopes but bills, pots and charity in full (totalSpentFor). This tab
 * averages complete months. The difference is exactly:
 *   windowEffect  — this tab's window (e.g. last 3) vs every complete month
 *   envEffect     — the not-yet-complete months' envelopes, logged only
 *   otherEffect   — the not-yet-complete months' bills, pots, charity in full
 * windowAvg + windowEffect + envEffect + otherEffect = yearTabAvg, always.
 */
export interface YearTabGap {
  yearTabAvg: number;
  allCompleteAvg: number;
  windowAvg: number;
  windowEffect: number;
  envEffect: number;
  otherEffect: number;
  /** month_nums that are not complete (current + future). */
  openMonths: number[];
}
export function yearTabGap(r: AnalyzeResult, divideBy = 12): YearTabGap | null {
  const past = r.months.filter((m) => m.status === 'past');
  if (!past.length) return null;
  const open = r.months.filter((m) => m.status !== 'past');
  const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  const allAvg = mean(past.map((m) => m.real));
  const allEnv = mean(past.map((m) => m.envelope));
  const allOther = allAvg - allEnv;
  let envEffect = 0;
  let otherEffect = 0;
  for (const m of open) {
    envEffect += (m.envelopeActual - allEnv) / divideBy;
    otherEffect += (m.fixed + m.pots + m.charity - allOther) / divideBy;
  }
  const windowAvg = r.summary.realAvg;
  const yearTab =
    (past.reduce((s, m) => s + m.real, 0) +
      open.reduce((s, m) => s + m.fixed + m.envelopeActual + m.pots + m.charity, 0)) /
    divideBy;
  return {
    yearTabAvg: ag(yearTab),
    allCompleteAvg: ag(allAvg),
    windowAvg,
    windowEffect: ag(allAvg - windowAvg),
    envEffect: ag(envEffect),
    otherEffect: ag(otherEffect),
    openMonths: open.map((m) => m.month_num),
  };
}

/**
 * "How did it get so high" — early months vs recent months, driver by driver.
 * early = the first n complete months, recent = the last n, n = 3 (fewer when
 * there are fewer than 6 complete months; never overlapping; needs 4+).
 * Each row is avg(recent) − avg(early) of one bucket; rows sum to the real
 * difference exactly. Thin months (entries well under the usual) are flagged
 * so an away month is never read as a cheaper life.
 */
export interface WhyRow {
  key: string;
  early: number;
  recent: number;
  delta: number;
}
export interface WhyBridge {
  early: number[];
  recent: number[];
  earlyReal: number;
  recentReal: number;
  delta: number;
  rows: WhyRow[];
  earlySavingsRate: number;
  recentSavingsRate: number;
  /** Complete months with under 60% of the usual (median) number of entries. */
  thin: number[];
  /** month_nums in early/recent that have not happened yet (counted as budgeted). */
  projected: number[];
}
export function whyBridge(r: AnalyzeResult, order: string[], wholeYear = false): WhyBridge | null {
  const past = r.months.filter((m) => m.status === 'past');
  // Whole year: the first months against the LAST months of the year, the
  // ones still ahead counted as budgeted — "where is the plan taking me".
  const pool = wholeYear ? r.months : past;
  const n = Math.min(3, Math.floor(pool.length / 2));
  if (n < 2 || (wholeYear && !past.length)) return null;
  const early = pool.slice(0, n);
  const recent = pool.slice(pool.length - n);
  const avg = (ms: AnalyzeMonth[], pick: (m: AnalyzeMonth) => number): number =>
    ms.reduce((s, m) => s + pick(m), 0) / ms.length;
  const keys = [...order];
  for (const m of past) for (const k of Object.keys(m.parts)) if (!keys.includes(k)) keys.push(k);
  const rows: WhyRow[] = keys.map((k) => {
    const e = avg(early, (m) => m.parts[k] || 0);
    const rc = avg(recent, (m) => m.parts[k] || 0);
    return { key: k, early: ag(e), recent: ag(rc), delta: ag(rc - e) };
  });
  const rate = (ms: AnalyzeMonth[]): number => {
    const inc = ms.reduce((s, m) => s + m.income, 0);
    return inc ? ms.reduce((s, m) => s + m.savings, 0) / inc : 0;
  };
  const counts = past.map((m) => m.entries).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)] || 0;
  const earlyReal = avg(early, (m) => m.real);
  const recentReal = avg(recent, (m) => m.real);
  return {
    early: early.map((m) => m.month_num),
    recent: recent.map((m) => m.month_num),
    earlyReal: ag(earlyReal),
    recentReal: ag(recentReal),
    delta: ag(recentReal - earlyReal),
    rows,
    earlySavingsRate: rate(early),
    recentSavingsRate: rate(recent),
    thin: past.filter((m) => median > 0 && m.entries < 0.6 * median).map((m) => m.month_num),
    projected: [...early, ...recent].filter((m) => m.status !== 'past').map((m) => m.month_num),
  };
}

/**
 * One income mix against one spend level. margin = income − spend. When it is
 * short, months = how long cash covers the shortfall (0 when there is no
 * cash). When it is covered, months = null — nothing is being drawn down.
 */
export function runway(
  cash: number,
  income: number,
  spend: number,
): { margin: number; months: number | null } {
  const margin = ag(n(income) - n(spend));
  if (margin >= 0) return { margin, months: null };
  const c = Math.max(0, n(cash));
  return { margin, months: Math.round((c / -margin) * 10) / 10 };
}

// ── v58: Bills, line by line (her ask 2026-10-11: "a better grasp on recurring") ──

/**
 * One housing/recurring bill across the year. Renamed lines are ONE bill:
 * lines in the same category that share a first word are merged ("Claude
 * Pro" → "Claude Code Max" → "Claude Max"), labelled by the newest name.
 */
export interface BillLine {
  key: string;
  label: string;
  category: string;
  /** Every name it went by this year, oldest first. */
  names: string[];
  /** Amount per month_num 1–12 (0 = no line that month). */
  byMonth: number[];
  /** Amount in the reference month (current, else the last month). */
  now: number;
  /** First month with money, and its amount. */
  firstMonth: number | null;
  first: number;
  /** Last month with money. */
  lastMonth: number | null;
  annual: number;
  /**
   * ended   — money before the reference month, none from it on
   * new     — first money after January
   * changed — the amount moved during the year (by more than ₪1)
   * steady  — the same every month it ran
   */
  status: 'ended' | 'new' | 'changed' | 'steady';
  /** Month-to-month moves: from → to, starting that month. */
  changes: { month: number; from: number; to: number }[];
}
export function billLines(
  budgetItems: AnalyzeBudgetItem[],
  months: { id: string; month_num: number }[],
  fixedKeys: string[],
  refMonth: number,
): BillLine[] {
  const numById: Record<string, number> = {};
  for (const m of months) numById[m.id] = m.month_num;
  const first = (label: unknown): string => lineKey(label).split(/[\s\-–(]/)[0] || '(unnamed)';
  const map: Record<string, BillLine & { lastSeen: number }> = {};
  for (const b of budgetItems) {
    if (!fixedKeys.includes(b.category)) continue;
    const mn = numById[b.month_id];
    if (!mn) continue;
    const k = b.category + '|' + first(b.label);
    const line = (map[k] ||= {
      key: k,
      label: String(b.label || '').trim() || '(unnamed)',
      category: b.category,
      names: [],
      byMonth: Array(12).fill(0),
      now: 0,
      firstMonth: null,
      first: 0,
      lastMonth: null,
      annual: 0,
      status: 'steady',
      changes: [],
      lastSeen: 0,
    });
    const name = String(b.label || '').trim();
    if (name && !line.names.includes(name)) line.names.push(name);
    if (mn >= line.lastSeen && name) {
      line.label = name.replace(/\s*\(?\d+\s*\/\s*\d+\)?\s*$/, '');
      line.lastSeen = mn;
    }
    line.byMonth[mn - 1] += n(b.amount);
  }
  const out: BillLine[] = [];
  for (const k of Object.keys(map)) {
    const { lastSeen: _ls, ...line } = map[k];
    void _ls;
    line.byMonth = line.byMonth.map((v) => ag(v));
    const withMoney = line.byMonth
      .map((v, i) => ({ v, m: i + 1 }))
      .filter((x) => Math.round(x.v) !== 0);
    line.annual = ag(line.byMonth.reduce((s, v) => s + v, 0));
    line.now = line.byMonth[refMonth - 1] || 0;
    line.firstMonth = withMoney.length ? withMoney[0].m : null;
    line.first = withMoney.length ? withMoney[0].v : 0;
    line.lastMonth = withMoney.length ? withMoney[withMoney.length - 1].m : null;
    for (let i = 1; i < withMoney.length; i++) {
      const a = withMoney[i - 1];
      const b = withMoney[i];
      if (Math.abs(b.v - a.v) > 1) line.changes.push({ month: b.m, from: a.v, to: b.v });
    }
    const endedLine =
      line.lastMonth !== null &&
      line.lastMonth < refMonth &&
      line.byMonth.slice(refMonth - 1).every((v) => Math.round(v) === 0);
    line.status = endedLine
      ? 'ended'
      : line.firstMonth !== null && line.firstMonth > 1
        ? 'new'
        : line.changes.length
          ? 'changed'
          : 'steady';
    if (line.firstMonth !== null) out.push(line);
  }
  out.sort((a, b) => b.annual - a.annual || a.label.localeCompare(b.label));
  return out;
}

// ── v58: Travel & admin, this year vs next (her ask 2026-10-11) ───────────

export interface PotItemIn {
  id: string;
  year: number;
  label: string;
  projected_amount: unknown;
  category?: string | null;
  is_estimate?: boolean | null;
}
export interface PotPaidIn {
  /** travel: the trip label (travel_payments.destination); admin: the item id. */
  ref: string;
  year: number;
  amount: unknown;
  paid: boolean;
}
export interface PotRow {
  label: string;
  group: string;
  planned: number;
  paid: number;
  estimate: boolean;
}
export interface PotYear {
  year: number;
  rows: PotRow[];
  planned: number;
  paid: number;
  byGroup: { group: string; planned: number; paid: number }[];
}
/**
 * One pot (travel or admin) for one year: each item's plan and what has been
 * paid against it, grouped (admin by its category; travel all "Trips").
 * Payments that match no item are kept as their own row, never dropped.
 */
export function potYear(
  year: number,
  items: PotItemIn[],
  paid: PotPaidIn[],
  matchBy: 'label' | 'id',
): PotYear {
  const its = items.filter((i) => i.year === year);
  const pays = paid.filter((p) => p.year === year && p.paid);
  const used = new Set<PotPaidIn>();
  const rows: PotRow[] = its.map((i) => {
    const mine = pays.filter((p) => (matchBy === 'id' ? p.ref === i.id : p.ref === i.label));
    mine.forEach((p) => used.add(p));
    return {
      label: i.label,
      group: matchBy === 'label' ? 'Trips' : String(i.category || 'Other'),
      planned: ag(n(i.projected_amount)),
      paid: ag(mine.reduce((s, p) => s + n(p.amount), 0)),
      estimate: !!i.is_estimate,
    };
  });
  const loose = pays.filter((p) => !used.has(p));
  if (loose.length)
    rows.push({
      label: 'Paid, not tied to an item',
      group: matchBy === 'label' ? 'Trips' : 'Other',
      planned: 0,
      paid: ag(loose.reduce((s, p) => s + n(p.amount), 0)),
      estimate: false,
    });
  rows.sort((a, b) => Math.max(b.planned, b.paid) - Math.max(a.planned, a.paid));
  const groups: Record<string, { group: string; planned: number; paid: number }> = {};
  for (const r of rows) {
    const g = (groups[r.group] ||= { group: r.group, planned: 0, paid: 0 });
    g.planned = ag(g.planned + r.planned);
    g.paid = ag(g.paid + r.paid);
  }
  return {
    year,
    rows,
    planned: ag(rows.reduce((s, r) => s + r.planned, 0)),
    paid: ag(rows.reduce((s, r) => s + r.paid, 0)),
    byGroup: Object.values(groups).sort((a, b) => b.planned - a.planned),
  };
}

// ── v63: "A month now" — what a month costs from here on ────────────────

/**
 * Her question turned forward (PM reassessment, 2026-10-11): rent is ₪3,200
 * now, Mounjaro ended, Claude is ₪310 — a Jan–Sep average says none of that.
 * A month now = this coming month's bills as budgeted (the lines, so rent
 * and Claude as they are now) + everyday at the average of the last
 * `recentN` complete months (per envelope; a line can start later — health
 * from the month Mounjaro stopped — or be 0 by her choice, e.g. therapy) +
 * that month's charity. Pots (trips, one-offs) are left out — the caller
 * adds a plan figure beside it, labelled.
 */
export interface MonthNowRules {
  /** month_num whose bills and charity count (the coming month). */
  billsMonth: number;
  /** How many of the latest complete months the everyday average takes. */
  recentN?: number;
  /** Envelope key → first month_num to average from (e.g. health from Sep). */
  fromMonth?: Record<string, number>;
  /** Envelopes counted as 0 by her choice. */
  zero?: string[];
}
export interface MonthNow {
  billsMonth: number;
  bills: number;
  everyday: number;
  /** month_nums the everyday average is taken over. */
  everydayMonths: number[];
  byCat: Record<string, number>;
  charity: number;
  total: number;
}
export function monthNow(r: AnalyzeResult, rules: MonthNowRules): MonthNow | null {
  const past = r.months.filter((m) => m.status === 'past');
  if (!past.length) return null;
  const bm =
    r.months.find((m) => m.month_num === rules.billsMonth) || r.months[r.months.length - 1];
  if (!bm) return null;
  const recent = past.slice(-Math.max(1, rules.recentN ?? 6));
  const byCat: Record<string, number> = {};
  for (const c of r.cats) {
    if (c.kind !== 'envelope') continue;
    if (rules.zero && rules.zero.includes(c.key)) {
      byCat[c.key] = 0;
      continue;
    }
    const from = rules.fromMonth ? rules.fromMonth[c.key] : undefined;
    const fromMs = from ? past.filter((m) => m.month_num >= from) : [];
    const ms = fromMs.length ? fromMs : recent;
    byCat[c.key] = ag(ms.reduce((s, m) => s + (m.actualByCat[c.key] || 0), 0) / ms.length);
  }
  const everyday = ag(Object.values(byCat).reduce((s, v) => s + v, 0));
  return {
    billsMonth: bm.month_num,
    bills: bm.fixed,
    everyday,
    everydayMonths: recent.map((m) => m.month_num),
    byCat,
    charity: bm.charity,
    total: ag(bm.fixed + everyday + bm.charity),
  };
}

/**
 * The three figures "A month now" can show, from ONE computation so the
 * tile and its section can never disagree (v70: the tile said 12,970 while the
 * section bolded 10,869 — the tile added the lean-plan trips, the section did
 * not). base = bills + everyday + charity; withLean / withNormal add the
 * next year's trips & one-offs per month under her lean / normal plan.
 * `headline` is the one number the tile and the section's first sentence show:
 * base plus the lean plan when a plan exists, else the base alone.
 */
export interface MonthNowTotals {
  base: number;
  withLean: number;
  withNormal: number;
  headline: number;
}
export function monthNowTotals(
  base: number,
  oneOffsMo: number,
  oneOffsLeanMo: number,
): MonthNowTotals {
  const b = ag(n(base));
  const withLean = ag(b + n(oneOffsLeanMo));
  const withNormal = ag(b + n(oneOffsMo));
  return {
    base: b,
    withLean,
    withNormal,
    headline: n(oneOffsMo) || n(oneOffsLeanMo) ? withLean : b,
  };
}

/**
 * Which month's bills "now" means, for EVERY caller (the tile, the bills
 * chip, the Bills section, Why's "running now"): the reference month — the
 * month in progress, the one she is looking at — never the next one. The
 * old A-month-now code looked one month ahead (Nov ₪5,197 beside Oct ₪5,432).
 */
export function billsMonthFor(referenceMonth: number | null): number {
  return referenceMonth || 12;
}
