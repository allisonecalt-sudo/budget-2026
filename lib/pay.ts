// What this is: the pure pay arithmetic behind the Analyze tab — per-hour
//   figures on ONE basis, the US self-employment tax toggle, the tax set-aside
//   on private income, the honest Carmei Gat net, and "cash lasts".
// Why it exists: v69 showed "₪ per hour" as net ÷ the whole week's real hours,
//   so Clalit read ₪100 and the school ₪139 — different baskets, and not at the
//   margin (her rule: compare jobs at the margin, on the same basis). These
//   helpers take plain numbers, so the app's one PAY object (top of app.ts) is
//   the only place a salary lives, and every figure here can be unit-tested.
// What's decided (money expert, Oct 12; her Oct 15 go):
//   - Compare jobs on GROSS per PAID hour; say so beside every number. A "per
//     real hour" figure is a second, labelled line (the school pays for 20 h
//     but she is in the room 14).
//   - US self-employment tax (rough): 15.3% of 92.35% of net private income.
//     Default OFF; shown as its own line, labelled "rough, US".
//   - Tax set-aside on private income: 70% of turnover (the עוסק זעיר track) ×
//     her marginal rate (31%, or 35% when a third salary pushes her over).
// What's built: perHour, schoolGrossMonth, seTax, taxSetAside, carmeiGatNet, month-aware gan2NetForMonth / privateNetForMonth / petachyaNetForMonth (v73),
//   cashLasts.
// What's next: Petachya is year-aware (petachyaNetMonth: 2026 keeps its figure,
//   2027+ reads net2027); a payslip changes one edit in PAY, nothing here changes.
// Links: tests/pay.test.mjs · app.ts (PAY) · second-brain self/petachya-pay.md,
//   projects/clalit/pay-system-decoded-2026-07-15.md, self/tax.md, self/carmei-gat.md.

const n = (v: unknown): number => Number(v) || 0;
const r2 = (v: number): number => Math.round(v * 100) / 100;

/** amount ÷ hours, 0 when there are no hours (never Infinity on screen). */
export function perHour(amount: number, hours: number): number {
  const h = n(hours);
  return h > 0 ? r2(n(amount) / h) : 0;
}

/** What the school pays a month: rate × weeks in a month × paid hours a week. */
export function schoolGrossMonth(
  ratePerHour: number,
  weeksPerMonth: number,
  paidHrsWeek: number,
): number {
  return r2(n(ratePerHour) * n(weeksPerMonth) * n(paidHrsWeek));
}

/** Gan 2: what one session pays per hour of the session itself. */
export function sessionHourly(perSession: number, minutes: number): number {
  return perHour(perSession, n(minutes) / 60);
}

/**
 * Gan 2 gross a month: sessions a day × ₪ a session × gan days a week × weeks
 * in a month, paid `paidMonths` of 12 (Sep–Jun; ₪0 in July–August — shown as a 12-month average). Rough.
 */
export function gan2GrossMonth(
  g: {
    perSession: number;
    sessionsPerDay: number;
    daysPerWeek: number;
    paidMonths: number;
  },
  weeksPerMonth: number,
): number {
  return Math.round(
    (n(g.perSession) *
      n(g.sessionsPerDay) *
      n(g.daysPerWeek) *
      n(weeksPerMonth) *
      n(g.paidMonths)) /
      12,
  );
}

/** Gan 2 net a month: gross × one rough factor (payslip job, before the refund). */
export function gan2NetMonth(gross: number, netFactor: number): number {
  return Math.round(n(gross) * n(netFactor));
}

/**
 * Rough US self-employment tax a month: rate (15.3%) on 92.35% of net private
 * income. A rough, US-side figure — never mixed into the Israeli numbers.
 */
export function seTax(netPrivateMonth: number, rate = 0.153, base = 0.9235): number {
  return r2(Math.max(0, n(netPrivateMonth)) * base * rate);
}

/**
 * Tax to set aside a month on private income: taxable share (70% of turnover
 * on the small-business track) × her marginal rate.
 */
export function taxSetAside(
  turnoverMonth: number,
  marginalRate: number,
  taxableShare = 0.7,
): number {
  return r2(Math.max(0, n(turnoverMonth)) * taxableShare * n(marginalRate));
}

export interface CarmeiGatParts {
  rent: number;
  mortgage: number;
  insurance: number;
  mortgageLife: number;
  /** A monthly allowance for upkeep (her 2027 plan's Carmei Gat fixes ÷ 12). */
  upkeepAllowance: number;
}
/** Rent in minus what the apartment costs, before and after the upkeep allowance. */
export function carmeiGatNet(p: CarmeiGatParts): { before: number; withUpkeep: number } {
  const before = r2(n(p.rent) - n(p.mortgage) - n(p.insurance) - n(p.mortgageLife));
  return { before, withUpkeep: r2(before - n(p.upkeepAllowance)) };
}

/**
 * How long cash lasts against a monthly shortfall, to one decimal. Null when
 * the month is covered (margin ≥ 0: nothing is drawn down). The second figure
 * is the extra months a reserve (keren hishtalmut) would add — only when it is
 * used, and never added into the cash itself.
 */
export function cashLasts(
  cash: number,
  margin: number,
  reserve = 0,
): { months: number; extraWithReserve: number } | null {
  const m = n(margin);
  if (m >= 0) return null;
  const draw = -m;
  const base = Math.round((Math.max(0, n(cash)) / draw) * 10) / 10;
  const withReserve =
    Math.round(((Math.max(0, n(cash)) + Math.max(0, n(reserve))) / draw) * 10) / 10;
  return { months: base, extraWithReserve: Math.round((withReserve - base) * 10) / 10 };
}

/**
 * Petachya net a month for a year. 2026 keeps the figure the app carries today;
 * 2027 and later use the 2027 figure (travel in; havra'a is a separate yearly
 * lump, never spread into the month).
 */
export function petachyaNetMonth(p: { netInApp: number; net2027: number }, year: number): number {
  return n(year) >= 2027 ? n(p.net2027) : n(p.netInApp);
}

/**
 * Private practice net a month for `clients` weekly clients, from her home
 * (second-brain self/private-practice.md + the Oct 13 19:50 checker table):
 * net per session × bookable weeks a year × (1 − cancellations) ÷ 12 per client,
 * × her clients; income tax on the taxable share (20% on 70%) comes off that;
 * the accountant is a FIXED monthly fee (not scaled by clients, not taxed).
 * Checker table (₪382.50, 40 weeks, ₪200): 3 clients 25% = 2,267 · 15% = 2,596;
 * 4 clients 25% = 3,090 · 15% = 3,528.
 */
export function privateNetMonth(
  clients: number,
  p: {
    sessionNet: number;
    bookableWeeks: number;
    cancellations: number;
    accountantMonth: number;
    taxRate: number;
    taxableShare: number;
  },
): number {
  const k = Math.max(0, n(clients));
  if (k === 0) return 0;
  const turnover = (k * n(p.sessionNet) * n(p.bookableWeeks) * (1 - n(p.cancellations))) / 12;
  const tax = turnover * n(p.taxRate) * n(p.taxableShare);
  return Math.round(turnover - tax - n(p.accountantMonth));
}

/**
 * Gan 2 net in one month: ₪0 in its unpaid months (July–August), otherwise a
 * full paid month (no ÷12 average) — session pay × sessions × gan days × weeks
 * × the rough net factor, to whole shekels.
 */
export function gan2NetForMonth(
  g: { perSession: number; sessionsPerDay: number; daysPerWeek: number; unpaidMonths: number[] },
  weeksPerMonth: number,
  netFactor: number,
  month: number,
): number {
  if (g.unpaidMonths.includes(month)) return 0;
  return Math.round(
    n(g.perSession) * n(g.sessionsPerDay) * n(g.daysPerWeek) * n(weeksPerMonth) * n(netFactor),
  );
}

/**
 * Private net in one month for `clients`: no turnover in `stopMonths` (August),
 * the year's turnover spread over the other months; the accountant is charged
 * every month. No clients → no practice → 0.
 */
export function privateNetForMonth(
  clients: number,
  p: {
    sessionNet: number;
    bookableWeeks: number;
    cancellations: number;
    accountantMonth: number;
    taxRate: number;
    taxableShare: number;
    stopMonths: number[];
  },
  month: number,
): number {
  const k = Math.max(0, n(clients));
  if (k === 0) return 0;
  if (p.stopMonths.includes(month)) return -n(p.accountantMonth);
  const turnover =
    (k * n(p.sessionNet) * n(p.bookableWeeks) * (1 - n(p.cancellations))) /
    (12 - p.stopMonths.length);
  return Math.round(turnover - turnover * n(p.taxRate) * n(p.taxableShare) - n(p.accountantMonth));
}

/**
 * Petachya net in one month. 2026 = netInApp, flat. 2027+: August = netNoTravel2027
 * (no travel), the havra'a month = net2027 + havraa2027, every other month = net2027.
 */
export function petachyaNetForMonth(
  p: {
    netInApp: number;
    net2027: number;
    netNoTravel2027: number;
    havraa2027: number;
    havraaMonth: number;
  },
  year: number,
  month: number,
): number {
  if (n(year) < 2027) return n(p.netInApp);
  if (month === 8) return n(p.netNoTravel2027);
  if (month === p.havraaMonth) return n(p.net2027) + n(p.havraa2027);
  return n(p.net2027);
}
