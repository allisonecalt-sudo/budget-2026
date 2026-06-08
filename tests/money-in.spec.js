// Unit tests for the "Money In" / admin_credits PURE helpers.
//
// These exercise creditOccurrences / creditTotal / creditsForCategory /
// creditsTotal — all pure logic, no Supabase writes. The helpers are exposed on
// window by app.ts's Object.assign(window, {...}) block, which runs at module
// load *before* the login gate, so they're callable even on the login screen.
//
// IMPORTANT: this spec NEVER calls page.fill against prod and NEVER writes to
// Supabase. It only sets window.state.admin.credits to synthetic in-memory rows
// and reads the helper outputs back. Safe to run against the live app.
const { test, expect } = require('@playwright/test');

// Load the app shell so the ES module evaluates and the window helpers register.
// We don't need to be logged in — the helpers are pure functions on window.
async function loadHelpers(page) {
  await page.goto('/');
  // The Object.assign(window, …) export runs synchronously at module load.
  await page.waitForFunction(
    () =>
      typeof window.creditOccurrences === 'function' &&
      typeof window.creditTotal === 'function' &&
      typeof window.creditsForCategory === 'function' &&
      typeof window.creditsTotal === 'function',
    { timeout: 20000 }
  );
}

test.describe('Money In — pure helpers', () => {
  test('creditOccurrences: one-off vs range vs clamping', async ({ page }) => {
    await loadHelpers(page);
    const r = await page.evaluate(() => ({
      // One-off: both bounds null
      noBounds: window.creditOccurrences({ month_start: null, month_end: null }),
      // One-off: only start set
      startOnly: window.creditOccurrences({ month_start: 8, month_end: null }),
      // One-off: only end set
      endOnly: window.creditOccurrences({ month_start: null, month_end: 8 }),
      // One-off: equal bounds
      equal: window.creditOccurrences({ month_start: 5, month_end: 5 }),
      // Range Aug→Dec = 5
      augDec: window.creditOccurrences({ month_start: 8, month_end: 12 }),
      // Range Jan→Dec = 12
      janDec: window.creditOccurrences({ month_start: 1, month_end: 12 }),
      // Reversed bounds collapse to 1 (span <= 1)
      reversed: window.creditOccurrences({ month_start: 12, month_end: 8 }),
      // Out-of-range high bound clamps to 12
      clamped: window.creditOccurrences({ month_start: 1, month_end: 99 }),
      // Missing object fields default to one-off
      empty: window.creditOccurrences({}),
    }));
    expect(r.noBounds).toBe(1);
    expect(r.startOnly).toBe(1);
    expect(r.endOnly).toBe(1);
    expect(r.equal).toBe(1);
    expect(r.augDec).toBe(5);
    expect(r.janDec).toBe(12);
    expect(r.reversed).toBe(1);
    expect(r.clamped).toBe(12);
    expect(r.empty).toBe(1);
  });

  test('creditTotal: amount × occurrences, with seed cases', async ({ page }) => {
    await loadHelpers(page);
    const r = await page.evaluate(() => ({
      // Carmei Gat rent ₪4,850 × Aug→Dec (5) = ₪24,250
      carmeiGat: window.creditTotal({ amount: 4850, month_start: 8, month_end: 12 }),
      // Pikadon ₪60 one-off = ₪60
      pikadon: window.creditTotal({ amount: 60, month_start: null, month_end: null }),
      // Zero amount → 0
      zero: window.creditTotal({ amount: 0, month_start: 1, month_end: 12 }),
      // Null amount → 0
      nullAmt: window.creditTotal({ amount: null, month_start: 8, month_end: 12 }),
      // Fractional agorot stays exact (no float drift): 33.33 × 3 = 99.99
      agorot: window.creditTotal({ amount: 33.33, month_start: 1, month_end: 3 }),
    }));
    expect(r.carmeiGat).toBe(24250);
    expect(r.pikadon).toBe(60);
    expect(r.zero).toBe(0);
    expect(r.nullAmt).toBe(0);
    expect(r.agorot).toBe(99.99);
  });

  test('creditsForCategory + creditsTotal: filters by category and received/expected', async ({
    page,
  }) => {
    await loadHelpers(page);
    const r = await page.evaluate(() => {
      // Snapshot whatever's there, swap in synthetic rows (in-memory ONLY — no
      // DB write), read the helpers, then restore so we leave no trace.
      const prev = window.state.admin.credits;
      window.state.admin.credits = [
        // Apartment, received, range Aug→Dec → 24,250
        {
          id: 'a1',
          category: 'Apartment',
          amount: 4850,
          month_start: 8,
          month_end: 12,
          is_received: true,
          is_estimate: false,
        },
        // Apartment, expected (not received), one-off → 60
        {
          id: 'a2',
          category: 'Apartment',
          amount: 60,
          month_start: null,
          month_end: null,
          is_received: false,
          is_estimate: false,
        },
        // Car, received, one-off → 500
        {
          id: 'c1',
          category: 'Car',
          amount: 500,
          month_start: null,
          month_end: null,
          is_received: true,
          is_estimate: false,
        },
        // Uncategorized (missing category) → treated as 'Other', expected → 100
        {
          id: 'o1',
          amount: 100,
          month_start: null,
          month_end: null,
          is_received: false,
          is_estimate: true,
        },
      ];
      const out = {
        apartmentAll: window.creditsForCategory('Apartment'),
        apartmentReceived: window.creditsForCategory('Apartment', { receivedOnly: true }),
        apartmentExpected: window.creditsForCategory('Apartment', { expectedOnly: true }),
        carAll: window.creditsForCategory('Car'),
        otherAll: window.creditsForCategory('Other'),
        emptyCat: window.creditsForCategory('Health'),
        totalAll: window.creditsTotal(),
        totalReceived: window.creditsTotal({ receivedOnly: true }),
        totalExpected: window.creditsTotal({ expectedOnly: true }),
      };
      window.state.admin.credits = prev; // restore
      return out;
    });
    expect(r.apartmentAll).toBe(24310); // 24,250 + 60
    expect(r.apartmentReceived).toBe(24250);
    expect(r.apartmentExpected).toBe(60);
    expect(r.carAll).toBe(500);
    expect(r.otherAll).toBe(100); // uncategorized defaults to Other
    expect(r.emptyCat).toBe(0);
    expect(r.totalAll).toBe(24910); // 24,250 + 60 + 500 + 100
    expect(r.totalReceived).toBe(24750); // 24,250 + 500
    expect(r.totalExpected).toBe(160); // 60 + 100
  });
});
