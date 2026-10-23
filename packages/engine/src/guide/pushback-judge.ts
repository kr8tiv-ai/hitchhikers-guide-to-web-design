import type { Question } from "../tree.ts";
import { pushbackFor } from "../pushback.ts";
import { isBillingFailure } from "../ai/grok-failure.ts";
import { ThinkTimeoutError, type think } from "../ai/think.ts";
import { buildContextPacket, factsFromPacket, withContextPacket, type ContextPacket } from "../context/index.ts";
import { classifyAnswer, modelOverride } from "./answer-shape.ts";
import { PUSHBACK_SCHEMA, PUSHBACK_TASK, type ChoiceOrigin, type Facts, type SuggestChoice } from "./schemas.ts";
import {
  choiceAllowed,
  followUpRejected,
  normalizeChoiceLabel,
  projectMentionsQuotes,
  reletterChoices,
  sessionBlock,
  type FollowHistory,
  type SessionState,
} from "./session-state.ts";
import { choiceSetFrom } from "./suggest.ts";
import { validateGuideMessage } from "./validators.ts";
import { GUIDE_FAIL_LINE, GUIDE_TIMEOUT_LINE } from "./guide-progress.ts";

/**
 * Model verdict OR the 019 phrase floor. Vague answers still push twice (D-004).
 * A concrete-likely answer pushes at most once, and only when the judge names
 * the missing part. Named colours, a direct yes or no, a url, or a named list
 * override that gap. A substantive answer advances. A follow-up is asked only
 * when one named part of the question is missing, and the line names that part.
 * A global soft phrase still pushes. A model failure is not a soft verdict.
 */

export const PUSH_CAP = 2;
/** Concrete-likely answers. Vague answers keep PUSH_CAP unless followUpCap is set. */
export const CONCRETE_FOLLOW_UP_CAP = 1;
export const ACCEPTED_AFTER_FOLLOW_UP = "accepted after one follow-up";

const FLOOR_FALLBACK = "That answer is still soft. What is one concrete detail the site should use?";
const ES_FALLBACK = "Eso sigue blando. Que detalle concreto debe usar el sitio?";

export interface PushJudgement {
  action: "push" | "soft" | "accept";
  count: number;
  quote: string;
  message: string;
  /** True when 019's phrase list matched. The engine stores SOFT itself only then. */
  floor: boolean;
  /** Present on a push. Model choices, or one fallback. Never on accept or soft. */
  choices?: SuggestChoice[];
  choicesOrigin?: ChoiceOrigin;
  /** The check could not run. The answer is kept. The message is a notice, not a soft verdict. */
  unchecked?: boolean;
  /** True when the push text is the floor fallback line. */
  fallback?: boolean;
  /** Set when a follow-up cap keeps the answer as given. */
  note?: string;
}

export async function judgePushback(
  question: Question,
  text: string,
  pushes: number,
  deps: {
    think: typeof think;
    projectDir?: string;
    language?: string;
    facts?: Facts;
    packet?: ContextPacket;
    session?: SessionState;
    /** Tree questions, so a choice cannot re-ask a decided topic. */
    questions?: readonly Question[];
    /** When set, a model timeout or crash is thrown instead of treated as a clear answer. */
    surfaceErrors?: boolean;
    /** Previous push text for this question, so the same line cannot repeat. */
    priorMessage?: string | undefined;
    /** Total follow-ups for this question. Unset keeps D-004 (two) for vague answers. */
    followUpCap?: number;
    /** Earlier asks and answers for this decision point. A repeat of one is not shown. */
    history?: readonly FollowHistory[];
  },
): Promise<PushJudgement> {
  const floor = pushbackFor(question, text) !== null;
  const prior = pushes < 0 ? 0 : pushes;
  const language = deps.language ?? "en";
  const followUp = deps.priorMessage?.trim() ?? "";
  const classification = classifyAnswer(question, text, followUp);
  const packet =
    deps.packet ?? (deps.projectDir !== undefined && deps.projectDir.trim() !== "" ? buildContextPacket(deps.projectDir, "judge") : undefined);
  if (packet === undefined) throw new Error("A context packet is required.");
  const facts = deps.facts ?? factsFromPacket(packet);
  let modelVague = false;
  let quote = "";
  let sharper = "";
  let raw: unknown = null;
  let failed: unknown = null;
  let timedOut = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const request = await withContextPacket(
        deps.projectDir ?? "",
        "judge",
        {
          task: PUSHBACK_TASK,
          schema: PUSHBACK_SCHEMA,
          input: [
            `Question id: ${question.id}`,
            `Ask: ${question.ask}`,
            `Expected shape: ${classification.shape}`,
            `Follow-up being judged: ${followUp === "" ? "This is the base question." : followUp}`,
            `Pre-classifier: ${classification.concreteLikely ? "concrete-likely" : "not concrete"}`,
            `Evidence: ${classification.evidence}`,
            `Pushes already used: ${prior}`,
            ...historyLines(deps.history),
            "User answer:",
            text,
            "Say whether the answer is vague. Quote their words. Offer one sharper question in sharperChoice.",
            "If the answer is concrete-likely and you still mark vague true, sharperChoice must say what is missing.",
            "Return 2 to 4 choices with ids A, B, C, D. Do not put the sharper question into choices.",
            "Each source must be upload:<file>, answer:<id>, crawl:<note>, or industry:<name> from the facts.",
            deps.session === undefined ? "" : sessionBlock(deps.session),
          ].join("\n"),
        },
        packet,
      );
      const result = await deps.think(request, deps.projectDir === undefined ? {} : { projectDir: deps.projectDir });
      failed = null;
      raw = result.value;
      const value = asVerdict(result.value);
      if (value !== null) {
        modelVague = value.vague;
        quote = value.quote;
        sharper = value.sharperChoice;
      }
      break;
    } catch (error) {
      if (isBillingFailure(error)) throw error;
      failed = error;
      if (error instanceof ThinkTimeoutError) timedOut = true;
    }
  }
  if (failed !== null) {
    if (deps.surfaceErrors === true) throw failed;
    if (!floor) {
      return {
        action: "accept",
        count: prior,
        quote: "",
        message: timedOut ? GUIDE_TIMEOUT_LINE : GUIDE_FAIL_LINE,
        floor: false,
        unchecked: true,
      };
    }
    modelVague = false;
    raw = null;
  }
  const concreteLikely = classification.concreteLikely;
  const override = modelOverride(classification);
  const effectiveFloor = floor && (globalSoft(text) || !concreteLikely);
  const cited = concreteLikely && !override && modelVague && citesMissing(sharper);
  const vague = effectiveFloor || cited || (modelVague && !concreteLikely);
  const safeQuote = cleanQuote(quote, text);
  if (!vague) {
    return { action: "accept", count: prior, quote: "", message: "", floor };
  }
  const concreteCap = deps.followUpCap ?? CONCRETE_FOLLOW_UP_CAP;
  const vagueCap = deps.followUpCap ?? PUSH_CAP;
  const cap = concreteLikely && !floor ? concreteCap : vagueCap;
  if (prior >= cap) {
    if ((concreteLikely && !floor) || cap < PUSH_CAP) {
      return { action: "accept", count: prior, quote: "", message: "", floor: false, note: ACCEPTED_AFTER_FOLLOW_UP };
    }
    return { action: "soft", count: prior, quote: safeQuote, message: "", floor };
  }
  let message = sharperLine(sharper, question, text, language, facts);
  if (advanceSubstantive(text, sharper, concreteLikely, override, modelVague)) {
    return { action: "accept", count: prior, quote: "", message: "", floor: false };
  }
  const named = namedPartFollowUp(question, text);
  if (named !== null && isGenericDetailAsk(message) && pushbackFor(question, text) === null && !globalSoft(text)) {
    message = named;
  }
  if (sameFollowUp(message, deps.priorMessage)) {
    return {
      action: "accept",
      count: prior,
      quote: "",
      message: "",
      floor: false,
      ...(prior >= 1 ? { note: ACCEPTED_AFTER_FOLLOW_UP } : {}),
    };
  }
  const rejectHistory =
    deps.history === undefined || deps.history.length === 0 ? [{ ask: question.ask, answer: "" }] : deps.history;
  if (followUpRejected(message, rejectHistory, text) !== null) {
    return {
      action: "accept",
      count: prior,
      quote: "",
      message: "",
      floor: false,
      ...(prior >= 1 ? { note: ACCEPTED_AFTER_FOLLOW_UP } : {}),
    };
  }
  const follow = followUpChoices(raw, message, facts, language, question.ask);
  if (deps.session !== undefined) {
    const about = projectMentionsQuotes(deps.session);
    const questions = deps.questions ?? [question];
    follow.choices = reletterChoices(
      follow.choices.filter((item) => choiceAllowed(item.label, deps.session as SessionState, questions, about)),
    );
  }
  return {
    action: "push",
    count: prior + 1,
    quote: safeQuote,
    message,
    floor,
    choices: follow.choices,
    choicesOrigin: follow.origin,
    ...(message === FLOOR_FALLBACK ? { fallback: true } : {}),
  };
}

const SHARPER_WHY = "A sharper question for this answer.";

const GENERIC_DETAIL = "one concrete detail the site should use";
const LOVE_FOLLOW = "What do you love about a site you admire?";
const WINCE_FOLLOW = "What makes you wince on a site?";
const LOVE_WORDS = ["love", "loved", "admire", "admired", "honesty", "honest", "calm", "photo", "photos"] as const;
const WINCE_WORDS = [
  "wince",
  "hate",
  "dislike",
  "shout",
  "spreadsheet",
  "spreadsheets",
  "salesy",
  "clutter",
  "cluttered",
  "loud",
] as const;
const SUBSTANTIVE_WORDS = 8;

/** The stock "one concrete detail" line. It does not name a missing part. */
function isGenericDetailAsk(message: string): boolean {
  return message.trim().toLowerCase().replaceAll("\u2019", "'").indexOf(GENERIC_DETAIL) !== -1;
}

/**
 * A long, specific answer already covers the question.
 * A cited gap on a concrete-likely answer still pushes. A global soft phrase still pushes.
 * A question-specific phrase list does not keep that long answer soft.
 * A short one-sided love or wince answer is not substantive, so the other side is still asked.
 */
function advanceSubstantive(
  text: string,
  sharper: string,
  concreteLikely: boolean,
  override: boolean,
  modelVague: boolean,
): boolean {
  if (!isSubstantiveAnswer(text)) return false;
  if (globalSoft(text)) return false;
  if (concreteLikely && !override && modelVague && citesMissing(sharper) && !isGenericDetailAsk(sharper)) return false;
  return true;
}

function isSubstantiveAnswer(text: string): boolean {
  return contentCount(text) >= SUBSTANTIVE_WORDS;
}

function contentCount(text: string): number {
  const lower = text.toLowerCase().replaceAll("\u2019", "'");
  let count = 0;
  let index = 0;
  while (index < lower.length) {
    while (index < lower.length && !isCountLetter(lower[index] ?? "")) index += 1;
    const start = index;
    while (index < lower.length && isCountLetter(lower[index] ?? "")) index += 1;
    if (start === index) continue;
    const word = lower.slice(start, index);
    if (word.length < 4 || CONTENT_STOP.has(word)) continue;
    count += 1;
  }
  return count;
}

function isCountLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

const CONTENT_STOP = new Set([
  "that",
  "this",
  "with",
  "from",
  "your",
  "have",
  "what",
  "when",
  "where",
  "which",
  "about",
  "there",
  "their",
  "they",
  "them",
  "then",
  "than",
  "into",
  "only",
  "must",
  "never",
  "here",
  "does",
  "will",
  "would",
  "should",
  "could",
  "been",
  "being",
  "were",
]);

/**
 * Love/wince questions have two named parts.
 * One side alone is a follow-up that names the other side. Both, or neither, is not.
 */
function namedPartFollowUp(question: Question, text: string): string | null {
  const ask = question.ask.toLowerCase();
  if (ask.indexOf("love") === -1 || ask.indexOf("wince") === -1) return null;
  const love = coversSide(text, LOVE_WORDS);
  const wince = coversSide(text, WINCE_WORDS);
  if (love && !wince) return WINCE_FOLLOW;
  if (wince && !love) return LOVE_FOLLOW;
  return null;
}

function coversSide(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase();
  for (const word of words) {
    if (hasWord(lower, word)) return true;
  }
  return false;
}

/** A soft verdict on a concrete-likely answer has to name the missing part. */
function citesMissing(sharper: string): boolean {
  const line = sharper.trim().toLowerCase();
  if (line === "") return false;
  if (line.indexOf("one concrete detail the site should use") !== -1) return false;
  if (line.startsWith("that answer is still soft")) return false;
  return hasWord(line, "missing");
}

const GLOBAL_SOFT = ["it's fine", "whatever", "you decide", "idk", "something modern", "make it pop"] as const;

function globalSoft(text: string): boolean {
  const lower = text.toLowerCase();
  for (const phrase of GLOBAL_SOFT) {
    if (lower.indexOf(phrase) !== -1) return true;
  }
  return false;
}

function historyLines(history: readonly FollowHistory[] | undefined): string[] {
  if (history === undefined || history.length === 0) return [];
  const lines = ["Asks already shown:"];
  for (const item of history) {
    if (item.ask.trim() !== "") lines.push(`- ${item.ask.trim()}`);
  }
  lines.push("Answers already given:");
  let any = false;
  for (const item of history) {
    if (item.answer.trim() === "") continue;
    lines.push(`- ${item.answer.trim()}`);
    any = true;
  }
  if (!any) lines.push("- (none yet)");
  return lines;
}

function sameFollowUp(message: string, prior: string | undefined): boolean {
  if (prior === undefined) return false;
  return normalizeFollowUp(message) !== "" && normalizeFollowUp(message) === normalizeFollowUp(prior);
}

function normalizeFollowUp(text: string): string {
  return text.trim().toLowerCase().replaceAll("\u2019", "'");
}

function hasWord(hay: string, word: string): boolean {
  let from = 0;
  while (from < hay.length) {
    const at = hay.indexOf(word, from);
    if (at < 0) return false;
    const before = at === 0 ? " " : (hay[at - 1] ?? " ");
    const after = hay[at + word.length] ?? " ";
    const wordChar = (ch: string) => (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9") || ch === "'";
    if (!wordChar(before) && !wordChar(after)) return true;
    from = at + 1;
  }
  return false;
}

/**
 * Model choices only. The sharper line is a Guide message, never a choice.
 * A choice that repeats the ask or the pushback is dropped.
 * Zero remaining choices means no choices block, not a lone Other.
 */
export function followUpChoices(
  value: unknown,
  message: string,
  facts: Facts,
  language: string,
  ask = "",
): { choices: SuggestChoice[]; origin: ChoiceOrigin } {
  const standing = { label: "", why: SHARPER_WHY, source: "question:suggest" };
  const present = isRecord(value) && Object.hasOwn(value, "choices");
  // A rejected model list is no choices block, not a lone standing line.
  const set = present
    ? choiceSetFrom(value, facts, language, standing, "none")
    : { origin: "fallback" as const, choices: [] };
  return dropEchoes(set, message, ask);
}

function dropEchoes(
  set: { choices: SuggestChoice[]; origin: ChoiceOrigin },
  message: string,
  ask: string,
): { choices: SuggestChoice[]; origin: ChoiceOrigin } {
  const banned = new Set([normalizeChoiceLabel(message), normalizeChoiceLabel(ask)].filter((item) => item !== ""));
  const kept = set.choices.filter((item) => {
    const label = normalizeChoiceLabel(item.label);
    return label !== "" && !banned.has(label);
  });
  if (kept.length === 0) return { origin: "fallback", choices: [] };
  const ids = ["A", "B", "C", "D"] as const;
  const choices: SuggestChoice[] = [];
  for (let index = 0; index < kept.length && index < ids.length; index += 1) {
    const item = kept[index];
    const id = ids[index];
    if (item === undefined || id === undefined) continue;
    choices.push({ id, label: item.label, why: item.why, source: item.source });
  }
  return { origin: choices.length === 1 ? "fallback" : set.origin, choices };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sharperLine(
  sharper: string,
  question: Question,
  text: string,
  language: string,
  facts: Facts,
): string {
  const ctx = { language, facts };
  if (sharper.trim() !== "" && validateGuideMessage(sharper, ctx).length === 0) return sharper;
  const floorLine = pushbackFor(question, text);
  if (floorLine !== null && (language === "en" || validateGuideMessage(floorLine, ctx).length === 0)) {
    return floorLine;
  }
  if (language === "es") return ES_FALLBACK;
  return FLOOR_FALLBACK;
}

function cleanQuote(quote: string, text: string): string {
  const picked = quote.trim() !== "" ? quote.trim() : text.trim();
  let out = "";
  for (const ch of picked) {
    if (ch === "?" || ch === "\uFF1F" || ch === "!" || ch === "\u2014") continue;
    out += ch;
  }
  const trimmed = out.trim();
  if (trimmed === "") return "soft answer";
  return trimmed.length > 140 ? trimmed.slice(0, 140).trim() : trimmed;
}

function asVerdict(value: unknown): { vague: boolean; quote: string; sharperChoice: string } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.vague !== "boolean") return null;
  if (typeof record.quote !== "string" || typeof record.sharperChoice !== "string") return null;
  return { vague: record.vague, quote: record.quote, sharperChoice: record.sharperChoice };
}
