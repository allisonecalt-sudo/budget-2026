// Pure logic for budget-mcp: auth, input validation, and the month maths.
// No network, no Deno globals, so it is unit-testable.
// The maths mirrors the budget app (app.ts in the budget-2026 repo):
//   ag()            = app's agorot rounding (kills float drift only)
//   catBudget()     = budget_items total when the category has items, else budgets row
//   spentByCategory = transactions + hasLines floor + travel/admin/charity tab payments
//   totalIncome()   = months.income_* + income_items
//   Left to Budget  = ag(income - totalBudgeted)   (renderRibbon in app.ts)

export const FUNCTION_NAME = 'budget-mcp';
export const CURRENCY = 'ILS';

// ---------- row types (only the columns we ever select) ----------

export interface MonthRow {
  id: string;
  year: number;
  month_num: number;
  income_petachya: number | null;
  income_clalit: number | null;
  income_private: number | null;
  income_other: number | null;
  charity_pct: number | null;
}
export interface MonthKeyRow {
  id: string;
  year: number;
  month_num: number;
}
export interface BudgetRow {
  category: string;
  amount: number | null;
}
export interface BudgetItemRow {
  category: string;
  amount: number | null;
}
export interface TxRow {
  category: string;
  subcategory?: string | null;
  store: string | null;
  item: string | null;
  amount: number | null;
  date: string | null;
  notes: string | null;
  month_id: string;
}
export interface IncomeItemRow {
  month_id: string;
  label: string | null;
  amount: number | null;
  created_at: string;
}
export interface TabPaymentRow {
  month_num: number;
  amount: number | null;
}
export interface AdminSubRow {
  item_id: string;
  amount: number | null;
  is_paid: boolean;
  month_num: number;
}

// ---------- auth (same as grocery-mcp) ----------

export const MIN_SECRET_LENGTH = 32;

export function bearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** Only `/mcp` or `/budget-mcp/mcp` is a valid endpoint path. */
export function isMcpPath(pathname: string): boolean {
  let segs = pathname.split('/').filter((s) => s.length > 0);
  if (segs[0] === FUNCTION_NAME) segs = segs.slice(1);
  return segs.length === 1 && segs[0] === 'mcp';
}

async function sha256(s: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return new Uint8Array(buf);
}

/** Constant-time equality over SHA-256 digests (hides length too). */
export async function secretsMatch(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

/** Fail closed: unset or shorter-than-32 secret refuses everything. Header only. */
export async function isAuthorized(
  expected: string | undefined | null,
  pathname: string,
  authHeader: string | null,
): Promise<boolean> {
  if (!expected || expected.length < MIN_SECRET_LENGTH) return false;
  if (!isMcpPath(pathname)) return false;
  const token = bearerToken(authHeader);
  if (token === null) return false;
  return await secretsMatch(token, expected);
}

// ---------- errors ----------

/** Only messages from this class are ever shown to callers. */
export class ValidationError extends Error {}

export const GENERIC_ERROR = 'budget read failed';

export function safeErrorMessage(e: unknown): string {
  return e instanceof ValidationError ? e.message : GENERIC_ERROR;
}

// ---------- input validation ----------

export interface YearMonth {
  year: number;
  month: number;
}

export function validateMonth(v: unknown): YearMonth | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new ValidationError('month must be text like 2026-11');
  const m = /^(\d{4})-(\d{2})$/.exec(v.trim());
  if (!m) throw new ValidationError('month must look like 2026-11');
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    throw new ValidationError('month must look like 2026-11');
  }
  return { year, month };
}

export function validateLimit(v: unknown, def = 20, max = 100): number {
  if (v === undefined || v === null) return def;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new ValidationError('limit must be a whole number, 1 or more');
  }
  return Math.min(v, max);
}

/**
 * The app's "month" is a pay month: month N runs from the 10th of N to the 10th of N+1.
 * So on day 10 or later the pay month is this calendar month, before the 10th it is the previous one.
 */
export function payMonthFor(y: number, m: number, d: number): YearMonth {
  if (d >= 10) return { year: y, month: m };
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

export function ym(x: YearMonth): string {
  return `${x.year}-${String(x.month).padStart(2, '0')}`;
}

// ---------- the app's maths ----------

/** The app's agorot rounding (lib/budget-math.ts ag). */
export function ag(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** The app's whole-shekel rounding (lib/money.ts roundZ): never returns -0. */
export function roundZ(n: unknown): number {
  const r = Math.round(Number(n) || 0);
  return r === 0 ? 0 : r;
}

/** The app's category list (app.ts CATEGORIES), in the app's order. */
export const CATEGORIES: { key: string; label: string; hasTab?: boolean; hasLines?: boolean }[] = [
  { key: 'groceries', label: 'Groceries' },
  { key: 'takeout', label: 'Take Out' },
  { key: 'eatingout', label: 'Eating Out' },
  { key: 'entertainment', label: 'Entertainment' },
  { key: 'retail', label: 'Retail & Shopping' },
  { key: 'transport', label: 'Transportation' },
  { key: 'health', label: 'Health' },
  { key: 'therapy', label: 'Therapy' },
  { key: 'housing', label: 'Housing', hasLines: true },
  { key: 'household', label: 'Household Items' },
  { key: 'recurring', label: 'Recurring Payments', hasLines: true },
  { key: 'charity', label: 'Charity', hasTab: true },
  { key: 'travel', label: 'Travel', hasTab: true },
  { key: 'admin', label: 'Admin & Professional', hasTab: true },
  { key: 'gifts', label: 'Gifts' },
  { key: 'holiday', label: 'Holiday' },
];

const INCOME_CAVEAT =
  'Income may be an estimate: the app marks income as "estimated" on her device only, and that flag is not visible here. left_to_budget uses months.income_private, exactly like the app\'s own Left to Budget (only the app\'s Income pop-up can show a fresher private line).';
const TAB_SPENT_BASIS =
  'spent = payments so far; the app\'s top line counts the whole allocation as used';

export interface MonthInput {
  month: MonthRow;
  budgets: BudgetRow[];
  budgetItems: BudgetItemRow[];
  transactions: TxRow[];
  incomeItems: IncomeItemRow[];
  travelPayments: TabPaymentRow[]; // already filtered to this year
  charityPayments: TabPaymentRow[]; // already filtered to this year
  adminSubItems: AdminSubRow[]; // this month's paid ones
  adminItemIdsThisYear: string[];
}

export interface MonthOut {
  month: string;
  currency: string;
  income: {
    petachya: number;
    clalit: number;
    private: number;
    other: number;
    extra_items: number;
    total: number;
  };
  income_caveat: string;
  categories: {
    key: string;
    label: string;
    planned: number;
    spent: number;
    planned_from: string;
    spent_basis?: string;
  }[];
  savings: { bank: number; invested: number };
  budgeted_total: number;
  left_to_budget: number;
  /** Whole shekels, as the app prints it (so -0.42 shows as 0, not overspent). */
  left_to_budget_shown: number;
  notes: string[];
}

export function computeMonth(inp: MonthInput): MonthOut {
  const { month } = inp;

  // totalIncome()
  const extras = inp.incomeItems.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const income = ag(
    (Number(month.income_petachya) || 0) +
      (Number(month.income_clalit) || 0) +
      (Number(month.income_private) || 0) +
      (Number(month.income_other) || 0) +
      extras,
  );

  // state.budgets, with the charity-percent override the app applies on render
  const budgets: Record<string, number> = {};
  for (const b of inp.budgets) budgets[b.category] = Number(b.amount) || 0;
  const pct = Number(month.charity_pct) || 0;
  if (pct && income) budgets['charity'] = Math.round((income * pct) / 100);

  // budgetItemsTotal(): null (no items) means "use the manual budget"
  const itemSums = new Map<string, number>();
  const itemCounts = new Map<string, number>();
  for (const it of inp.budgetItems) {
    itemSums.set(it.category, (itemSums.get(it.category) ?? 0) + (Number(it.amount) || 0));
    itemCounts.set(it.category, (itemCounts.get(it.category) ?? 0) + 1);
  }
  const itemsTotal = (key: string): number | null =>
    (itemCounts.get(key) ?? 0) === 0 ? null : ag(itemSums.get(key));
  const catBudget = (key: string): number => {
    const f = itemsTotal(key);
    return f !== null ? f : budgets[key] || 0;
  };

  // spentByCategory()
  const spent: Record<string, number> = {};
  for (const c of CATEGORIES) spent[c.key] = 0;
  for (const tx of inp.transactions) {
    if (spent[tx.category] !== undefined) spent[tx.category] += Number(tx.amount);
  }
  for (const c of CATEGORIES.filter((x) => x.hasLines)) {
    const committed = itemsTotal(c.key) || 0;
    if (spent[c.key] < committed) spent[c.key] = committed;
  }
  const mn = month.month_num;
  const sum = (rows: { amount: number | null }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
  spent['travel'] += sum(inp.travelPayments.filter((p) => p.month_num === mn));
  const yearItems = new Set(inp.adminItemIdsThisYear);
  spent['admin'] += sum(
    inp.adminSubItems.filter((s) => s.is_paid && s.month_num === mn && yearItems.has(s.item_id)),
  );
  spent['charity'] += sum(inp.charityPayments.filter((p) => p.month_num === mn));
  for (const k of Object.keys(spent)) spent[k] = ag(spent[k]);

  const savingsBank = budgets['savings_bank'] || 0;
  const savingsInvested = budgets['savings_invested'] || 0;
  const totalBudgeted = ag(
    CATEGORIES.reduce((s, c) => s + catBudget(c.key), 0) + savingsBank + savingsInvested,
  );

  return {
    month: `${month.year}-${String(month.month_num).padStart(2, '0')}`,
    currency: CURRENCY,
    income: {
      petachya: ag(month.income_petachya),
      clalit: ag(month.income_clalit),
      private: ag(month.income_private),
      other: ag(month.income_other),
      extra_items: ag(extras),
      total: income,
    },
    income_caveat: INCOME_CAVEAT,
    categories: CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      planned: catBudget(c.key),
      spent: spent[c.key],
      planned_from:
        itemsTotal(c.key) !== null
          ? 'budget_items'
          : c.key === 'charity' && pct && income
            ? 'charity_pct x income'
            : 'budgets',
      ...(c.hasTab ? { spent_basis: TAB_SPENT_BASIS } : {}),
    })),
    savings: { bank: ag(savingsBank), invested: ag(savingsInvested) },
    budgeted_total: totalBudgeted,
    left_to_budget: ag(income - totalBudgeted),
    left_to_budget_shown: roundZ(ag(income - totalBudgeted)),
    notes: [
      'All amounts are ILS (shekels). Month = pay month (runs from the 10th of this month to the 10th of the next).',
      'left_to_budget = income total minus budgeted_total (categories + savings), the same as the app\'s "Unallocated / Left to Budget".',
      INCOME_CAVEAT,
      'For travel, admin and charity: spent = payments so far; the app\'s top line counts the whole allocation as used.',
    ],
  };
}

// ---------- recent items ----------

export function shapeSpending(rows: TxRow[], monthById: Map<string, string>) {
  return rows.map((t) => ({
    date: t.date,
    amount: Number(t.amount),
    currency: CURRENCY,
    category: t.category,
    subcategory: t.subcategory ?? null,
    store: t.store,
    item: t.item,
    note: t.notes,
    pay_month: monthById.get(t.month_id) ?? null,
  }));
}

export function shapeIncome(rows: IncomeItemRow[], monthById: Map<string, string>) {
  return rows.map((r) => ({
    label: r.label,
    amount: Number(r.amount),
    currency: CURRENCY,
    recorded_at: r.created_at,
    pay_month: monthById.get(r.month_id) ?? null,
  }));
}

export function shapeCategories() {
  return CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    kind: c.hasTab ? 'tab (spent comes from its own payments tab)' : c.hasLines ? 'fixed lines' : 'everyday',
  }));
}
