// What this is: the pure arithmetic behind the budget — float-safe summing,
//   spend-vs-budget percentage and status, and how many times a credit lands.
// Why it exists: this app's whole job is money arithmetic, and until now that
//   arithmetic was only checked indirectly, through Playwright tests that drive
//   a browser against a live Supabase project. That is slow, needs auth, and
//   tests the rendering far more than the maths. These four functions touch no
//   DOM and no database, so they can be pinned directly and cheaply — the same
//   move lib/history-format.ts made after its duplicated copies drifted.
// What's decided:
//   - Behaviour is preserved EXACTLY as it was inline in app.ts. This extraction
//     is a move, not a rewrite; any behaviour change here is a bug.
//   - DOM-free and Supabase-free, so it runs under plain `node:test`.
// What's built: ag, pct, status, creditOccurrences.
// What's next: `creditTotal` and `creditsForCategory` still live in app.ts —
//   creditTotal is trivially liftable, creditsForCategory reads module state.
// Links: consumed by app.ts; pinned by tests/budget-math.test.mjs.

/**
 * Agorot rounding — snap a money sum to 2 decimals to kill float drift
 * (e.g. `0.1 + 0.2` is `0.30000000000000004`).
 *
 * Apply ONLY at sum/total boundaries so equality and display stay exact. This
 * does NOT change any real displayed value — display rounds to whole shekels
 * separately, in lib/money.ts.
 */
export function ag(n: unknown): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Spend as a percentage of budget, clamped to 100 so a progress bar can never
 * overflow its track. A zero or absent budget yields 0 rather than Infinity.
 */
export function pct(spent: number, budget: number): number {
  return budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
}

/**
 * Traffic light for a category: `'ok'` | `'warn'` (>=85% spent) | `'over'`.
 *
 * Note the deliberate `Math.round` on the remainder: a category overspent by
 * mere agorot is NOT reported as 'over'. Rounding first also means a remainder
 * of `-0` compares equal to zero and lands on 'ok', matching what the number
 * actually displays as.
 */
export function status(spent: number, budget: number): string {
  if (budget === 0) return 'ok';
  const rem = Math.round(budget - spent);
  if (rem < 0) return 'over';
  if (rem === 0) return 'ok';
  const p = spent / budget;
  if (p >= 0.85) return 'warn';
  return 'ok';
}

/**
 * How many times a credit lands.
 *
 * A one-off (no range, or start === end, or a missing bound) counts once. A
 * month range (start..end) counts inclusively, clamped to a sane 1..12 so a
 * fat-fingered range can't blow up a total.
 */
export function creditOccurrences(row: {
  month_start?: number | null;
  month_end?: number | null;
}): number {
  const s = row.month_start;
  const e = row.month_end;
  // One-off: either bound missing, or both equal.
  if (s == null || e == null || s === e) return 1;
  const span = e - s + 1;
  if (span <= 1) return 1;
  return Math.min(12, span);
}
