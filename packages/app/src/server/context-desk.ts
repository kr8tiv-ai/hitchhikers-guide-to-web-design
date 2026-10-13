/**
 * Desk panel for what the Guide knows. Reads the context module.
 * Routes stay free of the memory filenames.
 */

import path from "node:path";
import {
  loadAssets,
  loadDecisions,
  loadNotes,
  loadSummary,
  readAudit,
  readLedger,
  readPhaseStats,
  readStatus,
  type AssetRecord,
  type DecisionRecord,
} from "@hitchhiker/engine";
import { escapeHtml } from "../card.ts";
import { CONTEXT_LABEL } from "../client/desk.ts";

const RASTER = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export function renderContextMain(projectDir: string, token: string): string {
  const status = readStatus(projectDir);
  const summary = loadSummary(projectDir);
  const decisions = loadDecisions(projectDir);
  const assets = loadAssets(projectDir);
  const notes = loadNotes(projectDir);
  const phase = status.phase === "" ? "No phase yet" : status.phase;
  const question = status.questionId === "" ? "none" : status.questionId;
  return `<section class="hh-context" aria-label="${escapeHtml(CONTEXT_LABEL)}">
    <h1 class="hh-title">${escapeHtml(CONTEXT_LABEL)}</h1>
    <p>Phase: ${escapeHtml(phase)}. Question: ${escapeHtml(question)}.</p>
    <div class="hh-context__block">
      <h2 class="hh-title">Summary</h2>
      <p>${escapeHtml(summary === "" ? "No summary yet." : summary)}</p>
    </div>
    <div class="hh-context__block">
      <h2 class="hh-title">Decisions</h2>
      ${decisions.length === 0 ? "<p>No decisions yet.</p>" : decisions.map((record) => decisionBlock(record, token)).join("")}
    </div>
    <div class="hh-context__block">
      <h2 class="hh-title">Assets</h2>
      ${assets.length === 0 ? "<p>No assets yet.</p>" : assets.map((asset) => assetBlock(asset)).join("")}
    </div>
    ${auditBlock(projectDir)}
    ${statsBlock(projectDir)}
    <div class="hh-context__block">
      <h2 class="hh-title">Ask the Guide</h2>
      <p>A note stays a note until you make it a decision.</p>
      <form method="post" action="/context">
        <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
        <input type="hidden" name="action" value="discuss" />
        <label for="hh-discuss-question">Question</label>
        <input id="hh-discuss-question" name="question" type="text" autocomplete="off" />
        <label for="hh-discuss">Note</label>
        <textarea id="hh-discuss" name="note"></textarea>
        <button class="hh-btn hh-btn--secondary" type="submit">Save note</button>
      </form>
      ${notes.map((note) => noteBlock(note, token)).join("")}
    </div>
    <form method="post" action="/context">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="undo" />
      <input type="hidden" name="kind" value="answer" />
      <button class="hh-btn hh-btn--secondary" type="submit">Undo last answer</button>
    </form>
  </section>`;
}

export function contextAssetFile(projectDir: string, name: string): { root: string; rel: string } | null {
  if (name === "" || name.includes("\0") || name.includes("..") || name.startsWith("/") || name.startsWith("\\")) {
    return null;
  }
  const asset = loadAssets(projectDir).find((row) => row.saved === name);
  if (asset === undefined) return null;
  return { root: path.join(projectDir, ".hitchhiker", "uploads"), rel: asset.saved };
}

function decisionBlock(record: DecisionRecord, token: string): string {
  const state = record.supersededBy === "" ? "live" : `superseded by ${record.supersededBy}`;
  const field = `hh-correct-${record.id}`;
  return `<article>
    <h3>${escapeHtml(record.id)}</h3>
    <p>${escapeHtml(record.phase === "" ? "No phase" : record.phase)}. ${escapeHtml(record.source)}. ${escapeHtml(state)}.</p>
    <p>${escapeHtml(record.text)}</p>
    <form method="post" action="/context">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="correct" />
      <input type="hidden" name="id" value="${escapeHtml(record.id)}" />
      <label for="${escapeHtml(field)}">Correct ${escapeHtml(record.id)}</label>
      <input id="${escapeHtml(field)}" name="text" type="text" value="${escapeHtml(record.text)}" autocomplete="off" />
      <button class="hh-btn hh-btn--secondary" type="submit">Save correction</button>
    </form>
  </article>`;
}

function assetBlock(asset: AssetRecord): string {
  const ext = path.extname(asset.saved).toLowerCase();
  const thumb = asset.status === "live" && RASTER.has(ext)
    ? `<img src="/context/asset?name=${encodeURIComponent(asset.saved)}" alt="${escapeHtml(asset.original)}">`
    : "";
  return `<article>
    ${thumb}
    <p>${escapeHtml(asset.original)} role ${escapeHtml(asset.role)} question ${escapeHtml(asset.questionId)} ${escapeHtml(asset.status)}</p>
  </article>`;
}

function noteBlock(note: { id: string; questionId: string; text: string }, token: string): string {
  return `<article>
    <p>${escapeHtml(note.id)}. ${escapeHtml(note.text)}</p>
    <form method="post" action="/context">
      <input type="hidden" name="csrf" value="${escapeHtml(token)}" />
      <input type="hidden" name="action" value="promote" />
      <input type="hidden" name="note" value="${escapeHtml(note.id)}" />
      <button class="hh-btn hh-btn--secondary" type="submit">Make this a decision</button>
    </form>
  </article>`;
}

function auditBlock(projectDir: string): string {
  const last = readAudit(projectDir);
  const body = last === null
    ? "<p>No context audit yet.</p>"
    : `<p>Purpose: ${escapeHtml(last.purpose)}</p><p>Sections: ${escapeHtml(last.sections.join(", "))}</p><p>Trimmed: ${escapeHtml(last.trimmed.length === 0 ? "none" : last.trimmed.join(", "))}</p>`;
  return `<div class="hh-context__block" id="hh-context-audit">
    <h2 class="hh-title">Context audit</h2>
    <p><a href="#hh-context-audit">Context audit</a></p>
    ${body}
  </div>`;
}

function statsBlock(projectDir: string): string {
  const rows = readPhaseStats(projectDir);
  const ledger = readLedger(projectDir);
  const stats = rows.length === 0
    ? "<p>No phase stats yet.</p>"
    : rows
        .map(
          (row) =>
            `<p>${escapeHtml(row.phase)}: ${row.inputTokens} in, ${row.outputTokens} out, ${row.durationMs} ms</p>`,
        )
        .join("");
  const gates = ledger.length === 0
    ? "<p>No verify history yet.</p>"
    : ledger.map((entry) => `<p>${escapeHtml(entry.sha)} ${entry.passed ? "pass" : "fail"}</p>`).join("");
  return `<div class="hh-context__block">
    <h2 class="hh-title">Stats</h2>
    ${stats}
    <h2 class="hh-title">Verify history</h2>
    ${gates}
  </div>`;
}
