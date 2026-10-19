// Pins sw.js SHELL_ASSETS: every built .js file under dist/ (whose source .ts
// exists) must be in the offline list, or the app breaks offline the first time
// a file is split out. Runs under node:test (npm run test:unit builds dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative, join, sep } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
assert.ok(existsSync(dist), 'dist/ is missing — run `npm run build` first.');

function jsFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// The entries of SHELL_ASSETS, ignoring commented-out ones: a `// './dist/x.js'`
// line (or a block comment) is NOT listed, so it must not count as offline-ready.
function listedAssets(swSource) {
  const m = swSource.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/);
  assert.ok(m, 'SHELL_ASSETS not found in sw.js');
  const live = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
  return new Set([...live.matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

test('a commented-out entry is not listed (line comment, trailing comment, block comment)', () => {
  const src = `const SHELL_ASSETS = [
  './dist/app.js',
  // './dist/lib/old.js',
  './dist/lib/pay.js', // './dist/lib/trailing.js'
  /* './dist/lib/block.js', */
  './dist/lib/money.js',
];`;
  assert.deepEqual(
    [...listedAssets(src)],
    ['./dist/app.js', './dist/lib/pay.js', './dist/lib/money.js'],
  );
});

test('every built file with a .ts source is in sw.js SHELL_ASSETS', () => {
  const sw = readFileSync(resolve(root, 'sw.js'), 'utf8');
  const listed = listedAssets(sw);
  for (const file of jsFiles(dist)) {
    const rel = relative(dist, file).replaceAll(sep, '/'); // e.g. lib/pay.js
    const source = resolve(root, rel.replace(/\.js$/, '.ts'));
    if (!existsSync(source)) continue; // orphan from an old local build
    const p = './dist/' + rel;
    assert.ok(
      listed.has(p),
      `${p} is built but missing from SHELL_ASSETS in sw.js — the app breaks offline`,
    );
  }
});
