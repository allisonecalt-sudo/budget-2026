// Regression tests for "the date decides the month" (v28).
//
// Travel / Charity / Admin are YEARLY ledgers. Before v28 a payment logged from
// the phone quick-add was filed under whatever month the app happened to be
// showing, and the Admin sheet had no date field at all. Her words:
// "admin trvel charity the month isnt sent by overlal month but by what i select".
//
// IMPORTANT: like money-in.spec.js, this spec NEVER writes to Supabase. It only
// calls pure window helpers and reads the quick-add sheet's HTML string.
const { test, expect } = require('@playwright/test');

async function loadHelpers(page) {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      typeof window.monthNumFromDate === 'function' &&
      typeof window.yearFromDate === 'function' &&
      typeof window.quickAddSheetBody === 'function',
    { timeout: 20000 }
  );
}

test.describe('date → month derivation', () => {
  test('monthNumFromDate: the picked date wins over the fallback month', async ({ page }) => {
    await loadHelpers(page);
    const r = await page.evaluate(() => ({
      august: window.monthNumFromDate('2026-08-03', 7),
      january: window.monthNumFromDate('2026-01-31', 7),
      december: window.monthNumFromDate('2026-12-01', 7),
      // Blank / missing date → fall back to the month picker or today.
      blank: window.monthNumFromDate('', 7),
      nul: window.monthNumFromDate(null, 7),
      undef: window.monthNumFromDate(undefined, 7),
      // Junk must not produce month 0 or NaN — fall back instead.
      junk: window.monthNumFromDate('not-a-date', 7),
      outOfRange: window.monthNumFromDate('2026-13-01', 7),
    }));
    expect(r.august).toBe(8);
    expect(r.january).toBe(1);
    expect(r.december).toBe(12);
    expect(r.blank).toBe(7);
    expect(r.nul).toBe(7);
    expect(r.undef).toBe(7);
    expect(r.junk).toBe(7);
    expect(r.outOfRange).toBe(7);
  });

  test('yearFromDate: a cross-year date carries its own year', async ({ page }) => {
    await loadHelpers(page);
    const r = await page.evaluate(() => ({
      lastYear: window.yearFromDate('2025-12-15', 2026),
      thisYear: window.yearFromDate('2026-07-23', 2026),
      blank: window.yearFromDate('', 2026),
      junk: window.yearFromDate('nope', 2026),
    }));
    expect(r.lastYear).toBe(2025);
    expect(r.thisYear).toBe(2026);
    expect(r.blank).toBe(2026);
    expect(r.junk).toBe(2026);
  });

  test('landedToast names the month, and the year when it is not the current one', async ({
    page,
  }) => {
    await loadHelpers(page);
    const r = await page.evaluate(() => {
      const yr = window.state.currentYear;
      return {
        sameYear: window.landedToast(8, yr),
        otherYear: window.landedToast(12, yr - 1),
        currentYear: yr,
      };
    });
    expect(r.sameYear).toContain('Aug');
    expect(r.sameYear).not.toContain(String(r.currentYear));
    expect(r.otherYear).toContain('Dec');
    expect(r.otherYear).toContain(String(r.currentYear - 1));
  });
});

test.describe('phone quick-add sheet', () => {
  test('travel, charity AND admin all offer a date picker', async ({ page }) => {
    await loadHelpers(page);
    const r = await page.evaluate(() => ({
      travel: window.quickAddSheetBody('travel'),
      charity: window.quickAddSheetBody('charity'),
      admin: window.quickAddSheetBody('admin'),
    }));
    // Admin had NO date field before v28 — this is the regression guard.
    for (const kind of ['travel', 'charity', 'admin']) {
      expect(r[kind]).toContain('id="qa-date"');
      expect(r[kind]).toContain('type="date"');
      expect(r[kind]).toContain('The date sets the month');
    }
  });
});
