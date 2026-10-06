import type { Question } from "../tree.ts";
import { pushbackFor } from "../pushback.ts";
import type { think } from "../ai/think.ts";
import { PUSHBACK_SCHEMA, PUSHBACK_TASK, type Facts } from "./schemas.ts";
import { validateGuideMessage } from "./validators.ts";

/**
 * Model verdict OR the 019 phrase floor. At most two pushes, then SOFT.
 * A model failure counts as not vague, so the phrase floor still applies.
 * The engine stores SOFT only when the phrase floor matches. A model-only
 * third accept is still reported as soft by the caller.
 */

export const PUSH_CAP = 2;

const FLOOR_FALLBACK = "That answer is still soft. What is one concrete detail the site should use?";
const ES_FALLBACK = "Eso sigue blando. Que detalle concreto debe usar el sitio?";

export interface PushJudgement {
  action: "push" | "soft" | "accept";
  count: number;
  quote: string;
  message: string;
  /** True when 019's phrase list matched. The engine can store SOFT only then. */
  floor: boolean;
}

export async function judgePushback(
  question: Question,
  text: string,
  pushes: number,
  deps: { think: typeof think; projectDir?: string; language?: string; facts?: Facts },
): Promise<PushJudgement> {
  const floor = pushbackFor(question, text) !== null;
  const prior = pushes < 0 ? 0 : pushes;
  let modelVague = false;
  let quote = "";
  let sharper = "";
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
        ].join("\n"),
      },
      deps.projectDir === undefined ? {} : { projectDir: deps.projectDir },
    );
    const value = asVerdict(result.value);
    if (value !== null) {
      modelVague = value.vague;
      quote = value.quote;
      sharper = value.sharperChoice;
    }
  } catch {
    modelVague = false;
  }
  const vague = modelVague || floor;
  const safeQuote = cleanQuote(quote, text);
  if (!vague) {
    return { action: "accept", count: prior, quote: "", message: "", floor };
  }
  if (prior >= PUSH_CAP) {
    return { action: "soft", count: prior, quote: safeQuote, message: "", floor };
  }
  return {
    action: "push",
    count: prior + 1,
    quote: safeQuote,
    message: sharperLine(sharper, question, text, deps.language ?? "en", deps.facts),
    floor,
  };
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
