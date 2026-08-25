from __future__ import annotations

from compare_pose_feature_sets import accuracy, leave_one_out, load_rows, train


FEATURE_SETS = [
    ("current_raw", ("bar_height_m", "takeoff_angle_deg", "inversion_angle_deg", "flight_time_s")),
    ("height_only", ("bar_height_m",)),
    ("pose_only", ("takeoff_angle_deg", "inversion_angle_deg", "flight_time_s")),
    ("height_takeoff", ("bar_height_m", "takeoff_angle_deg")),
    ("height_flight", ("bar_height_m", "flight_time_s")),
    ("ideal_engineered", ("bar_height_m", "takeoff_from_70", "inversion_from_160", "flight_from_2")),
    ("quality_plus_raw", ("bar_height_m", "takeoff_angle_deg", "inversion_angle_deg", "flight_time_s", "avg_visible_joints")),
]


def main() -> None:
    rows = load_rows()
    makes = sorted((row for row in rows if row["y"] == 1), key=lambda row: row["file"])
    misses = sorted((row for row in rows if row["y"] == 0), key=lambda row: row["file"])
    balanced = sorted([*makes[: len(misses)], *misses], key=lambda row: row["file"])
    print(f"all_rows={len(rows)} balanced_rows={len(balanced)}")
    for name, features in FEATURE_SETS:
        all_model = train(rows, features)
        balanced_model = train(balanced, features)
        print(
            f"{name}: all_train={accuracy(rows, all_model, features):.3f} "
            f"all_loo={leave_one_out(rows, features):.3f} "
            f"balanced_train={accuracy(balanced, balanced_model, features):.3f} "
            f"balanced_loo={leave_one_out(balanced, features):.3f} features={features}"
        )


if __name__ == "__main__":
    main()
