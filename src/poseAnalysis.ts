import type { FrameAnalysis, Landmark, PoseReadout, VaultPhases } from "./types";

type PoseLandmarker = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => { landmarks?: Landmark[][] };
};

type VisionModule = {
  FilesetResolver: {
    forVisionTasks: (wasmPath: string) => Promise<unknown>;
  };
  PoseLandmarker: {
    createFromOptions: (fileset: unknown, options: unknown) => Promise<PoseLandmarker>;
  };
};

let poseLandmarker: PoseLandmarker | null = null;
let poseTimestampMs = 0;

export function resetPoseClock() {
  poseTimestampMs = 0;
}

function nextPoseTimestamp() {
  poseTimestampMs += 33;
  return poseTimestampMs;
}

async function loadMediaPipeVision() {
  const sources = [
    {
      moduleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/+esm",
      wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm",
    },
    {
      moduleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm",
      wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    },
    {
      moduleUrl: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/+esm",
      wasmPath: "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
    },
  ];
  let lastError: unknown = null;

  for (const source of sources) {
    try {
      const vision = (await import(/* @vite-ignore */ source.moduleUrl)) as VisionModule;
      return { vision, wasmPath: source.wasmPath };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("MediaPipe package could not be loaded.");
}

export async function getPoseLandmarker() {
  if (poseLandmarker) return poseLandmarker;

  const mediaPipe = await loadMediaPipeVision();
  const filesetResolver = await mediaPipe.vision.FilesetResolver.forVisionTasks(mediaPipe.wasmPath);

  poseLandmarker = await mediaPipe.vision.PoseLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "CPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });

  return poseLandmarker;
}

export function isVisible(point?: Landmark | null) {
  return Boolean(point && (point.visibility === undefined || point.visibility > 0.45));
}

export function midpoint(pointA?: Landmark, pointB?: Landmark) {
  if (!isVisible(pointA) || !isVisible(pointB)) return null;
  return {
    x: ((pointA as Landmark).x + (pointB as Landmark).x) / 2,
    y: ((pointA as Landmark).y + (pointB as Landmark).y) / 2,
  };
}

export function lineAngle(pointA: Landmark | null, pointB: Landmark | null) {
  if (!pointA || !pointB) return null;
  const radians = Math.atan2(pointA.y - pointB.y, pointB.x - pointA.x);
  return Math.abs((radians * 180) / Math.PI);
}

export function angleBetween(pointA?: Landmark | null, pointB?: Landmark | null, pointC?: Landmark | null) {
  if (!isVisible(pointA) || !isVisible(pointB) || !isVisible(pointC)) return null;

  const a = pointA as Landmark;
  const b = pointB as Landmark;
  const c = pointC as Landmark;
  const vectorBA = { x: a.x - b.x, y: a.y - b.y };
  const vectorBC = { x: c.x - b.x, y: c.y - b.y };
  const dot = vectorBA.x * vectorBC.x + vectorBA.y * vectorBC.y;
  const lengthBA = Math.hypot(vectorBA.x, vectorBA.y);
  const lengthBC = Math.hypot(vectorBC.x, vectorBC.y);

  if (!lengthBA || !lengthBC) return null;

  const cosine = Math.max(-1, Math.min(1, dot / (lengthBA * lengthBC)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function estimateInversionAngle(landmarks: Landmark[]) {
  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const ankle = midpoint(landmarks[27], landmarks[28]);
  return angleBetween(shoulder, hip, ankle);
}

export function describeInversion(landmarks: Landmark[]) {
  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const ankle = midpoint(landmarks[27], landmarks[28]);

  if (!shoulder || !hip || !ankle) return "not enough visible joints";
  if (ankle.y < hip.y && hip.y < shoulder.y) return "strong inversion";
  if (hip.y < shoulder.y) return "hips above shoulders";
  if (ankle.y < shoulder.y) return "feet rising";
  return "not inverted yet";
}

export function buildPoseReadout(landmarks: Landmark[], currentTime: number): PoseReadout {
  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const leftKneeAngle = angleBetween(landmarks[23], landmarks[25], landmarks[27]);
  const rightKneeAngle = angleBetween(landmarks[24], landmarks[26], landmarks[28]);
  const bodyLine = lineAngle(hip, shoulder);

  return {
    status: `Pose AI analyzed frame at ${currentTime.toFixed(2)}s.`,
    jointCount: `${landmarks.filter(isVisible).length} of 33`,
    bodyLineAngle: Number.isFinite(bodyLine) ? `${bodyLine?.toFixed(1)} deg` : "--",
    leftKneeAngle: Number.isFinite(leftKneeAngle) ? `${leftKneeAngle?.toFixed(1)} deg` : "--",
    rightKneeAngle: Number.isFinite(rightKneeAngle) ? `${rightKneeAngle?.toFixed(1)} deg` : "--",
    inversionClue: describeInversion(landmarks),
  };
}

export function buildFrameAnalysis(time: number, landmarks: Landmark[]): FrameAnalysis {
  const shoulder = midpoint(landmarks[11], landmarks[12]);
  const hip = midpoint(landmarks[23], landmarks[24]);
  const ankle = midpoint(landmarks[27], landmarks[28]);
  const bodyLine = lineAngle(hip, shoulder);
  const inversionAngle = estimateInversionAngle(landmarks);
  const visibleCount = landmarks.filter(isVisible).length;
  const inversionScore = shoulder && hip && ankle ? shoulder.y - hip.y + (shoulder.y - ankle.y) : -99;

  return { time, landmarks, shoulder, hip, ankle, bodyLine, inversionAngle, visibleCount, inversionScore };
}

function estimateTakeoffFrame(frames: FrameAnalysis[], inversionFrame: FrameAnalysis) {
  const beforeInversion = frames.filter((frame) => frame.time < inversionFrame.time);
  const candidates: Array<{ frame: FrameAnalysis; score: number }> = [];

  for (let index = 1; index < beforeInversion.length; index += 1) {
    const previous = beforeInversion[index - 1];
    const current = beforeInversion[index];
    if (!previous.hip || !current.hip) continue;

    const hipRise = previous.hip.y - current.hip.y;
    const bodyReady = Number.isFinite(current.bodyLine) ? current.bodyLine || 0 : 0;
    const score = hipRise * 100 + current.visibleCount * 0.2 - Math.abs(22 - bodyReady) * 0.08;
    candidates.push({ frame: current, score });
  }

  if (candidates.length) return candidates.sort((a, b) => b.score - a.score)[0].frame;
  return beforeInversion[Math.max(0, Math.floor(beforeInversion.length * 0.65))] || frames[0];
}

function estimateClearanceFrame(frames: FrameAnalysis[], inversionFrame: FrameAnalysis) {
  const afterInversion = frames.filter((frame) => frame.time >= inversionFrame.time && frame.hip);
  if (!afterInversion.length) return inversionFrame;

  return afterInversion.slice().sort((a, b) => (a.hip?.y || 0) - (b.hip?.y || 0) || b.visibleCount - a.visibleCount)[0];
}

export function estimateVaultPhases(frames: FrameAnalysis[]): VaultPhases {
  const goodFrames = frames.filter((frame) => frame.visibleCount >= 16 && frame.hip && frame.shoulder);
  const usableFrames = goodFrames.length ? goodFrames : frames;
  const inversion = usableFrames
    .slice()
    .sort((a, b) => b.inversionScore - a.inversionScore || b.visibleCount - a.visibleCount)[0];

  return {
    takeoff: estimateTakeoffFrame(usableFrames, inversion),
    inversion,
    clearance: estimateClearanceFrame(usableFrames, inversion),
  };
}

export function seekVideo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = Math.min(Math.max(time, 0), video.duration || time);
  });
}

export async function analyzeVideoFrames(
  video: HTMLVideoElement,
  onProgress: (message: string) => void,
) {
  const model = await getPoseLandmarker();
  const sampleCount = Math.min(80, Math.max(24, Math.round(video.duration * 8)));
  const frames: FrameAnalysis[] = [];

  onProgress(`Analyzing ${sampleCount} frames across the vault...`);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = (video.duration * index) / Math.max(1, sampleCount - 1);
    await seekVideo(video, time);
    const result = model.detectForVideo(video, nextPoseTimestamp());
    const landmarks = result.landmarks && result.landmarks[0];

    if (landmarks && landmarks.length) {
      frames.push(buildFrameAnalysis(time, landmarks));
    }

    if (index % 8 === 0) {
      onProgress(`Analyzing full video... ${Math.round((index / sampleCount) * 100)}%`);
    }
  }

  return frames;
}
