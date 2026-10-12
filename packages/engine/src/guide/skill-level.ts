/**
 * DP-0.3 answer to a skill level.
 * Lowest is beginner. The tree glosses that level as explain.
 * A site builder stays intermediate. Designing stays pro. Writing the code stays developer.
 * Technical vocabulary moving a level up, and two asks about a term moving it down, are not decided here.
 */

export const SKILL_LEVELS = ["beginner", "intermediate", "pro", "developer"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

const OPTIONS: ReadonlyArray<{ text: string; level: SkillLevel }> = [
  { text: "I design how it looks, but someone else builds it.", level: "pro" },
  {
    text: "I build pages myself in a site builder like Wix, Squarespace or Webflow.",
    level: "intermediate",
  },
  { text: "I write the code myself (HTML, CSS, JavaScript).", level: "developer" },
  { text: "I'm brand new to all of this.", level: "beginner" },
];

const LEGACY: ReadonlyArray<{ text: string; level: SkillLevel }> = [
  { text: "design or build sites", level: "pro" },
  { text: "write code", level: "developer" },
  { text: "used a site builder", level: "intermediate" },
  { text: "new to it", level: "beginner" },
];

const LABELS = ["(a) ", "(b) ", "(c) ", "(d) ", "a) ", "b) ", "c) ", "d) ", "a. ", "b. ", "c. ", "d. "] as const;

/** The closest skill level for a DP-0.3 answer. An empty or unknown answer stays at beginner. */
export function classifyHandsOn(answer: string): SkillLevel {
  const text = normalize(answer);
  const exact = matchExact(text) ?? matchExact(stripLabel(text));
  if (exact !== null) return exact;
  return matchPhrase(text) ?? "beginner";
}

function matchExact(text: string): SkillLevel | null {
  for (const option of OPTIONS) {
    if (text === normalize(option.text)) return option.level;
  }
  for (const legacy of LEGACY) {
    if (text === legacy.text || text === `${legacy.text}.`) return legacy.level;
  }
  return null;
}

function matchPhrase(text: string): SkillLevel | null {
  let hit: SkillLevel | null = null;
  for (const option of OPTIONS) {
    if (text.indexOf(normalize(option.text)) === -1) continue;
    if (hit !== null && hit !== option.level) return null;
    hit = option.level;
  }
  if (hit !== null) return hit;
  if (text.indexOf("design or build") !== -1) return "pro";
  if (text.indexOf("write the code") !== -1 || text.indexOf("write code") !== -1) return "developer";
  if (text.indexOf("site builder") !== -1) return "intermediate";
  if (
    text.indexOf("brand new") !== -1 ||
    text.indexOf("new to it") !== -1 ||
    text.indexOf("new to all of this") !== -1
  ) {
    return "beginner";
  }
  return null;
}

function stripLabel(text: string): string {
  for (const label of LABELS) {
    if (text.startsWith(label)) return text.slice(label.length);
  }
  return text;
}

function normalize(value: string): string {
  let out = "";
  let pendingSpace = false;
  const lower = value.toLowerCase().replaceAll("\u2019", "'");
  for (const ch of lower) {
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") {
      pendingSpace = out !== "";
      continue;
    }
    if (pendingSpace) {
      out += " ";
      pendingSpace = false;
    }
    out += ch;
  }
  return out;
}
