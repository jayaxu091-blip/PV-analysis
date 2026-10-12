import test from "node:test";
import assert from "node:assert/strict";
import { estimateApproach } from "../src/approachAnalysis";
import { buildAthleteFeedback, inversionObservation, predictionEffect } from "../src/athleteFeedback";
import { buildFrameAnalysis, MEASUREMENT_VERSION } from "../src/studyMeasurements";
import { emptyForm, getMetrics } from "../src/utils";
import { formVector, generalVaultModel, predictVault } from "../src/vaultModel";

function track(start = 0.75, legs = true, mirror = false) {
  return Array.from({ length: 33 }, (_, i) => {
    const time = i / 8;
    const elapsed = Math.max(0, time - start);
    const x = 0.15 + elapsed * 0.24;
    const stride = legs ? 0.07 * Math.sin(elapsed * 16) : 0;
    const points = Array.from({ length: 33 }, () => ({ x, y: 0.45, visibility: 1 }));
    for (const j of [11, 12]) points[j].y = 0.25;
    for (const j of [27, 28]) points[j].y = 0.75;
    points[27].x += stride;
    points[28].x -= stride;
    if (mirror) for (const p of points) p.x = 1 - p.x;
    return buildFrameAnalysis(time, points, { width: 1000, height: 1000 });
  });
}

test("run-up estimate finds a stationary-to-moving start without modifying the study frames", () => {
  const frames = track();
  const before = JSON.stringify(frames);
  const result = estimateApproach(frames, frames.at(-1)!, 1);
  assert.notEqual(result.duration, null);
  assert.ok(result.start! >= 0.6 && result.start! <= 0.95);
  assert.equal(result.duration, 4 - result.start!);
  assert.equal(result.sampleGap, 0.125);
  assert.equal(JSON.stringify(frames), before);
  const mirrored = track(0.75, true, true);
  assert.equal(estimateApproach(mirrored, mirrored.at(-1)!, 1).duration, result.duration);
});

test("already-running, camera-pan-only and stationary clips do not produce a whole-run time", () => {
  for (const frames of [track(0), track(0.75, false), track(10)]) {
    assert.equal(estimateApproach(frames, frames.at(-1)!, 1).duration, null);
  }
});

test("missing lead-in, tracking gaps and absent takeoff return unavailable", () => {
  const frames = track();
  assert.equal(estimateApproach(frames.slice(5), frames.at(-1)!, 1).duration, null);
  assert.equal(estimateApproach(frames.filter((_, i) => i < 10 || i > 14), frames.at(-1)!, 1).duration, null);
  assert.equal(estimateApproach(frames, null, 1).duration, null);
  assert.equal(estimateApproach(frames, frames.at(-1)!, NaN).duration, null);
  for (const f of frames) f.landmarks[27].visibility = 0.4;
  assert.equal(estimateApproach(frames, frames.at(-1)!, 1).duration, null);
});

test("supplemental run-up timing does not change the frozen logistic prediction", () => {
  const form = { ...emptyForm(), measurementVersion: MEASUREMENT_VERSION, unit: "m" as const,
    barHeight: "3.5", takeoffAngle: "154.3", inversionAngle: "125.5", takeoffTime: "4", clearanceTime: "6" };
  const baseline = predictVault(generalVaultModel, formVector(form, getMetrics(form)));
  assert.notEqual(baseline.probability, null);
  const frames = track();
  const updated = { ...form, approachTime: "3.25", approachDistance: "20", approachDistanceUnit: "m" as const,
    approachEstimate: estimateApproach(frames, frames.at(-1)!, 1) };
  assert.deepEqual(predictVault(generalVaultModel, formVector(updated, getMetrics(updated))), baseline);
});

test("coaching distinguishes an observed inversion from uncertain or missing tracking", () => {
  const frame = track()[0];
  assert.match(inversionObservation(frame), /missed moment, not a technique fault/);
  frame.shoulder!.y = 0.7;
  frame.hip!.y = 0.4;
  frame.ankle!.y = 0.2;
  assert.match(inversionObservation(frame), /feet and hips appear above/);
  frame.landmarks[11].visibility = 0.2;
  assert.match(inversionObservation(frame), /not clear enough/);
  assert.equal(buildAthleteFeedback(null).length, 1);
});

test("factor labels describe prediction effects rather than technique quality", () => {
  assert.equal(predictionEffect(0), "Little effect on predicted chance");
  assert.equal(predictionEffect(0.3), "Higher predicted chance");
  assert.equal(predictionEffect(-0.3), "Lower predicted chance");
});
