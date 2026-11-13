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
  buildMotionClipPrompt,
  choreographyFor,
  easingFeel,
  isMotionLed,
  isSafeSectionId,
  motionQuoteFits,
  motionVideoBytes,
  openMotionProvider,
  recordMotionSpend,
  redactMotionKey,
  sectionPlan,
  sliceLongComp,
  type MotionRefDeps,
  type MotionVideoProvider,
  type SectionBand,
} from "./motion-refs.ts";
import {
  approveRender,
  buildRenderPrompt,
  currentRenderApproval,
  isRenderApproved,
  listPrimaryPages,
  recordRenderNotes,
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
} from "./reference-shots.ts";

export const COMPS_REL = ".hitchhiker/comps.json";

type CompTruthHook = (projectDir: string) => void;

let compTruthHook: CompTruthHook | null = null;

/**
 * visual-truth.ts registers this. comps.ts does not import that module.
 * A hook error is swallowed so a truth file cannot undo an approval.
 */
export function setCompTruthHook(hook: CompTruthHook | null): void {
  compTruthHook = hook;
}

function publishCompTruth(projectDir: string): void {
  if (compTruthHook === null) return;
  try {
    compTruthHook(projectDir);
  } catch {
    // The approval is already stored. A truth file must not undo it.
  }
}

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

export interface MotionApproval {
  file: string;
  sha256: string;
  approvedAt: string;
}

export interface ApprovedMotionRef {
  route: string;
  sectionId: string;
  file: string;
  sha256: string;
  approvedAt: string;
}

export interface CompSection {
  id: string;
  crop?: string;
  motion?: string;
  /** Approximate vertical band of the long sketch. Real section edges are not in the file. */
  band?: SectionBand;
  motionApproved?: MotionApproval;
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

export type { MotionRefDeps, MotionVideoProvider, SectionBand } from "./motion-refs.ts";

export function motionClipRel(route: string, sectionId: string): string {
  return `reference/comps/${compSlug(route)}/motion/${sectionId}.mp4`;
}

export function sectionCropRel(route: string, sectionId: string): string {
  return `reference/comps/${compSlug(route)}/sections/${sectionId}.png`;
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
 * Draws every required view. The desk provider is resolved once and reused.
 * A throw means this provider cannot draw, so the pass records one note and
 * stops instead of starting it again for every candidate. Each file is written
 * before the next request.
 * The desk runner serializes calls, so a second lock during a draft runs once after.
 */
export async function draftComps(projectDir: string, deps: CompDraftDeps = {}): Promise<string[]> {
  if (!designLockMatches(projectDir)) return [];
  refreshReferenceReadme(projectDir);
  const settings = loadConfig(projectDir).design.comps;
  const views = viewsFor(settings.long);
  const pages = listPrimaryPages(projectDir);
  if (pages.length === 0) return [];
  const written: string[] = [];
  const draw = openDrawer(projectDir, deps);
  for (const page of pages) {
    if (draw.state.providerDown) break;
    const seeded = readDoc(projectDir);
    ensurePage(seeded, page);
    writeDoc(projectDir, seeded);
    for (const view of views) {
      if (draw.state.providerDown) break;
      const files = await drawViewCandidates(projectDir, page, view, settings, draw.useProvider, draw.state, false);
      written.push(...files);
    }
  }
  return written;
}

/**
 * Draws one view again after the owner asks for a change.
 * Numbered sketches are replaced. An uploaded sketch on that view stays.
 * Other views are not requested and their files stay as they are.
 */
export async function redrawCompView(
  projectDir: string,
  route: string,
  view: CompView,
  deps: CompDraftDeps = {},
): Promise<string[]> {
  if (!isCompView(view)) throw new Error(`No sketch view matches ${String(view)}.`);
  if (!designLockMatches(projectDir)) throw new Error("DESIGN.md is not locked.");
  const page = requirePrimary(projectDir, route);
  refreshReferenceReadme(projectDir);
  const settings = loadConfig(projectDir).design.comps;
  const seeded = readDoc(projectDir);
  ensurePage(seeded, page);
  writeDoc(projectDir, seeded);
  const draw = openDrawer(projectDir, deps);
  const written = await drawViewCandidates(projectDir, page, view, settings, draw.useProvider, draw.state, true);
  if (draw.state.providerDown && written.length === 0) throw new Error("The sketch did not redraw.");
  return written;
}

/** Adds an owner upload as a sketch to pick. It does not approve it. */
export function addCompCandidate(
  projectDir: string,
  route: string,
  view: CompView,
  bytes: Uint8Array,
  extension: string,
): string {
  if (!isCompView(view)) throw new Error(`No sketch view matches ${String(view)}.`);
  const page = requirePrimary(projectDir, route);
  if (bytes.byteLength === 0) throw new Error("File is empty.");
  const ext = uploadExtension(extension);
  if (ext === null) throw new Error("Upload a png, jpg, or webp image.");
  const slug = compSlug(page.route);
  let index = 1;
  let rel = `reference/comps/${slug}/${view}-upload-${index}${ext}`;
  while (existsSync(absFromRel(projectDir, rel))) {
    index += 1;
    if (index > 1000) throw new Error("Too many uploads for this sketch.");
    rel = `reference/comps/${slug}/${view}-upload-${index}${ext}`;
  }
  const abs = absFromRel(projectDir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  const doc = readDoc(projectDir);
  const row = ensurePage(doc, page);
  const record = ensureView(row, view);
  if (!record.candidates.includes(rel)) record.candidates = [...record.candidates, rel];
  writeDoc(projectDir, doc);
  return rel;
}

/**
 * Approves one sketch for every required view of every primary page.
 * Harnesses that stand in for the owner call this after the sitemap is final.
 * A page that is already approved is left alone. An empty project approves nothing.
 */
export function approveRequiredSketches(projectDir: string, bytes: Uint8Array): string[] {
  if (bytes.byteLength === 0) throw new Error("File is empty.");
  const approved: string[] = [];
  for (const page of listPrimaryPages(projectDir)) {
    for (const view of requiredViews(projectDir)) {
      if (isCompApproved(projectDir, page.route, view)) continue;
      const rel = compCandidateRel(page.route, view, 1);
      const abs = absFromRel(projectDir, rel);
      if (!existsSync(abs)) {
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, bytes);
      }
      approved.push(approveComp(projectDir, page.route, view, rel).file);
    }
  }
  return approved;
}

/** Views the build waits on. The long page is included when design.comps.long is on. */
export function requiredCompViews(projectDir: string): CompView[] {
  return requiredViews(projectDir);
}

export function compViewFacts(view: CompView): {
  aspect: "16:9" | "1:2" | "9:19.5";
  label: string;
} {
  const spec = VIEW_SPEC[view];
  return { aspect: spec.aspect, label: spec.label };
}

/**
 * One short clip per motion-led section of a page whose desktop sketch is approved.
 * Section crops are written for an approved long sketch. Missing clips and crops
 * are notes. They do not block the build, and this pass does not wait on the design lock.
 * Only approveMotionRef marks a clip for the build.
 */
export async function draftMotionRefs(projectDir: string, deps: MotionRefDeps = {}): Promise<string[]> {
  const settings = loadConfig(projectDir).design.motionRefs;
  if (!settings.enabled) return [];
  syncCompApprovals(projectDir);
  const pages = listPrimaryPages(projectDir);
  const designMd = readOptional(path.join(projectDir, "DESIGN.md"));
  const motionMd = readMotionMarkdown(projectDir);
  const led = collectLed(projectDir, pages, designMd, motionMd);
  const longPages = pages.filter((page) => isCompApproved(projectDir, page.route, "desktop-long"));
  if (led.length === 0 && longPages.length === 0) return [];
  for (const page of longPages) writeSectionCrops(projectDir, page);

  const written: string[] = [];
  let used = 0;
  let provider: MotionVideoProvider | undefined;
  let billed = false;
  let providerDown = false;
  const easing = easingFeel(designMd);
  for (const item of led) {
    if (providerDown || used >= settings.max) break;
    const prompt = buildMotionClipPrompt({
      index: item.index,
      count: item.count,
      recipe: item.recipe,
      kind: item.kind,
      easing,
    });
    const rel = motionClipRel(item.page.route, item.id);
    const abs = absFromRel(projectDir, rel);
    const promptAbs = absFromRel(projectDir, motionPromptRel(rel));
    if (alreadyDrawn(abs, promptAbs, prompt)) {
      rememberMotion(projectDir, item.page, item.id, rel);
      used += 1;
      continue;
    }
    if (!isSafeSectionId(item.id)) {
      recordCompNote(projectDir, clipNote(item.page, item.title, "This section id cannot be a file name."));
      continue;
    }
    if (provider === undefined) {
      try {
        const opened = await openMotionProvider(projectDir, deps);
        provider = opened.provider;
        billed = opened.billed;
      } catch (error) {
        const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "No Imagine provider is available.";
        recordCompNote(projectDir, redactMotionKey(message, deps.key));
        providerDown = true;
        break;
      }
    }
    if (provider === undefined) {
      providerDown = true;
      break;
    }
    let quoteUsd = 0;
    if (billed) {
      const quote = await motionQuoteFits(projectDir, {
        model: settings.model,
        resolution: settings.resolution,
        seconds: settings.seconds,
        prompt,
      });
      if (!quote.ok) {
        recordCompNote(projectDir, redactMotionKey(clipNote(item.page, item.title, quote.note), deps.key));
        providerDown = true;
        break;
      }
      quoteUsd = quote.usd;
    }
    try {
      const started = await provider.startVideo({
        model: settings.model,
        prompt,
        seconds: settings.seconds,
        resolution: settings.resolution,
        aspect: "16:9",
        referenceImages: [compRenderRel(item.page.route, "desktop")],
        generateAudio: false,
      });
      if (billed) await recordMotionSpend(projectDir, `motion-${compSlug(item.page.route)}-${item.id}`, quoteUsd, started.id);
      const polled = await provider.pollVideo(started.id);
      const bytes = await motionVideoBytes(polled, deps.fetchImpl, deps.key);
      if (bytes === null || bytes.byteLength === 0) {
        recordCompNote(projectDir, clipNote(item.page, item.title, "Imagine returned no video."));
        continue;
      }
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, bytes);
      writeFileSync(promptAbs, prompt, "utf8");
      rememberMotion(projectDir, item.page, item.id, rel);
      written.push(rel);
      used += 1;
    } catch (error) {
      const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Motion draft failed.";
      recordCompNote(projectDir, redactMotionKey(clipNote(item.page, item.title, message), deps.key));
      providerDown = true;
    }
  }
  return written;
}

export function approveMotionRef(projectDir: string, route: string, sectionId: string): MotionApproval {
  const page = requirePrimary(projectDir, route);
  const doc = readDoc(projectDir);
  const row = doc.pages.find((item) => sameRoute(item.route, page.route));
  const section = row?.sections.find((item) => item.id === sectionId);
  if (section === undefined || section.motion === undefined || section.motion.trim() === "") {
    throw new Error("No motion clip for that section.");
  }
  const rel = section.motion;
  const abs = containedAbs(projectDir, rel);
  if (abs === null) throw new Error("That motion clip is outside the project.");
  if (!existsSync(abs)) throw new Error("No motion clip for that section.");
  let info;
  try {
    info = statSync(abs);
  } catch {
    throw new Error("No motion clip for that section.");
  }
  if (!info.isFile()) throw new Error("No motion clip for that section.");
  const approval: MotionApproval = {
    file: rel.replace(/\\/g, "/"),
    sha256: sha256File(abs),
    approvedAt: new Date().toISOString(),
  };
  const fresh = readDoc(projectDir);
  const freshRow = ensurePage(fresh, page);
  const freshSection = freshRow.sections.find((item) => item.id === sectionId);
  if (freshSection === undefined || freshSection.motion !== section.motion) {
    throw new Error("No motion clip for that section.");
  }
  freshSection.motionApproved = approval;
  writeDoc(projectDir, fresh);
  publishCompTruth(projectDir);
  return approval;
}

/** Clips whose stored sha256 still matches the file. Unapproved clips stay on disk and stay out of this list. */
export function approvedMotionRefs(projectDir: string): ApprovedMotionRef[] {
  syncCompApprovals(projectDir);
  const rows: ApprovedMotionRef[] = [];
  for (const page of readDoc(projectDir).pages) {
    for (const section of page.sections) {
      if (section.motionApproved === undefined || !motionApprovalMatches(projectDir, section)) continue;
      rows.push({
        route: page.route,
        sectionId: section.id,
        file: section.motionApproved.file,
        sha256: section.motionApproved.sha256,
        approvedAt: section.motionApproved.approvedAt,
      });
    }
  }
  return rows;
}

export interface ApprovedCompView {
  route: string;
  view: CompView;
  file: string;
  viewport: [number, number];
  fullPage: boolean;
}

/**
 * Approved views whose file still matches the stored sha256.
 * Reads comps.json and does not rewrite it.
 */
export function approvedCompViews(projectDir: string, route: string): ApprovedCompView[] {
  const page = readDoc(projectDir).pages.find((item) => sameRoute(item.route, route));
  if (page === undefined) return [];
  const rows: ApprovedCompView[] = [];
  for (const view of COMP_VIEWS) {
    const record = viewRecord(page, view);
    const approved = record?.approved;
    if (record === undefined || approved === undefined) continue;
    if (!compApprovalMatches(projectDir, page.route, view, approved)) continue;
    rows.push({
      route: page.route,
      view,
      file: approved.file.replace(/\\/g, "/"),
      viewport: [record.viewport[0], record.viewport[1]],
      fullPage: view === "desktop-long",
    });
  }
  return rows;
}

export interface ApprovedSectionClip {
  route: string;
  sectionId: string;
  file: string;
  band?: SectionBand;
}

/** Approved motion clips for one page. Reads comps.json and does not rewrite it. */
export function approvedSectionClips(
  projectDir: string,
  route: string,
  sectionId?: string,
): ApprovedSectionClip[] {
  const page = readDoc(projectDir).pages.find((item) => sameRoute(item.route, route));
  if (page === undefined) return [];
  const clips: ApprovedSectionClip[] = [];
  for (const section of page.sections) {
    if (sectionId !== undefined && section.id !== sectionId) continue;
    if (section.motionApproved === undefined || !motionApprovalMatches(projectDir, section)) continue;
    const clip: ApprovedSectionClip = {
      route: page.route,
      sectionId: section.id,
      file: section.motionApproved.file,
    };
    if (section.band !== undefined) clip.band = section.band;
    clips.push(clip);
  }
  return clips;
}

/** Routes whose comps.json page lists this section. Does not rewrite the file. */
export function compRoutesForSection(projectDir: string, sectionId: string): string[] {
  return readDoc(projectDir)
    .pages.filter((page) => page.sections.some((section) => section.id === sectionId))
    .map((page) => page.route);
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
  publishCompTruth(projectDir);
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
    for (const section of row.sections) {
      if (section.motionApproved === undefined) continue;
      if (!motionApprovalMatches(projectDir, section)) {
        delete section.motionApproved;
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

interface DrawState {
  providerDown: boolean;
}

function openDrawer(
  projectDir: string,
  deps: CompDraftDeps,
): { state: DrawState; useProvider: () => Promise<RenderDeskProvider> } {
  const state: DrawState = { providerDown: false };
  let provider: RenderDeskProvider | undefined = deps.provider;
  const useProvider = async (): Promise<RenderDeskProvider> => {
    if (provider === undefined) provider = await renderDeskProvider(projectDir, deps);
    return provider;
  };
  return { state, useProvider };
}

async function drawViewCandidates(
  projectDir: string,
  page: PrimaryPage,
  view: CompView,
  settings: { model: string; candidates: number },
  useProvider: () => Promise<RenderDeskProvider>,
  state: DrawState,
  keepExtras: boolean,
): Promise<string[]> {
  const extras = keepExtras ? keptUploadCandidates(projectDir, page.route, view) : [];
  const kept: string[] = [];
  const written: string[] = [];
  for (let index = 1; index <= settings.candidates; index += 1) {
    if (state.providerDown) break;
    const rel = compCandidateRel(page.route, view, index);
    const abs = absFromRel(projectDir, rel);
    const prompt = buildCompPrompt(projectDir, page.route, view);
    const promptAbs = absFromRel(projectDir, promptRel(rel));
    if (alreadyDrawn(abs, promptAbs, prompt)) {
      kept.push(rel);
      continue;
    }
    try {
      const current = await useProvider();
      const sources = compReferenceFiles(projectDir, page.route, view);
      const images = await requestImage(projectDir, current, {
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
      saveCandidates(projectDir, page, view, mergeCandidates(kept, extras));
    } catch (error) {
      const message = error instanceof Error && error.message.trim() !== "" ? error.message.trim() : "Sketch draft failed.";
      const note = sketchNote(page, view, message);
      recordCompNote(projectDir, note);
      recordRenderNotes(projectDir, [note]);
      state.providerDown = true;
    }
  }
  saveCandidates(projectDir, page, view, mergeCandidates(kept, extras));
  return written;
}

function mergeCandidates(kept: readonly string[], extras: readonly string[]): string[] {
  const seen = new Set(kept);
  const next = [...kept];
  for (const extra of extras) {
    if (seen.has(extra)) continue;
    seen.add(extra);
    next.push(extra);
  }
  return next;
}

function keptUploadCandidates(projectDir: string, route: string, view: CompView): string[] {
  const pattern = new RegExp(`^${escapeRegExp(view)}-upload-\\d+\\.(png|jpe?g|webp)$`, "i");
  return readCandidates(projectDir, route, view).filter((rel) => {
    if (!pattern.test(path.posix.basename(rel))) return false;
    return existsSync(absFromRel(projectDir, rel));
  });
}

function uploadExtension(extension: string): ".png" | ".jpg" | ".webp" | null {
  const raw = extension.trim().toLowerCase();
  const withDot = raw.startsWith(".") ? raw : raw === "" ? "" : `.${raw}`;
  if (withDot === ".jpg" || withDot === ".jpeg") return ".jpg";
  if (withDot === ".png") return ".png";
  if (withDot === ".webp") return ".webp";
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function viewsFor(long: boolean): CompView[] {
  return long ? ["desktop", "desktop-long", "mobile"] : ["desktop", "mobile"];
}

function requiredViews(projectDir: string): CompView[] {
  return viewsFor(loadConfig(projectDir).design.comps.long);
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
  return sectionPlan(titles).map((id) => existing.find((item) => item.id === id) ?? { id });
}

interface LedSection {
  page: PrimaryPage;
  id: string;
  title: string;
  index: number;
  count: number;
  recipe: string;
  kind: string;
}

function collectLed(
  projectDir: string,
  pages: readonly PrimaryPage[],
  designMd: string,
  motionMd: string,
): LedSection[] {
  const rows: LedSection[] = [];
  for (const page of pages) {
    if (!isCompApproved(projectDir, page.route, "desktop")) continue;
    const ids = sectionPlan(page.sections);
    const where = { route: page.route, slug: compSlug(page.route) };
    ids.forEach((id, index) => {
      const title = page.sections[index] ?? id;
      const section = { id, title };
      if (!isMotionLed(section, where, designMd, motionMd)) return;
      const move = choreographyFor(section, where, designMd, motionMd);
      rows.push({ page, id, title, index, count: ids.length, recipe: move.recipe, kind: move.kind });
    });
  }
  return rows;
}

function writeSectionCrops(projectDir: string, page: PrimaryPage): void {
  const ids = sectionPlan(page.sections);
  if (ids.length === 0) return;
  const source = absFromRel(projectDir, compRenderRel(page.route, "desktop-long"));
  const bytes = existsSync(source) ? readFileSync(source) : Buffer.alloc(0);
  const sliced = sliceLongComp(bytes, ids.length);
  const crops = sliced.crops;
  let blocked = crops === null;
  const planned: { id: string; rel: string; bytes: Buffer }[] = [];
  if (crops !== null) {
    let cursor = 0;
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index];
      const band = sliced.bands[index];
      if (id === undefined || band === undefined || band.height < 1) continue;
      const file = crops[cursor];
      cursor += 1;
      if (file === undefined || !isSafeSectionId(id)) {
        blocked = true;
        break;
      }
      planned.push({ id, rel: sectionCropRel(page.route, id), bytes: file });
    }
  }
  if (!blocked) {
    for (const item of planned) {
      const abs = absFromRel(projectDir, item.rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, item.bytes);
    }
  }
  const doc = readDoc(projectDir);
  const row = ensurePage(doc, page);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const band = sliced.bands[index];
    if (id === undefined || band === undefined) continue;
    const section = row.sections.find((item) => item.id === id);
    if (section === undefined) continue;
    section.band = { y: band.y, height: band.height, approximate: true };
    if (!blocked && band.height >= 1 && isSafeSectionId(id)) section.crop = sectionCropRel(page.route, id);
    else delete section.crop;
  }
  writeDoc(projectDir, doc);
  if (blocked) {
    recordCompNote(
      projectDir,
      `${page.title} (${page.route}) long page: the section bands are approximate because the long sketch could not be sliced.`,
    );
  }
  if (ids.some((id) => !isSafeSectionId(id))) {
    recordCompNote(projectDir, `${page.title} (${page.route}) long page: a section id cannot be a file name.`);
  }
}

function rememberMotion(projectDir: string, page: PrimaryPage, sectionId: string, rel: string): void {
  const doc = readDoc(projectDir);
  const row = ensurePage(doc, page);
  const section = row.sections.find((item) => item.id === sectionId);
  if (section === undefined) return;
  section.motion = rel;
  writeDoc(projectDir, doc);
}

function clipNote(page: PrimaryPage, section: string, message: string): string {
  return `${page.title} (${page.route}) ${section}: ${message}`;
}

function readMotionMarkdown(projectDir: string): string {
  const parts = [
    readOptional(path.join(projectDir, "MOTION.md")),
    readOptional(path.join(projectDir, ".hitchhiker", "MOTION.md")),
  ].filter((item) => item.trim() !== "");
  return parts.join("\n");
}

function motionPromptRel(clipRel: string): string {
  return clipRel.replace(/\.mp4$/i, ".prompt.txt");
}

function motionApprovalMatches(projectDir: string, section: CompSection): boolean {
  const approval = section.motionApproved;
  const motion = section.motion?.replace(/\\/g, "/");
  if (approval === undefined || motion === undefined) return false;
  if (approval.file.replace(/\\/g, "/") !== motion) return false;
  const abs = containedAbs(projectDir, motion);
  if (abs === null || !existsSync(abs)) return false;
  try {
    return sha256File(abs) === approval.sha256;
  } catch {
    return false;
  }
}

function containedAbs(projectDir: string, rel: string): string | null {
  const root = path.resolve(projectDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(`${root}${path.sep}`)) return null;
  return abs;
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

function readBand(value: unknown): SectionBand | undefined {
  if (!isRecord(value)) return undefined;
  const { y, height } = value;
  if (typeof y !== "number" || typeof height !== "number") return undefined;
  if (!Number.isInteger(y) || !Number.isInteger(height) || y < 0 || height < 0) return undefined;
  return { y, height, approximate: value.approximate !== false };
}

function readMotionApproval(value: unknown): MotionApproval | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.file !== "string" || typeof value.sha256 !== "string" || typeof value.approvedAt !== "string") {
    return undefined;
  }
  if (value.file.trim() === "" || value.sha256.trim() === "" || value.approvedAt.trim() === "") return undefined;
  return {
    file: value.file.replace(/\\/g, "/"),
    sha256: value.sha256,
    approvedAt: value.approvedAt,
  };
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
    if (typeof item.crop === "string" && item.crop.trim() !== "") section.crop = item.crop.replace(/\\/g, "/");
    if (typeof item.motion === "string" && item.motion.trim() !== "") section.motion = item.motion.replace(/\\/g, "/");
    const band = readBand(item.band);
    if (band !== undefined) section.band = band;
    const motionApproved = readMotionApproval(item.motionApproved);
    if (motionApproved !== undefined) section.motionApproved = motionApproved;
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
