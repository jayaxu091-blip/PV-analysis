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
import type { Attempt, AttemptForm, Landmark, PhaseStatus, PoseReadout } from "./types";
import {
  appendNoteOnce,
  buildCoachFeedback,
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
  resetPoseClock,
  seekVideo,
} from "./poseAnalysis";

const emptyPoseReadout: PoseReadout = {
  status: "Pose AI has not analyzed this video yet.",
  jointCount: "--",
  bodyLineAngle: "--",
  leftKneeAngle: "--",
  rightKneeAngle: "--",
  inversionClue: "--",
};

const emptyPhaseStatus: PhaseStatus = {
  takeoff: "Not marked yet. Pause where the takeoff foot leaves the ground.",
  inversion: "Not marked yet. Pause where the hips/feet are highest.",
  clearance: "Not marked yet. Pause where the body clears the bar.",
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
  const [poseLandmarks, setPoseLandmarks] = useState<Landmark[] | null>(null);
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
  const coachFeedback = useMemo(() => buildCoachFeedback(form, metrics), [form, metrics]);
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
    setForm((current) => ({ ...current, [key]: value }));
  }

  function persistAttempts(next: Attempt[]) {
    if (!activeUser) return;
    setAttempts(next);
    localStorage.setItem(storageKeyForActiveUser(activeUser), JSON.stringify(next));
  }

  function resetPoseState() {
    clearPoseCanvas();
    resetPoseClock();
    setPoseReadout(emptyPoseReadout);
    setPhaseStatus(emptyPhaseStatus);
    setPoseLandmarks(null);
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
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    setIsPortrait(video.videoHeight > video.videoWidth);
    drawPose(poseLandmarks);
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
    const video = videoRef.current;
    if (!video || !videoLoaded || !video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      alert("Upload and load a video first.");
      return;
    }

    const originalTime = video.currentTime;
    const wasPaused = video.paused;

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
      const nextForm = {
        ...form,
        takeoffTime: phases.takeoff.time.toFixed(2),
        clearanceTime: phases.clearance.time.toFixed(2),
        takeoffAngle: Number.isFinite(phases.takeoff.bodyLine) ? String(Math.round(phases.takeoff.bodyLine || 0)) : form.takeoffAngle,
        inversionAngle: Number.isFinite(phases.inversion.inversionAngle)
          ? String(Math.round(phases.inversion.inversionAngle || 0))
          : form.inversionAngle,
        notes: appendNoteOnce(
          form.notes,
          `Auto analysis: takeoff ${phases.takeoff.time.toFixed(2)}s, max inversion ${phases.inversion.time.toFixed(2)}s, clearance ${phases.clearance.time.toFixed(2)}s.`,
        ),
      };

      setForm(nextForm);
      setPhaseStatus({
        takeoff: `Auto-estimated at ${phases.takeoff.time.toFixed(2)}s. Check this frame for takeoff accuracy.`,
        inversion: `Auto-estimated at ${phases.inversion.time.toFixed(2)}s. This is the strongest inversion candidate.`,
        clearance: `Auto-estimated at ${phases.clearance.time.toFixed(2)}s. Bar clearance is approximate without bar detection.`,
      });
      await seekVideo(video, phases.inversion.time);
      setPoseLandmarks(phases.inversion.landmarks);
      drawPose(phases.inversion.landmarks);
      setPoseReadout({
        ...buildPoseReadout(phases.inversion.landmarks, phases.inversion.time),
        status: `Auto analysis complete: ${frames.length} usable frames. Review the estimated phase times and adjust if needed.`,
      });

      if (!wasPaused) video.pause();
    } catch (error) {
      console.error(error);
      setPoseReadout((current) => ({
        ...current,
        status: `Pose AI error: ${error instanceof Error ? error.message : "model could not analyze video"}. Try refreshing or checking your internet connection.`,
      }));
    }
  }

  async function markPhase(phaseName: keyof PhaseStatus) {
    const video = videoRef.current;
    if (!video || !videoLoaded || !Number.isFinite(video.currentTime)) {
      alert("Upload a video first.");
      return;
    }

    const time = video.currentTime.toFixed(2);
    if (phaseName === "takeoff") {
      updateField("takeoffTime", time);
      setPhaseStatus((current) => ({
        ...current,
        takeoff: `Marked at ${time}s. Pose angle will use this frame if analysis succeeds.`,
      }));
    }

    if (phaseName === "inversion") {
      setPhaseStatus((current) => ({
        ...current,
        inversion: `Marked at ${time}s. Use this frame for max inversion angle.`,
      }));
      updateField("notes", appendNoteOnce(form.notes, `Max inversion marked at ${time}s.`));
    }

    if (phaseName === "clearance") {
      updateField("clearanceTime", time);
      setPhaseStatus((current) => ({
        ...current,
        clearance: `Marked at ${time}s. Flight time can now be estimated.`,
      }));
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
    setForm({
      athlete: attempt.athlete || "",
      date: attempt.date || "",
      barHeight: attempt.barHeight?.toString() || "",
      unit: attempt.unit || "",
      gripHeight: attempt.gripHeight?.toString() || "",
      gripUnit: attempt.gripUnit || "",
      approachDistance: attempt.approachDistance?.toString() || "",
      approachDistanceUnit: attempt.approachDistanceUnit || "",
      approachTime: attempt.approachTime?.toString() || "",
      takeoffAngle: attempt.takeoffAngle?.toString() || "",
      inversionAngle: attempt.inversionAngle?.toString() || "",
      takeoffTime: attempt.takeoffTime?.toString() || "",
      clearanceTime: attempt.clearanceTime?.toString() || "",
      notes: attempt.notes || "",
      result: attempt.result || "",
    });

    setPhaseStatus({
      takeoff:
        attempt.takeoffTime !== null && attempt.takeoffTime !== undefined
          ? `Marked at ${Number(attempt.takeoffTime).toFixed(2)}s.`
          : emptyPhaseStatus.takeoff,
      inversion:
        attempt.inversionPhaseTime !== null && attempt.inversionPhaseTime !== undefined
          ? `Marked at ${Number(attempt.inversionPhaseTime).toFixed(2)}s.`
          : emptyPhaseStatus.inversion,
      clearance:
        attempt.clearanceTime !== null && attempt.clearanceTime !== undefined
          ? `Marked at ${Number(attempt.clearanceTime).toFixed(2)}s.`
          : emptyPhaseStatus.clearance,
    });

    resetPoseState();
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

  function drawPose(landmarks: Landmark[] | null) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !landmarks) {
      clearPoseCanvas();
      return;
    }

    const rect = video.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const context = canvas.getContext("2d");
    if (!context || !rect.width || !rect.height) return;

    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    canvas.width = Math.max(1, Math.round(rect.width * pixelRatio));
    canvas.height = Math.max(1, Math.round(rect.height * pixelRatio));
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
            <button className="top-button" type="button" onClick={handleSignOut}>
              {activeUser?.isDemo ? "Exit demo" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main>
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
                    onPlay={() => drawPose(poseLandmarks)}
                    onPause={() => drawPose(poseLandmarks)}
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
                  id="videoInput"
                  type="file"
                  accept="video/*"
                  onChange={(event) => handleVideoUpload(event.target.files?.[0] || null)}
                />
                <button className="secondary" type="button" onClick={openVideoFullscreen}>
                  Fullscreen video
                </button>
                <button className="secondary" type="button" onClick={analyzeFullVideo}>
                  Analyze full video
                </button>
              </div>
              <div className="phase-grid">
                <PhaseCard title="Takeoff" status={phaseStatus.takeoff} button="Mark takeoff" onClick={() => markPhase("takeoff")} />
                <PhaseCard title="Max inversion" status={phaseStatus.inversion} button="Mark inversion" onClick={() => markPhase("inversion")} />
                <PhaseCard title="Clearance" status={phaseStatus.clearance} button="Mark clearance" onClick={() => markPhase("clearance")} />
              </div>
              <div className="analysis-panel">
                <strong>{poseReadout.status}</strong>
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
              </div>
              <p className="muted">For useful numbers, film from the side with the full runway, box, standards, and bar visible.</p>
            </section>

            <ResearchPanel attempts={attempts} />

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
                          <button className="secondary" type="button" onClick={() => loadAttempt(attempt)}>
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
              <p className="muted">Enter the attempt details you know. Pose AI can fill angle and timing fields from the video.</p>
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
                <TextField label="Approach time in seconds" type="number" value={form.approachTime} onChange={(value) => updateField("approachTime", value)} />
                <TextField label="Takeoff angle from AI" type="number" value={form.takeoffAngle} onChange={(value) => updateField("takeoffAngle", value)} />
                <TextField label="Inversion angle from AI" type="number" value={form.inversionAngle} onChange={(value) => updateField("inversionAngle", value)} />
                <TextField label="Takeoff time from video AI" type="number" value={form.takeoffTime} onChange={(value) => updateField("takeoffTime", value)} />
                <TextField label="Clearance time from video AI" type="number" value={form.clearanceTime} onChange={(value) => updateField("clearanceTime", value)} />
                <label className="full">
                  Notes
                  <textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
                </label>
                <SelectField label="Result" value={form.result} onChange={(value) => updateField("result", value as AttemptForm["result"])} options={["make", "miss"]} full />
              </div>
              <div className="form-actions">
                <button type="button" onClick={saveAttempt}>
                  Save attempt
                </button>
                <button className="secondary" type="button" onClick={startNewAttempt}>
                  New attempt
                </button>
              </div>

              <div className="metric-grid">
                <Metric label="Approach speed" value={metrics.speed ? `${metrics.speed.toFixed(2)} m/s` : "--"} />
                <Metric label="Grip over bar" value={metrics.gripOverBar !== null ? `${metrics.gripOverBar.toFixed(2)} m` : "--"} />
                <Metric label="Flight time" value={metrics.flightTime !== null ? `${metrics.flightTime.toFixed(2)} s` : "--"} />
                <Metric label="Tech score" value={metrics.techScore !== null ? `${metrics.techScore}/100` : "--"} />
              </div>
              <div className="coach-panel">
                <h3>Coach feedback</h3>
                <ul className="coach-list">
                  {coachFeedback.length ? coachFeedback.map((item) => <li key={item}>{item}</li>) : <li>Add attempt data and analyze the video to generate feedback.</li>}
                </ul>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}

function readPhaseTime(status: string) {
  const match = status.match(/Marked at ([0-9.]+)s/);
  return match ? Number.parseFloat(match[1]) : null;
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

function ResearchPanel(props: { attempts: Attempt[] }) {
  const completeRows = props.attempts.filter(
    (attempt) =>
      attempt.result &&
      attempt.speed !== null &&
      attempt.takeoffAngle !== null &&
      attempt.inversionAngle !== null,
  );
  const makes = props.attempts.filter((attempt) => attempt.result === "make").length;
  const makeRate = props.attempts.length ? Math.round((makes / props.attempts.length) * 100) : null;
  const modelStatus =
    completeRows.length >= 30
      ? "Ready for train/test logistic regression"
      : completeRows.length >= 10
        ? "Enough for early exploratory modeling"
        : "Collect more labeled attempts";

  return (
    <section className="research-panel">
      <div>
        <h2>Competition Research Mode</h2>
        <p className="muted">
          VaultLab is collecting a labeled dataset for a future make/miss prediction model.
        </p>
      </div>
      <div className="research-grid">
        <Metric label="Saved attempts" value={String(props.attempts.length)} />
        <Metric label="Model-ready rows" value={String(completeRows.length)} />
        <Metric label="Make rate" value={makeRate === null ? "--" : `${makeRate}%`} />
        <Metric label="Prediction target" value="make / miss" />
      </div>
      <div className="research-note">
        <strong>{modelStatus}</strong>
        <span>
          Planned features: approach speed, grip over bar, flight time, takeoff angle, and inversion angle.
        </span>
      </div>
    </section>
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

function PhaseCard(props: { title: string; status: string; button: string; onClick: () => void }) {
  return (
    <div className="phase-card">
      <strong>{props.title}</strong>
      <span>{props.status}</span>
      <button className="secondary" type="button" onClick={props.onClick}>
        {props.button}
      </button>
    </div>
  );
}

function TextField(props: { label: string; type?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {props.label}
      <input
        type={props.type || "text"}
        min={props.type === "number" ? "0" : undefined}
        step={props.type === "number" ? "0.01" : undefined}
        value={props.value}
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

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric">
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
