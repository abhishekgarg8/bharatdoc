import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = path.resolve(new URL("../../../../", import.meta.url).pathname);
const require = createRequire(path.join(projectRoot, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const runId = "20260517184256";
const baseUrl = "https://bharatdoc-web.vercel.app";
const workerUrl = "https://bharatdocworker-production.up.railway.app";
const screenshotDir = path.join(projectRoot, "test/runs", runId, "screenshots/availability");
const logPath = path.join(projectRoot, "test/runs", runId, "logs/availability-guards.json");
const logs = { screenshots: [], checks: {}, responses: [], consoleErrors: [] };

async function screenshot(page, name) {
  const filePath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  logs.screenshots.push(path.relative(projectRoot, filePath));
}

await mkdir(screenshotDir, { recursive: true });

for (const [name, url] of [
  ["manifest", `${baseUrl}/manifest.webmanifest`],
  ["serviceWorker", `${baseUrl}/sw.js`],
  ["workerHealth", `${workerUrl}/health`]
]) {
  const response = await fetch(url);
  logs.checks[name] = {
    status: response.status,
    contentType: response.headers.get("content-type")
  };
  if (!response.ok) {
    throw new Error(`${name} returned ${response.status}`);
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") logs.consoleErrors.push({ text: message.text(), url: page.url() });
});
page.on("response", (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    logs.responses.push({ status: response.status(), url: response.url() });
  }
});

try {
  for (const [name, route] of [
    ["root", "/"],
    ["dashboard", "/dashboard"],
    ["recording", "/recordings/new"]
  ]) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.getByText("Welcome to BharatDoc").waitFor({ timeout: 30_000 });
    logs.checks[`${name}FinalUrl`] = page.url();
    await screenshot(page, `e01-${name}-onboarding`);
  }
} finally {
  await context.close();
  await browser.close();
  await writeFile(logPath, `${JSON.stringify(logs, null, 2)}\n`);
}

console.log(JSON.stringify(logs, null, 2));
