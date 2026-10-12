// Keep the archived interface independent of the study's full-precision inputs.
import { analyzeVideoFrames, seekVideo } from './poseAnalysis';
import { estimateVaultPhases, lineAngle, MEASUREMENT_VERSION } from './studyMeasurements';
import type { VaultPhases, FrameAnalysis } from './types';

export { analyzeVideoFrames, seekVideo, estimateVaultPhases, lineAngle };
const keys = ['takeoffAngle', 'inversionAngle', 'takeoffTime', 'clearanceTime'] as const;
type Key = typeof keys[number];
type Snapshot = { raw: Record<Key, number | null>; display: Record<Key, string> };
type Form = Record<string, unknown> & { studyInputs?: Snapshot; measurementVersion?: string };
const number = (x: unknown) => x === '' || x == null || !Number.isFinite(Number(x)) ? null : Number(x);

function value(form: Form, key: Key): number | null {
  const shown = number(form[key]);
  const saved = form.studyInputs;
  return saved && shown === number(saved.display[key]) ? saved.raw[key] : shown;
}

export function measurementState(phases: VaultPhases) {
  const raw = { takeoffAngle: phases.takeoff?.bodyLine ?? null, inversionAngle: phases.inversion?.inversionAngle ?? null,
    takeoffTime: phases.takeoff?.time ?? null, clearanceTime: phases.clearance?.time ?? null };
  const display = Object.fromEntries(keys.map(key => [key, raw[key] == null ? '' : key.endsWith('Angle')
    ? String(Math.round(raw[key]!)) : raw[key]!.toFixed(2)])) as Record<Key,string>;
  return { ...display, measurementVersion: MEASUREMENT_VERSION, studyInputs: { raw, display } };
}

export function savedState(form: Form) {
  if (form.measurementVersion !== MEASUREMENT_VERSION) return {};
  const raw = Object.fromEntries(keys.map(key => [key, value(form,key)])) as Record<Key,number|null>;
  const display = Object.fromEntries(keys.map(key => [key, String(form[key] ?? '')])) as Record<Key,string>;
  return { measurementVersion: MEASUREMENT_VERSION, studyInputs: { raw, display } };
}

export function studyVector(form: Form, barHeight: number | null, metrics: { speed: number|null; gripOverBar: number|null }) {
  if (form.measurementVersion !== MEASUREMENT_VERSION) return null;
  const takeoffTime = value(form, 'takeoffTime'), clearanceTime = value(form, 'clearanceTime');
  return { barHeight: barHeight ?? undefined,
    takeoffAngle: value(form, 'takeoffAngle') ?? undefined,
    inversionAngle: value(form, 'inversionAngle') ?? undefined,
    flightTime: takeoffTime == null || clearanceTime == null ? undefined : Math.max(0,clearanceTime-takeoffTime),
    speed: metrics.speed ?? undefined, gripOverBar: metrics.gripOverBar ?? undefined };
}

export function displayPhaseInterval(form: Form, fallback: number | null) {
  return form.measurementVersion === MEASUREMENT_VERSION ? studyVector(form,null,{speed:null,gripOverBar:null})?.flightTime ?? null : fallback;
}

export function coachAngle(input: unknown) {
  const angle = number(input);
  // Existing feedback thresholds refer to inclination, not the directional study proxy.
  return angle == null ? null : angle > 90 ? 180-angle : angle;
}

export function phasesForInterface(frames: FrameAnalysis[]) {
  return estimateVaultPhases(frames);
}
