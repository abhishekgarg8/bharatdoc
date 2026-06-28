import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = path.resolve(new URL("../../../../", import.meta.url).pathname);
const require = createRequire(path.join(projectRoot, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const runId = "20260517184256";
const baseUrl = "https://bharatdoc-web.vercel.app";
const screenshotDir = path.join(projectRoot, "test/runs", runId, "screenshots/signup-feedback");
const logPath = path.join(projectRoot, "test/runs", runId, "logs/signup-feedback-repro.json");
const email = "abhishekgarg8+bd-e2e-signup-feedback-20260517184256@gmail.com";
const password = "BdE2E-SignupFeedback-184256-A1!";
const logs = { consoleErrors: [], failedResponses: [], bodyText: "" };

await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
const page = await context.newPage();

page.on("console", (message) => {
  if (message.type() === "error") logs.consoleErrors.push({ text: message.text(), url: page.url() });
});
page.on("response", (response) => {
  if (response.status() >= 400) logs.failedResponses.push({ status: response.status(), url: response.url() });
});

try {
  await page.goto(`${baseUrl}/onboarding`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.screenshot({ path: path.join(screenshotDir, "signup-feedback-filled.png"), fullPage: true });
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForTimeout(45_000);
  logs.bodyText = await page.locator("body").innerText();
  logs.createButtonText = await page.getByRole("button", { name: /create account/i }).innerText().catch(() => "");
  logs.hasConfirmMessage = /Confirm your email before continuing/i.test(logs.bodyText);
  logs.hasSpinnerVisible = await page.locator(".animate-spin").isVisible().catch(() => false);
  await page.screenshot({ path: path.join(screenshotDir, "signup-feedback-after-45s.png"), fullPage: true });
} finally {
  await context.close();
  await browser.close();
  await writeFile(logPath, `${JSON.stringify(logs, null, 2)}\n`);
}

console.log(JSON.stringify(logs, null, 2));
