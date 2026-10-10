/**
 * One migration step per schema version.
 * A newer file is not rewritten. Callers open it read-only.
 */

import {
  APP_NAME,
  PROJECT_FILE_SCHEMA_VERSION,
  assumptionFor,
  emptyApproval,
  isRecord,
  type AnswerStatus,
  type ProjectFile,
  type StoredAnswer,
} from "./schema.ts";
import { ANSWER_STATUSES } from "./schema.ts";
import { scrubText } from "./scrub.ts";

export interface MigrateResult {
  file: ProjectFile | null;
  from: number;
  readOnly: boolean;
  message: string | null;
}

function isStatus(value: string): value is AnswerStatus {
  return (ANSWER_STATUSES as readonly string[]).includes(value);
}

function answersFrom(value: unknown): StoredAnswer[] {
  if (!Array.isArray(value)) return [];
  const answers: StoredAnswer[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (typeof item.id !== "string" || typeof item.value !== "string") continue;
    if (typeof item.status !== "string" || !isStatus(item.status)) continue;
    answers.push({
      id: scrubText(item.id),
      status: item.status,
      value: scrubText(item.value),
      assumption: item.assumption === true || assumptionFor(item.status),
    });
  }
  return answers;
}

function blank(now: string, name: string): ProjectFile {
  return {
    schemaVersion: 1,
    createdAt: now,
    savedAt: now,
    app: { name: APP_NAME, version: "0.0.0" },
    projectId: "p-migrated",
    projectName: name,
    sourceDir: "",
    interview: { answers: [], currentQuestionId: null, index: null, total: null },
    brief: { body: null, approval: emptyApproval() },
    brand: { body: null, sections: {}, approval: emptyApproval() },
    prd: { body: null, approval: emptyApproval() },
    promptPackage: { body: null, approval: emptyApproval() },
    elevate: emptyApproval(),
    hostinger: emptyApproval(),
    queue: { items: [], lastDone: "", currentPrompt: null, blockers: [] },
    state: null,
    git: { present: false, branch: null, head: null, lastGoodCommit: null, remoteUrl: null },
    settings: {},
    voice: null,
    uploads: [],
    references: [],
    snapshot: [],
    resumeMd: "",
    resumePrompt: "",
  };
}

/** Version 0 was a short object: name, prompt id, answers, last done. */
function fromZero(value: Record<string, unknown>): ProjectFile {
  const now = typeof value.savedAt === "string" && value.savedAt.length > 0 ? value.savedAt : new Date(0).toISOString();
  const name = typeof value.name === "string" && value.name.trim().length > 0 ? value.name.trim() : "project";
  const file = blank(now, scrubText(name));
  if (typeof value.createdAt === "string" && value.createdAt.length > 0) file.createdAt = value.createdAt;
  if (typeof value.projectId === "string" && value.projectId.length > 0) file.projectId = scrubText(value.projectId);
  if (typeof value.sourceDir === "string") file.sourceDir = value.sourceDir;
  if (typeof value.promptId === "string" && value.promptId.length > 0) {
    file.interview.currentQuestionId = value.promptId.startsWith("interview:")
      ? value.promptId.slice("interview:".length)
      : value.promptId;
    file.state = {
      phase: "Don't Panic",
      slice: "The Guide",
      promptId: value.promptId,
      lastGoodCommit: "",
      blockers: [],
      nextAction: file.interview.currentQuestionId ?? "",
      updatedAt: now,
    };
  }
  file.interview.answers = answersFrom(value.answers);
  if (typeof value.lastDone === "string") file.queue.lastDone = scrubText(value.lastDone);
  else if (typeof value.lastDone === "number" && Number.isFinite(value.lastDone)) {
    file.queue.lastDone = String(value.lastDone);
  }
  return file;
}

const STEPS: Record<number, (value: unknown) => ProjectFile> = {
  0: (value) => {
    if (!isRecord(value)) throw new Error("Version 0 project file is not an object.");
    return fromZero(value);
  },
};

/**
 * Walk one step at a time from `from` to `to`.
 * `to` must be the current schema. A caller that passes a newer version gets read-only.
 */
export function migrate(value: unknown, from: number, to: number = PROJECT_FILE_SCHEMA_VERSION): MigrateResult {
  if (!Number.isInteger(from) || from < 0) {
    return { file: null, from, readOnly: false, message: "The project file has no schema version." };
  }
  if (from > to) {
    return {
      file: null,
      from,
      readOnly: true,
      message: `This project file uses schema ${from}. This app reads schema ${to}. Opened read-only. It was not rewritten.`,
    };
  }
  let current: unknown = value;
  let version = from;
  while (version < to) {
    const step = STEPS[version];
    if (step === undefined) {
      return {
        file: null,
        from,
        readOnly: false,
        message: `No migration step from schema ${version}.`,
      };
    }
    current = step(current);
    version += 1;
  }
  if (!isRecord(current) || current.schemaVersion !== to) {
    return { file: null, from, readOnly: false, message: "Migration did not reach the current schema." };
  }
  return { file: current as unknown as ProjectFile, from, readOnly: false, message: null };
}
