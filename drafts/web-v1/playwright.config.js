import { defineConfig } from '@playwright/test';

const chromium = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: chromium },
  projects: [{ name: 'mock', use: { baseURL: 'http://localhost:4173/' } }],
  webServer: {
    command: 'VITE_API_URL= npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
