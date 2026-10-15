// Pins lib/pay.ts — the pay arithmetic behind the Analyze tab: per-hour on one
// basis (gross per PAID hour), the school's gross, gan 2's session hour, the US
// self-employment toggle, the private-income tax set-aside, the honest Carmei Gat
// net, and "cash lasts". Runs under node:test with no browser and no Supabase
// (npm run test:unit builds dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = resolve(here, '..', 'dist', 'lib', 'pay.js');
assert.ok(existsSync(compiled), 'dist/lib/pay.js is missing — run `npm run build` first.');
const {
  gan2GrossMonth,
  perHour,
  schoolGrossMonth,
  sessionHourly,
  seTax,
  taxSetAside,
  carmeiGatNet,
  cashLasts,
} = await import(pathToFileURL(compiled).href);

test('perHour: Clalit ≈ ₪109 gross per paid hour with the grants spread', () => {
  // Glance box: ₪10,340 a month over 95.15 paid hours (22 h a week).
  assert.equal(Math.round(perHour(10340, 95.15)), 109);
  // A plain month (no grants) is lower on the same basis.
  assert.equal(Math.round(perHour(8670, 95.15)), 91);
  assert.equal(perHour(1000, 0), 0); // never Infinity on screen
});

test('school: ₪130 × 4.33 × 20 h = ₪11,258 a month; ₪130 per paid hour, ≈ ₪186 per real hour', () => {
  const gross = schoolGrossMonth(130, 4.33, 20);
  assert.equal(gross, 11258);
  assert.equal(Math.round(perHour(gross, 20 * 4.33)), 130);
  // 14 real hours a week for the same pay.
  assert.equal(Math.round(perHour(gross, 14 * 4.33)), 186);
});

test('gan 2: ₪180 for a 40-minute session is ₪270 per session hour', () => {
  assert.equal(sessionHourly(180, 40), 270);
  assert.equal(sessionHourly(180, 0), 0);
});

test('gan 2: ₪180 × 4 sessions on one day a week, paid 10 months ≈ ₪2,600 gross a month', () => {
  const g = { perSession: 180, sessionsPerDay: 4, daysPerWeek: 1, paidMonths: 10 };
  assert.equal(gan2GrossMonth(g, 4.33), 2598);
  assert.equal(gan2GrossMonth({ ...g, daysPerWeek: 0 }, 4.33), 0);
});

test('gan 2 net is below its gross and derived once; no mix carries a hard-coded gan 2 number', async () => {
  const { gan2NetMonth } = await import(pathToFileURL(compiled).href);
  const gross = gan2GrossMonth(
    { perSession: 180, sessionsPerDay: 4, daysPerWeek: 1, paidMonths: 10 },
    4.33,
  );
  const net = gan2NetMonth(gross, 0.7);
  assert.equal(net, 1819);
  assert.ok(net < gross);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(resolve(here, '..', 'app.ts'), 'utf8');
  // The old hard-coded gan 2 nets are gone; every gan 2 mix reads GAN2_NET.
  for (const old of ['netWithPetachya:', 'netWithSchool8h', 'netWithSchool5h', ': 3115', ': 1370'])
    assert.ok(!src.includes(old), 'app.ts still has ' + old);
  for (const key of ['petgan', 'all', 'schoolgan'])
    assert.match(src, new RegExp('  ' + key + ':[^\n]*GAN2_NET'));
});

test('seTax: 15.3% on 92.35% of net private income (rough, US)', () => {
  assert.equal(seTax(1000), 141.3);
  assert.equal(seTax(0), 0);
  assert.equal(seTax(-500), 0);
});

test('taxSetAside: 70% of turnover × her marginal rate', () => {
  assert.equal(taxSetAside(1000, 0.31), 217);
  assert.equal(taxSetAside(1000, 0.35), 245);
  assert.equal(taxSetAside(0, 0.31), 0);
});

test('carmeiGatNet: about −₪86 a month, about −₪336 with the upkeep allowance', () => {
  const r = carmeiGatNet({
    rent: 4850,
    mortgage: 4797.8,
    insurance: 112,
    mortgageLife: 26,
    upkeepAllowance: 250,
  });
  assert.equal(Math.round(r.before), -86);
  assert.equal(Math.round(r.withUpkeep), -336);
});

test('cashLasts: months of cash against a shortfall, and the extra months if the KH is used', () => {
  assert.deepEqual(cashLasts(30000, -1000, 64000), { months: 30, extraWithReserve: 64 });
  assert.deepEqual(cashLasts(20000, -648), { months: 30.9, extraWithReserve: 0 });
  // A covered month draws nothing down.
  assert.equal(cashLasts(30000, 0, 64000), null);
  assert.equal(cashLasts(30000, 250, 64000), null);
  // No cash: zero months, the KH is the whole runway.
  assert.deepEqual(cashLasts(-500, -1000, 5000), { months: 0, extraWithReserve: 5 });
});
