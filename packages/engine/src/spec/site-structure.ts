/**
 * Listing structure gates for built HTML.
 * A concept caption, an empty gallery, a repeated spec or inquiry block, and a
 * home page that names listings without a card each fail on their own.
 * Comments, scripts, and styles are ignored. Header, footer, and nav may
 * repeat a heading. A prompt that does not own the file is filtered later.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { SurfaceHit } from "./site-surface.ts";

const STRUCTURE_CAP = 40;
const FILE_CAP = 2_000_000;
const CLIP = 180;
const CONCEPT_PHRASE = /concept,\s*not a real listing/i;
const CONCEPT_WORD = /\bconcept\b/i;
const ONE_OF_ONE = /\b1\s+of\s+1\b/gi;
const GALLERY_WORD = /\b(?:gallery|carousel)\b/i;
const GALLERY_SKIP = /\b(?:controls?|pager|status|counter|buttons?|nav)\b/i;
const CARD_TOKEN = /(?:^|-)cards?(?:-|$)/i;
const UTILITY_FORM = /newsletter|search|filter|login|sign-up|signup|subscribe/i;
const PLURAL_COLLECTION = /^(?:farms|listings|products|properties|parcels)$/i;
const SINGULAR_COLLECTION = /^(?:farm|listing|product|property|parcel)$/i;
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

interface Frame {
  tag: string;
  gallery: boolean;
  card: boolean;
  article: boolean;
  chrome: boolean;
  inquiry: boolean;
  figcaption: boolean;
  heading: boolean;
  text: string;
  imgCount: number;
}

export function scanConceptImages(root: string): SurfaceHit[] {
  return scanFiles(root, conceptHits);
}

export function scanEmptyGalleries(root: string): SurfaceHit[] {
  return scanFiles(root, galleryHits);
}

export function scanDuplicateBlocks(root: string): SurfaceHit[] {
  return scanFiles(root, duplicateHits);
}

export function scanHomeListings(root: string): SurfaceHit[] {
  if (!isDirectory(root)) return [];
  const files = htmlFiles(root);
  const listings = files.filter(isListingDetailFile);
  if (listings.length === 0) return [];
  const home = files.find((file) => file === "index.html" || file === "index.htm");
  if (home === undefined) return [];
  const html = readHtml(path.join(root, home));
  if (html === null) return [];
  if (hasListingCardLink(html, listings)) return [];
  return [{ file: home, detail: "no card links to a listing page" }];
}

export function formatConceptImageFailure(hits: readonly SurfaceHit[]): string {
  return formatStructureFailure("Concept image failed.", hits);
}

export function formatEmptyGalleryFailure(hits: readonly SurfaceHit[]): string {
  return formatStructureFailure("Empty gallery failed.", hits);
}

export function formatDuplicateBlockFailure(hits: readonly SurfaceHit[]): string {
  return formatStructureFailure("Duplicate block failed.", hits);
}

export function formatHomeListingsFailure(hits: readonly SurfaceHit[]): string {
  return formatStructureFailure("Home listings failed.", hits);
}

function conceptHits(file: string, html: string): SurfaceHit[] {
  const hits: SurfaceHit[] = [];
  const listing = isListingSurface(file);
  walkHtml(html, {
    text(text, stack) {
      if (!CONCEPT_PHRASE.test(text)) return;
      if (!listing && !inCard(stack)) return;
      hits.push({ file, detail: clip(text) });
    },
    open(frame, attrs, ancestors) {
      const card = frame.card || frame.article || inCard(ancestors);
      const alt = attrs.get("alt");
      const title = attrs.get("title");
      if (alt !== undefined && CONCEPT_PHRASE.test(alt) && (listing || card)) hits.push({ file, detail: clip(alt) });
      if (title !== undefined && CONCEPT_PHRASE.test(title) && (listing || card)) {
        hits.push({ file, detail: clip(title) });
      }
      if (frame.tag === "img" && alt !== undefined && (listing || card)) {
        const short = shortConcept(alt);
        if (short !== null) hits.push({ file, detail: short });
      }
    },
    close(frame, ancestors) {
      if (!frame.figcaption) return;
      const short = shortConcept(frame.text);
      if (short === null) return;
      if (!listing && !inCard(ancestors)) return;
      hits.push({ file, detail: short });
    },
  });
  return hits;
}

function galleryHits(file: string, html: string): SurfaceHit[] {
  const hits: SurfaceHit[] = [];
  const texts: string[] = [];
  walkHtml(html, {
    text(text) {
      if (text.trim() !== "") texts.push(text);
    },
    open(frame, _attrs, ancestors) {
      if (frame.tag !== "img") return;
      for (const ancestor of ancestors) {
        if (ancestor.gallery) ancestor.imgCount += 1;
      }
    },
    close(frame) {
      if (!frame.gallery) return;
      if (frame.imgCount === 0) hits.push({ file, detail: "gallery has no image" });
      else if (frame.imgCount === 1) hits.push({ file, detail: "gallery has 1 image" });
    },
  });
  if (controlsSayOneOfOne(texts.join(" "))) hits.push({ file, detail: "carousel controls say 1 of 1" });
  return hits;
}

function duplicateHits(file: string, html: string): SurfaceHit[] {
  const hits: SurfaceHit[] = [];
  const headings = new Map<string, { count: number; sample: string }>();
  let forms = 0;
  const listing = isListingDetailFile(file);
  walkHtml(html, {
    close(frame) {
      if (frame.heading && !frame.chrome) noteHeading(headings, frame.text);
      if (listing && frame.inquiry) forms += 1;
    },
  });
  for (const row of headings.values()) {
    if (row.count < 2) continue;
    hits.push({ file, detail: `heading "${row.sample}" appears ${String(row.count)} times` });
  }
  if (forms > 1) hits.push({ file, detail: `${String(forms)} inquiry forms` });
  return hits;
}

function hasListingCardLink(html: string, listings: readonly string[]): boolean {
  let found = false;
  walkHtml(html, {
    open(frame, attrs, ancestors) {
      if (found || frame.tag !== "a") return;
      const href = attrs.get("href");
      if (href === undefined) return;
      const card = frame.card || ancestors.some((item) => item.card || item.article);
      if (!card) return;
      if (linksToListing(href, listings)) found = true;
    },
  });
  return found;
}

function noteHeading(headings: Map<string, { count: number; sample: string }>, raw: string): void {
  const sample = raw.replace(/\s+/g, " ").trim();
  const key = sample.toLowerCase();
  if (key.length < 3 || !/[a-z0-9]/i.test(key)) return;
  const row = headings.get(key);
  if (row === undefined) headings.set(key, { count: 1, sample });
  else row.count += 1;
}

function shortConcept(value: string): string | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (text === "" || wordCount(text) > 12 || !CONCEPT_WORD.test(text)) return null;
  return clip(text);
}

function wordCount(value: string): number {
  return value.split(/\s+/).filter((word) => /[0-9A-Za-z]/.test(word)).length;
}

function controlsSayOneOfOne(flat: string): boolean {
  const text = flat.replace(/\s+/g, " ");
  for (const match of text.matchAll(new RegExp(ONE_OF_ONE.source, "gi"))) {
    const index = match.index ?? 0;
    const start = Math.max(0, index - 180);
    const end = Math.min(text.length, index + match[0].length + 180);
    const window = text.slice(start, end);
    if (/\bprevious\b/i.test(window) && /\bnext\b/i.test(window)) return true;
  }
  return false;
}

function inCard(stack: readonly Frame[]): boolean {
  return stack.some((frame) => frame.card || frame.article);
}

function linksToListing(href: string, listings: readonly string[]): boolean {
  const normalized = normalizeHref(href);
  if (normalized === null) return false;
  const key = pageKey(normalized);
  return listings.some((file) => pageKey(file) === key);
}

function normalizeHref(href: string): string | null {
  const trimmed = href.trim();
  if (trimmed === "" || trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  const pathOnly = (trimmed.split("#")[0] ?? "").split("?")[0] ?? "";
  if (pathOnly.includes("..")) return null;
  let rel = pathOnly.replace(/^\.\//, "").replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) rel = `${rel}index.html`;
  else if (!/\.[a-z0-9]+$/i.test(rel)) rel = `${rel}.html`;
  return rel;
}

function pageKey(file: string): string {
  return file
    .replace(/\\/g, "/")
    .replace(/\/index\.html?$/i, "")
    .replace(/\.html?$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

function pathParts(file: string): string[] {
  return pageKey(file).split("/").filter((part) => part !== "");
}

function isCollectionName(name: string): boolean {
  return PLURAL_COLLECTION.test(name) || SINGULAR_COLLECTION.test(name);
}

/** A listing page has an id under a collection, or it is the singular collection itself. */
function isListingDetailFile(file: string): boolean {
  const parts = pathParts(file);
  for (let index = 0; index < parts.length; index += 1) {
    const name = parts[index] ?? "";
    const rest = parts.slice(index + 1);
    if (PLURAL_COLLECTION.test(name) && rest.length > 0) return true;
    if (SINGULAR_COLLECTION.test(name)) return true;
  }
  return false;
}

function isListingSurface(file: string): boolean {
  const segments = file.replace(/\\/g, "/").split("/");
  return segments.some((segment) => isCollectionName(segment.replace(/\.html?$/i, "")));
}

function isGalleryElement(tag: string, attrs: ReadonlyMap<string, string>): boolean {
  if (tag === "html" || tag === "body" || tag === "head" || VOID_TAGS.has(tag)) return false;
  const classId = `${attrs.get("class") ?? ""} ${attrs.get("id") ?? ""}`;
  if (GALLERY_SKIP.test(classId)) return false;
  return GALLERY_WORD.test(gallerySignal(attrs));
}

function gallerySignal(attrs: ReadonlyMap<string, string>): string {
  const parts: string[] = [attrs.get("class") ?? "", attrs.get("id") ?? "", attrs.get("role") ?? ""];
  for (const [key, value] of attrs) {
    if (key === "aria-roledescription" || key.startsWith("data-")) parts.push(key, value);
  }
  return parts.join(" ");
}

function hasCardClass(attrs: ReadonlyMap<string, string>): boolean {
  const className = attrs.get("class") ?? "";
  return className.split(/\s+/).some((token) => token !== "" && CARD_TOKEN.test(token));
}

function isChrome(tag: string, attrs: ReadonlyMap<string, string>): boolean {
  if (tag === "header" || tag === "footer" || tag === "nav") return true;
  const role = (attrs.get("role") ?? "").toLowerCase();
  return role === "banner" || role === "contentinfo" || role === "navigation";
}

function isUtilityForm(attrs: ReadonlyMap<string, string>): boolean {
  const parts: string[] = [];
  for (const [key, value] of attrs) {
    if (key === "class" || key === "id" || key === "name" || key.startsWith("aria-")) parts.push(key, value);
  }
  return UTILITY_FORM.test(parts.join(" "));
}

function walkHtml(
  html: string,
  handlers: {
    text?: (text: string, stack: readonly Frame[]) => void;
    open?: (frame: Frame, attrs: ReadonlyMap<string, string>, ancestors: readonly Frame[]) => void;
    close?: (frame: Frame, ancestors: readonly Frame[]) => void;
  },
): void {
  const clean = stripNoise(html);
  const stack: Frame[] = [];
  let index = 0;
  while (index < clean.length) {
    if (clean[index] !== "<") {
      const next = clean.indexOf("<", index);
      const end = next === -1 ? clean.length : next;
      const text = clean.slice(index, end);
      handlers.text?.(text, stack);
      appendText(stack, text);
      index = end;
      continue;
    }
    if (clean.startsWith("<!", index)) {
      const end = clean.indexOf(">", index);
      index = end === -1 ? clean.length : end + 1;
      continue;
    }
    const tag = readTag(clean, index);
    if (tag === null) break;
    index = tag.end;
    if (tag.closing) {
      closeTag(stack, tag.name, (frame, ancestors) => handlers.close?.(frame, ancestors));
      continue;
    }
    const ancestors = stack.slice();
    const frame = makeFrame(tag.name, tag.attrs, ancestors);
    handlers.open?.(frame, tag.attrs, ancestors);
    if (!tag.selfClosing && !VOID_TAGS.has(tag.name)) stack.push(frame);
  }
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame !== undefined) handlers.close?.(frame, stack);
  }
}

function appendText(stack: readonly Frame[], text: string): void {
  const piece = text.replace(/\s+/g, " ");
  if (piece.trim() === "" && !/\s/.test(text)) return;
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const frame = stack[index];
    if (frame === undefined) continue;
    if (!frame.heading && !frame.figcaption) continue;
    frame.text += piece;
    if (frame.heading || frame.figcaption) break;
  }
}

function makeFrame(tag: string, attrs: ReadonlyMap<string, string>, ancestors: readonly Frame[]): Frame {
  const parentChrome = ancestors.some((frame) => frame.chrome);
  const chrome = parentChrome || isChrome(tag, attrs);
  return {
    tag,
    gallery: isGalleryElement(tag, attrs),
    card: hasCardClass(attrs),
    article: tag === "article",
    chrome,
    inquiry: tag === "form" && !chrome && !isUtilityForm(attrs),
    figcaption: tag === "figcaption",
    heading: tag === "h2" || tag === "h3",
    text: "",
    imgCount: 0,
  };
}

function closeTag(stack: Frame[], tag: string, finalize: (frame: Frame, ancestors: Frame[]) => void): void {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]?.tag !== tag) continue;
    const removed = stack.splice(index);
    for (let child = removed.length - 1; child >= 1; child -= 1) {
      const frame = removed[child];
      if (frame === undefined) continue;
      finalize(frame, [...stack, ...removed.slice(0, child)]);
    }
    const frame = removed[0];
    if (frame !== undefined) finalize(frame, stack);
    return;
  }
}

interface ReadTag {
  name: string;
  attrs: Map<string, string>;
  closing: boolean;
  selfClosing: boolean;
  end: number;
}

function readTag(html: string, start: number): ReadTag | null {
  if (html[start] !== "<") return null;
  const closing = html[start + 1] === "/";
  let index = start + (closing ? 2 : 1);
  while (index < html.length && /\s/.test(html[index] ?? "")) index += 1;
  const nameStart = index;
  while (index < html.length && /[A-Za-z0-9:-]/.test(html[index] ?? "")) index += 1;
  const name = html.slice(nameStart, index).toLowerCase();
  if (name === "") return { name: "", attrs: new Map(), closing, selfClosing: false, end: start + 1 };
  const attrs = new Map<string, string>();
  let selfClosing = false;
  while (index < html.length) {
    while (index < html.length && /\s/.test(html[index] ?? "")) index += 1;
    const char = html[index];
    if (char === undefined) break;
    if (char === ">") {
      index += 1;
      break;
    }
    if (char === "/" && html[index + 1] === ">") {
      selfClosing = true;
      index += 2;
      break;
    }
    const attrStart = index;
    while (index < html.length && /[^\s=\/>]/.test(html[index] ?? "")) index += 1;
    const attrName = html.slice(attrStart, index).toLowerCase();
    while (index < html.length && /\s/.test(html[index] ?? "")) index += 1;
    let value = "";
    if (html[index] === "=") {
      index += 1;
      while (index < html.length && /\s/.test(html[index] ?? "")) index += 1;
      const quote = html[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < html.length && html[index] !== quote) index += 1;
        value = html.slice(valueStart, index);
        if (html[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < html.length && /[^\s>]/.test(html[index] ?? "")) index += 1;
        value = html.slice(valueStart, index).replace(/\/$/, "");
      }
    }
    if (attrName !== "") attrs.set(attrName, value);
  }
  return { name, attrs, closing, selfClosing, end: index };
}

function formatStructureFailure(label: string, hits: readonly SurfaceHit[]): string {
  if (hits.length === 0) return "";
  const ordered = sortHits(hits);
  const lines = ordered.slice(0, STRUCTURE_CAP).map((hit) => `dist/${hit.file}: ${hit.detail}`);
  if (ordered.length > STRUCTURE_CAP) lines.push(`... and ${ordered.length - STRUCTURE_CAP} more`);
  return `${label}\n${lines.join("\n")}`;
}

function scanFiles(root: string, read: (file: string, html: string) => SurfaceHit[]): SurfaceHit[] {
  if (!isDirectory(root)) return [];
  const hits: SurfaceHit[] = [];
  const seen = new Set<string>();
  for (const rel of htmlFiles(root)) {
    const html = readHtml(path.join(root, rel));
    if (html === null) continue;
    for (const hit of read(rel, html)) {
      const key = `${hit.file}\0${hit.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push(hit);
    }
  }
  return sortHits(hits);
}

function readHtml(abs: string): string | null {
  try {
    if (statSync(abs).size > FILE_CAP) return null;
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
}

function clip(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, CLIP);
}

function sortHits(hits: readonly SurfaceHit[]): SurfaceHit[] {
  return [...hits].sort((left, right) => left.file.localeCompare(right.file) || left.detail.localeCompare(right.detail));
}

function htmlFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    let entries: Array<{ name: string; directory: boolean; file: boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
        name: String(entry.name),
        directory: entry.isDirectory(),
        file: entry.isFile(),
      }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const abs = path.join(dir, entry.name);
      if (entry.directory) {
        walk(abs);
        continue;
      }
      if (entry.file && /\.html?$/i.test(entry.name)) found.push(path.relative(root, abs).split("\\").join("/"));
    }
  };
  walk(root);
  found.sort((left, right) => left.localeCompare(right));
  return found;
}

function isDirectory(root: string): boolean {
  try {
    return statSync(root).isDirectory();
  } catch {
    return false;
  }
}
