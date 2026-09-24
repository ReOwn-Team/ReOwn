import { defineConfig } from '@playwright/test';

// npm run e2e        → chỉ bản demo (không cần máy chủ)
// E2E_API=1 npm run e2e → thêm bản nối API (cần PostgreSQL, DB được reset trước khi chạy)
const withApi = !!process.env.E2E_API;
const chromium = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: chromium },
  projects: [
    { name: 'mock', use: { baseURL: 'http://localhost:4173/' } },
    ...(withApi ? [{ name: 'api', use: { baseURL: 'http://localhost:5173/' } }] : []),
  ],
  webServer: [
    { command: 'npx vite build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    ...(withApi ? [
      { command: 'cd server && npm run db:reset && node src/index.js', url: 'http://localhost:4000/api/health', reuseExistingServer: false, timeout: 120_000, env: { DEV_TOOLS: 'true' } },
      { command: 'npx vite build --mode api --outDir dist-api && npx vite preview --mode api --outDir dist-api --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
    ] : []),
  ],
});
