/**
 * Awwwards-style pattern usage (240c).
 * Scores what a built page does with pin, scrub, materials, post, text, camera,
 * and a reduced-motion branch. An import by itself is recorded and is not usage.
 * High appetite (7, the same line as the language pack) and a page that is not
 * text-led must compose those patterns. A text-led page and a lower appetite
 * are not failed for missing them. Slop and template clones fail at every appetite.
 * Vision scores are supplied by the caller. This module does not launch a model.
 */

import type { BeautyFailure } from "./beauty-gate.ts";
import { lintSlop } from "./antislop.ts";
import { juryFromRubric, type JuryResult } from "./jury.ts";
import { isTemplateClone } from "./visual-bench.ts";

/** Appetite at which a non-text page is expected to compose the advanced patterns. */
export const PATTERN_APPETITE = 7;

export interface PatternPage {
  page: string;
  section: string;
  html: string;
  scripts: readonly { file: string; source: string }[];
}

export interface VisionScores {
  design: number;
  usability: number;
  creativity: number;
  content: number;
}

export interface PatternInput {
  appetite: number;
  textLed: boolean;
  page: PatternPage;
  vision: VisionScores;
  templateSnippets?: readonly string[];
}

export interface PatternUsage {
  pin: boolean;
  scrub: boolean;
  material: boolean;
  post: boolean;
  textReveal: boolean;
  camera: boolean;
  reducedMotion: boolean;
}

export interface PatternDimensions {
  pinScrub: number;
  material: number;
  post: number;
  textReveal: number;
  camera: number;
  reducedMotion: number;
  developer: number;
}

export interface PatternScore {
  pass: boolean;
  reasons: string[];
  imported: string[];
  used: PatternUsage;
  dimensions: PatternDimensions;
}

const LIBRARY_NAMES: Readonly<Record<string, string>> = {
  gsap: "gsap",
  three: "three",
  lenis: "lenis",
  "@studio-freight/lenis": "lenis",
  postprocessing: "postprocessing",
  ogl: "ogl",
};

export function scorePatterns(input: PatternInput): PatternScore {
  const appetite = readAppetite(input.appetite);
  const textLed = readFlag(input.textLed, "textLed");
  const page = readPage(input.page);
  readVision(input.vision);
  const snippets = readSnippets(input.templateSnippets);
  const source = blankComments(pageSource(page));
  const imported = importedLibraries(source);
  const used = detectUsage(source);
  const animates = pageAnimates(source);
  const reasons = patternReasons(appetite, textLed, imported, used, animates);
  const visible = visibleText(page.html);
  const slop = lintSlop(visible, "site");
  if (slop.length > 0) {
    reasons.push(`AI slop: ${slop.map((hit) => hit.rule).join(", ")}`);
  }
  if (isTemplateClone(visible, snippets)) {
    reasons.push("Template clone: the visible copy overlaps a known template.");
  }
  return {
    pass: reasons.length === 0,
    reasons,
    imported,
    used,
    dimensions: dimensionsFor(used, imported, animates),
  };
}

/** Vision maps onto the fixed jury weights. A pattern failure blocks even a total of 100. */
export function juryWithPatterns(vision: VisionScores, scored: PatternScore): JuryResult {
  const scores = readVision(vision);
  if (!isScore(scored)) throw new Error("Pattern score is missing pass.");
  return juryFromRubric(scores, !scored.pass);
}

/** One remediation record per reason. A pass yields none. Paths stay inside the project. */
export function patternPageFailures(scored: PatternScore, page: PatternPage): BeautyFailure[] {
  if (!isScore(scored)) throw new Error("Pattern score is missing pass.");
  const scene = readPage(page);
  if (scored.pass) return [];
  const shot = `.hitchhiker/review/${slug(scene.page)}-${slug(scene.section)}.txt`;
  return scored.reasons.map((reason) => ({
    page: scene.page.trim(),
    section: scene.section.trim(),
    screenshot: shot,
    reason,
  }));
}

function patternReasons(
  appetite: number,
  textLed: boolean,
  imported: readonly string[],
  used: PatternUsage,
  animates: boolean,
): string[] {
  if (appetite < PATTERN_APPETITE || textLed) return [];
  const reasons: string[] = [];
  if (!used.pin) reasons.push("Pin density is 0. The page does not hold a section in view.");
  if (!used.scrub) reasons.push("Scrub density is 0. Scroll progress is not tied to the scene.");
  if (!used.material) reasons.push("No sophisticated material is composed in the scene.");
  if (!used.post) reasons.push("No post-processing pass is composed in the scene.");
  if (animates && !used.reducedMotion) {
    reasons.push("Reduced-motion fallback is incomplete while the page animates.");
  }
  const composed = used.pin && used.scrub && used.material && used.post;
  if (imported.length > 0 && !composed) {
    reasons.push("Libraries are imported and the pin, scrub, material, and post patterns are not used.");
  }
  return reasons;
}

function detectUsage(source: string): PatternUsage {
  const sticky = /position\s*:\s*sticky\b/i.test(source);
  const tall = /min-height\s*:\s*(?:1[5-9]\d|[2-9]\d{2,})vh\b/i.test(source);
  const pin = /\bpin\s*:\s*true\b/.test(source) || /\bdata-pin\b/i.test(source) || (sticky && tall);
  const scrub =
    /\bscrub\s*:\s*(?:true|[0-9])/.test(source) ||
    /animation-timeline\s*:/.test(source) ||
    /scroll-timeline\s*:/.test(source);
  const material =
    /\bMeshPhysicalMaterial\b/.test(source) ||
    /\btransmission\s*:/.test(source) ||
    /\biridescence\b/.test(source) ||
    /\bclearcoat\s*:/.test(source) ||
    /\bRawShaderMaterial\b/.test(source) ||
    /\bShaderMaterial\b/.test(source) ||
    /\bfragmentShader\s*:/.test(source) ||
    /\bior\s*:/.test(source);
  const post =
    /new\s+EffectComposer\b/.test(source) ||
    /<EffectComposer\b/.test(source) ||
    /\bUnrealBloomPass\b/.test(source) ||
    /\bcomposer\.addPass\s*\(/.test(source) ||
    /new\s+(?:Bloom|Vignette|Noise|ChromaticAberration|DepthOfField)\b/.test(source);
  const textReveal =
    /\bSplitText\b/.test(source) ||
    /\byPercent\s*:\s*100\b/.test(source) ||
    /\bmask\s*:\s*["']lines["']/.test(source) ||
    /clip-path\s*:/.test(source);
  const camera =
    /\bCatmullRomCurve3\b/.test(source) ||
    /\bcamera\.position\b/.test(source) ||
    /\.lookAt\s*\(/.test(source) ||
    /\bfov\b/.test(source) ||
    /\bdamp3?\b/.test(source) ||
    /\bmaath\b/.test(source);
  const reducedQuery = /prefers-reduced-motion/.test(source);
  const reducedAction =
    /opacity\s*:\s*1\b/.test(source) ||
    /autoAlpha\s*:\s*1\b/.test(source) ||
    /animation\s*:\s*none\b/.test(source) ||
    /\bgsap\.set\s*\(/.test(source) ||
    /\bimmediate\s*:\s*true\b/.test(source);
  return {
    pin,
    scrub,
    material,
    post,
    textReveal,
    camera,
    reducedMotion: reducedQuery && reducedAction,
  };
}

function pageAnimates(source: string): boolean {
  return (
    /\bgsap\s*\./.test(source) ||
    /\bWebGLRenderer\b/.test(source) ||
    /\bgetContext\s*\(\s*["']webgl2?["']/.test(source) ||
    /\bScrollTrigger\b/.test(source) ||
    /animation-timeline\s*:/.test(source) ||
    /scroll-timeline\s*:/.test(source) ||
    /\blenis\b/i.test(source)
  );
}

function dimensionsFor(
  used: PatternUsage,
  imported: readonly string[],
  animates: boolean,
): PatternDimensions {
  const pinCount = Number(used.pin) + Number(used.scrub);
  let developer = 6;
  if (used.pin && used.scrub) developer += 1;
  if (used.material) developer += 1;
  if (used.post) developer += 1;
  if (used.textReveal) developer += 0.5;
  if (used.camera) developer += 0.5;
  if (used.reducedMotion || !animates) developer += 1;
  else developer -= 2;
  const composed = used.pin && used.scrub && used.material && used.post;
  if (imported.length > 0 && !composed) developer -= 2;
  return {
    pinScrub: pinCount === 2 ? 9 : pinCount === 1 ? 5 : 2,
    material: used.material ? 9 : 2,
    post: used.post ? 9 : 2,
    textReveal: used.textReveal ? 8 : 4,
    camera: used.camera ? 8 : 4,
    reducedMotion: used.reducedMotion ? 9 : animates ? 2 : 8,
    developer: clampScore(developer),
  };
}

function importedLibraries(source: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const add = (specifier: string): void => {
    const name = libraryName(specifier);
    if (name === null || seen.has(name)) return;
    seen.add(name);
    found.push(name);
  };
  for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
    if (match[1] !== undefined) add(match[1]);
  }
  for (const match of source.matchAll(/\bimport\s+["']([^"']+)["']/g)) {
    if (match[1] !== undefined) add(match[1]);
  }
  return found;
}

function libraryName(specifier: string): string | null {
  const bare = specifier.trim();
  if (bare.startsWith("@")) {
    const parts = bare.split("/");
    const scoped = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : bare;
    return LIBRARY_NAMES[scoped] ?? null;
  }
  const head = bare.split("/")[0] ?? "";
  return LIBRARY_NAMES[head] ?? null;
}

function pageSource(page: PatternPage): string {
  const parts = [page.html];
  for (const script of page.scripts) parts.push(script.source);
  return parts.join("\n");
}

function visibleText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
}

function blankComments(source: string): string {
  const markup = source.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, " "));
  const blocks = markup.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return blocks.replace(/(^|[^:])\/\/[^\n]*/g, (match, lead: string) => {
    const pad = Math.max(0, match.length - lead.length);
    return lead + " ".repeat(pad);
  });
}

function readAppetite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("appetite must be a finite number.");
  }
  return value;
}

function readFlag(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be true or false.`);
  return value;
}

function readVision(value: unknown): VisionScores {
  if (!isRecord(value)) throw new Error("vision scores must be design, usability, creativity, and content.");
  return {
    design: readUnit("design", value.design),
    usability: readUnit("usability", value.usability),
    creativity: readUnit("creativity", value.creativity),
    content: readUnit("content", value.content),
  };
}

function readUnit(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`${name} must be a finite score from 0 to 10.`);
  }
  return value;
}

function readPage(value: unknown): PatternPage {
  if (!isRecord(value)) throw new Error("page must include page, section, html, and scripts.");
  const page = readText(value.page, "page");
  const section = readText(value.section, "section");
  const html = readText(value.html, "html");
  if (!Array.isArray(value.scripts)) throw new Error("scripts must be a list.");
  const scripts = value.scripts.map((script, index) => {
    if (!isRecord(script)) throw new Error(`script ${index} must include file and source.`);
    return { file: readText(script.file, "file"), source: readText(script.source, "source") };
  });
  return { page, section, html, scripts };
}

function readSnippets(value: unknown): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("templateSnippets must be a list of strings.");
  }
  return value;
}

function readText(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`${name} must be a string.`);
  return value;
}

function isScore(value: unknown): value is PatternScore {
  return isRecord(value) && typeof value.pass === "boolean" && Array.isArray(value.reasons);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampScore(value: number): number {
  return Math.min(10, Math.max(0, value));
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned === "" ? "section" : cleaned;
}
