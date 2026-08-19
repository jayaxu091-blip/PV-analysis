import type { Attempt, AttemptForm, Metrics } from "./types";
import { getBarMeters, getGripMeters, parseNumber } from "./utils";

export type VaultFeatureKey = "speed" | "takeoffAngle" | "inversionAngle" | "gripOverBar" | "flightTime";

export type VaultModelFeature = {
  key: VaultFeatureKey;
  label: string;
  unit: string;
  value: number;
  contribution: number;
  coefficient: number;
  zScore: number;
  effect: "helps" | "hurts" | "neutral";
};

export type TrainedVaultModel = {
  ready: boolean;
  status: string;
  rows: number;
  makes: number;
  misses: number;
  intercept: number;
  means: Record<VaultFeatureKey, number>;
  scales: Record<VaultFeatureKey, number>;
  coefficients: Record<VaultFeatureKey, number>;
};

export type VaultPrediction = {
  probability: number | null;
  score: number | null;
  features: VaultModelFeature[];
  message: string;
};

const featureOrder: VaultFeatureKey[] = ["speed", "takeoffAngle", "inversionAngle", "gripOverBar", "flightTime"];

const featureLabels: Record<VaultFeatureKey, { label: string; unit: string }> = {
  speed: { label: "Approach speed", unit: "m/s" },
  takeoffAngle: { label: "Takeoff angle", unit: "deg" },
  inversionAngle: { label: "Inversion angle", unit: "deg" },
  gripOverBar: { label: "Grip over bar", unit: "m" },
  flightTime: { label: "Flight time", unit: "s" },
};

const emptyStats: Record<VaultFeatureKey, number> = {
  speed: 0,
  takeoffAngle: 0,
  inversionAngle: 0,
  gripOverBar: 0,
  flightTime: 0,
};

function sigmoid(value: number) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function attemptVector(attempt: Attempt): Record<VaultFeatureKey, number> | null {
  if (attempt.speed === null || attempt.takeoffAngle === null || attempt.inversionAngle === null) return null;
  const barMeters = attempt.unit === "ft" ? attempt.barHeight * 0.3048 : attempt.barHeight;
  const gripMeters =
    attempt.gripHeight !== null && attempt.gripUnit
      ? attempt.gripUnit === "ft"
        ? attempt.gripHeight * 0.3048
        : attempt.gripHeight
      : null;
  const flightTime =
    attempt.takeoffTime !== null &&
    attempt.takeoffTime !== undefined &&
    attempt.clearanceTime !== null &&
    attempt.clearanceTime !== undefined &&
    attempt.clearanceTime > attempt.takeoffTime
      ? attempt.clearanceTime - attempt.takeoffTime
      : null;

  if (gripMeters === null || flightTime === null) return null;

  return {
    speed: attempt.speed,
    takeoffAngle: attempt.takeoffAngle,
    inversionAngle: attempt.inversionAngle,
    gripOverBar: gripMeters - barMeters,
    flightTime,
  };
}

export function formVector(form: AttemptForm, metrics: Metrics): Record<VaultFeatureKey, number> | null {
  const takeoffAngle = parseNumber(form.takeoffAngle);
  const inversionAngle = parseNumber(form.inversionAngle);
  const barMeters = getBarMeters(form);
  const gripMeters = getGripMeters(form);

  if (
    metrics.speed === null ||
    takeoffAngle === null ||
    inversionAngle === null ||
    barMeters === null ||
    gripMeters === null ||
    metrics.flightTime === null
  ) {
    return null;
  }

  return {
    speed: metrics.speed,
    takeoffAngle,
    inversionAngle,
    gripOverBar: gripMeters - barMeters,
    flightTime: metrics.flightTime,
  };
}

export function trainVaultModel(attempts: Attempt[]): TrainedVaultModel {
  const rows = attempts
    .map((attempt) => {
      const vector = attemptVector(attempt);
      if (!vector || !attempt.result) return null;
      return { vector, result: attempt.result === "make" ? 1 : 0 };
    })
    .filter((row): row is { vector: Record<VaultFeatureKey, number>; result: number } => row !== null);

  const makes = rows.filter((row) => row.result === 1).length;
  const misses = rows.length - makes;

  if (rows.length < 8) {
    return {
      ready: false,
      status: "Save at least 8 complete attempts to train the first logistic model.",
      rows: rows.length,
      makes,
      misses,
      intercept: 0,
      means: { ...emptyStats },
      scales: { ...emptyStats },
      coefficients: { ...emptyStats },
    };
  }

  if (makes === 0 || misses === 0) {
    return {
      ready: false,
      status: "The model needs both makes and misses to learn what separates successful vaults.",
      rows: rows.length,
      makes,
      misses,
      intercept: 0,
      means: { ...emptyStats },
      scales: { ...emptyStats },
      coefficients: { ...emptyStats },
    };
  }

  const means = { ...emptyStats };
  const scales = { ...emptyStats };

  featureOrder.forEach((key) => {
    means[key] = rows.reduce((sum, row) => sum + row.vector[key], 0) / rows.length;
    const variance = rows.reduce((sum, row) => sum + (row.vector[key] - means[key]) ** 2, 0) / rows.length;
    scales[key] = Math.sqrt(variance) || 1;
  });

  const weights = featureOrder.map(() => 0);
  let intercept = Math.log(makes / misses);
  const learningRate = 0.08;
  const l2 = 0.02;

  for (let epoch = 0; epoch < 900; epoch += 1) {
    let biasGradient = 0;
    const gradients = featureOrder.map(() => 0);

    rows.forEach((row) => {
      const normalized = featureOrder.map((key) => (row.vector[key] - means[key]) / scales[key]);
      const logit = intercept + normalized.reduce((sum, value, index) => sum + value * weights[index], 0);
      const error = sigmoid(logit) - row.result;
      biasGradient += error;
      normalized.forEach((value, index) => {
        gradients[index] += error * value + l2 * weights[index];
      });
    });

    intercept -= (learningRate * biasGradient) / rows.length;
    weights.forEach((weight, index) => {
      weights[index] = weight - (learningRate * gradients[index]) / rows.length;
    });
  }

  return {
    ready: true,
    status: "Logistic regression trained from your saved vault attempts.",
    rows: rows.length,
    makes,
    misses,
    intercept,
    means,
    scales,
    coefficients: featureOrder.reduce(
      (next, key, index) => ({ ...next, [key]: weights[index] }),
      { ...emptyStats },
    ),
  };
}

export function predictVault(model: TrainedVaultModel, vector: Record<VaultFeatureKey, number> | null): VaultPrediction {
  if (!model.ready) {
    return {
      probability: null,
      score: null,
      features: [],
      message: model.status,
    };
  }

  if (!vector) {
    return {
      probability: null,
      score: null,
      features: [],
      message: "Complete the video analysis and athlete inputs to score this vault.",
    };
  }

  let logit = model.intercept;
  const features: VaultModelFeature[] = featureOrder.map((key) => {
    const zScore = (vector[key] - model.means[key]) / model.scales[key];
    const contribution = zScore * model.coefficients[key];
    const effect: VaultModelFeature["effect"] =
      Math.abs(contribution) < 0.08 ? "neutral" : contribution > 0 ? "helps" : "hurts";
    logit += contribution;
    return {
      key,
      label: featureLabels[key].label,
      unit: featureLabels[key].unit,
      value: vector[key],
      contribution,
      coefficient: model.coefficients[key],
      zScore,
      effect,
    };
  });

  const probability = sigmoid(logit);
  return {
    probability,
    score: Math.round(probability * 100),
    features: features.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    message: "Score is produced by the trained logistic model and each variable's contribution.",
  };
}
