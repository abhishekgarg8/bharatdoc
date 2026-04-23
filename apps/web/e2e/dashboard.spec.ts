import { expect, test } from "@playwright/test";

test("dashboard smoke renders Bharat Warmth home screen", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByText("Dr. Aparna Iyer")).toBeVisible();
  await expect(page.getByText("Sunrise Clinic, Pune")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start recording/i })).toBeVisible();
  await expect(page.getByText("P-10482")).toBeVisible();
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
