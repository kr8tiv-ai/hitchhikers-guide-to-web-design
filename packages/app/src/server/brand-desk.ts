/**
 * Brand desk. The kit file is `.hitchhiker/brand/brand-kit.json`, a BrandKitModel.
 * GET /brand calls renderBrandKit on that file. brand-kit.html is served only
 * when the JSON is absent, because that HTML is already renderBrandKit output.
 * No kit file leaves the empty plate alone. /approve is a different plate.
 * Approve calls applyStatus under the state lock. Redo calls redoSection.
 * Section ids are the six BRAND_SECTIONS. Nothing here starts a later phase.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BRAND_SECTIONS,
  BrandApprovalError,
  LockHeld,
  applyStatus,
  redoSection,
  replaceViaTemp,
  withStateLock,
} from "@hitchhiker/engine";
import { renderBrandKit, type BrandKitModel } from "../brand-kit.ts";
import { escapeHtml } from "../card.ts";

export type KitLoad =
  | { kind: "missing" }
  | { kind: "html"; html: string }
  | { kind: "bad" };

interface DecisionBody {
  ok: true;
  section: string;
  action: "approve" | "redo";
  allApproved: boolean;
}

export async function loadBrandKit(projectDir: string): Promise<KitLoad> {
  const dir = path.join(projectDir, ".hitchhiker", "brand");
  const json = await readOptional(path.join(dir, "brand-kit.json"));
  if (json !== null) {
    const model = parseKitModel(json);
    if (model === null) return { kind: "bad" };
    try {
      return { kind: "html", html: renderBrandKit(model) };
    } catch {
      return { kind: "bad" };
    }
  }
  const html = await readOptional(path.join(dir, "brand-kit.html"));
  if (html === null) return { kind: "missing" };
  return { kind: "html", html };
}

/** Dress renderBrandKit output for the local desk. Asset paths stay on this server. */
export function dressBrandKit(html: string, token: string, navHtml: string): string {
  let next = html
    .replaceAll('href="design/tokens.css"', 'href="/src/design/tokens.css"')
    .replaceAll('href="design/type.css"', 'href="/src/design/type.css"')
    .replaceAll('href="design/components.css"', 'href="/src/design/components.css"')
    .replaceAll('href="brand-kit.css"', 'href="/src/brand-kit.css"');
  const csrf = `<meta name="hh-csrf" content="${escapeHtml(token)}" />`;
  if (next.includes('<meta charset="utf-8" />')) {
    next = next.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    ${csrf}`);
  } else {
    next = next.replace("<head>", `<head>\n    ${csrf}`);
  }
  const wordmark =
    '<div class="hh-wordmark hh-wordmark--quiet" role="img" aria-label="Don\'t Panic"></div>';
  if (next.includes(wordmark)) {
    next = next.replace(wordmark, `${wordmark}\n        ${navHtml}`);
  }
  if (next.includes('<main class="bk-page" data-hh-ready>')) {
    next = next.replace(
      '<main class="bk-page" data-hh-ready>',
      '<main class="bk-page" data-brand-desk data-hh-ready>',
    );
  } else if (next.includes('<main class="bk-page">')) {
    next = next.replace('<main class="bk-page">', '<main class="bk-page" data-brand-desk data-hh-ready>');
  } else {
    next = next.replace("<body>", "<body data-brand-desk>");
  }
  if (next.includes("</main>")) {
    next = next.replace("</main>", `${fileGate()}\n        </main>`);
  }
  return next.replace("</body>", `    <script type="module" src="/client/brand.js"></script>\n  </body>`);
}

export function renderBrandKitError(token: string, navHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="hh-csrf" content="${escapeHtml(token)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Brand kit</title>
    <link rel="stylesheet" href="/src/design/tokens.css" />
    <link rel="stylesheet" href="/src/design/type.css" />
    <link rel="stylesheet" href="/src/design/components.css" />
    <link rel="stylesheet" href="/src/shell.css" />
  </head>
  <body>
    <div class="hh-shell">
      <header class="hh-mast">
        <p class="hh-kicker">Brand kit</p>
        ${navHtml}
      </header>
      <main id="main" class="hh-read" data-hh-ready>
        <div class="hh-empty">
          <h1 class="hh-empty__title">The brand kit file could not be read</h1>
          <p>The file is on disk, and it is not a kit this desk can show.</p>
        </div>
      </main>
    </div>
  </body>
</html>
`;
}

export async function postBrandDecision(
  projectDir: string,
  raw: string,
): Promise<{ status: number; body: DecisionBody | { error: string } }> {
  const parsed = parseDecision(raw);
  if ("error" in parsed) return { status: 400, body: { error: parsed.error } };
  try {
    if (parsed.action === "redo") {
      await redoSection(projectDir, parsed.section);
      return {
        status: 200,
        body: { ok: true, section: parsed.section, action: "redo", allApproved: false },
      };
    }
    const allApproved = await approveThroughStatus(projectDir, parsed.section);
    return {
      status: 200,
      body: { ok: true, section: parsed.section, action: "approve", allApproved },
    };
  } catch (error: unknown) {
    if (error instanceof BrandApprovalError) return { status: 400, body: { error: error.message } };
    if (error instanceof LockHeld) {
      return { status: 409, body: { error: "The brand file is saving. Try again." } };
    }
    throw error;
  }
}

function fileGate(): string {
  const rows = BRAND_SECTIONS.map((section) => {
    const label = section.slice(0, 1).toUpperCase() + section.slice(1);
    return `<div class="bk-story"><h2 class="hh-title" id="file-${section}-title">${label}</h2><div class="hh-approval"><button class="hh-btn hh-btn--primary" type="button" data-approve="${section}" aria-label="Approve ${label}">Approve</button><button class="hh-btn hh-btn--secondary" type="button" data-redo="${section}" aria-label="Redo ${label}">Redo</button></div></div>`;
  }).join("");
  return `<section class="bk-section" aria-labelledby="file-gate-title"><h2 class="hh-title" id="file-gate-title">Brand file</h2><p class="bk-copy">The brand file has six sections. Approve each one here. A redo clears that section, and the file stays draft until all six are approved.</p>${rows}<p class="hh-approval__note" data-brand-note hidden></p></section>`;
}

async function approveThroughStatus(projectDir: string, section: SectionName): Promise<boolean> {
  return withStateLock(projectDir, async () => {
    const dir = path.join(projectDir, ".hitchhiker");
    const approvals = await readFlags(path.join(dir, "brand-approval.json"));
    const brandPath = path.join(dir, "BRAND.md");
    let markdown: string;
    try {
      markdown = await readFile(brandPath, "utf8");
    } catch (error: unknown) {
      if (errorCode(error) === "ENOENT") throw new BrandApprovalError("BRAND.md is missing.");
      throw error;
    }
    const next: Record<SectionName, boolean> = { ...approvals, [section]: true };
    const rewritten = applyStatus(markdown, next);
    await replaceViaTemp(path.join(dir, "brand-approval.json"), serialize(next));
    await replaceViaTemp(brandPath, rewritten);
    return allApproved(next);
  });
}

type SectionName = (typeof BRAND_SECTIONS)[number];

function parseDecision(raw: string): { section: SectionName; action: "approve" | "redo" } | { error: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return { error: "The desk could not read that request." };
  }
  if (!isRecord(value)) return { error: "The desk could not read that request." };
  const section = value.section;
  const action = value.action;
  if (typeof section !== "string" || !isSection(section)) {
    return { error: "Unknown brand section." };
  }
  if (action !== "approve" && action !== "redo") {
    return { error: "Unknown brand action." };
  }
  return { section, action };
}

function isSection(value: string): value is SectionName {
  for (const section of BRAND_SECTIONS) {
    if (section === value) return true;
  }
  return false;
}

function blankFlags(): Record<SectionName, boolean> {
  return {
    purpose: false,
    voice: false,
    tokens: false,
    imagery: false,
    logo: false,
    neighbors: false,
  };
}

function allApproved(approvals: Record<SectionName, boolean>): boolean {
  for (const section of BRAND_SECTIONS) {
    if (approvals[section] !== true) return false;
  }
  return true;
}

function serialize(approvals: Record<SectionName, boolean>): string {
  const ordered: Record<string, boolean> = {};
  for (const section of BRAND_SECTIONS) ordered[section] = approvals[section] === true;
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

async function readFlags(file: string): Promise<Record<SectionName, boolean>> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return blankFlags();
    throw error;
  }
  const text = raw.replace(/^\uFEFF/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new BrandApprovalError("brand-approval.json is not valid JSON.");
  }
  if (!isRecord(parsed)) throw new BrandApprovalError("brand-approval.json is not an object.");
  const next = blankFlags();
  for (const section of BRAND_SECTIONS) {
    if (!Object.hasOwn(parsed, section)) continue;
    const value = parsed[section];
    if (typeof value !== "boolean") {
      throw new BrandApprovalError(`brand-approval.json ${section} is not a boolean.`);
    }
    next[section] = value;
  }
  return next;
}

function parseKitModel(raw: string): BrandKitModel | null {
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const stories = value.stories;
  const palette = value.palette;
  if (!isRecord(stories) || !isRecord(palette)) return null;
  const purpose = asString(value.purpose);
  const why = asString(value.why);
  const archetype = asString(value.archetype);
  const positioning = asString(value.positioning);
  const s25 = asString(stories.s25);
  const s100 = asString(stories.s100);
  const s300 = asString(stories.s300);
  const paper = asString(palette.paper);
  const ink = asString(palette.ink);
  const signal = asString(palette.signal);
  const voiceItems = asVoice(value.voiceItems);
  const images = asStrings(value.images);
  const taglines = asStrings(value.taglines);
  const typeNames = asStrings(value.typeNames);
  const logoSet = asLogoSet(value.logoSet);
  const logoSvg = value.logoSvg === null ? null : asString(value.logoSvg);
  if (
    purpose === null ||
    why === null ||
    archetype === null ||
    positioning === null ||
    s25 === null ||
    s100 === null ||
    s300 === null ||
    paper === null ||
    ink === null ||
    signal === null ||
    voiceItems === null ||
    images === null ||
    taglines === null ||
    typeNames === null ||
    logoSet === undefined ||
    (logoSvg === null && value.logoSvg !== null)
  ) {
    return null;
  }
  return {
    purpose,
    why,
    archetype,
    positioning,
    stories: { s25, s100, s300 },
    voiceItems,
    images,
    taglines,
    palette: { paper, ink, signal },
    typeNames,
    logoSvg,
    logoSet,
  };
}

function asLogoSet(value: unknown): BrandKitModel["logoSet"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const master = asString(value.master);
  const oneColor = asString(value.oneColor);
  const reversed = asString(value.reversed);
  const favicon = asString(value.favicon);
  if (master === null || oneColor === null || reversed === null || favicon === null) return undefined;
  return { master, oneColor, reversed, favicon };
}

function asVoice(value: unknown): Array<{ id: string; text: string }> | null {
  if (!Array.isArray(value)) return null;
  const items: Array<{ id: string; text: string }> = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const id = asString(item.id);
    const text = asString(item.text);
    if (id === null || text === null) return null;
    items.push({ id, text });
  }
  return items;
}

function asStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    items.push(item);
  }
  return items;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error: unknown) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}
