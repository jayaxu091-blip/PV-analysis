from __future__ import annotations

import json
import mimetypes
import re
import shutil
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

try:
    from pose_engine import analyze_video
except Exception as import_error:
    analyze_video = None
    POSE_IMPORT_ERROR = import_error
else:
    POSE_IMPORT_ERROR = None


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
ATTEMPTS_FILE = DATA_DIR / "attempts.json"


def ensure_storage() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    if not ATTEMPTS_FILE.exists():
        ATTEMPTS_FILE.write_text("[]", encoding="utf-8")


def load_attempts() -> list[dict]:
    ensure_storage()
    try:
        return json.loads(ATTEMPTS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []


def save_attempts(attempts: list[dict]) -> None:
    ensure_storage()
    ATTEMPTS_FILE.write_text(json.dumps(attempts, indent=2), encoding="utf-8")


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict | list) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def error_response(handler: BaseHTTPRequestHandler, status: int, message: str) -> None:
    json_response(handler, status, {"error": message})


def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if length == 0:
        return {}
    body = handler.rfile.read(length)
    return json.loads(body.decode("utf-8"))


def parse_multipart_upload(handler: BaseHTTPRequestHandler) -> tuple[str, bytes]:
    content_type = handler.headers.get("Content-Type", "")
    boundary_match = re.search(r"boundary=(.+)", content_type)
    if not boundary_match:
        raise ValueError("Missing multipart boundary.")

    boundary = boundary_match.group(1).strip().strip('"')
    boundary_bytes = ("--" + boundary).encode("utf-8")
    length = int(handler.headers.get("Content-Length", "0"))
    body = handler.rfile.read(length)

    for raw_part in body.split(boundary_bytes):
        if b'Content-Disposition' not in raw_part or b'name="video"' not in raw_part:
            continue

        header_blob, _, content = raw_part.partition(b"\r\n\r\n")
        if not content:
            continue

        filename_match = re.search(
            rb'filename="([^"]+)"',
            header_blob,
        )
        filename = filename_match.group(1).decode("utf-8", errors="ignore") if filename_match else "vault-video.mp4"
        content = content.rstrip(b"\r\n-")
        return filename, content

    raise ValueError('Expected multipart field named "video".')


def safe_extension(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".mp4", ".mov", ".m4v", ".webm", ".avi"}:
        return suffix
    return ".mp4"


def read_uint32(data: bytes, index: int) -> int:
    return int.from_bytes(data[index:index + 4], "big")


def find_boxes(data: bytes, box_type: bytes, start: int = 0, end: int | None = None) -> list[tuple[int, int]]:
    if end is None:
        end = len(data)
    boxes: list[tuple[int, int]] = []
    index = start
    while index + 8 <= end:
        size = read_uint32(data, index)
        kind = data[index + 4:index + 8]
        if size == 0:
            size = end - index
        if size < 8:
            break
        box_end = min(index + size, end)
        if kind == box_type:
            boxes.append((index, box_end))
        index = box_end
    return boxes


def get_child_box(data: bytes, parent: tuple[int, int], box_type: bytes) -> tuple[int, int] | None:
    start, end = parent
    children = find_boxes(data, box_type, start + 8, end)
    return children[0] if children else None


def extract_mp4_metadata(path: Path) -> dict:
    data = path.read_bytes()[:8_000_000]
    metadata: dict = {
        "filename": path.name,
        "sizeBytes": path.stat().st_size,
        "durationSeconds": None,
        "width": None,
        "height": None,
    }

    moov = find_boxes(data, b"moov")
    if not moov:
        return metadata

    mvhd = get_child_box(data, moov[0], b"mvhd")
    if mvhd:
        start, _ = mvhd
        version = data[start + 8]
        if version == 1 and start + 32 <= len(data):
            timescale = read_uint32(data, start + 28)
            duration = int.from_bytes(data[start + 32:start + 40], "big")
        elif start + 24 <= len(data):
            timescale = read_uint32(data, start + 20)
            duration = read_uint32(data, start + 24)
        else:
            timescale = 0
            duration = 0

        if timescale:
            metadata["durationSeconds"] = round(duration / timescale, 3)

    trak_boxes = find_boxes(data, b"trak", moov[0][0] + 8, moov[0][1])
    for trak in trak_boxes:
        tkhd = get_child_box(data, trak, b"tkhd")
        if not tkhd:
            continue
        start, _ = tkhd
        version = data[start + 8]
        dimension_offset = start + 92 if version == 1 else start + 84
        if dimension_offset + 8 <= len(data):
            width = read_uint32(data, dimension_offset) >> 16
            height = read_uint32(data, dimension_offset + 4) >> 16
            if width and height:
                metadata["width"] = width
                metadata["height"] = height
                break

    return metadata


def meters(value: float | None, unit: str | None) -> float | None:
    if value is None:
        return None
    return value * 0.3048 if unit == "ft" else value


def number(payload: dict, key: str) -> float | None:
    value = payload.get(key)
    if value in ("", None):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def analyze_attempt(payload: dict) -> dict:
    video_id = payload.get("videoId")
    metadata = None
    pose_result = None
    if video_id:
        matches = list(UPLOAD_DIR.glob(f"{video_id}.*"))
        if matches:
            video_path = matches[0]
            metadata = extract_mp4_metadata(video_path)
            if analyze_video:
                try:
                    pose_result = analyze_video(video_path)
                except Exception as error:
                    pose_result = {
                        "engineStatus": "pose_engine_error",
                        "error": str(error),
                    }

    approach_distance = meters(number(payload, "approachDistance"), payload.get("approachDistanceUnit"))
    approach_time = number(payload, "approachTime")
    bar_height = meters(number(payload, "barHeight"), payload.get("unit"))
    grip_height = meters(number(payload, "gripHeight"), payload.get("gripUnit"))
    takeoff_angle = number(payload, "takeoffAngle")
    inversion_angle = number(payload, "inversionAngle")
    takeoff_time = number(payload, "takeoffTime")
    clearance_time = number(payload, "clearanceTime")

    if pose_result and pose_result.get("metrics"):
      pose_metrics = pose_result["metrics"]
      takeoff_angle = pose_metrics.get("takeoffAngleDegrees") or takeoff_angle
      inversion_angle = pose_metrics.get("inversionAngleDegrees") or inversion_angle

    if pose_result and pose_result.get("phaseEstimates"):
      phase_estimates = pose_result["phaseEstimates"]
      takeoff_time = phase_estimates.get("takeoffTimeSeconds") if phase_estimates.get("takeoffTimeSeconds") is not None else takeoff_time
      clearance_time = phase_estimates.get("clearanceTimeSeconds") if phase_estimates.get("clearanceTimeSeconds") is not None else clearance_time

    speed = approach_distance / approach_time if approach_distance and approach_time else None
    flight_time = clearance_time - takeoff_time if takeoff_time is not None and clearance_time and clearance_time > takeoff_time else None
    grip_over_bar = grip_height - bar_height if grip_height is not None and bar_height is not None else None

    suggestions: list[str] = []
    if speed is None:
        suggestions.append("Enter approach distance and approach time so the backend can estimate runway speed.")
    elif speed < 6:
        suggestions.append("Approach speed appears to be the first priority. Improve controlled acceleration before raising grip.")
    elif speed < 7.5:
        suggestions.append("Approach speed is developing. Compare makes and misses to see whether speed stays consistent.")
    else:
        suggestions.append("Approach speed looks like a strength. Focus on converting speed through takeoff and swing.")

    if takeoff_angle is None:
        suggestions.append("The backend needs pose analysis to estimate takeoff angle automatically.")
    elif takeoff_angle < 16:
        suggestions.append("Estimated takeoff angle is low. Check posture and whether the athlete is taking off under.")
    elif takeoff_angle > 28:
        suggestions.append("Estimated takeoff angle is high. Check whether the athlete is jumping up and losing horizontal speed.")
    else:
        suggestions.append("Takeoff angle is in a workable range. Next compare takeoff position and swing timing.")

    if inversion_angle is None:
        suggestions.append("The backend needs pose analysis to estimate max inversion automatically.")
    elif inversion_angle < 125:
        suggestions.append("Estimated inversion is low. Prioritize a longer swing and getting hips above shoulders.")
    elif inversion_angle < 155:
        suggestions.append("Inversion is improving, but there may be room to finish the swing more completely.")
    else:
        suggestions.append("Inversion looks strong. Look next at clearance timing and bar efficiency.")

    return {
        "videoId": video_id,
        "metadata": metadata,
        "metrics": {
            "approachSpeedMps": round(speed, 3) if speed is not None else None,
            "flightTimeSeconds": round(flight_time, 3) if flight_time is not None else None,
            "gripOverBarMeters": round(grip_over_bar, 3) if grip_over_bar is not None else None,
            "takeoffAngleDegrees": takeoff_angle,
            "inversionAngleDegrees": inversion_angle,
        },
        "phaseEstimates": pose_result.get("phaseEstimates") if pose_result and pose_result.get("phaseEstimates") else {
            "takeoffTimeSeconds": takeoff_time,
            "maxInversionTimeSeconds": None,
            "clearanceTimeSeconds": clearance_time,
            "source": "manual_or_frontend_until_pose_engine_is_installed",
        },
        "poseLandmarks": pose_result.get("landmarks") if pose_result and pose_result.get("landmarks") else None,
        "suggestions": suggestions,
        "engine": {
            "status": pose_result.get("engineStatus") if pose_result else "working_backend_no_pose_video_result",
            "poseImportError": str(POSE_IMPORT_ERROR) if POSE_IMPORT_ERROR else None,
            "nextStep": "Validate these estimates against manually tagged pole vault frames, then improve the phase detector.",
        },
    }


class VaultLabHandler(BaseHTTPRequestHandler):
    server_version = "VaultLabBackend/0.1"

    def do_OPTIONS(self) -> None:
        json_response(self, 200, {"ok": True})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/health":
            json_response(self, 200, {"ok": True, "service": "vaultlab-backend"})
            return

        if path == "/api/attempts":
            json_response(self, 200, load_attempts())
            return

        if path == "/api/uploads":
            files = []
            for file_path in UPLOAD_DIR.glob("*"):
                if file_path.is_file():
                    files.append({
                        "id": file_path.stem,
                        "filename": file_path.name,
                        "sizeBytes": file_path.stat().st_size,
                    })
            json_response(self, 200, files)
            return

        if path.startswith("/uploads/"):
            self.serve_upload(path.removeprefix("/uploads/"))
            return

        error_response(self, 404, "Not found.")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            if path == "/api/upload":
                self.handle_upload()
                return

            if path == "/api/attempts":
                payload = read_json_body(self)
                attempts = load_attempts()
                payload.setdefault("id", str(uuid.uuid4()))
                payload.setdefault("createdAt", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
                attempts.insert(0, payload)
                save_attempts(attempts)
                json_response(self, 201, payload)
                return

            if path == "/api/analyze":
                payload = read_json_body(self)
                json_response(self, 200, analyze_attempt(payload))
                return

            error_response(self, 404, "Not found.")
        except Exception as error:
            error_response(self, 500, str(error))

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/attempts/"):
            attempt_id = path.removeprefix("/api/attempts/")
            attempts = [attempt for attempt in load_attempts() if attempt.get("id") != attempt_id]
            save_attempts(attempts)
            json_response(self, 200, {"deleted": attempt_id})
            return

        error_response(self, 404, "Not found.")

    def handle_upload(self) -> None:
        original_name, content = parse_multipart_upload(self)
        video_id = str(uuid.uuid4())
        extension = safe_extension(original_name)
        target = UPLOAD_DIR / f"{video_id}{extension}"
        target.write_bytes(content)

        metadata = extract_mp4_metadata(target) if extension in {".mp4", ".m4v", ".mov"} else {
            "filename": target.name,
            "sizeBytes": target.stat().st_size,
            "durationSeconds": None,
            "width": None,
            "height": None,
        }

        json_response(self, 201, {
            "id": video_id,
            "originalName": original_name,
            "filename": target.name,
            "url": f"/uploads/{target.name}",
            "metadata": metadata,
        })

    def serve_upload(self, filename: str) -> None:
        safe_name = Path(filename).name
        target = UPLOAD_DIR / safe_name
        if not target.exists() or not target.is_file():
            error_response(self, 404, "Upload not found.")
            return

        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(target.stat().st_size))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        with target.open("rb") as handle:
            shutil.copyfileobj(handle, self.wfile)

    def log_message(self, format: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def main() -> None:
    ensure_storage()
    server = ThreadingHTTPServer(("127.0.0.1", 8765), VaultLabHandler)
    print("VaultLab backend running at http://127.0.0.1:8765")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
