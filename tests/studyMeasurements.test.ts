import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { buildFrameAnalysis, estimateVaultPhases, lineAngle, sampleCountForVideo, MEASUREMENT_VERSION } from "../src/studyMeasurements";
import { formVector, generalVaultModel, predictVault, trainVaultModel } from "../src/vaultModel";
import { emptyForm, getMetrics } from "../src/utils";
import type { Attempt, Landmark } from "../src/types";

const html = readFileSync("tools/batch_pose_extract.html", "utf8");
const original = runInNewContext(`${html.slice(html.indexOf("      function isVisible("), html.indexOf("      function seekVideo("))}\n({ buildFrameAnalysis, estimateVaultPhases })`);
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

function compareFrames(raw: { time: number; landmarks: Landmark[] }[], size: { width: number; height: number }) {
  const actual = raw.map(f => buildFrameAnalysis(f.time, f.landmarks, size));
  const expected = raw.map(f => original.buildFrameAnalysis(f.time, f.landmarks));
  actual.forEach((frame, i) => {
    const { measurementVersion, torsoOrientation, ...studyFields } = frame;
    assert.equal(measurementVersion, MEASUREMENT_VERSION);
    assert.deepEqual(JSON.parse(JSON.stringify(studyFields)), JSON.parse(JSON.stringify(expected[i])));
  });
  const phases = estimateVaultPhases(actual), baseline = original.estimateVaultPhases(expected);
  for (const phase of ["takeoff", "inversion", "clearance"] as const) {
    assert.equal(phases[phase]?.time, baseline[phase].time);
  }
}

test("frame measurements and event selection match original JS on saved pose tracks", () => {
  const clips = json("model_output/measurement_audit_v2/2026-09-12T15-35-41-914Z/extraction_with_landmarks.json");
  for (const clip of clips) compareFrames(clip.frames, { width: clip.width, height: clip.height });
});

test("original rules match on 1000 deterministic synthetic frames and fallback cases", () => {
  let state = 137;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let clip = 0; clip < 20; clip++) {
    const frames = Array.from({ length: 50 }, (_, i) => ({ time: i / 8,
      landmarks: Array.from({ length: 33 }, () => ({ x: random(), y: random(), visibility: random() })) }));
    compareFrames(frames, { width: 592, height: 1280 });
  }
  compareFrames([{ time: 0, landmarks: [] }], { width: 1, height: 1 });
  assert.equal(estimateVaultPhases([]).takeoff, null);
});

test("study angle remains directional 0-180 and sampling remains 24-80", () => {
  close(lineAngle({ x: .5, y: .5 }, { x: .25, y: .25 })!, 135);
  close(lineAngle({ x: .5, y: .5 }, { x: .75, y: .25 })!, 45);
  assert.equal(sampleCountForVideo(1), 24);
  assert.equal(sampleCountForVideo(5), 40);
  assert.equal(sampleCountForVideo(30), 80);
});

test("model parameters exactly match the original exported JSON", () => {
  const exported = json("model_output/balanced_pose_vault_logistic_model.json");
  assert.equal(generalVaultModel.intercept, exported.intercept);
  const keys = { barHeight: "bar_height_m", takeoffAngle: "takeoff_angle_deg", inversionAngle: "inversion_angle_deg", flightTime: "flight_time_s" } as const;
  for (const [appKey, dataKey] of Object.entries(keys)) {
    const k = appKey as keyof typeof keys;
    assert.equal(generalVaultModel.means[k], exported.mean[dataKey]);
    assert.equal(generalVaultModel.scales[k], exported.scale[dataKey]);
    assert.equal(generalVaultModel.coefficients[k], exported.coefficients[dataKey]);
  }
});

test("original balanced 30 rows still produce 20 correct training classifications", () => {
  const all = json("model_output/vault_pose_extracted_dataset.json");
  const sort = (a: { file: string }, b: { file: string }) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  const makes = all.filter((r: { result: string }) => r.result === "make").sort(sort);
  const misses = all.filter((r: { result: string }) => r.result === "miss").sort(sort);
  const selected = [...Array.from({ length: 15 }, (_, i) => makes[Math.round(i * (makes.length - 1) / 14)]), ...misses];
  let correct = 0;
  for (const row of selected) {
    const probability = predictVault(generalVaultModel, { barHeight: row.bar_height_m, takeoffAngle: row.takeoff_angle_deg,
      inversionAngle: row.inversion_angle_deg, flightTime: row.flight_time_s }).probability!;
    if ((probability >= .5) === (row.result === "make")) correct++;
  }
  assert.equal(selected.length, 30);
  assert.equal(correct, 20);
});

test("unversioned and v2 inputs cannot be silently scored; logs never switch models", () => {
  const form = { ...emptyForm, barHeight: "3.5", unit: "m" as const, takeoffAngle: "135", inversionAngle: "120", takeoffTime: "1.123456789", clearanceTime: "2.234567891" };
  assert.equal(formVector(form, getMetrics(form)), null);
  assert.equal(formVector({ ...form, measurementVersion: "image-plane-v2" }, getMetrics(form)), null);
  const vector = formVector({ ...form, measurementVersion: MEASUREMENT_VERSION }, getMetrics(form));
  assert.notEqual(predictVault(generalVaultModel, vector).probability, null);
  close(vector!.flightTime!, 2.234567891 - 1.123456789);
  assert.equal(trainVaultModel(Array.from({ length: 40 }, () => ({}) as Attempt)), generalVaultModel);
  assert.equal(getMetrics({ ...form, clearanceTime: form.takeoffTime }).flightTime, 0);
});
