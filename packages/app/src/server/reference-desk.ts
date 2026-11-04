/**
 * Asks for a missing reference URL and approves one render per primary page.
 * Empty when there is nothing to ask and no render file yet, so the design
 * stage panel stays unchanged.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { isRenderApproved, listPrimaryPages, readReferenceAsks, renderRelForRoute } from "@hitchhiker/engine";
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

function showRenders(projectDir: string): boolean {
  if (existsSync(path.join(projectDir, ".hitchhiker", "renders.json"))) return true;
  const dir = path.join(projectDir, "reference", "renders");
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => /\.(png|jpe?g|webp)$/i.test(name));
}
