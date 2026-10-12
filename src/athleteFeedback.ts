import type { ApproachEstimate, FrameAnalysis } from "./types";

export function inversionObservation(frame: FrameAnalysis | null) {
  if (!frame?.shoulder || !frame.hip || !frame.ankle
    || ![11, 12, 23, 24, 27, 28].every(i => (frame.landmarks[i]?.visibility ?? 0) >= 0.65)) {
    return "The body position is not clear enough for reliable feedback. Check the joint overlay before using the readings.";
  }
  const margin = 0.03;
  if (frame.ankle.y < frame.hip.y - margin && frame.hip.y < frame.shoulder.y - margin) {
    return "Your feet and hips appear above your shoulders in the selected frame. Replay this moment to check how you move into the turn.";
  }
  if (frame.ankle.y < frame.shoulder.y - margin) {
    return "Your feet appear above your shoulders, but this frame does not clearly show your hips stacked above them. Replay the swing with your coach.";
  }
  if (frame.hip.y < frame.shoulder.y - margin) {
    return "Your hips appear above your shoulders in this frame. Replay the surrounding frames to see where your feet are as you turn.";
  }
  return "This frame does not clearly show an upside-down position. That may be a missed moment, not a technique fault. Check the replay.";
}

export function buildAthleteFeedback(inversion: FrameAnalysis | null, approach?: ApproachEstimate) {
  if (!inversion) return ["Run full-video analysis, then review the takeoff and inversion moments here."];
  const items = [inversionObservation(inversion),
    "At takeoff, check the last foot contact in the replay with your coach. The app cannot yet reliably tell whether you took off under your top hand."];
  if (approach?.duration != null) items.push("Compare run-up time only across attempts from the same start mark. A shorter time alone does not mean a better approach.");
  else items.push("For run-up timing, include a short pause at your start mark and keep the whole approach in view.");
  return items;
}

export function predictionEffect(contribution: number) {
  if (Math.abs(contribution) < 0.08) return "Little effect on predicted chance";
  return contribution > 0 ? "Higher predicted chance" : "Lower predicted chance";
}
