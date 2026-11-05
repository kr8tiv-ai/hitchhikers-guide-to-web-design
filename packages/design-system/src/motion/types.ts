/** A running recipe. kill() is safe to call more than once. */
export interface MotionHandle {
  kill(): void;
  refresh(): void;
  reduced: boolean;
}

export type RecipeName =
  | "pinnedTimeline"
  | "horizontalTrack"
  | "kineticType"
  | "scrollCamera"
  | "preloaderHandoff"
  | "frameSequence"
  | "pageTransition"
  | "batchReveal"
  | "parallaxLayers"
  | "snapToLabels"
  | "microInteractions";

export interface CameraVec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraKeyframe {
  at: number;
  position: CameraVec3;
  lookAt: CameraVec3;
}

export interface CameraSample {
  x: number;
  y: number;
  z: number;
  lookAt: CameraVec3;
}

/** Split unit named the way a prompt asks for it. SplitText receives the plural. */
export type KineticUnit = "line" | "word" | "char";
