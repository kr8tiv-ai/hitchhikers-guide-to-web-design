/**
 * research/STACK-DECISION.md, returned as markdown. The caller writes the file.
 *
 * Precedence, from CONTEXT-PACKAGE.v2.md §10.4:
 * 1. A known userOverride wins, and insisted is true.
 * 2. Motion level 10 is a single-page world: vite-react.
 *    It beats an app site type and a persistent canvas.
 *    The world is the harder constraint.
 * 3. Site type `app`, or a persistent canvas across routes, at levels 1 to 9: next.
 *    A canvas at level 9 stays on Next.js. It does not become vite-react.
 *    Astro is the pick when the site type is not app and there is no canvas.
 * 4. Otherwise astro, including commerce site types.
 *    Inventory-heavy commerce escalates. It does not change the site stack.
 *
 * Versions are not pinned. Research 06 (2026-10-05) is a baseline label, not a pin.
 * D-001 asks the record to carry pinned toolkit versions. This prompt forbids a pin
 * that was not resolved from a registry in this session, so the toolkit is named
 * and the versions say re-resolve at install.
 */

export type StackPick = "astro" | "next" | "vite-react" | "sveltekit";

export interface StackDecision {
  pick: StackPick;
  markdown: string;
  insisted: boolean;
}

export class StackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StackError";
  }
}

const PICKS = ["astro", "next", "vite-react", "sveltekit"] as const;

const COMMERCE_NOTE =
  "Inventory-heavy commerce escalates. It does not change the site stack by itself.";

const VERSIONS = [
  "Framework and library versions are not pinned in this record.",
  "When the site is created, re-resolve at install from the registry.",
  "The research 06 baseline label is 2026-10-05, and it is not a pin.",
].join(" ");

const TOOLKIT = [
  "Generated sites still ship the full motion toolkit and choose one library per effect:",
  "GSAP with ScrollTrigger and SplitText, Three.js, raw WebGL and GLSL, Motion, anime.js,",
  "Theatre.js core, Lenis, CSS scroll-driven animations, and vanilla JS.",
  "One scroll source of truth is Lenis driving ScrollTrigger, and one render loop is shared",
  "by Three.js, Theatre.js core, and raw WebGL, when those effects are chosen.",
  "Reduced motion and mobile budgets still apply.",
].join(" ");

function isPick(value: unknown): value is StackPick {
  return value === "astro" || value === "next" || value === "vite-react" || value === "sveltekit";
}

function label(pick: StackPick): string {
  switch (pick) {
    case "astro":
      return "Astro";
    case "next":
      return "Next.js";
    case "vite-react":
      return "Vite plus React";
    case "sveltekit":
      return "SvelteKit";
    default: {
      const neverPick: never = pick;
      throw new StackError(`Unknown stack pick "${String(neverPick)}".`);
    }
  }
}

function blurb(pick: StackPick): string {
  switch (pick) {
    case "astro":
      return "Default for brand, marketing, portfolio, and content sites in the motion band from 1 to 9.";
    case "next":
      return "Fits an app-style site type, or one persistent canvas across routes, below a level-10 world.";
    case "vite-react":
      return "Fits a single-page world at motion level 10.";
    case "sveltekit":
      return "Only when the user insists. The 3D ecosystem is thinner.";
    default: {
      const neverPick: never = pick;
      throw new StackError(`Unknown stack pick "${String(neverPick)}".`);
    }
  }
}

function cleanSiteType(value: unknown): string {
  if (typeof value !== "string") {
    throw new StackError("siteType must be a string.");
  }
  return value.replace(/[\r\n]+/g, " ").trim();
}

function cleanLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new StackError("motionLevel must be an integer from 1 to 10.");
  }
  return value;
}

function cleanCanvas(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new StackError("persistentCanvas must be a boolean.");
  }
  return value;
}

function cleanOverride(value: unknown): StackPick | null {
  if (value === undefined || value === null) return null;
  if (isPick(value)) return value;
  const shown = typeof value === "string" ? value : typeof value;
  throw new StackError(
    `Unknown stack override "${shown}". Known picks: astro, next, vite-react, sveltekit.`,
  );
}

function shownSite(siteType: string): string {
  const cleaned = siteType.replace(/!/g, "").trim();
  return cleaned.length === 0 ? "unset" : cleaned;
}

/** Astro, unless the site is an app, a persistent canvas, or a level-10 world. */
function heuristic(siteType: string, motionLevel: number, persistentCanvas: boolean): StackPick {
  if (motionLevel === 10) return "vite-react";
  if (siteType === "app" || persistentCanvas) return "next";
  return "astro";
}

function why(input: {
  pick: StackPick;
  siteType: string;
  motionLevel: number;
  persistentCanvas: boolean;
  heuristicPick: StackPick;
  insisted: boolean;
}): string[] {
  const lines: string[] = [];
  const site = shownSite(input.siteType);

  if (input.insisted) {
    lines.push(
      `The user insisted on ${label(input.pick)} (${input.pick}). The override wins over the heuristic, which would have chosen ${label(input.heuristicPick)} (${input.heuristicPick}).`,
    );
    if (input.pick === "sveltekit") {
      lines.push("SvelteKit is the pick only because the user insisted. The 3D ecosystem is thinner.");
    }
  } else if (input.motionLevel === 10) {
    if (input.siteType === "app") {
      lines.push(
        "Level 10 and site type app: Vite plus React wins because the world is the harder constraint.",
      );
    } else {
      lines.push(
        `Vite plus React is the pick because motion level 10 is a single-page world. The site type is ${site}.`,
      );
    }
    if (input.persistentCanvas) {
      lines.push(
        "Level 10 still selects Vite plus React when a persistent canvas is set. The world is the harder constraint. A persistent canvas at level 9 would stay on Next.js.",
      );
    }
  } else if (input.pick === "next") {
    const because: string[] = [];
    if (input.siteType === "app") because.push("the site type is app");
    if (input.persistentCanvas) because.push("a persistent canvas runs across routes");
    if (because.length === 0) {
      throw new StackError("Next.js was selected without an app site type or a persistent canvas.");
    }
    lines.push(
      `Next.js is the pick because ${because.join(" and ")}. Motion level ${input.motionLevel} stays on Next.js.`,
    );
    if (input.persistentCanvas && input.motionLevel === 9) {
      lines.push(
        "A persistent canvas at level 9 stays on Next.js. Astro remains the pick for a non-app site with no persistent canvas. Level 10 still selects Vite plus React.",
      );
    }
  } else {
    lines.push(
      `Astro is the default marketing stack. The site type is ${site}, motion level ${input.motionLevel} is in the 1 to 9 band, and there is no persistent canvas across routes.`,
    );
  }

  lines.push(`${COMMERCE_NOTE} This record does not select Shopify.`);
  lines.push(TOOLKIT);
  return lines;
}

function alternatives(pick: StackPick): string[] {
  const lines: string[] = [];
  for (const id of PICKS) {
    if (id === pick) continue;
    lines.push(`- ${id}: ${label(id)}. ${blurb(id)}`);
  }
  return lines;
}

function changeText(pick: StackPick): string {
  return [
    `The current pick is ${pick}.`,
    "A persistent canvas across routes selects Next.js when the level stays below 10.",
    "Choosing motion level 10 selects Vite plus React, including over an app site type, because the world is the harder constraint.",
    "An app-style site type selects Next.js when motion level 10 is not already the world.",
    "A user override of astro, next, vite-react, or sveltekit replaces the heuristic. SvelteKit is not the default.",
  ].join("\n\n");
}

function render(pick: StackPick, whyLines: readonly string[]): string {
  return [
    "# STACK-DECISION",
    "",
    "## Pick",
    "",
    pick,
    "",
    "## Why",
    "",
    whyLines.join("\n\n"),
    "",
    "## Alternatives",
    "",
    alternatives(pick).join("\n"),
    "",
    "## What would change this",
    "",
    changeText(pick),
    "",
    "## Versions",
    "",
    VERSIONS,
    "",
  ].join("\n");
}

export function decideStack(input: {
  siteType: string;
  motionLevel: number;
  persistentCanvas: boolean;
  userOverride?: StackPick | null;
}): StackDecision {
  const siteType = cleanSiteType(input.siteType);
  const motionLevel = cleanLevel(input.motionLevel);
  const persistentCanvas = cleanCanvas(input.persistentCanvas);
  const override = cleanOverride(input.userOverride);
  const heuristicPick = heuristic(siteType, motionLevel, persistentCanvas);
  const insisted = override !== null;
  const pick = override ?? heuristicPick;
  const markdown = render(
    pick,
    why({
      pick,
      siteType,
      motionLevel,
      persistentCanvas,
      heuristicPick,
      insisted,
    }),
  );
  if (markdown.includes("!") || markdown.includes("\r")) {
    throw new StackError("Stack decision markdown contained a forbidden mark.");
  }
  return { pick, markdown, insisted };
}
