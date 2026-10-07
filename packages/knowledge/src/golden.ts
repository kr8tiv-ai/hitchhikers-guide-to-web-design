/**
 * Reads the three golden site-prompt templates. The caller passes the directory.
 * Shared site RULES stay in site-rules.ts. These files only name that path.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export interface GoldenTemplates {
  page: string;
  motion: string;
  qa: string;
}

export type GoldenName = keyof GoldenTemplates;

export const GOLDEN_CREDIT =
  "Method and prompt wording from Matt Haynes's AntiHero guides (antihero.community), used with permission.";

/** MotionLib names from packages/engine/src/spec/motion.ts. Kept here so this package does not import the engine. */
export const MOTION_LIB_NAMES = [
  "gsap",
  "lenis",
  "three",
  "ogl",
  "motion",
  "anime",
  "theatre",
  "css-scroll",
  "vanilla",
] as const;

const HEADINGS = ["Goal", "Files", "Steps", "must_haves", "Verify"] as const;

const MUST_HAVE_KEYS = ["truths:", "artifacts:", "key_links:", "prohibitions:"] as const;

const MATT_MARKERS = [
  "Add one section with real copy and layout. Motion comes later.",
  "No effects yet; motion comes in a later prompt.",
  "Use only brand fonts and colors.",
  "Open every page in a real browser and catch what broke.",
  "Motion must feel confident and quick but never bouncy",
  "make sure reduced motion gets a calm, complete version",
  "Reduced motion: everything is simply visible.",
  "Install Playwright as a dev dependency.",
  "fails on any console error or 404",
  "Confirm with git diff that the protected files are unchanged.",
] as const;

export function loadGolden(dir: string): GoldenTemplates {
  return {
    page: readFileSync(path.join(dir, "page.md"), "utf8"),
    motion: readFileSync(path.join(dir, "motion.md"), "utf8"),
    qa: readFileSync(path.join(dir, "qa.md"), "utf8"),
  };
}

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line !== undefined && line.trim() !== "") return line.trim();
  }
  return "";
}

function quotesMatt(text: string): boolean {
  const flat = flatten(text);
  return MATT_MARKERS.some((marker) => flat.includes(marker));
}

export function lintGolden(name: GoldenName, text: string): string[] {
  const problems: string[] = [];
  const flat = flatten(text);

  if (/act as a/i.test(text)) problems.push("slop starter: act as a");
  if (/ignore previous/i.test(text)) problems.push("slop starter: Ignore previous");
  if (text.includes("\u2014")) problems.push("em dash");
  if (text.includes("!")) problems.push("exclamation mark");
  if (wordCount(text) >= 900) problems.push("over 900 words");
  if (!text.includes("site-rules.ts")) problems.push("missing site-rules.ts");

  for (const heading of HEADINGS) {
    const pattern = new RegExp(`^#{1,6}[ \\t]+${heading}[ \\t]*\\r?$`, "m");
    if (!pattern.test(text)) problems.push(`missing heading ${heading}`);
  }

  for (const key of MUST_HAVE_KEYS) {
    if (!flat.includes(key)) problems.push(`missing ${key}`);
  }

  const hasCredit = flat.includes(GOLDEN_CREDIT);
  const creditLast = lastNonEmptyLine(text) === GOLDEN_CREDIT;
  if (!creditLast) {
    if (quotesMatt(text) && !hasCredit) problems.push("quotes Matt without the credit line");
    else if (quotesMatt(text)) problems.push("credit line is not last");
    else problems.push("missing credit line");
  }

  if (name === "page") {
    if (!/lorem/i.test(text)) problems.push("missing lorem ban");
    if (!/one section/i.test(text)) problems.push("missing one section");
    if (!text.includes("[headline]") || !text.includes("[copy]")) {
      problems.push("missing copy slots");
    }
    if (!flat.includes("No effects yet; motion comes in a later prompt.")) {
      problems.push("missing Matt section wording");
    }
  }

  if (name === "motion") {
    if (!text.includes("{{library}}")) problems.push("missing {{library}}");
    if (!text.includes("{{element}}")) problems.push("missing {{element}}");
    if (!/import only \{\{library\}\}/i.test(text)) problems.push("missing import only {{library}}");
    for (const lib of MOTION_LIB_NAMES) {
      if (!text.includes(`\`${lib}\``)) problems.push(`missing MotionLib \`${lib}\``);
    }
    if (!flat.includes("Motion must feel confident and quick but never bouncy")) {
      problems.push("missing Matt motion wording");
    }
  }

  if (name === "qa") {
    if (!text.includes("375")) problems.push("missing 375");
    if (!text.includes("1440")) problems.push("missing 1440");
    if (!flat.includes("real mobile")) problems.push("missing real mobile");
    if (!/axe/i.test(text)) problems.push("missing axe");
    if (!flat.includes("Lighthouse mobile 90")) problems.push("missing Lighthouse mobile 90");
    if (!/zero console errors/i.test(text)) problems.push("missing zero console errors");
    if (!flat.includes("Install Playwright as a dev dependency.")) {
      problems.push("missing Matt QA wording");
    }
  }

  return problems;
}
