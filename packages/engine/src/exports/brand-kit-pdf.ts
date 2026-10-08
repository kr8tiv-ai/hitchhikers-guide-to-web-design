/**
 * Print HTML for the client brand kit.
 * Styles are the desk tokens, type, and the reveal print sheet.
 * Unapproved sections stay out. Agency mode adds the cover in the caller.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export type PdfPaper = "A4" | "Letter";

export interface PdfAgency {
  name: string;
  client: string;
}

export interface PdfExportOptions {
  paper: PdfPaper;
  agency?: PdfAgency;
}

export class ExportPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportPdfError";
  }
}

interface PrintSection {
  heading: string;
  body: string;
}

const SECTION_HEADINGS: Record<string, string> = {
  purpose: "# Purpose",
  voice: "## Voice",
  tokens: "## Tokens",
  imagery: "## Imagery",
  neighbors: "## Neighbors",
};

const KIND_LABEL: Record<string, string> = {
  purpose: "Purpose",
  palette: "Palette",
  type: "Type",
  logo: "Logo",
  voice: "Voice",
  tagline: "Taglines",
  taglines: "Taglines",
  imagery: "Imagery",
  story: "Story",
  positioning: "Positioning",
};

const here = path.dirname(fileURLToPath(import.meta.url));

export function readBrandName(projectDir: string): string | null {
  const context = readOptional(path.join(projectDir, ".hitchhiker", "CONTEXT.md"));
  if (context === null) return null;
  const match = /^Name:\s*(.+)$/m.exec(context);
  const raw = match?.[1];
  if (raw === undefined) return null;
  const name = oneLine(raw);
  return name === "" ? null : name;
}

export function renderBrandKitPrint(projectDir: string, brandName: string): string {
  const sections = approvedSections(projectDir);
  if (sections.length === 0) {
    return `<section class="pdf-section">
      <h2 class="hh-title">Not approved yet</h2>
      <p>Nothing in this kit is approved yet. Approve a section, then export again.</p>
    </section>`;
  }
  return sections
    .map(
      (section) => `<section class="pdf-section">
        <h2 class="hh-title">${escapeHtml(section.heading)}</h2>
        <p>${escapeHtml(section.body)}</p>
      </section>`,
    )
    .join("\n");
}

export function renderPrintDocument(input: {
  paper: PdfPaper;
  brandName: string;
  documentTitle: string;
  agency?: PdfAgency;
  bodyHtml: string;
}): string {
  const cover =
    input.agency === undefined
      ? ""
      : `<header class="pdf-cover">
          <p class="pdf-kicker">${escapeHtml(input.agency.name)}</p>
          <hr class="pdf-rule" />
          <h1 class="hh-headline">${escapeHtml(input.brandName)}</h1>
          <p class="pdf-dek">Prepared for ${escapeHtml(input.agency.client)}.</p>
          <p class="hh-title">${escapeHtml(input.documentTitle)}</p>
          <p class="hh-small pdf-footer">The Hitchhiker's Guide to Web Design</p>
        </header>`;
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.documentTitle)}, ${escapeHtml(input.brandName)}</title>
    <style>
${loadPrintCss()}
@page { size: ${input.paper}; margin: 16mm; }
    </style>
  </head>
  <body class="pdf-sheet">
    ${cover}
    <main class="pdf-main">
      <p class="pdf-kicker">${escapeHtml(input.documentTitle)}</p>
      <h1 class="hh-headline">${escapeHtml(input.brandName)}</h1>
      ${input.bodyHtml}
      <p class="hh-small pdf-footer">The Hitchhiker's Guide to Web Design</p>
    </main>
  </body>
</html>
`;
}

export function assertExportOptions(opts: PdfExportOptions): void {
  if (opts.paper !== "A4" && opts.paper !== "Letter") {
    throw new ExportPdfError("Paper must be A4 or Letter.");
  }
  if (opts.agency === undefined) return;
  const name = oneLine(opts.agency.name);
  const client = oneLine(opts.agency.client);
  if (name === "" || client === "") {
    throw new ExportPdfError("Agency name and client are required.");
  }
  opts.agency.name = name;
  opts.agency.client = client;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function oneLine(value: string): string {
  return value
    .replace(/[!！]/g, "")
    .replace(/\u2014/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function approvedSections(projectDir: string): PrintSection[] {
  const hitch = path.join(projectDir, ".hitchhiker");
  const sections: PrintSection[] = [];
  const brand = readOptional(path.join(hitch, "BRAND.md"));
  const flags = readApprovalFlags(path.join(hitch, "brand-approval.json"));
  if (brand !== null && flags !== null) {
    for (const key of Object.keys(SECTION_HEADINGS)) {
      if (flags[key] !== true) continue;
      const heading = SECTION_HEADINGS[key];
      if (heading === undefined) continue;
      const body = sectionBody(brand, heading);
      if (body === null) continue;
      sections.push({ heading: heading.replace(/^#+\s*/, ""), body });
    }
  }
  const items = readApprovedItems(path.join(hitch, "brand", "approvals.json"));
  const covered = new Set(sections.map((section) => section.heading.toLowerCase()));
  const grouped = new Map<string, string[]>();
  for (const item of items) {
    const label = KIND_LABEL[item.kind] ?? item.kind;
    if (covered.has(label.toLowerCase())) continue;
    const list = grouped.get(label) ?? [];
    list.push(item.text);
    grouped.set(label, list);
  }
  for (const [heading, lines] of grouped) {
    sections.push({ heading, body: lines.join("\n") });
  }
  return sections;
}

function sectionBody(markdown: string, heading: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) return null;
  const body: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^#{1,3}\s/.test(line.trim())) break;
    if (/^Status:\s*(?:draft|approved)\s*$/i.test(line.trim())) continue;
    body.push(line);
  }
  const text = oneLine(body.join(" "));
  return text === "" ? null : text;
}

function readApprovalFlags(file: string): Record<string, boolean> | null {
  const raw = readOptional(file);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ExportPdfError("brand-approval.json is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ExportPdfError("brand-approval.json is not an object.");
  }
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "boolean") flags[key] = value;
  }
  return flags;
}

function readApprovedItems(file: string): Array<{ kind: string; text: string }> {
  const raw = readOptional(file);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ExportPdfError("approvals.json is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || !("items" in parsed) || !Array.isArray(parsed.items)) {
    throw new ExportPdfError("approvals.json is missing items.");
  }
  const items: Array<{ kind: string; text: string }> = [];
  for (const entry of parsed.items) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record.status !== "approved") continue;
    if (typeof record.kind !== "string" || typeof record.text !== "string") continue;
    const text = oneLine(record.text);
    const kind = oneLine(record.kind).toLowerCase();
    if (text === "" || kind === "") continue;
    items.push({ kind, text });
  }
  return items;
}

function readOptional(file: string): string | null {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (isEnoent(error)) return null;
    throw error;
  }
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function loadPrintCss(): string {
  const design = path.resolve(here, "../../../app/src/design");
  const revealCss = path.resolve(here, "../../../app/src/reveals/reveals.css");
  const fonts = path.resolve(here, "../../../app/public/fonts");
  const fontHref = `${pathToFileURL(fonts).href}/`;
  const tokens = readFileSync(path.join(design, "tokens.css"), "utf8");
  const type = readFileSync(path.join(design, "type.css"), "utf8").replaceAll("../../public/fonts/", fontHref);
  const print = readFileSync(revealCss, "utf8");
  return `${tokens}\n${type}\n${print}`;
}
