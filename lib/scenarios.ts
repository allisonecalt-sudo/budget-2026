// What this is: the ONE source of the ways 2027 could look — every salary figure
//   (PAY), the income mixes built from it, the four spending levels, her 2027
//   plan for the pots, and the job-compare helpers. No DOM, no Supabase.
// Why it exists: before v73 the same incomes lived in four lists inside app.ts
//   (CHOICES, SAFE_SCENARIOS, MIX_NET, PRIVATE_MIXES) and two level tables, and
//   the new Analyze stack (tabs/analyze.ts) needs to read them without importing
//   the 16,000-line app. One list per kind, row-shaped like the future
//   `scenarios` / `spend_levels` / `pot_plan` tables, so plan step 4 (a schema,
//   her separate yes) is a swap, not a rewrite.
// What's decided (v73 spec D10, D17): nets are SUMS of PAY, never typed twice.
//   Temp / Middle / Normal = her Oct 11 walkthrough rows; Lean is NOT here —
//   it is her editable floor (spend_floors). No schema in v73.
// What's built: PAY, GAN2_NET/PET_NET/clientsNet/MIX_NET, SCENARIOS + scenario()
//   + privateNetOf(), LEVEL_META + SPEND_LEVELS, POT_PLAN,
//   jobRates/perHourLines/jobCompareRows, planIncomeForMonth.
// What's next: the Analyze stack reads planIncomeForMonth for the Feb–Dec 2027 strip.
// Links: tests/scenarios.test.mjs · tests/pay.test.mjs · lib/pay.ts ·
//   second-brain projects/budget-app/v73-analyze-rebuild-spec-2026-10-18.md ·
//   how-her-budget-works-2026-09-20.md (#level_temp/middle/normal).

import {
  perHour,
  schoolGrossMonth,
  sessionHourly,
  gan2GrossMonth,
  gan2NetMonth,
  gan2NetForMonth,
  petachyaNetMonth,
  petachyaNetForMonth,
  privateNetMonth,
  privateNetForMonth,
} from './pay.js';
import { shekels } from './money.js';

// ── PAY · every salary figure in the app, in ONE place ────────────────────
// A payslip changes a number here and nowhere else: the Analyze scenarios
// (SCENARIOS), the job comparison, the per-hour lines and the
// notes all read this object. Homes (second-brain): Petachya → self/petachya-
// pay.md · Clalit → projects/clalit/pay-system-decoded-2026-07-15.md (glance
// box) · tax → self/tax.md · Carmei Gat → self/carmei-gat.md · private →
// self/private-practice.md. Per-hour figures are GROSS per PAID hour unless a
// label says "real" (hours in the room). All ESTIMATES until a payslip says so.
export const PAY = {
  clalit: {
    plainGrossMonth: 8670, // a plain month, no extra hours (Jan–Sep 2026 slips)
    withGrantsGrossMonth: 10340, // + the yearly grants spread over 12
    paidHoursMonth: 95.15, // = 22 paid hours a week
    paidHoursWeek: 22,
    realHoursWeek: 22,
    netExtraOverPetachya: 5100, // net the job adds next to Petachya (grants spread)
    grossWithPetachyaMonth: 22700,
    fundsMonth: 2470, // pension + KH into the funds
  },
  petachya: {
    ratePerPaidHour: 120, // gross, since the Sep slip
    paidHoursMonth: 95.33,
    paidHoursWeek: 22,
    realHoursWeek: 12.5,
    netLow: 9660, // a normal month with travel (self/petachya-pay.md)
    netHigh: 9730,
    // The figure the scenarios carry today. PENDING her exact number (Oct 15:
    // "I lower it… let's just wait") — change it HERE, once, and every
    // scenario follows.
    netInApp: 9860, // 2026 — kept as is (her Oct 18: "leave Petachya till the end of the year")
    // 2027+ (her Oct 18: "fix next year 2027"): ₪9,700 a month net, travel in.
    // Havra'a is a yearly lump (paid in Sep), NOT spread into the month.
    net2027: 9700,
    havraa2027: 1380, // about once a year, in September
    netNoTravel2027: 9185, // August has no travel (her Oct 15: "August doesn't have travel"); = the payslip base net before travel, self/petachya-pay.md#petachya_net_base
    havraaMonth: 9, // havra'a lands in the September app month (2026: on the Aug slip, paid in Sep)
  },
  school: {
    ratePerPaidHour: 130,
    weeksPerMonth: 4.33,
    paidHoursWeek: 20,
    realHoursWeek: 14, // she is in the room 14 h for 20 paid
    netExtraOverPetachya: 6420,
    netWithPetachyaKhBelief: 16000, // if the keren hishtalmut is real (her belief)
    grossWithPetachyaMonth: 23500,
    fundsMonth: 3210, // with the KH
    fundsMonthNoKh: 2080,
  },
  gan2: {
    perSession: 180, // ₪ per session
    sessionsPerDay: 4, // four 40-minute sessions on ONE gan day a week
    daysPerWeek: 1,
    minutesPerSession: 40,
    unpaidMonths: [7, 8], // her Oct 18 2026: "nothing in July and Aug" (the gan 2 home)
    paidMonths: 10, // 10 of 12 in a full year: paid Sep–Jun, ₪0 in July–August (her Oct 18 2026: "nothing in July and Aug"). 2026–27 is 9 (she started Fri Oct 16) — that only touches 2026 months, which this view does not project.
    // Gross a month is derived (gan2GrossMonth): ₪720 a day × 4.33 × 10 ÷ 12.
    // Net = gross × netFactor: a payslip job, tax withheld at her marginal
    // rate with no tax coordination, pension only. Rough, before the year-end
    // refund; waiting for the first payslip. Every gan 2 mix reads GAN2_NET.
    netFactor: 0.7,
  },
  private: {
    // TODAY'S PACE: 2 clients at her real 2026 session pace ≈ ₪710/mo net
    // (self/private-practice.md#private_net_month_2027). Not her plan.
    netMonth: 710,
    // HER PLAN if no school (Oct 18: "4–5"): the checked formula, privateNetMonth()
    // — ₪382.50 net a session, 40 bookable weeks, 25% cancellations as the BASE
    // (15% the better case), accountant ₪200/mo FIXED, 20% tax on 70%.
    sessionNet: 382.5,
    bookableWeeks: 40,
    cancellations: 0.25,
    cancellationsBetter: 0.15,
    accountantMonth: 200,
    incomeTaxRate: 0.2,
    // TURNOVER, which the 70% rule applies to (not the net above): 2026 ≈
    // ₪14.2–14.9K a year (self/tax.md) ≈ ₪1,200 a month. Rough.
    turnoverMonth: 1200,
    marginalRate: 0.31, // 35% only when gan 2 sits on top of the school
    marginalRateHigh: 0.35,
    taxableShare: 0.7, // עוסק זעיר: tax on 70% of turnover
    seRate: 0.153, // US self-employment tax, rough
    seBase: 0.9235,
    stopMonths: [8], // clients stop in August; the accountant's ₪200 is still charged (Aug 2026 slip)
    planClientsFrom: { year: 2027, month: 3 }, // bridge v3b: Jan–Feb 2027 at today's 2-client pace, 4–5 clients from March (how-her-budget-works NOW; not yet reviewed by her)
  },
  carmeiGat: {
    // From the Oct 12 analysis (self/carmei-gat.md): rough.
    rent: 4850,
    mortgage: 4797.8,
    insurance: 112,
    mortgageLife: 26,
    upkeepAllowance: 250, // her 2027 plan's ₪3,000 of fixes ÷ 12
  },
  reserves: {
    khHarel: 64000, // keren hishtalmut: withdrawable tax-free after 6 years
    softLine: 25000, // "around ₪25K" — a SOFT line (her Oct 18 11:46 + 14:20); a flag to look at, never a failure
  },
};
// Gan 2 net a month: derived from its gross, one rough factor, never typed.
export const GAN2_NET = gan2NetMonth(
  gan2GrossMonth(PAY.gan2, PAY.school.weeksPerMonth),
  PAY.gan2.netFactor,
);
// Petachya net a month for the year the mixes look at: every mix is a 2027 view
// (after Feb 7), so they read the 2027 figure; 2026 keeps PAY.petachya.netInApp.
export const PET_NET = petachyaNetMonth(PAY.petachya, 2027);
export const clientsNet = (clients: number, better = false): number =>
  privateNetMonth(clients, {
    sessionNet: PAY.private.sessionNet,
    bookableWeeks: PAY.private.bookableWeeks,
    cancellations: better ? PAY.private.cancellationsBetter : PAY.private.cancellations,
    accountantMonth: PAY.private.accountantMonth,
    taxRate: PAY.private.incomeTaxRate,
    taxableShare: PAY.private.taxableShare,
  });
// Net a month of every income mix after Feb 7 — sums of PAY, never typed twice.
// "If it goes wrong": income mixes from her Sep 4 money model
// (second-brain projects/leaving-clalit/money-model-2026-09-04-1002.md), net
// a month after tax, ב.ל. and her pension/KH share. Petachya 2027 = PAY.petachya.net2027
// (havra'a excluded — a yearly lump); 2 private clients = today's pace ₪710
// (PAY.private.netMonth); 4–5 clients = privateNetMonth() (her plan); gan 2 = derived from PAY.gan2 (was ₪890 × 42 Mondays).
// The model predates gan 2 starting and the Feb 7 last day — labelled so.
// Oct 15 2026: gan 2 is a YES (Fridays, 4 kids — her Oct 18 words); on Oct 12 it was "no gan 2 right now". The ₪9,780 'only payslip' premise is wrong: Petachya already taxes her as sole income (verified normal net ≈ ₪9,660–9,730 + havra'a).
export const MIX_NET = {
  pet: PET_NET,
  pet2: PET_NET + PAY.private.netMonth,
  petgan: PET_NET + GAN2_NET,
  all: PET_NET + GAN2_NET + PAY.private.netMonth,
  school: PET_NET + PAY.school.netExtraOverPetachya,
  school2: PET_NET + PAY.school.netExtraOverPetachya + PAY.private.netMonth,
  schoolgan: PET_NET + PAY.school.netExtraOverPetachya + GAN2_NET,
  all4: PET_NET + GAN2_NET + clientsNet(4),
  all5: PET_NET + GAN2_NET + clientsNet(5),
  clalit: PET_NET + PAY.clalit.netExtraOverPetachya,
};

// One row per way 2027 could look — the shape of the future `scenarios` table
// (plan step 4: a swap, no screen change). Nets are sums of PAY, never typed.
export interface ScenarioRow {
  key: string;
  label: string;
  note: string;
  net: number; // ₪ net a typical month, 2027 (MIX_NET)
  real_hours: number; // hours in the room a week (her words)
  paid_hours: number;
  drive_hours: number; // rough
  sure: number;
  likely: number;
  maybe: number;
  summer_note: string; // was CHOICES.august
  private_clients: number; // 0 | 2 | 4 | 5 — drives the US self-employment line
  in_plan: boolean; // her plan after Feb 7 (Oct 18): all4 + all5
  plan_edge: 'low' | 'high' | null;
  source: string; // home of the number
  as_of: string; // '2026-10-18'
}

const SCENARIO_SOURCE =
  'PAY (lib/scenarios.ts) · homes: self/petachya-pay.md, the gan 2 home, self/private-practice.md';
const SCENARIO_AS_OF = '2026-10-18';

// "Which week?" — one card per way 2027 could look (consultant pass, Oct 11
// 20:42; her numbers 20:19–20:30). Net a month, 2027, Petachya without havra'a; hours a week:
// real (in the room) and paid, her words — Clalit 22 + Petachya 12.5, school
// 14 real for 20 paid, gan 2 ~5 real for 8 paid, a private session ~1¼ h.
// Driving ≈ Pisgat Ze'ev 30–40 min each way ×3, Rehovot ~50 min ×2, Neve
// Yaakov ~30 min ×2, home visits ~1.5 h/wk (ESTIMATES). sure = a payslip
// today · likely = agreed, not started · maybe = not offered / cancellations.
// Her plan is the RANGE all4 (low) → all5 (high): all4's label names what its
// own net is (4 clients); planCaption() names the range from both rows.
export const SCENARIOS: ScenarioRow[] = [
  {
    key: 'clalit',
    label: 'Clalit + Petachya — as it is now',
    note: 'no extra hours, grants spread · ends Feb 7',
    net: MIX_NET.clalit,
    real_hours: 34.5,
    paid_hours: 44,
    drive_hours: 6.8,
    sure: MIX_NET.clalit,
    likely: 0,
    maybe: 0,
    summer_note: 'both paid',
    private_clients: 0,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  {
    key: 'school',
    label: 'Petachya + the school',
    note: 'not offered yet · with keren hishtalmut (KH), your belief: ₪16,000 net, more into funds',
    net: MIX_NET.school,
    real_hours: 26.5,
    paid_hours: 42,
    drive_hours: 5.5,
    sure: PET_NET,
    likely: 0,
    maybe: PAY.school.netExtraOverPetachya,
    summer_note: 'both paid',
    private_clients: 0,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  {
    key: 'school2',
    label: 'Petachya + school + 2 clients',
    note: 'the school not offered yet',
    net: MIX_NET.school2,
    real_hours: 29,
    paid_hours: 44.5,
    drive_hours: 7,
    sure: PET_NET,
    likely: 0,
    maybe: PAY.school.netExtraOverPetachya + PAY.private.netMonth,
    summer_note: 'clients stop in August',
    private_clients: 2,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  // Hours derived like 'pet2' was: the school row + the gan 2 hours the other
  // rows use (petgan − pet = +5 real, +8 paid, +0.5 drive) → 26.5/42/5.5 + that.
  {
    key: 'schoolgan',
    label: 'Petachya + school + gan 2',
    note: 'the school not offered yet · gan 2: yes (Oct 15), Fridays, 4 kids',
    net: MIX_NET.schoolgan,
    real_hours: 31.5,
    paid_hours: 50,
    drive_hours: 6,
    sure: PET_NET,
    likely: 0,
    maybe: PAY.school.netExtraOverPetachya + GAN2_NET,
    summer_note: 'school paid; gan 2 pays ₪0 in July–August',
    private_clients: 0,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  {
    key: 'all5',
    label: 'Petachya + gan 2 (Fri) + 5 private clients',
    note: 'gan 2: yes (Oct 15), Fridays, 4 kids · no-school plan (4–5 clients) · 5 clients',
    net: MIX_NET.all5,
    real_hours: 23.8,
    paid_hours: 36.3,
    drive_hours: 7.6,
    sure: PET_NET,
    likely: 0,
    maybe: GAN2_NET + clientsNet(5),
    summer_note: 'gan 2 pays ₪0 in July–August; clients stop in August',
    private_clients: 5,
    in_plan: true,
    plan_edge: 'high',
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  {
    key: 'all4',
    label: 'Petachya + gan 2 (Fri) + 4 private clients',
    note: 'your plan, no school: Petachya + gan 2 (Fri) + 4–5 private clients · gan 2: yes (Oct 15), Fridays, 4 kids · this is the 4-client edge (25% cancellations)',
    net: MIX_NET.all4,
    real_hours: 22.5,
    paid_hours: 35,
    drive_hours: 6.8,
    sure: PET_NET,
    likely: 0,
    maybe: GAN2_NET + clientsNet(4),
    summer_note: 'gan 2 pays ₪0 in July–August; clients stop in August',
    private_clients: 4,
    in_plan: true,
    plan_edge: 'low',
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  {
    key: 'all',
    label: 'Petachya + gan 2 (Fri) + 2 clients',
    note: 'gan 2: yes (Oct 15), Fridays, 4 kids',
    net: MIX_NET.all,
    real_hours: 20,
    paid_hours: 32.5,
    drive_hours: 5.3,
    sure: PET_NET,
    likely: 0,
    maybe: GAN2_NET + PAY.private.netMonth,
    summer_note: 'gan 2 pays ₪0 in July–August; clients stop in August',
    private_clients: 2,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  {
    key: 'petgan',
    label: 'Petachya + gan 2 (Fri)',
    note: 'gan 2: yes (Oct 15), Fridays, 4 kids',
    net: MIX_NET.petgan,
    real_hours: 17.5,
    paid_hours: 30,
    drive_hours: 3.8,
    sure: PET_NET,
    likely: 0,
    maybe: GAN2_NET,
    summer_note: 'gan 2 pays ₪0 in July–August',
    private_clients: 0,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  // Derived from 'pet': +2 sessions (~1¼ h each = 2.5 h real and paid), +1.5 h
  // driving (the 'all' minus 'petgan' drive difference).
  {
    key: 'pet2',
    label: 'Petachya + 2 private clients',
    note: 'today (2 clients) · today’s pace',
    net: MIX_NET.pet2,
    real_hours: 15,
    paid_hours: 24.5,
    drive_hours: 4.8,
    sure: PET_NET,
    likely: 0,
    maybe: PAY.private.netMonth,
    summer_note: 'clients stop in August',
    private_clients: 2,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
  {
    key: 'pet',
    label: 'Petachya only',
    note: 'if it goes wrong',
    net: MIX_NET.pet,
    real_hours: 12.5,
    paid_hours: 22,
    drive_hours: 3.3,
    sure: PET_NET,
    likely: 0,
    maybe: 0,
    summer_note: 'paid',
    private_clients: 0,
    in_plan: false,
    plan_edge: null,
    source: SCENARIO_SOURCE,
    as_of: SCENARIO_AS_OF,
  },
];

/** One scenario by key; throws on an unknown key (a typo must not read as ₪0). */
export function scenario(key: string): ScenarioRow {
  const row = SCENARIOS.find((s) => s.key === key);
  if (!row) throw new Error('Unknown scenario: ' + key);
  return row;
}

/** Net private income of a scenario (2 = today's pace; 4/5 = her plan formula). */
export function privateNetOf(row: ScenarioRow): number {
  return row.private_clients >= 4
    ? clientsNet(row.private_clients)
    : row.private_clients === 2
      ? PAY.private.netMonth
      : 0;
}

/**
 * What to call her plan: built from BOTH plan rows (low edge → high edge), never
 * one row's label. 'Petachya + gan 2 (Fri) + 4–5 private clients'.
 */
export function planCaption(): string {
  const low = SCENARIOS.find((s) => s.plan_edge === 'low');
  const high = SCENARIOS.find((s) => s.plan_edge === 'high');
  if (!low || !high) throw new Error('The plan needs a low and a high row');
  return (
    'Petachya + gan 2 (Fri) + ' +
    low.private_clients +
    '–' +
    high.private_clients +
    ' private clients'
  );
}

// ── Her four spending levels for 2027, ₪ a month ──────────────────────────
// Built line by line with her on Oct 11 (lean-floor-walkthrough-2026-10-11.md).
export type LevelKey = 'temp' | 'lean' | 'middle' | 'normal';
export const LEVEL_META: { key: LevelKey; name: string; note: string }[] = [
  { key: 'temp', name: 'Temp', note: 'for a stretch — no charity, travel or therapy (your words)' },
  { key: 'lean', name: 'Lean', note: 'lean but livable — your floor' },
  { key: 'middle', name: 'Middle', note: 'between lean and normal' },
  { key: 'normal', name: 'Normal', note: 'about how 2026 actually ran' },
];
// The shape of the future `spend_levels` table. Lean is NOT here: it is her
// editable floor (spend_floors); these three come from the Oct 11 walkthrough.
export interface SpendLevelRow {
  year: number;
  level: Exclude<LevelKey, 'lean'>;
  category: string;
  amount: number;
  source: string;
  as_of: string;
}
const LEVEL_SOURCE = 'lean-floor-walkthrough-2026-10-11.md';
export const SPEND_LEVELS: SpendLevelRow[] = [
  {
    year: 2027,
    level: 'temp',
    category: 'housing',
    amount: 3730,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'recurring',
    amount: 1231,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'groceries',
    amount: 1405,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'transport',
    amount: 550,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'health',
    amount: 150,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'household',
    amount: 135,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'therapy',
    amount: 0,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'retail',
    amount: 400,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'gifts',
    amount: 150,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'takeout',
    amount: 0,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'eatingout',
    amount: 50,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'entertainment',
    amount: 50,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'holiday',
    amount: 50,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'charity',
    amount: 0,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'admin',
    amount: 1851,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'temp',
    category: 'travel',
    amount: 0,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'housing',
    amount: 3730,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'recurring',
    amount: 1278,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'groceries',
    amount: 1550,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'transport',
    amount: 725,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'health',
    amount: 200,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'household',
    amount: 135,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'therapy',
    amount: 375,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'retail',
    amount: 600,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'gifts',
    amount: 300,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'takeout',
    amount: 235,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'eatingout',
    amount: 205,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'entertainment',
    amount: 185,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'holiday',
    amount: 75,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'charity',
    amount: 600,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'admin',
    amount: 2063,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'middle',
    category: 'travel',
    amount: 458,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'housing',
    amount: 3730,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'recurring',
    amount: 1278,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'groceries',
    amount: 1600,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'transport',
    amount: 900,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'health',
    amount: 250,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'household',
    amount: 135,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'therapy',
    amount: 500,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'retail',
    amount: 700,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'gifts',
    amount: 350,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'takeout',
    amount: 320,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'eatingout',
    amount: 260,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'entertainment',
    amount: 285,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'holiday',
    amount: 85,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'charity',
    amount: 723,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'admin',
    amount: 2605,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
  {
    year: 2027,
    level: 'normal',
    category: 'travel',
    amount: 708,
    source: LEVEL_SOURCE,
    as_of: '2026-10-11',
  },
];
/** One level's lines for a year: category → ₪ a month. */
export function spendLevelLines(
  level: Exclude<LevelKey, 'lean'>,
  year = 2027,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of SPEND_LEVELS)
    if (r.level === level && r.year === year) out[r.category] = r.amount;
  return out;
}
/** One level's total ₪ a month for a year. */
export function spendLevelTotal(level: Exclude<LevelKey, 'lean'>, year = 2027): number {
  return Object.values(spendLevelLines(level, year)).reduce((a, v) => a + v, 0);
}

// ── Her 2027 plan for the pots ────────────────────────────────────────────
// (second-brain projects/budget-app/2027-spending-plan-2026-09-04.md §3), her
// words beside each. Not in the app yet — shown as her plan, never as booked
// money. Her walkthrough Oct 11 19:31–20:15 — normal amounts, lean in `lean`.
// Row-shaped like the future `pot_plan` table.
export interface PotPlanRow {
  year: number;
  label: string;
  group: string;
  pot: 'travel' | 'admin';
  amount: number;
  lean: number;
  note: string;
}
export const POT_PLAN: PotPlanRow[] = [
  {
    year: 2027,
    label: 'Travel',
    group: 'Trips',
    pot: 'travel',
    amount: 8500,
    lean: 3000,
    note: '“probably if there is money 8500”',
  },
  {
    year: 2027,
    label: 'Car (service, test, license, repairs)',
    group: 'Car',
    pot: 'admin',
    amount: 6405,
    lean: 6405,
    note: '“all car cost the same”',
  },
  {
    year: 2027,
    label: 'Egg freezing — one cycle',
    group: 'Health',
    pot: 'admin',
    amount: 8000,
    lean: 8000,
    note: 'the second cycle in 2028',
  },
  {
    year: 2027,
    label: 'Cog-Fun course',
    group: 'Professional',
    pot: 'admin',
    amount: 5000,
    lean: 0,
    note: '“out for lean… I do want to do it”',
  },
  {
    year: 2027,
    label: 'Surprises (incl. home repairs)',
    group: 'Other',
    pot: 'admin',
    amount: 5000,
    lean: 2000,
    note: 'lean = only what breaks',
  },
  {
    year: 2027,
    label: 'Carmei Gat fixes',
    group: 'Carmei Gat Apt',
    pot: 'admin',
    amount: 3000,
    lean: 3000,
    note: 'if the tenants stay',
  },
  {
    year: 2027,
    label: 'Hair',
    group: 'Other',
    pot: 'admin',
    amount: 2107,
    lean: 1054,
    note: 'lean = your aunt’s place',
  },
  {
    year: 2027,
    label: 'US taxes — SimpleTax Premium',
    group: 'Admin',
    pot: 'admin',
    amount: 999,
    lean: 999,
    note: 'self-employed + rental',
  },
  {
    year: 2027,
    label: 'Dentist',
    group: 'Health',
    pot: 'admin',
    amount: 750,
    lean: 750,
    note: 'twice a year',
  },
];
// Petachya + Clalit (grants spread, no extra hours) vs Petachya + the school —
// her bottom line, Oct 11 20:29–20:30. School KH = her belief (confirm).
// Every per-hour figure is GROSS per PAID hour (the same basis for every
// job) unless the label says "real" (hours in the room) — and it is the job's
// own rate, i.e. at the margin, never Petachya's whole-week average.
export function jobRates(): {
  clalitPaid: number;
  clalitReal: number;
  schoolGross: number;
  schoolPaid: number;
  schoolReal: number;
  petachya: number;
  gan2Hour: number;
} {
  const c = PAY.clalit;
  const sc = PAY.school;
  const schoolGross = schoolGrossMonth(sc.ratePerPaidHour, sc.weeksPerMonth, sc.paidHoursWeek);
  return {
    clalitPaid: perHour(c.withGrantsGrossMonth, c.paidHoursMonth),
    clalitReal: perHour(
      c.withGrantsGrossMonth,
      (c.paidHoursMonth * c.realHoursWeek) / c.paidHoursWeek,
    ),
    schoolGross,
    schoolPaid: perHour(schoolGross, sc.paidHoursWeek * sc.weeksPerMonth),
    schoolReal: perHour(schoolGross, sc.realHoursWeek * sc.weeksPerMonth),
    petachya: PAY.petachya.ratePerPaidHour,
    gan2Hour: sessionHourly(PAY.gan2.perSession, PAY.gan2.minutesPerSession),
  };
}
// The per-hour lines on one "Which week?" card — job, ₪, and the basis.
export function perHourLines(key: string): { job: string; value: number; basis: string }[] {
  const r = jobRates();
  const pet = { job: 'Petachya', value: r.petachya, basis: 'gross per paid hour' };
  if (key === 'clalit')
    return [
      { job: 'Clalit', value: r.clalitPaid, basis: 'gross per paid hour, grants spread' },
      pet,
    ];
  if (key === 'school' || key === 'school2')
    return [
      { job: 'The school', value: r.schoolPaid, basis: 'gross per paid hour' },
      {
        job: 'The school',
        value: r.schoolReal,
        basis: 'gross per real hour (' + PAY.school.realHoursWeek + ' h in the room)',
      },
      pet,
    ];
  if (key === 'petgan' || key === 'all')
    return [
      {
        job: 'Gan 2',
        value: r.gan2Hour,
        basis:
          'gross per session hour (₪' +
          PAY.gan2.perSession +
          ' for ' +
          PAY.gan2.minutesPerSession +
          ' min)',
      },
      pet,
    ];
  return [pet];
}
// Petachya + Clalit (grants spread, no extra hours) vs Petachya + the school —
// her bottom line, Oct 11 20:29–20:30. School KH = her belief (confirm).
export function jobCompareRows(): {
  label: string;
  clalit: string;
  school: string;
  diff: string;
}[] {
  const r = jobRates();
  const c = PAY.clalit;
  const sc = PAY.school;
  const sh = shekels;
  const diff = (school: number, clalit: number, dec = 0): string => {
    const d = school - clalit;
    const mag = dec ? Math.abs(d).toFixed(dec) : sh(Math.abs(d)).replace('₪', '');
    return 'school ' + (d >= 0 ? '+' : '−') + (dec ? '' : '₪') + mag;
  };
  const clalitMix = scenario('clalit');
  const schoolMix = scenario('school');
  const rows = [
    {
      label: 'Net a month',
      clalit: sh(MIX_NET.clalit),
      school: sh(sc.netWithPetachyaKhBelief),
      diff: diff(sc.netWithPetachyaKhBelief, MIX_NET.clalit),
    },
    {
      label: 'Gross a month',
      clalit: sh(c.grossWithPetachyaMonth),
      school: sh(sc.grossWithPetachyaMonth),
      diff: diff(sc.grossWithPetachyaMonth, c.grossWithPetachyaMonth),
    },
    {
      label: 'Into pension + keren hishtalmut (KH), the job',
      clalit: sh(c.fundsMonth),
      school: sh(sc.fundsMonth),
      diff: diff(sc.fundsMonth, c.fundsMonth),
    },
    {
      label: 'Net + funds',
      clalit: sh(MIX_NET.clalit + c.fundsMonth),
      school: sh(sc.netWithPetachyaKhBelief + sc.fundsMonth),
      diff: diff(sc.netWithPetachyaKhBelief + sc.fundsMonth, MIX_NET.clalit + c.fundsMonth),
    },
    {
      label: 'Real hours a week',
      clalit: String(clalitMix.real_hours),
      school: String(schoolMix.real_hours),
      diff: diff(schoolMix.real_hours, clalitMix.real_hours, 1).replace(/\.0$/, ''),
    },
    {
      label: 'The extra job, gross per PAID hour',
      clalit: sh(r.clalitPaid),
      school: sh(r.schoolPaid),
      diff: diff(r.schoolPaid, r.clalitPaid),
    },
    {
      label: 'The extra job, gross per REAL hour',
      clalit: sh(r.clalitReal),
      school: sh(r.schoolReal),
      diff: diff(r.schoolReal, r.clalitReal),
    },
  ];
  return rows;
}

export interface PlanMonth {
  petachya: number;
  gan2: number;
  private: number;
  total: number;
  notes: string[];
}
/**
 * Her plan's income in one month of 2027+ (Petachya + gan 2 + `clients` private
 * clients, no school). Month by month, not an average: gan 2 pays ₪0 in July–
 * August, clients stop in August (the accountant is still charged), Petachya has
 * no travel in August and the havra'a lands in September. Before March 2027 the
 * clients are today's 2-client pace.
 */
export function planIncomeForMonth(
  ym: { year: number; month: number },
  clients: number,
): PlanMonth {
  const petachya = petachyaNetForMonth(PAY.petachya, ym.year, ym.month);
  const gan2 = gan2NetForMonth(PAY.gan2, PAY.school.weeksPerMonth, PAY.gan2.netFactor, ym.month);
  const from = PAY.private.planClientsFrom;
  const atPace = ym.year * 12 + ym.month < from.year * 12 + from.month;
  const privateNet = atPace
    ? PAY.private.netMonth
    : privateNetForMonth(
        clients,
        {
          sessionNet: PAY.private.sessionNet,
          bookableWeeks: PAY.private.bookableWeeks,
          cancellations: PAY.private.cancellations,
          accountantMonth: PAY.private.accountantMonth,
          taxRate: PAY.private.incomeTaxRate,
          taxableShare: PAY.private.taxableShare,
          stopMonths: PAY.private.stopMonths,
        },
        ym.month,
      );
  const notes: string[] = [];
  if (atPace) notes.push('clients at today’s pace (2)');
  if (PAY.gan2.unpaidMonths.includes(ym.month)) notes.push('gan 2 pays ₪0');
  if (!atPace && PAY.private.stopMonths.includes(ym.month)) notes.push('no clients in August');
  if (ym.year >= 2027 && ym.month === 8) notes.push('Petachya without travel');
  if (ym.year >= 2027 && ym.month === PAY.petachya.havraaMonth)
    notes.push('+ havra’a ' + shekels(PAY.petachya.havraa2027));
  return { petachya, gan2, private: privateNet, total: petachya + gan2 + privateNet, notes };
}
