// What this is: "what is shown" - the ONE place a number that sits beside its parts
//   on the Analyze stack gets worked out for printing, under ONE rounding rule.
// Why it exists: three review rounds found "shown parts don't add to the shown total"
//   in a new card each time. The first fix rounded each part and added them (the stack
//   then disagreed with the Budget ribbon / Cash tab by a shekel). The second fix
//   apportioned the total's shekels over the parts (largest remainder) - which made the
//   SAME figure print a shekel apart in two places (recurring bills 1,153 on one card and
//   1,154 on another; Holdings 24,001 beside the Cash tab's 24,000). Both broke her rule:
//   one meaning for every number.
// What's decided (round 3, her rule):
//   - Every individual figure (an account, a bill line, an envelope, an average) prints
//     ITS OWN rounding, `roundZ` (= Math.round, the app's one rule), exactly as every other
//     tab prints it. No part is ever nudged to make a sum work.
//   - Every total prints its SOURCE's own rounded number: the true (unrounded) sum, rounded
//     once. That is what the ribbon, the Cash tab and the classic page print.
//   - When the printed parts do not add to the printed total, the difference is returned as
//     `residual` and the card prints ONE visible row "agorot, rounded" inside that sum, so
//     what is on the screen still adds up exactly and nothing is hidden.
//   - A sum is worked in whole agorot (integers), so float noise cannot tip a half.
//   DOM-free and Supabase-free (plain node:test).
// What's built: totalOf, shownSum, shownChain, shownDiff, shownByKey and the card-level
//   builders (cash, ribbon left, plan income, a month now, the year's "your way" gap, the
//   Year-tab bridge, bills, bill moves, pots), each returning its residuals.
// What's next: nothing pending.
// Links: lib/money.ts (roundZ) · tabs/analyze.ts (marks every group with data-sum-group and
//   prints the residual rows) · app.ts buildStackCtx · tests/shown.test.mjs ·
//   tests/analyze-stack.spec.js (the page-wide invariant and the cross-group data-qty test).

import { roundZ } from './money.js';

/** The label of the one extra row that closes a sum whose printed parts are each rounded on their own. */
export const ROUNDING_LABEL = 'agorot, rounded';

const cents = (v: unknown): number => Math.round((Number(v) || 0) * 100);
/** The true sum of the values (exact to the agorot), unrounded. */
export function trueSum(values: number[]): number {
  return values.reduce((a, v) => a + cents(v), 0) / 100;
}
/** The whole-shekel total of the TRUE parts: what every other tab prints for the same sum. */
export function totalOf(values: number[]): number {
  return roundZ(trueSum(values));
}

export interface ShownSum {
  /** Each part, its own rounding. */
  parts: number[];
  /** The true sum, rounded once. */
  total: number;
  /** total − the printed parts added: the "agorot, rounded" row (0 = the parts add up). */
  residual: number;
}
export function shownSum(parts: number[]): ShownSum {
  const p = parts.map(roundZ);
  const total = totalOf(parts);
  return { parts: p, total, residual: total - p.reduce((a, b) => a + b, 0) };
}

export interface ShownTerm {
  value: number;
  /** Printed with a minus in front of it ("− Card ₪50"). */
  minus?: boolean;
}
export interface ShownChain {
  /** Each term as printed (the number after a "−" is positive). */
  parts: number[];
  /** Each term as it counts: negative when `minus`. */
  signed: number[];
  total: number;
  residual: number;
}
/** "a + b − c = total": terms print their own rounding, the total is the true sum rounded. */
export function shownChain(terms: ShownTerm[]): ShownChain {
  const parts = terms.map((t) => roundZ(t.value));
  const signed = parts.map((p, i) => (terms[i].minus ? (p === 0 ? 0 : -p) : p));
  const total = totalOf(
    terms.map((t) => (t.minus ? -(Number(t.value) || 0) : Number(t.value) || 0)),
  );
  return { parts, signed, total, residual: total - signed.reduce((a, b) => a + b, 0) };
}
/** "a − b = diff": the difference is the true difference, rounded once. */
export function shownDiff(
  a: number,
  b: number,
): { a: number; b: number; diff: number; residual: number } {
  const c = shownChain([{ value: a }, { value: b, minus: true }]);
  return { a: c.parts[0], b: c.parts[1], diff: c.total, residual: c.residual };
}
/** Lines kept by key; the total is the true sum rounded once. */
export function shownByKey(lines: Record<string, number>): {
  lines: Record<string, number>;
  total: number;
  residual: number;
} {
  const keys = Object.keys(lines);
  const s = shownSum(keys.map((k) => lines[k]));
  return {
    lines: Object.fromEntries(keys.map((k, i) => [k, s.parts[i]])),
    total: s.total,
    residual: s.residual,
  };
}

// ── 💵 Cash: left now ─────────────────────────────────────────────────────
export interface CashShown {
  holdings: number;
  owed: number;
  debts: number[];
  oneOff: number;
  /** The Cash tab's Total Liquid, as that tab prints it. */
  liquid: number;
  /** Total Liquid minus the what-if, from the Cash tab's own liquid. The 2027 path starts here. */
  leftNow: number;
  /** leftNow − (holdings + owed − debts − one-off) as printed. */
  residual: number;
}
/**
 * `liquid` is the Cash tab's own Total Liquid (true, unrounded); `oneOff` is the what-if,
 * already whole shekels. Left now = roundZ(liquid − oneOff): with no what-if that is EXACTLY
 * the Cash tab's Total Liquid.
 */
export function cashShown(i: {
  holdings: number;
  owed: number;
  debts: number[];
  liquid: number;
  oneOff: number;
}): CashShown {
  const oneOff = roundZ(i.oneOff);
  const holdings = roundZ(i.holdings);
  const owed = roundZ(i.owed);
  const debts = i.debts.map(roundZ);
  const leftNow = roundZ(trueSum([i.liquid, -oneOff]));
  return {
    holdings,
    owed,
    debts,
    oneOff,
    liquid: roundZ(i.liquid),
    leftNow,
    residual: leftNow - (holdings + owed - debts.reduce((a, b) => a + b, 0) - oneOff),
  };
}

// ── 💰 Left to Budget ─────────────────────────────────────────────────────
/** The ribbon's own three values, printed the way the ribbon prints them; the row closes the gap. */
export function ribbonLeftShown(r: { income: number; budgeted: number; left: number }): {
  income: number;
  budgeted: number;
  left: number;
  residual: number;
} {
  const income = roundZ(r.income);
  const budgeted = roundZ(r.budgeted);
  const left = roundZ(r.left);
  return { income, budgeted, left, residual: left - (income - budgeted) };
}

// ── The plan's income (🧭 detail, 💼) ────────────────────────────────────
export function planIncomeShown(i: {
  petachya: number;
  gan2: number;
  clients: number;
  se: number;
}): {
  petachya: number;
  gan2: number;
  clients: number;
  se: number;
  income: number;
  residual: number;
} {
  const c = shownChain([
    { value: i.petachya },
    { value: i.gan2 },
    { value: i.clients },
    { value: i.se, minus: true },
  ]);
  return {
    petachya: c.parts[0],
    gan2: c.parts[1],
    clients: c.parts[2],
    se: c.parts[3],
    income: c.total,
    residual: c.residual,
  };
}

// ── 📅 A month now ────────────────────────────────────────────────────────
export interface MonthNowShown {
  bills: number;
  /** Every everyday envelope, its own rounding (key + whole shekels), in the order given. */
  everydayRows: { key: string; value: number }[];
  /** The true Everyday rounded. */
  everyday: number;
  everydayResidual: number;
  charity: number;
  /** The true bills + everyday + charity, rounded. */
  base: number;
  baseResidual: number;
  /** Her lean plan's trips & one-offs, ÷ 12, its own rounding. */
  lean: number;
  /** The true base + lean (when a plan exists), rounded: the classic page's month. */
  headline: number;
  headlineResidual: number;
  /** The true base + her normal plan, rounded. */
  withNormal: number;
}
export function monthNowShown(i: {
  bills: number;
  everydayByCat: { key: string; value: number }[];
  charity: number;
  oneOffsMo: number;
  oneOffsLeanMo: number;
}): MonthNowShown {
  const hasPlan = !!(i.oneOffsMo || i.oneOffsLeanMo);
  const env = shownSum(i.everydayByCat.map((x) => x.value));
  const envRaw = trueSum(i.everydayByCat.map((x) => x.value));
  const bills = roundZ(i.bills);
  const charity = roundZ(i.charity);
  const baseRaw = trueSum([i.bills, envRaw, i.charity]);
  const base = roundZ(baseRaw);
  const lean = roundZ(i.oneOffsLeanMo);
  const headline = roundZ(hasPlan ? trueSum([baseRaw, i.oneOffsLeanMo]) : baseRaw);
  return {
    bills,
    everydayRows: i.everydayByCat.map((x, k) => ({ key: x.key, value: env.parts[k] })),
    everyday: env.total,
    everydayResidual: env.residual,
    charity,
    base,
    baseResidual: base - (bills + env.total + charity),
    lean,
    headline,
    headlineResidual: headline - (base + (hasPlan ? lean : 0)),
    withNormal: roundZ(trueSum([baseRaw, i.oneOffsMo])),
  };
}

// ── 🧾 This year so far: "your way" and where the gap is ────────────────
export type GapKind =
  /** under ₪50: nothing to say */
  | 'none'
  /** income not yet budgeted + budgeted, not spent: both parts are real */
  | 'split'
  /** the gap is real but one part is negative: say the gap, show no split */
  | 'gap-only'
  /** income − savings is LESS than real spend: you spent more than you budgeted */
  | 'over-spent';
export interface YearWayShown {
  /** bills, everyday, trips + admin, charity - each its own rounding. */
  parts: number[];
  /** The true real spend, rounded (the classic page's number). */
  realSpend: number;
  realResidual: number;
  income: number;
  savings: number;
  /** The true income − savings, rounded. */
  herWay: number;
  wayResidual: number;
  /** The true gap, rounded (the classic page's "more than this tab"). */
  gap: number;
  /** gap − (your way − real spend) as printed. */
  gapResidual: number;
  /** Money budgeted for an everyday envelope and not spent, rounded. */
  unspent: number;
  /** Income not yet budgeted: the true gap − the true unspent, rounded. */
  notBudgeted: number;
  /** gap − (income not yet budgeted + budgeted-not-spent) as printed. */
  splitResidual: number;
  kind: GapKind;
}
/**
 * `unspentAvg` = the average of (envelopeBudget − envelope) over the same months,
 * where `envelope` is the real-spend figure analyzeYear counts (a month still
 * ahead counts its budget, so it adds nothing to the gap).
 */
export function yearWayShown(i: {
  partsAvg: number[];
  incomeAvg: number;
  savingsAvg: number;
  unspentAvg: number;
}): YearWayShown {
  const real = shownSum(i.partsAvg);
  const way = shownChain([{ value: i.incomeAvg }, { value: i.savingsAvg, minus: true }]);
  const gapRaw = trueSum([trueSum([i.incomeAvg, -i.savingsAvg]), -trueSum(i.partsAvg)]);
  const gap = roundZ(gapRaw);
  const unspent = roundZ(i.unspentAvg);
  const notBudgeted = roundZ(trueSum([gapRaw, -i.unspentAvg]));
  const kind: GapKind =
    Math.abs(gap) < 50
      ? 'none'
      : gap < 0
        ? 'over-spent'
        : unspent < 0 || notBudgeted < 0
          ? 'gap-only'
          : 'split';
  return {
    parts: real.parts,
    realSpend: real.total,
    realResidual: real.residual,
    income: way.parts[0],
    savings: way.parts[1],
    herWay: way.total,
    wayResidual: way.residual,
    gap,
    gapResidual: gap - (way.total - real.total),
    unspent,
    notBudgeted,
    splitResidual: gap - (notBudgeted + unspent),
    kind,
  };
}

/** The Year-tab bridge: this tab's figure + three effects = the Year tab's. */
export interface GapChainShown {
  windowAvg: number;
  windowEffect: number;
  envEffect: number;
  otherEffect: number;
  /** What "the Year tab says" prints: the Year tab's own number, rounded. */
  yearTab: number;
  /** yearTab − the printed terms added (only when the bridge closes). */
  residual: number;
  /** The true gap the terms leave, in whole shekels: 0 means "adds up". */
  unexplained: number;
}
export function gapChainShown(g: {
  windowAvg: number;
  windowEffect: number;
  envEffect: number;
  otherEffect: number;
  yearTabAvg: number;
}): GapChainShown {
  const terms = [g.windowAvg, g.windowEffect, g.envEffect, g.otherEffect].map(roundZ);
  const yearTab = roundZ(g.yearTabAvg);
  const rawUnexplained =
    g.yearTabAvg - (g.windowAvg + g.windowEffect + g.envEffect + g.otherEffect);
  const adds = Math.abs(rawUnexplained) < 1;
  return {
    windowAvg: terms[0],
    windowEffect: terms[1],
    envEffect: terms[2],
    otherEffect: terms[3],
    yearTab,
    residual: adds ? yearTab - terms.reduce((a, b) => a + b, 0) : 0,
    unexplained: adds ? 0 : roundZ(rawUnexplained),
  };
}

/** "What moved since …": early + every driver's move = recent. */
export interface BridgeShown {
  rows: { key: string; early: number; recent: number; delta: number }[];
  /** The true early / recent averages, rounded (the classic page's). */
  earlyReal: number;
  recentReal: number;
  /** The true move, rounded. */
  delta: number;
  /** recentReal − (earlyReal + every printed move). */
  residual: number;
}
export function bridgeShown(
  rows: { key: string; early: number; recent: number }[],
  earlyReal: number,
  recentReal: number,
): BridgeShown {
  const eT = roundZ(earlyReal);
  const rT = roundZ(recentReal);
  const out = rows.map((r) => ({
    key: r.key,
    early: roundZ(r.early),
    recent: roundZ(r.recent),
    delta: roundZ(trueSum([r.recent, -r.early])),
  }));
  return {
    rows: out,
    earlyReal: eT,
    recentReal: rT,
    delta: roundZ(trueSum([recentReal, -earlyReal])),
    residual: rT - (eT + out.reduce((a, r) => a + r.delta, 0)),
  };
}

// ── 🏠 Bills now ─────────────────────────────────────────────────────────
export interface BillsShown {
  /** The true bills of the month, rounded. */
  total: number;
  /** total − the printed categories. */
  residual: number;
  cats: {
    key: string;
    /** The true category, rounded (what the Year tab and the Lean card print for it). */
    total: number;
    /** Each line, its own rounding. */
    lines: number[];
    /** total − the printed lines. */
    residual: number;
  }[];
}
/** A category with no lines (read from last year) has `lines: []` and no residual. */
export function billsShown(cats: { key: string; raw: number; lines: number[] }[]): BillsShown {
  const total = totalOf(cats.map((c) => c.raw));
  const out = cats.map((c) => {
    const t = roundZ(c.raw);
    const lines = c.lines.map(roundZ);
    return {
      key: c.key,
      total: t,
      lines,
      residual: c.lines.length ? t - lines.reduce((a, b) => a + b, 0) : 0,
    };
  });
  return { total, residual: total - out.reduce((a, c) => a + c.total, 0), cats: out };
}

export interface BillMovesShown {
  /** The biggest moves, biggest first; a line that did not move (as printed) is left out. */
  rows: { id: string; start: number; now: number; delta: number }[];
  /** The moves not listed, added together, and how many there are. */
  others: number;
  othersCount: number;
  /** The true now − start of every bill, rounded (the classic page's "Bills Jan → Oct"). */
  total: number;
  /** total − the printed moves (listed + the rest). */
  residual: number;
  startTotal: number;
  nowTotal: number;
}
/** Each line prints its own start and now; a move is now − start as printed. */
export function billMovesShown(
  lines: { id: string; start: number; now: number }[],
  top: number,
): BillMovesShown {
  const all = lines.map((l) => {
    const start = roundZ(l.start);
    const now = roundZ(l.now);
    return { id: l.id, start, now, delta: now - start };
  });
  const moved = all
    .filter((x) => x.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const shown = moved.slice(0, top);
  const rest = moved.slice(top);
  const others = rest.reduce((a, x) => a + x.delta, 0);
  const total = roundZ(
    trueSum([trueSum(lines.map((l) => l.now)), -trueSum(lines.map((l) => l.start))]),
  );
  return {
    rows: shown,
    others,
    othersCount: rest.length,
    total,
    residual: total - (shown.reduce((a, x) => a + x.delta, 0) + others),
    startTotal: roundZ(trueSum(lines.map((l) => l.start))),
    nowTotal: roundZ(trueSum(lines.map((l) => l.now))),
  };
}
/** The months (1–12) in which any bill line has money - a year with fewer than 12 is a partial year. */
export function billMonthsSeen(lines: { byMonth: number[] }[]): number[] {
  const seen: number[] = [];
  for (let i = 0; i < 12; i++)
    if (lines.some((l) => roundZ(l.byMonth[i] || 0) !== 0)) seen.push(i + 1);
  return seen;
}

// ── ✈️📋 Trips & one-offs ───────────────────────────────────────────────
/** A trip or item counts its plan or what has been paid, whichever is more. */
export const potCounts = (r: { planned: number; paid: number }): number =>
  Math.max(r.planned, r.paid);

export interface PotsKindShown {
  /** This year's kind, the true sum rounded. */
  v0: number;
  /** This year's items, each its own rounding, and the row that closes them to the kind. */
  y0Rows: number[];
  y0Residual: number;
  /** Next year's kind: its plan or the app, whichever is more (true sums), rounded. */
  v1: number;
  planWins: boolean;
  appRows: number[];
  planRows: number[];
  /** The rows of the set that counts, closed to the kind. */
  v1Residual: number;
}
export function potsShown(kinds: { y0: number[]; app: number[]; plan: number[] }[]): {
  y0Total: number;
  y0Residual: number;
  y1Total: number;
  y1Residual: number;
  kinds: PotsKindShown[];
} {
  const out = kinds.map((k) => {
    const s0 = shownSum(k.y0);
    const planWins = trueSum(k.plan) > trueSum(k.app);
    const win = shownSum(planWins ? k.plan : k.app);
    return {
      v0: s0.total,
      y0Rows: s0.parts,
      y0Residual: s0.residual,
      v1: win.total,
      planWins,
      appRows: k.app.map(roundZ),
      planRows: k.plan.map(roundZ),
      v1Residual: win.residual,
    };
  });
  const raw0 = kinds.map((k) => trueSum(k.y0));
  const raw1 = kinds.map((k) =>
    trueSum(k.plan) > trueSum(k.app) ? trueSum(k.plan) : trueSum(k.app),
  );
  const y0Total = totalOf(raw0);
  const y1Total = totalOf(raw1);
  return {
    y0Total,
    y0Residual: y0Total - out.reduce((a, k) => a + k.v0, 0),
    y1Total,
    y1Residual: y1Total - out.reduce((a, k) => a + k.v1, 0),
    kinds: out,
  };
}
