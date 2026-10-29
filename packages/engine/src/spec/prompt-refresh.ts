/**
 * Rewrite the engine-owned parts of a prompt file from the current engine.
 * Task text, the files list, requirement ids, and owner edits outside those
 * blocks stay. A block that cannot be bounded is left alone.
 */

import {
  DESIGN_EXAMPLE_LINE,
  DESIGN_FRAMING,
  DESIGN_REMIX_DETAIL,
  DESIGN_REMIX_LINE,
  NO_ART_DIRECTION_NOTE,
} from "./design-language.ts";
import { MISSING_FACT_RULE, SITE_RULES } from "./site-rules.ts";

export type PromptRefreshResult =
  | { ok: true; text: string; changed: boolean }
  | { ok: false; reason: string };

const STALE_FACT_SOURCE =
  "If a fact is missing, mark it TODO\\.?|A missing fact (?:stays|is) a TODO in copy\\.?|(?:still|stays) a TODO in copy\\.?";

const RULES_BLOCK = /^## Rules[ \t]*\n[\s\S]*?(?=^## )/m;

/** Refresh one prompt's engine-owned blocks. Does not read the disk. */
export function refreshEnginePromptText(original: string): PromptRefreshResult {
  const newline = original.endsWith("\r\n") ? "\r\n" : "\n";
  const text = original.replace(/\r\n/g, "\n");
  if (!/^## Rules[ \t]*$/m.test(text)) return { ok: true, text: original, changed: false };
  if (!RULES_BLOCK.test(text)) return { ok: false, reason: "The Rules block has no following heading." };
  let changed = false;
  let next = text.replace(RULES_BLOCK, (block) => {
    const replacement = `## Rules\n\n${SITE_RULES}\n\n`;
    if (block !== replacement) changed = true;
    return replacement;
  });
  next = next.replace(/^Acceptance:[^\n]*$/gm, (line) => {
    const updated = replaceStaleFacts(line);
    if (updated !== line) changed = true;
    return updated;
  });
  const designed = replaceDesignBlock(next);
  if (designed === null) return { ok: false, reason: "The Design language block could not be bounded." };
  if (designed !== next) changed = true;
  next = designed;
  if (!changed) return { ok: true, text: original, changed: false };
  const rendered = newline === "\n" ? next : next.replace(/\n/g, newline);
  return { ok: true, text: rendered, changed: rendered !== original };
}

function replaceDesignBlock(text: string): string | null {
  const matches = text.match(/^## Design language[ \t]*$/gm);
  if (matches === null) return text;
  if (matches.length !== 1) return null;
  const start = text.search(/^## Design language[ \t]*$/m);
  if (start === -1) return text;
  const rest = text.slice(start);
  const lineBreak = rest.indexOf("\n");
  if (lineBreak === -1) return null;
  const afterHeading = rest.slice(lineBreak + 1);
  const nextHeading = afterHeading.search(/^## /m);
  const end = nextHeading === -1 ? text.length : start + lineBreak + 1 + nextHeading;
  const updated = refreshDesignBlock(text.slice(start, end));
  if (updated === null) return text;
  return text.slice(0, start) + updated + text.slice(end);
}

function replaceStaleFacts(line: string): string {
  const regex = new RegExp(STALE_FACT_SOURCE, "gi");
  if (!regex.test(line)) return line;
  let once = false;
  const next = line.replace(new RegExp(STALE_FACT_SOURCE, "gi"), () => {
    if (once) return "";
    once = true;
    return MISSING_FACT_RULE;
  });
  return next.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, "").replace(/\s+\./g, ".");
}

function refreshDesignBlock(block: string): string | null {
  const heading = /^## Design language[ \t]*\n/.exec(block);
  if (heading === null) return null;
  const body = block.slice(heading[0].length);
  const markerAt = body.search(/^### /m);
  const recognizable =
    markerAt !== -1 ||
    body.includes("This is direction and vocabulary") ||
    body.includes("Take the thinking") ||
    body.includes("### Art direction") ||
    body.includes("### Example") ||
    body.includes("### Gates");
  if (!recognizable) return null;
  const preamble = markerAt === -1 ? body : body.slice(0, markerAt);
  const rest = markerAt === -1 ? "" : body.slice(markerAt);
  const rebuilt = rebuildPreamble(preamble);
  const refreshedRest = rest
    .split("\n")
    .map((line) => {
      if (line.trim().startsWith("The golden template below is an example")) return DESIGN_EXAMPLE_LINE;
      return replaceStaleFacts(line);
    })
    .join("\n");
  const tail = refreshedRest.replace(/^\n+/, "");
  const head = rebuilt.replace(/\n+$/, "");
  return tail === "" ? `## Design language\n\n${head}\n` : `## Design language\n\n${head}\n\n${tail}`;
}

function rebuildPreamble(preamble: string): string {
  const kept: string[] = [];
  let missingArt = false;
  for (const line of preamble.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed === NO_ART_DIRECTION_NOTE || trimmed.startsWith("No art direction:")) {
      missingArt = true;
      continue;
    }
    if (isEnginePreambleLine(trimmed)) continue;
    kept.push(trimmed);
  }
  const lines = [
    ...(missingArt ? [NO_ART_DIRECTION_NOTE, ""] : []),
    DESIGN_FRAMING,
    "",
    DESIGN_REMIX_LINE,
    DESIGN_REMIX_DETAIL,
    ...(kept.length > 0 ? ["", ...kept] : []),
  ];
  return lines.join("\n");
}

function isEnginePreambleLine(line: string): boolean {
  if (line === DESIGN_FRAMING || line === DESIGN_REMIX_LINE || line === DESIGN_REMIX_DETAIL) return true;
  if (line.startsWith("This is direction and vocabulary")) return true;
  if (line.startsWith("Take the thinking")) return true;
  if (line.startsWith("These are inspiration")) return true;
  return false;
}
