/**
 * Design language block for a desk prompt.
 * Deterministic: the same prompt, art direction, and library text produce
 * the same block. No model call.
 *
 * Patterns stay within about 4,000 tokens. The gate card stays under 800
 * and is not cut to make the patterns fit. Golden text is an example.
 */

import { readFileSync } from "node:fs";
import { packagedPath } from "../packaged-dir.ts";
import { styleWorldFrom } from "./art-direction.ts";
import { FIT_REQUEST_CAPS, goldenName, pickGolden } from "./author.ts";
import { estimateTokens } from "./context-doc.ts";
import { languageBlockFor, languageQueryFrom } from "./language-pack.ts";
import type { SitePromptSkeleton } from "./site-prompts.ts";
import { MISSING_FACT_FALLBACK } from "./site-rules.ts";
import { expandIngredientIncludes } from "./section-refs.ts";
import { expandSkillIncludes, loadSkillPacks, planSkillLines, siteTypeForWorld } from "./skills.ts";

export { styleWorldFrom };

export const DESIGN_PATTERN_TOKEN_CAP = 4_000;
export const DESIGN_GATE_TOKEN_CAP = 800;

export const DESIGN_FRAMING =
  "This is direction and vocabulary, not a limit. Use your own judgement to make this section more beautiful than the references. Keep the honesty, accessibility and performance rules. Remix, improve and add your own ideas; never copy a reference wholesale.";

export const DESIGN_EXAMPLE_LINE =
  "The golden template below is an example inside this packet, not the only legal output.";

export const DESIGN_REMIX_LINE = "Take the thinking, not the skin.";
export const DESIGN_REMIX_DETAIL =
  "These are inspiration for the language of what is possible. Remix, improve and add your own idea; do not reproduce an entry.";

export interface GalleryNote {
  styleWorld: string;
  name: string;
  why: string;
  borrow: string;
}

export interface PickedDesignNote {
  sectionType: string;
  title: string;
  promptLanguage: string;
  techniqueNote: string;
}

export interface DesignPackNote {
  name: string;
  stale: boolean;
  excerpt: string;
}

/** Shown when selection throws. The plan still runs. The library did not. */
export const NO_ART_DIRECTION_NOTE =
  "No art direction: the design library failed to load (see library-error.txt).";

export interface DesignLibrary {
  goldenDir: string;
  recipes: string;
  gallery: readonly GalleryNote[];
  assetsMarkdown: string;
  facts: string;
  styleText: string;
  picked?: readonly PickedDesignNote[];
  packs?: readonly DesignPackNote[];
  /** Set when selection failed. Absent when the library loaded. */
  artDirection?: "none";
}

export function designLanguageFor(
  prompt: SitePromptSkeleton,
  artDirection: string,
  library: DesignLibrary,
): string {
  const section = sectionIdOf(prompt);
  const golden = fillSlots(readGolden(prompt, library.goldenDir), prompt, section);
  const notes = techniqueNotes(prompt, library, goldenName(prompt));
  const fitted = fitPatterns(golden, notes);
  const assets = assetPaths(library.assetsMarkdown, section);
  const gate = gateCard(library.facts, assets);
  const direction = oneLine(artDirection, "Follow the site brief and add one signature idea of your own.");
  const libraryBlock = libraryLines(library, section);
  const languageQuery = languageQueryFrom(section, direction, library.styleText);
  const language = languageBlockFor(languageQuery);
  const skills = section === "" ? "" : skillBlock(section, direction, languageQuery.appetite, library.styleText);
  const ingredients = ingredientBlock(prompt);
  const missing = library.artDirection === "none" ? [NO_ART_DIRECTION_NOTE, ""] : [];
  return [
    ...missing,
    DESIGN_FRAMING,
    "",
    DESIGN_REMIX_LINE,
    DESIGN_REMIX_DETAIL,
    ...(libraryBlock === "" ? [] : ["", libraryBlock]),
    "",
    "### Art direction",
    "",
    direction,
    ...(language === "" ? [] : ["", language]),
    ...(skills === "" ? [] : ["", skills]),
    ...(ingredients === "" ? [] : ["", ingredients]),
    "",
    "### Example",
    "",
    DESIGN_EXAMPLE_LINE,
    "",
    fitted.golden,
    "",
    "### Technique notes",
    "",
    fitted.notes,
    "",
    "### Gates",
    "",
    gate,
  ].join("\n");
}

export function knowledgeRoot(): string {
  return packagedPath(["knowledge"], "packs");
}

export function sectionIdOf(prompt: SitePromptSkeleton): string {
  for (const req of prompt.requirements) {
    if (req === "REQ-ART-DIRECTION") continue;
    const art = /^REQ-ART-(.+)$/.exec(req);
    if (art?.[1] !== undefined && art[1] !== "") return art[1];
    const match = /^REQ-(?:STRUCT|IMAGE|COPY|FX)-(.+)$/.exec(req);
    if (match?.[1] !== undefined && match[1] !== "") return match[1];
  }
  const directed = /^Art-direct the (.+) section:/i.exec(prompt.title);
  if (directed?.[1] !== undefined) return slug(directed[1]);
  const layout = /^Build the (.+) layout on /i.exec(prompt.title);
  if (layout?.[1] !== undefined) return slug(layout[1]);
  const image = /^Art-direct and place the image set for ([^:]+):/i.exec(prompt.title);
  if (image?.[1] !== undefined) return slug(image[1]);
  return "";
}

function ingredientBlock(prompt: SitePromptSkeleton): string {
  const corpus = [prompt.title, ...(prompt.acceptance ?? [])].join("\n");
  if (!/@section:|@template:/.test(corpus)) return "";
  const expanded = expandIngredientIncludes(corpus);
  return ["### Ingredients", "", expanded.text].join("\n");
}

function skillBlock(section: string, artDirection: string, appetite: number, styleText: string): string {
  const lines = planSkillLines({
    siteType: siteTypeForWorld(styleWorldFrom(`${styleText}\n${artDirection}`)),
    motionAppetite: appetite,
    sectionKind: section,
    artDirection,
  });
  if (lines === "") return "";
  const expanded = expandSkillIncludes(lines, loadSkillPacks());
  return ["### Skills", "", expanded.text].join("\n");
}

function libraryLines(library: DesignLibrary, section: string): string {
  const picked = (library.picked ?? []).filter((note) => section === "" || note.sectionType === section).slice(0, 4);
  const packs = (library.packs ?? []).filter((pack) => !pack.stale && pack.excerpt.trim() !== "").slice(0, 2);
  if (picked.length === 0 && packs.length === 0) return "";
  const lines = picked.flatMap((note) => [`- ${note.title}: ${note.promptLanguage}`, `Technique: ${note.techniqueNote}`]);
  for (const pack of packs) lines.push(pack.excerpt.trim());
  return lines.join("\n");
}

function readGolden(prompt: SitePromptSkeleton, goldenDir: string): string {
  try {
    return readFileSync(pickGolden(prompt, goldenDir), "utf8");
  } catch {
    return "Build this section from the art direction. This example uses the library that serves the brand.";
  }
}

function fillSlots(template: string, prompt: SitePromptSkeleton, section: string): string {
  const files = prompt.filesModified.length > 0 ? prompt.filesModified.join(", ") : "the files named in the task";
  const library = prompt.library ?? "the library that serves the art direction";
  const page = prompt.route ?? "the page";
  const element = section === "" ? "the section" : section;
  const sectionSlot = section !== "" ? section : fallbackSectionSlot(prompt);
  let next = template
    .replaceAll("{{files}}", files)
    .replaceAll("{{library}}", library)
    .replaceAll("{{element}}", element)
    .replaceAll("{{page}}", page)
    .replaceAll("{{section}}", sectionSlot)
    .replaceAll("{{anchor}}", "section-plan");
  next = next.replace(/\{\{[^{}]+\}\}/g, "the reference");
  return next;
}

function fallbackSectionSlot(prompt: SitePromptSkeleton): string {
  return prompt.title.trim().replace(/\.+$/, "").toLowerCase() || "the section";
}

function techniqueNotes(prompt: SitePromptSkeleton, library: DesignLibrary, golden: string): string {
  const recipe = recipeExcerpt(library.recipes, prompt, golden);
  const gallery = galleryExcerpt(library.gallery, library.styleText);
  const combined = [recipe, gallery].filter((part) => part.trim() !== "").join("\n\n");
  if (combined.trim() === "") {
    return "Technique: choose the motion and the layout that serve the art direction, and keep a reduced-motion version that stays complete.";
  }
  return combined.replaceAll("!", "");
}

function recipeExcerpt(recipes: string, prompt: SitePromptSkeleton, golden: string): string {
  const sections = splitH2(recipes);
  if (sections.length === 0) return "";
  const want = (prompt.library ?? "").toLowerCase();
  const title = prompt.title.toLowerCase();
  const picked = sections.filter((section) => {
    const heading = section.heading.toLowerCase();
    if (want !== "" && heading.includes(want)) return true;
    if ((golden === "hero" || golden === "motion") && /gsap|lenis|split/.test(heading)) return true;
    if (golden === "lenis" && heading.includes("lenis")) return true;
    if (golden === "shader" || golden === "three") return /react|three|shader/.test(heading);
    if (title.includes("reveal") && /scroll|reveal|css/.test(heading)) return true;
    return false;
  });
  const chosen = (picked.length > 0 ? picked : sections.slice(0, 1)).slice(0, 2);
  return chosen
    .map((section) => `Technique: ${section.heading}\n${clip(section.body, 1_200)}`)
    .join("\n\n");
}

function galleryExcerpt(rows: readonly GalleryNote[], styleText: string): string {
  if (rows.length === 0) return "";
  const world = styleWorldFrom(styleText);
  const matched = rows.filter((row) => row.styleWorld === world);
  const chosen = (matched.length > 0 ? matched : rows).slice(0, 2);
  return chosen
    .map((row) => `Technique: ${row.name}. ${oneLine(row.why, "")} ${oneLine(row.borrow, "")}`.trim())
    .join("\n");
}

function assetPaths(markdown: string, section: string): string[] {
  if (section === "") return [];
  const needle = section.toLowerCase();
  const found: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    const lower = line.toLowerCase();
    if (lower.includes("| slot |") || lower.includes("| --- |") || lower.includes("| saved |")) continue;
    if (!lower.includes(needle)) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter((cell) => cell !== "");
    for (const cell of cells) {
      const rel = relativeAsset(cell);
      if (rel !== null && !found.includes(rel)) found.push(rel);
    }
  }
  return found;
}

function relativeAsset(value: string): string | null {
  const cleaned = value.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (cleaned === "" || cleaned.startsWith("/") || /^[a-zA-Z]:/.test(cleaned)) return null;
  if (cleaned.split("/").some((part) => part === ".." || part === "")) return null;
  if (!/^(src|public|\.hitchhiker)\//.test(cleaned)) return null;
  if (!/\.[a-z0-9]+$/i.test(cleaned)) return null;
  return cleaned;
}

function gateCard(facts: string, assets: readonly string[]): string {
  const fallback = MISSING_FACT_FALLBACK;
  const build = (factLine: string, paths: readonly string[]): string => {
    const assetLine = paths.length === 0 ? "none for this section yet" : paths.join(", ");
    return [
      `Facts allowed: ${factLine}`,
      "Contrast pairs: body text at least 4.5 to 1, large text at least 3 to 1.",
      "Reduced motion: Reduced motion stays visible and complete.",
      `Asset paths: ${assetLine}`,
      "License: Keep the credit line and the license text for any open-source code you borrow.",
      "Performance budget: phone Lighthouse at least 90, LCP at most 2.5 seconds, CLS at most 0.1.",
    ].join("\n");
  };
  const full = build(clipWords(oneLine(facts, fallback), 80), assets.slice(0, 8));
  if (estimateTokens(full) <= DESIGN_GATE_TOKEN_CAP) return full;
  return build(fallback, assets.slice(0, 4));
}

function fitPatterns(golden: string, notes: string): { golden: string; notes: string } {
  let nextNotes = notes.length > FIT_REQUEST_CAPS.pack ? `${notes.slice(0, FIT_REQUEST_CAPS.pack)}\n[technique notes trimmed]` : notes;
  let nextGolden = golden.length > FIT_REQUEST_CAPS.template ? `${golden.slice(0, FIT_REQUEST_CAPS.template)}\n[example trimmed]` : golden;
  while (estimateTokens(`${nextGolden}\n${nextNotes}`) > DESIGN_PATTERN_TOKEN_CAP && nextNotes.length > 160) {
    nextNotes = `${nextNotes.slice(0, Math.floor(nextNotes.length * 0.7)).trim()}\n[technique notes trimmed]`;
  }
  while (estimateTokens(`${nextGolden}\n${nextNotes}`) > DESIGN_PATTERN_TOKEN_CAP && nextGolden.length > 400) {
    nextGolden = `${nextGolden.slice(0, Math.floor(nextGolden.length * 0.8)).trim()}\n[example trimmed]`;
  }
  return { golden: nextGolden, notes: nextNotes };
}

function splitH2(markdown: string): Array<{ heading: string; body: string }> {
  const parts = markdown.split(/^## /m);
  const sections: Array<{ heading: string; body: string }> = [];
  for (const part of parts.slice(1)) {
    const breakAt = part.indexOf("\n");
    const heading = (breakAt === -1 ? part : part.slice(0, breakAt)).trim();
    const body = breakAt === -1 ? "" : part.slice(breakAt + 1).trim();
    if (heading !== "") sections.push({ heading, body });
  }
  return sections;
}

function clip(text: string, cap: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= cap) return flat;
  return `${flat.slice(0, cap).trim()} [trimmed]`;
}

function clipWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter((word) => word !== "");
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function oneLine(value: string, fallback: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat === "" ? fallback : flat;
}

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
