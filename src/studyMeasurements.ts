import type { FrameAnalysis, Landmark, VaultPhases } from "./types";
import { torsoOrientation, type ImageSize } from "./poseMeasurements";

export const MEASUREMENT_VERSION = "study-normalized-v1";

// Preserve the original study's normalized-coordinate proxies, including its
// directional angle and event heuristic. These are not physical launch angles.
export function isVisible(point?: Landmark | null): point is Landmark {
  return Boolean(point && (point.visibility === undefined || point.visibility > 0.45));
}

function midpoint(a?: Landmark, b?: Landmark): Landmark | null {
  return isVisible(a) && isVisible(b) ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
}

export function lineAngle(a: Landmark | null, b: Landmark | null) {
  return a && b ? Math.abs(Math.atan2(a.y - b.y, b.x - a.x) * 180 / Math.PI) : null;
}

export function angleBetween(a?: Landmark | null, b?: Landmark | null, c?: Landmark | null) {
  if (!isVisible(a) || !isVisible(b) || !isVisible(c)) return null;
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const la = Math.hypot(ba.x, ba.y), lc = Math.hypot(bc.x, bc.y);
  if (!la || !lc) return null;
  return Math.acos(Math.max(-1, Math.min(1, (ba.x * bc.x + ba.y * bc.y) / (la * lc)))) * 180 / Math.PI;
}

export function buildFrameAnalysis(time: number, landmarks: Landmark[], size: ImageSize): FrameAnalysis {
  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const ankle = midpoint(landmarks[27], landmarks[28]);
  return { time, landmarks, shoulder, hip, ankle,
    bodyLine: lineAngle(hip, shoulder),
    inversionAngle: angleBetween(shoulder, hip, ankle),
    // Supplemental display only; never an input to the study model.
    torsoOrientation: torsoOrientation(hip, shoulder, size),
    visibleCount: landmarks.filter(isVisible).length,
    inversionScore: shoulder && hip && ankle ? shoulder.y - hip.y + (shoulder.y - ankle.y) : -99,
    measurementVersion: MEASUREMENT_VERSION };
}

export function estimateVaultPhases(frames: FrameAnalysis[]): VaultPhases {
  if (!frames.length) return { approachStart: null, takeoff: null, inversion: null, clearance: null };
  const good = frames.filter(f => f.visibleCount >= 16 && f.hip && f.shoulder);
  const usable = good.length ? good : frames;
  const inversion = usable.slice().sort((a, b) => b.inversionScore - a.inversionScore || b.visibleCount - a.visibleCount)[0];
  const before = usable.filter(f => f.time < inversion.time);
  const candidates: { frame: FrameAnalysis; score: number }[] = [];
  for (let i = 1; i < before.length; i++) {
    const previous = before[i - 1], current = before[i];
    if (!previous.hip || !current.hip) continue;
    const hipRise = previous.hip.y - current.hip.y;
    const bodyReady = Number.isFinite(current.bodyLine) ? current.bodyLine || 0 : 0;
    // The 22-degree preference is a historical heuristic, not a coaching target.
    const score = hipRise * 100 + current.visibleCount * 0.2 - Math.abs(22 - bodyReady) * 0.08;
    candidates.push({ frame: current, score });
  }
  const takeoff = candidates.length ? candidates.sort((a, b) => b.score - a.score)[0].frame
    : before[Math.max(0, Math.floor(before.length * 0.65))] || usable[0];
  const after = usable.filter(f => f.time >= inversion.time && f.hip);
  const clearance = after.length ? after.slice().sort((a, b) => (a.hip?.y || 0) - (b.hip?.y || 0) || b.visibleCount - a.visibleCount)[0] : inversion;
  return { approachStart: usable[0], takeoff, inversion, clearance };
}

export function sampleCountForVideo(duration: number) {
  return Math.min(80, Math.max(24, Math.round(duration * 8)));
}
