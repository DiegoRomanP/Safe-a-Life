import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'superadmin.e2e.ts',
  outputDir: '../test-results/superadmin',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    headless: true,
    trace: 'off',
    timezoneId: 'Asia/Tokyo',
  },
  webServer: {
    command: 'npm run dev:frontend',
    cwd: '..',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
