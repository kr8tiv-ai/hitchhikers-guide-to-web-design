/**
 * Babel Fish reveal.
 * The frame is the Guide desk. Only slots marked approved are painted.
 * A missing approval map shows none of the kit, so a draft cannot leak.
 * Motion delays use the desk duration tokens. Reduced motion is CSS only.
 * The badge mark lives on the journey reveal. This page does not award it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BrandKitModel } from "../brand-kit.ts";
import { contrastRatio, motion } from "../design/tokens.ts";

export const BRAND_REVEAL_SLOTS = ["palette", "type", "logo", "voice", "taglines"] as const;

export type BrandRevealSlot = (typeof BRAND_REVEAL_SLOTS)[number];

/** BrandKitModel plus an explicit approval map. Omitted map means nothing is approved. */
export interface BrandRevealModel extends BrandKitModel {
  approved?: Partial<Record<BrandRevealSlot, boolean>>;
}

const SLOT_LABEL: Record<BrandRevealSlot, string> = {
  palette: "Palette",
  type: "Type",
  logo: "Logo",
  voice: "Voice",
  taglines: "Taglines",
};

const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FAMILY = /^[A-Za-z][A-Za-z0-9]*(?:[ -][A-Za-z0-9]+)*$/;
const BODY_MIN = 4.5;
const LABEL_DARK = "#1c1612";
const LABEL_LIGHT = "#f4ede3";

const here = path.dirname(fileURLToPath(import.meta.url));

interface LogoSlot {
  label: string;
  svg: string;
  reversed: boolean;
}

let cachedStyles: string | undefined;

export function renderBrandReveal(model: BrandRevealModel): string {
  const slots = visibleSlots(model);
  const steps = slots.map((slot, index) => renderSlot(model, slot, index));
  const main =
    steps.length === 0
      ? `<div class="hh-empty" data-reveal-empty="brand">
          <h2 class="hh-empty__title">Nothing here is approved yet.</h2>
          <p>The draft stays on the brand kit.</p>
          <p class="hh-empty__next">Approve a piece, then open this page again.</p>
        </div>`
      : `<div class="rv-sequence">${steps.join("")}</div>`;
  return revealDocument({
    title: "Brand kit reveal, The Hitchhiker's Guide to Web Design",
    kicker: "Babel Fish",
    headline: "The brand, approved",
    dek: "These are the pieces you kept. Anything still in draft stays off this page.",
    main,
  });
}

export function revealDocument(input: {
  title: string;
  kicker: string;
  headline: string;
  dek: string;
  main: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>${revealStyles()}</style>
  </head>
  <body>
    <a class="hh-skip" href="#reveal">Skip to the reveal</a>
    <div class="hh-shell rv-page">
      <header class="hh-mast rv-mast">
        <div class="hh-mast__row">
          <p class="hh-kicker">${escapeHtml(input.kicker)}</p>
          <p class="hh-kicker">Guide desk</p>
        </div>
        <div class="hh-wordmark hh-wordmark--plate" role="img" aria-label="Don't Panic"></div>
        <h1 class="hh-headline">${escapeHtml(input.headline)}</h1>
        <p class="hh-dek">${escapeHtml(input.dek)}</p>
      </header>
      <main id="reveal">${input.main}</main>
    </div>
  </body>
</html>
`;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function calmText(value: string): string {
  return value
    .replace(/[!！]/g, "")
    .replace(/\u2014/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function visibleSlots(model: BrandRevealModel): BrandRevealSlot[] {
  const flags = model.approved;
  if (flags === undefined) return [];
  const slots: BrandRevealSlot[] = [];
  for (const slot of BRAND_REVEAL_SLOTS) {
    if (flags[slot] !== true) continue;
    if (!slotHasContent(model, slot)) continue;
    slots.push(slot);
  }
  return slots;
}

function slotHasContent(model: BrandRevealModel, slot: BrandRevealSlot): boolean {
  if (slot === "palette") return true;
  if (slot === "type") return model.typeNames.some((name) => calmText(name) !== "");
  if (slot === "logo") return logoSlots(model).length > 0;
  if (slot === "voice") return model.voiceItems.some((item) => calmText(item.text) !== "");
  return model.taglines.some((line) => calmText(line) !== "");
}

function renderSlot(model: BrandRevealModel, slot: BrandRevealSlot, index: number): string {
  const delay = index * motion.durations.fast;
  const body =
    slot === "palette"
      ? paletteBody(model)
      : slot === "type"
        ? typeBody(model)
        : slot === "logo"
          ? logoBody(model)
          : slot === "voice"
            ? voiceBody(model)
            : taglineBody(model);
  const number = String(index + 1).padStart(2, "0");
  return `<section class="rv-step" data-reveal-step data-slot="${slot}" style="animation-delay:${delay}ms">
    <div class="rv-kicker-row">
      <h2 class="hh-title" id="${slot}-title">${SLOT_LABEL[slot]}</h2>
      <p class="hh-micro rv-index">${number}</p>
    </div>
    ${body}
  </section>`;
}

function paletteBody(model: BrandRevealModel): string {
  const paper = assertHex(model.palette.paper);
  const ink = assertHex(model.palette.ink);
  const signal = assertHex(model.palette.signal);
  const bands = [
    ["Paper", paper],
    ["Ink", ink],
    ["Signal", signal],
  ] as const;
  const swatches = bands
    .map(([role, hex]) => {
      const label = labelColor(hex);
      return `<div class="rv-band" style="background:${hex};color:${label}"><span>${role}</span><b>${hex.toUpperCase()}</b></div>`;
    })
    .join("");
  const ratio = contrastRatio(ink, paper);
  const line =
    ratio >= BODY_MIN
      ? `Ink on paper is ${ratio.toFixed(1)} to 1. Body text passes.`
      : `Ink on paper is ${ratio.toFixed(1)} to 1. Body text fails, so this page keeps the desk ink.`;
  return `<div class="rv-bands">${swatches}</div>
    <p class="hh-small rv-copy">Paper is the ground, about 60. Ink is the text, about 30. Signal is the mark, about 10. ${line}</p>`;
}

function typeBody(model: BrandRevealModel): string {
  const names = model.typeNames.map((name) => calmText(name)).filter((name) => name !== "");
  const display = names[0];
  const text = names[1] ?? display;
  const showTagline = model.approved?.taglines === true;
  const tagline = showTagline ? model.taglines.map((line) => calmText(line)).find((line) => line !== "") : undefined;
  const specimen = tagline ?? display ?? "Type";
  const second = text ?? specimen;
  return `<div class="rv-specimen">
      <p class="hh-headline"${familyStyle(display)}>${escapeHtml(specimen)}</p>
      <p class="hh-body"${familyStyle(text, "--font-text")}>${escapeHtml(second)}</p>
      <p class="hh-small">${escapeHtml(names.join(" and "))}.</p>
    </div>`;
}

function logoBody(model: BrandRevealModel): string {
  const slots = logoSlots(model);
  const cards = slots
    .map((slot) => {
      const plate = slot.reversed ? " rv-mark--reversed" : "";
      return `<article class="rv-logo"><p class="hh-micro">${escapeHtml(slot.label)}</p><div class="rv-mark${plate}">${slot.svg}</div></article>`;
    })
    .join("");
  return `<div class="rv-logos">${cards}</div>`;
}

function voiceBody(model: BrandRevealModel): string {
  const items = model.voiceItems
    .map((item) => calmText(item.text))
    .filter((text) => text !== "");
  const rows = items.map((text) => `<li><p class="rv-copy">${escapeHtml(text)}</p></li>`).join("");
  return `<ul class="rv-voice">${rows}</ul>`;
}

function taglineBody(model: BrandRevealModel): string {
  const lines = model.taglines.map((line) => calmText(line)).filter((line) => line !== "");
  const rows = lines
    .map((line, index) => {
      const number = String(index + 1).padStart(2, "0");
      return `<li class="rv-line"><span class="hh-micro">${number}</span><span>${escapeHtml(line)}</span></li>`;
    })
    .join("");
  return `<ol class="rv-lines">${rows}</ol>`;
}

function logoSlots(model: BrandRevealModel): LogoSlot[] {
  const slots: LogoSlot[] = [];
  const push = (label: string, value: string | null, reversed: boolean): void => {
    if (value === null) return;
    const safe = safeSvg(value);
    if (safe === null) return;
    slots.push({ label, svg: safe, reversed });
  };
  if (model.logoSet !== null) {
    push("Master", model.logoSet.master, false);
    push("One colour", model.logoSet.oneColor, false);
    push("Reversed", model.logoSet.reversed, true);
    push("Favicon", model.logoSet.favicon, false);
    return slots;
  }
  push("Master", model.logoSvg, false);
  return slots;
}

/** Same forbidden substrings as the brand-kit logo check. */
function safeSvg(svg: string): string | null {
  const trimmed = svg.trim();
  if (trimmed === "") return null;
  if (!/<svg\b/i.test(trimmed) || !/<path\b/i.test(trimmed)) return null;
  if (/<image\b/i.test(trimmed) || /data:image/i.test(trimmed)) return null;
  if (/<foreignObject\b/i.test(trimmed) || /<text\b/i.test(trimmed)) return null;
  if (/<script\b/i.test(trimmed) || /javascript:/i.test(trimmed)) return null;
  if (/<style\b/i.test(trimmed) || /on[a-z]+\s*=/i.test(trimmed)) return null;
  if (strokeColors(trimmed).size > 1) return null;
  const close = /<\/svg>/i.exec(trimmed);
  if (close?.index === undefined) return null;
  if (trimmed.slice(close.index + close[0].length).trim() !== "") return null;
  return trimmed;
}

function strokeColors(svg: string): Set<string> {
  const found = new Set<string>();
  const patterns = [/\bstroke\s*=\s*"([^"]+)"/gi, /\bstroke\s*=\s*'([^']+)'/gi, /\bstroke\s*:\s*([^;}"']+)/gi];
  for (const pattern of patterns) {
    for (const match of svg.matchAll(pattern)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const color = raw.trim().toLowerCase().replace(/\s+/g, "");
      if (color.length === 0 || color === "none" || color === "transparent") continue;
      found.add(color);
    }
  }
  return found;
}

function assertHex(value: string): string {
  const match = HEX.exec(value.trim());
  const digits = match?.[1];
  if (digits === undefined) throw new Error("Invalid brand hex.");
  const full = digits.length === 3 ? [...digits].map((channel) => channel + channel).join("") : digits;
  return `#${full.toLowerCase()}`;
}

function labelColor(background: string): string {
  const dark = contrastRatio(LABEL_DARK, background);
  const light = contrastRatio(LABEL_LIGHT, background);
  if (dark >= BODY_MIN && dark >= light) return LABEL_DARK;
  if (light >= BODY_MIN) return LABEL_LIGHT;
  return dark >= light ? LABEL_DARK : LABEL_LIGHT;
}

function familyStyle(name: string | undefined, token = "--font-display"): string {
  if (name === undefined || !FAMILY.test(name)) return "";
  return ` style="font-family:'${name}', var(${token})"`;
}

function revealStyles(): string {
  if (cachedStyles !== undefined) return cachedStyles;
  const design = path.join(here, "..", "design");
  const fonts = path.join(here, "..", "..", "public", "fonts");
  const fontHref = `${pathToFileURL(fonts).href}/`;
  const sheets = ["tokens.css", "type.css", "components.css"].map((name) =>
    readFileSync(path.join(design, name), "utf8").replaceAll("../../public/fonts/", fontHref),
  );
  sheets.push(readFileSync(path.join(here, "reveals.css"), "utf8"));
  cachedStyles = sheets.join("\n");
  return cachedStyles;
}
