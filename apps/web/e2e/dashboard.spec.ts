import { expect, test } from "@playwright/test";

test("dashboard smoke renders Bharat Warmth home screen", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByText("Dr. Aparna Iyer")).toBeVisible();
  await expect(page.getByText("Sunrise Clinic, Pune")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start recording/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Search by Patient ID/i })).toHaveAttribute("href", "/search");
  await expect(page.getByText("P-10482")).toBeVisible();
});

test("clinic search finds records and opens completed consultations", async ({ page }) => {
  await page.goto("/search");

  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
  await page.getByLabel("Patient ID").fill("P-10470");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Results for P-10470")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open recording P-10470" })).toBeVisible();
  await page.getByRole("link", { name: "Open recording P-10470" }).click();
  await expect(page).toHaveURL(/\/recordings\/p-10470$/);
  await expect(page.getByLabel("PDF saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open PDF" })).toBeVisible();
});

test("recording detail smoke generates and edits a summary", async ({ page }) => {
  await page.goto("/recordings/p-10481");

  await expect(page.getByRole("heading", { name: "P-10481" })).toBeVisible();
  await expect(page.getByText(/I have had fever for two days/)).toBeVisible();
  await page.getByRole("button", { name: /generate/i }).click();
  await expect(page.getByRole("textbox", { name: "Summary" })).toHaveValue(/Chief Complaint/);
  await page.getByRole("textbox", { name: "Summary" }).fill("Edited summary for patient fever.");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText("Summary saved.")).toBeVisible();
  await page.getByRole("button", { name: "PDF" }).click();
  await expect(page.getByText("PDF generated.")).toBeVisible();
  await expect(page.getByLabel("PDF saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open PDF" })).toBeVisible();
});

test("local recording flow records, transcribes, and returns to dashboard", async ({ page }) => {
  await page.goto("/recordings/new?mockRecorder=1");

  await expect(page.getByRole("heading", { name: "Recording" })).toBeVisible();
  await page.getByLabel("Patient ID").fill("P-10500");
  await page.getByLabel("Label").fill("Walk-in fever review");
  await page.getByRole("button", { name: /start recording/i }).click();
  await expect(page.getByText("Recording started.")).toBeVisible();
  await page.getByRole("button", { name: /stop/i }).click();
  await expect(page.getByText("Recording saved on this device.")).toBeVisible();
  await page.getByRole("button", { name: /transcribe/i }).click();
  await expect(page.getByText("Transcript ready.")).toBeVisible();
  await expect(page.getByText(/mild cough/)).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("P-10500")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open recording P-10500" }).getByLabel("Stored offline")).toBeVisible();
});

test("root routes unauthenticated users to onboarding", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/onboarding$/);
});

test("onboarding smoke renders phone OTP entry", async ({ page }) => {
  await page.goto("/onboarding");

  await expect(page.getByText("Welcome to BharatDoc")).toBeVisible();
  await expect(page.getByRole("button", { name: /Send OTP/i })).toBeVisible();
});

test("pending approval smoke renders locked state", async ({ page }) => {
  await page.goto("/pending-approval");

  await expect(page.getByText("Waiting for approval")).toBeVisible();
  await expect(page.getByText("MED42X")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});

test("settings smoke renders owner admin surface", async ({ page }) => {
  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Clinic admin")).toBeVisible();
  await expect(page.getByText("Dr. Meera Shah")).toBeVisible();
  await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
});

test("settings prompt editor validates and previews prompts", async ({ page }) => {
  await page.goto("/settings/prompt");

  await expect(page.getByRole("heading", { name: "Summary prompt" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveValue(/{{transcript}}/);
  await page.getByRole("button", { name: /test sample/i }).click();
  await expect(page.getByText(/Patient reports fever/)).toBeVisible();
});

test("settings language screen renders transcription options", async ({ page }) => {
  await page.goto("/settings/language");

  await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  await expect(page.getByRole("button", { name: /auto-detect/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /hinglish/i })).toBeVisible();
});
