/**
 * Babel Fish reveal. The frame is the Guide desk. The swatches are the proposed brand.
 * Text is escaped. Hex is checked before it reaches a style attribute.
 * Logo SVG is dropped when it fails the same substring checks as assertLogoSvg.
 */

import { readFileSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contrastRatio } from "./design/tokens.ts";

export interface BrandKitModel {
  why: string;
  archetype: string;
  stories: { s25: string; s100: string; s300: string };
  voiceItems: Array<{ id: string; text: string }>;
  logoSet: { master: string; oneColor: string; reversed: string; favicon: string } | null;
  images: string[];
  purpose: string;
  positioning: string;
  taglines: string[];
  palette: { paper: string; ink: string; signal: string };
  typeNames: string[];
  logoSvg: string | null;
}

export interface BrandKitFiles {
  htmlPath: string;
  pdfPath: string;
}

const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const FAMILY = /^[A-Za-z][A-Za-z0-9]*(?:[ -][A-Za-z0-9]+)*$/;
const SAFE_IMAGE =
  /^(?:https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]*)?|(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif|svg))$/i;

const LABEL_DARK = "#1c1612";
const LABEL_LIGHT = "#f4ede3";
const BODY_MIN = 4.5;
const LARGE_MIN = 3;

const FONT_FILES = [
  "BricolageGrotesque-opsz16-wght600.woff2",
  "BricolageGrotesque-opsz96-wght800.woff2",
  "Literata-Italic-opsz16-wght400.woff2",
  "Literata-opsz16-wght400.woff2",
  "Literata-opsz16-wght600.woff2",
] as const;

const here = path.dirname(fileURLToPath(import.meta.url));

interface Prepared {
  why: string;
  archetype: string;
  stories: { s25: string; s100: string; s300: string };
  voiceItems: Array<{ id: string; text: string }>;
  images: string[];
  purpose: string;
  positioning: string;
  taglines: string[];
  palette: { paper: string; ink: string; signal: string };
  typeNames: string[];
  logoSvg: string | null;
  logoSet: BrandKitModel["logoSet"];
}

export function renderBrandKit(model: BrandKitModel): string {
  const kit = prepare(model);
  return document(kit);
}

/** Writes `.hitchhiker/brand/brand-kit.html` and `brand-kit.pdf` under projectDir. */
export async function writeBrandKit(projectDir: string, model: BrandKitModel): Promise<BrandKitFiles> {
  const html = standAlone(renderBrandKit(model));
  const pdf = renderPdf(model);
  const dir = path.join(projectDir, ".hitchhiker", "brand");
  const fonts = path.join(dir, "fonts");
  await mkdir(fonts, { recursive: true });
  const htmlPath = path.join(dir, "brand-kit.html");
  const pdfPath = path.join(dir, "brand-kit.pdf");
  await writeFile(htmlPath, html, "utf8");
  await writeFile(pdfPath, pdf);
  const fontDir = path.join(here, "..", "public", "fonts");
  for (const name of FONT_FILES) {
    await copyFile(path.join(fontDir, name), path.join(fonts, name));
  }
  return { htmlPath, pdfPath };
}

function prepare(model: BrandKitModel): Prepared {
  for (const line of model.taglines) {
    if (line.includes("!")) throw new Error("A tagline includes an exclamation mark.");
  }
  const copy = [
    model.why,
    model.archetype,
    model.stories.s25,
    model.stories.s100,
    model.stories.s300,
    model.purpose,
    model.positioning,
    ...model.typeNames,
    ...model.images,
    ...model.voiceItems.flatMap((item) => [item.id, item.text]),
  ];
  for (const value of copy) {
    if (value.includes("!")) throw new Error("Brand kit copy includes an exclamation mark.");
  }
  if (model.typeNames.length > 2) throw new Error("The compiler promised two type names.");
  return {
    why: model.why,
    archetype: model.archetype,
    stories: { s25: model.stories.s25, s100: model.stories.s100, s300: model.stories.s300 },
    voiceItems: model.voiceItems.map((item, index) => ({
      id: item.id.trim() === "" ? `voice-${index + 1}` : item.id,
      text: item.text,
    })),
    images: model.images,
    purpose: model.purpose,
    positioning: model.positioning,
    taglines: model.taglines,
    palette: {
      paper: assertHex(model.palette.paper),
      ink: assertHex(model.palette.ink),
      signal: assertHex(model.palette.signal),
    },
    typeNames: model.typeNames,
    logoSvg: model.logoSvg,
    logoSet: model.logoSet,
  };
}

function assertHex(value: string): string {
  const match = HEX.exec(value.trim());
  const digits = match?.[1];
  if (digits === undefined) throw new Error("Invalid brand hex.");
  const full = digits.length === 3 ? [...digits].map((channel) => channel + channel).join("") : digits;
  return `#${full.toLowerCase()}`;
}

function document(kit: Prepared): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Brand kit, The Hitchhiker's Guide to Web Design</title>
    <link rel="stylesheet" href="design/tokens.css" />
    <link rel="stylesheet" href="design/type.css" />
    <link rel="stylesheet" href="design/components.css" />
    <link rel="stylesheet" href="brand-kit.css" />
  </head>
  <body>
    <a class="hh-skip" href="#kit">Skip to the kit</a>
    <div class="hh-shell">
      <header class="hh-mast">
        <div class="hh-mast__row">
          <p class="hh-kicker">Babel Fish</p>
          <p class="hh-kicker">Guide desk</p>
        </div>
        <div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don't Panic"></div>
        <h1 class="hh-headline">Brand kit</h1>
        <p class="bk-draft">Draft. Not approved.</p>
        <p class="hh-dek">This is the Guide's desk. Approve each piece before it leaves draft. This page is not the website.</p>
      </header>
      <div class="bk-frame" id="kit">
        <nav class="bk-index" aria-label="Kit sections">
          <p class="hh-kicker">In this kit</p>
          <ol>
            <li><a href="#purpose-title">Purpose</a></li>
            <li><a href="#why-title">Why</a></li>
            <li><a href="#story-title">Story</a></li>
            <li><a href="#type-title">Type</a></li>
            <li><a href="#palette-title">Palette</a></li>
            <li><a href="#taglines-title">Taglines</a></li>
            <li><a href="#logo-title">Logo</a></li>
            <li><a href="#imagery-title">Imagery</a></li>
            <li><a href="#voice-title">Voice</a></li>
          </ol>
        </nav>
        <main class="bk-page" data-hh-ready>
          ${purposeBlock(kit)}
          ${storyBlock(kit)}
          ${typeAndPalette(kit)}
          ${taglineBlock(kit)}
          ${logoBlock(kit)}
          ${imageryBlock(kit)}
          ${voiceBlock(kit)}
          <section class="bk-section" aria-labelledby="social-title">
            <h2 class="hh-title" id="social-title">Social frames</h2>
            <p class="bk-copy">Optional. A square frame can be made from this voice later. Nothing on this desk is posted.</p>
          </section>
        </main>
      </div>
      <footer class="hh-status">
        <span>Babel Fish</span>
        <span>Draft</span>
        <span>Not the website</span>
      </footer>
    </div>
  </body>
</html>
`;
}

function purposeBlock(kit: Prepared): string {
  return `<div class="bk-split">
    ${section("purpose", "Purpose", `<p class="bk-copy">${escapeHtml(kit.purpose)}</p>`)}
    <section class="bk-section" aria-labelledby="why-title">
      <h2 class="hh-title" id="why-title">Why</h2>
      <p class="bk-copy">${escapeHtml(kit.why)}</p>
      ${actions("why")}
      ${sectionBody("archetype", "Archetype", `<p class="bk-copy">${escapeHtml(kit.archetype)}</p>`)}
      ${sectionBody("positioning", "Positioning", `<p class="bk-copy">${escapeHtml(kit.positioning)}</p>`)}
    </section>
  </div>`;
}

function storyBlock(kit: Prepared): string {
  const rows = [
    ["story-25", "Twenty-five", kit.stories.s25, "hh-title"],
    ["story-100", "One hundred", kit.stories.s100, "bk-copy"],
    ["story-300", "Three hundred", kit.stories.s300, "bk-copy"],
  ] as const;
  const body = `<div class="bk-stories">${rows
    .map(
      ([id, label, text, klass]) => `<article class="bk-story">
        <p class="hh-micro">${label}</p>
        <p class="${klass}">${escapeHtml(text)}</p>
        ${actions(id)}
      </article>`,
    )
    .join("")}</div>`;
  return `<section class="bk-section" aria-labelledby="story-title"><h2 class="hh-title" id="story-title">Story</h2>${actions("story")}${body}</section>`;
}

function typeAndPalette(kit: Prepared): string {
  return `<div class="bk-split">${typeBlock(kit)}${paletteBlock(kit)}</div>`;
}

function typeBlock(kit: Prepared): string {
  const headline = kit.taglines[0] ?? (kit.positioning.trim() === "" ? "The headline sits here when a line is ready." : kit.positioning);
  const display = kit.typeNames[0];
  const text = kit.typeNames[1] ?? display;
  const names =
    kit.typeNames.length === 0
      ? `<p class="bk-copy">No type pairing yet.</p>`
      : `<p class="hh-small">${kit.typeNames.map((name) => escapeHtml(name)).join(" and ")}.</p>`;
  const body = `<div class="hh-specimen">
      <p class="hh-specimen__display"${familyStyle(display, "--font-display")}>${escapeHtml(headline)}</p>
      <p class="hh-specimen__text"${familyStyle(text, "--font-text")}>${escapeHtml(kit.positioning)}</p>
      ${names}
    </div>`;
  return section("type", "Type", body);
}

function paletteBlock(kit: Prepared): string {
  const { paper, ink, signal } = kit.palette;
  const bands = [
    ["Paper", paper],
    ["Ink", ink],
    ["Signal", signal],
  ] as const;
  const swatches = bands
    .map(([role, hex]) => {
      const label = labelColor(hex);
      return `<div class="bk-band" style="background:${hex};color:${label}"><span>${role}</span><b>${hex.toUpperCase()}</b></div>`;
    })
    .join("");
  const bodyRatio = contrastRatio(ink, paper);
  const markRatio = contrastRatio(signal, paper);
  const bodyLine =
    bodyRatio >= BODY_MIN
      ? `Ink on paper is ${bodyRatio.toFixed(1)}:1. Body text passes.`
      : `Ink on paper is ${bodyRatio.toFixed(1)}:1. Body text fails. This page keeps the desk ink.`;
  const markLine =
    markRatio >= LARGE_MIN
      ? `Signal on paper is ${markRatio.toFixed(1)}:1. Large text passes.`
      : `Signal on paper is ${markRatio.toFixed(1)}:1. Large text fails. The signal stays a swatch.`;
  const body = `<div class="bk-bands">${swatches}</div>
    <p class="hh-small">Paper is the ground, about 60. Ink is the text, about 30. Signal is the mark, about 10. ${bodyLine} ${markLine}</p>`;
  return section("palette", "Palette", body);
}

function taglineBlock(kit: Prepared): string {
  const body =
    kit.taglines.length === 0
      ? `<p class="bk-copy">No taglines yet.</p>`
      : `<ol class="bk-lines">${kit.taglines
          .map((line, index) => {
            const id = `tagline-${index + 1}`;
            return `<li><p class="bk-line"><span class="hh-micro">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(line)}</span></p>${actions(id)}</li>`;
          })
          .join("")}</ol>`;
  return section("taglines", "Taglines", body);
}

function logoBlock(kit: Prepared): string {
  const slots: Array<{ label: string; value: string | null; reversed: boolean }> = [];
  if (kit.logoSet !== null) {
    const inline = kit.logoSvg !== null && kit.logoSvg.trim() !== "" && kit.logoSvg !== kit.logoSet.master;
    if (inline) slots.push({ label: "Inline", value: kit.logoSvg, reversed: false });
    slots.push(
      { label: "Master", value: kit.logoSet.master, reversed: false },
      { label: "One colour", value: kit.logoSet.oneColor, reversed: false },
      { label: "Reversed", value: kit.logoSet.reversed, reversed: true },
      { label: "Favicon", value: kit.logoSet.favicon, reversed: false },
    );
  } else {
    slots.push({ label: "Master", value: kit.logoSvg, reversed: false });
  }
  const cards = slots
    .map((slot) => {
      const plate = slot.reversed ? " bk-mark--reversed" : "";
      return `<article class="bk-logo"><p class="hh-micro">${slot.label}</p><div class="bk-mark${plate}">${logoBody(slot.value)}</div></article>`;
    })
    .join("");
  return section("logo", "Logo", `<div class="bk-logos">${cards}</div>`);
}

function imageryBlock(kit: Prepared): string {
  const body =
    kit.images.length === 0
      ? `<p class="bk-copy">No approved images yet. They show up here after the imagery pass.</p>`
      : `<ul class="bk-figures">${kit.images.map((image) => figure(image)).join("")}</ul>
         <p class="hh-small">Approved images only. The desk does not invent a picture.</p>`;
  return section("imagery", "Imagery", body);
}

function voiceBlock(kit: Prepared): string {
  const body =
    kit.voiceItems.length === 0
      ? `<p class="bk-copy">No voice items yet. Traits, vocabulary, and microcopy land here.</p>`
      : `<ul class="bk-voice">${kit.voiceItems
          .map(
            (item) =>
              `<li><p class="bk-copy">${escapeHtml(item.text)}</p>${actions(item.id)}</li>`,
          )
          .join("")}</ul>`;
  return section("voice", "Voice", body);
}

function section(id: string, title: string, body: string): string {
  return `<section class="bk-section" aria-labelledby="${id}-title"><h2 class="hh-title" id="${id}-title">${title}</h2>${body}${actions(id)}</section>`;
}

function sectionBody(id: string, title: string, body: string): string {
  return `<div class="bk-story"><h2 class="hh-title" id="${id}-title">${title}</h2>${body}${actions(id)}</div>`;
}

function actions(id: string): string {
  const safe = escapeHtml(id);
  return `<div class="hh-approval"><button class="hh-btn hh-btn--primary" type="button" data-approve="${safe}" aria-label="Approve ${safe}">Approve</button><button class="hh-btn hh-btn--secondary" type="button" data-redo="${safe}" aria-label="Redo ${safe}">Redo</button></div>`;
}

function figure(image: string): string {
  const caption = escapeHtml(image);
  if (!SAFE_IMAGE.test(image)) return `<li class="bk-figure"><p class="bk-copy">${caption}</p></li>`;
  return `<li class="bk-figure"><img src="${escapeHtml(image)}" alt="Approved image" /><figcaption class="hh-small">${caption}</figcaption></li>`;
}

function logoBody(value: string | null): string {
  if (value === null || value.trim() === "") return `<p class="bk-copy">No logo yet</p>`;
  if (!/<svg\b/i.test(value)) return `<p class="bk-copy">${escapeHtml(value)}</p>`;
  if (logoRejected(value)) return `<p class="bk-copy">Logo rejected by the SVG check.</p>`;
  return value.trim();
}

/** Same forbidden substrings as assertLogoSvg, plus script, style, and event handlers. */
function logoRejected(svg: string): boolean {
  if (svg.trim() === "") return true;
  if (/<image\b/i.test(svg) || /data:image/i.test(svg)) return true;
  if (/<foreignObject\b/i.test(svg)) return true;
  if (/<text\b/i.test(svg)) return true;
  if (/<script\b/i.test(svg) || /javascript:/i.test(svg)) return true;
  if (/<style\b/i.test(svg) || /on[a-z]+\s*=/i.test(svg)) return true;
  if (!/<svg\b/i.test(svg) || !/<path\b/i.test(svg)) return true;
  if (strokeColors(svg).size > 1) return true;
  const close = /<\/svg>/i.exec(svg);
  if (close?.index === undefined) return true;
  if (svg.slice(close.index + close[0].length).trim() !== "") return true;
  return false;
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

function familyStyle(name: string | undefined, token: string): string {
  if (name === undefined || !FAMILY.test(name)) return "";
  return ` style="font-family:'${name}', var(${token})"`;
}

function labelColor(background: string): string {
  const dark = contrastRatio(LABEL_DARK, background);
  const light = contrastRatio(LABEL_LIGHT, background);
  if (dark >= BODY_MIN && dark >= light) return LABEL_DARK;
  if (light >= BODY_MIN) return LABEL_LIGHT;
  return dark >= light ? LABEL_DARK : LABEL_LIGHT;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function standAlone(html: string): string {
  const sheets = ["design/tokens.css", "design/type.css", "design/components.css", "brand-kit.css"];
  let next = html;
  for (const sheet of sheets) {
    const css = readFileSync(path.join(here, sheet), "utf8").replaceAll("../../public/fonts/", "fonts/");
    next = next.replace(`<link rel="stylesheet" href="${sheet}" />`, `<style>${css}</style>`);
  }
  return next;
}

function renderPdf(model: BrandKitModel): Buffer {
  const kit = prepare(model);
  const lines = [
    "Brand kit",
    "Draft. Not approved.",
    "This print is the brand kit draft. It is not the website.",
    "",
    "Purpose",
    kit.purpose,
    "",
    "Why",
    kit.why,
    "",
    "Archetype",
    kit.archetype,
    "",
    "Positioning",
    kit.positioning,
    "",
    "Story, twenty-five",
    kit.stories.s25,
    "",
    "Story, one hundred",
    kit.stories.s100,
    "",
    "Story, three hundred",
    kit.stories.s300,
    "",
    "Palette",
    `Paper ${kit.palette.paper}`,
    `Ink ${kit.palette.ink}`,
    `Signal ${kit.palette.signal}`,
    "",
    "Type",
    kit.typeNames.length === 0 ? "No type pairing yet." : kit.typeNames.join(", "),
    "",
    "Taglines",
    kit.taglines.length === 0 ? "No taglines yet." : kit.taglines.map((line, index) => `${index + 1}. ${line}`).join("\n"),
    "",
    "Logo",
    kit.logoSvg === null ? "No logo yet" : logoRejected(kit.logoSvg) ? "Logo rejected by the SVG check." : "Master mark included.",
    "",
    "Imagery",
    kit.images.length === 0 ? "No approved images yet." : kit.images.join("\n"),
    "",
    "Voice",
    kit.voiceItems.length === 0 ? "No voice items yet." : kit.voiceItems.map((item) => item.text).join("\n"),
    "",
    "Social frames are optional. Nothing is posted.",
  ];
  return buildPdf(lines.flatMap((line) => line.split("\n")));
}

function buildPdf(lines: readonly string[]): Buffer {
  const wrapped = lines.flatMap((line) => wrapPdf(line, 84));
  const pageSize = 42;
  const pages: string[][] = [];
  for (let index = 0; index < wrapped.length; index += pageSize) {
    pages.push(wrapped.slice(index, index + pageSize));
  }
  if (pages.length === 0) pages.push(["Brand kit"]);

  const objects: string[] = [];
  const pageIds: number[] = [];
  const fontId = 3 + pages.length * 2;
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  for (let index = 0; index < pages.length; index += 1) {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
    const commands = ["BT", "/F1 11 Tf", "54 740 Td", "16 TL"];
    for (const line of pages[index] ?? []) {
      commands.push(`(${pdfText(line)}) Tj`, "T*");
    }
    commands.push("ET");
    const stream = commands.join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const header = Buffer.from("%PDF-1.4\n", "latin1");
  const chunks: Buffer[] = [header];
  const offsets: number[] = [0];
  let cursor = header.length;
  objects.forEach((body, index) => {
    const chunk = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    offsets.push(cursor);
    chunks.push(chunk);
    cursor += chunk.length;
  });
  const xrefAt = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function wrapPdf(line: string, max: number): string[] {
  const words = line.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [""];
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    const pieces = word.length > max ? chunk(word, max) : [word];
    for (const piece of pieces) {
      const next = current === "" ? piece : `${current} ${piece}`;
      if (current !== "" && next.length > max) {
        out.push(current);
        current = piece;
      } else {
        current = next;
      }
    }
  }
  if (current !== "") out.push(current);
  return out;
}

function chunk(value: string, max: number): string[] {
  const parts: string[] = [];
  for (let index = 0; index < value.length; index += max) {
    parts.push(value.slice(index, index + max));
  }
  return parts;
}

function pdfText(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 63;
    if (code === 10) continue;
    if (code >= 32 && code <= 126) out += ch;
    else if (ch === "\u2019" || ch === "\u2018") out += "'";
    else if (ch === "\u201c" || ch === "\u201d") out += '"';
    else out += "?";
  }
  return out.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}
