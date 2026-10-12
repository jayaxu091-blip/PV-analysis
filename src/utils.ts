import type { AttemptForm, Metrics, Unit } from "./types";

export const storageKey = "vaultlab-attempts-v1";
export const videoDbName = "vaultlab-video-store";
export const videoStoreName = "videos";

export function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function emptyForm(): AttemptForm {
  return {
    athlete: "",
    date: today(),
    barHeight: "",
    unit: "",
    gripHeight: "",
    gripUnit: "",
    approachDistance: "",
    approachDistanceUnit: "",
    approachTime: "",
    takeoffAngle: "",
    inversionAngle: "",
    takeoffTime: "",
    clearanceTime: "",
    notes: "",
    result: "",
  };
}

export function parseNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toMeters(value: number | null, unit: Unit) {
  if (value === null || !unit) return null;
  return unit === "ft" ? value * 0.3048 : value;
}

export function getBarMeters(form: AttemptForm) {
  return toMeters(parseNumber(form.barHeight), form.unit);
}

export function getGripMeters(form: AttemptForm) {
  return toMeters(parseNumber(form.gripHeight), form.gripUnit);
}

export function getApproachDistanceMeters(form: AttemptForm) {
  return toMeters(parseNumber(form.approachDistance), form.approachDistanceUnit);
}

export function estimateSpeed(form: AttemptForm) {
  const distance = getApproachDistanceMeters(form);
  const time = parseNumber(form.approachTime);
  if (!distance || !time) return null;
  return distance / time;
}

export function estimateTechScore(form: AttemptForm) {
  void form;
  return null;
}

export function getMetrics(form: AttemptForm): Metrics {
  const speed = estimateSpeed(form);
  const barMeters = getBarMeters(form);
  const gripMeters = getGripMeters(form);
  const takeoffTime = parseNumber(form.takeoffTime);
  const clearanceTime = parseNumber(form.clearanceTime);
  const techScore = estimateTechScore(form);

  return {
    speed,
    gripOverBar: gripMeters !== null && barMeters !== null ? gripMeters - barMeters : null,
    flightTime:
      takeoffTime !== null && clearanceTime !== null
        ? Math.max(0, clearanceTime - takeoffTime)
        : null,
    techScore,
  };
}

export function formatHeight(value: number, unit: Unit) {
  if (!Number.isFinite(value) || !unit) return "--";
  return `${value.toFixed(2)} ${unit}`;
}

export function appendNoteOnce(current: string, note: string) {
  if (current.includes(note)) return current;
  return current.trim() ? `${current.trim()} ${note}` : note;
}

export function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCoachFeedback(form: AttemptForm, metrics: Metrics) {
  const feedback: string[] = [];
  const takeoff = parseNumber(form.takeoffAngle);
  const inversion = parseNumber(form.inversionAngle);
  const barMeters = getBarMeters(form);

  if (metrics.speed === null) {
    feedback.push("Enter approach distance and time to estimate runway speed.");
  } else if (metrics.speed < 6) {
    feedback.push("Approach speed looks like a priority. Build consistent acceleration before chasing higher grip.");
  } else if (metrics.speed < 7.5) {
    feedback.push("Approach speed is developing. Compare your best makes against misses to see if speed stays stable.");
  } else {
    feedback.push("Approach speed is a strength. Focus on converting that speed through takeoff and swing.");
  }

  if (takeoff === null) {
    feedback.push("Analyze the full video to estimate body position at takeoff.");
  } else {
    feedback.push("Review posture in the estimated takeoff frame with your coach. This body angle is not a launch angle or a validated technique target.");
  }

  if (inversion === null) {
    feedback.push("Analyze the video to review body alignment near inversion.");
  } else {
    feedback.push("Check the inversion frame for hip and foot position. A straighter body angle alone does not establish better technique.");
  }

  if (metrics.gripOverBar !== null && barMeters !== null) {
    if (metrics.gripOverBar < 0.25) {
      feedback.push("Grip is close to bar height. Technique and speed may matter more than raising grip right now.");
    } else if (metrics.gripOverBar > 0.9) {
      feedback.push("Grip is far above bar height. Check whether the pole, speed, and swing are matching that grip.");
    }
  }

  if (metrics.flightTime !== null) {
    feedback.push("Compare takeoff-to-clearance timing across attempts filmed from similar views. Both endpoints are estimates.");
  }

  return feedback.slice(0, 5);
}
