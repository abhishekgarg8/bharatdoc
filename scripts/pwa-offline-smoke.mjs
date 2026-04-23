import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(projectRoot, "output", "playwright");

async function main() {
  const baseUrl = process.env.PWA_SMOKE_BASE_URL ?? "http://127.0.0.1:3201";

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }
  });
  const page = await context.newPage();

  try {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForFunction(async () => {
      if (!("serviceWorker" in navigator)) {
        return false;
      }

      await navigator.serviceWorker.ready;
      return true;
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.goto(`${baseUrl}/settings`, { waitUntil: "networkidle" });

    await context.setOffline(true);

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByText("Today's consultations").waitFor();
    await page.screenshot({ path: path.join(outputDir, "dashboard-offline-mobile.png"), fullPage: true });

    await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await page.screenshot({ path: path.join(outputDir, "settings-offline-mobile.png"), fullPage: true });

    console.log("PWA offline smoke passed.");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
