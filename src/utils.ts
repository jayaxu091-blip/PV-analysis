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
      takeoffTime !== null && clearanceTime !== null && clearanceTime > takeoffTime
        ? clearanceTime - takeoffTime
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
    feedback.push("Analyze the full video so the app can estimate body angle at takeoff.");
  } else if (takeoff < 16) {
    feedback.push("Takeoff angle is estimated low. Check posture at takeoff and whether you are getting pulled into the pole too early.");
  } else if (takeoff > 28) {
    feedback.push("Takeoff angle is estimated high. Check if you are jumping up too much and losing runway speed into the pole.");
  } else {
    feedback.push("Takeoff angle is in a workable range. Next compare takeoff position and swing timing.");
  }

  if (inversion === null) {
    feedback.push("Analyze max inversion so the app can estimate whether hips and feet rise efficiently.");
  } else if (inversion < 125) {
    feedback.push("Inversion angle is estimated low. Prioritize a longer swing and getting hips above shoulders.");
  } else if (inversion < 155) {
    feedback.push("Inversion is improving, but there may still be room to finish the swing and cover the pole.");
  } else {
    feedback.push("Inversion looks strong. Look next at clearance timing and whether you are using the height efficiently.");
  }

  if (metrics.gripOverBar !== null && barMeters !== null) {
    if (metrics.gripOverBar < 0.25) {
      feedback.push("Grip is close to bar height. Technique and speed may matter more than raising grip right now.");
    } else if (metrics.gripOverBar > 0.9) {
      feedback.push("Grip is far above bar height. Check whether the pole, speed, and swing are matching that grip.");
    }
  }

  if (metrics.flightTime !== null) {
    feedback.push("Phase timing is saved. Compare takeoff-to-clearance timing across makes and misses in the trained model.");
  }

  return feedback.slice(0, 5);
}
