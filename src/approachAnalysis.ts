import type { ApproachEstimate, FrameAnalysis, Landmark } from "./types";

const visible = (p?: Landmark) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= 0.65;
const range = (values: number[]) => Math.max(...values) - Math.min(...values);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

// A separate, conservative motion heuristic. It never changes study landmarks,
// phase selection, or model inputs. A camera pan alone must not count as a run.
export function estimateApproach(frames: FrameAnalysis[], takeoff: FrameAnalysis | null, aspectRatio: number): ApproachEstimate {
  const unavailable = (message: string): ApproachEstimate => ({ version: "approach-motion-v1", start: null,
    end: takeoff?.time ?? null, duration: null, sampleGap: null, message });
  if (!takeoff || !Number.isFinite(takeoff.time) || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return unavailable("A clear start and an estimated takeoff are needed to time the run-up.");
  }
  const points = frames.filter(f => Number.isFinite(f.time) && f.time <= takeoff.time && f.hip && f.shoulder && f.ankle
    && [11, 12, 23, 24, 27, 28].every(i => visible(f.landmarks[i])))
    .sort((a, b) => a.time - b.time).map(f => {
      const height = Math.hypot((f.shoulder!.x - f.ankle!.x) * aspectRatio, f.shoulder!.y - f.ankle!.y);
      return { time: f.time, x: f.hip!.x * aspectRatio, y: f.hip!.y, height,
        feet: (f.landmarks[27].x - f.landmarks[28].x) * aspectRatio / height };
    }).filter(p => p.height > 0.08 && Number.isFinite(p.feet));
  if (points.length < 8 || points[0].time > 0.35) {
    return unavailable("The start is not visible clearly enough. Film the athlete standing at the start mark before running.");
  }
  const gaps = points.slice(1).map((p, i) => p.time - points[i].time);
  if (gaps.some(g => g <= 0 || g > 0.3) || takeoff.time - points.at(-1)!.time > 0.3) {
    return unavailable("Tracking gaps are too large to time this run-up. Use a continuous, closer side-view recording.");
  }
  for (let i = 3; i < points.length - 3; i++) {
    const anchor = points[i];
    const still = points.slice(0, i + 1);
    // Require a stationary lead-in from the first detected pose; don't mistake
    // a mid-run hesitation for the beginning of an already-trimmed approach.
    if (anchor.time - still[0].time < 0.4) continue;
    const scale = median(still.map(p => p.height));
    if (range(still.map(p => p.x)) / scale > 0.06 || range(still.map(p => p.y)) / scale > 0.08
      || range(still.map(p => p.feet)) > 0.15) continue;
    const moving = points.slice(i + 1).filter(p => p.time - anchor.time <= 0.65);
    if (moving.length < 3 || moving.at(-1)!.time - anchor.time < 0.35) continue;
    const dx = moving.at(-1)!.x - anchor.x;
    const direction = Math.sign(dx);
    const forwardSteps = moving.filter((p, j) => direction * (p.x - (j ? moving[j - 1].x : anchor.x)) > 0.005 * scale).length;
    const legMotion = range([anchor.feet, ...moving.map(p => p.feet)]);
    if (Math.abs(dx) / scale < 0.2 || forwardSteps / moving.length < 0.7 || legMotion < 0.2) continue;
    if (moving.some(p => Math.abs(p.height / scale - 1) > 0.25)) continue;
    const start = (anchor.time + moving[0].time) / 2;
    const duration = takeoff.time - start;
    if (duration < 1) return unavailable("Too little of the approach is visible before the estimated takeoff.");
    return { version: "approach-motion-v1", start, end: takeoff.time, duration,
      sampleGap: Math.max(...gaps), message: "Estimated from the start of sustained movement to the estimated takeoff. Camera motion and phase detection can affect timing." };
  }
  return unavailable("A still-to-running transition was not clear. The clip may start mid-run, or the camera may be following the athlete.");
}
