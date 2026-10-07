/**
 * The user owns the framework choice (Matt Q21).
 * discussFramework shows the recorded pick before authoring.
 * An override replaces the pick. If authoring is already running,
 * the in-flight package stops, retargetSkeleton rewrites file paths,
 * and authorPackage starts again.
 */

import type { SitePromptSkeleton, SiteStack } from "./site-prompts.ts";
import { StackError, type StackDecision, type StackPick } from "./stack.ts";

export interface FrameworkCard {
  pick: StackPick;
  why: string;
  alternatives: string;
  tradeoffs: string;
}

interface Inflight {
  id: symbol;
  stop: (pick: StackPick) => void;
}

let inflight: Inflight | null = null;

const PICKS: readonly StackPick[] = ["astro", "next", "vite-react", "sveltekit"];

const CONFIG: Record<StackPick, string> = {
  astro: "astro.config.ts",
  next: "next.config.ts",
  "vite-react": "vite.config.ts",
  sveltekit: "svelte.config.js",
};

export function registerInflight(session: Inflight | null): void {
  inflight = session;
}

export function cardFor(decision: StackDecision): FrameworkCard {
  return {
    pick: decision.pick,
    why: section(decision.markdown, "Why"),
    alternatives: section(decision.markdown, "Alternatives"),
    tradeoffs: section(decision.markdown, "What would change this"),
  };
}

export async function discussFramework(
  decision: StackDecision,
  deps: { ask: (card: unknown) => Promise<"accept" | { override: string }> },
): Promise<StackDecision> {
  const answer = await deps.ask(cardFor(decision));
  if (answer === "accept") return decision;
  const pick = parseOverride(answer.override);
  const next = overrideDecision(decision, pick);
  if (inflight !== null && pick !== decision.pick) {
    inflight.stop(pick);
  }
  return next;
}

export function inferSkeletonStack(skeleton: readonly SitePromptSkeleton[]): StackPick {
  const found = new Set<StackPick>();
  for (const entry of skeleton) {
    for (const file of entry.filesModified) {
      for (const stack of owners(file)) found.add(stack);
    }
  }
  if (found.size !== 1) {
    const shown = found.size === 0 ? "none" : [...found].join(", ");
    throw new StackError(`Cannot infer one stack from the skeleton (found ${shown}).`);
  }
  const pick = [...found][0];
  if (pick === undefined) {
    throw new StackError("Cannot infer one stack from the skeleton (found none).");
  }
  return pick;
}

/** Rewrite generated file paths from the skeleton's stack to `pick`. */
export function retargetSkeleton(
  skeleton: readonly SitePromptSkeleton[],
  pick: StackPick,
): SitePromptSkeleton[] {
  const from = inferSkeletonStack(skeleton);
  return skeleton.map((entry) => copyEntry(entry, retargetFiles(entry.filesModified, from, pick)));
}

function copyEntry(entry: SitePromptSkeleton, filesModified: string[]): SitePromptSkeleton {
  const next: SitePromptSkeleton = {
    id: entry.id,
    phase: entry.phase,
    slice: entry.slice,
    title: entry.title,
    tier: entry.tier,
    effort: entry.effort,
    model: entry.model,
    dependsOn: [...entry.dependsOn],
    filesModified,
    requirements: [...entry.requirements],
    protected: [...entry.protected],
    reviewAfter: entry.reviewAfter,
    maxTurns: entry.maxTurns,
    kind: entry.kind,
  };
  if (entry.library !== undefined) next.library = entry.library;
  return next;
}

function overrideDecision(previous: StackDecision, pick: StackPick): StackDecision {
  if (pick === previous.pick) {
    return { pick, markdown: previous.markdown, insisted: true };
  }
  const markdown = [
    "# STACK-DECISION",
    "",
    "## Pick",
    "",
    pick,
    "",
    "## Why",
    "",
    `The user insisted on ${label(pick)} (${pick}). The recorded pick was ${previous.pick}. The override replaces that pick, and the skeleton file paths are regenerated for ${pick}.`,
    pick === "sveltekit" ? "SvelteKit is the pick only because the user insisted. The 3D ecosystem is thinner." : "",
    "",
    "## Alternatives",
    "",
    alternatives(pick).join("\n"),
    "",
    "## What would change this",
    "",
    "A later user override of astro, next, vite-react, or sveltekit replaces this pick.",
    "A persistent canvas across routes selects Next.js when the level stays below 10.",
    "Choosing motion level 10 selects Vite plus React.",
    "",
    "## Versions",
    "",
    "Framework and library versions are not pinned in this record. When the site is created, re-resolve at install from the registry.",
    "",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");
  if (markdown.includes("!") || markdown.includes("\r")) {
    throw new StackError("Override markdown contained a forbidden mark.");
  }
  return { pick, markdown, insisted: true };
}

function parseOverride(value: string): StackPick {
  const text = value.trim().toLowerCase();
  if (text === "astro" || text === "next" || text === "vite-react" || text === "sveltekit") {
    return text;
  }
  throw new StackError(
    `Unknown stack override "${value}". Known picks: astro, next, vite-react, sveltekit.`,
  );
}

function section(markdown: string, title: string): string {
  const match = new RegExp(`^## ${title}\\s*$`, "m").exec(markdown);
  if (match === null) return "";
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = /^## /m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
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

function alternatives(pick: StackPick): string[] {
  const lines: string[] = [];
  for (const id of PICKS) {
    if (id === pick) continue;
    lines.push(`- ${id}: ${label(id)}. ${blurb(id)}`);
  }
  return lines;
}

function owners(file: string): StackPick[] {
  const found: StackPick[] = [];
  if (
    file === "astro.config.ts" ||
    file.startsWith("src/pages/") ||
    file.startsWith("src/layouts/") ||
    (file.startsWith("src/components/") && file.endsWith(".astro"))
  ) {
    found.push("astro");
  }
  if (
    file === "next.config.ts" ||
    file.startsWith("src/app/") ||
    (file.startsWith("src/components/") && file.endsWith(".tsx"))
  ) {
    found.push("next");
  }
  if (file === "vite.config.ts" || file === "index.html" || file.startsWith("src/world/")) {
    found.push("vite-react");
  }
  if (
    file === "svelte.config.js" ||
    file.startsWith("src/routes/") ||
    file.startsWith("src/lib/components/")
  ) {
    found.push("sveltekit");
  }
  return found;
}

type Role =
  | { kind: "config" }
  | { kind: "html" }
  | { kind: "shared"; file: string }
  | { kind: "home" }
  | { kind: "page"; slug: string }
  | { kind: "layout" }
  | { kind: "layout-extra" }
  | { kind: "component"; name: string }
  | { kind: "credits-page" };

function retargetFiles(files: readonly string[], from: StackPick, to: StackPick): string[] {
  if (from === to) return [...files];
  const roles = files.map((file) => classify(file, from));
  const kinds = new Set(roles.map((role) => role.kind));
  const only = (allowed: readonly Role["kind"][]): boolean =>
    roles.every((role) => allowed.includes(role.kind));
  if (only(["layout", "layout-extra"]) && kinds.has("layout")) return layoutFiles(to);
  if (only(["config", "html", "shared"]) && kinds.has("config")) {
    const scaffoldShared = roles.every((role) => role.kind !== "shared" || role.file === "tsconfig.json");
    if (scaffoldShared) return scaffoldFiles(to);
  }
  const out: string[] = [];
  for (const role of roles) {
    for (const file of emit(role, to)) {
      if (!out.includes(file)) out.push(file);
    }
  }
  return out;
}

function classify(file: string, stack: StackPick): Role {
  if (file === CONFIG[stack]) return { kind: "config" };
  if (file === "index.html") return { kind: "html" };
  if (stack === "astro") {
    if (file === "src/pages/index.astro") return { kind: "home" };
    if (file === "src/pages/credits.astro") return { kind: "credits-page" };
    const page = /^src\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)\.astro$/.exec(file);
    const slug = page?.[1];
    if (slug !== undefined) return { kind: "page", slug };
    if (/^src\/layouts\/[A-Za-z][A-Za-z0-9]*\.astro$/.test(file)) return { kind: "layout" };
    const component = /^src\/components\/([A-Za-z][A-Za-z0-9]*)\.astro$/.exec(file);
    const name = component?.[1];
    if (name !== undefined) return { kind: "component", name };
  }
  if (stack === "next") {
    if (file === "src/app/page.tsx") return { kind: "home" };
    if (file === "src/app/layout.tsx") return { kind: "layout" };
    if (file === "src/app/credits/page.tsx") return { kind: "credits-page" };
    const page = /^src\/app\/([a-z0-9]+(?:-[a-z0-9]+)*)\/page\.tsx$/.exec(file);
    const slug = page?.[1];
    if (slug !== undefined && slug !== "credits") return { kind: "page", slug };
    const component = /^src\/components\/([A-Za-z][A-Za-z0-9]*)\.tsx$/.exec(file);
    const name = component?.[1];
    if (name !== undefined) return { kind: "component", name };
  }
  if (stack === "vite-react") {
    if (file === "src/world/World.tsx") return { kind: "home" };
    if (file === "src/world/main.tsx") return { kind: "layout" };
    if (file === "src/world/Shell.tsx") return { kind: "layout-extra" };
    if (file === "src/world/Credits.tsx") return { kind: "credits-page" };
    const page = /^src\/world\/Page([A-Za-z][A-Za-z0-9]*)\.tsx$/.exec(file);
    const pascalName = page?.[1];
    if (pascalName !== undefined) return { kind: "page", slug: slugFromPascal(pascalName) };
    const component = /^src\/world\/([A-Za-z][A-Za-z0-9]*)\.tsx$/.exec(file);
    const name = component?.[1];
    if (name !== undefined) return { kind: "component", name };
  }
  if (stack === "sveltekit") {
    if (file === "src/routes/+page.svelte") return { kind: "home" };
    if (file === "src/routes/+layout.svelte") return { kind: "layout" };
    if (file === "src/routes/credits/+page.svelte") return { kind: "credits-page" };
    const page = /^src\/routes\/([a-z0-9]+(?:-[a-z0-9]+)*)\/\+page\.svelte$/.exec(file);
    const slug = page?.[1];
    if (slug !== undefined && slug !== "credits") return { kind: "page", slug };
    const component = /^src\/lib\/components\/([A-Za-z][A-Za-z0-9]*)\.svelte$/.exec(file);
    const name = component?.[1];
    if (name !== undefined) return { kind: "component", name };
  }
  return { kind: "shared", file };
}

function emit(role: Role, to: StackPick): string[] {
  switch (role.kind) {
    case "config":
      return [CONFIG[to]];
    case "html":
      return to === "vite-react" ? ["index.html"] : [];
    case "shared":
      return [role.file];
    case "home":
      return [homeFile(to)];
    case "page":
      return [pageFile(to, role.slug)];
    case "layout":
      return [firstLayout(to)];
    case "layout-extra":
      return to === "vite-react" ? ["src/world/Shell.tsx"] : [];
    case "component":
      return [componentFile(to, role.name)];
    case "credits-page":
      return [creditsPage(to)];
    default: {
      const neverRole: never = role;
      throw new StackError(`Unknown path role "${String(neverRole)}".`);
    }
  }
}

function homeFile(stack: SiteStack): string {
  switch (stack) {
    case "astro":
      return "src/pages/index.astro";
    case "next":
      return "src/app/page.tsx";
    case "vite-react":
      return "src/world/World.tsx";
    case "sveltekit":
      return "src/routes/+page.svelte";
    default: {
      const neverStack: never = stack;
      throw new StackError(`Unknown stack "${String(neverStack)}".`);
    }
  }
}

function pageFile(stack: SiteStack, slug: string): string {
  switch (stack) {
    case "astro":
      return `src/pages/${slug}.astro`;
    case "next":
      return `src/app/${slug}/page.tsx`;
    case "vite-react":
      return `src/world/Page${pascal(slug)}.tsx`;
    case "sveltekit":
      return `src/routes/${slug}/+page.svelte`;
    default: {
      const neverStack: never = stack;
      throw new StackError(`Unknown stack "${String(neverStack)}".`);
    }
  }
}

function firstLayout(stack: SiteStack): string {
  const file = layoutFiles(stack)[0];
  if (file === undefined) throw new StackError("Missing layout path.");
  return file;
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
    default: {
      const neverStack: never = stack;
      throw new StackError(`Unknown stack "${String(neverStack)}".`);
    }
  }
}

function scaffoldFiles(stack: SiteStack): string[] {
  switch (stack) {
    case "astro":
      return ["astro.config.ts", "tsconfig.json"];
    case "next":
      return ["next.config.ts", "tsconfig.json"];
    case "vite-react":
      return ["vite.config.ts", "tsconfig.json", "index.html"];
    case "sveltekit":
      return ["svelte.config.js", "tsconfig.json"];
    default: {
      const neverStack: never = stack;
      throw new StackError(`Unknown stack "${String(neverStack)}".`);
    }
  }
}

function creditsPage(stack: SiteStack): string {
  switch (stack) {
    case "astro":
      return "src/pages/credits.astro";
    case "next":
      return "src/app/credits/page.tsx";
    case "vite-react":
      return "src/world/Credits.tsx";
    case "sveltekit":
      return "src/routes/credits/+page.svelte";
    default: {
      const neverStack: never = stack;
      throw new StackError(`Unknown stack "${String(neverStack)}".`);
    }
  }
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
    default: {
      const neverStack: never = stack;
      throw new StackError(`Unknown stack "${String(neverStack)}".`);
    }
  }
}

function pascal(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function slugFromPascal(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}
