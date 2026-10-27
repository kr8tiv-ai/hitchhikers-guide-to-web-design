/**
 * Brand phase writes DESIGN.md. Plan phase writes src/scripts/motion.ts.
 * Later build prompts name both files. Deterministic. No model call.
 * The numbers are a starting point. Any appropriate library may carry the work.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { translateBrief, type ArtAnswer } from "./art-direction.ts";
import { dealDirections, readDirectionDeal, syncResolvedFamilies } from "../brand/directions.ts";
import { brandKitFromAnswers, contrastRatio, type BrandAnswer, type BrandPalette } from "../brand/kit-from-interview.ts";
import { pickType } from "../brand/tokens.ts";
import { displayRhythm, ownerHeadingSentence, resolveTypeRoles, type DisplayRhythm } from "../brand/type-conflict.ts";
import { familiesSentence, typeChoiceFor, typeScaleFor } from "../brand/type-scale.ts";
import { lintDesignMd } from "./design-md-lint.ts";
import { readProjectDisplayName } from "../project-file/display-name.ts";
import { writeDesignExports } from "./design-export.ts";
import { lintMotionSource } from "./motion.ts";
import { OPACITY_KEEP_MS } from "../tier-zero-still.ts";

export const DESIGN_MD_PATH = "DESIGN.md";
export const MOTION_TS_PATH = "src/scripts/motion.ts";

export const DESIGN_FILE_LINES = [
  "Read DESIGN.md for tokens, the type scale, color, spacing, component rules, and motion principles.",
  "Read src/scripts/motion.ts for the typed GSAP, Lenis, and Three constants. Scrub, damping, bloom, easings, durations, staggers, scroll scenes, and the reduced-motion map live there.",
] as const;

export interface MotionTokenHit {
  file: string;
  rule: "ignores-motion-tokens";
  detail: string;
}

interface Band {
  reveal: number;
  lineStagger: number;
  cardStagger: number;
  lerp: number;
  damping: number;
  fov: number;
  bloom: number;
  pinEnd: string;
  lookAhead: number;
}

const BANDS: Record<"quiet" | "measured" | "cinematic", Band> = {
  quiet: {
    reveal: 0.6,
    lineStagger: 0.04,
    cardStagger: 0.04,
    lerp: 0.12,
    damping: 0.18,
    fov: 45,
    bloom: 0.3,
    pinEnd: "+=100%",
    lookAhead: 0.3,
  },
  measured: {
    reveal: 0.9,
    lineStagger: 0.06,
    cardStagger: 0.06,
    lerp: 0.1,
    damping: 0.15,
    fov: 40,
    bloom: 0.45,
    pinEnd: "+=150%",
    lookAhead: 0.4,
  },
  cinematic: {
    reveal: 1.2,
    lineStagger: 0.08,
    cardStagger: 0.08,
    lerp: 0.08,
    damping: 0.12,
    fov: 35,
    bloom: 0.6,
    pinEnd: "+=150%",
    lookAhead: 0.5,
  },
};

export interface DesignFontChoice {
  display: string;
  body: string;
  /** "brand kit", "picked direction", or "default tokens". */
  source: string;
}

export function renderDesignMd(
  brief: string,
  answers: readonly BrandAnswer[] = [],
  fonts?: DesignFontChoice | null,
  projectName?: string | null,
): string {
  const art = translateBrief(brief, answers as readonly ArtAnswer[]);
  const band = bandFor(art.motion.score);
  const palette = brandKitFromAnswers(answers, dealDirections(), brief).palette;
  const chosen = fontChoice(brief, answers, fonts);
  const scale = { ...typeScaleFor(documentText(brief, answers)), familiesLine: chosen.line };
  const wish = typeWishFrom(brief, answers);
  const rhythm = displayRhythm(wish, chosen.display);
  const techniques = art.motion.techniques.map((technique) => `- ${technique}`);
  const families = [chosen.display, chosen.body];
  const no3d = refuses3d(documentText(brief, answers));
  const button = buttonPair(palette);
  const name = styleGuideName(brief, answers, projectName);
  const weightNote = rhythm.fontWeight === null ? "" : `, weight ${rhythm.fontWeight}`;
  const heading = chosen.replaced ? ownerHeadingSentence(chosen.display, wish, rhythm) : "";
  const markdown = [
    frontMatter(palette, scale, families, button, rhythm, name),
    "# Design",
    "",
    "The style guide records the tokens the build starts from.",
    "",
    "## Overview",
    "",
    "These tokens are a starting point. Remix them. Any appropriate library may carry a technique.",
    "",
    "## Colors",
    "",
    ...colourProse(palette, button),
    `Grade: ${art.colorGrade} Light: ${art.light}`,
    "",
    "## Typography",
    "",
    ...(heading === "" ? [] : [heading, ""]),
    scale.familiesLine,
    `Ratio: ${scale.ratio} (${scale.ratioName}).`,
    `World: ${scale.world}.`,
    `Display over body minimum: ${scale.minimum}.`,
    "Body floor: 16px. Preferred body: 18px.",
    ...(rhythm.words.length === 0 ? [] : ["", rhythmSentence(rhythm)]),
    "",
    `- display: ${scale.display}, line-height ${rhythm.lineHeight}, tracking ${rhythm.letterSpacing}${weightNote}`,
    `- heading: ${scale.heading}, line-height ${rhythm.headingLineHeight}, tracking ${rhythm.headingLetterSpacing}`,
    `- title: ${scale.title}, line-height 1.2`,
    `- body: ${scale.body}, line-height ${scale.bodyLineHeight}`,
    `- caption: ${scale.caption}, line-height 1.4`,
    "",
    "## Layout",
    "",
    "The page keeps an equal inset and a clear first frame.",
    "Viewport: width=device-width, viewport-fit=cover. Insets use env(safe-area-inset-top).",
    "Type scale holds at 360, 390, 768, and 1440.",
    "Tap targets are at least 44px. No interaction is hover-only.",
    "Hero image budget: 200KB. The font files for the picked pair stay inside the phone budget.",
    "",
    "## Spacing",
    "",
    "- space-1: 4px",
    "- space-2: 8px",
    "- space-3: 12px",
    "- space-4: 16px",
    "- space-5: 24px",
    "- space-6: 40px",
    "- space-7: 64px",
    "- space-8: 96px",
    "",
    "## Elevation",
    "",
    "Cards sit on a 1px muted border. A drop shadow is optional.",
    "",
    "## Shapes",
    "",
    "Buttons and cards use a 4px corner.",
    "",
    "## Components",
    "",
    "Buttons use the body-size pair named under Colors, padding 12px 20px, and a minimum height of 44px.",
    "Links use ink with a 3px underline offset.",
    "Cards use 24px padding and a 1px muted border.",
    "A component may use another library when that serves the section.",
    "",
    "## Do's and Don'ts",
    "",
    "Remix the tokens. Any appropriate library may carry a technique.",
    "",
    "## Tokens",
    "",
    `Color tokens: ${colourTokenList(palette)}.`,
    "Space tokens: space-1 through space-8. Type tokens: display, heading, title, body, caption.",
    "Motion tokens live in src/scripts/motion.ts.",
    "",
    "## Motion principles",
    "",
    ...motionPrinciples(band, art.motion.score, no3d),
    "",
    "## Signature techniques",
    "",
    art.signatureHero,
    ...techniques,
    "Any appropriate library may carry a technique. GSAP, Lenis, Three.js, Motion, anime.js, and CSS are all open.",
    "",
  ].join("\n");
  const lint = lintDesignMd(markdown);
  if (!lint.ok) {
    throw new Error(`DESIGN.md failed lint: ${lint.errors.map((error) => error.message).join(" ")}`);
  }
  return markdown;
}

function frontMatter(
  palette: BrandPalette,
  scale: { display: string; body: string; bodyLineHeight: number },
  families: readonly string[],
  button: { text: string; background: string },
  rhythm: DisplayRhythm,
  name: string,
): string {
  const display = families[0] ?? "Switzer";
  const body = families[1] ?? display;
  const weight = rhythm.fontWeight === null ? [] : [`    fontWeight: ${yamlScalar(rhythm.fontWeight)}`];
  return [
    "---",
    "version: alpha",
    "name: " + yamlScalar(name),
    "colors:",
    ...colourYaml(palette, button),
    "typography:",
    "  display:",
    `    fontFamily: ${yamlScalar(display)}`,
    `    fontSize: ${yamlScalar(scale.display)}`,
    `    lineHeight: ${yamlScalar(rhythm.lineHeight)}`,
    `    letterSpacing: ${yamlScalar(rhythm.letterSpacing)}`,
    ...weight,
    "  body:",
    `    fontFamily: ${yamlScalar(body)}`,
    `    fontSize: ${yamlScalar(scale.body)}`,
    `    lineHeight: ${yamlScalar(String(scale.bodyLineHeight))}`,
    "rounded:",
    "  sm: \"4px\"",
    "  md: \"8px\"",
    "spacing:",
    "  space-1: \"4px\"",
    "  space-2: \"8px\"",
    "  space-3: \"12px\"",
    "  space-4: \"16px\"",
    "  space-5: \"24px\"",
    "  space-6: \"40px\"",
    "  space-7: \"64px\"",
    "  space-8: \"96px\"",
    "components:",
    "  button:",
    "    backgroundColor: \"{colors.button}\"",
    "    textColor: \"{colors.onButton}\"",
    "    padding: \"12px\"",
    "    rounded: \"{rounded.sm}\"",
    "---",
    "",
  ].join("\n");
}

function yamlScalar(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}

const RESERVED_COLOUR_KEYS = new Set(["paper", "ink", "accent", "muted", "primary", "button", "onbutton"]);

function colourTokenKey(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (key === "" || RESERVED_COLOUR_KEYS.has(key)) return "";
  return key;
}

function colourYaml(palette: BrandPalette, button: { text: string; background: string }): string[] {
  const lines = [
    `  paper: ${yamlScalar(palette.paper)}`,
    `  ink: ${yamlScalar(palette.ink)}`,
    `  accent: ${yamlScalar(palette.accent)}`,
    `  muted: ${yamlScalar(palette.muted)}`,
  ];
  const seen = new Set(["paper", "ink", "accent", "muted"]);
  for (const swatch of palette.swatches) {
    const key = colourTokenKey(swatch.name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    lines.push(`  ${key}: ${yamlScalar(swatch.hex)}`);
  }
  lines.push(`  primary: ${yamlScalar(palette.ink)}`);
  lines.push(`  button: ${yamlScalar(button.background)}`);
  lines.push(`  onButton: ${yamlScalar(button.text)}`);
  return lines;
}

function colourTokenList(palette: BrandPalette): string {
  const parts = [
    `paper ${palette.paper} Source: ${palette.sources.paper}`,
    `ink ${palette.ink} Source: ${palette.sources.ink}`,
    `accent ${palette.accent} Source: ${palette.sources.accent}`,
    `muted ${palette.muted} Source: ${palette.sources.muted}`,
  ];
  for (const swatch of palette.swatches) {
    const key = colourTokenKey(swatch.name);
    if (key === "") continue;
    parts.push(`${key} ${swatch.hex} Source: ${swatch.source}`);
  }
  return parts.join(", ");
}

function colourProse(
  palette: BrandPalette,
  button: { text: string; background: string; ratio: number },
): string[] {
  const lines = [
    sourcedLine(
      `Paper ${palette.paper} carries ink ${palette.ink}`,
      palette.sources.paper,
      palette.sources.ink,
      `Paper ${palette.paper}`,
      `Ink ${palette.ink} is the body text`,
    ),
    `Accent ${palette.accent} is for large text and marks. Source: ${palette.sources.accent}.`,
    `Muted ${palette.muted} is for secondary text. Source: ${palette.sources.muted}.`,
    `Body text ${palette.ink} on ${palette.paper} at ${ratioText(contrastRatio(palette.ink, palette.paper))} to 1.`,
    `Secondary text ${palette.muted} on ${palette.paper} at ${ratioText(contrastRatio(palette.muted, palette.paper))} to 1.`,
    `Button text ${button.text} on ${button.background} at ${ratioText(button.ratio)} to 1.`,
  ];
  if (palette.swatches.length === 0) return lines;
  for (const swatch of palette.swatches) lines.push(swatchSentence(swatch, palette));
  if (palette.sources.muted === "derived for contrast") {
    lines.push(
      `Muted ${palette.muted} is not a colour the owner named. It is darkened until secondary text on the page clears 4.5 to 1.`,
    );
  }
  return lines;
}

/** One source when paper and ink share it. Two sentences when they do not. */
function sourcedLine(shared: string, paperSource: string, inkSource: string, paperLead: string, inkLead: string): string {
  if (paperSource === inkSource) return `${shared}. Source: ${paperSource}.`;
  return `${paperLead}. Source: ${paperSource}. ${inkLead}. Source: ${inkSource}.`;
}

function swatchSentence(swatch: { name: string; hex: string; source: string }, palette: BrandPalette): string {
  const label = swatch.name.charAt(0).toUpperCase() + swatch.name.slice(1);
  const hex = swatch.hex;
  const paper = palette.paper;
  const ratio = contrastRatio(hex, paper);
  const stated = ratioText(ratio);
  const withSource = (sentence: string): string => `${sentence} Source: ${swatch.source}.`;
  if (hex.toLowerCase() === paper.toLowerCase()) {
    return withSource(`${label} ${hex} is the page colour, mapped to paper.`);
  }
  if (hex.toLowerCase() === palette.ink.toLowerCase()) {
    return withSource(`${label} text ${hex} on ${paper} at ${stated} to 1. ${label} is the ink.`);
  }
  const body = ratio >= 4.5;
  const large = ratio >= 3;
  if (hex.toLowerCase() === palette.accent.toLowerCase() && !body) {
    const aa = large
      ? "That passes AA for large text and does not pass AA for body text, so it is not a body colour."
      : "That does not pass AA for text, so it is not used for type.";
    return withSource(`${label} ${hex} is the accent. Contrast with the page ${paper} is ${stated} to 1. ${aa}`);
  }
  if (body) {
    const role = hex.toLowerCase() === palette.accent.toLowerCase() ? ` ${label} is the accent.` : "";
    return withSource(`${label} text ${hex} on ${paper} at ${stated} to 1.${role}`);
  }
  if (large) {
    return withSource(`${label} ${hex} contrasts with the page ${paper} at ${stated} to 1. That passes AA for large text and does not pass AA for body text, so it is not a body colour.`);
  }
  return withSource(`${label} ${hex} contrasts with the page ${paper} at ${stated} to 1. That does not pass AA for text, so it is not used for type.`);
}

function rhythmSentence(rhythm: DisplayRhythm): string {
  const words = rhythm.words.join(", ");
  const lead = `Display rhythm follows the owner's words: ${words}. Tracking is ${rhythm.letterSpacing} and line height is ${rhythm.lineHeight}.`;
  if (!rhythm.words.includes("light")) return lead;
  if (rhythm.fontWeight === null) return `${lead} The family has no weight axis, so the weight stays regular.`;
  return `${lead} The weight is ${rhythm.fontWeight} because the family has a weight axis.`;
}

/**
 * The business name in the brief wins over the desk project title.
 * A wordmark, then a disclaimer subject, then a quoted tagline name.
 */
function styleGuideName(brief: string, answers: readonly BrandAnswer[], projectName?: string | null): string {
  const corpus = documentText(brief, answers);
  return wordmarkName(corpus) ?? disclaimerName(corpus) ?? taglineName(corpus) ?? usableProjectName(projectName) ?? "Site";
}

function wordmarkName(corpus: string): string | null {
  const pattern = /\b([A-Z]{2,}(?:[ \t]+[A-Z]{2,}){1,3})\b/g;
  for (const match of corpus.matchAll(pattern)) {
    const phrase = match[1] ?? "";
    const start = match.index ?? 0;
    const window = corpus.slice(Math.max(0, start - 32), start + phrase.length + 64);
    if (!/\b(?:wide caps|wordmark|logo)\b/i.test(window)) continue;
    return phrase
      .split(/\s+/)
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  }
  return null;
}

function disclaimerName(corpus: string): string | null {
  const match = /\b([A-Z][A-Za-z0-9'’&-]*(?:\s+[A-Z][A-Za-z0-9'’&-]*){0,4})\s+does not\b/.exec(corpus);
  const name = match?.[1]?.trim() ?? "";
  if (name === "" || name.length > 60) return null;
  return name;
}

function taglineName(corpus: string): string | null {
  const match = /["“]([A-Z][A-Za-z0-9'’&-]*(?:\s+[A-Z][A-Za-z0-9'’&-]*){0,3})\./.exec(corpus);
  const name = match?.[1]?.trim() ?? "";
  if (name === "" || name.length > 60) return null;
  return name;
}

function usableProjectName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (trimmed === "" || trimmed.toLowerCase() === "site") return null;
  return trimmed;
}

export function renderMotionModule(
  brief: string,
  answers: readonly BrandAnswer[] = [],
  sections: readonly string[] = [],
): string {
  const art = translateBrief(brief, answers as readonly ArtAnswer[], sections);
  const band = bandFor(art.motion.score);
  const ids = sceneIds(sections);
  const scenes = ids
    .map((id, index) => {
      const pinned = index === 0;
      const start = pinned ? "top top" : "top 80%";
      const end = pinned ? band.pinEnd : "bottom top";
      return [
        "  {",
        `    id: ${JSON.stringify(id)},`,
        `    start: ${JSON.stringify(start)},`,
        `    end: ${JSON.stringify(end)},`,
        `    pin: ${pinned ? "true" : "false"},`,
        "    scrub: motionScrub,",
        "    anticipatePin: motionAnticipatePin,",
        "  },",
      ].join("\n");
    })
    .join("\n");
  const source = [
    "/** Typed motion constants for this site. A starting point to remix. */",
    "",
    "export interface ScrollScene {",
    "  readonly id: string;",
    "  readonly start: string;",
    "  readonly end: string;",
    "  readonly pin: boolean;",
    "  readonly scrub: number;",
    "  readonly anticipatePin: number;",
    "}",
    "",
    "export interface ReducedMotionMap {",
    "  readonly scrub: false;",
    "  readonly pin: false;",
    "  readonly immediate: true;",
    "  readonly duration: 0;",
    "  readonly opacity: 1;",
    "  readonly yPercent: 0;",
    "}",
    "",
    "export const motionScrub = 1 as const;",
    "export const motionAnticipatePin = 1 as const;",
    "export const motionInvalidateOnRefresh = true as const;",
    "export const motionEasings = {",
    '  reveal: "expo.out",',
    '  track: "none",',
    '  snap: "power1.inOut",',
    '  oneShot: "power2.inOut",',
    "} as const;",
    "export const motionDurations = {",
    `  reveal: ${num(band.reveal)},`,
    "  snapMin: 0.2,",
    "  snapMax: 0.8,",
    "  snapDelay: 0.1,",
    "} as const;",
    "export const motionStaggers = {",
    `  lines: ${num(band.lineStagger)},`,
    `  cards: ${num(band.cardStagger)},`,
    "} as const;",
    "export const motionDistances = {",
    "  revealYPercent: 100,",
    `  pinEnd: ${JSON.stringify(band.pinEnd)},`,
    '  cameraEnd: "+=200%",',
    "} as const;",
    "export const motionLenis = {",
    `  lerp: ${num(band.lerp)},`,
    "  anchorOffset: -80,",
    "  anchorDuration: 1.2,",
    '  reducedMotion: "instant",',
    "} as const;",
    `export const motionDamping = ${num(band.damping)} as const;`,
    `export const motionFov = ${band.fov} as const;`,
    `export const motionLookAhead = ${num(band.lookAhead)} as const;`,
    "export const motionBloom = {",
    `  strength: ${num(band.bloom)},`,
    "  radius: 0.4,",
    "  threshold: 0.85,",
    "  exposure: 1.1,",
    "} as const;",
    "export const motionReduced = {",
    "  scrub: false,",
    "  pin: false,",
    "  immediate: true,",
    "  duration: 0,",
    "  opacity: 1,",
    "  yPercent: 0,",
    "} as const satisfies ReducedMotionMap;",
    `export const boldThing = ${JSON.stringify(art.signatureHero)} as const;`,
    `export const orchestratedMoment = { id: ${JSON.stringify(ids[0] ?? "hero")}, kind: "timeline" } as const;`,
    `export const reducedOpacityMs = ${OPACITY_KEEP_MS} as const;`,
    "export const motionScenes: readonly ScrollScene[] = [",
    scenes,
    "];",
    "",
  ].join("\n");
  const motionLint = lintMotionSource(source);
  if (!motionLint.ok) {
    throw new Error(`motion.ts failed the one-bold-thing rule: ${motionLint.reasons.join(" ")}`);
  }
  return source;
}

export function writeDesignMd(
  projectDir: string,
  brief: string,
  answers: readonly BrandAnswer[] = [],
  fonts?: DesignFontChoice | null,
): string {
  const file = path.join(projectDir, DESIGN_MD_PATH);
  mkdirSync(projectDir, { recursive: true });
  const effectiveFonts = fonts === undefined ? pickedFontsFromDeal(projectDir) : fonts;
  const markdown = renderDesignMd(brief, answers, effectiveFonts, readProjectDisplayName(projectDir));
  writeFileSync(file, markdown, "utf8");
  writeDesignExports(projectDir, markdown);
  const chosen = fontChoice(brief, answers, effectiveFonts);
  const rhythm = displayRhythm(typeWishFrom(brief, answers), chosen.display);
  syncResolvedFamilies(projectDir, chosen.display, chosen.body, rhythm.fontWeight);
  return file;
}

function pickedFontsFromDeal(projectDir: string): DesignFontChoice | null {
  try {
    const deal = readDirectionDeal(projectDir);
    if (deal === null || deal.pickedId === null) return null;
    const picked = deal.directions.find((direction) => direction.id === deal.pickedId);
    if (picked === undefined || picked.display.trim() === "" || picked.body.trim() === "") return null;
    return { display: picked.display.trim(), body: picked.body.trim(), source: "picked direction" };
  } catch {
    return null;
  }
}

export function writeMotionModule(
  projectDir: string,
  brief: string,
  answers: readonly BrandAnswer[] = [],
  sections: readonly string[] = [],
): string {
  const file = path.join(projectDir, MOTION_TS_PATH);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, renderMotionModule(brief, answers, sections), "utf8");
  return file;
}

/** A page that animates without the constants in src/scripts/motion.ts. */
export function flagIgnoredMotionTokens(files: readonly { path: string; source: string }[]): MotionTokenHit[] {
  const hits: MotionTokenHit[] = [];
  for (const file of files) {
    if (isMotionModule(file.path)) continue;
    const source = stripComments(file.source);
    if (!animates(source)) continue;
    const names = motionBindings(source);
    const body = stripImports(source);
    const used = names.some((name) => new RegExp(`\\b${name}\\b`).test(body));
    if (names.length > 0 && used) continue;
    hits.push({
      file: file.path.replaceAll("\\", "/"),
      rule: "ignores-motion-tokens",
      detail: "This file animates without the constants from src/scripts/motion.ts.",
    });
  }
  return hits;
}

export interface ResolvedDesignType {
  display: string;
  body: string;
  /** The pair before the owner's type wish was applied. */
  givenDisplay: string;
  givenBody: string;
  rhythm: DisplayRhythm;
  replaced: boolean;
}

/** The families, weights, and override the style guide writes. Checks use this same result. */
export function resolveDesignType(
  brief: string,
  answers: readonly BrandAnswer[] = [],
  fonts?: DesignFontChoice | null,
): ResolvedDesignType {
  const chosen = fontChoice(brief, answers, fonts);
  return {
    display: chosen.display,
    body: chosen.body,
    givenDisplay: chosen.givenDisplay,
    givenBody: chosen.givenBody,
    rhythm: displayRhythm(typeWishFrom(brief, answers), chosen.display),
    replaced: chosen.replaced,
  };
}

function fontChoice(brief: string, answers: readonly BrandAnswer[], fonts?: DesignFontChoice | null): DesignFontChoice & {
  line: string;
  replaced: boolean;
  givenDisplay: string;
  givenBody: string;
} {
  const wish = typeWishFrom(brief, answers);
  const pack = (display: string, body: string, source: string, withSource: boolean): DesignFontChoice & {
    line: string;
    replaced: boolean;
    givenDisplay: string;
    givenBody: string;
  } => {
    const resolved = resolveTypeRoles(display, body, wish);
    const givenDisplay = display.trim();
    const givenBody = body.trim() === "" ? givenDisplay : body.trim();
    return {
      display: resolved.display,
      body: resolved.body,
      source,
      line: familyLine(resolved.display, resolved.body, withSource ? source : null),
      replaced: resolved.display !== givenDisplay || resolved.body !== givenBody,
      givenDisplay,
      givenBody,
    };
  };
  if (fonts !== undefined && fonts !== null && fonts.display.trim() !== "" && fonts.body.trim() !== "") {
    return pack(fonts.display, fonts.body, fonts.source, true);
  }
  const typeAnswer = answeredValue(answers, "DP-1.5");
  if (typeAnswer !== "") {
    let mood = typeAnswer;
    if (/^no fonts yet\b/i.test(mood)) mood = mood.replace(/^no fonts yet\.?\s*/i, "").trim();
    if (/^no type yet\b/i.test(mood)) mood = "";
    const dealt = pickType(mood === "" ? null : mood);
    const display = dealt.families[0] ?? "Switzer";
    const body = dealt.families[1] ?? display;
    return pack(display, body, "brand kit", true);
  }
  const choice = typeChoiceFor(documentText(brief, answers));
  const display = choice.families[0] ?? "Switzer";
  const body = choice.families[1] ?? display;
  return pack(display, body, "default tokens", false);
}

function familyLine(display: string, body: string, source: string | null): string {
  const base = familiesSentence(body === display ? [display] : [display, body]);
  if (source === null || source.trim() === "") return base;
  return `${base} Source: ${source}.`;
}

function typeWishFrom(brief: string, answers: readonly BrandAnswer[]): string {
  const answered = answeredValue(answers, "DP-1.5");
  if (answered !== "") return answered;
  return briefSection(brief, "Type") || briefSection(brief, "Typography");
}

function briefSection(markdown: string, heading: string): string {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(markdown);
  if (match === null) return "";
  const rest = markdown.slice(match.index + match[0].length);
  const next = /^##\s+/m.exec(rest);
  return (next === null ? rest : rest.slice(0, next.index)).trim();
}

function buttonPair(palette: { paper: string; ink: string; accent: string }): { text: string; background: string; ratio: number } {
  const ranked = [
    { text: palette.ink, background: palette.accent },
    { text: palette.paper, background: palette.ink },
    { text: palette.ink, background: palette.paper },
  ];
  for (const pair of ranked) {
    const ratio = contrastRatio(pair.text, pair.background);
    if (ratio >= 4.5) return { text: pair.text, background: pair.background, ratio };
  }
  let accent = palette.accent;
  for (let step = 0; step < 24; step += 1) {
    accent = shadeHex(accent, 0.82);
    const inkOn = contrastRatio(palette.ink, accent);
    if (inkOn >= 4.5) return { text: palette.ink, background: accent, ratio: inkOn };
    const paperOn = contrastRatio(palette.paper, accent);
    if (paperOn >= 4.5) return { text: palette.paper, background: accent, ratio: paperOn };
  }
  const ratio = contrastRatio(palette.paper, palette.ink);
  return { text: palette.paper, background: palette.ink, ratio };
}

function shadeHex(hex: string, factor: number): string {
  const channels = [0, 1, 2].map((index) => {
    const value = Math.max(0, Math.min(255, Math.round(Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) * factor)));
    return value.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function ratioText(value: number): string {
  return value.toFixed(2);
}

function answeredValue(answers: readonly BrandAnswer[], id: string): string {
  const found = answers.find((answer) => answer.id === id);
  if (found === undefined) return "";
  if (found.status === "SKIPPED" || found.status === "NOT_APPLICABLE" || found.status === "UNANSWERED") return "";
  return found.value.trim();
}

function refuses3d(text: string): boolean {
  const lower = text.toLowerCase();
  if (/\bno 3d\b/.test(lower)) return true;
  if (/\b3d is none\b/.test(lower)) return true;
  if (/\bno models\b/.test(lower) && /\b3d\b/.test(lower)) return true;
  return false;
}

function motionPrinciples(band: Band, score: number, no3d: boolean): string[] {
  const lines = [
    `Reveal duration: ${num(band.reveal)}s. Ease: expo.out. Line stagger: ${num(band.lineStagger)}. Card stagger: ${num(band.cardStagger)}.`,
    "Distance: yPercent: 100.",
  ];
  if (no3d) {
    lines.push(`Scrub: 1. Motion score ${score} stays in this band.`);
  } else {
    lines.push(`Pin length: ${band.pinEnd}. Camera travel: +=200%. Scrub: 1. anticipatePin: 1.`);
  }
  lines.push("Snap duration: 0.2s to 0.8s, delay 0.1s, ease power1.inOut. Track ease: none.");
  lines.push(`Lenis lerp: ${num(band.lerp)}. Anchor offset: -80. Anchor duration: 1.2s. Reduced motion jumps instantly.`);
  if (no3d) {
    lines.push(`Damping: ${num(band.damping)}. Look-ahead: ${num(band.lookAhead)}s.`);
    lines.push("Reduced motion keeps content visible: duration 0, scrub off, opacity 1, yPercent 0.");
  } else {
    lines.push(`Damping: ${num(band.damping)}. Look-ahead: ${num(band.lookAhead)}s. FOV: ${band.fov}.`);
    lines.push(`Bloom strength: ${num(band.bloom)}, radius 0.4, threshold 0.85, exposure 1.1.`);
    lines.push("Reduced motion keeps content visible: duration 0, scrub off, pin off, opacity 1, yPercent 0.");
  }
  return lines;
}

function documentText(brief: string, answers: readonly BrandAnswer[]): string {
  const parts = [brief];
  for (const answer of answers) {
    if (answer.status === "SKIPPED" || answer.status === "NOT_APPLICABLE" || answer.status === "UNANSWERED") continue;
    const value = answer.value.trim();
    if (value !== "") parts.push(value);
  }
  return parts.join("\n");
}

function bandFor(score: number): Band {
  if (score <= 3) return BANDS.quiet;
  if (score <= 6) return BANDS.measured;
  return BANDS.cinematic;
}

function num(value: number): string {
  return String(value);
}

function sceneIds(sections: readonly string[]): string[] {
  const ids: string[] = [];
  for (const section of sections) {
    const id = section
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (id === "" || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids.length === 0 ? ["hero"] : ids;
}

function isMotionModule(file: string): boolean {
  return /(?:^|[/\\])motion\.ts$/i.test(file);
}

function animates(source: string): boolean {
  return /\bgsap\s*\.\s*(?:to|from|fromTo|set|timeline)\b|\bScrollTrigger\b|\bnew\s+Lenis\b|\bWebGLRenderer\b|\bEffectComposer\b|\bUnrealBloomPass\b|\bdamp3\b/.test(
    source,
  );
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function stripImports(source: string): string {
  return source
    .replace(/import\s+(?:type\s+)?[\s\S]*?\sfrom\s+["'][^"']+["']\s*;?/g, "")
    .replace(/import\s+["'][^"']+["']\s*;?/g, "");
}

function motionBindings(source: string): string[] {
  const names: string[] = [];
  const pattern = /import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const clause = match[1] ?? "";
    const specifier = (match[2] ?? "").replaceAll("\\", "/");
    if (!/(?:^|\/)motion(?:\.ts|\.js)?$/.test(specifier)) continue;
    const star = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (star?.[1] !== undefined) names.push(star[1]);
    const named = /\{([^}]*)\}/.exec(clause);
    if (named?.[1] !== undefined) {
      for (const part of named[1].split(",")) {
        const trimmed = part.trim().replace(/^type\s+/, "");
        if (trimmed === "") continue;
        const alias = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(trimmed);
        const raw = alias?.[1] ?? trimmed.split(/\s+/)[0] ?? "";
        if (/^[A-Za-z_$]/.test(raw)) names.push(raw);
      }
    }
    const head = clause.trim();
    if (!head.startsWith("{") && !head.startsWith("*")) {
      const def = /^([A-Za-z_$][\w$]*)/.exec(head);
      if (def?.[1] !== undefined && def[1] !== "type") names.push(def[1]);
    }
  }
  return names;
}
