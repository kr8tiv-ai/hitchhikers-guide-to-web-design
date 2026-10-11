/**
 * One install plan for grok, playwright, whisper, or pdftotext.
 * `runSteps` is the argv list the runner executes. The confirm dialog
 * prints that same list. Elevated commands stay in `manualCommand`.
 */

export const INSTALL_TOOLS = ["grok", "playwright", "whisper", "pdftotext"] as const;

export type InstallTool = (typeof INSTALL_TOOLS)[number];

export type PlanStepKind = "spawn" | "download" | "extract";

export interface PlanStep {
  id: string;
  argv: readonly string[];
  kind: PlanStepKind;
  needsElevation: boolean;
  url: string | null;
  dest: string | null;
  sha256: string | null;
  bytes: number | null;
  label: string;
  cwd?: string;
  placeAs?: string;
}

export interface InstallModel {
  id: string;
  label: string;
  bytes: number;
}

export interface InstallPlan {
  recipeId: string;
  tool: InstallTool;
  title: string;
  steps: readonly PlanStep[];
  runSteps: readonly PlanStep[];
  sizeBytes: number | null;
  sizeExact: boolean;
  sizeLabel: string;
  location: string;
  needsAdmin: boolean;
  adminLabel: string;
  sourceHost: string;
  sourceUrl: string;
  manualCommand: string;
  docsUrl: string | null;
  signIn: string | null;
  canRun: boolean;
  models: readonly InstallModel[];
  selectedModel: string | null;
  note: string;
  workspace: string | null;
}

export interface PlanContext {
  platform: NodeJS.Platform;
  arch: string;
  managers: readonly string[];
  dataDir: string;
  browsersDir: string;
  workspaceDir: string;
}

export interface InstallEvent {
  type: "stdout" | "stderr" | "download" | "step";
  text: string;
  received: number | null;
  total: number | null;
}

export interface RunResult {
  status: "ok" | "failed" | "cancelled";
  error: string | null;
  installPath: string | null;
  versionLine: string | null;
  manualCommand: string;
  modelPath: string | null;
}

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export function isInstallTool(value: string): value is InstallTool {
  return (INSTALL_TOOLS as readonly string[]).includes(value);
}
