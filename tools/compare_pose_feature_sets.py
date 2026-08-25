from __future__ import annotations

import csv
import itertools
import math


IN_CSV = "model_output/vault_pose_extracted_dataset.csv"


def sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1 / (1 + z)
    z = math.exp(value)
    return z / (1 + z)


def load_rows() -> list[dict]:
    rows = []
    with open(IN_CSV, newline="", encoding="utf-8") as source:
        for row in csv.DictReader(source):
            if row["status"] != "ok":
                continue
            values = {
                "bar_height_m": float(row["bar_height_m"]),
                "takeoff_angle_deg": float(row["takeoff_angle_deg"]),
                "inversion_angle_deg": float(row["inversion_angle_deg"]),
                "flight_time_s": float(row["flight_time_s"]),
                "avg_visible_joints": float(row["avg_visible_joints"]),
                "usable_frames": float(row["usable_frames"]),
            }
            values["takeoff_from_70"] = abs(values["takeoff_angle_deg"] - 70)
            values["takeoff_from_90"] = abs(values["takeoff_angle_deg"] - 90)
            values["inversion_from_160"] = abs(values["inversion_angle_deg"] - 160)
            values["inversion_from_180"] = abs(values["inversion_angle_deg"] - 180)
            values["flight_from_2"] = abs(values["flight_time_s"] - 2)
            rows.append({"file": row["file"], "y": 1 if row["result"] == "make" else 0, "x": values})
    return rows


def train(rows: list[dict], features: tuple[str, ...], l2: float = 0.08) -> dict:
    means = {feature: sum(row["x"][feature] for row in rows) / len(rows) for feature in features}
    scales = {}
    for feature in features:
        variance = sum((row["x"][feature] - means[feature]) ** 2 for row in rows) / len(rows)
        scales[feature] = math.sqrt(variance) or 1

    makes = sum(row["y"] for row in rows)
    misses = len(rows) - makes
    intercept = math.log((makes + 0.5) / (misses + 0.5))
    weights = {feature: 0.0 for feature in features}

    for _ in range(1400):
        grad_b = 0.0
        grad_w = {feature: 0.0 for feature in features}
        for row in rows:
            normalized = {feature: (row["x"][feature] - means[feature]) / scales[feature] for feature in features}
            prediction = sigmoid(intercept + sum(weights[feature] * normalized[feature] for feature in features))
            error = prediction - row["y"]
            grad_b += error
            for feature in features:
                grad_w[feature] += error * normalized[feature] + l2 * weights[feature]
        intercept -= 0.08 * grad_b / len(rows)
        for feature in features:
            weights[feature] -= 0.08 * grad_w[feature] / len(rows)

    return {"intercept": intercept, "weights": weights, "means": means, "scales": scales}


def predict(model: dict, row: dict, features: tuple[str, ...]) -> float:
    return sigmoid(
        model["intercept"]
        + sum(
            model["weights"][feature] * ((row["x"][feature] - model["means"][feature]) / model["scales"][feature])
            for feature in features
        )
    )


def accuracy(rows: list[dict], model: dict, features: tuple[str, ...]) -> float:
    return sum((predict(model, row, features) >= 0.5) == bool(row["y"]) for row in rows) / len(rows)


def leave_one_out(rows: list[dict], features: tuple[str, ...]) -> float:
    correct = 0
    for index, row in enumerate(rows):
        train_rows = rows[:index] + rows[index + 1 :]
        model = train(train_rows, features)
        correct += (predict(model, row, features) >= 0.5) == bool(row["y"])
    return correct / len(rows)


def main() -> None:
    rows = load_rows()
    all_features = list(rows[0]["x"].keys())
    results = []
    for count in range(1, 6):
        for features in itertools.combinations(all_features, count):
            model = train(rows, features)
            results.append((leave_one_out(rows, features), accuracy(rows, model, features), features))

    for loo, train_acc, features in sorted(results, reverse=True)[:20]:
        print(f"loo={loo:.3f} train={train_acc:.3f} features={features}")


if __name__ == "__main__":
    main()
