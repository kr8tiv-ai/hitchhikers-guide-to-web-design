/**
 * Stack pick for a brief plan. Hosting and Features decide it.
 * An existing `.hitchhiker/research/STACK-DECISION.md` wins and is not rewritten.
 *
 * Vite or a React SPA wins when both kinds of phrase are present, because a
 * named SPA is the narrower choice. Otherwise Next.js, a React app, a server,
 * or accounts selects next. Anything else stays astro.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BriefAnswer } from "./brief-plan.ts";
import type { StackDecision, StackPick } from "./stack.ts";

const PICKS = ["astro", "next", "vite-react", "sveltekit"] as const;

/** DP-9.2 and DP-3.7, the same ids BRIEF_SOURCES uses for hosting and features. */
const HOSTING_IDS = new Set(["DP-9.2", "hosting"]);
const FEATURE_IDS = new Set(["DP-3.7", "features"]);
const SKIPPED = new Set(["SKIPPED", "NOT_APPLICABLE", "UNANSWERED"]);

const VITE_SIGNAL = /\bvite\b|react\s+spa/i;
const NEXT_SIGNAL = /next\.?\s*js|react\s+app|\bserver\b|\baccounts\b/i;

const VERSIONS =
  "Framework and library versions are not pinned in this record. When the site is created, re-resolve at install from the registry.";

function isPick(value: string): value is StackPick {
  return (PICKS as readonly string[]).includes(value);
}

function section(markdown: string, heading: string): string {
  const marker = new RegExp(`^## ${heading}\\s*$`, "m").exec(markdown);
  if (marker === null) return "";
  const rest = markdown.slice(marker.index + marker[0].length);
  const next = /^## /m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

function normalize(markdown: string): string {
  return markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stackFile(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "research", "STACK-DECISION.md");
}

function corpus(briefMarkdown: string, answers: readonly BriefAnswer[]): string {
  const parts = [section(briefMarkdown, "Hosting"), section(briefMarkdown, "Features")];
  for (const answer of answers) {
    if (SKIPPED.has(answer.status ?? "")) continue;
    if (!HOSTING_IDS.has(answer.id) && !FEATURE_IDS.has(answer.id)) continue;
    const value = answer.value.trim();
    if (value === "") continue;
    parts.push(value);
  }
  return parts.join("\n");
}

function blurb(pick: StackPick): string {
  switch (pick) {
    case "astro":
      return "Astro. Default when Hosting and Features do not name a stack.";
    case "next":
      return "Next.js. A React app, a server, or accounts.";
    case "vite-react":
      return "Vite plus React. A Vite build or a React SPA.";
    case "sveltekit":
      return "SvelteKit. Only when an existing record already names it.";
    default: {
      const neverPick: never = pick;
      return String(neverPick);
    }
  }
}

function alternatives(pick: StackPick): string {
  const lines: string[] = [];
  for (const id of PICKS) {
    if (id === pick) continue;
    lines.push(`- ${id}: ${blurb(id)}`);
  }
  return lines.join("\n");
}

function whyFor(pick: StackPick): string {
  switch (pick) {
    case "next":
      return "Hosting or Features names Next.js, a React app, a server, or accounts. The pick is next.";
    case "vite-react":
      return "Hosting or Features names Vite or a React SPA. The pick is vite-react.";
    case "sveltekit":
      return "An existing record names SvelteKit. The pick is sveltekit.";
    case "astro":
      return "Hosting and Features do not name another stack. The pick is astro.";
    default: {
      const neverPick: never = pick;
      return String(neverPick);
    }
  }
}

function render(pick: StackPick): string {
  return [
    "# STACK-DECISION",
    "",
    "## Pick",
    "",
    pick,
    "",
    "## Why",
    "",
    whyFor(pick),
    "",
    "## Alternatives",
    "",
    alternatives(pick),
    "",
    "## What would change this",
    "",
    "A Vite or React SPA answer selects vite-react. A Next.js, React app, server, or accounts answer selects next. When neither is present, the pick stays astro. An existing record is kept.",
    "",
    "## Versions",
    "",
    VERSIONS,
    "",
  ].join("\n");
}

function keptDecision(markdown: string): StackDecision | null {
  const normalized = normalize(markdown);
  if (!normalized.includes("# STACK-DECISION")) return null;
  const pickLine = section(normalized, "Pick").split("\n")[0]?.trim() ?? "";
  if (!isPick(pickLine)) return null;
  return { pick: pickLine, markdown, insisted: true };
}

/** Choose astro, next, or vite-react from the Hosting and Features text. */
export function decideStack(briefMarkdown: string, answers: readonly BriefAnswer[] = []): StackDecision {
  const text = corpus(typeof briefMarkdown === "string" ? briefMarkdown : "", answers);
  let pick: StackPick = "astro";
  if (VITE_SIGNAL.test(text)) pick = "vite-react";
  else if (NEXT_SIGNAL.test(text)) pick = "next";
  return { pick, markdown: render(pick), insisted: pick !== "astro" };
}

/**
 * Write the record when the project does not have one.
 * A file that is already there is returned unchanged, including its pick.
 */
export function writeStackDecision(projectDir: string, decision: StackDecision): StackDecision {
  const file = stackFile(projectDir);
  if (existsSync(file)) {
    try {
      const kept = keptDecision(readFileSync(file, "utf8"));
      if (kept !== null) return kept;
    } catch {
      return decision;
    }
    return decision;
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const markdown = decision.markdown.endsWith("\n") ? decision.markdown : `${decision.markdown}\n`;
  writeFileSync(file, markdown, "utf8");
  return markdown === decision.markdown ? decision : { ...decision, markdown };
}
