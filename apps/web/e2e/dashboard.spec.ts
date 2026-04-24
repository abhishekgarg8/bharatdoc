import { expect, test } from "@playwright/test";

test("dashboard smoke renders Bharat Warmth home screen", async ({ page }) => {
  await page.goto("/dashboard?demo=1");

  await expect(page.getByText("Dr. Aparna Iyer")).toBeVisible();
  await expect(page.getByText("Sunrise Clinic, Pune")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start recording/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Search by Patient ID/i })).toHaveAttribute("href", "/search");
  await expect(page.getByText("P-10482")).toBeVisible();
});

test("clinic search finds records and opens completed consultations", async ({ page }) => {
  await page.goto("/search?demo=1");

  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
  await page.getByLabel("Patient ID").fill("P-10470");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Results for P-10470")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open recording P-10470" })).toBeVisible();
  await page.goto("/recordings/p-10470?demo=1");
  await expect(page).toHaveURL(/\/recordings\/p-10470\?demo=1$/);
  await expect(page.getByLabel("PDF saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open PDF" })).toBeVisible();
});

test("recording detail smoke generates and edits a summary", async ({ page }) => {
  await page.goto("/recordings/p-10481?demo=1");

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
  await page.goto("/recordings/new?mockRecorder=1&demo=1");

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
  await page.goto("/dashboard?demo=1");
  await expect(page.getByText("P-10500")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open recording P-10500" }).getByLabel("Stored offline")).toBeVisible();
});

test("root routes unauthenticated users to onboarding", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/onboarding$/);
});

test("demo onboarding join flow reaches pending approval", async ({ page }) => {
  await page.goto("/onboarding?demo=1");

  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText("Profile details")).toBeVisible();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByText("Your clinic")).toBeVisible();
  await page.getByRole("button", { name: /check clinic code/i }).click();
  await expect(page.getByText("Clinic found")).toBeVisible();
  await page.getByRole("button", { name: /request to join/i }).click();
  await expect(page).toHaveURL(/\/pending-approval$/);
});

test("demo onboarding owner flow reaches dashboard", async ({ page }) => {
  await page.goto("/onboarding?demo=1");

  await page.getByRole("button", { name: /create account/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByRole("button", { name: /create clinic/i }).click();
  await page.getByRole("button", { name: /create clinic & continue/i }).click();
  await expect(page).toHaveURL(/\/dashboard\?demo=1$/);
  await expect(page.getByText("Today's consultations")).toBeVisible();
});

test("onboarding smoke renders email password entry", async ({ page }) => {
  await page.goto("/onboarding");

  await expect(page.getByText("Welcome to BharatDoc")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
});

test("pending approval smoke renders locked state", async ({ page }) => {
  await page.goto("/pending-approval");

  await expect(page.getByText("Waiting for approval")).toBeVisible();
  await expect(page.getByText("MED42X")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});

test("settings smoke renders owner admin surface", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Clinic admin")).toBeVisible();
  await expect(page.getByText("Dr. Meera Shah")).toBeVisible();
  await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
});

test("settings owner approval removes pending doctor", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await expect(page.getByText("Dr. Meera Shah")).toBeVisible();
  await page.getByRole("button", { name: /approve/i }).click();
  await expect(page.getByText("Dr. Meera Shah approved.")).toBeVisible();
  await expect(page.getByText("No pending join requests.")).toBeVisible();
});

test("settings owner can inspect active doctors", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await page.getByRole("button", { name: /active doctors/i }).first().click();
  await expect(page.getByText("Current clinic members with active BharatDoc access.")).toBeVisible();
  const leenaCard = page.locator("article").filter({ hasText: "Dr. Leena Joshi" });
  const ownerCard = page.locator("article").filter({ hasText: "Dr. Aparna Iyer" });
  await expect(leenaCard).toBeVisible();
  await expect(leenaCard.getByText("doctor", { exact: true })).toBeVisible();
  await expect(ownerCard.getByText("owner", { exact: true })).toBeVisible();
});

test("settings owner can edit the clinic profile locally", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await page.getByRole("button", { name: /clinic profile/i }).first().click();
  await page.getByLabel("Clinic name").fill("Sunrise Family Clinic");
  await page.getByLabel("Clinic address").fill("24 Baner Road, Pune 411045");
  await page.getByLabel("Clinic code").fill("MED43Y");
  await page.getByRole("button", { name: /save clinic/i }).click();
  await expect(page.getByText("Clinic profile saved.")).toBeVisible();
  await expect(page.getByText("MED43Y")).toBeVisible();
});

test("settings prompt editor validates and previews prompts", async ({ page }) => {
  await page.goto("/settings/prompt?demo=1");

  await expect(page.getByRole("heading", { name: "Summary prompt" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveValue(/{{transcript}}/);
  await page.getByRole("button", { name: /test sample/i }).click();
  await expect(page.getByText(/Patient reports fever/)).toBeVisible();
});

test("settings language screen renders transcription options", async ({ page }) => {
  await page.goto("/settings/language?demo=1");

  await expect(page.getByRole("heading", { name: "Language" })).toBeVisible();
  await expect(page.getByRole("button", { name: /auto-detect/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /hinglish/i })).toBeVisible();
});

test("pwa manifest exposes installable app metadata", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();

  expect(manifest).toMatchObject({
    name: "BharatDoc",
    short_name: "BharatDoc",
    display: "standalone",
    background_color: "#FAF5EA",
    theme_color: "#C24A2A"
  });
});
