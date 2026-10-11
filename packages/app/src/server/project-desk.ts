/**
 * Desk save line, Resume list, and Open project file.
 * The same saveProjectFile call as `hh save`. Remove drops the index row only.
 */

import { escapeHtml } from "../card.ts";
import {
  fileExists,
  loadProjectFile,
  loadState,
  locationLabel,
  projectHome,
  readRecentProjects,
  readSaveNotice,
  removeRecentProject,
  restoreProject,
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
  tokensMatch: (expected: string, provided: string) => boolean;
}

export type ProjectPostResult =
  | { type: "redirect" }
  | { type: "html"; status: number; html: string }
  | { type: "json"; status: number; body: { error: string } };

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

function savedStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm} UTC`;
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
      <main id="main" class="hh-read">
        ${main}
      </main>
    </div>
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
  let line: string;
  if (notice !== null && notice.ok === false) {
    const reason = notice.reason ?? "The last save did not finish.";
    line = `<p class="hh-small" data-save-status>Not saved · ${escapeHtml(reason)}</p>`;
  } else if (filePath !== null && savedAt !== null) {
    const place = locationLabel(filePath);
    line = `<p class="hh-small" data-save-status title="${escapeHtml(filePath)}">Saved · ${escapeHtml(savedStamp(savedAt))} · ${escapeHtml(place)}</p>
      <button class="hh-btn hh-btn--ghost" type="button" data-copy="${escapeHtml(filePath)}">Copy path</button>`;
  } else {
    line = `<p class="hh-small" data-save-status>Not saved · No save yet</p>`;
  }
  const prompt = mine === undefined ? "" : "";
  let resumePrompt = "";
  if (filePath !== null && fileExists(filePath)) {
    const loaded = await loadProjectFile(filePath, { liveDir: projectDir }).catch(() => null);
    const text = loaded?.file?.resumePrompt ?? "";
    if (text.length > 0) {
      resumePrompt = `<button class="hh-btn hh-btn--ghost" type="button" data-copy="${escapeHtml(text)}">Copy resume prompt</button>`;
    }
  }
  const saveForm = `<form method="post" action="/api/project/save"><input type="hidden" name="csrf" value="${escapeHtml(token)}" /><button class="hh-btn hh-btn--secondary" type="submit">Save</button></form>`;
  const bar = `<div class="hh-save-line" role="region" aria-label="Project save">${line}${saveForm}${resumePrompt}${prompt}<script type="module" src="/client/save-status.js"></script></div>`;
  if (!firstScreen) return bar;
  const items = rows
    .map((row) => {
      const missing = !fileExists(row.filePath);
      const when = savedStamp(row.savedAt);
      const state = missing ? "Missing" : escapeHtml(row.progress);
      const remove = missing
        ? `<form method="post" action="/api/project/remove">${hidden(token, "path", row.filePath)}<button class="hh-btn hh-btn--ghost" type="submit">Remove</button></form>`
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
  const open = `<form method="post" action="/api/project/open" class="hh-save-open">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <label class="hh-small" for="hh-open-file">Open project file</label>
      <input id="hh-open-file" name="path" type="text" autocomplete="off" />
      <button class="hh-btn hh-btn--primary" type="submit">Open project file</button>
    </form>`;
  const section = `<section class="hh-save-resume" aria-labelledby="resume-title">
      <h2 class="hh-title" id="resume-title">Resume a project</h2>
      <p class="hh-small">Pick up a saved project, or open a project file.</p>
      ${list}
      ${open}
    </section>`;
  return `${section}${bar}`;
}

export function applyProjectChrome(html: string, chrome: string): string {
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
      await saveProjectFile(input.projectDir);
      return { type: "redirect" };
    }
    if (input.pathname === "/api/project/remove") {
      const target = form.get("path") ?? "";
      if (target.length === 0) {
        return { type: "html", status: 400, html: documentPage("Missing path", "<p>Name the project file to remove from the list.</p>") };
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
          html: documentPage("Missing path", `<div class="hh-empty"><h1 class="hh-empty__title">Name a project file</h1><p>Paste the path, then open it.</p></div>`),
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
      if (loaded.file === null) {
        return {
          type: "html",
          status: 400,
          html: documentPage("Unreadable", `<div class="hh-empty"><h1 class="hh-empty__title">That file could not be opened</h1><p>${escapeHtml(loaded.message ?? "The project file could not be read.")}</p></div>`),
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
    return {
      type: "html",
      status: 500,
      html: documentPage("Not saved", `<div class="hh-empty"><h1 class="hh-empty__title">Not saved</h1><p>${escapeHtml(message)}</p></div>`),
    };
  }
  return { type: "json", status: 404, body: { error: "That route is not on the desk." } };
}
