import type { Question } from "../tree.ts";
import { pushbackFor } from "../pushback.ts";
import type { think } from "../ai/think.ts";
import { PUSHBACK_SCHEMA, PUSHBACK_TASK, type ChoiceOrigin, type Facts, type SuggestChoice } from "./schemas.ts";
import { filterGuideText, normalizeChoiceLabel, projectMentionsQuotes, sessionBlock, type SessionState } from "./session-state.ts";
import { choiceSetFrom } from "./suggest.ts";
import { validateGuideMessage } from "./validators.ts";

/**
 * Model verdict OR the 019 phrase floor. At most two pushes, then SOFT.
 * A model failure counts as not vague, so the phrase floor still applies.
 * The engine stores SOFT only when the phrase floor matches. The caller marks
 * a model-only third accept as SOFT after that store.
 */

export const PUSH_CAP = 2;

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
    session?: SessionState;
    /** When set, a model timeout or crash is thrown instead of treated as a clear answer. */
    surfaceErrors?: boolean;
  },
): Promise<PushJudgement> {
  const floor = pushbackFor(question, text) !== null;
  const prior = pushes < 0 ? 0 : pushes;
  const language = deps.language ?? "en";
  const facts = deps.facts ?? { answers: [], uploads: [], crawlNotes: [] };
  let modelVague = false;
  let quote = "";
  let sharper = "";
  let raw: unknown = null;
  try {
    const result = await deps.think(
      {
        task: PUSHBACK_TASK,
        schema: PUSHBACK_SCHEMA,
        input: [
          `Question id: ${question.id}`,
          `Ask: ${question.ask}`,
          `Pushes already used: ${prior}`,
          "User answer:",
          text,
          "Say whether the answer is vague. Quote their words. Offer one sharper question in sharperChoice.",
          "Return 2 to 4 choices with ids A, B, C, D. Do not put the sharper question into choices.",
          "Each source must be upload:<file>, answer:<id>, crawl:<note>, or industry:<name> from the facts.",
          deps.session === undefined ? "" : sessionBlock(deps.session),
        ].join("\n"),
      },
      deps.projectDir === undefined ? {} : { projectDir: deps.projectDir },
    );
    raw = result.value;
    const value = asVerdict(result.value);
    if (value !== null) {
      modelVague = value.vague;
      quote = value.quote;
      sharper = value.sharperChoice;
    }
  } catch (error) {
    if (deps.surfaceErrors === true) throw error;
    modelVague = false;
    raw = null;
  }
  const vague = modelVague || floor;
  const safeQuote = cleanQuote(quote, text);
  if (!vague) {
    return { action: "accept", count: prior, quote: "", message: "", floor };
  }
  if (prior >= PUSH_CAP) {
    return { action: "soft", count: prior, quote: safeQuote, message: "", floor };
  }
  const message = sharperLine(sharper, question, text, language, facts);
  const follow = followUpChoices(raw, message, facts, language, question.ask);
  if (deps.session !== undefined) {
    const about = projectMentionsQuotes(deps.session);
    follow.choices = follow.choices.filter(
      (item) => filterGuideText(item.label, deps.session as SessionState, about) !== null,
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
  };
}

const SHARPER_WHY = "A sharper question for this answer.";

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
  const set = present
    ? choiceSetFrom(value, facts, language, standing)
    : choiceSetFrom(undefined, facts, language, standing);
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
  facts: Facts | undefined,
): string {
  const ctx = { language, facts: facts ?? { answers: [], uploads: [], crawlNotes: [] } };
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
