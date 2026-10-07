/**
 * MOTION.md picker. planMotion is the source of the file. The caller writes it.
 *
 * One library owns each effect. Appetite is a weight ceiling (v2 §8.3).
 * It does not remove a library from the Guide toolkit line.
 * The stack argument is a decideStack pick.
 *
 * Assumptions, recorded because the session note and the typed interface differ:
 * - EffectRequest is the typed shape (id, kind, element, page). There is no
 *   per-effect level. Appetite is the ceiling.
 * - Preview family ids (three-hero, cinematic, spring-ui) alias the prompt
 *   kinds 3d, cinematic-timeline, and react-island.
 * - A light-reveal-only page stays on native CSS scroll at any appetite.
 *   Lenis starts at appetite 3 when the page has any other effect, unless an
 *   explicit css-scroll effect is also present, which throws.
 * - Theatre's pin is @theatre/core@0.7.2 from v2 §15.1. Studio is never named
 *   in the generated markdown.
 */

import type { StackPick } from "./stack.ts";

export type MotionLib =
  | "gsap"
  | "lenis"
  | "three"
  | "ogl"
  | "motion"
  | "anime"
  | "theatre"
  | "css-scroll"
  | "vanilla";

export const MOTION_LIBS: readonly MotionLib[] = [
  "gsap",
  "lenis",
  "three",
  "ogl",
  "motion",
  "anime",
  "theatre",
  "css-scroll",
  "vanilla",
];

export interface EffectRequest {
  id: string;
  kind: string;
  element: string;
  page: string;
}

export type ScrollOwner = "lenis+scrolltrigger" | "native" | "none";

export interface MotionPlan {
  scrollOwner: Record<string, ScrollOwner>;
  assignments: Array<{ id: string; library: MotionLib; element: string }>;
  warnings: string[];
  markdown: string;
}

export interface MotionRow {
  id: string;
  library: MotionLib;
  element: string;
  page: string;
  kind: string;
  taxonomy: string;
  note: string;
}

export class MotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MotionError";
  }
}

export class CoexistenceError extends MotionError {
  constructor(message: string) {
    super(message);
    this.name = "CoexistenceError";
  }
}

type CanonicalKind =
  | "tiny-fade"
  | "light-reveal"
  | "css-scroll"
  | "react-island"
  | "smooth-scroll"
  | "text-split"
  | "scroll-sequence"
  | "svg-stagger"
  | "shader"
  | "3d"
  | "cinematic-timeline";

interface KindSpec {
  taxonomy: readonly string[];
  minLevel: number;
}

const KIND_SPEC: Record<CanonicalKind, KindSpec> = {
  "tiny-fade": { taxonomy: ["H1", "H2", "H3"], minLevel: 1 },
  "light-reveal": { taxonomy: ["A2", "A5"], minLevel: 2 },
  "css-scroll": { taxonomy: ["A2"], minLevel: 1 },
  "react-island": { taxonomy: ["D5", "D4"], minLevel: 2 },
  "smooth-scroll": { taxonomy: ["A1"], minLevel: 3 },
  "text-split": { taxonomy: ["B1", "B2", "B3", "B4"], minLevel: 3 },
  "scroll-sequence": {
    taxonomy: ["A3", "A4", "A6", "A7", "C1", "C2", "C3", "D1", "D6"],
    minLevel: 5,
  },
  "svg-stagger": { taxonomy: ["E1", "E2", "E3", "E4", "E5"], minLevel: 5 },
  shader: { taxonomy: ["F1", "B5", "D3", "G3"], minLevel: 6 },
  "3d": { taxonomy: ["F3", "A8", "F2", "F4", "F5", "F6", "F7", "G1", "G2"], minLevel: 8 },
  "cinematic-timeline": { taxonomy: ["C4", "A8"], minLevel: 9 },
};

const ALIASES: Readonly<Record<string, CanonicalKind>> = {
  "tiny-fade": "tiny-fade",
  "light-reveal": "light-reveal",
  "css-scroll": "css-scroll",
  "react-island": "react-island",
  "spring-ui": "react-island",
  "smooth-scroll": "smooth-scroll",
  "text-split": "text-split",
  "scroll-sequence": "scroll-sequence",
  "svg-stagger": "svg-stagger",
  shader: "shader",
  "3d": "3d",
  "three-hero": "3d",
  "cinematic-timeline": "cinematic-timeline",
  cinematic: "cinematic-timeline",
};

const BANNED_KINDS = new Set(["magnetic", "magnetic-button", "D2", "d2"]);

const THEATRE_NOTE = "`@theatre/core` pinned at 0.7.2, never studio.";
const STILL_NOTE = "phone still or prerender";
const STACKS: readonly StackPick[] = ["astro", "next", "vite-react", "sveltekit"];

interface ResolvedRequest {
  id: string;
  kind: CanonicalKind;
  element: string;
  page: string;
  taxonomy: string;
}

interface AssignContext {
  pageIsLenis: boolean;
  hasSequence: boolean;
  threeAssigned: boolean;
  appetite: number;
  stack: StackPick;
  allowHeavy: boolean;
  warnings: string[];
}

function assertNever(value: never): never {
  throw new MotionError(`Unknown effect kind "${String(value)}".`);
}

function cleanAppetite(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
    throw new MotionError("Appetite must be an integer from 1 to 10.");
  }
  return value;
}

function cleanStack(value: unknown): StackPick {
  if (typeof value === "string" && (STACKS as readonly string[]).includes(value)) {
    return value as StackPick;
  }
  const shown = typeof value === "string" ? value : typeof value;
  throw new MotionError(`Unknown stack "${shown}". Known picks: astro, next, vite-react, sveltekit.`);
}

function cleanToken(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new MotionError(`Effect ${field} must be a string.`);
  }
  const trimmed = value.replace(/[\r\n]+/g, " ").trim();
  if (trimmed.length === 0) {
    throw new MotionError(`Effect ${field} must not be empty.`);
  }
  if (trimmed.includes("!") || trimmed.includes("\u2014")) {
    throw new MotionError(`Effect ${field} cannot contain an exclamation mark or an em dash.`);
  }
  return trimmed;
}

function cleanRequest(raw: EffectRequest): EffectRequest {
  if (raw === null || typeof raw !== "object") {
    throw new MotionError("Each effect request must be an object.");
  }
  return {
    id: cleanToken(raw.id, "id"),
    kind: cleanToken(raw.kind, "kind"),
    element: cleanToken(raw.element, "element"),
    page: cleanToken(raw.page, "page"),
  };
}

function resolveKind(kind: string): CanonicalKind {
  if (BANNED_KINDS.has(kind)) {
    throw new MotionError("Magnetic buttons are banned.");
  }
  const canonical = ALIASES[kind];
  if (canonical === undefined) {
    throw new MotionError(`Unknown effect kind "${kind}".`);
  }
  return canonical;
}

function taxonomyOf(kind: CanonicalKind): string {
  const spec = KIND_SPEC[kind];
  return spec.taxonomy.join(", ");
}

function minLevel(kind: CanonicalKind): number {
  return KIND_SPEC[kind].minLevel;
}

function drivesLenis(kind: CanonicalKind): boolean {
  return kind !== "light-reveal" && kind !== "css-scroll";
}

function warnCeiling(request: ResolvedRequest, appetite: number, allowHeavy: boolean, warnings: string[]): void {
  if (allowHeavy || appetite >= minLevel(request.kind)) return;
  if (request.kind === "3d" || request.kind === "smooth-scroll") return;
  if (request.kind === "light-reveal" || request.kind === "css-scroll") return;
  warnings.push(
    `${request.id} (${request.kind}) is above appetite ${appetite}. That effect starts at level ${minLevel(request.kind)}. Appetite is a weight ceiling.`,
  );
}

function assignReactIsland(request: ResolvedRequest, stack: StackPick, warnings: string[]): MotionRow {
  if (stack === "next" || stack === "vite-react") {
    return row(request, "motion", "Motion owns this React island.");
  }
  if (stack === "sveltekit") {
    warnings.push(
      `${request.id} on ${request.page} is a react-island on sveltekit, so GSAP owns it. The 3D ecosystem is thinner.`,
    );
    return row(request, "gsap", "GSAP owns this effect on sveltekit.");
  }
  warnings.push(
    `${request.id} on ${request.page} is a react-island on astro, so GSAP owns it. Motion is for React islands on next or vite-react.`,
  );
  return row(request, "gsap", "GSAP owns this effect on astro.");
}

function row(request: ResolvedRequest, library: MotionLib, note: string): MotionRow {
  return {
    id: request.id,
    library,
    element: request.element,
    page: request.page,
    kind: request.kind,
    taxonomy: request.taxonomy,
    note,
  };
}

function assignOne(request: ResolvedRequest, ctx: AssignContext): MotionRow {
  warnCeiling(request, ctx.appetite, ctx.allowHeavy, ctx.warnings);
  switch (request.kind) {
    case "light-reveal": {
      if (ctx.pageIsLenis || ctx.hasSequence) {
        const where = ctx.pageIsLenis ? "a Lenis page" : "a ScrollTrigger page";
        return row(request, "gsap", `Light reveal uses GSAP on ${where}.`);
      }
      return row(request, "css-scroll", "CSS scroll-driven animation on the native scroller.");
    }
    case "css-scroll":
      return row(request, "css-scroll", "Native CSS scroll-driven animation. Lenis is not assigned on this page.");
    case "scroll-sequence":
      return row(request, "gsap", "GSAP ScrollTrigger owns this scroll-linked sequence.");
    case "text-split":
      return row(request, "gsap", "GSAP SplitText owns this headline split.");
    case "tiny-fade":
      return row(request, "vanilla", "One opacity change.");
    case "svg-stagger":
      return row(request, "anime", "anime.js owns this SVG stagger. GSAP does not also own the element.");
    case "smooth-scroll": {
      if (ctx.appetite >= 3 && ctx.pageIsLenis) {
        return row(request, "lenis", "Lenis owns smooth scroll and drives ScrollTrigger on gsap.ticker.");
      }
      ctx.warnings.push(
        `${request.id} on ${request.page} asks for smooth scroll below appetite 3. Owner: vanilla.`,
      );
      return row(request, "vanilla", "Native scroll. Smooth scroll starts at appetite 3.");
    }
    case "shader": {
      if (ctx.threeAssigned) {
        ctx.warnings.push(
          `${request.id} on ${request.page} stays on three. One WebGL context.`,
        );
        return row(request, "three", "Shader stays on three. One WebGL context.");
      }
      return row(request, "ogl", "OGL owns this shader. Three is not assigned on the page.");
    }
    case "3d": {
      if (ctx.appetite >= 8 || ctx.allowHeavy) {
        return row(request, "three", "Three.js owns this 3D moment in the one WebGL context.");
      }
      ctx.warnings.push(
        `${request.id} on ${request.page} is a 3d effect above appetite ${ctx.appetite} (a 3D moment starts at level 8). ${STILL_NOTE}. Owner: vanilla.`,
      );
      return row(request, "vanilla", STILL_NOTE);
    }
    case "cinematic-timeline": {
      if (ctx.threeAssigned) {
        ctx.warnings.push(
          `${request.id} on ${request.page} plays on the shared ticker. One WebGL context.`,
        );
      }
      return row(request, "theatre", `${THEATRE_NOTE} It plays a checked-in state on gsap.ticker.`);
    }
    case "react-island":
      return assignReactIsland(request, ctx.stack, ctx.warnings);
    default:
      return assertNever(request.kind);
  }
}

function assertOneOwner(rows: readonly MotionRow[]): void {
  const owner = new Map<string, MotionLib>();
  for (const item of rows) {
    const key = `${item.page}\0${item.element}`;
    const existing = owner.get(key);
    if (existing !== undefined && existing !== item.library) {
      throw new CoexistenceError(
        `Element "${item.element}" on page "${item.page}" cannot have two owners (${existing} and ${item.library}).`,
      );
    }
    owner.set(key, item.library);
  }
}

function planPage(
  page: string,
  requests: readonly ResolvedRequest[],
  appetite: number,
  stack: StackPick,
  allowHeavy: boolean,
): { owner: ScrollOwner; rows: MotionRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const explicitCss = requests.some((item) => item.kind === "css-scroll");
  const hasSequence = requests.some((item) => item.kind === "scroll-sequence");
  const lenisDriver = appetite >= 3 && requests.some((item) => drivesLenis(item.kind));

  if (explicitCss && (lenisDriver || hasSequence)) {
    const other = lenisDriver ? "Lenis" : "a scroll sequence";
    throw new CoexistenceError(
      `Page "${page}" cannot combine a css-scroll effect with ${other}. One scroll owner per page. Neither effect was dropped.`,
    );
  }

  const pageIsLenis = lenisDriver && !explicitCss;
  const threeAssigned = requests.some((item) => item.kind === "3d" && (appetite >= 8 || allowHeavy));
  const ctx: AssignContext = {
    pageIsLenis,
    hasSequence,
    threeAssigned,
    appetite,
    stack,
    allowHeavy,
    warnings,
  };
  const rows = requests.map((item) => assignOne(item, ctx));

  if (pageIsLenis && !rows.some((item) => item.library === "lenis")) {
    const id = `${page}#lenis`;
    if (requests.some((item) => item.id === id)) {
      throw new MotionError(`Duplicate effect id "${id}".`);
    }
    rows.push({
      id,
      library: "lenis",
      element: "documentElement",
      page,
      kind: "smooth-scroll",
      taxonomy: "A1",
      note: "Lenis drives ScrollTrigger on gsap.ticker.",
    });
  }

  let owner: ScrollOwner;
  if (rows.some((item) => item.library === "lenis")) owner = "lenis+scrolltrigger";
  else if (rows.some((item) => item.library === "css-scroll") || hasSequence) owner = "native";
  else owner = "none";

  const libraries = new Set(rows.map((item) => item.library));
  if (libraries.has("lenis") && libraries.has("css-scroll")) {
    throw new CoexistenceError(
      `Page "${page}" would select both lenis and css-scroll. One scroll owner per page. Neither effect was dropped.`,
    );
  }

  assertOneOwner(rows);
  return { owner, rows, warnings };
}

export function renderMotionMd(input: {
  appetite: number;
  stack: StackPick;
  scrollOwner: Record<string, ScrollOwner>;
  warnings: readonly string[];
  rows: readonly MotionRow[];
}): string {
  const ownerKeys = Object.keys(input.scrollOwner);
  const ownerLines =
    ownerKeys.length === 0
      ? ["none"]
      : ownerKeys.map((page) => {
          const owner = input.scrollOwner[page];
          return `- ${page}: ${owner ?? "none"}`;
        });
  const assignmentLines =
    input.rows.length === 0
      ? ["None."]
      : input.rows.map((item) => {
          const note = item.note.length > 0 ? ` ${item.note}` : "";
          return `- ${item.id} on ${item.element} (page ${item.page}, kind ${item.kind}, taxonomy ${item.taxonomy}): ${item.library}.${note}`;
        });
  const warningLines = input.warnings.length === 0 ? ["None."] : input.warnings.map((item) => `- ${item}`);
  const markdown = [
    "# MOTION",
    "",
    `Appetite: ${input.appetite} of 10. Appetite is a weight ceiling. It does not remove a library from the Guide.`,
    "",
    `Toolkit: ${MOTION_LIBS.join(", ")}.`,
    "Every library ships with the Guide. This site may use a subset.",
    "No GSAP fallback.",
    "",
    `Stack: ${input.stack}. The stack pick comes from decideStack.`,
    "",
    "## Scroll owner",
    "",
    ...ownerLines,
    "",
    "## Assignments",
    "",
    ...assignmentLines,
    "",
    "## Warnings",
    "",
    ...warningLines,
    "",
    "## Coexistence",
    "",
    "One library owns each effect.",
    "One scroll owner per page: lenis+scrolltrigger, native, or none.",
    "Lenis and CSS scroll-driven animations are never both selected on the same page.",
    "One WebGL context per page. A shader stays on three when three is already assigned.",
    "Theatre means `@theatre/core` pinned at 0.7.2, never studio.",
    "prefers-reduced-motion turns Lenis off, with no scrub and no autoplay. Content stays visible.",
    "Effects at level 6 and above keep a calm phone path.",
    "GSAP includes ScrollTrigger and SplitText.",
    "",
  ].join("\n");

  if (markdown.includes("!") || markdown.includes("\r") || markdown.includes("\u2014")) {
    throw new MotionError("Motion markdown contained a forbidden mark.");
  }
  if (markdown.includes("gsap fallback") || markdown.includes("@theatre/studio")) {
    throw new MotionError("Motion markdown contained a forbidden phrase.");
  }
  return markdown;
}

export function planMotion(input: {
  requests: EffectRequest[];
  appetite: number;
  stack: StackPick;
  allowHeavy?: boolean;
}): MotionPlan {
  const appetite = cleanAppetite(input.appetite);
  const stack = cleanStack(input.stack);
  const allowHeavy = input.allowHeavy === true;
  if (!Array.isArray(input.requests)) {
    throw new MotionError("requests must be an array.");
  }

  const seen = new Set<string>();
  const resolved: ResolvedRequest[] = [];
  for (const raw of input.requests) {
    const request = cleanRequest(raw);
    if (seen.has(request.id)) {
      throw new MotionError(`Duplicate effect id "${request.id}".`);
    }
    seen.add(request.id);
    const kind = resolveKind(request.kind);
    resolved.push({
      id: request.id,
      kind,
      element: request.element,
      page: request.page,
      taxonomy: taxonomyOf(kind),
    });
  }

  const byPage = new Map<string, ResolvedRequest[]>();
  for (const request of resolved) {
    const list = byPage.get(request.page);
    if (list === undefined) byPage.set(request.page, [request]);
    else list.push(request);
  }

  const scrollOwner: Record<string, ScrollOwner> = {};
  const rows: MotionRow[] = [];
  const warnings: string[] = [];
  for (const [page, requests] of byPage) {
    const planned = planPage(page, requests, appetite, stack, allowHeavy);
    scrollOwner[page] = planned.owner;
    rows.push(...planned.rows);
    warnings.push(...planned.warnings);
  }

  assertOneOwner(rows);

  const assignments = rows.map((item) => ({
    id: item.id,
    library: item.library,
    element: item.element,
  }));
  const markdown = renderMotionMd({ appetite, stack, scrollOwner, warnings, rows });
  return { scrollOwner, assignments, warnings, markdown };
}
