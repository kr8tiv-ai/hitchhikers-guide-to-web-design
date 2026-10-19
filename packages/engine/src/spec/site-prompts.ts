/**
 * Site prompt skeleton. Pure. Bodies are not written here (092 authors them).
 *
 * Assumptions, because v1's global prompt index and this prompt's step 5 differ:
 * - reviewAfter is every 3rd entry within a phase, and the last entry of that
 *   phase. v1 §11.1 uses a global NNN % 3. Step 5 of prompt 090 wins.
 * - The final once-over is the last Improbability Drive entry (v2 §11.4).
 *   §5.2 has no final-pass slice, so the entry uses Sub-Etha Signal, the last
 *   slice of that phase.
 * - Imagery is one prompt per section. Use the supplied image when it fits,
 *   otherwise the generated set. No section is left without a picture.
 * - Next.js paths follow packages/templates/next-app (src/app). Vite paths
 *   follow vite-react-world. SvelteKit has no template: src/routes and src/lib.
 * - depends_on is a chain. Each entry depends on the previous id.
 * - Generated prompts share one turn count above 100. The desk spawn omits
 *   --max-turns, so that field is not a run cap.
 * - A 3D effect (three, ogl, theatre) is one Magrathea entry, not a second
 *   motion entry. A desktop 3D gate is added only for those effects.
 * - Art direction is one Babel Fish entry, then one Deep Thought entry per
 *   section, before any layout prompt.
 */

import { ART_GUIDANCE } from "./art-direction.ts";
import { MOTION_LIBS, type MotionLib } from "./motion.ts";

export { SITE_RULES } from "./site-rules.ts";

export type SitePhase =
  | "dont-panic"
  | "babel-fish"
  | "deep-thought"
  | "improbability-drive"
  | "mostly-harmless"
  | "so-long";

export type Tier = "Towel" | "Cup of Tea" | "Gargle Blaster" | "Heart of Gold" | "Forty-Two";

export type SiteEffort = "medium" | "high" | "xhigh";

export type SiteStack = "astro" | "next" | "vite-react" | "sveltekit";

export const SITE_PHASES: readonly SitePhase[] = [
  "dont-panic",
  "babel-fish",
  "deep-thought",
  "improbability-drive",
  "mostly-harmless",
  "so-long",
];

export const SLICES_BY_PHASE: Record<SitePhase, readonly string[]> = {
  "dont-panic": [
    "Towel Check",
    "Ford's Field Notes",
    "The Question",
    "Vogon Neighbors",
    "Point-of-View Gun",
    "Pan Galactic Gargle Blaster",
    "Bistromathics",
    "Guide Entry",
  ],
  "babel-fish": [
    "Deep Why",
    "Heart of Gold",
    "Sens-O-Matic",
    "Magrathean Logo Works",
    "Babel Voice",
    "Hyperspace Bypass",
    "The Brand Brain",
  ],
  "deep-thought": [
    "Seven and a Half Million Years",
    "The Ultimate Question",
    "Earth Mk II Blueprints",
    "Infinite Monkeys",
  ],
  "improbability-drive": [
    "Vogon Constructor Fleet",
    "Infinite Improbability",
    "Milliways Menu",
    "Somebody Else's Problem Field",
    "Pan Galactic Gargle Blaster",
    "Magrathea",
    "Sub-Etha Signal",
  ],
  "mostly-harmless": [
    "Nutrimatic Test",
    "Total Perspective Vortex",
    "Slartibartfast's Fjords",
  ],
  "so-long": ["Milliways at the End", "Share and Enjoy"],
};

export const MOTION_BIND_SENTENCE = "Do not also bind this element with another library.";

export const SITE_MODEL = "grok-4.7";

/**
 * Stored on a generated prompt. The site-build spawn does not pass it to grok.
 * grok --help lists --max-turns with no default, so a missing flag is unlimited.
 */
export const SITE_BUILD_MAX_TURNS = 100_000;

const COUNT_MAX = 150;
const COUNT_MIN = 50;

const WEBGL_LIBS: readonly MotionLib[] = ["three", "ogl", "theatre"];

export class SitePromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SitePromptError";
  }
}

export interface SitePromptSkeleton {
  id: string;
  phase: SitePhase;
  slice: string;
  title: string;
  tier: Tier;
  effort: SiteEffort;
  model: string;
  dependsOn: string[];
  filesModified: string[];
  requirements: string[];
  protected: string[];
  reviewAfter: boolean;
  maxTurns: number;
  library?: string;
  kind: "build" | "once-over";
  /** URL path for a page prompt, such as /farms or /farms/[id]. */
  route?: string;
  contentSources?: string[];
  acceptance?: string[];
}

export interface SitePrompt extends SitePromptSkeleton {
  rules: string;
  body: string;
}

export interface SiteSkeletonInput {
  pages: Array<{ id: string; title: string; sections: string[]; route?: string; contentSources?: string[] }>;
  effects: Array<{ id: string; library: string; sectionId: string; page: string }>;
  features: string[];
  integrations: string[];
  seoItems: string[];
  stack: SiteStack;
  protectedPaths: string[];
}

interface CleanPage {
  id: string;
  title: string;
  route: string;
  sections: string[];
  contentSources: string[];
}

interface CleanEffect {
  id: string;
  library: MotionLib;
  sectionId: string;
  page: string;
}

interface Draft {
  phase: SitePhase;
  slice: string;
  title: string;
  tier: Tier;
  effort: SiteEffort;
  filesModified: string[];
  requirements: string[];
  kind: "build" | "once-over";
  library?: MotionLib;
  route?: string;
  contentSources?: string[];
  acceptance?: string[];
}

interface CleanInput {
  pages: CleanPage[];
  effects: CleanEffect[];
  features: string[];
  integrations: string[];
  seoItems: string[];
  stack: SiteStack;
  protectedPaths: string[];
}

function assertNever(value: never): never {
  throw new SitePromptError(`Unknown value "${String(value)}".`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMotionLib(value: string): value is MotionLib {
  return (MOTION_LIBS as readonly string[]).includes(value);
}

function isWebgl(library: MotionLib): boolean {
  return (WEBGL_LIBS as readonly string[]).includes(library);
}

function flatten(value: string): string {
  return value.replace(/\r\n|[\r\n]/g, " ").replace(/ {2,}/g, " ").trim();
}

function assertPlain(text: string, field: string): void {
  if (text.includes("!") || text.includes("\uFF01")) {
    throw new SitePromptError(`${field} cannot contain an exclamation mark.`);
  }
  if (text.includes("\u2014")) {
    throw new SitePromptError(`${field} cannot contain an em dash.`);
  }
  if (/\blorem\b/i.test(text)) {
    throw new SitePromptError(`${field} cannot contain lorem.`);
  }
  if (text.includes("..") || text.includes("/") || text.includes("\\") || text.includes("\0")) {
    throw new SitePromptError(`${field} contains a path character.`);
  }
}

function assertToken(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new SitePromptError(`${field} must be a string.`);
  }
  const text = flatten(value);
  if (text.length === 0) {
    throw new SitePromptError(`${field} must not be empty.`);
  }
  assertPlain(text, field);
  return text;
}

function slugId(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new SitePromptError(`Cannot build a path from "${value}".`);
  }
  return slug;
}

export function pageRequirementId(pageId: string): string {
  return `REQ-PAGE-${slugId(pageId)}`;
}

export function featureRequirementId(feature: string): string {
  return `REQ-FEAT-${slugId(feature)}`;
}

const ROUTE_RE =
  /^\/$|^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*|\[[a-z0-9]+\])(?:\/(?:[a-z0-9]+(?:-[a-z0-9]+)*|\[[a-z0-9]+\]))*$/;

function cleanRoute(value: unknown, pageId: string, pageIndex: number): string {
  if (value === undefined) return pageIndex === 0 ? "/" : `/${slugId(pageId)}`;
  if (typeof value !== "string" || !ROUTE_RE.test(value)) {
    throw new SitePromptError(`Page "${pageId}" route is not a path.`);
  }
  return value;
}

function cleanContentSources(raw: unknown, pageId: string): string[] {
  const fallback = ["src/data/routes.ts", "src/data/copy.ts"];
  if (raw === undefined) return fallback;
  if (!Array.isArray(raw)) {
    throw new SitePromptError(`Page "${pageId}" content sources must be an array.`);
  }
  const sources: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new SitePromptError(`Page "${pageId}" content source must be a string.`);
    }
    const text = item.replace(/\r\n|[\r\n]/g, " ").replace(/ {2,}/g, " ").trim();
    if (text === "") continue;
    if (
      text.includes("!") ||
      text.includes("\uFF01") ||
      text.includes("\u2014") ||
      text.includes("..") ||
      text.includes("\\") ||
      text.includes("\0")
    ) {
      throw new SitePromptError(`Page "${pageId}" content source contains a banned character.`);
    }
    sources.push(text);
  }
  return sources.length === 0 ? fallback : sources;
}

function pascal(slug: string): string {
  const name = slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
    throw new SitePromptError(`Cannot build a component name from "${slug}".`);
  }
  return name;
}

function claimer(): (id: string) => string {
  const used = new Set<string>();
  return (id: string) => {
    let next = id;
    let n = 2;
    while (used.has(next)) {
      next = `${id}-${n}`;
      n += 1;
    }
    used.add(next);
    return next;
  };
}

function cleanStack(value: unknown): SiteStack {
  if (value === "astro" || value === "next" || value === "vite-react" || value === "sveltekit") {
    return value;
  }
  const shown = typeof value === "string" ? value : typeof value;
  throw new SitePromptError(
    `Unknown stack "${shown}". Known picks: astro, next, vite-react, sveltekit.`,
  );
}

function cleanPages(raw: unknown): CleanPage[] {
  if (!Array.isArray(raw)) {
    throw new SitePromptError("pages must be an array.");
  }
  if (raw.length === 0) {
    throw new SitePromptError("At least one page is required.");
  }
  const pages: CleanPage[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenSectionIds = new Set<string>();
  const seenSectionSlugs = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) {
      throw new SitePromptError("Each page must be an object.");
    }
    const id = assertToken(item.id, "Page id");
    if (seenIds.has(id)) {
      throw new SitePromptError(`Duplicate page id "${id}".`);
    }
    seenIds.add(id);
    const slug = slugId(id);
    if (seenSlugs.has(slug)) {
      throw new SitePromptError(`Duplicate page path for "${slug}".`);
    }
    seenSlugs.add(slug);
    if (!Array.isArray(item.sections)) {
      throw new SitePromptError(`Page "${id}" sections must be an array.`);
    }
    if (item.sections.length === 0) {
      throw new SitePromptError(`Page "${id}" needs at least one section.`);
    }
    const sections: string[] = [];
    for (const section of item.sections) {
      const sectionId = assertToken(section, `Section id on "${id}"`);
      if (seenSectionIds.has(sectionId)) {
        throw new SitePromptError(`Duplicate section id "${sectionId}".`);
      }
      seenSectionIds.add(sectionId);
      const sectionSlug = slugId(sectionId);
      if (seenSectionSlugs.has(sectionSlug)) {
        throw new SitePromptError(`Duplicate section path for "${sectionSlug}".`);
      }
      seenSectionSlugs.add(sectionSlug);
      sections.push(sectionId);
    }
    pages.push({
      id,
      title: assertToken(item.title, `Page "${id}" title`),
      route: cleanRoute(item.route, id, pages.length),
      sections,
      contentSources: cleanContentSources(item.contentSources, id),
    });
  }
  return pages;
}

function cleanNamedList(raw: unknown, label: string): string[] {
  if (!Array.isArray(raw)) {
    throw new SitePromptError(`${label} must be an array.`);
  }
  const names: string[] = [];
  const slugs = new Set<string>();
  for (const item of raw) {
    const text = assertToken(item, label);
    const slug = slugId(text);
    if (slugs.has(slug)) {
      throw new SitePromptError(`Duplicate ${label} path for "${slug}".`);
    }
    slugs.add(slug);
    names.push(text);
  }
  return names;
}

function cleanProtected(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    throw new SitePromptError("protectedPaths must be an array.");
  }
  const paths: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      throw new SitePromptError("Protected path must be a string.");
    }
    const text = item.replace(/\r\n|[\r\n]/g, "").trim().replace(/\\/g, "/");
    if (text.length === 0) {
      throw new SitePromptError("Protected path must not be empty.");
    }
    if (text.includes("!") || text.includes("\uFF01")) {
      throw new SitePromptError("Protected path cannot contain an exclamation mark.");
    }
    if (text.includes("..") || text.includes("\0")) {
      throw new SitePromptError("Protected path cannot contain '..'.");
    }
    paths.push(text);
  }
  return paths;
}

function cleanEffects(raw: unknown, pages: readonly CleanPage[]): CleanEffect[] {
  if (!Array.isArray(raw)) {
    throw new SitePromptError("effects must be an array.");
  }
  const byPage = new Map<string, Set<string>>();
  for (const page of pages) {
    byPage.set(page.id, new Set(page.sections));
  }
  const effects: CleanEffect[] = [];
  const seen = new Set<string>();
  const scroll = new Map<string, Set<MotionLib>>();
  for (const item of raw) {
    if (!isRecord(item)) {
      throw new SitePromptError("Each effect must be an object.");
    }
    const id = assertToken(item.id, "Effect id");
    if (seen.has(id)) {
      throw new SitePromptError(`Duplicate effect id "${id}".`);
    }
    seen.add(id);
    const libraryText = assertToken(item.library, `Effect "${id}" library`);
    if (!isMotionLib(libraryText)) {
      throw new SitePromptError(
        `Unknown library "${libraryText}". Known libraries: ${MOTION_LIBS.join(", ")}.`,
      );
    }
    const page = assertToken(item.page, `Effect "${id}" page`);
    const sections = byPage.get(page);
    if (sections === undefined) {
      throw new SitePromptError(`Effect "${id}" page "${page}" matches no page.`);
    }
    const sectionId = assertToken(item.sectionId, `Effect "${id}" sectionId`);
    if (!sections.has(sectionId)) {
      throw new SitePromptError(`Effect "${id}" sectionId "${sectionId}" matches no page.`);
    }
    if (libraryText === "lenis" || libraryText === "css-scroll") {
      const owners = scroll.get(page) ?? new Set<MotionLib>();
      owners.add(libraryText);
      scroll.set(page, owners);
      if (owners.size > 1) {
        throw new SitePromptError(
          `Page "${page}" names both lenis and css-scroll. One scroll owner per page.`,
        );
      }
    }
    effects.push({ id, library: libraryText, sectionId, page });
  }
  return effects;
}

function cleanInput(input: SiteSkeletonInput): CleanInput {
  if (!isRecord(input)) {
    throw new SitePromptError("Input must be an object.");
  }
  const pages = cleanPages(input.pages);
  return {
    pages,
    effects: cleanEffects(input.effects, pages),
    features: cleanNamedList(input.features, "Feature"),
    integrations: cleanNamedList(input.integrations, "Integration"),
    seoItems: cleanNamedList(input.seoItems, "SEO item"),
    stack: cleanStack(input.stack),
    protectedPaths: cleanProtected(input.protectedPaths),
  };
}

function componentFile(stack: SiteStack, name: string): string {
  switch (stack) {
    case "astro":
      return `src/components/${name}.astro`;
    case "next":
      return `src/components/${name}.tsx`;
    case "vite-react":
      return `src/world/${name}.tsx`;
    case "sveltekit":
      return `src/lib/components/${name}.svelte`;
    default:
      return assertNever(stack);
  }
}

function pageFile(stack: SiteStack, page: CleanPage): string {
  if (page.route === "/") {
    switch (stack) {
      case "astro":
        return "src/pages/index.astro";
      case "next":
        return "src/app/page.tsx";
      case "vite-react":
        return "src/world/World.tsx";
      case "sveltekit":
        return "src/routes/+page.svelte";
      default:
        return assertNever(stack);
    }
  }
  const joined = page.route.split("/").filter((part) => part.length > 0).join("/");
  switch (stack) {
    case "astro":
      return `src/pages/${joined}.astro`;
    case "next":
      return `src/app/${joined}/page.tsx`;
    case "vite-react":
      return `src/world/Page${pascal(slugId(page.id))}.tsx`;
    case "sveltekit":
      return `src/routes/${joined}/+page.svelte`;
    default:
      return assertNever(stack);
  }
}

function layoutFiles(stack: SiteStack): string[] {
  switch (stack) {
    case "astro":
      return ["src/layouts/Base.astro"];
    case "next":
      return ["src/app/layout.tsx"];
    case "vite-react":
      return ["src/world/main.tsx", "src/world/Shell.tsx"];
    case "sveltekit":
      return ["src/routes/+layout.svelte"];
    default:
      return assertNever(stack);
  }
}

function scaffoldFiles(stack: SiteStack): string[] {
  const manifest = ["package.json", "pnpm-lock.yaml"];
  switch (stack) {
    case "astro":
      return [...manifest, "astro.config.ts", "tsconfig.json"];
    case "next":
      return [...manifest, "next.config.ts", "tsconfig.json"];
    case "vite-react":
      return [...manifest, "vite.config.ts", "tsconfig.json", "index.html"];
    case "sveltekit":
      return [...manifest, "svelte.config.js", "tsconfig.json"];
    default:
      return assertNever(stack);
  }
}

function scaffoldAcceptance(): string[] {
  return [
    "package.json sets name, private true, and type module, pins dependencies, and defines scripts dev, build, preview, check, and test as appropriate for the stack.",
    "Run pnpm install. The install succeeds, and package.json and pnpm-lock.yaml are committed.",
  ];
}

function configFile(stack: SiteStack): string {
  switch (stack) {
    case "astro":
      return "astro.config.ts";
    case "next":
      return "next.config.ts";
    case "vite-react":
      return "vite.config.ts";
    case "sveltekit":
      return "svelte.config.js";
    default:
      return assertNever(stack);
  }
}

function creditsFiles(stack: SiteStack): string[] {
  switch (stack) {
    case "astro":
      return ["src/pages/credits.astro", "src/data/credits.ts"];
    case "next":
      return ["src/app/credits/page.tsx", "src/data/credits.ts"];
    case "vite-react":
      return ["src/world/Credits.tsx", "src/data/credits.ts"];
    case "sveltekit":
      return ["src/routes/credits/+page.svelte", "src/data/credits.ts"];
    default:
      return assertNever(stack);
  }
}

function firstLayout(stack: SiteStack): string {
  const file = layoutFiles(stack)[0];
  if (file === undefined) {
    throw new SitePromptError("Missing layout path.");
  }
  return file;
}

function featureTier(name: string): { tier: Tier; effort: SiteEffort } {
  if (/stripe|shopify|booking|calendar|cms|analytics|payment/i.test(name)) {
    return { tier: "Gargle Blaster", effort: "high" };
  }
  return { tier: "Cup of Tea", effort: "medium" };
}

function motionClause(id: string, sectionId: string): string {
  const key = id.toLowerCase();
  if (key.includes("hero-signature")) return "This is the hero signature.";
  if (key.includes("parallax")) return "Layered media with soft parallax.";
  if (key.includes("reveal")) {
    return /farm|card|grid/i.test(sectionId)
      ? "Staggered card reveals for the farm cards at about 400 ms."
      : "Staggered fade-and-rise reveals at about 400 ms.";
  }
  if (key.includes("transition")) return "Section transition with a view transition or a GSAP timeline.";
  if (key.includes("scroll") || key.endsWith("-lenis")) return "One scroll owner for this page.";
  return "";
}

function motionTitle(library: MotionLib, sectionId: string, clause = ""): string {
  const pin = library === "theatre" ? ", core package pinned at 0.7.2, never studio" : "";
  const detail = clause === "" ? "" : ` ${clause}`;
  return `Bind ${library} on the ${sectionId} section${pin}.${detail} ${MOTION_BIND_SENTENCE}`;
}

function effectAcceptance(effect: CleanEffect): string[] {
  const clause = motionClause(effect.id, effect.sectionId);
  const lines = [clause === "" ? "Scroll-driven motion for this section." : clause];
  if (effect.library === "three" || effect.library === "ogl" || effect.library === "theatre") {
    lines.push("The phone path uses a still fallback. One WebGL context on the page.");
  }
  lines.push("Reduced motion stays visible and complete.");
  lines.push(
    "Phone Lighthouse stays at 90. LCP stays at most 2.5 seconds. CLS stays at most 0.1. The hero media weight stays inside REQ-PERF.",
  );
  return lines;
}

function sectionSlice(pageIndex: number, sectionIndex: number): string {
  if (pageIndex === 0 && sectionIndex === 0) return "Infinite Improbability";
  return "Milliways Menu";
}

function job(
  claim: (id: string) => string,
  init: {
    phase: SitePhase;
    slice: string;
    title: string;
    tier: Tier;
    effort: SiteEffort;
    files: string[];
    requirement: string;
    library?: MotionLib;
    kind?: "build" | "once-over";
    route?: string;
    contentSources?: string[];
    acceptance?: string[];
  },
): Draft {
  const allowed = SLICES_BY_PHASE[init.phase];
  if (!allowed.includes(init.slice)) {
    throw new SitePromptError(`Slice "${init.slice}" is not in phase ${init.phase}.`);
  }
  const row: Draft = {
    phase: init.phase,
    slice: init.slice,
    title: init.title,
    tier: init.tier,
    effort: init.effort,
    filesModified: init.files,
    requirements: [claim(init.requirement)],
    kind: init.kind ?? "build",
  };
  if (init.library !== undefined) row.library = init.library;
  if (init.route !== undefined) row.route = init.route;
  if (init.contentSources !== undefined) row.contentSources = [...init.contentSources];
  if (init.acceptance !== undefined) row.acceptance = [...init.acceptance];
  return row;
}

function assertUniquePageFiles(stack: SiteStack, pages: readonly CleanPage[]): void {
  const seen = new Set<string>();
  pages.forEach((page) => {
    const file = pageFile(stack, page);
    if (seen.has(file)) {
      throw new SitePromptError(`Duplicate page path "${file}".`);
    }
    seen.add(file);
  });
}

function buildDrafts(input: CleanInput, claim: (id: string) => string): Draft[] {
  const { stack, pages, effects } = input;
  assertUniquePageFiles(stack, pages);
  const drafts: Draft[] = [];

  drafts.push(
    job(claim, {
      phase: "dont-panic",
      slice: "Guide Entry",
      title: "Record the approved page ids and titles in the route module.",
      tier: "Cup of Tea",
      effort: "medium",
      files: ["src/data/routes.ts"],
      requirement: "REQ-ROUTES",
    }),
    job(claim, {
      phase: "babel-fish",
      slice: "The Brand Brain",
      title:
        "Write the art direction: one visual concept, mood, light and color grade, type voice, motion character and a signature hero moment, from the brand inputs.",
      tier: "Heart of Gold",
      effort: "high",
      files: ["src/data/art-direction.ts", ".hitchhiker/ART-DIRECTION.md"],
      requirement: "REQ-ART-DIRECTION",
      acceptance: [...ART_GUIDANCE],
    }),
    job(claim, {
      phase: "babel-fish",
      slice: "Sens-O-Matic",
      title: "Set color and type tokens from the approved brand.",
      tier: "Cup of Tea",
      effort: "medium",
      files: ["src/styles/tokens.css"],
      requirement: "REQ-TOKENS",
    }),
    job(claim, {
      phase: "babel-fish",
      slice: "Magrathean Logo Works",
      title: "Place the approved logo.",
      tier: "Towel",
      effort: "medium",
      files: ["public/logo.svg", componentFile(stack, "Logo")],
      requirement: "REQ-LOGO",
    }),
    job(claim, {
      phase: "babel-fish",
      slice: "Babel Voice",
      title: "Record the voice bans the copy must obey.",
      tier: "Cup of Tea",
      effort: "medium",
      files: ["src/data/voice.ts"],
      requirement: "REQ-VOICE",
    }),
    job(claim, {
      phase: "deep-thought",
      slice: "Earth Mk II Blueprints",
      title: "Register each section id and its component path.",
      tier: "Heart of Gold",
      effort: "high",
      files: ["src/data/sections.ts"],
      requirement: "REQ-SECTION-REGISTRY",
    }),
    job(claim, {
      phase: "deep-thought",
      slice: "Seven and a Half Million Years",
      title: "Register requirement ids for the pages, sections, features, and integrations.",
      tier: "Heart of Gold",
      effort: "high",
      files: ["src/data/requirements.ts"],
      requirement: "REQ-REQUIREMENTS",
    }),
  );

  for (const page of pages) {
    for (const sectionId of page.sections) {
      drafts.push(
        job(claim, {
          phase: "deep-thought",
          slice: "Infinite Monkeys",
          title: `Art-direct the ${sectionId} section: layout idea, media, motion, transition in and out.`,
          tier: "Heart of Gold",
          effort: "high",
          files: ["src/data/art-direction.ts", ".hitchhiker/ART-DIRECTION.md"],
          requirement: `REQ-ART-${slugId(sectionId)}`,
          acceptance: [...ART_GUIDANCE],
        }),
      );
    }
  }

  drafts.push(
    job(claim, {
      phase: "improbability-drive",
      slice: "Vogon Constructor Fleet",
      title: "Scaffold the strict TypeScript project.",
      tier: "Towel",
      effort: "medium",
      files: scaffoldFiles(stack),
      requirement: "REQ-SCAFFOLD",
      acceptance: scaffoldAcceptance(),
    }),
    job(claim, {
      phase: "improbability-drive",
      slice: "Vogon Constructor Fleet",
      title: "Add the font files and the font-face rules.",
      tier: "Towel",
      effort: "medium",
      files: ["src/styles/fonts.css"],
      requirement: "REQ-FONTS",
    }),
    job(claim, {
      phase: "improbability-drive",
      slice: "Vogon Constructor Fleet",
      title: "Add the document shell.",
      tier: "Cup of Tea",
      effort: "medium",
      files: layoutFiles(stack),
      requirement: "REQ-LAYOUT",
    }),
    job(claim, {
      phase: "improbability-drive",
      slice: "Vogon Constructor Fleet",
      title: "Add the shared ticker and the reduced-motion check.",
      tier: "Cup of Tea",
      effort: "medium",
      files: ["src/scripts/motion.ts"],
      requirement: "REQ-MOTION-CLOCK",
    }),
    job(claim, {
      phase: "improbability-drive",
      slice: "Infinite Improbability",
      title: "Add the site nav from the route module.",
      tier: "Cup of Tea",
      effort: "medium",
      files: [componentFile(stack, "Nav"), firstLayout(stack)],
      requirement: "REQ-NAV",
    }),
  );

  pages.forEach((page, pageIndex) => {
    const pageReq = pageRequirementId(page.id);
    const pagePath = pageFile(stack, page);
    const sources = page.contentSources.join(", ");
    drafts.push(
      job(claim, {
        phase: "improbability-drive",
        slice: pageIndex === 0 ? "Infinite Improbability" : "Milliways Menu",
        title: `Add the ${page.title} route.`,
        tier: "Cup of Tea",
        effort: "medium",
        files: [pagePath],
        requirement: pageReq,
        route: page.route,
        contentSources: page.contentSources,
        acceptance: [
          `Route ${page.route} renders and the nav links to it.`,
          `Content comes from ${sources}.`,
          `${pageReq} passes.`,
        ],
      }),
    );
    page.sections.forEach((sectionId, sectionIndex) => {
      const slice = sectionSlice(pageIndex, sectionIndex);
      const file = componentFile(stack, `Section${pascal(slugId(sectionId))}`);
      drafts.push(
        job(claim, {
          phase: "improbability-drive",
          slice,
          title: `Build the ${sectionId} layout on ${page.title}.`,
          tier: "Cup of Tea",
          effort: "medium",
          files: [file, pagePath],
          requirement: `REQ-STRUCT-${slugId(sectionId)}`,
          acceptance: [
            "Use an asymmetric grid, overlapping media where the story needs it, and a real type scale.",
          ],
        }),
        job(claim, {
          phase: "improbability-drive",
          slice,
          title: `Place real copy in the ${sectionId} section.`,
          tier: "Towel",
          effort: "medium",
          files: [file],
          requirement: `REQ-COPY-${slugId(sectionId)}`,
        }),
      );
    });
  });

  pages.forEach((page, pageIndex) => {
    page.sections.forEach((sectionId, sectionIndex) => {
      drafts.push(
        job(claim, {
          phase: "improbability-drive",
          slice: sectionSlice(pageIndex, sectionIndex),
          title: `Art-direct and place the image set for ${sectionId}: use the supplied image if it fits, otherwise the generated set.`,
          tier: "Cup of Tea",
          effort: "medium",
          files: [componentFile(stack, `Section${pascal(slugId(sectionId))}`)],
          requirement: `REQ-IMAGE-${slugId(sectionId)}`,
          acceptance: [
            `The generated still for this section is src/assets/generated/${slugId(sectionId)}.webp.`,
            "Use the supplied image when it fits.",
          ],
        }),
      );
    });
  });

  for (const effect of effects) {
    const webgl = isWebgl(effect.library);
    drafts.push(
      job(claim, {
        phase: "improbability-drive",
        slice: webgl ? "Magrathea" : "Pan Galactic Gargle Blaster",
        title: motionTitle(effect.library, effect.sectionId, motionClause(effect.id, effect.sectionId)),
        tier: webgl ? "Heart of Gold" : "Gargle Blaster",
        effort: webgl ? "xhigh" : "high",
        files: [
          componentFile(stack, `Section${pascal(slugId(effect.sectionId))}`),
          "src/scripts/motion.ts",
        ],
        requirement: `REQ-FX-${slugId(effect.id)}`,
        library: effect.library,
        acceptance: effectAcceptance(effect),
      }),
    );
  }

  for (const feature of input.features) {
    const slug = slugId(feature);
    const tier = featureTier(feature);
    const featureReq = featureRequirementId(feature);
    drafts.push(
      job(claim, {
        phase: "improbability-drive",
        slice: "Somebody Else's Problem Field",
        title: `Add the feature: ${feature}.`,
        tier: tier.tier,
        effort: tier.effort,
        files: [componentFile(stack, `Feature${pascal(slug)}`)],
        requirement: featureReq,
        acceptance: [`Build ${feature}.`, `The requirement ${featureReq} is satisfied.`],
      }),
    );
  }

  for (const integration of input.integrations) {
    const slug = slugId(integration);
    drafts.push(
      job(claim, {
        phase: "improbability-drive",
        slice: "Somebody Else's Problem Field",
        title: `Wire the integration: ${integration}.`,
        tier: "Gargle Blaster",
        effort: "high",
        files: [`src/scripts/integrations/${slug}.ts`],
        requirement: `REQ-INT-${slug}`,
      }),
    );
  }

  drafts.push(
    job(claim, {
      phase: "improbability-drive",
      slice: "Sub-Etha Signal",
      title: "Set the media weight budget and the phone image sizes.",
      tier: "Heart of Gold",
      effort: "high",
      files: ["src/styles/media.css"],
      requirement: "REQ-PERF",
    }),
  );

  for (const item of input.seoItems) {
    const slug = slugId(item);
    drafts.push(
      job(claim, {
        phase: "improbability-drive",
        slice: "Sub-Etha Signal",
        title: `Add the SEO item: ${item}.`,
        tier: "Cup of Tea",
        effort: "medium",
        files: [`src/data/seo/${slug}.ts`],
        requirement: `REQ-SEO-${slug}`,
      }),
    );
  }

  drafts.push(
    job(claim, {
      phase: "improbability-drive",
      slice: "Sub-Etha Signal",
      title: "Add the credits module and the credits page.",
      tier: "Towel",
      effort: "medium",
      files: creditsFiles(stack),
      requirement: "REQ-CREDITS",
    }),
    job(claim, {
      phase: "improbability-drive",
      slice: "Sub-Etha Signal",
      title: "Final Forty-Two once-over for drift, dead code, token mismatches, missed requirements, and protected paths.",
      tier: "Forty-Two",
      effort: "xhigh",
      files: [".hitchhiker/reviews/once-over.md"],
      requirement: "REQ-ONCE-OVER",
      kind: "once-over",
    }),
  );

  const gates: Array<{
    requirement: string;
    title: string;
    tier: Tier;
    effort: SiteEffort;
    file: string;
    slice: string;
  }> = [
    {
      requirement: "REQ-GATE-ANTISLOP",
      slice: "Nutrimatic Test",
      title: "Run the anti-slop pass on copy and layout.",
      tier: "Gargle Blaster",
      effort: "high",
      file: "tests/antislop.spec.ts",
    },
    {
      requirement: "REQ-GATE-PLAYWRIGHT",
      slice: "Total Perspective Vortex",
      title: "Open every page at 375, 768, 1440, and 1920 and fail on console errors.",
      tier: "Gargle Blaster",
      effort: "high",
      file: "tests/qa.spec.ts",
    },
    {
      requirement: "REQ-GATE-LIGHTHOUSE",
      slice: "Total Perspective Vortex",
      title: "Run Lighthouse on the phone path and require 90 in all four categories.",
      tier: "Heart of Gold",
      effort: "high",
      file: "tests/lighthouse.spec.ts",
    },
    {
      requirement: "REQ-GATE-CWV",
      slice: "Total Perspective Vortex",
      title: "Check LCP at most 2.5 seconds, CLS at most 0.1, and the INP lab proxy at most 200 milliseconds.",
      tier: "Heart of Gold",
      effort: "high",
      file: "tests/cwv.spec.ts",
    },
    {
      requirement: "REQ-GATE-AXE",
      slice: "Total Perspective Vortex",
      title: "Run axe, the reduced-motion path, and contrast against the tokens.",
      tier: "Gargle Blaster",
      effort: "high",
      file: "tests/axe.spec.ts",
    },
    {
      requirement: "REQ-GATE-SEO",
      slice: "Total Perspective Vortex",
      title: "Check unique titles, meta, one H1, alt text, sitemap, robots, canonical, and JSON-LD.",
      tier: "Cup of Tea",
      effort: "medium",
      file: "tests/seo-gate.spec.ts",
    },
    {
      requirement: "REQ-GATE-VISUAL",
      slice: "Total Perspective Vortex",
      title: "Compare screenshots with the baselines from the last pass.",
      tier: "Gargle Blaster",
      effort: "high",
      file: "tests/visual.spec.ts",
    },
    {
      requirement: "REQ-GATE-LINKS",
      slice: "Total Perspective Vortex",
      title: "Check broken links and the hero media weight budget.",
      tier: "Cup of Tea",
      effort: "medium",
      file: "tests/links-weight.spec.ts",
    },
    {
      requirement: "REQ-GATE-CREDITS",
      slice: "Total Perspective Vortex",
      title: "Check the credits file against the credits page.",
      tier: "Towel",
      effort: "medium",
      file: "tests/credits-match.spec.ts",
    },
    {
      requirement: "REQ-GATE-BRAND",
      slice: "Total Perspective Vortex",
      title: "Score each brand dimension and require 8 out of 10.",
      tier: "Heart of Gold",
      effort: "high",
      file: "tests/brand-signoff.spec.ts",
    },
  ];

  for (const gate of gates) {
    drafts.push(
      job(claim, {
        phase: "mostly-harmless",
        slice: gate.slice,
        title: gate.title,
        tier: gate.tier,
        effort: gate.effort,
        files: [gate.file],
        requirement: gate.requirement,
      }),
    );
  }

  for (const effect of effects) {
    if (!isWebgl(effect.library)) continue;
    const slug = slugId(effect.id);
    drafts.push(
      job(claim, {
        phase: "mostly-harmless",
        slice: "Total Perspective Vortex",
        title: `Check the desktop 3D route for effect ${effect.id}, including a phone fallback.`,
        tier: "Heart of Gold",
        effort: "xhigh",
        files: [`tests/desktop-3d-${slug}.spec.ts`],
        requirement: `REQ-GATE-DESKTOP-3D-${slug}`,
      }),
    );
  }

  drafts.push(
    job(claim, {
      phase: "mostly-harmless",
      slice: "Total Perspective Vortex",
      title: "Score the jury at weights 40, 30, 20, and 10 for design, usability, creativity, and content.",
      tier: "Heart of Gold",
      effort: "high",
      files: ["tests/jury.spec.ts"],
      requirement: "REQ-JURY",
    }),
    job(claim, {
      phase: "mostly-harmless",
      slice: "Slartibartfast's Fjords",
      title: "Elevate pass for type and spacing. Rank the upgrades.",
      tier: "Forty-Two",
      effort: "xhigh",
      files: ["src/styles/type.css", "tests/elevate-type.spec.ts"],
      requirement: "REQ-ELEVATE-TYPE",
    }),
    job(claim, {
      phase: "mostly-harmless",
      slice: "Slartibartfast's Fjords",
      title: "Elevate pass for motion. Add the motion the art direction asks for that is still missing, then refine what exists.",
      tier: "Forty-Two",
      effort: "xhigh",
      files: ["src/scripts/motion.ts", "tests/elevate-motion.spec.ts"],
      requirement: "REQ-ELEVATE-MOTION",
    }),
    job(claim, {
      phase: "mostly-harmless",
      slice: "Slartibartfast's Fjords",
      title: "Elevate pass for imagery. Replace weak, generic or missing images with art-directed generated ones through the asset step, and improve crop and grade.",
      tier: "Forty-Two",
      effort: "xhigh",
      files: ["src/styles/imagery.css", "tests/elevate-imagery.spec.ts"],
      requirement: "REQ-ELEVATE-IMAGERY",
    }),
    job(claim, {
      phase: "mostly-harmless",
      slice: "Slartibartfast's Fjords",
      title: "Elevate pass for copy. Leave a TODO where a fact is missing.",
      tier: "Forty-Two",
      effort: "xhigh",
      files: ["src/data/copy.ts", "tests/elevate-copy.spec.ts"],
      requirement: "REQ-ELEVATE-COPY",
    }),
    job(claim, {
      phase: "so-long",
      slice: "Milliways at the End",
      title: "Confirm domain, DNS, email, analytics, and legal pages before deploy.",
      tier: "Cup of Tea",
      effort: "medium",
      files: ["src/data/prelaunch.ts"],
      requirement: "REQ-PRELAUNCH",
    }),
    job(claim, {
      phase: "so-long",
      slice: "Milliways at the End",
      title: "Deploy only after an explicit yes, and record the rollback.",
      tier: "Heart of Gold",
      effort: "xhigh",
      files: [configFile(stack), "public/robots.txt", ".hitchhiker/DEPLOY.md"],
      requirement: "REQ-DEPLOY",
    }),
    job(claim, {
      phase: "so-long",
      slice: "Milliways at the End",
      title: "Check live routes, the form inbox, the analytics event, OG, and HTTPS.",
      tier: "Gargle Blaster",
      effort: "high",
      files: ["tests/post-deploy.spec.ts"],
      requirement: "REQ-POST-DEPLOY",
    }),
    job(claim, {
      phase: "so-long",
      slice: "Share and Enjoy",
      title: "Write the handoff for edits, Elevate, the blog, and domain renewal.",
      tier: "Cup of Tea",
      effort: "medium",
      files: [".hitchhiker/HANDOFF.md"],
      requirement: "REQ-HANDOFF",
    }),
    job(claim, {
      phase: "so-long",
      slice: "Share and Enjoy",
      title: "Draft the launch kit. Do not post it.",
      tier: "Cup of Tea",
      effort: "medium",
      files: ["src/data/launch.ts"],
      requirement: "REQ-LAUNCH",
    }),
  );

  return drafts;
}

function reviewFlags(phases: readonly SitePhase[]): boolean[] {
  const flags = phases.map(() => false);
  let start = 0;
  while (start < phases.length) {
    const phase = phases[start];
    let end = start + 1;
    while (end < phases.length && phases[end] === phase) end += 1;
    const count = end - start;
    for (let offset = 0; offset < count; offset += 1) {
      const nth = (offset + 1) % 3 === 0;
      const last = offset === count - 1;
      flags[start + offset] = nth || last;
    }
    start = end;
  }
  return flags;
}

function finalize(drafts: readonly Draft[], protectedPaths: readonly string[]): SitePromptSkeleton[] {
  const flags = reviewFlags(drafts.map((draft) => draft.phase));
  return drafts.map((draft, index) => {
    const id = String(index + 1).padStart(3, "0");
    const previous = index === 0 ? undefined : String(index).padStart(3, "0");
    const reviewAfter = flags[index] === true;
    const prompt: SitePromptSkeleton = {
      id,
      phase: draft.phase,
      slice: draft.slice,
      title: draft.title,
      tier: draft.tier,
      effort: draft.effort,
      model: SITE_MODEL,
      dependsOn: previous === undefined ? [] : [previous],
      filesModified: [...draft.filesModified],
      requirements: [...draft.requirements],
      protected: [...protectedPaths],
      reviewAfter,
      maxTurns: SITE_BUILD_MAX_TURNS,
      kind: draft.kind,
    };
    if (draft.library !== undefined) prompt.library = draft.library;
    if (draft.route !== undefined) prompt.route = draft.route;
    if (draft.contentSources !== undefined) prompt.contentSources = [...draft.contentSources];
    if (draft.acceptance !== undefined) prompt.acceptance = [...draft.acceptance];
    return prompt;
  });
}

export function generateSkeleton(input: SiteSkeletonInput): {
  prompts: SitePromptSkeleton[];
  warnings: string[];
} {
  const clean = cleanInput(input);
  const drafts = buildDrafts(clean, claimer());
  if (drafts.length > COUNT_MAX) {
    throw new SitePromptError(
      `This package would contain ${drafts.length} prompts, which is over 150. Split into milestones.`,
    );
  }
  const warnings: string[] = [];
  if (clean.stack === "sveltekit") {
    warnings.push(
      "SvelteKit templates are thinner for this stack, and the 3D ecosystem is thinner. Entries were still generated.",
    );
  }
  if (drafts.length < COUNT_MIN) {
    warnings.push(
      `Before we jump: Deep Thought, were the sections under-planned? The package has ${drafts.length} prompts, which is under 50. Nothing was merged. Nothing was added to fill the count.`,
    );
  }
  return {
    prompts: finalize(drafts, clean.protectedPaths),
    warnings,
  };
}
