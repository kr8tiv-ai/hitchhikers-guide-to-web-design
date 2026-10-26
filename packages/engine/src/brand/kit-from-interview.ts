/**
 * Brand kit from the interview. Original words, not a reference site.
 * Palette pairs meet WCAG 2.2 SC 1.4.3. 4.499 does not pass as 4.5.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dealDirections, designLibraryRoot, renderDirectionBlock, saveDirectionDeal, type DirectionDeal } from "./directions.ts";
import { familiesSentence } from "./type-scale.ts";
import { winsSentence } from "./type-conflict.ts";
import { pickType, proposePalettes } from "./tokens.ts";

export interface BrandAnswer {
  id?: string;
  value: string;
  status?: string;
}

export interface BrandSwatch {
  name: string;
  hex: string;
}

export interface BrandPalette {
  paper: string;
  ink: string;
  accent: string;
  muted: string;
  body: number;
  large: number;
  /** Named colours from the answer. Empty when the kit is using the default palette. */
  swatches: readonly BrandSwatch[];
}

const SKIPPED = new Set(["SKIPPED", "NOT_APPLICABLE", "UNANSWERED"]);
const PAPER = "#f4f1ea";
const INK = "#1a1a1a";
const ACCENT = "#1f6b4a";

export function contrastRatio(foreground: string, background: string): number {
  const hi = Math.max(luminance(foreground), luminance(background));
  const lo = Math.min(luminance(foreground), luminance(background));
  return (hi + 0.05) / (lo + 0.05);
}

export function passesBodyContrast(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}

export function passesLargeContrast(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 3;
}

export function defaultPalette(): BrandPalette {
  const muted = darkenUntil("#5c6570", PAPER, 4.5);
  return {
    paper: PAPER,
    ink: INK,
    accent: ACCENT,
    muted,
    body: contrastRatio(INK, PAPER),
    large: contrastRatio(ACCENT, PAPER),
    swatches: [],
  };
}

export function brandKitFromAnswers(
  answers: readonly BrandAnswer[],
  deal: DirectionDeal = dealDirections(),
  briefMarkdown?: string | null,
): { markdown: string; moduleSource: string; palette: BrandPalette } {
  const fields = briefFields(briefMarkdown);
  const offer = kitField(fields, ["Offer"], answered(answers, "DP-2.7")) || "The offer is the sentence the owner already gave.";
  const action = kitField(fields, ["Action"], answered(answers, "DP-3.1")) || "Get in touch.";
  const voice = kitField(fields, ["Voice"], answered(answers, "DP-1.6")) || "Clear, calm, specific.";
  const vibeSource = kitField(fields, ["Vibe"], answered(answers, "DP-5.3"));
  const vibe = vibeSource || "Calm, editorial, and specific.";
  const references = kitField(fields, ["References"], answered(answers, "DP-5.1")) || "No reference site was named.";
  const colour = kitField(fields, ["Colours", "Colour", "Colors", "Color"], answered(answers, "DP-1.2"));
  const typeSource = kitField(fields, ["Type", "Typography"], answered(answers, "DP-1.5"));
  const type = typeSource || "No type yet. Show a quiet pairing with one clear size jump.";
  const imagery = kitField(fields, ["Imagery"], answered(answers, "DP-5.6")) || "Photography of the work, in the light the owner described.";
  const light = closeSentence(answered(answers, "DP-5.5") || "Soft daylight.");
  const motion = motionProse(kitField(fields, ["Motion"], answered(answers, "DP-6.2")) || "Polished, not a spectacle.");
  const logo = answered(answers, "DP-1.1");
  const mood = moodForPalette(answered(answers, "DP-1.4"), typeSource, vibeSource);
  const moodPalette = colour !== "" || mood === "" ? null : paletteFromMood(mood);
  const palette = colour !== "" ? paletteFromWords(colour) : (moodPalette ?? defaultPalette());
  const dealt = pickType(typeDeal(type));
  const displayName = dealt.families[0] ?? "";
  const bodyName = dealt.families[1] ?? displayName;
  const wins = winsSentence(displayName, bodyName, type);
  const neverShow = "No identifiable faces, no real listing, and no fake person.";
  const sound = optsIntoSound(motion) ? "Ambient sound is opt-in, off until a labelled control is pressed." : "Sound stays off.";
  const logoLine = logo === ""
    ? "Wordmark in the chosen type, one color on the light ground and one on the dark ground. The build draws the SVG from the wordmark spec. A symbol stays abstract and does not imitate a known logo."
    : `Use the logo the owner supplied. ${logo}`;
  const stem = joinSentences([
    "Concept image",
    pictureImagery(imagery),
    `Light: ${light}`,
    `Grade: ${palette.paper} paper and ${palette.ink} ink`,
    `Never show: ${neverShow}`,
  ]);
  const markdown = [
    "# Brand",
    "",
    "## Offer",
    "",
    `${offer} Action: ${action}`,
    "",
    "## Logo",
    "",
    logoLine,
    "",
    "## Palette",
    "",
    `Paper ${palette.paper} carries ink ${palette.ink} at ${palette.body.toFixed(2)} to 1.`,
    `Muted ${palette.muted} is for secondary body text and also clears 4.5 to 1.`,
    `Accent ${palette.accent} is for large text at ${palette.large.toFixed(2)} to 1.`,
    swatchLine(palette),
    paletteNote(colour, moodPalette),
    "",
    "## Type",
    "",
    type,
    "",
    dealtLine(dealt.families),
    ...(wins === "" ? [] : [wins]),
    `Adjectives: ${adjectiveLine(dealt.adjectives)}.`,
    `License: ${dealt.license}.`,
    "",
    "## Imagery",
    "",
    imagery,
    `Light: ${light}`,
    `Never show: ${neverShow}`,
    `Imagine prompt stem: ${stem}`,
    "",
    "## Motion",
    "",
    `${motion} ${sound}`,
    `Mood: ${vibe}`,
    "",
    "## Voice",
    "",
    voice,
    "",
    "## References",
    "",
    `Named by the owner, as names only: ${references}`,
    "",
    renderDirectionBlock(deal),
  ].join("\n");
  const moduleSource = [
    "/** Brand values from the interview. */",
    "export const brand = {",
    `  offer: ${JSON.stringify(offer)},`,
    `  action: ${JSON.stringify(action)},`,
    `  voice: ${JSON.stringify(voice)},`,
    `  paper: "${palette.paper}",`,
    `  ink: "${palette.ink}",`,
    `  accent: "${palette.accent}",`,
    `  muted: "${palette.muted}",`,
    `  display: ${JSON.stringify(displayName)},`,
    `  body: ${JSON.stringify(bodyName)},`,
    `  imagineStem: ${JSON.stringify(stem)},`,
    `  neverShow: ${JSON.stringify(neverShow)},`,
    "} as const;",
    "",
  ].join("\n");
  return { markdown, moduleSource, palette };
}

export function writeBrandKit(projectDir: string, answers: readonly BrandAnswer[]): string {
  const deal = dealDirections(designLibraryRoot(), projectDir);
  const kit = brandKitFromAnswers(answers, deal, readApprovedBrief(projectDir));
  const brandDir = path.join(projectDir, ".hitchhiker", "brand");
  const dataDir = path.join(projectDir, "src", "data");
  mkdirSync(brandDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path.join(brandDir, "BRAND.md"), kit.markdown, "utf8");
  writeFileSync(path.join(dataDir, "brand.ts"), kit.moduleSource, "utf8");
  saveDirectionDeal(projectDir, deal);
  return kit.markdown;
}

function typeDeal(type: string): string | null {
  if (/^no type yet\b/i.test(type)) return null;
  if (/^no fonts yet\b/i.test(type)) {
    const rest = type.replace(/^no fonts yet\.?\s*/i, "").trim();
    return rest === "" ? null : rest;
  }
  return type;
}

function moodForPalette(images: string, type: string, vibe: string): string {
  const parts: string[] = [];
  if (images !== "") parts.push(images);
  if (type !== "" && !/^no type yet\b/i.test(type)) parts.push(type);
  if (vibe !== "") parts.push(vibe);
  return parts.join(" ");
}

/** An approved Site Brief wins. A file without brief-yes.json stays unused. */
function readApprovedBrief(projectDir: string): string | null {
  const hitch = path.join(projectDir, ".hitchhiker");
  const yesFile = path.join(hitch, "brief-yes.json");
  const briefFile = path.join(hitch, "SITE-BRIEF.md");
  if (!existsSync(yesFile) || !existsSync(briefFile)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(yesFile, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    if ((parsed as { approved?: unknown }).approved !== true) return null;
    const text = readFileSync(briefFile, "utf8");
    return text.trim() === "" ? null : text;
  } catch {
    return null;
  }
}

function briefFields(markdown: string | null | undefined): Map<string, string> | null {
  if (markdown === undefined || markdown === null || markdown.trim() === "") return null;
  const fields = new Map<string, string>();
  for (const part of markdown.split(/^## /m).slice(1)) {
    const breakAt = part.indexOf("\n");
    const heading = (breakAt < 0 ? part : part.slice(0, breakAt)).trim();
    const body = (breakAt < 0 ? "" : part.slice(breakAt + 1)).replace(/\s+/g, " ").trim();
    if (heading === "" || body === "" || body === "The field is not stated yet.") continue;
    fields.set(heading, body);
  }
  return fields;
}

function kitField(fields: Map<string, string> | null, headings: readonly string[], fallback: string): string {
  if (fields === null) return fallback;
  for (const heading of headings) {
    const text = fields.get(heading);
    if (text !== undefined && text !== "") return text;
  }
  return fallback;
}

/** A motion answer that is only the 1-10 score is not a sentence. */
function motionProse(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  const score = /^(\d{1,2})\.?$/.exec(trimmed);
  if (score?.[1] !== undefined) {
    const level = Number(score[1]);
    if (level >= 1 && level <= 10) return `Motion appetite ${level} of 10.`;
  }
  return trimmed;
}

function pictureImagery(imagery: string): string {
  const kept = imagery
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part !== "" && !isSourcingSentence(part));
  return kept.join(" ");
}

function isSourcingSentence(sentence: string): boolean {
  return (
    /\b(?:stock|open-license|open license|my own|ai stills|fill gaps|dollars|budget|no video)\b/i.test(sentence) ||
    /^a mix:/i.test(sentence)
  );
}

function closeSentence(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed === "") return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function joinSentences(parts: readonly string[]): string {
  return parts.map(closeSentence).filter((part) => part !== "").join(" ");
}

function paletteNote(colour: string, moodPalette: BrandPalette | null): string {
  if (colour !== "") return `Colour feeling: ${colour}`;
  if (moodPalette === null) return "The owner skipped colour, so this default palette is the kit.";
  return "The owner skipped colour, so this palette follows the mood words.";
}

function paletteFromMood(mood: string): BrandPalette | null {
  const first = proposePalettes({ seedHex: null, vibe: mood })[0];
  if (first === undefined) return null;
  let accent = first.signal;
  if (!passesLargeContrast(accent, first.paper)) {
    accent = passesLargeContrast(ACCENT, first.paper) ? ACCENT : first.ink;
  }
  const muted = mutedOn(first.paper);
  const palette: BrandPalette = {
    paper: first.paper,
    ink: first.ink,
    accent,
    muted,
    body: contrastRatio(first.ink, first.paper),
    large: contrastRatio(accent, first.paper),
    swatches: [],
  };
  if (!passesBodyContrast(palette.ink, palette.paper)) return null;
  if (!passesBodyContrast(palette.muted, palette.paper)) return null;
  if (!passesLargeContrast(palette.accent, palette.paper)) return null;
  return palette;
}

function mutedOn(paper: string): string {
  const darkened = darkenUntil("#5c6570", paper, 4.5);
  if (passesBodyContrast(darkened, paper)) return darkened;
  let current = "#d5dbe3";
  for (let step = 0; step < 24; step += 1) {
    if (passesBodyContrast(current, paper)) return current;
    current = shade(current, 1.08);
  }
  if (passesBodyContrast(INK, paper)) return INK;
  return "#ffffff";
}

function dealtLine(families: readonly string[]): string {
  return familiesSentence(families).replace(/^Families:/, "Dealt families:");
}

function adjectiveLine(adjectives: readonly string[]): string {
  return adjectives.length === 0 ? "none" : adjectives.join(", ");
}

function answered(answers: readonly BrandAnswer[], id: string): string {
  const found = answers.find((answer) => answer.id === id);
  if (found === undefined) return "";
  if (found.status !== undefined && SKIPPED.has(found.status)) return "";
  return found.value.replace(/\s+/g, " ").trim();
}

function optsIntoSound(motion: string): boolean {
  return /\b(sound|ambient|audio)\b/i.test(motion) && !/\bno sound\b|\bwithout sound\b|\bsound off\b/i.test(motion);
}

const NAMED_COLOURS: readonly { name: string; pattern: RegExp; hex: string; role: "paper" | "ink" | "accent" | "swatch" }[] = [
  { name: "soft sand", pattern: /soft sand/i, hex: "#f3e6d0", role: "paper" },
  { name: "near-black green", pattern: /near-black green/i, hex: "#14241c", role: "ink" },
  { name: "sunset gold", pattern: /sunset gold/i, hex: "#8a6a12", role: "accent" },
  { name: "jungle green", pattern: /jungle green/i, hex: "#1f6b4a", role: "swatch" },
  { name: "ocean blue", pattern: /ocean blue/i, hex: "#1d4e89", role: "swatch" },
];

function swatchLine(palette: BrandPalette): string {
  if (palette.swatches.length === 0) return "";
  return `Swatches: ${palette.swatches.map((swatch) => `${swatch.name} ${swatch.hex}`).join(", ")}.`;
}

function paletteFromWords(words: string): BrandPalette {
  const palette = defaultPalette();
  const named = NAMED_COLOURS.filter((colour) => colour.pattern.test(words));
  if (named.length > 0) {
    const paper = named.find((colour) => colour.role === "paper")?.hex ?? palette.paper;
    const ink = named.find((colour) => colour.role === "ink")?.hex ?? palette.ink;
    let accent = named.find((colour) => colour.role === "accent")?.hex ?? palette.accent;
    if (!passesLargeContrast(accent, paper)) accent = darkenUntil(accent, paper, 3);
    const muted = darkenUntil("#5c6570", paper, 4.5);
    const swatches = named.map((colour) => ({
      name: colour.name,
      hex: colour.role === "accent" ? accent : colour.hex,
    }));
    return {
      paper,
      ink,
      accent,
      muted,
      body: contrastRatio(ink, paper),
      large: contrastRatio(accent, paper),
      swatches,
    };
  }
  const hex = /#[0-9a-fA-F]{6}/.exec(words);
  if (hex?.[0] !== undefined && passesBodyContrast(hex[0], PAPER)) {
    return { ...palette, accent: hex[0], large: contrastRatio(hex[0], PAPER) };
  }
  return palette;
}

function darkenUntil(hex: string, background: string, min: number): string {
  let current = hex;
  for (let step = 0; step < 24; step += 1) {
    if (contrastRatio(current, background) >= min) return current;
    current = shade(current, 0.82);
  }
  return INK;
}

function shade(hex: string, factor: number): string {
  const channels = [0, 1, 2].map((index) => {
    const value = Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) * factor)));
    return value.toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function luminance(hex: string): number {
  const channels = [0, 1, 2].map((index) => {
    const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}
