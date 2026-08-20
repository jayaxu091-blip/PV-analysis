from __future__ import annotations

import csv
import json
import math
import pathlib
import random
import re
from dataclasses import dataclass


DATA_DIR = pathlib.Path("pole vault videos miss and makes")
OUT_DIR = pathlib.Path("model_output")
FEATURES_CSV = OUT_DIR / "vault_training_dataset.csv"
MODEL_JSON = OUT_DIR / "general_vault_logistic_model.json"
REPORT_TXT = OUT_DIR / "training_report.txt"


@dataclass
class Row:
    file: str
    bar_height_m: float
    result: int


def parse_height_to_meters(name: str) -> float | None:
    lower = name.lower()
    feet_match = re.search(r"(\d+(?:\.\d+)?)\s*feet?(?:\s+(\d+(?:\.\d+)?)\s*inches?)?", lower)
    if feet_match:
        feet = float(feet_match.group(1))
        inches = float(feet_match.group(2) or 0)
        return (feet + inches / 12) * 0.3048

    meters_match = re.search(r"(\d+(?:\.\d+)?)\s*meters?", lower)
    if meters_match:
        return float(meters_match.group(1))

    return None


def parse_result(name: str) -> int | None:
    lower = name.lower()
    if "make" in lower:
        return 1
    if "miss" in lower:
        return 0
    return None


def load_rows() -> list[Row]:
    rows: list[Row] = []
    for file in sorted(DATA_DIR.glob("*.mp4")):
        height = parse_height_to_meters(file.name)
        result = parse_result(file.name)
        if height is None or result is None:
            continue
        rows.append(Row(file=file.name, bar_height_m=height, result=result))
    return rows


def sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1 / (1 + z)
    z = math.exp(value)
    return z / (1 + z)


def train(rows: list[Row]) -> dict:
    values = [row.bar_height_m for row in rows]
    mean = sum(values) / len(values)
    scale = (sum((value - mean) ** 2 for value in values) / len(values)) ** 0.5 or 1
    makes = sum(row.result for row in rows)
    misses = len(rows) - makes
    weight = 0.0
    bias = math.log((makes + 0.5) / (misses + 0.5))
    learning_rate = 0.12
    l2 = 0.02

    for _ in range(1200):
        grad_w = 0.0
        grad_b = 0.0
        for row in rows:
            x = (row.bar_height_m - mean) / scale
            prediction = sigmoid(bias + weight * x)
            error = prediction - row.result
            grad_w += error * x + l2 * weight
            grad_b += error
        weight -= learning_rate * grad_w / len(rows)
        bias -= learning_rate * grad_b / len(rows)

    return {
        "model_type": "logistic_regression",
        "target": "make_probability",
        "features": ["bar_height_m"],
        "mean": {"bar_height_m": mean},
        "scale": {"bar_height_m": scale},
        "intercept": bias,
        "coefficients": {"bar_height_m": weight},
        "training_rows": len(rows),
        "makes": makes,
        "misses": misses,
    }


def predict(model: dict, height_m: float) -> float:
    x = (height_m - model["mean"]["bar_height_m"]) / model["scale"]["bar_height_m"]
    return sigmoid(model["intercept"] + model["coefficients"]["bar_height_m"] * x)


def evaluate(rows: list[Row], model: dict) -> dict:
    predictions = [(row, predict(model, row.bar_height_m)) for row in rows]
    correct = sum((prob >= 0.5) == bool(row.result) for row, prob in predictions)
    return {
        "accuracy": correct / len(rows),
        "predictions": [
            {
                "file": row.file,
                "bar_height_m": row.bar_height_m,
                "actual": "make" if row.result else "miss",
                "predicted_make_probability": prob,
                "predicted": "make" if prob >= 0.5 else "miss",
            }
            for row, prob in predictions
        ],
    }


def split_evaluate(rows: list[Row]) -> dict | None:
    if len(rows) < 20:
        return None

    shuffled = rows[:]
    random.Random(42).shuffle(shuffled)
    test_size = max(4, round(len(shuffled) * 0.25))
    test_rows = shuffled[:test_size]
    train_rows = shuffled[test_size:]

    if len({row.result for row in train_rows}) < 2 or len({row.result for row in test_rows}) < 2:
        return None

    model = train(train_rows)
    return {
        "train_rows": len(train_rows),
        "test_rows": len(test_rows),
        "test_accuracy": evaluate(test_rows, model)["accuracy"],
    }


def write_outputs(rows: list[Row], model: dict, evaluation: dict, split: dict | None) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    with FEATURES_CSV.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=["file", "bar_height_m", "result"])
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "file": row.file,
                    "bar_height_m": f"{row.bar_height_m:.4f}",
                    "result": "make" if row.result else "miss",
                }
            )

    payload = {**model, "training_accuracy": evaluation["accuracy"]}
    if split:
        payload["holdout_evaluation"] = split
    MODEL_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    lines = [
        "VaultLab general logistic model",
        f"Training rows: {model['training_rows']}",
        f"Makes: {model['makes']}",
        f"Misses: {model['misses']}",
        "Features used: bar_height_m",
        f"Coefficient for bar_height_m: {model['coefficients']['bar_height_m']:.4f}",
        f"Training accuracy: {evaluation['accuracy']:.1%}",
    ]
    if split:
        lines.append(f"Holdout accuracy: {split['test_accuracy']:.1%} ({split['test_rows']} test rows)")
    else:
        lines.append("Holdout accuracy: not reported yet; add more rows for a fair train/test split.")
    lines.append("")
    lines.append("Predictions:")
    for prediction in evaluation["predictions"]:
        lines.append(
            f"- {prediction['file']}: actual {prediction['actual']}, "
            f"predicted {prediction['predicted']}, "
            f"make probability {prediction['predicted_make_probability']:.1%}"
        )
    REPORT_TXT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    rows = load_rows()
    makes = sum(row.result for row in rows)
    misses = len(rows) - makes
    if len(rows) < 8 or makes == 0 or misses == 0:
        raise SystemExit("Need at least 8 labeled videos with both makes and misses.")

    model = train(rows)
    evaluation = evaluate(rows, model)
    split = split_evaluate(rows)
    write_outputs(rows, model, evaluation, split)
    print(REPORT_TXT.resolve())


if __name__ == "__main__":
    main()
