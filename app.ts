// Type-only import: erased at compile time (runtime still uses the @supabase CDN
// global). Its presence also marks this file as an ES module, matching the
// `<script type="module">` load in index.html.
import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    // Supabase UMD global from the CDN <script> in index.html.
    supabase: { createClient: (url: string, key: string) => SupabaseClient };
    // SW → app bridge (assigned below, read by the inline SW script in index.html).
    onQueueUpdate?: (data: { count?: number }) => void;
    // Cross-module handler also assigned explicitly elsewhere.
    syncPtOwedToCash: () => void;
    // One-time guard flag for the numeric-input-mode observer.
    _inputModeObserverInstalled?: boolean;
  }
}

// Typed element lookup. The app reads .value/.checked/.style/.disabled off
// looked-up nodes; HTMLInputElement carries those (and everything HTMLElement
// has), so it's the pragmatic return type for this DOM-heavy code. Runtime is
// identical to document.getElementById.
function byId(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

const SB_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';
const PT_URL = 'https://fxpaacqnsbnbzbcabpvi.supabase.co';
const PT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4cGFhY3Fuc2JuYnpiY2FicHZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjM0MzgsImV4cCI6MjA4NzY5OTQzOH0.cLIEMR4ZpH3buhMjC8nwHu8h9p-WfHPfNZpHQXua3Oc';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const CATEGORIES = [
  { key: 'groceries', label: 'Groceries', emoji: '🛒', hasStore: true },
  { key: 'takeout', label: 'Take Out', emoji: '🥡', hasStore: true },
  { key: 'eatingout', label: 'Eating Out', emoji: '🍽️', hasStore: true },
  { key: 'entertainment', label: 'Entertainment', emoji: '🎬', hasStore: false },
  { key: 'retail', label: 'Retail & Shopping', emoji: '🛍️', hasStore: true },
  { key: 'transport', label: 'Transportation', emoji: '🚗', hasStore: false },
  { key: 'health', label: 'Health', emoji: '🏥', hasStore: false },
  { key: 'therapy', label: 'Therapy', emoji: '🧠', hasStore: false },
  { key: 'housing', label: 'Housing', emoji: '🏠', hasStore: false, hasLines: true },
  { key: 'household', label: 'Household Items', emoji: '🧹', hasStore: true },
  { key: 'recurring', label: 'Recurring Payments', emoji: '🔄', hasStore: false, hasLines: true },
  { key: 'charity', label: 'Charity', emoji: '💚', hasStore: false, hasTab: true },
  { key: 'travel', label: 'Travel', emoji: '✈️', hasStore: false, hasTab: true },
  { key: 'admin', label: 'Admin & Professional', emoji: '📋', hasStore: false, hasTab: true },
  { key: 'gifts', label: 'Gifts', emoji: '🎁', hasStore: false },
  { key: 'holiday', label: 'Holiday', emoji: '🎉', hasStore: false },
];

const BIG_STORES = [
  'yochananof',
  'shufersal',
  'osher ad',
  'rami levy',
  'רמי לוי',
  'שופרסל',
  'יוחננוף',
  'אושר עד',
];
function isBigStore(store: string): boolean {
  if (!store) return false;
  const s = store.toLowerCase().trim();
  return BIG_STORES.some((b) => s.includes(b));
}

const CATEGORY_GROUPS = [
  {
    label: 'Essential Living',
    emoji: '🏠',
    keys: ['groceries', 'housing', 'household', 'transport', 'health', 'therapy'],
  },
  {
    label: 'Leisure & Lifestyle',
    emoji: '🎉',
    keys: ['takeout', 'eatingout', 'entertainment', 'retail', 'holiday', 'gifts'],
  },
  { label: 'Core Financial', emoji: '🔄', keys: ['recurring'] },
  { label: 'Charity', emoji: '💚', keys: ['charity'] },
  { label: 'Travel', emoji: '✈️', keys: ['travel'] },
  { label: 'Admin & Professional', emoji: '📋', keys: ['admin'] },
];

const sb = window.supabase.createClient(SB_URL, SB_KEY);
const _pt: ReturnType<typeof window.supabase.createClient> = window.supabase.createClient(
  PT_URL,
  PT_KEY,
);
void _pt; // PT client reserved for future use

const undoStack: UndoAction[] = [],
  redoStack: UndoAction[] = [];

/*
  === AUDIT LOG — run once in Supabase SQL editor (project: hpiyvnfhoqnnnotrmwaz) ===
  CREATE TABLE IF NOT EXISTS change_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamptz DEFAULT now(),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    description text NOT NULL,
    old_value text,
    new_value text,
    month_id uuid
  );
*/
function logChange(
  action: string,
  entityType: string,
  entityId: string | null | undefined,
  description: string,
  oldValue: unknown,
  newValue: unknown,
  monthId?: string,
): void {
  sb.from('change_log')
    .insert({
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      description,
      old_value: oldValue ? JSON.stringify(oldValue) : null,
      new_value: newValue ? JSON.stringify(newValue) : null,
      month_id: monthId || state.currentMonthId || null,
    })
    .then(({ error }) => {
      if (error) console.warn('change_log insert failed:', error);
      else if (typeof refreshHistoryIfOpen === 'function') refreshHistoryIfOpen();
    })
    // @ts-expect-error PromiseLike from Supabase builder lacks .catch; at runtime it IS a Promise
    .catch((e) => console.warn('change_log insert error:', e));
}
function pushUndo(action: UndoAction): void {
  undoStack.push(action);
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}
function updateUndoButtons() {
  const u = byId('undo-btn'),
    r = byId('redo-btn');
  if (u) u.disabled = undoStack.length === 0;
  if (r) r.disabled = redoStack.length === 0;
}
async function doUndo() {
  const a = undoStack.pop();
  if (!a) return;
  await a.undo();
  redoStack.push(a);
  updateUndoButtons();
  renderApp();
  toast('Undone: ' + a.label);
}
async function doRedo() {
  const a = redoStack.pop();
  if (!a) return;
  await a.redo();
  undoStack.push(a);
  updateUndoButtons();
  renderApp();
  toast('Redone: ' + a.label);
}

// ── Row interfaces for Supabase tables ──────────────────────────────────────

interface MonthRow {
  id: string;
  year: number;
  month_num: number;
  income_petachya: number | null;
  income_clalit: number | null;
  income_private: number | null;
  income_other: number | null;
  savings_bank: number | null;
  [key: string]: unknown;
}

interface TransactionRow {
  id: string;
  month_id: string;
  category: string;
  store: string | null;
  item: string | null;
  amount: number;
  date: string | null;
  created_at: string;
  [key: string]: unknown;
}

interface BudgetItemRow {
  id: string;
  month_id: string;
  category: string;
  label: string;
  amount: number;
  subcategory: string | null;
  sort_order: number;
  [key: string]: unknown;
}

interface IncomeItemRow {
  id: string;
  month_id: string;
  label: string;
  amount: number;
  created_at: string;
  [key: string]: unknown;
}

interface CashAccountRow {
  id: string;
  name: string;
  amount: number;
  currency: string;
  sort_order: number;
  [key: string]: unknown;
}

interface AdminItemRow {
  id: string;
  year: number;
  label: string;
  projected_amount: number;
  is_estimate?: boolean;
  category?: string;
  [key: string]: unknown;
}

interface AdminSubItemRow {
  id: string;
  label: string;
  amount: number;
  is_paid: boolean;
  month_num: number;
  is_estimate?: boolean;
  item_id?: string;
  [key: string]: unknown;
}

interface AdminAllocationRow {
  id: string;
  year: number;
  month_num: number;
  amount: number;
  month_id?: string;
  [key: string]: unknown;
}

interface TravelItemRow {
  id: string;
  year: number;
  label: string;
  projected_amount: number;
  is_estimate?: boolean;
  [key: string]: unknown;
}

interface TravelPaymentRow {
  id: string;
  year: number;
  month_num: number;
  label: string;
  destination: string | null;
  amount: number;
  is_estimate?: boolean;
  [key: string]: unknown;
}

interface TravelSubItemRow {
  id: string;
  label: string;
  amount: number;
  [key: string]: unknown;
}

interface CharityItemRow {
  id: string;
  year: number;
  label: string;
  projected_amount: number;
  is_estimate?: boolean;
  is_logged?: boolean;
  [key: string]: unknown;
}

interface CharityPaymentRow {
  id: string;
  year: number;
  month_num: number;
  label: string;
  amount: number;
  [key: string]: unknown;
}

interface CharitySubItemRow {
  id: string;
  label: string;
  amount: number;
  [key: string]: unknown;
}

interface BizMonthRow {
  id: string;
  month_id: string;
  confirmed_amount: number | null;
  accountant_fee: number | null;
  spending: number | null;
  [key: string]: unknown;
}

interface PtClientRow {
  id: string;
  name: string;
  rate: number;
  [key: string]: unknown;
}

interface PtSessionRow {
  id: string;
  status: string;
  amount: number;
  client_id?: string;
  [key: string]: unknown;
}

interface PtSessions {
  earned: PtSessionRow[];
  scheduled: PtSessionRow[];
}

interface StoreRow {
  id: string;
  name: string;
  category: string;
  [key: string]: unknown;
}

interface YearData {
  txns: TransactionRow[];
  budgetItems: BudgetItemRow[];
  allBudgets: { month_id: string; category: string; amount: number }[];
  incomeItems: IncomeItemRow[];
}

interface UndoAction {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface ToastOpts {
  action?: string;
  onAction?: () => void;
  duration?: number;
}

// Per-category aggregate block (admin / travel / charity tabs).
interface CategorySection {
  items: AdminItemRow[] | TravelItemRow[] | CharityItemRow[];
  allocations: Record<string, AdminAllocationRow>;
  payments: TravelPaymentRow[] | CharityPaymentRow[];
  subItems: AdminSubItemRow[] | TravelSubItemRow[] | CharitySubItemRow[];
}

// App state. Row collections use concrete row interfaces (MonthRow,
// TransactionRow, BudgetItemRow, …) — see the interface declarations above.
interface State {
  currentYear: number;
  availableYears: number[];
  months: MonthRow[];
  currentMonthId: string | null;
  transactions: TransactionRow[];
  budgets: Record<string, number>;
  loading: boolean;
  activeTab: string;
  biz: BizMonthRow | null;
  ptClients: PtClientRow[];
  ptSessions: PtSessions;
  incomeItems: IncomeItemRow[];
  cashAccounts: CashAccountRow[];
  usdRate: number | null;
  budgetItems: Record<string, BudgetItemRow[]>;
  allRecurringItems: Record<string, BudgetItemRow[]>;
  recurringGridMode: boolean;
  allHousingItems: Record<string, BudgetItemRow[]>;
  housingGridMode: boolean;
  allCatTxData: Record<string, TransactionRow[]>;
  allCatBudgets: Record<string, Record<string, number>>;
  spendingGridCats: string[];
  txSort: string;
  admin: CategorySection;
  travel: CategorySection;
  charity: CategorySection;
  openCats: Set<string>;
  yearData: YearData | null;
  inlineAddCat: string | null;
  allStores: StoreRow[];
  yearViewMonth: number | null;
  yearMobileFull: boolean;
  allBiz: BizMonthRow[];
  _lastCharitySync: Record<string, number> | null;
  ptOwedTotal: number;
}

let state: State = {
  currentYear: parseInt(localStorage.getItem('activeYear') as string, 10) || 2026,
  availableYears: [],
  months: [],
  currentMonthId: null,
  transactions: [],
  budgets: {},
  loading: true,
  activeTab: localStorage.getItem('activeTab') || 'budget',
  biz: null, // biz_months row for current month
  ptClients: [], // private tracker clients
  ptSessions: { earned: [], scheduled: [] }, // private tracker sessions
  incomeItems: [], // flexible extra income items
  cashAccounts: [], // liquid cash positions
  usdRate: null, // USD→ILS rate
  budgetItems: {}, // { catKey: [{id, label, amount}] }
  allRecurringItems: {}, // { month_id: [{id, label, amount, subcategory}] } for grid view
  recurringGridMode: localStorage.getItem('recurringGridMode') === 'true',
  allHousingItems: {}, // { month_id: [{id, label, amount, subcategory}] } for housing grid view
  housingGridMode: localStorage.getItem('housingGridMode') === 'true',
  allCatTxData: {}, // { catKey: [transactions] } for spending grids
  allCatBudgets: {}, // { catKey: { month_id: amount } } for spending grids
  spendingGridCats: JSON.parse(localStorage.getItem('spendingGridCats') || '[]'),
  txSort: localStorage.getItem('txSort') || 'newest',
  admin: { items: [], allocations: {}, payments: [], subItems: [] },
  travel: { items: [], allocations: {}, payments: [], subItems: [] },
  charity: { items: [], allocations: {}, payments: [], subItems: [] },
  openCats: new Set(JSON.parse(localStorage.getItem('openCats') || '[]')),
  yearData: null,
  inlineAddCat: null,
  allStores: [],
  yearViewMonth: null, // mobile Year view: which month column is shown (1-12); null = auto
  yearMobileFull: false, // mobile Year view: false = one-month layout, true = full 12-month grid
  allBiz: [],
  _lastCharitySync: null,
  ptOwedTotal: 0,
};

// ── Cache (stale-while-revalidate for fast startup) ──────────────────
const CACHE_TTL = 20 * 60 * 1000; // 20 minutes
// Cache is year-scoped so switching years never serves stale cross-year months.
function cacheKey() {
  return `budget_v1_cache_${state.currentYear}`;
}

function saveCache() {
  try {
    localStorage.setItem(
      cacheKey(),
      JSON.stringify({
        ts: Date.now(),
        year: state.currentYear,
        monthId: state.currentMonthId,
        months: state.months,
        transactions: state.transactions,
        budgets: state.budgets,
        budgetItems: state.budgetItems,
        incomeItems: state.incomeItems,
        admin: state.admin,
        travel: state.travel,
        charity: state.charity,
        yearData: state.yearData,
      }),
    );
  } catch (e) {}
}

function restoreCache() {
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return false;
    const c = JSON.parse(raw);
    if (Date.now() - c.ts > CACHE_TTL) return false;
    if (c.year !== state.currentYear) return false;
    const savedId = localStorage.getItem('activeMonthId');
    if (savedId && c.monthId !== savedId) return false;
    state.months = c.months || [];
    state.currentMonthId = (c.monthId as string | null) ?? null;
    state.transactions = c.transactions || [];
    state.budgets = c.budgets || {};
    state.budgetItems = c.budgetItems || {};
    state.incomeItems = c.incomeItems || [];
    state.admin = c.admin || { items: [], allocations: {}, payments: [], subItems: [] };
    state.travel = c.travel || { items: [], allocations: {}, payments: [], subItems: [] };
    state.charity = c.charity || { items: [], allocations: {}, payments: [], subItems: [] };
    if (c.yearData) state.yearData = c.yearData;
    state.loading = false;
    return true;
  } catch (e) {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
// Agorot rounding — snap a money sum to 2 decimals to kill float drift
// (e.g. 0.1 + 0.2 = 0.30000000000000004). Apply ONLY at sum/total boundaries
// so equality and display are exact; does NOT change any real displayed value.
function ag(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
const fmt = (n: unknown): string =>
  '₪' +
  Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (spent: number, budget: number): number =>
  budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
const status = (spent: number, budget: number): string => {
  if (budget === 0) return 'ok';
  const rem = Math.round(budget - spent);
  if (rem < 0) return 'over';
  if (rem === 0) return 'ok';
  const p = spent / budget;
  if (p >= 0.85) return 'warn';
  return 'ok';
};

let _toastTimer: ReturnType<typeof setTimeout> | null = null;
function toast(msg: string, opts?: ToastOpts): void {
  const t = byId('toast');
  if (!t) return;
  // Backward compat: plain string with no action
  if (!opts || !opts.action) {
    t.textContent = msg;
    t.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
    return;
  }
  // Snackbar style with action button
  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  span.className = 'toast-msg';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-action';
  btn.textContent = opts.action;
  btn.onclick = () => {
    t.classList.remove('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    if (typeof opts.onAction === 'function') opts.onAction();
  };
  t.appendChild(span);
  t.appendChild(btn);
  t.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), opts.duration || 5000);
}

// HTML-escape user-supplied free text before interpolating into innerHTML.
// Escapes all five HTML-significant chars so it is safe in both element text
// and double/single-quoted attribute contexts. Use for ANY user free-text
// (store, item, label, query) — never for numbers or app-controlled constants.
function esc(s: unknown): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// V5 — Thin-stroke chrome icons (Lucide-inspired, stroke-width 1.6) for the
// persistent toolbar. Emoji stays at content level (tabs, categories) — chrome
// gets monotone line icons that read as professional restraint.
const _SVG = (paths: string, opts?: { size?: number }): string => {
  const o = opts || {};
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    (o.size || 18) +
    '" height="' +
    (o.size || 18) +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    paths +
    '</svg>'
  );
};
const ICON_UNDO = _SVG('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>');
const ICON_REDO = _SVG('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>');
// snapshot = camera-with-doc / report icon
const ICON_SNAPSHOT = _SVG(
  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
);
// collapse-all = double up-chevron
const ICON_COLLAPSE = _SVG('<path d="M6 15l6-6 6 6"/><path d="M6 9l6-6 6 6"/>');
// history = clock with counter-clockwise arrow
const ICON_HISTORY = _SVG(
  '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
);
const ICON_SEARCH = _SVG('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>');
// logout = door with exit arrow
const ICON_LOGOUT = _SVG(
  '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
);

// Snackbar helper for delete actions: shows "Deleted: <label> ₪<amount> · UNDO"
function toastDeleted(label: unknown, amount: unknown): void {
  const amt = amount != null ? ' ' + fmt(amount) : '';
  const lbl = (label || 'item').toString().replace(/^\[auto\]\s*/, '');
  toast('Deleted: ' + lbl + amt, { action: 'UNDO', onAction: doUndo, duration: 5000 });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── Data loading ──────────────────────────────────────────────────────
async function loadMonths() {
  const { data, error } = await sb
    .from('months')
    .select('*')
    .eq('year', state.currentYear)
    .order('month_num');
  if (error) toast('Could not load months');
  state.months = data || [];
}

async function loadTransactions(monthId: string): Promise<void> {
  const { data, error } = await sb
    .from('transactions')
    .select('*')
    .eq('month_id', monthId)
    .order('created_at', { ascending: false });
  if (error) toast('Could not load transactions');
  state.transactions = data || [];
}

async function loadBudgets(monthId: string): Promise<void> {
  const { data, error } = await sb.from('budgets').select('*').eq('month_id', monthId);
  if (error) toast('Could not load budgets');
  state.budgets = {};
  (data || []).forEach((b) => (state.budgets[b.category] = b.amount));
}

async function loadBudgetItems(monthId: string): Promise<void> {
  const { data, error } = await sb
    .from('budget_items')
    .select('*')
    .eq('month_id', monthId)
    .order('sort_order');
  if (error) toast('Could not load budget items');
  state.budgetItems = {};
  (data || []).forEach((item) => {
    if (!state.budgetItems[item.category]) state.budgetItems[item.category] = [];
    state.budgetItems[item.category].push(item);
  });
}

async function loadAllRecurringItems() {
  const { data } = await sb
    .from('budget_items')
    .select('*')
    .eq('category', 'recurring')
    .order('sort_order');
  state.allRecurringItems = {};
  (data || []).forEach((item) => {
    if (!state.allRecurringItems[item.month_id]) state.allRecurringItems[item.month_id] = [];
    state.allRecurringItems[item.month_id].push(item);
  });
}

async function toggleRecurringGrid() {
  state.recurringGridMode = !state.recurringGridMode;
  localStorage.setItem('recurringGridMode', state.recurringGridMode as unknown as string);
  if (state.recurringGridMode && Object.keys(state.allRecurringItems).length === 0) {
    await loadAllRecurringItems();
  }
  renderApp();
}

async function saveRecurringFromMonth(
  label: string,
  fromMonthNum: number,
  newAmount: string | number,
  forward: boolean,
): Promise<void> {
  const num = parseFloat(String(newAmount)) || 0;
  const targetMonths = forward
    ? state.months.filter((m) => m.month_num >= fromMonthNum)
    : state.months.filter((m) => m.month_num === fromMonthNum);

  // Find subcategory and sort_order from any existing item with this label
  let subcategory = '';
  let sort_order = 999;
  for (const items of Object.values(state.allRecurringItems)) {
    const ref = items.find((i) => i.label === label);
    if (ref) {
      subcategory = ref.subcategory || '';
      sort_order = ref.sort_order || 999;
      break;
    }
  }

  for (const month of targetMonths) {
    if (!state.allRecurringItems[month.id]) state.allRecurringItems[month.id] = [];
    const items = state.allRecurringItems[month.id];
    const item = items.find((i) => i.label === label);
    if (item) {
      const { error } = await sb.from('budget_items').update({ amount: num }).eq('id', item.id);
      if (error) toast('Could not save recurring item');
      item.amount = num;
    } else {
      // Item doesn't exist for this month — create it
      const { data: newItem } = await sb
        .from('budget_items')
        .insert({
          month_id: month.id,
          category: 'recurring',
          label,
          amount: num,
          subcategory,
          sort_order,
        })
        .select()
        .single();
      if (newItem) items.push(newItem);
    }
  }
  // Also sync current month's budgetItems
  const currentMonth = state.months.find((m) => m.id === state.currentMonthId);
  if (currentMonth && currentMonth.month_num >= fromMonthNum) {
    const cur = (state.budgetItems['recurring'] || []).find((i) => i.label === label);
    if (cur) cur.amount = num;
  }
  renderApp();
  toast('Updated ✓');
}

function renderRecurringGrid() {
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const SUBCAT_ORDER = ['tashlumim', 'digital', 'insurance', 'bills', 'fitness'];
  const SUBCAT_LABELS = {
    tashlumim: 'תשלומים',
    digital: 'Digital',
    insurance: 'Insurance',
    bills: 'Bills',
    fitness: 'Fitness',
  };
  const today = todayMonthForYear(); // current month num

  // Get all unique items with their subcategory (from any month that has them)
  const itemMap: Record<string, string> = {}; // label -> subcategory
  Object.values(state.allRecurringItems).forEach((items) => {
    items.forEach((i) => {
      if (!itemMap[i.label]) itemMap[i.label] = i.subcategory || '';
    });
  });

  // Group items by subcategory
  const groups: Record<string, string[]> = {};
  const noSubcat: string[] = [];
  Object.entries(itemMap).forEach(([label, sc]) => {
    if (sc && SUBCAT_ORDER.includes(sc)) {
      if (!groups[sc]) groups[sc] = [];
      groups[sc].push(label);
    } else {
      noSubcat.push(label);
    }
  });

  // Build month columns — only show months that exist
  const existingMonths = state.months.slice().sort((a, b) => a.month_num - b.month_num);

  const headerCells =
    '<th style="text-align:left;padding:.3rem .5rem;font-size:.65rem;font-weight:700;color:var(--muted);position:sticky;left:0;background:var(--surface);z-index:2;min-width:130px;">Item</th>' +
    existingMonths
      .map((m) => {
        const isCur = m.month_num === today;
        const isPast = m.month_num < today;
        return (
          '<th style="text-align:right;padding:.3rem .4rem;font-size:.65rem;font-weight:700;color:' +
          (isCur ? 'var(--accent)' : isPast ? 'var(--dim)' : 'var(--muted)') +
          ';min-width:60px;">' +
          MONTH_NAMES[m.month_num - 1] +
          '</th>'
        );
      })
      .join('') +
    // RG2 — annual total column. Sum of every cell in the row, across the year.
    // Subscriptions / installments need this answer (₪280/mo Claude Max = ₪3,360/yr).
    '<th style="text-align:right;padding:.3rem .5rem;font-size:.65rem;font-weight:700;color:var(--muted);' +
    'border-left:2px solid var(--border);min-width:74px;background:var(--surface);">Year</th>';

  const renderRow = (label: string): string => {
    let rowAnnual = 0;
    const cells = existingMonths
      .map((m) => {
        const items = state.allRecurringItems[m.id] || [];
        const item = items.find((i) => i.label === label);
        const val = item ? Number(item.amount) : null;
        if (val) rowAnnual += val;
        const isCur = m.month_num === today;
        const isPast = m.month_num < today;
        const bgColor = isCur ? 'var(--gsoft)' : 'transparent';
        const txtColor = isPast ? 'var(--dim)' : isCur ? 'var(--accent)' : 'var(--text)';
        const cellContent =
          val !== null ? fmt(val).replace('₪', '') : '<span style="color:var(--dim)">—</span>';
        const escapedLabel = label.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return (
          '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
          txtColor +
          ';background:' +
          bgColor +
          ";font-family:'DM Mono',monospace;cursor:pointer;\" onclick=\"editRecurringCell('" +
          escapedLabel +
          "'," +
          m.month_num +
          ',' +
          (val || 0) +
          ')" title="Click to edit">' +
          cellContent +
          '</td>'
        );
      })
      .join('');
    const annualCell =
      '<td style="text-align:right;padding:.25rem .5rem;font-size:.75rem;font-weight:600;' +
      "color:var(--muted);font-family:'DM Mono',monospace;border-left:2px solid var(--border);background:var(--surface);\" " +
      'title="Sum across the year">' +
      (rowAnnual ? fmt(rowAnnual).replace('₪', '') : '<span style="color:var(--dim)">—</span>') +
      '</td>';
    return (
      '<tr><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;">' +
      esc(label) +
      '</td>' +
      cells +
      annualCell +
      '</tr>'
    );
  };

  // Sort tashlumim by base name then installment number
  const installSort = (labels: string[]): string[] =>
    labels.slice().sort((a: string, b: string) => {
      const baseA = a.replace(/\s*[\(]?\d+\/\d+[\)]?$/, '').trim();
      const baseB = b.replace(/\s*[\(]?\d+\/\d+[\)]?$/, '').trim();
      if (baseA !== baseB) return baseA.localeCompare(baseB);
      const numA = parseInt((a.match(/(\d+)\/\d+/) || [, '0'])[1]) || 0;
      const numB = parseInt((b.match(/(\d+)\/\d+/) || [, '0'])[1]) || 0;
      return numA - numB;
    });

  let rows = '';
  SUBCAT_ORDER.forEach((sc) => {
    if (groups[sc] && groups[sc].length > 0) {
      const labels = sc === 'tashlumim' ? installSort(groups[sc]) : groups[sc];
      rows +=
        '<tr><td colspan="' +
        (existingMonths.length + 2) +
        '" style="padding:.3rem .5rem .1rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);background:var(--surface2);">' +
        SUBCAT_LABELS[sc as keyof typeof SUBCAT_LABELS] +
        '</td></tr>';
      rows += labels.map(renderRow).join('');
    }
  });
  if (noSubcat.length > 0) rows += noSubcat.map(renderRow).join('');

  // Totals row
  let grandAnnual = 0;
  const totalCells = existingMonths
    .map((m) => {
      const items = state.allRecurringItems[m.id] || [];
      const total = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
      grandAnnual += total;
      const isCur = m.month_num === today;
      const isPast = m.month_num < today;
      const txtColor = isPast ? 'var(--dim)' : isCur ? 'var(--accent)' : 'var(--text)';
      return (
        '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;font-weight:700;color:' +
        txtColor +
        ";font-family:'DM Mono',monospace;\">" +
        (total ? fmt(total).replace('₪', '') : '—') +
        '</td>'
      );
    })
    .join('');
  const grandAnnualCell =
    '<td style="text-align:right;padding:.3rem .5rem;font-size:.78rem;font-weight:700;' +
    "color:var(--accent);font-family:'DM Mono',monospace;border-left:2px solid var(--border);background:var(--surface);\" " +
    'title="Annual recurring total">' +
    (grandAnnual ? fmt(grandAnnual).replace('₪', '') : '—') +
    '</td>';
  rows +=
    '<tr style="border-top:2px solid var(--border);"><td style="padding:.3rem .5rem;font-size:.72rem;font-weight:700;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--muted);">TOTAL</td>' +
    totalCells +
    grandAnnualCell +
    '</tr>';

  const addLineBtn =
    '<div style="padding:.4rem .5rem;display:flex;gap:.75rem;align-items:center;">' +
    '<button onclick="event.stopPropagation();addBudgetItem(\'recurring\')" style="font-size:.72rem;font-weight:600;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;">+ add line</button>' +
    '<button onclick="event.stopPropagation();addTashlum()" style="font-size:.72rem;font-weight:600;color:var(--muted);background:none;border:none;cursor:pointer;padding:0;">+ add תשלום</button>' +
    '</div>';
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.8rem;">' +
    '<thead><tr style="border-bottom:2px solid var(--border);">' +
    headerCells +
    '</tr></thead>' +
    '<tbody>' +
    rows +
    '</tbody>' +
    '</table></div>' +
    addLineBtn
  );
}

function editRecurringCell(label: string, monthNum: number, currentVal: number): void {
  const month = state.months.find((m) => m.month_num === monthNum);
  if (!month) return;
  const MNAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  // RG3 — Inline edit. Replace native prompt() (jarring on a polished app) with
  // a real <input> overlaid on the cell. Enter saves; Esc cancels; blur saves.
  // For future months we still need to ask "apply to all future" — we do that
  // with a tiny inline confirm strip, NOT a native confirm dialog.
  const td = (window.event && window.event.currentTarget) as HTMLElement | null;
  if (!td || !td.tagName) {
    // Fallback (no event context — programmatic call): keep old behavior
    const raw = prompt(MNAMES[monthNum - 1] + ' — ' + label + '\nAmount:', String(currentVal || 0));
    if (raw === null || raw.trim() === '') return;
    const amount = raw.trim();
    const isFuture = monthNum >= todayMonthForYear();
    const forward =
      isFuture &&
      confirm('Apply ' + amount + ' to ' + MNAMES[monthNum - 1] + ' and all future months?');
    saveRecurringFromMonth(label, monthNum, amount, forward);
    return;
  }
  // Avoid double-edit if input already mounted in this cell
  if (td.querySelector('input.rg-edit')) return;
  const originalHtml = td.innerHTML;
  const originalOnclick = td.getAttribute('onclick');
  td.removeAttribute('onclick');
  td.style.cursor = 'text';
  td.innerHTML =
    '<input type="number" inputmode="decimal" step="0.01" min="0" class="rg-edit" ' +
    "style=\"width:100%;text-align:right;font-family:'DM Mono',monospace;font-size:.78rem;" +
    'padding:.18rem .25rem;border:1px solid var(--accent);border-radius:3px;background:var(--surface);outline:none;" ' +
    'value="' +
    String(currentVal || 0) +
    '">';
  const input = td.querySelector('input.rg-edit') as HTMLInputElement;
  input.focus();
  input.select();
  let committed = false;
  const restore = () => {
    td.innerHTML = originalHtml;
    if (originalOnclick) td.setAttribute('onclick', originalOnclick);
    td.style.cursor = 'pointer';
  };
  const commit = () => {
    if (committed) return;
    committed = true;
    const raw = input.value.trim();
    if (raw === '' || raw === String(currentVal || 0)) {
      restore();
      return;
    }
    const isFuture = monthNum >= todayMonthForYear();
    if (isFuture) {
      // Inline confirm strip in place of native confirm()
      td.innerHTML =
        '<div style="display:flex;gap:.2rem;align-items:center;justify-content:flex-end;font-size:.6rem;">' +
        '<button class="rg-fwd-y" style="padding:.1rem .35rem;font-size:.6rem;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:3px;cursor:pointer;" title="Apply ' +
        raw +
        ' to ' +
        MNAMES[monthNum - 1] +
        ' and every future month">→ all future</button>' +
        '<button class="rg-fwd-n" style="padding:.1rem .35rem;font-size:.6rem;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:3px;cursor:pointer;" title="Apply ' +
        raw +
        ' to ' +
        MNAMES[monthNum - 1] +
        ' only">just this month</button>' +
        '</div>';
      td.querySelector('.rg-fwd-y')!.addEventListener('click', () => {
        saveRecurringFromMonth(label, monthNum, raw, true);
      });
      td.querySelector('.rg-fwd-n')!.addEventListener('click', () => {
        saveRecurringFromMonth(label, monthNum, raw, false);
      });
    } else {
      saveRecurringFromMonth(label, monthNum, raw, false);
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      committed = true;
      restore();
    }
  });
  input.addEventListener('blur', () => {
    // Allow click on the inline confirm buttons before treating blur as commit
    setTimeout(() => {
      if (!committed) commit();
    }, 80);
  });
}

// ── Housing grid (mirrors recurring grid) ──────────────────────────────────

async function loadAllHousingItems() {
  const { data } = await sb
    .from('budget_items')
    .select('*')
    .eq('category', 'housing')
    .order('sort_order');
  state.allHousingItems = {};
  (data || []).forEach((item) => {
    if (!state.allHousingItems[item.month_id]) state.allHousingItems[item.month_id] = [];
    state.allHousingItems[item.month_id].push(item);
  });
}

async function toggleHousingGrid() {
  state.housingGridMode = !state.housingGridMode;
  localStorage.setItem('housingGridMode', state.housingGridMode as unknown as string);
  if (state.housingGridMode && Object.keys(state.allHousingItems).length === 0) {
    await loadAllHousingItems();
  }
  renderApp();
}

async function saveHousingFromMonth(
  label: string,
  fromMonthNum: number,
  newAmount: string | number,
  forward: boolean,
): Promise<void> {
  const num = parseFloat(String(newAmount)) || 0;
  const targetMonths = forward
    ? state.months.filter((m) => m.month_num >= fromMonthNum)
    : state.months.filter((m) => m.month_num === fromMonthNum);

  let subcategory = '';
  let sort_order = 999;
  for (const items of Object.values(state.allHousingItems)) {
    const ref = items.find((i) => i.label === label);
    if (ref) {
      subcategory = ref.subcategory || '';
      sort_order = ref.sort_order || 999;
      break;
    }
  }

  for (const month of targetMonths) {
    if (!state.allHousingItems[month.id]) state.allHousingItems[month.id] = [];
    const items = state.allHousingItems[month.id];
    const item = items.find((i) => i.label === label);
    if (item) {
      const { error } = await sb.from('budget_items').update({ amount: num }).eq('id', item.id);
      if (error) toast('Could not save recurring item');
      item.amount = num;
    } else {
      const { data: newItem } = await sb
        .from('budget_items')
        .insert({
          month_id: month.id,
          category: 'housing',
          label,
          amount: num,
          subcategory,
          sort_order,
        })
        .select()
        .single();
      if (newItem) items.push(newItem);
    }
  }
  const currentMonth = state.months.find((m) => m.id === state.currentMonthId);
  if (currentMonth && currentMonth.month_num >= fromMonthNum) {
    const cur = (state.budgetItems['housing'] || []).find((i) => i.label === label);
    if (cur) cur.amount = num;
  }
  renderApp();
  toast('Updated ✓');
}

function editHousingCell(label: string, monthNum: number, currentVal: number): void {
  const month = state.months.find((m) => m.month_num === monthNum);
  if (!month) return;
  const MNAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const raw = prompt(MNAMES[monthNum - 1] + ' — ' + label + '\nAmount:', String(currentVal || 0));
  if (raw === null || raw.trim() === '') return;
  const amount = raw.trim();
  const isFuture = monthNum >= todayMonthForYear();
  const forward =
    isFuture &&
    confirm('Apply ' + amount + ' to ' + MNAMES[monthNum - 1] + ' and all future months?');
  saveHousingFromMonth(label, monthNum, amount, forward);
}

function renderHousingGrid() {
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const SUBCAT_ORDER = ['rent', 'utilities', 'bills', 'household'];
  const SUBCAT_LABELS = {
    rent: 'Rent',
    utilities: 'Utilities',
    bills: 'Bills',
    household: 'Household',
  };
  const today = todayMonthForYear();

  const itemMap: Record<string, string> = {};
  Object.values(state.allHousingItems).forEach((items) => {
    items.forEach((i) => {
      if (!itemMap[i.label]) itemMap[i.label] = i.subcategory || '';
    });
  });

  const groups: Record<string, string[]> = {};
  const noSubcat: string[] = [];
  Object.entries(itemMap).forEach(([label, sc]) => {
    if (sc && SUBCAT_ORDER.includes(sc)) {
      if (!groups[sc]) groups[sc] = [];
      groups[sc].push(label);
    } else {
      noSubcat.push(label);
    }
  });

  const existingMonths = state.months.slice().sort((a, b) => a.month_num - b.month_num);
  const headerCells =
    '<th style="text-align:left;padding:.25rem .5rem;font-size:.7rem;position:sticky;left:0;background:var(--surface2);z-index:2;">Item</th>' +
    existingMonths
      .map(
        (m) =>
          '<th style="text-align:right;padding:.25rem .4rem;font-size:.7rem;min-width:52px;color:' +
          (m.month_num === today ? 'var(--accent)' : 'inherit') +
          '">' +
          MONTH_NAMES[m.month_num - 1] +
          '</th>',
      )
      .join('');

  const renderRow = (label: string): string => {
    const cells = existingMonths
      .map((m) => {
        const items = state.allHousingItems[m.id] || [];
        const item = items.find((i) => i.label === label);
        const val = item ? item.amount : null;
        const isPast = m.month_num < today;
        const isCur = m.month_num === today;
        const bgColor = isCur ? 'var(--asoft)' : 'transparent';
        const txtColor = isPast ? 'var(--dim)' : 'var(--text)';
        const cellContent =
          val != null
            ? Number(val).toLocaleString('en-IL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })
            : '<span style="color:var(--border)">—</span>';
        return (
          '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
          txtColor +
          ';background:' +
          bgColor +
          ";font-family:'DM Mono',monospace;cursor:pointer;\" onclick=\"editHousingCell('" +
          label.replace(/'/g, "\\'").replace(/"/g, '&quot;') +
          "'," +
          m.month_num +
          ',' +
          (val || 0) +
          ')" title="Click to edit">' +
          cellContent +
          '</td>'
        );
      })
      .join('');
    return (
      '<tr><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;">' +
      esc(label) +
      '</td>' +
      cells +
      '</tr>'
    );
  };

  let rows = '';
  SUBCAT_ORDER.forEach((sc) => {
    if (groups[sc] && groups[sc].length > 0) {
      rows +=
        '<tr><td colspan="' +
        (existingMonths.length + 1) +
        '" style="padding:.3rem .5rem .1rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);background:var(--surface2);">' +
        SUBCAT_LABELS[sc as keyof typeof SUBCAT_LABELS] +
        '</td></tr>';
      rows += groups[sc].map(renderRow).join('');
    }
  });
  if (noSubcat.length > 0) rows += noSubcat.map(renderRow).join('');

  const addLineBtn =
    '<div style="padding:.4rem .5rem;"><button onclick="event.stopPropagation();addBudgetItem(\'housing\')" style="font-size:.72rem;font-weight:600;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;">+ add line</button></div>';
  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.8rem;">' +
    '<thead><tr style="border-bottom:2px solid var(--border);">' +
    headerCells +
    '</tr></thead>' +
    '<tbody>' +
    rows +
    '</tbody>' +
    '</table></div>' +
    addLineBtn
  );
}

// ── Transport spending grid (read-only, actual transactions) ────────────────

// ── Generic spending grid (actual transactions by store × month) ─────────────
const SPENDING_GRID_CATS = ['transport', 'groceries', 'health'];

async function toggleSpendingGrid(catKey: string): Promise<void> {
  const on = state.spendingGridCats.includes(catKey);
  if (on) {
    state.spendingGridCats = state.spendingGridCats.filter((k) => k !== catKey);
    delete state.allCatTxData[catKey];
    delete state.allCatBudgets[catKey];
  } else {
    state.spendingGridCats.push(catKey);
    if (!state.allCatTxData[catKey]) {
      const [txRes, budgetRes] = await Promise.all([
        sb.from('transactions').select('store,amount,month_id').eq('category', catKey),
        sb.from('budgets').select('month_id,amount').eq('category', catKey),
      ]);
      state.allCatTxData[catKey] = (txRes.data || []) as unknown as TransactionRow[];
      state.allCatBudgets[catKey] = {};
      (budgetRes.data || []).forEach((b) => {
        state.allCatBudgets[catKey][b.month_id] = b.amount;
      });
    }
  }
  localStorage.setItem('spendingGridCats', JSON.stringify(state.spendingGridCats));
  renderApp();
}

function renderSpendingGrid(catKey: string): string {
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const today = todayMonthForYear();
  const existingMonths = state.months.slice().sort((a, b) => a.month_num - b.month_num);
  const txs = state.allCatTxData[catKey] || [];

  // Transport / Health: Budget vs Spent per month
  if (catKey === 'health') {
    const spentByMonth: Record<string, number> = {};
    txs.forEach((tx) => {
      spentByMonth[tx.month_id] = (spentByMonth[tx.month_id] || 0) + (Number(tx.amount) || 0);
    });
    const fmtV = (v: number): string =>
      v > 0
        ? '₪' +
          Number(v).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '—';
    const hdr =
      '<th style="text-align:left;padding:.25rem .5rem;font-size:.7rem;position:sticky;left:0;background:var(--surface2);z-index:2;"></th>' +
      existingMonths
        .map(
          (m) =>
            '<th style="text-align:right;padding:.25rem .4rem;font-size:.7rem;min-width:52px;color:' +
            (m.month_num === today ? 'var(--accent)' : 'inherit') +
            '">' +
            MONTH_NAMES[m.month_num - 1] +
            '</th>',
        )
        .join('');
    const budgetRow =
      '<tr><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--muted);font-weight:600;">Budget</td>' +
      existingMonths
        .map((m) => {
          const v = ((state.allCatBudgets['health'] as Record<string, number>) || {})[m.id] || 0;
          const isCur = m.month_num === today;
          return (
            '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
            (v > 0 ? 'var(--text)' : 'var(--border)') +
            ';background:' +
            (isCur ? 'var(--asoft)' : 'transparent') +
            ";font-family:'DM Mono',monospace;\">" +
            fmtV(v) +
            '</td>'
          );
        })
        .join('') +
      '</tr>';
    const spentRow =
      '<tr style="font-weight:600;"><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--accent);">Spent</td>' +
      existingMonths
        .map((m) => {
          const v = spentByMonth[m.id] || 0;
          const isCur = m.month_num === today;
          return (
            '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
            (v > 0 ? 'var(--accent)' : 'var(--border)') +
            ';background:' +
            (isCur ? 'var(--asoft)' : 'transparent') +
            ";font-family:'DM Mono',monospace;\">" +
            fmtV(v) +
            '</td>'
          );
        })
        .join('') +
      '</tr>';
    return (
      '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.8rem;"><thead><tr style="border-bottom:2px solid var(--border);">' +
      hdr +
      '</tr></thead><tbody>' +
      budgetRow +
      spentRow +
      '</tbody></table></div>'
    );
  }

  // Transport: just Budget vs Spent per month
  if (catKey === 'transport') {
    const spentByMonth: Record<string, number> = {};
    txs.forEach((tx) => {
      spentByMonth[tx.month_id] = (spentByMonth[tx.month_id] || 0) + (Number(tx.amount) || 0);
    });
    const fmtV = (v: number): string =>
      v > 0
        ? '₪' +
          Number(v).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
        : '—';
    const hdr =
      '<th style="text-align:left;padding:.25rem .5rem;font-size:.7rem;position:sticky;left:0;background:var(--surface2);z-index:2;"></th>' +
      existingMonths
        .map(
          (m) =>
            '<th style="text-align:right;padding:.25rem .4rem;font-size:.7rem;min-width:52px;color:' +
            (m.month_num === today ? 'var(--accent)' : 'inherit') +
            '">' +
            MONTH_NAMES[m.month_num - 1] +
            '</th>',
        )
        .join('');
    const budgetRow =
      '<tr><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--muted);font-weight:600;">Budget</td>' +
      existingMonths
        .map((m) => {
          const v =
            ((state.allCatBudgets['transport'] as Record<string, number>) || {})[m.id] ||
            state.budgets['transport'] ||
            0;
          const isCur = m.month_num === today;
          return (
            '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
            (v > 0 ? 'var(--text)' : 'var(--border)') +
            ';background:' +
            (isCur ? 'var(--asoft)' : 'transparent') +
            ";font-family:'DM Mono',monospace;\">" +
            fmtV(v) +
            '</td>'
          );
        })
        .join('') +
      '</tr>';
    const spentRow =
      '<tr style="font-weight:600;"><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--accent);">Spent</td>' +
      existingMonths
        .map((m) => {
          const v = spentByMonth[m.id] || 0;
          const isCur = m.month_num === today;
          return (
            '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
            (v > 0 ? 'var(--accent)' : 'var(--border)') +
            ';background:' +
            (isCur ? 'var(--asoft)' : 'transparent') +
            ";font-family:'DM Mono',monospace;\">" +
            fmtV(v) +
            '</td>'
          );
        })
        .join('') +
      '</tr>';
    return (
      '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.8rem;"><thead><tr style="border-bottom:2px solid var(--border);">' +
      hdr +
      '</tr></thead><tbody>' +
      budgetRow +
      spentRow +
      '</tbody></table></div>'
    );
  }

  // Groceries: Supermarket vs Makolet totals per month
  const storeMonthTotals: Record<string, Record<string, number>> = {};
  txs.forEach((tx) => {
    const store = isBigStore(tx.store || '') ? 'Supermarket' : 'Makolet';
    if (!storeMonthTotals[store]) storeMonthTotals[store] = {};
    storeMonthTotals[store][tx.month_id] =
      (storeMonthTotals[store][tx.month_id] || 0) + (Number(tx.amount) || 0);
  });

  const monthTotals: Record<string, number> = {};
  existingMonths.forEach((m) => {
    monthTotals[m.id] = Object.values(storeMonthTotals).reduce(
      (sum: number, s: Record<string, number>) => sum + (s[m.id] || 0),
      0,
    );
  });

  const stores = ['Supermarket', 'Makolet'].filter((s: string) => storeMonthTotals[s]);
  if (stores.length === 0)
    return '<div style="color:var(--muted);font-size:.8rem;padding:.5rem;">No transactions yet.</div>';

  const headerCells =
    '<th style="text-align:left;padding:.25rem .5rem;font-size:.7rem;position:sticky;left:0;background:var(--surface2);z-index:2;"></th>' +
    existingMonths
      .map(
        (m) =>
          '<th style="text-align:right;padding:.25rem .4rem;font-size:.7rem;min-width:52px;color:' +
          (m.month_num === today ? 'var(--accent)' : 'inherit') +
          '">' +
          MONTH_NAMES[m.month_num - 1] +
          '</th>',
      )
      .join('');

  const renderRow = (store: string): string => {
    const cells = existingMonths
      .map((m) => {
        const val = storeMonthTotals[store][m.id] || 0;
        const isCur = m.month_num === today;
        const txtColor =
          val === 0 ? 'var(--border)' : m.month_num < today ? 'var(--dim)' : 'var(--text)';
        const content =
          val > 0
            ? '₪' +
              Number(val).toLocaleString('en-IL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })
            : '—';
        return (
          '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
          txtColor +
          ';background:' +
          (isCur ? 'var(--asoft)' : 'transparent') +
          ";font-family:'DM Mono',monospace;\">" +
          content +
          '</td>'
        );
      })
      .join('');
    return (
      '<tr><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;">' +
      store +
      '</td>' +
      cells +
      '</tr>'
    );
  };

  const totalRow =
    '<tr style="border-top:2px solid var(--border);font-weight:700;">' +
    '<td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--accent);">Total</td>' +
    existingMonths
      .map((m) => {
        const v = monthTotals[m.id] || 0;
        const isCur = m.month_num === today;
        return (
          '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
          (v > 0 ? 'var(--accent)' : 'var(--border)') +
          ';background:' +
          (isCur ? 'var(--asoft)' : 'transparent') +
          ";font-family:'DM Mono',monospace;\">" +
          (v > 0
            ? '₪' +
              Number(v).toLocaleString('en-IL', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })
            : '—') +
          '</td>'
        );
      })
      .join('') +
    '</tr>';

  const fmtV2 = (v: number): string =>
    v > 0
      ? '₪' +
        Number(v).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : '—';
  const budgetRow =
    '<tr style="border-bottom:1px solid var(--border);"><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--muted);font-weight:600;">Budget</td>' +
    existingMonths
      .map((m) => {
        const v = (state.allCatBudgets['groceries'] || {})[m.id] || 0;
        const isCur = m.month_num === today;
        return (
          '<td style="text-align:right;padding:.25rem .4rem;font-size:.75rem;color:' +
          (v > 0 ? 'var(--text)' : 'var(--border)') +
          ';background:' +
          (isCur ? 'var(--asoft)' : 'transparent') +
          ";font-family:'DM Mono',monospace;\">" +
          fmtV2(v) +
          '</td>'
        );
      })
      .join('') +
    '</tr>';

  return (
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.8rem;">' +
    '<thead><tr style="border-bottom:2px solid var(--border);">' +
    headerCells +
    '</tr></thead>' +
    '<tbody>' +
    budgetRow +
    stores.map(renderRow).join('') +
    totalRow +
    '</tbody>' +
    '</table></div>'
  );
}

function budgetItemsTotal(catKey: string): number | null {
  const items = state.budgetItems[catKey];
  if (!items || items.length === 0) return null; // null = use manual budget
  return ag(items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0));
}

function catBudget(catKey: string): number {
  const fromItems = budgetItemsTotal(catKey);
  return fromItems !== null ? fromItems : state.budgets[catKey] || 0;
}

async function addTashlum() {
  const name = prompt('שם התשלום (e.g. Mattress):');
  if (!name?.trim()) return;
  const amount = parseFloat(prompt('סכום לחודש (₪):') as string);
  if (!amount) return;
  const total = parseInt(prompt('כמה תשלומים?') as string);
  if (!total || total < 1) return;
  const startMonth = parseInt(prompt('חודש התחלה (1=Jan, 3=Mar, ...):') as string);
  if (!startMonth || startMonth < 1 || startMonth > 12) return;
  const MNAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const targetMonths = state.months
    .filter((m) => m.month_num >= startMonth)
    .sort((a, b) => a.month_num - b.month_num)
    .slice(0, total);
  const endIdx = startMonth - 1 + total - 1;
  const endLabel = endIdx < 12 ? MNAMES[endIdx] : MNAMES[11] + '+';
  if (
    !confirm(
      `Create ${total} payments of ₪${amount} for "${name.trim()}", from ${MNAMES[startMonth - 1]} → ends ${endLabel}. OK?`,
    )
  )
    return;
  for (let i = 0; i < targetMonths.length; i++) {
    const month = targetMonths[i];
    const label = `${name.trim()} ${i + 1}/${total}`;
    const { data } = await sb
      .from('budget_items')
      .insert({
        month_id: month.id,
        category: 'recurring',
        label,
        amount,
        subcategory: 'tashlumim',
        sort_order: 999,
      })
      .select()
      .single();
    if (data) {
      if (!state.allRecurringItems[month.id]) state.allRecurringItems[month.id] = [];
      state.allRecurringItems[month.id].push(data);
      if (month.id === state.currentMonthId) {
        if (!state.budgetItems['recurring']) state.budgetItems['recurring'] = [];
        state.budgetItems['recurring'].push(data);
      }
    }
  }
  renderApp();
  toast('תשלומים נוספו ✓');
}

async function addBudgetItem(catKey: string): Promise<void> {
  const labelInput = prompt('Item name:');
  if (!labelInput?.trim()) return;
  const label = labelInput.trim();
  const sortOrder = (state.budgetItems[catKey] || []).length;
  // Add to this month
  const { data } = await sb
    .from('budget_items')
    .insert({
      month_id: state.currentMonthId,
      category: catKey,
      label,
      amount: 0,
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (!state.budgetItems[catKey]) state.budgetItems[catKey] = [];
  state.budgetItems[catKey].push(data);
  logChange(
    'add',
    'budget_item',
    (data as Record<string, unknown> | null)?.['id'] as string | undefined,
    `Added budget item: ${label} • ${catKey}`,
    null,
    data,
  );
  // Also add to allRecurringItems / allHousingItems so grid propagation works immediately
  if (catKey === 'recurring') {
    if (!state.allRecurringItems[state.currentMonthId!])
      state.allRecurringItems[state.currentMonthId!] = [];
    state.allRecurringItems[state.currentMonthId!].push(data);
  } else if (catKey === 'housing') {
    if (!state.allHousingItems[state.currentMonthId!])
      state.allHousingItems[state.currentMonthId!] = [];
    state.allHousingItems[state.currentMonthId!].push(data);
  }
  // Also save to template
  await sb
    .from('budget_item_templates')
    .insert({ category: catKey, label: 'New item', amount: 0, sort_order: sortOrder });
  renderApp();
}

async function saveBudgetItem(id: string, field: string, value: unknown): Promise<void> {
  const catKey = Object.keys(state.budgetItems).find((k) =>
    state.budgetItems[k].find((i) => i.id === id),
  );
  const item = (state.budgetItems[catKey!] || []).find((i) => i.id === id);
  if (!item) return;
  const numericFields = ['amount'];
  const val = numericFields.includes(field) ? parseFloat(value as string) || 0 : (value as string);
  const oldItemVal = item[field];
  await sb
    .from('budget_items')
    .update({ [field]: val })
    .eq('id', id);
  logChange(
    'edit',
    'budget_item',
    id,
    `Edited ${item.label} ${field}: ${oldItemVal} → ${val} • ${catKey}`,
    { [field]: oldItemVal },
    { [field]: val },
  );
  item[field] = val;
  // Subcategory: propagate to all months with same label+category
  if (field === 'subcategory') {
    await sb
      .from('budget_items')
      .update({ subcategory: val })
      .eq('category', catKey)
      .eq('label', item.label);
    // Update allRecurringItems and allHousingItems in state
    const allItems =
      catKey === 'recurring'
        ? state.allRecurringItems
        : catKey === 'housing'
          ? state.allHousingItems
          : null;
    if (allItems)
      Object.values(allItems).forEach((arr) =>
        arr.forEach((i) => {
          if (i.label === item.label) i.subcategory = val as string;
        }),
      );
  }
  // Sync label changes to template
  if (field === 'label') {
    await sb
      .from('budget_item_templates')
      .update({ label: val })
      .eq('category', catKey)
      .eq('label', item.label)
      .eq('sort_order', item.sort_order);
  }
  renderApp();
}

async function deleteBudgetItem(id: string): Promise<void> {
  const catKey = Object.keys(state.budgetItems).find((k) =>
    state.budgetItems[k].find((i) => i.id === id),
  );
  const item = (state.budgetItems[catKey!] || []).find((i: BudgetItemRow) => i.id === id);
  await sb.from('budget_items').delete().eq('id', id);
  if (item) {
    logChange(
      'delete',
      'budget_item',
      id,
      `Deleted budget item: ${item.label} ₪${item.amount} • ${catKey}`,
      item,
      null,
    );
  }
  if (item)
    await sb
      .from('budget_item_templates')
      .delete()
      .eq('category', catKey)
      .eq('sort_order', item.sort_order);
  for (const k of Object.keys(state.budgetItems)) {
    state.budgetItems[k] = state.budgetItems[k].filter((i) => i.id !== id);
  }
  renderApp();
}

async function setItemAsDefault(id: string): Promise<void> {
  const catKey = Object.keys(state.budgetItems).find((k) =>
    state.budgetItems[k].find((i) => i.id === id),
  );
  const item = (state.budgetItems[catKey!] || []).find((i: BudgetItemRow) => i.id === id);
  if (!item) return;
  // Update template row matching this category + sort_order with the current amount + label
  await sb
    .from('budget_item_templates')
    .update({ amount: item.amount, label: item.label })
    .eq('category', catKey)
    .eq('sort_order', item.sort_order);
  // Visual feedback — briefly mark as default
  item.is_default = true;
  renderApp();
  setTimeout(() => {
    item.is_default = false;
    renderApp();
  }, 1500);
}

// When loading a month that has no budget items for a hasLines category,
// copy from template if template exists
async function seedBudgetItemsFromTemplate(monthId: string): Promise<void> {
  const linesCats = CATEGORIES.filter((c) => c.hasLines).map((c) => c.key);
  for (const catKey of linesCats) {
    if (state.budgetItems[catKey] && state.budgetItems[catKey].length > 0) continue;
    const { data: tmpl } = await sb
      .from('budget_item_templates')
      .select('*')
      .eq('category', catKey)
      .order('sort_order');
    if (!tmpl || tmpl.length === 0) continue;
    const inserts = tmpl.map((t) => ({
      month_id: monthId,
      category: catKey,
      label: t.label,
      amount: t.amount,
      sort_order: t.sort_order,
    }));
    const { data: newItems } = await sb.from('budget_items').insert(inserts).select();
    state.budgetItems[catKey] = newItems || [];
  }
}

// ── Multi-year ────────────────────────────────────────────────────────
async function loadAvailableYears() {
  const { data } = await sb.from('months').select('year');
  const years = [...new Set((data || []).map((r) => r.year))];
  if (!years.includes(state.currentYear)) years.push(state.currentYear);
  state.availableYears = years.sort((a, b) => a - b);
}

async function onYearSelect(val: string): Promise<void> {
  if (val === '__add__') {
    const input = prompt('Create a new (empty) budget year. Enter the year:');
    const year = parseInt(input || '', 10);
    if (!year || year < 2000 || year > 2100) {
      renderApp(); // reset the dropdown back to the current year
      return;
    }
    if (!state.availableYears.includes(year)) await seedYear(year);
    await switchYear(year);
    return;
  }
  await switchYear(parseInt(val, 10));
}

async function switchYear(year: number): Promise<void> {
  if (year === state.currentYear) return;
  state.currentYear = year;
  localStorage.setItem('activeYear', String(year));
  localStorage.removeItem('activeMonthId'); // belonged to the prior year
  state.currentMonthId = null;
  state.loading = true;
  renderApp();
  await loadFresh();
  renderApp();
}

// Create a brand-new EMPTY year: 12 zeroed month rows + zeroed housing/recurring
// line items seeded from templates (structure present, all amounts 0).
async function seedYear(year: number): Promise<void> {
  const monthRows = MONTHS.map((name, i) => ({
    month_name: name,
    month_num: i + 1,
    year,
    income_petachya: 0,
    income_clalit: 0,
    income_private: 0,
    income_other: 0,
    savings_bank: 0,
    savings_invested: 0,
    charity_pct: null,
  }));
  const { data: newMonths, error } = await sb.from('months').insert(monthRows).select();
  if (error || !newMonths) {
    toast('Could not create year ' + year);
    return;
  }
  const lineCats = CATEGORIES.filter((c) => c.hasLines).map((c) => c.key);
  for (const catKey of lineCats) {
    const { data: tmpl } = await sb
      .from('budget_item_templates')
      .select('*')
      .eq('category', catKey)
      .order('sort_order');
    if (!tmpl || tmpl.length === 0) continue;
    const inserts = [];
    for (const m of newMonths) {
      for (const t of tmpl) {
        inserts.push({
          month_id: m.id,
          category: catKey,
          label: t.label,
          amount: 0,
          sort_order: t.sort_order,
        });
      }
    }
    if (inserts.length) await sb.from('budget_items').insert(inserts);
  }
  if (!state.availableYears.includes(year)) {
    state.availableYears.push(year);
    state.availableYears.sort((a, b) => a - b);
  }
  toast('Created ' + year + ' (empty)');
}

async function switchMonth(monthId: string): Promise<void> {
  state.currentMonthId = monthId;
  localStorage.setItem('activeMonthId', monthId);
  state.loading = true;
  renderApp();
  const loads = [
    loadTransactions(monthId),
    loadBudgets(monthId),
    loadIncomeItems(monthId),
    loadBudgetItems(monthId).then(() => seedBudgetItemsFromTemplate(monthId)),
  ];
  // Load year-level data in background, re-render when done
  Promise.all([loadAdminData(), loadTravelData(), loadCharityData(), loadCashData()]).then(() =>
    renderApp(),
  );
  if (state.activeTab === 'biz') loads.push(loadBizData());
  try {
    await Promise.all(loads);
  } finally {
    state.loading = false;
    saveCache();
    renderApp();
  }
}

// ── Spent per category ────────────────────────────────────────────────
function spentByCategory(): Record<string, number> {
  const totals: Record<string, number> = {};
  CATEGORIES.forEach((c) => (totals[c.key] = 0));
  state.transactions.forEach((tx) => {
    if (totals[tx.category] !== undefined) totals[tx.category] += Number(tx.amount);
  });
  // For hasLines categories (fixed committed expenses like housing/recurring bills),
  // treat the budget items total as minimum committed spend
  CATEGORIES.filter((c) => c.hasLines).forEach((c) => {
    const committed = budgetItemsTotal(c.key) || 0;
    if (totals[c.key] < committed) totals[c.key] = committed;
  });
  // Sync tab-specific payments (admin, travel, charity) into the main budget
  const currentMonth = state.months.find((m) => m.id === state.currentMonthId);
  if (currentMonth) {
    const mn = currentMonth.month_num;
    totals['travel'] += (state.travel.payments || [])
      .filter((p) => p.month_num === mn)
      .reduce((s, p) => s + Number(p.amount), 0);
    totals['admin'] += (state.admin.subItems || [])
      .filter((s) => s.is_paid && s.month_num === mn)
      .reduce((s, x) => s + Number(x.amount), 0);
    totals['charity'] += (state.charity.payments || [])
      .filter((p) => p.month_num === mn)
      .reduce((s, p) => s + Number(p.amount), 0);
  }
  // Snap each category total to agorot at this boundary (kills float drift
  // from the running += accumulation above) before display/comparison.
  Object.keys(totals).forEach((k) => {
    totals[k] = ag(totals[k]);
  });
  return totals;
}

async function loadIncomeItems(monthId: string): Promise<void> {
  const { data, error } = await sb
    .from('income_items')
    .select('*')
    .eq('month_id', monthId)
    .order('created_at');
  if (error) toast('Could not load income items');
  state.incomeItems = data || [];
}

// Est/Act state stored in localStorage per month
function getIncomeEst(monthId: string | null): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('incomeEst_' + (monthId || '')) || '{}') || {};
  } catch {
    return {};
  }
}
function setIncomeEst(monthId: string | null, obj: Record<string, boolean>): void {
  localStorage.setItem('incomeEst_' + monthId, JSON.stringify(obj));
}
function toggleIncomeEst(source: string, itemId: string | null): void {
  const mid = state.currentMonthId;
  const est: Record<string, boolean> = getIncomeEst(mid);
  const key = itemId || source;
  est[key] = !est[key];
  setIncomeEst(mid, est as Record<string, boolean>);
  renderApp();
}
function isAnyEstimated(monthId: string | null): boolean {
  const est = getIncomeEst(monthId);
  return Object.values(est).some(Boolean);
}

function totalIncome(month: MonthRow): number {
  const extras = state.incomeItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  return ag(
    (Number(month.income_petachya) || 0) +
      (Number(month.income_clalit) || 0) +
      (Number(month.income_private) || 0) +
      extras,
  );
}

// ── Add transaction ───────────────────────────────────────────────────
async function addTransaction(): Promise<void> {
  const cat = byId('tx-cat').value;
  const store = byId('tx-store').value.trim();
  const item = byId('tx-item').value.trim();
  const amount = parseFloat(byId('tx-amount').value);
  const date = byId('tx-date').value;

  if (!cat || !amount || isNaN(amount)) {
    toast('Fill in category and amount');
    return;
  }

  const btn = byId('tx-btn');
  btn.disabled = true;

  const { data: txData, error } = await sb
    .from('transactions')
    .insert({
      month_id: state.currentMonthId,
      category: cat,
      store: store || null,
      item: item || null,
      amount,
      date: date || null,
    })
    .select()
    .single();

  if (error) {
    toast('Error saving — try again');
    btn.disabled = false;
    return;
  }
  logChange(
    'add',
    'transaction',
    txData.id,
    `Added ${store || item || cat} ₪${amount} • ${cat}`,
    null,
    txData,
    state.currentMonthId!,
  );
  pushUndo({
    label: 'add transaction',
    undo: async () => {
      await sb.from('transactions').delete().eq('id', txData.id);
      await loadTransactions(state.currentMonthId!);
    },
    redo: async () => {
      await sb.from('transactions').insert(txData);
      await loadTransactions(state.currentMonthId!);
    },
  });

  // Clear form
  byId('tx-store').value = '';
  byId('tx-item').value = '';
  byId('tx-amount').value = '';
  byId('tx-date').value = today();
  btn.disabled = false;

  await loadTransactions(state.currentMonthId!);
  renderApp();
  toast('Transaction saved ✓');
}

async function addTransactionSidebar() {
  const cat = byId('sb-cat').value;
  const store = byId('sb-store').value.trim();
  const item = byId('sb-item').value.trim();
  const amount = parseFloat(byId('sb-amount').value);
  const date = byId('sb-date').value;

  if (!cat || !amount || isNaN(amount)) {
    toast('Fill in category and amount');
    return;
  }

  const btn = byId('sb-btn');
  btn.disabled = true;
  btn.textContent = '…';

  const { data: txData, error } = await sb
    .from('transactions')
    .insert({
      month_id: state.currentMonthId,
      category: cat,
      store: store || null,
      item: item || null,
      amount,
      date: date || null,
    })
    .select()
    .single();

  if (error) {
    toast('Error saving — try again');
    btn.disabled = false;
    btn.textContent = 'Save →';
    return;
  }
  logChange(
    'add',
    'transaction',
    txData.id,
    `Added ${store || item || cat} ₪${amount} • ${cat}`,
    null,
    txData,
    state.currentMonthId!,
  );
  pushUndo({
    label: 'add transaction',
    undo: async () => {
      await sb.from('transactions').delete().eq('id', txData.id);
      await loadTransactions(state.currentMonthId!);
    },
    redo: async () => {
      await sb.from('transactions').insert(txData);
      await loadTransactions(state.currentMonthId!);
    },
  });

  byId('sb-store').value = '';
  byId('sb-item').value = '';
  byId('sb-amount').value = '';
  byId('sb-date').value = '';
  btn.disabled = false;
  btn.textContent = 'Save →';

  await loadTransactions(state.currentMonthId!);
  renderApp();
  toast('Transaction saved ✓');
}

async function deleteTransaction(id: string): Promise<void> {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const snap = { ...tx };
  await sb.from('transactions').delete().eq('id', id);
  logChange(
    'delete',
    'transaction',
    id,
    `Deleted ${snap.store || snap.item || snap.category} ₪${snap.amount} • ${snap.category}`,
    snap,
    null,
    snap.month_id,
  );
  state.transactions = state.transactions.filter((t) => t.id !== id);
  pushUndo({
    label: 'delete transaction',
    undo: async () => {
      await sb.from('transactions').insert(snap);
      await loadTransactions(state.currentMonthId!);
    },
    redo: async () => {
      await sb.from('transactions').delete().eq('id', snap.id);
      await loadTransactions(state.currentMonthId!);
    },
  });
  renderApp();
  toastDeleted(snap.store || snap.item || snap.category, snap.amount);
}

async function updateTx(id: string, field: string, value: unknown): Promise<void> {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const oldVal = tx[field];
  const val =
    field === 'amount' ? parseFloat(String(value)) || 0 : (value as string).trim() || null;
  await sb
    .from('transactions')
    .update({ [field]: val })
    .eq('id', id);
  logChange(
    'edit',
    'transaction',
    id,
    `Edited transaction ${field}: ${oldVal} → ${val} • ${tx.store || tx.category}`,
    { [field]: oldVal },
    { [field]: val },
    tx.month_id,
  );
  tx[field] = val;
  pushUndo({
    label: 'edit ' + field,
    undo: async () => {
      await sb
        .from('transactions')
        .update({ [field]: oldVal })
        .eq('id', id);
      const t = state.transactions.find((t) => t.id === id);
      if (t) t[field] = oldVal;
    },
    redo: async () => {
      await sb
        .from('transactions')
        .update({ [field]: val })
        .eq('id', id);
      const t = state.transactions.find((t) => t.id === id);
      if (t) t[field] = val;
    },
  });
  renderApp();
}

function setTxSort(sort: string): void {
  state.txSort = sort;
  localStorage.setItem('txSort', sort);
  // Sync open cats from DOM before re-render so sort doesn't close categories
  document.querySelectorAll('.cat-row.open').forEach((el) => {
    const key = el.id.replace('cat-', '');
    if (key) state.openCats.add(key);
  });
  renderApp();
}

// ── Setup: create month ───────────────────────────────────────────────
async function createMonth(num: number): Promise<void> {
  const { data, error } = await sb
    .from('months')
    .insert({
      month_name: MONTHS[num - 1],
      month_num: num,
      year: state.currentYear,
    })
    .select()
    .single();
  if (error) {
    toast('Error creating month');
    return;
  }
  state.months.push(data);
  state.months.sort((a, b) => a.month_num - b.month_num);
  await switchMonth(data.id);
}

// ── Render ────────────────────────────────────────────────────────────
function renderApp() {
  const root = byId('root');
  document.title = `Budget ${state.currentYear}`;
  requestAnimationFrame(applyRibbonHeight);
  requestAnimationFrame(updateUndoButtons);

  if (state.months.length === 0) {
    root.innerHTML = `
      <div class="main">
        <div class="setup">
          <h2>Welcome to Budget ${state.currentYear} 👋</h2>
          <p>Which month do you want to start with?</p>
          <div class="setup-form">
            <div class="fg">
              <label>Month</label>
              <select id="setup-month">
                ${MONTHS.map((m, i) => `<option value="${i + 1}" ${i === 1 ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-primary" onclick="createMonth(parseInt(document.getElementById('setup-month').value))">
              Start this month →
            </button>
          </div>
        </div>
      </div>`;
    return;
  }

  const current =
    state.months.find((m) => m.id === state.currentMonthId) ||
    state.months[state.months.length - 1];
  if (!state.currentMonthId) state.currentMonthId = current.id;

  // Biz net for current month — Income modal displays this read-only.
  // Single source of truth for income_private = biz_months net (set by saveBizField).
  // Fallback: if state.allBiz hasn't been loaded yet (Biz tab never visited this
  // session), use months.income_private directly. Past months already have a
  // correct income_private cascaded from saveBizField, so this avoids showing
  // ₪0 on first page load before Biz data loads.
  const _bizCur = (state.allBiz || []).find((b) => b.month_id === current.id);
  const bizNetCurrent = _bizCur
    ? (Number(_bizCur.confirmed_amount) || 0) -
      (Number(_bizCur.accountant_fee) || 0) -
      (Number(_bizCur.spending) || 0)
    : Number(current.income_private) || 0;

  const income = totalIncome(current);
  // Sync charity % from localStorage into state.budgets AND Supabase (quietly, no undo/log)
  const _chPct = parseFloat(
    localStorage.getItem('charityPct_' + (state.currentMonthId || '')) || '0',
  );
  if (_chPct && income) {
    const _chCalc = Math.round((income * _chPct) / 100);
    state.budgets['charity'] = _chCalc;
    // Quietly sync to DB if out of date (no renderApp, no undo, no log)
    if (!state._lastCharitySync || state._lastCharitySync[state.currentMonthId] !== _chCalc) {
      if (!state._lastCharitySync) state._lastCharitySync = {};
      state._lastCharitySync[state.currentMonthId] = _chCalc;
      sb.from('budgets')
        .select('id')
        .eq('month_id', state.currentMonthId!)
        .eq('category', 'charity')
        .single()
        .then(({ data }) => {
          if (data)
            return sb
              .from('budgets')
              .update({ amount: _chCalc })
              .eq('id', data.id)
              .then(() => {});
          else
            return sb
              .from('budgets')
              .insert({ month_id: state.currentMonthId, category: 'charity', amount: _chCalc })
              .then(() => {});
        });
    }
  }
  const spent = spentByCategory();
  // For hasTab categories, use allocation (budget) not actual payments in top-line totals
  const totalSpent = ag(
    CATEGORIES.reduce((sum, c) => sum + (c.hasTab ? catBudget(c.key) || 0 : spent[c.key] || 0), 0) +
      (state.budgets['savings_bank'] || 0) +
      (state.budgets['savings_invested'] || 0),
  );
  const remaining = ag(income - totalSpent);
  void remaining;
  const totalBudgeted = ag(
    CATEGORIES.reduce((sum, c) => sum + catBudget(c.key), 0) +
      (state.budgets['savings_bank'] || 0) +
      (state.budgets['savings_invested'] || 0),
  );

  root.innerHTML = `
    <div class="hdr">
      <div class="hdr-title">
        <h1>Budget</h1>
        <select class="year-select" onchange="onYearSelect(this.value)" aria-label="Year" title="Year">
          ${(state.availableYears.length ? state.availableYears : [state.currentYear])
            .map(
              (y) =>
                `<option value="${y}" ${y === state.currentYear ? 'selected' : ''}>${y}</option>`,
            )
            .join('')}
          <option value="__add__">+ Add year</option>
        </select>
      </div>
      <div class="hdr-tabs">
        <div class="page-tabs">
          <button class="ptab ${state.activeTab === 'budget' ? 'active' : ''}" onclick="switchTab('budget')">Budget</button>
          <button class="ptab ${state.activeTab === 'biz' ? 'active' : ''}" onclick="switchTab('biz')">Biz 💼</button>
          <button class="ptab ${state.activeTab === 'admin' ? 'active' : ''}" onclick="switchTab('admin')">Admin 📋</button>
          <button class="ptab ${state.activeTab === 'travel' ? 'active' : ''}" onclick="switchTab('travel')">Travel ✈️</button>
          <button class="ptab ${state.activeTab === 'charity' ? 'active' : ''}" onclick="switchTab('charity')">Charity 💚</button>
          <button class="ptab ${state.activeTab === 'cash' ? 'active' : ''}" onclick="switchTab('cash')">Cash 💰</button>
          <button class="ptab ${state.activeTab === 'year' ? 'active' : ''}" onclick="switchTab('year')">Year 📊</button>
        </div>
      </div>
      <div class="hdr-actions">
        <span id="offline-queue-indicator" class="offline-queue-indicator" style="display:none;" title="Pending writes — will sync when online" onclick="syncQueueNow()">
          <span class="oqi-dot"></span><span id="offline-queue-count">0</span> pending
        </span>
        <button id="undo-btn" class="mtab toolbar-icon" onclick="doUndo()" disabled title="Undo (Ctrl+Z)" aria-label="Undo">${ICON_UNDO}</button>
        <button id="redo-btn" class="mtab toolbar-icon" onclick="doRedo()" disabled title="Redo (Ctrl+Y)" aria-label="Redo">${ICON_REDO}</button>
        <button class="mtab toolbar-icon" onclick="openSnapshot()" title="Snapshot" aria-label="Snapshot">${ICON_SNAPSHOT}</button>
        <button class="mtab toolbar-icon" onclick="collapseAll()" title="Collapse all" aria-label="Collapse all">${ICON_COLLAPSE}</button>
        <button class="mtab toolbar-icon" onclick="openHistoryPanel()" title="History log" aria-label="History">${ICON_HISTORY}</button>
        <button class="mtab toolbar-icon" onclick="openSearchPanel()" title="Search transactions" aria-label="Search">${ICON_SEARCH}</button>
        <button class="mtab toolbar-overflow-btn" onclick="openToolbarOverflow(event)" aria-label="More tools" title="More tools">⋯</button>
      </div>
      <div class="hdr-months">
        <button class="mtab month-nav-chev" onclick="navMonth(-1)" aria-label="Previous month" title="Previous month">‹</button>
        <div class="month-tabs">
          ${state.months
            .map(
              (m) => `
            <button class="mtab ${m.id === state.currentMonthId ? 'active' : ''}" onclick="switchMonth('${m.id}')" data-month-id="${m.id}">
              ${((m as unknown as { month_name?: string }).month_name || '').slice(0, 3)}
            </button>`,
            )
            .join('')}
        </div>
        <button class="mtab month-nav-chev" onclick="navMonth(1)" aria-label="Next month" title="Next month">›</button>
      </div>
    </div>

    ${(() => {
      if (state.activeTab !== 'budget' || state.loading) return '';
      const ribbonHidden = localStorage.getItem('ribbonHidden') === 'true';
      const ribbonExpanded = localStorage.getItem('ribbonExpanded') === 'true';
      const leftToBudget = ag(income - totalBudgeted);
      const remainingInBudget = ag(totalBudgeted - totalSpent);
      void leftToBudget;
      void remainingInBudget;
      const n = (v: number | null | undefined): string =>
        v == null
          ? ''
          : Number(v).toLocaleString('en-IL', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            });

      if (ribbonHidden)
        return `<div style="position:sticky;top:57px;z-index:90;text-align:right;padding:.25rem 1.5rem;background:var(--surface);border-bottom:1px solid var(--border);"><button class="ribbon-toggle" onclick="toggleRibbon()">▼ show summary</button></div>`;

      // Snapshot table rows for expanded view
      const groupRows = CATEGORY_GROUPS.map((group) => {
        const cats = group.keys
          .map((k) => CATEGORIES.find((c) => c.key === k))
          .filter((x): x is (typeof CATEGORIES)[0] => Boolean(x));
        const gs = ag(
          cats.reduce((sum, c) => sum + (c.hasTab ? catBudget(c.key) || 0 : spent[c.key] || 0), 0),
        );
        const gb = ag(cats.reduce((sum, c) => sum + catBudget(c.key), 0));
        const gr = ag(gb - gs);
        const gid = 'rsngrp-' + group.label.replace(/[^a-zA-Z0-9]/g, '-');
        const catRows = cats
          .map((c) => {
            const b = catBudget(c.key) || 0;
            const s = c.hasTab ? b : spent[c.key] || 0;
            const r = b - s;
            // DC5 — gap triangles dropped from ribbon Summary too (same
            // reason as Snapshot modal). Owed-elsewhere strip carries
            // the gap signal at a higher hierarchy level.
            return `<tr class="sn-cat ${gid} collapsed"><td style="padding-left:1.5rem">${c.emoji} ${c.label}</td><td>${b ? n(b) : ''}</td><td>${b ? n(s) : ''}</td><td class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td></tr>`;
          })
          .join('');
        if (cats.length === 1) {
          const c = cats[0]!;
          const b = catBudget(c.key) || 0;
          const s = c.hasTab ? b : spent[c.key] || 0;
          const r = b - s;
          return `<tr class="sn-cat"><td>${c.emoji} ${c.label}</td><td>${b ? n(b) : ''}</td><td>${b ? n(s) : ''}</td><td class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td></tr>`;
        }
        return `<tr class="sn-group" id="${gid}-hdr" onclick="snToggle('${gid}')">
          <td><span class="sn-chev" style="font-size:.65rem;margin-right:.4rem;color:var(--muted)">▶</span>${group.emoji} ${group.label}</td><td>${gb ? n(gb) : ''}</td><td>${n(gs)}</td><td class="${gr < 0 ? 'sn-over' : gr > 0 ? 'sn-ok' : ''}">${gb ? n(gr) : ''}</td></tr>${catRows}`;
      }).join('');

      // Leisure sub-ribbon
      const leisureGroup = CATEGORY_GROUPS.find((g) => g.label === 'Leisure & Lifestyle')!;
      const leisureCats = leisureGroup.keys
        .map((k) => CATEGORIES.find((c) => c.key === k))
        .filter((x): x is (typeof CATEGORIES)[0] => Boolean(x));
      const isMobile = window.innerWidth <= 600;
      const leisureKey = isMobile ? 'leisureExpandedMobile' : 'leisureExpanded';
      const leisureStored = localStorage.getItem(leisureKey);
      const leisureExpanded = leisureStored !== null ? leisureStored !== 'false' : !isMobile;
      const leisureSpent = ag(leisureCats.reduce((sum, c) => sum + (spent[c.key] || 0), 0));
      const leisureBudget = ag(
        leisureCats.reduce((sum, c) => sum + (state.budgets[c.key] || 0), 0),
      );
      const leisureSubRibbon = `<div class="sub-ribbon">
        <span class="sub-ribbon-label" onclick="localStorage.setItem('${leisureKey}', ${!leisureExpanded});renderApp()" style="cursor:pointer;user-select:none;">
          ${leisureExpanded ? '▼' : '▶'} 🎉 Leisure
          <span style="font-family:'DM Mono',monospace;font-weight:400;margin-left:.4rem;">${n(leisureSpent)}${leisureBudget ? ` / ${n(leisureBudget)}` : ''}
          </span>
        </span>
        ${
          leisureExpanded
            ? `
        <table class="leisure-table">
          <thead><tr><th></th><th>Budget</th><th>Spent</th><th>Left</th></tr></thead>
          <tbody>${leisureCats
            .map((c) => {
              const s = spent[c.key] || 0;
              const b = state.budgets[c.key] || 0;
              const r = b - s;
              return `<tr><td class="lt-cat">${c.emoji} ${c.label}</td><td class="lt-num">${b ? n(b) : '-'}</td><td class="lt-num">${n(s)}</td><td class="lt-num ${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : '-'}</td></tr>`;
            })
            .join('')}
          <tr class="lt-total"><td class="lt-cat">Total</td><td class="lt-num">${n(leisureBudget)}</td><td class="lt-num">${n(leisureSpent)}</td><td class="lt-num ${leisureBudget - leisureSpent < 0 ? 'sn-over' : 'sn-ok'}">${n(leisureBudget - leisureSpent)}</td></tr>
          </tbody>
        </table>`
            : ''
        }
      </div>`;

      return `<div class="ribbon-panel">
        <div class="ribbon">
          <div class="ribbon-stat"><div class="ribbon-label">Income${isAnyEstimated(state.currentMonthId) ? ' <span style="color:var(--est);font-size:.55rem;">~EST</span>' : ''}</div><div class="ribbon-val" style="${isAnyEstimated(state.currentMonthId) ? 'color:var(--est-val);' : ''}">${isAnyEstimated(state.currentMonthId) ? '~' : ''}${fmt(income)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Budgeted</div><div class="ribbon-val">${fmt(totalBudgeted)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Left to Budget</div><div class="ribbon-val" style="color:${leftToBudget >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(leftToBudget)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Spent</div><div class="ribbon-val">${fmt(totalSpent)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Remaining</div><div class="ribbon-val" style="color:${income - totalSpent >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(income - totalSpent)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Remaining in Budget</div><div class="ribbon-val" style="color:${remainingInBudget >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(remainingInBudget)}</div></div>
          <div class="ribbon-stat ribbon-hide-mobile" style="border-left:2px solid var(--accent);padding-left:.75rem;margin-left:.25rem;"><div class="ribbon-label" style="color:var(--accent);">🏦 Saved</div><div class="ribbon-val" style="color:var(--accent);">${fmt((state.budgets['savings_bank'] || 0) + (state.budgets['savings_invested'] || 0))}</div></div>
          ${(() => {
            // Owed strip — Travel gap + Admin gap + Below-Threshold (Q1)
            // Always visible on Budget-tab top KPIs, glanceable on mobile too.
            const owedOpen = localStorage.getItem('owedStripOpen') !== 'false'; // default open
            const tProj = (state.travel.items || []).reduce(
              (s, i) => s + (Number(i.projected_amount) || 0),
              0,
            );
            const tAlloc = Object.values(state.travel.allocations || {}).reduce(
              (s, a) => s + (Number(a.amount) || 0),
              0,
            );
            const tGap = ag(Math.max(0, tProj - tAlloc));
            const aProj = (state.admin.items || []).reduce(
              (s, i) => s + (Number(i.projected_amount) || 0),
              0,
            );
            const aAlloc = Object.values(state.admin.allocations || {}).reduce(
              (s, a) => s + (Number(a.amount) || 0),
              0,
            );
            const aGap = ag(Math.max(0, aProj - aAlloc));
            const totalOwed = ag(tGap + aGap);
            const seg = (emoji: string, val: number, tab: string, label: string): string =>
              val > 0
                ? `<span class="owed-seg" title="${label}: -${fmt(val)}" onclick="switchTab('${tab}')">${emoji} <span style="font-family:'DM Mono',monospace;">-${fmt(val)}</span></span>`
                : `<span class="owed-seg owed-seg-zero" title="${label}: funded" onclick="switchTab('${tab}')">${emoji} <span style="font-family:'DM Mono',monospace;color:var(--green);">0</span></span>`;
            const chev = owedOpen ? '▾' : '▸';
            return `<div class="ribbon-stat owed-strip" id="owed-strip" style="cursor:default;">
              <div class="ribbon-label" style="display:flex;align-items:center;gap:.3rem;">
                <button class="owed-chev" onclick="toggleOwedStrip()" title="${owedOpen ? 'Hide' : 'Show'} owed elsewhere" aria-label="${owedOpen ? 'Hide' : 'Show'} owed">${chev}</button>
                <span style="color:${totalOwed > 0 ? 'var(--red)' : 'var(--muted)'};">Owed elsewhere</span>
              </div>
              <div class="owed-segments" style="display:${owedOpen ? 'flex' : 'none'};gap:.55rem;align-items:center;flex-wrap:wrap;margin-top:.15rem;">
                ${seg('✈️', tGap, 'travel', 'Travel gap')}
                <span class="owed-sep">·</span>
                ${seg('📋', aGap, 'admin', 'Admin gap')}
              </div>
              ${!owedOpen ? `<div class="ribbon-val" style="color:${totalOwed > 0 ? 'var(--red)' : 'var(--green)'};">${totalOwed > 0 ? '-' : ''}${fmt(totalOwed)}</div>` : ''}
            </div>`;
          })()}
          <div style="display:flex;gap:.3rem;margin-left:.75rem;flex-shrink:0;">
            <button class="ribbon-toggle" onclick="toggleRibbonExpand()">${ribbonExpanded ? '▲ less' : '▼ full view'}</button>
            <button class="ribbon-toggle" onclick="toggleRibbon()">✕</button>
          </div>
        </div>
        ${
          ribbonExpanded
            ? `
        <div class="ribbon-snapshot">
          <div style="display:flex;gap:2rem;align-items:flex-start;">
            <div style="flex:1;min-width:0;">
              <table class="sn-table">
                <thead><tr><th>Category</th><th>Budget</th><th>Spent</th><th>Remaining</th></tr></thead>
                <tbody>
                  ${(() => {
                    const bkB = state.budgets['savings_bank'] || 0,
                      bkS = bkB;
                    const invB = state.budgets['savings_invested'] || 0,
                      invS = invB;
                    const gb = bkB + invB,
                      gs = bkS + invS,
                      gr = gb - gs;
                    return `<tr class="sn-group" id="rsngrp-Savings-hdr" onclick="snToggle('rsngrp-Savings')">
                      <td><span class="sn-chev" style="font-size:.65rem;margin-right:.4rem;color:var(--muted)">▶</span>🏦 Savings</td>
                      <td>${gb ? n(gb) : ''}</td><td>${n(gs)}</td><td class="${gr < 0 ? 'sn-over' : gr > 0 ? 'sn-ok' : ''}">${gb ? n(gr) : ''}</td>
                    </tr>
                    <tr class="sn-cat rsngrp-Savings collapsed"><td style="padding-left:1.5rem">🏦 In Bank</td><td>${bkB ? n(bkB) : ''}</td><td>${n(bkS)}</td><td>${bkB ? n(bkB - bkS) : ''}</td></tr>
                    <tr class="sn-cat rsngrp-Savings collapsed"><td style="padding-left:1.5rem">📈 Invested</td><td>${invB ? n(invB) : ''}</td><td>${n(invS)}</td><td>${invB ? n(invB - invS) : ''}</td></tr>`;
                  })()}
                  ${groupRows}
                </tbody>
              </table>
            </div>
          </div>
        </div>`
            : ''
        }
        ${leisureSubRibbon}
        <div class="ribbon-drag-handle" id="ribbon-drag" onmousedown="startRibbonDrag(event)"></div>
      </div>`;
    })()}

    <div class="${state.activeTab === 'year' ? 'main-full' : 'main'}">
      ${
        state.loading
          ? '<div class="loading">Loading...</div>'
          : state.activeTab === 'year'
            ? renderYearSnapshot()
            : state.activeTab === 'cash'
              ? renderCashTab()
              : state.activeTab === 'charity'
                ? renderCharityTab()
                : state.activeTab === 'travel'
                  ? renderTravelTab()
                  : state.activeTab === 'admin'
                    ? renderAdminTab()
                    : state.activeTab === 'biz'
                      ? renderBizTab()
                      : `
      <div class="page-layout">
      <nav class="side-nav" id="side-nav">
        <div class="sidenav-label">Jump to</div>
        <select class="sidenav-select" onchange="if(this.value){jumpTo(this.value);this.value=''}">
          <option value="">— select —</option>
          <option value="group-Savings">🏦 Savings</option>
          ${CATEGORY_GROUPS.map((g) => `<option value="group-${g.label.replace(/\s+/g, '-')}">${g.emoji} ${g.label}</option>`).join('')}
        </select>
        <div class="sidenav-divider"></div>
        <div style="margin-bottom:.6rem;">
          <div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--dim);padding:0 .5rem .3rem;">Add ₪</div>
          <div style="display:flex;flex-direction:column;gap:.3rem;">
            <datalist id="sb-store-list"></datalist>
            <select id="sb-cat" onchange="updateSbStores(this.value)" style="width:100%;font-size:.74rem;padding:.3rem .45rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">
              <option value="">Category…</option>
              ${[...CATEGORIES]
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((c) => `<option value="${c.key}">${c.emoji} ${c.label}</option>`)
                .join('')}
            </select>
            <input type="text" id="sb-store" class="adder-input" placeholder="Store" list="sb-store-list" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <input type="text" id="sb-item" class="adder-input" placeholder="Item" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <input type="number" id="sb-amount" class="adder-input" placeholder="Amount ₪" min="0" step="0.01" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <input type="date" id="sb-date" class="adder-input" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <button id="sb-btn" onclick="addTransactionSidebar()" style="width:100%;padding:.4rem;background:var(--accent);color:white;border:none;border-radius:var(--r);font-family:'DM Sans',sans-serif;font-weight:600;font-size:.77rem;cursor:pointer;">Save →</button>
          </div>
        </div>
        <div class="sidenav-divider"></div>
        <div class="sidenav-item" onclick="jumpTo('group-Savings')">🏦 Savings</div>
        ${CATEGORY_GROUPS.map((g) => {
          const gkey = g.label.replace(/\s+/g, '-');
          const expanded = localStorage.getItem('sn-exp-' + gkey) !== 'false';
          const cats = g.keys
            .map((k) => CATEGORIES.find((c) => c.key === k))
            .filter((x): x is (typeof CATEGORIES)[0] => x !== undefined);
          if (cats.length === 1) {
            const c = cats[0];
            let gapBadge = '';
            if (c.hasTab && (state as unknown as Record<string, unknown>)[c.key]) {
              const _catSection = (state as unknown as Record<string, unknown>)[
                c.key
              ] as CategorySection;
              const projected = (_catSection.items || []).reduce(
                (s, i) => s + (Number(i.projected_amount) || 0),
                0,
              );
              const allocated = Object.values(_catSection.allocations || {}).reduce(
                (s: number, a: { amount?: unknown }) => s + (Number(a.amount) || 0),
                0,
              );
              const gap = ag(projected - allocated);
              if (gap > 0)
                gapBadge = `<span style="font-size:.62rem;color:var(--red);font-family:'DM Mono',monospace;margin-left:auto;padding-left:.4rem;">−${fmt(gap)}</span>`;
            }
            return `<div class="sidenav-item" style="display:flex;align-items:center;" onclick="toggleCat('${c.key}');jumpTo('cat-${c.key}')">${c.emoji} ${c.label}${gapBadge}</div>`;
          }
          return `<div>
            <div class="sidenav-item" style="display:flex;justify-content:space-between;align-items:center;"
              onclick="(function(){var k='sn-exp-${gkey}';var cur=localStorage.getItem(k)!=='false';localStorage.setItem(k,!cur);renderApp();})()">
              <span>${g.emoji} ${g.label}</span>
              <span style="font-size:.6rem;color:var(--dim);margin-left:.3rem;">${expanded ? '▾' : '▸'}</span>
            </div>
            ${
              expanded
                ? cats
                    .map(
                      (c) => `
              <div class="sidenav-item" style="padding-left:1.1rem;font-size:.7rem;border-left-color:transparent;margin-bottom:.05rem;"
                onclick="event.stopPropagation();toggleCat('${c.key}');jumpTo('cat-${c.key}')">
                ${c.emoji} ${c.label}
              </div>`,
                    )
                    .join('')
                : ''
            }
          </div>`;
        }).join('')}
      </nav>
      <div class="page-content">

      <!-- Income breakdown -->
      <div class="card">
        <div class="card-title">
          <span>Income Breakdown</span>
          ${isAnyEstimated(state.currentMonthId) ? '<span style="font-size:.8rem;color:var(--est-tilde);" title="Some values are estimated">~</span>' : ''}
        </div>
        <div class="income-grid">
          ${(() => {
            const _est = getIncomeEst(state.currentMonthId);
            return `
          <div class="income-row"><span class="income-source">Petachya</span><div style="display:flex;align-items:center;gap:.3rem;"><button class="est-pill ${_est['petachya'] ? 'est' : 'act'}" onclick="toggleIncomeEst('petachya')" title="Toggle estimated/actual">${_est['petachya'] ? 'EST' : 'ACT'}</button><input class="income-input${_est['petachya'] ? ' is-est' : ''}" type="number" id="inc-petachya" value="${current.income_petachya || ''}" placeholder="0" onchange="saveIncomeField('income_petachya', this.value)" min="0" step="1"></div></div>
          <div class="income-row"><span class="income-source">Clalit</span><div style="display:flex;align-items:center;gap:.3rem;"><button class="est-pill ${_est['clalit'] ? 'est' : 'act'}" onclick="toggleIncomeEst('clalit')" title="Toggle estimated/actual">${_est['clalit'] ? 'EST' : 'ACT'}</button><input class="income-input${_est['clalit'] ? ' is-est' : ''}" type="number" id="inc-clalit" value="${current.income_clalit || ''}" placeholder="0" onchange="saveIncomeField('income_clalit', this.value)" min="0" step="1"></div></div>
          <div class="income-row"><span class="income-source">Private (Vivi)</span><div style="display:flex;align-items:center;gap:.3rem;"><button class="est-pill ${_est['private'] ? 'est' : 'act'}" onclick="toggleIncomeEst('private')" title="Toggle estimated/actual">${_est['private'] ? 'EST' : 'ACT'}</button><input class="income-input${_est['private'] ? ' is-est' : ''}" type="number" id="inc-private" value="${current.income_private || ''}" placeholder="0" onchange="saveIncomeField('income_private', this.value)" min="0" step="1"></div></div>
          ${(Number(current.income_other) || 0) > 0 || state.incomeItems.length === 0 ? `<div class="income-row"><span class="income-source">Other (parents, Marom…)</span><div style="display:flex;align-items:center;gap:.3rem;"><button class="est-pill ${_est['other'] ? 'est' : 'act'}" onclick="toggleIncomeEst('other')" title="Toggle estimated/actual">${_est['other'] ? 'EST' : 'ACT'}</button><input class="income-input${_est['other'] ? ' is-est' : ''}" type="number" id="inc-other" value="${current.income_other || ''}" placeholder="0" onchange="saveIncomeField('income_other', this.value)" min="0" step="1"></div></div>` : '<input type="hidden" id="inc-other" value="0">'}
          `;
          })()}
          ${state.incomeItems
            .map((item: IncomeItemRow) => {
              const _est2 = getIncomeEst(state.currentMonthId);
              return `
          <div class="income-row">
            <input type="text" class="income-input" style="width:90px;text-align:left;" value="${item.label}" placeholder="Source" onchange="saveIncomeItemLabel('${item.id}', this.value)">
            <div style="display:flex;align-items:center;gap:.3rem;">
              <button class="est-pill ${_est2[item.id] ? 'est' : 'act'}" onclick="toggleIncomeEst(null,'${item.id}')" title="Toggle estimated/actual">${_est2[item.id] ? 'EST' : 'ACT'}</button>
              <input class="income-input${_est2[item.id] ? ' is-est' : ''}" type="number" value="${item.amount || ''}" placeholder="0" onchange="saveIncomeItemAmount('${item.id}', this.value)" min="0" step="1">
              <button onclick="deleteIncomeItem('${item.id}')" style="background:none;border:none;cursor:pointer;color:var(--dim);font-size:1rem;padding:0 .2rem;">×</button>
            </div>
          </div>`;
            })
            .join('')}
        </div>
        <button onclick="addIncomeItem()" style="margin-top:.6rem;font-size:.75rem;font-weight:600;color:var(--accent);background:var(--asoft);border:none;border-radius:6px;padding:.3rem .75rem;cursor:pointer;">+ Add income source</button>
      </div>

      <!-- Category groups -->
      <div class="categories">

        <!-- Savings group (manual inputs) -->
        ${(() => {
          const bankBudget = state.budgets['savings_bank'] || 0;
          const investBudget = state.budgets['savings_invested'] || 0;
          const bankSpent = bankBudget;
          const investSpent = investBudget;
          const groupBudget = bankBudget + investBudget;
          const groupSpent = bankSpent + investSpent;
          const _groupSt_unused = status(groupSpent, groupBudget);
          void _groupSt_unused;
          const savingsRow = (
            label: string,
            emoji: string,
            budgetKey: string,
            spentField: string,
            budgetVal: number,
            _spentVal?: number,
          ): string => {
            return `<div class="cat-row">
              <div class="cat-top" style="cursor:default;">
                <div class="cat-name"><span class="cat-emoji">${emoji}</span>${label}</div>
                <div class="cat-amounts">
                  <input type="number" class="budget-inline" value="${budgetVal || ''}" placeholder="set amount" min="0" step="1"
                    onchange="saveBudget('${budgetKey}', this.value);saveSavingsField('${spentField}', this.value)"
                    onkeydown="if(event.key==='Enter')this.blur()"
                    style="width:100px">
                </div>
              </div>
            </div>`;
          };
          return `<div class="group-block" id="group-Savings">
            <div class="group-header" onclick="toggleGroup('Savings')">
              <span><span class="group-chevron">▼</span>🏦 Savings</span>
              <span class="group-totals">
                <span class="cat-spent-bold">${fmt(groupBudget)}</span>
              </span>
            </div>
            <div class="group-cats">
              ${savingsRow('In Bank', '🏦', 'savings_bank', 'savings_bank', bankBudget, bankSpent)}
              ${savingsRow('Invested', '📈', 'savings_invested', 'savings_invested', investBudget, investSpent)}
            </div>
          </div>`;
        })()}

        ${CATEGORY_GROUPS.map((group) => {
          const cats = group.keys
            .map((k) => CATEGORIES.find((c) => c.key === k))
            .filter((x): x is (typeof CATEGORIES)[0] => Boolean(x));
          const groupSpent = ag(cats.reduce((sum, c) => sum + (spent[c.key] || 0), 0));
          const groupBudget = ag(cats.reduce((sum, c) => sum + catBudget(c.key), 0));
          const groupSt = status(groupSpent, groupBudget);
          const singleCat = cats.length === 1;
          // B2 narrowed — Leisure-only personal-average trend marker
          let leisureTrend = '';
          if (group.label === 'Leisure & Lifestyle' && state.yearData) {
            try {
              const todayMonthNum2 = todayMonthForYear();
              const monthsSorted2 = [...state.months].sort((a, b) => a.month_num - b.month_num);
              const past = monthsSorted2.filter((m) => m.month_num < todayMonthNum2);
              if (past.length > 0) {
                const leisureCatKeys = group.keys;
                const totalSpent = past.reduce((acc, m) => {
                  return (
                    acc +
                    (state.yearData!.txns || [])
                      .filter((t) => t.month_id === m.id && leisureCatKeys.includes(t.category))
                      .reduce((s, t) => s + (Number(t.amount) || 0), 0)
                  );
                }, 0);
                const avg = totalSpent / past.length;
                if (avg > 0) {
                  const arrow = groupSpent > avg * 1.05 ? '↗' : groupSpent < avg * 0.95 ? '↘' : '→';
                  const arrowColor =
                    arrow === '↗'
                      ? 'var(--amber)'
                      : arrow === '↘'
                        ? 'var(--green)'
                        : 'var(--muted)';
                  leisureTrend = `<span style="font-size:.65rem;color:var(--muted);margin-left:.5rem;font-weight:400;" title="Personal average over last ${past.length} mo: ${fmt(avg)}. Up arrow = above avg, down = below.">avg ${fmt(avg)} <span style="color:${arrowColor};font-weight:700;">${arrow}</span></span>`;
                }
              }
            } catch (e) {
              /* trend marker is best-effort */
            }
          }
          return `
            <div class="group-block" id="group-${group.label.replace(/\s+/g, '-')}">
              ${
                singleCat
                  ? ''
                  : `<div class="group-header" onclick="toggleGroup('${group.label.replace(/\s+/g, '-')}')">
                <span><span class="group-chevron">▼</span>${group.emoji} ${group.label}${leisureTrend}</span>
                <span class="group-totals">
                  <span class="cat-spent-bold">${fmt(groupSpent)}</span>
                  ${groupBudget > 0 ? `<span style="color:var(--muted)"> / ${fmt(groupBudget)}</span>` : ''}
                  ${groupBudget > 0 ? `<span class="group-rem ${groupSt}"> · ${groupSt === 'over' ? '-' : ''}${fmt(Math.abs(groupBudget - groupSpent))} ${groupSt === 'over' ? 'over' : 'left'}</span>` : ''}
                </span>
              </div>`
              }
              <div class="group-cats">
              ${cats
                .map((c) => {
                  const s = spent[c.key] || 0;
                  const b = catBudget(c.key);
                  const items = state.budgetItems[c.key] || [];
                  const hasItems = items.length > 0;
                  const st = status(s, b);
                  const p = pct(s, b);
                  const txs = state.transactions.filter((tx) => tx.category === c.key);
                  if (c.hasTab) {
                    if (c.key === 'charity') {
                      const charityPctKey = 'charityPct_' + state.currentMonthId;
                      const charityPct =
                        parseFloat(localStorage.getItem(charityPctKey) || '') ||
                        (state.budgets['charity'] && income
                          ? +((state.budgets['charity'] / income) * 100).toFixed(1)
                          : '');
                      const charityCalc = charityPct
                        ? Math.round((income * charityPct) / 100)
                        : state.budgets['charity'] || 0;
                      return `<div class="cat-row" id="cat-charity">
                      <div class="cat-top">
                        <div class="cat-name"><span class="cat-emoji">💚</span>Charity</div>
                        <div class="cat-amounts" style="display:flex;align-items:center;gap:.5rem;flex-wrap:nowrap;">
                          <input type="number" class="budget-inline" value="${charityPct}" placeholder="%" min="0" max="100" step="0.1"
                            onclick="event.stopPropagation()"
                            oninput="(function(el){const pct=parseFloat(el.value)||0;localStorage.setItem('charityPct_'+state.currentMonthId,pct);const inc=totalIncome(state.months.find(m=>m.id===state.currentMonthId));const calc=Math.round(inc*pct/100);const sp=el.parentElement.querySelector('.cat-spent-bold');if(sp){sp.textContent='= '+fmt(calc);}else if(pct){const s=document.createElement('span');s.className='cat-spent-bold';s.textContent='= '+fmt(calc);el.parentElement.appendChild(s);}})(this)"
                            onblur="(function(v){const pct=parseFloat(v)||0;localStorage.setItem('charityPct_'+state.currentMonthId,pct);const inc=totalIncome(state.months.find(m=>m.id===state.currentMonthId));const calc=Math.round(inc*pct/100);saveBudget('charity',calc);state.budgets['charity']=calc;renderApp();})(this.value)"
                            onkeydown="if(event.key==='Enter'){this.blur()}"
                            style="width:60px">
                          <span style="font-size:.8rem;color:var(--muted);">%</span>
                          ${charityCalc ? `<span class="cat-spent-bold">= ${fmt(charityCalc)}</span>` : ''}
                        </div>
                      </div>
                    </div>`;
                    }
                    return `<div class="cat-row" id="cat-${c.key}">
                    <div class="cat-top">
                      <div class="cat-name"><span class="cat-emoji">${c.emoji}</span>${c.label}</div>
                      <div class="cat-amounts">
                        <input type="number" class="budget-inline" value="${state.budgets[c.key] || ''}" placeholder="this month" min="0" step="1"
                          onclick="event.stopPropagation()"
                          onchange="saveBudget('${c.key}', this.value)"
                          onkeydown="if(event.key==='Enter'){this.blur()}"
                          style="width:${b > 0 ? Math.max(60, String(Math.round(b)).length * 10 + 30) : 95}px">${gapMarker(c.key)}
                      </div>
                    </div>
                  </div>`;
                  }
                  return `
                  <div class="cat-row${state.openCats.has(c.key) ? ' open' : ''}" id="cat-${c.key}">
                    <div class="cat-top" onclick="toggleCat('${c.key}')">
                      <div class="cat-name">
                        <span class="cat-emoji">${c.emoji}</span>
                        ${c.label}
                      </div>
                      <div class="cat-amounts">
                        ${
                          c.hasLines && hasItems
                            ? `<span style="font-size:.65rem;color:var(--dim);margin-right:.25rem;">committed</span><span class="cat-spent-bold">${fmt(b)}</span>`
                            : `<span class="cat-spent-bold">${fmt(s)}</span>
                        <span style="color:var(--muted)"> / </span>
                        ${
                          hasItems
                            ? `<span class="budget-inline" style="color:var(--text);cursor:default;">${fmt(b)}</span>`
                            : `<input type="number" class="budget-inline" value="${state.budgets[c.key] || ''}" placeholder="set budget" min="0" step="1"
                              onclick="event.stopPropagation()"
                              onchange="saveBudget('${c.key}', this.value)"
                              onkeydown="if(event.key==='Enter'){this.blur()}"
                              style="width:${b > 0 ? Math.max(80, String(Math.round(b)).length * 10 + 30) : 110}px">
                            ${c.hasLines ? `<button style="background:none;border:none;font-size:.65rem;color:var(--dim);cursor:pointer;padding:0 .3rem;" onclick="event.stopPropagation();addBudgetItem('${c.key}')" title="Add line items">+ lines</button>` : ''}`
                        }`
                        }
                      </div>
                    </div>
                    ${
                      b > 0 && !c.hasTab
                        ? `
                      <div class="progress-bar">
                        <div class="progress-fill ${st}" style="width:${p}%"></div>
                      </div>
                      <div class="cat-remaining ${st}">
                        ${(() => {
                          const rem = Math.round(b - s);
                          return rem < 0
                            ? `₪${fmt(-rem).replace('₪', '')} over budget`
                            : `₪${fmt(rem).replace('₪', '')} remaining`;
                        })()}
                      </div>`
                        : ''
                    }
                    <div class="tx-list">
                      ${
                        SPENDING_GRID_CATS.includes(c.key)
                          ? (() => {
                              const _sgOn = state.spendingGridCats.includes(c.key);
                              return `<div style="text-align:right;margin-bottom:.3rem;"><button onclick="event.stopPropagation();toggleSpendingGrid('${c.key}')" style="font-size:.65rem;padding:.2rem .5rem;border:1px solid var(--border);border-radius:4px;background:${_sgOn ? 'var(--accent)' : 'none'};color:${_sgOn ? 'white' : 'var(--muted)'};cursor:pointer;font-family:'DM Sans',sans-serif;">${_sgOn ? '✕ Hide grid' : '📊 Year grid'}</button></div>${_sgOn ? renderSpendingGrid(c.key) : ''}`;
                            })()
                          : ''
                      }
                      <div class="budget-items-list">
                        ${(() => {
                          if (!hasItems) return '';
                          const HOUSING_SUBCATS = {
                            rent: 'Rent',
                            utilities: 'Utilities',
                            bills: 'Bills',
                            household: 'Household',
                          };
                          const RECURRING_SUBCATS = {
                            tashlumim: 'תשלומים',
                            digital: 'Digital',
                            insurance: 'Insurance',
                            bills: 'Bills',
                            fitness: 'Fitness',
                          };
                          const subcatOpts =
                            c.key === 'housing' ? HOUSING_SUBCATS : RECURRING_SUBCATS;
                          const isGridCat = c.key === 'housing' || c.key === 'recurring';
                          const renderBudgetItemRow = (item: BudgetItemRow): string => {
                            // Subcat picker: per-row select. On mobile the section
                            // banner already conveys the subcategory, so hide it
                            // there (CSS) — keeps the row scannable and prevents
                            // the previous "tiny disc" rendering. Re-expose on
                            // edit by tapping the row's "more" affordance.
                            const subSel =
                              '<select class="bi-subcat" onchange="saveBudgetItem(\'' +
                              item.id +
                              '\',\'subcategory\',this.value)" onclick="event.stopPropagation()" title="Move to subcategory">' +
                              '<option value=""' +
                              (!item.subcategory ? ' selected' : '') +
                              '>--</option>' +
                              Object.entries(subcatOpts)
                                .map(
                                  ([k, v]) =>
                                    '<option value="' +
                                    k +
                                    '"' +
                                    (item.subcategory === k ? ' selected' : '') +
                                    '>' +
                                    v +
                                    '</option>',
                                )
                                .join('') +
                              '</select>';
                            const defaultCls =
                              'bi-default' + (item.is_default ? ' is-default' : '');
                            return (
                              '<div class="budget-item-row" data-budget-item-id="' +
                              item.id +
                              '">' +
                              '<input type="text" class="bi-label" value="' +
                              (item.label || '').replace(/"/g, '&quot;') +
                              '" placeholder="Item name" onclick="event.stopPropagation()" onchange="saveBudgetItem(\'' +
                              item.id +
                              "','label',this.value)\">" +
                              subSel +
                              '<input type="number" class="bi-amount" value="' +
                              (item.amount || '') +
                              '" placeholder="0" min="0" step="1" onclick="event.stopPropagation()" onchange="saveBudgetItem(\'' +
                              item.id +
                              "','amount',this.value)\" onkeydown=\"if(event.key==='Enter')this.blur()\">" +
                              (isGridCat
                                ? ''
                                : '<button class="' +
                                  defaultCls +
                                  '" onclick="event.stopPropagation();setItemAsDefault(\'' +
                                  item.id +
                                  '\')" title="Sets default for new months only — past months stay unchanged">★</button>') +
                              '<button class="bi-del" onclick="event.stopPropagation();deleteBudgetItem(\'' +
                              item.id +
                              '\')">×</button>' +
                              '</div>'
                            );
                          };
                          const header =
                            '<div class="budget-items-header"><span>Item</span><span>Amount</span><span style="width:48px"></span></div>';

                          // Housing: grid toggle
                          if (c.key === 'housing') {
                            const gridBtn =
                              '<div style="text-align:right;margin-bottom:.4rem;"><button onclick="event.stopPropagation();toggleHousingGrid()" style="font-size:.65rem;padding:.2rem .5rem;border:1px solid var(--border);border-radius:4px;background:' +
                              (state.housingGridMode ? 'var(--accent)' : 'none') +
                              ';color:' +
                              (state.housingGridMode ? 'white' : 'var(--muted)') +
                              ";cursor:pointer;font-family:'DM Sans',sans-serif;\">" +
                              (state.housingGridMode ? '✕ List view' : '📊 Year grid') +
                              '</button></div>';
                            if (state.housingGridMode) return gridBtn + renderHousingGrid();
                            const hGroups: Record<string, BudgetItemRow[]> = {},
                              hNoSubcat: BudgetItemRow[] = [];
                            items.forEach((item) => {
                              const sc = item.subcategory || '';
                              if (sc && Object.keys(HOUSING_SUBCATS).includes(sc)) {
                                if (!hGroups[sc]) hGroups[sc] = [];
                                hGroups[sc].push(item);
                              } else hNoSubcat.push(item);
                            });
                            let hHtml = gridBtn + header;
                            Object.keys(HOUSING_SUBCATS).forEach((sc) => {
                              if (hGroups[sc] && hGroups[sc].length > 0) {
                                hHtml +=
                                  '<div style="padding:.25rem .5rem .1rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);border-top:1px solid var(--border);margin-top:.2rem;">' +
                                  (HOUSING_SUBCATS as Record<string, string>)[sc] +
                                  '</div>';
                                hHtml += hGroups[sc].map(renderBudgetItemRow).join('');
                              }
                            });
                            if (hNoSubcat.length > 0)
                              hHtml += hNoSubcat.map(renderBudgetItemRow).join('');
                            return hHtml;
                          }

                          if (c.key !== 'recurring') {
                            return header + items.map(renderBudgetItemRow).join('');
                          }
                          // Recurring: grid toggle button
                          const gridBtn =
                            '<div style="text-align:right;margin-bottom:.4rem;"><button onclick="event.stopPropagation();toggleRecurringGrid()" style="font-size:.65rem;padding:.2rem .5rem;border:1px solid var(--border);border-radius:4px;background:' +
                            (state.recurringGridMode ? 'var(--accent)' : 'none') +
                            ';color:' +
                            (state.recurringGridMode ? 'white' : 'var(--muted)') +
                            ";cursor:pointer;font-family:'DM Sans',sans-serif;\">" +
                            (state.recurringGridMode ? '✕ List view' : '📊 Year grid') +
                            '</button></div>';
                          if (state.recurringGridMode) {
                            return gridBtn + renderRecurringGrid();
                          }
                          // Recurring list: group by subcategory
                          const SUBCAT_ORDER = [
                            'tashlumim',
                            'digital',
                            'insurance',
                            'bills',
                            'fitness',
                          ];
                          const SUBCAT_LABELS = {
                            tashlumim: 'תשלומים',
                            digital: 'Digital',
                            insurance: 'Insurance',
                            bills: 'Bills',
                            fitness: 'Fitness',
                          };
                          const groups: Record<string, BudgetItemRow[]> = {};
                          const noSubcat: BudgetItemRow[] = [];
                          items.forEach((item) => {
                            const sc = item.subcategory || '';
                            if (sc && SUBCAT_ORDER.includes(sc)) {
                              if (!groups[sc]) groups[sc] = [];
                              groups[sc].push(item);
                            } else {
                              noSubcat.push(item);
                            }
                          });
                          let html = gridBtn + header;
                          SUBCAT_ORDER.forEach((sc) => {
                            if (groups[sc] && groups[sc].length > 0) {
                              html +=
                                '<div style="padding:.25rem .5rem .1rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);border-top:1px solid var(--border);margin-top:.2rem;">' +
                                SUBCAT_LABELS[sc as keyof typeof SUBCAT_LABELS] +
                                '</div>';
                              html += groups[sc].map(renderBudgetItemRow).join('');
                            }
                          });
                          if (noSubcat.length > 0) {
                            html += noSubcat.map(renderBudgetItemRow).join('');
                          }
                          return html;
                        })()}
                        ${
                          !c.hasLines && state.inlineAddCat === c.key
                            ? (() => {
                                const _ps = [
                                  ...new Set([
                                    ...((PRESET_STORES as Record<string, string[]>)[c.key] || []),
                                    ...state.allStores
                                      .filter((tx) => tx.category === c.key && tx.store)
                                      .map((tx) => tx.store),
                                    ...state.transactions
                                      .filter((tx) => tx.category === c.key && tx.store)
                                      .map((tx) => tx.store),
                                  ]),
                                ];
                                const _dlId = 'inline-stores-' + c.key;
                                return `<datalist id="${_dlId}">${_ps.map((s) => `<option value="${(s as string).replace(/"/g, '&quot;')}">`).join('')}</datalist>
                          <div class="inline-add-form" style="display:grid;grid-template-columns:1fr 1fr 90px 110px 60px 24px;gap:.3rem;padding:.4rem .2rem;align-items:center;border-top:1px solid var(--border);">
                            <input id="inline-store-${c.key}" class="inline-add-input" type="text" placeholder="Store" list="${_dlId}" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')saveInlineAdd('${c.key}')">
                            <input id="inline-item-${c.key}" class="inline-add-input" type="text" placeholder="Item" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')saveInlineAdd('${c.key}')">
                            <input id="inline-amount-${c.key}" class="inline-add-input" type="number" placeholder="₪" min="0" step="0.01" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')saveInlineAdd('${c.key}')">
                            <input id="inline-date-${c.key}" class="inline-add-input" type="date" onclick="event.stopPropagation()">
                            <button onclick="event.stopPropagation();saveInlineAdd('${c.key}')" style="font-size:.7rem;padding:.25rem .4rem;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;font-family:'DM Sans',sans-serif;">Save</button>
                            <button onclick="event.stopPropagation();state.inlineAddCat=null;renderApp()" style="font-size:.8rem;background:none;border:none;cursor:pointer;color:var(--dim);">×</button>
                          </div>`;
                              })()
                            : ''
                        }
                        ${(c.key === 'housing' && state.housingGridMode) || (c.key === 'recurring' && state.recurringGridMode) || (SPENDING_GRID_CATS.includes(c.key) && state.spendingGridCats.includes(c.key)) ? '' : `<button class="bi-add" onclick="event.stopPropagation();${c.hasLines ? `addBudgetItem('${c.key}')` : `quickAddFor('${c.key}')`}">+ add line</button>`}
                      </div>
                      ${
                        c.key === 'groceries' && txs.length > 0
                          ? (() => {
                              const bigTotal = txs.reduce(
                                (sum, tx) =>
                                  sum + (isBigStore(tx.store || '') ? Number(tx.amount) : 0),
                                0,
                              );
                              const otherTotal = txs.reduce(
                                (sum, tx) =>
                                  sum + (!isBigStore(tx.store || '') ? Number(tx.amount) : 0),
                                0,
                              );
                              const bigPct = s > 0 ? Math.round((bigTotal / s) * 100) : 0;
                              return `<div style="display:flex;gap:.5rem;padding:.4rem .25rem .6rem;border-bottom:1px solid var(--border);margin-bottom:.3rem;">
                          <div style="flex:1;background:var(--gsoft);border-radius:8px;padding:.4rem .6rem;">
                            <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);margin-bottom:.1rem;">🏪 Big stores</div>
                            <div style="font-family:'DM Mono',monospace;font-size:.9rem;font-weight:600;color:var(--accent);">${fmt(bigTotal)}</div>
                            <div style="font-size:.65rem;color:var(--muted);margin-top:.1rem;">${bigPct}% of groceries</div>
                          </div>
                          <div style="flex:1;background:var(--ambersoft);border-radius:8px;padding:.4rem .6rem;">
                            <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--amber);margin-bottom:.1rem;">🛒 Other stores</div>
                            <div style="font-family:'DM Mono',monospace;font-size:.9rem;font-weight:600;color:var(--amber);">${fmt(otherTotal)}</div>
                            <div style="font-size:.65rem;color:var(--muted);margin-top:.1rem;">${100 - bigPct}% of groceries</div>
                          </div>
                        </div>`;
                            })()
                          : ''
                      }
                      ${(() => {
                        if (
                          state.spendingGridCats.includes(c.key) &&
                          SPENDING_GRID_CATS.includes(c.key)
                        )
                          return '';
                        if (txs.length === 0) return '<div class="no-tx">No transactions yet</div>';
                        const sort = state.txSort || 'newest';
                        const sorted = [...txs].sort((a, b) => {
                          if (sort === 'newest')
                            return (
                              (new Date(b.created_at) as unknown as number) -
                              (new Date(a.created_at) as unknown as number)
                            );
                          if (sort === 'oldest')
                            return (
                              (new Date(a.created_at) as unknown as number) -
                              (new Date(b.created_at) as unknown as number)
                            );
                          if (sort === 'high') return Number(b.amount) - Number(a.amount);
                          if (sort === 'low') return Number(a.amount) - Number(b.amount);
                          return 0;
                        });
                        const MONS = [
                          'Jan',
                          'Feb',
                          'Mar',
                          'Apr',
                          'May',
                          'Jun',
                          'Jul',
                          'Aug',
                          'Sep',
                          'Oct',
                          'Nov',
                          'Dec',
                        ];
                        const fmtDate = (d: string | null): string => {
                          if (!d) return '—';
                          const dt = new Date(d + 'T12:00:00');
                          return dt.getDate() + ' ' + MONS[dt.getMonth()];
                        };
                        const esc = (s: string | null | undefined): string =>
                          (s || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;');
                        const renderTxRow = (tx: TransactionRow): string => `
                          <div class="tx-item" data-tx-id="${tx.id}">
                            <div class="tx-date-wrap" onclick="event.stopPropagation(); this.classList.add('editing'); this.querySelector('.tx-edit-date').focus();">
                              <span class="tx-date-display">${fmtDate(tx.date)}</span>
                              <input class="tx-edit-date" type="date" value="${tx.date || ''}" onfocus="this.parentElement.classList.add('editing')" onblur="this.parentElement.classList.remove('editing')" onchange="updateTx('${tx.id}','date',this.value)">
                            </div>
                            <input class="tx-edit" type="text" value="${esc(tx.store)}" placeholder="Store" style="font-size:.7rem;" onclick="event.stopPropagation()" onchange="updateTx('${tx.id}','store',this.value)">
                            <input class="tx-edit" type="text" value="${esc(tx.item)}" placeholder="Item" style="font-size:.7rem;" onclick="event.stopPropagation()" onchange="updateTx('${tx.id}','item',this.value)">
                            <input class="tx-edit tx-edit-amt" type="number" value="${tx.amount}" min="0" step="0.01" style="font-size:.88rem;font-weight:600;" onclick="event.stopPropagation()" onchange="updateTx('${tx.id}','amount',this.value)">
                            <button class="tx-del" onclick="event.stopPropagation();deleteTransaction('${tx.id}')" title="Delete">×</button>
                          </div>`;
                        const sectionHdr = (emoji: string, label: string, total: number): string =>
                          `<div style="padding:.25rem .5rem .1rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);border-top:1px solid var(--border);margin-top:.2rem;display:flex;justify-content:space-between;"><span>${emoji} ${label}</span><span style="font-family:'DM Mono',monospace;">${fmt(total)}</span></div>`;
                        let txRows = '';
                        if (c.key === 'groceries' && sort === 'type') {
                          const big = sorted.filter((tx) => isBigStore(tx.store || ''));
                          const local = sorted.filter((tx) => !isBigStore(tx.store || ''));
                          const bigAmt = big.reduce((s, tx) => s + Number(tx.amount), 0);
                          const localAmt = local.reduce((s, tx) => s + Number(tx.amount), 0);
                          txRows =
                            (big.length
                              ? sectionHdr('🏪', 'Supermarket', bigAmt) +
                                big.map(renderTxRow).join('')
                              : '') +
                            (local.length
                              ? sectionHdr('🛒', 'Local & Makolet', localAmt) +
                                local.map(renderTxRow).join('')
                              : '');
                        } else {
                          txRows = sorted.map(renderTxRow).join('');
                        }
                        return `<div class="tx-sort-bar">
                          <span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Sort:</span>
                          <button class="tx-sort-btn ${sort === 'newest' ? 'active' : ''}" onclick="event.stopPropagation();setTxSort('newest')">Newest</button>
                          <button class="tx-sort-btn ${sort === 'oldest' ? 'active' : ''}" onclick="event.stopPropagation();setTxSort('oldest')">Oldest</button>
                          <button class="tx-sort-btn ${sort === 'high' ? 'active' : ''}" onclick="event.stopPropagation();setTxSort('high')">Highest</button>
                          <button class="tx-sort-btn ${sort === 'low' ? 'active' : ''}" onclick="event.stopPropagation();setTxSort('low')">Lowest</button>
                          ${c.key === 'groceries' ? `<button class="tx-sort-btn ${sort === 'type' ? 'active' : ''}" onclick="event.stopPropagation();setTxSort('type')">By Type</button>` : ''}
                        </div>
                        <div class="tx-header"><span>Date</span><span>Store</span><span>Item</span><span style="text-align:right">Amount</span><span></span></div>
                        ${txRows}`;
                      })()}
                    </div>
                  </div>`;
                })
                .join('')}
              </div>
            </div>`;
        }).join('')}

        ${(() => {
          // B3 — Pending decisions surface (default-collapsed, Budget tab only)
          const pending = computePending();
          const count = pending.length;
          if (count === 0) return '';
          const open = localStorage.getItem('pendingDecisionsOpen') === 'true';
          const word = count === 1 ? 'thing' : 'things';
          const fmtRow = (it: {
            tab: string;
            type: string;
            id?: string;
            emoji?: string;
            label?: string;
            amount?: number;
          }): string => {
            const onclick = `pendingJump('${it.tab}'${it.type === 'estimate' ? `,'${it.id}'` : ''})`;
            const tag =
              it.type === 'estimate'
                ? '<span class="pd-tag">est</span>'
                : '<span class="pd-tag pd-tag-gap">gap</span>';
            return `<div class="pd-row" onclick="${onclick}" tabindex="0"
                onkeydown="if(event.key==='Enter')${onclick}">
              <span class="pd-emoji">${it.emoji}</span>
              <span class="pd-label">${it.label}${tag}</span>
              <span class="pd-amount">${(it.amount ?? 0) > 0 ? '₪' + fmt(it.amount).replace('₪', '') : ''}</span>
              <span class="pd-chev">›</span>
            </div>`;
          };
          return `<div class="pending-decisions ${open ? 'open' : ''}">
            <button class="pd-header" onclick="togglePendingDecisions()" aria-expanded="${open}">
              <span class="pd-chev-toggle">${open ? '▾' : '▸'}</span>
              <span class="pd-title">📋 ${count} ${word} pending</span>
              <span class="pd-arrow" aria-hidden="true">→</span>
            </button>
            ${
              open
                ? `<div class="pd-body">
                ${pending.map(fmtRow).join('')}
              </div>`
                : ''
            }
          </div>`;
        })()}
      </div>
      </div></div>
      `
      }
    </div>

    <!-- Snapshot modal -->
    <div id="snapshot-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;align-items:flex-start;justify-content:center;padding:1.5rem;overflow-y:auto;backdrop-filter:blur(4px);" onclick="if(event.target===this)this.style.display='none'">
      <div style="background:var(--surface);border-radius:var(--rl);padding:1.5rem;max-width:560px;width:100%;box-shadow:var(--shadowlg);min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;gap:.5rem;">
          <h3 style="font-size:1rem;font-weight:700;">📊 Snapshot</h3>
          <div style="display:flex;gap:.5rem;">
            <button class="btn btn-primary" onclick="window.print()" style="font-size:.8rem;padding:.4rem .9rem;">🖨️ Print / PDF</button>
            <button class="mtab" onclick="document.getElementById('snapshot-modal').style.display='none'">✕ Close</button>
          </div>
        </div>
        <div id="snapshot-body"></div>
      </div>
    </div>

    <!-- Edit income modal (budget tab only) -->
    <div id="income-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:500;display:none;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);">
      <div style="background:var(--surface);border-radius:var(--rl);padding:1.75rem;max-width:380px;width:100%;box-shadow:var(--shadowlg);">
        <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem;">Edit Income — ${current.month_name}</h3>
        <div style="display:flex;flex-direction:column;gap:.65rem;">
          <div class="fg"><label>Petachya</label><input type="number" id="inc-petachya" value="${current.income_petachya || ''}" placeholder="0"></div>
          <div class="fg"><label>Clalit</label><input type="number" id="inc-clalit" value="${current.income_clalit || ''}" placeholder="0"></div>
          <div class="fg"><label>Private (Vivi)</label><div style="display:flex;align-items:center;gap:.5rem;padding:.4rem .55rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);"><span style="font-family:'DM Mono',monospace;color:${bizNetCurrent < 0 ? 'var(--red)' : 'var(--text)'};">₪${bizNetCurrent.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><span style="font-size:.65rem;color:var(--dim);margin-left:auto;">edit in Biz tab →</span></div></div>
          <div class="fg"><label>Other (parents, Marom, etc.)</label><input type="number" id="inc-other" value="${current.income_other || ''}" placeholder="0"></div>
          <div class="fg"><label>Savings to Bank</label><input type="number" id="inc-savings" value="${current.savings_bank || ''}" placeholder="0"></div>
        </div>
        <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:1.25rem;">
          <button class="btn" style="background:var(--surface2);color:var(--muted);" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveIncome()">Save</button>
        </div>
      </div>
    </div>
  `;

  // Set store field visibility + autocomplete based on category
  const catSel = byId('tx-cat');
  if (catSel) {
    catSel.addEventListener('change', () => {
      const cat = CATEGORIES.find((c) => c.key === catSel.value);
      const storeField = byId('tx-store');
      if (storeField)
        storeField.placeholder = cat?.hasStore ? 'Makolet, Yochananof...' : 'Optional';
      updateStoreSuggestions(catSel.value);
    });
  }
  // Q7 — wire scroll-fade affordance after each render
  if (typeof applyScrollFadeListeners === 'function') applyScrollFadeListeners();
  // M2 — sticky "+" FAB on mobile, tab-aware
  if (typeof renderFab === 'function') renderFab();
  // M3 — mobile bottom tab bar
  if (typeof renderMobileTabBar === 'function') renderMobileTabBar();
  // M4 — center active month chip on mobile so it's always visible
  if (typeof scrollActiveMonthIntoView === 'function')
    requestAnimationFrame(scrollActiveMonthIntoView);
  // DM1 — ensure every number input opens the decimal keypad on mobile,
  // not the full QWERTY. Templates emit <input type="number"> without inputmode;
  // patch every render so newly rendered inputs are covered too.
  if (typeof applyNumericInputModes === 'function') applyNumericInputModes();
}

/* DM1 — apply inputmode="decimal" to all number inputs so iOS/Android show
   the right virtual keypad. The post-render hook handles whole-page renders;
   the MutationObserver below catches any partial DOM updates (panels, sub-row
   expansions) that don't go through renderApp(). Idempotent: skips inputs
   that already declare an inputmode (e.g., a future field that explicitly
   wants "numeric" for integer-only). */
function applyNumericInputModes(root?: HTMLElement): void {
  const scope = root && (root as HTMLElement).querySelectorAll ? (root as HTMLElement) : document;
  const inputs = scope.querySelectorAll('input[type="number"]:not([inputmode])');
  inputs.forEach((el: Element) => {
    el.setAttribute('inputmode', 'decimal');
  });
}
// Catch dynamically-inserted number inputs (panels, sub-rows, lazy renders).
// Runs once globally; effectively free since we early-out when no number
// inputs are added in the mutation batch.
function _installInputModeObserver() {
  if (window._inputModeObserverInstalled) return;
  if (!document.body) return;
  if (!('MutationObserver' in window)) return;
  window._inputModeObserverInstalled = true;
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue; // ELEMENT_NODE only
        const el = node as Element;
        if (el.matches && el.matches('input[type="number"]:not([inputmode])')) {
          el.setAttribute('inputmode', 'decimal');
        } else if ((el as HTMLElement).querySelectorAll) {
          applyNumericInputModes(el as HTMLElement);
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  // First pass for already-rendered inputs.
  applyNumericInputModes();
}
// Try synchronously (script lives at end of body) and fall back to
// DOMContentLoaded + setTimeout if body isn't ready yet.
_installInputModeObserver();
if (!window._inputModeObserverInstalled) {
  document.addEventListener('DOMContentLoaded', _installInputModeObserver);
  setTimeout(_installInputModeObserver, 0);
  setTimeout(_installInputModeObserver, 100);
}

async function saveSavingsField(field: string, value: string | number): Promise<void> {
  // Mirror budget value to months table for backwards compatibility.
  // No undo/render/toast here — saveBudget() handles all of that.
  const num = parseFloat(String(value)) || 0;
  const month = state.months.find((m) => m.id === state.currentMonthId);
  await sb
    .from('months')
    .update({ [field]: num })
    .eq('id', state.currentMonthId!);
  if (month) month[field] = num;
}

async function saveBudget(catKey: string, amount: string | number): Promise<void> {
  const num = parseFloat(String(amount)) || 0;
  const old = state.budgets[catKey] || 0;
  const monthId = state.currentMonthId;
  // Upsert — try update first, then insert
  const { data: existing } = await sb
    .from('budgets')
    .select('id')
    .eq('month_id', monthId)
    .eq('category', catKey)
    .single();
  if (existing) {
    const { error } = await sb.from('budgets').update({ amount: num }).eq('id', existing.id);
    if (error) toast('Could not save budget');
  } else {
    const { error } = await sb
      .from('budgets')
      .insert({ month_id: monthId, category: catKey, amount: num });
    if (error) toast('Could not save budget');
  }
  logChange(
    'edit',
    'budget_amount',
    null,
    `Budget changed: ${catKey} ₪${old} → ₪${num}`,
    { amount: old },
    { amount: num },
  );
  state.budgets[catKey] = num;
  // Keep tab allocations in sync when budget tab is edited
  const month = state.months.find((m) => m.id === monthId);
  if (month) {
    if (catKey === 'admin') {
      const { data } = await sb
        .from('admin_allocations')
        .upsert(
          { year: state.currentYear, month_num: month.month_num, amount: num },
          { onConflict: 'year,month_num' },
        )
        .select()
        .single();
      if (data) state.admin.allocations[month.month_num] = data;
    } else if (catKey === 'travel') {
      const existingAlloc = state.travel.allocations[month.month_num];
      if (existingAlloc) {
        existingAlloc.amount = num;
      } else {
        state.travel.allocations[month.month_num] = {
          month_id: monthId,
          amount: num,
        } as AdminAllocationRow;
      }
    } else if (catKey === 'charity') {
      const existingAlloc = state.charity.allocations[month.month_num];
      if (existingAlloc) {
        existingAlloc.amount = num;
      } else {
        state.charity.allocations[month.month_num] = {
          month_id: monthId,
          amount: num,
        } as AdminAllocationRow;
      }
    }
  }
  pushUndo({
    label: 'budget ' + catKey,
    undo: async () => {
      await saveBudget(catKey, old);
      if (catKey === 'savings_bank' || catKey === 'savings_invested')
        await saveSavingsField(catKey, old);
    },
    redo: async () => {
      await saveBudget(catKey, num);
      if (catKey === 'savings_bank' || catKey === 'savings_invested')
        await saveSavingsField(catKey, num);
    },
  });
  renderApp();
  toast('Budget saved ✓');
}

const PRESET_STORES = {
  groceries: [
    'Yochananof',
    'יוחננוף',
    'Shufersal',
    'שופרסל',
    'Osher Ad',
    'אושר עד',
    'Carrefour',
    'קרפור',
    'Rami Levy',
    'רמי לוי',
    'Victory',
    'ויקטורי',
  ],
};

function updateSbStores(catKey: string): void {
  const dl = byId('sb-store-list');
  if (!dl) return;
  const stores = [
    ...new Set([
      ...((PRESET_STORES as Record<string, string[]>)[catKey] || []),
      ...state.allStores.filter((tx) => tx.category === catKey && tx.store).map((tx) => tx.store),
      ...state.transactions
        .filter((tx) => tx.category === catKey && tx.store)
        .map((tx) => tx.store),
    ]),
  ];
  dl.innerHTML = stores.map((s) => `<option value="${esc(s)}">`).join('');
}

function updateStoreSuggestions(catKey: string): void {
  const dl = byId('store-suggestions');
  if (!dl) return;
  const presets = (PRESET_STORES as Record<string, string[]>)[catKey] || [];
  const fromHistory = state.transactions
    .filter((tx) => tx.category === catKey && tx.store)
    .map((tx) => tx.store);
  const stores = [...new Set([...presets, ...fromHistory])];
  dl.innerHTML = stores.map((s) => `<option value="${esc(s)}">`).join('');
}

function quickAddFor(catKey: string): void {
  state.inlineAddCat = catKey;
  renderApp();
  setTimeout(() => {
    const el = byId('inline-store-' + catKey);
    if (el) el.focus();
  }, 50);
}

async function saveInlineAdd(catKey: string): Promise<void> {
  if ((saveInlineAdd as unknown as { _saving?: boolean })._saving) return;
  (saveInlineAdd as unknown as { _saving?: boolean })._saving = true;
  const store = (byId('inline-store-' + catKey) || {}).value?.trim() || null;
  const item = (byId('inline-item-' + catKey) || {}).value?.trim() || null;
  const amount = parseFloat((byId('inline-amount-' + catKey) || {}).value);
  const date = (byId('inline-date-' + catKey) || {}).value || null;
  if (!amount || isNaN(amount)) {
    toast('Enter an amount');
    (saveInlineAdd as unknown as { _saving?: boolean })._saving = false;
    return;
  }
  const { data: txData, error } = await sb
    .from('transactions')
    .insert({
      month_id: state.currentMonthId,
      category: catKey,
      store,
      item,
      amount,
      date,
    })
    .select()
    .single();
  if (error) {
    toast('Error saving');
    (saveInlineAdd as unknown as { _saving?: boolean })._saving = false;
    return;
  }
  logChange(
    'add',
    'transaction',
    txData.id,
    `Added ${store || item || catKey} ₪${amount} • ${catKey}`,
    null,
    txData,
    state.currentMonthId!,
  );
  pushUndo({
    label: 'add transaction',
    undo: async () => {
      await sb.from('transactions').delete().eq('id', txData.id);
      await loadTransactions(state.currentMonthId!);
    },
    redo: async () => {
      await sb.from('transactions').insert(txData);
      await loadTransactions(state.currentMonthId!);
    },
  });
  state.inlineAddCat = null;
  await loadTransactions(state.currentMonthId!);
  (saveInlineAdd as unknown as { _saving?: boolean })._saving = false;
  renderApp();
  toast('Saved ✓');
}

function toggleCat(key: string): void {
  if (state.openCats.has(key)) {
    state.openCats.delete(key);
  } else {
    state.openCats.add(key);
  }
  localStorage.setItem('openCats', JSON.stringify([...state.openCats]));
  // Smooth open/close — toggle the class directly when the row exists in
  // the DOM, so the CSS transition can run. Fall back to full re-render if
  // the row isn't here yet (first paint, tab switch, etc.).
  const row = byId('cat-' + key);
  if (row) {
    row.classList.toggle('open');
  } else {
    renderApp();
  }
}

async function saveIncomeField(field: string, value: string | number): Promise<void> {
  const num = parseFloat(String(value)) || 0;
  const month = state.months.find((m) => m.id === state.currentMonthId);
  const oldVal = month ? month[field] : 0;
  const { error } = await sb
    .from('months')
    .update({ [field]: num })
    .eq('id', state.currentMonthId!);
  if (error) {
    toast('Error saving');
    return;
  }
  if (month) month[field] = num;
  logChange(
    'edit',
    'income_field',
    state.currentMonthId,
    `Income changed: ${field} ₪${oldVal} → ₪${num}`,
    { [field]: oldVal },
    { [field]: num },
    state.currentMonthId!,
  );
  pushUndo({
    label: field.replace('income_', ''),
    undo: async () => {
      await sb
        .from('months')
        .update({ [field]: oldVal })
        .eq('id', state.currentMonthId!);
      if (month) month[field] = oldVal;
    },
    redo: async () => {
      await sb
        .from('months')
        .update({ [field]: num })
        .eq('id', state.currentMonthId!);
      if (month) month[field] = num;
    },
  });
  renderApp();
  toast('Saved ✓');
}

async function addIncomeItem(): Promise<void> {
  const { data, error } = await sb
    .from('income_items')
    .insert({ month_id: state.currentMonthId, label: 'Other', amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error adding');
    return;
  }
  state.incomeItems.push(data);
  logChange(
    'add',
    'income_item',
    (data as Record<string, unknown>)?.['id'] as string,
    `Added income source: Other ₪0`,
    null,
    data,
  );
  pushUndo({
    label: 'add income source',
    undo: async () => {
      await sb.from('income_items').delete().eq('id', data.id);
      state.incomeItems = state.incomeItems.filter((i) => i.id !== data.id);
    },
    redo: async () => {
      await sb.from('income_items').insert(data);
      state.incomeItems.push(data);
    },
  });
  renderApp();
}

async function saveIncomeItemLabel(id: string, value: string): Promise<void> {
  const item = state.incomeItems.find((i) => i.id === id);
  const old = item ? item.label : '';
  await sb.from('income_items').update({ label: value }).eq('id', id);
  if (item) item.label = value;
  logChange(
    'edit',
    'income_item',
    id,
    `Renamed income: ${old} → ${value}`,
    { label: old },
    { label: value },
  );
  pushUndo({
    label: 'rename income',
    undo: async () => {
      await sb.from('income_items').update({ label: old }).eq('id', id);
      if (item) item.label = old;
    },
    redo: async () => {
      await sb.from('income_items').update({ label: value }).eq('id', id);
      if (item) item.label = value;
    },
  });
  renderApp();
  toast('Saved ✓');
}

async function saveIncomeItemAmount(id: string, value: string | number): Promise<void> {
  const num = parseFloat(String(value)) || 0;
  const item = state.incomeItems.find((i) => i.id === id);
  const old = item ? item.amount : 0;
  await sb.from('income_items').update({ amount: num }).eq('id', id);
  if (item) item.amount = num;
  logChange(
    'edit',
    'income_item',
    id,
    `Income amount changed: ${item ? item.label : '?'} ₪${old} → ₪${num}`,
    { amount: old },
    { amount: num },
  );
  pushUndo({
    label: 'income amount',
    undo: async () => {
      await sb.from('income_items').update({ amount: old }).eq('id', id);
      if (item) item.amount = old;
    },
    redo: async () => {
      await sb.from('income_items').update({ amount: num }).eq('id', id);
      if (item) item.amount = num;
    },
  });
  renderApp();
  toast('Saved ✓');
}

async function deleteIncomeItem(id: string): Promise<void> {
  const item = state.incomeItems.find((i) => i.id === id);
  const snap = { ...item } as IncomeItemRow;
  await sb.from('income_items').delete().eq('id', id);
  logChange(
    'delete',
    'income_item',
    id,
    `Deleted income source: ${snap.label} ₪${snap.amount}`,
    snap,
    null,
  );
  state.incomeItems = state.incomeItems.filter((i) => i.id !== id);
  pushUndo({
    label: 'delete income source',
    undo: async () => {
      await sb.from('income_items').insert(snap);
      state.incomeItems.push(snap);
    },
    redo: async () => {
      await sb.from('income_items').delete().eq('id', id);
      state.incomeItems = state.incomeItems.filter((i) => i.id !== id);
    },
  });
  renderApp();
  toastDeleted(snap.label, snap.amount);
}

function showEditIncome() {
  const modal = byId('income-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeModal() {
  const modal = byId('income-modal');
  if (modal) modal.style.display = 'none';
}

async function saveIncome() {
  // income_private is intentionally NOT writable here — it's derived from
  // biz_months net via saveBizField. Editing it from this modal would create
  // drift between months.income_private and biz_months.
  const updates = {
    income_petachya: parseFloat(byId('inc-petachya').value) || 0,
    income_clalit: parseFloat(byId('inc-clalit').value) || 0,
    income_other: parseFloat(byId('inc-other').value) || 0,
    savings_bank: parseFloat(byId('inc-savings').value) || 0,
  };
  const { error } = await sb.from('months').update(updates).eq('id', state.currentMonthId!);
  if (error) {
    toast('Error saving');
    return;
  }
  await loadMonths();
  state.currentMonthId = state.currentMonthId; // keep current
  closeModal();
  renderApp();
  toast('Income saved ✓');
}

function showAddMonth() {
  const existing = state.months.map((m) => m.month_num);
  const available = MONTHS.map((m, i) => ({ name: m, num: i + 1 })).filter(
    (m) => !existing.includes(m.num),
  );
  if (available.length === 0) {
    toast('All months already added');
    return;
  }
  const num = available[0].num;
  if (confirm(`Add ${MONTHS[num - 1]}?`)) createMonth(num);
}

// ── Tab switching ─────────────────────────────────────────────────────
async function switchTab(tab: string): Promise<void> {
  state.activeTab = tab;
  localStorage.setItem('activeTab', tab);
  if (tab === 'biz') {
    state.loading = true;
    renderApp();
    await loadBizData();
    state.loading = false;
  } else if (tab === 'admin') {
    state.loading = true;
    renderApp();
    await loadAdminData();
    state.loading = false;
  } else if (tab === 'travel') {
    state.loading = true;
    renderApp();
    await loadTravelData();
    state.loading = false;
  } else if (tab === 'charity') {
    state.loading = true;
    renderApp();
    await loadCharityData();
    state.loading = false;
  } else if (tab === 'cash') {
    state.loading = true;
    renderApp();
    await loadCashData();
    state.loading = false;
  } else if (tab === 'year') {
    state.loading = true;
    renderApp();
    await loadYearData();
    state.loading = false;
  }
  renderApp();
}

// ── Biz data loading ──────────────────────────────────────────────────
async function loadBizData() {
  const current = state.months.find((m) => m.id === state.currentMonthId);
  if (!current) return;

  // Load biz_months row — DO NOT auto-insert. Tab visit is a read, not a write.
  // If no row exists, state.biz = null and renderBizTab shows a "Set up this
  // month" empty state. Insert only happens when she clicks Set Up or edits a
  // field. Avoids placeholder rows being silently created on navigation.
  const { data: bizRows, error: bizErr } = await sb
    .from('biz_months')
    .select('*')
    .eq('month_id', state.currentMonthId!);
  if (bizErr) toast('Could not load business data');
  state.biz = bizRows && bizRows.length > 0 ? bizRows[0] : null;

  // PT client/session data via Edge Function (pt-sessions). The function uses
  // PT's service key server-side and returns privacy-safe data: client initial
  // (not name) + rate, plus per-session amount (rate * 0.85). Bypasses PT's
  // RLS which blocks anon reads from the browser.
  const prevMonthNum = current.month_num - 1;
  const prevYear = prevMonthNum === 0 ? state.currentYear - 1 : state.currentYear;
  const actualPrevMonthNum = prevMonthNum === 0 ? 12 : prevMonthNum;
  const monthStart = `${prevYear}-${String(actualPrevMonthNum).padStart(2, '0')}-01`;
  const monthEnd = `${current.year}-${String(current.month_num).padStart(2, '0')}-01`;

  try {
    const fnUrl = `${SB_URL}/functions/v1/pt-sessions?start_date=${monthStart}&end_date=${monthEnd}`;
    const resp = await fetch(fnUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SB_KEY}`,
        apikey: SB_KEY,
      },
    });
    if (!resp.ok) throw new Error(`Edge function returned ${resp.status}`);
    const payload = await resp.json();
    // Shape ptClients to match what renderBizTab expects: { id, name, rate }.
    // We use `initial` as the display name (privacy: no full names in browser).
    state.ptClients = ((payload.clients as Array<Record<string, unknown>>) || []).map(
      (c: Record<string, unknown>): PtClientRow => ({
        id: c['id'] as string,
        name: c['initial'] as string,
        rate: c['rate'] as number,
      }),
    );
    const sessions = payload.sessions || [];
    state.ptSessions = {
      earned: sessions.filter((s: Record<string, unknown>) => s.status === 'happened'),
      scheduled: sessions.filter((s: Record<string, unknown>) => s.status === 'scheduled'),
    };
    // Cash tab "Owed to You" — drift detection against cash_accounts (C1).
    state.ptOwedTotal = Number(payload.owed_total) || 0;
  } catch (err) {
    console.error('pt-sessions edge function failed:', err);
    state.ptClients = [];
    state.ptSessions = { earned: [], scheduled: [] };
    state.ptOwedTotal = 0;
  }

  // Load all biz_months for accountant fee tracking
  const monthIds = state.months.map((m) => m.id);
  const { data: allBiz } = await sb.from('biz_months').select('*').in('month_id', monthIds);
  state.allBiz = allBiz || [];
}

// ── Admin data loading ────────────────────────────────────────────────
async function loadAdminData() {
  const { data: items, error: itemsErr } = await sb
    .from('admin_items')
    .select('*')
    .eq('year', state.currentYear)
    .order('created_at');
  if (itemsErr) toast('Could not load admin data');
  state.admin.items = items || [];

  const { data: allocs } = await sb
    .from('admin_allocations')
    .select('*')
    .eq('year', state.currentYear);
  state.admin.allocations = {};
  (allocs || []).forEach((a) => {
    state.admin.allocations[a.month_num] = a as AdminAllocationRow;
  });

  const { data: subs } = await sb.from('admin_sub_items').select('*').order('created_at');
  state.admin.subItems = subs || [];
}

// ── Travel data loading ────────────────────────────────────────────────
async function loadTravelData() {
  const { data: items, error: itemsErr } = await sb
    .from('travel_items')
    .select('*')
    .eq('year', state.currentYear)
    .order('created_at');
  if (itemsErr) toast('Could not load travel data');
  state.travel.items = items || [];
  const { data: payments } = await sb
    .from('travel_payments')
    .select('*')
    .eq('year', state.currentYear)
    .order('month_num,created_at');
  state.travel.payments = payments || [];
  const { data: subs } = await sb.from('travel_sub_items').select('*').order('created_at');
  state.travel.subItems = subs || [];
  // allocations from budgets table
  const { data: budgetRows } = await sb
    .from('budgets')
    .select('month_id,amount')
    .eq('category', 'travel');
  state.travel.allocations = {};
  (budgetRows || []).forEach((b) => {
    const m = state.months.find((m) => m.id === b.month_id);
    if (m)
      state.travel.allocations[m.month_num] = {
        month_id: b.month_id,
        amount: b.amount,
        id: b.month_id,
      } as AdminAllocationRow;
  });
}

// ── Charity data loading ──────────────────────────────────────────────
async function loadCharityData() {
  const { data: items, error: itemsErr } = await sb
    .from('charity_items')
    .select('*')
    .eq('year', state.currentYear)
    .order('created_at');
  if (itemsErr) toast('Could not load charity data');
  state.charity.items = items || [];
  const { data: payments } = await sb
    .from('charity_payments')
    .select('*')
    .eq('year', state.currentYear)
    .order('month_num,created_at');
  state.charity.payments = payments || [];
  const { data: subs } = await sb.from('charity_sub_items').select('*').order('created_at');
  state.charity.subItems = subs || [];
  // allocations from budgets table
  const { data: budgetRows } = await sb
    .from('budgets')
    .select('month_id,amount')
    .eq('category', 'charity');
  state.charity.allocations = {};
  (budgetRows || []).forEach((b) => {
    const m = state.months.find((m) => m.id === b.month_id);
    if (m)
      state.charity.allocations[m.month_num] = {
        month_id: b.month_id,
        amount: b.amount,
        id: b.month_id,
      } as AdminAllocationRow;
  });
}

// ── Charity CRUD ──────────────────────────────────────────────────────
async function addCharityItem(): Promise<void> {
  const { data, error } = await sb
    .from('charity_items')
    .insert({ year: state.currentYear, label: 'New item', projected_amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error adding item');
    return;
  }
  state.charity.items.push(data);
  logChange(
    'add',
    'charity_item',
    (data as Record<string, unknown>)?.['id'] as string,
    `Added charity item: New item`,
    null,
    data,
  );
  renderApp();
}

async function saveCharityItem(id: string, field: string, value: unknown): Promise<void> {
  const item = state.charity.items.find((i) => i.id === id);
  if (!item) return;
  const oldVal = item[field];
  const val =
    field === 'projected_amount'
      ? parseFloat(String(value)) || 0
      : field === 'is_estimate' || field === 'is_logged'
        ? Boolean(value)
        : value;
  await sb
    .from('charity_items')
    .update({ [field]: val })
    .eq('id', id);
  item[field] = val;
  logChange(
    'edit',
    'charity_item',
    id,
    `Charity item changed: ${item.label} ${field} ${oldVal} → ${val}`,
    { [field]: oldVal },
    { [field]: val },
  );
  pushUndo({
    label: 'edit ' + field,
    undo: async () => {
      await sb
        .from('charity_items')
        .update({ [field]: oldVal })
        .eq('id', id);
      item[field] = oldVal;
      renderApp();
    },
    redo: async () => {
      await sb
        .from('charity_items')
        .update({ [field]: val })
        .eq('id', id);
      item[field] = val;
      renderApp();
    },
  });
  renderApp();
}

async function deleteCharityItem(id: string): Promise<void> {
  const snap = state.charity.items.find((i) => i.id === id);
  if (!snap) return;
  await sb.from('charity_items').delete().eq('id', id);
  logChange(
    'delete',
    'charity_item',
    id,
    `Deleted charity item: ${snap.label} ₪${snap.projected_amount}`,
    snap,
    null,
  );
  state.charity.items = state.charity.items.filter((i) => i.id !== id);
  pushUndo({
    label: 'delete charity item',
    undo: async () => {
      const { data } = await sb.from('charity_items').insert(snap).select().single();
      if (data) {
        state.charity.items.push(data);
      }
      renderApp();
    },
    redo: async () => {
      await sb.from('charity_items').delete().eq('id', id);
      state.charity.items = state.charity.items.filter((i) => i.id !== id);
      renderApp();
    },
  });
  renderApp();
  toastDeleted(snap.label, snap.projected_amount);
}

async function addCharitySub(itemId: string): Promise<void> {
  const { data, error } = await sb
    .from('charity_sub_items')
    .insert({ item_id: itemId, label: '', amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error');
    return;
  }
  state.charity.subItems.push(data);
  localStorage.setItem('sn-chr-' + itemId, '1');
  renderApp();
}

async function updateCharitySub(id: string, field: string, value: unknown): Promise<void> {
  const s = state.charity.subItems.find((s) => s.id === id);
  if (!s) return;
  const val =
    field === 'amount'
      ? parseFloat(String(value)) || 0
      : field === 'is_paid'
        ? Boolean(value)
        : (value as string);
  await sb
    .from('charity_sub_items')
    .update({ [field]: val })
    .eq('id', id);
  s[field] = val;
  renderApp();
}

async function deleteCharitySub(id: string): Promise<void> {
  await sb.from('charity_sub_items').delete().eq('id', id);
  state.charity.subItems = state.charity.subItems.filter((s) => s.id !== id);
  renderApp();
}

async function saveCharityAllocation(monthNum: number, value: string | number): Promise<void> {
  const num = parseFloat(String(value)) || 0;
  const existing = state.charity.allocations[monthNum];
  const oldNum = existing ? Number(existing.amount) : 0;
  if (existing) {
    await sb
      .from('budgets')
      .update({ amount: num })
      .eq('month_id', existing.month_id)
      .eq('category', 'charity');
    existing.amount = num;
  } else {
    const month = state.months.find((m) => m.month_num === monthNum);
    if (!month) return;
    await sb.from('budgets').insert({ month_id: month.id, category: 'charity', amount: num });
    state.charity.allocations[monthNum] = {
      month_id: month.id,
      amount: num,
      id: month.id,
      year: state.currentYear,
      month_num: monthNum,
    } as AdminAllocationRow;
  }
  state.budgets['charity'] = num;
  logChange(
    'edit',
    'charity_allocation',
    null,
    `Charity allocation month ${monthNum}: ₪${oldNum} → ₪${num}`,
    { amount: oldNum },
    { amount: num },
  );
  pushUndo({
    label: 'edit charity allocation',
    undo: async () => {
      const ex = state.charity.allocations[monthNum];
      if (ex) {
        await sb
          .from('budgets')
          .update({ amount: oldNum })
          .eq('month_id', ex.month_id)
          .eq('category', 'charity');
        ex.amount = oldNum;
      }
      renderApp();
    },
    redo: async () => {
      const ex = state.charity.allocations[monthNum];
      if (ex) {
        await sb
          .from('budgets')
          .update({ amount: num })
          .eq('month_id', ex.month_id)
          .eq('category', 'charity');
        ex.amount = num;
      }
      renderApp();
    },
  });
  renderApp();
}

async function addCharityPayment() {
  const monthNum = parseInt(byId('cp-month').value);
  const label = byId('cp-label').value.trim();
  const dateVal = byId('cp-date').value || null;
  const amount = parseFloat(byId('cp-amount').value);
  if (!label || !amount || isNaN(amount)) {
    toast('Fill in name and amount');
    return;
  }
  const { data, error } = await sb
    .from('charity_payments')
    .insert({ year: state.currentYear, month_num: monthNum, label, amount, payment_date: dateVal })
    .select()
    .single();
  if (error) {
    toast('Error saving');
    return;
  }
  state.charity.payments.push(data);
  state.charity.payments.sort((a, b) => a.month_num - b.month_num);
  byId('cp-label').value = '';
  byId('cp-date').value = '';
  byId('cp-amount').value = '';
  renderApp();
  toast('Payment logged ✓');
}

async function deleteCharityPayment(id: string): Promise<void> {
  const snap = { ...state.charity.payments.find((p) => p.id === id) };
  await sb.from('charity_payments').delete().eq('id', id);
  state.charity.payments = state.charity.payments.filter((p) => p.id !== id);
  logChange(
    'delete',
    'charity_payment',
    id,
    `Deleted charity payment: ${snap.label} ₪${snap.amount}`,
    snap,
    null,
  );
  pushUndo({
    label: 'delete charity payment',
    undo: async () => {
      const { data } = await sb.from('charity_payments').insert(snap).select().single();
      if (data) {
        state.charity.payments.push(data);
        state.charity.payments.sort((a, b) => a.month_num - b.month_num);
      }
      renderApp();
    },
    redo: async () => {
      await sb.from('charity_payments').delete().eq('id', id);
      state.charity.payments = state.charity.payments.filter((p) => p.id !== id);
      renderApp();
    },
  });
  renderApp();
  toastDeleted(snap.label, snap.amount);
}

async function updateCharityPayment(id: string, field: string, value: unknown): Promise<void> {
  const p = state.charity.payments.find((p) => p.id === id);
  if (!p) return;
  const oldVal = p[field];
  const val =
    field === 'amount'
      ? parseFloat(String(value)) || 0
      : field === 'is_estimate' || field === 'has_receipt' || field === 'is_given'
        ? Boolean(value)
        : value;
  await sb
    .from('charity_payments')
    .update({ [field]: val })
    .eq('id', id);
  p[field] = val;
  logChange(
    'edit',
    'charity_payment',
    id,
    `Charity payment changed: ${p.label} ${field} ${oldVal} → ${val}`,
    { [field]: oldVal },
    { [field]: val },
  );
  pushUndo({
    label: 'edit charity payment',
    undo: async () => {
      await sb
        .from('charity_payments')
        .update({ [field]: oldVal })
        .eq('id', id);
      p[field] = oldVal;
      renderApp();
    },
    redo: async () => {
      await sb
        .from('charity_payments')
        .update({ [field]: val })
        .eq('id', id);
      p[field] = val;
      renderApp();
    },
  });
  renderApp();
}

// ── Travel CRUD ────────────────────────────────────────────────────────
async function addTravelItem(): Promise<void> {
  const { data, error } = await sb
    .from('travel_items')
    .insert({ year: state.currentYear, label: 'New item', projected_amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error adding item');
    return;
  }
  state.travel.items.push(data);
  logChange(
    'add',
    'travel_item',
    (data as Record<string, unknown>)?.['id'] as string,
    `Added travel item: New item`,
    null,
    data,
  );
  renderApp();
}

async function saveTravelItem(id: string, field: string, value: unknown): Promise<void> {
  const item = state.travel.items.find((i) => i.id === id);
  if (!item) return;
  const oldVal = item[field];
  const val =
    field === 'projected_amount'
      ? parseFloat(String(value)) || 0
      : field === 'is_estimate' || field === 'is_logged'
        ? Boolean(value)
        : value;
  await sb
    .from('travel_items')
    .update({ [field]: val })
    .eq('id', id);
  item[field] = val;
  logChange(
    'edit',
    'travel_item',
    id,
    `Travel item changed: ${item.label} ${field} ${oldVal} → ${val}`,
    { [field]: oldVal },
    { [field]: val },
  );
  pushUndo({
    label: 'edit ' + field,
    undo: async () => {
      await sb
        .from('travel_items')
        .update({ [field]: oldVal })
        .eq('id', id);
      item[field] = oldVal;
      renderApp();
    },
    redo: async () => {
      await sb
        .from('travel_items')
        .update({ [field]: val })
        .eq('id', id);
      item[field] = val;
      renderApp();
    },
  });
  renderApp();
}

async function deleteTravelItem(id: string): Promise<void> {
  const snap = state.travel.items.find((i) => i.id === id);
  if (!snap) return;
  await sb.from('travel_items').delete().eq('id', id);
  logChange(
    'delete',
    'travel_item',
    id,
    `Deleted travel item: ${snap.label} ₪${snap.projected_amount}`,
    snap,
    null,
  );
  state.travel.items = state.travel.items.filter((i) => i.id !== id);
  pushUndo({
    label: 'delete travel item',
    undo: async () => {
      const { data } = await sb.from('travel_items').insert(snap).select().single();
      if (data) {
        state.travel.items.push(data);
      }
      renderApp();
    },
    redo: async () => {
      await sb.from('travel_items').delete().eq('id', id);
      state.travel.items = state.travel.items.filter((i) => i.id !== id);
      renderApp();
    },
  });
  renderApp();
  toastDeleted(snap.label, snap.projected_amount);
}

async function addTravelSub(itemId: string): Promise<void> {
  const { data, error } = await sb
    .from('travel_sub_items')
    .insert({ item_id: itemId, label: '', amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error');
    return;
  }
  state.travel.subItems.push(data);
  localStorage.setItem('sn-trv-' + itemId, '1');
  renderApp();
}

async function updateTravelSub(id: string, field: string, value: unknown): Promise<void> {
  const s = state.travel.subItems.find((s) => s.id === id);
  if (!s) return;
  const val =
    field === 'amount'
      ? parseFloat(String(value)) || 0
      : field === 'is_paid'
        ? Boolean(value)
        : (value as string);
  await sb
    .from('travel_sub_items')
    .update({ [field]: val })
    .eq('id', id);
  s[field] = val;
  renderApp();
}

async function deleteTravelSub(id: string): Promise<void> {
  await sb.from('travel_sub_items').delete().eq('id', id);
  state.travel.subItems = state.travel.subItems.filter((s) => s.id !== id);
  renderApp();
}

async function saveTravelAllocation(monthNum: number, value: string | number): Promise<void> {
  const num = parseFloat(String(value)) || 0;
  const existing = state.travel.allocations[monthNum];
  const oldNum = existing ? Number(existing.amount) : 0;
  if (existing) {
    await sb
      .from('budgets')
      .update({ amount: num })
      .eq('month_id', existing.month_id)
      .eq('category', 'travel');
    existing.amount = num;
  } else {
    const month = state.months.find((m) => m.month_num === monthNum);
    if (!month) return;
    await sb.from('budgets').upsert({ month_id: month.id, category: 'travel', amount: num });
    state.travel.allocations[monthNum] = {
      month_id: month.id,
      amount: num,
      id: month.id,
      year: state.currentYear,
      month_num: monthNum,
    } as AdminAllocationRow;
  }
  state.budgets['travel'] = num;
  logChange(
    'edit',
    'travel_allocation',
    null,
    `Travel allocation month ${monthNum}: ₪${oldNum} → ₪${num}`,
    { amount: oldNum },
    { amount: num },
  );
  pushUndo({
    label: 'edit travel allocation',
    undo: async () => {
      const ex = state.travel.allocations[monthNum];
      if (ex) {
        await sb
          .from('budgets')
          .update({ amount: oldNum })
          .eq('month_id', ex.month_id)
          .eq('category', 'travel');
        ex.amount = oldNum;
      }
      renderApp();
    },
    redo: async () => {
      const ex = state.travel.allocations[monthNum];
      if (ex) {
        await sb
          .from('budgets')
          .update({ amount: num })
          .eq('month_id', ex.month_id)
          .eq('category', 'travel');
        ex.amount = num;
      }
      renderApp();
    },
  });
  renderApp();
}

async function addTravelPayment() {
  const monthNum = parseInt(byId('tp-month').value);
  const label = byId('tp-label').value.trim();
  const destination = byId('tp-dest').value.trim();
  const amount = parseFloat(byId('tp-amount').value);
  if (!label || !amount || isNaN(amount)) {
    toast('Fill in what and amount');
    return;
  }
  const { data, error } = await sb
    .from('travel_payments')
    .insert({ year: state.currentYear, month_num: monthNum, label, destination, amount })
    .select()
    .single();
  if (error) {
    toast('Error saving');
    return;
  }
  state.travel.payments.push(data);
  state.travel.payments.sort((a, b) => a.month_num - b.month_num);
  byId('tp-label').value = '';
  byId('tp-dest').value = '';
  byId('tp-amount').value = '';
  renderApp();
  toast('Payment logged ✓');
}

async function deleteTravelPayment(id: string): Promise<void> {
  const snap = { ...state.travel.payments.find((p) => p.id === id) };
  await sb.from('travel_payments').delete().eq('id', id);
  state.travel.payments = state.travel.payments.filter((p) => p.id !== id);
  logChange(
    'delete',
    'travel_payment',
    id,
    `Deleted travel payment: ${snap.label} ₪${snap.amount}`,
    snap,
    null,
  );
  pushUndo({
    label: 'delete travel payment',
    undo: async () => {
      const { data } = await sb.from('travel_payments').insert(snap).select().single();
      if (data) {
        state.travel.payments.push(data);
        state.travel.payments.sort((a, b) => a.month_num - b.month_num);
      }
      renderApp();
    },
    redo: async () => {
      await sb.from('travel_payments').delete().eq('id', id);
      state.travel.payments = state.travel.payments.filter((p) => p.id !== id);
      renderApp();
    },
  });
  renderApp();
  toastDeleted(snap.label, snap.amount);
}

async function updateTravelPayment(id: string, field: string, value: unknown): Promise<void> {
  const p = state.travel.payments.find((p) => p.id === id);
  if (!p) return;
  const oldVal = p[field];
  const val =
    field === 'amount'
      ? parseFloat(String(value)) || 0
      : field === 'is_estimate'
        ? Boolean(value)
        : (value as string);
  await sb
    .from('travel_payments')
    .update({ [field]: val })
    .eq('id', id);
  p[field] = val;
  logChange(
    'edit',
    'travel_payment',
    id,
    `Travel payment changed: ${p.label} ${field} ${oldVal} → ${val}`,
    { [field]: oldVal },
    { [field]: val },
  );
  pushUndo({
    label: 'edit travel payment',
    undo: async () => {
      await sb
        .from('travel_payments')
        .update({ [field]: oldVal })
        .eq('id', id);
      p[field] = oldVal;
      renderApp();
    },
    redo: async () => {
      await sb
        .from('travel_payments')
        .update({ [field]: val })
        .eq('id', id);
      p[field] = val;
      renderApp();
    },
  });
  renderApp();
}

// ── Travel tab render ──────────────────────────────────────────────────
function renderTravelTab() {
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const items = state.travel.items || [];
  const allocs = state.travel.allocations || {};
  const currentMonthObj = state.months.find((m) => m.id === state.currentMonthId);
  const currentMonthNum = currentMonthObj ? currentMonthObj.month_num : null;
  const payments = state.travel.payments || [];

  const budget = ag(items.reduce((s, i) => s + Number(i.projected_amount), 0));
  const totalAlloc = ag(Object.values(allocs).reduce((s, a) => s + Number(a.amount), 0));
  const gap = ag(budget - totalAlloc);
  const totalSpent = ag(payments.reduce((s, p) => s + Number(p.amount), 0));
  const remaining = ag(budget - totalSpent);

  const fmtA = (n: number): string =>
    '₪' +
    Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: string | null | undefined): string => (s || '').replace(/"/g, '&quot;');

  const tvSort = localStorage.getItem('travelItemSort') || 'created';
  const sortedItems = [...items].sort((a, b) => {
    if (tvSort === 'alpha') return (a.label || '').localeCompare(b.label || '');
    if (tvSort === 'alpha-desc') return (b.label || '').localeCompare(a.label || '');
    if (tvSort === 'amount-high') return Number(b.projected_amount) - Number(a.projected_amount);
    if (tvSort === 'amount-low') return Number(a.projected_amount) - Number(b.projected_amount);
    return 0;
  });
  const itemsTravelHtml = sortedItems
    .map((item) => {
      const subs = (state.travel.subItems || []).filter((s) => s.item_id === item.id);
      const isOpen = localStorage.getItem('sn-trv-' + item.id) === '1';
      const paidTotal = subs.filter((s) => s.is_paid).reduce((n, s) => n + Number(s.amount), 0);
      const subBadge =
        subs.length > 0
          ? '<span style="font-size:.6rem;color:var(--muted);margin-left:.3rem;">' +
            subs.filter((s) => s.is_paid).length +
            '/' +
            subs.length +
            ' paid</span>'
          : '';
      const rowOpacity = item.is_logged ? 'opacity:.45;' : '';
      const strikeLabel = item.is_logged ? 'text-decoration:line-through;' : '';
      const amtColor = item.is_estimate ? 'var(--amber)' : 'var(--text)';
      const estBg = item.is_estimate ? 'var(--ambersoft, #fff8e1)' : 'none';
      const estBorder = item.is_estimate ? 'var(--amber)' : 'var(--border)';
      const estColor = item.is_estimate ? 'var(--amber)' : 'var(--dim)';
      const estWeight = item.is_estimate ? '700' : '400';
      const logBg = item.is_logged ? 'var(--gsoft)' : 'none';
      const logBorder = item.is_logged ? 'var(--accent)' : 'var(--border)';
      const logColor = item.is_logged ? 'var(--accent)' : 'var(--dim)';
      const logIcon = item.is_logged ? '✓' : '○';
      let subsHtml = '';
      if (isOpen) {
        const subRows = subs
          .map((s) => {
            const sPaid = s.is_paid;
            const sRowOp = sPaid ? 'opacity:.5;' : '';
            const sStrike = sPaid ? 'text-decoration:line-through;' : '';
            const sBg = sPaid ? 'var(--gsoft)' : 'none';
            const sBorder = sPaid ? 'var(--accent)' : 'var(--border)';
            const sColor = sPaid ? 'var(--accent)' : 'var(--dim)';
            const sIcon = sPaid ? '✓' : '○';
            return (
              '<div style="display:grid;grid-template-columns:1fr 80px 28px 28px;gap:.25rem;align-items:center;padding:.2rem 0;' +
              sRowOp +
              '">' +
              '<input type="text" value="' +
              esc(s.label) +
              '" placeholder="note (optional)" style="font-size:.75rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.05rem .2rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;' +
              sStrike +
              '" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelSub(\'' +
              s.id +
              "','label',this.value)\">" +
              '<input type="number" value="' +
              (s.amount || '') +
              '" placeholder="₪" min="0" step="1" style="font-size:.75rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.05rem .1rem;color:var(--text);outline:none;text-align:right;width:100%;-moz-appearance:textfield;' +
              sStrike +
              '" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelSub(\'' +
              s.id +
              "','amount',this.value)\">" +
              '<button onclick="updateTravelSub(\'' +
              s.id +
              "','is_paid'," +
              !s.is_paid +
              ')" title="' +
              (sPaid ? 'Mark as unpaid' : 'Mark as paid') +
              '" style="background:' +
              sBg +
              ';border:1px solid ' +
              sBorder +
              ';border-radius:4px;color:' +
              sColor +
              ';cursor:pointer;font-size:.75rem;padding:.1rem .2rem;line-height:1;font-weight:700;">' +
              sIcon +
              '</button>' +
              '<button onclick="deleteTravelSub(\'' +
              s.id +
              '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.8rem;padding:.1rem .2rem;line-height:1;">×</button>' +
              '</div>'
            );
          })
          .join('');
        const paidSummary =
          subs.length > 0
            ? '<div style="font-size:.68rem;color:var(--muted);margin-top:.2rem;font-family:\'DM Mono\',monospace;">paid ' +
              fmtA(paidTotal) +
              ' of ' +
              fmtA(Number(item.projected_amount || 0)) +
              '</div>'
            : '';
        subsHtml =
          '<div style="padding:.3rem .5rem .5rem 1.5rem;background:var(--surface2);border-radius:0 0 6px 6px;">' +
          subRows +
          '<button onclick="addTravelSub(\'' +
          item.id +
          '\')" style="margin-top:.3rem;background:none;border:none;color:var(--accent);font-size:.72rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;padding:.1rem 0;">+ add payment</button>' +
          paidSummary +
          '</div>';
      }
      return (
        '<div style="border-bottom:1px solid var(--border);">' +
        '<div style="display:grid;grid-template-columns:16px 1fr 90px 42px 28px 28px;gap:.25rem;align-items:center;padding:.3rem .1rem;' +
        rowOpacity +
        '">' +
        '<button onclick="var k=\'sn-trv-' +
        item.id +
        "';localStorage.setItem(k,localStorage.getItem(k)==='1'?'0':'1');renderApp()\" style=\"background:none;border:none;cursor:pointer;color:var(--dim);font-size:.7rem;padding:0;line-height:1;text-align:center;\" title=\"Show/hide sub-payments\">" +
        (isOpen ? '▾' : '▸') +
        '</button>' +
        '<div style="display:flex;align-items:baseline;min-width:0;"><input type="text" value="' +
        esc(item.label) +
        '" placeholder="Item name" style="font-size:.82rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .2rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;' +
        strikeLabel +
        '" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="saveTravelItem(\'' +
        item.id +
        "','label',this.value)\">" +
        subBadge +
        '</div>' +
        '<input type="number" value="' +
        (item.projected_amount || '') +
        '" placeholder="0" min="0" step="1" style="font-size:.82rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .2rem;color:' +
        amtColor +
        ';outline:none;text-align:right;width:100%;-moz-appearance:textfield;' +
        strikeLabel +
        '" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="saveTravelItem(\'' +
        item.id +
        "','projected_amount',this.value)\">" +
        '<button onclick="saveTravelItem(\'' +
        item.id +
        "','is_estimate'," +
        !item.is_estimate +
        ')" title="' +
        (item.is_estimate ? 'Marked as estimate — click to confirm exact' : 'Mark as estimate') +
        '" style="background:' +
        estBg +
        ';border:1px solid ' +
        estBorder +
        ';border-radius:4px;color:' +
        estColor +
        ';cursor:pointer;font-size:.65rem;padding:.1rem .2rem;font-weight:' +
        estWeight +
        ";font-family:'DM Sans',sans-serif;width:100%;\">~est</button>" +
        '<button onclick="deleteTravelItem(\'' +
        item.id +
        '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .2rem;line-height:1;">×</button>' +
        '<button onclick="saveTravelItem(\'' +
        item.id +
        "','is_logged'," +
        !item.is_logged +
        ')" title="' +
        (item.is_logged ? 'Mark as not logged' : 'Mark as logged/done') +
        '" style="background:' +
        logBg +
        ';border:1px solid ' +
        logBorder +
        ';border-radius:4px;color:' +
        logColor +
        ';cursor:pointer;font-size:.8rem;padding:.1rem .2rem;line-height:1;font-weight:700;">' +
        logIcon +
        '</button>' +
        '</div>' +
        subsHtml +
        '</div>'
      );
    })
    .join('');

  // Pre-compute payment log HTML
  let payLogHtml = '';
  // DT8 — show grouped per-trip view even when ZERO payments exist anywhere,
  // so trips with allocation-but-no-log still surface ("No payments logged
  // yet" placeholder per trip). Only fall back to the flat empty state when
  // there are no trips defined at all.
  if (payments.length === 0 && (!items || items.length === 0)) {
    payLogHtml =
      '<div style="color:var(--dim);font-size:.78rem;padding:.6rem 0;font-style:italic;">No payments logged yet — use the form above to add the first one.</div>';
  } else {
    const ps = localStorage.getItem('travelPaySort') || 'month';
    const sorted = [...payments].sort((a, b) => {
      if (ps === 'month') return a.month_num - b.month_num;
      if (ps === 'month-desc') return b.month_num - a.month_num;
      if (ps === 'high') return Number(b.amount) - Number(a.amount);
      if (ps === 'low') return Number(a.amount) - Number(b.amount);
      return 0;
    });
    const sb2 = (key: string, label: string): string =>
      "<button onclick=\"localStorage.setItem('travelPaySort','" +
      key +
      '\');renderApp()" style="background:none;border:1px solid ' +
      (ps === key ? 'var(--accent)' : 'var(--border)') +
      ';border-radius:4px;font-size:.64rem;padding:.1rem .3rem;cursor:pointer;color:' +
      (ps === key ? 'var(--accent)' : 'var(--muted)') +
      ";font-family:'DM Sans',sans-serif;font-weight:" +
      (ps === key ? '600' : '400') +
      ';">' +
      label +
      '</button>';
    const destFilter = (localStorage.getItem('travelDestFilter') || '').toLowerCase();
    const filtered = destFilter
      ? (sorted as TravelPaymentRow[]).filter((p) =>
          ((p.destination as string) || '').toLowerCase().includes(destFilter),
        )
      : sorted;
    const groupByTrip = localStorage.getItem('travelGroupByTrip') !== 'false'; // default on
    // Helper to render a single payment row (reused in grouped + flat modes)
    const renderPayRow = (p: TravelPaymentRow): string => {
      const destVal = esc(p.destination || '');
      const estBgP = p.is_estimate ? 'background:var(--ambersoft,#fffbf0);' : '';
      const amtColorP = p.is_estimate ? 'var(--amber)' : 'var(--text)';
      const amtWeightP = p.is_estimate ? '700' : '400';
      const estBtnBg = p.is_estimate ? 'var(--ambersoft,#fff3cd)' : 'none';
      const estBtnBorder = p.is_estimate ? 'var(--amber)' : 'var(--border)';
      const estBtnColor = p.is_estimate ? 'var(--amber)' : 'var(--dim)';
      const estBtnWeight = p.is_estimate ? '700' : '400';
      return (
        '<div class="travel-pay-row" style="display:grid;grid-template-columns:45px 80px 1fr 80px 38px 26px;gap:.25rem;align-items:center;padding:.28rem .1rem;border-bottom:1px solid var(--border);font-size:.8rem;' +
        estBgP +
        '">' +
        '<span class="travel-pay-mo" style="font-size:.7rem;color:var(--muted);font-family:\'DM Mono\',monospace;">' +
        MONTH_NAMES[p.month_num - 1] +
        '</span>' +
        '<input class="travel-pay-where" type="text" value="' +
        destVal +
        '" placeholder="Where" style="font-size:.8rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .15rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelPayment(\'' +
        p.id +
        "','destination',this.value)\">" +
        '<input class="travel-pay-what" type="text" value="' +
        esc(p.label) +
        '" style="font-size:.8rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .15rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelPayment(\'' +
        p.id +
        "','label',this.value)\">" +
        '<input class="travel-pay-amt" type="number" value="' +
        p.amount +
        '" min="0" step="0.01" style="font-size:.8rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .1rem;color:' +
        amtColorP +
        ';font-weight:' +
        amtWeightP +
        ';outline:none;text-align:right;width:100%;-moz-appearance:textfield;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelPayment(\'' +
        p.id +
        "','amount',this.value)\">" +
        '<button class="travel-pay-est" onclick="updateTravelPayment(\'' +
        p.id +
        "','is_estimate'," +
        !p.is_estimate +
        ')" title="' +
        (p.is_estimate ? 'Marked as estimate — click to confirm' : 'Mark as estimate') +
        '" style="background:' +
        estBtnBg +
        ';border:1px solid ' +
        estBtnBorder +
        ';border-radius:4px;color:' +
        estBtnColor +
        ';cursor:pointer;font-size:.62rem;padding:.1rem .15rem;font-weight:' +
        estBtnWeight +
        ";font-family:'DM Sans',sans-serif;width:100%;\">~est</button>" +
        '<button class="travel-pay-x" onclick="deleteTravelPayment(\'' +
        p.id +
        '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .25rem;line-height:1;">×</button>' +
        '</div>'
      );
    };
    const payRows = (filtered as TravelPaymentRow[]).map(renderPayRow).join('');
    // Group-by-trip view: section per destination, with allocated vs spent header
    let groupedHtml = '';
    if (groupByTrip) {
      const allocByTrip: Record<string, number> = {};
      (items || []).forEach((it) => {
        allocByTrip[(it.label || '').trim().toLowerCase()] = Number(it.projected_amount) || 0;
      });
      // DT8 — case/whitespace-insensitive grouping. Previously the group key
      // used the raw `destination` value, so a payment "erin- north cascade"
      // and an item label "Erin- North Cascade" produced TWO cards for the
      // same trip. Normalize the bucket key (lowercase, trimmed) but keep
      // a display name per bucket (prefer the item label when available).
      const norm = (s: string | null | undefined): string => (s || '').trim().toLowerCase();
      const groups: Record<string, TravelPaymentRow[]> = {};
      const displayNames: Record<string, string> = {}; // norm key -> presentation string
      filtered.forEach((p) => {
        const k = norm((p as TravelPaymentRow).destination) || '(unassigned)';
        if (!groups[k]) groups[k] = [];
        groups[k].push(p as TravelPaymentRow);
        if (!displayNames[k])
          displayNames[k] = ((p as TravelPaymentRow).destination || '').trim() || '(unassigned)';
      });
      // Stable trip order: items first (INCLUDING items with no payments yet),
      // then unknown destinations from payments, then unassigned. Match items
      // to payment buckets by normalized key so casing variants don't split.
      const itemEntries = (items || [])
        .map((it) => ({ raw: (it.label || '').trim(), key: norm(it.label) }))
        .filter((e) => e.raw);
      const seen = new Set();
      const orderedKeys = [];
      // DT5 + DT8 — empty-state visibility: include EVERY known trip (even with
      // zero payments) so trips that exist in Yearly Expenses but haven't seen
      // a payment yet still appear with their "₪0 of ₪X" header. Item label
      // wins for display so the user sees the canonical trip name.
      itemEntries.forEach((e) => {
        orderedKeys.push(e.key);
        seen.add(e.key);
        displayNames[e.key] = e.raw; // item label is canonical
      });
      Object.keys(groups).forEach((k) => {
        if (!seen.has(k) && k !== '(unassigned)') {
          orderedKeys.push(k);
          seen.add(k);
        }
      });
      if (groups['(unassigned)']) orderedKeys.push('(unassigned)');
      groupedHtml = orderedKeys
        .map((tripKey) => {
          const tripName = displayNames[tripKey] || tripKey;
          const ps = groups[tripKey] || [];
          const tripSpent = ps.reduce(
            (s: number, p: TravelPaymentRow) => s + (Number(p.amount) || 0),
            0,
          );
          const tripAlloc = allocByTrip[tripKey] || 0;
          const headerNote = tripAlloc
            ? '<span style="font-size:.7rem;color:var(--muted);font-family:\'DM Mono\',monospace;">' +
              fmtA(tripSpent) +
              ' of ' +
              fmtA(tripAlloc) +
              '</span>'
            : '<span style="font-size:.7rem;color:var(--muted);font-family:\'DM Mono\',monospace;">' +
              fmtA(tripSpent) +
              ' spent</span>';
          // DT5 — fail-loud empty state per trip. If a known trip has no payments
          // logged yet, surface that explicitly instead of an empty section.
          const bodyHtml =
            ps.length === 0
              ? '<div style="font-size:.7rem;color:var(--dim);font-style:italic;padding:.45rem .25rem;">No payments logged yet</div>'
              : ps.map(renderPayRow).join('');
          return (
            '<div style="margin-bottom:.7rem;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem .25rem .25rem;border-bottom:1px solid var(--accent);margin-bottom:.15rem;">' +
            '<span style="font-size:.78rem;font-weight:700;color:var(--accent);">✈️ ' +
            esc(tripName) +
            '</span>' +
            headerNote +
            '</div>' +
            bodyHtml +
            '</div>'
          );
        })
        .join('');
    }
    const destFilterDisplay = localStorage.getItem('travelDestFilter') || '';
    const groupBtn =
      "<button onclick=\"localStorage.setItem('travelGroupByTrip', " +
      (!groupByTrip).toString() +
      ');renderApp()" style="font-size:.65rem;padding:.18rem .5rem;border:1px solid ' +
      (groupByTrip ? 'var(--accent)' : 'var(--border)') +
      ';border-radius:99px;background:' +
      (groupByTrip ? 'var(--gsoft)' : 'none') +
      ';color:' +
      (groupByTrip ? 'var(--accent)' : 'var(--muted)') +
      ";cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:" +
      (groupByTrip ? '700' : '500') +
      ';" title="Toggle grouping by trip">' +
      (groupByTrip ? '✓ Group by trip' : 'Group by trip') +
      '</button>';
    payLogHtml =
      '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">' +
      '<input type="text" value="' +
      esc(destFilterDisplay) +
      '" placeholder="🔍 Filter by destination…" style="flex:1;font-size:.74rem;padding:.25rem .5rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:\'DM Sans\',sans-serif;outline:none;" oninput="localStorage.setItem(\'travelDestFilter\',this.value);renderApp()">' +
      (destFilterDisplay
        ? '<button onclick="localStorage.removeItem(\'travelDestFilter\');renderApp()" style="font-size:.7rem;padding:.2rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:none;color:var(--muted);cursor:pointer;">✕ clear</button>'
        : '') +
      groupBtn +
      '</div>' +
      '<div class="tab-sort-row" style="display:flex;align-items:center;gap:.3rem;padding-bottom:.4rem;">' +
      '<span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Sort:</span>' +
      sb2('month', 'Mo ↑') +
      sb2('month-desc', 'Mo ↓') +
      sb2('high', 'Highest') +
      sb2('low', 'Lowest') +
      '</div>' +
      '<div class="travel-pay-scroll" style="overflow-x:auto;"><div class="travel-pay-inner" style="min-width:360px;">' +
      (groupByTrip
        ? groupedHtml
        : '<div class="travel-pay-row travel-pay-header" style="display:grid;grid-template-columns:45px 80px 1fr 80px 38px 26px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .1rem .35rem;border-bottom:1px solid var(--border);">' +
          '<span class="travel-pay-mo">Mo</span><span class="travel-pay-where">Where</span><span class="travel-pay-what">What</span><span class="travel-pay-amt" style="text-align:right">Amount</span><span class="travel-pay-est" style="text-align:center">~est</span><span class="travel-pay-x"></span>' +
          '</div>' +
          payRows) +
      '</div></div>' +
      // DT7 — ground "Total spent" with the year budget so the number reads in
      // context. Without "of \$X budget" the spend feels free-floating; with it
      // you can see at a glance how close YTD spending is to the year pot.
      '<div style="margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:baseline;">' +
      '<span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total spent</span>' +
      '<span style="font-family:\'DM Mono\',monospace;font-size:.85rem;font-weight:600;">' +
      fmtA(totalSpent) +
      '<span style="font-weight:400;color:var(--dim);font-size:.72rem;margin-left:.35rem;">of ' +
      fmtA(budget) +
      ' budget</span>' +
      '</span>' +
      '</div>';
  }

  // Pre-compute allocation grid HTML
  const allocGridHtml = MONTH_NAMES.map((mn, i) => {
    const mnum = i + 1;
    const val = allocs[mnum] ? allocs[mnum].amount : '';
    const isCurrent = mnum === currentMonthNum;
    const rowBg = isCurrent ? 'var(--gsoft)' : 'var(--surface2)';
    const rowBorder = isCurrent ? 'var(--accent)' : 'transparent';
    const labelColor = isCurrent ? 'var(--accent)' : 'var(--muted)';
    const labelWeight = isCurrent ? '700' : '600';
    const inputColor = isCurrent ? 'var(--accent)' : 'var(--text)';
    const inputWeight = isCurrent ? '600' : '400';
    return (
      '<div class="travel-alloc-cell" style="display:flex;justify-content:space-between;align-items:center;padding:.25rem .4rem;background:' +
      rowBg +
      ';border-radius:6px;border:1px solid ' +
      rowBorder +
      ';">' +
      '<span style="font-size:.72rem;color:' +
      labelColor +
      ';font-weight:' +
      labelWeight +
      ';">' +
      mn +
      '</span>' +
      "<span style=\"width:60px;font-size:.78rem;font-family:'DM Mono',monospace;text-align:right;color:" +
      inputColor +
      ';font-weight:' +
      inputWeight +
      ';display:inline-block;" title="Set from Budget page">' +
      (val ? fmtA(val) : '₪0') +
      '</span>' +
      '</div>'
    );
  }).join('');

  const gapColor = gap > 0 ? 'var(--red)' : 'var(--green)';
  const gapText = gap > 0 ? '(−' + fmtA(gap) + ' gap)' : '✓';
  const allocTotalColor = gap > 0 ? 'var(--red)' : 'var(--green)';
  const monthSelectHtml = MONTH_NAMES.map(
    (mn, i) =>
      '<option value="' +
      (i + 1) +
      '"' +
      (i + 1 === currentMonthNum ? ' selected' : '') +
      '>' +
      mn +
      '</option>',
  ).join('');

  const sortBtnsHtml = [
    ['created', 'Added'],
    ['alpha', 'A→Z'],
    ['alpha-desc', 'Z→A'],
    ['amount-high', 'High'],
    ['amount-low', 'Low'],
  ]
    .map(([k, lbl]) => {
      const active = tvSort === k;
      return (
        "<button onclick=\"localStorage.setItem('travelItemSort','" +
        k +
        '\');renderApp()" style="font-size:.6rem;padding:.1rem .35rem;border:1px solid ' +
        (active ? 'var(--accent)' : 'var(--border)') +
        ';border-radius:4px;background:' +
        (active ? 'var(--gsoft)' : 'none') +
        ';color:' +
        (active ? 'var(--accent)' : 'var(--dim)') +
        ";cursor:pointer;font-family:'DM Sans',sans-serif;\">" +
        lbl +
        '</button>'
      );
    })
    .join('');

  return `
  <div style="max-width:1100px;margin:0 auto;padding:1.5rem 1rem;">
    <!-- DT1 — explicit year-scope label (mirrors Admin DA1). Travel is one yearly
         pot per workflow rules (reference_budget_workflow.md) — the active month
         chip doesn't filter the strip, so make that contract visible. -->
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap;">
      <span style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--info,var(--muted));background:var(--infosoft,var(--surface2));padding:.18rem .45rem;border-radius:99px;border:1px solid var(--border);">📅 Yearly view</span>
      <span style="font-size:.62rem;color:var(--dim);font-style:italic;">Travel is one year-long pot — the active month chip doesn't filter this strip.</span>
    </div>
    <!-- Summary Bar -->
    <div class="tab-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem;margin-bottom:1.5rem;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Budget</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(budget)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">projected for the year</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Allocated</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalAlloc)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">set aside (all months)</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Gap</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:${gapColor};">${fmtA(Math.abs(gap))}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">${gap > 0 ? 'still need to find' : 'fully covered ✓'}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Spent</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalSpent)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">paid YTD</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--accent);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.4rem;">Remaining</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:var(--accent);">${fmtA(remaining)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">budget − YTD spent</div>
      </div>
    </div>

    <div class="tab-two-col" style="display:grid;grid-template-columns:1.1fr 1fr;gap:1.25rem;align-items:start;">

      <!-- LEFT: Yearly Items -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);">Yearly Expenses</div>
          <div class="tab-sort-row" style="display:flex;gap:.25rem;">${sortBtnsHtml}</div>
        </div>
        <div style="font-size:.6rem;color:var(--dim);margin-bottom:.6rem;">~est = estimate &nbsp;|&nbsp; × = delete &nbsp;|&nbsp; ○ = mark done</div>
        <div style="display:grid;grid-template-columns:1fr 90px 42px 28px 28px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .25rem .4rem;border-bottom:1px solid var(--border);">
          <span>Item</span><span style="text-align:right;">Projected</span><span style="text-align:center;">~est</span><span></span><span style="text-align:center;">✓</span>
        </div>
        ${itemsTravelHtml}
        <button onclick="addTravelItem()" style="margin-top:.6rem;background:none;border:none;color:var(--accent);font-size:.78rem;cursor:pointer;font-family:'DM Sans',sans-serif;padding:.2rem 0;">+ add item</button>
        <div style="margin-top:.6rem;padding-top:.6rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total</span>
          <span style="font-family:'DM Mono',monospace;font-size:.88rem;font-weight:600;">${fmtA(budget)}</span>
        </div>
      </div>

      <!-- RIGHT: Allocations + Payments -->
      <div style="display:flex;flex-direction:column;gap:1rem;">

        <!-- Monthly Allocations -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.9rem;">Monthly Allocation</div>
          <div class="travel-alloc-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">${allocGridHtml}</div>
          <div style="margin-top:.7rem;padding-top:.6rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
            <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total allocated</span>
            <span style="font-family:'DM Mono',monospace;font-size:.85rem;font-weight:600;color:${allocTotalColor};">${fmtA(totalAlloc)} ${gapText}</span>
          </div>
        </div>

        <!-- Payment Log -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.9rem;">Payment Log</div>

          <!-- Add payment form -->
          <div class="pay-add-form" style="display:grid;grid-template-columns:70px 1fr 1fr 80px 28px;gap:.35rem;align-items:end;margin-bottom:.8rem;padding-bottom:.8rem;border-bottom:1px solid var(--border);">
            <select id="tp-month" style="font-size:.74rem;padding:.3rem .3rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">${monthSelectHtml}</select>
            <input type="text" id="tp-dest" placeholder="Trip" list="tp-trip-list" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addTravelPayment()">
            <datalist id="tp-trip-list">
              ${(state.travel.items || [])
                .filter((i) => i.label)
                .map((i) => '<option value="' + esc(i.label) + '">')
                .join('')}
            </datalist>
            <input type="text" id="tp-label" placeholder="What" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addTravelPayment()">
            <input type="number" id="tp-amount" placeholder="₪" min="0" step="0.01" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Mono',monospace;outline:none;-moz-appearance:textfield;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addTravelPayment()">
            <button onclick="addTravelPayment()" style="padding:.3rem .4rem;background:var(--accent);color:white;border:none;border-radius:var(--r);font-size:.8rem;cursor:pointer;font-weight:600;">+</button>
          </div>

          ${payLogHtml}
        </div>
      </div>
    </div>
  </div>`;
}

// ── Charity tab render ────────────────────────────────────────────────
function renderCharityTab() {
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const items = state.charity.items || [];
  const allocs = state.charity.allocations || {};
  const currentMonthObj = state.months.find((m) => m.id === state.currentMonthId);
  const currentMonthNum = currentMonthObj ? currentMonthObj.month_num : null;
  const payments = state.charity.payments || [];

  const budget = ag(items.reduce((s, i) => s + Number(i.projected_amount), 0));
  const totalAlloc = ag(Object.values(allocs).reduce((s, a) => s + Number(a.amount), 0));
  const gap = ag(budget - totalAlloc);
  const totalPaid = ag(payments.reduce((s, p) => s + (p.is_given ? Number(p.amount) : 0), 0));
  const totalPledged = ag(payments.reduce((s, p) => s + (!p.is_given ? Number(p.amount) : 0), 0));
  const totalSpent = ag(totalPaid + totalPledged);
  const _remaining_u2 = ag(budget - totalSpent);
  void _remaining_u2;

  const fmtA = (n: number): string =>
    '₪' +
    Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: unknown): string => String(s || '').replace(/"/g, '&quot;');

  // Pre-compute sort buttons HTML
  const ciSort = localStorage.getItem('charityItemSort') || 'created';
  const _sortBtnsHtml_u2 = [
    ['created', 'Added'],
    ['alpha', 'A→Z'],
    ['alpha-desc', 'Z→A'],
    ['amount-high', 'High'],
    ['amount-low', 'Low'],
  ]
    .map(([k, lbl]) => {
      const active = ciSort === k;
      return (
        "<button onclick=\"localStorage.setItem('charityItemSort','" +
        k +
        '\');renderApp()" style="font-size:.6rem;padding:.1rem .35rem;border:1px solid ' +
        (active ? 'var(--accent)' : 'var(--border)') +
        ';border-radius:4px;background:' +
        (active ? 'var(--gsoft)' : 'none') +
        ';color:' +
        (active ? 'var(--accent)' : 'var(--dim)') +
        ";cursor:pointer;font-family:'DM Sans',sans-serif;\">" +
        lbl +
        '</button>'
      );
    })
    .join('');
  void _sortBtnsHtml_u2;

  // Pre-compute items HTML
  const sortedItems = [...items].sort((a, b) => {
    if (ciSort === 'alpha') return (a.label || '').localeCompare(b.label || '');
    if (ciSort === 'alpha-desc') return (b.label || '').localeCompare(a.label || '');
    if (ciSort === 'amount-high') return Number(b.projected_amount) - Number(a.projected_amount);
    if (ciSort === 'amount-low') return Number(a.projected_amount) - Number(b.projected_amount);
    return 0;
  });
  const _itemsCharityHtml_u = sortedItems
    .map((item) => {
      const subs = (state.charity.subItems || []).filter((s) => s.item_id === item.id);
      const isOpen = localStorage.getItem('sn-chr-' + item.id) === '1';
      const paidTotal = subs.filter((s) => s.is_paid).reduce((n, s) => n + Number(s.amount), 0);
      const subBadge =
        subs.length > 0
          ? '<span style="font-size:.6rem;color:var(--muted);margin-left:.3rem;">' +
            subs.filter((s) => s.is_paid).length +
            '/' +
            subs.length +
            ' paid</span>'
          : '';
      const rowOpacity = item.is_logged ? 'opacity:.45;' : '';
      const strikeLabel = item.is_logged ? 'text-decoration:line-through;' : '';
      const amtColor = item.is_estimate ? 'var(--amber)' : 'var(--text)';
      const estBg = item.is_estimate ? 'var(--ambersoft, #fff8e1)' : 'none';
      const estBorder = item.is_estimate ? 'var(--amber)' : 'var(--border)';
      const estColor = item.is_estimate ? 'var(--amber)' : 'var(--dim)';
      const estWeight = item.is_estimate ? '700' : '400';
      const logBg = item.is_logged ? 'var(--gsoft)' : 'none';
      const logBorder = item.is_logged ? 'var(--accent)' : 'var(--border)';
      const logColor = item.is_logged ? 'var(--accent)' : 'var(--dim)';
      const logIcon = item.is_logged ? '✓' : '○';
      let subsHtml = '';
      if (isOpen) {
        const subRows = subs
          .map((s) => {
            const sPaid = s.is_paid;
            const sRowOp = sPaid ? 'opacity:.5;' : '';
            const sStrike = sPaid ? 'text-decoration:line-through;' : '';
            const sBg = sPaid ? 'var(--gsoft)' : 'none';
            const sBorder = sPaid ? 'var(--accent)' : 'var(--border)';
            const sColor = sPaid ? 'var(--accent)' : 'var(--dim)';
            const sIcon = sPaid ? '✓' : '○';
            return (
              '<div style="display:grid;grid-template-columns:1fr 80px 28px 28px;gap:.25rem;align-items:center;padding:.2rem 0;' +
              sRowOp +
              '">' +
              '<input type="text" value="' +
              esc(s.label) +
              '" placeholder="note (optional)" style="font-size:.75rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.05rem .2rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;' +
              sStrike +
              '" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharitySub(\'' +
              s.id +
              "','label',this.value)\">" +
              '<input type="number" value="' +
              (s.amount || '') +
              '" placeholder="₪" min="0" step="1" style="font-size:.75rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.05rem .1rem;color:var(--text);outline:none;text-align:right;width:100%;-moz-appearance:textfield;' +
              sStrike +
              '" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharitySub(\'' +
              s.id +
              "','amount',this.value)\">" +
              '<button onclick="updateCharitySub(\'' +
              s.id +
              "','is_paid'," +
              !s.is_paid +
              ')" title="' +
              (sPaid ? 'Mark as unpaid' : 'Mark as paid') +
              '" style="background:' +
              sBg +
              ';border:1px solid ' +
              sBorder +
              ';border-radius:4px;color:' +
              sColor +
              ';cursor:pointer;font-size:.75rem;padding:.1rem .2rem;line-height:1;font-weight:700;">' +
              sIcon +
              '</button>' +
              '<button onclick="deleteCharitySub(\'' +
              s.id +
              '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.8rem;padding:.1rem .2rem;line-height:1;">×</button>' +
              '</div>'
            );
          })
          .join('');
        void _itemsCharityHtml_u;

        const paidSummary =
          subs.length > 0
            ? '<div style="font-size:.68rem;color:var(--muted);margin-top:.2rem;font-family:\'DM Mono\',monospace;">paid ' +
              fmtA(paidTotal) +
              ' of ' +
              fmtA(Number(item.projected_amount || 0)) +
              '</div>'
            : '';
        subsHtml =
          '<div style="padding:.3rem .5rem .5rem 1.5rem;background:var(--surface2);border-radius:0 0 6px 6px;">' +
          subRows +
          '<button onclick="addCharitySub(\'' +
          item.id +
          '\')" style="margin-top:.3rem;background:none;border:none;color:var(--accent);font-size:.72rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;padding:.1rem 0;">+ add payment</button>' +
          paidSummary +
          '</div>';
      }
      return (
        '<div style="border-bottom:1px solid var(--border);">' +
        '<div style="display:grid;grid-template-columns:16px 1fr 90px 42px 28px 28px;gap:.25rem;align-items:center;padding:.3rem .1rem;' +
        rowOpacity +
        '">' +
        '<button onclick="var k=\'sn-chr-' +
        item.id +
        "';localStorage.setItem(k,localStorage.getItem(k)==='1'?'0':'1');renderApp()\" style=\"background:none;border:none;cursor:pointer;color:var(--dim);font-size:.7rem;padding:0;line-height:1;text-align:center;\" title=\"Show/hide sub-payments\">" +
        (isOpen ? '▾' : '▸') +
        '</button>' +
        '<div style="display:flex;align-items:baseline;min-width:0;"><input type="text" value="' +
        esc(item.label) +
        '" placeholder="Item name" style="font-size:.82rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .2rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;' +
        strikeLabel +
        '" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="saveCharityItem(\'' +
        item.id +
        "','label',this.value)\">" +
        subBadge +
        '</div>' +
        '<input type="number" value="' +
        (item.projected_amount || '') +
        '" placeholder="0" min="0" step="1" style="font-size:.82rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .2rem;color:' +
        amtColor +
        ';outline:none;text-align:right;width:100%;-moz-appearance:textfield;' +
        strikeLabel +
        '" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="saveCharityItem(\'' +
        item.id +
        "','projected_amount',this.value)\">" +
        '<button onclick="saveCharityItem(\'' +
        item.id +
        "','is_estimate'," +
        !item.is_estimate +
        ')" title="' +
        (item.is_estimate ? 'Marked as estimate — click to confirm exact' : 'Mark as estimate') +
        '" style="background:' +
        estBg +
        ';border:1px solid ' +
        estBorder +
        ';border-radius:4px;color:' +
        estColor +
        ';cursor:pointer;font-size:.65rem;padding:.1rem .2rem;font-weight:' +
        estWeight +
        ";font-family:'DM Sans',sans-serif;width:100%;\">~est</button>" +
        '<button onclick="deleteCharityItem(\'' +
        item.id +
        '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .2rem;line-height:1;">×</button>' +
        '<button onclick="saveCharityItem(\'' +
        item.id +
        "','is_logged'," +
        !item.is_logged +
        ')" title="' +
        (item.is_logged ? 'Mark as not logged' : 'Mark as logged/done') +
        '" style="background:' +
        logBg +
        ';border:1px solid ' +
        logBorder +
        ';border-radius:4px;color:' +
        logColor +
        ';cursor:pointer;font-size:.8rem;padding:.1rem .2rem;line-height:1;font-weight:700;">' +
        logIcon +
        '</button>' +
        '</div>' +
        subsHtml +
        '</div>'
      );
    })
    .join('');

  // Pre-compute payment log HTML
  let payLogHtml = '';
  if (payments.length === 0) {
    payLogHtml =
      '<div style="color:var(--dim);font-size:.78rem;padding:.3rem 0;">No payments yet</div>';
  } else {
    const ps = localStorage.getItem('charityPaySort') || 'month';
    const sorted = [...payments].sort((a, b) => {
      if (ps === 'month') return a.month_num - b.month_num;
      if (ps === 'month-desc') return b.month_num - a.month_num;
      if (ps === 'high') return Number(b.amount) - Number(a.amount);
      if (ps === 'low') return Number(a.amount) - Number(b.amount);
      return 0;
    });
    const sb2 = (key: string, label: string): string =>
      "<button onclick=\"localStorage.setItem('charityPaySort','" +
      key +
      '\');renderApp()" style="background:none;border:1px solid ' +
      (ps === key ? 'var(--accent)' : 'var(--border)') +
      ';border-radius:4px;font-size:.64rem;padding:.1rem .3rem;cursor:pointer;color:' +
      (ps === key ? 'var(--accent)' : 'var(--muted)') +
      ";font-family:'DM Sans',sans-serif;font-weight:" +
      (ps === key ? '600' : '400') +
      ';">' +
      label +
      '</button>';
    const payRows = sorted
      .map((p) => {
        const estBgP = p.is_estimate ? 'background:var(--ambersoft,#fffbf0);' : '';
        const amtColorP = p.is_estimate ? 'var(--amber)' : 'var(--text)';
        const amtWeightP = p.is_estimate ? '700' : '400';
        const estBtnBg = p.is_estimate ? 'var(--ambersoft,#fff3cd)' : 'none';
        const estBtnBorder = p.is_estimate ? 'var(--amber)' : 'var(--border)';
        const estBtnColor = p.is_estimate ? 'var(--amber)' : 'var(--dim)';
        const estBtnWeight = p.is_estimate ? '700' : '400';
        return (
          '<div class="charity-pay-row" style="display:grid;grid-template-columns:45px 1fr 90px 80px 28px 28px 38px 26px;gap:.25rem;align-items:center;padding:.28rem .1rem;border-bottom:1px solid var(--border);font-size:.8rem;' +
          estBgP +
          '">' +
          '<span class="charity-pay-mo" style="font-size:.7rem;color:var(--muted);font-family:\'DM Mono\',monospace;">' +
          MONTH_NAMES[p.month_num - 1] +
          '</span>' +
          '<input class="charity-pay-name" type="text" value="' +
          esc(p.label) +
          '" placeholder="Charity" style="font-size:.8rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .15rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharityPayment(\'' +
          p.id +
          "','label',this.value)\">" +
          '<input class="charity-pay-date" type="date" value="' +
          (p.payment_date || '') +
          '" style="font-size:.74rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .1rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharityPayment(\'' +
          p.id +
          "','payment_date',this.value)\">" +
          '<input class="charity-pay-amt" type="number" value="' +
          p.amount +
          '" min="0" step="0.01" style="font-size:.8rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .1rem;color:' +
          amtColorP +
          ';font-weight:' +
          amtWeightP +
          ';outline:none;text-align:right;width:100%;-moz-appearance:textfield;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharityPayment(\'' +
          p.id +
          "','amount',this.value)\">" +
          '<button class="charity-pay-receipt" onclick="updateCharityPayment(\'' +
          p.id +
          "','has_receipt'," +
          !p.has_receipt +
          ')" title="Has receipt" style="background:' +
          (p.has_receipt ? 'var(--gsoft)' : 'none') +
          ';border:1px solid ' +
          (p.has_receipt ? 'var(--accent)' : 'var(--border)') +
          ';border-radius:4px;color:' +
          (p.has_receipt ? 'var(--accent)' : 'var(--dim)') +
          ';cursor:pointer;font-size:.75rem;padding:.1rem .2rem;line-height:1;">' +
          (p.has_receipt ? '🧾' : '□') +
          '</button>' +
          '<button class="charity-pay-given" onclick="updateCharityPayment(\'' +
          p.id +
          "','is_given'," +
          !p.is_given +
          ')" title="Mark as given" style="background:' +
          (p.is_given ? 'var(--gsoft)' : 'none') +
          ';border:1px solid ' +
          (p.is_given ? 'var(--accent)' : 'var(--border)') +
          ';border-radius:4px;color:' +
          (p.is_given ? 'var(--accent)' : 'var(--dim)') +
          ';cursor:pointer;font-size:.8rem;padding:.1rem .2rem;line-height:1;font-weight:700;">' +
          (p.is_given ? '✓' : '○') +
          '</button>' +
          '<button class="charity-pay-est" onclick="updateCharityPayment(\'' +
          p.id +
          "','is_estimate'," +
          !p.is_estimate +
          ')" title="' +
          (p.is_estimate ? 'Marked as estimate — click to confirm' : 'Mark as estimate') +
          '" style="background:' +
          estBtnBg +
          ';border:1px solid ' +
          estBtnBorder +
          ';border-radius:4px;color:' +
          estBtnColor +
          ';cursor:pointer;font-size:.62rem;padding:.1rem .15rem;font-weight:' +
          estBtnWeight +
          ";font-family:'DM Sans',sans-serif;width:100%;\">~est</button>" +
          '<button class="charity-pay-x" onclick="deleteCharityPayment(\'' +
          p.id +
          '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .25rem;line-height:1;">×</button>' +
          '</div>'
        );
      })
      .join('');
    payLogHtml =
      '<div class="tab-sort-row" style="display:flex;align-items:center;gap:.3rem;padding-bottom:.4rem;">' +
      '<span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Sort:</span>' +
      sb2('month', 'Mo ↑') +
      sb2('month-desc', 'Mo ↓') +
      sb2('high', 'Highest') +
      sb2('low', 'Lowest') +
      '</div>' +
      '<div class="charity-pay-scroll" style="overflow-x:auto;"><div class="charity-pay-inner" style="min-width:400px;">' +
      '<div class="charity-pay-header" style="display:grid;grid-template-columns:45px 1fr 90px 80px 28px 28px 38px 26px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .1rem .35rem;border-bottom:1px solid var(--border);">' +
      '<span>Mo</span><span>Charity</span><span>Date</span><span style="text-align:right">Amount</span><span style="text-align:center">🧾</span><span style="text-align:center">✓</span><span style="text-align:center">~est</span><span></span>' +
      '</div>' +
      payRows +
      '</div></div>' +
      '<div style="margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">' +
      '<span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total given</span>' +
      '<span style="font-family:\'DM Mono\',monospace;font-size:.85rem;font-weight:600;">' +
      fmtA(totalSpent) +
      '</span>' +
      '</div>';
  }

  // Pre-compute allocation grid HTML
  const allocGridHtml = MONTH_NAMES.map((mn, i) => {
    const mnum = i + 1;
    const val = allocs[mnum] ? allocs[mnum].amount : '';
    const isCurrent = mnum === currentMonthNum;
    const rowBg = isCurrent ? 'var(--gsoft)' : 'var(--surface2)';
    const rowBorder = isCurrent ? 'var(--accent)' : 'transparent';
    const labelColor = isCurrent ? 'var(--accent)' : 'var(--muted)';
    const labelWeight = isCurrent ? '700' : '600';
    const inputColor = isCurrent ? 'var(--accent)' : 'var(--text)';
    const inputWeight = isCurrent ? '600' : '400';
    // % of that month's income the charity allocation represents
    const monthObj = state.months.find((m) => m.month_num === mnum);
    const monthIncome = monthObj ? totalIncome(monthObj) : 0;
    const pct = val && monthIncome ? ((Number(val) / monthIncome) * 100).toFixed(1) : null;
    return (
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:.25rem .4rem;background:' +
      rowBg +
      ';border-radius:6px;border:1px solid ' +
      rowBorder +
      ';">' +
      '<span style="font-size:.72rem;color:' +
      labelColor +
      ';font-weight:' +
      labelWeight +
      ';">' +
      mn +
      '</span>' +
      '<span style="display:flex;flex-direction:column;align-items:flex-end;line-height:1.15;">' +
      "<span style=\"font-size:.78rem;font-family:'DM Mono',monospace;text-align:right;color:" +
      inputColor +
      ';font-weight:' +
      inputWeight +
      ';" title="Set from Budget page">' +
      (val ? fmtA(val) : '₪0') +
      '</span>' +
      (pct
        ? '<span style="font-size:.58rem;font-family:\'DM Mono\',monospace;color:var(--dim);">' +
          pct +
          '% of income</span>'
        : '') +
      '</span>' +
      '</div>'
    );
  }).join('');
  // const _gapColorC = gap > 0 ? 'var(--red)' : 'var(--green)'; // unused
  const gapTextC = gap > 0 ? '(−' + fmtA(gap) + ' gap)' : '✓';
  const allocTotalColorC = gap > 0 ? 'var(--red)' : 'var(--green)';
  const monthSelectHtml = MONTH_NAMES.map(
    (mn, i) =>
      '<option value="' +
      (i + 1) +
      '"' +
      (i + 1 === currentMonthNum ? ' selected' : '') +
      '>' +
      mn +
      '</option>',
  ).join('');

  return `
  <div style="max-width:1100px;margin:0 auto;padding:1.5rem 1rem;">
    <!-- Summary Bar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:.75rem;margin-bottom:1.5rem;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Allocated</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalAlloc)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">set aside so far</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Paid</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalPaid)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">+ <span style="color:var(--amber);font-weight:600;">${fmtA(totalPledged)}</span> pledged · <strong>${fmtA(totalSpent)}</strong> total</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--accent);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.4rem;">Remaining to Give</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:var(--accent);">${fmtA(totalAlloc - totalPaid)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">free now · after pledges: <strong style="color:${totalAlloc - totalSpent < 0 ? 'var(--red)' : 'var(--text)'};">${fmtA(totalAlloc - totalSpent)}</strong></div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:1.25rem;">

      <!-- Allocations + Payments -->
      <div style="display:flex;flex-direction:column;gap:1rem;">

        <!-- Monthly Allocations -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.9rem;">Monthly Allocation</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">${allocGridHtml}</div>
          <div style="margin-top:.7rem;padding-top:.6rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
            <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total allocated</span>
            <span style="font-family:'DM Mono',monospace;font-size:.85rem;font-weight:600;color:${allocTotalColorC};">${fmtA(totalAlloc)} ${gapTextC}</span>
          </div>
        </div>

        <!-- Payment Log -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.9rem;">Payment Log</div>

          <!-- Add payment form -->
          <div class="pay-add-form" style="display:grid;grid-template-columns:70px 1fr 90px 80px 28px;gap:.35rem;align-items:end;margin-bottom:.8rem;padding-bottom:.8rem;border-bottom:1px solid var(--border);">
            <select id="cp-month" style="font-size:.74rem;padding:.3rem .3rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">${monthSelectHtml}</select>
            <input type="text" id="cp-label" placeholder="Charity name" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addCharityPayment()">
            <input type="date" id="cp-date" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
            <input type="number" id="cp-amount" placeholder="₪" min="0" step="0.01" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Mono',monospace;outline:none;-moz-appearance:textfield;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addCharityPayment()">
            <button onclick="addCharityPayment()" style="padding:.3rem .4rem;background:var(--accent);color:white;border:none;border-radius:var(--r);font-size:.8rem;cursor:pointer;font-weight:600;">+</button>
          </div>

          ${payLogHtml}
        </div>
      </div>
    </div>
  </div>`;
}

// ── Admin tab render ──────────────────────────────────────────────────
function renderAdminTab() {
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const items = state.admin.items || [];
  const allocs = state.admin.allocations || {};
  const currentMonthObj = state.months.find((m) => m.id === state.currentMonthId);
  const currentMonthNum = currentMonthObj ? currentMonthObj.month_num : null;

  const budget = ag(items.reduce((s, i) => s + Number(i.projected_amount), 0));
  const totalAlloc = ag(Object.values(allocs).reduce((s, a) => s + Number(a.amount), 0));
  const gap = ag(budget - totalAlloc);
  const totalSpent = ag(
    (state.admin.subItems || []).filter((s) => s.is_paid).reduce((n, s) => n + Number(s.amount), 0),
  );
  const remaining = ag(budget - totalSpent);

  const fmtA = (n: number): string =>
    '₪' +
    Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s: unknown): string => String(s || '').replace(/"/g, '&quot;');

  // Pre-compute sort buttons HTML
  const aiSort = localStorage.getItem('adminItemSort') || 'created';
  const sortBtnsHtml = [
    ['created', 'Added'],
    ['alpha', 'A→Z'],
    ['alpha-desc', 'Z→A'],
    ['amount-high', 'High'],
    ['amount-low', 'Low'],
  ]
    .map(([k, lbl]) => {
      const active = aiSort === k;
      return (
        "<button onclick=\"localStorage.setItem('adminItemSort','" +
        k +
        '\');renderApp()" style="font-size:.6rem;padding:.1rem .35rem;border:1px solid ' +
        (active ? 'var(--accent)' : 'var(--border)') +
        ';border-radius:4px;background:' +
        (active ? 'var(--gsoft)' : 'none') +
        ';color:' +
        (active ? 'var(--accent)' : 'var(--dim)') +
        ";cursor:pointer;font-family:'DM Sans',sans-serif;\">" +
        lbl +
        '</button>'
      );
    })
    .join('');

  // Pre-compute items HTML — separate active from done, group by category
  const ADMIN_CATEGORIES = [
    'Apartment',
    'Car',
    'Furniture',
    'Health',
    'Professional',
    'Admin',
    'Other',
  ];
  const sortFn = (a: CharityItemRow, b: CharityItemRow): number => {
    if (aiSort === 'alpha') return (a.label || '').localeCompare(b.label || '');
    if (aiSort === 'alpha-desc') return (b.label || '').localeCompare(a.label || '');
    if (aiSort === 'amount-high') return Number(b.projected_amount) - Number(a.projected_amount);
    if (aiSort === 'amount-low') return Number(a.projected_amount) - Number(b.projected_amount);
    return 0;
  };
  // DA5 — filter Yearly Expenses by item-name substring (case-insensitive).
  // Persisted in localStorage so the input stays sticky across renders.
  const adminFilter = (localStorage.getItem('adminItemFilter') || '').toLowerCase();
  const matchFilter = (i: CharityItemRow): boolean =>
    !adminFilter || (i.label || '').toLowerCase().includes(adminFilter);
  const activeItems = [...items]
    .filter((i) => !i.is_logged)
    .filter(matchFilter)
    .sort(sortFn);
  const doneItems = [...items]
    .filter((i) => i.is_logged)
    .filter(matchFilter)
    .sort(sortFn);
  const showDone = localStorage.getItem('adminShowDone') === '1';
  const viewMode = localStorage.getItem('adminViewMode') || 'category';
  const catEmoji: Record<string, string> = {
    Apartment: '🏠',
    Car: '🚗',
    Furniture: '🪑',
    Health: '🏥',
    Professional: '📚',
    Admin: '📋',
    Other: '📌',
  };
  const renderItemRow = (item: CharityItemRow): string => {
    const subs = (state.admin.subItems || []).filter((s) => s.item_id === item.id);
    const isOpen = localStorage.getItem('sn-adm-' + item.id) === '1';
    const paidTotal = subs.filter((s) => s.is_paid).reduce((n, s) => n + Number(s.amount), 0);
    const remaining = Number(item.projected_amount || 0) - paidTotal;
    const subBadge =
      paidTotal > 0
        ? '<span style="font-size:.6rem;color:var(--accent);margin-left:.3rem;">' +
          fmtA(paidTotal) +
          ' paid</span>' +
          (remaining > 0
            ? '<span style="font-size:.6rem;color:var(--muted);margin-left:.3rem;">' +
              fmtA(remaining) +
              ' left</span>'
            : '')
        : '';
    const rowOpacity = item.is_logged ? 'opacity:.55;' : '';
    const strikeLabel = item.is_logged ? 'text-decoration:line-through;' : '';
    const amtColor =
      paidTotal > 0 ? 'var(--muted)' : item.is_estimate ? 'var(--amber)' : 'var(--text)';
    const estBg = item.is_estimate ? 'var(--ambersoft, #fff8e1)' : 'none';
    const estBorder = item.is_estimate ? 'var(--amber)' : 'var(--border)';
    const estColor = item.is_estimate ? 'var(--amber)' : 'var(--dim)';
    const estWeight = item.is_estimate ? '700' : '400';
    const _logBg_u2 = item.is_logged ? 'var(--gsoft)' : 'none';
    void _logBg_u2;
    const _logBorder_u2 = item.is_logged ? 'var(--accent)' : 'var(--border)';
    void _logBorder_u2;
    const _logColor_u2 = item.is_logged ? 'var(--accent)' : 'var(--dim)';
    void _logColor_u2;
    const logIcon = item.is_logged ? '✓' : '';
    let subsHtml = '';
    if (isOpen) {
      // const _paidCount = subs.filter((s) => s.is_paid).length; // unused
      const subRows = subs
        .map((s) => {
          const sPaid = s.is_paid;
          const sRowOp = sPaid ? 'opacity:.55;' : '';
          const sStrike = sPaid ? 'text-decoration:line-through;' : '';
          const sEstimate = s.is_estimate;
          const sMonthNum = s.month_num || todayMonthForYear();
          const monthOptions = MONTH_NAMES.map(
            (mn, mi) =>
              '<option value="' +
              (mi + 1) +
              '"' +
              (mi + 1 === sMonthNum ? ' selected' : '') +
              '>' +
              mn +
              '</option>',
          ).join('');
          return (
            '<div style="display:grid;grid-template-columns:22px 55px 1fr 80px 36px 22px;gap:.35rem;align-items:center;padding:.25rem 0;' +
            sRowOp +
            '">' +
            '<div onclick="updateAdminSub(\'' +
            s.id +
            "','is_paid'," +
            !s.is_paid +
            ')" title="' +
            (sPaid ? 'Mark unpaid' : 'Mark paid') +
            '" style="width:16px;height:16px;border-radius:3px;border:2px solid ' +
            (sPaid ? 'var(--accent)' : 'var(--border)') +
            ';background:' +
            (sPaid ? 'var(--accent)' : 'none') +
            ';cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;font-size:.6rem;font-weight:700;transition:all .15s ease;">' +
            (sPaid ? '✓' : '') +
            '</div>' +
            '<select onchange="updateAdminSub(\'' +
            s.id +
            "','month_num',parseInt(this.value))\" style=\"font-size:.65rem;padding:.1rem .15rem;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--muted);font-family:'DM Sans',sans-serif;outline:none;cursor:pointer;\">" +
            monthOptions +
            '</select>' +
            '<input type="text" value="' +
            esc(s.label) +
            '" placeholder="What was this payment for?" style="font-size:.75rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.05rem .2rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;' +
            sStrike +
            '" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateAdminSub(\'' +
            s.id +
            "','label',this.value)\">" +
            '<input type="number" value="' +
            (s.amount || '') +
            '" placeholder="₪ amount" min="0" step="1" style="font-size:.75rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.05rem .1rem;color:var(--text);outline:none;text-align:right;width:100%;-moz-appearance:textfield;' +
            sStrike +
            '" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateAdminSub(\'' +
            s.id +
            "','amount',this.value)\">" +
            '<button onclick="updateAdminSub(\'' +
            s.id +
            "','is_estimate'," +
            !sEstimate +
            ')" title="' +
            (sEstimate ? 'Marked as estimate — click to confirm' : 'Mark as estimate') +
            '" style="background:' +
            (sEstimate ? 'var(--ambersoft,#fff3cd)' : 'none') +
            ';border:1px solid ' +
            (sEstimate ? 'var(--amber)' : 'var(--border)') +
            ';border-radius:4px;color:' +
            (sEstimate ? 'var(--amber)' : 'var(--dim)') +
            ';cursor:pointer;font-size:.58rem;padding:.1rem .1rem;font-weight:' +
            (sEstimate ? '700' : '400') +
            ";font-family:'DM Sans',sans-serif;line-height:1;\">~est</button>" +
            '<button onclick="deleteAdminSub(\'' +
            s.id +
            '\')" title="Delete" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:.75rem;padding:0;line-height:1;opacity:.5;" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=.5">×</button>' +
            '</div>'
          );
        })
        .join('');
      const catOptions = ADMIN_CATEGORIES.map(
        (c) =>
          '<option value="' +
          c +
          '"' +
          (c === (item.category || 'Other') ? ' selected' : '') +
          '>' +
          ((catEmoji as Record<string, string>)[c] || '') +
          ' ' +
          c +
          '</option>',
      ).join('');
      const projAmt = Number(item.projected_amount || 0);
      const pctPaid = projAmt > 0 ? Math.min(100, Math.round((paidTotal / projAmt) * 100)) : 0;
      const progressBar =
        projAmt > 0
          ? '<div style="margin-top:.4rem;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.2rem;"><span style="font-size:.65rem;color:var(--muted);">' +
            fmtA(paidTotal) +
            ' of ' +
            fmtA(projAmt) +
            ' paid</span><span style="font-size:.65rem;color:var(--accent);font-weight:600;">' +
            pctPaid +
            '%</span></div><div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;"><div style="height:100%;background:var(--accent);border-radius:2px;width:' +
            pctPaid +
            '%;transition:width .3s ease;"></div></div></div>'
          : '';
      subsHtml =
        '<div style="padding:.4rem .6rem .6rem 1.8rem;background:var(--surface2);border-radius:0 0 6px 6px;border-top:1px solid var(--border);">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem;">' +
        (subs.length > 0
          ? '<span style="font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);">Payments</span>'
          : '<span></span>') +
        '<select onchange="saveAdminItem(\'' +
        item.id +
        '\',\'category\',this.value)" style="font-size:.62rem;padding:.1rem .25rem;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--muted);font-family:\'DM Sans\',sans-serif;cursor:pointer;outline:none;" title="Category">' +
        catOptions +
        '</select>' +
        '</div>' +
        subRows +
        '<button onclick="addAdminSub(\'' +
        item.id +
        '\')" style="margin-top:.4rem;background:none;border:none;color:var(--accent);font-size:.72rem;cursor:pointer;font-family:\'DM Sans\',sans-serif;padding:.1rem 0;">+ add payment</button>' +
        progressBar +
        '</div>';
    }
    return (
      '<div data-admin-item-id="' +
      item.id +
      '" style="border-bottom:1px solid var(--border);">' +
      '<div style="display:grid;grid-template-columns:16px 1fr 90px 42px 28px 28px;gap:.25rem;align-items:center;padding:.3rem .1rem;' +
      rowOpacity +
      '">' +
      '<button onclick="var k=\'sn-adm-' +
      item.id +
      "';localStorage.setItem(k,localStorage.getItem(k)==='1'?'0':'1');renderApp()\" style=\"background:none;border:none;cursor:pointer;color:var(--dim);font-size:.7rem;padding:0;line-height:1;text-align:center;\" title=\"Show/hide sub-payments\">" +
      (isOpen ? '▾' : '▸') +
      '</button>' +
      '<div style="display:flex;align-items:baseline;min-width:0;gap:.3rem;flex-wrap:wrap;"><input type="text" value="' +
      esc(item.label) +
      '" placeholder="Item name" style="font-size:.82rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .2rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;flex:1 1 100%;min-width:0;' +
      strikeLabel +
      '" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="saveAdminItem(\'' +
      item.id +
      "','label',this.value)\">" +
      subBadge +
      '</div>' +
      '<input type="number" value="' +
      (item.projected_amount || '') +
      '" placeholder="0" min="0" step="1" style="font-size:.82rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .2rem;color:' +
      amtColor +
      ';outline:none;text-align:right;width:100%;-moz-appearance:textfield;' +
      strikeLabel +
      '" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="saveAdminItem(\'' +
      item.id +
      "','projected_amount',this.value)\">" +
      '<button onclick="saveAdminItem(\'' +
      item.id +
      "','is_estimate'," +
      !item.is_estimate +
      ')" title="' +
      (item.is_estimate ? 'This is an estimate — click to mark as exact' : 'Mark as estimate') +
      '" style="background:' +
      estBg +
      ';border:1px solid ' +
      estBorder +
      ';border-radius:12px;color:' +
      estColor +
      ';cursor:pointer;font-size:.6rem;padding:.15rem .35rem;font-weight:' +
      estWeight +
      ";font-family:'DM Sans',sans-serif;white-space:nowrap;\">est</button>" +
      '<button onclick="deleteAdminItem(\'' +
      item.id +
      '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .2rem;line-height:1;">×</button>' +
      '<div onclick="saveAdminItem(\'' +
      item.id +
      "','is_logged'," +
      !item.is_logged +
      ')" title="' +
      // DA4 — tooltip differs by sub-state. With existing sub-payments,
      // is_logged is a visibility-only toggle ("collapse into Completed").
      // Without sub-payments, the click auto-creates a [auto] full payment row
      // marked paid (line ~5240). Two behaviors, one control — make the
      // hover hint match.
      (item.is_logged
        ? 'Reopen — moves back to active list'
        : subs.length > 0
          ? 'Mark complete (collapses into Completed list — payments stay logged)'
          : 'Mark fully paid (auto-creates a payment record for this month)') +
      '" style="width:18px;height:18px;border-radius:4px;border:2px solid ' +
      (item.is_logged ? 'var(--accent)' : 'var(--border)') +
      ';background:' +
      (item.is_logged ? 'var(--accent)' : 'none') +
      ';cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;font-size:.7rem;font-weight:700;transition:all .15s ease;">' +
      logIcon +
      '</div>' +
      '</div>' +
      subsHtml +
      '</div>'
    );
  };

  // Build grouped or flat view
  let activeItemsHtml;
  if (viewMode === 'category') {
    const grouped: Record<string, AdminItemRow[]> = {};
    activeItems.forEach((item: AdminItemRow) => {
      const cat = item.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    activeItemsHtml = ADMIN_CATEGORIES.filter((c) => grouped[c] && grouped[c].length > 0)
      .map((cat) => {
        const catItems = grouped[cat];
        const catTotal = catItems.reduce((s, i) => s + Number(i.projected_amount), 0);
        return (
          '<div style="margin-top:.6rem;">' +
          '<div style="display:flex;align-items:center;gap:.35rem;padding:.25rem .2rem;margin-bottom:.15rem;">' +
          '<span style="font-size:.75rem;">' +
          ((catEmoji as Record<string, string>)[cat] || '📌') +
          '</span>' +
          '<span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);">' +
          cat +
          '</span>' +
          '<span style="font-size:.62rem;color:var(--dim);font-family:\'DM Mono\',monospace;margin-left:auto;">' +
          fmtA(catTotal) +
          '</span>' +
          '</div>' +
          catItems.map(renderItemRow).join('') +
          '</div>'
        );
      })
      .join('');
  } else {
    activeItemsHtml = activeItems.map(renderItemRow).join('');
  }
  const doneItemsHtml = doneItems.map(renderItemRow).join('');
  const doneTotal = doneItems.reduce((s, i) => s + Number(i.projected_amount), 0);

  return `
  <div style="max-width:1100px;margin:0 auto;padding:1.5rem 1rem;">
    <!-- DA1 — explicit year-scope label so the KPI strip isn't read as "May only"
         while the active month chip says May. Admin is yearly per workflow. -->
    <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">
      <span style="font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--info,var(--muted));background:var(--infosoft,var(--surface2));padding:.18rem .45rem;border-radius:99px;border:1px solid var(--border);">📅 Yearly view</span>
      <span style="font-size:.62rem;color:var(--dim);font-style:italic;">Admin runs as a year-long budget — the active month chip doesn't filter this strip.</span>
    </div>
    <!-- Summary Bar -->
    <div class="tab-kpi-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem;margin-bottom:1.5rem;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Budget</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(budget)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">projected for the year</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Allocated</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalAlloc)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">set aside (all months)</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Gap</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:${gap > 0 ? 'var(--red)' : 'var(--green)'};">${fmtA(Math.abs(gap))}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">${gap > 0 ? 'still need to find' : 'fully covered ✓'}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Spent</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalSpent)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">paid YTD</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--accent);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.4rem;">Remaining</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:var(--accent);">${fmtA(remaining)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">budget − YTD spent</div>
      </div>
    </div>

    <div class="tab-two-col" style="display:grid;grid-template-columns:1.1fr 1fr;gap:1.25rem;align-items:start;">

      <!-- LEFT: Yearly Items -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem;">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);">Yearly Expenses</div>
          <div class="tab-sort-row" style="display:flex;gap:.25rem;align-items:center;">
            <button onclick="localStorage.setItem('adminViewMode','${viewMode === 'category' ? 'list' : 'category'}');renderApp()" style="font-size:.6rem;padding:.1rem .35rem;border:1px solid ${viewMode === 'category' ? 'var(--accent)' : 'var(--border)'};border-radius:4px;background:${viewMode === 'category' ? 'var(--gsoft)' : 'none'};color:${viewMode === 'category' ? 'var(--accent)' : 'var(--dim)'};cursor:pointer;font-family:'DM Sans',sans-serif;" title="Toggle grouped/flat view">${viewMode === 'category' ? 'Grouped' : 'List'}</button>
            ${sortBtnsHtml}
          </div>
        </div>
        <!-- DA5 — substring filter on Yearly Expenses (22 active + 8 completed today;
             scales as items accumulate). Applies to BOTH active and completed lists. -->
        <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem;">
          <input type="text" value="${esc(adminFilter)}" placeholder="🔍 Filter by name…" style="flex:1;font-size:.74rem;padding:.3rem .55rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;" oninput="localStorage.setItem('adminItemFilter',this.value);renderApp()">
          ${
            adminFilter
              ? `<button onclick="localStorage.removeItem('adminItemFilter');renderApp()" style="font-size:.7rem;padding:.22rem .45rem;border:1px solid var(--border);border-radius:var(--r);background:none;color:var(--muted);cursor:pointer;font-family:'DM Sans',sans-serif;" title="Clear filter">✕</button>`
              : ''
          }
        </div>
        ${
          viewMode !== 'category'
            ? `<div style="display:grid;grid-template-columns:16px 1fr 90px 42px 28px 22px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .25rem .4rem;border-bottom:1px solid var(--border);">
          <span></span><span>Item</span><span style="text-align:right;">Projected</span><span style="text-align:center;">Est</span><span></span><span></span>
        </div>`
            : ''
        }
        ${
          activeItems.length === 0 && adminFilter
            ? `<div style="color:var(--dim);font-size:.78rem;padding:.6rem .25rem;font-style:italic;">No matches for &ldquo;${esc(adminFilter)}&rdquo;</div>`
            : ''
        }
        ${activeItemsHtml}
        <button onclick="addAdminItem()" style="margin-top:.6rem;background:none;border:none;color:var(--accent);font-size:.78rem;cursor:pointer;font-family:'DM Sans',sans-serif;padding:.2rem 0;">+ add item</button>
        ${
          doneItems.length > 0
            ? `
        <div style="margin-top:.8rem;padding-top:.6rem;border-top:1px solid var(--border);">
          <button onclick="localStorage.setItem('adminShowDone',localStorage.getItem('adminShowDone')==='1'?'0':'1');renderApp()" style="background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:.72rem;color:var(--muted);display:flex;align-items:center;gap:.3rem;padding:0;">
            <span style="font-size:.65rem;color:var(--dim);">${showDone ? '▾' : '▸'}</span>
            Completed (${doneItems.length}) — ${fmtA(doneTotal)}
          </button>
          ${showDone ? '<div style="margin-top:.35rem;">' + doneItemsHtml + '</div>' : ''}
        </div>`
            : ''
        }
        <div style="margin-top:.6rem;padding-top:.6rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total</span>
          <span style="font-family:'DM Mono',monospace;font-size:.88rem;font-weight:600;">${fmtA(budget)}</span>
        </div>
      </div>

      <!-- RIGHT: Allocations + Payments -->
      <div style="display:flex;flex-direction:column;gap:1rem;">

        <!-- Monthly Allocations -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.9rem;">Monthly Allocation</div>
          <div class="admin-alloc-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">
            ${MONTH_NAMES.map((mn, i) => {
              const mnum = i + 1;
              const val = allocs[mnum] ? Number(allocs[mnum].amount) : 0;
              const isCurrent = mnum === currentMonthNum;
              // QA6 — per-month status dot: green covered, amber under, red none
              const paidForMonth = (state.admin.subItems || [])
                .filter((s) => s.is_paid && Number(s.month_num) === mnum)
                .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
              let dotColor;
              let dotTitle;
              if (val === 0 && paidForMonth === 0) {
                dotColor = 'var(--dim)';
                dotTitle = 'No allocation, no payments';
              } else if (val === 0 && paidForMonth > 0) {
                dotColor = 'var(--red)';
                dotTitle = `${fmtA(paidForMonth)} paid against ₪0 allocation`;
              } else if (paidForMonth > val) {
                dotColor = 'var(--red)';
                dotTitle = `Over by ${fmtA(paidForMonth - val)}`;
              } else if (paidForMonth === val) {
                dotColor = 'var(--green)';
                dotTitle = 'Fully spent against allocation';
              } else if (paidForMonth > 0) {
                dotColor = 'var(--amber)';
                dotTitle = `${fmtA(paidForMonth)} of ${fmtA(val)} paid`;
              } else {
                dotColor = 'var(--green)';
                dotTitle = `${fmtA(val)} allocated, none paid yet`;
              }
              return `<div class="admin-alloc-cell" style="display:flex;justify-content:space-between;align-items:center;padding:.25rem .4rem;background:${isCurrent ? 'var(--gsoft)' : 'var(--surface2)'};border-radius:6px;border:1px solid ${isCurrent ? 'var(--accent)' : 'transparent'};gap:.3rem;">
                <span style="display:inline-flex;align-items:center;gap:.32rem;font-size:.72rem;color:${isCurrent ? 'var(--accent)' : 'var(--muted)'};font-weight:${isCurrent ? '700' : '600'};">
                  <span class="adm-mo-dot" title="${dotTitle}" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0;"></span>
                  ${mn}
                </span>
                <input type="number" min="0" step="1" value="${val || ''}" placeholder="0"
                  onblur="saveAdminAllocation(${mnum}, this.value)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                  style="width:70px;font-size:.78rem;font-family:'DM Mono',monospace;text-align:right;color:${isCurrent ? 'var(--accent)' : 'var(--text)'};font-weight:${isCurrent ? '600' : '400'};background:transparent;border:1px solid transparent;border-radius:4px;padding:.05rem .2rem;outline:none;"
                  onfocus="this.style.borderColor='var(--accent)';this.style.background='var(--surface)';"
                  onmouseout="if(document.activeElement!==this){this.style.borderColor='transparent';this.style.background='transparent';}"
                  title="Edit allocation for ${mn}"
                />
              </div>`;
            }).join('')}
          </div>
          <div style="margin-top:.7rem;padding-top:.6rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
            <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total allocated</span>
            <span style="font-family:'DM Mono',monospace;font-size:.85rem;font-weight:600;color:${gap > 0 ? 'var(--red)' : 'var(--green)'};">${fmtA(totalAlloc)} ${gap > 0 ? '(−' + fmtA(gap) + ' gap)' : '✓'}</span>
          </div>
        </div>

        <!-- Payment Log (auto-generated from paid sub-payments) -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.2rem;">Payment Log</div>
          <div style="font-size:.6rem;color:var(--dim);margin-bottom:.9rem;font-style:italic;">Auto-generated from yearly expense payments</div>

          ${(() => {
            const paidSubs = (state.admin.subItems || []).filter((s) => s.is_paid);
            if (paidSubs.length === 0) {
              return '<div style="color:var(--dim);font-size:.78rem;padding:.3rem 0;">No payments yet — mark sub-payments as paid in Yearly Expenses</div>';
            }
            const ps = localStorage.getItem('adminPaySort') || 'month';
            const sorted = [...paidSubs].sort((a, b) => {
              if (ps === 'month')
                return (
                  ((a as AdminSubItemRow).month_num || 0) - ((b as AdminSubItemRow).month_num || 0)
                );
              if (ps === 'month-desc')
                return (
                  ((b as AdminSubItemRow).month_num || 0) - ((a as AdminSubItemRow).month_num || 0)
                );
              if (ps === 'high') return Number(b.amount) - Number(a.amount);
              if (ps === 'low') return Number(a.amount) - Number(b.amount);
              return 0;
            });
            const itemMeta: Record<string, { label: string; category: string }> = {};
            (state.admin.items || []).forEach((it) => {
              (itemMeta as Record<string, { label: string; category: string }>)[it.id] = {
                label: it.label || '(unnamed)',
                category: (it.category as string) || 'Other',
              };
            });
            const sb2 = (key: string, label: string): string =>
              `<button onclick="localStorage.setItem('adminPaySort','${key}');renderApp()" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:.64rem;padding:.1rem .3rem;cursor:pointer;color:${ps === key ? 'var(--accent)' : 'var(--muted)'};font-family:'DM Sans',sans-serif;font-weight:${ps === key ? '600' : '400'};border-color:${ps === key ? 'var(--accent)' : 'var(--border)'};">${label}</button>`;
            const payRowHtml = (s: AdminSubItemRow): string => {
              const parentLabel =
                ((itemMeta as Record<string, { label: string; category: string }>)[
                  s.item_id as string
                ] &&
                  (itemMeta as Record<string, { label: string; category: string }>)[
                    s.item_id as string
                  ].label) ||
                '?';
              const mn = s.month_num ? MONTH_NAMES[s.month_num - 1] || '—' : '—';
              return `
            <div class="admin-pay-row" style="display:grid;grid-template-columns:40px 1fr 1fr 75px 32px;gap:.25rem;align-items:center;padding:.28rem .1rem;border-bottom:1px solid var(--border);font-size:.78rem;${s.is_estimate ? 'background:var(--ambersoft,#fffbf0);' : ''}">
              <span class="admin-pay-mo" style="font-size:.68rem;color:var(--muted);font-family:'DM Mono',monospace;">${esc(mn)}</span>
              <span class="admin-pay-item" style="font-size:.72rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(parentLabel)}">${esc(parentLabel)}</span>
              <span class="admin-pay-what" style="font-size:.78rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(s.label)}">${esc((s.label || '—').replace('[auto] ', '').trim() || '(full payment)')}</span>
              <span class="admin-pay-amt" style="font-size:.78rem;font-family:'DM Mono',monospace;text-align:right;color:${s.is_estimate ? 'var(--amber)' : 'var(--text)'};font-weight:${s.is_estimate ? '700' : '400'};">${fmtA(s.amount)}</span>
              <span class="admin-pay-est" style="text-align:center;font-size:.6rem;color:${s.is_estimate ? 'var(--amber)' : 'var(--dim)'};font-weight:${s.is_estimate ? '700' : '400'};">${s.is_estimate ? '~est' : ''}</span>
            </div>`;
            };
            // Group paid sub-payments by their parent item's category (ADMIN_CATEGORIES order).
            const byCat: Record<string, AdminSubItemRow[]> = {};
            sorted.forEach((s) => {
              const c = ((itemMeta as Record<string, { label: string; category: string }>)[
                s.item_id as string
              ]?.category || 'Other') as string;
              (byCat[c] = byCat[c] || []).push(s as AdminSubItemRow);
            });
            const orderedCats = ADMIN_CATEGORIES.filter((c) => byCat[c] && byCat[c].length).concat(
              Object.keys(byCat).filter((c) => !ADMIN_CATEGORIES.includes(c)),
            );
            return `
            <div class="tab-sort-row" style="display:flex;align-items:center;gap:.3rem;padding-bottom:.4rem;">
              <span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Sort:</span>
              ${sb2('month', 'Mo ↑')}${sb2('month-desc', 'Mo ↓')}${sb2('high', 'Highest')}${sb2('low', 'Lowest')}
            </div>
            <div class="admin-pay-row admin-pay-header" style="display:grid;grid-template-columns:40px 1fr 1fr 75px 32px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .1rem .35rem;border-bottom:1px solid var(--border);">
              <span class="admin-pay-mo">Mo</span><span class="admin-pay-item">Item</span><span class="admin-pay-what">What</span><span class="admin-pay-amt" style="text-align:right">Amount</span><span class="admin-pay-est" style="text-align:center">~est</span>
            </div>
            ${orderedCats
              .map((c) => {
                const subs = byCat[c];
                const catTotal = subs.reduce(
                  (n: number, s: AdminSubItemRow) => n + Number(s.amount || 0),
                  0,
                );
                return `
            <div class="admin-pay-cat" style="display:flex;align-items:center;justify-content:space-between;gap:.4rem;padding:.55rem .1rem .25rem;margin-top:.2rem;border-bottom:1px solid var(--border);">
              <span style="font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);">${(catEmoji as Record<string, string>)[c] || '📌'} ${esc(c)}</span>
              <span style="font-family:'DM Mono',monospace;font-size:.7rem;color:var(--dim);">${fmtA(catTotal)}</span>
            </div>
            ${subs.map(payRowHtml).join('')}`;
              })
              .join('')}
            <div style="margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
              <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total spent</span>
              <span style="font-family:'DM Mono',monospace;font-size:.85rem;font-weight:600;">${fmtA(totalSpent)}</span>
            </div>`;
          })()}
        </div>
      </div>
    </div>
  </div>`;
}

// ── Admin CRUD ────────────────────────────────────────────────────────
async function addAdminItem(): Promise<void> {
  const { data, error } = await sb
    .from('admin_items')
    .insert({ year: state.currentYear, label: '', projected_amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error adding item');
    return;
  }
  state.admin.items.push(data);
  logChange(
    'add',
    'admin_item',
    (data as Record<string, unknown>)?.['id'] as string,
    `Added admin item`,
    null,
    data,
  );
  renderApp();
  // Auto-focus the new item's name input
  setTimeout(() => {
    const inputs = document.querySelectorAll('input[placeholder="Item name"]');
    const last = inputs[inputs.length - 1] as HTMLInputElement | undefined;
    if (last && !last.value) {
      last.focus();
      last.placeholder = 'Type item name...';
    }
  }, 50);
}

const AUTO_SUB_LABEL = '[auto] full payment';

async function saveAdminItem(id: string, field: string, value: unknown): Promise<void> {
  const item = state.admin.items.find((i) => i.id === id);
  if (!item) return;
  const oldVal = item[field];
  const val =
    field === 'projected_amount'
      ? parseFloat(String(value)) || 0
      : field === 'is_estimate' || field === 'is_logged'
        ? Boolean(value)
        : String(value);
  await sb
    .from('admin_items')
    .update({ [field]: val })
    .eq('id', id);
  item[field] = val;

  // Option C: when checking a parent with NO existing sub-items, auto-create
  // a paid sub-payment for the full projected amount. When unchecking, remove it.
  // If the parent already has sub-items, is_logged is purely a visibility toggle.
  let autoCreatedSub = null;
  let autoDeletedSub = null;
  if (field === 'is_logged') {
    const existingSubs = (state.admin.subItems || []).filter((s) => s.item_id === id);
    const hasUserSubs = existingSubs.some((s) => s.label !== AUTO_SUB_LABEL);
    if (!hasUserSubs) {
      if (val === true && existingSubs.length === 0 && Number(item.projected_amount) > 0) {
        // Checking on + no subs at all → create auto sub
        const { data } = await sb
          .from('admin_sub_items')
          .insert({
            item_id: id,
            label: AUTO_SUB_LABEL,
            amount: Number(item.projected_amount),
            month_num: currentMonthNum(),
            is_paid: true,
          })
          .select()
          .single();
        if (data) {
          state.admin.subItems.push(data);
          autoCreatedSub = data;
        }
      } else if (val === false) {
        // Unchecking + only auto subs exist → delete them
        const autoSubs = existingSubs.filter((s) => s.label === AUTO_SUB_LABEL);
        for (const s of autoSubs) {
          await sb.from('admin_sub_items').delete().eq('id', s.id);
          state.admin.subItems = state.admin.subItems.filter((x) => x.id !== s.id);
          autoDeletedSub = s;
        }
      }
    }
  }

  logChange(
    'edit',
    'admin_item',
    id,
    `Admin item changed: ${item.label} ${field} ${oldVal} → ${val}`,
    { [field]: oldVal },
    { [field]: val },
  );
  pushUndo({
    label: 'edit ' + field,
    undo: async () => {
      await sb
        .from('admin_items')
        .update({ [field]: oldVal })
        .eq('id', id);
      item[field] = oldVal;
      if (autoCreatedSub) {
        await sb.from('admin_sub_items').delete().eq('id', autoCreatedSub.id);
        state.admin.subItems = state.admin.subItems.filter((x) => x.id !== autoCreatedSub.id);
      }
      if (autoDeletedSub) {
        const { data } = await sb
          .from('admin_sub_items')
          .insert({
            item_id: autoDeletedSub.item_id,
            label: autoDeletedSub.label,
            amount: autoDeletedSub.amount,
            month_num: autoDeletedSub.month_num,
            is_paid: autoDeletedSub.is_paid,
          })
          .select()
          .single();
        if (data) state.admin.subItems.push(data);
      }
      renderApp();
    },
    redo: async () => {
      await sb
        .from('admin_items')
        .update({ [field]: val })
        .eq('id', id);
      item[field] = val;
      if (autoCreatedSub) {
        const { data } = await sb
          .from('admin_sub_items')
          .insert({
            item_id: autoCreatedSub.item_id,
            label: autoCreatedSub.label,
            amount: autoCreatedSub.amount,
            month_num: autoCreatedSub.month_num,
            is_paid: autoCreatedSub.is_paid,
          })
          .select()
          .single();
        if (data) state.admin.subItems.push(data);
      }
      if (autoDeletedSub) {
        await sb.from('admin_sub_items').delete().eq('id', autoDeletedSub.id);
        state.admin.subItems = state.admin.subItems.filter((x) => x.id !== autoDeletedSub.id);
      }
      renderApp();
    },
  });
  renderApp();
}

async function deleteAdminItem(id: string): Promise<void> {
  const snap = state.admin.items.find((i) => i.id === id);
  if (!snap) return;
  await sb.from('admin_items').delete().eq('id', id);
  logChange(
    'delete',
    'admin_item',
    id,
    `Deleted admin item: ${snap.label} ₪${snap.projected_amount}`,
    snap,
    null,
  );
  state.admin.items = state.admin.items.filter((i) => i.id !== id);
  pushUndo({
    label: 'delete admin item',
    undo: async () => {
      const { data } = await sb.from('admin_items').insert(snap).select().single();
      if (data) {
        state.admin.items.push(data);
      }
      renderApp();
    },
    redo: async () => {
      await sb.from('admin_items').delete().eq('id', id);
      state.admin.items = state.admin.items.filter((i) => i.id !== id);
      renderApp();
    },
  });
  renderApp();
  toastDeleted(snap.label, snap.projected_amount);
}

async function addAdminSub(itemId: string): Promise<void> {
  const { data, error } = await sb
    .from('admin_sub_items')
    .insert({ item_id: itemId, label: '', amount: 0, month_num: currentMonthNum() })
    .select()
    .single();
  if (error) {
    toast('Error');
    return;
  }
  state.admin.subItems.push(data);
  localStorage.setItem('sn-adm-' + itemId, '1');
  renderApp();
}

async function updateAdminSub(id: string, field: string, value: unknown): Promise<void> {
  const s = state.admin.subItems.find((s) => s.id === id);
  if (!s) return;
  const val =
    field === 'amount'
      ? parseFloat(String(value)) || 0
      : field === 'month_num'
        ? parseInt(String(value)) || 1
        : field === 'is_paid' || field === 'is_estimate'
          ? Boolean(value)
          : value;
  await sb
    .from('admin_sub_items')
    .update({ [field]: val })
    .eq('id', id);
  s[field] = val;
  renderApp();
}

async function deleteAdminSub(id: string): Promise<void> {
  await sb.from('admin_sub_items').delete().eq('id', id);
  state.admin.subItems = state.admin.subItems.filter((s) => s.id !== id);
  renderApp();
}

async function saveAdminAllocation(monthNum: number, value: string | number): Promise<void> {
  const num = parseFloat(String(value)) || 0;
  const existing = state.admin.allocations[monthNum];
  const oldNum = existing ? Number(existing.amount) : 0;
  if (existing) {
    await sb.from('admin_allocations').update({ amount: num }).eq('id', existing.id);
    existing.amount = num;
  } else {
    const { data } = await sb
      .from('admin_allocations')
      .insert({ year: state.currentYear, month_num: monthNum, amount: num })
      .select()
      .single();
    if (data) state.admin.allocations[monthNum] = data;
  }
  // Also sync to budgets table so main page stays in sync
  const month = state.months.find((m) => m.month_num === monthNum);
  if (month) {
    await sb
      .from('budgets')
      .upsert(
        { month_id: month.id, category: 'admin', amount: num },
        { onConflict: 'month_id,category' },
      );
    state.budgets['admin'] = num;
  }
  logChange(
    'edit',
    'admin_allocation',
    null,
    `Admin allocation month ${monthNum}: ₪${oldNum} → ₪${num}`,
    { amount: oldNum },
    { amount: num },
  );
  pushUndo({
    label: 'edit allocation',
    undo: async () => {
      const ex = state.admin.allocations[monthNum];
      if (ex) {
        await sb.from('admin_allocations').update({ amount: oldNum }).eq('id', ex.id);
        ex.amount = oldNum;
      }
      renderApp();
    },
    redo: async () => {
      const ex = state.admin.allocations[monthNum];
      if (ex) {
        await sb.from('admin_allocations').update({ amount: num }).eq('id', ex.id);
        ex.amount = num;
      }
      renderApp();
    },
  });
  renderApp();
}

// ── Biz tab render ────────────────────────────────────────────────────
function renderBizTab(): string {
  const current = state.months.find((m: MonthRow) => m.id === state.currentMonthId);
  if (!current) return '<div>No month selected</div>';
  // Empty state: no biz_months row exists for this month yet. Show a setup
  // button instead of silently auto-inserting a placeholder row on tab visit.
  if (!state.biz) {
    return `
      <div class="biz-card" style="text-align:center;padding:2rem 1rem;">
        <div style="font-size:.95rem;font-weight:600;margin-bottom:.4rem;">No biz data yet for ${current.month_name}</div>
        <div style="color:var(--dim);font-size:.8rem;margin-bottom:1.1rem;">
          Click below to set up this month with the recurring ₪200 accountant fee.<br>
          Confirmed income will default to ₪200 (net 0). Override with real numbers when VV pays.
        </div>
        <button class="btn btn-primary" onclick="setupBizMonth()">Set up ${current.month_name} →</button>
      </div>
    `;
  }
  const biz = state.biz;
  const clients = state.ptClients || [];
  const { earned = [], scheduled = [] } = state.ptSessions || {};

  const clientName = (id: string): string => clients.find((c) => c.id === id)?.name || '?';
  const clientRate = (id: string): number => clients.find((c) => c.id === id)?.rate || 0;

  // Group earned sessions by client
  const earnedByClient: Record<string, PtSessionRow[]> = {};
  earned.forEach((s) => {
    if (!earnedByClient[s.client_id as string]) earnedByClient[s.client_id as string] = [];
    earnedByClient[s.client_id || ''].push(s);
  });
  const trackerTotal = ag(earned.reduce((sum, s) => sum + clientRate(s.client_id || '') * 0.85, 0));

  // Group scheduled sessions by client
  const scheduledByClient: Record<string, PtSessionRow[]> = {};
  scheduled.forEach((s) => {
    if (!scheduledByClient[s.client_id as string]) scheduledByClient[s.client_id as string] = [];
    scheduledByClient[s.client_id || ''].push(s);
  });
  // const _scheduledTotal = ag(scheduled.reduce((sum, s) => sum + clientRate(s.client_id) * 0.85, 0)); // unused

  const net = (biz.confirmed_amount || 0) - (biz.accountant_fee || 0) - (biz.spending || 0);
  const prevMonthName = current.month_num > 1 ? MONTHS[current.month_num - 2] : 'December';

  return `
    <div class="biz-card">
      <div class="biz-section-title">
        Sessions Happened — ${prevMonthName}
        <button class="biz-sync-btn" onclick="refreshBiz()">↻ Sync</button>
      </div>
      ${
        Object.keys(earnedByClient).length === 0
          ? `<div style="color:var(--dim);font-size:.8rem;padding:.5rem 0">No sessions found for ${prevMonthName}</div>`
          : Object.entries(earnedByClient)
              .map(
                ([cid, sessions]) => `
          <div class="biz-session-item">
            <span>${clientName(cid)} × ${sessions.length}</span>
            <span class="biz-val green">${fmt(sessions.length * clientRate(cid) * 0.85)}</span>
          </div>`,
              )
              .join('')
      }
      <div class="biz-row" style="margin-top:.5rem;background:var(--gsoft);">
        <span class="biz-label" style="font-weight:700;">Tracker total</span>
        <span class="biz-val green">${fmt(trackerTotal)}</span>
      </div>
    </div>

    <div class="biz-card">
      <div class="biz-section-title">Confirmed Income (VV)</div>
      <div class="biz-row">
        <span class="biz-label">Confirmed amount</span>
        <input class="biz-input" type="number" value="${biz.confirmed_amount || ''}" placeholder="0"
          onchange="saveBizField('confirmed_amount', this.value)">
      </div>
      <div class="biz-row">
        <span class="biz-label">Accountant fee</span>
        <input class="biz-input" type="number" value="${biz.accountant_fee ?? 200}" placeholder="200"
          onchange="saveBizField('accountant_fee', this.value)">
      </div>
      <div class="biz-row">
        <span class="biz-label">Biz spending</span>
        <input class="biz-input" type="number" value="${biz.spending || ''}" placeholder="0"
          onchange="saveBizField('spending', this.value)">
      </div>
      <div class="biz-net">
        <span class="biz-net-label">Net → Private (Vivi)</span>
        <span class="biz-net-val">${fmt(net)}</span>
      </div>
    </div>

    ${renderAccountantTracker(current)}
  `;
}

function renderAccountantTracker(current: MonthRow): string {
  const allBiz = state.allBiz || [];
  const todayMonth = todayMonthForYear();
  const upToMonth = current.month_num;
  // Sum fees for all months up to the tab month
  const paidUpTo = allBiz
    .filter((b) => {
      const m = state.months.find((mo) => mo.id === b.month_id);
      return m && m.month_num <= upToMonth;
    })
    .reduce((sum, b) => sum + (b.accountant_fee || 0), 0);
  const shouldBe = upToMonth * 200;
  const diffColor = paidUpTo >= shouldBe ? 'var(--green)' : 'var(--red)';

  return `
    <div class="biz-card">
      <div class="biz-section-title">Accountant Fee Tracker — ₪200/month</div>
      <div class="biz-row">
        <span class="biz-label">Should have paid until ${current.month_num <= todayMonth ? current.month_name : 'now'}</span>
        <span class="biz-val">${fmt(shouldBe)}</span>
      </div>
      <div class="biz-row">
        <span class="biz-label">Actually paid until ${current.month_num <= todayMonth ? current.month_name : 'now'}</span>
        <span class="biz-val" style="color:${diffColor}">${fmt(paidUpTo)}</span>
      </div>
    </div>
  `;
}

// Explicit user-initiated setup for a new biz_months row. Called from the
// renderBizTab empty state. Inserts the placeholder (fee=200, confirmed=200,
// spending=0 → net 0) so future months don't bleed −₪200 into displays.
async function setupBizMonth() {
  if (state.biz) return;
  const monthId = state.currentMonthId;
  const { data: newBiz, error } = await sb
    .from('biz_months')
    .insert({
      month_id: monthId,
      accountant_fee: 200,
      spending: 0,
      confirmed_amount: 200,
    })
    .select()
    .single();
  if (error) {
    toast('Error setting up month');
    return;
  }
  state.biz = newBiz;
  // Add to allBiz cache so the Income modal's bizNetCurrent picks it up.
  if (!state.allBiz) state.allBiz = [];
  state.allBiz.push(newBiz);
  renderApp();
  toast('Set up ✓');
}

async function saveBizField(field: string, value: number | string): Promise<void> {
  if (!state.biz) {
    toast('Set up this month first');
    return;
  }
  const num = parseFloat(String(value)) || 0;
  const oldVal = state.biz ? state.biz![field as keyof BizMonthRow] : 0;
  const { error } = await sb
    .from('biz_months')
    .update({ [field]: num })
    .eq('id', state.biz!.id);
  if (error) {
    toast('Error saving');
    return;
  }
  state.biz![field as keyof BizMonthRow] = num;
  logChange(
    'edit',
    'biz_field',
    state.biz!.id,
    `Biz changed: ${field} ₪${oldVal} → ₪${num}`,
    { [field]: oldVal },
    { [field]: num },
  );
  pushUndo({
    label: 'biz ' + field,
    undo: async () => {
      await sb
        .from('biz_months')
        .update({ [field]: oldVal })
        .eq('id', state.biz!.id);
      state.biz![field as keyof BizMonthRow] = oldVal;
    },
    redo: async () => {
      await sb
        .from('biz_months')
        .update({ [field]: num })
        .eq('id', state.biz!.id);
      state.biz![field as keyof BizMonthRow] = num;
    },
  });

  // If confirmed_amount changes, also update income_private in main months table
  // Use state.biz!.month_id (not state.currentMonthId) so a stale biz row during a
  // month switch can't write the net to the wrong month's dashboard.
  const bizMonthId = state.biz!.month_id;
  if (field === 'confirmed_amount') {
    const net = num - (state.biz!.accountant_fee || 0) - (state.biz!.spending || 0);
    await sb.from('months').update({ income_private: net }).eq('id', bizMonthId);
    const month = state.months.find((m) => m.id === bizMonthId);
    if (month) month.income_private = net;
  }
  if (field === 'accountant_fee' || field === 'spending') {
    const net =
      (state.biz!.confirmed_amount || 0) -
      (state.biz!.accountant_fee || 0) -
      (state.biz!.spending || 0);
    await sb.from('months').update({ income_private: net }).eq('id', bizMonthId);
    const month = state.months.find((m) => m.id === bizMonthId);
    if (month) month.income_private = net;
  }

  renderApp();
  toast('Saved ✓');
}

function toggleGroup(key: string): void {
  // Direct class toggle (no re-render) so the CSS transition runs smoothly.
  const el = byId('group-' + key);
  if (el) el.classList.toggle('collapsed');
}

function jumpTo(id: string): void {
  const el = byId(id);
  if (!el) return;
  if (el.classList.contains('collapsed')) el.classList.remove('collapsed');
  const hdrH =
    ((document.querySelector('.hdr') as HTMLElement)?.offsetHeight || 57) +
    ((document.querySelector('.ribbon-panel') as HTMLElement)?.offsetHeight || 0) +
    12;
  const top = el.getBoundingClientRect().top + window.scrollY - hdrH;
  window.scrollTo({ top, behavior: 'smooth' });
}

// Highlight active sidebar item on scroll
window.addEventListener(
  'scroll',
  () => {
    const items = document.querySelectorAll('.sidenav-item');
    if (!items.length) return;
    const offset =
      ((document.querySelector('.hdr') as HTMLElement)?.offsetHeight || 57) +
      ((document.querySelector('.ribbon-panel') as HTMLElement)?.offsetHeight || 0) +
      40;
    let active: Element | null = null;
    items.forEach((item) => {
      const fn = item.getAttribute('onclick') || '';
      const m = fn.match(/jumpTo\('(.+?)'\)/);
      if (!m) return;
      const el = byId(m[1]);
      if (el && el.getBoundingClientRect().top <= offset) active = item;
    });
    items.forEach((i) => i.classList.remove('active'));
    if (active) (active as Element).classList.add('active');
  },
  { passive: true },
);

function startRibbonDrag(e: MouseEvent): void {
  e.preventDefault();
  const panel = document.querySelector('.ribbon-panel') as HTMLElement;
  if (!panel) return;
  const startY = e.clientY;
  const startH = panel.offsetHeight;
  const minH = 40;
  function onMove(ev: MouseEvent): void {
    const newH = Math.max(minH, startH + (ev.clientY - startY));
    panel.style.maxHeight = newH + 'px';
    panel.style.overflow = 'hidden auto';
    localStorage.setItem('ribbonHeight', newH as unknown as string);
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function applyRibbonHeight() {
  const h = localStorage.getItem('ribbonHeight');
  if (h) {
    const panel = document.querySelector('.ribbon-panel') as HTMLElement;
    if (panel) {
      panel.style.maxHeight = h + 'px';
      panel.style.overflow = 'hidden auto';
    }
  }
}

function collapseAll() {
  state.openCats.clear();
  localStorage.setItem('openCats', '[]');
  localStorage.setItem('ribbonHidden', 'true');
  localStorage.removeItem('ribbonExpanded');
  renderApp();
}

function toggleRibbon() {
  const hidden = localStorage.getItem('ribbonHidden') === 'true';
  localStorage.setItem('ribbonHidden', !hidden as unknown as string);
  if (!hidden) localStorage.removeItem('ribbonExpanded');
  renderApp();
}
function toggleRibbonExpand() {
  const expanded = localStorage.getItem('ribbonExpanded') === 'true';
  localStorage.setItem('ribbonExpanded', !expanded as unknown as string);
  renderApp();
}

// Owed strip — collapsible chevron, persists state, default open. (Q1)
function toggleOwedStrip() {
  const open = localStorage.getItem('owedStripOpen') !== 'false'; // default open
  localStorage.setItem('owedStripOpen', !open as unknown as string);
  renderApp();
}

// Scroll-fade affordance (Q7) — toggle .scroll-end class when content
// reaches its right edge so the fade-mask drops away gracefully.
function applyScrollFadeListeners() {
  const targets = document.querySelectorAll('.hdr-tabs .page-tabs, .hdr-months .month-tabs');
  targets.forEach((elBase) => {
    const el = elBase as HTMLElement;
    if (el.dataset.scrollFadeBound) return;
    el.dataset.scrollFadeBound = '1';
    const update = () => {
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      const noOverflow = el.scrollWidth <= el.clientWidth;
      el.classList.toggle('scroll-end', atEnd || noOverflow);
    };
    el.addEventListener('scroll', update, { passive: true });
    requestAnimationFrame(update);
  });
}

// ── Cash / Liquidity Tab ──────────────────────────────────────────────
async function loadCashData() {
  const { data } = await sb.from('cash_accounts').select('*').order('sort_order');
  state.cashAccounts = data || [];
  // Fetch USD rate
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    state.usdRate = json.rates?.ILS || 3.13;
  } catch (e) {
    state.usdRate = state.usdRate || 3.13;
  }
  // Pull live owed total from PT (sessions where status=happened & paid=false).
  // Lets the Cash tab show a drift indicator vs the manually-tracked owed rows.
  try {
    const fnUrl = `${SB_URL}/functions/v1/pt-sessions`;
    const resp = await fetch(fnUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
    });
    if (resp.ok) {
      const payload = await resp.json();
      state.ptOwedTotal = Number(payload.owed_total) || 0;
    }
  } catch (e) {
    // Silent — Cash tab still works without drift indicator
  }
}

function cashILS(acct: CashAccountRow): number {
  const amt = Number(acct.amount) || 0;
  if (acct.currency === 'USD') return Math.round(amt * (state.usdRate || 3.13));
  return amt;
}

// One-click sync: creates or updates a "PT clinical (auto)" row in cash_accounts
// with state.ptOwedTotal. Splitwise/manual rows are preserved separately.
async function syncPtOwedToCash() {
  if (!state.ptOwedTotal) {
    toast('No PT owed total to sync');
    return;
  }
  const existing = (state.cashAccounts || []).find((a) => a.name === 'PT clinical (auto)');
  if (existing) {
    await sb.from('cash_accounts').update({ amount: state.ptOwedTotal }).eq('id', existing.id);
  } else {
    await sb.from('cash_accounts').insert({
      name: 'PT clinical (auto)',
      amount: state.ptOwedTotal,
      currency: 'ILS',
      is_owed: true,
      notes: 'Auto-synced from PT — click sync button on drift warning to refresh',
      sort_order: 10,
    });
  }
  await loadCashData();
  renderApp();
  toast('Synced from PT ✓');
}
window.syncPtOwedToCash = syncPtOwedToCash;

async function saveCashField(id: string, field: string, value: unknown): Promise<void> {
  const acct = state.cashAccounts.find((a) => a.id === id);
  if (!acct) return;
  // const old = acct[field]; // unused
  if (field === 'amount') value = parseFloat(String(value)) || 0;
  acct[field] = value;
  await sb
    .from('cash_accounts')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', id);
  renderApp();
}

async function addCashAccount(): Promise<void> {
  const { data } = await sb
    .from('cash_accounts')
    .insert({
      name: 'New Account',
      amount: 0,
      currency: 'ILS',
      sort_order: state.cashAccounts.length + 1,
    })
    .select()
    .single();
  if (data) {
    state.cashAccounts.push(data);
    renderApp();
  }
}

async function deleteCashAccount(id: string): Promise<void> {
  if (!confirm('Delete this account?')) return;
  await sb.from('cash_accounts').delete().eq('id', id);
  state.cashAccounts = state.cashAccounts.filter((a) => a.id !== id);
  renderApp();
}

function renderCashTab(): string {
  const accounts = state.cashAccounts || [];
  const n = (v: number | null | undefined): string =>
    Number(v || 0).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Split into holdings vs owed
  const holdings = accounts.filter((a) => !a.is_owed);
  const owed = accounts.filter((a) => a.is_owed);
  const totalHoldings = ag(holdings.reduce((s, a) => s + cashILS(a), 0));
  const totalOwed = ag(owed.reduce((s, a) => s + cashILS(a), 0));
  const totalLiquid = ag(totalHoldings + totalOwed);

  const renderRow = (a: CashAccountRow): string => {
    const ilsVal = cashILS(a);
    const isUSD = a.currency === 'USD';
    return `<tr class="cash-row">
      <td class="cash-cell-name" style="padding:.5rem .75rem;">
        <input type="text" value="${a.name}" style="border:none;background:none;font-size:.85rem;font-weight:600;width:140px;font-family:inherit;" onchange="saveCashField('${a.id}','name',this.value)">
      </td>
      <td class="cash-cell-amt" style="text-align:right;padding:.5rem .75rem;">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:.3rem;">
          ${isUSD ? '<span style="font-size:.7rem;color:var(--dim);">$</span>' : '<span style="font-size:.7rem;color:var(--dim);">₪</span>'}
          <input type="number" value="${Number(a.amount) || 0}" style="border:1px solid var(--border);border-radius:6px;padding:.25rem .4rem;width:90px;text-align:right;font-size:.85rem;font-family:\'DM Mono\',monospace;background:var(--bg);" onchange="saveCashField('${a.id}','amount',this.value)" step="1">
        </div>
      </td>
      <td class="cash-cell-ils" style="text-align:right;padding:.5rem .75rem;font-family:'DM Mono',monospace;font-size:.85rem;${isUSD ? 'color:var(--dim);' : ''}">
        ${isUSD ? '₪' + n(ilsVal) + ' <span style="font-size:.6rem;color:var(--dim);">@ ' + (state.usdRate || 3.13).toFixed(2) + '</span>' : ''}
      </td>
      <td class="cash-cell-notes" style="padding:.5rem .75rem;">
        <input type="text" value="${a.notes || ''}" placeholder="notes..." style="border:none;background:none;font-size:.75rem;color:var(--dim);width:100%;font-family:inherit;" onchange="saveCashField('${a.id}','notes',this.value)">
      </td>
      <td class="cash-cell-del" style="padding:.5rem .25rem;text-align:center;">
        <button onclick="deleteCashAccount('${a.id}')" style="background:none;border:none;cursor:pointer;color:var(--dim);font-size:.85rem;padding:0;">×</button>
      </td>
    </tr>`;
  };

  const holdingsRows = holdings.map(renderRow).join('');
  const owedRows = owed.map(renderRow).join('');

  return `<div style="max-width:800px;margin:1.5rem auto;padding:0 1rem;">
    <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <div class="year-sum-card"><div class="year-sum-label">Total Liquid</div><div class="year-sum-val">₪${n(totalLiquid)}</div></div>
      <div class="year-sum-card"><div class="year-sum-label">Holdings</div><div class="year-sum-val">₪${n(totalHoldings)}</div></div>
      <div class="year-sum-card"><div class="year-sum-label">Owed to You</div><div class="year-sum-val">₪${n(totalOwed)}</div>${
        state.ptOwedTotal && Math.abs(state.ptOwedTotal - totalOwed) > 1
          ? `<div style="font-size:.6rem;color:var(--amber);margin-top:.2rem;font-weight:600;display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;" title="PT shows ₪${n(state.ptOwedTotal)} in unpaid sessions. Cash row shows ₪${n(totalOwed)}. Click Sync to add/update a 'PT clinical (auto)' row.">⚠ PT: ₪${n(state.ptOwedTotal)} (drift ₪${n(state.ptOwedTotal - totalOwed > 0 ? state.ptOwedTotal - totalOwed : totalOwed - state.ptOwedTotal)})<button onclick="syncPtOwedToCash()" style="font-size:.6rem;padding:.15rem .4rem;border:1px solid var(--amber);background:var(--ambersoft);color:var(--amber);border-radius:.25rem;cursor:pointer;font-weight:700;">Sync →</button></div>`
          : ''
      }</div>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem;">
      <div style="padding:.6rem .75rem;background:var(--gsoft);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);">💰 Holdings</div>
      <table class="cash-table" style="width:100%;border-collapse:collapse;">
        <thead class="cash-thead"><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Account</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Amount</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">ILS</th>
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Notes</th>
          <th style="width:30px;"></th>
        </tr></thead>
        <tbody>${holdingsRows}
          <tr class="cash-total-row" style="border-top:2px solid var(--border);font-weight:700;">
            <td style="padding:.5rem .75rem;">Total Holdings</td>
            <td colspan="2" style="text-align:right;padding:.5rem .75rem;font-family:'DM Mono',monospace;">₪${n(totalHoldings)}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem;">
      <div style="padding:.6rem .75rem;background:var(--gsoft);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);">📥 Owed to You</div>
      <table class="cash-table" style="width:100%;border-collapse:collapse;">
        <thead class="cash-thead"><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Source</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Amount</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">ILS</th>
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Notes</th>
          <th style="width:30px;"></th>
        </tr></thead>
        <tbody>${owedRows}
          <tr class="cash-total-row" style="border-top:2px solid var(--border);font-weight:700;">
            <td style="padding:.5rem .75rem;">Total Owed</td>
            <td colspan="2" style="text-align:right;padding:.5rem .75rem;font-family:'DM Mono',monospace;">₪${n(totalOwed)}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="display:flex;gap:.5rem;">
      <button onclick="addCashAccount()" style="font-size:.75rem;font-weight:600;color:var(--accent);background:var(--asoft);border:none;border-radius:6px;padding:.4rem .75rem;cursor:pointer;">+ Add Account</button>
    </div>

    <div style="margin-top:1.5rem;font-size:.65rem;color:var(--dim);text-align:center;">
      USD rate: $1 = ₪${(state.usdRate || 3.13).toFixed(4)} (live) &nbsp;·&nbsp; Updated on load
    </div>
  </div>`;
}

// Q2 — yearly funding gap for Travel/Admin/Charity. Returns positive number
// when projected need exceeds allocations across the full year.
function categoryYearlyGap(catKey: string): number {
  if (catKey === 'travel' && state.travel) {
    const proj = (state.travel.items || []).reduce(
      (s, i) => s + (Number(i.projected_amount) || 0),
      0,
    );
    const alloc = Object.values(state.travel.allocations || {}).reduce(
      (s, a) => s + (Number(a.amount) || 0),
      0,
    );
    return Math.max(0, proj - alloc);
  }
  if (catKey === 'admin' && state.admin) {
    const proj = (state.admin.items || []).reduce(
      (s, i) => s + (Number(i.projected_amount) || 0),
      0,
    );
    const alloc = Object.values(state.admin.allocations || {}).reduce(
      (s, a) => s + (Number(a.amount) || 0),
      0,
    );
    return Math.max(0, proj - alloc);
  }
  return 0;
}
// Q2 marker disabled 2026-05-15 per Allison: "get rid of these triangles
// I don't need them." The Owed strip on the top KPI row already surfaces
// the gap glanceably; the per-cell triangle is duplicate signal.
function gapMarker(_catKey: string): string {
  return '';
}

function snToggle(gid: string): void {
  var rows = document.querySelectorAll('.' + gid);
  var hdr = byId(gid + '-hdr');
  var chev = (hdr && hdr.querySelector('.sn-chev')) as HTMLElement | null;
  var isCollapsed = rows[0] && rows[0].classList.contains('collapsed');
  // Smoother feel: rotate the chevron via transform instead of swapping glyphs.
  // Use ▶ as the canonical glyph so the CSS transition can interpolate.
  if (chev) {
    chev.textContent = '▶';
    chev.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
  }
  rows.forEach(function (r) {
    r.classList.toggle('collapsed');
  });
}

function yrToggle(grp: string): void {
  var rows = document.querySelectorAll('.yr-grp-' + grp);
  var hdr = byId('yr-hdr-' + grp);
  var chev = (hdr && hdr.querySelector('.sn-chev')) as HTMLElement | null;
  var isCollapsed = rows[0] && rows[0].classList.contains('collapsed');
  if (chev) {
    chev.textContent = '▶';
    chev.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
  }
  rows.forEach(function (r) {
    r.classList.toggle('collapsed');
  });
}
function yrCollapseAll() {
  document.querySelectorAll('[class*="yr-grp-"]').forEach(function (r) {
    r.classList.add('collapsed');
  });
  document.querySelectorAll('[id^="yr-hdr-"]').forEach(function (h) {
    var c = h.querySelector('.sn-chev') as HTMLElement | null;
    if (c) {
      c.textContent = '▶';
      c.style.transform = 'rotate(0deg)';
    }
  });
}
function yrExpandAll() {
  document.querySelectorAll('[class*="yr-grp-"]').forEach(function (r) {
    r.classList.remove('collapsed');
  });
  document.querySelectorAll('[id^="yr-hdr-"]').forEach(function (h) {
    var c = h.querySelector('.sn-chev') as HTMLElement | null;
    if (c) {
      c.textContent = '▶';
      c.style.transform = 'rotate(90deg)';
    }
  });
}

// -- Year Snapshot ------------------------------------------------------
async function loadYearData() {
  // Always fetch fresh data so edits are reflected immediately
  const monthIds = state.months.map((m) => m.id);
  const [txRes, biRes, budgetRes, incItemsRes] = await Promise.all([
    sb.from('transactions').select('*').in('month_id', monthIds),
    sb.from('budget_items').select('*').in('month_id', monthIds),
    sb.from('budgets').select('*').in('month_id', monthIds),
    sb.from('income_items').select('*').in('month_id', monthIds),
  ]);
  if (txRes.error || biRes.error || budgetRes.error || incItemsRes.error) {
    toast('Could not load year data');
  }
  if (!state.admin.items.length) await loadAdminData();
  state.yearData = {
    txns: txRes.data || [],
    budgetItems: biRes.data || [],
    allBudgets: budgetRes.data || [],
    incomeItems: incItemsRes.data || [],
  };
}

function renderYearSnapshot(): string {
  if (!state.yearData)
    return '<div style="text-align:center;padding:3rem;color:var(--dim)">Loading...</div>';
  const { txns, budgetItems, allBudgets, incomeItems } = state.yearData;
  const months = [...state.months].sort((a, b) => a.month_num - b.month_num);
  const todayMonth = todayMonthForYear();
  const showProjected = localStorage.getItem('yearViewMode') !== 'actual';
  const LEISURE = ['takeout', 'eatingout', 'entertainment', 'retail', 'holiday', 'gifts'];

  const txSum = (mid: string, cats: string[]): number =>
    txns
      .filter((t) => t.month_id === mid && cats.includes(t.category))
      .reduce((s: number, t) => s + (Number(t.amount) || 0), 0);
  const biSum = (mid: string, cats: string[]): number =>
    budgetItems
      .filter((b) => b.month_id === mid && cats.includes(b.category))
      .reduce((s: number, b) => s + (Number(b.amount) || 0), 0);

  // Budget lookup from budgets table: { month_id: { category: amount } }
  const budgetMap: Record<string, Record<string, number>> = {};
  (allBudgets || []).forEach((b) => {
    if (!budgetMap[b.month_id]) budgetMap[b.month_id] = {};
    budgetMap[b.month_id][b.category] = b.amount;
  });
  const budgetV = (mid: string, cats: string[]): number =>
    cats.reduce((s: number, cat: string) => s + (budgetMap[mid]?.[cat] || 0), 0);

  // Income items grouped by month
  const incItemsByMonth: Record<string, IncomeItemRow[]> = {};
  (incomeItems || []).forEach((i) => {
    if (!incItemsByMonth[i.month_id]) incItemsByMonth[i.month_id] = [];
    incItemsByMonth[i.month_id].push(i);
  });
  // Collect unique custom income source labels across all months
  const customIncLabels: string[] = [];
  const seenLabels = new Set<string>();
  (incomeItems || []).forEach((i) => {
    const lbl = (i.label || 'Other').trim();
    if (!seenLabels.has(lbl)) {
      seenLabels.add(lbl);
      customIncLabels.push(lbl);
    }
  });
  const incItemsFor = (mid: string, label: string): number =>
    (incItemsByMonth[mid] || [])
      .filter((i) => (i.label || 'Other').trim() === label)
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const incItemsTotalFor = (mid: string): number =>
    (incItemsByMonth[mid] || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const spendV = (m: MonthRow, cats: string[], future: boolean): number => {
    if (future && !showProjected) return 0;
    if (future) return budgetV(m.id, cats) || biSum(m.id, cats);
    return txSum(m.id, cats);
  };
  const charityV = (mn: number, future: boolean): number => {
    if (!showProjected && future) return 0;
    const m = months.find((mo) => mo.month_num === mn);
    return m ? budgetMap[m.id]?.['charity'] || 0 : 0;
  };
  const adminV = (mn: number, future: boolean): number =>
    !showProjected && future ? 0 : Number(state.admin.allocations?.[mn]?.amount || 0);
  const travelV = (mn: number, future: boolean): number => {
    if (!showProjected && future) return 0;
    const m = months.find((mo) => mo.month_num === mn);
    return m ? budgetMap[m.id]?.['travel'] || 0 : 0;
  };
  // Income includes fixed fields + custom income items (no income_other — replaced by income_items)
  const incFor = (m: MonthRow): number =>
    (Number(m.income_petachya) || 0) +
    (Number(m.income_clalit) || 0) +
    (Number(m.income_private) || 0) +
    (Number(m.income_other) || 0) +
    incItemsTotalFor(m.id);

  const fmtY = (n: number): string =>
    !n ? '\u2014' : '\u20aa' + Math.round(n).toLocaleString('en-US');
  const fmtPct = (n: number): string => (n ? Math.round(n * 100) + '%' : '');

  // Helper: budget item total for a month (mirrors catBudget logic but for year data)
  const yearBiTotal = (mid: string, catKey: string): number | null => {
    const items = budgetItems.filter((b) => b.month_id === mid && b.category === catKey);
    return items.length ? items.reduce((s, b) => s + (Number(b.amount) || 0), 0) : null;
  };
  const yearCatBudget = (mid: string, catKey: string): number => {
    // Mirror month page charity % override
    if (catKey === 'charity') {
      const chPct = parseFloat(localStorage.getItem('charityPct_' + (mid || '')) || '0');
      const m = months.find((mo) => mo.id === mid);
      if (chPct && m) {
        const inc = incFor(m);
        if (inc) return Math.round((inc * chPct) / 100);
      }
    }
    const fromItems = yearBiTotal(mid, catKey);
    return fromItems !== null ? fromItems : budgetMap[mid]?.[catKey] || 0;
  };

  // Total budgeted for a month (all categories + savings)
  const totalBudgetedFor = (m: MonthRow): number => {
    return (
      CATEGORIES.reduce((sum, c) => sum + yearCatBudget(m.id, c.key), 0) +
      (budgetMap[m.id]?.['savings_bank'] || 0) +
      (budgetMap[m.id]?.['savings_invested'] || 0)
    );
  };

  // Total spent for a month — mirrors ribbon's spentByCategory() exactly
  // For ALL months: actual transactions, with committed items (housing/recurring) as floor
  // Tab categories (charity/travel/admin) always count their budget allocation
  // Savings always count as spent
  const totalSpentFor = (m: MonthRow, _future?: boolean) => {
    return (
      CATEGORIES.reduce((sum, c) => {
        if (c.hasTab) return sum + yearCatBudget(m.id, c.key);
        if (c.hasLines) {
          const committed = biSum(m.id, [c.key]);
          const actual = txSum(m.id, [c.key]);
          return sum + Math.max(committed, actual);
        }
        return sum + txSum(m.id, [c.key]); // actual transactions only
      }, 0) +
      (budgetMap[m.id]?.['savings_bank'] || 0) +
      (budgetMap[m.id]?.['savings_invested'] || 0)
    );
  };

  // Build income sub-rows dynamically
  const incomeSubRows = [
    {
      type: 'sub',
      label: '\u2937 Petachya',
      valFn: (m: MonthRow) => Number(m.income_petachya) || 0,
    },
    { type: 'sub', label: '\u2937 Clalit', valFn: (m: MonthRow) => Number(m.income_clalit) || 0 },
    { type: 'sub', label: '\u2937 Private', valFn: (m: MonthRow) => Number(m.income_private) || 0 },
  ];
  // Add a row for income_other if any month has it
  if (months.some((m) => Number(m.income_other) > 0)) {
    incomeSubRows.push({
      type: 'sub',
      label: '\u2937 Other',
      valFn: (m: MonthRow) => Number(m.income_other) || 0,
    });
  }
  // Add a row for each custom income source label
  customIncLabels.forEach((lbl) => {
    incomeSubRows.push({
      type: 'sub',
      label: '\u2937 ' + lbl,
      valFn: (m: MonthRow) => incItemsFor(m.id, lbl),
    });
  });

  // Housing: sum all housing budget_items (rent, arnona, etc.)
  // Housing: sum all housing budget_items (household is now its own independent category)
  const housingV = (m: MonthRow, _f?: boolean): number =>
    budgetItems
      .filter((b) => b.month_id === m.id && b.category === 'housing')
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);
  // Recurring: sum all recurring budget_items
  const recurringV = (m: MonthRow): number =>
    budgetItems
      .filter((b) => b.month_id === m.id && b.category === 'recurring')
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);

  // Travel/Admin: budget vs spent gap
  // travelBudgetV unused - commented out
  // const travelBudgetV = (mn: number) => {
  //   const m = months.find((mo) => mo.month_num === mn);
  //   return m ? budgetMap[m.id]?.['travel'] || 0 : 0;
  // };
  // travelSpentV unused - commented out
  // const travelSpentV = (mn: number) => {
  //   const m = months.find((mo) => mo.month_num === mn);
  //   if (!m) return 0;
  //   return txns
  //     .filter((t) => t.month_id === m.id && t.category === 'travel')
  //     .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  // };
  // adminBudgetV and adminSpentV unused - commented out
  // const adminBudgetV = (mn: number) => Number(state.admin.allocations?.[mn]?.amount || 0);
  // const adminSpentV = (mn: number) => {
  //   const items = (state.admin.items || []).filter((i) => i.month_num === mn);
  //   return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  // };

  const ROWS = [
    // 1. Income
    { type: 'section', label: '\u{1F4C8} Income', collapsible: 'income' },
    {
      type: 'row',
      bold: true,
      label: 'Total Income',
      valFn: (m: MonthRow) => incFor(m),
      sectionGroup: 'income',
      stickyInSection: true,
    },
    ...incomeSubRows.map((r) => ({ ...r, sectionGroup: 'income' })),
    // 2. Budget Overview
    { type: 'section', label: '\u{1F4CA} Budget Overview', collapsible: 'overview' },
    {
      type: 'row',
      bold: true,
      label: 'Total Budgeted',
      valFn: (m: MonthRow) => totalBudgetedFor(m as MonthRow),
      sectionGroup: 'overview',
    },
    {
      type: 'row',
      bold: true,
      label: 'Total Spent',
      valFn: (m: MonthRow, f: boolean) => totalSpentFor(m, f),
      sectionGroup: 'overview',
    },
    {
      type: 'net',
      label: '\u{1F4B0} Unbudgeted',
      valFn: (m: MonthRow) => incFor(m) - totalBudgetedFor(m as MonthRow),
      sectionGroup: 'overview',
    },
    {
      type: 'net',
      label: '\u2705 Remaining',
      valFn: (m: MonthRow, f: boolean) => incFor(m) - totalSpentFor(m, f),
      sectionGroup: 'overview',
    },
    // 3. Savings & Investment
    { type: 'section', label: '\u{1F4B0} Savings & Investment', collapsible: 'savings' },
    {
      type: 'row',
      bold: true,
      label: 'Total Savings',
      valFn: (m: MonthRow, f: boolean) =>
        !showProjected && f
          ? 0
          : (budgetMap[m.id]?.['savings_bank'] || 0) + (budgetMap[m.id]?.['savings_invested'] || 0),
      sectionGroup: 'savings',
      stickyInSection: true,
    },
    {
      type: 'sub',
      label: '\u2937 Saved (Bank)',
      valFn: (m: MonthRow, f: boolean) =>
        !showProjected && f ? 0 : budgetMap[m.id]?.['savings_bank'] || 0,
      sectionGroup: 'savings',
    },
    {
      type: 'sub',
      label: '\u2937 Invested',
      valFn: (m: MonthRow, f: boolean) =>
        !showProjected && f ? 0 : budgetMap[m.id]?.['savings_invested'] || 0,
      sectionGroup: 'savings',
    },
    // 5. Charity Overview
    { type: 'section', label: '\u{1F49A} Charity Overview', collapsible: 'charity' },
    {
      type: 'row',
      label: 'Charity ₪',
      valFn: (m: MonthRow, f: boolean) => charityV(m.month_num, f),
      sectionGroup: 'charity',
    },
    { type: 'sub', label: 'Charity % of Income', special: 'charityPct', sectionGroup: 'charity' },
    // 6. Spending (detail, at bottom)
    { type: 'section', label: '\u{1F4CA} Spending Breakdown', collapsible: 'spending' },
    {
      type: 'row',
      label: '\u{1F6D2} Groceries',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['groceries'], f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F3E0} Housing',
      valFn: (m: MonthRow, f: boolean) => housingV(m, f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F9F9} Household Items',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['household'], f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F697} Transport',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['transport'], f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F3E5} Health & Therapy',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['health', 'therapy'], f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F504} Recurring',
      valFn: (m: MonthRow) => recurringV(m),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F389} Leisure',
      valFn: (m: MonthRow, f: boolean) => spendV(m, LEISURE, f),
      expandable: 'leisure',
      sectionGroup: 'spending',
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Take Out',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['takeout'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Eating Out',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['eatingout'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Entertainment',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['entertainment'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Retail & Shopping',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['retail'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Holiday',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['holiday'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Gifts',
      valFn: (m: MonthRow, f: boolean) => spendV(m, ['gifts'], f),
    },
    {
      type: 'row',
      label: '\u{1F49A} Charity',
      valFn: (m: MonthRow, f: boolean) => charityV(m.month_num, f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u2708\uFE0F Travel',
      valFn: (m: MonthRow, f: boolean) => travelV(m.month_num, f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F4CB} Admin',
      valFn: (m: MonthRow, f: boolean) => adminV(m.month_num, f),
      sectionGroup: 'spending',
    },
  ];

  const computed = ROWS.map((row) => {
    if (row.type === 'section') return { row, values: null, total: 0, avg: 0 };
    if (row.special === 'charityPct') {
      // Special: compute charity as % of income per month
      const values = months.map((m) => {
        const inc = incFor(m);
        const ch = charityV(m.month_num, m.month_num > todayMonth);
        return inc ? ch / inc : 0;
      });
      const totalCh = months.reduce(
        (s, m) => s + charityV(m.month_num, m.month_num > todayMonth),
        0,
      );
      const totalI = months.reduce((s, m) => s + incFor(m), 0);
      return { row, values, total: totalI ? totalCh / totalI : 0, avg: 0, isPct: true };
    }
    const values = months.map(
      (m: MonthRow) => (row.valFn ? row.valFn(m, m.month_num > todayMonth) : 0) || 0,
    );
    const total = ag(values.reduce((s, v) => s + v, 0));
    return { row, values, total, avg: total / 12 };
  });

  const totalAnnInc = ag(months.reduce((s, m) => s + incFor(m), 0));
  const pastMs = months.filter((m) => m.month_num <= todayMonth);
  const ytdIncome = ag(pastMs.reduce((s, m) => s + incFor(m), 0));
  const ytdSavings = ag(
    pastMs.reduce(
      (s, m) =>
        s + (budgetMap[m.id]?.['savings_bank'] || 0) + (budgetMap[m.id]?.['savings_invested'] || 0),
      0,
    ),
  );
  const projSavings = ag(
    months.reduce(
      (s, m) =>
        s + (budgetMap[m.id]?.['savings_bank'] || 0) + (budgetMap[m.id]?.['savings_invested'] || 0),
      0,
    ),
  );

  // Travel & Admin: projected budget from items, allocated from monthly allocations, gap = budget - allocated
  const totalTravelProjected = ag(
    (state.travel.items || []).reduce((s, i) => s + (Number(i.projected_amount) || 0), 0),
  );
  const totalTravelAlloc = ag(
    Object.values(state.travel.allocations || {}).reduce((s, a) => s + (Number(a.amount) || 0), 0),
  );
  const travelGap = ag(totalTravelProjected - totalTravelAlloc);
  const totalAdminProjected = ag(
    (state.admin.items || []).reduce((s, i) => s + (Number(i.projected_amount) || 0), 0),
  );
  const totalAdminAlloc = ag(
    Object.values(state.admin.allocations || {}).reduce((s, a) => s + (Number(a.amount) || 0), 0),
  );
  const adminGap = ag(totalAdminProjected - totalAdminAlloc);

  // Format: always show ₪0 instead of dashes
  const fmtYZ = (n: number): string => '\u20aa' + Math.round(n || 0).toLocaleString('en-US');

  // Summary ribbon ABOVE the table
  const summaryHtml =
    '<div class="year-ribbon">' +
    '<span class="yr-stat">YTD <strong>' +
    fmtY(ytdIncome) +
    '</strong></span>' +
    '<span class="yr-sep">·</span>' +
    '<span class="yr-stat">Proj <strong>' +
    fmtY(totalAnnInc) +
    '</strong></span>' +
    '<span class="yr-sep">·</span>' +
    '<span class="yr-stat">Avg <strong>' +
    fmtY(totalAnnInc / 12) +
    '</strong>/mo</span>' +
    '<span class="yr-sep">|</span>' +
    '<span class="yr-stat">💰 Saved + Invested <strong style="color:var(--green)">' +
    fmtY(ytdSavings) +
    '</strong> / ' +
    fmtY(projSavings) +
    '</span>' +
    '<span class="yr-sep">|</span>' +
    '<span class="yr-stat">✈️ ' +
    fmtY(totalTravelProjected) +
    ' · <span style="color:' +
    (travelGap > 0 ? 'var(--red)' : 'var(--green)') +
    '">' +
    fmtY(Math.abs(travelGap)) +
    ' ' +
    (travelGap > 0 ? 'gap' : 'funded') +
    '</span></span>' +
    '<span class="yr-sep">·</span>' +
    '<span class="yr-stat">📋 ' +
    fmtY(totalAdminProjected) +
    ' · <span style="color:' +
    (adminGap > 0 ? 'var(--red)' : 'var(--green)') +
    '">' +
    fmtY(Math.abs(adminGap)) +
    ' ' +
    (adminGap > 0 ? 'gap' : 'funded') +
    '</span></span>' +
    '</div>';

  const thead =
    '<thead><tr><th class="year-th-label">Category</th>' +
    months
      .map((m) => {
        const cls =
          m.month_num === todayMonth
            ? 'year-th-month current-month'
            : m.month_num > todayMonth
              ? 'year-th-month future-month'
              : 'year-th-month';
        return (
          '<th class="' +
          cls +
          '"><a class="ov-month-link" onclick="switchTab(\'budget\');switchMonth(\'' +
          m.id +
          '\')">' +
          ((m as unknown as { month_name?: string }).month_name || '').slice(0, 3) +
          (m.month_num === todayMonth ? ' \u25C9' : '') +
          '</a></th>'
        );
      })
      .join('') +
    '<th class="year-th-extra">Total</th><th class="year-th-extra">Avg/mo</th><th class="year-th-extra">% Inc</th>' +
    '</tr></thead>';

  const tbody = computed
    .map(function (item) {
      const row = item.row,
        values = item.values!,
        total = item.total,
        avg = item.avg;
      // Sections that start collapsed (only show totals, expand for detail)
      const startCollapsed = ['income', 'savings', 'charity'];
      if (row.type === 'section') {
        const collapsed = row.collapsible && startCollapsed.includes(row.collapsible);
        const chevron = row.collapsible
          ? '<span class="sn-chev" style="font-size:.55rem;margin-right:.35rem;cursor:pointer;">' +
            (collapsed ? '▶' : '▼') +
            '</span>'
          : '';
        const clickAttr = row.collapsible
          ? ' onclick="yrToggle(\'sec-' +
            row.collapsible +
            '\')" style="cursor:pointer;" id="yr-hdr-sec-' +
            row.collapsible +
            '"'
          : '';
        const dataAttr = row.collapsible ? ' data-yr-section="' + row.collapsible + '"' : '';
        return (
          '<tr class="year-row-section"' +
          clickAttr +
          dataAttr +
          '><td colspan="' +
          (months.length + 4) +
          '">' +
          chevron +
          row.label +
          '</td></tr>'
        );
      }
      let rowCls =
        row.type === 'sub'
          ? 'year-row-sub'
          : row.type === 'net'
            ? 'year-row-net'
            : row.bold
              ? 'year-row-bold'
              : 'year-row';
      // Grouped sub-rows (leisure etc): hidden by default
      if (row.group) rowCls += ' yr-grp-' + row.group + ' collapsed';
      // Section-grouped rows: collapsible with section header
      if (row.sectionGroup && !row.stickyInSection) {
        rowCls += ' yr-grp-sec-' + row.sectionGroup;
        if (startCollapsed.includes(row.sectionGroup)) rowCls += ' collapsed';
      }

      if (item.isPct) {
        const cells = months
          .map(function (m: MonthRow, i: number) {
            const v = (values as number[])[i];
            let cls = 'year-cell';
            if (m.month_num > todayMonth) cls += ' future';
            if (m.month_num === todayMonth) cls += ' current-col';
            const pctStr = (v * 100).toFixed(1) + '%';
            const color = v >= 0.05 ? 'var(--green)' : v > 0 ? 'var(--accent)' : '';
            return (
              '<td class="' +
              cls +
              '" style="' +
              (color ? 'color:' + color : '') +
              '">' +
              pctStr +
              '</td>'
            );
          })
          .join('');
        const totalPctStr = (total * 100).toFixed(1) + '%';
        const pctSecAttr = row.sectionGroup ? ' data-yr-section="' + row.sectionGroup + '"' : '';
        return (
          '<tr class="' +
          rowCls +
          '"' +
          pctSecAttr +
          '><td class="year-col-label">' +
          row.label +
          '</td>' +
          cells +
          '<td class="year-cell-extra">' +
          totalPctStr +
          '</td><td class="year-cell-avg">\u2014</td><td class="year-cell-pct"></td></tr>'
        );
      }

      const cells = months
        .map(function (m: MonthRow, i: number) {
          const v = values[i];
          let cls = 'year-cell';
          if (m.month_num > todayMonth) cls += ' future';
          if (m.month_num === todayMonth) cls += ' current-col';
          if (row.type === 'net') cls += v > 0 ? ' net-pos' : v < 0 ? ' net-neg' : '';
          return '<td class="' + cls + '">' + fmtYZ(v) + '</td>';
        })
        .join('');
      const totCls =
        'year-cell-extra' +
        (row.type === 'net' ? (total > 0 ? ' net-pos' : total < 0 ? ' net-neg' : '') : '');
      const showPct =
        row.type !== 'section' &&
        row.label !== 'Total Income' &&
        row.label !== 'Total Budgeted' &&
        row.label !== 'Total Spent';
      const pct = showPct && totalAnnInc ? fmtPct(total / totalAnnInc) : '';
      // Expandable row: add chevron + click handler
      const labelHtml = row.expandable
        ? '<span class="sn-chev" style="font-size:.55rem;margin-right:.35rem;color:var(--muted);cursor:pointer;">▶</span>' +
          row.label
        : row.label;
      const expandAttr = row.expandable
        ? ' onclick="yrToggle(\'' +
          row.expandable +
          '\')" style="cursor:pointer;" id="yr-hdr-' +
          row.expandable +
          '"'
        : '';
      const secAttr = row.sectionGroup ? ' data-yr-section="' + row.sectionGroup + '"' : '';
      return (
        '<tr class="' +
        rowCls +
        '"' +
        expandAttr +
        secAttr +
        '><td class="year-col-label">' +
        labelHtml +
        '</td>' +
        cells +
        '<td class="' +
        totCls +
        '">' +
        fmtYZ(total) +
        '</td><td class="year-cell-avg">' +
        fmtYZ(avg) +
        '</td><td class="year-cell-pct">' +
        pct +
        '</td></tr>'
      );
    })
    .join('');

  const toggleHtml =
    '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:1rem;">' +
    '<span style="font-size:.72rem;color:var(--dim);">View:</span>' +
    "<button onclick=\"localStorage.setItem('yearViewMode','projected');renderApp()\" style=\"font-size:.72rem;padding:.25rem .65rem;border-radius:20px;border:1px solid " +
    (showProjected ? 'var(--accent)' : 'var(--border)') +
    ';background:' +
    (showProjected ? 'var(--accent)' : 'none') +
    ';color:' +
    (showProjected ? '#fff' : 'var(--dim)') +
    ";cursor:pointer;font-family:'DM Sans',sans-serif;\">Full Year (Projected)</button>" +
    "<button onclick=\"localStorage.setItem('yearViewMode','actual');renderApp()\" style=\"font-size:.72rem;padding:.25rem .65rem;border-radius:20px;border:1px solid " +
    (!showProjected ? 'var(--accent)' : 'var(--border)') +
    ';background:' +
    (!showProjected ? 'var(--accent)' : 'none') +
    ';color:' +
    (!showProjected ? '#fff' : 'var(--dim)') +
    ";cursor:pointer;font-family:'DM Sans',sans-serif;\">Actual Only</button>" +
    '<span style="margin-left:auto;"></span>' +
    '<button class="yr-table-only" onclick="yrCollapseAll()" style="font-size:.72rem;padding:.25rem .65rem;border-radius:20px;border:1px solid var(--border);background:none;color:var(--dim);cursor:pointer;font-family:\'DM Sans\',sans-serif;">⊟ Collapse All</button>' +
    '<button class="yr-table-only" onclick="yrExpandAll()" style="font-size:.72rem;padding:.25rem .65rem;border-radius:20px;border:1px solid var(--border);background:none;color:var(--dim);cursor:pointer;font-family:\'DM Sans\',sans-serif;">⊞ Expand All</button>' +
    '</div>';
  // Mobile-only Month ⇄ Full Year toggle. Lives in its own .ym-modetoggle block
  // OUTSIDE .year-mobile / .year-table-wrap so it stays visible in BOTH modes.
  const ymFull = state.yearMobileFull;
  const modeToggleHtml =
    '<div class="ym-modetoggle">' +
    '<button onclick="setYearMobileFull(false)" class="ym-modebtn' +
    (!ymFull ? ' active' : '') +
    '">📅 Month</button>' +
    '<button onclick="setYearMobileFull(true)" class="ym-modebtn' +
    (ymFull ? ' active' : '') +
    '">📊 Full Year</button>' +
    '</div>';
  // B5 \u2014 Filter chips (slice the year grid)
  const yearFilter = localStorage.getItem('yearFilter') || 'all';
  const chipDef = [
    { key: 'all', label: 'All' },
    { key: 'spending', label: 'Spending only' },
    { key: 'income', label: 'Income only' },
    { key: 'gaps', label: 'Gaps only' },
    { key: 'above', label: 'Above-budget months' },
  ];
  const chipsHtml =
    '<div class="year-filter-chips" style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.85rem;">' +
    '<span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-right:.2rem;">Filter:</span>' +
    chipDef
      .map(
        (c) =>
          '<button onclick="setYearFilter(\'' +
          c.key +
          '\')" class="yr-chip ' +
          (yearFilter === c.key ? 'active' : '') +
          '">' +
          c.label +
          '</button>',
      )
      .join('') +
    '</div>';
  // For "above" filter, mark each th + td with month status as data-month-status,
  // and let CSS dim non-above-budget month columns.
  const aboveFilterCols = months.map((m) => {
    const inc = incFor(m);
    const spent = totalSpentFor(m, m.month_num > todayMonth);
    return spent > inc ? 1 : 0; // above-budget = total spent > income
  });
  const aboveAttrs = aboveFilterCols
    .map((s, i) => 'data-yr-col-' + (i + 1) + '="' + (s ? 'above' : 'ok') + '"')
    .join(' ');

  // \u2500\u2500 MOBILE (\u2264600px) one-month-at-a-time layout \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Reuses `computed` (same per-month values + annual totals as the table),
  // so the mobile number for (month, row) is identical to the desktop column.
  // Selected month: state.yearViewMonth, defaulting to current month (or 1).
  let selMonthNum = state.yearViewMonth;
  if (!selMonthNum || !months.some((m) => m.month_num === selMonthNum)) {
    const auto = todayMonth;
    selMonthNum = months.some((m) => m.month_num === auto) ? auto : months[0]?.month_num || 1;
  }
  const selIdx = months.findIndex((m) => m.month_num === selMonthNum);
  const selMonth = months[selIdx];
  const isFuture = selMonth ? selMonth.month_num > todayMonth : false;

  // Month chip selector
  const chipsMonthHtml =
    '<div class="ym-monthbar">' +
    months
      .map((m) => {
        let c = 'ym-chip';
        if (m.month_num === selMonthNum) c += ' active';
        if (m.month_num === todayMonth) c += ' today';
        if (m.month_num > todayMonth) c += ' future';
        return (
          '<button class="' +
          c +
          '" onclick="setYearViewMonth(' +
          m.month_num +
          ')">' +
          ((m as unknown as { month_name?: string }).month_name || '').slice(0, 3) +
          '</button>'
        );
      })
      .join('') +
    '</div>';

  // Annual totals summary card (year-level numbers from the ribbon math)
  const annCardHtml =
    '<div class="card ym-annual">' +
    '<div class="ym-annual-title">' +
    state.currentYear +
    ' \u00B7 Annual</div>' +
    '<div class="ym-annual-grid">' +
    '<div class="ym-annual-cell"><span class="ym-al">Income (YTD / Proj)</span><span class="ym-av">' +
    fmtY(ytdIncome) +
    ' / ' +
    fmtY(totalAnnInc) +
    '</span></div>' +
    '<div class="ym-annual-cell"><span class="ym-al">Saved + Invested (YTD / Proj)</span><span class="ym-av" style="color:var(--green)">' +
    fmtY(ytdSavings) +
    ' / ' +
    fmtY(projSavings) +
    '</span></div>' +
    '<div class="ym-annual-cell"><span class="ym-al">\u2708\uFE0F Travel proj / gap</span><span class="ym-av">' +
    fmtY(totalTravelProjected) +
    ' \u00B7 <span style="color:' +
    (travelGap > 0 ? 'var(--red)' : 'var(--green)') +
    '">' +
    fmtY(Math.abs(travelGap)) +
    ' ' +
    (travelGap > 0 ? 'gap' : 'funded') +
    '</span></span></div>' +
    '<div class="ym-annual-cell"><span class="ym-al">\u{1F4CB} Admin proj / gap</span><span class="ym-av">' +
    fmtY(totalAdminProjected) +
    ' \u00B7 <span style="color:' +
    (adminGap > 0 ? 'var(--red)' : 'var(--green)') +
    '">' +
    fmtY(Math.abs(adminGap)) +
    ' ' +
    (adminGap > 0 ? 'gap' : 'funded') +
    '</span></span></div>' +
    '</div></div>';

  // Per-month rows \u2014 grouped by section, reusing computed[].values[selIdx]
  let mobileRows = '';
  computed.forEach((item) => {
    const row = item.row;
    if (row.type === 'section') {
      mobileRows += '<div class="ym-section">' + row.label + '</div>';
      return;
    }
    if (selIdx < 0) return;
    let valStr;
    if (item.isPct) {
      valStr = (item.values![selIdx] * 100).toFixed(1) + '%';
    } else {
      valStr = fmtYZ(item.values![selIdx]);
    }
    let cls = 'ym-row';
    if (row.type === 'sub') cls += ' ym-row-sub';
    else if (row.type === 'net') {
      const v = item.values![selIdx];
      cls += ' ym-row-net' + (v > 0 ? ' net-pos' : v < 0 ? ' net-neg' : '');
    } else if (row.bold) cls += ' ym-row-bold';
    mobileRows +=
      '<div class="' +
      cls +
      '"><span class="ym-label">' +
      row.label +
      '</span><span class="ym-dots"></span><span class="ym-val">' +
      valStr +
      '</span></div>';
  });

  const mobileHtml =
    '<div class="year-mobile">' +
    annCardHtml +
    chipsMonthHtml +
    '<div class="card ym-monthcard">' +
    '<div class="ym-monthcard-head">' +
    (selMonth ? selMonth.month_name : '') +
    (selMonthNum === todayMonth ? ' \u25C9' : '') +
    (isFuture
      ? '<span class="ym-proj-tag">' + (showProjected ? 'projected' : 'actual') + '</span>'
      : '') +
    '</div>' +
    mobileRows +
    '</div></div>';

  return (
    '<div class="year-tab-wrap' +
    (ymFull ? ' ym-full' : '') +
    '" data-year-filter="' +
    yearFilter +
    '" ' +
    aboveAttrs +
    '>' +
    modeToggleHtml +
    toggleHtml +
    chipsHtml +
    summaryHtml +
    '<div class="year-table-wrap"><table class="year-table">' +
    thead +
    '<tbody>' +
    tbody +
    '</tbody></table></div><div style="margin-top:.6rem;font-size:.62rem;color:var(--dim);text-align:center;">\u25C9 = current month &nbsp;|&nbsp; italics = projected</div>' +
    mobileHtml +
    '</div>'
  );
}

function setYearViewMonth(monthNum: number): void {
  state.yearViewMonth = monthNum;
  renderApp();
}

function setYearMobileFull(v: boolean): void {
  state.yearMobileFull = !!v;
  renderApp();
}

function setYearFilter(key: string): void {
  localStorage.setItem('yearFilter', key);
  renderApp();
}

function openSnapshot(): void {
  const current = state.months.find((m) => m.id === state.currentMonthId);
  if (!current) return;
  const income = totalIncome(current);
  const spent = spentByCategory();
  // Match ribbon logic: for hasTab categories (charity/travel/admin), count budget allocation as "spent"
  // Also include savings as "spent" (money allocated out of income)
  const totalSpent = ag(
    CATEGORIES.reduce((sum, c) => sum + (c.hasTab ? catBudget(c.key) || 0 : spent[c.key] || 0), 0) +
      (state.budgets['savings_bank'] || 0) +
      (state.budgets['savings_invested'] || 0),
  );
  const totalBudgeted = ag(
    CATEGORIES.reduce((sum, c) => sum + catBudget(c.key), 0) +
      (state.budgets['savings_bank'] || 0) +
      (state.budgets['savings_invested'] || 0),
  );
  const leftToBudget = ag(income - totalBudgeted);
  void leftToBudget; // used in template literal below
  const remainingInBudget = ag(totalBudgeted - totalSpent);
  void remainingInBudget; // used in template literal below

  const n = (v: number | null | undefined): string =>
    v == null
      ? ''
      : Number(v).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const groupRows = CATEGORY_GROUPS.map((group) => {
    const cats = group.keys
      .map((k) => CATEGORIES.find((c) => c.key === k))
      .filter((x): x is (typeof CATEGORIES)[0] => x !== undefined);
    const gs = ag(
      cats.reduce((sum, c) => sum + (c.hasTab ? catBudget(c.key) || 0 : spent[c.key] || 0), 0),
    );
    const gb = ag(cats.reduce((sum, c) => sum + catBudget(c.key), 0));
    const gr = ag(gb - gs);
    const gid = 'sngrp-' + group.label.replace(/[^a-zA-Z0-9]/g, '-');
    const catRows = cats
      .map((c) => {
        const b = catBudget(c.key) || 0;
        const s = c.hasTab ? b : spent[c.key] || 0;
        const r = b - s;
        // DC5 — gap triangles intentionally NOT rendered in Snapshot per
        // commit e19241a. Snapshot is a printable summary; the per-cell
        // amber ⚠ adds noise duplicating the Owed strip. Re-enabling on
        // tab cells would NOT bring them back here.
        return `<tr class="sn-cat ${gid} collapsed">
        <td data-label="Category" style="padding-left:1.5rem">${c.emoji} ${c.label}</td>
        <td data-label="Budget">${b ? n(b) : ''}</td>
        <td data-label="Spent">${b ? n(s) : ''}</td>
        <td data-label="Remaining" class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td>
      </tr>`;
      })
      .join('');
    if (cats.length === 1) {
      const c = cats[0];
      const b = catBudget(c.key) || 0;
      const s = c.hasTab ? b : spent[c.key] || 0;
      const r = b - s;
      return `<tr class="sn-cat"><td data-label="Category">${c.emoji} ${c.label}</td><td data-label="Budget">${b ? n(b) : ''}</td><td data-label="Spent">${b ? n(s) : ''}</td><td data-label="Remaining" class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td></tr>`;
    }
    return `<tr class="sn-group" id="${gid}-hdr" onclick="snToggle('${gid}')">
        <td data-label="Category"><span class="sn-chev" style="font-size:.65rem;margin-right:.4rem;color:var(--muted)">▶</span>${group.emoji} ${group.label}</td>
        <td data-label="Budget">${gb ? n(gb) : ''}</td>
        <td data-label="Spent">${n(gs)}</td>
        <td data-label="Remaining" class="${gr < 0 ? 'sn-over' : gr > 0 ? 'sn-ok' : ''}">${gb ? n(gr) : ''}</td>
      </tr>${catRows}`;
  }).join('');

  byId('snapshot-modal').style.display = 'flex';
  byId('snapshot-body').innerHTML = `
    <table class="sn-table">
      <thead><tr><th>Category</th><th>Budget ₪</th><th>Spent ₪</th><th>Remaining ₪</th></tr></thead>
      <tbody>
        <tr class="sn-section"><td colspan="4">📊 Summary — ${current.month_name}</td></tr>
        <tr class="sn-cat"><td data-label="Category">Income</td><td data-label="Budget"></td><td data-label="Spent">${n(income)}</td><td data-label="Remaining"></td></tr>
        <tr class="sn-cat"><td data-label="Category">Spent</td><td data-label="Budget"></td><td data-label="Spent">${n(totalSpent)}</td><td data-label="Remaining"></td></tr>
        <tr class="sn-cat"><td data-label="Category">Remaining</td><td data-label="Budget"></td><td data-label="Spent"></td><td data-label="Remaining" class="${income - totalSpent >= 0 ? 'sn-ok' : 'sn-over'}">${n(income - totalSpent)}</td></tr>
        <tr class="sn-group"><td data-label="Category">🏦 Savings</td><td data-label="Budget">${n((state.budgets['savings_bank'] || 0) + (state.budgets['savings_invested'] || 0))}</td><td data-label="Spent">${n((state.budgets['savings_bank'] || 0) + (state.budgets['savings_invested'] || 0))}</td><td data-label="Remaining">0</td></tr>
        <tr class="sn-cat"><td data-label="Category">🏦 In Bank</td><td data-label="Budget">${n(state.budgets['savings_bank'] || 0)}</td><td data-label="Spent">${n(state.budgets['savings_bank'] || 0)}</td><td data-label="Remaining">0</td></tr>
        <tr class="sn-cat"><td data-label="Category">📈 Invested</td><td data-label="Budget">${n(state.budgets['savings_invested'] || 0)}</td><td data-label="Spent">${n(state.budgets['savings_invested'] || 0)}</td><td data-label="Remaining">0</td></tr>
        ${groupRows}
      </tbody>
    </table>`;
}

async function refreshBiz() {
  state.loading = true;
  renderApp();
  await loadBizData();
  state.loading = false;
  renderApp();
}

// ── Init ──────────────────────────────────────────────────────────────
// MIGRATION REQUIRED (run once in Supabase SQL editor):
//   ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS subcategory TEXT;
async function loadFresh() {
  await loadMonths();
  await loadAvailableYears();
  if (!state.months.length) {
    state.loading = false;
    return;
  }
  const savedId = localStorage.getItem('activeMonthId');
  const now = new Date();
  const isCurrentCalendarYear = state.currentYear === now.getFullYear();
  const currentMonth =
    (savedId && state.months.find((m) => m.id === savedId)) ||
    (isCurrentCalendarYear && state.months.find((m) => m.month_num === now.getMonth() + 1)) ||
    state.months.find((m) => m.month_num === 1) ||
    state.months[state.months.length - 1];
  const monthId = currentMonth.id;
  state.currentMonthId = monthId;
  localStorage.setItem('activeMonthId', monthId);
  await Promise.all([
    loadTransactions(monthId),
    loadBudgets(monthId),
    loadIncomeItems(monthId),
    loadBudgetItems(monthId).then(() => seedBudgetItemsFromTemplate(monthId)),
    loadAdminData(),
    loadTravelData(),
    loadCharityData(),
    loadCashData(), // Cash tab data
  ]);
  const tab = state.activeTab;
  if (tab === 'biz') await loadBizData();
  else if (tab === 'year') await loadYearData();
  state.loading = false;
  saveCache();
}

async function init() {
  // Load autocomplete stores in background always
  sb.from('transactions')
    .select('category,store')
    .not('store', 'is', null)
    .then(({ data }) => {
      if (data) state.allStores = data as unknown as StoreRow[];
    });
  // Try cache first — show UI instantly, refresh in background
  if (restoreCache()) {
    renderApp();
    loadFresh()
      .then(() => {
        // Only re-render if no input is focused (avoid interrupting typing)
        if (
          !document.activeElement ||
          document.activeElement.tagName === 'BODY' ||
          document.activeElement === document.documentElement
        ) {
          renderApp();
        }
      })
      .catch(() => {});
    return;
  }
  // First visit or stale cache — normal load
  await loadFresh();
  renderApp();
}

// ── Auth gate ──────────────────────────────────────────────────────────
// The whole app is gated behind a Supabase Auth session. bootstrap() runs the
// session check on startup: a session → run init() exactly as before; no
// session → render the calm login screen instead of the app. Sessions persist
// in localStorage (sb client default), so this is a no-op once logged in.
const AUTH_DEFAULT_EMAIL = 'allisonecalt@gmail.com';
let _authBootstrapped = false;

async function bootstrap() {
  let session = null;
  try {
    const { data } = await sb.auth.getSession();
    session = data ? data.session : null;
  } catch (err) {
    console.warn('[auth] getSession failed:', err);
  }
  if (session) {
    _authBootstrapped = true;
    await init();
  } else {
    _authBootstrapped = false;
    renderLogin();
  }
}

function renderLogin(errMsg?: string): string | void {
  const root = byId('root');
  if (!root) return '';
  root.style.marginRight = '';
  root.innerHTML = `
    <div class="login-wrap">
      <div class="login-card card">
        <h1 class="login-title">Budget</h1>
        <p class="login-sub">Sign in to continue</p>
        <form id="login-form" class="login-form" autocomplete="on">
          <div class="fg">
            <label for="login-email">Email</label>
            <input type="email" id="login-email" autocomplete="username"
              value="${esc(AUTH_DEFAULT_EMAIL)}" required />
          </div>
          <div class="fg">
            <label for="login-password">Password</label>
            <input type="password" id="login-password"
              autocomplete="current-password" required />
          </div>
          <div class="login-err" id="login-err" ${errMsg ? '' : 'hidden'}>${esc(errMsg || '')}</div>
          <button type="submit" class="btn btn-primary login-btn" id="login-btn">Log in</button>
          <button type="button" class="login-forgot" id="login-forgot">Forgot password?</button>
        </form>
      </div>
    </div>`;
  const form = byId('login-form');
  if (form) form.addEventListener('submit', handleLoginSubmit);
  const forgot = byId('login-forgot');
  if (forgot) forgot.addEventListener('click', handleForgotPassword);
  const pw = byId('login-password');
  if (pw) pw.focus();
}

async function handleLoginSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const emailEl = byId('login-email');
  const pwEl = byId('login-password');
  const btn = byId('login-btn');
  const email = (emailEl && emailEl.value.trim()) || '';
  const password = (pwEl && pwEl.value) || '';
  if (!email || !password) {
    showLoginError('Enter your email and password.');
    return;
  }
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Logging in…';
  }
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      showLoginError(error.message || 'Login failed.');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Log in';
      }
      return;
    }
    // Success → run the normal startup. onAuthStateChange may also fire; the
    // _authBootstrapped guard keeps init() from running twice.
    if (!_authBootstrapped) {
      _authBootstrapped = true;
      await init();
    }
  } catch (err) {
    showLoginError(
      ((err as { message?: string }) && (err as { message?: string }).message) || 'Login failed.',
    );
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  }
}

async function handleForgotPassword() {
  const emailEl = byId('login-email');
  const email = (emailEl && emailEl.value.trim()) || AUTH_DEFAULT_EMAIL;
  if (!email) {
    showLoginError('Enter your email first.');
    return;
  }
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email);
    if (error) {
      showLoginError(error.message || 'Could not send reset link.');
      return;
    }
    toast(`Reset link sent to ${email}`);
  } catch (err) {
    showLoginError(
      ((err as { message?: string }) && (err as { message?: string }).message) ||
        'Could not send reset link.',
    );
  }
}

function showLoginError(msg: string): void {
  const el = byId('login-err');
  if (el) {
    el.textContent = msg;
    el.hidden = false;
  } else {
    toast(msg);
  }
}

async function authSignOut() {
  try {
    await sb.auth.signOut();
  } catch (err) {
    console.warn('[auth] signOut failed:', err);
  }
  _authBootstrapped = false;
  renderLogin();
}

// Re-render on auth changes (e.g. token refresh, sign-out from another tab).
// Guarded so a SIGNED_IN event during a normal page load doesn't double-init.
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    _authBootstrapped = false;
    renderLogin();
  } else if (session && !_authBootstrapped) {
    _authBootstrapped = true;
    init().catch((err) => console.warn('[auth] init after sign-in failed:', err));
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    doRedo();
  }
  // Q6 — Esc closes any open panel + the snapshot modal.
  if (e.key === 'Escape' || e.key === 'Esc') {
    const snap = byId('snapshot-modal');
    if (snap && snap.style.display !== 'none' && snap.style.display !== '') {
      snap.style.display = 'none';
      e.preventDefault();
      return;
    }
    if (anyPanelOpen()) {
      closeAllPanels();
      e.preventDefault();
    }
  }
});

// ── Unified panel system (Q5/Q6/M1) ────────────────────────────────────
// One backdrop element, shared across History + Search panels. Click on
// backdrop OR press Esc closes the active panel. Mobile (<=600px) renders
// the panels as bottom-sheets via the .app-panel CSS rules.
function ensureBackdrop() {
  let bd: HTMLElement = byId('app-panel-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'app-panel-backdrop';
    bd.className = 'app-panel-backdrop';
    bd.addEventListener('click', closeAllPanels);
    document.body.appendChild(bd);
  }
  return bd;
}
function showBackdrop() {
  const bd = ensureBackdrop();
  // Two-step add so the CSS transition kicks in
  bd.classList.add('visible');
  requestAnimationFrame(() => bd.classList.add('app-panel-backdrop-open'));
}
function hideBackdrop() {
  const bd = byId('app-panel-backdrop');
  if (!bd) return;
  bd.classList.remove('app-panel-backdrop-open');
  setTimeout(() => bd.classList.remove('visible'), 200);
}
function anyPanelOpen() {
  return !!document.querySelector('.app-panel.app-panel-open');
}
function closeOtherPanel(keepId: string): void {
  document.querySelectorAll('.app-panel').forEach((p) => {
    if (p.id !== keepId && p.classList.contains('app-panel-open')) {
      p.classList.remove('app-panel-open');
      setTimeout(() => {
        (p as HTMLElement).style.display = 'none';
      }, 220);
    }
  });
}
function closeAllPanels() {
  document.querySelectorAll('.app-panel.app-panel-open').forEach((p) => {
    p.classList.remove('app-panel-open');
    setTimeout(() => {
      (p as HTMLElement).style.display = 'none';
    }, 220);
  });
  // Reset desktop layout shift
  const root = byId('root');
  if (root) root.style.marginRight = '';
  hideBackdrop();
}

// Mobile bottom-sheet drag-to-dismiss. Touch the drag handle and pull down
// past 80px to close. Only active on viewports <= 600px.
document.addEventListener(
  'touchstart',
  (e) => {
    const _et = e.target as HTMLElement | null;
    const handle = _et && _et.closest && _et.closest('.app-panel-drag-handle');
    if (!handle || window.innerWidth > 600) return;
    const panel = handle.closest('.app-panel') as HTMLElement | null;
    if (!panel) return;
    const startY = e.touches[0].clientY;
    let dy = 0;
    const onMove = (ev: TouchEvent): void => {
      dy = Math.max(0, ev.touches[0].clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
      panel.style.transition = 'none';
    };
    const onEnd = () => {
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > 80) closeAllPanels();
      (document as EventTarget).removeEventListener('touchmove', onMove as EventListener);
      document.removeEventListener('touchend', onEnd);
    };
    (document as EventTarget).addEventListener('touchmove', onMove as EventListener, {
      passive: true,
    });
    document.addEventListener('touchend', onEnd, { passive: true });
  },
  { passive: true },
);
bootstrap();

// ── History Panel ──────────────────────────────────────────────────────
// M6 — Weekly digest builder. Aggregates the last 7 days of change_log entries
// into a single auto-generated summary at the TOP of the History panel.
// Lives INSIDE the panel (not on the main app surface) per the no-crowding rule.
function buildWeeklyDigest(rows: unknown[]): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recent = rows.filter((r) => {
    const t = new Date((r as Record<string, unknown>).created_at as string).getTime();
    return !isNaN(t) && t >= weekAgo;
  });
  if (recent.length === 0) return '';
  let txAdds = 0;
  let txAddSum = 0;
  let txDeletes = 0;
  let editsCount = 0;
  const categoriesTouched = new Set();
  const gapsClosedNotes = new Set();
  recent.map((rRaw) => {
    const r = rRaw as Record<string, unknown>;
    const et = String(r.entity_type || '');
    const act = String(r.action || '');
    if (et === 'transaction' && act === 'add') {
      txAdds++;
      try {
        const nvStr = r.new_value;
        const nv =
          typeof nvStr === 'string' ? (JSON.parse(nvStr) as Record<string, unknown>) : null;
        if (nv && typeof nv.amount === 'number') txAddSum += nv.amount;
        if (nv && nv.category) categoriesTouched.add(nv.category);
      } catch (_e) {
        void 0;
      }
    } else if (et === 'transaction' && act === 'delete') {
      txDeletes++;
    } else if (act === 'edit') {
      editsCount++;
    }
    if (
      act === 'add' &&
      (et === 'charity_payment' || et === 'travel_payment' || et === 'admin_payment')
    ) {
      gapsClosedNotes.add(et.split('_')[0]);
    }
  });
  // Date label:
  // Date label: "Week of <oldest date>"
  const earliestT = recent.reduce<number>(
    (min: number, r) =>
      Math.min(min, new Date((r as Record<string, unknown>).created_at as string).getTime()),
    Infinity,
  );
  const weekLabel = new Date(earliestT).toLocaleDateString('en-IL', {
    day: 'numeric',
    month: 'short',
  });
  const fmtAmt = (n: number): string =>
    '₪' + Math.round(n).toLocaleString('he-IL', { maximumFractionDigits: 0 });
  const parts = [];
  if (txAdds > 0) parts.push(`<strong>${txAdds}</strong> tx added (${fmtAmt(txAddSum)})`);
  if (txDeletes > 0) parts.push(`<strong>${txDeletes}</strong> deleted`);
  if (editsCount > 0) parts.push(`<strong>${editsCount}</strong> edits`);
  if (gapsClosedNotes.size > 0) {
    const labels = [...gapsClosedNotes]
      .map((t) => (t === 'charity' ? '💚 charity' : t === 'travel' ? '✈️ travel' : '📋 admin'))
      .join(', ');
    parts.push(`payments logged: ${labels}`);
  }
  if (parts.length === 0) return '';
  return (
    '<div class="weekly-digest" style="margin:.4rem .75rem .85rem;padding:.7rem .85rem;background:linear-gradient(180deg, var(--asoft) 0%, transparent 100%);border:1px solid var(--accent);border-radius:var(--r);">' +
    '<div style="font-size:.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--accent);margin-bottom:.35rem;">📅 Week of ' +
    weekLabel +
    '</div>' +
    '<div style="font-size:.78rem;color:var(--text);line-height:1.45;">' +
    parts.join(' &nbsp;·&nbsp; ') +
    '</div>' +
    '</div>'
  );
}

async function openHistoryPanel() {
  // Q5 — single-panel rule: opening one closes the other.
  closeOtherPanel('history-panel');
  let panel: HTMLElement = byId('history-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'history-panel';
    panel.className = 'app-panel app-panel-history';
    ensureBackdrop();
    if (window.innerWidth > 600) {
      byId('root').style.marginRight = '360px';
    }
    panel.innerHTML = `
      <div class="app-panel-drag-handle" aria-hidden="true"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-bottom:1px solid var(--border);flex-shrink:0;">
        <span style="font-weight:700;font-size:.95rem;">🕐 History Log</span>
        <button onclick="closeAllPanels()" aria-label="Close history" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted);">✕</button>
      </div>
      <div id="history-list" style="flex:1;overflow-y:auto;padding:.5rem 0;">
        <div style="padding:1rem;color:var(--muted);font-size:.82rem;">Loading…</div>
      </div>`;
    document.body.appendChild(panel);
    showBackdrop();
    requestAnimationFrame(() => panel.classList.add('app-panel-open'));
  } else {
    const wasHidden = panel.style.display === 'none' || !panel.classList.contains('app-panel-open');
    if (wasHidden) {
      panel.style.display = 'flex';
      ensureBackdrop();
      showBackdrop();
      if (window.innerWidth > 600) {
        byId('root').style.marginRight = '360px';
      }
      requestAnimationFrame(() => panel.classList.add('app-panel-open'));
    } else {
      closeAllPanels();
      return;
    }
  }
  const list = byId('history-list');
  const { data, error } = await sb
    .from('change_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) {
    list.innerHTML = `<div style="padding:1rem;color:var(--log-delete);font-size:.82rem;">Could not load history. Make sure the change_log table exists in Supabase.</div>`;
    return;
  }
  if (data.length === 0) {
    list.innerHTML = `<div style="padding:1rem;color:var(--muted);font-size:.82rem;">No history yet — changes will appear here as you use the app.</div>`;
    return;
  }
  const colors: Record<string, string> = {
    add: 'var(--log-add)',
    delete: 'var(--log-delete)',
    edit: 'var(--log-edit)',
  };
  const fmtDate = (iso: string | null | undefined): string => {
    const d = new Date(iso || '');
    return (
      d.toLocaleDateString('en-IL', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ', ' +
      d.toLocaleTimeString('en-IL', { hour: '2-digit', minute: '2-digit' })
    );
  };
  // M6 — Weekly digest at TOP of history list. Auto-generated rollup of the
  // last 7 days of change_log entries.
  const digestHtml = buildWeeklyDigest(data);
  list.innerHTML =
    digestHtml +
    data
      .map((r) => {
        const canClick =
          r.action !== 'delete' && (r.entity_id || r.entity_type === 'budget_amount');
        let clickHandler = '';
        if (canClick) {
          if (r.entity_type === 'budget_amount') {
            const m = (r.description as string).match(/Budget changed: (\S+)/);
            if (m) clickHandler = `jumpToHistoryEntry('budget_amount','${m[1]}')`;
          } else {
            clickHandler = `jumpToHistoryEntry('${r.entity_type}','${r.entity_id}')`;
          }
        }
        const clickAttr = clickHandler
          ? `onclick="${clickHandler}" style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;cursor:pointer;transition:background .15s;" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"`
          : `style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;"`;
        return `<div ${clickAttr}>
      <span style="width:8px;height:8px;border-radius:50%;background:${colors[r.action as string] || 'var(--log-default)'};flex-shrink:0;margin-top:.35rem;"></span>
      <div style="min-width:0;">
        <div style="font-size:.82rem;color:var(--text);word-break:break-word;">${esc(r.description)}${clickHandler ? ' ↗' : ''}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:.15rem;">${fmtDate((r as Record<string, unknown>).created_at as string | null)}</div>
      </div>
    </div>`;
      })
      .join('');
}

// Auto-refresh history if panel is open
async function refreshHistoryIfOpen() {
  const panel = byId('history-panel');
  if (panel && panel.style.display !== 'none') {
    const list = byId('history-list');
    if (!list) return;
    const { data } = await sb
      .from('change_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!data) return;
    const colors: Record<string, string> = {
      add: 'var(--log-add)',
      delete: 'var(--log-delete)',
      edit: 'var(--log-edit)',
    };
    const fmtDate = (iso: string | null | undefined): string => {
      const d = new Date(iso || '');
      return (
        d.toLocaleDateString('en-IL', { weekday: 'short', day: 'numeric', month: 'short' }) +
        ', ' +
        d.toLocaleTimeString('en-IL', { hour: '2-digit', minute: '2-digit' })
      );
    };
    const digestHtml2 = buildWeeklyDigest(data);
    list.innerHTML =
      digestHtml2 +
      data
        .map((r) => {
          const canClick =
            r.action !== 'delete' && (r.entity_id || r.entity_type === 'budget_amount');
          let clickHandler = '';
          if (canClick) {
            if (r.entity_type === 'budget_amount') {
              const m = (r.description as string).match(/Budget changed: (\S+)/);
              if (m) clickHandler = `jumpToHistoryEntry('budget_amount','${m[1]}')`;
            } else {
              clickHandler = `jumpToHistoryEntry('${r.entity_type}','${r.entity_id}')`;
            }
          }
          const clickAttr = clickHandler
            ? `onclick="${clickHandler}" style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;cursor:pointer;transition:background .15s;" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"`
            : `style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;"`;
          return `<div ${clickAttr}>
        <span style="width:8px;height:8px;border-radius:50%;background:${colors[r.action as string] || 'var(--log-default)'};flex-shrink:0;margin-top:.35rem;"></span>
        <div style="min-width:0;">
          <div style="font-size:.82rem;color:var(--text);word-break:break-word;">${esc(r.description)}${clickHandler ? ' ↗' : ''}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:.15rem;">${fmtDate(r.created_at.created_at)}</div>
        </div>
      </div>`;
        })
        .join('');
  }
}

// Jump to transaction from history
function jumpToTransaction(txId: string): void {
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) {
    toast('Transaction not found in current month');
    return;
  }
  // Open the category
  if (!state.openCats.has(tx.category)) {
    state.openCats.add(tx.category);
    localStorage.setItem('openCats', JSON.stringify([...state.openCats]));
    renderApp();
  }
  // Scroll to and highlight the transaction row
  setTimeout(() => {
    const el = document.querySelector(`[data-tx-id="${txId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.background = 'var(--accent)';
      el.style.color = '#fff';
      el.style.borderRadius = '6px';
      setTimeout(() => {
        el.style.background = '';
        el.style.color = '';
        el.style.borderRadius = '';
      }, 2000);
    }
  }, 100);
}

// Jump to any entity from history log
async function jumpToHistoryEntry(entityType: string, entityId: string): Promise<void> {
  if (entityType === 'transaction') {
    jumpToTransaction(entityId);
    return;
  }

  const highlight = (el: HTMLElement, ms?: number) => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '2px solid var(--accent)';
    el.style.borderRadius = '6px';
    setTimeout(() => {
      el.style.outline = '';
      el.style.borderRadius = '';
    }, ms || 2000);
  };

  if (entityType === 'budget_amount') {
    if (state.activeTab !== 'budget') await switchTab('budget');
    setTimeout(() => {
      const el = byId('cat-' + entityId);
      if (el) highlight(el);
      else toast('Category not found on current view');
    }, 200);
    return;
  }

  if (entityType === 'budget_item') {
    if (state.activeTab !== 'budget') await switchTab('budget');
    setTimeout(() => {
      const el = document.querySelector(
        '[data-budget-item-id="' + entityId + '"]',
      ) as HTMLElement | null;
      if (el) {
        const catRow = el.closest('.cat-row');
        if (catRow) {
          const catKey = catRow.id.replace('cat-', '');
          if (!state.openCats.has(catKey)) {
            state.openCats.add(catKey);
            localStorage.setItem('openCats', JSON.stringify([...state.openCats]));
            renderApp();
          }
        }
        setTimeout(() => {
          const el2 = document.querySelector(
            '[data-budget-item-id="' + entityId + '"]',
          ) as HTMLElement | null;
          if (el2) {
            highlight(el2);
            el2.style.background = 'var(--accent)';
            el2.style.color = '#fff';
            setTimeout(() => {
              el2.style.background = '';
              el2.style.color = '';
            }, 2000);
          }
        }, 150);
      } else toast('Item not found — may have been deleted');
    }, 200);
    return;
  }

  if (entityType === 'admin_item') {
    if (state.activeTab !== 'admin') await switchTab('admin');
    setTimeout(() => {
      const el = document.querySelector(
        '[data-admin-item-id="' + entityId + '"]',
      ) as HTMLElement | null;
      if (el) highlight(el);
      else toast('Admin item not found — may have been deleted');
    }, 300);
    return;
  }

  if (entityType === 'admin_payment') {
    if (state.activeTab !== 'admin') await switchTab('admin');
    setTimeout(() => {
      const el = document.querySelector(
        '[data-admin-payment-id="' + entityId + '"]',
      ) as HTMLElement | null;
      if (el) {
        const parentItem = el.closest('[data-admin-item-id]');
        if (parentItem) {
          const itemId = parentItem.getAttribute('data-admin-item-id');
          if (localStorage.getItem('sn-adm-' + itemId) !== '1') {
            localStorage.setItem('sn-adm-' + itemId, '1');
            renderApp();
          }
        }
        setTimeout(() => {
          const el2 = document.querySelector(
            '[data-admin-payment-id="' + entityId + '"]',
          ) as HTMLElement | null;
          if (el2) highlight(el2);
        }, 200);
      } else toast('Payment not found — may have been deleted');
    }, 300);
    return;
  }

  toast('Cannot navigate to this item');
}

// ── Search Panel ─────────────────────────────────────────────────────
function openSearchPanel(): void {
  // Q5 \u2014 single-panel rule: opening one closes the other.
  closeOtherPanel('search-panel');
  let panel: HTMLElement = byId('search-panel');
  if (panel) {
    const wasHidden = panel.style.display === 'none' || !panel.classList.contains('app-panel-open');
    if (wasHidden) {
      panel.style.display = 'flex';
      ensureBackdrop();
      showBackdrop();
      if (window.innerWidth > 600) {
        byId('root').style.marginRight = '420px';
      }
      requestAnimationFrame(() => panel.classList.add('app-panel-open'));
      setTimeout(() => byId('search-input').focus(), 50);
    } else {
      closeAllPanels();
    }
    return;
  }
  panel = document.createElement('div');
  panel.id = 'search-panel';
  panel.className = 'app-panel app-panel-search';
  ensureBackdrop();
  if (window.innerWidth > 600) {
    byId('root').style.marginRight = '420px';
  }
  panel.innerHTML = `
    <div class="app-panel-drag-handle" aria-hidden="true"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-bottom:1px solid var(--border);flex-shrink:0;">
      <span style="font-weight:700;font-size:.95rem;">\u{1F50D} Search Transactions</span>
      <button onclick="closeAllPanels()" aria-label="Close search" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted);">\u2715</button>
    </div>
    <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);flex-shrink:0;">
      <input id="search-input" type="text" placeholder="Search store or item name\u2026" style="width:100%;padding:.5rem .75rem;border:1px solid var(--border);border-radius:var(--r);font-size:.9rem;background:var(--surface2);color:var(--text);outline:none;font-family:inherit;" />
      <div style="margin-top:.5rem;display:flex;gap:.5rem;align-items:center;">
        <label style="font-size:.75rem;color:var(--muted);display:flex;align-items:center;gap:.25rem;">
          <input type="checkbox" id="search-all-months" checked /> All months
        </label>
      </div>
    </div>
    <div id="search-results" style="flex:1;overflow-y:auto;padding:.75rem 1rem;">
      <div style="color:var(--muted);font-size:.82rem;text-align:center;padding:2rem 0;">Type to search across all your transactions</div>
    </div>`;
  document.body.appendChild(panel);
  showBackdrop();
  requestAnimationFrame(() => panel.classList.add('app-panel-open'));

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const input = byId('search-input');
  input.addEventListener('input', () => {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(input.value.trim()), 300);
  });
  byId('search-all-months').addEventListener('change', () => {
    if (input.value.trim()) runSearch(input.value.trim());
  });
  setTimeout(() => input.focus(), 50);
}

async function runSearch(query: string): Promise<void> {
  const resultsDiv = byId('search-results');
  if (!query || query.length < 2) {
    resultsDiv.innerHTML =
      '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:2rem 0;">Type at least 2 characters to search</div>';
    return;
  }
  resultsDiv.innerHTML =
    '<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:2rem 0;">Searching\u2026</div>';

  const allMonths = byId('search-all-months').checked;
  let transactions;
  let budgetItemMatches = [];

  if (allMonths) {
    const [txRes, biRes] = await Promise.all([
      sb
        .from('transactions')
        .select('*, months!inner(month_name, month_num)')
        .order('created_at', { ascending: false }),
      sb.from('budget_items').select('*, months!inner(month_name, month_num)').order('sort_order'),
    ]);
    if (txRes.error) {
      resultsDiv.innerHTML = `<div style="color:var(--red);font-size:.82rem;padding:1rem;">Error: ${txRes.error.message}</div>`;
      return;
    }
    transactions = txRes.data || [];
    const allBi = biRes.data || [];
    const q = query.toLowerCase();
    budgetItemMatches = allBi.filter(
      (bi) =>
        (bi.label && bi.label.toLowerCase().includes(q)) ||
        (bi.category && bi.category.toLowerCase().includes(q)) ||
        (bi.subcategory && bi.subcategory.toLowerCase().includes(q)),
    );
  } else {
    transactions = state.transactions.map((t) => {
      const m = state.months.find((mo) => mo.id === state.currentMonthId);
      return {
        ...t,
        months: m
          ? {
              month_name: (m as unknown as { month_name?: string }).month_name,
              month_num: m.month_num,
            }
          : null,
      };
    });
    // Budget items for current month
    const q = query.toLowerCase();
    Object.entries(state.budgetItems).forEach(([cat, items]) => {
      items.forEach((bi) => {
        if (
          (bi.label && bi.label.toLowerCase().includes(q)) ||
          (cat && cat.toLowerCase().includes(q))
        ) {
          const m = state.months.find((mo) => mo.id === state.currentMonthId);
          budgetItemMatches.push({
            ...bi,
            category: cat,
            months: m
              ? {
                  month_name: (m as unknown as { month_name?: string }).month_name,
                  month_num: m.month_num,
                }
              : null,
          });
        }
      });
    });
  }

  const q = query.toLowerCase();
  const matches = transactions.filter(
    (t) =>
      (t.store && t.store.toLowerCase().includes(q)) ||
      (t.item && t.item.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q)),
  );

  if (matches.length === 0 && budgetItemMatches.length === 0) {
    resultsDiv.innerHTML = `<div style="color:var(--muted);font-size:.82rem;text-align:center;padding:2rem 0;">No results for "${esc(query)}"</div>`;
    return;
  }

  const total = ag(matches.reduce((sum, t) => sum + (t.amount || 0), 0));
  const biTotal = ag(budgetItemMatches.reduce((sum, bi) => sum + (bi.amount || 0), 0));
  const catLabel = (key: string): string => {
    const c = CATEGORIES.find((cat) => cat.key === key);
    return c ? `${c.emoji} ${c.label}` : key;
  };

  // Group by month for trend
  const byMonth: Record<string, { total: number; count: number; num: number }> = {};
  matches.forEach((t) => {
    const mName = t.months ? t.months.month_name : 'Unknown';
    const mNum = t.months ? t.months.month_num : 0;
    if (!byMonth[mName]) byMonth[mName] = { total: 0, count: 0, num: mNum };
    byMonth[mName].total += t.amount || 0;
    byMonth[mName].count++;
  });
  const sortedMonths = Object.entries(byMonth).sort((a, b) => a[1].num - b[1].num);

  // Group by category for breakdown
  const byCat: Record<string, { total: number; count: number }> = {};
  matches.forEach((t) => {
    if (!byCat[t.category]) byCat[t.category] = { total: 0, count: 0 };
    byCat[t.category].total += t.amount || 0;
    byCat[t.category].count++;
  });

  const n = (v: number): string =>
    Number(v).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  let html = '';

  // Summary
  const totalResults = matches.length + budgetItemMatches.length;
  html += `<div class="search-summary">
    <div style="font-size:.95rem;font-weight:700;color:var(--text);margin-bottom:.25rem;">
      "${esc(query)}" \u2014 ${totalResults} result${totalResults !== 1 ? 's' : ''}
    </div>
    ${matches.length > 0 ? `<div style="font-size:1.3rem;font-weight:700;color:var(--accent);">\u20AA${n(total)} <span style="font-size:.75rem;font-weight:400;color:var(--muted);">spent</span></div>` : ''}
    ${budgetItemMatches.length > 0 ? `<div style="font-size:${matches.length > 0 ? '.85' : '1.3'}rem;font-weight:700;color:var(--accent);margin-top:.15rem;">\u20AA${n(biTotal)} <span style="font-size:.75rem;font-weight:400;color:var(--muted);">budgeted (${budgetItemMatches.length} line item${budgetItemMatches.length !== 1 ? 's' : ''})</span></div>` : ''}
    ${
      matches.length > 0
        ? `<div style="font-size:.75rem;color:var(--muted);margin-top:.15rem;">
      across ${sortedMonths.length} month${sortedMonths.length !== 1 ? 's' : ''}
    </div>`
        : ''
    }
  </div>`;

  // Trend by month
  if (sortedMonths.length > 1) {
    const maxMonthTotal = Math.max(...sortedMonths.map(([, d]) => d.total));
    html += `<div class="search-section">
      <div class="search-section-title">Monthly Trend</div>
      ${sortedMonths
        .map(([month, d]) => {
          const pct = maxMonthTotal ? (d.total / maxMonthTotal) * 100 : 0;
          return `<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem;">
          <span style="width:36px;font-size:.72rem;color:var(--muted);text-align:right;flex-shrink:0;">${month.slice(0, 3)}</span>
          <div style="flex:1;height:18px;background:var(--surface2);border-radius:4px;overflow:hidden;position:relative;">
            <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;transition:width .3s;"></div>
          </div>
          <span style="width:70px;font-size:.78rem;font-weight:600;text-align:right;flex-shrink:0;">\u20AA${n(d.total)}</span>
        </div>`;
        })
        .join('')}
    </div>`;

    // Detect price changes for recurring items (1 per month = likely subscription)
    if (sortedMonths.every(([, d]) => d.count === 1)) {
      const amounts = sortedMonths.map(([, d]) => d.total);
      const unique = [...new Set(amounts)];
      if (unique.length > 1) {
        const changes = [];
        for (let i = 1; i < sortedMonths.length; i++) {
          const prev = sortedMonths[i - 1][1].total;
          const curr = sortedMonths[i][1].total;
          if (prev !== curr) {
            const diff = curr - prev;
            changes.push(
              `${sortedMonths[i - 1][0].slice(0, 3)}\u2192${sortedMonths[i][0].slice(0, 3)}: ${diff > 0 ? '+' : ''}\u20AA${n(diff)}`,
            );
          }
        }
        if (changes.length > 0) {
          html += `<div style="background:var(--ambersoft);border-radius:var(--r);padding:.5rem .75rem;margin-bottom:.75rem;font-size:.78rem;color:var(--amber);">
            \u26A1 Price change: ${changes.join(', ')}
          </div>`;
        }
      }
    }
  }

  // Category breakdown (if more than one category)
  if (Object.keys(byCat).length > 1) {
    html += `<div class="search-section">
      <div class="search-section-title">By Category</div>
      ${Object.entries(byCat)
        .sort((a, b) => b[1].total - a[1].total)
        .map(
          ([cat, d]) =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem 0;font-size:.82rem;">
          <span>${catLabel(cat)}</span>
          <span style="font-weight:600;">\u20AA${n(d.total)} <span style="color:var(--muted);font-weight:400;">(${d.count})</span></span>
        </div>`,
        )
        .join('')}
    </div>`;
  }

  // Budget items section — one line per item
  if (budgetItemMatches.length > 0) {
    const sortedBi = [...budgetItemMatches].sort((a, b) =>
      a.months && b.months ? a.months.month_num - b.months.month_num : 0,
    );
    html += `<div class="search-section">
      <div class="search-section-title">Budget Line Items</div>
      ${sortedBi
        .map((bi) => {
          const monthLabel = bi.months ? bi.months.month_name.slice(0, 3) : '';
          return `<div class="search-tx-row">
          <span class="search-tx-date">${monthLabel}</span>
          <span class="search-tx-cat">${catLabel(bi.category)}</span>
          <div class="search-tx-detail">
            <span class="search-tx-store">${esc(bi.label || '')}</span>
            ${bi.subcategory ? `<span class="search-tx-item">${esc(bi.subcategory)}</span>` : ''}
          </div>
          <span class="search-tx-amount">\u20AA${n(bi.amount)}</span>
        </div>`;
        })
        .join('')}
    </div>`;
  }

  // Transaction list
  if (matches.length > 0) {
    html += `<div class="search-section">
      <div class="search-section-title">Transactions</div>
      ${matches
        .map((t) => {
          const monthLabel = t.months ? t.months.month_name.slice(0, 3) : '';
          const dateStr = t.date || '';
          const displayDate = dateStr
            ? new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : monthLabel;
          return `<div class="search-tx-row search-tx-clickable" onclick="searchJumpToTx('${t.id}','${t.month_id}')">
          <span class="search-tx-date">${displayDate}</span>
          <span class="search-tx-cat">${catLabel(t.category)}</span>
          <div class="search-tx-detail">
            ${t.store ? `<span class="search-tx-store">${esc(t.store)}</span>` : ''}
            ${t.item ? `<span class="search-tx-item">${esc(t.item)}</span>` : ''}
          </div>
          <span class="search-tx-amount">\u20AA${n(t.amount)}</span>
        </div>`;
        })
        .join('')}
    </div>`;
  }

  resultsDiv.innerHTML = html;
}

async function searchJumpToTx(txId: string, monthId: string): Promise<void> {
  // Switch month if needed, then jump
  if (monthId && monthId !== state.currentMonthId) {
    await switchMonth(monthId);
  }
  // Close search panel (uses unified panel close so backdrop & layout reset cleanly)
  closeAllPanels();
  // Make sure we're on the budget tab
  if (state.activeTab !== 'budget') {
    state.activeTab = 'budget';
    localStorage.setItem('activeTab', 'budget');
    renderApp();
  }
  jumpToTransaction(txId);
}

// ── M2 — Sticky "+" FAB on mobile, tab-aware quick-add ─────────────────
// Renders a floating "+" button bottom-right on viewports <= 600px.
// Tab-aware: opens a quick-add bottom-sheet for the current tab.
// Tabs without a quick-add path (year, cash, biz) get no FAB.
function fabSpec() {
  switch (state.activeTab) {
    case 'budget':
      return { label: 'Add transaction', kind: 'tx' };
    case 'travel':
      return { label: 'Add travel payment', kind: 'travel' };
    case 'charity':
      return { label: 'Log charity payment', kind: 'charity' };
    case 'admin':
      return { label: 'Log admin payment', kind: 'admin' };
    default:
      return null;
  }
}

function renderFab() {
  let fab: HTMLElement = byId('mobile-fab');
  const spec = fabSpec();
  if (!spec) {
    if (fab) fab.remove();
    return;
  }
  if (!fab) {
    const fabBtn = document.createElement('button');
    fabBtn.id = 'mobile-fab';
    fabBtn.type = 'button';
    fabBtn.className = 'mobile-fab';
    fabBtn.innerHTML = '+';
    fabBtn.setAttribute('aria-label', spec.label);
    fabBtn.onclick = openQuickAddSheet;
    document.body.appendChild(fabBtn);
    fab = fabBtn;
  } else {
    fab.setAttribute('aria-label', spec.label);
  }
}

function openQuickAddSheet() {
  const spec = fabSpec();
  if (!spec) return;
  closeAllPanels();
  let panel: HTMLElement = byId('quick-add-sheet');
  if (panel) panel.remove();
  panel = document.createElement('div');
  panel.id = 'quick-add-sheet';
  panel.className = 'app-panel app-panel-quickadd';
  ensureBackdrop();
  panel.innerHTML = `
    <div class="app-panel-drag-handle" aria-hidden="true"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem 1rem .55rem;border-bottom:1px solid var(--border);flex-shrink:0;">
      <span style="font-weight:700;font-size:.95rem;">${spec.label}</span>
      <button onclick="closeAllPanels()" aria-label="Close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted);padding:.25rem .5rem;">✕</button>
    </div>
    <div style="padding:.85rem 1rem 1.1rem;display:flex;flex-direction:column;gap:.55rem;">
      ${quickAddSheetBody(spec.kind)}
    </div>
  `;
  document.body.appendChild(panel);
  panel.style.display = 'flex';
  showBackdrop();
  requestAnimationFrame(() => panel.classList.add('app-panel-open'));
  // Focus first input
  setTimeout(() => {
    const f = panel.querySelector('input,select') as HTMLElement | null;
    if (f) f.focus();
  }, 240);
}

function quickAddSheetBody(kind: string): string {
  const inputCss =
    "width:100%;font-size:.95rem;padding:.55rem .65rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;box-sizing:border-box;";
  const btnCss =
    "width:100%;padding:.7rem;background:var(--accent);color:white;border:none;border-radius:var(--r);font-family:'DM Sans',sans-serif;font-weight:600;font-size:.95rem;cursor:pointer;margin-top:.3rem;";
  if (kind === 'tx') {
    return `
      <select id="qa-cat" style="${inputCss}">
        <option value="">Category…</option>
        ${[...CATEGORIES]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((c) => `<option value="${c.key}">${c.emoji} ${c.label}</option>`)
          .join('')}
      </select>
      <input type="text" id="qa-store" placeholder="Store" style="${inputCss}">
      <input type="text" id="qa-item" placeholder="Item" style="${inputCss}">
      <input type="number" id="qa-amount" placeholder="Amount ₪" min="0" step="0.01" inputmode="decimal" style="${inputCss}">
      <input type="date" id="qa-date" style="${inputCss}">
      <button onclick="submitQuickAdd('tx')" style="${btnCss}">Save transaction</button>
    `;
  }
  if (kind === 'travel') {
    return `
      <input type="text" id="qa-label" placeholder="What" style="${inputCss}">
      <input type="text" id="qa-dest" placeholder="Trip / destination" list="qa-dest-list" style="${inputCss}">
      <datalist id="qa-dest-list">
        ${(state.travel?.items || []).map((i) => `<option value="${(i.label || '').replace(/"/g, '&quot;')}">`).join('')}
      </datalist>
      <input type="number" id="qa-amount" placeholder="Amount ₪" min="0" step="0.01" inputmode="decimal" style="${inputCss}">
      <button onclick="submitQuickAdd('travel')" style="${btnCss}">Log payment</button>
    `;
  }
  if (kind === 'charity') {
    return `
      <input type="text" id="qa-label" placeholder="Charity name" style="${inputCss}">
      <input type="date" id="qa-date" style="${inputCss}">
      <input type="number" id="qa-amount" placeholder="Amount ₪" min="0" step="0.01" inputmode="decimal" style="${inputCss}">
      <button onclick="submitQuickAdd('charity')" style="${btnCss}">Log payment</button>
    `;
  }
  if (kind === 'admin') {
    return `
      <input type="text" id="qa-label" placeholder="What" style="${inputCss}">
      <input type="number" id="qa-amount" placeholder="Amount ₪" min="0" step="0.01" inputmode="decimal" style="${inputCss}">
      <button onclick="submitQuickAdd('admin')" style="${btnCss}">Log payment</button>
    `;
  }
  return '';
}

async function submitQuickAdd(kind: string): Promise<void> {
  const monthNum = currentMonthNum();
  if (kind === 'tx') {
    const cat = byId('qa-cat').value;
    const store = byId('qa-store').value.trim();
    const item = byId('qa-item').value.trim();
    const amount = parseFloat(byId('qa-amount').value);
    const date = byId('qa-date').value;
    if (!cat || !amount || isNaN(amount)) {
      toast('Fill in category and amount');
      return;
    }
    const { data: txData, error } = await sb
      .from('transactions')
      .insert({
        month_id: state.currentMonthId,
        category: cat,
        store: store || null,
        item: item || null,
        amount,
        date: date || null,
      })
      .select()
      .single();
    if (error) {
      toast('Error saving — try again');
      return;
    }
    state.transactions.push(txData);
    logChange(
      'add',
      'transaction',
      txData.id,
      `Added ${store || item || cat} ₪${amount} • ${cat}`,
      null,
      txData,
      state.currentMonthId!,
    );
    pushUndo({
      label: 'add transaction',
      undo: async () => {
        await sb.from('transactions').delete().eq('id', txData.id);
        await loadTransactions(state.currentMonthId!);
      },
      redo: async () => {
        await sb.from('transactions').insert(txData);
        await loadTransactions(state.currentMonthId!);
      },
    });
    closeAllPanels();
    renderApp();
    toast('Transaction saved ✓');
    return;
  }
  if (kind === 'travel') {
    const label = byId('qa-label').value.trim();
    const destination = byId('qa-dest').value.trim();
    const amount = parseFloat(byId('qa-amount').value);
    if (!label || !amount || isNaN(amount)) {
      toast('Fill in what and amount');
      return;
    }
    const { data, error } = await sb
      .from('travel_payments')
      .insert({ year: state.currentYear, month_num: monthNum, label, destination, amount })
      .select()
      .single();
    if (error) {
      toast('Error saving');
      return;
    }
    state.travel.payments.push(data);
    state.travel.payments.sort((a, b) => a.month_num - b.month_num);
    closeAllPanels();
    renderApp();
    toast('Payment logged ✓');
    return;
  }
  if (kind === 'charity') {
    const label = byId('qa-label').value.trim();
    const dateVal = byId('qa-date').value || null;
    const amount = parseFloat(byId('qa-amount').value);
    if (!label || !amount || isNaN(amount)) {
      toast('Fill in name and amount');
      return;
    }
    const { data, error } = await sb
      .from('charity_payments')
      .insert({
        year: state.currentYear,
        month_num: monthNum,
        label,
        amount,
        payment_date: dateVal,
      })
      .select()
      .single();
    if (error) {
      toast('Error saving');
      return;
    }
    state.charity.payments.push(data);
    state.charity.payments.sort((a, b) => a.month_num - b.month_num);
    closeAllPanels();
    renderApp();
    toast('Payment logged ✓');
    return;
  }
  if (kind === 'admin') {
    const label = byId('qa-label').value.trim();
    const amount = parseFloat(byId('qa-amount').value);
    if (!label || !amount || isNaN(amount)) {
      toast('Fill in what and amount');
      return;
    }
    // Single source of truth: quick-adds land in the sub-item ledger (the same one
    // the Admin tab Payment Log and the dashboard read), under a catch-all item.
    let parent = (state.admin.items || []).find((i) => i.label === 'Quick Payments');
    if (!parent) {
      const { data: newItem, error: itemErr } = await sb
        .from('admin_items')
        .insert({
          year: state.currentYear,
          label: 'Quick Payments',
          projected_amount: 0,
          category: 'Admin',
          is_logged: true,
        })
        .select()
        .single();
      if (itemErr) {
        toast('Error saving');
        return;
      }
      parent = newItem;
      (state.admin.items as AdminItemRow[]).push(parent as AdminItemRow);
    }
    const { data, error } = await sb
      .from('admin_sub_items')
      .insert({
        item_id: parent!.id,
        label,
        amount,
        month_num: monthNum,
        is_paid: true,
        is_estimate: false,
      })
      .select()
      .single();
    if (error) {
      toast('Error saving');
      return;
    }
    state.admin.subItems.push(data);
    // Keep the catch-all's projected in step with its paid total so it never reads
    // as over/under budget in Yearly Expenses.
    const newProj = Number(parent!.projected_amount || 0) + amount;
    await sb.from('admin_items').update({ projected_amount: newProj }).eq('id', parent!.id);
    parent!.projected_amount = newProj;
    closeAllPanels();
    renderApp();
    toast('Payment logged ✓');
    return;
  }
}

// "Today's month" relative to the year being viewed. Only the real current
// calendar month counts as "today" when viewing the current year; a past year
// reads as all-months-past (13), a future year as all-months-future (0).
function todayMonthForYear() {
  const now = new Date();
  if (state.currentYear === now.getFullYear()) return now.getMonth() + 1;
  return state.currentYear < now.getFullYear() ? 13 : 0;
}

function currentMonthNum() {
  const m = state.months.find((x) => x.id === state.currentMonthId);
  return (m && m.month_num) || todayMonthForYear();
}

// ── M5 — Always-visible Owed widget (global, all tabs) ─────────────────
// Computes Travel-gap + Admin-gap + Below-Threshold and shows them in a
// compact widget near the toolbar. Click to expand into a popover with the
// breakdown. Values match the Budget-tab Owed strip exactly.
function computeOwed() {
  const tProj = (state.travel?.items || []).reduce(
    (s, i) => s + (Number(i.projected_amount) || 0),
    0,
  );
  const tAlloc = Object.values(state.travel?.allocations || {}).reduce(
    (s, a) => s + (Number(a.amount) || 0),
    0,
  );
  const tGap = ag(Math.max(0, tProj - tAlloc));
  const aProj = (state.admin?.items || []).reduce(
    (s, i) => s + (Number(i.projected_amount) || 0),
    0,
  );
  const aAlloc = Object.values(state.admin?.allocations || {}).reduce(
    (s, a) => s + (Number(a.amount) || 0),
    0,
  );
  const aGap = ag(Math.max(0, aProj - aAlloc));
  return { tGap, aGap, total: ag(tGap + aGap) };
}

// ── B3 — Pending decisions surface ─────────────────────────────────────
// Auto-collects:
//   - Estimates (is_estimate=true) on charity_payments, travel_payments, admin sub-items
//   - YEARLY allocation gaps: Travel gap, Admin gap (one line each)
// Does NOT collect: receipts, per-month admin gaps, per-trip travel gaps.
// (Per reference_budget_workflow.md — Allison's narrowed spec.)
function computePending() {
  const items = [];

  // Estimates from each payments list
  const collectEstimates = (
    payments: Record<string, unknown>[],
    kind: string,
    tab: string,
    emoji: string,
  ): void => {
    (payments || [])
      .filter((p) => p.is_estimate)
      .forEach((p) => {
        const amt = Number(p.amount) || 0;
        const label =
          String(
            (p as Record<string, unknown>).label || (p as Record<string, unknown>).what || '',
          ).trim() || `(unnamed ${kind})`;
        items.push({
          type: 'estimate',
          kind,
          emoji,
          tab,
          id: p.id,
          label: `${kind}: ${label}`,
          amount: amt,
        });
      });
  };
  collectEstimates(state.charity?.payments, 'Charity', 'charity', '💚');
  collectEstimates(state.travel?.payments, 'Travel', 'travel', '✈️');
  collectEstimates(state.admin?.subItems, 'Admin', 'admin', '📋');

  // Yearly allocation gaps — ONE per category line (no per-trip / per-month breakdown)
  const owed = computeOwed();
  if (owed.tGap > 0) {
    items.push({
      type: 'gap',
      kind: 'travel',
      emoji: '✈️',
      tab: 'travel',
      label: 'Travel gap',
      amount: owed.tGap,
    });
  }
  if (owed.aGap > 0) {
    items.push({
      type: 'gap',
      kind: 'admin',
      emoji: '📋',
      tab: 'admin',
      label: 'Admin gap',
      amount: owed.aGap,
    });
  }

  return items;
}

function togglePendingDecisions() {
  const open = localStorage.getItem('pendingDecisionsOpen') === 'true';
  localStorage.setItem('pendingDecisionsOpen', !open as unknown as string);
  renderApp();
}

function pendingJump(tab: string, paymentId?: string): void {
  switchTab(tab);
  if (paymentId) {
    // Best-effort highlight on the relevant payment row after the tab renders
    setTimeout(() => {
      const el =
        (document.querySelector(`[data-payment-id="${paymentId}"]`) as HTMLElement | null) ||
        byId('pmt-' + paymentId);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.transition = 'background 0.4s ease';
        const orig = el.style.background;
        el.style.background = 'var(--ambersoft)';
        setTimeout(() => {
          el.style.background = orig;
        }, 1400);
      }
    }, 250);
  }
}

// ── M4 — Mobile month navigation: chevrons + swipe ─────────────────────
async function navMonth(delta: number): Promise<void> {
  const idx = state.months.findIndex((m) => m.id === state.currentMonthId);
  if (idx === -1) return;
  const next = idx + delta;
  if (next < 0 || next >= state.months.length) return;
  await switchMonth(state.months[next].id);
}

// Swipe on the main content area to advance/go-back month (mobile only).
let _swipeStartX: number | null = null;
let _swipeStartY: number | null = null;
let _swipeStartT = 0;
document.addEventListener(
  'touchstart',
  (e) => {
    if (window.innerWidth > 600) return;
    // Year view shows the whole year and drives its own month chip selector
    // (setYearViewMonth); the global month-swipe would jump months out from
    // under a vertical scroll, so it's disabled here.
    if (state.activeTab === 'year') return;
    if (
      (e.target as HTMLElement).closest('.app-panel') ||
      (e.target as HTMLElement).closest('input,textarea,select,button')
    )
      return;
    if (e.touches.length !== 1) return;
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swipeStartT = Date.now();
  },
  { passive: true },
);
document.addEventListener(
  'touchend',
  (e) => {
    if (_swipeStartX == null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _swipeStartX;
    const dy = t.clientY - _swipeStartY!;
    const dt = Date.now() - _swipeStartT;
    _swipeStartX = null;
    _swipeStartY = null;
    // Horizontal swipe: > 60px X, < 50px |Y|, < 600ms duration, AND clearly
    // horizontal (X travel dominates Y) so a vertical scroll with a little
    // sideways drift never registers as a month change.
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 600) {
      // Right swipe -> prev month, Left swipe -> next month
      navMonth(dx > 0 ? -1 : 1);
    }
  },
  { passive: true },
);

// ── Toolbar overflow on mobile (collapse 6 icons into ⋯ menu) ─────────
function openToolbarOverflow(ev?: MouseEvent): void {
  if (ev) ev.stopPropagation();
  let menu: HTMLElement = byId('toolbar-overflow-menu');
  if (menu) {
    menu.remove();
    return;
  }
  menu = document.createElement('div');
  menu.id = 'toolbar-overflow-menu';
  menu.className = 'toolbar-overflow-menu';
  const undoDisabled = undoStack.length === 0 ? 'disabled' : '';
  const redoDisabled = redoStack.length === 0 ? 'disabled' : '';
  const close = "byId('toolbar-overflow-menu')?.remove();";
  menu.innerHTML = `
    <button class="toolbar-overflow-item" ${undoDisabled} onclick="doUndo();${close}">${ICON_UNDO}<span>Undo</span></button>
    <button class="toolbar-overflow-item" ${redoDisabled} onclick="doRedo();${close}">${ICON_REDO}<span>Redo</span></button>
    <button class="toolbar-overflow-item" onclick="openSnapshot();${close}">${ICON_SNAPSHOT}<span>Snapshot</span></button>
    <button class="toolbar-overflow-item" onclick="collapseAll();${close}">${ICON_COLLAPSE}<span>Collapse all</span></button>
    <button class="toolbar-overflow-item" onclick="openHistoryPanel();${close}">${ICON_HISTORY}<span>History log</span></button>
    <button class="toolbar-overflow-item" onclick="openSearchPanel();${close}">${ICON_SEARCH}<span>Search</span></button>
    <button class="toolbar-overflow-item" onclick="authSignOut();${close}">${ICON_LOGOUT}<span>Log out</span></button>
  `;
  document.body.appendChild(menu);
  // Position near the overflow button
  const btn = ev?.currentTarget || document.querySelector('.toolbar-overflow-btn');
  if (btn) {
    const r = (btn as HTMLElement).getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = r.bottom + 6 + 'px';
    menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
  }
  // Click-outside to close
  setTimeout(() => {
    const handler = (e: MouseEvent): void => {
      if (!menu.contains(e.target as Node | null)) {
        menu.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 0);
}

// After every render, center the active month chip WITHIN the .month-tabs
// horizontal scroll container — without scrolling the whole page (which
// element.scrollIntoView() would do).
function scrollActiveMonthIntoView() {
  const c = document.querySelector('.hdr-months .month-tabs') as HTMLElement | null;
  const a = c && (c.querySelector('.mtab.active') as HTMLElement | null);
  if (c && a) c.scrollLeft = a.offsetLeft - c.clientWidth / 2 + a.clientWidth / 2;
}

// ── M3 — Mobile bottom tab bar ─────────────────────────────────────────
// 5 visible tabs (Budget / Travel / Charity / Admin / More). "More" opens a
// sheet with Year / Cash / Biz. Desktop top pill row stays unchanged.
const MOBILE_TABS_VISIBLE = [
  { key: 'budget', label: 'Budget', icon: '🏠' },
  { key: 'travel', label: 'Travel', icon: '✈️' },
  { key: 'charity', label: 'Charity', icon: '💚' },
  { key: 'admin', label: 'Admin', icon: '📋' },
];
const MOBILE_TABS_MORE = [
  { key: 'year', label: 'Year', icon: '📊' },
  { key: 'cash', label: 'Cash', icon: '💰' },
  { key: 'biz', label: 'Biz', icon: '💼' },
];

function renderMobileTabBar() {
  let bar: HTMLElement = byId('mobile-tabbar');
  if (!bar) {
    bar = document.createElement('nav');
    bar.id = 'mobile-tabbar';
    bar.className = 'mobile-tabbar';
    document.body.appendChild(bar);
  }
  const moreActive = MOBILE_TABS_MORE.some((t) => t.key === state.activeTab);
  bar.innerHTML =
    MOBILE_TABS_VISIBLE.map(
      (t) =>
        `<button class="mobile-tabbar-btn ${state.activeTab === t.key ? 'active' : ''}" onclick="switchTab('${t.key}')" aria-label="${t.label}">
          <span class="mobile-tabbar-icon">${t.icon}</span>
          <span class="mobile-tabbar-label">${t.label}</span>
        </button>`,
    ).join('') +
    `<button class="mobile-tabbar-btn ${moreActive ? 'active' : ''}" onclick="openMoreSheet()" aria-label="More tabs">
       <span class="mobile-tabbar-icon">⋯</span>
       <span class="mobile-tabbar-label">More</span>
     </button>`;
}

function openMoreSheet() {
  closeAllPanels();
  let panel: HTMLElement = byId('more-sheet');
  if (panel) panel.remove();
  panel = document.createElement('div');
  panel.id = 'more-sheet';
  panel.className = 'app-panel app-panel-quickadd';
  ensureBackdrop();
  panel.innerHTML = `
    <div class="app-panel-drag-handle" aria-hidden="true"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem 1rem .55rem;border-bottom:1px solid var(--border);flex-shrink:0;">
      <span style="font-weight:700;font-size:.95rem;">More</span>
      <button onclick="closeAllPanels()" aria-label="Close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted);padding:.25rem .5rem;">✕</button>
    </div>
    <div style="padding:.85rem 1rem 1.1rem;display:flex;flex-direction:column;gap:.4rem;">
      ${MOBILE_TABS_MORE.map(
        (t) => `
        <button class="more-tab-btn ${state.activeTab === t.key ? 'active' : ''}" onclick="switchTab('${t.key}');closeAllPanels();">
          <span style="font-size:1.2rem;">${t.icon}</span>
          <span style="font-size:1rem;font-weight:600;">${t.label}</span>
        </button>
      `,
      ).join('')}
    </div>
  `;
  document.body.appendChild(panel);
  panel.style.display = 'flex';
  showBackdrop();
  requestAnimationFrame(() => panel.classList.add('app-panel-open'));
}

// ── B4 — Offline write queue UI bridge ─────────────────────────────────
// Service worker (sw.js) postMessages {type:'queue-update', count} to us
// whenever a write is enqueued or drained. We update a small toolbar
// indicator. Manual sync trigger: clicking the indicator asks the SW to
// drain immediately.
function updateOfflineQueueUI(count: number): void {
  const el = byId('offline-queue-indicator');
  const num = byId('offline-queue-count');
  if (!el || !num) return;
  if (count > 0) {
    num.textContent = String(count);
    el.style.display = '';
    el.title = `${count} pending ${count === 1 ? 'write' : 'writes'} — click to retry sync`;
  } else {
    el.style.display = 'none';
  }
}

// Called by sw.js bridge in index.html (window.onQueueUpdate)
window.onQueueUpdate = function (data) {
  updateOfflineQueueUI(Number(data && data.count) || 0);
};

function syncQueueNow() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    toast('Sync not available — service worker not ready');
    return;
  }
  navigator.serviceWorker.controller.postMessage({ type: 'drain-now' });
  toast('Syncing queued writes…');
}

// Ping the SW for the current queue count on load (e.g. after page reload
// while writes are still queued from a prior offline session).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready
    .then((): void => {
      // Some browsers don't have controller until next load — guard.
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'queue-count' });
      }
    })
    .catch(() => {});
  // When connectivity returns, ask the SW to drain.
  window.addEventListener('online', () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'drain-now' });
    }
  });
}

// Refresh data when the app is brought back to the foreground (e.g. reopening
// the installed PWA on a phone after editing on the desktop). A backgrounded
// PWA otherwise keeps showing whatever it had when last active — the source of
// "my phone doesn't show what the computer shows." Guarded so it never
// interrupts typing and never refetches in a tight loop. Benefits every tab.
let _lastVisibilityRefresh = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  // Only once the app is past the login gate / initial load.
  if (!state.currentMonthId || state.loading) return;
  if (navigator.onLine === false) return;
  const now = Date.now();
  if (now - _lastVisibilityRefresh < 4000) return; // debounce rapid tab toggles
  _lastVisibilityRefresh = now;
  loadFresh()
    .then(() => {
      // Don't re-render over a focused field (avoid interrupting typing) —
      // same guard bootstrap() uses after its background refresh.
      if (
        !document.activeElement ||
        document.activeElement.tagName === 'BODY' ||
        document.activeElement === document.documentElement
      ) {
        renderApp();
      }
    })
    .catch(() => {});
});

// ─────────────────────────────────────────────────────────────────────
// Inline on* handlers in the rendered HTML resolve names against the global
// scope. As a classic script every top-level function was implicitly global;
// as an ES module they are module-scoped, so re-expose them on window to keep
// the 215 inline handlers working byte-for-byte. (fmt is a top-level const.)
// ─────────────────────────────────────────────────────────────────────
Object.assign(window as unknown as Record<string, unknown>, {
  _installInputModeObserver,
  addAdminItem,
  addAdminSub,
  addBudgetItem,
  addCashAccount,
  addCharityItem,
  addCharityPayment,
  addCharitySub,
  addIncomeItem,
  addTashlum,
  addTransaction,
  addTransactionSidebar,
  addTravelItem,
  addTravelPayment,
  addTravelSub,
  ag,
  anyPanelOpen,
  applyNumericInputModes,
  applyRibbonHeight,
  applyScrollFadeListeners,
  authSignOut,
  bootstrap,
  budgetItemsTotal,
  buildWeeklyDigest,
  cacheKey,
  cashILS,
  catBudget,
  categoryYearlyGap,
  closeAllPanels,
  closeModal,
  closeOtherPanel,
  collapseAll,
  computeOwed,
  computePending,
  createMonth,
  currentMonthNum,
  deleteAdminItem,
  deleteAdminSub,
  deleteBudgetItem,
  deleteCashAccount,
  deleteCharityItem,
  deleteCharityPayment,
  deleteCharitySub,
  deleteIncomeItem,
  deleteTransaction,
  deleteTravelItem,
  deleteTravelPayment,
  deleteTravelSub,
  doRedo,
  doUndo,
  editHousingCell,
  editRecurringCell,
  ensureBackdrop,
  esc,
  fabSpec,
  fmt,
  gapMarker,
  getIncomeEst,
  handleForgotPassword,
  handleLoginSubmit,
  hideBackdrop,
  init,
  isAnyEstimated,
  isBigStore,
  jumpTo,
  jumpToHistoryEntry,
  jumpToTransaction,
  loadAdminData,
  loadAllHousingItems,
  loadAllRecurringItems,
  loadAvailableYears,
  loadBizData,
  loadBudgetItems,
  loadBudgets,
  loadCashData,
  loadCharityData,
  loadFresh,
  loadIncomeItems,
  loadMonths,
  loadTransactions,
  loadTravelData,
  loadYearData,
  logChange,
  navMonth,
  onYearSelect,
  openHistoryPanel,
  openMoreSheet,
  openQuickAddSheet,
  openSearchPanel,
  openSnapshot,
  openToolbarOverflow,
  pendingJump,
  pushUndo,
  quickAddFor,
  quickAddSheetBody,
  refreshBiz,
  refreshHistoryIfOpen,
  renderAccountantTracker,
  renderAdminTab,
  renderApp,
  renderBizTab,
  renderCashTab,
  renderCharityTab,
  renderFab,
  renderHousingGrid,
  renderLogin,
  renderMobileTabBar,
  renderRecurringGrid,
  renderSpendingGrid,
  renderTravelTab,
  renderYearSnapshot,
  restoreCache,
  runSearch,
  saveAdminAllocation,
  saveAdminItem,
  saveBizField,
  saveBudget,
  saveBudgetItem,
  saveCache,
  saveCashField,
  saveCharityAllocation,
  saveCharityItem,
  saveHousingFromMonth,
  saveIncome,
  saveIncomeField,
  saveIncomeItemAmount,
  saveIncomeItemLabel,
  saveInlineAdd,
  saveRecurringFromMonth,
  saveSavingsField,
  saveTravelAllocation,
  saveTravelItem,
  scrollActiveMonthIntoView,
  searchJumpToTx,
  seedBudgetItemsFromTemplate,
  seedYear,
  setIncomeEst,
  setItemAsDefault,
  setTxSort,
  setYearFilter,
  setYearMobileFull,
  setYearViewMonth,
  setupBizMonth,
  showAddMonth,
  showBackdrop,
  showEditIncome,
  showLoginError,
  snToggle,
  spentByCategory,
  startRibbonDrag,
  state,
  submitQuickAdd,
  switchMonth,
  switchTab,
  switchYear,
  syncPtOwedToCash,
  syncQueueNow,
  toast,
  toastDeleted,
  today,
  todayMonthForYear,
  toggleCat,
  toggleGroup,
  toggleHousingGrid,
  toggleIncomeEst,
  toggleOwedStrip,
  togglePendingDecisions,
  toggleRecurringGrid,
  toggleRibbon,
  toggleRibbonExpand,
  toggleSpendingGrid,
  totalIncome,
  updateAdminSub,
  updateCharityPayment,
  updateCharitySub,
  updateOfflineQueueUI,
  updateSbStores,
  updateStoreSuggestions,
  updateTravelPayment,
  updateTravelSub,
  updateTx,
  updateUndoButtons,
  yrCollapseAll,
  yrExpandAll,
  yrToggle,
});
