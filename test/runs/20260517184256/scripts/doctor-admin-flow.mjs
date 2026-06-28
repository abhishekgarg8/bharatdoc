import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = path.resolve(new URL("../../../../", import.meta.url).pathname);
const require = createRequire(path.join(projectRoot, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");

const runId = "20260517184256";
const baseUrl = "https://bharatdoc-web.vercel.app";
const outDir = path.join(projectRoot, "test/runs", runId);
const screenshotDir = path.join(outDir, "screenshots/doctor-admin");
const logPath = path.join(outDir, "logs/doctor-admin-flow.json");

const owner = {
  email: process.env.OWNER_EMAIL,
  password: process.env.OWNER_PASSWORD
};

const approvedDoctor = {
  email: "abhishekgarg8+bd-e2e-doctor-approve3-20260517184256@gmail.com",
  password: "BdE2E-DoctorApprove-184256-A1!",
  name: "Dr. E2E Approved 184256 C",
  specialization: "Internal Medicine"
};

const rejectedDoctor = {
  email: "abhishekgarg8+bd-e2e-doctor-reject3-20260517184256@gmail.com",
  password: "BdE2E-DoctorReject-184256-A1!",
  name: "Dr. E2E Rejected 184256 C",
  specialization: "Pediatrics"
};

const logs = {
  startedAt: new Date().toISOString(),
  screenshots: [],
  responses: [],
  consoleErrors: [],
  checks: {}
};

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function urlFor(pathname) {
  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function screenshot(page, name) {
  const filePath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  logs.screenshots.push(path.relative(projectRoot, filePath));
  console.log(`screenshot ${filePath}`);
}

function attachWatchers(page, label) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      logs.consoleErrors.push({ label, text: message.text(), url: page.url() });
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if ((url.includes(baseUrl) || url.includes("bharatdocworker-production")) && response.status() >= 400) {
      logs.responses.push({ label, status: response.status(), url });
    }
  });
}

async function createConfirmedUser(admin, account) {
  const { error } = await admin.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { email: account.email }
  });

  if (error && !/already|registered|exists/i.test(error.message)) {
    throw new Error(`Unable to create ${account.email}: ${error.message}`);
  }
}

async function idToken(passwordClient, account) {
  const { data, error } = await passwordClient.auth.signInWithPassword({
    email: account.email,
    password: account.password
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Unable to sign in ${account.email}: ${error?.message ?? "missing token"}`);
  }
  return data.session.access_token;
}

async function api(pathname, token, options = {}) {
  const response = await fetch(urlFor(pathname), {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  logs.responses.push({ label: "api", status: response.status, url: urlFor(pathname) });
  if (!response.ok) {
    throw new Error(`${pathname} returned ${response.status}: ${text}`);
  }
  return payload;
}

async function login(page, account, prefix) {
  await page.goto(urlFor("/onboarding"), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /log in/i }).click();
  await page.getByLabel("Email").fill(account.email);
  await page.getByRole("textbox", { name: "Password" }).fill(account.password);
  await screenshot(page, `${prefix}-login-filled`);
  await page.locator("button.bg-terracotta", { hasText: "Log in" }).click();
}

async function loginToKnownState(page, account, prefix) {
  await login(page, account, prefix);
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const body = await page.locator("body").innerText().catch(() => "");
    if (/Profile details|Today's consultations|Waiting for approval|Access not granted/i.test(body)) {
      await screenshot(page, `${prefix}-after-login`);
      return body;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`${prefix} did not reach a known state`);
}

async function joinClinic(page, account, clinicCode, prefix, invalidFirst = false) {
  await page.getByLabel("Full name").fill(account.name);
  await page.getByLabel("Specialization").fill(account.specialization);
  await screenshot(page, `${prefix}-profile-filled`);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByText("Your hospital").waitFor({ timeout: 20_000 });

  if (invalidFirst) {
    await page.getByLabel("Clinic Code").fill("ZZZZZZ");
    await screenshot(page, `${prefix}-invalid-clinic-code-filled`);
    await page.getByRole("button", { name: /find hospital/i }).click();
    await page.getByText(/Hospital code was not found.|Clinic code was not found./i).waitFor({ timeout: 20_000 });
    await screenshot(page, `${prefix}-invalid-clinic-code-result`);
  }

  await page.getByLabel("Clinic Code").fill(clinicCode);
  await page.getByRole("button", { name: /find hospital/i }).click();
  await page.getByText("Hospital selected").waitFor({ timeout: 20_000 });
  await screenshot(page, `${prefix}-clinic-found`);
  await page.getByRole("button", { name: /request to join/i }).click();
  await page.getByText("Waiting for approval").waitFor({ timeout: 30_000 });
  await screenshot(page, `${prefix}-pending-live-details`);
}

async function verifyPendingGuards(page, prefix) {
  for (const [slug, pathname] of [
    ["dashboard", "/dashboard"],
    ["recording", "/recordings/new"],
    ["search", "/search"],
    ["settings", "/settings"]
  ]) {
    await page.goto(urlFor(pathname), { waitUntil: "networkidle" });
    await page.getByText("Waiting for approval").waitFor({ timeout: 20_000 });
    await screenshot(page, `${prefix}-guard-${slug}`);
  }
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.getByText("Welcome to BharatDoc").waitFor({ timeout: 20_000 });
  await screenshot(page, `${prefix}-signout-result`);
}

async function ownerReview(page, doctorName, action, prefix) {
  await loginToKnownState(page, owner, `${prefix}-owner`);
  await page.goto(urlFor("/settings"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Settings" }).waitFor({ timeout: 30_000 });
  await screenshot(page, `${prefix}-owner-before-${action}`);
  const card = page.locator("article", { hasText: doctorName });
  await card.getByRole("button", { name: action === "approve" ? /approve/i : /reject/i }).click();
  await page.getByText(new RegExp(`${doctorName} ${action === "approve" ? "approved" : "rejected"}`, "i")).waitFor({ timeout: 30_000 });
  await screenshot(page, `${prefix}-owner-after-${action}`);
}

async function testApprovedDoctorAccess(page, account) {
  await loginToKnownState(page, account, "e10-approved-doctor");
  await page.getByRole("heading", { name: "Today's consultations" }).waitFor({ timeout: 30_000 });
  await screenshot(page, "e10-approved-doctor-dashboard");
  for (const [name, pathname, text] of [
    ["recording", "/recordings/new", "Recording"],
    ["search", "/search", "Search"],
    ["settings", "/settings", "Settings"]
  ]) {
    await page.goto(urlFor(pathname), { waitUntil: "networkidle" });
    await page.getByText(text).first().waitFor({ timeout: 30_000 });
    await screenshot(page, `e10-approved-doctor-${name}`);
  }
  const settingsText = await page.locator("body").innerText();
  logs.checks.ownerControlsHiddenForDoctor = !/Hospital admin|Owner review/i.test(settingsText);
}

async function testSearch(page, patientId) {
  await page.goto(urlFor("/search"), { waitUntil: "networkidle" });
  await page.getByLabel("Patient ID").fill(patientId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(new RegExp(`Results for ${patientId}`)).waitFor({ timeout: 30_000 });
  await screenshot(page, "e14-search-exact-result");

  const partial = patientId.replace(/^P-E2E-/, "");
  await page.getByLabel("Patient ID").fill(partial);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(patientId).first().waitFor({ timeout: 30_000 });
  await screenshot(page, "e14-search-partial-result");

  await page.getByLabel("Patient ID").fill("NO-SUCH-184256");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(/No consultations found/i).waitFor({ timeout: 30_000 });
  await screenshot(page, "e14-search-empty-state");
}

async function testPreferences(page) {
  await page.goto(urlFor("/settings/language"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Language" }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: /^English\b/i }).click();
  await screenshot(page, "e15-language-english-selected");
  await page.getByRole("button", { name: /save language/i }).click();
  await page.getByText("Transcription language saved.").waitFor({ timeout: 30_000 });
  await screenshot(page, "e15-language-saved");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^English\b/i }).waitFor({ timeout: 30_000 });
  await screenshot(page, "e15-language-persisted");

  await page.goto(urlFor("/settings/prompt"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Summary prompt" }).waitFor({ timeout: 30_000 });
  await page.locator("#summary-prompt").fill("Summarize without the required placeholder.");
  await page.getByText(/Add {{transcript}}/i).waitFor({ timeout: 10_000 });
  await screenshot(page, "e15-prompt-invalid");
  await page.getByRole("button", { name: /reset prompt/i }).click();
  await screenshot(page, "e15-prompt-reset");
  await page.getByRole("button", { name: /save prompt/i }).click();
  await page.getByText("Summary prompt saved.").waitFor({ timeout: 30_000 });
  await screenshot(page, "e15-prompt-saved");
}

async function testClinicAdmin(page, doctorToken) {
  await loginToKnownState(page, owner, "e16-owner");
  await page.goto(urlFor("/settings"), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Active doctors/i }).click();
  await page.getByText(approvedDoctor.name).waitFor({ timeout: 30_000 });
  await screenshot(page, "e16-owner-active-doctors");
  await page.getByRole("button", { name: /Hospital profile/i }).click();
  await page.getByLabel("Hospital name").fill("BharatDoc E2E Clinic 184256");
  await screenshot(page, "e16-owner-clinic-profile");

  const response = await fetch(urlFor("/api/clinic/admin"), {
    headers: { Authorization: `Bearer ${doctorToken}` }
  });
  logs.checks.normalDoctorAdminStatus = response.status;
}

async function testSession(page, account) {
  await page.goto(urlFor("/settings"), { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Settings" }).waitFor({ timeout: 30_000 });
  await screenshot(page, "e17-settings-before-signout");
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.getByText("Welcome to BharatDoc").waitFor({ timeout: 30_000 });
  await screenshot(page, "e17-signout-onboarding");
  await page.goto(urlFor("/dashboard"), { waitUntil: "networkidle" });
  await page.getByText("Welcome to BharatDoc").waitFor({ timeout: 30_000 });
  await screenshot(page, "e17-cleared-session-dashboard-redirect");
  await loginToKnownState(page, account, "e17-relogin");
  await page.getByRole("heading", { name: "Today's consultations" }).waitFor({ timeout: 30_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Today's consultations" }).waitFor({ timeout: 30_000 });
  await screenshot(page, "e17-session-persisted-after-reload");
}

async function overflowAudit(page) {
  return page.evaluate(() => ({
    url: window.location.href,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    offscreenButtons: Array.from(document.querySelectorAll("button,a"))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { text: node.textContent?.trim().slice(0, 60), left: rect.left, right: rect.right, width: rect.width };
      })
      .filter((item) => item.width > 0 && (item.left < -1 || item.right > window.innerWidth + 1))
  }));
}

async function responsiveAudit(browser, account) {
  const results = [];
  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "desktop", width: 1366, height: 900 }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    attachWatchers(page, `responsive-${viewport.name}`);
    await loginToKnownState(page, account, `e18-${viewport.name}`);
    for (const [name, pathname] of [
      ["dashboard", "/dashboard"],
      ["search", "/search"],
      ["recording", "/recordings/new"],
      ["settings", "/settings"]
    ]) {
      await page.goto(urlFor(pathname), { waitUntil: "networkidle" });
      await page.waitForTimeout(750);
      await screenshot(page, `e18-${viewport.name}-${name}`);
      results.push({ viewport: viewport.name, page: name, ...(await overflowAudit(page)) });
    }
    await context.close();
  }
  logs.checks.responsive = results;
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });
  const supabaseUrl = requiredEnv("SUPABASE_URL") || requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const admin = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const passwordClient = createClient(supabaseUrl, requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });

  await createConfirmedUser(admin, approvedDoctor);
  await createConfirmedUser(admin, rejectedDoctor);

  const ownerToken = await idToken(passwordClient, owner);
  const dashboard = await api("/api/dashboard", ownerToken);
  const clinicCode = dashboard.clinic.code;
  logs.checks.clinicCode = clinicCode;

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
  });

  try {
    const pendingContext = await browser.newContext({ viewport: { width: 412, height: 915 }, permissions: ["microphone"] });
    const pendingPage = await pendingContext.newPage();
    attachWatchers(pendingPage, "pending-approved-doctor");
    await loginToKnownState(pendingPage, approvedDoctor, "e06-approved-doctor");
    await joinClinic(pendingPage, approvedDoctor, clinicCode, "e06-approved-doctor", true);
    await verifyPendingGuards(pendingPage, "e07-pending");
    await pendingContext.close();

    const rejectedContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const rejectedPage = await rejectedContext.newPage();
    attachWatchers(rejectedPage, "rejected-doctor-join");
    await loginToKnownState(rejectedPage, rejectedDoctor, "e08-rejected-doctor");
    await joinClinic(rejectedPage, rejectedDoctor, clinicCode, "e08-rejected-doctor", false);
    await rejectedContext.close();

    const ownerRejectContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const ownerRejectPage = await ownerRejectContext.newPage();
    attachWatchers(ownerRejectPage, "owner-reject");
    await ownerReview(ownerRejectPage, rejectedDoctor.name, "reject", "e08");
    await ownerRejectContext.close();

    const rejectedGateContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const rejectedGatePage = await rejectedGateContext.newPage();
    attachWatchers(rejectedGatePage, "rejected-gate");
    await loginToKnownState(rejectedGatePage, rejectedDoctor, "e08-rejected-doctor-gate");
    await rejectedGatePage.getByText("Access not granted").waitFor({ timeout: 30_000 });
    await screenshot(rejectedGatePage, "e08-rejected-doctor-access-rejected");
    await rejectedGateContext.close();

    const ownerApproveContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const ownerApprovePage = await ownerApproveContext.newPage();
    attachWatchers(ownerApprovePage, "owner-approve");
    await ownerReview(ownerApprovePage, approvedDoctor.name, "approve", "e09");
    await ownerApproveContext.close();

    const approvedContext = await browser.newContext({ viewport: { width: 412, height: 915 }, permissions: ["microphone"] });
    const approvedPage = await approvedContext.newPage();
    attachWatchers(approvedPage, "approved-doctor");
    await testApprovedDoctorAccess(approvedPage, approvedDoctor);
    await testSearch(approvedPage, "P-E2E-184256-A");
    await testPreferences(approvedPage);
    const doctorToken = await idToken(passwordClient, approvedDoctor);
    await testClinicAdmin(approvedPage, doctorToken);
    await testSession(approvedPage, approvedDoctor);
    await approvedContext.close();

    await responsiveAudit(browser, approvedDoctor);

    logs.checks.normalDoctorAdminBlocked = logs.checks.normalDoctorAdminStatus === 403;
    logs.finishedAt = new Date().toISOString();
  } finally {
    await browser.close();
    await writeFile(logPath, `${JSON.stringify(logs, null, 2)}\n`);
  }
}

main().catch(async (error) => {
  logs.error = error instanceof Error ? error.stack ?? error.message : String(error);
  await mkdir(path.dirname(logPath), { recursive: true });
  await writeFile(logPath, `${JSON.stringify(logs, null, 2)}\n`);
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
