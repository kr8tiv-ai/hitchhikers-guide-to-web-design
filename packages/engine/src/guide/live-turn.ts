import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CassetteError, CassetteMissError } from "../ai/cassette.ts";
import type { ThinkRequest, ThinkResult } from "../ai/think.ts";
import { think } from "../ai/think.ts";
import {
  GrokMissingError,
  GrokUnavailableError,
  ThinkRunError,
  ThinkSchemaError,
  ThinkTimeoutError,
} from "../ai/think.ts";
import { validateJson } from "../ai/schema-validate.ts";
import { InterviewError, openInterview } from "../interview.ts";
import { replaceViaTemp, withStateLock } from "../lock.ts";
import { PersonaError, buildSystemPrompt } from "../persona.ts";
import { bindPacket, syncInterviewFacts } from "../context/index.ts";
import { loadTree, type Question } from "../tree.ts";
import type { AnswerRecord } from "../required.ts";
import { mirrorCue, requestMirror } from "./mirror.ts";
import {
  assetDisplayName,
  assetNamedIn,
  filterGuideText,
  guardLogoText,
  guardPriorSiteText,
  loadSessionState,
  projectMentionsQuotes,
  sessionBlock,
  topicFor,
} from "./session-state.ts";
import { bannedAnswer } from "./answer-guard.ts";
import { judgePushback } from "./pushback-judge.ts";
import {
  GUIDE_MESSAGE_SCHEMA,
  GUIDE_MESSAGE_TASK,
  type ChoiceOrigin,
  type Facts,
  type GalleryEntry,
  type SuggestChoice,
  type SuggestOption,
} from "./schemas.ts";
import {
  defaultGalleryFile,
  isTasteId,
  loadFacts,
  loadGallery,
  referenceCards,
  suggestOffer,
} from "./suggest.ts";
import { detectLanguage, validateGuideMessage } from "./validators.ts";
import { type AnswerProgressStage, isAnswerProgressStage } from "./guide-progress.ts";

/**
 * One live interview turn.
 * Answers are stored by the 018 engine so resume stays deterministic.
 * The model may phrase the next ask. It may not choose the next id.
 * 018 writes SOFT only when the phrase floor matches. A model-only third
 * accept is stored by that engine as ANSWERED, then marked SOFT here so the
 * record matches the turn.
 */

export interface GuideSession {
  projectDir: string;
  depth: "express" | "standard" | "deep";
  language: string;
  pushes: Record<string, number>;
  shown?: string[];
  /** Last follow-up on this question, so the same line is not shown twice. */
  lastFallback?: { id: string; message: string } | undefined;
}

export interface GuideAcp {
  prompt(text: string): Promise<string | void>;
}

export interface GuideTurnDeps {
  think: typeof think;
  acp?: GuideAcp;
  gallery?: readonly GalleryEntry[];
  galleryFile?: string;
  /** Fired from the real check, the next question, and the save. Not a timer. */
  onProgress?: (stage: AnswerProgressStage) => void;
}

export interface GuideTurnInput {
  kind: "answer" | "suggest" | "skip";
  text?: string;
  /** A pick on the spot. Stored as SUGGESTED, not judged again. */
  assumed?: boolean;
}

export interface GuideTurn {
  message: string;
  questionId: string | null;
  status: "asked" | "pushed" | "soft" | "done";
  cards?: GalleryEntry[];
  options?: SuggestOption[];
  /** Picks for the question in choicesForId. Model or the single fallback. */
  choices?: SuggestChoice[];
  choicesOrigin?: ChoiceOrigin;
  choicesForId?: string;
  quote?: string;
  calm?: boolean;
  /** Set when a follow-up cap keeps the answer as given. */
  note?: string;
}

export const CALM_MESSAGE =
  "The Guide is quiet for a moment. The question below is the one from the tree. Your place on this machine is saved.";

const CLOSE_MESSAGE = "What did I get wrong?";
const SESSION_FILE = "guide-session.json";

export async function runTurn(
  s: GuideSession,
  input: GuideTurnInput,
  deps: GuideTurnDeps,
): Promise<GuideTurn> {
  await hydrate(s);
  if (s.depth === "express") await seedExpressAssumptions(s.projectDir);
  const guideDeps = { ...deps, think: bindPacket(deps.think, s.projectDir, "interview") };
  const reportSave = input.kind === "answer" && input.assumed !== true;
  let finished = false;
  try {
    const turn = await perform(s, input, guideDeps);
    finished = true;
    return turn;
  } finally {
    if (reportSave && finished) reportStage(deps, "Saving");
    await persistSession(s);
  }
}

function reportStage(deps: GuideTurnDeps, stage: AnswerProgressStage): void {
  if (!isAnswerProgressStage(stage)) return;
  deps.onProgress?.(stage);
}

/**
 * Express does not ask ids whose depth list omits it.
 * Those ids are stored as SKIPPED with the tree default, prefixed ASSUMED,
 * and listed for Before-we-jump. Safe to call more than once.
 */
export async function seedExpressAssumptions(projectDir: string): Promise<string[]> {
  const hidden = loadTree(resolveTreePath(projectDir)).filter((question) => !question.depth.includes("express"));
  const ids = hidden.map((question) => question.id);
  await withStateLock(projectDir, async () => {
    const saved = readInterviewFile(projectDir);
    const answers = [...saved.answers];
    for (const question of hidden) {
      if (latestValue(answers, question.id).trim() !== "") continue;
      answers.push({
        id: question.id,
        status: "SKIPPED",
        value: `ASSUMED: ${question.skipDefault}`,
      });
    }
    const dir = path.join(projectDir, ".hitchhiker");
    await writeFile(
      path.join(dir, "interview.json"),
      `${JSON.stringify({ version: 1, answers, cursor: saved.cursor, pushedIds: saved.pushedIds }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      path.join(dir, "before-we-jump.json"),
      `${JSON.stringify({ version: 1, ids, flagged: hidden.map((question) => ({ id: question.id, value: `ASSUMED: ${question.skipDefault}` })) }, null, 2)}\n`,
      "utf8",
    );
  });
  await syncInterviewFacts(projectDir, { summarize: false, moveCursor: false });
  return ids;
}

/** Ordered cassette. Each task has its own cursor. Used when HH_GUIDE_REPLAY=1. */
export function guideThinkFromScript(jsonText: string): typeof think {
  const parsed: unknown = JSON.parse(jsonText);
  if (!isRecord(parsed)) throw new Error("Guide cassette must be a JSON object.");
  const cursors = new Map<string, number>();
  return async function scripted<T>(req: ThinkRequest<T>): Promise<ThinkResult<T>> {
    const list = parsed[req.task];
    if (!Array.isArray(list)) throw new Error(`cassette miss: ${req.task} #0`);
    const index = cursors.get(req.task) ?? 0;
    const item = list[index];
    cursors.set(req.task, index + 1);
    if (!isRecord(item) || !Object.hasOwn(item, "result")) {
      throw new Error(`cassette miss: ${req.task} #${index}`);
    }
    const delay = Number(process.env.HH_GUIDE_DELAY_MS ?? "0");
    if (Number.isFinite(delay) && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (req.schema) {
      const errors = validateJson(item.result, req.schema);
      if (errors.length > 0) throw new Error(`cassette schema: ${errors.join("; ")}`);
    }
    return {
      value: item.result as T,
      raw: JSON.stringify(item.result),
      durationMs: 0,
      cassette: "hit",
    };
  };
}

async function perform(
  s: GuideSession,
  input: GuideTurnInput,
  deps: GuideTurnDeps,
): Promise<GuideTurn> {
  if (input.kind === "answer" && (input.text ?? "").trim() === "") {
    throw new InterviewError("empty-answer", "An empty answer is not stored. Skip to keep the assumption.");
  }
  if (input.text !== undefined) {
    const detected = detectLanguage(input.text);
    if (detected !== null) s.language = detected;
  }
  const interview = await openInterview(s.projectDir, s.depth);
  const current = interview.next();
  if (current === null) {
    return { message: CLOSE_MESSAGE, questionId: null, status: "done" };
  }
  if (input.kind === "answer") {
    const ban = bannedAnswer(current, input.text ?? "");
    if (ban !== null) throw new InterviewError("static-answer", ban);
  }
  if (input.kind === "suggest") return answerSuggest(s, current, deps);
  if (input.kind === "skip") {
    await interview.command({ type: "skip" });
    return advance(s, current, false, deps);
  }
  if (input.assumed === true) return answerAssumed(s, current, input.text ?? "", deps);
  return answerText(s, current, input.text ?? "", deps);
}

async function answerText(
  s: GuideSession,
  current: Question,
  text: string,
  deps: GuideTurnDeps,
): Promise<GuideTurn> {
  const prior = s.pushes[current.id] ?? 0;
  const questions = loadTree(resolveTreePath(s.projectDir));
  const sessionState = loadSessionState(s.projectDir, questions);
  const bound = await bindNamedLogo(s.projectDir, current, text, sessionState);
  const judgedState = bound ? loadSessionState(s.projectDir, questions) : sessionState;
  const facts = loadFacts(s.projectDir);
  reportStage(deps, "Checking your answer");
  const judgement = await judgePushback(current, text, prior, {
    think: deps.think,
    projectDir: s.projectDir,
    language: s.language,
    facts,
    session: judgedState,
    questions,
    priorMessage: s.lastFallback?.id === current.id ? s.lastFallback.message : undefined,
  });
  if (judgement.action === "push") {
    s.lastFallback = { id: current.id, message: judgement.message };
  } else if (s.lastFallback?.id === current.id) {
    s.lastFallback = undefined;
  }
  if (judgement.unchecked === true) {
    await storePlain(s, text);
    const turn = await advanceAnswer(s, current, false, deps);
    turn.calm = true;
    turn.message = judgement.message;
    return turn;
  }
  if (judgement.action === "push" && bound && !judgement.floor) {
    await storePlain(s, text);
    return advanceAnswer(s, current, false, deps);
  }
  if (judgement.action === "push") {
    if (judgement.floor) await storeFloorHold(s, text);
    s.pushes[current.id] = judgement.count;
    const turn: GuideTurn = {
      message: judgement.message,
      questionId: current.id,
      status: "pushed",
      quote: judgement.quote,
    };
    if (judgement.choices !== undefined && judgement.choicesOrigin !== undefined) {
      turn.choices = judgement.choices;
      turn.choicesOrigin = judgement.choicesOrigin;
      turn.choicesForId = current.id;
    }
    return turn;
  }
  if (judgement.action === "soft" && judgement.floor) await storeSoftFloor(s, text);
  else await storePlain(s, text);
  if (judgement.action === "soft" && !judgement.floor) await markLatestSoft(s.projectDir, current.id);
  if (judgement.action === "soft") s.pushes[current.id] = judgement.count;
  const turn = await advanceAnswer(s, current, judgement.action === "soft", deps);
  if (judgement.note !== undefined && judgement.note !== "") turn.note = judgement.note;
  return turn;
}

async function advanceAnswer(
  s: GuideSession,
  current: Question,
  wasSoft: boolean,
  deps: GuideTurnDeps,
): Promise<GuideTurn> {
  reportStage(deps, "Writing the next question");
  return advance(s, current, wasSoft, deps);
}

async function answerSuggest(
  s: GuideSession,
  current: Question,
  deps: GuideTurnDeps,
): Promise<GuideTurn> {
  const facts = loadFacts(s.projectDir);
  const offer = await suggestOffer(current.id, facts, {
    think: deps.think,
    projectDir: s.projectDir,
    language: s.language,
    fallbackLabel: current.suggest ?? "",
  });
  let cards: GalleryEntry[] | undefined;
  if (isTasteId(current.id)) {
    cards = pickCards(s, facts, deps);
    const shown = new Set(s.shown ?? []);
    for (const card of cards) shown.add(card.url);
    s.shown = [...shown];
  }
  const turn: GuideTurn = {
    message: "",
    questionId: current.id,
    status: "asked",
    calm: true,
    options: offer.options,
    choices: offer.choices,
    choicesOrigin: offer.origin,
    choicesForId: current.id,
  };
  if (cards !== undefined) turn.cards = cards;
  return turn;
}

/** A picked choice. Stored as SUGGESTED with the choice text, then the next ask. */
async function answerAssumed(
  s: GuideSession,
  current: Question,
  text: string,
  deps: GuideTurnDeps,
): Promise<GuideTurn> {
  await storeCommand(s, { type: "suggest" });
  await rewriteSuggestedValue(s.projectDir, current.id, text);
  return advance(s, current, false, deps);
}

async function advance(
  s: GuideSession,
  current: Question,
  wasSoft: boolean,
  deps: GuideTurnDeps,
): Promise<GuideTurn> {
  await syncInterviewFacts(s.projectDir, { summarize: true, moveCursor: true, think: deps.think });
  const reopened = await openInterview(s.projectDir, s.depth);
  const next = reopened.next();
  const facts = loadFacts(s.projectDir);
  const accepted =
    reopened.coverage().answered +
    reopened.coverage().suggested +
    reopened.coverage().skipped +
    reopened.coverage().soft +
    reopened.coverage().imported;
  const cue = mirrorCue(accepted, current.module, next === null ? null : next.module);
  const lines = cue === null ? null : await requestMirror(facts, cue, {
    think: deps.think,
    projectDir: s.projectDir,
    language: s.language,
  });
  const guide = await askGuide(s, next, current, facts, deps);
  let message = guide.message;
  if (!guide.calm && lines !== null) {
    const combined = `${lines[0]}\n${lines[1]}\n${lines[2]}\n${guide.message}`;
    if (validateGuideMessage(combined, { language: s.language, facts }).length === 0) message = combined;
  }
  const status = next === null ? "done" : wasSoft ? "soft" : "asked";
  const turn: GuideTurn = { message, questionId: next === null ? null : next.id, status };
  if (guide.calm) turn.calm = true;
  return turn;
}

async function askGuide(
  s: GuideSession,
  next: Question | null,
  current: Question,
  facts: Facts,
  deps: GuideTurnDeps,
): Promise<{ message: string; calm: boolean }> {
  let prompt: string;
  try {
    prompt = buildPrompt(s, next ?? current, facts, next === null);
  } catch (error) {
    if (isQuiet(error)) return fallback(next);
    throw error;
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text: string;
    try {
      text = await pullMessage(s, prompt, deps);
    } catch (error) {
      if (isQuiet(error)) return fallback(next);
      throw error;
    }
    const questions = loadTree(resolveTreePath(s.projectDir));
    const sessionState = loadSessionState(s.projectDir, questions);
    const kept = filterGuideText(text, sessionState, projectMentionsQuotes(sessionState));
    const guarded = kept === null ? null : guardLogoText(kept, sessionState, next ?? current, questions);
    const voiced = guarded === null ? null : guardPriorSiteText(guarded, sessionState, (next ?? current).id);
    if (voiced !== null && validateGuideMessage(voiced, { language: s.language, facts }).length === 0) {
      return { message: voiced, calm: false };
    }
  }
  return fallback(next);
}

function fallback(next: Question | null): { message: string; calm: boolean } {
  if (next === null) return { message: CLOSE_MESSAGE, calm: false };
  return { message: CALM_MESSAGE, calm: true };
}

async function pullMessage(s: GuideSession, prompt: string, deps: GuideTurnDeps): Promise<string> {
  if (deps.acp) {
    try {
      const fromAcp = messageFromAcp(await deps.acp.prompt(prompt));
      if (fromAcp !== null) return fromAcp;
    } catch {
      // A failed ACP turn falls through to think. It does not end the interview.
    }
  }
  const result = await deps.think(
    {
      task: GUIDE_MESSAGE_TASK,
      schema: GUIDE_MESSAGE_SCHEMA,
      input: prompt,
    },
    { projectDir: s.projectDir },
  );
  const message = readMessage(result.value);
  if (message === null) throw new ThinkSchemaError(["message"], "", "");
  return message;
}

function messageFromAcp(raw: string | void): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (validateJson(parsed, GUIDE_MESSAGE_SCHEMA).length > 0) return null;
  return readMessage(parsed);
}

function readMessage(value: unknown): string | null {
  if (!isRecord(value) || typeof value.message !== "string") return null;
  return value.message;
}

function buildPrompt(s: GuideSession, question: Question, facts: Facts, closing: boolean): string {
  const system = buildSystemPrompt(personaSkillPath(), {
    question,
    depth: s.depth,
    coverageLine: "Answers are on file.",
  });
  const factLines = facts.answers.map((answer) => `${answer.id}: ${safePromptLine(answer.value)}`);
  return [
    system,
    "",
    `Reply language: ${s.language}`,
    "Known facts:",
    factLines.join("\n"),
    promptContext(s, question),
    closing
      ? "The question list is finished. Ask only what you got wrong. One question. Do not ask the tree question again."
      : "Ask the question in the block. One question. Do not invent a different id.",
  ].join("\n");
}

function promptContext(s: GuideSession, question: Question): string {
  try {
    const questions = loadTree(resolveTreePath(s.projectDir));
    const state = loadSessionState(s.projectDir, questions);
    const ask = guardPriorSiteText(
      guardLogoText(question.ask, state, question, questions),
      state,
      question.id,
    );
    return `${sessionBlock(state)}\nQuestion to ask: ${safePromptLine(ask)}`;
  } catch {
    return "";
  }
}

/** An answer that names one file already on file makes that file the logo. */
async function bindNamedLogo(
  projectDir: string,
  question: Question,
  text: string,
  state: ReturnType<typeof loadSessionState>,
): Promise<boolean> {
  if (topicFor(question) !== "logo") return false;
  const named = assetNamedIn(text, state);
  if (named === null) return false;
  const display = assetDisplayName(named.safeName, named.originalName);
  if (!/\.(?:png|jpe?g|gif|webp|svg|pdf)$/i.test(display)) return false;
  const dir = path.join(projectDir, ".hitchhiker", "brand");
  await mkdir(dir, { recursive: true });
  const body = {
    safeName: named.safeName,
    questionId: named.questionId === "" ? question.id : named.questionId,
    originalName: display,
  };
  await replaceViaTemp(path.join(dir, "logo-intake.json"), `${JSON.stringify(body)}\n`);
  return true;
}

/** The persona check refuses the whole prompt, so user text cannot carry those marks into it. */
function safePromptLine(value: string): string {
  const lower = value.toLowerCase();
  const needles = ["autistic", "autism", "asperger", "disorder", "spectrum"];
  for (const needle of needles) {
    if (lower.indexOf(needle) !== -1) return "(omitted)";
  }
  let out = "";
  for (const ch of value) {
    if (ch === "!" || ch === "\u2014") continue;
    out += ch;
  }
  return out;
}

function pickCards(s: GuideSession, facts: Facts, deps: GuideTurnDeps): GalleryEntry[] {
  const entries = galleryEntries(s, deps);
  const query: { industry?: string; exclude: readonly string[]; limit: number } = {
    exclude: s.shown ?? [],
    limit: 4,
  };
  if (facts.industry !== undefined) query.industry = facts.industry;
  return referenceCards(entries, query);
}

function galleryEntries(s: GuideSession, deps: GuideTurnDeps): GalleryEntry[] {
  if (deps.gallery !== undefined) return [...deps.gallery];
  const fromEnv = process.env.HH_GALLERY_FILE;
  const file =
    deps.galleryFile ??
    (fromEnv !== undefined && fromEnv.trim() !== "" ? fromEnv : defaultGalleryFile());
  try {
    return loadGallery(file);
  } catch {
    return [];
  }
}

/**
 * The 018 command stores a non-floor answer as ANSWERED. The judge has already
 * held the line twice, so the saved record has to say SOFT.
 */
async function markLatestSoft(projectDir: string, id: string): Promise<void> {
  await withStateLock(projectDir, async () => {
    const saved = readInterviewFile(projectDir);
    let index = -1;
    for (let cursor = 0; cursor < saved.answers.length; cursor += 1) {
      if (saved.answers[cursor]?.id === id) index = cursor;
    }
    const record = index >= 0 ? saved.answers[index] : undefined;
    if (record === undefined || (record.status !== "ANSWERED" && record.status !== "SOFT")) {
      throw new InterviewError("command", "The soft answer could not be stored.");
    }
    if (record.status === "SOFT") return;
    const answers = saved.answers.map((answer, cursor) =>
      cursor === index ? { id: answer.id, status: "SOFT" as const, value: answer.value } : answer,
    );
    await writeFile(
      path.join(projectDir, ".hitchhiker", "interview.json"),
      `${JSON.stringify({ version: 1, answers, cursor: saved.cursor, pushedIds: saved.pushedIds }, null, 2)}\n`,
      "utf8",
    );
  });
}

async function storePlain(s: GuideSession, text: string): Promise<void> {
  const interview = await openInterview(s.projectDir, s.depth);
  await interview.command({ type: "answer", text });
}

async function storeFloorHold(s: GuideSession, text: string): Promise<void> {
  const interview = await openInterview(s.projectDir, s.depth);
  await interview.command({ type: "answer", text });
}

async function storeSoftFloor(s: GuideSession, text: string): Promise<void> {
  const interview = await openInterview(s.projectDir, s.depth);
  let guard = 0;
  while (guard < 3) {
    const record = await interview.command({ type: "answer", text });
    guard += 1;
    if (record !== null) return;
  }
  throw new InterviewError("command", "The soft answer could not be stored.");
}

async function storeCommand(s: GuideSession, command: { type: "suggest" } | { type: "skip" }): Promise<void> {
  const interview = await openInterview(s.projectDir, s.depth);
  await interview.command(command);
}

/** Keeps status SUGGESTED. Skips the write when the stored line already matches. */
async function rewriteSuggestedValue(projectDir: string, id: string, text: string): Promise<void> {
  const trimmed = text.trim();
  if (trimmed === "") return;
  await withStateLock(projectDir, async () => {
    const saved = readInterviewFile(projectDir);
    let index = -1;
    for (let cursor = 0; cursor < saved.answers.length; cursor += 1) {
      if (saved.answers[cursor]?.id === id) index = cursor;
    }
    const record = index >= 0 ? saved.answers[index] : undefined;
    if (record === undefined || record.status !== "SUGGESTED") return;
    if (record.value.trim() === trimmed) return;
    const answers = saved.answers.map((answer, cursor) =>
      cursor === index ? { id: answer.id, status: "SUGGESTED" as const, value: trimmed } : answer,
    );
    await writeFile(
      path.join(projectDir, ".hitchhiker", "interview.json"),
      `${JSON.stringify({ version: 1, answers, cursor: saved.cursor, pushedIds: saved.pushedIds }, null, 2)}\n`,
      "utf8",
    );
  });
}

function personaSkillPath(): string {
  return path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "grok-plugin",
    "skills",
    "guide-persona",
    "SKILL.md",
  );
}

function resolveTreePath(projectDir: string): string {
  const local = path.join(projectDir, "interview", "tree.yaml");
  if (existsSync(local)) return local;
  return path.resolve(import.meta.dirname, "..", "..", "..", "..", "interview", "tree.yaml");
}

function isQuiet(error: unknown): boolean {
  if (
    error instanceof GrokMissingError ||
    error instanceof GrokUnavailableError ||
    error instanceof ThinkTimeoutError ||
    error instanceof ThinkRunError ||
    error instanceof ThinkSchemaError ||
    error instanceof PersonaError ||
    error instanceof CassetteMissError ||
    error instanceof CassetteError
  ) {
    return true;
  }
  // The scripted guide throws a plain Error when its list runs out.
  return error instanceof Error && /^cassette miss:/.test(error.message);
}

async function hydrate(s: GuideSession): Promise<void> {
  const saved = readGuideFile(s.projectDir);
  if (saved.language !== "") s.language = saved.language;
  const pushes: Record<string, number> = { ...s.pushes };
  for (const [id, count] of Object.entries(saved.pushes)) {
    pushes[id] = Math.max(pushes[id] ?? 0, count);
  }
  for (const item of readInterviewFile(s.projectDir).pushedIds) {
    pushes[item.id] = Math.max(pushes[item.id] ?? 0, item.count);
  }
  s.pushes = pushes;
  const shown = new Set([...(s.shown ?? []), ...saved.shown]);
  if (shown.size > 0) s.shown = [...shown];
  if (saved.lastFallback !== undefined) s.lastFallback = saved.lastFallback;
}

async function persistSession(s: GuideSession): Promise<void> {
  const body = {
    version: 1,
    language: s.language,
    pushes: s.pushes,
    shown: s.shown ?? [],
    ...(s.lastFallback === undefined ? {} : { lastFallback: s.lastFallback }),
  };
  await withStateLock(s.projectDir, async () => {
    await writeFile(
      path.join(s.projectDir, ".hitchhiker", SESSION_FILE),
      `${JSON.stringify(body, null, 2)}\n`,
      "utf8",
    );
  });
}

function readGuideFile(projectDir: string): {
  language: string;
  pushes: Record<string, number>;
  shown: string[];
  lastFallback?: { id: string; message: string };
} {
  const empty = { language: "", pushes: {} as Record<string, number>, shown: [] as string[] };
  const file = path.join(projectDir, ".hitchhiker", SESSION_FILE);
  if (!existsSync(file)) return empty;
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(value)) return empty;
    const language = typeof value.language === "string" ? value.language : "";
    const pushes: Record<string, number> = {};
    if (isRecord(value.pushes)) {
      for (const [id, count] of Object.entries(value.pushes)) {
        if (typeof count === "number" && Number.isInteger(count) && count > 0) pushes[id] = count;
      }
    }
    const shown: string[] = [];
    if (Array.isArray(value.shown)) {
      for (const url of value.shown) {
        if (typeof url === "string" && url.trim() !== "") shown.push(url);
      }
    }
    const last = isRecord(value.lastFallback) ? value.lastFallback : null;
    const lastFallback =
      last !== null && typeof last.id === "string" && typeof last.message === "string" && last.id !== ""
        ? { id: last.id, message: last.message }
        : undefined;
    return lastFallback === undefined ? { language, pushes, shown } : { language, pushes, shown, lastFallback };
  } catch {
    return empty;
  }
}

function readInterviewFile(projectDir: string): {
  answers: AnswerRecord[];
  cursor: number;
  pushedIds: Array<{ id: string; count: number }>;
} {
  const empty = { answers: [] as AnswerRecord[], cursor: 0, pushedIds: [] as Array<{ id: string; count: number }> };
  const file = path.join(projectDir, ".hitchhiker", "interview.json");
  if (!existsSync(file)) return empty;
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(value)) return { answers: parseAnswers(value), cursor: 0, pushedIds: [] };
    if (!isRecord(value)) return empty;
    const answers = Array.isArray(value.answers) ? parseAnswers(value.answers) : [];
    const cursor = typeof value.cursor === "number" && Number.isInteger(value.cursor) && value.cursor >= 0
      ? value.cursor
      : 0;
    const pushedIds: Array<{ id: string; count: number }> = [];
    if (Array.isArray(value.pushedIds)) {
      for (const item of value.pushedIds) {
        if (!isRecord(item) || typeof item.id !== "string") continue;
        if (typeof item.count !== "number" || !Number.isInteger(item.count) || item.count < 1) continue;
        pushedIds.push({ id: item.id, count: item.count });
      }
    }
    return { answers, cursor, pushedIds };
  } catch {
    return empty;
  }
}

function parseAnswers(list: readonly unknown[]): AnswerRecord[] {
  const answers: AnswerRecord[] = [];
  for (const item of list) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.value !== "string") continue;
    const status = item.status;
    if (
      status !== "ANSWERED" &&
      status !== "SUGGESTED" &&
      status !== "SKIPPED" &&
      status !== "SOFT" &&
      status !== "IMPORTED"
    ) {
      continue;
    }
    answers.push({ id: item.id, status, value: item.value });
  }
  return answers;
}

function latestValue(answers: readonly AnswerRecord[], id: string): string {
  let value = "";
  for (const answer of answers) {
    if (answer.id === id) value = answer.value;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
