import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1100, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [{
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
  }, {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base /space-Invaders-demo01/',
    url: 'http://127.0.0.1:4173/space-Invaders-demo01/',
    reuseExistingServer: false,
  }],
});
