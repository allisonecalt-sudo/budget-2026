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
// What's built: perHour, schoolGrossMonth, seTax, taxSetAside, carmeiGatNet,
//   cashLasts.
// What's next: the Petachya figure (9,860) is pending her exact number — one
//   edit in PAY, nothing here changes.
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
