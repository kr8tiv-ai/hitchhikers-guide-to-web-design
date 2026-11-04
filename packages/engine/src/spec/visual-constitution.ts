/**
 * VISUAL-CONSTITUTION.md is a short render of the locked DESIGN.md.
 * writeDesignLock is the only writer. A session edit fails design drift.
 * lintSlop lives in @hitchhiker/qa, which imports this package, so the
 * do-not lines are built from the same word, phrase, and hex lists lintSlop
 * uses, plus the prompt-ban line in prompt-bans.ts.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BANNED_PHRASES, BANNED_WORDS } from "../brand/voice.ts";
import { DENY_HEX } from "../brand/tokens.ts";
import { designSectionBody, designTokenTree, type DesignTokenNode } from "./design-md-lint.ts";
import { PROMPT_BAN_CONSTITUTION_LINE } from "./prompt-bans.ts";

export const VISUAL_CONSTITUTION_REL = "VISUAL-CONSTITUTION.md";

const BYTE_CAP = 1_200;
const DONT_CAP = 10;

interface Parts {
  brand: string[];
  fonts: string;
  colours: string;
  spacing: string;
  type: string;
  motion: string;
  signature: string[];
}

/** The constitution a lock would write for this DESIGN.md. */
export function renderVisualConstitution(markdown: string): string {
  const text = markdown.replace(/\r\n/g, "\n");
  const parts: Parts = {
    brand: brandLines(text),
    fonts: fontsLine(text),
    colours: coloursLine(text),
    spacing: spacingLine(text),
    type: typeLine(text),
    motion: motionLine(text),
    signature: signatureMoments(text),
  };
  return fitConstitution(parts, dontList(text));
}

/** Writes VISUAL-CONSTITUTION.md from the DESIGN.md already on disk. */
export function writeVisualConstitution(projectDir: string): string {
  const designPath = path.join(projectDir, "DESIGN.md");
  if (!existsSync(designPath)) throw new Error("DESIGN.md is missing.");
  const file = path.join(projectDir, VISUAL_CONSTITUTION_REL);
  writeFileSync(file, renderVisualConstitution(readFileSync(designPath, "utf8")), "utf8");
  return file;
}

/** File text for prompt builders. Empty when the lock has not written one. */
export function constitutionBlock(projectDir: string): string {
  const file = path.join(projectDir, VISUAL_CONSTITUTION_REL);
  if (!existsSync(file)) return "";
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function dontList(markdown: string): string[] {
  const own = brandDonts(designSectionBody(markdown, "Do's and Don'ts") ?? "");
  return [...own, ...patternDonts()];
}

function patternDonts(): string[] {
  return [
    "Do not use lorem, an exclamation mark, an em dash, or elevate as a verb.",
    `Do not use indigo, bg-gray-50, a centered max-w-7xl block, a purple gradient (${DENY_HEX.join(", ")}), a rainbow gradient, or a magnetic pointer.`,
    PROMPT_BAN_CONSTITUTION_LINE,
    "Do not leave an untracked TODO or an emoji in a heading.",
    `Do not use these phrases: ${BANNED_PHRASES.join("; ")}.`,
    `Do not use these words: ${BANNED_WORDS.join(", ")}.`,
  ];
}

function brandDonts(section: string): string[] {
  const found: string[] = [];
  let mode: "any" | "do" | "dont" = "any";
  for (const raw of section.split("\n")) {
    const text = raw.trim();
    if (text === "") continue;
    const bare = text.replace(/^[-*]\s+/, "").replace(/:$/, "").trim();
    if (/^don['’]ts?$/i.test(bare)) {
      mode = "dont";
      continue;
    }
    if (/^dos?$/i.test(bare)) {
      mode = "do";
      continue;
    }
    const line = text.replace(/^[-*]\s+/, "").trim();
    if (mode === "do") continue;
    if (mode === "dont" || /^(?:do not|don't|don’t|never|no)\b/i.test(line)) {
      found.push(clipBytes(line, 100));
    }
  }
  return found;
}

function brandLines(markdown: string): string[] {
  const body = designSectionBody(markdown, "Brand idea") ?? "";
  const raw = body.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  const sentences = raw.length <= 1
    ? raw.flatMap((line) => line.split(/(?<=\.)\s+/).map((part) => part.trim()).filter((part) => part !== ""))
    : raw;
  const kept = (sentences.length > 0 ? sentences : ["The page holds one clear idea."]).slice(0, 2);
  const first = clipBytes(kept[0] ?? "The page holds one clear idea.", 180);
  const second = kept[1] === undefined ? "" : clipBytes(kept[1], 120);
  return second === "" ? [first] : [first, second];
}

function fontsLine(markdown: string): string {
  const body = designSectionBody(markdown, "Typography") ?? "";
  const match = /Families:\s*([^\n]+)/.exec(body);
  let line = (match?.[1] ?? "").replace(/\s*Source:.*$/i, "").replace(/\.\s*$/, "").trim();
  if (line === "") {
    const typography = asMap(designTokenTree(markdown).typography);
    const display = familyOf(typography, "display");
    const bodyFamily = familyOf(typography, "body");
    if (display === "") return "not named";
    line = bodyFamily === "" || bodyFamily === display ? display : `${display} and ${bodyFamily}`;
  }
  return clipBytes(line, 100);
}

function coloursLine(markdown: string): string {
  const colors = asMap(designTokenTree(markdown).colors);
  if (colors === null) return "none named";
  const preferred = ["paper", "ink", "accent", "muted", "primary", "button", "onButton"];
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (name: string): void => {
    if (seen.has(name)) return;
    const node = colors[name];
    if (typeof node !== "string") return;
    const hex = /^#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(node.trim())?.[0];
    if (hex === undefined) return;
    seen.add(name);
    parts.push(`${name} ${hex}`);
  };
  for (const name of preferred) push(name);
  for (const name of Object.keys(colors)) push(name);
  if (parts.length === 0) return "none named";
  return clipBytes(parts.join(", "), 200);
}

function spacingLine(markdown: string): string {
  const parts: string[] = [];
  for (const raw of looseSection(markdown, "Spacing").split("\n")) {
    const match = /^-\s*(space-\d+)\s*:\s*(\d+px)\s*$/.exec(raw.trim());
    if (match?.[1] === undefined || match[2] === undefined) continue;
    parts.push(`${match[1]} ${match[2]}`);
  }
  if (parts.length === 0) return "space-1 4px through space-8 96px";
  return clipBytes(parts.join(", "), 140);
}

function typeLine(markdown: string): string {
  const body = designSectionBody(markdown, "Typography") ?? "";
  const ratio = /Ratio:\s*[^\n]+/.exec(body)?.[0]?.trim() ?? "Ratio: unnamed.";
  const roles: string[] = [];
  for (const name of ["display", "body", "heading", "title", "caption"]) {
    const bullet = new RegExp(`^- ${name}:\\s*([^\\n]+)`, "m").exec(body)?.[1] ?? "";
    const clamp = /clamp\(([\d.]+)rem,\s*[^,]+,\s*([\d.]+)rem\)/.exec(bullet);
    if (clamp?.[1] !== undefined && clamp[2] !== undefined) roles.push(`${name} ${clamp[1]}-${clamp[2]}rem`);
    else if (bullet !== "") roles.push(name);
  }
  const line = roles.length === 0 ? ratio : `${ratio} ${roles.join(", ")}.`;
  return clipBytes(line, 220);
}

function motionLine(markdown: string): string {
  const parts = looseSection(markdown, "Motion principles")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (parts.length === 0) return "Quiet motion with a designed hero.";
  return clipBytes(parts.join(" "), 160);
}

function signatureMoments(markdown: string): string[] {
  const lines = looseSection(markdown, "Signature techniques")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line !== "" && !/^any appropriate library may carry a technique/i.test(line));
  const kept = lines.slice(0, 3).map((line) => clipBytes(line, 110));
  return kept.length > 0 ? kept : ["A designed hero with a clear first frame."];
}

function fitConstitution(parts: Parts, donts: readonly string[]): string {
  let kept = donts.slice(0, DONT_CAP);
  let current = copyParts(parts);
  let text = renderConstitution(current, kept);
  while (byteLength(text) > BYTE_CAP && kept.length > 0) {
    kept = kept.slice(0, -1);
    text = renderConstitution(current, kept);
  }
  for (let guard = 0; byteLength(text) > BYTE_CAP && guard < 40; guard += 1) {
    const next = shrinkParts(current);
    if (sameParts(next, current)) break;
    current = next;
    text = renderConstitution(current, kept);
  }
  return text;
}

function renderConstitution(parts: Parts, donts: readonly string[]): string {
  const idea = parts.brand[0] ?? "The page holds one clear idea.";
  const brand = parts.brand.length > 1 ? [`Brand idea: ${idea}`, parts.brand[1] ?? ""] : [`Brand idea: ${idea}`];
  const lines = [
    "# Visual constitution",
    "",
    ...brand,
    "",
    `Fonts: ${parts.fonts}`,
    "",
    `Colours: ${parts.colours}`,
    "",
    `Spacing: ${parts.spacing}`,
    "",
    `Type: ${parts.type}`,
    "",
    `Motion: ${parts.motion}`,
    "",
    "Signature:",
    ...parts.signature.map((line) => `- ${line}`),
    "",
    "Do not:",
    ...donts.map((line) => `- ${line}`),
  ];
  return `${lines.join("\n")}\n`;
}

function shrinkParts(parts: Parts): Parts {
  const next = copyParts(parts);
  if (next.signature.length > 1) {
    next.signature = next.signature.slice(0, -1);
    return next;
  }
  if (next.brand.length > 1) {
    next.brand = next.brand.slice(0, 1);
    return next;
  }
  const fields = ["motion", "type", "colours", "spacing", "fonts"] as const;
  let longest: (typeof fields)[number] | null = null;
  let size = 24;
  for (const field of fields) {
    const length = byteLength(next[field]);
    if (length > size) {
      size = length;
      longest = field;
    }
  }
  if (longest !== null) {
    next[longest] = clipBytes(next[longest], Math.max(12, size - 24));
    return next;
  }
  const idea = next.brand[0];
  if (idea !== undefined && byteLength(idea) > 24) {
    next.brand = [clipBytes(idea, byteLength(idea) - 16)];
    return next;
  }
  const moment = next.signature[0];
  if (moment !== undefined && byteLength(moment) > 24) {
    next.signature = [clipBytes(moment, byteLength(moment) - 16)];
  }
  return next;
}

function copyParts(parts: Parts): Parts {
  return {
    brand: [...parts.brand],
    fonts: parts.fonts,
    colours: parts.colours,
    spacing: parts.spacing,
    type: parts.type,
    motion: parts.motion,
    signature: [...parts.signature],
  };
}

function sameParts(left: Parts, right: Parts): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function looseSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const target = heading.toLowerCase();
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^##\s+(.+?)\s*$/.exec(lines[index] ?? "");
    if (match?.[1]?.toLowerCase() === target) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return "";
  const rest: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) break;
    rest.push(lines[index] ?? "");
  }
  return rest.join("\n");
}

function familyOf(typography: { [key: string]: DesignTokenNode } | null, role: string): string {
  if (typography === null) return "";
  const node = asMap(typography[role]);
  if (node === null) return "";
  return typeof node.fontFamily === "string" ? node.fontFamily.trim() : "";
}

function asMap(node: DesignTokenNode | undefined): { [key: string]: DesignTokenNode } | null {
  if (typeof node !== "object" || node === null) return null;
  return node;
}

function clipBytes(text: string, maxBytes: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (byteLength(flat) <= maxBytes) return flat;
  let end = Math.min(flat.length, maxBytes);
  while (end > 0 && byteLength(flat.slice(0, end)) > maxBytes) end -= 1;
  const sliced = flat.slice(0, end);
  const word = sliced.replace(/\s+\S*$/, "").trim();
  return word === "" ? sliced.trim() : word;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}
