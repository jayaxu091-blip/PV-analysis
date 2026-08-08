from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np


MODEL_PATH = Path(__file__).resolve().parent / "models" / "pose_landmarker_lite.task"


@dataclass
class FramePose:
    time: float
    landmarks: list[dict[str, float]]
    visible_count: int
    body_line_angle: float | None
    inversion_angle: float | None
    inversion_score: float
    hip_y: float | None


def make_landmarker() -> Any:
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Pose model not found: {MODEL_PATH}")

    base_options = mp.tasks.BaseOptions(model_asset_path=str(MODEL_PATH))
    options = mp.tasks.vision.PoseLandmarkerOptions(
        base_options=base_options,
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_poses=1,
    )
    return mp.tasks.vision.PoseLandmarker.create_from_options(options)


def analyze_video(video_path: Path, max_frames: int = 80) -> dict:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if fps and frame_count else 0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    if frame_count <= 0:
        capture.release()
        raise ValueError("Video has no readable frames.")

    sample_count = min(max_frames, max(24, int(duration * 8) if duration else 24))
    sample_indexes = np.linspace(0, max(0, frame_count - 1), sample_count).astype(int)
    poses: list[FramePose] = []

    with make_landmarker() as landmarker:
        for sample_number, frame_index in enumerate(sample_indexes):
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(frame_index))
            ok, frame = capture.read()
            if not ok:
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            timestamp_ms = int(sample_number * 33)
            result = landmarker.detect_for_video(image, timestamp_ms)
            if not result.pose_landmarks:
                continue

            landmarks = [
                {
                    "x": float(point.x),
                    "y": float(point.y),
                    "z": float(point.z),
                    "visibility": float(point.visibility),
                }
                for point in result.pose_landmarks[0]
            ]
            poses.append(build_frame_pose(frame_index / fps if fps else 0, landmarks))

    capture.release()

    if len(poses) < 3:
        return {
            "metadata": {
                "durationSeconds": round(duration, 3),
                "width": width,
                "height": height,
                "fps": round(fps, 3),
                "frameCount": frame_count,
            },
            "usableFrames": len(poses),
            "engineStatus": "pose_detected_too_few_frames",
            "phaseEstimates": None,
            "metrics": None,
            "landmarks": [],
        }

    phases = estimate_phases(poses)
    return {
        "metadata": {
            "durationSeconds": round(duration, 3),
            "width": width,
            "height": height,
            "fps": round(fps, 3),
            "frameCount": frame_count,
        },
        "usableFrames": len(poses),
        "engineStatus": "mediapipe_pose_landmarker_lite",
        "phaseEstimates": {
            "takeoffTimeSeconds": round(phases["takeoff"].time, 3),
            "maxInversionTimeSeconds": round(phases["inversion"].time, 3),
            "clearanceTimeSeconds": round(phases["clearance"].time, 3),
            "source": "backend_pose_estimate",
        },
        "metrics": {
            "takeoffAngleDegrees": round(phases["takeoff"].body_line_angle, 1)
            if phases["takeoff"].body_line_angle is not None
            else None,
            "inversionAngleDegrees": round(phases["inversion"].inversion_angle, 1)
            if phases["inversion"].inversion_angle is not None
            else None,
        },
        "landmarks": {
            "takeoff": phases["takeoff"].landmarks,
            "inversion": phases["inversion"].landmarks,
            "clearance": phases["clearance"].landmarks,
        },
    }


def build_frame_pose(time_seconds: float, landmarks: list[dict[str, float]]) -> FramePose:
    shoulder = midpoint(landmarks, 11, 12)
    hip = midpoint(landmarks, 23, 24)
    ankle = midpoint(landmarks, 27, 28)
    body_line_angle = line_angle(hip, shoulder)
    inversion_angle = angle_between(shoulder, hip, ankle)
    visible_count = sum(1 for point in landmarks if is_visible(point))

    inversion_score = -99.0
    if shoulder and hip and ankle:
        inversion_score = (shoulder["y"] - hip["y"]) + (shoulder["y"] - ankle["y"])

    return FramePose(
        time=time_seconds,
        landmarks=landmarks,
        visible_count=visible_count,
        body_line_angle=body_line_angle,
        inversion_angle=inversion_angle,
        inversion_score=inversion_score,
        hip_y=hip["y"] if hip else None,
    )


def estimate_phases(poses: list[FramePose]) -> dict[str, FramePose]:
    good = [pose for pose in poses if pose.visible_count >= 16]
    usable = good or poses
    inversion = sorted(usable, key=lambda pose: (pose.inversion_score, pose.visible_count), reverse=True)[0]
    takeoff = estimate_takeoff(usable, inversion)
    clearance = estimate_clearance(usable, inversion)
    return {"takeoff": takeoff, "inversion": inversion, "clearance": clearance}


def estimate_takeoff(poses: list[FramePose], inversion: FramePose) -> FramePose:
    before = [pose for pose in poses if pose.time < inversion.time and pose.hip_y is not None]
    if len(before) < 2:
        return poses[0]

    candidates: list[tuple[float, FramePose]] = []
    for previous, current in zip(before, before[1:]):
        hip_rise = previous.hip_y - current.hip_y if previous.hip_y is not None and current.hip_y is not None else 0
        body_ready = current.body_line_angle or 0
        score = hip_rise * 100 + current.visible_count * 0.2 - abs(22 - body_ready) * 0.08
        candidates.append((score, current))

    return sorted(candidates, key=lambda item: item[0], reverse=True)[0][1]


def estimate_clearance(poses: list[FramePose], inversion: FramePose) -> FramePose:
    after = [pose for pose in poses if pose.time >= inversion.time and pose.hip_y is not None]
    if not after:
        return inversion
    return sorted(after, key=lambda pose: (pose.hip_y, -pose.visible_count))[0]


def is_visible(point: dict[str, float] | None) -> bool:
    return bool(point) and point.get("visibility", 1) > 0.45


def midpoint(landmarks: list[dict[str, float]], index_a: int, index_b: int) -> dict[str, float] | None:
    point_a = landmarks[index_a] if index_a < len(landmarks) else None
    point_b = landmarks[index_b] if index_b < len(landmarks) else None
    if not is_visible(point_a) or not is_visible(point_b):
        return None
    return {
        "x": (point_a["x"] + point_b["x"]) / 2,
        "y": (point_a["y"] + point_b["y"]) / 2,
        "z": (point_a["z"] + point_b["z"]) / 2,
        "visibility": min(point_a.get("visibility", 1), point_b.get("visibility", 1)),
    }


def line_angle(point_a: dict[str, float] | None, point_b: dict[str, float] | None) -> float | None:
    if not point_a or not point_b:
        return None
    radians = np.arctan2(point_a["y"] - point_b["y"], point_b["x"] - point_a["x"])
    angle = abs(float(np.degrees(radians)))
    return min(angle, 180 - angle)


def angle_between(
    point_a: dict[str, float] | None,
    point_b: dict[str, float] | None,
    point_c: dict[str, float] | None,
) -> float | None:
    if not point_a or not point_b or not point_c:
        return None

    vector_ba = np.array([point_a["x"] - point_b["x"], point_a["y"] - point_b["y"]])
    vector_bc = np.array([point_c["x"] - point_b["x"], point_c["y"] - point_b["y"]])
    length_ba = np.linalg.norm(vector_ba)
    length_bc = np.linalg.norm(vector_bc)
    if not length_ba or not length_bc:
        return None

    cosine = np.dot(vector_ba, vector_bc) / (length_ba * length_bc)
    cosine = float(np.clip(cosine, -1, 1))
    return float(np.degrees(np.arccos(cosine)))
