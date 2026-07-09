import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pgimerDir = resolve(here, "..");
const repoRoot = resolve(pgimerDir, "..", "..");
const framesDir = resolve(here, "frames");
const requireFromWeb = createRequire(resolve(repoRoot, "apps/web/package.json"));
const { chromium } = requireFromWeb("@playwright/test");

await mkdir(framesDir, { recursive: true });

const browser = await chromium.launch();

try {
  const pitch = await browser.newPage({ viewport: { width: 1200, height: 1700 } });
  await pitch.goto(`file://${resolve(pgimerDir, "director-one-pager.html")}`, { waitUntil: "networkidle" });
  await pitch.pdf({
    path: resolve(pgimerDir, "pgimer-director-one-pager.pdf"),
    format: "A4",
    printBackground: true,
  });

  const slides = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await slides.goto(`file://${resolve(here, "pgimer-director-demo-slides.html")}`, { waitUntil: "networkidle" });

  const frames = await slides.locator(".frame").all();
  for (const [index, frame] of frames.entries()) {
    await frame.screenshot({
      path: resolve(framesDir, `frame-${String(index + 1).padStart(2, "0")}.png`),
    });
  }

  console.log(`Rendered ${frames.length} frames and ${resolve(pgimerDir, "pgimer-director-one-pager.pdf")}`);
  console.log(`Repo root: ${repoRoot}`);
} finally {
  await browser.close();
}
