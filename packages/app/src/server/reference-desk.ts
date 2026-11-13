/**
 * Asks for a missing reference URL and approves one render per primary page.
 * Empty when there is nothing to ask and no render file yet, so the design
 * stage panel stays unchanged.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  compViewFacts,
  isCompApproved,
  isRenderApproved,
  listComps,
  listPrimaryPages,
  readReferenceAsks,
  renderRelForRoute,
  requiredCompViews,
  type CompPage,
  type CompSection,
  type CompView,
  type PrimaryPage,
} from "@hitchhiker/engine";
import { escapeHtml } from "../card.ts";

export function renderReferenceDesk(projectDir: string, token: string): string {
  const parts: string[] = [];
  const asks = renderAsks(projectDir, token);
  if (asks !== "") parts.push(asks);
  const renders = renderApprovals(projectDir, token);
  if (renders !== "") parts.push(renders);
  return parts.join("\n");
}

function renderAsks(projectDir: string, token: string): string {
  const needs = readReferenceAsks(projectDir);
  if (needs.length === 0) return "";
  const items = needs.map((need) => `<li>${escapeHtml(need.detail)}</li>`).join("");
  const action = `/api/reference-upload?csrf=${encodeURIComponent(token)}&kind=ref`;
  return `<section data-reference-ask>
      <h2>Reference shots</h2>
      <p>Each missing reference needs a URL or screenshot from the owner.</p>
      <ul>${items}</ul>
      <form method="post" action="${escapeHtml(action)}" enctype="multipart/form-data">
        <label>Upload a screenshot
          <input type="file" name="file" accept="image/png,image/jpeg,image/webp" />
        </label>
        <button class="hh-btn hh-btn--secondary" type="submit">Upload screenshot</button>
      </form>
    </section>`;
}

function renderApprovals(projectDir: string, token: string): string {
  if (!showRenders(projectDir)) return "";
  const pages = listPrimaryPages(projectDir);
  const rows = pages
    .map((page) => {
      const rel = renderRelForRoute(page.route);
      const abs = path.join(projectDir, ...rel.split("/"));
      if (!existsSync(abs)) return "";
      if (isRenderApproved(projectDir, page.route)) {
        return `<p>${escapeHtml(page.title)} render approved.</p>`;
      }
      const upload = `/api/reference-upload?csrf=${encodeURIComponent(token)}&kind=render&route=${encodeURIComponent(page.route)}`;
      return `<div data-render-route="${escapeHtml(page.route)}">
        <p>${escapeHtml(page.title)} (${escapeHtml(page.route)}) is waiting for approval.</p>
        <form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="approve-render" />
          <input type="hidden" name="route" value="${escapeHtml(page.route)}" />
          <button class="hh-btn hh-btn--primary" type="submit">Approve</button>
        </form>
        <form method="post" action="${escapeHtml(upload)}" enctype="multipart/form-data">
          <label>Upload a mock
            <input type="file" name="file" accept="image/png,image/jpeg,image/webp" />
          </label>
          <button class="hh-btn hh-btn--secondary" type="submit">Upload mock</button>
        </form>
      </div>`;
    })
    .filter((row) => row !== "")
    .join("");
  if (rows === "" && !existsSync(path.join(projectDir, ".hitchhiker", "renders.json"))) return "";
  return `<section data-render-approve>
      <h2>Page renders</h2>
      ${rows}
    </section>`;
}

const LOOK_INTRO =
  "These are sketches of your pages. Pick the one that feels right. The words are added later, so ignore the grey bars.";

/**
 * Look and feel. One page at a time, each view at its real aspect.
 * Called from the design stage desk. The reference ask stays separate.
 */
export function renderCompsDesk(projectDir: string, token: string): string {
  const pages = listPrimaryPages(projectDir);
  if (pages.length === 0) return "";
  const doc = listComps(projectDir);
  const views = requiredCompViews(projectDir);
  const blocks = pages
    .map((page) => renderCompPage(projectDir, token, page, views, doc.pages.find((item) => item.route === page.route)))
    .join("");
  return `<section data-design-stage="look">
      <h2>Look and feel</h2>
      <p>${escapeHtml(LOOK_INTRO)}</p>
      ${blocks}
    </section>`;
}

function renderCompPage(
  projectDir: string,
  token: string,
  page: PrimaryPage,
  views: readonly CompView[],
  stored: CompPage | undefined,
): string {
  const viewHtml = views.map((view) => renderCompView(projectDir, token, page, view, stored)).join("");
  const motion = stored === undefined ? "" : renderCompMotion(projectDir, token, page, stored.sections);
  return `<article data-comp-page="${escapeHtml(page.route)}">
      <h3>${escapeHtml(page.title.trim() === "" ? "This page" : page.title)}</h3>
      ${viewHtml}
      ${motion}
    </article>`;
}

function renderCompView(
  projectDir: string,
  token: string,
  page: PrimaryPage,
  view: CompView,
  stored: CompPage | undefined,
): string {
  const facts = compViewFacts(view);
  const heading = viewHeading(facts.label);
  const record = stored === undefined ? undefined : viewRecord(stored, view);
  const files = sketchFiles(projectDir, record?.candidates ?? [], record?.approved?.file, record?.approved?.from);
  const approved = isCompApproved(projectDir, page.route, view);
  const status = approved ? "Approved" : files.length === 0 ? "Drawing..." : "Ready to pick";
  const picked = approved ? (files.find((file) => file === record?.approved?.from || file === record?.approved?.file) ?? "") : "";
  const cards = files
    .map((file, index) => sketchCard(page, facts.label, view, file, index + 1, file === picked))
    .join("");
  const route = escapeHtml(page.route);
  const viewValue = escapeHtml(view);
  const csrf = escapeHtml(token);
  const useId = fieldId(page.route, view, "pick");
  const changeId = fieldId(page.route, view, "change");
  const uploadId = fieldId(page.route, view, "upload");
  const uploadAction = `/api/comp-upload?csrf=${encodeURIComponent(token)}&route=${encodeURIComponent(page.route)}&view=${encodeURIComponent(view)}`;
  const disabled = files.length === 0 ? " disabled" : "";
  return `<div data-comp-view="${viewValue}">
      <form method="post" action="/approve">
        <input type="hidden" name="csrf" value="${csrf}" />
        <input type="hidden" name="action" value="approve-comp" />
        <input type="hidden" name="route" value="${route}" />
        <input type="hidden" name="view" value="${viewValue}" />
        <fieldset>
          <legend>${escapeHtml(heading)}</legend>
          <p data-comp-status>${escapeHtml(status)}</p>
          <div class="hh-comp-grid">${cards}</div>
          <button class="hh-btn hh-btn--primary" type="submit" id="${escapeHtml(useId)}"${disabled}>Use this one</button>
        </fieldset>
      </form>
      <form method="post" action="/approve">
        <input type="hidden" name="csrf" value="${csrf}" />
        <input type="hidden" name="action" value="comp-change" />
        <input type="hidden" name="route" value="${route}" />
        <input type="hidden" name="view" value="${viewValue}" />
        <label for="${escapeHtml(changeId)}">Try again with these changes
          <textarea id="${escapeHtml(changeId)}" name="changes" rows="3" required></textarea>
        </label>
        <button class="hh-btn hh-btn--secondary" type="submit">Try again with these changes</button>
      </form>
      <form method="post" action="${escapeHtml(uploadAction)}" enctype="multipart/form-data">
        <label for="${escapeHtml(uploadId)}">Upload my own
          <input id="${escapeHtml(uploadId)}" type="file" name="file" accept="image/png,image/jpeg,image/webp" required />
        </label>
        <button class="hh-btn hh-btn--secondary" type="submit">Upload my own</button>
      </form>
    </div>`;
}

function renderCompMotion(
  projectDir: string,
  token: string,
  page: PrimaryPage,
  sections: readonly CompSection[],
): string {
  const blocks: string[] = [];
  for (const section of sections) {
    const rel = section.motion?.replace(/\\/g, "/");
    if (rel === undefined || !rel.startsWith("reference/") || rel.includes("..")) continue;
    const abs = path.join(projectDir, ...rel.split("/"));
    if (!existsSync(abs)) continue;
    const name = plainSection(section.id);
    const src = sketchSrc(rel);
    const approved = section.motionApproved !== undefined;
    const action = approved
      ? `<p data-comp-status>Approved</p>`
      : `<form method="post" action="/approve">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
          <input type="hidden" name="action" value="approve-motion" />
          <input type="hidden" name="route" value="${escapeHtml(page.route)}" />
          <input type="hidden" name="section" value="${escapeHtml(section.id)}" />
          <button class="hh-btn hh-btn--primary" type="submit">Use this motion</button>
        </form>`;
    blocks.push(`<div data-comp-motion data-comp-section="${escapeHtml(section.id)}">
        <p>${escapeHtml(name)}</p>
        <video src="${src}" muted autoplay loop playsinline controls aria-label="${escapeHtml(`${page.title} ${name} motion`)}"></video>
        ${action}
      </div>`);
  }
  return blocks.join("");
}

function sketchCard(page: PrimaryPage, label: string, view: CompView, file: string, index: number, checked: boolean): string {
  const facts = compViewFacts(view);
  const alt = `${page.title.trim() === "" ? "This page" : page.title} ${label} sketch ${index}`;
  const mark = checked ? " checked" : "";
  return `<label class="hh-comp-card" data-aspect="${escapeHtml(facts.aspect)}">
      <input type="radio" name="candidate" value="${escapeHtml(file)}" required${mark} />
      <img src="${sketchSrc(file)}" alt="${escapeHtml(alt)}" />
    </label>`;
}

function sketchFiles(
  projectDir: string,
  candidates: readonly string[],
  approvedFile: string | undefined,
  approvedFrom: string | undefined,
): string[] {
  const files: string[] = [];
  const push = (rel: string | undefined): void => {
    if (rel === undefined) return;
    const normal = rel.replace(/\\/g, "/");
    if (normal === "" || files.includes(normal) || !normal.startsWith("reference/") || normal.includes("..")) return;
    if (!existsSync(path.join(projectDir, ...normal.split("/")))) return;
    files.push(normal);
  };
  for (const candidate of candidates) push(candidate);
  push(approvedFrom);
  push(approvedFile);
  return files;
}

function sketchSrc(rel: string): string {
  return escapeHtml(`/desk/sketch?file=${encodeURIComponent(rel)}`);
}

function viewRecord(page: CompPage, view: CompView) {
  if (view === "desktop") return page.views.desktop;
  if (view === "mobile") return page.views.mobile;
  return page.views["desktop-long"];
}

function viewHeading(label: string): string {
  if (label === "desktop") return "Desktop";
  if (label === "phone") return "Phone";
  if (label === "long page") return "Long page";
  return label;
}

function plainSection(id: string): string {
  const words = id.replace(/-/g, " ").trim();
  if (words === "") return "This section";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fieldId(route: string, view: string, kind: string): string {
  const slug = route.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "home";
  return `comp-${kind}-${slug}-${view}`;
}

function showRenders(projectDir: string): boolean {
  if (existsSync(path.join(projectDir, ".hitchhiker", "renders.json"))) return true;
  const dir = path.join(projectDir, "reference", "renders");
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => /\.(png|jpe?g|webp)$/i.test(name));
}
