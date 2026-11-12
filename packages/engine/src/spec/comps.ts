/**
 * Comp sets for each primary page: desktop fold, tall desktop, and phone.
 * Candidates live under reference/comps. An approval copies the pick to
 * reference/renders and records a sha256. The desktop approval also updates
 * renders.json, so a 245i approval stays valid.
 * Drafting runs from the design-lock runner. It does not attach the billed API.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../config.ts";
import { designLockMatches } from "./design-lock.ts";
import {
  approveRender,
  buildRenderPrompt,
  currentRenderApproval,
  isRenderApproved,
  listPrimaryPages,
  renderDeskProvider,
  renderRelForRoute,
  syncRenderApprovals,
  type DraftRenderDeps,
  type PrimaryPage,
  type RenderDeskProvider,
  type RenderImage,
} from "./page-renders.ts";
import {
  REFERENCE_IMAGE_EXTENSIONS,
  ownerPhotoFiles,
  refreshReferenceReadme,
  sha256File,
  slugify,
} from "./reference-shots.ts";

export const COMPS_REL = ".hitchhiker/comps.json";

export const COMP_VIEWS = ["desktop", "desktop-long", "mobile"] as const;
export type CompView = (typeof COMP_VIEWS)[number];

const MAX_REFERENCES = 5;
const NO_TEXT =
  "No readable text. Use neutral bars where headings and copy will sit; real text is added in code.";
const TEXT_ONLY_NOTE =
  "These sketches used words only. The reference pictures could not be sent as pictures.";

const VIEW_SPEC: Record<
  CompView,
  { aspect: "16:9" | "1:2" | "9:19.5"; viewport: readonly [number, number]; phrase: string; label: string }
> = {
  desktop: {
    aspect: "16:9",
    viewport: [1440, 810],
    phrase: "desktop browser first screen 1440 wide",
    label: "desktop",
  },
  "desktop-long": {
    aspect: "1:2",
    viewport: [1440, 2880],
    phrase: "full scrolling desktop page",
    label: "long page",
  },
  mobile: {
    aspect: "9:19.5",
    viewport: [390, 845],
    phrase: "phone first screen 390 wide",
    label: "phone",
  },
};

export interface CompApproval {
  file: string;
  sha256: string;
  approvedAt: string;
  from: string;
}

export interface CompViewRecord {
  aspect: "16:9" | "1:2" | "9:19.5";
  viewport: [number, number];
  candidates: string[];
  notes: string[];
  approved?: CompApproval;
}

export interface CompSection {
  id: string;
  crop?: string;
  motion?: string;
}

export interface CompPage {
  route: string;
  views: {
    desktop: CompViewRecord;
    mobile: CompViewRecord;
    "desktop-long"?: CompViewRecord;
  };
  sections: CompSection[];
  notes: string[];
}

export interface CompFile {
  version: 1;
  pages: CompPage[];
}

export interface StoredCompApproval extends CompApproval {
  route: string;
  view: CompView;
}

export interface CompWaiting {
  title: string;
  route: string;
  view: CompView;
  label: string;
  file: string;
}

export interface CompDraftDeps extends DraftRenderDeps {
  provider?: RenderDeskProvider;
}

export function isCompView(value: string): value is CompView {
  return (COMP_VIEWS as readonly string[]).includes(value);
}

export function compSlug(route: string): string {
  return path.posix.basename(renderRelForRoute(route), ".png");
}

export function compCandidateRel(route: string, view: CompView, index: number): string {
  return `reference/comps/${compSlug(route)}/${view}-${index}.png`;
}

export function compRenderRel(route: string, view: CompView): string {
  const desktop = renderRelForRoute(route);
  if (view === "desktop") return desktop;
  if (view === "mobile") return desktop.replace(/\.png$/i, ".mobile.png");
  return desktop.replace(/\.png$/i, ".long.png");
}

export function buildCompPrompt(projectDir: string, route: string, view: CompView): string {
  const page = findPrimary(projectDir, route);
  const base = buildRenderPrompt(projectDir, page ?? normalizeRoute(route));
  const spec = VIEW_SPEC[view];
  const sections = page?.sections ?? [];
  const lines = [base.trimEnd(), "", `View: ${spec.phrase}.`, "", "Sections in this order:"];
  if (sections.length === 0) lines.push("none listed");
  else sections.forEach((section, index) => lines.push(`${index + 1}. ${section}`));
  lines.push("", NO_TEXT);
  const notes = viewNotes(projectDir, route, view);
  if (notes.length > 0) {
    lines.push("", "Changes the owner asked for:");
    for (const note of notes) lines.push(note);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/**
 * Draws every required view. Each file is written before the next request.
 * The desk runner serializes calls, so a second lock during a draft runs once after.
 */
export async function draftComps(projectDir: string, deps: CompDraftDeps = {}): Promise<string[]> {
  if (!designLockMatches(projectDir)) return [];
  refreshReferenceReadme(projectDir);
  const settings = loadConfig(projectDir).design.comps;
  const views: CompView[] = settings.long ? ["desktop", "desktop-long", "mobile"] : ["desktop", "mobile"];
  const pages = listPrimaryPages(projectDir);
  if (pages.length === 0) return [];
  const written: string[] = [];
  let provider: RenderDeskProvider | undefined = deps.provider;
  for (const page of pages) {
    const seeded = readDoc(projectDir);
    ensurePage(seeded, page);
    writeDoc(projectDir, seeded);
    for (const view of views) {
      const kept: string[] = [];
      for (let index = 1; index <= settings.candidates; index += 1) {
        const rel = compCandidateRel(page.route, view, index);
        const abs = absFromRel(projectDir, rel);
        const prompt = buildCompPrompt(projectDir, page.route, view);
        const promptAbs = absFromRel(projectDir, promptRel(rel));
        if (alreadyDrawn(abs, promptAbs, prompt)) {
          kept.push(rel);
          continue;
        }
        try {
          if (provider === undefined) provider = await renderDeskProvider(projectDir, deps);
          const sources = compReferenceFiles(projectDir, page.route, view);
          const images = await requestImage(projectDir, provider, {
            model: settings.model,
            prompt,
            aspect: VIEW_SPEC[view].aspect,
            sources,
          });
          const bytes = firstBytes(images);
          if (bytes === null || bytes.byteLength === 0) {
            recordCompNote(projectDir, sketchNote(page, view, "Imagine returned no image."));
            continue;
          }
          mkdirSync(path.dirname(abs), { recursive: true });
          writeFileSync(abs, bytes);
          writeFileSync(promptAbs, prompt, "utf8");
          kept.push(rel);
          written.push(rel);
          saveCandidates(projectDir, page, view, kept);
        } catch (error) {
          const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Sketch draft failed.";
          recordCompNote(projectDir, sketchNote(page, view, message));
        }
      }
      saveCandidates(projectDir, page, view, kept);
    }
  }
  return written;
}

export function listComps(projectDir: string): CompFile {
  syncCompApprovals(projectDir);
  return readDoc(projectDir);
}

export function approveComp(projectDir: string, route: string, view: CompView, candidateFile: string): CompApproval {
  if (!isCompView(view)) throw new Error(`No sketch view matches ${String(view)}.`);
  const page = requirePrimary(projectDir, route);
  const from = projectRel(projectDir, candidateFile);
  if (!isReferenceImage(path.posix.basename(from))) {
    throw new Error("A sketch file must be a png, jpeg, or webp.");
  }
  const destRel = compRenderRel(page.route, view);
  const dest = absFromRel(projectDir, destRel);
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(absFromRel(projectDir, from), dest);
  const approvedAt = new Date().toISOString();
  const approval: CompApproval = { file: destRel, sha256: sha256File(dest), approvedAt, from };
  const doc = readDoc(projectDir);
  const row = ensurePage(doc, page);
  const record = ensureView(row, view);
  if (!record.candidates.includes(from)) record.candidates = [...record.candidates, from];
  record.approved = approval;
  writeDoc(projectDir, doc);
  if (view === "desktop") approveRender(projectDir, page.route, approvedAt);
  return approval;
}

export function requestCompChange(projectDir: string, route: string, view: CompView, text: string): void {
  if (!isCompView(view)) throw new Error(`No sketch view matches ${String(view)}.`);
  const page = requirePrimary(projectDir, route);
  const words = text.trim();
  if (words === "") throw new Error("Say what should change.");
  const doc = readDoc(projectDir);
  const row = ensurePage(doc, page);
  const record = ensureView(row, view);
  record.notes = [...record.notes, words];
  row.notes = [...row.notes, words];
  writeDoc(projectDir, doc);
}

export function compsWaiting(projectDir: string): CompWaiting[] {
  syncCompApprovals(projectDir);
  const waiting: CompWaiting[] = [];
  for (const page of listPrimaryPages(projectDir)) {
    for (const view of requiredViews(projectDir)) {
      if (isCompApproved(projectDir, page.route, view)) continue;
      waiting.push({
        title: page.title,
        route: page.route,
        view,
        label: VIEW_SPEC[view].label,
        file: compRenderRel(page.route, view),
      });
    }
  }
  return waiting;
}

export function isCompApproved(projectDir: string, route: string, view: CompView): boolean {
  if (!isCompView(view)) return false;
  const row = readDoc(projectDir).pages.find((item) => sameRoute(item.route, route));
  const approved = row === undefined ? undefined : viewRecord(row, view)?.approved;
  if (approved !== undefined && compApprovalMatches(projectDir, route, view, approved)) return true;
  if (view === "desktop") return isRenderApproved(projectDir, route);
  return false;
}

/** Drops approvals whose file is missing or whose bytes changed, and copies a legacy desktop approval in. */
export function syncCompApprovals(projectDir: string): StoredCompApproval[] {
  syncRenderApprovals(projectDir);
  const hadFile = existsSync(absFromRel(projectDir, COMPS_REL));
  const doc = readDoc(projectDir);
  let changed = false;
  for (const row of doc.pages) {
    for (const view of COMP_VIEWS) {
      const record = viewRecord(row, view);
      if (record?.approved === undefined) continue;
      if (!compApprovalMatches(projectDir, row.route, view, record.approved)) {
        delete record.approved;
        changed = true;
      }
    }
  }
  for (const page of listPrimaryPages(projectDir)) {
    const legacy = currentRenderApproval(projectDir, page.route);
    if (legacy !== null) {
      const row = ensurePage(doc, page);
      if (row.views.desktop.approved === undefined) {
        row.views.desktop.approved = {
          file: legacy.file,
          sha256: legacy.sha256,
          approvedAt: legacy.approvedAt,
          from: legacy.file,
        };
        changed = true;
      }
    }
    const row = doc.pages.find((item) => sameRoute(item.route, page.route));
    const desktop = row?.views.desktop.approved;
    if (desktop !== undefined && !isRenderApproved(projectDir, page.route)) {
      approveRender(projectDir, page.route, desktop.approvedAt);
      changed = true;
    }
  }
  if (changed || hadFile) writeDoc(projectDir, doc);
  return flatten(readDoc(projectDir));
}

export function compReferenceFiles(projectDir: string, route: string, view: CompView): string[] {
  const picked: string[] = [];
  const push = (rel: string | undefined): void => {
    if (rel === undefined) return;
    const normal = rel.replace(/\\/g, "/");
    if (normal.trim() === "" || picked.includes(normal) || isLogoPath(normal)) return;
    if (!isReferenceImage(path.posix.basename(normal))) return;
    if (!existsSync(absFromRel(projectDir, normal))) return;
    picked.push(normal);
  };
  if (isCompApproved(projectDir, "/", "desktop")) push(compRenderRel("/", "desktop"));
  if (view !== "desktop" && isCompApproved(projectDir, route, "desktop")) push(compRenderRel(route, "desktop"));
  if (viewNotes(projectDir, route, view).length > 0) {
    if (isCompApproved(projectDir, route, view)) push(compRenderRel(route, view));
    else push(readCandidates(projectDir, route, view)[0]);
  }
  for (const photo of ownerPhotoFiles(projectDir)) push(photo);
  for (const shot of referenceShots(projectDir)) push(shot);
  return picked.slice(0, MAX_REFERENCES);
}

async function requestImage(
  projectDir: string,
  provider: RenderDeskProvider,
  req: { model: string; prompt: string; aspect: string; sources: readonly string[] },
): Promise<RenderImage[]> {
  const sources = req.sources.slice(0, MAX_REFERENCES);
  if (sources.length > 0 && provider.editImage !== undefined) {
    const result = await provider.editImage({
      model: req.model,
      prompt: req.prompt,
      sources,
      n: 1,
      aspect: req.aspect,
    });
    if (result.note !== undefined && result.note.trim() !== "") recordCompNote(projectDir, result.note.trim());
    return result.images;
  }
  if (sources.length > 0) {
    recordCompNote(projectDir, TEXT_ONLY_NOTE);
    const prompt = `${req.prompt.trimEnd()}\n\nReference pictures, described because they could not be sent as pictures:\n${sources
      .map((item) => `- ${item}`)
      .join("\n")}\n`;
    return provider.generateImage({ model: req.model, prompt, aspect: req.aspect, n: 1 });
  }
  return provider.generateImage({ model: req.model, prompt: req.prompt, aspect: req.aspect, n: 1 });
}

function requiredViews(projectDir: string): CompView[] {
  return loadConfig(projectDir).design.comps.long ? ["desktop", "desktop-long", "mobile"] : ["desktop", "mobile"];
}

function saveCandidates(projectDir: string, page: PrimaryPage, view: CompView, candidates: readonly string[]): void {
  const doc = readDoc(projectDir);
  const row = ensurePage(doc, page);
  const record = ensureView(row, view);
  record.candidates = [...candidates];
  writeDoc(projectDir, doc);
}

function readCandidates(projectDir: string, route: string, view: CompView): string[] {
  const row = readDoc(projectDir).pages.find((item) => sameRoute(item.route, route));
  if (row === undefined) return [];
  return viewRecord(row, view)?.candidates ?? [];
}

function viewNotes(projectDir: string, route: string, view: CompView): string[] {
  const row = readDoc(projectDir).pages.find((item) => sameRoute(item.route, route));
  if (row === undefined) return [];
  return viewRecord(row, view)?.notes ?? [];
}

function sketchNote(page: PrimaryPage, view: CompView, message: string): string {
  return `${page.title} (${page.route}) ${VIEW_SPEC[view].label}: ${message}`;
}

function alreadyDrawn(pngAbs: string, promptAbs: string, prompt: string): boolean {
  if (!existsSync(pngAbs) || !existsSync(promptAbs)) return false;
  return readOptional(promptAbs) === prompt;
}

function firstBytes(images: readonly RenderImage[] | undefined): Uint8Array | null {
  const image = images?.[0];
  if (image === undefined || typeof image.b64 !== "string" || image.b64.trim() === "") return null;
  return Buffer.from(image.b64, "base64");
}

function recordCompNote(projectDir: string, note: string): void {
  const clean = note.trim();
  if (clean === "") return;
  const dir = path.join(projectDir, "reference", "comps");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "README.md");
  const prior = readOptional(file);
  const line = `- ${clean}`;
  if (prior.split(/\r?\n/).some((item) => item === line)) return;
  const next = prior.trim() === "" ? `# Page sketches\n\n${line}\n` : `${prior.trimEnd()}\n\n${line}\n`;
  writeFileSync(file, next, "utf8");
}

function referenceShots(projectDir: string): string[] {
  const dir = path.join(projectDir, "reference", "refs");
  if (!existsSync(dir)) return [];
  const names: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    if (!isReferenceImage(name) || isLogoPath(name)) continue;
    names.push(`reference/refs/${name}`);
  }
  names.sort();
  return names;
}

function isLogoPath(rel: string): boolean {
  return /logo/i.test(path.posix.basename(rel));
}

function isReferenceImage(name: string): boolean {
  const lower = name.toLowerCase();
  return REFERENCE_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function requirePrimary(projectDir: string, route: string): PrimaryPage {
  const page = findPrimary(projectDir, route);
  if (page === undefined) throw new Error(`No primary page matches ${normalizeRoute(route)}.`);
  return page;
}

function findPrimary(projectDir: string, route: string): PrimaryPage | undefined {
  return listPrimaryPages(projectDir).find((page) => sameRoute(page.route, route));
}

function ensurePage(doc: CompFile, page: PrimaryPage): CompPage {
  const found = doc.pages.find((item) => sameRoute(item.route, page.route));
  if (found !== undefined) {
    found.route = page.route;
    found.sections = mergeSections(found.sections, page.sections);
    return found;
  }
  const created: CompPage = {
    route: page.route,
    views: { desktop: blankView("desktop"), mobile: blankView("mobile") },
    sections: mergeSections([], page.sections),
    notes: [],
  };
  doc.pages.push(created);
  return created;
}

function ensureView(page: CompPage, view: CompView): CompViewRecord {
  const existing = viewRecord(page, view);
  if (existing !== undefined) return existing;
  const created = blankView(view);
  if (view === "desktop-long") page.views["desktop-long"] = created;
  else if (view === "desktop") page.views.desktop = created;
  else page.views.mobile = created;
  return created;
}

function viewRecord(page: CompPage, view: CompView): CompViewRecord | undefined {
  if (view === "desktop") return page.views.desktop;
  if (view === "mobile") return page.views.mobile;
  return page.views["desktop-long"];
}

function blankView(view: CompView): CompViewRecord {
  const spec = VIEW_SPEC[view];
  const viewport: [number, number] = [spec.viewport[0], spec.viewport[1]];
  return { aspect: spec.aspect, viewport, candidates: [], notes: [] };
}

function mergeSections(existing: readonly CompSection[], titles: readonly string[]): CompSection[] {
  const ids: string[] = [];
  for (const title of titles) {
    const base = slugify(title) || "section";
    let id = base;
    let n = 2;
    while (ids.includes(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    ids.push(id);
  }
  return ids.map((id) => existing.find((item) => item.id === id) ?? { id });
}

function compApprovalMatches(projectDir: string, route: string, view: CompView, approval: CompApproval): boolean {
  const expected = compRenderRel(route, view);
  if (approval.file.replace(/\\/g, "/") !== expected) return false;
  return fileMatches(projectDir, expected, approval.sha256);
}

function fileMatches(projectDir: string, rel: string, sha256: string): boolean {
  const abs = absFromRel(projectDir, rel);
  if (!existsSync(abs)) return false;
  try {
    return sha256File(abs) === sha256;
  } catch {
    return false;
  }
}

function flatten(doc: CompFile): StoredCompApproval[] {
  const rows: StoredCompApproval[] = [];
  for (const page of doc.pages) {
    for (const view of COMP_VIEWS) {
      const approved = viewRecord(page, view)?.approved;
      if (approved === undefined) continue;
      rows.push({ route: page.route, view, ...approved });
    }
  }
  return rows;
}

function readDoc(projectDir: string): CompFile {
  const file = absFromRel(projectDir, COMPS_REL);
  if (!existsSync(file)) return { version: 1, pages: [] };
  try {
    const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(raw) || !Array.isArray(raw.pages)) return { version: 1, pages: [] };
    const pages: CompPage[] = [];
    for (const item of raw.pages) {
      const page = readPage(item);
      if (page !== undefined) pages.push(page);
    }
    return { version: 1, pages };
  } catch {
    return { version: 1, pages: [] };
  }
}

function writeDoc(projectDir: string, doc: CompFile): void {
  const file = absFromRel(projectDir, COMPS_REL);
  mkdirSync(path.dirname(file), { recursive: true });
  const body: CompFile = { version: 1, pages: doc.pages };
  writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function readPage(value: unknown): CompPage | undefined {
  if (!isRecord(value) || typeof value.route !== "string" || value.route.trim() === "") return undefined;
  const viewsRaw = isRecord(value.views) ? value.views : {};
  const page: CompPage = {
    route: value.route,
    views: {
      desktop: readView(viewsRaw.desktop, "desktop"),
      mobile: readView(viewsRaw.mobile, "mobile"),
    },
    sections: readSections(value.sections),
    notes: readNotes(value.notes),
  };
  if (viewsRaw["desktop-long"] !== undefined) page.views["desktop-long"] = readView(viewsRaw["desktop-long"], "desktop-long");
  return page;
}

function readView(value: unknown, view: CompView): CompViewRecord {
  const spec = VIEW_SPEC[view];
  const record = isRecord(value) ? value : {};
  const approved = readApproval(record.approved);
  const viewport = readViewport(record.viewport, spec.viewport);
  const next: CompViewRecord = {
    aspect: spec.aspect,
    viewport,
    candidates: readStrings(record.candidates).map((item) => item.replace(/\\/g, "/")),
    notes: readNotes(record.notes),
  };
  if (approved !== undefined) next.approved = approved;
  return next;
}

function readApproval(value: unknown): CompApproval | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.file !== "string" || typeof value.sha256 !== "string" || typeof value.approvedAt !== "string") return undefined;
  const from = typeof value.from === "string" && value.from.trim() !== "" ? value.from : value.file;
  return {
    file: value.file.replace(/\\/g, "/"),
    sha256: value.sha256,
    approvedAt: value.approvedAt,
    from: from.replace(/\\/g, "/"),
  };
}

function readSections(value: unknown): CompSection[] {
  if (!Array.isArray(value)) return [];
  const sections: CompSection[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.trim() === "") continue;
    const section: CompSection = { id: item.id.trim() };
    if (typeof item.crop === "string" && item.crop.trim() !== "") section.crop = item.crop;
    if (typeof item.motion === "string" && item.motion.trim() !== "") section.motion = item.motion;
    sections.push(section);
  }
  return sections;
}

function readViewport(value: unknown, fallback: readonly [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return [fallback[0], fallback[1]];
  const width = value[0];
  const height = value[1];
  if (typeof width !== "number" || typeof height !== "number") return [fallback[0], fallback[1]];
  return [width, height];
}

function readNotes(value: unknown): string[] {
  return readStrings(value).map((item) => item.trim()).filter((item) => item !== "");
}

function readStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function projectRel(projectDir: string, file: string): string {
  const root = path.resolve(projectDir);
  const abs = path.resolve(root, file);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) {
    throw new Error("That sketch file is outside the project.");
  }
  if (!existsSync(abs)) throw new Error("No sketch file for that page.");
  let info;
  try {
    info = statSync(abs);
  } catch {
    throw new Error("No sketch file for that page.");
  }
  if (!info.isFile()) throw new Error("No sketch file for that page.");
  return path.relative(root, abs).split(path.sep).join("/");
}

function promptRel(imageRel: string): string {
  return imageRel.replace(/\.png$/i, ".prompt.txt");
}

function normalizeRoute(route: string): string {
  let value = route.trim();
  if (value === "") return "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

function sameRoute(left: string, right: string): boolean {
  return normalizeRoute(left).toLowerCase() === normalizeRoute(right).toLowerCase();
}

function absFromRel(projectDir: string, rel: string): string {
  return path.join(projectDir, ...rel.split("/"));
}

function readOptional(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
