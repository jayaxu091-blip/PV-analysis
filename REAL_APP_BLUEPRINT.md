# VaultLab Real App Blueprint

VaultLab's goal is to turn a pole vault video into useful coaching feedback.

The final app should not be only a video journal. It should become a phase-based technical analysis tool:

```text
video -> pose tracking over time -> vault phases -> KPIs -> coaching feedback -> what-if simulator
```

## Core User Flow

1. Athlete uploads a side-view vault video.
2. Athlete enters known attempt data:
   - bar height
   - grip height
   - approach distance
   - approach time
   - make or miss
3. App detects or helps mark key phases:
   - takeoff
   - max inversion
   - clearance
4. App calculates technical metrics:
   - approach speed
   - takeoff angle
   - inversion angle
   - flight time
   - grip over bar
   - technique score
5. App gives coaching feedback.
6. Athlete adjusts sliders to test possible improvements.

## Metrics To Build First

These are useful and realistic for a first real version:

- Approach speed: approach distance / approach time
- Takeoff time: video timestamp when takeoff foot leaves the ground
- Clearance time: video timestamp near bar clearance
- Flight time: clearance time - takeoff time
- Takeoff angle: body line near takeoff frame
- Max inversion angle: shoulder/hip/ankle angle near max inversion
- Grip over bar: grip height - bar height

## Metrics To Add Later

- Takeoff position relative to box
- Last-three-step rhythm
- Step length and frequency
- Pole angle at plant
- Max pole bend
- Hip path and center-of-mass path
- Bar clearance efficiency

## Model Strategy

### Current Browser Prototype

Use MediaPipe Pose Landmarker for:

- joint detection on selected frames
- skeleton overlay
- early takeoff and inversion angle estimates

This is good for learning and fast prototyping.

### Real Backend Version

Use a Python backend with OpenCV and a stronger pose model:

- RTMPose or YOLO Pose for 2D keypoints
- frame-by-frame analysis
- keypoint timeline storage
- future fine-tuning on pole vault videos

Recommended backend stack:

- FastAPI
- OpenCV
- RTMPose or YOLO Pose
- PostgreSQL or Supabase
- Supabase Storage or S3 for videos

## Build Order

### Phase 1: Productize The Current Frontend

- Keep the upload, log, and saved attempt system.
- Add phase markers: takeoff, max inversion, clearance.
- Add a coaching feedback panel.
- Save phase timestamps and AI measurements.

### Phase 2: Selected-Frame AI Analysis

- User pauses on takeoff, max inversion, and clearance.
- App analyzes those frames.
- App fills takeoff angle and inversion angle.

This is the best first real product step because it avoids pretending full automatic detection is perfect.

### Phase 3: Full-Video Pose Tracking

- Analyze every nth frame.
- Store keypoints over time.
- Graph hip, shoulder, ankle movement.
- Detect max inversion from the full sequence.

### Phase 4: Automatic Phase Detection

- Rule-based first:
  - detect foot/hip/shoulder movement patterns
  - find highest inversion frame
  - identify takeoff/clearance candidates
- Later use a temporal model such as MS-TCN++ or ASFormer.

### Phase 5: Prediction And Improvement Simulator

- Train only after collecting enough real attempts.
- Use the slider model as an estimate, not a guarantee.
- Show ranges and confidence, not fake certainty.

## Important Coaching Rule

Do not present single-camera angle measurements as perfect truth.

Use language like:

- "estimated"
- "likely"
- "check this frame"
- "compare this to your better attempts"

Pole vault is fast, 3D, and affected by camera angle, so the app should build trust by being honest about uncertainty.
