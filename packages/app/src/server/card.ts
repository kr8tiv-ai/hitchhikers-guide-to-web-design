import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { explainTool, type AnswerRecord, type PathProbeName } from "@hitchhiker/engine";
import { escapeHtml } from "../card.ts";
import {
  MAX_ATTACH_FILES,
  answerWithAttachments,
  attachQuestionId,
  collectLinks,
  type SummaryFile,
} from "../client/attach.ts";

/**
 * PATH probes shared with `hh doctor` (`probePathTools` in the CLI).
 * The desk renders this report. It does not spawn the tools itself.
 * The app package cannot depend on the CLI, so `hh app` passes the result in.
 */
export const PREFLIGHT_NAMES = ["grok", "playwright", "whisper", "pdftotext"] as const;

export type PreflightName = (typeof PREFLIGHT_NAMES)[number];

export interface PreflightProbe {
  name: PreflightName;
  ok: boolean;
  detail: string;
  version?: string | null;
}

export interface DeskPreflight {
  grokOk: boolean;
  probes: readonly PreflightProbe[];
}

export const EMPTY_BRAND_ACTION = "Approve the brief to print the kit";
export const START_INTERVIEW_LABEL = "Start the interview";
export const APPROVE_EMPTY_ACTION = "Answer the open question";

const GROK_MISSING = "Grok is not on PATH.";

export function openQuestionHref(questionId: string | null): string {
  if (questionId === null || !/^[A-Za-z0-9._-]{1,64}$/.test(questionId)) return "/";
  return `/?question=${encodeURIComponent(questionId)}`;
}

/** First question on the packaged tree. Callers pass a real id when they have one. */
export function startInterviewHref(questionId: string | null): string {
  if (questionId !== null && /^[A-Za-z0-9._-]{1,64}$/.test(questionId)) {
    return openQuestionHref(questionId);
  }
  return openQuestionHref("DP-0.1");
}

/** One primary control. The href is the first question route. */
export function renderStartInterview(questionId: string | null): string {
  const href = escapeHtml(startInterviewHref(questionId));
  return `<a class="hh-btn hh-btn--primary" href="${href}">${START_INTERVIEW_LABEL}</a>`;
}

/**
 * The empty card used to say "No question yet" and stop.
 * One button opens the first question. At 375 the desk is one column.
 * At 1440 the button sits in the 40rem read column. No new palette.
 */
export function renderEmptyInterview(questionId: string | null): string {
  return `<article class="hh-qcard">
  <p class="hh-empty__next">${renderStartInterview(questionId)}</p>
</article>`;
}

/**
 * Ready follows the grok probe only. The other three tools stay warnings.
 * A calm live line is kept once the interview has an answer.
 */
export function deskStatus(input: {
  base: string;
  firstRun: boolean;
  calm: boolean;
  preflight: DeskPreflight | null;
}): string {
  const preflight = input.preflight;
  if (preflight === null) return input.base;
  if (!preflight.grokOk) {
    if (input.firstRun || /\bReady\b/i.test(input.base)) return GROK_MISSING;
    return input.base;
  }
  if (input.firstRun && !input.calm) return "Ready.";
  return input.base;
}

/** The same explainTool note the doctor prints, as a desk section. */
export function renderProbeExplain(name: PathProbeName): string {
  const note = explainTool(name);
  return `<section class="hh-probe-note" data-probe-explain="${escapeHtml(name)}">
      <h3 class="hh-small">${escapeHtml(name)}</h3>
      <p>What it means: ${escapeHtml(note.means)}</p>
      <p>Why it matters: ${escapeHtml(note.why)}</p>
      <p>Fix: ${escapeHtml(note.fix)}</p>
      <p>Doc: ${escapeHtml(note.doc)}</p>
    </section>`;
}

export function renderPreflight(preflight: DeskPreflight): string {
  const byName = new Map(preflight.probes.map((probe) => [probe.name, probe]));
  const rows = PREFLIGHT_NAMES.map((name) => {
    const probe = byName.get(name);
    const ok = probe?.ok === true;
    const detail = probe?.detail ?? (name === "grok" ? "grok: not on PATH" : `${name}: not installed`);
    const state = ok ? "Present" : "Missing";
    const action = ok
      ? ""
      : `<button class="hh-btn hh-btn--secondary" type="button" data-install="${escapeHtml(name)}" data-tip="Writes an install plan for ${escapeHtml(name)}, then runs it after you confirm.">Install ${escapeHtml(name)}</button>`;
    return `<tr data-probe="${escapeHtml(name)}" data-probe-state="${ok ? "ok" : "missing"}">
        <td data-label="Check">${escapeHtml(name)}</td>
        <td data-label="Result">${escapeHtml(detail)}</td>
        <td data-label="State">${state}</td>
        <td data-label="Action">${action}</td>
      </tr>`;
  }).join("");
  const notes = PREFLIGHT_NAMES.filter((name) => byName.get(name)?.ok !== true)
    .map((name) => renderProbeExplain(name))
    .join("");
  return `<div class="hh-table-wrap" data-region="preflight">
    <table class="hh-table" aria-label="Preflight">
      <thead>
        <tr><th>Check</th><th>Result</th><th>State</th><th>Action</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    ${notes}
  </div>`;
}

/**
 * Pointer the brand plate reads after a logo question upload.
 * The bytes stay in `.hitchhiker/uploads` under safeName.
 */
export interface LogoIntake {
  safeName: string;
  questionId: string;
}

const LOGO_FILE =
  /^(?:hh-[0-9a-f]{8}-[A-Za-z0-9_-][A-Za-z0-9._-]{0,47}|[A-Za-z0-9][A-Za-z0-9._-]{0,63})\.(png|jpe?g|webp|gif|svg|pdf)$/;

export function isLogoAssetName(name: string): boolean {
  if (name.includes("..") || name.includes("\\") || name.includes("\0")) return false;
  const slash = name.indexOf("/");
  if (slash === -1) return LOGO_FILE.test(name);
  if (name.indexOf("/", slash + 1) !== -1) return false;
  const folder = name.slice(0, slash);
  const file = name.slice(slash + 1);
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/.test(folder)) return false;
  return LOGO_FILE.test(file);
}

export function isRasterLogo(name: string): boolean {
  return isLogoAssetName(name) && /\.(?:png|jpe?g|webp|gif)$/i.test(name);
}

export function parseLogoIntake(raw: string): LogoIntake | null {
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.safeName !== "string" || typeof record.questionId !== "string") return null;
  if (!isLogoAssetName(record.safeName)) return null;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(record.questionId)) return null;
  return { safeName: record.safeName, questionId: record.questionId };
}

export function serializeLogoIntake(intake: LogoIntake): string {
  return `${JSON.stringify({ safeName: intake.safeName, questionId: intake.questionId })}\n`;
}

/**
 * Raster logos are an image. SVG and PDF stay a file name: SVG is not given a route.
 * bk-figure caps the image at 28rem, so 375 fits the column and 1440 does not grow past that.
 */
export function logoIntakeMarkup(intake: LogoIntake | null): string {
  if (intake === null) return "";
  const name = escapeHtml(intake.safeName);
  const question = escapeHtml(intake.questionId);
  if (isRasterLogo(intake.safeName)) {
    return `<figure class="bk-figure" data-logo-intake data-logo-question="${question}"><img src="/brand/logo" alt="Logo on file" /><figcaption class="hh-small">${name}</figcaption></figure>`;
  }
  return `<p class="hh-specimen__text" data-logo-intake data-logo-question="${question}">Logo on file: ${name}</p>`;
}

/** Puts the intake mark beside the kit's Logo heading. A plate with no heading is unchanged. */
export function injectBrandLogo(html: string, intake: LogoIntake | null): string {
  if (intake === null || html.includes("data-logo-intake")) return html;
  const block = logoIntakeMarkup(intake);
  if (block === "") return html;
  const marker = '<h2 class="hh-title" id="logo-title">Logo</h2>';
  if (!html.includes(marker)) return html;
  return html.replace(marker, `${marker}${block}`);
}

/**
 * One next action, linked to the open question.
 * At 375 the shell is a single column with 16px padding. At 1440 the plate
 * sits in the 40rem read column. The button uses the existing rust primary.
 * A saved logo sits in that same column.
 */
export function renderEmptyBrand(questionId: string | null, intake: LogoIntake | null = null): string {
  const href = escapeHtml(openQuestionHref(questionId));
  const label = questionId === null ? "Open question" : `Open question ${questionId}`;
  const logo = logoIntakeMarkup(intake);
  const logoBlock = logo === "" ? "" : `\n        ${logo}`;
  return `<section class="hh-specimen hh-rise hh-rise--2" aria-labelledby="brand-title">
        <p class="hh-kicker" id="brand-title">Type</p>
        <h1 class="hh-specimen__display">No kit on the desk</h1>
        <p class="hh-specimen__text">Palette, letters, and voice land on this plate after the brief is approved.</p>${logoBlock}
      </section>
      <div class="hh-empty hh-rise hh-rise--3">
        <p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="${href}" data-tip="Opens the question that has to be answered before the kit can print.">${EMPTY_BRAND_ACTION}</a></p>
        <p><a class="hh-btn hh-btn--ghost" href="${href}">${escapeHtml(label)}</a></p>
      </div>`;
}

export type InterviewMode = "express" | "standard" | "deep";

/**
 * Required questions in this depth that are not answered yet.
 * Uses the same answer list as interview coverage. Skip and suggest stay open.
 */
export function openRequiredCount(
  questions: readonly { id: string }[],
  answers: readonly AnswerRecord[],
  required: readonly string[],
): number {
  const inDepth = new Set(questions.map((question) => question.id));
  const latest = new Map<string, AnswerRecord>();
  for (const answer of answers) latest.set(answer.id, answer);
  let open = 0;
  for (const id of required) {
    if (!inDepth.has(id)) continue;
    const record = latest.get(id);
    if (record === undefined || record.value.trim() === "") {
      open += 1;
      continue;
    }
    if (record.status === "SKIPPED" || record.status === "SUGGESTED") open += 1;
  }
  return open;
}

/** Skip confirms when the tree marks requiredFor, or the id is a brief required field. */
export function questionNeedsConfirm(
  question: { id: string; requiredFor?: readonly string[] } | null,
  required: readonly string[],
): boolean {
  if (question === null) return false;
  if ((question.requiredFor?.length ?? 0) > 0) return true;
  return required.includes(question.id);
}

/**
 * The answer just written, when it was Suggest or Skip.
 * Shown on the following card. A plain answer is not marked assumed.
 */
export function previousAssumption(
  questions: readonly { id: string }[],
  answers: readonly AnswerRecord[],
  currentId: string | null,
): { value: string; kind: "suggested" | "skipped" } | null {
  if (currentId === null) return null;
  const index = questions.findIndex((question) => question.id === currentId);
  if (index <= 0) return null;
  const previous = questions[index - 1];
  if (previous === undefined) return null;
  let latest: AnswerRecord | undefined;
  for (const answer of answers) {
    if (answer.id === previous.id) latest = answer;
  }
  if (latest === undefined || latest.value.trim() === "") return null;
  if (latest.status === "SUGGESTED") return { value: latest.value, kind: "suggested" };
  if (latest.status === "SKIPPED") return { value: latest.value, kind: "skipped" };
  return null;
}

/** True after an answer is stored for a question in this depth. Express seeds sit outside it. */
export function depthTouched(
  questions: readonly { id: string }[],
  answers: readonly { id: string; value: string }[],
): boolean {
  const ids = new Set(questions.map((question) => question.id));
  return answers.some((answer) => ids.has(answer.id) && answer.value.trim() !== "");
}

/**
 * Express writes the deferred questions as SKIPPED assumptions (seedExpressAssumptions).
 * It does not delete them. Standard and Deep name the mode only.
 */
export function modeNote(mode: InterviewMode): string {
  if (mode === "express") {
    return "Short interview. Skipped questions get a sensible default you can change later.";
  }
  if (mode === "standard") return "Standard interview";
  return "Deep interview";
}

export function mastLine(phase: string, questionId: string | null): string {
  if (questionId === null || questionId === "") return phase;
  return `${phase} · ${questionId}`;
}

/** Compact map line. index is the 1-based question, total is this depth. */
export function compactMapLabel(phase: string, index: number, total: number): string {
  if (total < 1) return phase;
  const at = Number.isInteger(index) && index > 0 ? index : 0;
  return `${phase} · ${at}/${total}`;
}

/**
 * Footer once an answer in this depth is on disk.
 * left is how many questions in the depth come after the current one.
 * Shape: Saved · DP-0.2 · 20 left
 */
export function savedFooterLine(questionId: string, left: number): string {
  const remaining = Number.isInteger(left) && left > 0 ? left : 0;
  return `Saved · ${questionId} · ${remaining} left`;
}

interface ManifestRow {
  path: string;
  storedName: string;
  originalName: string;
  size: number;
  type: string;
}

/**
 * Draft plus the files and links this project actually has.
 * A path outside the question folder is dropped. A link is normalized and never fetched.
 */
export function composeStoredAnswer(
  projectDir: string,
  questionId: string,
  draft: string,
  attachments: unknown,
): string {
  const files: SummaryFile[] = [];
  const links: string[] = [];
  if (!Array.isArray(attachments) || !attachQuestionId(questionId)) {
    return answerWithAttachments(draft, files, links);
  }
  const folder = questionFolder(projectDir, questionId);
  const byPath = new Map(readManifest(projectDir, questionId).map((row) => [row.path, row]));
  for (const item of attachments) {
    if (!isPlain(item)) continue;
    if (item.kind === "link" && typeof item.url === "string") {
      const got = collectLinks(links, [item.url]);
      for (const url of got.added) links.push(url);
      continue;
    }
    if (item.kind !== "file" || typeof item.path !== "string" || folder === null) continue;
    if (files.length >= MAX_ATTACH_FILES) continue;
    const relPath = item.path.replaceAll("\\", "/");
    const prefix = `.hitchhiker/uploads/${questionId}/`;
    if (!relPath.startsWith(prefix) || relPath.includes("..")) continue;
    const row = byPath.get(relPath);
    if (row === undefined) continue;
    const stored = relPath.slice(prefix.length);
    if (stored !== row.storedName || stored.includes("/") || stored.includes("..")) continue;
    const abs = path.resolve(folder, stored);
    const rel = path.relative(folder, abs);
    if (rel !== stored || rel.startsWith("..") || path.isAbsolute(rel)) continue;
    if (!isPlainFile(abs)) continue;
    files.push({ originalName: row.originalName });
  }
  return answerWithAttachments(draft, files, links);
}

function questionFolder(projectDir: string, questionId: string): string | null {
  if (!attachQuestionId(questionId)) return null;
  const root = path.resolve(projectDir, ".hitchhiker", "uploads");
  const folder = path.resolve(root, questionId);
  const rel = path.relative(root, folder);
  if (rel !== questionId || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return folder;
}

function readManifest(projectDir: string, questionId: string): ManifestRow[] {
  const folder = questionFolder(projectDir, questionId);
  if (folder === null) return [];
  const file = path.join(folder, "manifest.json");
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isManifestRow);
  } catch {
    return [];
  }
}

function isManifestRow(value: unknown): value is ManifestRow {
  if (!isPlain(value)) return false;
  return (
    typeof value.path === "string" &&
    typeof value.storedName === "string" &&
    typeof value.originalName === "string" &&
    typeof value.size === "number" &&
    typeof value.type === "string"
  );
}

function isPlainFile(abs: string): boolean {
  try {
    const stat = lstatSync(abs);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
