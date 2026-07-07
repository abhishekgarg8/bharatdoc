import { expect, test } from "@playwright/test";

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 1024 }
] as const;

const routes = [
  "/",
  "/faqs",
  "/onboarding?demo=1",
  "/h/pgimer?demo=1",
  "/dashboard?demo=1",
  "/search?demo=1",
  "/recordings/new?mockRecorder=1&demo=1",
  "/recordings/p-10481?demo=1",
  "/settings?demo=1",
  "/settings/prompt?demo=1",
  "/settings/language?demo=1",
  "/pending-approval?demo=1",
  "/access-rejected?demo=1",
  "/help-center",
  "/terms-privacy"
] as const;

async function readOverflow(page: import("@playwright/test").Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(100);
      return await page.evaluate(() => {
        const clientWidth = document.documentElement.clientWidth;
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const offenders = Array.from(document.querySelectorAll("body *"))
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              className: String(element.getAttribute("class") ?? ""),
              text: String(element.textContent ?? "").trim().slice(0, 80),
              left: Math.round(rect.left),
              right: Math.round(rect.right)
            };
          })
          .filter(({ left, right }) => left < -1 || right > clientWidth + 1)
          .slice(0, 3);

        return { clientWidth, scrollWidth, offenders };
      });
    } catch (error) {
      if (attempt === 2 || !String(error).includes("Execution context was destroyed")) {
        throw error;
      }
    }
  }

  throw new Error("Unable to read responsive metrics.");
}

async function readSmallTapTargets(page: import("@playwright/test").Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(100);
      return await page.evaluate(() =>
        Array.from(document.querySelectorAll("button, nav[aria-label='Primary navigation'] a"))
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
          })
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              text: String(element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 60),
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            };
          })
          .filter(({ width, height }) => width < 44 || height < 44)
      );
    } catch (error) {
      if (attempt === 2 || !String(error).includes("Execution context was destroyed")) {
        throw error;
      }
    }
  }

  throw new Error("Unable to read tap target metrics.");
}

test.describe("mobile responsive layouts", () => {
  for (const viewport of viewports) {
    test(`core routes do not overflow horizontally at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);

      for (const route of routes) {
        await page.goto(route);
        const overflow = await readOverflow(page);

        expect(overflow.offenders, route).toEqual([]);
        expect(overflow.scrollWidth, route).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
    });
  }

  test("mobile app buttons and bottom nav keep touch-friendly targets", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });

    for (const route of ["/dashboard?demo=1", "/search?demo=1", "/recordings/new?mockRecorder=1&demo=1", "/settings?demo=1"]) {
      await page.goto(route);
      const smallTargets = await readSmallTapTargets(page);

      expect(smallTargets, route).toEqual([]);
    }
  });
});
