import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const runtime = process.env.NODE_RUNTIME_MODULES || "C:/Users/jayax/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = createRequire(path.join(runtime, "playwright/package.json"))("playwright");
const browser = await chromium.launch({ headless: true });
const out = path.resolve("model_output/measurement_audit_v2/ui-check");
fs.mkdirSync(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(process.env.APP_URL || "http://127.0.0.1:5175/");
  await page.getByRole("button", { name: "Try demo without account" }).click();
  await page.locator("textarea").fill("Original athlete note.");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("pole vault videos miss and makes/11 feet 6 inches, make.mp4"));
  await page.getByRole("button", { name: "Analyze full video", exact: true }).click();
  await page.getByText(/Analysis complete: pose returned/).waitFor({ timeout: 180000 });
  const notes = await page.locator("textarea").inputValue();
  assert.ok(notes.includes("Original athlete note."));
  assert.ok(notes.includes("image-plane-v2"));
  assert.equal(await page.getByLabel("Approach time in seconds", { exact: true }).inputValue(), "");
  assert.ok(await page.getByText(/Predictions paused:/).count());
  for (const [label, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    await page.screenshot({ path: path.join(out, `${label}.png`), fullPage: true });
    const fit = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
      objectFit: getComputedStyle(document.querySelector("video")).objectFit,
      canvas: Array.from(document.querySelector("canvas").getContext("2d").getImageData(0, 0,
        document.querySelector("canvas").width, document.querySelector("canvas").height).data).some(v => v > 0) }));
    assert.ok(fit.width <= fit.viewport + 1, `${label} overflow`);
    assert.equal(fit.objectFit, "contain");
    assert.ok(fit.canvas, `${label} blank pose overlay`);
    console.log(label, fit);
  }
  assert.deepEqual(errors, []);
  console.log("Full-video analysis, note retention, no fabricated approach duration, paused predictions and responsive layout passed.");
} finally { await browser.close(); }
