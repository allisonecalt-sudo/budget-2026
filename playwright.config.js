const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: {
    command: 'npx serve -l 3000 .',
    port: 3000,
    reuseExistingServer: true,
  },
});
