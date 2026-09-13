import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    browserName: 'chromium',
    viewport: { width: 1100, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [{
    command: 'npm run dev -- --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
  }, {
    command: 'npm run build && npm run preview -- --base /space-Invaders-demo01/',
    url: 'http://127.0.0.1:4176/space-Invaders-demo01/',
    reuseExistingServer: false,
  }],
});
