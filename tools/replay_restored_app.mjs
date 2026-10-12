import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const root = process.cwd();
const out = path.join(root, 'output/research_restored_20260913');
fs.mkdirSync(out, { recursive: true });
const require = createRequire('C:/Users/jayax/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const { chromium } = require('playwright');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const selected = readJson('tools/research_revision_2/statistics.json').rows;
if (selected.length !== 30 || selected.filter(r => r.y === 1).length !== 15) throw new Error('Unexpected study cohort');
for (const row of selected) if (!fs.existsSync(path.join(root, 'pole vault videos miss and makes', row.file))) throw new Error(`Missing ${row.file}`);
const bundleUrl = 'https://pvanalysis-68252.web.app/assets/index-DHztDhVJ.js';
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';
async function download(url, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(file, bytes);
  return bytes;
}
const bundle = await download(bundleUrl, path.join(out, 'published-index-DHztDhVJ.js'));
const modelBytes = await download(modelUrl, path.join(out, 'pose_landmarker_lite.task'));
const text = bundle.toString('utf8');
const poseStart = text.indexOf('let mr=null,ho=0;');
const modelStart = text.indexOf('const Ci=["speed"', poseStart);
const modelEnd = text.indexOf('const bg=', modelStart);
if (poseStart < 0 || modelStart < 0 || modelEnd < 0) throw new Error('Published bundle boundaries changed');
const exactCode = text.slice(poseStart, modelEnd);
const original = readJson('model_output/balanced_pose_vault_logistic_model.json');
const html = `<!doctype html><input type="file"><video muted></video><script type="module">
${exactCode}
window.replayReady = true;
window.runReplay = async (barHeight) => {
  const video = document.querySelector('video');
  const file = document.querySelector('input').files[0];
  const url = URL.createObjectURL(file);
  const loaded = new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('Video decoding failed')); });
  video.src = url; await loaded;
  const frames = await pE(video, status => { window.replayStatus = status; });
  let phases = null, vector = { barHeight }, prediction = null;
  if (frames.length >= 3) {
    phases = gE(frames);
    const validAngle = phases.takeoff.bodyLine !== null && Number.isFinite(phases.takeoff.bodyLine) && phases.takeoff.bodyLine >= 25;
    // Exactly the fresh form's rounding and missing-input behavior in Ne()/Q_().
    const takeoff = Number(phases.takeoff.time.toFixed(2));
    const clearance = Number(phases.clearance.time.toFixed(2));
    vector = { barHeight,
      takeoffAngle: validAngle ? Math.round(phases.takeoff.bodyLine || 0) : undefined,
      inversionAngle: Number.isFinite(phases.inversion.inversionAngle) ? Math.round(phases.inversion.inversionAngle || 0) : undefined,
      flightTime: clearance > takeoff ? clearance - takeoff : undefined };
    prediction = _E(yE, vector);
  }
  const result = { duration: video.duration, width: video.videoWidth, height: video.videoHeight,
    sampled: Math.min(120, Math.max(32, Math.round(video.duration * 10))), frames, vector, prediction,
    phases: phases && Object.fromEntries(Object.entries(phases).map(([k,v]) => [k,v.time])), model: yE };
  URL.revokeObjectURL(url);
  return result;
};
</script>`;
const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(html); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const provenance = { evaluatedAt: new Date().toISOString(), bundleUrl, bundleSha256: hash(bundle), modelUrl,
  assetSha256: hash(modelBytes), releaseVersion: 'f27c7b46208126a4', protocol: 'One fresh browser context per clip; published pose and prediction functions copied verbatim; same 30 selected clips; built-in general model, no personal training; user-form rounding preserved.',
  sourcePaperSha256: hash(fs.readFileSync('VaultLab_Research_Paper_Revision_4.docx')),
  files: selected.map(r => ({ file: r.file, y: r.y, barHeight: r.bar_height_m,
    sha256: hash(fs.readFileSync(path.join(root, 'pole vault videos miss and makes', r.file))) })) };
fs.writeFileSync(path.join(out, 'provenance.json'), JSON.stringify(provenance, null, 2));
const resultsPath = path.join(out, 'replay_results.json');
const results = fs.existsSync(resultsPath) ? readJson(resultsPath) : [];
try {
  for (const [index, row] of selected.entries()) {
    if (results.some(r => r.file === row.file && r.status === 'ok')) continue;
    const context = await browser.newContext();
    await context.route(modelUrl, route => route.fulfill({ status: 200, contentType: 'application/octet-stream', body: modelBytes,
      headers: { 'Access-Control-Allow-Origin': '*' } }));
    const page = await context.newPage();
    page.setDefaultTimeout(240000);
    page.on('pageerror', error => console.log(`PAGE ERROR: ${error.message}`));
    console.log(`START ${index + 1}/30 ${row.file}`);
    let record;
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => window.replayReady);
      await page.setInputFiles('input', path.join(root, 'pole vault videos miss and makes', row.file));
      await page.evaluate(bar => {
        window.runReplay(bar).then(result => { window.replayResult = result; window.replayDone = true; })
          .catch(error => { window.replayError = error.message; window.replayDone = true; });
      }, row.bar_height_m);
      await page.waitForFunction(() => window.replayDone, null, { timeout: 240000 });
      const error = await page.evaluate(() => window.replayError);
      if (error) throw new Error(error);
      record = { file: row.file, y: row.y, status: 'ok', ...await page.evaluate(() => window.replayResult) };
      for (const [appKey, studyKey] of Object.entries({ barHeight:'bar_height_m', takeoffAngle:'takeoff_angle_deg', inversionAngle:'inversion_angle_deg', flightTime:'flight_time_s' })) {
        if (record.model.coefficients[appKey] !== original.coefficients[studyKey] || record.model.means[appKey] !== original.mean[studyKey] || record.model.scales[appKey] !== original.scale[studyKey]) throw new Error('Model differs from original export');
      }
      if (record.model.intercept !== original.intercept) throw new Error('Intercept differs');
      console.log(`DONE ${index + 1}/30 poses=${record.frames.length}/${record.sampled} probability=${record.prediction?.probability ?? 'unavailable'}`);
    } catch (error) {
      record = { file: row.file, y: row.y, status: 'error', error: error.message };
      console.log(`ERROR ${index + 1}/30 ${error.message}`);
    } finally { await context.close(); }
    const old = results.findIndex(r => r.file === row.file);
    if (old >= 0) results[old] = record; else results.push(record);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
console.log(`Saved ${results.length} records to ${resultsPath}`);
if (results.some(r => r.status !== 'ok')) process.exitCode = 1;
