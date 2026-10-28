import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const executablePath = process.env.PW_CHROMIUM;
const baseURL = "http://127.0.0.1:3001";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  forbidOnly: isCI,
  workers: 1,
  reporter: isCI
    ? [
        ["list"],
        ["html", { outputFolder: "playwright-report", open: "never" }],
      ]
    : "list",
  use: {
    baseURL,
    browserName: "chromium",
    launchOptions: executablePath ? { executablePath } : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Build first with `npm run build`; smoke tests exercise the production server.
    command: "npm run start -- --hostname 127.0.0.1",
    url: baseURL,
    reuseExistingServer: !isCI,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
