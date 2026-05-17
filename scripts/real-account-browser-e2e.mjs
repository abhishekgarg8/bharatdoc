import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const require = createRequire(path.join(projectRoot, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");

const baseUrl = trimTrailingSlash(
  process.env.REAL_E2E_BASE_URL ?? "http://127.0.0.1:3000",
);
const outputDir = path.resolve(
  projectRoot,
  process.env.REAL_E2E_OUTPUT_DIR ??
    `output/playwright/real-account-${new Date().toISOString().slice(0, 10)}`,
);
const phase = process.env.REAL_E2E_PHASE ?? "signup";
const shouldCreateAccount = process.env.REAL_E2E_CREATE_ACCOUNT === "1";
const shouldRunAppFlow = process.env.REAL_E2E_RUN_APP_FLOW !== "0";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function urlFor(pathname) {
  return `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function workerUrlFor(pathname) {
  const workerBaseUrl = process.env.NEXT_PUBLIC_RAILWAY_WORKER_URL?.trim();

  if (!workerBaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_RAILWAY_WORKER_URL is required for direct audio-file fallback.",
    );
  }

  return `${trimTrailingSlash(workerBaseUrl)}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function screenshot(page, name) {
  const filePath = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  console.log(`screenshot ${filePath}`);
}

async function createSpeechAudio() {
  if (process.env.REAL_E2E_AUDIO_FILE) {
    return process.env.REAL_E2E_AUDIO_FILE;
  }

  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "bharatdoc-real-browser-"),
  );
  const aiffPath = path.join(tempDir, "consultation.aiff");
  const wavPath = path.join(tempDir, "consultation.wav");

  try {
    execFileSync(
      "say",
      [
        "-v",
        "Samantha",
        "-o",
        aiffPath,
        "Patient has fever for two days and mild cough.",
      ],
      {
        stdio: "ignore",
      },
    );
    execFileSync(
      "afconvert",
      ["-f", "WAVE", "-d", "LEI16@16000", aiffPath, wavPath],
      {
        stdio: "ignore",
      },
    );
  } catch {
    await rm(tempDir, { recursive: true, force: true });
    return null;
  }

  process.on("exit", () => {
    spawnSync("rm", ["-rf", tempDir]);
  });

  return wavPath;
}

async function fillCredentials(page, email, password) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
}

async function isVisible(locator, timeout = 500) {
  return locator.isVisible({ timeout }).catch(() => false);
}

async function waitForSignupResult(page) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await isVisible(page.getByText("Profile details"))) {
      return "profile";
    }

    if (
      await isVisible(
        page.getByRole("heading", { name: "Today's consultations" }),
      )
    ) {
      return "dashboard";
    }

    if (await isVisible(page.getByRole("alert"))) {
      return "message";
    }

    await page.waitForTimeout(500);
  }

  throw new Error("Signup did not finish within 30 seconds.");
}

async function waitForLoggedInState(page) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (await isVisible(page.getByText("Profile details"))) {
      return "profile";
    }

    if (
      await isVisible(
        page.getByRole("heading", { name: "Today's consultations" }),
      )
    ) {
      return "dashboard";
    }

    if (await isVisible(page.getByText("Approval pending"))) {
      return "pending";
    }

    if (await isVisible(page.getByText("Access rejected"))) {
      return "rejected";
    }

    await page.waitForTimeout(500);
  }

  const bodyText = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  throw new Error(
    `Login did not reach a known app state. Current page: ${bodyText.slice(0, 500)}`,
  );
}

async function waitForDashboardReady(page) {
  await page
    .waitForURL(/\/dashboard/, { timeout: 30_000 })
    .catch(() => undefined);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (
      await isVisible(
        page.getByRole("heading", { name: "Today's consultations" }),
        10_000,
      )
    ) {
      return;
    }

    const bodyText = await page
      .locator("body")
      .innerText()
      .catch(() => "");

    if (
      /unable to load dashboard|doctor profile has not been created/i.test(
        bodyText,
      ) &&
      attempt < 2
    ) {
      await page.reload({ waitUntil: "networkidle" });
      continue;
    }

    throw new Error(
      `Dashboard did not become ready. Current page: ${bodyText.slice(0, 500)}`,
    );
  }
}

async function waitForTranscriptionReady(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deadline = Date.now() + 180_000;

    while (Date.now() < deadline) {
      if (await isVisible(page.getByText("Transcript ready."), 1_000)) {
        return;
      }

      if (
        await isVisible(
          page.getByText("Unable to transcribe recording."),
          1_000,
        )
      ) {
        await screenshot(
          page,
          `13-recording-transcription-failed-attempt-${attempt + 1}`,
        );
        const retryButton = page.getByRole("button", { name: /retry/i });

        if ((await retryButton.count()) === 1 && attempt === 0) {
          await retryButton.click();
          break;
        }

        return false;
      }
    }
  }

  return false;
}

async function getIdToken(email, password) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ??
    process.env.SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Supabase URL and anon key are required for direct audio-file fallback.",
    );
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session?.access_token) {
    throw new Error("Unable to sign in for direct audio-file fallback.");
  }

  return data.session.access_token;
}

async function findRecordingIdForPatient(idToken, patientId) {
  const params = new URLSearchParams({ patient_id: patientId });
  const response = await fetch(urlFor(`/api/patients/search?${params}`), {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        "Unable to find recording for audio-file fallback.",
    );
  }

  const record =
    payload.records?.find((candidate) => candidate.patient_id === patientId) ??
    payload.records?.[0];

  if (!record?.id) {
    throw new Error(
      `Unable to find recording ${patientId} for audio-file fallback.`,
    );
  }

  return record.id;
}

async function transcribeWithAudioFile(email, password, patientId, audioPath) {
  if (!audioPath) {
    throw new Error(
      "An audio file is required for direct transcription fallback.",
    );
  }

  const idToken = await getIdToken(email, password);
  const recordingId = await findRecordingIdForPatient(idToken, patientId);
  const body = new FormData();
  const audio = await readFile(audioPath);

  body.set("recording_id", recordingId);
  body.set(
    "audio",
    new Blob([audio], { type: "audio/wav" }),
    path.basename(audioPath),
  );

  const response = await fetch(workerUrlFor("/api/transcribe"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
    body,
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? "Direct audio-file transcription failed.",
    );
  }

  return payload;
}

async function login(page, email, password) {
  await page.goto(urlFor("/onboarding"), { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /log in/i }).click();
  await fillCredentials(page, email, password);
  await screenshot(page, "04-login-filled");
  await page.locator("button.bg-terracotta", { hasText: "Log in" }).click();
  const state = await waitForLoggedInState(page);
  await screenshot(
    page,
    state === "dashboard"
      ? "05-dashboard-after-login"
      : "05-profile-after-login",
  );
  return state;
}

async function createOwnerProfile(page) {
  const profileName =
    process.env.REAL_E2E_DOCTOR_NAME ??
    `Dr. Real E2E ${Date.now().toString().slice(-4)}`;
  const specialization =
    process.env.REAL_E2E_SPECIALIZATION ?? "General Physician";
  const clinicName =
    process.env.REAL_E2E_CLINIC_NAME ??
    `Real E2E Clinic ${Date.now().toString().slice(-5)}`;
  const clinicAddress =
    process.env.REAL_E2E_CLINIC_ADDRESS ?? "24 Baner Road, Pune 411045";

  await page.getByLabel("Full name").fill(profileName);
  await page.getByLabel("Specialization").fill(specialization);
  await screenshot(page, "06-profile-filled");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByText("Your hospital").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /create hospital/i }).click();
  await page.getByLabel("Hospital name").fill(clinicName);
  await page.getByLabel("Address").fill(clinicAddress);
  await screenshot(page, "07-owner-hospital-filled");
  await page
    .getByRole("button", { name: /create hospital & continue/i })
    .click();
  await waitForDashboardReady(page);
  await screenshot(page, "08-owner-dashboard");
}

async function runCoreAppFlow(page, audioPath) {
  const patientId =
    process.env.REAL_E2E_PATIENT_ID ??
    `P-E2E-${Date.now().toString().slice(-6)}`;
  const email = requiredEnv("REAL_E2E_EMAIL");
  const password = requiredEnv("REAL_E2E_PASSWORD");

  await page.goto(urlFor("/settings"), { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Settings" })
    .waitFor({ timeout: 30000 });
  await screenshot(page, "09-settings");

  await page.goto(urlFor("/recordings/new"), { waitUntil: "networkidle" });
  await page
    .getByRole("heading", { name: "Recording" })
    .waitFor({ timeout: 30000 });
  await page.getByLabel("Patient ID").fill(patientId);
  await page.getByLabel("Label").fill("Real browser E2E consultation");
  await screenshot(page, "10-recording-ready");
  await page.getByRole("button", { name: /start recording/i }).click();
  await page.getByText("Recording started.").waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);
  await screenshot(page, "11-recording-active");
  await page.getByRole("button", { name: /^stop$/i }).click();
  await page
    .getByText("Recording saved on this device.")
    .waitFor({ timeout: 30000 });
  await screenshot(page, "12-recording-saved");
  await page.getByRole("button", { name: /transcribe/i }).click();
  if (await waitForTranscriptionReady(page)) {
    await screenshot(page, "13-recording-transcribed");
  } else {
    await transcribeWithAudioFile(email, password, patientId, audioPath);
    await page.goto(urlFor("/dashboard"), { waitUntil: "networkidle" });
    await page.getByText(patientId).waitFor({ timeout: 30000 });
    await screenshot(page, "13-recording-transcribed-audio-file");
  }

  await page.goto(urlFor("/dashboard"), { waitUntil: "networkidle" });
  await page.getByText(patientId).waitFor({ timeout: 30000 });
  await screenshot(page, "14-dashboard-with-real-recording");
  await page.getByRole("link", { name: `Open recording ${patientId}` }).click();
  await page
    .getByRole("heading", { name: patientId })
    .waitFor({ timeout: 30000 });
  await screenshot(page, "15-recording-detail-transcript");
  await page.getByRole("button", { name: /generate/i }).click();
  await page
    .getByRole("textbox", { name: "Summary" })
    .waitFor({ timeout: 180000 });
  await screenshot(page, "16-recording-detail-summary");
  const saveButton = page.getByRole("button", { name: /^save$/i });

  if (await saveButton.isEnabled()) {
    await saveButton.click();
    await page.getByText("Summary saved.").waitFor({ timeout: 30000 });
  }

  await page.getByRole("button", { name: "PDF" }).click();
  await page.getByText("PDF generated.").waitFor({ timeout: 180000 });
  await screenshot(page, "17-recording-detail-pdf");

  await page.goto(urlFor("/search"), { waitUntil: "networkidle" });
  await page.getByLabel("Patient ID").fill(patientId);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByText(`Results for ${patientId}`).waitFor({ timeout: 30000 });
  await screenshot(page, "18-search-results");
}

async function main() {
  await mkdir(outputDir, { recursive: true });

  const email = process.env.REAL_E2E_EMAIL?.trim();
  const password = process.env.REAL_E2E_PASSWORD?.trim();
  const confirmationUrl = process.env.REAL_E2E_CONFIRM_URL?.trim();
  const audioPath = await createSpeechAudio();
  const browserArgs = [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ];

  if (audioPath) {
    browserArgs.push(`--use-file-for-fake-audio-capture=${audioPath}`);
  }

  const browser = await chromium.launch({
    headless: process.env.REAL_E2E_HEADED !== "1",
    args: browserArgs,
  });
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    permissions: ["microphone"],
  });
  const page = await context.newPage();

  try {
    await page.goto(urlFor("/onboarding"), { waitUntil: "networkidle" });
    await screenshot(page, "01-onboarding-entry");

    if (phase === "signup") {
      if (!shouldCreateAccount) {
        console.log(
          "Dry run stopped before account creation. Set REAL_E2E_CREATE_ACCOUNT=1 with REAL_E2E_EMAIL and REAL_E2E_PASSWORD to submit signup.",
        );
        return;
      }

      await fillCredentials(
        page,
        requiredEnv("REAL_E2E_EMAIL"),
        requiredEnv("REAL_E2E_PASSWORD"),
      );
      await screenshot(page, "02-signup-filled");
      await page.getByRole("button", { name: /create account/i }).click();
      await waitForSignupResult(page);
      await screenshot(page, "03-after-signup-submit");

      const bodyText = await page.locator("body").innerText();
      if (/confirm your email/i.test(bodyText) && !confirmationUrl) {
        console.log(
          "Signup submitted. Set REAL_E2E_CONFIRM_URL to the emailed confirmation link and rerun with REAL_E2E_PHASE=resume.",
        );
        return;
      }
    }

    if (confirmationUrl) {
      await page.goto(confirmationUrl, { waitUntil: "networkidle" });
      await screenshot(page, "03-email-confirmed-callback");
    }

    if (phase === "resume" || confirmationUrl) {
      const state = await login(
        page,
        requiredEnv("REAL_E2E_EMAIL"),
        requiredEnv("REAL_E2E_PASSWORD"),
      );

      if (state === "dashboard") {
        await waitForDashboardReady(page);
      } else if (state !== "profile") {
        throw new Error(
          `Expected active owner dashboard or profile onboarding after login, got ${state}.`,
        );
      }
    }

    if (
      !(await isVisible(
        page.getByRole("heading", { name: "Today's consultations" }),
      ))
    ) {
      await createOwnerProfile(page);
    }

    if (shouldRunAppFlow) {
      await runCoreAppFlow(page, audioPath);
    }

    console.log(
      `Real browser E2E completed. Screenshots saved in ${outputDir}`,
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
