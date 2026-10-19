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
