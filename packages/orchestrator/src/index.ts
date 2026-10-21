import "@hitchhiker/engine";

export const PACKAGE_NAME = "@hitchhiker/orchestrator";

export { nextPromptId, restartPointFromProjectFile } from "./restart.ts";
export { beginPhaseSix, shipGate } from "./ship-gate.ts";
export type { PhaseSixHooks, ShipGateResult } from "./ship-gate.ts";
export { noteShipRefusal } from "./progress.ts";
