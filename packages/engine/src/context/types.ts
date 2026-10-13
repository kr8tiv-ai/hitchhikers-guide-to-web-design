/**
 * Persistent project memory. Ideas ported from OpenGSD (vendor/gsd-core and
 * vendor/gsd-path, MIT): one disk handoff, decisions, assets, and a summary.
 * Those trees are not imported at runtime.
 */

export const CONTEXT_FILES = [
  "PROJECT.md",
  "STATE.md",
  "DECISIONS.md",
  "ASSETS.md",
  "CONTEXT-SUMMARY.md",
] as const;

export type ContextFileName = (typeof CONTEXT_FILES)[number];

export type DecisionSource =
  | "answer"
  | "upload"
  | "suggestion accepted"
  | "approval"
  | "skip"
  | "before-jump"
  | "discuss"
  | "brief-correction";

export type DecisionKind = "decision" | "adr";

export interface DecisionRecord {
  id: string;
  phase: string;
  questionId: string;
  text: string;
  source: string;
  date: string;
  supersededBy: string;
  open: boolean;
  kind: DecisionKind;
  context: string;
  options: string;
  choice: string;
  why: string;
}

export interface AssetRecord {
  saved: string;
  original: string;
  role: string;
  questionId: string;
  status: "live" | "withdrawn";
}

export interface ProjectSections {
  who: string;
  what: string;
  audience: string;
  goals: string;
  constraints: string;
}

export interface RecentAnswer {
  id: string;
  questionId: string;
  text: string;
}

export interface ContextPacket {
  purpose: string;
  project: ProjectSections;
  decisions: DecisionRecord[];
  assets: AssetRecord[];
  phase: string;
  questionId: string;
  summary: string;
  recent: RecentAnswer[];
  buildSummary: string;
  trimmed: string[];
  budgetTokens: number;
  estimatedTokens: number;
}

export interface ContextAudit {
  purpose: string;
  sections: string[];
  trimmed: string[];
  at: string;
}

export interface RouterStatus {
  phase: string;
  questionId: string;
  blockers: string[];
  openDecisions: DecisionRecord[];
  unanswered: string[];
  next: string;
  gate: "answer" | "decision" | "continue";
}

export interface DoctorFinding {
  file: string;
  problem: string;
  fix: string;
}

export const PACKET_SECTIONS = [
  "Project",
  "Decisions",
  "Assets",
  "Phase",
  "Question",
  "Summary",
  "Recent answers",
  "Build summaries",
  "Trimmed",
] as const;

export const ANSWER_SOURCES = new Set<string>([
  "answer",
  "skip",
  "suggestion accepted",
  "before-jump",
  "discuss",
]);

export const DEFAULT_TOKEN_BUDGET = 1800;
export const SUMMARY_WORD_CAP = 400;
export const DEFAULT_RECENT_LIMIT = 8;
