import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { withStateLock } from "./lock.ts";
import { pushbackFor } from "./pushback.ts";
import type { AnswerRecord } from "./required.ts";
import { loadState, type GuideState } from "./state.ts";
import { loadTree, questionsForDepth, type Question } from "./tree.ts";

/**
 * Don't Panic, one question at a time.
 *
 * Answer stores ANSWERED. A soft answer is held while this id has been
 * pushed fewer than twice (D-004): lastPushback is set and nothing is
 * appended. The third soft answer stores SOFT. A concrete answer stores
 * ANSWERED. Suggest stores the question's suggest text, or a fixed fallback
 * when the tree has none. Skip stores SKIPPED and the tree skip default.
 * Suggest and Skip clear a pending hold and store immediately. Only the
 * answer command can push. This module does not call the network.
 *
 * Concurrent command() calls are not supported. The session is single-flight:
 * a second call that arrives while the first is still saving is rejected.
 *
 * The session offers the current question only. It does not list the rest
 * of the ask strings. AnswerRecord is the status record missingRequired reads.
 * command resolves to null when the answer is held for pushback.
 */

export type InterviewCommand =
  | { type: "answer"; text: string }
  | { type: "suggest" }
  | { type: "skip" };

export interface InterviewSession {
  next(): Question | null;
  command(input: InterviewCommand): Promise<AnswerRecord | null>;
  coverage(): {
    answered: number;
    suggested: number;
    skipped: number;
    soft: number;
    imported: number;
  };
  readonly lastPushback: string | null;
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
/** Two holds, then the next soft answer is stored. D-004. */
const PUSH_LIMIT = 2;

interface PushedCount {
  id: string;
  count: number;
}

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
  const saved = loadInterview(path.join(dir, "interview.json"));
  const state = loadState(projectDir);
  const cursor = placeCursor(questions, saved.answers, state?.promptId ?? null);
  const run = new InterviewRun(
    projectDir,
    questions,
    saved.answers,
    saved.pushedIds,
    cursor,
    clock,
  );
  return {
    next: () => run.next(),
    command: (input) => run.command(input),
    coverage: () => run.coverage(),
    get lastPushback() {
      return run.lastPushback;
    },
  };
}

class InterviewRun {
  #projectDir: string;
  #questions: readonly Question[];
  #answers: AnswerRecord[];
  #pushed: readonly PushedCount[];
  #cursor: number;
  #clock: () => Date;
  #busy = false;
  #pendingId: string | null = null;
  #lastPushback: string | null = null;

  constructor(
    projectDir: string,
    questions: readonly Question[],
    answers: AnswerRecord[],
    pushedIds: readonly PushedCount[],
    cursor: number,
    clock: () => Date,
  ) {
    this.#projectDir = projectDir;
    this.#questions = questions;
    this.#answers = answers;
    this.#pushed = pushedIds;
    this.#cursor = cursor;
    this.#clock = clock;
  }

  get lastPushback(): string | null {
    return this.#lastPushback;
  }

  next(): Question | null {
    return this.#questions[this.#cursor] ?? null;
  }

  /**
   * Single-flight. The busy flag is set before the first await so an
   * overlapping call is rejected instead of interleaving two saves.
   * pushbackFor runs before an answer is appended. A hold persists the
   * push count and leaves the cursor on this id.
   */
  async command(input: InterviewCommand): Promise<AnswerRecord | null> {
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
      if (input.type === "answer") {
        return await this.#answer(question, input.text);
      }
      const record = recordFor(question, input);
      await this.#commit(record);
      return record;
    } finally {
      this.#busy = false;
    }
  }

  async #answer(question: Question, text: string): Promise<AnswerRecord | null> {
    if (text.trim() === "") {
      throw new InterviewError(
        "empty-answer",
        "An empty answer is not stored. Skip to keep the assumption.",
      );
    }
    if (this.#pendingId !== null && this.#pendingId !== question.id) {
      this.#pendingId = null;
    }
    const push = pushbackFor(question, text);
    if (push !== null && this.#countFor(question.id) < PUSH_LIMIT) {
      const pushed = bumpCopy(this.#pushed, question.id);
      await this.#save(this.#answers, this.#cursor, pushed);
      this.#pushed = pushed;
      this.#pendingId = question.id;
      this.#lastPushback = push;
      return null;
    }
    const status = push !== null ? "SOFT" : "ANSWERED";
    const record: AnswerRecord = { id: question.id, status, value: text };
    await this.#commit(record);
    return record;
  }

  async #commit(record: AnswerRecord): Promise<void> {
    const answers = [...this.#answers, record];
    const cursor = this.#cursor + 1;
    await this.#save(answers, cursor, this.#pushed);
    this.#answers = answers;
    this.#cursor = cursor;
    this.#pendingId = null;
    this.#lastPushback = null;
  }

  async #save(
    answers: readonly AnswerRecord[],
    cursor: number,
    pushedIds: readonly PushedCount[],
  ): Promise<void> {
    const nextQuestion = this.#questions[cursor] ?? null;
    const promptId =
      nextQuestion === null ? "interview:done" : `${INTERVIEW_PREFIX}${nextQuestion.id}`;
    await persistPair(
      this.#projectDir,
      answers,
      cursor,
      pushedIds,
      promptId,
      this.#clock,
      nextQuestion,
    );
  }

  #countFor(id: string): number {
    for (const item of this.#pushed) {
      if (item.id === id) return item.count;
    }
    return 0;
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

function recordFor(
  question: Question,
  input: Exclude<InterviewCommand, { type: "answer" }>,
): AnswerRecord {
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

function loadInterview(filePath: string): { answers: AnswerRecord[]; pushedIds: PushedCount[] } {
  if (!existsSync(filePath)) return { answers: [], pushedIds: [] };
  const raw = readFileSync(filePath, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InterviewError("corrupt-answers", "interview.json is not valid JSON.");
  }
  if (Array.isArray(value)) {
    return {
      answers: value.map((item, index) => parseAnswer(item, index)),
      pushedIds: [],
    };
  }
  if (!isRecord(value) || value.version !== 1) {
    throw new InterviewError(
      "corrupt-answers",
      "interview.json must be an array of answers or version 1.",
    );
  }
  if (!Array.isArray(value.answers)) {
    throw new InterviewError("corrupt-answers", "interview.json answers must be an array.");
  }
  if (typeof value.cursor !== "number" || !Number.isInteger(value.cursor) || value.cursor < 0) {
    throw new InterviewError(
      "corrupt-answers",
      "interview.json cursor must be a non-negative integer.",
    );
  }
  return {
    answers: value.answers.map((item, index) => parseAnswer(item, index)),
    pushedIds: parsePushedIds(value.pushedIds),
  };
}

function parsePushedIds(value: unknown): PushedCount[] {
  if (!Array.isArray(value)) {
    throw new InterviewError("corrupt-answers", "interview.json pushedIds must be an array.");
  }
  const seen = new Set<string>();
  const pushed: PushedCount[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) {
      throw new InterviewError(
        "corrupt-answers",
        `interview.json pushedIds item ${index + 1} is not a count.`,
      );
    }
    const { id, count } = item;
    if (typeof id !== "string" || id.trim() === "") {
      throw new InterviewError(
        "corrupt-answers",
        `interview.json pushedIds item ${index + 1} is missing an id.`,
      );
    }
    if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
      throw new InterviewError(
        "corrupt-answers",
        `interview.json pushedIds item ${index + 1} has an invalid count.`,
      );
    }
    if (seen.has(id)) {
      throw new InterviewError("corrupt-answers", `interview.json pushedIds repeats ${id}.`);
    }
    seen.add(id);
    pushed.push({ id, count });
  }
  return pushed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bumpCopy(pushed: readonly PushedCount[], id: string): PushedCount[] {
  const next = pushed.map((item) => ({ id: item.id, count: item.count }));
  const found = next.find((item) => item.id === id);
  if (found !== undefined) {
    found.count += 1;
    return next;
  }
  next.push({ id, count: 1 });
  return next;
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
 * here would deadlock on STATE.md.lock. The heading document matches state.ts.
 */
async function persistPair(
  projectDir: string,
  answers: readonly AnswerRecord[],
  cursor: number,
  pushedIds: readonly PushedCount[],
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
    await writeFile(answersTemp, renderInterview(answers, cursor, pushedIds), "utf8");
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

function renderInterview(
  answers: readonly AnswerRecord[],
  cursor: number,
  pushedIds: readonly PushedCount[],
): string {
  const file = {
    version: 1,
    answers,
    cursor,
    pushedIds: pushedIds.map((item) => ({ id: item.id, count: item.count })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
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
