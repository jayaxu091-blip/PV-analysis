from __future__ import annotations

import json
import urllib.request
import uuid
from pathlib import Path


BASE_URL = "http://127.0.0.1:8765"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SAMPLE_VIDEO = PROJECT_ROOT / "9 feet.mp4"


def request_json(path: str, data: bytes | None = None, headers: dict | None = None) -> dict:
    request = urllib.request.Request(BASE_URL + path, data=data, headers=headers or {})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def upload_video(path: Path) -> dict:
    boundary = "----VaultLab" + uuid.uuid4().hex
    body = b"".join([
        f"--{boundary}\r\n".encode("utf-8"),
        f'Content-Disposition: form-data; name="video"; filename="{path.name}"\r\n'.encode("utf-8"),
        b"Content-Type: video/mp4\r\n\r\n",
        path.read_bytes(),
        f"\r\n--{boundary}--\r\n".encode("utf-8"),
    ])
    return request_json(
        "/api/upload",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )


def main() -> None:
    print("health:", request_json("/api/health"))
    upload = upload_video(SAMPLE_VIDEO)
    print("upload:", upload)

    analysis_payload = {
        "videoId": upload["id"],
        "barHeight": 9,
        "unit": "ft",
        "gripHeight": 11,
        "gripUnit": "ft",
        "approachDistance": 80,
        "approachDistanceUnit": "ft",
        "approachTime": 3.8,
        "takeoffAngle": 20,
        "inversionAngle": 145,
        "takeoffTime": 1.2,
        "clearanceTime": 2.4,
    }
    analysis = request_json(
        "/api/analyze",
        data=json.dumps(analysis_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    print("analysis:", json.dumps(analysis, indent=2))


if __name__ == "__main__":
    main()
