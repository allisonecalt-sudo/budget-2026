// Pins lib/scenarios.ts — the ONE source of the incomes, spending levels and her
// 2027 pots plan that the Analyze tab reads. Runs under node:test with no browser
// and no Supabase (npm run test:unit builds dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'scenarios.js');
assert.ok(existsSync(compiled), 'dist/lib/scenarios.js is missing — run `npm run build` first.');
const {
  PAY,
  SCENARIOS,
  scenario,
  privateNetOf,
  spendLevelLines,
  spendLevelTotal,
  potPlanFor,
  LEVEL_META,
  planIncomeForMonth,
  planCaption,
} = await import(pathToFileURL(compiled).href);

// app.ts CATEGORIES, by key.
const CATEGORY_KEYS = [
  'groceries',
  'takeout',
  'eatingout',
  'entertainment',
  'retail',
  'transport',
  'health',
  'therapy',
  'housing',
  'household',
  'recurring',
  'charity',
  'travel',
  'admin',
  'gifts',
  'holiday',
];

test('SCENARIOS: 10 rows, unique keys, in the spec order, with the computed nets', () => {
  const keys = SCENARIOS.map((s) => s.key);
  assert.deepEqual(keys, [
    'clalit',
    'school',
    'school2',
    'schoolgan',
    'all5',
    'all4',
    'all',
    'petgan',
    'pet2',
    'pet',
  ]);
  assert.equal(new Set(keys).size, 10);
  assert.deepEqual(
    SCENARIOS.map((s) => s.net),
    [14800, 16120, 16830, 17939, 15431, 14609, 12229, 11519, 10410, 9700],
  );
  // schoolgan = Petachya 9,700 + the school's 6,420 + gan 2 1,819.
  assert.equal(scenario('schoolgan').net, 9700 + 6420 + 1819);
});

test('SCENARIOS: only all4 (low) and all5 (high) are her plan; every row has a source and a date', () => {
  const plan = SCENARIOS.filter((s) => s.in_plan).map((s) => [s.key, s.plan_edge]);
  assert.deepEqual(plan.sort(), [
    ['all4', 'low'],
    ['all5', 'high'],
  ]);
  for (const s of SCENARIOS) {
    assert.ok(s.source && s.as_of, s.key + ' has no source/as_of');
    if (!s.in_plan) assert.equal(s.plan_edge, null);
  }
});

test('scenario(): throws on an unknown key (a typo must never read as ₪0)', () => {
  assert.throws(() => scenario('nope'), /Unknown scenario/);
});

test('privateNetOf: 4 clients 3,090 · 5 clients 3,912 · 2 clients 710 (today) · none 0', () => {
  assert.equal(privateNetOf(scenario('all4')), 3090);
  assert.equal(privateNetOf(scenario('all5')), 3912);
  assert.equal(privateNetOf(scenario('pet2')), 710);
  assert.equal(privateNetOf(scenario('all')), 710);
  assert.equal(privateNetOf(scenario('pet')), 0);
});

test('spending levels: Temp 9,752 · Middle 12,714 · Normal 14,429, each on the 16 categories', () => {
  assert.equal(spendLevelTotal('temp'), 9752);
  assert.equal(spendLevelTotal('middle'), 12714);
  assert.equal(spendLevelTotal('normal'), 14429);
  for (const lv of ['temp', 'middle', 'normal'])
    assert.deepEqual(Object.keys(spendLevelLines(lv)).sort(), [...CATEGORY_KEYS].sort());
  assert.deepEqual(
    LEVEL_META.map((l) => l.key),
    ['temp', 'lean', 'middle', 'normal'],
  );
});

test('POT_PLAN: 2027 sums to 39,761 (normal) and 25,208 (lean); 2028 has no plan', () => {
  const rows = potPlanFor(2027);
  assert.equal(rows.length, 9);
  assert.equal(
    rows.reduce((a, p) => a + p.amount, 0),
    39761,
  );
  assert.equal(
    rows.reduce((a, p) => a + p.lean, 0),
    25208,
  );
  assert.equal(rows.find((p) => p.label === 'Cog-Fun course').lean, 0);
  assert.deepEqual(potPlanFor(2028), []);
});

test('PAY: gan 2 paid months = 12 minus its unpaid months (July–August)', () => {
  assert.deepEqual(PAY.gan2.unpaidMonths, [7, 8]);
  assert.equal(PAY.gan2.paidMonths, 12 - PAY.gan2.unpaidMonths.length);
});

test('planIncomeForMonth: Feb at today’s pace, August thin, September with the havra’a', () => {
  assert.deepEqual(planIncomeForMonth({ year: 2027, month: 2 }, 4), {
    petachya: 9700,
    gan2: 2182,
    private: 710,
    total: 12592,
    notes: ['clients at today’s pace (2)'],
  });
  assert.deepEqual(planIncomeForMonth({ year: 2027, month: 8 }, 4), {
    petachya: 9185,
    gan2: 0,
    private: -200,
    total: 8985,
    notes: ['gan 2 pays ₪0', 'no clients in August', 'Petachya without travel'],
  });
  assert.deepEqual(planIncomeForMonth({ year: 2027, month: 9 }, 5), {
    petachya: 11080,
    gan2: 2182,
    private: 4286,
    total: 17548,
    notes: ['+ havra’a ₪1,380'],
  });
  assert.deepEqual(planIncomeForMonth({ year: 2027, month: 7 }, 4).notes, ['gan 2 pays ₪0']);
});

test('the plan is a RANGE: all4 names its own 4-client net; planCaption() names 4–5 from both rows', () => {
  assert.equal(scenario('all4').label, 'Petachya + gan 2 (Fri) + 4 private clients');
  assert.equal(scenario('all5').label, 'Petachya + gan 2 (Fri) + 5 private clients');
  assert.equal(planCaption(), 'Petachya + gan 2 (Fri) + 4–5 private clients');
  // The all4 net really is the 4-client figure (Petachya 9,700 + gan 2 1,819 + 3,090).
  assert.equal(scenario('all4').net, 9700 + 1819 + 3090);
});
