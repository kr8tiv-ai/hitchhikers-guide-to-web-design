import type { Question } from "../tree.ts";
import { pushbackFor } from "../pushback.ts";
import type { think } from "../ai/think.ts";
import { buildContextPacket, factsFromPacket, withContextPacket, type ContextPacket } from "../context/index.ts";
import { PUSHBACK_SCHEMA, PUSHBACK_TASK, type ChoiceOrigin, type Facts, type SuggestChoice } from "./schemas.ts";
import {
  choiceAllowed,
  normalizeChoiceLabel,
  projectMentionsQuotes,
  reletterChoices,
  sessionBlock,
  type SessionState,
} from "./session-state.ts";
import { choiceSetFrom } from "./suggest.ts";
import { validateGuideMessage } from "./validators.ts";
import { GUIDE_FAIL_LINE } from "./guide-progress.ts";

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
  /** The check could not run. The answer is kept. The message is a notice, not a soft verdict. */
  unchecked?: boolean;
  /** True when the push text is the floor fallback line. */
  fallback?: boolean;
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
    /** Previous push text for this question, so the floor line cannot repeat. */
    priorMessage?: string | undefined;
  },
): Promise<PushJudgement> {
  const floor = pushbackFor(question, text) !== null;
  const prior = pushes < 0 ? 0 : pushes;
  const language = deps.language ?? "en";
  const packet =
    deps.packet ?? (deps.projectDir !== undefined && deps.projectDir.trim() !== "" ? buildContextPacket(deps.projectDir, "judge") : undefined);
  if (packet === undefined) throw new Error("A context packet is required.");
  const facts = deps.facts ?? factsFromPacket(packet);
  let modelVague = false;
  let quote = "";
  let sharper = "";
  let raw: unknown = null;
  let failed: unknown = null;
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
            `Pushes already used: ${prior}`,
            "User answer:",
            text,
            "Say whether the answer is vague. Quote their words. Offer one sharper question in sharperChoice.",
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
      failed = error;
    }
  }
  if (failed !== null) {
    if (deps.surfaceErrors === true) throw failed;
    if (!floor) {
      return { action: "accept", count: prior, quote: "", message: GUIDE_FAIL_LINE, floor: false, unchecked: true };
    }
    modelVague = false;
    raw = null;
  }
  const concrete = concreteColourAnswer(question, text);
  const vague = floor || (modelVague && !concrete);
  const safeQuote = cleanQuote(quote, text);
  if (!vague) {
    return { action: "accept", count: prior, quote: "", message: "", floor };
  }
  if (prior >= PUSH_CAP) {
    return { action: "soft", count: prior, quote: safeQuote, message: "", floor };
  }
  const message = sharperLine(sharper, question, text, language, facts);
  if (message === FLOOR_FALLBACK && deps.priorMessage === FLOOR_FALLBACK) {
    return { action: "accept", count: prior, quote: "", message: "", floor: false };
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

const COLOUR_WORDS = [
  "jungle",
  "green",
  "gold",
  "sunset",
  "ocean",
  "blue",
  "sand",
  "black",
  "ember",
  "white",
  "red",
  "yellow",
  "orange",
  "purple",
  "pink",
  "brown",
  "grey",
  "gray",
  "teal",
  "navy",
  "cream",
] as const;

/** Named colours or a hex value on a colour question. The judge still runs. A phrase floor still wins. */
function concreteColourAnswer(question: Question, text: string): boolean {
  const ask = question.ask.toLowerCase();
  const topic = (question.topic ?? "").toLowerCase();
  if (topic !== "palette" && !ask.includes("color") && !ask.includes("colour")) return false;
  if (/#[0-9a-f]{3,8}\b/i.test(text)) return true;
  const padded = ` ${text.toLowerCase()} `;
  let count = 0;
  for (const word of COLOUR_WORDS) {
    if (padded.includes(` ${word} `)) count += 1;
  }
  return count >= 3;
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
