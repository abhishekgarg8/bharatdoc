import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Pixel 5"]
  },
  webServer: {
    command: "NEXT_PUBLIC_ENABLE_DEMO_MODE=true pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000
  }
});
