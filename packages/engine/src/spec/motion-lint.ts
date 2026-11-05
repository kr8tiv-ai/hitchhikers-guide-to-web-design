/**
 * Static motion lint (245w). Extends the scroll and WebGL recipe checks.
 * Site code under src/ is held to one scroll owner, the motion constitution,
 * and the compose rule. Library files (design-system motion, src/hh, the
 * generated motion module, motion-tokens) keep the structural checks only.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  allowedEases,
  durationAllowed,
  parseMotionConstitution,
  type MotionConstitution,
} from "./motion-constitution.ts";

export type RecipeRule =
  | "two-scroll-owners"
  | "lenis-ticker"
  | "layout-properties"
  | "refresh-after-media"
  | "horizontal-ease"
  | "scrollto-with-lenis"
  | "reduced-motion"
  | "webgl-context";

export type MotionLintRule =
  | RecipeRule
  | "lenis-raf-loop"
  | "scrub-layout"
  | "scrub-filter"
  | "nested-scroll-trigger"
  | "duplicate-tween"
  | "batch-list"
  | "cleanup"
  | "direct-motion"
  | "constitution-ease"
  | "constitution-duration"
  | "constitution-count";

export interface MotionFinding {
  file: string;
  rule: MotionLintRule;
  line: number;
  detail: string;
  fix: string;
}

export interface InspectOptions {
  constitution?: MotionConstitution | null;
  /** When omitted, paths under src/ (except the motion libraries) are site code. */
  direct?: boolean;
}

interface CallBlock {
  index: number;
  name: string;
  kind: string;
  block: string;
}

interface Bag {
  text: string;
  file: string;
  findings: MotionFinding[];
  seen: Set<string>;
  constitution: MotionConstitution | null;
  direct: boolean;
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".hitchhiker", "coverage"]);
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx", ".css", ".astro", ".vue", ".svelte"]);

const LAYOUT_KEY =
  /\b(width|height|top|left|right|bottom|margin|padding|marginTop|marginRight|marginBottom|marginLeft|paddingTop|paddingRight|paddingBottom|paddingLeft|fontSize|gap|minWidth|maxWidth|minHeight|maxHeight)\s*:/;

const FILTER_KEY = /\bfilter\s*:/;

const SKIP_PROP = new Set([
  "duration",
  "ease",
  "delay",
  "stagger",
  "scrollTrigger",
  "overwrite",
  "repeat",
  "yoyo",
  "immediateRender",
  "onComplete",
  "onUpdate",
  "onStart",
  "onReverseComplete",
  "id",
  "data",
  "paused",
  "lazy",
  "callbackScope",
]);

const GSAP_CALL = /\bgsap\s*\.\s*(to|from|fromTo|set|timeline)\s*\(/g;
const CHILD_CALL = /\b([A-Za-z_$][\w$]*)\s*\.\s*(to|from|fromTo)\s*\(/g;

export function isSiteMotionFile(file: string): boolean {
  const rel = file.replaceAll("\\", "/");
  if (!/(^|\/)src\//.test(rel)) return false;
  if (rel.includes("design-system/src/motion") || rel.includes("design-system/src/recipes")) return false;
  if (rel.includes("/src/hh/") || rel.endsWith("/src/hh")) return false;
  if (rel.endsWith("/src/scripts/motion.ts") || rel.endsWith("src/scripts/motion.ts")) return false;
  if (rel.endsWith("/src/styles/motion-tokens.ts") || rel.endsWith("src/styles/motion-tokens.ts")) return false;
  return true;
}

export function inspectMotion(source: string, file = "page.ts", options: InspectOptions = {}): MotionFinding[] {
  const text = blankComments(source);
  const bag: Bag = {
    text,
    file,
    findings: [],
    seen: new Set<string>(),
    constitution: options.constitution ?? null,
    direct: options.direct ?? isSiteMotionFile(file),
  };
  const gsapCalls = callBlocks(text, GSAP_CALL, "gsap");
  const childCalls = callBlocks(text, CHILD_CALL, "").filter((call) => call.name !== "gsap");
  ruleOwners(bag);
  ruleLenisTicker(bag);
  ruleRafLoop(bag);
  ruleLayout(bag);
  ruleScrub(bag, gsapCalls, childCalls);
  ruleNested(bag, childCalls);
  ruleDuplicate(bag, gsapCalls);
  ruleBatch(bag);
  ruleRefresh(bag, gsapCalls);
  ruleHorizontal(bag);
  ruleScrollTo(bag);
  ruleReduced(bag);
  ruleCleanup(bag);
  ruleWebgl(bag);
  ruleDirect(bag);
  ruleConstitution(bag);
  return bag.findings;
}

/** Structural walk. Constitution counts are added by lintMotion. */
export function lintMotionFiles(root: string): MotionFinding[] {
  const hits: MotionFinding[] = [];
  for (const file of collectFiles(root)) {
    let source = "";
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file).replaceAll("\\", "/");
    hits.push(...inspectMotion(source, rel));
  }
  return hits;
}

/** Project lint. Reads DESIGN.md and holds site files to that constitution. */
export function lintMotion(projectDir: string): MotionFinding[] {
  const designPath = path.join(projectDir, "DESIGN.md");
  const markdown = existsSync(designPath) ? readFileSync(designPath, "utf8") : "";
  const constitution = markdown === "" ? null : parseMotionConstitution(markdown);
  const hits: MotionFinding[] = constitutionCount(markdown, constitution);
  for (const file of collectFiles(projectDir)) {
    let source = "";
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(projectDir, file).replaceAll("\\", "/");
    const site = isSiteMotionFile(rel);
    hits.push(
      ...inspectMotion(source, rel, {
        constitution: site ? constitution : null,
        direct: site,
      }),
    );
  }
  return hits;
}

export function formatMotionFinding(finding: { file: string; line?: number; detail: string; fix?: string }): string {
  const at = finding.line === undefined ? finding.file : `${finding.file}:${finding.line}`;
  const fix = finding.fix?.trim() ?? "";
  return fix === "" ? `${at} ${finding.detail}` : `${at} ${finding.detail} Fix: ${fix}`;
}

/** Per-prompt close. Empty when the prompt owns no source file. */
export function motionLintReason(projectDir: string, files: readonly string[]): string {
  const owned = files.filter((file) => {
    const rel = file.replaceAll("\\", "/");
    if (rel.includes("..")) return false;
    return SOURCE_EXT.has(path.extname(rel).toLowerCase());
  });
  if (owned.length === 0) return "";
  const designPath = path.join(projectDir, "DESIGN.md");
  const markdown = existsSync(designPath) ? readFileSync(designPath, "utf8") : "";
  const constitution = markdown === "" ? null : parseMotionConstitution(markdown);
  const lines: string[] = [];
  for (const rel of owned) {
    const normalized = rel.replaceAll("\\", "/");
    const full = path.join(projectDir, normalized);
    if (!existsSync(full)) continue;
    const source = readFileSync(full, "utf8");
    const site = isSiteMotionFile(normalized);
    for (const finding of inspectMotion(source, normalized, {
      constitution: site ? constitution : null,
      direct: site,
    })) {
      lines.push(formatMotionFinding(finding));
    }
  }
  if (lines.length === 0) return "";
  return `Motion lint failed. ${lines.join(" ")}`;
}

function constitutionCount(markdown: string, constitution: MotionConstitution | null): MotionFinding[] {
  if (constitution === null || markdown === "") return [];
  const hits: MotionFinding[] = [];
  if (constitution.easings.length > 3) {
    const at = markdown.search(/^Easings:/m);
    hits.push({
      file: "DESIGN.md",
      rule: "constitution-count",
      line: lineAt(markdown, at < 0 ? 0 : at),
      detail: `The motion constitution names ${constitution.easings.length} easings. The cap is 3.`,
      fix: "Keep at most 3 named easings.",
    });
  }
  if (constitution.bands.length > 2) {
    const at = markdown.search(/^Duration bands:/m);
    hits.push({
      file: "DESIGN.md",
      rule: "constitution-count",
      line: lineAt(markdown, at < 0 ? 0 : at),
      detail: `The motion constitution names ${constitution.bands.length} duration bands. The cap is 2.`,
      fix: "Keep at most 2 duration bands. Stagger is a delay, not a band.",
    });
  }
  return hits;
}

function add(bag: Bag, rule: MotionLintRule, index: number, detail: string, fix: string): void {
  if (bag.seen.has(rule)) return;
  bag.seen.add(rule);
  bag.findings.push({ file: bag.file, rule, line: lineAt(bag.text, index), detail, fix });
}

function ruleOwners(bag: Bag): void {
  const lenis = lenisActive(bag.text);
  const cssScroll = /animation-timeline\s*:|scroll-timeline\s*:/.exec(bag.text);
  if (lenis && cssScroll?.index !== undefined) {
    add(
      bag,
      "two-scroll-owners",
      cssScroll.index,
      "Lenis and a CSS scroll timeline are both scroll owners on this page.",
      "Keep Lenis via motionSetup as the only scroll owner.",
    );
  }
  const constructors = [...bag.text.matchAll(/\bnew\s+Lenis\b/g)];
  const second = constructors[1];
  if (second?.index !== undefined) {
    add(
      bag,
      "two-scroll-owners",
      second.index,
      "More than one Lenis scroll owner is constructed in this file.",
      "Call motionSetup once. A second call returns the handle already running.",
    );
  }
}

function ruleLenisTicker(bag: Bag): void {
  if (!lenisActive(bag.text)) return;
  const scrollSync = /lenis\.on\(\s*["']scroll["']\s*,\s*ScrollTrigger\.update\s*\)/.test(bag.text);
  const ticker = /gsap\.ticker\.add\([\s\S]*?lenis\.raf\s*\(/.test(bag.text);
  const lag = /gsap\.ticker\.lagSmoothing\(\s*0\s*\)/.test(bag.text);
  if (scrollSync && ticker && lag) return;
  const missing = [
    scrollSync ? "" : 'lenis.on("scroll", ScrollTrigger.update)',
    ticker ? "" : "gsap.ticker.add with lenis.raf",
    lag ? "" : "gsap.ticker.lagSmoothing(0)",
  ].filter((part) => part !== "");
  const at = bag.text.search(/\bnew\s+Lenis\b|from\s+["']lenis["']/);
  add(bag, "lenis-ticker", at < 0 ? 0 : at, `Lenis is missing ticker sync: ${missing.join(", ")}.`, "Drive Lenis from gsap.ticker with autoRaf: false and lagSmoothing(0).");
}

function ruleRafLoop(bag: Bag): void {
  if (!lenisActive(bag.text) && !/lenis\.raf\s*\(/.test(bag.text)) return;
  const calls = [...bag.text.matchAll(/lenis\.raf\s*\(/g)];
  const second = calls[1];
  if (second?.index !== undefined) {
    add(
      bag,
      "lenis-raf-loop",
      second.index,
      "A second lenis.raf call starts another frame loop.",
      "Call lenis.raf once, from gsap.ticker.add((t) => lenis.raf(t * 1000)), with autoRaf: false.",
    );
    return;
  }
  const frame = /requestAnimationFrame\s*\(/.exec(bag.text);
  if (frame?.index !== undefined && /lenis\.raf\s*\(/.test(bag.text)) {
    add(
      bag,
      "lenis-raf-loop",
      frame.index,
      "requestAnimationFrame calls lenis.raf beside the GSAP ticker.",
      "Remove the requestAnimationFrame loop. gsap.ticker is the only Lenis driver.",
    );
    return;
  }
  if (/autoRaf\s*:\s*true/.test(bag.text) && /gsap\.ticker\.add\s*\(/.test(bag.text)) {
    const at = bag.text.search(/autoRaf\s*:\s*true/);
    add(
      bag,
      "lenis-raf-loop",
      at < 0 ? 0 : at,
      "Lenis autoRaf is on while gsap.ticker also drives lenis.raf.",
      "Construct Lenis with autoRaf: false and keep the single ticker callback.",
    );
  }
}

function ruleLayout(bag: Bag): void {
  const layoutAt = layoutIndex(bag.text);
  if (layoutAt < 0) return;
  add(bag, "layout-properties", layoutAt, "A tween animates a layout property. Transform and opacity keep the frame stable.", "Animate transform and opacity only.");
}

function ruleScrub(bag: Bag, gsapCalls: readonly CallBlock[], childCalls: readonly CallBlock[]): void {
  const timelineScrub = gsapCalls.some((call) => call.kind === "timeline" && /\bscrub\b/.test(call.block));
  const consider = (call: CallBlock, inherited: boolean): void => {
    const scrubbed = inherited || /\bscrub\b/.test(call.block);
    if (!scrubbed) return;
    const layout = LAYOUT_KEY.exec(call.block);
    if (layout?.index !== undefined) {
      add(bag, "scrub-layout", call.index, "A scrubbed timeline animates a layout property. Scrub transform and opacity only.", "Remove the layout property from the scrubbed tween.");
    }
    const filter = FILTER_KEY.exec(call.block);
    if (filter?.index !== undefined) {
      add(bag, "scrub-filter", call.index, "A scrubbed timeline animates a CSS filter. Scrub transform and opacity only.", "Remove the filter from the scrubbed tween.");
    }
  };
  for (const call of gsapCalls) consider(call, false);
  for (const call of childCalls) consider(call, timelineScrub);
}

function ruleNested(bag: Bag, childCalls: readonly CallBlock[]): void {
  for (const call of childCalls) {
    if (!/\bscrollTrigger\b/.test(call.block)) continue;
    add(
      bag,
      "nested-scroll-trigger",
      call.index,
      "A ScrollTrigger is nested inside a child tween of a timeline.",
      "Put scrollTrigger on the timeline, not on a child tween.",
    );
    return;
  }
}

function ruleDuplicate(bag: Bag, gsapCalls: readonly CallBlock[]): void {
  const tos = gsapCalls.filter((call) => call.kind === "to");
  for (let left = 0; left < tos.length; left += 1) {
    for (let right = left + 1; right < tos.length; right += 1) {
      const first = tos[left];
      const second = tos[right];
      if (first === undefined || second === undefined) continue;
      const between = bag.text.slice(first.index, second.index);
      if (/=>|\bfunction\b/.test(between)) continue;
      const a = tweenShape(first.block);
      const b = tweenShape(second.block);
      if (a.target === "" || a.target !== b.target) continue;
      const shared = a.props.filter((prop) => b.props.includes(prop));
      if (shared.length === 0) continue;
      add(
        bag,
        "duplicate-tween",
        second.index,
        `Duplicate to() tweens set ${shared.join(", ")} on ${a.target}.`,
        "Keep one to() per property on that element.",
      );
      return;
    }
  }
}

function ruleBatch(bag: Bag): void {
  if (/ScrollTrigger\s*\.\s*batch\b|\bbatchReveal\b|\bcreateBatchReveal\b/.test(bag.text)) return;
  const loop = /for\s*\([^)]*\b(cards|items|siblings|card|item|sibling)\b[^)]*\)\s*\{[\s\S]{0,500}?ScrollTrigger\s*\.\s*create\s*\(/.exec(bag.text);
  if (loop?.index !== undefined) {
    add(bag, "batch-list", loop.index, "A repeated list creates one ScrollTrigger per card.", "Use ScrollTrigger.batch or batchReveal for 3 or more siblings.");
    return;
  }
  const each = /\b(cards|items|siblings)\b[\s\S]{0,120}?\.forEach\s*\([\s\S]{0,400}?ScrollTrigger\s*\.\s*create\s*\(/.exec(bag.text);
  if (each?.index !== undefined) {
    add(bag, "batch-list", each.index, "A repeated list creates one ScrollTrigger per card.", "Use ScrollTrigger.batch or batchReveal for 3 or more siblings.");
    return;
  }
  const triggers = [...bag.text.matchAll(/scrollTrigger\s*:|ScrollTrigger\s*\.\s*create\s*\(/g)];
  let cards = 0;
  let at = -1;
  for (const match of triggers) {
    const index = match.index ?? 0;
    const around = bag.text.slice(Math.max(0, index - 180), index + 180);
    if (!/\b(card|cards|item|items|sibling|siblings)\b/.test(around)) continue;
    cards += 1;
    if (at < 0) at = index;
  }
  if (cards >= 3) {
    add(bag, "batch-list", at, "A repeated list creates one ScrollTrigger per card.", "Use ScrollTrigger.batch or batchReveal for 3 or more siblings.");
  }
}

function ruleRefresh(bag: Bag, gsapCalls: readonly CallBlock[]): void {
  if (!usesScrollTrigger(bag.text, gsapCalls)) return;
  const refresh = /\bScrollTrigger\.refresh\s*\(/.test(bag.text);
  const fonts = /\bdocument\.fonts\b|\bfonts\.ready\b/.test(bag.text);
  const images = /\bdocument\.images\b|\bHTMLImageElement\b|addEventListener\(\s*["']load["']/.test(bag.text);
  if (refresh && fonts && images) return;
  const missing = [
    refresh ? "" : "ScrollTrigger.refresh()",
    fonts ? "" : "a font load",
    images ? "" : "an image load",
  ].filter((part) => part !== "");
  const at = bag.text.search(/\bScrollTrigger\s*\.\s*(?:create|refresh|batch|update)\b|\bscrollTrigger\s*:/);
  add(
    bag,
    "refresh-after-media",
    at < 0 ? 0 : at,
    `ScrollTrigger has no refresh after fonts and images. Missing: ${missing.join(", ")}.`,
    "Call ScrollTrigger.refresh after document.fonts.ready and after image loads.",
  );
}

function ruleHorizontal(bag: Bag): void {
  const track = /\bxPercent\s*:/.exec(bag.text);
  if (track?.index === undefined || linearTrackEase(bag.text)) return;
  add(bag, "horizontal-ease", track.index, 'A horizontal track is missing ease: "none", so it will not stay linear with the scroll.', 'Set ease: "none" on the horizontal track.');
}

/** Literal none, or the token helper's none fallback (`takenEase(choice, "none")`). */
function linearTrackEase(source: string): boolean {
  return /ease\s*:\s*["']none["']/.test(source) || /takenEase\s*\([^)]*["']none["']\s*\)/.test(source);
}

function ruleScrollTo(bag: Bag): void {
  if (!lenisActive(bag.text) || (!/\bScrollToPlugin\b/.test(bag.text) && !/\bscrollTo\s*:/.test(bag.text))) return;
  const at = bag.text.search(/\bScrollToPlugin\b|\bscrollTo\s*:/);
  add(bag, "scrollto-with-lenis", at < 0 ? 0 : at, "ScrollToPlugin is active while Lenis owns the scroll.", "Use lenis.scrollTo instead of ScrollToPlugin.");
}

function ruleReduced(bag: Bag): void {
  if (!animates(bag.text) || hasReducedMotion(bag.text)) return;
  const at = bag.text.search(/\bgsap\s*\.|\bnew\s+Lenis\b|\bScrollTrigger\s*\.|\bWebGLRenderer\b|<Canvas\b|animation-timeline\s*:/);
  add(bag, "reduced-motion", at < 0 ? 0 : at, "This page animates without a prefers-reduced-motion branch.", "Add gsap.matchMedia or a prefers-reduced-motion branch that keeps the page complete.");
}

function ruleCleanup(bag: Bag): void {
  if (!needsCleanup(bag.text) || hasCleanup(bag.text)) return;
  const at = bag.text.search(/\bgsap\s*\.\s*(?:to|from|fromTo|timeline)\s*\(|\bScrollTrigger\s*\.\s*create\s*\(|\bnew\s+Lenis\b/);
  add(
    bag,
    "cleanup",
    at < 0 ? 0 : at,
    "This animation has no kill, revert, or astro:before-swap cleanup.",
    "Call kill(), revert(), or ctx.revert() on astro:before-swap or component unmount.",
  );
}

function ruleWebgl(bag: Bag): void {
  const contexts = webglIndexes(bag.text);
  const second = contexts[1];
  if (second === undefined) return;
  add(bag, "webgl-context", second, `This page opens ${contexts.length} WebGL contexts.`, "Keep a single WebGL context for the page.");
}

function ruleDirect(bag: Bag): void {
  if (!bag.direct) return;
  const at = bag.text.search(/\bgsap\s*\.\s*(?:to|from|fromTo|timeline)\s*\(|\bScrollTrigger\s*\.\s*create\s*\(/);
  if (at < 0) return;
  add(
    bag,
    "direct-motion",
    at,
    "Site code calls gsap or ScrollTrigger.create outside the motion recipes.",
    "Compose the moment from a motion recipe.",
  );
}

function ruleConstitution(bag: Bag): void {
  const constitution = bag.constitution;
  if (constitution === null || !bag.direct) return;
  const allowed = allowedEases(constitution);
  const easeRe = /\bease\s*:\s*["']([^"']+)["']/g;
  for (const match of bag.text.matchAll(easeRe)) {
    const value = match[1] ?? "";
    if (value === "" || allowed.has(value)) continue;
    add(bag, "constitution-ease", match.index ?? 0, `Easing ${value} is outside the motion constitution.`, "Use one of the named constitution easings.");
    break;
  }
  const bareRe = /\bease\s*:\s*(power[1-4]\.[A-Za-z0-9]+|expo\.[A-Za-z0-9]+|elastic\.[A-Za-z0-9]+|back\.[A-Za-z0-9]+(?:\([^)]*\))?|bounce\.[A-Za-z0-9]+|circ\.[A-Za-z0-9]+|sine\.[A-Za-z0-9]+|none|linear)\b/g;
  for (const match of bag.text.matchAll(bareRe)) {
    const value = match[1] ?? "";
    if (value === "" || allowed.has(value)) continue;
    add(bag, "constitution-ease", match.index ?? 0, `Easing ${value} is outside the motion constitution.`, "Use one of the named constitution easings.");
    break;
  }
  const durationRe = /\bduration\s*:\s*(\d+(?:\.\d+)?)/g;
  for (const match of bag.text.matchAll(durationRe)) {
    const secondsValue = Number(match[1]);
    if (!Number.isFinite(secondsValue) || durationAllowed(secondsValue, constitution.bands)) continue;
    add(
      bag,
      "constitution-duration",
      match.index ?? 0,
      `Duration ${secondsValue}s sits outside the motion constitution bands.`,
      "Use a duration inside one of the two constitution bands.",
    );
    break;
  }
}

function hasReducedMotion(source: string): boolean {
  return /prefers-reduced-motion/.test(source) || /gsap\.matchMedia\s*\(/.test(source) || /\bprefersReducedMotion\s*\(/.test(source);
}

function needsCleanup(source: string): boolean {
  return (
    /\bgsap\s*\.\s*(?:to|from|fromTo|timeline)\s*\(/.test(source) ||
    /\bScrollTrigger\s*\.\s*create\s*\(/.test(source) ||
    /\bnew\s+Lenis\b/.test(source)
  );
}

function hasCleanup(source: string): boolean {
  return /\.kill\s*\(|\.revert\s*\(|\bctx\.revert\b|lenis\.destroy\s*\(|ticker\.remove\s*\(|astro:before-swap/.test(source);
}

function usesScrollTrigger(source: string, gsapCalls: readonly CallBlock[]): boolean {
  if (/\bScrollTrigger\s*\.\s*(?:create|refresh|batch|update|getAll|saveStyles|clearScrollMemory)\b/.test(source)) return true;
  return gsapCalls.some((call) => /\bscrollTrigger\s*:/.test(call.block));
}

function animates(source: string): boolean {
  return (
    /\bgsap\s*\./.test(source) ||
    lenisActive(source) ||
    /\bScrollTrigger\s*\.\s*(?:create|refresh|batch|update)\b/.test(source) ||
    webglIndexes(source).length > 0 ||
    /animation-timeline\s*:|scroll-timeline\s*:/.test(source)
  );
}

function lenisActive(source: string): boolean {
  if (/\bnew\s+Lenis\b/.test(source)) return true;
  return /(?:^|\n)\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+["']lenis["']/.test(source);
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

function callBlocks(source: string, pattern: RegExp, fallbackName: string): CallBlock[] {
  pattern.lastIndex = 0;
  const calls: CallBlock[] = [];
  for (const match of source.matchAll(pattern)) {
    if (match.index === undefined) continue;
    const open = match.index + match[0].length;
    const block = parenBlock(source, open);
    if (block === null) continue;
    const kind = fallbackName === "gsap" ? (match[1] ?? "") : (match[2] ?? "");
    const name = fallbackName === "gsap" ? "gsap" : (match[1] ?? "");
    calls.push({ index: match.index, name, kind, block: block.text });
  }
  return calls;
}

function tweenShape(block: string): { target: string; props: string[] } {
  const targetMatch = /^\s*([^,]+)/.exec(block);
  const raw = targetMatch?.[1]?.trim() ?? "";
  const target = raw.replace(/^["'`]|["'`]$/g, "").replace(/\s+/g, "");
  const props: string[] = [];
  const keyRe = /(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:/g;
  for (const match of block.matchAll(keyRe)) {
    const key = match[1];
    if (key === undefined || SKIP_PROP.has(key) || props.includes(key)) continue;
    props.push(key);
  }
  return { target, props };
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

function collectFiles(dir: string): string[] {
  const files: string[] = [];
  walk(dir, files);
  return files;
}

function walk(dir: string, into: string[]): void {
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
      walk(full, into);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    into.push(full);
  }
}
