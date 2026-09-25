const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8099/CMT-Neo/index.html',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'python3 -m http.server 8099',
    cwd: '..',
    url: 'http://127.0.0.1:8099/CMT-Neo/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30 * 1000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
});
