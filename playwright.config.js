const { defineConfig } = require('@playwright/test');

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
    baseURL: 'http://localhost:3100',
    storageState: './tests/.auth/state.json',
  },
  webServer: {
    command: 'npx serve -l 3100 .',
    port: 3100,
    reuseExistingServer: true,
  },
});
