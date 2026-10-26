/**
 * The owner's type words win over a dealt or picked display face.
 * The direction still supplies the other family. No model call.
 */

import { TYPE_LIBRARY } from "./type-library.ts";

export type HeadingWish = "sans" | "serif" | "none";
export type FaceKind = "serif" | "sans" | "other";

/** Drop the "no fonts yet" and "show me pairings" framing. Keep the owner's case. */
export function typeLead(typeText: string): string {
  return typeText
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^no fonts yet\.?\s*/i, "")
    .replace(/^no type yet\.?\s*/i, "")
    .replace(/\s*show me pairings\.?\s*/gi, "")
    .replace(/[.\s]+$/, "")
    .trim();
}

export function headingWish(typeText: string): HeadingWish {
  const text = typeText.toLowerCase();
  const sans = /\bsans\b/.test(text);
  const serif = /\bserif\b/.test(text);
  if (sans && !serif) return "sans";
  if (serif && !sans) return "serif";
  return "none";
}

/** The sans or serif clause, first letter lowered, for the wins sentence. */
export function headingPhrase(typeText: string): string {
  const lead = typeLead(typeText);
  const parts = lead.split(/[.;]/).map((part) => part.trim()).filter((part) => part !== "");
  const hit = parts.find((part) => /\b(?:sans|serif)\b/i.test(part)) ?? lead;
  const clause = hit.replace(/[.\s]+$/, "").trim();
  if (clause === "") return "the stated type";
  return clause.charAt(0).toLowerCase() + clause.slice(1);
}

/**
 * Classify the display face from the rationale clause before "and",
 * so the body face in the same sentence does not decide.
 */
export function displayKind(display: string): FaceKind {
  const name = display.trim();
  if (name === "") return "other";
  const pair = TYPE_LIBRARY.find((item) => item.display === name);
  const clause = pair === undefined ? name : (pair.rationale.split(/\band\b/i)[0] ?? name);
  if (/\bserif\b/i.test(clause)) return "serif";
  if (/\b(?:sans|grotesque|grotesk)\b/i.test(clause)) return "sans";
  if (/\bserif\b/i.test(name)) return "serif";
  if (/\bsans\b/i.test(name)) return "sans";
  return "other";
}

/** Empty when the display already agrees with the owner, or the class is unknown. */
export function winsSentence(display: string, body: string, typeText: string): string {
  const wish = headingWish(typeText);
  if (wish === "none" || display.trim() === "") return "";
  const kind = displayKind(display);
  if (kind === "other" || kind === wish) return "";
  const phrase = headingPhrase(typeText);
  const rest = body.trim() === "" ? "the rest of the direction" : body.trim();
  return `The owner's words win over ${display.trim()}: ${phrase}, and the direction supplies ${rest}.`;
}
