import { expect, test } from "@playwright/test";

test("dashboard smoke renders Bharat Warmth home screen", async ({ page }) => {
  await page.goto("/dashboard?demo=1");

  await expect(page.getByText("Dr. Aparna Iyer")).toBeVisible();
  await expect(page.getByText("Sunrise Hospital, Pune")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start recording/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Search by Patient ID/i })).toHaveAttribute("href", "/search");
  await expect(page.getByText("P-10482")).toBeVisible();
});

test("hospital search finds records and opens completed consultations", async ({ page }) => {
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
  await expect(page.getByLabel("Local recording P-10500 awaiting transcription")).toBeVisible();
  await expect(page.getByRole("link", { name: "Resume recording P-10500" })).toHaveAttribute("href", "/recordings/new");
  await expect(page.getByRole("link", { name: "Open recording P-10500" })).toHaveCount(0);
});

test("root landing page renders and links to onboarding", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AI Scribe for Indian clinics" })).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Indian doctor reviewing a consultation with a patient while a phone records on the desk"
    })
  ).toBeVisible();
  await expect(page.getByText("Turn every consultation into an AI-drafted, doctor-reviewed summary and Patient ID PDF.")).toBeVisible();
  await expect(page.getByRole("link", { name: "FAQs" })).toHaveAttribute("href", "/faqs");
  await page.getByRole("link", { name: "Get started" }).first().click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("public FAQs page renders doctor adoption guidance", async ({ page }) => {
  await page.goto("/faqs");

  await expect(page.getByRole("heading", { name: "FAQs for doctors" })).toBeVisible();
  await expect(page.getByText("Is BharatDoc currently free?")).toBeVisible();
  await expect(page.getByText(/expect to introduce paid plans soon/i)).toBeVisible();
  await expect(page.getByText("Is patient data safe and private?")).toBeVisible();
  await expect(page.getByText(/doctor remains responsible for the final clinical judgment/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /start using bharatdoc/i })).toHaveAttribute("href", "/onboarding");
});

test("demo onboarding join flow reaches pending approval", async ({ page }) => {
  await page.goto("/onboarding?demo=1");

  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText("Profile details")).toBeVisible();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByText("Your hospital")).toBeVisible();
  await expect(page.getByText("Hospital selected")).toBeVisible();
  await page.getByRole("button", { name: /request to join/i }).click();
  await expect(page).toHaveURL(/\/pending-approval\?demo=1$/);
});

test("onboarding specialization dropdown supports other text", async ({ page }) => {
  await page.goto("/onboarding?demo=1");

  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText("Profile details")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Specialization" })).toBeVisible();
  await page.getByRole("combobox", { name: "Specialization" }).selectOption("Other");
  await expect(page.getByLabel("Other specialization")).toBeVisible();
  await page.getByLabel("Other specialization").fill("Sports Medicine");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByText("Your hospital")).toBeVisible();
});

test("demo onboarding owner flow reaches dashboard", async ({ page }) => {
  await page.goto("/onboarding?demo=1");

  await page.getByRole("button", { name: /create account/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByRole("button", { name: /create hospital/i }).click();
  await page.getByRole("button", { name: /create hospital & continue/i }).click();
  await expect(page).toHaveURL(/\/dashboard\?demo=1$/);
  await expect(page.getByRole("heading", { name: "Consultations" })).toBeVisible();
  await expect(page.getByText("Today's consultations")).toHaveCount(0);
});

test("onboarding smoke renders email password entry", async ({ page }) => {
  await page.goto("/onboarding");

  await expect(page.getByText("Welcome to BharatDoc")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
});

test("PGIMER onboarding smoke renders branded locked join entry", async ({ page }) => {
  await page.goto("/h/pgimer?demo=1");

  await expect(page.getByRole("img", { name: "Postgraduate Institute of Medical Education and Research Chandigarh" })).toBeVisible();
  await expect(page.getByText("AI Scribe for PGIMER")).toBeVisible();
  await expect(page.getByText("Record consultations and create doctor-reviewed clinical notes and Patient ID PDFs.")).toBeVisible();
  await expect(page.getByText("Powered by BharatDoc")).toHaveCount(1);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.getByRole("button", { name: /^continue$/i }).click();
  await expect(page.getByText("PGIMER pilot workspace", { exact: true })).toBeVisible();
  await expect(page.getByText("New PGIMER doctors join this hospital workspace after signup.")).toBeVisible();
  await expect(page.getByLabel("Clinic Code")).toHaveValue("PGIMER");
  await expect(page.getByRole("button", { name: /join pgimer/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /create hospital/i })).toHaveCount(0);
  await page.getByRole("button", { name: /join pgimer/i }).click();
  await expect(page).toHaveURL(/\/dashboard\?demo=1$/);
});

test("pending approval smoke renders locked state", async ({ page }) => {
  await page.goto("/pending-approval?demo=1");

  await expect(page.getByText("Waiting for approval")).toBeVisible();
  await expect(page.getByText("Dr. Kavita Rao")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});

test("settings smoke renders owner admin surface", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("Hospital admin")).toBeVisible();
  await expect(page.getByRole("button", { name: /doctor join code/i })).toBeVisible();
  await expect(page.getByText("Share with doctors to join")).toBeVisible();
  await expect(page.getByRole("link", { name: /help & support/i })).toHaveAttribute("href", "/help-center");
  await expect(page.getByRole("link", { name: /terms and privacy/i })).toHaveAttribute("href", "/terms-privacy");
  await expect(page.getByText("Delete account")).toHaveCount(0);
  await expect(page.getByText("Dr. Meera Shah")).toBeVisible();
  await expect(page.getByRole("button", { name: /approve/i })).toBeVisible();
});

test("help center and terms pages render from settings links", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await page.getByRole("link", { name: /help & support/i }).click();
  await expect(page).toHaveURL(/\/help-center$/);
  await expect(page.getByRole("heading", { name: "Help Center" })).toBeVisible();
  await expect(page.getByText("How do doctors join a hospital workspace?")).toBeVisible();
  await page.goto("/settings?demo=1");
  await page.getByRole("link", { name: /terms and privacy/i }).click();
  await expect(page).toHaveURL(/\/terms-privacy$/);
  await expect(page.getByRole("heading", { name: "Terms and Privacy" })).toBeVisible();
  await expect(page.getByText("Information we process")).toBeVisible();
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
  await expect(page.getByText("Current hospital members with active BharatDoc access.")).toBeVisible();
  const leenaCard = page.locator("article").filter({ hasText: "Dr. Leena Joshi" });
  const ownerCard = page.locator("article").filter({ hasText: "Dr. Aparna Iyer" });
  await expect(leenaCard).toBeVisible();
  await expect(leenaCard.getByText("doctor", { exact: true })).toBeVisible();
  await expect(ownerCard.getByText("owner", { exact: true })).toBeVisible();
});

test("settings owner can edit the hospital profile locally", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await page.getByRole("button", { name: /hospital profile/i }).first().click();
  await page.getByLabel("Hospital name").fill("Sunrise Family Hospital");
  await page.getByLabel("Hospital address").fill("24 Baner Road, Pune 411045");
  await page.getByRole("button", { name: /save hospital/i }).click();
  await expect(page.getByText("Hospital profile saved.")).toBeVisible();
  await expect(page.getByText("Sunrise Family Hospital")).toBeVisible();
});

test("settings owner can edit the doctor join code locally", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await page.getByRole("button", { name: /doctor join code/i }).first().click();
  await expect(page.getByRole("heading", { name: "Doctor join code" })).toBeVisible();
  await page.getByLabel("Doctor join code").fill("ABC123");
  await page.getByRole("button", { name: /save code/i }).click();
  await expect(page.getByText("Doctor join code saved.")).toBeVisible();
  await expect(page.getByText("ABC123")).toBeVisible();
});

test("settings profile edit opens and saves locally", async ({ page }) => {
  await page.goto("/settings?demo=1");

  await page.getByRole("button", { name: "Edit doctor profile" }).click();
  await expect(page.getByRole("heading", { name: "Doctor profile" })).toBeVisible();
  await page.getByLabel("Doctor name").fill("Dr. Nisha Shah");
  await page.getByLabel("Specialization").selectOption("Pediatrics");
  await page.getByRole("button", { name: /save profile/i }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();
  await expect(page.getByText("Dr. Nisha Shah")).toBeVisible();
  await expect(page.getByText("Pediatrics")).toBeVisible();
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
