from __future__ import annotations

import csv
import json
import math
import pathlib
import random


IN_CSV = pathlib.Path("model_output/vault_pose_extracted_dataset.csv")
OUT_DIR = pathlib.Path("model_output")
MODEL_JSON = OUT_DIR / "general_pose_vault_logistic_model.json"
BALANCED_MODEL_JSON = OUT_DIR / "balanced_pose_vault_logistic_model.json"
REPORT_TXT = OUT_DIR / "pose_training_report.txt"

FEATURES = [
    "bar_height_m",
    "takeoff_angle_deg",
    "inversion_angle_deg",
    "flight_time_s",
]


def sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1 / (1 + z)
    z = math.exp(value)
    return z / (1 + z)


def load_rows() -> list[dict]:
    rows: list[dict] = []
    with IN_CSV.open(newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            if row.get("status") != "ok" or row.get("result") not in {"make", "miss"}:
                continue
            try:
                features = {feature: float(row[feature]) for feature in FEATURES}
            except (TypeError, ValueError):
                continue
            rows.append(
                {
                    "file": row["file"],
                    "result": 1 if row["result"] == "make" else 0,
                    "features": features,
                }
            )
    return rows


def train(rows: list[dict]) -> dict:
    means = {
        feature: sum(row["features"][feature] for row in rows) / len(rows)
        for feature in FEATURES
    }
    scales = {}
    for feature in FEATURES:
        variance = sum((row["features"][feature] - means[feature]) ** 2 for row in rows) / len(rows)
        scales[feature] = math.sqrt(variance) or 1

    makes = sum(row["result"] for row in rows)
    misses = len(rows) - makes
    weights = {feature: 0.0 for feature in FEATURES}
    bias = math.log((makes + 0.5) / (misses + 0.5))
    learning_rate = 0.08
    l2 = 0.08

    for _ in range(1600):
        grad_b = 0.0
        grad_w = {feature: 0.0 for feature in FEATURES}
        for row in rows:
            normalized = {
                feature: (row["features"][feature] - means[feature]) / scales[feature]
                for feature in FEATURES
            }
            logit = bias + sum(weights[feature] * normalized[feature] for feature in FEATURES)
            error = sigmoid(logit) - row["result"]
            grad_b += error
            for feature in FEATURES:
                grad_w[feature] += error * normalized[feature] + l2 * weights[feature]
        bias -= learning_rate * grad_b / len(rows)
        for feature in FEATURES:
            weights[feature] -= learning_rate * grad_w[feature] / len(rows)

    return {
        "model_type": "logistic_regression",
        "target": "make_probability",
        "features": FEATURES,
        "mean": means,
        "scale": scales,
        "intercept": bias,
        "coefficients": weights,
        "training_rows": len(rows),
        "makes": makes,
        "misses": misses,
    }


def predict(model: dict, row: dict) -> float:
    logit = model["intercept"]
    for feature in FEATURES:
        normalized = (row["features"][feature] - model["mean"][feature]) / model["scale"][feature]
        logit += model["coefficients"][feature] * normalized
    return sigmoid(logit)


def accuracy(rows: list[dict], model: dict) -> float:
    correct = sum((predict(model, row) >= 0.5) == bool(row["result"]) for row in rows)
    return correct / len(rows)


def leave_one_out(rows: list[dict]) -> float:
    correct = 0
    for index, row in enumerate(rows):
        train_rows = rows[:index] + rows[index + 1 :]
        if len({item["result"] for item in train_rows}) < 2:
            continue
        model = train(train_rows)
        correct += (predict(model, row) >= 0.5) == bool(row["result"])
    return correct / len(rows)


def holdout(rows: list[dict]) -> dict | None:
    shuffled = rows[:]
    random.Random(42).shuffle(shuffled)
    test_size = max(5, round(len(rows) * 0.25))
    test_rows = shuffled[:test_size]
    train_rows = shuffled[test_size:]
    if len({row["result"] for row in train_rows}) < 2 or len({row["result"] for row in test_rows}) < 2:
        return None
    model = train(train_rows)
    return {
        "train_rows": len(train_rows),
        "test_rows": len(test_rows),
        "test_accuracy": accuracy(test_rows, model),
    }


def balanced_rows(rows: list[dict]) -> list[dict]:
    makes = sorted((row for row in rows if row["result"] == 1), key=lambda row: row["file"])
    misses = sorted((row for row in rows if row["result"] == 0), key=lambda row: row["file"])
    size = min(len(makes), len(misses))

    def spread(items: list[dict]) -> list[dict]:
        if len(items) == size:
            return items
        if size == 1:
            return [items[0]]
        picked = []
        for index in range(size):
            source_index = round(index * (len(items) - 1) / (size - 1))
            picked.append(items[source_index])
        return picked

    return sorted([*spread(makes), *spread(misses)], key=lambda row: row["file"])


def main() -> None:
    rows = load_rows()
    if len(rows) < 8 or len({row["result"] for row in rows}) < 2:
        raise SystemExit("Need at least 8 extracted rows with both makes and misses.")

    selected_rows = balanced_rows(rows)
    model = train(selected_rows)
    all_model = train(rows)
    train_accuracy = accuracy(selected_rows, model)
    full_dataset_accuracy = accuracy(rows, model)
    loocv_accuracy = leave_one_out(selected_rows)
    holdout_eval = holdout(selected_rows)

    predictions = []
    for row in rows:
        probability = predict(model, row)
        predictions.append(
            {
                "file": row["file"],
                "actual": "make" if row["result"] else "miss",
                "predicted": "make" if probability >= 0.5 else "miss",
                "make_probability": probability,
            }
        )

    payload = {
        **model,
        "training_accuracy": train_accuracy,
        "full_dataset_accuracy": full_dataset_accuracy,
        "leave_one_out_accuracy": loocv_accuracy,
        "holdout_evaluation": holdout_eval,
        "selection": "balanced",
        "available_rows": len(rows),
        "available_makes": sum(row["result"] for row in rows),
        "available_misses": len(rows) - sum(row["result"] for row in rows),
    }
    MODEL_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    BALANCED_MODEL_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    lines = [
        "VaultLab pose-feature logistic model",
        f"Available rows: {len(rows)}",
        f"Balanced training rows: {model['training_rows']}",
        f"Makes: {model['makes']}",
        f"Misses: {model['misses']}",
        f"Features used: {', '.join(FEATURES)}",
        "Coefficients:",
    ]
    for feature, coefficient in model["coefficients"].items():
        lines.append(f"- {feature}: {coefficient:.4f}")
    lines.extend(
        [
            f"Training accuracy: {train_accuracy:.1%}",
            f"Accuracy on all extracted rows: {full_dataset_accuracy:.1%}",
            f"Leave-one-out accuracy: {loocv_accuracy:.1%}",
            f"All-row model training accuracy: {accuracy(rows, all_model):.1%}",
        ]
    )
    if holdout_eval:
        lines.append(f"Holdout accuracy: {holdout_eval['test_accuracy']:.1%} ({holdout_eval['test_rows']} test rows)")
    lines.append("")
    lines.append("Predictions:")
    for prediction in predictions:
        lines.append(
            f"- {prediction['file']}: actual {prediction['actual']}, "
            f"predicted {prediction['predicted']}, make probability {prediction['make_probability']:.1%}"
        )
    REPORT_TXT.write_text("\n".join(lines), encoding="utf-8")
    print(REPORT_TXT.resolve())


if __name__ == "__main__":
    main()
