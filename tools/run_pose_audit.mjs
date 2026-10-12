import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "vite";

let require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch {
  const runtime = process.env.NODE_RUNTIME_MODULES || "C:/Users/jayax/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
  require = createRequire(path.join(runtime, "playwright", "package.json"));
  ({ chromium } = require("playwright"));
}
const root = process.cwd();
const dataDir = path.join(root, "pole vault videos miss and makes");
const requested = process.argv.slice(2);
const names = requested.includes("--all") ? fs.readdirSync(dataDir).filter(f => f.endsWith(".mp4")).sort()
  : requested.length ? requested : ["11 feet 6 inches, make.mp4", "11 feet 6 inches, miss.mp4", "5.4 meters, miss.mp4"];
for (const name of names) {
  if (path.basename(name) !== name || !fs.existsSync(path.join(dataDir, name))) throw new Error(`Unknown clip: ${name}`);
}
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(root, "model_output", "measurement_audit_v2", runId);
fs.mkdirSync(outDir, { recursive: true });
const server = await createServer({ optimizeDeps: { noDiscovery: true, entries: [] },
  server: { host: "127.0.0.1", port: 0, open: false, watch: null } });
await server.listen();
let browser;
try {
  const address = server.httpServer.address();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("console", msg => { if (/^(Extracted|Loading|Metadata)/.test(msg.text())) console.log(msg.text()); });
  page.on("pageerror", error => console.error(error));
  await page.goto(`http://127.0.0.1:${address.port}/tools/batch_pose_extract_v2.html`);
  await page.setInputFiles("#files", names.map(name => path.join(dataDir, name)));
  const progress = setInterval(async () => {
    try { console.log(await page.locator("#status").innerText()); } catch { /* Page may be closing. */ }
  }, 30000);
  try {
    await page.waitForFunction(() => window.__vaultLabDone, null, { timeout: 10 * 60 * 1000 });
  } finally { clearInterval(progress); }
  const rows = await page.evaluate(() => window.__vaultLabResults);
  fs.writeFileSync(path.join(outDir, "extraction_with_landmarks.json"), JSON.stringify(rows, null, 2));
  const summaries = rows.map(({ frames, ...row }) => ({ ...row,
    result: /make/i.test(row.file) ? "make" : /miss/i.test(row.file) ? "miss" : "unknown" }));
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summaries, null, 2));
  // Preserve exact video frames beside overlays for human review; no labels are inferred from poses.
  const capture = await browser.newPage();
  await capture.setContent('<input type="file"><video muted></video>');
  const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
  for (const [index, row] of rows.entries()) {
    if (!row.frames?.length) continue;
    await capture.locator("input").setInputFiles(path.join(dataDir, row.file));
    const times = [...new Set([row.rising_candidate_time_s, row.inverted_candidate_time_s, row.highest_hip_candidate_time_s].filter(t => t !== null))];
    if (!times.length) times.push(row.frames[Math.floor(row.frames.length / 2)].time);
    const auditFrames = times.map(time => row.frames.find(f => f.time === time));
    const images = await capture.evaluate(async ({ frames, connections }) => {
      const video = document.querySelector("video");
      const url = URL.createObjectURL(document.querySelector("input").files[0]);
      video.preload = "auto";
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Audit video metadata timed out")), 30000);
        video.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      });
      video.src = url; await loaded;
      const images = [];
      for (const frame of frames) {
        if (video.currentTime !== frame.time) await new Promise(resolve => { video.onseeked = resolve; video.currentTime = frame.time; });
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d"); ctx.drawImage(video, 0, 0);
        const plain = canvas.toDataURL("image/png");
        ctx.lineWidth = Math.max(2, canvas.width / 450); ctx.strokeStyle = "#00ffe0";
        const visible = p => p && (p.visibility ?? 1) > 0.45;
        for (const [a, b] of connections) {
          const p = frame.landmarks[a], q = frame.landmarks[b];
          if (!visible(p) || !visible(q)) continue;
          ctx.beginPath(); ctx.moveTo(p.x * canvas.width, p.y * canvas.height);
          ctx.lineTo(q.x * canvas.width, q.y * canvas.height); ctx.stroke();
        }
        ctx.fillStyle = "#ffff00";
        for (const p of frame.landmarks.filter(visible)) {
          ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, Math.max(3, canvas.width / 300), 0, Math.PI * 2); ctx.fill();
        }
        images.push({ time: frame.time, plain, overlay: canvas.toDataURL("image/png") });
      }
      URL.revokeObjectURL(url); return images;
    }, { frames: auditFrames, connections });
    for (const image of images) for (const type of ["plain", "overlay"]) {
      fs.writeFileSync(path.join(outDir, `clip-${index}-${image.time.toFixed(3)}-${type}.png`), Buffer.from(image[type].split(",")[1], "base64"));
    }
  }
  console.log(JSON.stringify(summaries, null, 2));
  console.log(`Audit saved: ${outDir}`);
  if (rows.some(row => row.status === "extraction_error")) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
