/**
 * Static checks for the scroll and WebGL recipes.
 * A finding names the broken rule. A page that does not use that pattern is left alone.
 * Libraries stay available. The check reports two owners, a missing sync, or a layout tween.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type RecipeRule =
  | "two-scroll-owners"
  | "lenis-ticker"
  | "layout-properties"
  | "refresh-after-media"
  | "horizontal-ease"
  | "scrollto-with-lenis"
  | "reduced-motion"
  | "webgl-context";

export interface RecipeFinding {
  file: string;
  rule: RecipeRule;
  line: number;
  detail: string;
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".hitchhiker", "coverage"]);
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".css", ".astro", ".vue", ".svelte"]);

const LAYOUT_KEY =
  /\b(width|height|top|left|right|bottom|margin|padding|marginTop|marginRight|marginBottom|marginLeft|paddingTop|paddingRight|paddingBottom|paddingLeft|fontSize|gap|minWidth|maxWidth|minHeight|maxHeight)\s*:/;

export function checkRecipes(source: string, file = "page.ts"): RecipeFinding[] {
  const text = blankComments(source);
  const findings: RecipeFinding[] = [];
  const seen = new Set<RecipeRule>();
  const add = (rule: RecipeRule, index: number, detail: string): void => {
    if (seen.has(rule)) return;
    seen.add(rule);
    findings.push({ file, rule, line: lineAt(text, index), detail });
  };

  const lenis = lenisActive(text);
  const cssScroll = /animation-timeline\s*:|scroll-timeline\s*:/.exec(text);
  if (lenis && cssScroll?.index !== undefined) {
    add(
      "two-scroll-owners",
      cssScroll.index,
      "Lenis and a CSS scroll timeline are both scroll owners on this page.",
    );
  }

  if (lenis) {
    const scrollSync = /lenis\.on\(\s*["']scroll["']\s*,\s*ScrollTrigger\.update\s*\)/.test(text);
    const ticker = /gsap\.ticker\.add\([\s\S]*?lenis\.raf\s*\(/.test(text);
    const lag = /gsap\.ticker\.lagSmoothing\(\s*0\s*\)/.test(text);
    if (!scrollSync || !ticker || !lag) {
      const missing = [
        scrollSync ? "" : 'lenis.on("scroll", ScrollTrigger.update)',
        ticker ? "" : "gsap.ticker.add with lenis.raf",
        lag ? "" : "gsap.ticker.lagSmoothing(0)",
      ].filter((part) => part !== "");
      const at = text.search(/\bnew\s+Lenis\b|from\s+["']lenis["']/);
      add("lenis-ticker", at < 0 ? 0 : at, `Lenis is missing ticker sync: ${missing.join(", ")}.`);
    }
  }

  const layoutAt = layoutIndex(text);
  if (layoutAt >= 0) {
    add("layout-properties", layoutAt, "A tween animates a layout property. Transform and opacity keep the frame stable.");
  }

  if (usesScrollTrigger(text)) {
    const refresh = /\bScrollTrigger\.refresh\s*\(/.test(text);
    const fonts = /\bdocument\.fonts\b|\bfonts\.ready\b/.test(text);
    const images = /\bdocument\.images\b|\bHTMLImageElement\b|addEventListener\(\s*["']load["']/.test(text);
    if (!refresh || !fonts || !images) {
      const missing = [
        refresh ? "" : "ScrollTrigger.refresh()",
        fonts ? "" : "a font load",
        images ? "" : "an image load",
      ].filter((part) => part !== "");
      const at = text.search(/\bScrollTrigger\b|\bscrollTrigger\s*:/);
      add(
        "refresh-after-media",
        at < 0 ? 0 : at,
        `ScrollTrigger has no refresh after fonts and images. Missing: ${missing.join(", ")}.`,
      );
    }
  }

  const track = /\bxPercent\s*:/.exec(text);
  if (track?.index !== undefined && !/ease\s*:\s*["']none["']/.test(text)) {
    add("horizontal-ease", track.index, 'A horizontal track is missing ease: "none", so it will not stay linear with the scroll.');
  }

  if (lenis && (/\bScrollToPlugin\b/.test(text) || /\bscrollTo\s*:/.test(text))) {
    const at = text.search(/\bScrollToPlugin\b|\bscrollTo\s*:/);
    add("scrollto-with-lenis", at < 0 ? 0 : at, "ScrollToPlugin is active while Lenis owns the scroll.");
  }

  if (animates(text) && !/prefers-reduced-motion/.test(text)) {
    const at = text.search(/\bgsap\s*\.|\bnew\s+Lenis\b|\bScrollTrigger\b|\bWebGLRenderer\b|<Canvas\b|animation-timeline\s*:/);
    add("reduced-motion", at < 0 ? 0 : at, "This page animates without a prefers-reduced-motion branch.");
  }

  const contexts = webglIndexes(text);
  const second = contexts[1];
  if (second !== undefined) {
    add("webgl-context", second, `This page opens ${contexts.length} WebGL contexts.`);
  }

  return findings;
}

export function checkRecipeDir(root: string): RecipeFinding[] {
  const files: string[] = [];
  collect(root, files);
  const hits: RecipeFinding[] = [];
  for (const file of files) {
    let source = "";
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file).replaceAll("\\", "/");
    hits.push(...checkRecipes(source, rel));
  }
  return hits;
}

function lenisActive(source: string): boolean {
  if (/\bnew\s+Lenis\b/.test(source)) return true;
  return /(?:^|\n)\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+["']lenis["']/.test(source);
}

function usesScrollTrigger(source: string): boolean {
  return /\bScrollTrigger\b/.test(source) || /\bscrollTrigger\s*:/.test(source);
}

function animates(source: string): boolean {
  return (
    /\bgsap\s*\./.test(source) ||
    lenisActive(source) ||
    usesScrollTrigger(source) ||
    webglIndexes(source).length > 0 ||
    /animation-timeline\s*:|scroll-timeline\s*:/.test(source)
  );
}

function layoutIndex(source: string): number {
  const call = /gsap\s*\.\s*(?:to|from|fromTo|set)\s*\(/g;
  for (const match of source.matchAll(call)) {
    if (match.index === undefined) continue;
    const block = parenBlock(source, match.index + match[0].length);
    if (block === null) continue;
    const key = LAYOUT_KEY.exec(block.text);
    if (key?.index !== undefined) return block.start + key.index;
  }
  const css = /transition(?:-property)?\s*:\s*[^;}{]*\b(?:width|height|top|left|margin|padding)\b/.exec(source);
  if (css?.index !== undefined) return css.index;
  return -1;
}

function parenBlock(source: string, openIndex: number): { text: string; start: number } | null {
  let depth = 1;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i] ?? "";
    if (quote !== null) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { text: source.slice(openIndex, i), start: openIndex };
    }
  }
  return null;
}

function webglIndexes(source: string): number[] {
  const indexes: number[] = [];
  const patterns = [
    /new\s+(?:[A-Za-z_$][\w$]*\.)?WebGLRenderer\s*\(/g,
    /getContext\(\s*["']webgl2?["']\s*\)/g,
    /<Canvas\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match.index !== undefined) indexes.push(match.index);
    }
  }
  indexes.sort((left, right) => left - right);
  return indexes;
}

function lineAt(source: string, index: number): number {
  let line = 1;
  const end = Math.min(Math.max(index, 0), source.length);
  for (let i = 0; i < end; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

function blankComments(source: string): string {
  const blocks = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return blocks.replace(/(^|[^:])\/\/[^\n]*/g, (match, lead: string) => {
    const pad = Math.max(0, match.length - lead.length);
    return lead + " ".repeat(pad);
  });
}

function collect(dir: string, into: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collect(full, into);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    into.push(full);
  }
}
