import type { FrameAnalysis, Landmark, PoseReadout } from "./types";
import { describeInversion, buildFrameAnalysis as buildAuditFrame, type ImageSize } from "./poseMeasurements";
import { angleBetween, buildFrameAnalysis, sampleCountForVideo } from "./studyMeasurements";
export { estimateVaultPhases, isVisible, sampleCountForVideo } from "./studyMeasurements";

export const POSE_RUNTIME_VERSION = "0.10.18";
export const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type PoseLandmarker = {
  detectForVideo: (video: HTMLVideoElement, timestampMs: number) => { landmarks?: Landmark[][] };
  close: () => void;
};
type VisionModule = {
  FilesetResolver: { forVisionTasks: (wasmPath: string) => Promise<unknown> };
  PoseLandmarker: { createFromOptions: (fileset: unknown, options: unknown) => Promise<PoseLandmarker> };
};

async function createPoseLandmarker() {
  const base = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${POSE_RUNTIME_VERSION}`;
  const vision = await import(/* @vite-ignore */ `${base}/+esm`) as VisionModule;
  const fileset = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
  return vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "CPU" },
    runningMode: "VIDEO", numPoses: 1,
  });
}

export function buildPoseReadout(landmarks: Landmark[], time: number, size: ImageSize): PoseReadout {
  const frame = buildFrameAnalysis(time, landmarks, size);
  const format = (value: number | null) => value === null ? "--" : `${value.toFixed(1)} deg`;
  return {
    status: `Pose AI analyzed frame at ${time.toFixed(2)}s.`,
    jointCount: `${frame.visibleCount} of 33`,
    bodyLineAngle: format(frame.bodyLine),
    torsoOrientation: format(frame.torsoOrientation),
    leftKneeAngle: format(angleBetween(landmarks[23], landmarks[25], landmarks[27])),
    rightKneeAngle: format(angleBetween(landmarks[24], landmarks[26], landmarks[28])),
    inversionClue: describeInversion(landmarks),
  };
}

export function seekVideo(video: HTMLVideoElement, time: number) {
  const target = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.001));
  if (Math.abs(video.currentTime - target) < 0.00001 && video.readyState >= 2) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("Video frame could not be decoded.")); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Video seek timed out.")); }, 15000);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = target;
  });
}

export async function analyzeVideoFrames(video: HTMLVideoElement, onProgress: (message: string) => void) {
  return extractFrames(video, onProgress, false);
}

export function auditSampleCountForVideo(duration: number) {
  return Math.min(120, Math.max(32, Math.round(duration * 10)));
}

// Keep the separate, unpublished v2 audit reproducible without changing study inputs.
export async function analyzeAuditVideoFrames(video: HTMLVideoElement, onProgress: (message: string) => void) {
  return extractFrames(video, onProgress, true);
}

async function extractFrames(video: HTMLVideoElement, onProgress: (message: string) => void, audit: boolean) {
  if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
    throw new Error("Video dimensions and duration are required.");
  }
  // Isolate clips, but retain the study's sampling schedule and synthetic tracker clock.
  const model = await createPoseLandmarker();
  const sampleCount = (audit ? auditSampleCountForVideo : sampleCountForVideo)(video.duration);
  const size = { width: video.videoWidth, height: video.videoHeight };
  const frames: FrameAnalysis[] = [];
  try {
    for (let index = 0; index < sampleCount; index++) {
      const time = ((audit ? Math.max(0, video.duration - 0.001) : video.duration) * index) / (sampleCount - 1);
      await seekVideo(video, time);
      const landmarks = model.detectForVideo(video, audit ? time * 1000 : (index + 1) * 33).landmarks?.[0];
      if (landmarks?.length) frames.push(audit ? buildAuditFrame(video.currentTime, landmarks, size) : buildFrameAnalysis(time, landmarks, size));
      onProgress(`Analyzing full video... ${Math.round((index + 1) / sampleCount * 100)}%`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    model.close();
  }
  return frames;
}
