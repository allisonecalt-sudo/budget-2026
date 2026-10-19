// An invented-data seed variant where EVERY money amount carries agorot (cash accounts, budget
// lines, envelopes, transactions, floors, pots, incomes). A whole-shekel seed hides every
// rounding bug, so the Analyze rounding tests run on this one. Mutates a FakeDb in place.
const RENT_FRACTION = 0.3;
const CENTS = [0.5, 0.67, 0.33, 0.49, 0.51, 0.25, 0.9, 0.12, 0.05, 0.75, 0.44, 0.38];
const MONEY_COLS = {
  months: ['income_petachya', 'income_clalit', 'income_private', 'income_other'],
  budgets: ['amount'],
  transactions: ['amount'],
  budget_items: ['amount'],
  budget_item_templates: ['amount'],
  income_items: ['amount'],
  admin_items: ['projected_amount'],
  admin_sub_items: ['amount'],
  admin_allocations: ['amount'],
  travel_items: ['projected_amount'],
  travel_payments: ['amount'],
  charity_items: ['projected_amount'],
  charity_payments: ['amount'],
  cash_accounts: ['amount'],
  spend_floors: ['amount'],
};
// A seed where EVERY money amount carries agorot (cash accounts, budget lines, envelopes,
// transactions, floors, pots, incomes) - whole-shekel data hides every rounding bug.
function allAgorot(db) {
  let i = 0;
  for (const [t, cols] of Object.entries(MONEY_COLS))
    for (const row of db.table(t))
      for (const c of cols)
        if (typeof row[c] === 'number' && row[c] !== 0)
          row[c] = Math.round((row[c] + CENTS[i++ % CENTS.length]) * 100) / 100;
  // Pin the three cases that went wrong in review so the values can never drift out of reach of
  // them: cash that rounds one way as parts and the other as a sum (₪26,050.5 vs 24,000 + 2,100
  // − 50), and six envelopes whose agorot are each under half but add past it (₪1,391 vs ₪1,392).
  for (const t of db.table('transactions'))
    t.amount = Math.floor(t.amount) + (t.category === 'groceries' ? 0.35 : 0.4);
  const cash = db.table('cash_accounts');
  cash[0].amount = 4000.2;
  cash[1].amount = 20000.2;
  cash[2].amount = 2100.4;
  cash.push({
    id: 'k-card',
    name: 'Card',
    amount: 50.3,
    currency: 'ILS',
    notes: null,
    is_owed: false,
    is_debt: true,
    sort_order: 4,
  });
  // Pin the month card: its true bills + everyday + charity ends in .5 or more, so rounding the
  // base and the trips ON THEIR OWN (7,091 + 2,101 = 9,192) disagrees with the true month (9,191).
  for (const b of db.table('budget_items'))
    if (b.label === 'Rent') b.amount = Math.floor(b.amount) + RENT_FRACTION;
  // Pin October's income at x.45: rounded on its own it is one shekel under what the ribbon's own
  // Unallocated implies, so the 💰 card needs its "agorot, rounded" row (and apportioning the
  // shekel to the income would print it a shekel above the ribbon).
  const octM = db.table('months').find((m) => m.year === 2026 && m.month_num === 10);
  if (octM)
    Object.assign(octM, { income_petachya: 10000.45, income_clalit: 8000, income_private: 3000 });
  // Pin the pots: the "Other" admin kind sums to 120.68 (121) while its two items print 100 + 20,
  // so the kind needs its "agorot, rounded" row - and apportioning that shekel onto Postage would
  // print it 101 here and 100 on the Feb 7 "still to pay" list.
  db.table('admin_items').push({
    id: 'a-stationery',
    year: 2026,
    label: 'Stationery',
    projected_amount: 20.3,
    category: 'Other',
    is_estimate: false,
    is_logged: false,
  });
  // The charity budget follows income x pct: keep the stored row equal to what the app derives.
  for (const m of db.table('months')) {
    const inc = m.income_petachya + m.income_clalit + m.income_private + m.income_other;
    const row = db.table('budgets').find((b) => b.month_id === m.id && b.category === 'charity');
    if (row) row.amount = Math.round(inc * m.charity_pct) / 100;
  }
}

module.exports = { allAgorot };
