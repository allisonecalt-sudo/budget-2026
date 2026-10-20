// Pins small words and wiring on the Analyze stack that no layout test sees:
// the keren hishtalmut extra reads like the main cash-lasts text (Z6), "KH" is
// spelled out where the stack first prints it (Z7), and the service worker's
// cache name moves with APP_VERSION (Z10). Runs under node:test, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const analyzeJs = resolve(root, 'dist', 'tabs', 'analyze.js');
const scenariosJs = resolve(root, 'dist', 'lib', 'scenarios.js');
assert.ok(existsSync(analyzeJs), 'dist/tabs/analyze.js is missing - run `npm run build` first.');
const { khExtraWord } = await import(pathToFileURL(analyzeJs).href);
const { scenario } = await import(pathToFileURL(scenariosJs).href);

test('Z6: the keren hishtalmut extra is whole months, and "years" past 60 like the main text', () => {
  assert.equal(khExtraWord(48.4), '48 months');
  assert.equal(khExtraWord(48.6), '49 months');
  assert.equal(khExtraWord(60.4), '60 months');
  assert.equal(khExtraWord(61), 'years');
  assert.equal(khExtraWord(249.4), 'years');
  assert.equal(khExtraWord(0.2), '0 months');
});

test('Z7: the school mix spells keren hishtalmut out beside "KH"', () => {
  assert.match(scenario('school').note, /keren hishtalmut \(KH\)/);
});

test('Z10: sw.js VERSION is "budget-" + APP_VERSION', () => {
  const app = readFileSync(resolve(root, 'app.ts'), 'utf8');
  const sw = readFileSync(resolve(root, 'sw.js'), 'utf8');
  const appVersion = app.match(/const APP_VERSION = '([^']+)'/)?.[1];
  const swVersion = sw.match(/const VERSION = '([^']+)'/)?.[1];
  assert.ok(appVersion, 'APP_VERSION not found in app.ts');
  assert.ok(swVersion, 'VERSION not found in sw.js');
  assert.equal(swVersion, 'budget-' + appVersion);
});

test('V8: money() and signed() round a negative half like roundZ (toward +, never away from zero)', async () => {
  const { money, signed } = await import(pathToFileURL(analyzeJs).href);
  assert.equal(money(-2.5), '−₪2');
  assert.equal(signed(-2.5), '−₪2');
  assert.equal(money(-150.5), '−₪150');
  assert.equal(signed(-150.5), '−₪150');
  assert.equal(money(2.5), '₪3');
  assert.equal(signed(2.5), '+₪3');
  assert.equal(money(-0.4), '₪0');
  assert.equal(signed(-0.4), '₪0');
  assert.equal(signed(-2.6), '−₪3');
});

test('V4: data-qty keys survive item names with spaces ("Summer trip", "Paid, not tied to an item")', async () => {
  const { Q, slug } = await import(pathToFileURL(analyzeJs).href);
  const keysOf = (html) => html.match(/data-qty="([^"]*)"/)[1].split(' ');
  for (const name of ['Summer trip', 'Paid, not tied to an item']) {
    // Built with slug(): one key per intended key, none holding a space.
    const k = keysOf(Q('₪1', 'pot:2026:' + slug(name), 'potdue:' + slug(name)));
    assert.equal(k.length, 2, name);
    assert.ok(
      k.every((x) => !/\s/.test(x)),
      name,
    );
    assert.equal(decodeURIComponent(k[1]), 'potdue:' + name);
    // Even a key built WITHOUT slug() cannot split into pieces or break the attribute.
    const raw = keysOf(Q('₪1', 'potdue:' + name + '"><b>'));
    assert.equal(raw.length, 1, name);
  }
  assert.equal(slug('Postage'), 'Postage'); // plain names keep their key
  assert.notEqual(slug('Summer trip'), slug('Summer_trip'));
});

test('V5: QN marks a positive print of a negative value, Q does not', async () => {
  const { Q, QN } = await import(pathToFileURL(analyzeJs).href);
  assert.match(QN('₪150', 'planres:low:lean'), /data-qty="planres:low:lean" data-qty-sign="-"/);
  assert.doesNotMatch(Q('₪150', 'planres:low:lean'), /data-qty-sign/);
});

test('T2: the rounding marker says how many sums are off', async () => {
  const { roundMarkText } = await import(pathToFileURL(analyzeJs).href);
  assert.equal(roundMarkText([0, 0]), '');
  assert.equal(roundMarkText([1]), ' · ±₪1 rounding');
  assert.equal(roundMarkText([0, 2]), ' · ±₪2 rounding');
  assert.equal(roundMarkText([1, 1]), ' · ±₪1 rounding in 2 sums');
  assert.equal(roundMarkText([-1, 1]), ' · ±₪1 rounding in 2 sums');
  assert.equal(roundMarkText([1, 2]), ' · rounding in 2 sums (up to ±₪2)');
  assert.doesNotMatch(roundMarkText([1, 1]), /and/);
});
