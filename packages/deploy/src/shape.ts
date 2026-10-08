/**
 * Static versus Node from `.hitchhiker/research/STACK-DECISION.md`.
 *
 * Astro and Vite upload built files. Next.js is a Node server unless the
 * record says static export. Astro SSR is a Node app. The file is the
 * stack record from the engine. This module does not choose a framework.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export const STACK_DECISION_RELATIVE = path.join(".hitchhiker", "research", "STACK-DECISION.md");

export type StackPick = "astro" | "next" | "vite-react" | "sveltekit";
export type SiteShape = "static" | "node";

export interface ShapeDecision {
  pick: StackPick;
  shape: SiteShape;
  outputDir: string;
  reason: string;
}

const PICKS: readonly StackPick[] = ["astro", "next", "vite-react", "sveltekit"];

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

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

function hasStaticSignal(markdown: string): boolean {
  return /\bstatic export\b/i.test(markdown)
    || /\badapter-static\b/i.test(markdown)
    || /\boutput:\s*['"]?export['"]?/i.test(markdown)
    || /\boutput:\s*['"]?static['"]?/i.test(markdown);
}

function hasServerSignal(markdown: string): boolean {
  return /\bssr\b/i.test(markdown)
    || /\badapter-node\b/i.test(markdown)
    || /\bserver mode\b/i.test(markdown)
    || /\boutput:\s*['"]?server['"]?/i.test(markdown);
}

function outputDir(pick: StackPick, shape: SiteShape): string {
  if (shape === "static") {
    if (pick === "next") return "out";
    if (pick === "sveltekit") return "build";
    return "dist";
  }
  if (pick === "next") return ".next";
  if (pick === "sveltekit") return "build";
  return "dist";
}

function decide(pick: StackPick, markdown: string): { shape: SiteShape; reason: string } {
  const staticSignal = hasStaticSignal(markdown);
  const serverSignal = hasServerSignal(markdown);
  if (staticSignal && serverSignal) {
    throw new Error("STACK-DECISION names both static output and a server.");
  }
  if (pick === "next") {
    if (staticSignal) {
      return { shape: "static", reason: "Next.js static export uploads the out directory." };
    }
    return { shape: "node", reason: "Next.js server output needs a Node app or the host serverless runtime." };
  }
  if (pick === "vite-react") {
    if (serverSignal) {
      return { shape: "node", reason: "The Vite record names a server render." };
    }
    return { shape: "static", reason: "Vite output uploads the dist directory." };
  }
  if (pick === "sveltekit") {
    if (staticSignal) {
      return { shape: "static", reason: "SvelteKit adapter-static uploads the build directory." };
    }
    return { shape: "node", reason: "SvelteKit server output needs a Node app or the host serverless runtime." };
  }
  if (serverSignal) {
    return { shape: "node", reason: "Astro SSR needs a Node app or the host serverless runtime." };
  }
  return { shape: "static", reason: "Astro static output uploads the dist directory." };
}

/** Parse the stack record. The caller already loaded the markdown. */
export function parseSiteShape(markdown: string): ShapeDecision {
  const normalized = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.includes("# STACK-DECISION")) {
    throw new Error("STACK-DECISION.md is missing the STACK-DECISION heading.");
  }
  const pickLine = section(normalized, "Pick").split("\n")[0]?.trim() ?? "";
  if (!isPick(pickLine)) {
    throw new Error("STACK-DECISION pick must be astro, next, vite-react, or sveltekit.");
  }
  const decision = decide(pickLine, normalized);
  return {
    pick: pickLine,
    shape: decision.shape,
    outputDir: outputDir(pickLine, decision.shape),
    reason: decision.reason,
  };
}

/** Read `.hitchhiker/research/STACK-DECISION.md` under the project. */
export async function readSiteShape(projectDir: string): Promise<ShapeDecision> {
  const file = path.join(projectDir, STACK_DECISION_RELATIVE);
  let markdown: string;
  try {
    markdown = await readFile(file, "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(`STACK-DECISION.md is missing at ${file}`);
    }
    throw error;
  }
  return parseSiteShape(markdown);
}
