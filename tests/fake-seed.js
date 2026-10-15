// Fake budget data for the Playwright suite. Pure invented numbers: nothing in
// here comes from her real database (this repo is public).
//
// The shape follows the live tables (column names checked against the project's
// information_schema). Everything is deterministic so tests can assert exact
// totals. Call makeSeed() for a fresh copy per test.

const YEAR = 2026;
const MONTH_NAMES = [
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

let counter = 0;
function uid(kind) {
  counter += 1;
  const hex = counter.toString(16).padStart(12, '0');
  const k = kind.charCodeAt(0).toString(16).padStart(4, '0');
  return `00000000-${k}-4000-8000-${hex}`;
}

function makeSeed() {
  counter = 0;
  const months = MONTH_NAMES.map((name, i) => ({
    id: uid('m'),
    month_name: name,
    month_num: i + 1,
    year: YEAR,
    income_petachya: 10000,
    income_clalit: 8000,
    income_private: 3000,
    income_other: 0,
    savings_bank: 1000,
    savings_invested: 500,
    charity_pct: 5,
    created_at: '2026-01-01T00:00:00Z',
  }));

  // Next year exists but is empty (nothing earned, nothing complete yet).
  MONTH_NAMES.forEach((name, i) =>
    months.push({
      id: uid('m'),
      month_name: name,
      month_num: i + 1,
      year: YEAR + 1,
      income_petachya: 0,
      income_clalit: 0,
      income_private: 0,
      income_other: 0,
      savings_bank: 0,
      savings_invested: 0,
      charity_pct: 0,
      created_at: '2026-01-01T00:00:00Z',
    }),
  );

  const envelopeBudget = {
    groceries: 1800,
    takeout: 300,
    eatingout: 400,
    entertainment: 200,
    retail: 300,
    transport: 400,
    health: 300,
    therapy: 600,
    housing: 3500,
    household: 300,
    recurring: 800,
    travel: 500,
    admin: 400,
    gifts: 100,
    holiday: 100,
    savings_bank: 1000,
    savings_invested: 500,
  };

  const budgets = [];
  const transactions = [];
  const budgetItems = [];
  const bizMonths = [];
  const stores = ['Shufersal', 'Yochananof', 'Corner Makolet', 'Carrefour'];

  months
    .filter((m) => m.year === YEAR)
    .forEach((m) => {
      // Charity follows income x pct (21000 x 5% = 1050), so the stored row
      // matches what the app derives and a plain load needs no write.
      budgets.push({
        id: uid('b'),
        month_id: m.id,
        category: 'charity',
        amount: 1050,
        created_at: '2026-01-01T00:00:00Z',
      });
      Object.entries(envelopeBudget).forEach(([category, amount]) => {
        budgets.push({
          id: uid('b'),
          month_id: m.id,
          category,
          amount,
          created_at: '2026-01-01T00:00:00Z',
        });
      });
      // Bills as lines
      ['Insurance', 'Internet', 'Water', 'Cloud storage', 'Music'].forEach((label, k) =>
        budgetItems.push({
          id: uid('i'),
          month_id: m.id,
          category: 'recurring',
          label,
          amount: 50 + k * 10,
          sort_order: 4 + k,
        }),
      );
      budgetItems.push(
        {
          id: uid('i'),
          month_id: m.id,
          category: 'housing',
          label: 'Rent',
          amount: 3000,
          sort_order: 1,
        },
        {
          id: uid('i'),
          month_id: m.id,
          category: 'housing',
          label: 'Utilities',
          amount: 500,
          sort_order: 2,
        },
        {
          id: uid('i'),
          month_id: m.id,
          category: 'recurring',
          label: 'Phone',
          amount: 200,
          sort_order: 1,
        },
        {
          id: uid('i'),
          month_id: m.id,
          category: 'recurring',
          label: 'Gym',
          amount: 300,
          sort_order: 2,
        },
        {
          id: uid('i'),
          month_id: m.id,
          category: 'recurring',
          label: 'Streaming',
          amount: 300,
          sort_order: 3,
        },
      );
      // Spending for the months up to October (some months have more)
      if (m.month_num <= 10) {
        const n = 4 + (m.month_num % 3);
        for (let k = 0; k < n; k++) {
          transactions.push({
            id: uid('t'),
            month_id: m.id,
            category: 'groceries',
            store: stores[k % stores.length],
            item: 'Weekly shop',
            amount: 150 + k * 25 + m.month_num,
            date: `2026-${String(m.month_num).padStart(2, '0')}-${String(3 + k * 6).padStart(2, '0')}`,
            created_at: `2026-${String(m.month_num).padStart(2, '0')}-${String(3 + k * 6).padStart(2, '0')}T10:00:00Z`,
          });
        }
        ['takeout', 'eatingout', 'transport', 'health', 'household'].forEach((category, k) => {
          transactions.push({
            id: uid('t'),
            month_id: m.id,
            category,
            store: category === 'takeout' ? 'Pizza Corner' : null,
            item: 'Test ' + category,
            amount: 40 + k * 15,
            date: `2026-${String(m.month_num).padStart(2, '0')}-${String(10 + k).padStart(2, '0')}`,
            created_at: `2026-${String(m.month_num).padStart(2, '0')}-${String(10 + k).padStart(2, '0')}T12:00:00Z`,
          });
        });
      }
      bizMonths.push({
        id: uid('z'),
        month_id: m.id,
        accountant_fee: 200,
        spending: 0,
        confirmed_amount: 3200,
        created_at: '2026-01-01T00:00:00Z',
      });
    });

  const templates = [
    { id: uid('p'), category: 'housing', label: 'Rent', amount: 3000, sort_order: 1 },
    { id: uid('p'), category: 'housing', label: 'Utilities', amount: 500, sort_order: 2 },
    { id: uid('p'), category: 'recurring', label: 'Phone', amount: 200, sort_order: 1 },
    { id: uid('p'), category: 'recurring', label: 'Gym', amount: 300, sort_order: 2 },
    { id: uid('p'), category: 'recurring', label: 'Streaming', amount: 300, sort_order: 3 },
  ];

  // Admin / Travel / Charity year-level sections
  const adminItems = [
    {
      id: uid('a'),
      year: YEAR,
      label: 'Licence renewal',
      projected_amount: 600,
      category: 'Professional',
      is_estimate: false,
      is_logged: true,
    },
    {
      id: uid('a'),
      year: YEAR,
      label: 'Course fees',
      projected_amount: 1200,
      category: 'Professional',
      is_estimate: true,
      is_logged: false,
    },
    {
      id: uid('a'),
      year: YEAR,
      label: 'Postage',
      projected_amount: 100,
      category: 'Other',
      is_estimate: false,
      is_logged: true,
    },
  ];
  const adminSub = [
    {
      id: uid('s'),
      item_id: adminItems[0].id,
      label: 'Fee',
      amount: 600,
      is_paid: true,
      month_num: 3,
      is_estimate: false,
    },
  ];
  const adminAlloc = months.map((m) => ({
    id: uid('l'),
    year: YEAR,
    month_num: m.month_num,
    amount: 400,
  }));
  const travelItems = [
    {
      id: uid('v'),
      year: YEAR,
      label: 'Summer trip',
      projected_amount: 3000,
      is_estimate: true,
      is_logged: false,
      categories: null,
    },
  ];
  const travelPayments = [
    {
      id: uid('y'),
      year: YEAR,
      month_num: 5,
      label: 'Flights',
      destination: 'Somewhere',
      amount: 1200,
      is_estimate: false,
      category: 'Flights',
      payment_date: '2026-05-10',
    },
  ];
  const charityItems = [
    {
      id: uid('c'),
      year: YEAR,
      label: 'Yearly giving',
      projected_amount: 6000,
      is_estimate: false,
      is_logged: true,
    },
  ];
  const charityPayments = [
    {
      id: uid('d'),
      year: YEAR,
      month_num: 2,
      label: 'Local fund',
      amount: 300,
      payment_date: '2026-02-12',
      has_receipt: true,
      is_given: true,
      is_estimate: false,
    },
  ];

  const cashAccounts = [
    {
      id: uid('k'),
      name: 'Everyday account',
      amount: 4000,
      currency: 'ILS',
      notes: null,
      is_owed: false,
      is_debt: false,
      sort_order: 1,
    },
    {
      id: uid('k'),
      name: 'Savings account',
      amount: 20000,
      currency: 'ILS',
      notes: null,
      is_owed: false,
      is_debt: false,
      sort_order: 2,
    },
  ];

  const floors = ['groceries', 'transport', 'health', 'therapy', 'household'].map((category) => ({
    id: uid('f'),
    year: YEAR,
    category,
    amount: 250,
    notes: null,
    avg_n: 3,
    excluded_months: [],
  }));

  const changeLog = [
    {
      id: uid('g'),
      created_at: '2026-03-01T09:00:00Z',
      action: 'edit',
      entity_type: 'budget_amount',
      entity_id: null,
      description: 'Budget changed: groceries ₪1700 → ₪1800',
      old_value: '{"amount":1700}',
      new_value: '{"amount":1800}',
      month_id: months[2].id,
    },
  ];

  return {
    months,
    budgets,
    transactions,
    budget_items: budgetItems,
    budget_item_templates: templates,
    income_items: [],
    biz_months: bizMonths,
    admin_items: adminItems,
    admin_sub_items: adminSub,
    admin_allocations: adminAlloc,
    admin_credits: [],
    travel_items: travelItems,
    travel_sub_items: [],
    travel_payments: travelPayments,
    charity_items: charityItems,
    charity_sub_items: [],
    charity_payments: charityPayments,
    cash_accounts: cashAccounts,
    spend_floors: floors,
    change_log: changeLog,
  };
}

module.exports = { makeSeed, YEAR };
