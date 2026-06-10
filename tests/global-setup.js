// Playwright global setup — authenticates ONCE and saves the Supabase session
// as storageState, so the budget.spec.js math-audit suite runs behind the
// auth gate that E4 (login gate) added. Without this, every test times out on
// the login screen and "Lint & Test" CI stays red.
//
// Credentials: email is the app default (already in source); password comes
// from BUDGET_TEST_PASSWORD (local env / GitHub Actions secret) so it never
// lands in this PUBLIC repo. The saved state file (tests/.auth/) is gitignored.

const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3100'; // keep in sync with playwright.config.js (3000 is squatted by Gmail MCP locally)
const EMAIL = process.env.BUDGET_TEST_EMAIL || 'allisonecalt@gmail.com';
const PASSWORD = process.env.BUDGET_TEST_PASSWORD;
const STATE_PATH = path.join(__dirname, '.auth', 'state.json');

// Always write a state file so config's `storageState` path resolves.
function writeEmptyState() {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify({ cookies: [], origins: [] }));
}

module.exports = async () => {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });

  // No password → degrade gracefully with an empty (logged-out) session.
  // The smoke workflow tests the live URL and needs no auth; only the
  // budget.spec math-audit suite (run where the secret IS set) needs login.
  if (!PASSWORD) {
    console.warn(
      '[global-setup] BUDGET_TEST_PASSWORD not set — writing logged-out ' +
        'storageState. Auth-gated tests (budget.spec.js) will fail; set ' +
        'BUDGET_TEST_PASSWORD to run them.'
    );
    writeEmptyState();
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    // Login form rendered by renderLogin() in app.js.
    await page.waitForSelector('#login-form', { timeout: 15000 });
    await page.fill('#login-email', EMAIL);
    await page.fill('#login-password', PASSWORD);
    await page.click('#login-btn');
    // Success path renders the app shell (.ptab tabs). If creds are wrong the
    // login-err banner shows instead — fail loudly rather than save a bad state.
    const ok = await Promise.race([
      page.waitForSelector('.ptab', { timeout: 20000 }).then(() => true),
      page
        .waitForSelector('#login-err:not([hidden])', { timeout: 20000 })
        .then(() => false),
    ]);
    if (!ok) {
      const msg = await page.locator('#login-err').textContent();
      throw new Error(`Login failed during global setup: ${msg || 'unknown error'}`);
    }
    await page.context().storageState({ path: STATE_PATH });
  } finally {
    await browser.close();
  }
};
