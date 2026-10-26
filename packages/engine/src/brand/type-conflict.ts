/**
 * The owner's type words win over a dealt or picked display face.
 * The direction still supplies the other family. No model call.
 */

import { TYPE_LIBRARY, type TypePairing } from "./type-library.ts";

export type HeadingWish = "sans" | "serif" | "mono" | "script" | "none";
export type FaceKind = "serif" | "sans" | "other";
export type FaceClass = "serif" | "sans" | "mono" | "script" | "other";

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
  const hits: HeadingWish[] = [];
  if (/\bsans\b/.test(text)) hits.push("sans");
  if (/\bserif\b/.test(text)) hits.push("serif");
  if (/\bmono(?:space)?\b/.test(text)) hits.push("mono");
  if (/\bscript\b/.test(text)) hits.push("script");
  if (hits.length !== 1) return "none";
  return hits[0] ?? "none";
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

/**
 * Classify a family from its own rationale clause.
 * A display pairing is read before "and". A body-only pairing is read after "and".
 * displayKind stays on the display clause so a book face does not become a serif.
 */
export function faceKind(name: string): FaceClass {
  const trimmed = name.trim();
  if (trimmed === "") return "other";
  const asDisplay = TYPE_LIBRARY.find((item) => item.display === trimmed);
  const asBody = TYPE_LIBRARY.find((item) => item.body === trimmed);
  const clause =
    asDisplay !== undefined
      ? (asDisplay.rationale.split(/\band\b/i)[0] ?? trimmed)
      : asBody !== undefined
        ? (asBody.rationale.split(/\band\b/i)[1] ?? asBody.rationale)
        : trimmed;
  return classifyFace(clause) ?? classifyFace(trimmed) ?? "other";
}

/**
 * When the owner named one classification and the display face is another,
 * use the body if it already matches, otherwise a licensed face of that
 * class from the same foundry. The dealt pair is left alone when the wish
 * names no single class.
 */
export function resolveTypeRoles(
  display: string,
  body: string,
  typeText: string,
): { display: string; body: string } {
  const current = display.trim();
  const rest = body.trim() === "" ? current : body.trim();
  const wish = headingWish(typeText);
  if (wish === "none" || current === "") return { display: current, body: rest };
  if (faceKind(current) === wish) return { display: current, body: rest };
  if (faceKind(rest) === wish) return { display: rest, body: rest };
  const found = matchingFace(current, wish, typeText);
  if (found !== null) return { display: found, body: rest };
  return { display: current, body: rest };
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

function classifyFace(text: string): FaceClass | null {
  if (/\b(?:mono|monospace)\b/i.test(text)) return "mono";
  if (/\bscript\b/i.test(text)) return "script";
  if (/\bserif\b/i.test(text)) return "serif";
  if (/\b(?:sans|grotesque|grotesk)\b/i.test(text)) return "sans";
  return null;
}

function wishAdjectives(typeText: string): string[] {
  const text = typeText.toLowerCase();
  return ["light", "wide", "airy"].filter((word) => new RegExp(`\\b${word}\\b`).test(text));
}

function scoreClause(clause: string, tone: readonly string[], adjectives: readonly string[]): number {
  const blob = `${clause} ${tone.join(" ")}`.toLowerCase();
  let score = 0;
  for (const word of adjectives) {
    if (new RegExp(`\\b${word}\\b`).test(blob)) score += 1;
  }
  return score;
}

/** A licensed face of the wished class. Same foundry first, then the rest of the library. */
function matchingFace(display: string, wish: HeadingWish, typeText: string): string | null {
  if (wish === "none") return null;
  const source = TYPE_LIBRARY.find((item) => item.display === display || item.body === display);
  const foundry = source?.foundry ?? "";
  const adjectives = wishAdjectives(typeText);
  const sameFoundry = bestFace(wish, adjectives, (pair) => pair.ship !== "trial-only" && (foundry === "" || pair.foundry === foundry));
  if (sameFoundry !== null) return sameFoundry;
  if (foundry === "") return null;
  return bestFace(wish, adjectives, (pair) => pair.ship !== "trial-only");
}

function bestFace(wish: HeadingWish, adjectives: readonly string[], allow: (pair: TypePairing) => boolean): string | null {
  let bestName: string | null = null;
  let bestScore = -1;
  for (const pair of TYPE_LIBRARY) {
    if (!allow(pair)) continue;
    const roles = [
      { name: pair.display, clause: pair.rationale.split(/\band\b/i)[0] ?? pair.rationale },
      { name: pair.body, clause: pair.rationale.split(/\band\b/i)[1] ?? pair.rationale },
    ];
    for (const role of roles) {
      if (role.name.trim() === "" || faceKind(role.name) !== wish) continue;
      const score = scoreClause(role.clause, pair.tone, adjectives);
      if (score > bestScore) {
        bestScore = score;
        bestName = role.name;
      }
    }
  }
  return bestName;
}
