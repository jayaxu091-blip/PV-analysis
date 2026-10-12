import test from "node:test";
import assert from "node:assert/strict";
import { angleBetween, buildFrameAnalysis, estimateVaultPhases, lineAngle, nearestPoseFrame, torsoOrientation } from "../src/poseMeasurements";
import { generalVaultModel, predictVault, trainVaultModel } from "../src/vaultModel";

const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const normalized = (x: number, y: number, width: number, height: number) => ({ x: x / width, y: y / height });

test("identical pixel geometry has the same angles in portrait and landscape", () => {
  for (const size of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }]) {
    const p = (x: number, y: number) => normalized(x, y, size.width, size.height);
    close(lineAngle(p(100, 200), p(200, 100), size), 45);
    close(angleBetween(p(100, 100), p(200, 200), p(300, 100), size), 90);
  }
});

test("upright and inverted straight bodies share alignment, not orientation", () => {
  const size = { width: 1, height: 1 };
  const hip = { x: 0.5, y: 0.5 };
  const high = { x: 0.5, y: 0.2 };
  const low = { x: 0.5, y: 0.8 };
  close(angleBetween(high, hip, low, size), 180);
  close(angleBetween(low, hip, high, size), 180);
  close(torsoOrientation(hip, high, size), 0);
  close(torsoOrientation(hip, low, size), 180);
});

test("torso inclination is independent of left/right camera reflection", () => {
  const size = { width: 1280, height: 720 };
  const a = { x: 0.2, y: 0.7 }, b = { x: 0.4, y: 0.3 };
  close(lineAngle(a, b, size), lineAngle({ ...a, x: 1 - a.x }, { ...b, x: 1 - b.x }, size)!);
});

test("missing, invisible, nonfinite, and coincident joints produce no angle", () => {
  const size = { width: 100, height: 100 }, p = { x: 0, y: 0 };
  assert.equal(lineAngle(p, p, size), null);
  assert.equal(lineAngle(p, { x: NaN, y: 1 }, size), null);
  assert.equal(lineAngle(p, { x: 1, y: 1, visibility: 0.1 }, size), null);
  assert.equal(lineAngle(p, { x: 1, y: 1 }, { width: 0, height: 100 }), null);
  assert.equal(angleBetween(p, p, undefined, size), null);
});

test("no pose or no inverted ordering does not fabricate a vault event", () => {
  assert.deepEqual(estimateVaultPhases([]), { approachStart: null, takeoff: null, inversion: null, clearance: null });
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  points[11].y = points[12].y = 0.2;
  points[27].y = points[28].y = 0.8;
  const frame = buildFrameAnalysis(1, points, { width: 1920, height: 1080 });
  const phases = estimateVaultPhases([frame]);
  assert.equal(phases.inversion, null);
  assert.equal(phases.takeoff, null);
  assert.equal(phases.clearance, null);
});

test("a different measurement contract cannot use the study prediction path", () => {
  const result = predictVault({ ...generalVaultModel, measurementVersion: "image-plane-v2", ready: true }, {
    barHeight: 3.5, takeoffAngle: 70, inversionAngle: 150, flightTime: 1,
  });
  assert.equal(result.probability, null);
  assert.equal(trainVaultModel([]).ready, true);
});

test("overlay does not carry a stale detection across a pose gap", () => {
  const frame = buildFrameAnalysis(1, [], { width: 1920, height: 1080 });
  assert.equal(nearestPoseFrame([frame], 1.05), frame);
  assert.equal(nearestPoseFrame([frame], 2), null);
  assert.equal(nearestPoseFrame([], 1), null);
});
