import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { withStateLock } from "./lock.ts";
import type { AnswerRecord } from "./required.ts";
import { loadState, type GuideState } from "./state.ts";
import { loadTree, questionsForDepth, type Question } from "./tree.ts";

/**
 * Don't Panic, one question at a time.
 *
 * Answer stores ANSWERED. Suggest stores the question's suggest text, or a
 * fixed fallback when the tree has none. Skip stores SKIPPED and the tree
 * skip default. This module does not call the network. A later prompt wires
 * live Suggest through the adapter. Pushback is not handled here.
 *
 * Concurrent command() calls are not supported. The session is single-flight:
 * a second call that arrives while the first is still saving is rejected.
 *
 * The session offers the current question only. It does not list the rest
 * of the ask strings. AnswerRecord is the status record missingRequired reads.
 */

export type InterviewCommand =
  | { type: "answer"; text: string }
  | { type: "suggest" }
  | { type: "skip" };

export interface InterviewSession {
  next(): Question | null;
  command(input: InterviewCommand): Promise<AnswerRecord>;
  coverage(): {
    answered: number;
    suggested: number;
    skipped: number;
    soft: number;
    imported: number;
  };
}

export type InterviewErrorCode =
  | "empty-answer"
  | "corrupt-answers"
  | "finished"
  | "busy"
  | "command";

export class InterviewError extends Error {
  readonly code: InterviewErrorCode;

  constructor(code: InterviewErrorCode, message: string) {
    super(message);
    this.name = "InterviewError";
    this.code = code;
  }
}

const SUGGEST_FALLBACK = "No suggestion is written for this question yet.";
const INTERVIEW_PREFIX = "interview:";
const ANSWER_STATUSES = ["ANSWERED", "SUGGESTED", "SKIPPED", "SOFT", "IMPORTED"] as const;

type Coverage = ReturnType<InterviewSession["coverage"]>;

/**
 * Open a session on projectDir.
 *
 * Creates `.hitchhiker` and loads `interview.json` when it exists.
 * The cursor is `interview:<id>` from STATE.md when that id is still in
 * this depth and still unanswered, so a killed process resumes on the same id.
 * An id outside the depth is not kept. Otherwise the cursor is the first
 * unanswered id in depth order, which is the first question when nothing
 * is stored. `interview:done` is the end of a finished list.
 *
 * clock stamps STATE.md `Updated at`. It defaults to the current time.
 * A project that already has `interview/tree.yaml` uses that file. Otherwise
 * the tree packaged beside this module is used.
 */
export async function openInterview(
  projectDir: string,
  depth: "express" | "standard" | "deep",
  clock: () => Date = () => new Date(),
): Promise<InterviewSession> {
  const dir = path.join(projectDir, ".hitchhiker");
  await mkdir(dir, { recursive: true });
  const questions = questionsForDepth(loadTree(resolveTreePath(projectDir)), depth);
  const answers = loadAnswers(path.join(dir, "interview.json"));
  const state = loadState(projectDir);
  const cursor = placeCursor(questions, answers, state?.promptId ?? null);
  const run = new InterviewRun(projectDir, questions, answers, cursor, clock);
  return {
    next: () => run.next(),
    command: (input) => run.command(input),
    coverage: () => run.coverage(),
  };
}

class InterviewRun {
  #projectDir: string;
  #questions: readonly Question[];
  #answers: AnswerRecord[];
  #cursor: number;
  #clock: () => Date;
  #busy = false;

  constructor(
    projectDir: string,
    questions: readonly Question[],
    answers: AnswerRecord[],
    cursor: number,
    clock: () => Date,
  ) {
    this.#projectDir = projectDir;
    this.#questions = questions;
    this.#answers = answers;
    this.#cursor = cursor;
    this.#clock = clock;
  }

  next(): Question | null {
    return this.#questions[this.#cursor] ?? null;
  }

  /**
   * Single-flight. The busy flag is set before the first await so an
   * overlapping call is rejected instead of interleaving two saves.
   */
  async command(input: InterviewCommand): Promise<AnswerRecord> {
    if (this.#busy) {
      throw new InterviewError(
        "busy",
        "The interview session is single-flight. Wait for the in-progress command.",
      );
    }
    this.#busy = true;
    try {
      const question = this.#questions[this.#cursor];
      if (question === undefined) {
        throw new InterviewError("finished", "The interview is finished.");
      }
      const record = recordFor(question, input);
      const answers = [...this.#answers, record];
      const cursor = this.#cursor + 1;
      const nextQuestion = this.#questions[cursor] ?? null;
      const promptId =
        nextQuestion === null ? "interview:done" : `${INTERVIEW_PREFIX}${nextQuestion.id}`;
      await persistPair(this.#projectDir, answers, promptId, this.#clock, nextQuestion);
      this.#answers = answers;
      this.#cursor = cursor;
      return record;
    } finally {
      this.#busy = false;
    }
  }

  coverage(): Coverage {
    const counts: Coverage = {
      answered: 0,
      suggested: 0,
      skipped: 0,
      soft: 0,
      imported: 0,
    };
    for (const answer of this.#answers) {
      addStatus(counts, answer.status);
    }
    return counts;
  }
}

function recordFor(question: Question, input: InterviewCommand): AnswerRecord {
  if (input.type === "answer") {
    if (input.text.trim() === "") {
      throw new InterviewError(
        "empty-answer",
        "An empty answer is not stored. Skip to keep the assumption.",
      );
    }
    return { id: question.id, status: "ANSWERED", value: input.text };
  }
  if (input.type === "suggest") {
    return {
      id: question.id,
      status: "SUGGESTED",
      value: question.suggest ?? SUGGEST_FALLBACK,
    };
  }
  if (input.type === "skip") {
    return { id: question.id, status: "SKIPPED", value: question.skipDefault };
  }
  const unexpected: never = input;
  throw new InterviewError("command", `Unknown interview command ${String(unexpected)}.`);
}

function addStatus(counts: Coverage, status: AnswerRecord["status"]): void {
  if (status === "ANSWERED") counts.answered += 1;
  else if (status === "SUGGESTED") counts.suggested += 1;
  else if (status === "SKIPPED") counts.skipped += 1;
  else if (status === "SOFT") counts.soft += 1;
  else counts.imported += 1;
}

/**
 * STATE id wins only while that question is still unanswered and still in
 * this depth. A crash can rename answers before state, leaving the id
 * already stored: the first unanswered id is the recovery. An id the depth
 * does not ask is ignored the same way.
 */
function placeCursor(
  questions: readonly Question[],
  answers: readonly AnswerRecord[],
  promptId: string | null,
): number {
  if (promptId !== null && promptId.startsWith(INTERVIEW_PREFIX)) {
    const id = promptId.slice(INTERVIEW_PREFIX.length);
    if (id !== "done") {
      const index = questions.findIndex((question) => question.id === id);
      if (index >= 0 && !isFilled(answers, id)) return index;
    }
  }
  return firstUnansweredIndex(questions, answers);
}

function firstUnansweredIndex(
  questions: readonly Question[],
  answers: readonly AnswerRecord[],
): number {
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    if (question !== undefined && !isFilled(answers, question.id)) return index;
  }
  return questions.length;
}

function isFilled(answers: readonly AnswerRecord[], id: string): boolean {
  let value: string | undefined;
  for (const answer of answers) {
    if (answer.id === id) value = answer.value;
  }
  return value !== undefined && value.trim() !== "";
}

function resolveTreePath(projectDir: string): string {
  const local = path.join(projectDir, "interview", "tree.yaml");
  if (existsSync(local)) return local;
  return path.resolve(import.meta.dirname, "..", "..", "..", "interview", "tree.yaml");
}

function loadAnswers(filePath: string): AnswerRecord[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InterviewError("corrupt-answers", "interview.json is not valid JSON.");
  }
  if (!Array.isArray(value)) {
    throw new InterviewError(
      "corrupt-answers",
      "interview.json must be an array of answers.",
    );
  }
  return value.map((item, index) => parseAnswer(item, index));
}

function parseAnswer(item: unknown, index: number): AnswerRecord {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new InterviewError(
      "corrupt-answers",
      `interview.json item ${index + 1} is not an answer.`,
    );
  }
  const record = item as Record<string, unknown>;
  const { id, status, value } = record;
  if (typeof id !== "string" || id.trim() === "") {
    throw new InterviewError(
      "corrupt-answers",
      `interview.json item ${index + 1} is missing an id.`,
    );
  }
  if (typeof status !== "string" || !isAnswerStatus(status)) {
    throw new InterviewError(
      "corrupt-answers",
      `interview.json item ${index + 1} has an unknown status.`,
    );
  }
  if (typeof value !== "string") {
    throw new InterviewError(
      "corrupt-answers",
      `interview.json item ${index + 1} is missing a value.`,
    );
  }
  return { id, status, value };
}

function isAnswerStatus(value: string): value is AnswerRecord["status"] {
  return ANSWER_STATUSES.some((status) => status === value);
}

/**
 * Both files share one state lock. Temps are written first, then answers
 * are renamed, then state. saveState takes the same lock, so calling it
 * here would deadlock on state.lock. The heading document matches state.ts.
 */
async function persistPair(
  projectDir: string,
  answers: readonly AnswerRecord[],
  promptId: string,
  clock: () => Date,
  nextQuestion: Question | null,
): Promise<void> {
  const dir = path.join(projectDir, ".hitchhiker");
  const answersPath = path.join(dir, "interview.json");
  const stateFile = path.join(dir, "STATE.md");
  await withStateLock(projectDir, async () => {
    const state = mergeState(loadState(projectDir), promptId, clock().toISOString(), nextQuestion);
    const answersTemp = tempSibling(answersPath);
    const stateTemp = tempSibling(stateFile);
    await writeFile(answersTemp, renderAnswers(answers), "utf8");
    try {
      await writeFile(stateTemp, renderState(state), "utf8");
    } catch (error) {
      await unlink(answersTemp).catch(() => undefined);
      throw error;
    }
    try {
      await rename(answersTemp, answersPath);
    } catch (error) {
      await unlink(answersTemp).catch(() => undefined);
      await unlink(stateTemp).catch(() => undefined);
      throw error;
    }
    try {
      await rename(stateTemp, stateFile);
    } catch (error) {
      await unlink(stateTemp).catch(() => undefined);
      throw error;
    }
  });
}

function mergeState(
  existing: GuideState | null,
  promptId: string,
  updatedAt: string,
  nextQuestion: Question | null,
): GuideState {
  const nextAction =
    nextQuestion === null ? "Approve the Site Brief." : `Answer ${nextQuestion.id}.`;
  if (existing === null) {
    return {
      phase: "Don't Panic",
      slice: "The Guide",
      promptId,
      lastGoodCommit: "",
      blockers: [],
      nextAction,
      updatedAt,
    };
  }
  return {
    phase: existing.phase,
    slice: existing.slice,
    promptId,
    lastGoodCommit: existing.lastGoodCommit,
    blockers: [...existing.blockers],
    nextAction,
    updatedAt,
  };
}

function renderAnswers(answers: readonly AnswerRecord[]): string {
  return `${JSON.stringify(answers, null, 2)}\n`;
}

function section(heading: string, body: string): string {
  return `## ${heading}\n\n${body}\n\n`;
}

function renderState(state: GuideState): string {
  const blockers = state.blockers.map((item) => `- ${item}`).join("\n");
  return (
    "# Guide state\n\n" +
    section("Phase", state.phase) +
    section("Slice", state.slice) +
    section("Prompt id", state.promptId) +
    section("Last good commit", state.lastGoodCommit) +
    section("Blockers", blockers) +
    section("Next action", state.nextAction) +
    section("Updated at", state.updatedAt)
  );
}

function tempSibling(targetPath: string): string {
  return path.join(
    path.dirname(targetPath),
    `${path.basename(targetPath)}.tmp-${process.pid}`,
  );
}
