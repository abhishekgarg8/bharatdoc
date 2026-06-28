import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = path.resolve(new URL("../../../../", import.meta.url).pathname);
const require = createRequire(path.join(projectRoot, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const runId = "20260517184256";
const baseUrl = "https://bharatdoc-web.vercel.app";
const screenshotDir = path.join(projectRoot, "test/runs", runId, "screenshots/auth-negative");
const logPath = path.join(projectRoot, "test/runs", runId, "logs/auth-negative-flow.json");

const ownerEmail = "abhishekgarg8+bd-e2e-owner-20260517184256@gmail.com";
const ownerPassword = "BdE2E-20260517184256-A1!";
const logs = { screenshots: [], checks: {}, responses: [], consoleErrors: [] };

async function screenshot(page, name) {
  const filePath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  logs.screenshots.push(path.relative(projectRoot, filePath));
}

await mkdir(screenshotDir, { recursive: true });
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
  await page.goto(`${baseUrl}/onboarding`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /log in/i }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByRole("textbox", { name: "Password" }).fill("WrongPassword-184256!");
  await screenshot(page, "e02-invalid-login-filled");
  await page.locator("button.bg-terracotta", { hasText: "Log in" }).click();
  await page.getByText("Invalid login credentials").waitFor({ timeout: 30_000 });
  logs.checks.invalidLoginMessage = true;
  await screenshot(page, "e02-invalid-login-result");

  await page.getByRole("button", { name: /sign up/i }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByRole("textbox", { name: "Password" }).fill(ownerPassword);
  await screenshot(page, "e02-duplicate-signup-filled");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.getByText(/Email is already registered|Confirm your email before continuing|Unable to create account/i).waitFor({
    timeout: 30_000
  });
  const bodyText = await page.locator("body").innerText();
  logs.checks.duplicateSignupHandled = /Email is already registered|Confirm your email before continuing|Unable to create account/i.test(bodyText);
  logs.checks.duplicateSignupText = bodyText.slice(0, 500);
  await screenshot(page, "e02-duplicate-signup-result");
} finally {
  await context.close();
  await browser.close();
  await writeFile(logPath, `${JSON.stringify(logs, null, 2)}\n`);
}

if (!logs.checks.invalidLoginMessage || !logs.checks.duplicateSignupHandled) {
  console.error(JSON.stringify(logs, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(logs, null, 2));
