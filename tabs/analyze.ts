// What this is: the Analyze tab's card stack — one scrolling page of cards, the
//   answer on top, every number tapping open to what it is made of. Pure: it
//   takes a plain-data context (StackCtx) and returns an HTML string. It never
//   reads `state`, never calls Supabase, and only formats the numbers it is given.
// Why it exists: her Oct 15 words — "the analyze page is so confusing… It needs
//   to be done from the bottom up." Splitting it out of the 15,000-line app.ts
//   also lets the cards be read (and tested) on their own.
// What's decided (v73 spec §5 B3, D1–D8, D12): cards in this order — 💰 Left to
//   Budget · 🧭 After Feb 7 · 💵 Cash · 💼 Income after Feb 7 · 📅 A month now ·
//   🪜 My levels · ✈️📋 Trips & one-offs · 🏠 Bills now · 🧾 This year so far. No red anywhere: short is amber, covered is the accent. Every
//   new money formula lives in lib/ with a unit test; the renderer only formats.
// What's built: B1 the skeleton · B2 StackCtx (the plain data app.ts hands over) ·
//   B3 the four answer cards · C1 the five truth cards (their money comes from the
//   tested lib/analyze.ts functions, called here on plain data — no new formula).
// What's next: v74 deletes the classic page (renderAnalyzeTab in app.ts).
// Links: app.ts (analyzeMode, buildStackCtx) · lib/scenarios.ts · lib/feb7.ts ·
//   styles.css (.an2-*) · tests/analyze-stack.spec.js · second-brain
//   projects/budget-app/v73-analyze-rebuild-spec-2026-10-18.md.

import { roundZ, shekels } from '../lib/money.js';
import { planCaption } from '../lib/scenarios.js';
import {
  ROUNDING_LABEL,
  billMonthsSeen,
  billMovesShown,
  billsShown,
  bridgeShown,
  gapChainShown,
  monthNowShown,
  potCounts,
  potsShown,
  shownDiff,
  yearWayShown,
} from '../lib/shown.js';
import {
  WHOLE_YEAR,
  billLines,
  billsMonthFor,
  monthNow,
  whyBridge,
  yearTabGap,
} from '../lib/analyze.js';
import type {
  AnalyzeBudgetItem,
  AnalyzeCatStat,
  AnalyzeCategory,
  AnalyzeMonth,
  AnalyzeResult,
  BillLine,
  PotRow,
  PotYear,
} from '../lib/analyze.js';
import type { Feb7Result, LevelAnswer } from '../lib/feb7.js';
import type { LevelKey, PotPlanRow, ScenarioRow } from '../lib/scenarios.js';

/** One way 2027 could look, with the US self-employment tax worked out when it is switched on. */
export interface StackScenario extends ScenarioRow {
  /** net − se: the income every comparison on the stack uses. */
  incomeNet: number;
  /** US self-employment tax a month (rough); 0 when off or the mix has no private clients. */
  se: number;
}

/** One of her four spending levels (Lean = her editable floor, the rest = the Oct 11 walkthrough). */
export interface StackLevel {
  key: LevelKey;
  name: string;
  note: string;
  total: number;
  lines: Record<string, number>;
  /** Lean only: the year whose floors are shown because the viewed year has none yet. */
  fromYear: number | null;
  /** total − the lines as printed (the "agorot, rounded" row; 0 when they add up). */
  residual: number;
}

export interface StackIncomeMonth {
  month_num: number;
  label: string;
  status: string;
  total: number;
  /** total − the rows as printed. */
  residual: number;
  rows: { label: string; value: number; why: string[] }[];
}

/**
 * Everything the stack reads, as plain data (assembled by app.ts buildStackCtx).
 * Nothing here is `state`: the renderer cannot reach it.
 */
export interface StackCtx {
  /** The year open on the Budget tab. */
  year: number;
  today: { year: number; month: number; iso: string };
  /** The viewed year's analysis (chunk C cards read it). */
  r: AnalyzeResult;
  /** The year the "month now" / "this year" cards read as their base (C2 fills the prior-year case). */
  base: { year: number; r: AnalyzeResult; prior: boolean };
  /** The base year read with the stack's floors (W5): what an opened 🪜 line shows when the viewed year has no complete month. */
  baseLean: AnalyzeResult | null;
  avgWindow: number;
  floorsLoading: boolean;
  /** Lean read wholly from this prior year (the viewed year has no floor row yet). */
  floorsFrom: number | null;
  /** Lean read partly from this prior year: the lines that have no row for the viewed year (Z4). */
  floorsPartial: { year: number; keys: string[] } | null;
  /** Which details are open (view state, never stored). */
  open: Set<string>;
  drive: boolean;
  se: boolean;
  /** 💰: the Budget ribbon's own values for the month open there (D1). */
  left: {
    monthId: string;
    year: number;
    monthNum: number;
    income: number;
    budgeted: number;
    left: number;
    estimated: boolean;
    monthName: string;
    /** The month open on the Budget tab is not today's month. */
    notToday: boolean;
    /** left − (income − budgeted) as printed: the "agorot, rounded" row. */
    residual: number;
  } | null;
  /** 💵: the Cash tab's own totals, and what-if. */
  cash: {
    holdings: number;
    owed: number;
    debt: number;
    liquid: number;
    /** How many cash accounts exist (0 = nothing set up on the Cash tab yet). */
    accounts: number;
    /** Oldest balance date as 'Oct 12', or null when no balances are set. */
    asOf: string | null;
    days: number | null;
    debts: { name: string; amount: number }[];
    oneOff: number;
    /** liquid − the what-if one-off. */
    leftNow: number;
    /** leftNow − (holdings + owed − debts − one-off) as printed. */
    residual: number;
  };
  /** 'passed' = Feb 7 2027 has come; 'idle' | 'loading' | 'ready' | 'error' = the month loader. */
  feb7: { status: 'idle' | 'loading' | 'ready' | 'error' | 'passed'; result: Feb7Result | null };
  /** The cash the 2027 path starts from: the Feb 7 projection, else left now. */
  feb7Start: number;
  feb7StartIsProjection: boolean;
  scenarios: StackScenario[];
  /** Order: Temp, Lean, Middle, Normal. */
  levels: StackLevel[];
  /** answerByLevel for `levels`, same order. */
  answers: LevelAnswer[];
  planParts: {
    petachya: number;
    gan2: number;
    low: number;
    high: number;
    incomeLow: number;
    incomeHigh: number;
    seLow: number;
    seHigh: number;
    residualLow: number;
    residualHigh: number;
  };
  /** The PAY figures the strings print. */
  pay: {
    khHarel: number;
    softLine: number;
    havraa2027: number;
    gan2: {
      perSession: number;
      sessionsPerDay: number;
      daysPerWeek: number;
      minutesPerSession: number;
      paidMonths: number;
    };
    cancellations: number;
  };
  jobs: { label: string; clalit: string; school: string; diff: string }[];
  /** The school mix without its keren hishtalmut (her belief, not confirmed): net, and net + funds. */
  schoolWithout: { net: number; netPlusFunds: number };
  perHour: Record<string, { job: string; value: number; basis: string }[]>;
  /** The viewed year's income, month by month, with her reasons (flat rows for 💼). */
  incomeMonths: StackIncomeMonth[];
  incomePatterns: string[];
  /** 🏠: the viewed year's budget lines and months (billLines reads them); null until loaded. */
  billsData: { items: AnalyzeBudgetItem[]; months: { id: string; month_num: number }[] } | null;
  /** ✈️📋: travel + admin for the viewed year and the next; null while loading. */
  pots: { years: number[]; travel: PotYear[]; admin: PotYear[] } | null;
  /** Her pot plan, every year (the cards pick the year they need). */
  potPlan: PotPlanRow[];
  /** 📅: Carmei Gat, rough, from the Oct 12 analysis (lib/pay carmeiGatNet). */
  carmei: {
    rent: number;
    mortgage: number;
    insurance: number;
    mortgageLife: number;
    upkeepAllowance: number;
    before: number;
    withUpkeep: number;
    residualA: number;
    residualB: number;
  };
  /** 📅: what to park for tax on private income (lib/pay taxSetAside), at both rates. */
  tax: {
    turnoverMonth: number;
    taxableShare: number;
    marginalRate: number;
    marginalRateHigh: number;
    low: number;
    high: number;
  };
  /** Constants the chunk C cards read. */
  text: {
    CATEGORIES: AnalyzeCategory[];
    MONTH_NOW_RULES: Record<number, { fromMonth: Record<string, number>; zero: string[] }>;
    WHY_ROWS: { key: string; label: string; tag: string; why: string }[];
    TAG_LABEL: Record<string, string>;
    INCOME_WHY: Record<number, Record<number, Record<string, string[] | undefined>>>;
    INCOME_PATTERNS: Record<number, string[]>;
    POT_NOT_IN_APP: Record<number, string[]>;
    MONTHS: string[];
    MONTH_ABBR: string[];
  };
}

// ── Formatting (same rules as the classic page) ───────────────────────────
// Never ₪-x: a minus sits in front of the shekel sign (U+2212).
const money = (v: number): string => (roundZ(v) < 0 ? '−' + shekels(-v) : shekels(v || 0));
const signed = (v: number): string =>
  roundZ(v) < 0 ? '−' + shekels(-v) : roundZ(v) > 0 ? '+' + shekels(v) : shekels(0);
const esc = (t: unknown): string =>
  String(t ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
// Hebrew words inside an English line keep their own direction (<bdi>) so the
// bidi algorithm does not reorder the shekels around them.
const bidi = (t: unknown): string =>
  esc(t).replace(/[֐-׿][֐-׿\s"'׳״-]*[֐-׿]|[֐-׿]/g, '<bdi>$&</bdi>');

interface Fmt {
  ym: (y: number, m: number) => string;
  mon: (m: number) => string;
  /** [1,2,3] -> 'Jan–Mar'; [] -> 'no complete months yet' */
  span: (ms: number[]) => string;
  /** 25000 -> '₪25K' */
  k: (v: number) => string;
}
const fmtOf = (ctx: StackCtx): Fmt => ({
  ym: (y, m) => (ctx.text.MONTH_ABBR[m - 1] || '?') + ' ' + y,
  mon: (m) => ctx.text.MONTH_ABBR[m - 1] || '?',
  span: (ms) => {
    const a = (m: number): string => ctx.text.MONTH_ABBR[m - 1] || '?';
    return !ms.length
      ? 'no complete months yet'
      : ms.length === 1
        ? a(ms[0])
        : a(ms[0]) + '–' + a(ms[ms.length - 1]);
  },
  k: (v) => '₪' + Math.round(v / 1000) + 'K',
});

// ── Building blocks ───────────────────────────────────────────────────────
/** Close a sentence with a full stop — unless the text already ends in punctuation (a quote that ends “…for it”. gets no second one). */
const endSentence = (t: string): string => (/[.!?…]$/.test(t.trim()) ? t : t + '.');
const row = (label: string, value: string, cls = ''): string =>
  '<div class="an2-row' +
  (cls ? ' ' + cls : '') +
  '"><span>' +
  label +
  '</span><span>' +
  value +
  '</span></div>';
const head = (t: string): string => '<div class="an2-h">' + t + '</div>';
const note = (t: string): string => '<p class="an2-note">' + t + '</p>';
const flag = (t: string): string => '<p class="an2-flag">' + t + '</p>';
const sub = (t: string): string => '<span class="an2-sublbl">' + t + '</span>';
// Sum groups (W1/W2): a shown number that is a PART of, or the TOTAL of, a group of
// numbers on the page is wrapped in a span carrying its group id. The page-wide
// Playwright invariant adds every group's shown parts and compares them with its
// shown total(s). `minus` = printed as "− ₪50" (the number itself is positive).
const mark = (html: string, group: string, role: 'part' | 'total', minus = false): string =>
  '<span data-sum-group="' +
  group +
  '" data-' +
  role +
  (minus ? ' data-sign="-"' : '') +
  '>' +
  html +
  '</span>';
const P = (html: string, group: string, minus = false): string => mark(html, group, 'part', minus);
const T = (html: string, group: string): string => mark(html, group, 'total');
/** A level's total wherever it is printed: the total of its lines (🧭 detail) and, for Lean, of her floors (🪜). */
const lvTot = (key: string, html: string): string =>
  Q(
    key === 'lean' ? T(T(html, 'lean-floors'), 'lv-lean') : T(html, 'lv-' + key),
    'level:' + key + ':' + curYear,
  );
/**
 * A stable key on every printed figure that names a quantity (data-qty, space-separated for more
 * than one). The cross-group test asserts that every element with the same key prints the same
 * text across the whole app - the stack, the ribbon, the Cash tab, the Year tab, the classic page.
 */
const Q = (html: string, ...keys: string[]): string =>
  '<span data-qty="' + keys.join(' ') + '">' + html + '</span>';
const ymKey = (y: number, m: number): string => y + '-' + String(m).padStart(2, '0');
/** The viewed year while the stack renders (the level totals' keys carry it). */
let curYear = 0;
/** The one extra row that closes a sum whose printed parts are each rounded on their own. */
const resRow = (group: string, residual: number, suffix = ''): string =>
  residual === 0 ? '' : row(ROUNDING_LABEL + suffix, P(signed(residual), group), 'an2-row-sub');
const chip = '<span class="an2-chip">estimate</span>';
const unit = (t: string): string => '<span class="an2-unit">' + t + '</span>';

/** One card: a face that always shows, and a detail that opens (the answer card has no button: its tiles are the toggles). */
function card(
  ctx: StackCtx,
  key: string,
  title: string,
  face: string,
  detail: string,
  moreLabel: string | null,
): string {
  const open = ctx.open.has('an2:' + key);
  return (
    '<section class="card an2-card" id="an2-' +
    key +
    '" data-an2-card="' +
    key +
    '"><div class="an2-face"><div class="an2-titlerow"><span class="an2-title">' +
    title +
    '</span>' +
    (moreLabel
      ? '<button type="button" class="an2-more" data-an2-toggle aria-expanded="' +
        open +
        '" onclick="toggleAnRow(\'an2:' +
        key +
        '\')">' +
        (open ? '▾ Hide' : '▸ ' + moreLabel) +
        '</button>'
      : '') +
    '</div>' +
    face +
    '</div>' +
    (moreLabel ? (open ? '<div class="an2-detail">' + detail + '</div>' : '') : detail) +
    '</section>'
  );
}

// ── 💰 Left to Budget ─────────────────────────────────────────────────────
function leftCard(ctx: StackCtx, f: Fmt): string {
  const L = ctx.left;
  if (!L)
    return card(ctx, 'left', '💰 Left to Budget', '<div class="an2-cap">Loading…</div>', '', null);
  const face =
    '<div class="an2-big' +
    (L.left < 0 ? ' an2-amber' : '') +
    '" id="an2-left-value">' +
    Q(T(money(L.left), 'left'), 'left:' + ymKey(L.year, L.monthNum)) +
    '</div><div class="an2-cap">' +
    (L.left >= 0 ? 'income not yet budgeted' : 'more budgeted than came in') +
    '</div>' +
    (L.notToday ? '<div class="an2-cap">the month open on the Budget tab</div>' : '');
  const detail =
    row(
      'Income · ' + f.mon(L.monthNum),
      (L.estimated ? '~' : '') +
        Q(P(money(L.income), 'left'), 'income:' + ymKey(L.year, L.monthNum)),
    ) +
    row(
      '− Budgeted',
      Q(P(money(L.budgeted), 'left', true), 'budgeted:' + ymKey(L.year, L.monthNum)),
    ) +
    resRow('left', L.residual) +
    row(
      '= Left to Budget',
      Q(T(money(L.left), 'left'), 'left:' + ymKey(L.year, L.monthNum)),
      'an2-row-bold',
    ) +
    note('This is “Unallocated” on the Budget tab — the same number, read from the same place.') +
    (L.estimated ? note('~ some income lines are still estimates (EST on the Budget tab).') : '') +
    '<button type="button" class="an2-go" onclick="switchTab(\'budget\')">Open the Budget tab ›</button>';
  return card(
    ctx,
    'left',
    '💰 Left to Budget · ' + esc(L.monthName),
    face,
    detail,
    'How it adds up',
  );
}

// ── 🧭 After Feb 7, all four levels ───────────────────────────────────────
const monthsWord = (v: number): string => (v > 60 ? 'years' : v + ' months');
/** The months the keren hishtalmut adds, in whole months, "years" past 60 - same rule as the main text (Z6). */
export const khExtraWord = (extra: number): string => monthsWord(Math.round(extra));

function tileCash(ctx: StackCtx, f: Fmt, i: number): string {
  const st = ctx.feb7.status;
  if (st === 'error') return 'cash: couldn’t project Feb 7';
  if (st !== 'ready' && st !== 'passed') return 'cash: working it out…';
  const a = ctx.answers[i];
  if (a.lastsFromFeb7) return 'cash lasts ' + monthsWord(a.lastsFromFeb7.months);
  return a.path.firstUnder
    ? 'cash: covered · under ~' + f.k(ctx.pay.softLine) + ' in ' + f.mon(a.path.firstUnder.month)
    : 'cash: covered';
}

function levelDetail(ctx: StackCtx, f: Fmt, i: number): string {
  const lv = ctx.levels[i];
  const a = ctx.answers[i];
  const pp = ctx.planParts;
  const passed = ctx.feb7.status === 'passed';
  const label = (key: string): string => {
    const c = ctx.text.CATEGORIES.find((x) => x.key === key);
    return c ? c.emoji + ' ' + esc(c.label) : esc(key);
  };
  const lines = Object.entries(lv.lines)
    .filter(([key]) => ctx.text.CATEGORIES.some((c) => c.key === key))
    .sort((x, y) => y[1] - x[1])
    .map(([key, v]) =>
      row(
        label(key),
        lv.key === 'lean'
          ? Q(P(money(v), 'lv-lean'), 'floor:' + ctx.year + ':' + key + ':lean')
          : P(money(v), 'lv-' + lv.key),
      ),
    )
    .join('');
  const linesResidual =
    lv.key === 'lean'
      ? lv.residual === 0
        ? ''
        : row(ROUNDING_LABEL, P(P(signed(lv.residual), 'lean-floors'), 'lv-lean'), 'an2-row-sub')
      : '';
  const g = ctx.pay.gan2;
  const incomeRows =
    row(
      'Petachya (2027, travel in)',
      P(P(money(pp.petachya), 'plan-low-' + lv.key), 'plan-high-' + lv.key),
    ) +
    row(
      'Gan 2 (Fridays, 4 kids · paid ' + g.paidMonths + ' of 12 months, as a 12-month average)',
      P(P(money(pp.gan2), 'plan-low-' + lv.key), 'plan-high-' + lv.key),
    ) +
    row(
      '4 private clients (' + Math.round(ctx.pay.cancellations * 100) + '% cancellations)',
      P(money(pp.low), 'plan-low-' + lv.key),
    ) +
    row('or 5 private clients', P(money(pp.high), 'plan-high-' + lv.key)) +
    (ctx.se
      ? row(
          'US self-employment tax (rough)',
          '−' +
            P(money(pp.seLow), 'plan-low-' + lv.key, true) +
            ' / −' +
            P(money(pp.seHigh), 'plan-high-' + lv.key, true),
        )
      : '') +
    resRow('plan-low-' + lv.key, pp.residualLow) +
    row('Income · 4 clients', T(money(pp.incomeLow), 'plan-low-' + lv.key), 'an2-row-bold') +
    resRow('plan-high-' + lv.key, pp.residualHigh) +
    row('Income · 5 clients', T(money(pp.incomeHigh), 'plan-high-' + lv.key), 'an2-row-bold');
  const path = a.path;
  // Each month: in − out = net, and the cash before + net = the cash after (W1).
  const pathRows = path.rows
    .map((m, i) => {
      const last = i === path.rows.length - 1;
      const cash = P(T(money(m.cash), 'pc-' + lv.key + '-' + i), 'pc-' + lv.key + '-' + (i + 1));
      return row(
        f.ym(m.ym.year, m.ym.month) +
          sub(
            P(money(m.income), 'pm-' + lv.key + '-' + i) +
              ' in − ' +
              P(money(m.spend), 'pm-' + lv.key + '-' + i, true) +
              ' out' +
              (m.notes.length ? ' · ' + m.notes.map(esc).join(' · ') : ''),
          ),
        P(T(signed(m.net), 'pm-' + lv.key + '-' + i), 'pc-' + lv.key + '-' + i) +
          ' · ' +
          (last ? T(money(m.cash), 'pc-' + lv.key + '-' + i) : cash),
      );
    })
    .join('');
  const lastYm = path.rows.length ? path.rows[path.rows.length - 1].ym : null;
  const lasts = passed ? a.lastsFromNow : a.lastsFromFeb7;
  const from = passed ? 'today' : 'Feb 7';
  // While the months are loading (or failed) nothing "from Feb 7" is known: a dash,
  // never "covered", never left-now used as if it were Feb 7.
  const f7ok = ctx.feb7.status === 'ready' || passed;
  return (
    '<div class="an2-lvdetail" data-level="' +
    lv.key +
    '">' +
    head(esc(lv.name) + ' · ' + lvTot(lv.key, money(lv.total)) + ' a month') +
    note(esc(lv.note)) +
    head('Your plan’s income, a typical month') +
    incomeRows +
    head(esc(lv.name) + ' spending, a month') +
    lines +
    linesResidual +
    row(esc(lv.name), lvTot(lv.key, money(lv.total)), 'an2-row-bold') +
    head('The result') +
    row(
      '4 clients: ' +
        P(money(pp.incomeLow), 'res-low-' + lv.key) +
        ' − ' +
        P(lvTot(lv.key, money(lv.total)), 'res-low-' + lv.key, true),
      T(signed(a.resLow), 'res-low-' + lv.key),
    ) +
    row(
      '5 clients: ' +
        P(money(pp.incomeHigh), 'res-high-' + lv.key) +
        ' − ' +
        P(lvTot(lv.key, money(lv.total)), 'res-high-' + lv.key, true),
      T(signed(a.resHigh), 'res-high-' + lv.key),
    ) +
    head('Cash, month by month · 4 clients') +
    note(
      f7ok
        ? 'Starts at ' +
            P(
              T(money(path.start), ctx.feb7StartIsProjection ? 'feb7' : 'leftnow'),
              'pc-' + lv.key + '-0',
            ) +
            (passed ? ' today.' : ' on Feb 7' + (ctx.feb7StartIsProjection ? ' (projected).' : '.'))
        : 'Starts at — on Feb 7.',
    ) +
    (f7ok ? pathRows : '') +
    (!f7ok
      ? row('Lowest', '—', 'an2-row-bold') + row('End of Dec 2027', '—', 'an2-row-bold')
      : path.rows.length
        ? row(
            'Lowest: ' + f.ym(path.lowest.ym.year, path.lowest.ym.month),
            money(path.lowest.cash),
            'an2-row-bold',
          ) +
          row(
            'End of ' + (lastYm ? f.ym(lastYm.year, lastYm.month) : ''),
            money(path.end),
            'an2-row-bold',
          )
        : '') +
    (f7ok && path.firstUnder
      ? flag(
          'Dips under the soft line (around ' +
            f.k(ctx.pay.softLine) +
            ') in ' +
            f.ym(path.firstUnder.year, path.firstUnder.month) +
            ' — a flag to look at, not a failure.',
        )
      : '') +
    (!f7ok
      ? note('Cash lasts from Feb 7: —')
      : lasts
        ? note(
            'Short ' +
              money(-a.resLow) +
              ' a typical month: cash lasts ' +
              monthsWord(lasts.months) +
              ' from ' +
              from +
              ' (+ ' +
              khExtraWord(lasts.extraWithReserve) +
              ' if the keren hishtalmut is used — ' +
              money(ctx.pay.khHarel) +
              ', never counted as cash).',
          )
        : note('Covered on a typical month — nothing drawn down overall.')) +
    note(
      'Not counted: National Insurance on private income (about ₪480–680 a month at 4–5 clients — the rate isn’t confirmed yet) · Clalit’s pay that lands after Feb 7 · the US self-employment tax unless it’s switched on in Income.',
    ) +
    '</div>'
  );
}

function answerCard(ctx: StackCtx, f: Fmt): string {
  const st = ctx.feb7.status;
  const tiles = ctx.levels
    .map((lv, i) => {
      const a = ctx.answers[i];
      const key = 'an2:answer:' + lv.key;
      const open = ctx.open.has(key);
      const waiting = ctx.floorsLoading && lv.key === 'lean';
      return (
        '<button type="button" class="an2-lv" data-level="' +
        lv.key +
        '" data-an2-toggle aria-expanded="' +
        open +
        '" onclick="toggleAnRow(\'' +
        key +
        '\')"><span class="an2-lv-name">' +
        esc(lv.name) +
        '</span><span class="an2-lv-spend">' +
        (waiting ? '…' : lvTot(lv.key, money(lv.total))) +
        ' a month' +
        (lv.key === 'lean' && lv.fromYear ? ' (' + lv.fromYear + '’s)' : '') +
        '</span><span class="an2-lv-res ' +
        (a.resLow < 0 ? 'an2-amber' : 'an2-pos') +
        '">' +
        (waiting
          ? '…'
          : '<span class="an2-nw">' +
            T(signed(a.resLow), 'res-low-' + lv.key) +
            '</span> to <span class="an2-nw">' +
            T(signed(a.resHigh), 'res-high-' + lv.key) +
            '</span>') +
        '</span><span class="an2-lv-cash">' +
        (waiting ? '' : tileCash(ctx, f, i)) +
        '</span></button>'
      );
    })
    .join('');
  const basis =
    st === 'ready'
      ? T(money(ctx.feb7Start), 'feb7') + ' on Feb 7 (projected)'
      : st === 'passed'
        ? 'today (Total Liquid after cards)'
        : st === 'error'
          ? 'Feb 7, not worked out'
          : 'Feb 7, still loading';
  const face =
    '<div class="an2-cap">' +
    esc(planCaption()) +
    ', no school</div><div class="an2-levels-grid">' +
    tiles +
    '</div><div class="an2-cap">a typical month: your plan’s income − the level · cash counted from ' +
    basis +
    '</div>';
  const openDetails = ctx.levels
    .map((lv, i) => (ctx.open.has('an2:answer:' + lv.key) ? levelDetail(ctx, f, i) : ''))
    .join('');
  return card(
    ctx,
    'answer',
    '🧭 After Feb 7 · your plan at each level',
    face,
    openDetails ? '<div class="an2-detail">' + openDetails + '</div>' : '',
    null,
  );
}

// ── 💵 Cash, two numbers ──────────────────────────────────────────────────
function cashCard(ctx: StackCtx, f: Fmt): string {
  const c = ctx.cash;
  // With no what-if, Left now IS the Cash tab's Total Liquid: the same figure, the same key.
  const leftKeys = c.oneOff ? ['cash:leftnow'] : ['cash:leftnow', 'cash:liquid'];
  const st = ctx.feb7.status;
  const res = ctx.feb7.result;
  const shown = res ? res.end : st === 'passed' ? c.leftNow : null;
  const bigFeb7 = res
    ? '≈ ' + T(money(res.end), 'feb7')
    : st === 'passed'
      ? Q(T(money(c.leftNow), 'leftnow'), ...leftKeys)
      : st === 'error'
        ? '—'
        : '…';
  const first = res && res.rows.length ? res.rows[0].ym : null;
  const last = res && res.rows.length ? res.rows[res.rows.length - 1].ym : null;
  const feb7Cap = res
    ? 'projected · ' +
      (first && last
        ? f.ym(first.year, first.month) + ' – ' + f.ym(last.year, last.month)
        : 'the rest of January') +
      (res.estimate ? ' ' + chip : '')
    : st === 'passed'
      ? 'this is left now'
      : st === 'error'
        ? 'couldn’t load the months to project'
        : 'working it out…';
  const face =
    '<div class="an2-cash2"><div class="an2-cash-now"><div class="an2-cap">Left now</div><div class="an2-big' +
    (c.leftNow < 0 ? ' an2-amber' : '') +
    '" id="an2-cash-now">' +
    Q(T(money(c.leftNow), 'leftnow'), ...leftKeys) +
    '</div><div class="an2-cap">Total Liquid after cards' +
    (c.asOf ? ' · as of ' + esc(c.asOf) : '') +
    '</div></div><div class="an2-cash-feb7"><div class="an2-cap">' +
    (st === 'passed' ? 'Feb 7 has passed' : 'Left on Feb 7 if you quit') +
    '</div><div class="an2-big' +
    (shown !== null && shown < 0 ? ' an2-amber' : '') +
    '" id="an2-cash-feb7">' +
    bigFeb7 +
    '</div><div class="an2-cap">' +
    feb7Cap +
    '</div></div></div><div class="an2-cap">Keren hishtalmut ' +
    money(ctx.pay.khHarel) +
    ' — a second line, never added (tax-free after 6 years).</div>' +
    (c.days !== null && c.days > 30
      ? flag(
          'Balances are ' +
            c.days +
            ' days old — update them on the Cash tab and both numbers move.',
        )
      : '');

  const monthName = ctx.text.MONTHS[ctx.today.month - 1] || '';
  const leftNowBlock =
    head('Left now') +
    row('Holdings', Q(P(money(c.holdings), 'leftnow'), 'cash:holdings')) +
    row('+ owed to you', Q(P(money(c.owed), 'leftnow'), 'cash:owed')) +
    c.debts
      .map((d) =>
        row(
          '− ' + esc(d.name),
          Q(P(money(d.amount), 'leftnow', true), 'cash:debt:' + d.name),
          'an2-row-sub',
        ),
      )
      .join('') +
    (c.oneOff
      ? row('− what-if one-off', Q(P(money(c.oneOff), 'leftnow', true), 'cash:oneoff'))
      : '') +
    resRow('leftnow', c.residual) +
    row('= Left now', Q(T(money(c.leftNow), 'leftnow'), ...leftKeys), 'an2-row-bold') +
    note(
      c.asOf
        ? 'Balances as of ' + esc(c.asOf) + ' (' + (c.days ?? 0) + ' days ago).'
        : c.accounts === 0
          ? 'No balances set on the Cash tab yet.'
          : 'Balances have no date yet — update them on the Cash tab.',
    );

  let feb7Block = head('Left on Feb 7 if you quit · projected');
  if (res) {
    const catLabel = (key: string): string =>
      ctx.text.CATEGORIES.find((x) => x.key === key)?.label || key;
    feb7Block +=
      row('Left now', P(Q(T(money(res.start), 'leftnow'), ...leftKeys), 'feb7')) +
      row(
        '− rest of ' + esc(monthName) + ': everyday money budgeted, not spent yet',
        P(money(-res.restOfThisMonth), 'feb7'),
      ) +
      res.rows
        .map((m, mi) => {
          const bits: string[] = [];
          if (m.incomeFrom)
            bits.push(
              'income: ' + f.ym(m.incomeFrom.year, m.incomeFrom.month) + '’s (none in the app yet)',
            );
          // Z11: a bill is filled from the current bills, an everyday envelope from the pace now.
          const isBill = (k: string): boolean => {
            const c = ctx.text.CATEGORIES.find((x) => x.key === k);
            return !!c && !!c.hasLines && !c.hasTab && c.key !== 'charity';
          };
          if (m.usual.length)
            bits.push(
              'not budgeted yet, used your usual bills: ' +
                m.usual.map((k) => esc(catLabel(k))).join(', '),
            );
          const billFills = m.filled.filter(isBill);
          const paceFills = m.filled.filter((k) => !isBill(k));
          if (billFills.length)
            bits.push(
              'not budgeted yet, used this month’s bills: ' +
                billFills.map((k) => esc(catLabel(k))).join(', '),
            );
          if (paceFills.length)
            bits.push(
              'not budgeted yet, used your pace now: ' +
                paceFills.map((k) => esc(catLabel(k))).join(', '),
            );
          return row(
            f.ym(m.ym.year, m.ym.month) +
              ': ' +
              // A month with no income in the app yet borrows the last month's: that figure is a
              // stand-in, not that month's income, so it carries no income key.
              (m.incomeFrom
                ? P(money(m.income), 'fm-' + mi)
                : Q(P(money(m.income), 'fm-' + mi), 'income:' + ymKey(m.ym.year, m.ym.month))) +
              ' in − ' +
              P(money(m.spend), 'fm-' + mi, true) +
              ' out' +
              (bits.length ? sub(bits.join(' · ') + ' ' + chip) : ''),
            P(T(signed(m.net), 'fm-' + mi), 'feb7'),
          );
        })
        .join('') +
      row('− trips & one-offs not paid yet', P(T(money(-res.potsDue), 'pots-due'), 'feb7')) +
      res.potsLines
        .map((l) =>
          row(
            esc(l.label),
            Q(P(money(l.amount), 'pots-due', true), 'potdue:' + l.label),
            'an2-row-sub',
          ),
        )
        .join('') +
      row('= Left on Feb 7', T(money(res.end), 'feb7'), 'an2-row-bold') +
      note(
        'Feb 7 falls in the January pay month (Jan 10 – Feb 10), so January counts in full. Out = bills + everyday + charity + money moved to investing; what you put aside for trips, admin and savings stays in the bank until it’s spent. Not counted: gan 2 until its first payslip (your rule) · Clalit’s pay that lands after Feb 7' +
          endSentence(
            (ctx.text.POT_NOT_IN_APP[ctx.today.year] || []).map((t) => ' · ' + esc(t)).join(''),
          ),
      );
  } else if (st === 'passed') {
    feb7Block += note('Feb 7 has passed — left now is the number to read.');
  } else if (st === 'error') {
    feb7Block += note('The months to project couldn’t be loaded.');
  } else {
    feb7Block += note('Working it out…');
  }

  const passed = st === 'passed';
  const lastsTxt = (l: { months: number } | null): string => (l ? monthsWord(l.months) : 'covered');
  const f7ok = st === 'ready' || passed;
  const lasts =
    head('How long it lasts · your plan with 4 clients') +
    ctx.levels
      .map((lv, i) => {
        const a = ctx.answers[i];
        return row(
          esc(lv.name) +
            ' · ' +
            lvTot(lv.key, money(lv.total)) +
            sub(
              'from now: ' +
                lastsTxt(a.lastsFromNow) +
                (passed ? '' : ' · from Feb 7: ' + (f7ok ? lastsTxt(a.lastsFromFeb7) : '—')),
            ),
          '',
        );
      })
      .join('');

  const whatIf =
    '<label class="an2-h" for="an2-oneoff">What if a one-off comes out of cash first?</label>' +
    '<div class="an2-row"><span>₪<input id="an2-oneoff" class="an2-oneoff-in" type="number" min="0" step="100" inputmode="decimal" placeholder="e.g. 8000" value="' +
    (c.oneOff ? roundZ(c.oneOff) : '') +
    '"' +
    (c.oneOff ? ' data-qty="cash:oneoff"' : '') +
    ' onchange="setAnalyzeOneOff(this.value)" onkeydown="if(event.key===\'Enter\'){this.blur()}"></span>' +
    (c.oneOff
      ? '<button type="button" class="an2-go" onclick="setAnalyzeOneOff(\'\')">clear</button>'
      : '<span></span>') +
    '</div>' +
    note(
      c.oneOff
        ? 'Showing cash after ' +
            Q(money(c.oneOff), 'cash:oneoff') +
            ' goes out — both numbers move. Nothing is saved — it’s a what-if.'
        : 'Type an amount and both numbers move. Nothing is saved — it’s a what-if.',
    );

  const detail =
    leftNowBlock +
    feb7Block +
    lasts +
    whatIf +
    row('Keren hishtalmut (not cash)', money(ctx.pay.khHarel));
  return card(ctx, 'cash', '💵 Cash', face, detail, 'How both are figured');
}

// ── 💼 Income after Feb 7 ─────────────────────────────────────────────────
function incomeCard(ctx: StackCtx): string {
  const pp = ctx.planParts;
  const face =
    '<div class="an2-big">' +
    money(pp.incomeLow) +
    ' – ' +
    money(pp.incomeHigh) +
    unit(' a month') +
    '</div><div class="an2-cap">your plan: ' +
    esc(planCaption()) +
    ' · ' +
    ctx.scenarios.length +
    ' ways your week could look inside, never ranked</div>';

  const mixes = ctx.scenarios
    .map((sc) => {
      const hrs = sc.real_hours + (ctx.drive ? sc.drive_hours : 0);
      // sure + likely + maybe = what the mix nets a month (R6); each prints its own rounding and
      // a row closes the sum when they do not add.
      const mixResidual = roundZ(sc.net) - (roundZ(sc.sure) + roundZ(sc.likely) + roundZ(sc.maybe));
      const atLevels = ctx.levels
        .map((lv) => {
          const waiting = ctx.floorsLoading && lv.key === 'lean';
          const v = sc.incomeNet - lv.total;
          return (
            esc(lv.name) +
            ' ' +
            (waiting
              ? '…'
              : roundZ(v) >= 0
                ? signed(v)
                : '<span class="an2-amber">short ' + money(-v) + '</span>')
          );
        })
        .join(' · ');
      return (
        '<div class="an2-mix' +
        (sc.in_plan ? ' an2-mix-plan' : '') +
        '" data-mix="' +
        sc.key +
        '"><div><b>' +
        esc(sc.label) +
        '</b>' +
        sub(esc(sc.note)) +
        '</div><div class="an2-mix-net">' +
        T(money(sc.net), 'mix-' + sc.key) +
        unit(' a month') +
        '</div><div>⏱ ' +
        (ctx.drive
          ? '<b>' +
            Math.round(hrs) +
            ' h</b> a week · ' +
            sc.real_hours +
            ' working + ~' +
            sc.drive_hours +
            ' driving'
          : '<b>' + sc.real_hours + ' h</b> a week working') +
        ' (' +
        sc.paid_hours +
        ' paid)</div>' +
        (ctx.perHour[sc.key] || [])
          .map(
            (l) =>
              '<div><b>' +
              money(l.value) +
              '</b> an hour · ' +
              esc(l.job) +
              sub(esc(l.basis)) +
              '</div>',
          )
          .join('') +
        (sc.se
          ? '<div>🇺🇸 − <b>' +
            money(sc.se) +
            '</b> a month self-employment tax (15.3% × 92.35% of the private net after the accountant, rough, US)</div>'
          : '') +
        '<div>✓ sure ' +
        P(money(sc.sure), 'mix-' + sc.key) +
        (sc.likely ? ' · likely ' + P(money(sc.likely), 'mix-' + sc.key) : '') +
        (sc.maybe ? ' · maybe ' + P(money(sc.maybe), 'mix-' + sc.key) : '') +
        (mixResidual
          ? ' · ' + ROUNDING_LABEL + ' ' + P(signed(mixResidual), 'mix-' + sc.key)
          : '') +
        '</div><div>☀️ Summer: ' +
        esc(sc.summer_note) +
        '</div><div>At your levels: ' +
        atLevels +
        '</div></div>'
      );
    })
    .join('');

  const jobs = ctx.jobs
    .map((j) =>
      row(esc(j.label) + sub(esc(j.diff)), esc(j.clalit) + ' vs <b>' + esc(j.school) + '</b>'),
    )
    .join('');

  const yearIncome =
    '<details class="an2-sub"><summary>' +
    ctx.year +
    ' income · why each month was what it was</summary>' +
    ctx.incomeMonths
      .map(
        (m) =>
          row(
            esc(m.label) +
              (m.status === 'current' ? ' ◉' : '') +
              (m.status === 'future' ? '<span class="an2-chip">expected</span>' : ''),
            Q(T(money(m.total), 'inc-' + m.month_num), 'income:' + ymKey(ctx.year, m.month_num)),
            'an2-row-bold',
          ) +
          (m.rows.length
            ? m.rows
                .map(
                  (x) =>
                    row(esc(x.label), P(money(x.value), 'inc-' + m.month_num), 'an2-row-sub') +
                    x.why.map((t) => note(bidi(t))).join(''),
                )
                .join('') + resRow('inc-' + m.month_num, m.residual)
            : note('Nothing entered for this month yet.')),
      )
      .join('') +
    note(
      'Months not yet landed are expected, not real · ◉ this month · private here is net of the accountant, before tax',
    ) +
    (ctx.incomePatterns.length
      ? head('What the year shows') + ctx.incomePatterns.map((t) => note(bidi(t))).join('')
      : '') +
    '</details>';

  const detail =
    '<label class="an2-toggle"><input type="checkbox"' +
    (ctx.drive ? ' checked' : '') +
    ' onchange="setAnalyzeDrive(this.checked)"> include driving time</label>' +
    '<label class="an2-toggle"><input type="checkbox"' +
    (ctx.se ? ' checked' : '') +
    ' onchange="setAnalyzeSE(this.checked)"> US self-employment tax (rough, off unless you switch it on)</label>' +
    '<div class="an2-mixes">' +
    mixes +
    '</div>' +
    head('Petachya + Clalit (grants, no extra hours) vs Petachya + the school') +
    jobs +
    note(
      'Your bottom line, Oct 11. The school’s keren hishtalmut is your belief — confirm it before counting on it. Without it: net ' +
        money(ctx.schoolWithout.net) +
        ', net + funds ' +
        money(ctx.schoolWithout.netPlusFunds) +
        '. Per-hour rows: gross ÷ paid hours — the extra job alone, at the margin.',
    ) +
    yearIncome +
    note(
      'Hours are your words' +
        (ctx.drive ? '; driving is an estimate' : '') +
        '. Every ₪-an-hour is the job’s own gross per paid hour (a “real hour” line is hours in the room). The school isn’t signed; gan 2 is a yes since Oct 16 — its first payslip sets its real net. Nothing here writes to your budget.',
    );
  return card(
    ctx,
    'income',
    '💼 Income after Feb 7',
    face,
    detail,
    'Every way your week could look',
  );
}

// ── The year behind 📅 and 🧾 (the viewed year, or the prior year as its base) ──
interface YearView {
  r: AnalyzeResult;
  months: AnalyzeMonth[];
  /** Months the averages are taken over. */
  inAvg: AnalyzeMonth[];
  none: boolean;
  whole: boolean;
  avgSpan: string;
  pastNums: number[];
  aheadNums: number[];
  win: number;
  avgOf: (pick: (m: AnalyzeMonth) => number) => number;
}
function yearView(ctx: StackCtx, f: Fmt): YearView {
  const r = ctx.base.r;
  const months = r.months;
  // A prior-year base is always read over every complete month (loadAnalyzeBase).
  const win = ctx.base.prior ? 0 : ctx.avgWindow;
  const s = r.summary;
  const whole = win === WHOLE_YEAR && months.some((m) => m.status === 'past');
  const pastNums = months.filter((m) => m.status === 'past').map((m) => m.month_num);
  const aheadNums = months.filter((m) => m.status !== 'past').map((m) => m.month_num);
  const avgSet = new Set(s.avgMonths);
  const inAvg = months.filter((m) => avgSet.has(m.month_num));
  const avgOf = (pick: (m: AnalyzeMonth) => number): number =>
    inAvg.length ? inAvg.reduce((a, m) => a + pick(m), 0) / inAvg.length : 0;
  return {
    r,
    months,
    inAvg,
    none: s.avgMonths.length === 0,
    whole,
    avgSpan:
      f.span(s.avgMonths) +
      (whole && aheadNums.length ? ', ' + f.span(aheadNums) + ' budgeted' : ''),
    pastNums,
    aheadNums,
    win,
    avgOf,
  };
}

const pctStr = (v: number): string => Math.round((v || 0) * 100) + '%';

// ── 📅 A month now ────────────────────────────────────────────────────────
function monthCard(ctx: StackCtx, f: Fmt): string {
  const v = yearView(ctx, f);
  const rules = ctx.text.MONTH_NOW_RULES[ctx.base.year] || { fromMonth: {}, zero: [] };
  const mNow = v.none
    ? null
    : monthNow(v.r, {
        billsMonth: billsMonthFor(v.r.summary.referenceMonth),
        recentN: 6,
        fromMonth: rules.fromMonth,
        zero: rules.zero,
      });
  const title = '📅 A month now';
  if (!mNow)
    return card(
      ctx,
      'month',
      title,
      '<div class="an2-big">—</div><div class="an2-cap">Nothing complete yet to read a month from.</div>',
      '',
      null,
    );
  // Her 2027 plan keyed by its own year: the 2026 and 2027 views both read 2027's.
  const planYear = Math.max(2027, ctx.year);
  const plan = ctx.potPlan.filter((p) => p.year === planYear);
  const oneOffsMo = plan.reduce((a, p) => a + p.amount, 0) / 12;
  const oneOffsLeanMo = plan.reduce((a, p) => a + p.lean, 0) / 12;
  // W1: every part is shown in whole shekels, so each total is the sum of the printed
  // parts (lib/shown.ts monthNowShown).
  const env = v.r.cats.filter((c) => c.kind === 'envelope');
  const mn = monthNowShown({
    bills: mNow.bills,
    everydayByCat: env.map((c) => ({ key: c.key, value: mNow.byCat[c.key] || 0 })),
    charity: mNow.charity,
    oneOffsMo,
    oneOffsLeanMo,
  });
  const hasPlan = !!(oneOffsMo || oneOffsLeanMo);
  const cg = ctx.carmei;
  const tx = ctx.tax;
  const bmName = f.mon(mNow.billsMonth);

  const face =
    '<div class="an2-big">' +
    Q(
      hasPlan ? T(money(mn.headline), 'mn-month') : T(money(mn.headline), 'mn-base'),
      ctx.base.prior ? 'monthnow:' + ctx.base.year + ':base' : 'monthnow:' + ctx.year,
    ) +
    unit(' a month') +
    '</div><div class="an2-cap">' +
    // The parts sit on the face, so when each prints its own rounding and they do not add to the
    // month, the line says "≈" (the exact row is in the detail).
    (oneOffsMo
      ? (mn.headlineResidual ? '≈ ' : '') +
        Q(
          money(mn.base),
          ctx.base.prior ? 'monthbase:' + ctx.base.year + ':base' : 'monthbase:' + ctx.year,
        ) +
        ' bills, everyday and charity + ' +
        money(mn.lean) +
        ' trips & one-offs (your lean ' +
        planYear +
        ' plan)'
      : 'bills, everyday and charity') +
    '</div>' +
    (ctx.base.prior
      ? '<div class="an2-cap">Based on ' +
        ctx.base.year +
        ' — ' +
        ctx.year +
        ' has no complete month yet.</div>'
      : '') +
    '<div class="an2-est">🏘️ Carmei Gat ≈ ' +
    T(money(cg.before), 'cg-a') +
    ' a month (' +
    T(money(cg.withUpkeep), 'cg-b') +
    ' with upkeep)' +
    chip +
    ' · not in the total</div>' +
    '<div class="an2-est">🧾 Set aside for tax on private ≈ ' +
    money(tx.low) +
    ' a month' +
    chip +
    ' · not in the total</div>';

  const cat = (key: string): AnalyzeCatStat | undefined => v.r.cats.find((c) => c.key === key);
  const envRows = env
    .filter(
      (c) =>
        (mn.everydayRows.find((x) => x.key === c.key)?.value ?? 0) !== 0 ||
        rules.zero.includes(c.key),
    )
    .sort((a, b) => (mNow.byCat[b.key] || 0) - (mNow.byCat[a.key] || 0))
    .map((c) =>
      row(
        c.emoji +
          ' ' +
          esc(c.label) +
          (rules.fromMonth[c.key]
            ? sub(
                'from ' +
                  f.mon(rules.fromMonth[c.key]) +
                  ' on — Mounjaro stopped (your words, Oct 9)',
              )
            : rules.zero.includes(c.key)
              ? sub('0 unless you go back (your words, Oct 9)')
              : ''),
        P(money(mn.everydayRows.find((x) => x.key === c.key)?.value ?? 0), 'mn-everyday'),
        'an2-row-sub',
      ),
    )
    .join('');
  const billsKey = 'bills:' + ymKey(ctx.base.year, mNow.billsMonth);
  void cat;
  // What moved against the window average — biggest first.
  const moves = [
    { label: '🏠 Bills', was: v.avgOf((m) => m.fixed), now: mNow.bills },
    ...env.map((c) => ({
      label: c.emoji + ' ' + c.label,
      was: c.avg,
      now: mNow.byCat[c.key] || 0,
    })),
    { label: '💚 Charity', was: v.avgOf((m) => m.charity), now: mNow.charity },
  ]
    .filter((x) => Math.abs(x.now - x.was) >= 50)
    .sort((a, b) => Math.abs(b.now - b.was) - Math.abs(a.now - a.was))
    .slice(0, 6);

  const detail =
    row(
      '🏠 Bills · ' + f.mon(mNow.billsMonth) + ', as budgeted',
      Q(P(money(mn.bills), 'mn-base'), billsKey),
    ) +
    row(
      '🛒 Everyday · your ' + f.span(mNow.everydayMonths) + ' average',
      P(T(money(mn.everyday), 'mn-everyday'), 'mn-base'),
    ) +
    envRows +
    resRow('mn-everyday', mn.everydayResidual) +
    row('💚 Charity · ' + bmName, P(money(mn.charity), 'mn-base')) +
    resRow('mn-base', mn.baseResidual) +
    row(
      'Bills + everyday + charity',
      oneOffsMo ? P(T(money(mn.base), 'mn-base'), 'mn-month') : T(money(mn.base), 'mn-base'),
      oneOffsMo ? '' : 'an2-row-bold',
    ) +
    (oneOffsMo
      ? row(
          '✈️📋 Trips & one-offs · your lean ' + planYear + ' plan, ÷ 12',
          '+' + P(money(mn.lean), 'mn-month'),
        ) +
        resRow('mn-month', mn.headlineResidual) +
        row('A month now', T(money(mn.headline), 'mn-month'), 'an2-row-bold') +
        row('with your normal plan instead', money(mn.withNormal), 'an2-row-sub')
      : '') +
    head('Estimates, not in the total') +
    row(
      '🏘️ Carmei Gat, a month',
      T(money(cg.before), 'cg-a') + ' to ' + T(money(cg.withUpkeep), 'cg-b'),
      'an2-row-bold',
    ) +
    row('Rent in', P(money(cg.rent), 'cg-a'), 'an2-row-sub') +
    row('− mortgage', P(money(cg.mortgage), 'cg-a', true), 'an2-row-sub') +
    row('− building insurance', P(money(cg.insurance), 'cg-a', true), 'an2-row-sub') +
    row('− mortgage life', P(money(cg.mortgageLife), 'cg-a', true), 'an2-row-sub') +
    row('= a month', P(T(money(cg.before), 'cg-a'), 'cg-b'), 'an2-row-sub') +
    row('− upkeep allowance', P(money(cg.upkeepAllowance), 'cg-b', true), 'an2-row-sub') +
    row('= with upkeep', T(money(cg.withUpkeep), 'cg-b'), 'an2-row-sub') +
    note(
      'Rough, from the Oct 12 analysis. Vaad bayit and your arnona share aren’t in this number. It costs a little each month — the bet is the apartment going up.',
    ) +
    row('🧾 Set aside for tax on private, a month', money(tx.low), 'an2-row-bold') +
    row(
      'Tax is on ' +
        Math.round(tx.taxableShare * 100) +
        '% of about ' +
        money(tx.turnoverMonth) +
        ' a month turnover, rough',
      '',
      'an2-row-sub',
    ) +
    row('× your rate', Math.round(tx.marginalRate * 100) + '%', 'an2-row-sub') +
    row(
      'If gan 2 sits on top of the school (' + Math.round(tx.marginalRateHigh * 100) + '%)',
      money(tx.high),
      'an2-row-sub',
    ) +
    note(
      'An estimate to park in the bank, not a number in any total. Your accountant confirms the rate.',
    ) +
    (moves.length
      ? head('What moved vs your ' + v.avgSpan + ' average · a month') +
        moves
          .map((x, k) => {
            // Was and now each print their own rounding; the move is now − was as printed.
            const d = shownDiff(x.now, x.was);
            return row(
              esc(x.label) +
                sub(P(money(d.b), 'mn-move-' + k, true) + ' → ' + P(money(d.a), 'mn-move-' + k)),
              T(signed(d.a - d.b), 'mn-move-' + k),
            );
          })
          .join('')
      : '') +
    note(
      'Everyday = your ' +
        f.span(mNow.everydayMonths) +
        ' average — what you actually spent — except where your own words say otherwise. Bills and charity = ' +
        bmName +
        '’s, as budgeted. Trips and one-offs = your plan for ' +
        planYear +
        ', ÷ 12.',
    );
  return card(ctx, 'month', title, face, detail, 'What it’s made of');
}

// ── 🪜 My levels (Lean is editable; "where to cut" is the sort) ───────────
function levelsCard(ctx: StackCtx, f: Fmt): string {
  const r = ctx.r;
  // Z8: in a year with no complete month yet, what a line "averages" is read from
  // the BASE year (the same rule 📅 and 🧾 use), labelled with that year.
  const sr = ctx.base.prior ? (ctx.baseLean ?? ctx.base.r) : r;
  const s = sr.summary;
  const baseYr = ctx.base.prior ? ctx.base.year : null;
  const lean = ctx.levels.find((l) => l.key === 'lean');
  const loading = ctx.floorsLoading;
  const none = s.avgMonths.length === 0;
  // Z4: which lines read the prior year's floor, and which year.
  const fromYr = ctx.floorsFrom ?? ctx.floorsPartial?.year ?? null;
  const fromKeys = new Set(
    ctx.floorsFrom ? r.cats.map((c) => c.key) : (ctx.floorsPartial?.keys ?? []),
  );
  const title = '🪜 My levels';
  const byKey = (k: LevelKey): { total: number } =>
    ctx.levels.find((l) => l.key === k) || { total: 0 };
  if (!lean) return card(ctx, 'levels', title, '<div class="an2-cap">Loading…</div>', '', null);

  const unsetN = r.cats.filter((c) => !c.floorSet).length;
  const face =
    '<div class="an2-big">Lean ' +
    (loading ? '…' : lvTot('lean', money(lean.total))) +
    unit(' a month') +
    '</div><div class="an2-cap">Temp ' +
    lvTot('temp', money(byKey('temp').total)) +
    ' · Middle ' +
    lvTot('middle', money(byKey('middle').total)) +
    ' · Normal ' +
    lvTot('normal', money(byKey('normal').total)) +
    '</div>' +
    (ctx.floorsFrom
      ? '<div class="an2-cap">Lean is ' +
        ctx.floorsFrom +
        '’s until you set ' +
        ctx.year +
        '’s (shown, not saved)</div>'
      : ctx.floorsPartial
        ? '<div class="an2-cap">' +
          ctx.floorsPartial.keys.length +
          ' lines from ' +
          ctx.floorsPartial.year +
          '</div>'
        : '') +
    (!loading && unsetN
      ? '<div class="an2-cap">' + unsetN + ' lines not set — they use the suggestion</div>'
      : '');

  // How each line reads against the bill now / her own months (classic levelOf, D19 wording).
  const rules = ctx.text.MONTH_NOW_RULES[ctx.base.year] || { fromMonth: {}, zero: [] };
  const mNow = none
    ? null
    : monthNow(sr, {
        billsMonth: billsMonthFor(s.referenceMonth),
        recentN: 6,
        fromMonth: rules.fromMonth,
        zero: rules.zero,
      });
  const pastMs = sr.months.filter((m) => m.status === 'past');
  const entryCounts = pastMs.map((m) => m.entries).sort((a, b) => a - b);
  const medEntries = entryCounts[Math.floor(entryCounts.length / 2)] || 0;
  const thinSet = new Set(
    pastMs.filter((m) => medEntries > 0 && m.entries < 0.6 * medEntries).map((m) => m.month_num),
  );
  const billNow = (c: AnalyzeCatStat): number => {
    const bm = mNow ? sr.months.find((m) => m.month_num === mNow.billsMonth) : null;
    return bm ? bm.byCat[c.key] || 0 : c.now;
  };
  const lowNormal = (c: AnalyzeCatStat): number => {
    const vals = pastMs
      .filter((m) => !thinSet.has(m.month_num))
      .map((m) => (c.kind === 'envelope' ? m.actualByCat[c.key] || 0 : m.byCat[c.key] || 0))
      .sort((a, b) => a - b)
      .slice(0, 3);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  // The same figure on one line prints once: the average (and the bill now) carry a key, so the
  // cross-group test can assert every print of one quantity reads the same.
  const qYear = baseYr ?? ctx.year;
  const avgKey = (c: AnalyzeCatStat): string => 'floor:' + qYear + ':' + c.key + ':avg';
  const billKey = (c: AnalyzeCatStat): string =>
    'bills:' + ymKey(qYear, mNow ? mNow.billsMonth : billsMonthFor(s.referenceMonth)) + ':' + c.key;
  const levelTxt = (c: AnalyzeCatStat): string => {
    if (!c.floorSet)
      return c.kind === 'pot'
        ? 'not set — ₪0'
        : 'not set — uses the suggestion (' +
            (c.kind === 'fixed' ? Q(money(c.floorDefault), billKey(c)) : money(c.floorDefault)) +
            ')';
    if (c.kind === 'fixed') {
      const b = billNow(c);
      if (c.floor >= b) return 'covers the bill now (' + Q(money(b), billKey(c)) + ')';
      return b - c.floor <= Math.max(50, b * 0.02)
        ? 'about the bill now (' + Q(money(b), billKey(c)) + ')'
        : 'below the bill now (' + Q(money(b), billKey(c)) + ')';
    }
    if (c.avg > 0 && c.floor >= 0.85 * c.avg)
      return 'a normal month (avg ' + Q(money(c.avg), avgKey(c)) + ')';
    const pace = mNow ? mNow.byCat[c.key] : undefined;
    if (pace !== undefined && pace > 0 && c.floor >= 0.85 * pace && c.floor <= 1.2 * pace)
      return 'your pace now (' + money(pace) + ')';
    if (c.floor <= lowNormal(c) * 1.05)
      return 'your leanest months or less (' + money(lowNormal(c)) + ')';
    return 'lean (avg ' + Q(money(c.avg), avgKey(c)) + ', leanest ' + money(lowNormal(c)) + ')';
  };

  const monthAmount = (c: AnalyzeCatStat, mn: number): number => {
    const m = sr.months.find((x) => x.month_num === mn);
    return m ? m.actualByCat[c.key] || 0 : 0;
  };
  const vetoChip = (c: AnalyzeCatStat, mn: number, amt: number, out: boolean): string =>
    '<button type="button" class="an2-mchip' +
    (out ? ' out' : '') +
    '"' +
    (loading ? ' disabled' : '') +
    ' onclick="event.stopPropagation();toggleFloorMonth(\'' +
    c.key +
    "', " +
    mn +
    ')" title="' +
    (out ? 'Tap to count this month again' : 'Tap to leave this month out') +
    '" aria-label="' +
    esc(c.label) +
    ' ' +
    f.mon(mn) +
    (out ? ': left out, tap to count it again' : ': tap to leave it out') +
    '">' +
    f.mon(mn) +
    ' ' +
    money(amt) +
    '</button>';
  // The input is a part of Lean (lean-floors) AND the floor in "average − floor = room":
  // the display:contents wrapper carries the second group without becoming a grid cell.
  const floorInput = (c: AnalyzeCatStat): string =>
    (loading
      ? ''
      : '<span style="display:contents" data-sum-group="room-' +
        c.key +
        '" data-part data-sign="-">') +
    '<input data-sum-group="lean-floors" data-part data-qty="floor:' +
    ctx.year +
    ':' +
    c.key +
    ':lean" type="number" class="budget-inline an-floor an2-floor' +
    (c.floorSet && !loading ? ' set' : '') +
    '" value="' +
    (c.floorSet && !loading ? (lean.lines[c.key] ?? roundZ(c.floor)) : '') +
    '" placeholder="' +
    (loading
      ? '…'
      : c.floorSet
        ? roundZ(c.floorDefault)
        : (lean.lines[c.key] ?? roundZ(c.floorDefault))) +
    '" min="0" step="1" inputmode="decimal" aria-label="Lean for ' +
    esc(c.label) +
    '" data-floor-cat="' +
    c.key +
    '"' +
    (loading ? ' disabled' : '') +
    ' onclick="event.stopPropagation()" onchange="saveSpendFloor(\'' +
    c.key +
    '\', this.validity.badInput ? null : this.value)" onkeydown="if(event.key===\'Enter\'){this.blur()}">' +
    (loading ? '' : '</span>');
  // The line as it reads against the base year's own months (Z8/W5); the Lean floor stays the stack's.
  const viewOf = (c: AnalyzeCatStat): AnalyzeCatStat => {
    const bc = ctx.base.prior ? sr.cats.find((x) => x.key === c.key) : undefined;
    return bc
      ? {
          ...bc,
          floor: c.floor,
          floorSet: c.floorSet,
          aboveFloor: Math.round((bc.avg - c.floor) * 100) / 100,
        }
      : c;
  };
  const floorDetail = (c0: AnalyzeCatStat): string => {
    const c = viewOf(c0);
    const yr = baseYr ? baseYr + '’s ' : '';
    const lowHigh =
      '<div class="an2-note">' +
      (c.low
        ? (yr ? yr + 'low ' : 'Low ') + money(c.low.amount) + ' ' + f.mon(c.low.month_num)
        : 'No complete months yet') +
      (c.high ? ' · high ' + money(c.high.amount) + ' ' + f.mon(c.high.month_num) : '') +
      (c0.floorSet ? ' · ' + yr + 'suggestion ' + money(c.floorDefault) : '') +
      '</div>';
    if (c.kind !== 'envelope') return lowHigh;
    const seg =
      '<div class="an2-seg" role="group" aria-label="How many lowest months to average"><span class="an2-sublbl">Suggestion = average of ' +
      (baseYr ? baseYr + '’s ' : 'the ') +
      'lowest</span>' +
      [3, 4, 5, 6]
        .map(
          (n) =>
            '<button type="button" class="an2-segbtn' +
            (c.avgN === n ? ' active' : '') +
            '"' +
            (loading ? ' disabled' : '') +
            ' onclick="setFloorAvgN(\'' +
            c.key +
            "', " +
            n +
            ')">' +
            n +
            '</button>',
        )
        .join('') +
      '</div>';
    const used = c.floorMonths.map((x) => vetoChip(c, x.month_num, x.amount, false)).join('');
    const out = c.excluded
      .filter((mn) => sr.months.some((m) => m.month_num === mn))
      .map((mn) => vetoChip(c, mn, monthAmount(c, mn), true))
      .join('');
    return (
      lowHigh +
      seg +
      note(
        'The months it averages' +
          (baseYr ? ' (' + baseYr + ')' : '') +
          ' — tap one that wasn’t a normal month to leave it out:',
      ) +
      '<div class="an2-mlist">' +
      (used || out ? used + out : '<span class="an2-sublbl">no complete months yet</span>') +
      '</div>'
    );
  };
  const floorRow = (c: AnalyzeCatStat): string => {
    const v = viewOf(c);
    const key = 'an2:floor:' + c.key;
    const open = ctx.open.has(key);
    return (
      '<div class="an2-frow" data-cat="' +
      c.key +
      '"><button type="button" class="an2-flabel" data-an2-toggle aria-expanded="' +
      open +
      '" onclick="toggleAnRow(\'' +
      key +
      '\')">' +
      c.emoji +
      ' ' +
      esc(c.label) +
      (loading
        ? ''
        : (() => {
            // average − your Lean = room (W1). Room is the true difference rounded (the classic
            // page's number); your Lean is the figure in the box; the average printed is whatever
            // makes the three add up (never more than a shekel from its own rounding).
            const fl = lean.lines[c.key] ?? roundZ(c.floor);
            const avgShown = roundZ(v.avg);
            return sub(
              levelTxt(v) +
                ' · ' +
                (baseYr ? baseYr + '’s ' : '') +
                'average ' +
                Q(P(money(avgShown), 'room-' + c.key), avgKey(c)) +
                ' · room ' +
                T(signed(avgShown - fl), 'room-' + c.key) +
                (fromYr && fromKeys.has(c.key) ? ' · ' + fromYr + '’s Lean' : ''),
            );
          })()) +
      '</button>' +
      floorInput(c) +
      '</div>' +
      (open ? '<div class="an2-fdetail">' + floorDetail(c) + '</div>' : '')
    );
  };

  // Most room first (charity last, as the old "where to cut" sorted it).
  const sorted = [...r.cats].sort((a, b) =>
    a.kind === 'charity'
      ? 1
      : b.kind === 'charity'
        ? -1
        : viewOf(b).aboveFloor - viewOf(a).aboveFloor,
  );
  const detail =
    ctx.levels
      .map((lv) =>
        row(
          '<b>' + esc(lv.name) + '</b>' + sub(esc(lv.note)),
          lv.key === 'lean' && loading ? '…' : lvTot(lv.key, money(lv.total)),
          lv.key === 'lean' ? 'an2-row-bold' : '',
        ),
      )
      .join('') +
    head('Your Lean, line by line · most room first') +
    sorted.map(floorRow).join('') +
    (loading ? '' : resRow('lean-floors', lean.residual)) +
    row('Lean total', loading ? '…' : lvTot('lean', money(lean.total)), 'an2-row-bold') +
    note(
      'Type a number to set your Lean for a line; clear it to go back to the suggestion. Tap a line to see its months and leave out one that wasn’t a normal month. Saved with a history row, like before.',
    );
  return card(ctx, 'levels', title, face, detail, 'Edit Lean, line by line');
}

// ── ✈️📋 Trips & one-offs ────────────────────────────────────────────────
function potsCard(ctx: StackCtx, f: Fmt): string {
  const title = '✈️📋 Trips & one-offs';
  const pc = ctx.pots;
  if (!pc || pc.years[0] !== ctx.year)
    return card(
      ctx,
      'pots',
      title,
      '<div class="an2-big">…</div><div class="an2-cap">working it out…</div>',
      '',
      null,
    );
  const [y0, y1] = pc.years;
  const [t0, t1] = pc.travel;
  const [a0, a1] = pc.admin;
  const plan = ctx.potPlan.filter((p) => p.year === y1);
  const plan0 = ctx.potPlan.filter((p) => p.year === y0);
  const sum = (xs: { amount: number }[]): number => xs.reduce((a, x) => a + x.amount, 0);
  const big = (p: PotYear): number => p.rows.reduce((a, r) => a + potCounts(r), 0);
  const y0Total = big(t0) + big(a0);
  const y1App = big(t1) + big(a1);
  const y1Plan = sum(plan);
  const notIn = ctx.text.POT_NOT_IN_APP[y0] || [];
  const flags = notIn.length ? flag('Known, not in the app: ' + notIn.map(esc).join(' ')) : '';

  // 2027 from January: nothing booked in the app yet, so her plan IS the number.
  if (Math.round(y0Total) === 0 && plan0.length) {
    // W1: top down - the year's plan is the true sum rounded, the kinds and their lines add to it.
    const groups = [...new Set(plan0.map((p) => p.group))];
    const pl = potsShown(
      groups.map((g) => ({
        y0: plan0.filter((p) => p.group === g).map((p) => p.amount),
        app: [],
        plan: [],
      })),
    );
    const gS = pl.kinds.map((k) => ({ total: k.v0, parts: k.y0Rows, residual: k.y0Residual }));
    const all = { total: pl.y0Total, residual: pl.y0Residual };
    const face =
      '<div class="an2-big">' +
      T(money(all.total), 'pots-plan-all') +
      '</div><div class="an2-cap">' +
      y0 +
      ': nothing booked in the app yet — your plan</div>';
    const detail =
      head(y0 + ' · your plan, by kind') +
      groups
        .map((g, gi) => {
          const ps = plan0.filter((p) => p.group === g);
          return (
            row(
              '<b>' + esc(g) + '</b>',
              '<span class="an2-proj">' +
                P(T(money(gS[gi].total), 'pots-plan-' + gi), 'pots-plan-all') +
                '</span>',
            ) +
            ps
              .map((p, k) =>
                row(
                  esc(p.label) + sub('your plan · ' + esc(p.note)),
                  '<span class="an2-proj">' +
                    P(money(gS[gi].parts[k]), 'pots-plan-' + gi) +
                    '</span>',
                  'an2-row-sub',
                ),
              )
              .join('') +
            resRow('pots-plan-' + gi, gS[gi].residual)
          );
        })
        .join('') +
      resRow('pots-plan-all', all.residual) +
      row(y0 + ' · your plan', T(money(all.total), 'pots-plan-all'), 'an2-row-bold') +
      flags +
      note('Italic = your plan, not in the app yet.');
    return card(ctx, 'pots', title, face, detail, 'By kind, this year vs next');
  }

  const groupNames: string[] = [];
  const addG = (g: string): void => {
    if (!groupNames.includes(g)) groupNames.push(g);
  };
  addG('Trips');
  a0.byGroup.forEach((g) => addG(g.group));
  a1.byGroup.forEach((g) => addG(g.group));
  plan.filter((p) => p.pot === 'admin').forEach((p) => addG(p.group));
  const rowsOf = (p: PotYear, g: string): PotRow[] => p.rows.filter((r) => r.group === g);
  const potFor = (g: string, i: 0 | 1): PotYear => (g === 'Trips' ? pc.travel[i] : pc.admin[i]);
  // W1 (lib/shown.ts potsShown), top down: each year's total is the true sum rounded, the kinds
  // are apportioned to it, the items of a kind to the kind. A kind counts its plan or the app,
  // whichever is more.
  const kindRows = groupNames.map((g) => {
    const r0 = rowsOf(potFor(g, 0), g);
    const r1 = rowsOf(potFor(g, 1), g);
    const p1 = plan.filter((p) => p.group === g);
    return { g, r0, r1, p1 };
  });
  const ps = potsShown(
    kindRows.map((k) => ({
      y0: k.r0.map(potCounts),
      app: k.r1.map(potCounts),
      plan: k.p1.map((p) => p.amount),
    })),
  );
  const data = kindRows.map((k, i) => ({ ...k, ...ps.kinds[i] }));
  const t0S = ps.y0Total;
  const t1S = ps.y1Total;
  const face =
    '<div class="an2-big">' +
    Q(T(money(t0S), 'pots0-all'), 'pots:' + y0) +
    ' → ' +
    T(money(t1S), 'pots1-all') +
    '</div><div class="an2-cap">' +
    y0 +
    ' in the app (planned or paid, whichever is more) → ' +
    y1 +
    (y1Plan > y1App ? ': your plan' : ' in the app') +
    '</div>';

  const groups = data
    .map((d, gi) => {
      if (d.v0 === 0 && d.v1 === 0) return '';
      // An item with nothing paid is also "still to pay" on the Feb 7 chain: the same figure.
      const itemKeys = (r: PotRow, year: number): string[] =>
        year === ctx.today.year && Math.round(r.paid) === 0 && Math.round(r.planned) > 0
          ? ['pot:' + year + ':' + r.label, 'potdue:' + r.label]
          : ['pot:' + year + ':' + r.label];
      const itemRow = (r: PotRow, shown: number, group: string | null, year: number): string =>
        row(
          esc(r.label) + (r.estimate ? sub('estimate') : ''),
          Q(group ? P(money(shown), group) : money(shown), ...itemKeys(r, year)) +
            (Math.round(r.planned - r.paid) > 0 ? sub(money(r.paid) + ' paid') : ''),
          'an2-row-sub',
        );
      const g0 = 'pots0-' + gi;
      const g1 = 'pots1-' + gi;
      const v1html = P(T(money(d.v1), g1), 'pots1-all');
      return (
        row(
          '<b>' + esc(d.g) + '</b>',
          P(T(money(d.v0), g0), 'pots0-all') +
            ' → ' +
            (d.planWins ? '<span class="an2-proj">' + v1html + '</span>' : v1html),
        ) +
        '<div class="an2-note"><b>' +
        y0 +
        '</b></div>' +
        (d.r0.length
          ? d.r0.map((r, k) => itemRow(r, d.y0Rows[k], g0, y0)).join('') + resRow(g0, d.y0Residual)
          : '<div class="an2-note">nothing</div>') +
        '<div class="an2-note"><b>' +
        y1 +
        '</b></div>' +
        d.r1.map((r, k) => itemRow(r, d.appRows[k], d.planWins ? null : g1, y1)).join('') +
        d.p1
          .map((p, k) =>
            row(
              esc(p.label) + sub('your plan · ' + esc(p.note)),
              '<span class="an2-proj">' +
                (d.planWins ? P(money(d.planRows[k]), g1) : money(d.planRows[k])) +
                '</span>',
              'an2-row-sub',
            ),
          )
          .join('') +
        resRow(g1, d.v1Residual) +
        (!d.r1.length && !d.p1.length ? '<div class="an2-note">nothing yet</div>' : '')
      );
    })
    .join('');
  const detail =
    groups +
    resRow('pots0-all', ps.y0Residual, ' (' + y0 + ')') +
    resRow('pots1-all', ps.y1Residual, ' (' + y1 + ')') +
    row(
      y0 + ' → ' + y1,
      Q(T(money(t0S), 'pots0-all'), 'pots:' + y0) + ' → ' + T(money(t1S), 'pots1-all'),
      'an2-row-bold',
    ) +
    flags +
    note(
      'A trip or item counts its plan or what’s been paid, whichever is more. Italic = your plan, not in the app yet.',
    );
  void f;
  return card(ctx, 'pots', title, face, detail, 'By kind, this year vs next');
}

// ── 🏠 Bills now ─────────────────────────────────────────────────────────
function billsCard(ctx: StackCtx, f: Fmt): string {
  const title0 = '🏠 Bills now';
  if (!ctx.billsData)
    return card(
      ctx,
      'bills',
      title0,
      '<div class="an2-big">…</div><div class="an2-cap">working it out…</div>',
      '',
      null,
    );
  const r = ctx.r;
  const fixedKeys = ctx.text.CATEGORIES.filter((c) => c.hasLines && !c.hasTab).map((c) => c.key);
  const ref = billsMonthFor(r.summary.referenceMonth);
  const bl = billLines(ctx.billsData.items, ctx.billsData.months, fixedKeys, ref);
  const firstNum = r.months.length ? r.months[0].month_num : 1;
  const sumAt = (mn: number, cat?: string): number =>
    bl.filter((l) => !cat || l.category === cat).reduce((a, l) => a + (l.byMonth[mn - 1] || 0), 0);
  // W1: a bill category is the sum of its printed lines; the total is the sum of the categories.
  const liveOf = (k: string): BillLine[] =>
    bl.filter((l) => l.category === k && l.status !== 'ended');
  const catLabel = (k: string): string => ctx.text.CATEGORIES.find((c) => c.key === k)?.label || k;

  // A category with ₪0 at the reference month while the year has not started reads the
  // base year's reference month for that category, and says so (2027 is not blank).
  const baseRef = billsMonthFor(ctx.base.r.summary.referenceMonth);
  const fb: Record<string, number> = {};
  if (ctx.base.prior)
    for (const k of fixedKeys) {
      if (Math.round(sumAt(ref, k)) !== 0) continue;
      const v = ctx.base.r.months.find((m) => m.month_num === baseRef)?.byCat[k] || 0;
      if (Math.round(v) !== 0) fb[k] = v;
    }
  // Top down (lib/shown.ts billsShown): the total is the true bills rounded - the classic
  // page's number - then the categories, then each category's lines.
  const bs = billsShown(
    fixedKeys.map((k) => ({
      key: k,
      raw: fb[k] !== undefined ? fb[k] : liveOf(k).reduce((a, l) => a + l.now, 0),
      lines: fb[k] !== undefined ? [] : liveOf(k).map((l) => l.now),
    })),
  );
  const lineNow = new Map<string, number>();
  fixedKeys.forEach((k, ci) =>
    liveOf(k).forEach((l, li) => lineNow.set(l.key, bs.cats[ci].lines[li])),
  );
  const at = (k: string): number => bs.cats[fixedKeys.indexOf(k)].total;
  const total = bs.total;
  const fbKeys = Object.keys(fb);
  // Keys: the same bill prints the same everywhere (the Year tab, the Lean card, the month card).
  const ymOwn = ymKey(ctx.year, ref);
  const catKey = (k: string): string =>
    'bills:' + (fb[k] !== undefined ? ymKey(ctx.base.year, baseRef) : ymOwn) + ':' + k;
  // What moved since the first month: each line's move as printed, the biggest 8 listed,
  // the rest in one row, the total = all of them added.
  const mv = billMovesShown(
    bl.map((l) => ({ id: l.key, start: l.byMonth[firstNum - 1] || 0, now: l.now })),
    8,
  );

  const face =
    '<div class="an2-big">' +
    (fbKeys.length
      ? T(money(total), 'bills-total')
      : Q(T(money(total), 'bills-total'), 'bills:' + ymOwn)) +
    unit(' a month') +
    '</div><div class="an2-cap">' +
    // The parts sit on the face: each prints its own rounding, and a leading "≈" says when they
    // do not add to the total (the exact row is in the detail).
    (bs.residual ? '≈ ' : '') +
    fixedKeys
      .map((k) => esc(catLabel(k).toLowerCase()) + ' ' + Q(money(at(k)), catKey(k)))
      .join(' · ') +
    (!fbKeys.length && firstNum !== ref && mv.total !== 0
      ? ' · ' + T(signed(mv.total), 'bills-moves') + ' since ' + f.mon(firstNum)
      : '') +
    '</div>' +
    (fbKeys.length
      ? '<div class="an2-cap">' +
        fbKeys.map((k) => esc(catLabel(k))).join(', ') +
        ' from ' +
        f.ym(ctx.base.year, baseRef) +
        ' — not budgeted in ' +
        f.ym(ctx.year, ref) +
        ' yet</div>'
      : '');

  // What moved since the first month, biggest first (W1: every move whole, the listed ones
  // + "smaller changes" = the total).
  const byKey = new Map(bl.map((l) => [l.key, l]));
  const movesBlock = mv.rows.length
    ? head('What moved since ' + f.mon(firstNum) + ' · a month') +
      mv.rows
        .map((x, mi) => {
          const l = byKey.get(x.id)!;
          const plain = l.status !== 'ended' && !(x.start === 0 && l.firstMonth !== null);
          const what =
            l.status === 'ended'
              ? 'ended after ' +
                f.mon(l.lastMonth || 1) +
                ' (was ' +
                money(l.byMonth[(l.lastMonth || 1) - 1]) +
                ')'
              : x.start === 0 && l.firstMonth !== null
                ? 'started ' + f.mon(l.firstMonth) + ' at ' + money(l.first)
                : P(money(x.start), 'bm-' + mi, true) + ' → ' + P(money(x.now), 'bm-' + mi);
          return row(
            esc(l.label) + sub(what),
            plain
              ? P(T(signed(x.delta), 'bm-' + mi), 'bills-moves')
              : P(signed(x.delta), 'bills-moves'),
          );
        })
        .join('') +
      (mv.othersCount
        ? row(
            mv.othersCount + ' smaller change' + (mv.othersCount === 1 ? '' : 's'),
            P(signed(mv.others), 'bills-moves'),
          )
        : '') +
      resRow('bills-moves', mv.residual) +
      row(
        'Bills ' + f.mon(firstNum) + ' → ' + f.mon(ref),
        T(signed(mv.total), 'bills-moves'),
        'an2-row-bold',
      )
    : '';
  // Z9: a "per year" figure is only a year when the year has its 12 months of bills. A year
  // that has only January says so ("Jan only so far") instead of calling January's amount a year.
  const monthsSeen = billMonthsSeen(bl);
  const partialYear = monthsSeen.length < 12;
  const yearTxt = (l: BillLine): string =>
    !partialYear
      ? money(l.annual) + '/yr'
      : monthsSeen.length === 1
        ? f.mon(monthsSeen[0]) + ' only so far'
        : money(l.annual) + ' so far (' + monthsSeen.length + ' months)';
  const statusTxt: Record<BillLine['status'], string> = {
    ended: 'ended',
    new: 'new this year',
    changed: 'changed',
    steady: 'steady',
  };
  const lineRow = (l: BillLine): string =>
    row(
      esc(l.label) +
        ' · ' +
        statusTxt[l.status] +
        (l.names.length > 1
          ? sub(
              'Also called: ' +
                l.names
                  .filter((x) => x !== l.label)
                  .map(esc)
                  .join(' · '),
            )
          : '') +
        (l.changes.length
          ? sub(
              l.changes
                .slice(0, 6)
                .map((c) => 'from ' + f.mon(c.month) + ': ' + money(c.from) + ' → ' + money(c.to))
                .join(' · '),
            )
          : ''),
      (l.status === 'ended'
        ? ''
        : P(money(lineNow.get(l.key) ?? 0), 'bills-cat-' + l.category) + ' · ') + yearTxt(l),
      l.status === 'ended' ? 'an2-row-sub' : '',
    );
  const groups = fixedKeys
    .map((k) => {
      const live = bl.filter((l) => l.category === k && l.status !== 'ended');
      return (
        head(
          esc(catLabel(k)) +
            ' · now ' +
            Q(P(T(money(at(k)), 'bills-cat-' + k), 'bills-total'), catKey(k)) +
            ' a month',
        ) +
        (fb[k] !== undefined
          ? row(
              esc(catLabel(k)) +
                sub('from ' + f.ym(ctx.base.year, baseRef) + ' — not budgeted yet'),
              P(money(fb[k]), 'bills-cat-' + k),
            )
          : live.map(lineRow).join('') +
            resRow('bills-cat-' + k, bs.cats[fixedKeys.indexOf(k)].residual))
      );
    })
    .join('');
  const groupsAll = groups + resRow('bills-total', bs.residual);
  const ended = bl.filter((l) => l.status === 'ended');
  const endedBlock = ended.length ? head('Ended this year') + ended.map(lineRow).join('') : '';
  const detail =
    row(
      'Bills now · ' + f.mon(ref),
      fbKeys.length
        ? T(money(total), 'bills-total')
        : Q(T(money(total), 'bills-total'), 'bills:' + ymOwn),
      'an2-row-bold',
    ) +
    movesBlock +
    groupsAll +
    endedBlock +
    note(
      'Read from your budget lines, month by month. Lines that share a first word are one bill (Claude Pro → Claude Max). “Now” is ' +
        f.mon(ref) +
        '; a line has ended when it had money before ' +
        f.mon(ref) +
        ' and none from then on. Months still ahead show as budgeted.',
    );
  return card(
    ctx,
    'bills',
    title0 + ' · ' + esc(ctx.text.MONTHS[ref - 1] || ''),
    face,
    detail,
    'Every bill, line by line',
  );
}

// ── 🧾 This year so far ───────────────────────────────────────────────────
function yearCard(ctx: StackCtx, f: Fmt): string {
  const v = yearView(ctx, f);
  const r = v.r;
  const s = r.summary;
  const title = '🧾 This year so far · ' + ctx.base.year;
  if (v.none)
    return card(
      ctx,
      'year',
      title,
      '<div class="an2-big">—</div><div class="an2-cap">Nothing in ' +
        ctx.base.year +
        ' is complete yet, so there is no real spend to read here.</div>',
      '',
      null,
    );
  const savingsAvg = v.avgOf((m) => m.savings);
  const incomeSum = v.inAvg.reduce((a, m) => a + m.income, 0);
  const savingsRate = incomeSum ? v.inAvg.reduce((a, m) => a + m.savings, 0) / incomeSum : 0;
  const incomeAvg = v.avgOf((m) => m.income);
  const parts: { label: string; pick: (m: AnalyzeMonth) => number }[] = [
    { label: '🏠 Bills (housing + recurring)', pick: (m) => m.fixed },
    { label: '🛒 Everyday (envelopes)', pick: (m) => m.envelope },
    { label: '✈️📋 Set aside for trips + admin', pick: (m) => m.pots },
    { label: '💚 Charity', pick: (m) => m.charity },
  ];
  // W1/W4 (lib/shown.ts yearWayShown): the four parts whole first, real spend = their sum;
  // your way = income − savings; the gap = your way − real spend, split into income not yet
  // budgeted + money budgeted for an everyday envelope and not spent, where "spent" is the
  // real-spend figure (a month still ahead counts its budget, so it adds nothing to the gap).
  const yw = yearWayShown({
    partsAvg: parts.map((p) => v.avgOf(p.pick)),
    incomeAvg,
    savingsAvg,
    unspentAvg: v.avgOf((m) => m.envelopeBudget - m.envelope),
  });
  const gapOver = yw.kind === 'over-spent';
  // Keys: the same figure prints the same on the classic page (real spend, saved, your way, the gap).
  const qk = (what: string): string => what + ':' + ctx.base.year + ':' + v.win;
  // The face lists parts, so a leading "≈" says when they do not add exactly; the exact rows
  // (with the "agorot, rounded" line) are in the detail.
  const gapSplit =
    yw.kind === 'none'
      ? ''
      : yw.kind === 'over-spent'
        ? ' · ' +
          (yw.gapResidual ? '≈ ' : '') +
          Q(money(-yw.gap), qk('gap')) +
          ' less than real spend (you spent more than you budgeted)'
        : ' · ' +
          (yw.gapResidual ? '≈ ' : '') +
          Q(money(yw.gap), qk('gap')) +
          ' more than real spend' +
          (yw.kind === 'split'
            ? ': ' +
              (yw.splitResidual ? '≈ ' : '') +
              money(yw.notBudgeted) +
              ' income not yet budgeted + ' +
              money(yw.unspent) +
              ' budgeted, not spent'
            : '');
  const face =
    '<div class="an2-big">' +
    Q(T(money(yw.realSpend), 'yr-real'), qk('real')) +
    unit(' a month real spend') +
    '</div><div class="an2-cap">saved ' +
    Q(money(yw.savings), qk('saved')) +
    ' a month, ' +
    pctStr(savingsRate) +
    ' of what came in · ' +
    v.avgSpan +
    '</div><div class="an2-cap">your way (income − savings): ' +
    Q(T(money(yw.herWay), 'yr-way'), qk('herway')) +
    (yw.gap === 0 ? ' ✓' : '') +
    gapSplit +
    '</div>' +
    (ctx.base.prior
      ? '<div class="an2-cap">' +
        ctx.year +
        ' has no complete month yet — this is ' +
        ctx.base.year +
        ' (' +
        v.avgSpan +
        ').</div>'
      : '');

  // The averaging window pills live here only (a prior-year base is always every complete month).
  const winSpan = (n: number): string =>
    f.span(n > 0 && v.pastNums.length > n ? v.pastNums.slice(v.pastNums.length - n) : v.pastNums);
  const pills: string[] = [];
  if (!ctx.base.prior) {
    const seen = new Set<string>();
    for (const n of [0, 3, 6]) {
      const label = winSpan(n);
      if (seen.has(label)) continue;
      seen.add(label);
      pills.push(
        '<button type="button" class="an2-pill' +
          (v.win === n ? ' active' : '') +
          '" onclick="setAnalyzeAvgWindow(' +
          n +
          ')" title="Average over ' +
          label +
          '">' +
          label +
          '</button>',
      );
    }
    if (v.aheadNums.length && v.pastNums.length)
      pills.push(
        '<button type="button" class="an2-pill' +
          (v.whole ? ' active' : '') +
          '" onclick="setAnalyzeAvgWindow(' +
          WHOLE_YEAR +
          ')" title="All 12 months — ' +
          f.span(v.aheadNums) +
          ' as budgeted">Whole year</button>',
      );
  }

  const gap = yearTabGap(r);
  let gapRows = '';
  if (gap && Math.abs(gap.yearTabAvg - gap.windowAvg) >= 1) {
    const gc = gapChainShown(gap);
    // Marked as a sum only when the bridge closes; when it does not, "not explained" says so.
    const closes = gc.unexplained === 0;
    const g = (html: string, total = false): string =>
      closes ? (total ? T(html, 'yr-ytab') : P(html, 'yr-ytab')) : html;
    const open = gap.openMonths.length ? f.span(gap.openMonths) : '';
    gapRows =
      head(
        'The Year tab says ' +
          Q(g(money(gc.yearTab), true), qk('yeartab')) +
          ' — same money, different months',
      ) +
      row('This tab · ' + v.avgSpan + ' ÷ ' + s.avgMonths.length, g(money(gc.windowAvg))) +
      (gc.windowEffect !== 0
        ? row(
            'Switching to every complete month (' + f.span(v.pastNums) + ')',
            g(signed(gc.windowEffect)),
            'an2-row-sub',
          )
        : '') +
      (open
        ? row(
            open + ' everyday spending — only what’s logged so far',
            g(signed(gc.envEffect)),
            'an2-row-sub',
          ) +
          row(
            open + ' bills, pots and charity — counted in full',
            g(signed(gc.otherEffect)),
            'an2-row-sub',
          )
        : '') +
      (closes ? resRow('yr-ytab', gc.residual) : '') +
      row(
        'Year tab · all 12 months ÷ 12',
        g(money(gc.yearTab), true) +
          (gc.unexplained === 0
            ? ' adds up ✓'
            : ' · ' + money(Math.abs(gc.unexplained)) + ' not explained'),
        'an2-row-bold',
      );
  }
  const phoneMonths = v.months
    .map((m) =>
      row(
        f.mon(m.month_num) + (m.status === 'current' ? ' ◉' : ''),
        '<span class="' +
          (m.status === 'past' ? '' : 'an2-proj') +
          '">' +
          money(m.real) +
          ' · ' +
          money(m.savings) +
          '</span>',
      ),
    )
    .join('');

  // What moved since the first months (the old "Why so high"), flat rows.
  const why = whyBridge(
    r,
    ctx.text.WHY_ROWS.map((w) => w.key),
    v.whole,
  );
  let whyBlock = '';
  if (why) {
    const meta = (k: string): { label: string; tag: string } =>
      ctx.text.WHY_ROWS.find((w) => w.key === k) || { label: k, tag: 'ongoing' };
    const bs = bridgeShown(
      why.rows.map((x) => ({ key: x.key, early: x.early, recent: x.recent })),
      why.earlyReal,
      why.recentReal,
    );
    const rows = bs.rows.filter((x) => x.early !== 0 || x.recent !== 0);
    const more = bs.delta >= 0;
    // The sentence's three figures add exactly only when the two averages differ by the move.
    const noteExact = bs.recentReal - bs.earlyReal === bs.delta;
    whyBlock =
      '<details class="an2-sub"><summary>What moved since ' +
      f.span(why.early) +
      '</summary>' +
      note(
        f.span(why.recent) +
          ' cost ' +
          (noteExact ? P(money(bs.recentReal), 'yr-why-note', !more) : money(bs.recentReal)) +
          ' a month; ' +
          f.span(why.early) +
          ' cost ' +
          (noteExact ? P(money(bs.earlyReal), 'yr-why-note', more) : money(bs.earlyReal)) +
          ' — ' +
          (noteExact ? '' : '≈ ') +
          Q(
            noteExact ? T(money(Math.abs(bs.delta)), 'yr-why-note') : money(Math.abs(bs.delta)),
            'whymove:' + ctx.base.year + ':' + v.win,
          ) +
          (more ? ' more' : ' less') +
          '.',
      ) +
      row(f.span(why.early) + ' average', P(money(bs.earlyReal), 'yr-why'), 'an2-row-bold') +
      rows
        .map((x) => {
          const m = meta(x.key);
          return row(
            esc(m.label) + sub('· ' + esc(ctx.text.TAG_LABEL[m.tag] || m.tag)),
            P(signed(x.delta), 'yr-why'),
          );
        })
        .join('') +
      resRow('yr-why', bs.residual) +
      row(
        f.span(why.recent) + ' average',
        T(money(bs.recentReal), 'yr-why') + (bs.residual === 0 ? ' adds up ✓' : ''),
        'an2-row-bold',
      ) +
      (why.thin.length
        ? flag(
            why.thin.map((m) => f.mon(m)).join(', ') +
              ' had fewer entries than your usual month — away, or not everything logged. Their everyday numbers read low.',
          )
        : '') +
      '</details>';
  }

  const detail =
    (pills.length > 1 ? '<div class="an2-pills">' + pills.join('') + '</div>' : '') +
    head('Where it went · a month, ' + v.avgSpan) +
    parts.map((p, k) => row(p.label, P(money(yw.parts[k]), 'yr-real'))).join('') +
    resRow('yr-real', yw.realResidual) +
    row('Real spend', Q(T(money(yw.realSpend), 'yr-real'), qk('real')), 'an2-row-bold') +
    row('🏦 Savings — the score', Q(money(yw.savings), qk('saved')), 'an2-row-bold') +
    row(
      'Your way: ' +
        Q(P(money(yw.income), 'yr-way'), qk('incomeavg')) +
        ' came in − ' +
        P(money(yw.savings), 'yr-way', true) +
        ' saved',
      Q(T(money(yw.herWay), 'yr-way'), qk('herway')),
    ) +
    resRow('yr-way', yw.wayResidual) +
    (yw.kind === 'none'
      ? ''
      : // The gap: your way − real spend (the other way round when you spent more), then the same
        // gap split in two. Each closes with its own "agorot, rounded" row when needed.
        row('Your way', P(money(yw.herWay), 'yr-gap', gapOver)) +
        row('− Real spend', P(money(yw.realSpend), 'yr-gap', !gapOver)) +
        resRow('yr-gap', gapOver ? -yw.gapResidual : yw.gapResidual) +
        row(
          gapOver
            ? '= Less than real spend (you spent more than you budgeted)'
            : '= More than real spend',
          Q(
            yw.kind === 'split'
              ? T(T(money(Math.abs(yw.gap)), 'yr-gap'), 'yr-split')
              : T(money(Math.abs(yw.gap)), 'yr-gap'),
            qk('gap'),
          ),
          'an2-row-bold',
        ) +
        (yw.kind === 'split'
          ? row('Income not yet budgeted', P(money(yw.notBudgeted), 'yr-split')) +
            row('Budgeted for an everyday envelope, not spent', P(money(yw.unspent), 'yr-split')) +
            resRow('yr-split', yw.splitResidual) +
            row('= More than real spend', T(money(yw.gap), 'yr-split'), 'an2-row-sub')
          : '')) +
    gapRows +
    head('Month by month · real spend · savings') +
    phoneMonths +
    note('italic = from the budget, not yet happened · ◉ this month') +
    whyBlock +
    note(
      'Real spend = bills + everyday + what was set aside for trips and admin + charity. Savings is the score, not spend. Averages use complete months only.',
    );
  return card(ctx, 'year', title, face, detail, 'Where it went');
}

export function renderAnalyzeStack(ctx: StackCtx): string {
  curYear = ctx.year;
  const f = fmtOf(ctx);
  return (
    '<div class="an2-wrap" data-analyze="stack" data-year="' +
    ctx.year +
    '">' +
    leftCard(ctx, f) +
    answerCard(ctx, f) +
    cashCard(ctx, f) +
    incomeCard(ctx) +
    monthCard(ctx, f) +
    levelsCard(ctx, f) +
    potsCard(ctx, f) +
    billsCard(ctx, f) +
    yearCard(ctx, f) +
    '</div>'
  );
}
