import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const localWebServer = {
  command: process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ?? "NEXT_PUBLIC_ENABLE_DEMO_MODE=true npx pnpm@10.8.0 dev",
  url: baseURL,
  reuseExistingServer: true,
  timeout: 120000
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Pixel 5"]
  },
  ...(process.env.PLAYWRIGHT_BASE_URL ? {} : { webServer: localWebServer })
});
