import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = process.cwd();
const dataDir = path.join(root, "pole vault videos miss and makes");
const outDir = path.join(root, "model_output");
const extractor = path.join(root, "tools", "batch_pose_extract.html");
const outputCsv = path.join(outDir, "vault_pose_extracted_dataset.csv");
const outputJson = path.join(outDir, "vault_pose_extracted_dataset.json");

function parseResult(name) {
  const lower = name.toLowerCase();
  if (lower.includes("make")) return "make";
  if (lower.includes("miss")) return "miss";
  return "";
}

function parseHeightMeters(name) {
  const lower = name.toLowerCase();
  const feet = lower.match(/(\d+(?:\.\d+)?)\s*feet?(?:\s+(\d+(?:\.\d+)?)\s*inches?)?/);
  if (feet) return (Number(feet[1]) + Number(feet[2] || 0) / 12) * 0.3048;
  const meters = lower.match(/(\d+(?:\.\d+)?)\s*meters?/);
  if (meters) return Number(meters[1]);
  return "";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const files = fs
  .readdirSync(dataDir)
  .filter((file) => file.toLowerCase().endsWith(".mp4"))
  .sort()
  .map((file) => path.join(dataDir, file));

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setDefaultTimeout(180000);
page.on("console", (message) => console.log(`[browser] ${message.text()}`));
await page.goto(pathToFileURL(extractor).href);
await page.setInputFiles("#files", files);
await page.waitForFunction(() => window.__vaultLabDone === true, null, { timeout: 20 * 60 * 1000 });
const error = await page.evaluate(() => window.__vaultLabError);
if (error) {
  await browser.close();
  throw new Error(error);
}

const extracted = await page.evaluate(() => window.__vaultLabResults);
await browser.close();

const rows = extracted.map((row) => ({
  ...row,
  bar_height_m: parseHeightMeters(row.file),
  result: parseResult(row.file),
}));

const headers = [
  "file",
  "result",
  "bar_height_m",
  "duration_s",
  "width",
  "height",
  "usable_frames",
  "avg_visible_joints",
  "takeoff_time_s",
  "clearance_time_s",
  "flight_time_s",
  "takeoff_angle_deg",
  "inversion_angle_deg",
  "max_inversion_time_s",
  "status",
];

fs.writeFileSync(outputJson, JSON.stringify(rows, null, 2));
fs.writeFileSync(outputCsv, [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n"));
console.log(outputCsv);
console.log(`rows ${rows.length}`);
