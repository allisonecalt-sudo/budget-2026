const { defineConfig } = require('@playwright/test');

// Port is overridable: BUDGET_TEST_PORT=3101 when something else already
// squats 3100 (2026-09-24: a stale `serve` from another window sat on 3100
// serving v44, and reuseExistingServer ran the suite against it). global-setup
// also refuses to run when the served build's APP_VERSION differs from app.ts.
const PORT = Number(process.env.BUDGET_TEST_PORT) || 3100;

module.exports = defineConfig({
  testDir: './tests',
  workers: 1,

  // No retries: a flaky test must show up red instead of passing on attempt 3.
  retries: 0,
  // Writes a FAKE session (the app is behind the login gate) and checks the setup
  // cannot reach production. The suite never logs in as her.
  globalSetup: require.resolve('./tests/global-setup.js'),
  use: {
    // Block service workers so Playwright can route every Supabase request to the
    // in-memory fake (tests/fixtures.js). global-setup refuses to run without this.
    serviceWorkers: 'block',
    // 3100, not 3000: the Gmail MCP server squats on 3000 locally, and with
    // reuseExistingServer Playwright would happily run the suite against it.
    baseURL: `http://localhost:${PORT}`,
    storageState: './tests/.auth/state.json',
  },
  webServer: {
    command: `npx serve -l ${PORT} .`,
    port: PORT,
    reuseExistingServer: true,
  },
});
