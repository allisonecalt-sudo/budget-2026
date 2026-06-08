// What this is: a pure unit test (no browser, no Supabase) pinning the History
//   Log panel's date/time formatter.
// Why it exists: the refresh path of the History panel used to read
//   `r.created_at.created_at` — a double property access on an ISO string — which
//   yielded `undefined` and rendered "Invalid Date, Invalid Date" after any
//   auto-refresh, while the initial-open path rendered correctly. The fix unified
//   both paths onto one shared `fmtHistoryDate` helper. This test pins the correct
//   output and explicitly guards against that "Invalid Date" regression.
// What's decided: runs against the COMPILED helper (dist/lib/history-format.js), so
//   `npm run build` must run first. Uses Node's built-in `node:test` — zero new deps.
// What's next: nothing pending.
// Links: lib/history-format.ts (source), app.ts (consumer).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'history-format.js');

assert.ok(
  existsSync(compiled),
  'dist/lib/history-format.js is missing — run `npm run build` before the unit tests.',
);

// import() needs a file:// URL for an absolute path (required on Windows).
const { fmtHistoryDate } = await import(pathToFileURL(compiled).href);

// A real ISO timestamp formats to the panel's "<weekday>, <day> <mon>, <HH:MM>"
// shape. We assert structure (not an exact locale string, which varies by ICU
// build) so the test is stable across environments while still proving the
// formatter ran on a valid date.
test('fmtHistoryDate renders a valid ISO timestamp, not "Invalid Date"', () => {
  const out = fmtHistoryDate('2026-06-08T14:30:00Z');
  assert.doesNotMatch(out, /Invalid Date/, 'a valid ISO string must not render "Invalid Date"');
  // weekday, day-of-month, abbreviated month, then ", " then HH:MM time.
  assert.match(out, /^[A-Za-z]{3}, \d{1,2} [A-Za-z]{3}, \d{2}:\d{2}$/, `unexpected format: ${out}`);
  // Sanity: the date parts of June 8 2026 are present somewhere in the string.
  assert.match(out, /\bJun\b/, `expected month "Jun" in: ${out}`);
});

// Regression lock for the original bug: the buggy path passed
// `r.created_at.created_at`, i.e. `undefined`, into the formatter. `undefined`
// (and null / empty) must visibly fail rather than silently masquerade as a real
// date — this is the exact symptom that reached the user ("Invalid Date").
test('fmtHistoryDate(undefined/null/"") yields the Invalid-Date sentinel (the old bug input)', () => {
  for (const bad of [undefined, null, '']) {
    const out = fmtHistoryDate(bad);
    assert.match(
      out,
      /Invalid Date/,
      `bad input ${JSON.stringify(bad)} should surface "Invalid Date", got: ${out}`,
    );
  }
});
