import "@hitchhiker/engine";

export const PACKAGE_NAME = "@hitchhiker/orchestrator";

export { ELEVATE_TO_DRIVE, driveElevateFile, driveElevatePicks } from "./elevate-drive.ts";
export type { ElevateDriveHooks, ElevateDrivePick } from "./elevate-drive.ts";
export { enqueueElevatePicks } from "./queue-file.ts";
export { runElevatePicks } from "./runner.ts";
export { ELEVATE_DRIVE_PHASE, scheduleElevatePicks } from "./schedule.ts";
export { nextPromptId, restartPointFromProjectFile } from "./restart.ts";
export { beginPhaseSix, shipGate } from "./ship-gate.ts";
export type { PhaseSixHooks, ShipGateResult } from "./ship-gate.ts";
export { noteShipRefusal } from "./progress.ts";
export {
  FLOW_PHASES,
  FLOW_TRANSITIONS,
  enterFlow,
  flowFilePath,
  holdGuidePhase,
  readFlowFrom,
  requestFlowTransition,
} from "./phase-lock.ts";
export type { EnterFlowOptions, FlowDecision, FlowEdge, FlowFrom, FlowPhase, FlowRequest } from "./phase-lock.ts";
