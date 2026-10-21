/**
 * Desk save line, Resume list, and Open project file.
 * The same saveProjectFile call as `hh save`. Remove drops the index row only.
 */

import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { escapeHtml } from "../card.ts";
import { renderFriendly, splitPublicError } from "../friendly.ts";
import { SAMPLE_LABEL, sampleProjectFile } from "../sample.ts";
import { formatSavedAt } from "../save-line.ts";
import {
  createSiteProject,
  defaultProjectDir,
  fileExists,
  interviewEffort,
  interviewProgressLabel,
  isInsideDeskRepo,
  loadConfig,
  loadProjectFile,
  loadState,
  locationLabel,
  projectHome,
  readProjectDisplayName,
  readRecentProjects,
  readSaveNotice,
  removeRecentProject,
  restoreProject,
  saveConfig,
  saveProjectFile,
  upsertRecentProject,
  type RecentProject,
  type RestorePrefer,
} from "@hitchhiker/engine";

export interface ProjectPostInput {
  pathname: string;
  projectDir: string;
  token: string;
  header: string | string[] | undefined;
  raw: string;
  contentType: string;
  accept?: string;
  tokensMatch: (expected: string, provided: string) => boolean;
}

export type ProjectJsonBody = {
  error?: string;
  ok?: boolean;
  savedAt?: string;
  place?: string;
};

export type ProjectPostResult =
  | { type: "redirect"; location?: string }
  | { type: "switch"; projectDir: string }
  | { type: "html"; status: number; html: string }
  | { type: "json"; status: number; body: ProjectJsonBody };

function csrfFrom(raw: string, contentType: string): string | null {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime === "application/json") {
    try {
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
      const csrf = (value as Record<string, unknown>).csrf;
      return typeof csrf === "string" ? csrf : null;
    } catch {
      return null;
    }
  }
  if (mime === "application/x-www-form-urlencoded" || raw.includes("=")) {
    return new URLSearchParams(raw).get("csrf");
  }
  return null;
}

function fields(raw: string): URLSearchParams {
  return new URLSearchParams(raw);
}

function effortControl(projectDir: string): string {
  let current = "xhigh";
  try {
    current = interviewEffort(loadConfig(projectDir));
  } catch {
    current = "xhigh";
  }
  const option = (value: string, label: string): string => {
    const on = current === value ? " checked" : "";
    return `<label class="hh-effort__opt"><input type="radio" name="guide-effort" value="${value}"${on} /> ${label}</label>`;
  };
  return `<div class="hh-effort" data-effort-control role="radiogroup" aria-label="Guide effort">${option("medium", "Medium")}${option("high", "High")}${option("xhigh", "Extra high")}<p class="hh-qcard__why" data-effort-hint>Higher is more thorough and slower.</p></div>`;
}

function savedStamp(iso: string): string {
  return formatSavedAt(iso);
}

/** Where new site folders go. End-to-end runs stay inside the temp project. */
function sitesRoot(): string {
  const e2e = process.env.HH_E2E_PROJECT?.trim() ?? "";
  if (e2e !== "") return path.resolve(e2e);
  return os.homedir();
}

/**
 * Home index for a new project.
 * While the desk is holding its own repo, do not use that repo's test home.
 */
function indexHome(projectDir: string): string {
  const fromEnv = process.env.HH_PROJECT_HOME?.trim() ?? "";
  if (fromEnv !== "") return path.resolve(fromEnv);
  if (!isInsideDeskRepo(projectDir)) return projectHome(projectDir);
  const e2e = process.env.HH_E2E_PROJECT?.trim() ?? "";
  if (e2e !== "") return path.join(path.resolve(e2e), ".hh-save-home");
  return os.homedir();
}

function absoluteInsideRepo(dir: string): boolean {
  return path.isAbsolute(dir) && isInsideDeskRepo(dir);
}

function hidden(token: string, name: string, value: string): string {
  return `<input type="hidden" name="csrf" value="${escapeHtml(token)}" /><input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`;
}

function documentPage(title: string, main: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/src/design/tokens.css" />
    <link rel="stylesheet" href="/src/design/type.css" />
    <link rel="stylesheet" href="/src/design/components.css" />
    <link rel="stylesheet" href="/src/shell.css" />
  </head>
  <body>
    <a class="hh-skip" href="#main">Skip to the panel</a>
    <div class="hh-shell">
      <header class="hh-mast">
        <p class="hh-kicker">Project file</p>
        <div class="hh-wordmark" role="img" aria-label="Don't Panic"></div>
      </header>
      <main id="main" class="hh-read" data-hh-ready>
        ${main}
      </main>
    </div>
    <script type="module" src="/client/save-status.js"></script>
  </body>
</html>
`;
}

function choicePage(token: string, filePath: string): string {
  const pathField = hidden(token, "path", filePath);
  return documentPage(
    "Which copy wins",
    `<div class="hh-empty">
      <h1 class="hh-empty__title">The project folder is newer</h1>
      <p>The folder is selected. Nothing has been overwritten.</p>
      <form method="post" action="/api/project/open" class="hh-save-open">
        ${pathField}
        <input type="hidden" name="prefer" value="live" />
        <button class="hh-btn hh-btn--primary" type="submit">Keep the project folder</button>
      </form>
      <form method="post" action="/api/project/open" class="hh-save-open">
        ${hidden(token, "path", filePath)}
        <input type="hidden" name="prefer" value="file" />
        <button class="hh-btn hh-btn--secondary" type="submit">Use the project file</button>
      </form>
    </div>`,
  );
}

function rowProgress(row: RecentProject, missing: boolean): string {
  if (missing) return "Missing";
  if (path.isAbsolute(row.sourceDir) && existsSync(row.sourceDir)) {
    const label = interviewProgressLabel(row.sourceDir);
    if (label !== null) return label;
  }
  return row.progress;
}

function resumeItems(rows: readonly RecentProject[], token: string): string {
  return rows
    .map((row) => {
      const missing = !fileExists(row.filePath);
      const when = savedStamp(row.savedAt);
      const state = escapeHtml(rowProgress(row, missing));
      const remove = missing
        ? `<form method="post" action="/api/project/remove">${hidden(token, "path", row.filePath)}<button class="hh-btn hh-btn--ghost" type="submit" data-tip="Drops this missing project from the list. The file is already gone.">Remove</button></form>`
        : "";
      const open = missing
        ? `<p class="hh-title">${escapeHtml(row.name)}</p>`
        : `<form method="post" action="/api/project/open" class="hh-save-open">${hidden(token, "path", row.filePath)}<button class="hh-btn hh-btn--secondary" type="submit" aria-label="Open ${escapeHtml(row.name)}">${escapeHtml(row.name)}</button></form>`;
      return `<li class="hh-save-resume__row"${missing ? ' data-missing="true"' : ""}>
        ${open}
        <p class="hh-small">${escapeHtml(when)} · ${state} · ${escapeHtml(locationLabel(row.filePath))}</p>
        ${remove}
      </li>`;
    })
    .join("");
}

function newProjectFields(token: string, openForm: boolean): string {
  const name = "New site";
  const folder = defaultProjectDir(name, sitesRoot());
  const hiddenOpen = openForm ? " open" : "";
  return `<details class="hh-project__new"${hiddenOpen}>
      <summary class="hh-btn hh-btn--secondary" role="button" data-tip="Starts a site project in its own folder.">New project</summary>
      <form method="post" action="/api/project/new" class="hh-save-open" data-new-project>
        <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
        <label class="hh-small" for="hh-new-name">Project name</label>
        <input id="hh-new-name" name="name" type="text" value="${escapeHtml(name)}" autocomplete="off" data-tip="The name of the new site project." />
        <label class="hh-small" for="hh-new-dir">Folder</label>
        <input id="hh-new-dir" name="dir" type="text" value="${escapeHtml(folder)}" autocomplete="off" data-tip="Where the project folder will be created." />
        <p class="hh-small" data-new-error hidden></p>
        <button class="hh-btn hh-btn--secondary" type="submit">Create project</button>
      </form>
    </details>`;
}

function openProjectForm(token: string): string {
  return `<form method="post" action="/api/project/open" class="hh-save-open" data-open-project>
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <label class="hh-small" for="hh-open-file">Project file path</label>
      <input id="hh-open-file" name="path" type="text" autocomplete="off" data-tip="Path of a project folder or a project file on this machine." />
      <p class="hh-small" data-open-error hidden></p>
      <button class="hh-btn hh-btn--secondary" type="submit" data-tip="Opens a project folder or a project file. The interview switches to that project.">Open project folder</button>
    </form>`;
}

export async function projectChrome(
  projectDir: string,
  token: string,
  firstScreen: boolean,
  flash = "",
): Promise<string> {
  const holding = isInsideDeskRepo(projectDir);
  const home = holding ? indexHome(projectDir) : projectHome(projectDir);
  const notice = holding ? null : await readSaveNotice(projectDir, home).catch(() => null);
  const rows = await readRecentProjects(home).catch(() => [] as RecentProject[]);
  const mine = holding ? undefined : rows.find((row) => row.sourceDir === projectDir);
  const filePath = notice?.filePath ?? mine?.filePath ?? null;
  const savedAt = notice?.ok === true ? notice.savedAt : mine?.savedAt ?? null;
  const statusTip = "Where the desk is right now.";
  let line: string;
  if (holding) {
    line = `<p class="hh-small" data-save-status data-tip="${statusTip}">No project open yet.</p>`;
  } else if (notice !== null && notice.ok === false) {
    const reason = notice.reason ?? "The last save did not finish.";
    line = `<p class="hh-small" data-save-status data-tip="${statusTip}">Not saved · ${escapeHtml(reason)}</p>`;
  } else if (filePath !== null && savedAt !== null) {
    const place = locationLabel(filePath);
    line = `<p class="hh-small" data-save-status data-tip="${statusTip}" title="${escapeHtml(filePath)}">Saved · <time datetime="${escapeHtml(savedAt)}" data-local-time>${escapeHtml(savedStamp(savedAt))}</time> · ${escapeHtml(place)}</p>
      <button class="hh-btn hh-btn--ghost" type="button" data-copy="${escapeHtml(filePath)}" data-tip="Copies the project file path.">Copy path</button>`;
  } else {
    line = `<p class="hh-small" data-save-status data-tip="${statusTip}">Not saved · No save yet</p>`;
  }
  const prompt = "";
  let resumePrompt = "";
  if (!holding && filePath !== null && fileExists(filePath)) {
    const loaded = await loadProjectFile(filePath, { liveDir: projectDir }).catch(() => null);
    const text = loaded?.file?.resumePrompt ?? "";
    if (text.length > 0) {
      resumePrompt = `<button class="hh-btn hh-btn--ghost" type="button" data-copy="${escapeHtml(text)}" data-tip="Copies the resume prompt for this project.">Copy resume prompt</button>`;
    }
  }
  const saveForm = holding
    ? ""
    : `<form method="post" action="/api/project/save"><input type="hidden" name="csrf" value="${escapeHtml(token)}" /><button class="hh-btn hh-btn--secondary" type="submit" data-tip="Writes one project file on this machine. The interview stays where it is.">Save project</button></form>`;
  const displayName = readProjectDisplayName(projectDir) ?? path.basename(projectDir);
  const name = holding ? "" : `<p class="hh-project__name">${escapeHtml(displayName)}</p>`;
  const rootAttr = holding ? "" : ` data-project-root="${escapeHtml(path.resolve(projectDir))}"`;
  const effort = holding ? "" : effortControl(projectDir);
  const flashLine = flash.trim() === "" ? "" : `<p class="hh-small" data-open-notice role="alert">${escapeHtml(flash.trim())}</p>`;
  const created = newProjectFields(token, holding);
  const script = `<script type="module" src="/client/save-status.js"></script>`;
  if (!firstScreen && !holding) {
    const openItems = resumeItems(rows, token);
    const openList =
      openItems.length === 0
        ? `<p class="hh-small">No saved project yet. A save writes one file you can open later.</p>`
        : `<ul class="hh-save-resume__list">${openItems}</ul>`;
    const resume = `<details class="hh-project__resume">
      <summary class="hh-btn hh-btn--secondary" role="button" data-tip="Shows project files saved on this machine.">Resume project</summary>
      ${openList}
    </details>`;
    return `<div class="hh-save-line hh-project" role="region" aria-label="Project save" data-tour-spot="project"${rootAttr}>${flashLine}${name}${line}${effort}${saveForm}${created}${resume}${openProjectForm(token)}${resumePrompt}${prompt}${script}</div>`;
  }
  const items = resumeItems(rows, token);
  const list =
    items.length === 0
      ? `<p class="hh-small">No saved project yet. A save writes one file you can open later.</p>`
      : `<ul class="hh-save-resume__list">${items}</ul>`;
  const sample = sampleOffer(token, items.length === 0);
  const open = openProjectForm(token);
  const resume = `<details class="hh-project__resume">
      <summary class="hh-btn hh-btn--secondary" role="button" data-tip="Shows project files saved on this machine.">Resume project</summary>
      <h2 class="hh-title" id="resume-title">Resume a project</h2>
      <p class="hh-small">Pick up a saved project, or open a project file.</p>
      ${list}
    </details>`;
  return `<div class="hh-save-line hh-project" role="region" aria-label="Project save" data-tour-spot="project"${rootAttr}>${flashLine}${name}${line}${effort}${saveForm}${created}${resume}${sample}${open}${resumePrompt}${prompt}${script}</div>`;
}

export function applyProjectChrome(html: string, chrome: string): string {
  const slot = "<div data-project-slot></div>";
  if (html.includes(slot)) return html.replace(slot, chrome);
  let next = html;
  const marker = '<div class="hh-columns">';
  const sectionEnd = chrome.indexOf('<div class="hh-save-line"');
  const section = sectionEnd >= 0 ? chrome.slice(0, sectionEnd) : "";
  const bar = sectionEnd >= 0 ? chrome.slice(sectionEnd) : chrome;
  if (section.length > 0 && next.includes(marker)) {
    next = next.replace(marker, `${section}\n      ${marker}`);
  } else if (section.length > 0 && next.includes("<main")) {
    next = next.replace("<main", `${section}\n      <main`);
  }
  const footer = "</footer>";
  const at = next.lastIndexOf(footer);
  if (at >= 0) {
    const end = at + footer.length;
    return `${next.slice(0, end)}\n${bar}${next.slice(end)}`;
  }
  if (next.includes("</body>")) return next.replace("</body>", `${bar}</body>`);
  return `${next}${bar}`;
}

function sampleOffer(token: string, empty: boolean): string {
  const file = sampleProjectFile();
  const lead = empty
    ? `<p class="hh-small">No saved project yet. A save writes one file you can open later. Or open the sample and look around.</p>`
    : `<p class="hh-small">The sample is a towel shop you can open without leaving the desk.</p>`;
  return `<div class="hh-empty" data-tour-spot="sample" data-empty-sample="${empty ? "true" : "false"}">
      ${lead}
      <form method="post" action="/api/project/open" class="hh-save-open" data-open-sample>
        ${hidden(token, "path", file)}
        <input type="hidden" name="prefer" value="file" />
        <button class="hh-btn hh-btn--secondary" type="submit" data-tip="Opens the towel shop sample through the same project file the desk uses for every save.">${SAMPLE_LABEL}</button>
      </form>
    </div>`;
}

function isPrefer(value: string | null): value is RestorePrefer {
  return value === "file" || value === "live" || value === "newer";
}

/**
 * A saved file opens its own folder.
 * An absolute sourceDir that exists becomes the session root.
 * A missing absolute sourceDir asks where to relocate. It is never written
 * into the project that is already open.
 * A relative sourceDir (the towel sample uses ".") still loads into an empty
 * desk folder, which has no name and no brief of its own.
 */
function usableSourceDir(sourceDir: string): string | null {
  if (!path.isAbsolute(sourceDir)) return null;
  const resolved = path.resolve(sourceDir);
  if (isInsideDeskRepo(resolved)) return null;
  try {
    if (!statSync(resolved).isDirectory()) return null;
  } catch {
    return null;
  }
  return resolved;
}

function sourceFolderNewer(source: string, savedAt: string): boolean {
  const live = loadState(source);
  if (live === null) return false;
  const liveAt = Date.parse(live.updatedAt);
  const fileAt = Date.parse(savedAt);
  return Number.isFinite(liveAt) && Number.isFinite(fileAt) && liveAt > fileAt;
}

function projectIsEmptyShell(projectDir: string): boolean {
  if (isInsideDeskRepo(projectDir)) return false;
  if (readProjectDisplayName(projectDir) !== null) return false;
  const hitch = path.join(projectDir, ".hitchhiker");
  for (const name of ["interview.json", "SITE-BRIEF.md", "brief-yes.json", "brief-pending.json"]) {
    if (existsSync(path.join(hitch, name))) return false;
  }
  return true;
}

function offeredRelocateDir(fileDir: string, openDir: string): string {
  if (path.resolve(fileDir) === path.resolve(openDir)) return "";
  if (isInsideDeskRepo(fileDir)) return "";
  return fileDir;
}

function relocatePage(token: string, filePath: string, offeredDir: string, warning: string): string {
  const warn = warning.trim() === "" ? "" : `<p>${escapeHtml(warning.trim())}</p>`;
  return documentPage(
    "Relocate project",
    `<div class="hh-empty" data-relocate-project>
      <h1 class="hh-empty__title">The saved folder is not on this machine</h1>
      <p>The project file points at a folder that is missing or was moved. The project that is open was left unchanged.</p>
      ${warn}
      <form method="post" action="/api/project/open" class="hh-save-open">
        ${hidden(token, "path", filePath)}
        <input type="hidden" name="relocate" value="1" />
        <label class="hh-small" for="hh-relocate-dir">Folder</label>
        <input id="hh-relocate-dir" name="dir" type="text" value="${escapeHtml(offeredDir)}" autocomplete="off" data-tip="Where this project should live. It is not written into the project that is already open." />
        <button class="hh-btn hh-btn--primary" type="submit">Relocate project</button>
      </form>
    </div>`,
  );
}

async function ensureDisplayName(dir: string, name: string): Promise<void> {
  if (readProjectDisplayName(dir) !== null) return;
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const file = path.join(dir, ".hitchhiker", "project.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ name: trimmed }, null, 2)}\n`, "utf8");
}

async function rememberOpened(
  home: string,
  filePath: string,
  file: { projectId: string; projectName: string; savedAt: string; interview: { index: number | null; total: number | null } },
  dest: string,
): Promise<void> {
  const index = file.interview.index;
  const total = file.interview.total;
  const progress = index !== null && total !== null && total > 0 ? `question ${index} of ${total}` : "not started";
  await upsertRecentProject(
    {
      projectId: file.projectId,
      name: file.projectName,
      filePath,
      sourceDir: dest,
      savedAt: file.savedAt,
      progress,
      ok: true,
      reason: null,
    },
    home,
  );
}

function unreadablePage(target: string, message: string | null): ProjectPostResult {
  const raw = message ?? "The project file could not be read.";
  const split = splitPublicError(raw);
  return {
    type: "html",
    status: 400,
    html: documentPage(
      "Unreadable",
      renderFriendly({
        title: "That file could not be opened",
        happened: split.summary,
        next: "Check the path, or open the sample from the empty desk. A bad file is moved aside and is not deleted.",
        retryHref: "/",
        retryLabel: "Back to the desk",
        copyText: target,
        detail: split.detail ?? raw,
      }),
    ),
  };
}

function readOnlyPage(message: string | null): ProjectPostResult {
  return {
    type: "html",
    status: 200,
    html: documentPage(
      "Read only",
      `<div class="hh-empty"><h1 class="hh-empty__title">Opened read-only</h1><p>${escapeHtml(message ?? "This project file was written by a newer app. It is open read-only.")}</p><p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="/">Back to the desk</a></p></div>`,
    ),
  };
}

async function openProjectFile(
  input: ProjectPostInput,
  form: URLSearchParams,
  target: string,
): Promise<ProjectPostResult> {
  const resolved = path.resolve(target);
  const recent = await readRecentProjects(indexHome(input.projectDir)).catch(() => [] as RecentProject[]);
  const row = recent.find((item) => path.resolve(item.filePath) === resolved);
  if (row !== undefined && absoluteInsideRepo(row.sourceDir)) {
    return { type: "redirect", location: "/?open-error=repo" };
  }
  const preferRaw = form.get("prefer");
  const prefer = isPrefer(preferRaw) ? preferRaw : null;
  const loaded = await loadProjectFile(target);
  if (loaded.readOnly) return readOnlyPage(loaded.message);
  if (loaded.file === null) return unreadablePage(target, loaded.message);
  const file = loaded.file;
  if (absoluteInsideRepo(file.sourceDir)) return { type: "redirect", location: "/?open-error=repo" };

  const source = usableSourceDir(file.sourceDir);
  if (source !== null) {
    if (prefer === null && sourceFolderNewer(source, file.savedAt)) {
      return { type: "html", status: 200, html: choicePage(input.token, target) };
    }
    if (prefer !== "live") {
      await restoreProject(target, { projectDir: source, prefer: prefer ?? "file" });
    }
    await ensureDisplayName(source, file.projectName);
    return { type: "switch", projectDir: source };
  }

  const recordedAbsolute = path.isAbsolute(file.sourceDir);
  if (!recordedAbsolute && isInsideDeskRepo(input.projectDir) && form.get("relocate") !== "1") {
    const dest = defaultProjectDir(file.projectName || "Opened site", sitesRoot());
    if (isInsideDeskRepo(dest)) return { type: "redirect", location: "/?open-error=repo" };
    await mkdir(dest, { recursive: true });
    await restoreProject(target, { projectDir: dest, prefer: prefer ?? "file" });
    await ensureDisplayName(dest, file.projectName);
    await rememberOpened(indexHome(input.projectDir), resolved, file, dest);
    return { type: "switch", projectDir: dest };
  }
  if (!recordedAbsolute && projectIsEmptyShell(input.projectDir) && form.get("relocate") !== "1") {
    await restoreProject(target, { projectDir: input.projectDir, prefer: prefer ?? "file" });
    await ensureDisplayName(input.projectDir, file.projectName);
    return { type: "switch", projectDir: input.projectDir };
  }

  const offer = offeredRelocateDir(path.dirname(resolved), input.projectDir);
  if (form.get("relocate") !== "1") {
    return { type: "html", status: 200, html: relocatePage(input.token, target, offer, "") };
  }
  const requested = (form.get("dir") ?? "").trim();
  if (requested.length === 0) {
    return {
      type: "html",
      status: 200,
      html: relocatePage(input.token, target, offer, "Name a folder for this project."),
    };
  }
  const dest = path.resolve(requested);
  if (isInsideDeskRepo(dest)) return { type: "redirect", location: "/?open-error=repo" };
  if (path.resolve(dest) === path.resolve(input.projectDir)) {
    return {
      type: "html",
      status: 200,
      html: relocatePage(
        input.token,
        target,
        offer,
        "That folder is the project already open. Choose a different folder so this file is not written into it.",
      ),
    };
  }
  await mkdir(dest, { recursive: true });
  await restoreProject(target, { projectDir: dest, prefer: "file" });
  await ensureDisplayName(dest, file.projectName);
  file.sourceDir = dest;
  await writeFile(resolved, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  await rememberOpened(indexHome(input.projectDir), resolved, file, dest);
  return { type: "switch", projectDir: dest };
}

export async function runProjectPost(input: ProjectPostInput): Promise<ProjectPostResult> {
  const header = typeof input.header === "string" ? input.header : null;
  const provided = header ?? csrfFrom(input.raw, input.contentType);
  if (provided === null || !input.tokensMatch(input.token, provided)) {
    return {
      type: "html",
      status: 403,
      html: documentPage(
        "Refused",
        `<div class="hh-empty"><h1 class="hh-empty__title">The desk refused this request</h1><p>Reload the page.</p><p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="/">Back to the desk</a></p></div>`,
      ),
    };
  }
  const form = fields(input.raw);
  try {
    if (input.pathname === "/api/project/save") {
      const saved = await saveProjectFile(input.projectDir);
      if (form.get("tour") === "seen") {
        try {
          const current = loadConfig(input.projectDir);
          if (current.tourSeen !== true) {
            await saveConfig(input.projectDir, { ...current, tourSeen: true });
          }
        } catch {
          // The project file is already written. Tour memory can catch up later.
        }
      }
      const place = locationLabel(saved.filePath);
      if ((input.accept ?? "").includes("application/json")) {
        return { type: "json", status: 200, body: { ok: true, savedAt: saved.savedAt, place } };
      }
      return { type: "redirect", location: "/?stay=1" };
    }
    if (input.pathname === "/api/project/remove") {
      const target = form.get("path") ?? "";
      if (target.length === 0) {
        return {
          type: "html",
          status: 400,
          html: documentPage(
            "Missing path",
            renderFriendly({
              title: "Name a project file",
              happened: "Remove needs the project file path.",
              next: "Go back to the desk and use Remove on the missing row.",
              retryHref: "/",
              retryLabel: "Back to the desk",
            }),
          ),
        };
      }
      await removeRecentProject(target, indexHome(input.projectDir));
      return { type: "redirect" };
    }
    if (input.pathname === "/api/project/new") {
      const name = (form.get("name") ?? "").trim();
      if (name.length === 0) return { type: "redirect", location: "/?open-error=name" };
      const requested = (form.get("dir") ?? "").trim();
      const dir = requested.length > 0 ? requested : defaultProjectDir(name, sitesRoot());
      try {
        const created = await createSiteProject({
          name,
          dir,
          homeDir: indexHome(input.projectDir),
        });
        return { type: "switch", projectDir: created.dir };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("own source repo")) return { type: "redirect", location: "/?open-error=repo" };
        if (message.includes("Name the project")) return { type: "redirect", location: "/?open-error=name" };
        throw error;
      }
    }
    if (input.pathname === "/api/project/open") {
      const target = (form.get("path") ?? "").trim();
      if (target.length === 0) return { type: "redirect", location: "/?open-error=choose" };
      const resolved = path.resolve(target);
      let directory = false;
      try {
        directory = statSync(resolved).isDirectory();
      } catch {
        directory = false;
      }
      if (directory) {
        if (isInsideDeskRepo(resolved)) return { type: "redirect", location: "/?open-error=repo" };
        return { type: "switch", projectDir: resolved };
      }
      return openProjectFile(input, form, target);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The project file did not save.";
    const split = splitPublicError(message);
    return {
      type: "html",
      status: 500,
      html: documentPage(
        "Not saved",
        renderFriendly({
          title: "Not saved",
          happened: split.summary,
          next: "Try Save again. The previous file, if there was one, is still on disk.",
          retryHref: "/",
          retryLabel: "Back to the desk",
          copyText: "Save the project again",
          detail: split.detail,
        }),
      ),
    };
  }
  return { type: "json", status: 404, body: { error: "That route is not on the desk." } };
}
