// Playwright global setup. The suite NEVER logs in as her.
//
// It (1) refuses to run unless the test setup cannot reach production, and
// (2) writes a storageState holding a FAKE Supabase session, so the app gets
// past its login gate. Every Supabase request the app then makes is answered
// by the in-memory fake in tests/fake-supabase.js (see tests/fixtures.js).
//
// History: until 2026-10-15 this file logged in with her real password
// (BUDGET_TEST_PASSWORD, a CI secret) against the live database. That secret is
// no longer read anywhere and can be deleted from the repo's GitHub secrets.

const path = require('path');
const fs = require('fs');

// Same port rule as playwright.config.js (BUDGET_TEST_PORT overrides 3100;
// 3000 is squatted by the Gmail MCP locally).
const BASE_URL = `http://localhost:${Number(process.env.BUDGET_TEST_PORT) || 3100}`;
const STATE_PATH = path.join(__dirname, '.auth', 'state.json');
// supabase-js stores its session under sb-<project ref>-auth-token.
const STORAGE_KEY = 'sb-hpiyvnfhoqnnnotrmwaz-auth-token';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const jwt = [
    b64url({ alg: 'HS256', typ: 'JWT' }),
    b64url({ sub: 'fake-test-user', role: 'authenticated', exp }),
    'fake-signature',
  ].join('.');
  return {
    access_token: jwt,
    token_type: 'bearer',
    expires_in: 60 * 60 * 24 * 365,
    expires_at: exp,
    refresh_token: 'fake-refresh-token',
    user: {
      id: 'fake-test-user',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@example.invalid',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

// Fail loud if the server on that port is not serving THIS checkout. With
// reuseExistingServer, a stale `serve` left by another window quietly runs the
// whole suite against an old build (it served v44 on 2026-09-24).
async function assertServedBuildMatches() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.ts'), 'utf8');
  const local = (src.match(/const APP_VERSION = '([^']+)'/) || [])[1];
  const res = await fetch(`${BASE_URL}/dist/app.js`);
  const served = (((await res.text()) || '').match(/APP_VERSION = '([^']+)'/) || [])[1];
  if (local && served && local !== served) {
    throw new Error(
      `${BASE_URL} is serving ${served} but this checkout is ${local} — another server is on that port. ` +
        `Run with BUDGET_TEST_PORT=3101 (or stop the stale server).`,
    );
  }
}

// The production guard. The tests are safe only while (a) the app is served
// from localhost and (b) service workers are blocked, so Playwright can route
// every Supabase call to the fake. If either stops being true, stop here.
function assertCannotHitProduction(config) {
  const host = new URL(BASE_URL).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run: test base URL ${BASE_URL} is not local.`);
  }
  for (const p of config.projects) {
    const sw = p.use && p.use.serviceWorkers;
    if (sw !== 'block') {
      throw new Error(
        'Refusing to run: playwright.config.js must set use.serviceWorkers = "block". ' +
          'A service worker would send Supabase calls past the fake and onto the real database.',
      );
    }
    const base = p.use && p.use.baseURL;
    if (base && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(base)) {
      throw new Error(`Refusing to run: baseURL ${base} is not local.`);
    }
  }
  if (process.env.BUDGET_TEST_PASSWORD) {
    console.warn(
      '[global-setup] BUDGET_TEST_PASSWORD is set but ignored: the suite runs on fake data and ' +
        'never logs in as her.',
    );
  }
}

module.exports = async (config) => {
  assertCannotHitProduction(config);
  await assertServedBuildMatches();
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [{ name: STORAGE_KEY, value: JSON.stringify(fakeSession()) }],
        },
      ],
    }),
  );
};
