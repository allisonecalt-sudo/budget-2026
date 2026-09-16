// What this is: pure unit tests (no browser, no Supabase) pinning the one money
//   formatter in lib/money.ts.
// Why it exists: this formatter was hand-copied sixteen times across app.ts, and
//   the copies hid a real bug — any value in (-0.5, 0) rounds to negative zero
//   and printed as "₪-0", which the Year view then tinted RED as a deficit.
//   August 2026's Unbudgeted cell was a ~₪0.40 rounding crumb and showed as a
//   red "₪-0" on her screen. A first fix patched three of the sixteen copies and
//   missed the rest. These tests lock the behaviour so no future copy can drift
//   back, and so the -0 case in particular can never silently return.
// What's decided: runs against the COMPILED module (dist/lib/money.js), so
//   `npm run build` must run first. Uses Node's built-in `node:test` — zero deps.
// What's next: nothing pending.
// Links: lib/money.ts (source), app.ts (consumer), tests/budget-math.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'money.js');

assert.ok(
  existsSync(compiled),
  'dist/lib/money.js is missing — run `npm run build` before the unit tests.',
);

const { roundZ, amount, shekels, shekelsOrDash } = await import(pathToFileURL(compiled).href);

// ── THE regression lock ───────────────────────────────────────────────────
// This is the bug that reached her screen. Every value that rounds to zero must
// print as a plain "0" — never "-0" — no matter which side of zero it came from.
test('negative zero never reaches the screen (the August "₪-0" bug)', () => {
  for (const crumb of [-0.4, -0.49, -0.0001, -Number.MIN_VALUE, -0]) {
    assert.equal(amount(crumb), '0', `amount(${crumb}) must be "0"`);
    assert.equal(shekels(crumb), '₪0', `shekels(${crumb}) must be "₪0"`);
    assert.doesNotMatch(shekels(crumb), /-/, `shekels(${crumb}) must contain no minus sign`);
  }
});

// The other half of that bug: the Year view colours a cell by the SIGN of the
// value. If roundZ returned -0, `rv < 0` would be true and a cell reading "₪0"
// would still be painted red. roundZ must hand back a zero that is not negative.
test('roundZ returns a zero that is not negative, so a "0" cell cannot be tinted red', () => {
  for (const crumb of [-0.4, -0.49, -0.0001, -0]) {
    const rv = roundZ(crumb);
    assert.equal(rv, 0);
    assert.ok(!(rv < 0), `roundZ(${crumb}) must not compare as negative`);
    assert.ok(Object.is(rv, 0), `roundZ(${crumb}) must be +0, not -0`);
  }
});

// ── Ordinary formatting ───────────────────────────────────────────────────
test('whole shekels, grouped with commas', () => {
  assert.equal(amount(0), '0');
  assert.equal(amount(1), '1');
  assert.equal(amount(1234), '1,234');
  assert.equal(amount(1000000), '1,000,000');
  assert.equal(shekels(1234), '₪1,234');
});

test('rounds to whole shekels — the app never shows agorot', () => {
  assert.equal(amount(1234.4), '1,234');
  assert.equal(amount(1234.5), '1,235');
  assert.equal(amount(0.4), '0');
});

test('real negatives survive — only the rounding crumbs are flattened', () => {
  assert.equal(amount(-0.6), '-1');
  assert.equal(amount(-2777.4), '-2,777');
  assert.equal(shekels(-2777), '₪-2,777');
  assert.ok(roundZ(-0.6) < 0, 'a real negative must still compare as negative');
});

test('no invisible LTR mark in the output (the old he-IL locale injected U+200E)', () => {
  for (const v of [-1, -2777, -0.6]) {
    assert.doesNotMatch(
      amount(v),
      /‎/,
      `amount(${v}) must not contain U+200E; found: ${JSON.stringify(amount(v))}`,
    );
  }
});

test('junk input formats as zero rather than "NaN"', () => {
  for (const junk of [null, undefined, '', NaN, 'abc', {}]) {
    assert.equal(amount(junk), '0', `amount(${JSON.stringify(junk)}) must be "0"`);
    assert.equal(shekels(junk), '₪0');
  }
});

// ── The dash variant ──────────────────────────────────────────────────────
// Deliberately tests the RAW value, matching long-standing Year-table behaviour:
// a true zero shows an em-dash, but a small fraction still shows "₪0".
test('shekelsOrDash: empty shows a dash, a fraction still shows ₪0', () => {
  for (const empty of [0, null, undefined, NaN, '']) {
    assert.equal(shekelsOrDash(empty), '—', `shekelsOrDash(${JSON.stringify(empty)})`);
  }
  assert.equal(shekelsOrDash(0.4), '₪0');
  assert.equal(shekelsOrDash(-0.4), '₪0', 'a negative crumb must not print "₪-0" here either');
  assert.equal(shekelsOrDash(1234), '₪1,234');
});
