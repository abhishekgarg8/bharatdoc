import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = path.resolve(new URL("../../../../", import.meta.url).pathname);
const require = createRequire(path.join(projectRoot, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const runId = "20260517184256";
const baseUrl = "https://bharatdoc-web.vercel.app";
const screenshotDir = path.join(projectRoot, "test/runs", runId, "screenshots/final-clean-audit");
const logPath = path.join(projectRoot, "test/runs", runId, "logs/final-clean-console-network.json");

const logs = {
  consoleErrors: [],
  failedResponses: [],
  pages: []
};

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function screenshot(page, name) {
  const filePath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  logs.pages.push({
    name,
    url: page.url(),
    screenshot: path.relative(projectRoot, filePath)
  });
}

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") {
    logs.consoleErrors.push({ text: message.text(), url: page.url() });
  }
});

page.on("response", (response) => {
  if (response.url().startsWith(baseUrl) && response.status() >= 400) {
    logs.failedResponses.push({ status: response.status(), url: response.url() });
  }
});

try {
  await page.goto(`${baseUrl}/onboarding`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /log in/i }).click();
  await page.getByLabel("Email").fill(requiredEnv("APPROVED_EMAIL"));
  await page.getByRole("textbox", { name: "Password" }).fill(requiredEnv("APPROVED_PASSWORD"));
  await page.locator("button.bg-terracotta", { hasText: "Log in" }).click();
  await page.getByRole("heading", { name: /Today.s consultations/ }).waitFor({ timeout: 30_000 });

  for (const [name, route, waitText] of [
    ["dashboard", "/dashboard", /Today.s consultations/],
    ["search", "/search", "Search"],
    ["recording", "/recordings/new", "Recording"],
    ["settings", "/settings", "Settings"]
  ]) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
    await page.getByText(waitText).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
    await screenshot(page, name);
  }
} finally {
  await context.close();
  await browser.close();
  await writeFile(logPath, `${JSON.stringify(logs, null, 2)}\n`);
}

if (logs.consoleErrors.length || logs.failedResponses.length) {
  console.error(JSON.stringify(logs, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(logs, null, 2));
