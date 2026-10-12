import type { FrameAnalysis, Landmark, VaultPhases } from "./types";

export const MEASUREMENT_VERSION = "image-plane-v2";
export type ImageSize = { width: number; height: number };

export function isVisible(point?: Landmark | null): point is Landmark {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && (point.visibility === undefined || point.visibility > 0.45));
}

export function midpoint(a?: Landmark, b?: Landmark): Landmark | null {
  if (!isVisible(a) || !isVisible(b)) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
    visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) };
}

function vector(a: Landmark | null | undefined, b: Landmark | null | undefined, size: ImageSize) {
  if (!isVisible(a) || !isVisible(b) || !Number.isFinite(size.width) || !Number.isFinite(size.height)
    || size.width <= 0 || size.height <= 0) return null;
  // MediaPipe x and y use different denominators. Geometry needs a common pixel scale.
  const x = (b.x - a.x) * size.width;
  const y = (b.y - a.y) * size.height;
  const length = Math.hypot(x, y);
  return length > 1e-8 ? { x, y, length } : null;
}

export function lineAngle(a: Landmark | null, b: Landmark | null, size: ImageSize) {
  const v = vector(a, b, size);
  return v ? Math.atan2(Math.abs(v.y), Math.abs(v.x)) * 180 / Math.PI : null;
}

export function angleBetween(a: Landmark | null | undefined, b: Landmark | null | undefined,
  c: Landmark | null | undefined, size: ImageSize) {
  const ba = vector(b, a, size);
  const bc = vector(b, c, size);
  if (!ba || !bc) return null;
  const cosine = (ba.x * bc.x + ba.y * bc.y) / (ba.length * bc.length);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

// 0 = shoulder directly above hip; 180 = shoulder directly below hip.
// This is image-plane orientation, not a technique score or a 3-D measurement.
export function torsoOrientation(hip: Landmark | null, shoulder: Landmark | null, size: ImageSize) {
  const v = vector(hip, shoulder, size);
  return v ? Math.acos(Math.max(-1, Math.min(1, -v.y / v.length))) * 180 / Math.PI : null;
}

export function describeInversion(landmarks: Landmark[]) {
  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const ankle = midpoint(landmarks[27], landmarks[28]);
  if (!shoulder || !hip || !ankle) return "not enough visible joints";
  if (ankle.y < hip.y && hip.y < shoulder.y) return "ankles above hips above shoulders (2D)";
  if (hip.y < shoulder.y) return "hips above shoulders (2D)";
  if (ankle.y < shoulder.y) return "ankles above shoulders (2D)";
  return "inverted ordering not observed";
}

export function buildFrameAnalysis(time: number, landmarks: Landmark[], size: ImageSize): FrameAnalysis {
  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const ankle = midpoint(landmarks[27], landmarks[28]);
  const orientation = torsoOrientation(hip, shoulder, size);
  return { time, landmarks, shoulder, hip, ankle,
    bodyLine: lineAngle(hip, shoulder, size),
    inversionAngle: angleBetween(shoulder, hip, ankle, size),
    torsoOrientation: orientation,
    visibleCount: landmarks.filter(isVisible).length,
    inversionScore: orientation ?? -1,
    measurementVersion: MEASUREMENT_VERSION };
}

export function estimateVaultPhases(frames: FrameAnalysis[]): VaultPhases {
  const usable = frames.filter(f => Number.isFinite(f.time) && f.visibleCount >= 16 && f.hip && f.shoulder && f.ankle)
    .slice().sort((a, b) => a.time - b.time);
  const inverted = usable.filter(f => f.ankle!.y < f.hip!.y && f.hip!.y < f.shoulder!.y);
  const inversion = inverted.sort((a, b) => b.inversionScore - a.inversionScore)[0] ?? null;
  let takeoff: FrameAnalysis | null = null;
  let bestRise = 0;
  // A rising-body candidate only: no foot-ground contact, bar, or camera-motion model.
  // Never favor a literature "ideal" angle, or manufacture an event from a fallback frame.
  if (inversion) {
    for (let i = 1; i < usable.length; i++) {
      const previous = usable[i - 1];
      const current = usable[i];
      const dt = current.time - previous.time;
      if (current.time >= inversion.time || dt <= 0 || dt > 0.25) continue;
      if (previous.hip!.y <= previous.shoulder!.y || current.hip!.y <= current.shoulder!.y) continue;
      const hipRise = (previous.hip!.y - current.hip!.y) / dt;
      const ankleRise = (previous.ankle!.y - current.ankle!.y) / dt;
      if (hipRise > 0 && ankleRise > 0 && hipRise + ankleRise > bestRise) {
        bestRise = hipRise + ankleRise;
        takeoff = current;
      }
    }
  }
  const clearance = inversion ? usable.filter(f => f.time >= inversion.time)
    .sort((a, b) => a.hip!.y - b.hip!.y)[0] ?? null : null;
  return { approachStart: usable[0] ?? null, takeoff, inversion, clearance };
}

export function nearestPoseFrame(frames: FrameAnalysis[], time: number) {
  if (!Number.isFinite(time) || !frames.length) return null;
  const closest = frames.reduce((best, frame) => Math.abs(frame.time - time) < Math.abs(best.time - time) ? frame : best);
  // A missing detection must not leave an old skeleton painted over a later movement.
  return Math.abs(closest.time - time) <= 0.15 ? closest : null;
}
