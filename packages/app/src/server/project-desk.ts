/**
 * Desk save line, Resume list, and Open project file.
 * The same saveProjectFile call as `hh save`. Remove drops the index row only.
 */

import path from "node:path";
import { escapeHtml } from "../card.ts";
import { renderFriendly, splitPublicError } from "../friendly.ts";
import { SAMPLE_LABEL, sampleProjectFile } from "../sample.ts";
import {
  fileExists,
  loadConfig,
  loadProjectFile,
  loadState,
  locationLabel,
  projectHome,
  readRecentProjects,
  readSaveNotice,
  removeRecentProject,
  restoreProject,
  saveConfig,
  saveProjectFile,
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
    const saved = loadConfig(projectDir).ai.effort.default;
    if (saved === "medium" || saved === "high" || saved === "xhigh") current = saved;
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
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return iso;
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

export async function projectChrome(projectDir: string, token: string, firstScreen: boolean): Promise<string> {
  const home = projectHome(projectDir);
  const notice = await readSaveNotice(projectDir, home).catch(() => null);
  const rows = await readRecentProjects(home).catch(() => [] as RecentProject[]);
  const mine = rows.find((row) => row.sourceDir === projectDir);
  const filePath = notice?.filePath ?? mine?.filePath ?? null;
  const savedAt = notice?.ok === true ? notice.savedAt : mine?.savedAt ?? null;
  const statusTip = "Where the desk is right now.";
  let line: string;
  if (notice !== null && notice.ok === false) {
    const reason = notice.reason ?? "The last save did not finish.";
    line = `<p class="hh-small" data-save-status data-tip="${statusTip}">Not saved · ${escapeHtml(reason)}</p>`;
  } else if (filePath !== null && savedAt !== null) {
    const place = locationLabel(filePath);
    line = `<p class="hh-small" data-save-status data-tip="${statusTip}" title="${escapeHtml(filePath)}">Saved · <time datetime="${escapeHtml(savedAt)}" data-local-time>${escapeHtml(savedStamp(savedAt))}</time> · ${escapeHtml(place)}</p>
      <button class="hh-btn hh-btn--ghost" type="button" data-copy="${escapeHtml(filePath)}" data-tip="Copies the project file path.">Copy path</button>`;
  } else {
    line = `<p class="hh-small" data-save-status data-tip="${statusTip}">Not saved · No save yet</p>`;
  }
  const prompt = mine === undefined ? "" : "";
  let resumePrompt = "";
  if (filePath !== null && fileExists(filePath)) {
    const loaded = await loadProjectFile(filePath, { liveDir: projectDir }).catch(() => null);
    const text = loaded?.file?.resumePrompt ?? "";
    if (text.length > 0) {
      resumePrompt = `<button class="hh-btn hh-btn--ghost" type="button" data-copy="${escapeHtml(text)}" data-tip="Copies the resume prompt for this project.">Copy resume prompt</button>`;
    }
  }
  const saveForm = `<form method="post" action="/api/project/save"><input type="hidden" name="csrf" value="${escapeHtml(token)}" /><button class="hh-btn hh-btn--secondary" type="submit" data-tip="Writes one project file on this machine. The interview stays where it is.">Save project</button></form>`;
  const name = `<p class="hh-project__name">${escapeHtml(path.basename(projectDir))}</p>`;
  const effort = effortControl(projectDir);
  const bar = `<div class="hh-save-line hh-project" role="region" aria-label="Project save" data-tour-spot="project">${name}${line}${effort}${saveForm}${resumePrompt}${prompt}<script type="module" src="/client/save-status.js"></script></div>`;
  if (!firstScreen) return bar;
  const items = rows
    .map((row) => {
      const missing = !fileExists(row.filePath);
      const when = savedStamp(row.savedAt);
      const state = missing ? "Missing" : escapeHtml(row.progress);
      const remove = missing
        ? `<form method="post" action="/api/project/remove">${hidden(token, "path", row.filePath)}<button class="hh-btn hh-btn--ghost" type="submit" data-tip="Drops this missing project from the list. The file is already gone.">Remove</button></form>`
        : "";
      return `<li class="hh-save-resume__row"${missing ? ' data-missing="true"' : ""}>
        <p class="hh-title">${escapeHtml(row.name)}</p>
        <p class="hh-small">${escapeHtml(when)} · ${state} · ${escapeHtml(locationLabel(row.filePath))}</p>
        ${remove}
      </li>`;
    })
    .join("");
  const list =
    items.length === 0
      ? `<p class="hh-small">No saved project yet. A save writes one file you can open later.</p>`
      : `<ul class="hh-save-resume__list">${items}</ul>`;
  const sample = sampleOffer(token, items.length === 0);
  const open = `<form method="post" action="/api/project/open" class="hh-save-open">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <label class="hh-small" for="hh-open-file">Project file path</label>
      <input id="hh-open-file" name="path" type="text" autocomplete="off" data-tip="Path of a project file on this machine." />
      <button class="hh-btn hh-btn--secondary" type="submit" data-tip="Opens a project file from a path on this machine. The interview switches to that file.">Open project folder</button>
    </form>`;
  const resume = `<details class="hh-project__resume">
      <summary class="hh-btn hh-btn--secondary" role="button" data-tip="Shows project files saved on this machine.">Resume project</summary>
      <h2 class="hh-title" id="resume-title">Resume a project</h2>
      <p class="hh-small">Pick up a saved project, or open a project file.</p>
      ${list}
    </details>`;
  return `<div class="hh-save-line hh-project" role="region" aria-label="Project save" data-tour-spot="project">${name}${line}${effort}${saveForm}${resume}${sample}${open}${resumePrompt}${prompt}<script type="module" src="/client/save-status.js"></script></div>`;
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
      await removeRecentProject(target, projectHome(input.projectDir));
      return { type: "redirect" };
    }
    if (input.pathname === "/api/project/open") {
      const target = form.get("path") ?? "";
      if (target.length === 0) {
        return {
          type: "html",
          status: 400,
          html: documentPage(
            "Missing path",
            renderFriendly({
              title: "Name a project file",
              happened: "The open form did not include a path.",
              next: "Paste the path of a .hhproject file, or use Open the sample on an empty desk.",
              retryHref: "/",
              retryLabel: "Back to the desk",
              copyText: "Open the sample",
            }),
          ),
        };
      }
      const preferRaw = form.get("prefer");
      const prefer = isPrefer(preferRaw) ? preferRaw : null;
      const loaded = await loadProjectFile(target, { liveDir: input.projectDir });
      if (loaded.readOnly) {
        return {
          type: "html",
          status: 200,
          html: documentPage(
            "Read only",
            `<div class="hh-empty"><h1 class="hh-empty__title">Opened read-only</h1><p>${escapeHtml(loaded.message ?? "This project file was written by a newer app. It is open read-only.")}</p><p class="hh-empty__next"><a class="hh-btn hh-btn--primary" href="/">Back to the desk</a></p></div>`,
          ),
        };
      }
      if (loaded.file === null || loaded.source === "live") {
        const raw = loaded.message ?? "The project file could not be read.";
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
      const live = loadState(input.projectDir);
      const liveAt = live === null ? Number.NaN : Date.parse(live.updatedAt);
      const fileAt = Date.parse(loaded.file.savedAt);
      if (prefer === null && Number.isFinite(liveAt) && Number.isFinite(fileAt) && liveAt > fileAt) {
        return { type: "html", status: 200, html: choicePage(input.token, target) };
      }
      await restoreProject(target, {
        projectDir: input.projectDir,
        prefer: prefer ?? "newer",
      });
      return { type: "redirect" };
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
