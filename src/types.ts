export type Unit = "" | "m" | "ft";
export type AttemptResult = "" | "make" | "miss";

export type ApproachEstimate = {
  version: "approach-motion-v1";
  start: number | null;
  end: number | null;
  duration: number | null;
  sampleGap: number | null;
  message: string;
};

export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PhaseStatus = {
  approach: string;
  takeoff: string;
  inversion: string;
  clearance: string;
};

export type AttemptForm = {
  approachEstimate?: ApproachEstimate;
  measurementVersion?: string;
  torsoOrientation?: string;
  athlete: string;
  date: string;
  barHeight: string;
  unit: Unit;
  gripHeight: string;
  gripUnit: Unit;
  approachDistance: string;
  approachDistanceUnit: Unit;
  approachTime: string;
  takeoffAngle: string;
  inversionAngle: string;
  takeoffTime: string;
  clearanceTime: string;
  notes: string;
  result: AttemptResult;
};

export type Attempt = {
  approachEstimate?: ApproachEstimate;
  measurementVersion?: string;
  torsoOrientation?: number | null;
  id: string;
  athlete: string;
  date: string;
  barHeight: number;
  unit: Unit;
  result: AttemptResult;
  videoId: string | null;
  videoName: string;
  speed: number | null;
  gripHeight: number | null;
  gripUnit: Unit;
  approachDistance: number | null;
  approachDistanceUnit: Unit;
  approachTime: number | null;
  takeoffAngle: number | null;
  inversionAngle: number | null;
  takeoffTime: number | null;
  clearanceTime: number | null;
  inversionPhaseTime: number | null;
  notes: string;
};

export type Metrics = {
  speed: number | null;
  gripOverBar: number | null;
  flightTime: number | null;
  techScore: number | null;
};

export type PoseReadout = {
  frameTime?: number;
  torsoOrientation: string;
  status: string;
  jointCount: string;
  bodyLineAngle: string;
  leftKneeAngle: string;
  rightKneeAngle: string;
  inversionClue: string;
};

export type FrameAnalysis = {
  measurementVersion: string;
  torsoOrientation: number | null;
  time: number;
  landmarks: Landmark[];
  shoulder: Landmark | null;
  hip: Landmark | null;
  ankle: Landmark | null;
  bodyLine: number | null;
  inversionAngle: number | null;
  visibleCount: number;
  inversionScore: number;
};

export type VaultPhases = {
  approachStart: FrameAnalysis | null;
  takeoff: FrameAnalysis | null;
  inversion: FrameAnalysis | null;
  clearance: FrameAnalysis | null;
};
