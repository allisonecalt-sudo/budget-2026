// What this is: pure unit tests (no browser, no Supabase) for the budget's
//   arithmetic — float-safe summing, spend percentage, category status, and how
//   many times a credit lands.
// Why it exists: this app's entire job is money arithmetic, but until now that
//   arithmetic was only checked indirectly through Playwright tests that drive a
//   real browser against a live Supabase project. Those are slow, need auth, and
//   mostly test rendering. These functions are pure, so they can be pinned here
//   cheaply and exactly.
// What's decided: runs against the COMPILED module (dist/lib/budget-math.js), so
//   `npm run build` must run first. Uses Node's built-in `node:test` — zero deps.
// What's next: `creditsForCategory` is the last piece still in app.ts — it
//   reads module-level state, so moving it means passing that state in.
// Links: lib/budget-math.ts (source), app.ts (consumer), tests/money.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'budget-math.js');

assert.ok(
  existsSync(compiled),
  'dist/lib/budget-math.js is missing — run `npm run build` before the unit tests.',
);

const { ag, pct, status, creditOccurrences, creditTotal, fileToYear } = await import(
  pathToFileURL(compiled).href
);

// ── ag: float drift ───────────────────────────────────────────────────────
test('ag kills binary-float drift at sum boundaries', () => {
  assert.equal(0.1 + 0.2, 0.30000000000000004, 'sanity: raw JS float drift');
  assert.equal(ag(0.1 + 0.2), 0.3);
  assert.equal(ag(1.005 * 100) / 100, 100.5 / 100);
  assert.equal(ag(1234.567), 1234.57);
  assert.equal(ag(-1234.564), -1234.56);
});

test('ag treats junk as zero rather than propagating NaN through a total', () => {
  for (const junk of [null, undefined, '', NaN, 'abc']) {
    assert.equal(ag(junk), 0, `ag(${JSON.stringify(junk)}) must be 0`);
  }
});

// ── pct: progress bars ────────────────────────────────────────────────────
test('pct clamps at 100 so a progress bar can never overflow its track', () => {
  assert.equal(pct(50, 100), 50);
  assert.equal(pct(100, 100), 100);
  assert.equal(pct(250, 100), 100, 'overspending must still cap the bar at 100%');
});

test('pct on a zero or absent budget is 0, never Infinity or NaN', () => {
  assert.equal(pct(500, 0), 0);
  assert.equal(pct(0, 0), 0);
  assert.equal(pct(500, -10), 0);
});

// ── status: the traffic light ─────────────────────────────────────────────
test('status: ok below 85%, warn at/above 85%, over past the budget', () => {
  assert.equal(status(0, 100), 'ok');
  assert.equal(status(84, 100), 'ok');
  assert.equal(status(85, 100), 'warn');
  assert.equal(status(99, 100), 'warn');
  assert.equal(status(100, 100), 'ok', 'exactly on budget is done, not a warning');
  assert.equal(status(101, 100), 'over');
});

test('status: an unbudgeted category is never scolded', () => {
  assert.equal(status(0, 0), 'ok');
  assert.equal(status(500, 0), 'ok', 'spending with no budget set is not "over"');
});

// The same rounding discipline as the display layer: a category overspent by
// mere agorot displays as on-budget, so it must not be reported as 'over'.
test('status: an agorot-sized overspend is not reported as over', () => {
  assert.equal(status(100.4, 100), 'ok');
  assert.equal(status(100.6, 100), 'over');
});

// ── creditOccurrences: how many times money lands ─────────────────────────
test('creditOccurrences: a one-off counts once', () => {
  assert.equal(creditOccurrences({}), 1, 'no bounds at all');
  assert.equal(creditOccurrences({ month_start: 3 }), 1, 'missing end');
  assert.equal(creditOccurrences({ month_end: 3 }), 1, 'missing start');
  assert.equal(creditOccurrences({ month_start: null, month_end: null }), 1);
  assert.equal(creditOccurrences({ month_start: 5, month_end: 5 }), 1, 'same month');
});

test('creditOccurrences: a month range counts inclusively', () => {
  assert.equal(creditOccurrences({ month_start: 1, month_end: 3 }), 3);
  assert.equal(creditOccurrences({ month_start: 1, month_end: 12 }), 12);
  assert.equal(creditOccurrences({ month_start: 6, month_end: 7 }), 2);
});

test('creditOccurrences: a fat-fingered range cannot blow up a total', () => {
  assert.equal(creditOccurrences({ month_start: 1, month_end: 99 }), 12, 'clamped to 12');
  assert.equal(creditOccurrences({ month_start: 9, month_end: 2 }), 1, 'end before start');
});

// ── creditTotal: amount x occurrences ─────────────────────────────────────
test('creditTotal multiplies the per-occurrence amount by the occurrences', () => {
  assert.equal(creditTotal({ amount: 100 }), 100, 'a one-off lands once');
  assert.equal(creditTotal({ amount: 100, month_start: 1, month_end: 3 }), 300);
  assert.equal(creditTotal({ amount: 250, month_start: 1, month_end: 12 }), 3000);
  assert.equal(creditTotal({ amount: 100, month_start: 1, month_end: 99 }), 1200, 'clamped to 12');
});

test('creditTotal treats a missing amount as zero, and stays float-safe', () => {
  assert.equal(creditTotal({}), 0);
  assert.equal(creditTotal({ amount: null }), 0);
  assert.equal(creditTotal({ amount: 'abc' }), 0);
  // 0.1 * 3 is 0.30000000000000004 raw; ag() inside creditTotal snaps it.
  assert.equal(creditTotal({ amount: 0.1, month_start: 1, month_end: 3 }), 0.3);
});

// ── fileToYear: which budget year the money counts against ────────────────
// THE regression lock for the 2026-09-20 report: a 318 gift logged while
// viewing 2027, dated 2026-09-18, filed itself to 2026/Sep and then vanished
// from the screen. It read as a failed save.
test('a pre-payment counts against the year being VIEWED, not the year on the date', () => {
  const r = fileToYear('2026-09-18', 2027, 9, { allowGeneral: true });
  assert.equal(r.yr, 2027, 'must file to the viewed year, not the date year');
  assert.equal(r.mo, null, 'a date from another year cannot name a month of this one');
});

test('a date inside the viewed year still picks its month', () => {
  assert.deepEqual(fileToYear('2027-03-04', 2027, 9, { allowGeneral: true }), { yr: 2027, mo: 3 });
  assert.deepEqual(fileToYear('2026-01-31', 2026, 9, { allowGeneral: true }), { yr: 2026, mo: 1 });
  assert.deepEqual(fileToYear('2026-12-01', 2026, 9, { allowGeneral: true }), { yr: 2026, mo: 12 });
});

test('no date means general where the table allows it, else the fallback month', () => {
  assert.deepEqual(fileToYear(null, 2027, 9, { allowGeneral: true }), { yr: 2027, mo: null });
  assert.deepEqual(fileToYear('', 2027, 9, { allowGeneral: true }), { yr: 2027, mo: null });
  // travel_payments.month_num is NOT NULL — those callers get a real month.
  assert.deepEqual(fileToYear(null, 2027, 9), { yr: 2027, mo: 9 });
  assert.deepEqual(fileToYear('2026-09-18', 2027, 9), { yr: 2027, mo: 9 });
});

test('the viewed year ALWAYS wins, in both directions', () => {
  // back-dated into a later view, and forward-dated into an earlier view
  assert.equal(fileToYear('2026-09-18', 2027, 9).yr, 2027);
  assert.equal(fileToYear('2027-01-05', 2026, 9).yr, 2026);
  assert.equal(fileToYear('garbage', 2026, 9).yr, 2026, 'junk date must not move the year');
});
