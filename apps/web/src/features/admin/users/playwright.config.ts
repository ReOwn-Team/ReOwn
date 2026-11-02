import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: ".",
    testMatch: "users.spec.ts",
    workers: 1,
    use: { baseURL: "http://127.0.0.1:3001", browserName: "chromium" },
    webServer: {
        command: "pnpm exec next dev --hostname 127.0.0.1 --port 3001",
        cwd: process.cwd(),
        url: "http://127.0.0.1:3001",
        reuseExistingServer: true,
        timeout: 120000,
    },
});
