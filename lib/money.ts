// What this is: the one money formatter for the whole app — number → "1,234" /
//   "₪1,234".
// Why it exists: this formatter was hand-copied SIXTEEN times across app.ts.
//   The copies were near-identical but not identical (three locales, two ways of
//   rounding), and that drift hid a real bug: any value in (-0.5, 0) printed as
//   "₪-0" and, in the Year view, was tinted red as if it were a deficit. August
//   2026's Unbudgeted cell was a ~₪0.40 rounding crumb and showed as a red
//   "₪-0". A first fix (v34) patched three of the sixteen and missed the rest,
//   because the other thirteen round via toLocaleString's `maximumFractionDigits`
//   rather than Math.round() — a grep for one spelling could not see the other.
//   The codebase had also already accumulated two per-site hand-patches for the
//   same bug (`fmt(Math.round(x) === 0 ? 0 : x)` in the ribbon). One shared
//   formatter removes the duplication that allowed all of it.
// What's decided:
//   - DOM-free and Supabase-free, so it unit-tests under plain `node:test`.
//   - ONE locale, 'en-IL', for every caller. The old he-IL call sites emitted an
//     invisible U+200E (LEFT-TO-RIGHT MARK) before negative numbers; en-IL does
//     not. Rendering is identical to the eye in this app (personal apps are
//     English/LTR by standing rule) and copied text comes out clean.
//   - Whole shekels only. The app has never displayed agorot.
// What's built: roundZ, amount, shekels, shekelsOrDash.
// What's next: nothing pending.
// Links: consumed by app.ts (all money rendering); pinned by tests/money.test.mjs.

/**
 * Round to whole shekels, collapsing negative zero to zero.
 *
 * `Math.round(-0.4)` is `-0`, and `(-0).toLocaleString()` is `"-0"` — a rounding
 * crumb that reads as a real deficit. Sign-based styling has the same trap:
 * `-0.4 < 0` is true, so a cell printing "0" would still be painted red. Every
 * formatter AND every positive/negative colour decision must go through this so
 * the number shown and the colour shown can never disagree.
 *
 * Non-numeric input (null, undefined, NaN, "") yields 0.
 */
export function roundZ(n: unknown): number {
  const r = Math.round(Number(n) || 0);
  return r === 0 ? 0 : r;
}

/** Whole-shekel amount, grouped, no currency symbol: `1234.6` → `"1,235"`. */
export function amount(n: unknown): string {
  return roundZ(n).toLocaleString('en-IL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Whole-shekel amount with the symbol: `1234.6` → `"₪1,235"`. */
export function shekels(n: unknown): string {
  return '₪' + amount(n);
}

/**
 * Like `shekels`, but an empty value renders as an em-dash instead of "₪0".
 *
 * Deliberately tests the RAW value, not the rounded one — this mirrors the
 * long-standing Year-table behaviour where a true zero shows "—" while a small
 * fraction still shows "₪0".
 */
export function shekelsOrDash(n: unknown): string {
  return !n ? '—' : shekels(n);
}
