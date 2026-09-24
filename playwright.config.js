const { defineConfig } = require('@playwright/test');

// Port is overridable: BUDGET_TEST_PORT=3101 when something else already
// squats 3100 (2026-09-24: a stale `serve` from another window sat on 3100
// serving v44, and reuseExistingServer ran the suite against it). global-setup
// also refuses to run when the served build's APP_VERSION differs from app.ts.
const PORT = Number(process.env.BUDGET_TEST_PORT) || 3100;

module.exports = defineConfig({
  testDir: './tests',
  workers: 1,
  // E2E runs against live Supabase data; a couple of render/animation-timing
  // tests (category toggle, mobile snapshot) are occasionally flaky. Retry
  // before failing so the suite is a reliable regression gate.
  retries: 2,
  // Authenticate once (app is behind the E4 login gate) and reuse the session.
  globalSetup: require.resolve('./tests/global-setup.js'),
  use: {
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
