import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Pixel 5"]
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "NEXT_PUBLIC_ENABLE_DEMO_MODE=true pnpm dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120000
      }
});
