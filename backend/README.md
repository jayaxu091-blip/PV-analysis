# VaultLab Backend

This is the first real backend for VaultLab.

It runs locally at:

```text
http://127.0.0.1:8765
```

## What It Does Now

- Accepts uploaded vault videos.
- Stores videos in `backend/data/uploads`.
- Extracts basic MP4 metadata when possible:
  - duration
  - width
  - height
  - file size
- Stores attempt records in `backend/data/attempts.json`.
- Returns structured analysis from entered attempt data:
  - approach speed
  - flight time
  - grip over bar
  - coaching suggestions

## What It Does Not Do Yet

It does not run a real pose model yet because OpenCV, MediaPipe, RTMPose, and YOLO Pose are not installed in this local Python runtime.

The next backend upgrade is:

```text
video -> frames -> pose model -> keypoint timeline -> pole vault phases -> metrics
```

## API

### Health

```text
GET /api/health
```

### Upload Video

```text
POST /api/upload
multipart field: video
```

### Save Attempt

```text
POST /api/attempts
Content-Type: application/json
```

### List Attempts

```text
GET /api/attempts
```

### Analyze Attempt

```text
POST /api/analyze
Content-Type: application/json
```

## Run

From the project folder:

```powershell
.\backend\start_backend.ps1
```

Or directly:

```powershell
& "C:\Users\jayax\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" ".\backend\server.py"
```
