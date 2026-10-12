import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import "./styles.css";
import type { Attempt, AttemptForm, FrameAnalysis, Landmark, PhaseStatus, PoseReadout } from "./types";
import {
  appendNoteOnce,
  createId,
  emptyForm,
  escapeCsv,
  formatHeight,
  getMetrics,
  parseNumber,
  storageKey,
} from "./utils";
import { auth, googleProvider } from "./firebase";
import { clearSavedVideos, deleteSavedVideo, getVideo, saveVideo } from "./videoStore";
import {
  analyzeVideoFrames,
  buildPoseReadout,
  estimateVaultPhases,
  isVisible,
  seekVideo,
} from "./poseAnalysis";
import { formVector, predictVault, trainVaultModel, type TrainedVaultModel, type VaultPrediction } from "./vaultModel";
import { nearestPoseFrame } from "./poseMeasurements";
import { MEASUREMENT_VERSION } from "./studyMeasurements";
import { displayNumber, readPhaseTime } from "./presentation";
import { estimateApproach } from "./approachAnalysis";
import { buildAthleteFeedback, predictionEffect } from "./athleteFeedback";

const emptyPoseReadout: PoseReadout = {
  status: "Pose AI has not analyzed this video yet.",
  jointCount: "--",
  bodyLineAngle: "--",
  torsoOrientation: "--",
  leftKneeAngle: "--",
  rightKneeAngle: "--",
  inversionClue: "--",
};

const emptyPhaseStatus: PhaseStatus = {
  approach: "Not analyzed.",
  takeoff: "Not analyzed yet.",
  inversion: "Not analyzed.",
  clearance: "Not analyzed yet.",
};

type ActiveUser = {
  key: string;
  label: string;
  isDemo: boolean;
};

function storageKeyForActiveUser(activeUser: ActiveUser) {
  return `${storageKey}-${activeUser.key}`;
}

function loadAttempts(activeUser: ActiveUser | null) {
  if (!activeUser) return [];
  try {
    return JSON.parse(localStorage.getItem(storageKeyForActiveUser(activeUser)) || "[]") as Attempt[];
  } catch {
    return [];
  }
}

function toActiveUser(user: User): ActiveUser {
  return {
    key: user.uid,
    label: user.email || "Signed in",
    isDemo: false,
  };
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const poseAnimationRef = useRef<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [form, setForm] = useState<AttemptForm>(emptyForm);
  const [videoFile, setVideoFile] = useState<File | Blob | null>(null);
  const [videoName, setVideoName] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [poseReadout, setPoseReadout] = useState<PoseReadout>(emptyPoseReadout);
  const [phaseStatus, setPhaseStatus] = useState<PhaseStatus>(emptyPhaseStatus);
  const [poseTimeline, setPoseTimeline] = useState<FrameAnalysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const activeUser: ActiveUser | null = user ? toActiveUser(user) : demoMode ? { key: "competition-demo", label: "Demo mode", isDemo: true } : null;

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      const nextActiveUser = nextUser ? toActiveUser(nextUser) : null;
      setAttempts(loadAttempts(nextActiveUser));
      setAuthReady(true);
      if (nextUser) setDemoMode(false);
    });
  }, []);

  useEffect(() => {
    setAttempts(loadAttempts(activeUser));
    startNewAttempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUser?.key]);

  const metrics = useMemo(() => getMetrics(form), [form]);
  const reviewPhases = useMemo(() => poseTimeline.length >= 3 ? estimateVaultPhases(poseTimeline) : null, [poseTimeline]);
  const coachFeedback = useMemo(() => buildAthleteFeedback(reviewPhases?.inversion ?? null, form.approachEstimate), [reviewPhases, form.approachEstimate]);
  const vaultModel = useMemo(() => trainVaultModel(attempts), [attempts]);
  const vaultPrediction = useMemo(() => predictVault(vaultModel, formVector(form, metrics)), [vaultModel, form, metrics]);
  const bestMake = useMemo(() => {
    return attempts
      .filter((attempt) => attempt.result === "make")
      .map((attempt) => ({
        heightMeters: attempt.unit === "ft" ? attempt.barHeight * 0.3048 : attempt.barHeight,
        label: formatHeight(attempt.barHeight, attempt.unit),
      }))
      .sort((a, b) => b.heightMeters - a.heightMeters)[0];
  }, [attempts]);

  function updateField<K extends keyof AttemptForm>(key: K, value: AttemptForm[K]) {
    setForm((current) => {
      if (key === "takeoffTime" && current.approachEstimate && value !== current.takeoffTime) {
        return { ...current, [key]: value, approachTime: "", approachEstimate: {
          ...current.approachEstimate, start: null, end: null, duration: null, sampleGap: null,
          message: "Takeoff timing was edited. Reanalyze the video to estimate run-up time again.",
        } };
      }
      return { ...current, [key]: value };
    });
    if (key === "takeoffTime" && value !== form.takeoffTime && form.approachEstimate) {
      setPhaseStatus(current => ({ ...current, approach: "Timing edited. Reanalyze for a new run-up estimate." }));
    }
  }

  function persistAttempts(next: Attempt[]) {
    if (!activeUser) return;
    setAttempts(next);
    localStorage.setItem(storageKeyForActiveUser(activeUser), JSON.stringify(next));
  }

  function resetPoseState() {
    cancelPoseAnimation();
    clearPoseCanvas();
    setPoseReadout(emptyPoseReadout);
    setPhaseStatus(emptyPhaseStatus);
    setPoseTimeline([]);
  }

  function handleVideoUpload(file: File | null) {
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const nextUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoName(file.name);
    setVideoUrl(nextUrl);
    setVideoLoaded(true);
    resetPoseState();
    setForm(current => ({ ...current, measurementVersion: undefined, torsoOrientation: "", approachTime: "", approachEstimate: undefined,
      takeoffAngle: "", inversionAngle: "", takeoffTime: "", clearanceTime: "" }));
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setIsPortrait(video.videoHeight > video.videoWidth);
    drawCurrentPose();
  }

  function startNewAttempt() {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setForm(emptyForm());
    setVideoFile(null);
    setVideoName("");
    setVideoUrl("");
    setVideoLoaded(false);
    setIsPortrait(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    resetPoseState();
  }

  function openVideoFullscreen() {
    const video = videoRef.current;
    if (!video || !videoLoaded) {
      alert("Upload a video first.");
      return;
    }

    video.requestFullscreen?.();
  }

  async function analyzeFullVideo() {
    if (analyzing) return;
    const video = videoRef.current;
    if (!video || !videoLoaded || !video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      alert("Upload and load a video first.");
      return;
    }

    const originalTime = video.currentTime;
    setAnalyzing(true);
    resetPoseState();
    setForm(current => ({ ...current, measurementVersion: undefined, torsoOrientation: "", approachTime: "", approachEstimate: undefined,
      takeoffAngle: "", inversionAngle: "", takeoffTime: "", clearanceTime: "" }));

    try {
      video.pause();
      setPoseReadout((current) => ({ ...current, status: "Loading pose AI model..." }));
      const frames = await analyzeVideoFrames(video, (status) => setPoseReadout((current) => ({ ...current, status })));

      if (frames.length < 3) {
        setPoseReadout((current) => ({
          ...current,
          status: "Full-video analysis did not find enough visible athlete frames.",
        }));
        await seekVideo(video, originalTime);
        return;
      }

      const phases = estimateVaultPhases(frames);
      const approach = estimateApproach(frames, phases.takeoff, video.videoWidth / video.videoHeight);
      setPoseTimeline(frames);
      const format = (value: number | null | undefined) => value == null ? "" : String(value);
      const timeLabel = (frame: FrameAnalysis | null) => frame ? `${frame.time.toFixed(2)}s` : "not detected";
      setForm(current => ({
        ...current,
        measurementVersion: MEASUREMENT_VERSION,
        approachEstimate: approach,
        approachTime: format(approach.duration),
        takeoffTime: format(phases.takeoff?.time),
        clearanceTime: format(phases.clearance?.time),
        takeoffAngle: format(phases.takeoff?.bodyLine),
        inversionAngle: format(phases.inversion?.inversionAngle),
        torsoOrientation: format(phases.inversion?.torsoOrientation),
        notes: appendNoteOnce(
          current.notes,
          `Auto analysis: estimated takeoff ${timeLabel(phases.takeoff)}, max inversion ${timeLabel(phases.inversion)}, clearance ${timeLabel(phases.clearance)}. Takeoff angle ${nextValue(phases.takeoff?.bodyLine)}; inversion angle ${nextValue(phases.inversion?.inversionAngle)}. ${approach.duration !== null ? `Estimated run-up time ${approach.duration.toFixed(2)}s.` : `Run-up time unavailable: ${approach.message}`}`,
        ),
      }));
      setPhaseStatus({
        approach: approach.duration !== null ? `About ${approach.duration.toFixed(2)}s. Start at ${approach.start!.toFixed(2)}s; estimated takeoff at ${approach.end!.toFixed(2)}s.` : approach.message,
        takeoff: `Auto-estimated at ${timeLabel(phases.takeoff)}. Review this frame for takeoff.`,
        inversion: `Auto-estimated at ${timeLabel(phases.inversion)}. Review the selected inversion frame.`,
        clearance: `Auto-estimated at ${timeLabel(phases.clearance)}. Bar crossing is approximate.`,
      });
      const displayFrame = phases.inversion ?? phases.approachStart ?? frames[0];
      await seekVideo(video, displayFrame.time);
      drawPose(displayFrame.landmarks);
      setPoseReadout({
        ...buildPoseReadout(displayFrame.landmarks, displayFrame.time, { width: video.videoWidth, height: video.videoHeight }),
        frameTime: displayFrame.time,
        status: `Auto analysis complete: ${frames.length} frames with pose detections. Review the estimated phase times.`,
      });
    } catch (error) {
      console.error(error);
      setPoseReadout((current) => ({
        ...current,
        status: `Pose AI error: ${error instanceof Error ? error.message : "model could not analyze video"}. Try refreshing or checking your internet connection.`,
      }));
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveAttempt() {
    const athlete = form.athlete.trim();
    const barHeight = parseNumber(form.barHeight);
    const gripHeight = parseNumber(form.gripHeight);
    const approachDistance = parseNumber(form.approachDistance);

    if (!athlete || barHeight === null || !form.unit || !form.result) {
      alert("Please enter an athlete, bar height, bar unit, and result.");
      return;
    }

    if (gripHeight !== null && !form.gripUnit) {
      alert("Please choose a grip unit.");
      return;
    }

    if (approachDistance !== null && !form.approachDistanceUnit) {
      alert("Please choose an approach distance unit.");
      return;
    }

    const videoId = videoFile ? createId() : null;
    if (videoFile && videoId) {
      try {
        await saveVideo(videoId, videoFile);
      } catch {
        alert("The attempt was not saved because the video could not be stored in this browser.");
        return;
      }
    }

    const attempt: Attempt = {
      approachEstimate: form.approachEstimate,
      measurementVersion: form.measurementVersion,
      torsoOrientation: parseNumber(form.torsoOrientation ?? ""),
      id: createId(),
      athlete,
      date: form.date,
      barHeight,
      unit: form.unit,
      result: form.result,
      videoId,
      videoName,
      speed: metrics.speed,
      gripHeight,
      gripUnit: form.gripUnit,
      approachDistance,
      approachDistanceUnit: form.approachDistanceUnit,
      approachTime: parseNumber(form.approachTime),
      takeoffAngle: parseNumber(form.takeoffAngle),
      inversionAngle: parseNumber(form.inversionAngle),
      takeoffTime: parseNumber(form.takeoffTime),
      clearanceTime: parseNumber(form.clearanceTime),
      inversionPhaseTime: readPhaseTime(phaseStatus.inversion),
      notes: form.notes.trim(),
    };

    persistAttempts([attempt, ...attempts]);
  }

  async function loadAttempt(attempt: Attempt) {
    resetPoseState();
    setForm({
      approachEstimate: attempt.approachEstimate,
      measurementVersion: attempt.measurementVersion,
      torsoOrientation: attempt.torsoOrientation?.toString() ?? "",
      athlete: attempt.athlete || "",
      date: attempt.date || "",
      barHeight: attempt.barHeight?.toString() || "",
      unit: attempt.unit || "",
      gripHeight: attempt.gripHeight?.toString() || "",
      gripUnit: attempt.gripUnit || "",
      approachDistance: attempt.approachDistance?.toString() || "",
      approachDistanceUnit: attempt.approachDistanceUnit || "",
      approachTime: attempt.approachTime?.toString() || "",
      takeoffAngle: attempt.measurementVersion === MEASUREMENT_VERSION ? attempt.takeoffAngle?.toString() ?? "" : "",
      inversionAngle: attempt.measurementVersion === MEASUREMENT_VERSION ? attempt.inversionAngle?.toString() ?? "" : "",
      takeoffTime: attempt.measurementVersion === MEASUREMENT_VERSION ? attempt.takeoffTime?.toString() ?? "" : "",
      clearanceTime: attempt.measurementVersion === MEASUREMENT_VERSION ? attempt.clearanceTime?.toString() ?? "" : "",
      notes: attempt.notes || "",
      result: attempt.result || "",
    });

    if (attempt.measurementVersion !== MEASUREMENT_VERSION) {
      setPoseReadout({ ...emptyPoseReadout, status: "Saved measurements use different or unknown rules. Reanalyze the video with the study rules before predicting." });
    }

    setPhaseStatus({
      approach:
        attempt.approachTime !== null && attempt.approachTime !== undefined
          ? `Saved ${attempt.approachEstimate ? "estimated" : "manually entered"} run-up time: ${Number(attempt.approachTime).toFixed(2)}s.`
          : attempt.approachEstimate?.message ?? emptyPhaseStatus.approach,
      takeoff:
        attempt.takeoffTime !== null && attempt.takeoffTime !== undefined
          ? `Saved ${attempt.measurementVersion === MEASUREMENT_VERSION ? "study takeoff proxy" : "unversioned takeoff proxy"}: ${Number(attempt.takeoffTime).toFixed(2)}s.`
          : emptyPhaseStatus.takeoff,
      inversion:
        attempt.inversionPhaseTime !== null && attempt.inversionPhaseTime !== undefined
          ? `Saved max inversion time: ${Number(attempt.inversionPhaseTime).toFixed(2)}s.`
          : emptyPhaseStatus.inversion,
      clearance:
        attempt.clearanceTime !== null && attempt.clearanceTime !== undefined
          ? `Saved ${attempt.measurementVersion === MEASUREMENT_VERSION ? "highest-hip candidate" : "legacy clearance proxy"}: ${Number(attempt.clearanceTime).toFixed(2)}s.`
          : emptyPhaseStatus.clearance,
    });

    if (attempt.videoId) await loadAttemptVideo(attempt.videoId);
  }

  async function loadAttemptVideo(videoId: string) {
    try {
      const savedVideo = await getVideo(videoId);
      if (!savedVideo) {
        alert("This saved video could not be found in this browser.");
        return;
      }

      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const nextUrl = URL.createObjectURL(savedVideo.blob);
      setVideoUrl(nextUrl);
      setVideoLoaded(true);
      setVideoName(savedVideo.name);

      try {
        setVideoFile(new File([savedVideo.blob], savedVideo.name, { type: savedVideo.type }));
      } catch {
        setVideoFile(savedVideo.blob);
      }
    } catch {
      alert("This browser could not load the saved video.");
    }
  }

  async function clearAttempts() {
    if (!attempts.length) return;
    if (!confirm("Clear all saved attempts from this browser?")) return;
    await clearSavedVideos();
    persistAttempts([]);
  }

  async function deleteAttempt(attempt: Attempt) {
    if (!confirm("Delete this attempt from the log?")) return;
    await deleteSavedVideo(attempt.videoId);
    persistAttempts(attempts.filter((item) => item.id !== attempt.id));
  }

  async function handleSignOut() {
    if (demoMode) {
      setDemoMode(false);
      setAttempts([]);
      startNewAttempt();
      return;
    }
    await signOut(auth);
  }

  function exportCsv() {
    const headers = [
      "date",
      "athlete",
      "barHeight",
      "barUnit",
      "result",
      "speed",
      "gripHeight",
      "gripUnit",
      "approachDistance",
      "approachDistanceUnit",
      "approachTime",
      "takeoffAngle",
      "inversionAngle",
      "takeoffTime",
      "clearanceTime",
      "notes",
      "measurementVersion",
      "torsoOrientationDeg",
      "approachMethod",
      "approachStartSeconds",
      "approachSampleGapSeconds",
    ];
    const rows = attempts.map((attempt) =>
      [
        attempt.date,
        attempt.athlete,
        attempt.barHeight,
        attempt.unit,
        attempt.result,
        attempt.speed,
        attempt.gripHeight,
        attempt.gripUnit,
        attempt.approachDistance,
        attempt.approachDistanceUnit,
        attempt.approachTime,
        attempt.takeoffAngle,
        attempt.inversionAngle,
        attempt.takeoffTime,
        attempt.clearanceTime,
        attempt.notes,
        attempt.measurementVersion ?? "legacy-unversioned",
        attempt.torsoOrientation,
        attempt.approachEstimate?.version ?? "manual-or-unknown",
        attempt.approachEstimate?.start,
        attempt.approachEstimate?.sampleGap,
      ].map(escapeCsv),
    );

    const csv = [headers.map(escapeCsv), ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vaultlab-attempts.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function drawCurrentPose() {
    const video = videoRef.current;
    if (!video) {
      clearPoseCanvas();
      return;
    }

    const frame = nearestPoseFrame(poseTimeline, video.currentTime);
    drawPose(frame?.landmarks ?? null);
    if (!analyzing) setPoseReadout(current => current.frameTime === frame?.time ? current : {
      ...(frame ? buildPoseReadout(frame.landmarks, frame.time, { width: video.videoWidth, height: video.videoHeight }) : emptyPoseReadout),
      status: current.status, frameTime: frame?.time,
    });
  }

  async function reviewMoment(frame: FrameAnalysis | null | undefined) {
    const video = videoRef.current;
    if (!video || !frame || analyzing) return;
    video.pause();
    try {
      await seekVideo(video, frame.time);
      video.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      setPoseReadout(current => ({ ...current, status: "This moment could not be loaded. Try the video controls." }));
    }
  }

  function schedulePoseAnimation() {
    if (poseAnimationRef.current !== null) return;
    poseAnimationRef.current = window.requestAnimationFrame(() => {
      poseAnimationRef.current = null;
      drawCurrentPose();
      const video = videoRef.current;
      if (video && !video.paused && !video.ended) schedulePoseAnimation();
    });
  }

  function cancelPoseAnimation() {
    if (poseAnimationRef.current === null) return;
    window.cancelAnimationFrame(poseAnimationRef.current);
    poseAnimationRef.current = null;
  }

  function drawPose(landmarks: Landmark[] | null) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !landmarks) {
      clearPoseCanvas();
      return;
    }

    const videoRect = video.getBoundingClientRect();
    const stageRect = video.parentElement?.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d");
    if (!context || !videoRect.width || !videoRect.height || !stageRect) return;

    const videoAspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1;
    const boxAspect = videoRect.width / videoRect.height;
    const contentWidth = boxAspect > videoAspect ? videoRect.height * videoAspect : videoRect.width;
    const contentHeight = boxAspect > videoAspect ? videoRect.height : videoRect.width / videoAspect;
    const contentLeft = videoRect.left - stageRect.left + (videoRect.width - contentWidth) / 2;
    const contentTop = videoRect.top - stageRect.top + (videoRect.height - contentHeight) / 2;

    canvas.style.left = `${contentLeft}px`;
    canvas.style.top = `${contentTop}px`;
    canvas.style.width = `${contentWidth}px`;
    canvas.style.height = `${contentHeight}px`;
    canvas.width = Math.max(1, Math.round(contentWidth * pixelRatio));
    canvas.height = Math.max(1, Math.round(contentHeight * pixelRatio));
    canvas.hidden = false;

    const connections = [
      [11, 12],
      [11, 13],
      [13, 15],
      [12, 14],
      [14, 16],
      [11, 23],
      [12, 24],
      [23, 24],
      [23, 25],
      [25, 27],
      [24, 26],
      [26, 28],
      [27, 29],
      [29, 31],
      [28, 30],
      [30, 32],
    ];

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 3 * pixelRatio;
    context.strokeStyle = "#8fd6c9";
    context.fillStyle = "#d99d25";

    connections.forEach(([from, to]) => {
      const pointA = landmarks[from];
      const pointB = landmarks[to];
      if (!isVisible(pointA) || !isVisible(pointB)) return;

      context.beginPath();
      context.moveTo(pointA.x * canvas.width, pointA.y * canvas.height);
      context.lineTo(pointB.x * canvas.width, pointB.y * canvas.height);
      context.stroke();
    });

    landmarks.forEach((point, index) => {
      if (!isVisible(point) || index > 32) return;
      context.beginPath();
      context.arc(point.x * canvas.width, point.y * canvas.height, 4 * pixelRatio, 0, Math.PI * 2);
      context.fill();
    });
  }

  function clearPoseCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.hidden = true;
  }

  if (!authReady) {
    return (
      <main>
        <section className="auth-panel">
          <h1>VaultLab</h1>
          <p className="muted">Loading authentication...</p>
        </section>
      </main>
    );
  }

  if (!activeUser) {
    return <AuthScreen onDemo={() => setDemoMode(true)} />;
  }

  return (
    <>
      <header>
        <div className="topbar">
          <div className="brand">
            <div className="mark">VL</div>
            <div>
              <h1>VaultLab</h1>
              <p className="subtitle">Video journal and AI vault metrics</p>
            </div>
          </div>
          <div className="status">
            <div className="pill">
              {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"}
            </div>
            <div className="pill">Best: {bestMake ? bestMake.label : "--"}</div>
            <div className="pill">{activeUser?.label}</div>
            <button className="top-button" type="button" onClick={handleSignOut} disabled={analyzing}>
              {activeUser?.isDemo ? "Exit demo" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main>
        <RegionalFinalUpdate />
        <div className="layout">
          <div className="video-shell">
            <section>
              <h2>Attempt Video</h2>
              <div className={`video-frame ${isPortrait ? "portrait" : ""}`}>
                {!videoLoaded && <p className="empty-video">Upload a side-view vault video to preview it here.</p>}
                <div className="video-stage">
                  <video
                    ref={videoRef}
                    controls
                    hidden={!videoLoaded}
                    src={videoUrl}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={schedulePoseAnimation}
                    onPlaying={schedulePoseAnimation}
                    onPause={() => {
                      cancelPoseAnimation();
                      drawCurrentPose();
                    }}
                    onTimeUpdate={drawCurrentPose}
                    onSeeked={drawCurrentPose}
                    onEnded={cancelPoseAnimation}
                  />
                  <canvas ref={canvasRef} className="pose-canvas" hidden />
                </div>
              </div>
              <div className="toolbar">
                <label className="file-button" htmlFor="videoInput">
                  Upload video
                </label>
                <input
                  ref={fileInputRef}
                  disabled={analyzing}
                  id="videoInput"
                  type="file"
                  accept="video/*"
                  onChange={(event) => handleVideoUpload(event.target.files?.[0] || null)}
                />
                <button className="secondary" type="button" onClick={openVideoFullscreen}>
                  Fullscreen video
                </button>
                <button className="secondary" type="button" onClick={analyzeFullVideo} disabled={analyzing}>
                  {analyzing ? "Analyzing..." : "Analyze full video"}
                </button>
              </div>
              <div className="phase-grid">
                <PhaseCard title="Run-up time" status={phaseStatus.approach} />
                <PhaseCard title="Takeoff" status={phaseStatus.takeoff} />
                <PhaseCard title="Max inversion" status={phaseStatus.inversion} />
                <PhaseCard title="Clearance" status={phaseStatus.clearance} />
              </div>
              <div className="analysis-panel">
                <strong>{poseReadout.status}</strong>
                <details className="measurement-details">
                <summary>Joint measurements</summary>
                <p>{poseReadout.frameTime == null ? "No tracked pose at this video position." : `Estimated pose at ${poseReadout.frameTime.toFixed(2)}s.`} Landmark counts show tracking coverage, not accuracy or a technique score.</p>
                <ul className="analysis-list">
                  <li>
                    Detected joints: <strong>{poseReadout.jointCount}</strong>
                  </li>
                  <li>
                    Body line angle: <strong>{poseReadout.bodyLineAngle}</strong>
                  </li>
                  <li>
                    Left knee angle: <strong>{poseReadout.leftKneeAngle}</strong>
                  </li>
                  <li>
                    Right knee angle: <strong>{poseReadout.rightKneeAngle}</strong>
                  </li>
                  <li>
                    Inversion clue: <strong>{poseReadout.inversionClue}</strong>
                  </li>
                </ul>
                <p>Knee angles describe bending at the knee: closer to 180 degrees means straighter. The best position depends on the vault phase; these numbers are not target scores. "Ankles above shoulders" describes their positions in the image, not whether the inversion technique is correct.</p>
                </details>
              </div>
              <details className="measurement-details">
                <summary>About these measurements</summary>
                <p>Angles describe estimated body positions on a 0-180 degree scale, not the launch angle of the athlete's center of mass. Inversion angle measures body alignment, not technique quality. Camera view and missed joints affect the estimates.</p>
                <p>Run-up time estimates a still-to-moving transition before the estimated takeoff. It requires visible legs and continuous tracking; camera motion, slow-motion video, and phase errors can affect it. This additional estimate is not an input to the make-prediction model and was not evaluated in the 30-video study.</p>
                <p>Vault time is the interval from estimated takeoff to the highest hip position after inversion. It includes pole support. The joint angles have no validated best target in this app; a straighter body does not always mean a better vault.</p>
              </details>
              <p className="muted">For useful numbers, film from the side with the full runway, box, standards, and bar visible.</p>
            </section>

            <PredictionPanel attempts={attempts} model={vaultModel} prediction={vaultPrediction} />

            <section>
              <div className="log-header">
                <h2>Attempt Log</h2>
                <div className="log-actions">
                  <button className="secondary" type="button" onClick={exportCsv} disabled={!attempts.length}>
                    Export CSV
                  </button>
                  <button className="danger" type="button" onClick={clearAttempts}>
                    Clear log
                  </button>
                </div>
              </div>
              {!attempts.length ? (
                <p className="empty">No attempts saved yet.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Athlete</th>
                      <th>Bar</th>
                      <th>Video</th>
                      <th>Result</th>
                      <th>Speed</th>
                      <th>Notes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>{attempt.date || "--"}</td>
                        <td>{attempt.athlete}</td>
                        <td>{formatHeight(attempt.barHeight, attempt.unit)}</td>
                        <td>
                    <button className="secondary" type="button" onClick={() => loadAttempt(attempt)} disabled={analyzing}>
                            Load
                          </button>
                        </td>
                        <td className={attempt.result === "make" ? "result-make" : "result-miss"}>{attempt.result}</td>
                        <td>{attempt.speed ? `${attempt.speed.toFixed(2)} m/s` : "--"}</td>
                        <td>{attempt.notes || "--"}</td>
                        <td>
                          <button className="danger" type="button" onClick={() => deleteAttempt(attempt)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <aside>
            <section>
              <h2>Save Vault</h2>
              <p className="muted">Enter the bar height, run full-video analysis, then save the attempt if you want it in your log.</p>
              <div className="grid">
                <TextField label="Athlete" value={form.athlete} onChange={(value) => updateField("athlete", value)} />
                <TextField label="Date" type="date" value={form.date} onChange={(value) => updateField("date", value)} />
                <TextField label="Bar height" type="number" value={form.barHeight} onChange={(value) => updateField("barHeight", value)} />
                <SelectField label="Bar unit" value={form.unit} onChange={(value) => updateField("unit", value as AttemptForm["unit"])} options={["m", "ft"]} />
                <TextField label="Grip height" type="number" value={form.gripHeight} onChange={(value) => updateField("gripHeight", value)} />
                <SelectField label="Grip unit" value={form.gripUnit} onChange={(value) => updateField("gripUnit", value as AttemptForm["gripUnit"])} options={["ft", "m"]} />
                <TextField label="Approach distance" type="number" value={form.approachDistance} onChange={(value) => updateField("approachDistance", value)} />
                <SelectField
                  label="Approach distance unit"
                  value={form.approachDistanceUnit}
                  onChange={(value) => updateField("approachDistanceUnit", value as AttemptForm["approachDistanceUnit"])}
                  options={["ft", "m"]}
                />
                <label className="auto-measurement">Run-up time (estimated seconds)
                  <input aria-label="Run-up time (estimated seconds)" value={form.approachTime ? displayNumber(form.approachTime, 2) : ""} placeholder={form.approachEstimate ? "Not measurable" : "Not analyzed"} readOnly />
                  <small>{form.approachEstimate?.message ?? (form.approachTime ? "Previously entered time. Reanalyze for an automatic estimate." : "Available after full-video analysis when the start is visible.")}</small>
                </label>
                <TextField label="Takeoff angle from AI" hint="Estimated hip-to-shoulder body-line angle in degrees (0-180), not center-of-mass launch angle." digits={1} type="number" value={form.takeoffAngle} onChange={(value) => updateField("takeoffAngle", value)} />
                <TextField label="Inversion angle from AI" hint="Estimated shoulder-hip-ankle alignment in degrees (0-180)." digits={1} type="number" value={form.inversionAngle} onChange={(value) => updateField("inversionAngle", value)} />
                <TextField label="Takeoff time from video AI" hint="Estimated takeoff frame time in seconds." digits={2} type="number" value={form.takeoffTime} onChange={(value) => updateField("takeoffTime", value)} />
                <TextField label="Clearance time from video AI" hint="Estimated highest-hip frame time after inversion, in seconds; not verified bar crossing." digits={2} type="number" value={form.clearanceTime} onChange={(value) => updateField("clearanceTime", value)} />
                <label className="full">
                  Notes
                  <textarea aria-label="Notes" value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
                </label>
                <SelectField label="Result" value={form.result} onChange={(value) => updateField("result", value as AttemptForm["result"])} options={["make", "miss"]} full />
              </div>
              <div className="form-actions">
                <button type="button" onClick={saveAttempt} disabled={analyzing}>
                  Save attempt
                </button>
                <button className="secondary" type="button" onClick={startNewAttempt} disabled={analyzing}>
                  New attempt
                </button>
              </div>

              <div className="metric-grid">
                <Metric label="Average run-up speed" hint="Entered approach distance divided by estimated run-up time. Not speed at takeoff." value={metrics.speed ? `${metrics.speed.toFixed(2)} m/s` : "--"} />
                <Metric label="Grip over bar" value={metrics.gripOverBar !== null ? `${metrics.gripOverBar.toFixed(2)} m` : "--"} />
                <Metric label="Vault time" hint="Estimated takeoff-to-clearance interval, including pole support; not unsupported airborne time." value={metrics.flightTime !== null ? `${metrics.flightTime.toFixed(2)} s` : "--"} />
              </div>
              <div className="coach-panel">
                <h3>Coach feedback</h3>
                <p className="muted">Video observations and review points, not a technique grade.</p>
                <ul className="coach-list">
                  {coachFeedback.length ? coachFeedback.map((item) => <li key={item}>{item}</li>) : <li>Add attempt data and analyze the video to generate feedback.</li>}
                </ul>
                <div className="form-actions">
                  <button className="secondary" type="button" disabled={analyzing || !reviewPhases?.takeoff} onClick={() => reviewMoment(reviewPhases?.takeoff)}>View takeoff</button>
                  <button className="secondary" type="button" disabled={analyzing || !reviewPhases?.inversion} onClick={() => reviewMoment(reviewPhases?.inversion)}>View inversion</button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}

function nextValue(value: number | null | undefined) {
  return value == null ? "unavailable" : `${value.toFixed(1)} deg`;
}

function RegionalFinalUpdate(props: { compact?: boolean }) {
  return (
    <div className={`competition-update ${props.compact ? "compact" : ""}`} role="status" aria-label="Regional final update">
      <div>
        <span className="update-kicker">Regional final update</span>
        <h2>First place at the regional final</h2>
        <p>VaultLab earned first place and will be presented live in Philadelphia on October 31, 2026.</p>
      </div>
      <div className="update-date" aria-label="Live presentation date">
        <span>Live presentation</span>
        <strong>Oct. 31</strong>
        <span>Philadelphia</span>
      </div>
    </div>
  );
}

function AuthScreen(props: { onDemo: () => void }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitEmailAuth(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (mode === "sign-in") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (authError) {
      setError(readAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  async function submitGoogleAuth() {
    setError("");
    setBusy(true);

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (authError) {
      setError(readAuthError(authError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <div className="mark">VL</div>
          <div>
            <h1>VaultLab</h1>
            <p className="subtitle">Sign in to save your vault analysis log</p>
          </div>
        </div>

        <RegionalFinalUpdate compact />

        <div className="auth-tabs">
          <button className={mode === "sign-in" ? "" : "secondary"} type="button" onClick={() => setMode("sign-in")}>
            Sign in
          </button>
          <button className={mode === "sign-up" ? "" : "secondary"} type="button" onClick={() => setMode("sign-up")}>
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submitEmailAuth}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button className="secondary google-button" type="button" onClick={submitGoogleAuth} disabled={busy}>
          Continue with Google
        </button>
        <button className="secondary google-button" type="button" onClick={props.onDemo} disabled={busy}>
          Try demo without account
        </button>
        <p className="muted auth-note">Your saved attempts stay private to your sign-in on this browser for now.</p>
      </section>
    </main>
  );
}

function PredictionPanel(props: { attempts: Attempt[]; model: TrainedVaultModel; prediction: VaultPrediction }) {
  const makes = props.attempts.filter((attempt) => attempt.result === "make").length;
  const makeRate = props.attempts.length ? Math.round((makes / props.attempts.length) * 100) : null;

  return (
    <section className="prediction-panel">
      <div>
        <h2>Prediction</h2>
        <p className="muted">Upload a video, enter bar height, then run full-video analysis.</p>
      </div>
      <div className="research-grid">
        <Metric label="Estimated chance of clearing the bar" value={props.prediction.probability === null ? "--" : `${Math.round(props.prediction.probability * 100)}%`} />
        <Metric label="Your recorded make rate" value={makeRate === null ? "--" : `${makeRate}%`} />
      </div>
      <div className="research-note">
        <strong>{props.model.ready ? `Built-in logistic model trained on ${props.model.rows} vault attempts. Accuracy on new athletes is not established.` : props.model.status}</strong>
        <span>
          This estimate is not a technique score or a guarantee. Run-up time and speed do not change this prediction.
        </span>
      </div>
      <PredictionFactors prediction={props.prediction} />
    </section>
  );
}

function readFeatureLabel(feature: string) {
  const labels: Record<string, string> = {
    barHeight: "bar height",
    speed: "approach speed",
    takeoffAngle: "Body position at takeoff",
    inversionAngle: "Body alignment at inversion",
    gripOverBar: "grip over bar",
    flightTime: "Vault time",
  };
  return labels[feature] || feature;
}

function PredictionFactors(props: { prediction: VaultPrediction }) {
  return (
    <details className="model-panel">
      <summary>What affected this prediction?</summary>
      <div>
        <p className="muted">Each label shows how this input affects the predicted chance compared with the model's training average. These are statistical effects, not instructions to change your technique.</p>
      </div>
      {props.prediction.features.length ? (
        <div className="factor-list">
          {props.prediction.features.map((feature) => (
            <div className="factor-row" key={feature.key}>
              <div>
                <strong>{readFeatureLabel(feature.key)}</strong>
                <span>
                  {feature.value.toFixed(feature.unit === "deg" ? 0 : 2)} {feature.unit}
                </span>
              </div>
              <span className={`factor-effect ${feature.effect}`}>
                {predictionEffect(feature.contribution)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">Analyze a video and enter bar height to see model factors.</p>
      )}
    </details>
  );
}

function readAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("auth/configuration-not-found")) {
    return "Firebase Authentication is not enabled yet. Enable Email/Password and Google sign-in in Firebase Console.";
  }
  if (message.includes("auth/operation-not-allowed")) {
    return "This sign-in method is not enabled yet in Firebase Console.";
  }
  if (message.includes("auth/invalid-credential") || message.includes("auth/wrong-password")) {
    return "Email or password is not correct.";
  }
  if (message.includes("auth/email-already-in-use")) {
    return "This email already has an account. Try signing in.";
  }
  if (message.includes("auth/weak-password")) {
    return "Use a password with at least 6 characters.";
  }
  if (message.includes("auth/popup-closed-by-user")) {
    return "Google sign-in was closed before it finished.";
  }
  return message;
}

function PhaseCard(props: { title: string; status: string }) {
  return (
    <div className="phase-card">
      <strong>{props.title}</strong>
      <span>{props.status}</span>
    </div>
  );
}

function TextField(props: { label: string; type?: string; value: string; hint?: string; digits?: number; onChange: (value: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <label title={props.hint}>
      {props.label}
      <input
        type={props.type || "text"}
        min={props.type === "number" ? "0" : undefined}
        step={props.type === "number" ? "0.01" : undefined}
        value={!focused && props.digits !== undefined ? displayNumber(props.value, props.digits) : props.value}
        aria-description={props.hint}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField(props: { label: string; value: string; options: string[]; full?: boolean; onChange: (value: string) => void }) {
  return (
    <label className={props.full ? "full" : ""}>
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value=""></option>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {option === "m" ? "meters" : option === "ft" ? "feet" : option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric" title={props.hint} aria-description={props.hint}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
