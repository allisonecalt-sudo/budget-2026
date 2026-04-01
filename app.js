/* eslint-disable no-unused-vars -- functions called from inline HTML onclick handlers */
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
  {
    key: 'household',
    label: 'Household Items',
    emoji: '🧹',
    hasStore: true,
    linkedLine: { parent: 'housing', label: 'Household' },
  },
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
function isBigStore(store) {
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
const pt = window.supabase.createClient(PT_URL, PT_KEY);

const undoStack = [],
  redoStack = [];

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
function logChange(action, entityType, entityId, description, oldValue, newValue, monthId) {
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
    .catch((e) => console.warn('change_log insert error:', e));
}
function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > 30) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}
function updateUndoButtons() {
  const u = document.getElementById('undo-btn'),
    r = document.getElementById('redo-btn');
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

let state = {
  months: [],
  currentMonthId: null,
  transactions: [],
  budgets: {},
  loading: true,
  activeTab: localStorage.getItem('activeTab') || 'budget',
  biz: null, // biz_months row for current month
  ptClients: [], // private tracker clients
  ptSessions: [], // private tracker sessions
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
};

// ── Cache (stale-while-revalidate for fast startup) ──────────────────
const CACHE_KEY = 'budget_v1_cache';
const CACHE_TTL = 20 * 60 * 1000; // 20 minutes

function saveCache() {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
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
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const c = JSON.parse(raw);
    if (Date.now() - c.ts > CACHE_TTL) return false;
    const savedId = localStorage.getItem('activeMonthId');
    if (savedId && c.monthId !== savedId) return false;
    state.months = c.months || [];
    state.currentMonthId = c.monthId;
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
const fmt = (n) =>
  '₪' +
  Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (spent, budget) => (budget > 0 ? Math.min((spent / budget) * 100, 100) : 0);
const status = (spent, budget) => {
  if (budget === 0) return 'ok';
  const rem = Math.round(budget - spent);
  if (rem < 0) return 'over';
  if (rem === 0) return 'ok';
  const p = spent / budget;
  if (p >= 0.85) return 'warn';
  return 'ok';
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function today() {
  return new Date().toISOString().split('T')[0];
}

// ── Data loading ──────────────────────────────────────────────────────
async function loadMonths() {
  const { data } = await sb.from('months').select('*').eq('year', 2026).order('month_num');
  state.months = data || [];
}

async function loadTransactions(monthId) {
  const { data } = await sb
    .from('transactions')
    .select('*')
    .eq('month_id', monthId)
    .order('created_at', { ascending: false });
  state.transactions = data || [];
}

async function loadBudgets(monthId) {
  const { data } = await sb.from('budgets').select('*').eq('month_id', monthId);
  state.budgets = {};
  (data || []).forEach((b) => (state.budgets[b.category] = b.amount));
}

async function loadBudgetItems(monthId) {
  const { data } = await sb
    .from('budget_items')
    .select('*')
    .eq('month_id', monthId)
    .order('sort_order');
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
  localStorage.setItem('recurringGridMode', state.recurringGridMode);
  if (state.recurringGridMode && Object.keys(state.allRecurringItems).length === 0) {
    await loadAllRecurringItems();
  }
  renderApp();
}

async function saveRecurringFromMonth(label, fromMonthNum, newAmount, forward) {
  const num = parseFloat(newAmount) || 0;
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
      await sb.from('budget_items').update({ amount: num }).eq('id', item.id);
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
  const today = new Date().getMonth() + 1; // current month num

  // Get all unique items with their subcategory (from any month that has them)
  const itemMap = {}; // label -> subcategory
  Object.values(state.allRecurringItems).forEach((items) => {
    items.forEach((i) => {
      if (!itemMap[i.label]) itemMap[i.label] = i.subcategory || '';
    });
  });

  // Group items by subcategory
  const groups = {};
  const noSubcat = [];
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
      .join('');

  const renderRow = (label) => {
    const cells = existingMonths
      .map((m) => {
        const items = state.allRecurringItems[m.id] || [];
        const item = items.find((i) => i.label === label);
        const val = item ? Number(item.amount) : null;
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
    return (
      '<tr><td style="padding:.25rem .5rem;font-size:.75rem;position:sticky;left:0;background:var(--surface);z-index:1;">' +
      label +
      '</td>' +
      cells +
      '</tr>'
    );
  };

  // Sort tashlumim by base name then installment number
  const installSort = (labels) =>
    labels.slice().sort((a, b) => {
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
        (existingMonths.length + 1) +
        '" style="padding:.3rem .5rem .1rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);background:var(--surface2);">' +
        SUBCAT_LABELS[sc] +
        '</td></tr>';
      rows += labels.map(renderRow).join('');
    }
  });
  if (noSubcat.length > 0) rows += noSubcat.map(renderRow).join('');

  // Totals row
  const totalCells = existingMonths
    .map((m) => {
      const items = state.allRecurringItems[m.id] || [];
      const total = items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
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
  rows +=
    '<tr style="border-top:2px solid var(--border);"><td style="padding:.3rem .5rem;font-size:.72rem;font-weight:700;position:sticky;left:0;background:var(--surface);z-index:1;color:var(--muted);">TOTAL</td>' +
    totalCells +
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

function editRecurringCell(label, monthNum, currentVal) {
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
  const raw = prompt(MNAMES[monthNum - 1] + ' — ' + label + '\nAmount:', currentVal || '');
  if (raw === null || raw.trim() === '') return;
  const amount = raw.trim();
  const isFuture = monthNum >= new Date().getMonth() + 1;
  const forward =
    isFuture &&
    confirm('Apply ' + amount + ' to ' + MNAMES[monthNum - 1] + ' and all future months?');
  saveRecurringFromMonth(label, monthNum, amount, forward);
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
  localStorage.setItem('housingGridMode', state.housingGridMode);
  if (state.housingGridMode && Object.keys(state.allHousingItems).length === 0) {
    await loadAllHousingItems();
  }
  renderApp();
}

async function saveHousingFromMonth(label, fromMonthNum, newAmount, forward) {
  const num = parseFloat(newAmount) || 0;
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
      await sb.from('budget_items').update({ amount: num }).eq('id', item.id);
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

function editHousingCell(label, monthNum, currentVal) {
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
  const raw = prompt(MNAMES[monthNum - 1] + ' — ' + label + '\nAmount:', currentVal || '');
  if (raw === null || raw.trim() === '') return;
  const amount = raw.trim();
  const isFuture = monthNum >= new Date().getMonth() + 1;
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
  const today = new Date().getMonth() + 1;

  const itemMap = {};
  Object.values(state.allHousingItems).forEach((items) => {
    items.forEach((i) => {
      if (!itemMap[i.label]) itemMap[i.label] = i.subcategory || '';
    });
  });

  const groups = {};
  const noSubcat = [];
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

  const renderRow = (label) => {
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
      label +
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
        SUBCAT_LABELS[sc] +
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

async function toggleSpendingGrid(catKey) {
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
      state.allCatTxData[catKey] = txRes.data || [];
      state.allCatBudgets[catKey] = {};
      (budgetRes.data || []).forEach((b) => {
        state.allCatBudgets[catKey][b.month_id] = b.amount;
      });
    }
  }
  localStorage.setItem('spendingGridCats', JSON.stringify(state.spendingGridCats));
  renderApp();
}

function renderSpendingGrid(catKey) {
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
  const today = new Date().getMonth() + 1;
  const existingMonths = state.months.slice().sort((a, b) => a.month_num - b.month_num);
  const txs = state.allCatTxData[catKey] || [];

  // Transport / Health: Budget vs Spent per month
  if (catKey === 'health') {
    const spentByMonth = {};
    txs.forEach((tx) => {
      spentByMonth[tx.month_id] = (spentByMonth[tx.month_id] || 0) + (Number(tx.amount) || 0);
    });
    const fmtV = (v) =>
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
          const v = (state.allCatBudgets['health'] || {})[m.id] || 0;
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
    const spentByMonth = {};
    txs.forEach((tx) => {
      spentByMonth[tx.month_id] = (spentByMonth[tx.month_id] || 0) + (Number(tx.amount) || 0);
    });
    const fmtV = (v) =>
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
            (state.allCatBudgets['transport'] || {})[m.id] || state.budgets['transport'] || 0;
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
  const storeMonthTotals = {};
  txs.forEach((tx) => {
    const store = isBigStore(tx.store) ? 'Supermarket' : 'Makolet';
    if (!storeMonthTotals[store]) storeMonthTotals[store] = {};
    storeMonthTotals[store][tx.month_id] =
      (storeMonthTotals[store][tx.month_id] || 0) + (Number(tx.amount) || 0);
  });

  const monthTotals = {};
  existingMonths.forEach((m) => {
    monthTotals[m.id] = Object.values(storeMonthTotals).reduce((sum, s) => sum + (s[m.id] || 0), 0);
  });

  const stores = ['Supermarket', 'Makolet'].filter((s) => storeMonthTotals[s]);
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

  const renderRow = (store) => {
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

  const fmtV2 = (v) =>
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

function budgetItemsTotal(catKey) {
  const items = state.budgetItems[catKey];
  if (!items || items.length === 0) return null; // null = use manual budget
  return items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
}

function catBudget(catKey) {
  // For linked categories (e.g. Household → Housing line item), use the parent line item amount
  const catDef = CATEGORIES.find((c) => c.key === catKey);
  if (catDef && catDef.linkedLine) {
    const parentItems = state.budgetItems[catDef.linkedLine.parent] || [];
    const linked = parentItems.find(
      (i) => i.label.toLowerCase() === catDef.linkedLine.label.toLowerCase(),
    );
    if (linked) return Number(linked.amount) || 0;
  }
  const fromItems = budgetItemsTotal(catKey);
  return fromItems !== null ? fromItems : state.budgets[catKey] || 0;
}

async function addTashlum() {
  const name = prompt('שם התשלום (e.g. Mattress):');
  if (!name?.trim()) return;
  const amount = parseFloat(prompt('סכום לחודש (₪):'));
  if (!amount) return;
  const total = parseInt(prompt('כמה תשלומים?'));
  if (!total || total < 1) return;
  const startMonth = parseInt(prompt('חודש התחלה (1=Jan, 3=Mar, ...):'));
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

async function addBudgetItem(catKey) {
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
  logChange('add', 'budget_item', data.id, `Added budget item: ${label} • ${catKey}`, null, data);
  // Also add to allRecurringItems / allHousingItems so grid propagation works immediately
  if (catKey === 'recurring') {
    if (!state.allRecurringItems[state.currentMonthId])
      state.allRecurringItems[state.currentMonthId] = [];
    state.allRecurringItems[state.currentMonthId].push(data);
  } else if (catKey === 'housing') {
    if (!state.allHousingItems[state.currentMonthId])
      state.allHousingItems[state.currentMonthId] = [];
    state.allHousingItems[state.currentMonthId].push(data);
  }
  // Also save to template
  await sb
    .from('budget_item_templates')
    .insert({ category: catKey, label: 'New item', amount: 0, sort_order: sortOrder });
  renderApp();
}

async function saveBudgetItem(id, field, value) {
  const catKey = Object.keys(state.budgetItems).find((k) =>
    state.budgetItems[k].find((i) => i.id === id),
  );
  const item = (state.budgetItems[catKey] || []).find((i) => i.id === id);
  if (!item) return;
  const numericFields = ['amount'];
  const val = numericFields.includes(field) ? parseFloat(value) || 0 : value;
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
          if (i.label === item.label) i.subcategory = val;
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

async function deleteBudgetItem(id) {
  const catKey = Object.keys(state.budgetItems).find((k) =>
    state.budgetItems[k].find((i) => i.id === id),
  );
  const item = (state.budgetItems[catKey] || []).find((i) => i.id === id);
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

async function setItemAsDefault(id) {
  const catKey = Object.keys(state.budgetItems).find((k) =>
    state.budgetItems[k].find((i) => i.id === id),
  );
  const item = (state.budgetItems[catKey] || []).find((i) => i.id === id);
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
async function seedBudgetItemsFromTemplate(monthId) {
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

async function switchMonth(monthId) {
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
  Promise.all([loadAdminData(), loadTravelData(), loadCharityData()]).then(() => renderApp());
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
function spentByCategory() {
  const totals = {};
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
    totals['admin'] += (state.admin.payments || [])
      .filter((p) => p.month_num === mn)
      .reduce((s, p) => s + Number(p.amount), 0);
    totals['charity'] += (state.charity.payments || [])
      .filter((p) => p.month_num === mn)
      .reduce((s, p) => s + Number(p.amount), 0);
  }
  return totals;
}

async function loadIncomeItems(monthId) {
  const { data } = await sb
    .from('income_items')
    .select('*')
    .eq('month_id', monthId)
    .order('created_at');
  state.incomeItems = data || [];
}

// Est/Act state stored in localStorage per month
function getIncomeEst(monthId) {
  try {
    return JSON.parse(localStorage.getItem('incomeEst_' + monthId)) || {};
  } catch {
    return {};
  }
}
function setIncomeEst(monthId, obj) {
  localStorage.setItem('incomeEst_' + monthId, JSON.stringify(obj));
}
function toggleIncomeEst(source, itemId) {
  const mid = state.currentMonthId;
  const est = getIncomeEst(mid);
  const key = itemId || source;
  est[key] = !est[key];
  setIncomeEst(mid, est);
  renderApp();
}
function isAnyEstimated(monthId) {
  const est = getIncomeEst(monthId);
  return Object.values(est).some(Boolean);
}

function totalIncome(month) {
  const extras = state.incomeItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  return (
    (Number(month.income_petachya) || 0) +
    (Number(month.income_clalit) || 0) +
    (Number(month.income_private) || 0) +
    extras
  );
}

// ── Add transaction ───────────────────────────────────────────────────
async function addTransaction() {
  const cat = document.getElementById('tx-cat').value;
  const store = document.getElementById('tx-store').value.trim();
  const item = document.getElementById('tx-item').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const date = document.getElementById('tx-date').value;

  if (!cat || !amount || isNaN(amount)) {
    toast('Fill in category and amount');
    return;
  }

  const btn = document.getElementById('tx-btn');
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
    state.currentMonthId,
  );
  pushUndo({
    label: 'add transaction',
    undo: async () => {
      await sb.from('transactions').delete().eq('id', txData.id);
      await loadTransactions(state.currentMonthId);
    },
    redo: async () => {
      await sb.from('transactions').insert(txData);
      await loadTransactions(state.currentMonthId);
    },
  });

  // Clear form
  document.getElementById('tx-store').value = '';
  document.getElementById('tx-item').value = '';
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-date').value = today();
  btn.disabled = false;

  await loadTransactions(state.currentMonthId);
  renderApp();
  toast('Transaction saved ✓');
}

async function addTransactionSidebar() {
  const cat = document.getElementById('sb-cat').value;
  const store = document.getElementById('sb-store').value.trim();
  const item = document.getElementById('sb-item').value.trim();
  const amount = parseFloat(document.getElementById('sb-amount').value);
  const date = document.getElementById('sb-date').value;

  if (!cat || !amount || isNaN(amount)) {
    toast('Fill in category and amount');
    return;
  }

  const btn = document.getElementById('sb-btn');
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
    state.currentMonthId,
  );
  pushUndo({
    label: 'add transaction',
    undo: async () => {
      await sb.from('transactions').delete().eq('id', txData.id);
      await loadTransactions(state.currentMonthId);
    },
    redo: async () => {
      await sb.from('transactions').insert(txData);
      await loadTransactions(state.currentMonthId);
    },
  });

  document.getElementById('sb-store').value = '';
  document.getElementById('sb-item').value = '';
  document.getElementById('sb-amount').value = '';
  document.getElementById('sb-date').value = '';
  btn.disabled = false;
  btn.textContent = 'Save →';

  await loadTransactions(state.currentMonthId);
  renderApp();
  toast('Transaction saved ✓');
}

async function deleteTransaction(id) {
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
      await loadTransactions(state.currentMonthId);
    },
    redo: async () => {
      await sb.from('transactions').delete().eq('id', snap.id);
      await loadTransactions(state.currentMonthId);
    },
  });
  renderApp();
  toast('Deleted ✓');
}

async function updateTx(id, field, value) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;
  const oldVal = tx[field];
  const val = field === 'amount' ? parseFloat(value) || 0 : value.trim() || null;
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

function setTxSort(sort) {
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
async function createMonth(num) {
  const { data, error } = await sb
    .from('months')
    .insert({
      month_name: MONTHS[num - 1],
      month_num: num,
      year: 2026,
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
  const root = document.getElementById('root');
  requestAnimationFrame(applyRibbonHeight);
  requestAnimationFrame(updateUndoButtons);

  if (state.months.length === 0) {
    root.innerHTML = `
      <div class="main">
        <div class="setup">
          <h2>Welcome to Budget 2026 👋</h2>
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

  const income = totalIncome(current);
  // Sync charity % from localStorage into state.budgets so snapshot sees it immediately
  const _chPct = parseFloat(localStorage.getItem('charityPct_' + state.currentMonthId));
  if (_chPct && income) state.budgets['charity'] = Math.round((income * _chPct) / 100);
  const spent = spentByCategory();
  // For hasTab categories, use allocation (budget) not actual payments in top-line totals
  // Skip linkedLine categories (household) — already counted inside their parent (housing)
  const totalSpent =
    CATEGORIES.filter((c) => !c.linkedLine).reduce(
      (sum, c) => sum + (c.hasTab ? catBudget(c.key) || 0 : spent[c.key] || 0),
      0,
    ) +
    (state.budgets['savings_bank'] || 0) +
    (state.budgets['savings_invested'] || 0);
  const remaining = income - totalSpent;
  const totalBudgeted =
    CATEGORIES.filter((c) => !c.linkedLine).reduce((sum, c) => sum + catBudget(c.key), 0) +
    (state.budgets['savings_bank'] || 0) +
    (state.budgets['savings_invested'] || 0);

  root.innerHTML = `
    <div class="hdr">
      <h1>Budget 2026</h1>
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
        <button id="undo-btn" class="mtab" onclick="doUndo()" disabled title="Undo (Ctrl+Z)">↩</button>
        <button id="redo-btn" class="mtab" onclick="doRedo()" disabled title="Redo (Ctrl+Y)">↪</button>
        <button class="mtab" onclick="openSnapshot()" title="Snapshot">📊</button>
        <button class="mtab" onclick="collapseAll()" title="Collapse all">⊟</button>
        <button class="mtab" onclick="openHistoryPanel()" title="History log">🕐</button>
      </div>
      <div class="hdr-months">
        <div class="month-tabs">
          ${state.months
            .map(
              (m) => `
            <button class="mtab ${m.id === state.currentMonthId ? 'active' : ''}" onclick="switchMonth('${m.id}')">
              ${m.month_name.slice(0, 3)}
            </button>`,
            )
            .join('')}
        </div>
      </div>
    </div>

    ${(() => {
      if (state.activeTab !== 'budget' || state.loading) return '';
      const ribbonHidden = localStorage.getItem('ribbonHidden') === 'true';
      const ribbonExpanded = localStorage.getItem('ribbonExpanded') === 'true';
      const leftToBudget = income - totalBudgeted;
      const remainingInBudget = totalBudgeted - totalSpent;
      const n = (v) =>
        v == null || v === ''
          ? ''
          : Number(v).toLocaleString('en-IL', {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            });

      if (ribbonHidden)
        return `<div style="position:sticky;top:57px;z-index:90;text-align:right;padding:.25rem 1.5rem;background:var(--surface);border-bottom:1px solid var(--border);"><button class="ribbon-toggle" onclick="toggleRibbon()">▼ show summary</button></div>`;

      // Snapshot table rows for expanded view
      const groupRows = CATEGORY_GROUPS.map((group) => {
        const cats = group.keys.map((k) => CATEGORIES.find((c) => c.key === k)).filter(Boolean);
        const gs = cats.reduce((sum, c) => sum + (spent[c.key] || 0), 0);
        const gb = cats.reduce((sum, c) => sum + catBudget(c.key), 0);
        const gr = gb - gs;
        const gid = 'rsngrp-' + group.label.replace(/[^a-zA-Z0-9]/g, '-');
        const catRows = cats
          .map((c) => {
            const b = catBudget(c.key) || 0;
            const s = c.hasTab ? b : spent[c.key] || 0;
            const r = b - s;
            return `<tr class="sn-cat ${gid} collapsed"><td style="padding-left:1.5rem">${c.emoji} ${c.label}</td><td>${b ? n(b) : ''}</td><td>${b ? n(s) : ''}</td><td class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td></tr>`;
          })
          .join('');
        if (cats.length === 1) {
          const c = cats[0];
          const b = catBudget(c.key) || 0;
          const s = c.hasTab ? b : spent[c.key] || 0;
          const r = b - s;
          return `<tr class="sn-cat"><td>${c.emoji} ${c.label}</td><td>${b ? n(b) : ''}</td><td>${b ? n(s) : ''}</td><td class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td></tr>`;
        }
        return `<tr class="sn-group" id="${gid}-hdr" onclick="snToggle('${gid}')">
          <td><span class="sn-chev" style="font-size:.65rem;margin-right:.4rem;color:var(--muted)">▶</span>${group.emoji} ${group.label}</td><td>${gb ? n(gb) : ''}</td><td>${n(gs)}</td><td class="${gr < 0 ? 'sn-over' : gr > 0 ? 'sn-ok' : ''}">${gb ? n(gr) : ''}</td></tr>${catRows}`;
      }).join('');

      // Leisure sub-ribbon
      const leisureGroup = CATEGORY_GROUPS.find((g) => g.label === 'Leisure & Lifestyle');
      const leisureCats = leisureGroup.keys
        .map((k) => CATEGORIES.find((c) => c.key === k))
        .filter(Boolean);
      const isMobile = window.innerWidth <= 600;
      const leisureKey = isMobile ? 'leisureExpandedMobile' : 'leisureExpanded';
      const leisureStored = localStorage.getItem(leisureKey);
      const leisureExpanded = leisureStored !== null ? leisureStored !== 'false' : !isMobile;
      const leisureSpent = leisureCats.reduce((sum, c) => sum + (spent[c.key] || 0), 0);
      const leisureBudget = leisureCats.reduce((sum, c) => sum + (state.budgets[c.key] || 0), 0);
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
          <div class="ribbon-stat"><div class="ribbon-label">Income${isAnyEstimated(state.currentMonthId) ? ' <span style="color:#b45309;font-size:.55rem;">~EST</span>' : ''}</div><div class="ribbon-val" style="${isAnyEstimated(state.currentMonthId) ? 'color:#d97706;' : ''}">${isAnyEstimated(state.currentMonthId) ? '~' : ''}${fmt(income)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Budgeted</div><div class="ribbon-val">${fmt(totalBudgeted)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Left to Budget</div><div class="ribbon-val" style="color:${leftToBudget >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(leftToBudget)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Spent</div><div class="ribbon-val">${fmt(totalSpent)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Remaining</div><div class="ribbon-val" style="color:${income - totalSpent >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(income - totalSpent)}</div></div>
          <div class="ribbon-stat"><div class="ribbon-label">Remaining in Budget</div><div class="ribbon-val" style="color:${remainingInBudget >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(remainingInBudget)}</div></div>
          <div class="ribbon-stat ribbon-hide-mobile" style="border-left:2px solid var(--accent);padding-left:.75rem;margin-left:.25rem;"><div class="ribbon-label" style="color:var(--accent);">🏦 Saved</div><div class="ribbon-val" style="color:var(--accent);">${fmt((state.budgets['savings_bank'] || 0) + (state.budgets['savings_invested'] || 0))}</div></div>
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
                      ? renderBizTab(current)
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
            <input type="text" id="sb-store" placeholder="Store" list="sb-store-list" style="width:100%;font-size:.74rem;padding:.3rem .45rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <input type="text" id="sb-item" placeholder="Item" style="width:100%;font-size:.74rem;padding:.3rem .45rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <input type="number" id="sb-amount" placeholder="Amount ₪" min="0" step="0.01" style="width:100%;font-size:.74rem;padding:.3rem .45rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <input type="date" id="sb-date" style="width:100%;font-size:.74rem;padding:.3rem .45rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'" onkeydown="if(event.key==='Enter')addTransactionSidebar()">
            <button id="sb-btn" onclick="addTransactionSidebar()" style="width:100%;padding:.4rem;background:var(--accent);color:white;border:none;border-radius:var(--r);font-family:'DM Sans',sans-serif;font-weight:600;font-size:.77rem;cursor:pointer;">Save →</button>
          </div>
        </div>
        <div class="sidenav-divider"></div>
        <div class="sidenav-item" onclick="jumpTo('group-Savings')">🏦 Savings</div>
        ${CATEGORY_GROUPS.map((g) => {
          const gkey = g.label.replace(/\s+/g, '-');
          const expanded = localStorage.getItem('sn-exp-' + gkey) !== 'false';
          const cats = g.keys.map((k) => CATEGORIES.find((c) => c.key === k)).filter(Boolean);
          if (cats.length === 1) {
            const c = cats[0];
            let gapBadge = '';
            if (c.hasTab && state[c.key]) {
              const projected = (state[c.key].items || []).reduce(
                (s, i) => s + (Number(i.projected_amount) || 0),
                0,
              );
              const allocated = Object.values(state[c.key].allocations || {}).reduce(
                (s, a) => s + (Number(a.amount) || 0),
                0,
              );
              const gap = projected - allocated;
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
          ${isAnyEstimated(state.currentMonthId) ? '<span style="font-size:.8rem;color:#c4a35a;" title="Some values are estimated">~</span>' : ''}
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
            .map((item) => {
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
          const groupSt = status(groupSpent, groupBudget);
          const savingsRow = (label, emoji, budgetKey, spentField, budgetVal, spentVal) => {
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
          const cats = group.keys.map((k) => CATEGORIES.find((c) => c.key === k)).filter(Boolean);
          const groupSpent = cats.reduce((sum, c) => sum + (spent[c.key] || 0), 0);
          const groupBudget = cats.reduce((sum, c) => sum + catBudget(c.key), 0);
          const groupSt = status(groupSpent, groupBudget);
          const singleCat = cats.length === 1;
          return `
            <div class="group-block" id="group-${group.label.replace(/\s+/g, '-')}">
              ${
                singleCat
                  ? ''
                  : `<div class="group-header" onclick="toggleGroup('${group.label.replace(/\s+/g, '-')}')">
                <span><span class="group-chevron">▼</span>${group.emoji} ${group.label}</span>
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
                        parseFloat(localStorage.getItem(charityPctKey)) ||
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
                          style="width:${b > 0 ? Math.max(60, String(Math.round(b)).length * 10 + 30) : 95}px">
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
                          hasItems || c.linkedLine
                            ? `<span class="budget-inline" style="color:var(--text);cursor:default;">${fmt(b)}</span>${c.linkedLine ? '<span style="font-size:.58rem;color:var(--muted);margin-left:.2rem;">from housing</span>' : ''}`
                            : `<input type="number" class="budget-inline" value="${state.budgets[c.key] || ''}" placeholder="set budget" min="0" step="1"
                              onclick="event.stopPropagation()"
                              onchange="saveBudget('${c.key}', this.value)"
                              onkeydown="if(event.key==='Enter'){this.blur()}"
                              style="width:${b > 0 ? Math.max(60, String(Math.round(b)).length * 10 + 30) : 90}px">
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
                          const renderBudgetItemRow = (item) => {
                            const subSel =
                              '<select onchange="saveBudgetItem(\'' +
                              item.id +
                              '\',\'subcategory\',this.value)" onclick="event.stopPropagation()" style="font-size:.65rem;padding:.1rem;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--muted);max-width:90px;">' +
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
                              '<div class="budget-item-row">' +
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
                            const hGroups = {},
                              hNoSubcat = [];
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
                                  HOUSING_SUBCATS[sc] +
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
                          const groups = {};
                          const noSubcat = [];
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
                                SUBCAT_LABELS[sc] +
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
                                    ...(PRESET_STORES[c.key] || []),
                                    ...state.allStores
                                      .filter((tx) => tx.category === c.key && tx.store)
                                      .map((tx) => tx.store),
                                    ...state.transactions
                                      .filter((tx) => tx.category === c.key && tx.store)
                                      .map((tx) => tx.store),
                                  ]),
                                ];
                                const _dlId = 'inline-stores-' + c.key;
                                return `<datalist id="${_dlId}">${_ps.map((s) => `<option value="${s.replace(/"/g, '&quot;')}">`).join('')}</datalist>
                          <div class="inline-add-form" style="display:grid;grid-template-columns:1fr 1fr 90px 110px 60px 24px;gap:.3rem;padding:.4rem .2rem;align-items:center;border-top:1px solid var(--border);">
                            <input id="inline-store-${c.key}" type="text" placeholder="Store" list="${_dlId}" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')saveInlineAdd('${c.key}')" style="font-size:.72rem;padding:.25rem .4rem;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;">
                            <input id="inline-item-${c.key}" type="text" placeholder="Item" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')saveInlineAdd('${c.key}')" style="font-size:.72rem;padding:.25rem .4rem;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;">
                            <input id="inline-amount-${c.key}" type="number" placeholder="₪" min="0" step="0.01" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')saveInlineAdd('${c.key}')" style="font-size:.72rem;padding:.25rem .4rem;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;">
                            <input id="inline-date-${c.key}" type="date" onclick="event.stopPropagation()" style="font-size:.72rem;padding:.25rem .4rem;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;">
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
                                (sum, tx) => sum + (isBigStore(tx.store) ? Number(tx.amount) : 0),
                                0,
                              );
                              const otherTotal = txs.reduce(
                                (sum, tx) => sum + (!isBigStore(tx.store) ? Number(tx.amount) : 0),
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
                            return new Date(b.created_at) - new Date(a.created_at);
                          if (sort === 'oldest')
                            return new Date(a.created_at) - new Date(b.created_at);
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
                        const fmtDate = (d) => {
                          if (!d) return '—';
                          const dt = new Date(d + 'T12:00:00');
                          return dt.getDate() + ' ' + MONS[dt.getMonth()];
                        };
                        const esc = (s) => (s || '').replace(/"/g, '&quot;').replace(/&/g, '&amp;');
                        const renderTxRow = (tx) => `
                          <div class="tx-item" data-tx-id="${tx.id}">
                            <div class="tx-date-wrap" onclick="event.stopPropagation()">
                              <span class="tx-date-display">${fmtDate(tx.date)}</span>
                              <input class="tx-edit-date" type="date" value="${tx.date || ''}" onchange="updateTx('${tx.id}','date',this.value)">
                            </div>
                            <input class="tx-edit" type="text" value="${esc(tx.store)}" placeholder="Store" style="font-size:.7rem;" onclick="event.stopPropagation()" onchange="updateTx('${tx.id}','store',this.value)">
                            <input class="tx-edit" type="text" value="${esc(tx.item)}" placeholder="Item" style="font-size:.7rem;" onclick="event.stopPropagation()" onchange="updateTx('${tx.id}','item',this.value)">
                            <input class="tx-edit tx-edit-amt" type="number" value="${tx.amount}" min="0" step="0.01" style="font-size:.88rem;font-weight:600;" onclick="event.stopPropagation()" onchange="updateTx('${tx.id}','amount',this.value)">
                            <button class="tx-del" onclick="event.stopPropagation();deleteTransaction('${tx.id}')" title="Delete">×</button>
                          </div>`;
                        const sectionHdr = (emoji, label, total) =>
                          `<div style="padding:.25rem .5rem .1rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);border-top:1px solid var(--border);margin-top:.2rem;display:flex;justify-content:space-between;"><span>${emoji} ${label}</span><span style="font-family:'DM Mono',monospace;">${fmt(total)}</span></div>`;
                        let txRows = '';
                        if (c.key === 'groceries' && sort === 'type') {
                          const big = sorted.filter((tx) => isBigStore(tx.store));
                          const local = sorted.filter((tx) => !isBigStore(tx.store));
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
      </div>
      </div></div>
      `
      }
    </div>

    <!-- Snapshot modal -->
    <div id="snapshot-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;align-items:flex-start;justify-content:center;padding:1.5rem;overflow-y:auto;backdrop-filter:blur(4px);" onclick="if(event.target===this)this.style.display='none'">
      <div style="background:var(--surface);border-radius:var(--rl);padding:1.5rem;max-width:560px;width:100%;box-shadow:var(--shadowlg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
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
          <div class="fg"><label>Private (Vivi)</label><input type="number" id="inc-private" value="${current.income_private || ''}" placeholder="0"></div>
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
  const catSel = document.getElementById('tx-cat');
  if (catSel) {
    catSel.addEventListener('change', () => {
      const cat = CATEGORIES.find((c) => c.key === catSel.value);
      const storeField = document.getElementById('tx-store');
      if (storeField)
        storeField.placeholder = cat?.hasStore ? 'Makolet, Yochananof...' : 'Optional';
      updateStoreSuggestions(catSel.value);
    });
  }
}

async function saveSavingsField(field, value) {
  const num = parseFloat(value) || 0;
  const month = state.months.find((m) => m.id === state.currentMonthId);
  const old = Number(month[field]) || 0;
  await sb
    .from('months')
    .update({ [field]: num })
    .eq('id', state.currentMonthId);
  if (month) month[field] = num;
  logChange(
    'edit',
    'savings',
    state.currentMonthId,
    `Savings changed: ${field} ₪${old} → ₪${num}`,
    { [field]: old },
    { [field]: num },
    state.currentMonthId,
  );
  pushUndo({
    label: 'savings ' + field,
    undo: async () => {
      await sb
        .from('months')
        .update({ [field]: old })
        .eq('id', state.currentMonthId);
      if (month) month[field] = old;
    },
    redo: async () => {
      await sb
        .from('months')
        .update({ [field]: num })
        .eq('id', state.currentMonthId);
      if (month) month[field] = num;
    },
  });
  renderApp();
  toast('Saved ✓');
}

async function saveBudget(catKey, amount) {
  const num = parseFloat(amount) || 0;
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
    await sb.from('budgets').update({ amount: num }).eq('id', existing.id);
  } else {
    await sb.from('budgets').insert({ month_id: monthId, category: catKey, amount: num });
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
          { year: 2026, month_num: month.month_num, amount: num },
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
        state.travel.allocations[month.month_num] = { month_id: monthId, amount: num };
      }
    } else if (catKey === 'charity') {
      const existingAlloc = state.charity.allocations[month.month_num];
      if (existingAlloc) {
        existingAlloc.amount = num;
      } else {
        state.charity.allocations[month.month_num] = { month_id: monthId, amount: num };
      }
    }
  }
  pushUndo({
    label: 'budget ' + catKey,
    undo: async () => {
      await saveBudget(catKey, old);
    },
    redo: async () => {
      await saveBudget(catKey, num);
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

function updateSbStores(catKey) {
  const dl = document.getElementById('sb-store-list');
  if (!dl) return;
  const stores = [
    ...new Set([
      ...(PRESET_STORES[catKey] || []),
      ...state.allStores.filter((tx) => tx.category === catKey && tx.store).map((tx) => tx.store),
      ...state.transactions
        .filter((tx) => tx.category === catKey && tx.store)
        .map((tx) => tx.store),
    ]),
  ];
  dl.innerHTML = stores.map((s) => `<option value="${s.replace(/"/g, '&quot;')}">`).join('');
}

function updateStoreSuggestions(catKey) {
  const dl = document.getElementById('store-suggestions');
  if (!dl) return;
  const presets = PRESET_STORES[catKey] || [];
  const fromHistory = state.transactions
    .filter((tx) => tx.category === catKey && tx.store)
    .map((tx) => tx.store);
  const stores = [...new Set([...presets, ...fromHistory])];
  dl.innerHTML = stores.map((s) => `<option value="${s}">`).join('');
}

function quickAddFor(catKey) {
  state.inlineAddCat = catKey;
  renderApp();
  setTimeout(() => {
    const el = document.getElementById('inline-store-' + catKey);
    if (el) el.focus();
  }, 50);
}

async function saveInlineAdd(catKey) {
  if (saveInlineAdd._saving) return;
  saveInlineAdd._saving = true;
  const store = (document.getElementById('inline-store-' + catKey) || {}).value?.trim() || null;
  const item = (document.getElementById('inline-item-' + catKey) || {}).value?.trim() || null;
  const amount = parseFloat((document.getElementById('inline-amount-' + catKey) || {}).value);
  const date = (document.getElementById('inline-date-' + catKey) || {}).value || null;
  if (!amount || isNaN(amount)) {
    toast('Enter an amount');
    saveInlineAdd._saving = false;
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
    saveInlineAdd._saving = false;
    return;
  }
  logChange(
    'add',
    'transaction',
    txData.id,
    `Added ${store || item || catKey} ₪${amount} • ${catKey}`,
    null,
    txData,
    state.currentMonthId,
  );
  pushUndo({
    label: 'add transaction',
    undo: async () => {
      await sb.from('transactions').delete().eq('id', txData.id);
      await loadTransactions(state.currentMonthId);
    },
    redo: async () => {
      await sb.from('transactions').insert(txData);
      await loadTransactions(state.currentMonthId);
    },
  });
  state.inlineAddCat = null;
  await loadTransactions(state.currentMonthId);
  saveInlineAdd._saving = false;
  renderApp();
  toast('Saved ✓');
}

function toggleCat(key) {
  if (state.openCats.has(key)) {
    state.openCats.delete(key);
  } else {
    state.openCats.add(key);
  }
  localStorage.setItem('openCats', JSON.stringify([...state.openCats]));
  renderApp();
}

async function saveIncomeField(field, value) {
  const num = parseFloat(value) || 0;
  const month = state.months.find((m) => m.id === state.currentMonthId);
  const oldVal = month ? month[field] : 0;
  const { error } = await sb
    .from('months')
    .update({ [field]: num })
    .eq('id', state.currentMonthId);
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
    state.currentMonthId,
  );
  pushUndo({
    label: field.replace('income_', ''),
    undo: async () => {
      await sb
        .from('months')
        .update({ [field]: oldVal })
        .eq('id', state.currentMonthId);
      if (month) month[field] = oldVal;
    },
    redo: async () => {
      await sb
        .from('months')
        .update({ [field]: num })
        .eq('id', state.currentMonthId);
      if (month) month[field] = num;
    },
  });
  renderApp();
  toast('Saved ✓');
}

async function addIncomeItem() {
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
  logChange('add', 'income_item', data.id, `Added income source: Other ₪0`, null, data);
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

async function saveIncomeItemLabel(id, value) {
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

async function saveIncomeItemAmount(id, value) {
  const num = parseFloat(value) || 0;
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

async function deleteIncomeItem(id) {
  const item = state.incomeItems.find((i) => i.id === id);
  const snap = { ...item };
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
}

function showEditIncome() {
  const modal = document.getElementById('income-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeModal() {
  const modal = document.getElementById('income-modal');
  if (modal) modal.style.display = 'none';
}

async function saveIncome() {
  const updates = {
    income_petachya: parseFloat(document.getElementById('inc-petachya').value) || 0,
    income_clalit: parseFloat(document.getElementById('inc-clalit').value) || 0,
    income_private: parseFloat(document.getElementById('inc-private').value) || 0,
    income_other: parseFloat(document.getElementById('inc-other').value) || 0,
    savings_bank: parseFloat(document.getElementById('inc-savings').value) || 0,
  };
  const { error } = await sb.from('months').update(updates).eq('id', state.currentMonthId);
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
async function switchTab(tab) {
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

  // Load or create biz_months row
  const { data: bizRows } = await sb
    .from('biz_months')
    .select('*')
    .eq('month_id', state.currentMonthId);
  if (bizRows && bizRows.length > 0) {
    state.biz = bizRows[0];
  } else {
    const { data: newBiz } = await sb
      .from('biz_months')
      .insert({
        month_id: state.currentMonthId,
        accountant_fee: 0,
        spending: 0,
        confirmed_amount: 0,
      })
      .select()
      .single();
    state.biz = newBiz;
  }

  // Load clients from private tracker
  const { data: clients } = await pt.from('clients').select('*');
  state.ptClients = clients || [];

  // All sessions from previous month (happened + scheduled)
  const prevMonthNum = current.month_num - 1;
  const prevYear = prevMonthNum === 0 ? 2025 : 2026;
  const actualPrevMonthNum = prevMonthNum === 0 ? 12 : prevMonthNum;
  const monthStart = `${prevYear}-${String(actualPrevMonthNum).padStart(2, '0')}-01`;
  const monthEnd = `${current.year}-${String(current.month_num).padStart(2, '0')}-01`;

  const { data: prevSessions } = await pt
    .from('sessions')
    .select('*')
    .gte('date', monthStart)
    .lt('date', monthEnd);
  const earned = (prevSessions || []).filter((s) => s.status === 'happened');
  const scheduled = (prevSessions || []).filter((s) => s.status === 'scheduled');

  state.ptSessions = { earned, scheduled };

  // Load all biz_months for accountant fee tracking
  const monthIds = state.months.map((m) => m.id);
  const { data: allBiz } = await sb.from('biz_months').select('*').in('month_id', monthIds);
  state.allBiz = allBiz || [];
}

// ── Admin data loading ────────────────────────────────────────────────
async function loadAdminData() {
  const { data: items } = await sb
    .from('admin_items')
    .select('*')
    .eq('year', 2026)
    .order('created_at');
  state.admin.items = items || [];

  const { data: allocs } = await sb.from('admin_allocations').select('*').eq('year', 2026);
  state.admin.allocations = {};
  (allocs || []).forEach((a) => {
    state.admin.allocations[a.month_num] = a;
  });

  const { data: payments } = await sb
    .from('admin_payments')
    .select('*')
    .eq('year', 2026)
    .order('month_num,created_at');
  state.admin.payments = payments || [];

  const { data: subs } = await sb.from('admin_sub_items').select('*').order('created_at');
  state.admin.subItems = subs || [];
}

// ── Travel data loading ────────────────────────────────────────────────
async function loadTravelData() {
  const { data: items } = await sb
    .from('travel_items')
    .select('*')
    .eq('year', 2026)
    .order('created_at');
  state.travel.items = items || [];
  const { data: payments } = await sb
    .from('travel_payments')
    .select('*')
    .eq('year', 2026)
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
    if (m) state.travel.allocations[m.month_num] = { month_id: b.month_id, amount: b.amount };
  });
}

// ── Charity data loading ──────────────────────────────────────────────
async function loadCharityData() {
  const { data: items } = await sb
    .from('charity_items')
    .select('*')
    .eq('year', 2026)
    .order('created_at');
  state.charity.items = items || [];
  const { data: payments } = await sb
    .from('charity_payments')
    .select('*')
    .eq('year', 2026)
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
    if (m) state.charity.allocations[m.month_num] = { month_id: b.month_id, amount: b.amount };
  });
}

// ── Charity CRUD ──────────────────────────────────────────────────────
async function addCharityItem() {
  const { data, error } = await sb
    .from('charity_items')
    .insert({ year: 2026, label: 'New item', projected_amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error adding item');
    return;
  }
  state.charity.items.push(data);
  logChange('add', 'charity_item', data.id, `Added charity item: New item`, null, data);
  renderApp();
}

async function saveCharityItem(id, field, value) {
  const item = state.charity.items.find((i) => i.id === id);
  if (!item) return;
  const oldVal = item[field];
  const val =
    field === 'projected_amount'
      ? parseFloat(value) || 0
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

async function deleteCharityItem(id) {
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
}

async function addCharitySub(itemId) {
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

async function updateCharitySub(id, field, value) {
  const s = state.charity.subItems.find((s) => s.id === id);
  if (!s) return;
  const val =
    field === 'amount' ? parseFloat(value) || 0 : field === 'is_paid' ? Boolean(value) : value;
  await sb
    .from('charity_sub_items')
    .update({ [field]: val })
    .eq('id', id);
  s[field] = val;
  renderApp();
}

async function deleteCharitySub(id) {
  await sb.from('charity_sub_items').delete().eq('id', id);
  state.charity.subItems = state.charity.subItems.filter((s) => s.id !== id);
  renderApp();
}

async function saveCharityAllocation(monthNum, value) {
  const num = parseFloat(value) || 0;
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
    state.charity.allocations[monthNum] = { month_id: month.id, amount: num };
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
  const monthNum = parseInt(document.getElementById('cp-month').value);
  const label = document.getElementById('cp-label').value.trim();
  const dateVal = document.getElementById('cp-date').value || null;
  const amount = parseFloat(document.getElementById('cp-amount').value);
  if (!label || !amount || isNaN(amount)) {
    toast('Fill in name and amount');
    return;
  }
  const { data, error } = await sb
    .from('charity_payments')
    .insert({ year: 2026, month_num: monthNum, label, amount, payment_date: dateVal })
    .select()
    .single();
  if (error) {
    toast('Error saving');
    return;
  }
  state.charity.payments.push(data);
  state.charity.payments.sort((a, b) => a.month_num - b.month_num);
  document.getElementById('cp-label').value = '';
  document.getElementById('cp-date').value = '';
  document.getElementById('cp-amount').value = '';
  renderApp();
  toast('Payment logged ✓');
}

async function deleteCharityPayment(id) {
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
}

async function updateCharityPayment(id, field, value) {
  const p = state.charity.payments.find((p) => p.id === id);
  if (!p) return;
  const oldVal = p[field];
  const val =
    field === 'amount'
      ? parseFloat(value) || 0
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
async function addTravelItem() {
  const { data, error } = await sb
    .from('travel_items')
    .insert({ year: 2026, label: 'New item', projected_amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error adding item');
    return;
  }
  state.travel.items.push(data);
  logChange('add', 'travel_item', data.id, `Added travel item: New item`, null, data);
  renderApp();
}

async function saveTravelItem(id, field, value) {
  const item = state.travel.items.find((i) => i.id === id);
  if (!item) return;
  const oldVal = item[field];
  const val =
    field === 'projected_amount'
      ? parseFloat(value) || 0
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

async function deleteTravelItem(id) {
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
}

async function addTravelSub(itemId) {
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

async function updateTravelSub(id, field, value) {
  const s = state.travel.subItems.find((s) => s.id === id);
  if (!s) return;
  const val =
    field === 'amount' ? parseFloat(value) || 0 : field === 'is_paid' ? Boolean(value) : value;
  await sb
    .from('travel_sub_items')
    .update({ [field]: val })
    .eq('id', id);
  s[field] = val;
  renderApp();
}

async function deleteTravelSub(id) {
  await sb.from('travel_sub_items').delete().eq('id', id);
  state.travel.subItems = state.travel.subItems.filter((s) => s.id !== id);
  renderApp();
}

async function saveTravelAllocation(monthNum, value) {
  const num = parseFloat(value) || 0;
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
    state.travel.allocations[monthNum] = { month_id: month.id, amount: num };
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
  const monthNum = parseInt(document.getElementById('tp-month').value);
  const label = document.getElementById('tp-label').value.trim();
  const destination = document.getElementById('tp-dest').value.trim();
  const amount = parseFloat(document.getElementById('tp-amount').value);
  if (!label || !amount || isNaN(amount)) {
    toast('Fill in what and amount');
    return;
  }
  const { data, error } = await sb
    .from('travel_payments')
    .insert({ year: 2026, month_num: monthNum, label, destination, amount })
    .select()
    .single();
  if (error) {
    toast('Error saving');
    return;
  }
  state.travel.payments.push(data);
  state.travel.payments.sort((a, b) => a.month_num - b.month_num);
  document.getElementById('tp-label').value = '';
  document.getElementById('tp-dest').value = '';
  document.getElementById('tp-amount').value = '';
  renderApp();
  toast('Payment logged ✓');
}

async function deleteTravelPayment(id) {
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
}

async function updateTravelPayment(id, field, value) {
  const p = state.travel.payments.find((p) => p.id === id);
  if (!p) return;
  const oldVal = p[field];
  const val =
    field === 'amount' ? parseFloat(value) || 0 : field === 'is_estimate' ? Boolean(value) : value;
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

  const budget = items.reduce((s, i) => s + Number(i.projected_amount), 0);
  const totalAlloc = Object.values(allocs).reduce((s, a) => s + Number(a.amount), 0);
  const gap = budget - totalAlloc;
  const totalSpent = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = budget - totalSpent;

  const fmtA = (n) =>
    '₪' +
    Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => (s || '').replace(/"/g, '&quot;');

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
  if (payments.length === 0) {
    payLogHtml =
      '<div style="color:var(--dim);font-size:.78rem;padding:.3rem 0;">No payments yet</div>';
  } else {
    const ps = localStorage.getItem('travelPaySort') || 'month';
    const sorted = [...payments].sort((a, b) => {
      if (ps === 'month') return a.month_num - b.month_num;
      if (ps === 'month-desc') return b.month_num - a.month_num;
      if (ps === 'high') return Number(b.amount) - Number(a.amount);
      if (ps === 'low') return Number(a.amount) - Number(b.amount);
      return 0;
    });
    const sb2 = (key, label) =>
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
      ? sorted.filter((p) => (p.destination || '').toLowerCase().includes(destFilter))
      : sorted;
    const payRows = filtered
      .map((p) => {
        const destVal = esc(p.destination || '');
        const estBgP = p.is_estimate ? 'background:var(--ambersoft,#fffbf0);' : '';
        const amtColorP = p.is_estimate ? 'var(--amber)' : 'var(--text)';
        const amtWeightP = p.is_estimate ? '700' : '400';
        const estBtnBg = p.is_estimate ? 'var(--ambersoft,#fff3cd)' : 'none';
        const estBtnBorder = p.is_estimate ? 'var(--amber)' : 'var(--border)';
        const estBtnColor = p.is_estimate ? 'var(--amber)' : 'var(--dim)';
        const estBtnWeight = p.is_estimate ? '700' : '400';
        return (
          '<div style="display:grid;grid-template-columns:45px 80px 1fr 80px 38px 26px;gap:.25rem;align-items:center;padding:.28rem .1rem;border-bottom:1px solid var(--border);font-size:.8rem;' +
          estBgP +
          '">' +
          '<span style="font-size:.7rem;color:var(--muted);font-family:\'DM Mono\',monospace;">' +
          MONTH_NAMES[p.month_num - 1] +
          '</span>' +
          '<input type="text" value="' +
          destVal +
          '" placeholder="Where" style="font-size:.8rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .15rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelPayment(\'' +
          p.id +
          "','destination',this.value)\">" +
          '<input type="text" value="' +
          esc(p.label) +
          '" style="font-size:.8rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .15rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelPayment(\'' +
          p.id +
          "','label',this.value)\">" +
          '<input type="number" value="' +
          p.amount +
          '" min="0" step="0.01" style="font-size:.8rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .1rem;color:' +
          amtColorP +
          ';font-weight:' +
          amtWeightP +
          ';outline:none;text-align:right;width:100%;-moz-appearance:textfield;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateTravelPayment(\'' +
          p.id +
          "','amount',this.value)\">" +
          '<button onclick="updateTravelPayment(\'' +
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
          '<button onclick="deleteTravelPayment(\'' +
          p.id +
          '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .25rem;line-height:1;">×</button>' +
          '</div>'
        );
      })
      .join('');
    const destFilterDisplay = localStorage.getItem('travelDestFilter') || '';
    payLogHtml =
      '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;">' +
      '<input type="text" value="' +
      esc(destFilterDisplay) +
      '" placeholder="🔍 Filter by destination…" style="flex:1;font-size:.74rem;padding:.25rem .5rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:\'DM Sans\',sans-serif;outline:none;" oninput="localStorage.setItem(\'travelDestFilter\',this.value);renderApp()">' +
      (destFilterDisplay
        ? '<button onclick="localStorage.removeItem(\'travelDestFilter\');renderApp()" style="font-size:.7rem;padding:.2rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:none;color:var(--muted);cursor:pointer;">✕ clear</button>'
        : '') +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:.3rem;padding-bottom:.4rem;">' +
      '<span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Sort:</span>' +
      sb2('month', 'Mo ↑') +
      sb2('month-desc', 'Mo ↓') +
      sb2('high', 'Highest') +
      sb2('low', 'Lowest') +
      '</div>' +
      '<div style="overflow-x:auto;"><div style="min-width:360px;">' +
      '<div style="display:grid;grid-template-columns:45px 80px 1fr 80px 38px 26px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .1rem .35rem;border-bottom:1px solid var(--border);">' +
      '<span>Mo</span><span>Where</span><span>What</span><span style="text-align:right">Amount</span><span style="text-align:center">~est</span><span></span>' +
      '</div>' +
      payRows +
      '</div></div>' +
      '<div style="margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">' +
      '<span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total spent</span>' +
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
    <!-- Summary Bar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem;margin-bottom:1.5rem;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Budget</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(budget)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">projected total</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Allocated</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalAlloc)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">set aside so far</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Gap</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:${gapColor};">${fmtA(Math.abs(gap))}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">${gap > 0 ? 'still need to find' : 'fully covered ✓'}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Spent</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalSpent)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">paid so far</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--accent);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.4rem;">Remaining</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:var(--accent);">${fmtA(remaining)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">budget − spent</div>
      </div>
    </div>

    <div class="tab-two-col" style="display:grid;grid-template-columns:1.1fr 1fr;gap:1.25rem;align-items:start;">

      <!-- LEFT: Yearly Items -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);">Yearly Expenses</div>
          <div style="display:flex;gap:.25rem;">${sortBtnsHtml}</div>
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
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">${allocGridHtml}</div>
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
            <input type="text" id="tp-dest" placeholder="Where" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addTravelPayment()">
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

  const budget = items.reduce((s, i) => s + Number(i.projected_amount), 0);
  const totalAlloc = Object.values(allocs).reduce((s, a) => s + Number(a.amount), 0);
  const gap = budget - totalAlloc;
  const totalSpent = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = budget - totalSpent;

  const fmtA = (n) =>
    '₪' +
    Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => (s || '').replace(/"/g, '&quot;');

  // Pre-compute sort buttons HTML
  const ciSort = localStorage.getItem('charityItemSort') || 'created';
  const sortBtnsHtml = [
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

  // Pre-compute items HTML
  const sortedItems = [...items].sort((a, b) => {
    if (ciSort === 'alpha') return (a.label || '').localeCompare(b.label || '');
    if (ciSort === 'alpha-desc') return (b.label || '').localeCompare(a.label || '');
    if (ciSort === 'amount-high') return Number(b.projected_amount) - Number(a.projected_amount);
    if (ciSort === 'amount-low') return Number(a.projected_amount) - Number(b.projected_amount);
    return 0;
  });
  const itemsCharityHtml = sortedItems
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
    const sb2 = (key, label) =>
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
          '<div style="display:grid;grid-template-columns:45px 1fr 90px 80px 28px 28px 38px 26px;gap:.25rem;align-items:center;padding:.28rem .1rem;border-bottom:1px solid var(--border);font-size:.8rem;' +
          estBgP +
          '">' +
          '<span style="font-size:.7rem;color:var(--muted);font-family:\'DM Mono\',monospace;">' +
          MONTH_NAMES[p.month_num - 1] +
          '</span>' +
          '<input type="text" value="' +
          esc(p.label) +
          '" placeholder="Charity" style="font-size:.8rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .15rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharityPayment(\'' +
          p.id +
          "','label',this.value)\">" +
          '<input type="date" value="' +
          (p.payment_date || '') +
          '" style="font-size:.74rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .1rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharityPayment(\'' +
          p.id +
          "','payment_date',this.value)\">" +
          '<input type="number" value="' +
          p.amount +
          '" min="0" step="0.01" style="font-size:.8rem;font-family:\'DM Mono\',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .1rem;color:' +
          amtColorP +
          ';font-weight:' +
          amtWeightP +
          ';outline:none;text-align:right;width:100%;-moz-appearance:textfield;" onmouseover="this.style.borderBottomColor=\'var(--border)\'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor=\'transparent\'" onfocus="this.style.borderBottomColor=\'var(--accent)\'" onblur="this.style.borderBottomColor=\'transparent\'" onchange="updateCharityPayment(\'' +
          p.id +
          "','amount',this.value)\">" +
          '<button onclick="updateCharityPayment(\'' +
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
          '<button onclick="updateCharityPayment(\'' +
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
          '<button onclick="updateCharityPayment(\'' +
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
          '<button onclick="deleteCharityPayment(\'' +
          p.id +
          '\')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .25rem;line-height:1;">×</button>' +
          '</div>'
        );
      })
      .join('');
    payLogHtml =
      '<div style="display:flex;align-items:center;gap:.3rem;padding-bottom:.4rem;">' +
      '<span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Sort:</span>' +
      sb2('month', 'Mo ↑') +
      sb2('month-desc', 'Mo ↓') +
      sb2('high', 'Highest') +
      sb2('low', 'Lowest') +
      '</div>' +
      '<div style="overflow-x:auto;"><div style="min-width:400px;">' +
      '<div style="display:grid;grid-template-columns:45px 1fr 90px 80px 28px 28px 38px 26px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .1rem .35rem;border-bottom:1px solid var(--border);">' +
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

  const gapColorC = gap > 0 ? 'var(--red)' : 'var(--green)';
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
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Given</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalSpent)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">paid so far (incl. estimates)</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--accent);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.4rem;">Remaining to Give</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:var(--accent);">${fmtA(totalAlloc - totalSpent)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">allocated − given</div>
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
  const payments = state.admin.payments || [];

  const budget = items.reduce((s, i) => s + Number(i.projected_amount), 0);
  const totalAlloc = Object.values(allocs).reduce((s, a) => s + Number(a.amount), 0);
  const gap = budget - totalAlloc;
  const totalSpent = payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = budget - totalSpent;

  const fmtA = (n) =>
    '₪' +
    Number(n || 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => (s || '').replace(/"/g, '&quot;');

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
  const sortFn = (a, b) => {
    if (aiSort === 'alpha') return (a.label || '').localeCompare(b.label || '');
    if (aiSort === 'alpha-desc') return (b.label || '').localeCompare(a.label || '');
    if (aiSort === 'amount-high') return Number(b.projected_amount) - Number(a.projected_amount);
    if (aiSort === 'amount-low') return Number(a.projected_amount) - Number(b.projected_amount);
    return 0;
  };
  const activeItems = [...items].filter((i) => !i.is_logged).sort(sortFn);
  const doneItems = [...items].filter((i) => i.is_logged).sort(sortFn);
  const showDone = localStorage.getItem('adminShowDone') === '1';
  const viewMode = localStorage.getItem('adminViewMode') || 'category';
  const catEmoji = {
    Apartment: '🏠',
    Car: '🚗',
    Furniture: '🪑',
    Health: '🏥',
    Professional: '📚',
    Admin: '📋',
    Other: '📌',
  };
  const renderItemRow = (item) => {
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
    const logBg = item.is_logged ? 'var(--gsoft)' : 'none';
    const logBorder = item.is_logged ? 'var(--accent)' : 'var(--border)';
    const logColor = item.is_logged ? 'var(--accent)' : 'var(--dim)';
    const logIcon = item.is_logged ? '✓' : '';
    let subsHtml = '';
    if (isOpen) {
      const paidCount = subs.filter((s) => s.is_paid).length;
      const subRows = subs
        .map((s) => {
          const sPaid = s.is_paid;
          const sRowOp = sPaid ? 'opacity:.55;' : '';
          const sStrike = sPaid ? 'text-decoration:line-through;' : '';
          return (
            '<div style="display:grid;grid-template-columns:22px 1fr 80px 22px;gap:.35rem;align-items:center;padding:.25rem 0;' +
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
          (catEmoji[c] || '') +
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
      '<div style="border-bottom:1px solid var(--border);">' +
      '<div style="display:grid;grid-template-columns:16px 1fr 90px 42px 28px 28px;gap:.25rem;align-items:center;padding:.3rem .1rem;' +
      rowOpacity +
      '">' +
      '<button onclick="var k=\'sn-adm-' +
      item.id +
      "';localStorage.setItem(k,localStorage.getItem(k)==='1'?'0':'1');renderApp()\" style=\"background:none;border:none;cursor:pointer;color:var(--dim);font-size:.7rem;padding:0;line-height:1;text-align:center;\" title=\"Show/hide sub-payments\">" +
      (isOpen ? '▾' : '▸') +
      '</button>' +
      '<div style="display:flex;align-items:baseline;min-width:0;"><input type="text" value="' +
      esc(item.label) +
      '" placeholder="Item name" style="font-size:.82rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .2rem;color:var(--text);outline:none;font-family:\'DM Sans\',sans-serif;width:100%;' +
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
      (item.is_logged ? 'Mark as not done' : 'Mark as done') +
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
    const grouped = {};
    activeItems.forEach((item) => {
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
          (catEmoji[cat] || '📌') +
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
    <!-- Summary Bar -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem;margin-bottom:1.5rem;">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Budget</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(budget)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">projected total</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Allocated</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalAlloc)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">set aside so far</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Gap</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:${gap > 0 ? 'var(--red)' : 'var(--green)'};">${fmtA(Math.abs(gap))}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">${gap > 0 ? 'still need to find' : 'fully covered ✓'}</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.4rem;">Spent</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;">${fmtA(totalSpent)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">paid so far</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--accent);border-radius:var(--rl);padding:1rem;box-shadow:var(--shadow);">
        <div style="font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.4rem;">Remaining</div>
        <div style="font-family:'DM Mono',monospace;font-size:1.4rem;font-weight:500;color:var(--accent);">${fmtA(remaining)}</div>
        <div style="font-size:.68rem;color:var(--dim);margin-top:.2rem;">budget − spent</div>
      </div>
    </div>

    <div class="tab-two-col" style="display:grid;grid-template-columns:1.1fr 1fr;gap:1.25rem;align-items:start;">

      <!-- LEFT: Yearly Items -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.4rem;">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);">Yearly Expenses</div>
          <div style="display:flex;gap:.25rem;align-items:center;">
            <button onclick="localStorage.setItem('adminViewMode','${viewMode === 'category' ? 'list' : 'category'}');renderApp()" style="font-size:.6rem;padding:.1rem .35rem;border:1px solid ${viewMode === 'category' ? 'var(--accent)' : 'var(--border)'};border-radius:4px;background:${viewMode === 'category' ? 'var(--gsoft)' : 'none'};color:${viewMode === 'category' ? 'var(--accent)' : 'var(--dim)'};cursor:pointer;font-family:'DM Sans',sans-serif;" title="Toggle grouped/flat view">${viewMode === 'category' ? 'Grouped' : 'List'}</button>
            ${sortBtnsHtml}
          </div>
        </div>
        ${
          viewMode !== 'category'
            ? `<div style="display:grid;grid-template-columns:16px 1fr 90px 42px 28px 22px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .25rem .4rem;border-bottom:1px solid var(--border);">
          <span></span><span>Item</span><span style="text-align:right;">Projected</span><span style="text-align:center;">Est</span><span></span><span></span>
        </div>`
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
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">
            ${MONTH_NAMES.map((mn, i) => {
              const mnum = i + 1;
              const val = allocs[mnum] ? allocs[mnum].amount : '';
              const isCurrent = mnum === currentMonthNum;
              return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.25rem .4rem;background:${isCurrent ? 'var(--gsoft)' : 'var(--surface2)'};border-radius:6px;border:1px solid ${isCurrent ? 'var(--accent)' : 'transparent'};">
                <span style="font-size:.72rem;color:${isCurrent ? 'var(--accent)' : 'var(--muted)'};font-weight:${isCurrent ? '700' : '600'};">${mn}</span>
                <span style="width:60px;font-size:.78rem;font-family:'DM Mono',monospace;text-align:right;color:${isCurrent ? 'var(--accent)' : 'var(--text)'};font-weight:${isCurrent ? '600' : '400'};display:inline-block;" title="Set from Budget page">${val ? fmtA(val) : '₪0'}</span>
              </div>`;
            }).join('')}
          </div>
          <div style="margin-top:.7rem;padding-top:.6rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
            <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total allocated</span>
            <span style="font-family:'DM Mono',monospace;font-size:.85rem;font-weight:600;color:${gap > 0 ? 'var(--red)' : 'var(--green)'};">${fmtA(totalAlloc)} ${gap > 0 ? '(−' + fmtA(gap) + ' gap)' : '✓'}</span>
          </div>
        </div>

        <!-- Payment Log -->
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:1.25rem;box-shadow:var(--shadow);">
          <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:.9rem;">Payment Log</div>

          <!-- Add payment form -->
          <div style="display:grid;grid-template-columns:70px 1fr 80px 28px;gap:.35rem;align-items:end;margin-bottom:.8rem;padding-bottom:.8rem;border-bottom:1px solid var(--border);">
            <select id="ap-month" style="font-size:.74rem;padding:.3rem .3rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;">
              ${MONTH_NAMES.map((mn, i) => `<option value="${i + 1}"${i + 1 === currentMonthNum ? ' selected' : ''}>${mn}</option>`).join('')}
            </select>
            <input type="text" id="ap-label" placeholder="What" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Sans',sans-serif;outline:none;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addAdminPayment()">
            <input type="number" id="ap-amount" placeholder="₪" min="0" step="0.01" style="font-size:.74rem;padding:.3rem .4rem;border:1px solid var(--border);border-radius:var(--r);background:var(--surface2);color:var(--text);font-family:'DM Mono',monospace;outline:none;-moz-appearance:textfield;"
              onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'"
              onkeydown="if(event.key==='Enter')addAdminPayment()">
            <button onclick="addAdminPayment()" style="padding:.3rem .4rem;background:var(--accent);color:white;border:none;border-radius:var(--r);font-size:.8rem;cursor:pointer;font-weight:600;">+</button>
          </div>

          ${
            payments.length === 0
              ? '<div style="color:var(--dim);font-size:.78rem;padding:.3rem 0;">No payments yet</div>'
              : (() => {
                  const ps = localStorage.getItem('adminPaySort') || 'month';
                  const sorted = [...payments].sort((a, b) => {
                    if (ps === 'month') return a.month_num - b.month_num;
                    if (ps === 'month-desc') return b.month_num - a.month_num;
                    if (ps === 'high') return Number(b.amount) - Number(a.amount);
                    if (ps === 'low') return Number(a.amount) - Number(b.amount);
                    return 0;
                  });
                  const sb2 = (key, label) =>
                    `<button onclick="localStorage.setItem('adminPaySort','${key}');renderApp()" style="background:none;border:1px solid var(--border);border-radius:4px;font-size:.64rem;padding:.1rem .3rem;cursor:pointer;color:${ps === key ? 'var(--accent)' : 'var(--muted)'};font-family:'DM Sans',sans-serif;font-weight:${ps === key ? '600' : '400'};border-color:${ps === key ? 'var(--accent)' : 'var(--border)'};">${label}</button>`;
                  return `
            <div style="display:flex;align-items:center;gap:.3rem;padding-bottom:.4rem;">
              <span style="font-size:.62rem;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">Sort:</span>
              ${sb2('month', 'Mo ↑')}${sb2('month-desc', 'Mo ↓')}${sb2('high', 'Highest')}${sb2('low', 'Lowest')}
            </div>
            <div style="display:grid;grid-template-columns:45px 1fr 80px 38px 26px;gap:.25rem;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);padding:.1rem .1rem .35rem;border-bottom:1px solid var(--border);">
              <span>Mo</span><span>What</span><span style="text-align:right">Amount</span><span style="text-align:center">~est</span><span></span>
            </div>
            ${sorted
              .map(
                (p) => `
            <div style="display:grid;grid-template-columns:45px 1fr 80px 38px 26px;gap:.25rem;align-items:center;padding:.28rem .1rem;border-bottom:1px solid var(--border);font-size:.8rem;${p.is_estimate ? 'background:var(--ambersoft,#fffbf0);' : ''}">
              <span style="font-size:.7rem;color:var(--muted);font-family:'DM Mono',monospace;">${MONTH_NAMES[p.month_num - 1]}</span>
              <input type="text" value="${esc(p.label)}" style="font-size:.8rem;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .15rem;color:var(--text);outline:none;font-family:'DM Sans',sans-serif;width:100%;"
                onmouseover="this.style.borderBottomColor='var(--border)'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor='transparent'"
                onfocus="this.style.borderBottomColor='var(--accent)'" onblur="this.style.borderBottomColor='transparent'"
                onchange="updateAdminPayment('${p.id}','label',this.value)">
              <input type="number" value="${p.amount}" min="0" step="0.01" style="font-size:.8rem;font-family:'DM Mono',monospace;background:transparent;border:none;border-bottom:1px solid transparent;padding:.1rem .1rem;color:${p.is_estimate ? 'var(--amber)' : 'var(--text)'};font-weight:${p.is_estimate ? '700' : '400'};outline:none;text-align:right;width:100%;-moz-appearance:textfield;"
                onmouseover="this.style.borderBottomColor='var(--border)'" onmouseout="if(document.activeElement!==this)this.style.borderBottomColor='transparent'"
                onfocus="this.style.borderBottomColor='var(--accent)'" onblur="this.style.borderBottomColor='transparent'"
                onchange="updateAdminPayment('${p.id}','amount',this.value)">
              <button onclick="updateAdminPayment('${p.id}','is_estimate',${!p.is_estimate})"
                title="${p.is_estimate ? 'Marked as estimate — click to confirm' : 'Mark as estimate'}"
                style="background:${p.is_estimate ? 'var(--ambersoft,#fff3cd)' : 'none'};border:1px solid ${p.is_estimate ? 'var(--amber)' : 'var(--border)'};border-radius:4px;color:${p.is_estimate ? 'var(--amber)' : 'var(--dim)'};cursor:pointer;font-size:.62rem;padding:.1rem .15rem;font-weight:${p.is_estimate ? '700' : '400'};font-family:'DM Sans',sans-serif;width:100%;">~est</button>
              <button onclick="deleteAdminPayment('${p.id}')" title="Delete" style="background:none;border:1px solid var(--border);border-radius:4px;color:var(--dim);cursor:pointer;font-size:.85rem;padding:.1rem .25rem;line-height:1;">×</button>
            </div>`,
              )
              .join('')}
            <div style="margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;">
              <span style="font-size:.72rem;font-weight:700;color:var(--muted);">Total spent</span>
              <span style="font-family:'DM Mono',monospace;font-size:.85rem;font-weight:600;">${fmtA(totalSpent)}</span>
            </div>`;
                })()
          }
        </div>
      </div>
    </div>
  </div>`;
}

// ── Admin CRUD ────────────────────────────────────────────────────────
async function addAdminItem() {
  const { data, error } = await sb
    .from('admin_items')
    .insert({ year: 2026, label: '', projected_amount: 0 })
    .select()
    .single();
  if (error) {
    toast('Error adding item');
    return;
  }
  state.admin.items.push(data);
  logChange('add', 'admin_item', data.id, `Added admin item`, null, data);
  renderApp();
  // Auto-focus the new item's name input
  setTimeout(() => {
    const inputs = document.querySelectorAll('input[placeholder="Item name"]');
    const last = inputs[inputs.length - 1];
    if (last && !last.value) {
      last.focus();
      last.placeholder = 'Type item name...';
    }
  }, 50);
}

async function saveAdminItem(id, field, value) {
  const item = state.admin.items.find((i) => i.id === id);
  if (!item) return;
  const oldVal = item[field];
  const val =
    field === 'projected_amount'
      ? parseFloat(value) || 0
      : field === 'is_estimate' || field === 'is_logged'
        ? Boolean(value)
        : String(value);
  await sb
    .from('admin_items')
    .update({ [field]: val })
    .eq('id', id);
  item[field] = val;
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
      renderApp();
    },
    redo: async () => {
      await sb
        .from('admin_items')
        .update({ [field]: val })
        .eq('id', id);
      item[field] = val;
      renderApp();
    },
  });
  renderApp();
}

async function deleteAdminItem(id) {
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
}

async function addAdminSub(itemId) {
  const { data, error } = await sb
    .from('admin_sub_items')
    .insert({ item_id: itemId, label: '', amount: 0 })
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

async function updateAdminSub(id, field, value) {
  const s = state.admin.subItems.find((s) => s.id === id);
  if (!s) return;
  const val =
    field === 'amount' ? parseFloat(value) || 0 : field === 'is_paid' ? Boolean(value) : value;
  await sb
    .from('admin_sub_items')
    .update({ [field]: val })
    .eq('id', id);
  s[field] = val;
  renderApp();
}

async function deleteAdminSub(id) {
  await sb.from('admin_sub_items').delete().eq('id', id);
  state.admin.subItems = state.admin.subItems.filter((s) => s.id !== id);
  renderApp();
}

async function saveAdminAllocation(monthNum, value) {
  const num = parseFloat(value) || 0;
  const existing = state.admin.allocations[monthNum];
  const oldNum = existing ? Number(existing.amount) : 0;
  if (existing) {
    await sb.from('admin_allocations').update({ amount: num }).eq('id', existing.id);
    existing.amount = num;
  } else {
    const { data } = await sb
      .from('admin_allocations')
      .insert({ year: 2026, month_num: monthNum, amount: num })
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

async function addAdminPayment() {
  const monthNum = parseInt(document.getElementById('ap-month').value);
  const label = document.getElementById('ap-label').value.trim();
  const amount = parseFloat(document.getElementById('ap-amount').value);
  if (!label || !amount || isNaN(amount)) {
    toast('Fill in what and amount');
    return;
  }
  const { data, error } = await sb
    .from('admin_payments')
    .insert({ year: 2026, month_num: monthNum, label, amount })
    .select()
    .single();
  if (error) {
    toast('Error saving');
    return;
  }
  state.admin.payments.push(data);
  state.admin.payments.sort((a, b) => a.month_num - b.month_num);
  document.getElementById('ap-label').value = '';
  document.getElementById('ap-amount').value = '';
  renderApp();
  toast('Payment logged ✓');
}

async function deleteAdminPayment(id) {
  const snap = { ...state.admin.payments.find((p) => p.id === id) };
  await sb.from('admin_payments').delete().eq('id', id);
  state.admin.payments = state.admin.payments.filter((p) => p.id !== id);
  logChange(
    'delete',
    'admin_payment',
    id,
    `Deleted admin payment: ${snap.label} ₪${snap.amount}`,
    snap,
    null,
  );
  pushUndo({
    label: 'delete payment',
    undo: async () => {
      const { data } = await sb.from('admin_payments').insert(snap).select().single();
      if (data) {
        state.admin.payments.push(data);
        state.admin.payments.sort((a, b) => a.month_num - b.month_num);
      }
      renderApp();
    },
    redo: async () => {
      await sb.from('admin_payments').delete().eq('id', id);
      state.admin.payments = state.admin.payments.filter((p) => p.id !== id);
      renderApp();
    },
  });
  renderApp();
}

async function updateAdminPayment(id, field, value) {
  const p = state.admin.payments.find((p) => p.id === id);
  if (!p) return;
  const oldVal = p[field];
  const val =
    field === 'amount' ? parseFloat(value) || 0 : field === 'is_estimate' ? Boolean(value) : value;
  await sb
    .from('admin_payments')
    .update({ [field]: val })
    .eq('id', id);
  p[field] = val;
  logChange(
    'edit',
    'admin_payment',
    id,
    `Admin payment changed: ${p.label} ${field} ${oldVal} → ${val}`,
    { [field]: oldVal },
    { [field]: val },
  );
  pushUndo({
    label: 'edit payment',
    undo: async () => {
      await sb
        .from('admin_payments')
        .update({ [field]: oldVal })
        .eq('id', id);
      p[field] = oldVal;
      renderApp();
    },
    redo: async () => {
      await sb
        .from('admin_payments')
        .update({ [field]: val })
        .eq('id', id);
      p[field] = val;
      renderApp();
    },
  });
  renderApp();
}

// ── Biz tab render ────────────────────────────────────────────────────
function renderBizTab(current) {
  const biz = state.biz || { accountant_fee: 0, spending: 0, confirmed_amount: 0 };
  const clients = state.ptClients;
  const { earned, scheduled } = state.ptSessions || { earned: [], scheduled: [] };

  const clientName = (id) => clients.find((c) => c.id === id)?.name || '?';
  const clientRate = (id) => clients.find((c) => c.id === id)?.rate || 0;

  // Group earned sessions by client
  const earnedByClient = {};
  earned.forEach((s) => {
    if (!earnedByClient[s.client_id]) earnedByClient[s.client_id] = [];
    earnedByClient[s.client_id].push(s);
  });
  const trackerTotal = earned.reduce((sum, s) => sum + clientRate(s.client_id) * 0.85, 0);

  // Group scheduled sessions by client
  const scheduledByClient = {};
  scheduled.forEach((s) => {
    if (!scheduledByClient[s.client_id]) scheduledByClient[s.client_id] = [];
    scheduledByClient[s.client_id].push(s);
  });
  const scheduledTotal = scheduled.reduce((sum, s) => sum + clientRate(s.client_id) * 0.85, 0);

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
      <div class="biz-section-title">Scheduled — ${prevMonthName} (not happened)</div>
      ${
        Object.keys(scheduledByClient).length === 0
          ? `<div style="color:var(--dim);font-size:.8rem;padding:.5rem 0">No sessions scheduled for ${current.month_name}</div>`
          : Object.entries(scheduledByClient)
              .map(
                ([cid, sessions]) => `
          <div class="biz-session-item">
            <span>${clientName(cid)} × ${sessions.length}</span>
            <span class="biz-val amber">${fmt(sessions.length * clientRate(cid) * 0.85)}</span>
          </div>`,
              )
              .join('')
      }
      <div class="biz-row" style="background:var(--ambersoft);">
        <span class="biz-label" style="font-weight:700;">Scheduled total</span>
        <span class="biz-val amber">${fmt(scheduledTotal)}</span>
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

function renderAccountantTracker(current) {
  const allBiz = state.allBiz || [];
  const todayMonth = new Date().getMonth() + 1;
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

async function saveBizField(field, value) {
  const num = parseFloat(value) || 0;
  const oldVal = state.biz ? state.biz[field] : 0;
  const { error } = await sb
    .from('biz_months')
    .update({ [field]: num })
    .eq('id', state.biz.id);
  if (error) {
    toast('Error saving');
    return;
  }
  state.biz[field] = num;
  logChange(
    'edit',
    'biz_field',
    state.biz.id,
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
        .eq('id', state.biz.id);
      state.biz[field] = oldVal;
    },
    redo: async () => {
      await sb
        .from('biz_months')
        .update({ [field]: num })
        .eq('id', state.biz.id);
      state.biz[field] = num;
    },
  });

  // If confirmed_amount changes, also update income_private in main months table
  if (field === 'confirmed_amount') {
    const net = num - (state.biz.accountant_fee || 0) - (state.biz.spending || 0);
    await sb.from('months').update({ income_private: net }).eq('id', state.currentMonthId);
    const month = state.months.find((m) => m.id === state.currentMonthId);
    if (month) month.income_private = net;
  }
  if (field === 'accountant_fee' || field === 'spending') {
    const net =
      (state.biz.confirmed_amount || 0) -
      (state.biz.accountant_fee || 0) -
      (state.biz.spending || 0);
    await sb.from('months').update({ income_private: net }).eq('id', state.currentMonthId);
    const month = state.months.find((m) => m.id === state.currentMonthId);
    if (month) month.income_private = net;
  }

  renderApp();
  toast('Saved ✓');
}

function toggleGroup(key) {
  const el = document.getElementById('group-' + key);
  if (el) el.classList.toggle('collapsed');
}

function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('collapsed')) el.classList.remove('collapsed');
  const hdrH =
    (document.querySelector('.hdr')?.offsetHeight || 57) +
    (document.querySelector('.ribbon-panel')?.offsetHeight || 0) +
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
      (document.querySelector('.hdr')?.offsetHeight || 57) +
      (document.querySelector('.ribbon-panel')?.offsetHeight || 0) +
      40;
    let active = null;
    items.forEach((item) => {
      const fn = item.getAttribute('onclick') || '';
      const m = fn.match(/jumpTo\('(.+?)'\)/);
      if (!m) return;
      const el = document.getElementById(m[1]);
      if (el && el.getBoundingClientRect().top <= offset) active = item;
    });
    items.forEach((i) => i.classList.remove('active'));
    if (active) active.classList.add('active');
  },
  { passive: true },
);

function startRibbonDrag(e) {
  e.preventDefault();
  const panel = document.querySelector('.ribbon-panel');
  if (!panel) return;
  const startY = e.clientY;
  const startH = panel.offsetHeight;
  const minH = 40;
  function onMove(ev) {
    const newH = Math.max(minH, startH + (ev.clientY - startY));
    panel.style.maxHeight = newH + 'px';
    panel.style.overflow = 'hidden auto';
    localStorage.setItem('ribbonHeight', newH);
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
    const panel = document.querySelector('.ribbon-panel');
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
  localStorage.setItem('ribbonHidden', !hidden);
  if (!hidden) localStorage.removeItem('ribbonExpanded');
  renderApp();
}
function toggleRibbonExpand() {
  const expanded = localStorage.getItem('ribbonExpanded') === 'true';
  localStorage.setItem('ribbonExpanded', !expanded);
  renderApp();
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
}

function cashILS(acct) {
  const amt = Number(acct.amount) || 0;
  if (acct.currency === 'USD') return Math.round(amt * (state.usdRate || 3.13));
  return amt;
}

async function saveCashField(id, field, value) {
  const acct = state.cashAccounts.find((a) => a.id === id);
  if (!acct) return;
  const old = acct[field];
  if (field === 'amount') value = parseFloat(value) || 0;
  acct[field] = value;
  await sb
    .from('cash_accounts')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', id);
  renderApp();
}

async function addCashAccount() {
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

async function deleteCashAccount(id) {
  if (!confirm('Delete this account?')) return;
  await sb.from('cash_accounts').delete().eq('id', id);
  state.cashAccounts = state.cashAccounts.filter((a) => a.id !== id);
  renderApp();
}

function renderCashTab() {
  const accounts = state.cashAccounts || [];
  const n = (v) =>
    Number(v || 0).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const INVEST_THRESHOLD = 35000;

  // Split into holdings vs owed
  const holdings = accounts.filter((a) => !a.is_owed);
  const owed = accounts.filter((a) => a.is_owed);
  const totalHoldings = holdings.reduce((s, a) => s + cashILS(a), 0);
  const totalOwed = owed.reduce((s, a) => s + cashILS(a), 0);
  const totalLiquid = totalHoldings + totalOwed;
  const investable = totalLiquid - INVEST_THRESHOLD;

  const renderRow = (a) => {
    const ilsVal = cashILS(a);
    const isUSD = a.currency === 'USD';
    return `<tr>
      <td style="padding:.5rem .75rem;">
        <input type="text" value="${a.name}" style="border:none;background:none;font-size:.85rem;font-weight:600;width:140px;font-family:inherit;" onchange="saveCashField('${a.id}','name',this.value)">
      </td>
      <td style="text-align:right;padding:.5rem .75rem;">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:.3rem;">
          ${isUSD ? '<span style="font-size:.7rem;color:var(--dim);">$</span>' : '<span style="font-size:.7rem;color:var(--dim);">₪</span>'}
          <input type="number" value="${Number(a.amount) || 0}" style="border:1px solid var(--border);border-radius:6px;padding:.25rem .4rem;width:90px;text-align:right;font-size:.85rem;font-family:\'DM Mono\',monospace;background:var(--bg);" onchange="saveCashField('${a.id}','amount',this.value)" step="1">
        </div>
      </td>
      <td style="text-align:right;padding:.5rem .75rem;font-family:'DM Mono',monospace;font-size:.85rem;${isUSD ? 'color:var(--dim);' : ''}">
        ${isUSD ? '₪' + n(ilsVal) + ' <span style="font-size:.6rem;color:var(--dim);">@ ' + (state.usdRate || 3.13).toFixed(2) + '</span>' : ''}
      </td>
      <td style="padding:.5rem .75rem;">
        <input type="text" value="${a.notes || ''}" placeholder="notes..." style="border:none;background:none;font-size:.75rem;color:var(--dim);width:100%;font-family:inherit;" onchange="saveCashField('${a.id}','notes',this.value)">
      </td>
      <td style="padding:.5rem .25rem;text-align:center;">
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
      <div class="year-sum-card"><div class="year-sum-label">Owed to You</div><div class="year-sum-val">₪${n(totalOwed)}</div></div>
      <div class="year-sum-card"><div class="year-sum-label">Invest Threshold</div><div class="year-sum-val">₪${n(INVEST_THRESHOLD)}</div></div>
      <div class="year-sum-card"><div class="year-sum-label">${investable >= 0 ? 'Investable' : 'Below Threshold'}</div><div class="year-sum-val" style="color:${investable >= 0 ? 'var(--green)' : 'var(--red)'};">${investable >= 0 ? '₪' + n(investable) : '-₪' + n(Math.abs(investable))}</div></div>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem;">
      <div style="padding:.6rem .75rem;background:var(--gsoft);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);">💰 Holdings</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Account</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Amount</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">ILS</th>
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Notes</th>
          <th style="width:30px;"></th>
        </tr></thead>
        <tbody>${holdingsRows}
          <tr style="border-top:2px solid var(--border);font-weight:700;">
            <td style="padding:.5rem .75rem;">Total Holdings</td>
            <td colspan="2" style="text-align:right;padding:.5rem .75rem;font-family:'DM Mono',monospace;">₪${n(totalHoldings)}</td>
            <td colspan="2"></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem;">
      <div style="padding:.6rem .75rem;background:var(--gsoft);font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);">📥 Owed to You</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid var(--border);">
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Source</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Amount</th>
          <th style="text-align:right;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">ILS</th>
          <th style="text-align:left;padding:.4rem .75rem;font-size:.65rem;color:var(--dim);text-transform:uppercase;">Notes</th>
          <th style="width:30px;"></th>
        </tr></thead>
        <tbody>${owedRows}
          <tr style="border-top:2px solid var(--border);font-weight:700;">
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
      USD rate: $1 = ₪${(state.usdRate || 3.13).toFixed(4)} (live) &nbsp;·&nbsp; Invest threshold: ₪${n(INVEST_THRESHOLD)} &nbsp;·&nbsp; Updated on load
    </div>
  </div>`;
}

function snToggle(gid) {
  var rows = document.querySelectorAll('.' + gid);
  var hdr = document.getElementById(gid + '-hdr');
  var chev = hdr && hdr.querySelector('.sn-chev');
  var isCollapsed = rows[0] && rows[0].classList.contains('collapsed');
  rows.forEach(function (r) {
    r.classList.toggle('collapsed');
  });
  if (chev) chev.textContent = isCollapsed ? '▼' : '▶';
}

function yrToggle(grp) {
  var rows = document.querySelectorAll('.yr-grp-' + grp);
  var hdr = document.getElementById('yr-hdr-' + grp);
  var chev = hdr && hdr.querySelector('.sn-chev');
  var isCollapsed = rows[0] && rows[0].classList.contains('collapsed');
  rows.forEach(function (r) {
    r.classList.toggle('collapsed');
  });
  if (chev) chev.textContent = isCollapsed ? '▼' : '▶';
}
function yrCollapseAll() {
  document.querySelectorAll('[class*="yr-grp-"]').forEach(function (r) {
    r.classList.add('collapsed');
  });
  document.querySelectorAll('[id^="yr-hdr-"]').forEach(function (h) {
    var c = h.querySelector('.sn-chev');
    if (c) c.textContent = '▶';
  });
}
function yrExpandAll() {
  document.querySelectorAll('[class*="yr-grp-"]').forEach(function (r) {
    r.classList.remove('collapsed');
  });
  document.querySelectorAll('[id^="yr-hdr-"]').forEach(function (h) {
    var c = h.querySelector('.sn-chev');
    if (c) c.textContent = '▼';
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
  if (!state.admin.items.length) await loadAdminData();
  state.yearData = {
    txns: txRes.data || [],
    budgetItems: biRes.data || [],
    allBudgets: budgetRes.data || [],
    incomeItems: incItemsRes.data || [],
  };
}

function renderYearSnapshot() {
  if (!state.yearData)
    return '<div style="text-align:center;padding:3rem;color:var(--dim)">Loading...</div>';
  const { txns, budgetItems, allBudgets, incomeItems } = state.yearData;
  const months = [...state.months].sort((a, b) => a.month_num - b.month_num);
  const todayMonth = new Date().getMonth() + 1;
  const showProjected = localStorage.getItem('yearViewMode') !== 'actual';
  const LEISURE = ['takeout', 'eatingout', 'entertainment', 'retail', 'holiday', 'gifts'];

  const txSum = (mid, cats) =>
    txns
      .filter((t) => t.month_id === mid && cats.includes(t.category))
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const biSum = (mid, cats) =>
    budgetItems
      .filter((b) => b.month_id === mid && cats.includes(b.category))
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);

  // Budget lookup from budgets table: { month_id: { category: amount } }
  const budgetMap = {};
  (allBudgets || []).forEach((b) => {
    if (!budgetMap[b.month_id]) budgetMap[b.month_id] = {};
    budgetMap[b.month_id][b.category] = b.amount;
  });
  const budgetV = (mid, cats) => cats.reduce((s, cat) => s + (budgetMap[mid]?.[cat] || 0), 0);

  // Income items grouped by month
  const incItemsByMonth = {};
  (incomeItems || []).forEach((i) => {
    if (!incItemsByMonth[i.month_id]) incItemsByMonth[i.month_id] = [];
    incItemsByMonth[i.month_id].push(i);
  });
  // Collect unique custom income source labels across all months
  const customIncLabels = [];
  const seenLabels = new Set();
  (incomeItems || []).forEach((i) => {
    const lbl = (i.label || 'Other').trim();
    if (!seenLabels.has(lbl)) {
      seenLabels.add(lbl);
      customIncLabels.push(lbl);
    }
  });
  const incItemsFor = (mid, label) =>
    (incItemsByMonth[mid] || [])
      .filter((i) => (i.label || 'Other').trim() === label)
      .reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const incItemsTotalFor = (mid) =>
    (incItemsByMonth[mid] || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const spendV = (m, cats, future) => {
    if (future && !showProjected) return 0;
    if (future) return budgetV(m.id, cats) || biSum(m.id, cats);
    return txSum(m.id, cats);
  };
  const charityV = (mn, future) => {
    if (!showProjected && future) return 0;
    const m = months.find((mo) => mo.month_num === mn);
    return m ? budgetMap[m.id]?.['charity'] || 0 : 0;
  };
  const adminV = (mn, future) =>
    !showProjected && future ? 0 : Number(state.admin.allocations?.[mn]?.amount || 0);
  const travelV = (mn, future) => {
    if (!showProjected && future) return 0;
    const m = months.find((mo) => mo.month_num === mn);
    return m ? budgetMap[m.id]?.['travel'] || 0 : 0;
  };
  // Income includes fixed fields + custom income items (no income_other — replaced by income_items)
  const incFor = (m) =>
    (Number(m.income_petachya) || 0) +
    (Number(m.income_clalit) || 0) +
    (Number(m.income_private) || 0) +
    (Number(m.income_other) || 0) +
    incItemsTotalFor(m.id);

  const fmtY = (n) => (!n ? '\u2014' : '\u20aa' + Math.round(n).toLocaleString('en-US'));
  const fmtPct = (n) => (n ? Math.round(n * 100) + '%' : '');

  // Helper: budget item total for a month (mirrors catBudget logic but for year data)
  const yearBiTotal = (mid, catKey) => {
    const items = budgetItems.filter((b) => b.month_id === mid && b.category === catKey);
    return items.length ? items.reduce((s, b) => s + (Number(b.amount) || 0), 0) : null;
  };
  const yearCatBudget = (mid, catKey) => {
    const catDef = CATEGORIES.find((c) => c.key === catKey);
    if (catDef && catDef.linkedLine) {
      const parentItems = budgetItems.filter(
        (b) => b.month_id === mid && b.category === catDef.linkedLine.parent,
      );
      const linked = parentItems.find(
        (i) => (i.label || '').toLowerCase() === catDef.linkedLine.label.toLowerCase(),
      );
      if (linked) return Number(linked.amount) || 0;
    }
    const fromItems = yearBiTotal(mid, catKey);
    return fromItems !== null ? fromItems : budgetMap[mid]?.[catKey] || 0;
  };

  // Total budgeted for a month (all categories + savings)
  // Skip linkedLine categories (household) — already counted inside their parent (housing)
  const totalBudgetedFor = (m) => {
    return (
      CATEGORIES.filter((c) => !c.linkedLine).reduce(
        (sum, c) => sum + yearCatBudget(m.id, c.key),
        0,
      ) +
      (budgetMap[m.id]?.['savings_bank'] || 0) +
      (budgetMap[m.id]?.['savings_invested'] || 0)
    );
  };

  // Total spent for a month — mirrors ribbon's spentByCategory() exactly
  // For ALL months: actual transactions, with committed items (housing/recurring) as floor
  // Tab categories (charity/travel/admin) always count their budget allocation
  // Skip linkedLine categories (household) — already counted inside their parent (housing)
  // Savings always count as spent
  const totalSpentFor = (m, future) => {
    return (
      CATEGORIES.filter((c) => !c.linkedLine).reduce((sum, c) => {
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
    { type: 'sub', label: '\u2937 Petachya', valFn: (m) => Number(m.income_petachya) || 0 },
    { type: 'sub', label: '\u2937 Clalit', valFn: (m) => Number(m.income_clalit) || 0 },
    { type: 'sub', label: '\u2937 Private', valFn: (m) => Number(m.income_private) || 0 },
  ];
  // Add a row for income_other if any month has it
  if (months.some((m) => Number(m.income_other) > 0)) {
    incomeSubRows.push({
      type: 'sub',
      label: '\u2937 Other',
      valFn: (m) => Number(m.income_other) || 0,
    });
  }
  // Add a row for each custom income source label
  customIncLabels.forEach((lbl) => {
    incomeSubRows.push({
      type: 'sub',
      label: '\u2937 ' + lbl,
      valFn: (m) => incItemsFor(m.id, lbl),
    });
  });

  // Housing: sum all housing budget_items (rent, arnona, etc.)
  // Household is already included as a budget_item inside housing, so use max(budget_item, actual_tx) to avoid double-count
  const housingV = (m, f) => {
    const housingBiExclHH = budgetItems
      .filter(
        (b) => b.month_id === m.id && b.category === 'housing' && b.subcategory !== 'household',
      )
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const hhBudgetItem = budgetItems
      .filter(
        (b) => b.month_id === m.id && b.category === 'housing' && b.subcategory === 'household',
      )
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const hhActual = txSum(m.id, ['household']);
    return housingBiExclHH + Math.max(hhBudgetItem, hhActual);
  };
  // Recurring: sum all recurring budget_items
  const recurringV = (m) =>
    budgetItems
      .filter((b) => b.month_id === m.id && b.category === 'recurring')
      .reduce((s, b) => s + (Number(b.amount) || 0), 0);

  // Travel/Admin: budget vs spent gap
  const travelBudgetV = (mn) => {
    const m = months.find((mo) => mo.month_num === mn);
    return m ? budgetMap[m.id]?.['travel'] || 0 : 0;
  };
  const travelSpentV = (mn) => {
    const m = months.find((mo) => mo.month_num === mn);
    if (!m) return 0;
    return txns
      .filter((t) => t.month_id === m.id && t.category === 'travel')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
  };
  const adminBudgetV = (mn) => Number(state.admin.allocations?.[mn]?.amount || 0);
  const adminSpentV = (mn) => {
    const items = (state.admin.items || []).filter((i) => i.month_num === mn);
    return items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  };

  const ROWS = [
    // 1. Income
    { type: 'section', label: '\u{1F4C8} Income', collapsible: 'income' },
    {
      type: 'row',
      bold: true,
      label: 'Total Income',
      valFn: (m) => incFor(m),
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
      valFn: (m, f) => totalBudgetedFor(m),
      sectionGroup: 'overview',
    },
    {
      type: 'row',
      bold: true,
      label: 'Total Spent',
      valFn: (m, f) => totalSpentFor(m, f),
      sectionGroup: 'overview',
    },
    {
      type: 'net',
      label: '\u{1F4B0} Unbudgeted',
      valFn: (m, f) => incFor(m) - totalBudgetedFor(m),
      sectionGroup: 'overview',
    },
    {
      type: 'net',
      label: '\u2705 Remaining',
      valFn: (m, f) => incFor(m) - totalSpentFor(m, f),
      sectionGroup: 'overview',
    },
    // 3. Savings & Investment
    { type: 'section', label: '\u{1F4B0} Savings & Investment', collapsible: 'savings' },
    {
      type: 'row',
      bold: true,
      label: 'Total Savings',
      valFn: (m, f) =>
        !showProjected && f ? 0 : (budgetMap[m.id]?.['savings_bank'] || 0) + (budgetMap[m.id]?.['savings_invested'] || 0),
      sectionGroup: 'savings',
      stickyInSection: true,
    },
    {
      type: 'sub',
      label: '\u2937 Saved (Bank)',
      valFn: (m, f) => (!showProjected && f ? 0 : budgetMap[m.id]?.['savings_bank'] || 0),
      sectionGroup: 'savings',
    },
    {
      type: 'sub',
      label: '\u2937 Invested',
      valFn: (m, f) => (!showProjected && f ? 0 : budgetMap[m.id]?.['savings_invested'] || 0),
      sectionGroup: 'savings',
    },
    // 5. Charity Overview
    { type: 'section', label: '\u{1F49A} Charity Overview', collapsible: 'charity' },
    {
      type: 'row',
      label: 'Charity ₪',
      valFn: (m, f) => charityV(m.month_num, f),
      sectionGroup: 'charity',
    },
    { type: 'sub', label: 'Charity % of Income', special: 'charityPct', sectionGroup: 'charity' },
    // 6. Spending (detail, at bottom)
    { type: 'section', label: '\u{1F4CA} Spending Breakdown', collapsible: 'spending' },
    {
      type: 'row',
      label: '\u{1F6D2} Groceries',
      valFn: (m, f) => spendV(m, ['groceries'], f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F3E0} Housing',
      valFn: (m, f) => housingV(m, f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F697} Transport',
      valFn: (m, f) => spendV(m, ['transport'], f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F3E5} Health & Therapy',
      valFn: (m, f) => spendV(m, ['health', 'therapy'], f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F504} Recurring',
      valFn: (m) => recurringV(m),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F389} Leisure',
      valFn: (m, f) => spendV(m, LEISURE, f),
      expandable: 'leisure',
      sectionGroup: 'spending',
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Take Out',
      valFn: (m, f) => spendV(m, ['takeout'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Eating Out',
      valFn: (m, f) => spendV(m, ['eatingout'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Entertainment',
      valFn: (m, f) => spendV(m, ['entertainment'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Retail & Shopping',
      valFn: (m, f) => spendV(m, ['retail'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Holiday',
      valFn: (m, f) => spendV(m, ['holiday'], f),
    },
    {
      type: 'sub',
      group: 'leisure',
      label: '\u2937 Gifts',
      valFn: (m, f) => spendV(m, ['gifts'], f),
    },
    {
      type: 'row',
      label: '\u{1F49A} Charity',
      valFn: (m, f) => charityV(m.month_num, f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u2708\uFE0F Travel',
      valFn: (m, f) => travelV(m.month_num, f),
      sectionGroup: 'spending',
    },
    {
      type: 'row',
      label: '\u{1F4CB} Admin',
      valFn: (m, f) => adminV(m.month_num, f),
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
    const values = months.map((m) => row.valFn(m, m.month_num > todayMonth) || 0);
    const total = values.reduce((s, v) => s + v, 0);
    return { row, values, total, avg: total / 12 };
  });

  const totalAnnInc = months.reduce((s, m) => s + incFor(m), 0);
  const pastMs = months.filter((m) => m.month_num <= todayMonth);
  const ytdIncome = pastMs.reduce((s, m) => s + incFor(m), 0);
  const ytdSavings = pastMs.reduce((s, m) => s + (budgetMap[m.id]?.['savings_bank'] || 0), 0);
  const projSavings = months.reduce((s, m) => s + (budgetMap[m.id]?.['savings_bank'] || 0), 0);

  // Travel & Admin: projected budget from items, allocated from monthly allocations, gap = budget - allocated
  const totalTravelProjected = (state.travel.items || []).reduce(
    (s, i) => s + (Number(i.projected_amount) || 0),
    0,
  );
  const totalTravelAlloc = Object.values(state.travel.allocations || {}).reduce(
    (s, a) => s + (Number(a.amount) || 0),
    0,
  );
  const travelGap = totalTravelProjected - totalTravelAlloc;
  const totalAdminProjected = (state.admin.items || []).reduce(
    (s, i) => s + (Number(i.projected_amount) || 0),
    0,
  );
  const totalAdminAlloc = Object.values(state.admin.allocations || {}).reduce(
    (s, a) => s + (Number(a.amount) || 0),
    0,
  );
  const adminGap = totalAdminProjected - totalAdminAlloc;

  // Format: always show ₪0 instead of dashes
  const fmtYZ = (n) => '\u20aa' + Math.round(n || 0).toLocaleString('en-US');

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
    '<span class="yr-stat">💰 Saved <strong style="color:var(--green)">' +
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
          m.month_name.slice(0, 3) +
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
        values = item.values,
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
        return (
          '<tr class="year-row-section"' +
          clickAttr +
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
          .map(function (m, i) {
            const v = values[i];
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
        return (
          '<tr class="' +
          rowCls +
          '"><td class="year-col-label">' +
          row.label +
          '</td>' +
          cells +
          '<td class="year-cell-extra">' +
          totalPctStr +
          '</td><td class="year-cell-avg">\u2014</td><td class="year-cell-pct"></td></tr>'
        );
      }

      const cells = months
        .map(function (m, i) {
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
      return (
        '<tr class="' +
        rowCls +
        '"' +
        expandAttr +
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
    '<button onclick="yrCollapseAll()" style="font-size:.72rem;padding:.25rem .65rem;border-radius:20px;border:1px solid var(--border);background:none;color:var(--dim);cursor:pointer;font-family:\'DM Sans\',sans-serif;">⊟ Collapse All</button>' +
    '<button onclick="yrExpandAll()" style="font-size:.72rem;padding:.25rem .65rem;border-radius:20px;border:1px solid var(--border);background:none;color:var(--dim);cursor:pointer;font-family:\'DM Sans\',sans-serif;">⊞ Expand All</button>' +
    '</div>';
  return (
    '<div class="year-tab-wrap">' +
    toggleHtml +
    summaryHtml +
    '<div class="year-table-wrap"><table class="year-table">' +
    thead +
    '<tbody>' +
    tbody +
    '</tbody></table></div><div style="margin-top:.6rem;font-size:.62rem;color:var(--dim);text-align:center;">\u25C9 = current month &nbsp;|&nbsp; italics = projected</div></div>'
  );
}

function openSnapshot() {
  const current = state.months.find((m) => m.id === state.currentMonthId);
  if (!current) return;
  const income = totalIncome(current);
  const spent = spentByCategory();
  // Match ribbon logic: for hasTab categories (charity/travel/admin), count budget allocation as "spent"
  // Skip linkedLine categories (household) — already counted inside their parent (housing)
  // Also include savings as "spent" (money allocated out of income)
  const totalSpent =
    CATEGORIES.filter((c) => !c.linkedLine).reduce(
      (sum, c) => sum + (c.hasTab ? catBudget(c.key) || 0 : spent[c.key] || 0),
      0,
    ) +
    (state.budgets['savings_bank'] || 0) +
    (state.budgets['savings_invested'] || 0);
  const totalBudgeted =
    CATEGORIES.filter((c) => !c.linkedLine).reduce((sum, c) => sum + catBudget(c.key), 0) +
    (state.budgets['savings_bank'] || 0) +
    (state.budgets['savings_invested'] || 0);
  const leftToBudget = income - totalBudgeted;
  const remainingInBudget = totalBudgeted - totalSpent;

  const n = (v) =>
    v == null || v === ''
      ? ''
      : Number(v).toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const groupRows = CATEGORY_GROUPS.map((group) => {
    const cats = group.keys.map((k) => CATEGORIES.find((c) => c.key === k)).filter(Boolean);
    const gs = cats.reduce((sum, c) => sum + (spent[c.key] || 0), 0);
    const gb = cats.reduce((sum, c) => sum + catBudget(c.key), 0);
    const gr = gb - gs;
    const gid = 'sngrp-' + group.label.replace(/[^a-zA-Z0-9]/g, '-');
    const catRows = cats
      .map((c) => {
        const b = catBudget(c.key) || 0;
        const s = c.hasTab ? b : spent[c.key] || 0;
        const r = b - s;
        return `<tr class="sn-cat ${gid} collapsed">
        <td style="padding-left:1.5rem">${c.emoji} ${c.label}</td>
        <td>${b ? n(b) : ''}</td>
        <td>${b ? n(s) : ''}</td>
        <td class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td>
      </tr>`;
      })
      .join('');
    if (cats.length === 1) {
      const c = cats[0];
      const b = catBudget(c.key) || 0;
      const s = c.hasTab ? b : spent[c.key] || 0;
      const r = b - s;
      return `<tr class="sn-cat"><td>${c.emoji} ${c.label}</td><td>${b ? n(b) : ''}</td><td>${b ? n(s) : ''}</td><td class="${r < 0 ? 'sn-over' : r > 0 ? 'sn-ok' : ''}">${b ? n(r) : ''}</td></tr>`;
    }
    return `<tr class="sn-group" id="${gid}-hdr" onclick="snToggle('${gid}')">
        <td><span class="sn-chev" style="font-size:.65rem;margin-right:.4rem;color:var(--muted)">▶</span>${group.emoji} ${group.label}</td>
        <td>${gb ? n(gb) : ''}</td>
        <td>${n(gs)}</td>
        <td class="${gr < 0 ? 'sn-over' : gr > 0 ? 'sn-ok' : ''}">${gb ? n(gr) : ''}</td>
      </tr>${catRows}`;
  }).join('');

  document.getElementById('snapshot-modal').style.display = 'flex';
  document.getElementById('snapshot-body').innerHTML = `
    <table class="sn-table">
      <thead><tr><th>Category</th><th>Budget ₪</th><th>Spent ₪</th><th>Remaining ₪</th></tr></thead>
      <tbody>
        <tr class="sn-section"><td colspan="4">📊 Summary — ${current.month_name}</td></tr>
        <tr class="sn-cat"><td>Income</td><td></td><td>${n(income)}</td><td></td></tr>
        <tr class="sn-cat"><td>Spent</td><td></td><td>${n(totalSpent)}</td><td></td></tr>
        <tr class="sn-cat"><td>Remaining</td><td></td><td></td><td class="${income - totalSpent >= 0 ? 'sn-ok' : 'sn-over'}">${n(income - totalSpent)}</td></tr>
        <tr class="sn-group"><td>🏦 Savings</td><td>${n((state.budgets['savings_bank'] || 0) + (state.budgets['savings_invested'] || 0))}</td><td>${n((state.budgets['savings_bank'] || 0) + (state.budgets['savings_invested'] || 0))}</td><td>0</td></tr>
        <tr class="sn-cat"><td>🏦 In Bank</td><td>${n(state.budgets['savings_bank'] || 0)}</td><td>${n(state.budgets['savings_bank'] || 0)}</td><td>0</td></tr>
        <tr class="sn-cat"><td>📈 Invested</td><td>${n(state.budgets['savings_invested'] || 0)}</td><td>${n(state.budgets['savings_invested'] || 0)}</td><td>0</td></tr>
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
  if (!state.months.length) {
    state.loading = false;
    return;
  }
  const savedId = localStorage.getItem('activeMonthId');
  const now = new Date();
  const currentMonth =
    (savedId && state.months.find((m) => m.id === savedId)) ||
    state.months.find((m) => m.month_num === now.getMonth() + 1) ||
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
      if (data) state.allStores = data;
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

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    doRedo();
  }
});
init();

// ── History Panel ──────────────────────────────────────────────────────
async function openHistoryPanel() {
  let panel = document.getElementById('history-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'history-panel';
    panel.style.cssText =
      'position:fixed;top:0;right:0;width:360px;max-width:100vw;height:100vh;background:var(--card);border-left:1px solid var(--border);z-index:700;display:flex;flex-direction:column;box-shadow:-4px 0 20px rgba(0,0,0,.2);';
    document.getElementById('root').style.marginRight = '360px';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-bottom:1px solid var(--border);flex-shrink:0;">
        <span style="font-weight:700;font-size:.95rem;">🕐 History Log</span>
        <button onclick="document.getElementById('history-panel').remove();document.getElementById('root').style.marginRight='';" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted);">✕</button>
      </div>
      <div id="history-list" style="flex:1;overflow-y:auto;padding:.5rem 0;">
        <div style="padding:1rem;color:var(--muted);font-size:.82rem;">Loading…</div>
      </div>`;
    document.body.appendChild(panel);
  } else {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    document.getElementById('root').style.marginRight =
      panel.style.display === 'none' ? '' : '360px';
    if (panel.style.display === 'none') return;
  }
  const list = document.getElementById('history-list');
  const { data, error } = await sb
    .from('change_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) {
    list.innerHTML = `<div style="padding:1rem;color:#ef4444;font-size:.82rem;">Could not load history. Make sure the change_log table exists in Supabase.</div>`;
    return;
  }
  if (data.length === 0) {
    list.innerHTML = `<div style="padding:1rem;color:var(--muted);font-size:.82rem;">No history yet — changes will appear here as you use the app.</div>`;
    return;
  }
  const colors = { add: '#22c55e', delete: '#ef4444', edit: '#f59e0b' };
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('en-IL', { weekday: 'short', day: 'numeric', month: 'short' }) +
      ', ' +
      d.toLocaleTimeString('en-IL', { hour: '2-digit', minute: '2-digit' })
    );
  };
  list.innerHTML = data
    .map((r) => {
      const isTransaction = r.entity_type === 'transaction' && r.action !== 'delete' && r.entity_id;
      const clickAttr = isTransaction
        ? `onclick="jumpToTransaction('${r.entity_id}')" style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;cursor:pointer;transition:background .15s;" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"`
        : `style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;"`;
      return `<div ${clickAttr}>
      <span style="width:8px;height:8px;border-radius:50%;background:${colors[r.action] || '#94a3b8'};flex-shrink:0;margin-top:.35rem;"></span>
      <div style="min-width:0;">
        <div style="font-size:.82rem;color:var(--text);word-break:break-word;">${r.description}${isTransaction ? ' ↗' : ''}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:.15rem;">${fmtDate(r.created_at)}</div>
      </div>
    </div>`;
    })
    .join('');
}

// Auto-refresh history if panel is open
async function refreshHistoryIfOpen() {
  const panel = document.getElementById('history-panel');
  if (panel && panel.style.display !== 'none') {
    const list = document.getElementById('history-list');
    if (!list) return;
    const { data } = await sb
      .from('change_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (!data) return;
    const colors = { add: '#22c55e', delete: '#ef4444', edit: '#f59e0b' };
    const fmtDate = (iso) => {
      const d = new Date(iso);
      return (
        d.toLocaleDateString('en-IL', { weekday: 'short', day: 'numeric', month: 'short' }) +
        ', ' +
        d.toLocaleTimeString('en-IL', { hour: '2-digit', minute: '2-digit' })
      );
    };
    list.innerHTML = data
      .map((r) => {
        const isTransaction =
          r.entity_type === 'transaction' && r.action !== 'delete' && r.entity_id;
        const clickAttr = isTransaction
          ? `onclick="jumpToTransaction('${r.entity_id}')" style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;cursor:pointer;transition:background .15s;" onmouseenter="this.style.background='var(--surface2)'" onmouseleave="this.style.background=''"`
          : `style="padding:.5rem 1rem;border-bottom:1px solid var(--border);display:flex;gap:.6rem;align-items:flex-start;"`;
        return `<div ${clickAttr}>
        <span style="width:8px;height:8px;border-radius:50%;background:${colors[r.action] || '#94a3b8'};flex-shrink:0;margin-top:.35rem;"></span>
        <div style="min-width:0;">
          <div style="font-size:.82rem;color:var(--text);word-break:break-word;">${r.description}${isTransaction ? ' ↗' : ''}</div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:.15rem;">${fmtDate(r.created_at)}</div>
        </div>
      </div>`;
      })
      .join('');
  }
}

// Jump to transaction from history
function jumpToTransaction(txId) {
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
    const el = document.querySelector(`[data-tx-id="${txId}"]`);
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
