import type { Question } from "../tree.ts";
import { pushbackFor } from "../pushback.ts";
import type { think } from "../ai/think.ts";
import { PUSHBACK_SCHEMA, PUSHBACK_TASK, type ChoiceOrigin, type Facts, type SuggestChoice } from "./schemas.ts";
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
  deps: { think: typeof think; projectDir?: string; language?: string; facts?: Facts },
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
        effort: "medium",
        input: [
          `Question id: ${question.id}`,
          `Ask: ${question.ask}`,
          `Pushes already used: ${prior}`,
          "User answer:",
          text,
          "Say whether the answer is vague. Quote their words. Offer one sharper question.",
          "Also return 2 to 4 choices with ids A, B, C, D. Put the sharper question first when it is one of them.",
          "Each source must be upload:<file>, answer:<id>, crawl:<note>, or industry:<name> from the facts.",
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
  } catch {
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
  const follow = followUpChoices(raw, message, facts, language);
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
 * A push carries 2 to 4 model choices, with the sharper line first when it is valid.
 * A fallback set stays one choice: the sharper line, not a second option beside it.
 * Bad choice JSON does not change the vague, quote, or sharper fields already read.
 */
export function followUpChoices(
  value: unknown,
  message: string,
  facts: Facts,
  language: string,
): { choices: SuggestChoice[]; origin: ChoiceOrigin } {
  const standing = { label: message, why: SHARPER_WHY, source: "question:suggest" };
  const present = isRecord(value) && Object.hasOwn(value, "choices");
  const set = present
    ? choiceSetFrom(value, facts, language, standing)
    : choiceSetFrom(undefined, facts, language, standing);
  return withSharperFirst(set, message, facts, language);
}

function withSharperFirst(
  set: { choices: SuggestChoice[]; origin: ChoiceOrigin },
  sharper: string,
  facts: Facts,
  language: string,
): { choices: SuggestChoice[]; origin: ChoiceOrigin } {
  const line = sharper.trim();
  const valid = line !== "" && validateGuideMessage(line, { language, facts }).length === 0;
  if (!valid) return set;
  if (set.origin === "fallback") {
    return {
      origin: "fallback",
      choices: [{ id: "A", label: line, why: SHARPER_WHY, source: "question:suggest" }],
    };
  }
  if (set.choices[0]?.label === line) return set;
  const rest = set.choices.filter((item) => item.label !== line);
  const merged = [{ label: line, why: SHARPER_WHY, source: "question:suggest" }, ...rest].slice(0, 4);
  const choices: SuggestChoice[] = [];
  const ids = ["A", "B", "C", "D"] as const;
  for (let index = 0; index < merged.length; index += 1) {
    const item = merged[index];
    const id = ids[index];
    if (item === undefined || id === undefined) continue;
    choices.push({ id, label: item.label, why: item.why, source: item.source });
  }
  return { origin: "model", choices };
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
