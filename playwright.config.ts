import { defineConfig } from '@playwright/test';

const mockResetToken = process.env.MOCK_RESET_TOKEN;
if (!mockResetToken) throw new Error('Ejecuta E2E mediante `npm run test:e2e` para usar reset aislado.');
const webServerEnvironment = { ...process.env };
delete webServerEnvironment.MOCK_RESET_TOKEN;

export default defineConfig({
  testDir: './apps/web/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev:mock',
      url: 'http://127.0.0.1:4011/health/live',
      reuseExistingServer: false,
      env: { ...process.env, NODE_ENV: 'development', MOCK_API_PORT: '4011', MOCK_RESET_TOKEN: mockResetToken },
      timeout: 30_000,
    },
    {
      command: 'npm run dev:web',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      env: webServerEnvironment,
      timeout: 30_000,
    },
  ],
});
