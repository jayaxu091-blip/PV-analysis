import type { Attempt, AttemptForm, Metrics } from "./types";
import { getBarMeters, parseNumber } from "./utils";
import { MEASUREMENT_VERSION } from "./studyMeasurements";

export type VaultFeatureKey = "barHeight" | "speed" | "takeoffAngle" | "inversionAngle" | "gripOverBar" | "flightTime";

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
  measurementVersion: string;
  ready: boolean;
  source: "general" | "personal" | "waiting";
  status: string;
  rows: number;
  makes: number;
  misses: number;
  features: VaultFeatureKey[];
  intercept: number;
  means: Partial<Record<VaultFeatureKey, number>>;
  scales: Partial<Record<VaultFeatureKey, number>>;
  coefficients: Partial<Record<VaultFeatureKey, number>>;
};

export type VaultPrediction = {
  probability: number | null;
  features: VaultModelFeature[];
  message: string;
};

const personalFeatureOrder: VaultFeatureKey[] = ["speed", "takeoffAngle", "inversionAngle", "gripOverBar", "flightTime"];

const featureLabels: Record<VaultFeatureKey, { label: string; unit: string }> = {
  barHeight: { label: "Bar height", unit: "m" },
  speed: { label: "Approach speed", unit: "m/s" },
  takeoffAngle: { label: "Takeoff body-line proxy", unit: "deg" },
  inversionAngle: { label: "Inversion alignment proxy", unit: "deg" },
  gripOverBar: { label: "Grip over bar", unit: "m" },
  flightTime: { label: "Takeoff-to-clearance interval", unit: "s" },
};

export const generalVaultModel: TrainedVaultModel = {
  measurementVersion: MEASUREMENT_VERSION,
  ready: true,
  source: "general",
  status: "Original 30-video study model. Measurements use the study's proxy definitions. Predictive accuracy on new athletes is not established.",
  rows: 30,
  makes: 15,
  misses: 15,
  features: ["barHeight", "takeoffAngle", "inversionAngle", "flightTime"],
  intercept: -0.0016733437227014582,
  means: {
    barHeight: 3.850866666666667,
    takeoffAngle: 66.8493289078798,
    inversionAngle: 124.85754813688156,
    flightTime: 2.2518941387314184,
  },
  scales: {
    barHeight: 1.061682411578696,
    takeoffAngle: 45.01045047386033,
    inversionAngle: 48.76521626661363,
    flightTime: 1.4328408700813988,
  },
  coefficients: {
    barHeight: -0.3182411136983498,
    takeoffAngle: -0.04341436748346155,
    inversionAngle: -0.1410757359564984,
    flightTime: -0.25305341126748027,
  },
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
  if (attempt.measurementVersion !== MEASUREMENT_VERSION) return null;
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
    barHeight: barMeters,
    speed: attempt.speed,
    takeoffAngle: attempt.takeoffAngle,
    inversionAngle: attempt.inversionAngle,
    gripOverBar: gripMeters - barMeters,
    flightTime,
  };
}

export function formVector(form: AttemptForm, metrics: Metrics): Partial<Record<VaultFeatureKey, number>> | null {
  if (form.measurementVersion !== MEASUREMENT_VERSION) return null;
  const barHeight = getBarMeters(form);
  const takeoffAngle = parseNumber(form.takeoffAngle);
  const inversionAngle = parseNumber(form.inversionAngle);

  if (barHeight === null && takeoffAngle === null && inversionAngle === null && metrics.flightTime === null) {
    return null;
  }

  return {
    barHeight: barHeight ?? undefined,
    speed: metrics.speed ?? undefined,
    takeoffAngle: takeoffAngle ?? undefined,
    inversionAngle: inversionAngle ?? undefined,
    gripOverBar: metrics.gripOverBar ?? undefined,
    flightTime: metrics.flightTime ?? undefined,
  };
}

export function trainVaultModel(attempts: Attempt[]): TrainedVaultModel {
  // The submission release always uses the reported study model, regardless of log size.
  void attempts;
  return generalVaultModel;
}

export function trainPersonalVaultModel(attempts: Attempt[]): TrainedVaultModel {
  if (!generalVaultModel.ready) return generalVaultModel;
  const rows = attempts
    .map((attempt) => {
      const vector = attemptVector(attempt);
      if (!vector || !attempt.result) return null;
      return { vector, result: attempt.result === "make" ? 1 : 0 };
    })
    .filter((row): row is { vector: Record<VaultFeatureKey, number>; result: number } => row !== null);

  const makes = rows.filter((row) => row.result === 1).length;
  const misses = rows.length - makes;

  if (rows.length < 12 || makes === 0 || misses === 0) {
    return generalVaultModel;
  }

  const means: Partial<Record<VaultFeatureKey, number>> = {};
  const scales: Partial<Record<VaultFeatureKey, number>> = {};

  personalFeatureOrder.forEach((key) => {
    means[key] = rows.reduce((sum, row) => sum + row.vector[key], 0) / rows.length;
    const variance = rows.reduce((sum, row) => sum + (row.vector[key] - (means[key] || 0)) ** 2, 0) / rows.length;
    scales[key] = Math.sqrt(variance) || 1;
  });

  const weights = personalFeatureOrder.map(() => 0);
  let intercept = Math.log(makes / misses);
  const learningRate = 0.08;
  const l2 = 0.02;

  for (let epoch = 0; epoch < 900; epoch += 1) {
    let biasGradient = 0;
    const gradients = personalFeatureOrder.map(() => 0);

    rows.forEach((row) => {
      const normalized = personalFeatureOrder.map((key) => (row.vector[key] - (means[key] || 0)) / (scales[key] || 1));
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
    measurementVersion: MEASUREMENT_VERSION,
    source: "personal",
    status: "Using personalized logistic model trained from your saved vault attempts.",
    rows: rows.length,
    makes,
    misses,
    features: personalFeatureOrder,
    intercept,
    means,
    scales,
    coefficients: personalFeatureOrder.reduce<Partial<Record<VaultFeatureKey, number>>>(
      (next, key, index) => ({ ...next, [key]: weights[index] }),
      {},
    ),
  };
}

export function predictVault(model: TrainedVaultModel, vector: Partial<Record<VaultFeatureKey, number>> | null): VaultPrediction {
  if (model.measurementVersion !== MEASUREMENT_VERSION) {
    return { probability: null, features: [], message: "Measurement version mismatch. Reanalyze using the study measurement rules." };
  }
  if (!model.ready) {
    return {
      probability: null,
      features: [],
      message: model.status,
    };
  }

  if (!vector) {
    return {
      probability: null,
      features: [],
      message: "Enter bar height and run full-video analysis to predict this vault.",
    };
  }

  const missing = model.features.filter((key) => vector[key] === undefined || vector[key] === null || !Number.isFinite(vector[key]));
  if (missing.length) {
    return {
      probability: null,
      features: [],
      message: `Missing model input: ${missing.map((key) => featureLabels[key].label).join(", ")}.`,
    };
  }

  let logit = model.intercept;
  const features: VaultModelFeature[] = model.features.map((key) => {
    const value = vector[key] as number;
    const zScore = (value - (model.means[key] || 0)) / (model.scales[key] || 1);
    const contribution = zScore * (model.coefficients[key] || 0);
    const effect: VaultModelFeature["effect"] =
      Math.abs(contribution) < 0.08 ? "neutral" : contribution > 0 ? "helps" : "hurts";
    logit += contribution;
    return {
      key,
      label: featureLabels[key].label,
      unit: featureLabels[key].unit,
      value,
      contribution,
      coefficient: model.coefficients[key] || 0,
      zScore,
      effect,
    };
  });

  const probability = sigmoid(logit);
  return {
    probability,
    features: features.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    message:
      model.source === "personal"
        ? "Probability is produced by your personalized logistic regression model."
        : "Probability is produced by the built-in logistic regression model trained from the current video dataset.",
  };
}
