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
    await page.goto(`${baseUrl}/onboarding`, { waitUntil: "networkidle" });
    await page.waitForFunction(async () => {
      if (!("serviceWorker" in navigator)) {
        return false;
      }

      await navigator.serviceWorker.ready;
      return true;
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.goto(`${baseUrl}/signup`, { waitUntil: "networkidle" });

    const apiPolicy = await page.evaluate(async () => {
      const response = await fetch("/api/me", { headers: { Authorization: "Bearer pwa-smoke-invalid" } });
      return {
        browser: response.headers.get("cache-control"),
        cdn: response.headers.get("cdn-cache-control"),
        vercel: response.headers.get("vercel-cdn-cache-control")
      };
    });
    if (
      apiPolicy.browser !== "private, no-store, max-age=0" ||
      apiPolicy.cdn !== "no-store" ||
      apiPolicy.vercel !== "no-store"
    ) {
      throw new Error(`API no-store headers are missing: ${JSON.stringify(apiPolicy)}`);
    }

    const cacheState = await page.evaluate(async () =>
      Promise.all(
        (await caches.keys()).map(async (name) => ({
          name,
          urls: (await (await caches.open(name)).keys()).map(({ url }) => url)
        }))
      )
    );
    const ownedLimits = { "bharatdoc-shell-v2": 24, "bharatdoc-static-v2": 96 };
    for (const { name, urls } of cacheState) {
      if (!(name in ownedLimits) || urls.length > ownedLimits[name]) {
        throw new Error(`Unexpected or unbounded cache ${name}: ${urls.length}`);
      }
      if (urls.some((value) => new URL(value).pathname.startsWith("/api/") || new URL(value).search)) {
        throw new Error(`Sensitive cache key found in ${name}`);
      }
    }

    await context.setOffline(true);

    await page.goto(`${baseUrl}/onboarding`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Create your account" }).waitFor();
    await page.screenshot({ path: path.join(outputDir, "onboarding-offline-mobile.png"), fullPage: true });

    await page.goto(`${baseUrl}/signup`, { waitUntil: "domcontentloaded" });
    await page.getByText("Welcome to BharatDoc").waitFor();
    await page.screenshot({ path: path.join(outputDir, "signup-offline-mobile.png"), fullPage: true });

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
