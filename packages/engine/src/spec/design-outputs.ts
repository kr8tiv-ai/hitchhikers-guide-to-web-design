/**
 * Brand phase writes DESIGN.md. Plan phase writes src/scripts/motion.ts.
 * Later build prompts name both files. Deterministic. No model call.
 * The numbers are a starting point. Any appropriate library may carry the work.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { translateBrief, type ArtAnswer } from "./art-direction.ts";
import { syncResolvedFamilies } from "../brand/directions.ts";
import { brandKitFromAnswers, contrastRatio, type BrandAnswer } from "../brand/kit-from-interview.ts";
import { pickType } from "../brand/tokens.ts";
import { resolveTypeRoles, winsSentence } from "../brand/type-conflict.ts";
import { familiesSentence, typeChoiceFor, typeScaleFor } from "../brand/type-scale.ts";
import { lintDesignMd } from "./design-md-lint.ts";
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
): string {
  const art = translateBrief(brief, answers as readonly ArtAnswer[]);
  const band = bandFor(art.motion.score);
  const palette = brandKitFromAnswers(answers).palette;
  const chosen = fontChoice(brief, answers, fonts);
  const scale = { ...typeScaleFor(documentText(brief, answers)), familiesLine: chosen.line };
  const techniques = art.motion.techniques.map((technique) => `- ${technique}`);
  const families = [chosen.display, chosen.body];
  const paletteSource = colourFromKit(answers) ? "brand kit" : "default tokens";
  const no3d = refuses3d(documentText(brief, answers));
  const button = buttonPair(palette);
  const inkOnPaper = contrastRatio(palette.ink, palette.paper);
  const mutedOnPaper = contrastRatio(palette.muted, palette.paper);
  const markdown = [
    frontMatter(palette, scale, families, button),
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
    `Paper ${palette.paper} carries ink ${palette.ink}. Source: ${paletteSource}.`,
    `Accent ${palette.accent} is for large text and marks. Source: ${paletteSource}.`,
    `Muted ${palette.muted} is for secondary text. Source: ${paletteSource}.`,
    `Body text ${palette.ink} on ${palette.paper} at ${ratioText(inkOnPaper)} to 1.`,
    `Secondary text ${palette.muted} on ${palette.paper} at ${ratioText(mutedOnPaper)} to 1.`,
    `Button text ${button.text} on ${button.background} at ${ratioText(button.ratio)} to 1.`,
    `Grade: ${art.colorGrade} Light: ${art.light}`,
    "",
    "## Color",
    "",
    "See Colors.",
    "",
    "## Typography",
    "",
    ...(chosen.conflict === "" ? [] : [chosen.conflict, ""]),
    scale.familiesLine,
    `Ratio: ${scale.ratio} (${scale.ratioName}).`,
    `World: ${scale.world}.`,
    `Display over body minimum: ${scale.minimum}.`,
    "Body floor: 16px. Preferred body: 18px.",
    "",
    `- display: ${scale.display}, line-height 0.95, tracking -0.03em`,
    `- heading: ${scale.heading}, line-height 1.05, tracking -0.02em`,
    `- title: ${scale.title}, line-height 1.2`,
    `- body: ${scale.body}, line-height ${scale.bodyLineHeight}`,
    `- caption: ${scale.caption}, line-height 1.4`,
    "",
    "## Type scale",
    "",
    "See Typography.",
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
    `Color tokens: paper ${palette.paper}, ink ${palette.ink}, accent ${palette.accent}, muted ${palette.muted}. Source: ${paletteSource}.`,
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
  palette: { paper: string; ink: string; accent: string; muted: string },
  scale: { display: string; body: string; bodyLineHeight: number },
  families: readonly string[],
  button: { text: string; background: string },
): string {
  const display = families[0] ?? "Switzer";
  const body = families[1] ?? display;
  return [
    "---",
    "version: alpha",
    "name: Site",
    "colors:",
    `  paper: ${yamlScalar(palette.paper)}`,
    `  ink: ${yamlScalar(palette.ink)}`,
    `  accent: ${yamlScalar(palette.accent)}`,
    `  muted: ${yamlScalar(palette.muted)}`,
    `  primary: ${yamlScalar(palette.ink)}`,
    `  button: ${yamlScalar(button.background)}`,
    `  onButton: ${yamlScalar(button.text)}`,
    "typography:",
    "  display:",
    `    fontFamily: ${yamlScalar(display)}`,
    `    fontSize: ${yamlScalar(scale.display)}`,
    "    lineHeight: \"0.95\"",
    "    letterSpacing: \"-0.03em\"",
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
  const markdown = renderDesignMd(brief, answers, fonts);
  writeFileSync(file, markdown, "utf8");
  writeDesignExports(projectDir, markdown);
  if (fonts !== undefined && fonts !== null && fonts.display.trim() !== "" && fonts.body.trim() !== "") {
    const chosen = fontChoice(brief, answers, fonts);
    if (chosen.display !== fonts.display.trim() || chosen.body !== fonts.body.trim()) {
      syncResolvedFamilies(projectDir, chosen.display, chosen.body);
    }
  }
  return file;
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

function fontChoice(brief: string, answers: readonly BrandAnswer[], fonts?: DesignFontChoice | null): DesignFontChoice & { line: string; conflict: string } {
  const wish = typeWishFrom(brief, answers);
  const pack = (display: string, body: string, source: string, withSource: boolean, givenDisplay: string, givenBody: string): DesignFontChoice & { line: string; conflict: string } => {
    const resolved = resolveTypeRoles(display, body, wish);
    const conflict = resolved.display === display.trim() ? "" : winsSentence(givenDisplay, givenBody, wish);
    return {
      display: resolved.display,
      body: resolved.body,
      source,
      line: familyLine(resolved.display, resolved.body, withSource ? source : null),
      conflict,
    };
  };
  if (fonts !== undefined && fonts !== null && fonts.display.trim() !== "" && fonts.body.trim() !== "") {
    return pack(fonts.display, fonts.body, fonts.source, true, fonts.display.trim(), fonts.body.trim());
  }
  const typeAnswer = answeredValue(answers, "DP-1.5");
  if (typeAnswer !== "") {
    let mood = typeAnswer;
    if (/^no fonts yet\b/i.test(mood)) mood = mood.replace(/^no fonts yet\.?\s*/i, "").trim();
    if (/^no type yet\b/i.test(mood)) mood = "";
    const dealt = pickType(mood === "" ? null : mood);
    const display = dealt.families[0] ?? "Switzer";
    const body = dealt.families[1] ?? display;
    return pack(display, body, "brand kit", true, display, body);
  }
  const choice = typeChoiceFor(documentText(brief, answers));
  const display = choice.families[0] ?? "Switzer";
  const body = choice.families[1] ?? display;
  return pack(display, body, "default tokens", false, display, body);
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

function colourFromKit(answers: readonly BrandAnswer[]): boolean {
  return answeredValue(answers, "DP-1.2") !== "";
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
