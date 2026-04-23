import { expect, test } from "@playwright/test";

test("dashboard smoke renders Bharat Warmth home screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Dr. Aparna Iyer")).toBeVisible();
  await expect(page.getByText("Sunrise Clinic, Pune")).toBeVisible();
  await expect(page.getByRole("button", { name: /Start recording/i })).toBeVisible();
  await expect(page.getByText("P-10482")).toBeVisible();
});

test("onboarding smoke renders setup choices", async ({ page }) => {
  await page.goto("/onboarding");

  await expect(page.getByText("Welcome to BharatDoc")).toBeVisible();
  await expect(page.getByText("Join an existing clinic")).toBeVisible();
  await expect(page.getByText("Create a new clinic")).toBeVisible();
});

test("pending approval smoke renders locked state", async ({ page }) => {
  await page.goto("/pending-approval");

  await expect(page.getByText("Waiting for approval")).toBeVisible();
  await expect(page.getByText("MED42X")).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
