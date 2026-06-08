// What this is: the pure date/time formatter for the History Log panel.
// Why it exists: the History panel had two code paths (openHistoryPanel +
//   refreshHistoryIfOpen) that each carried their own inline copy of this
//   formatter. The copies drifted — the refresh path read `r.created_at.created_at`
//   (double property access on a string), yielding `undefined` → `new Date('')`
//   → "Invalid Date, Invalid Date" after any auto-refresh. Extracting the one
//   formatter here removes the duplication that allowed the drift and makes the
//   formatting independently unit-testable (no DOM, no Supabase).
// What's decided: this module is DOM-free and Supabase-free so it can be imported
//   from a plain `node:test` unit test without a browser environment.
// What's built: fmtHistoryDate(iso) — same output the panel has always shown.
// What's next: nothing pending.
// Links: consumed by app.ts (openHistoryPanel / refreshHistoryIfOpen);
//   pinned by tests/history-format.test.js.

// Format a change_log row's `created_at` ISO timestamp for the History Log panel,
// e.g. "Mon, 8 Jun, 14:30". Mirrors the long-standing inline format exactly.
// A null/undefined/empty value yields "Invalid Date, Invalid Date" by design of
// the underlying Intl APIs — callers must pass a real ISO string.
export function fmtHistoryDate(iso: string | null | undefined): string {
  const d = new Date(iso || '');
  return (
    d.toLocaleDateString('en-IL', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString('en-IL', { hour: '2-digit', minute: '2-digit' })
  );
}
