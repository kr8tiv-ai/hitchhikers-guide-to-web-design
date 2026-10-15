/**
 * BUG-042: a queue-wide pause says which prompt finished last and offers Resume.
 * A billing hold keeps the older sentence and does not offer that button.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDashboard } from "../src/dashboard.ts";
import { queueBodyHtml, type DriveRun } from "../src/drive-markup.ts";

const WHEN = "2026-10-15T12:00:00.000Z";

function copy(html: string): string {
  return html.replace(/<!DOCTYPE html>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
}

const items = [
  { id: "007", kind: "build" as const, status: "passed" as const },
  { id: "008", kind: "build" as const, status: "paused" as const },
  { id: "009", kind: "build" as const, status: "queued" as const },
];

test("Drive names the last finished prompt and offers Resume", () => {
  const html = renderDashboard({ items }, { pause: { at: WHEN, after: "007" } });
  assert.match(html, /<p data-queue-state="paused">Paused after 007<\/p>/);
  assert.match(html, /id="drive-resume"[^>]*data-action="resume-queue"[^>]*>Resume<\/button>/);
  assert.equal(html.includes("The queue is paused."), false);
  assert.equal(copy(html).includes("!"), false);
  assert.equal(copy(html).includes("\u2014"), false);
  assert.equal(html.match(/data-action="pause"/g)?.length, 1);
});

test("a pause before any prompt finishes says so", () => {
  const html = queueBodyHtml([{ id: "001", kind: "build", status: "queued" }], null, { at: WHEN, after: "" });
  assert.match(html, /<p data-queue-state="paused">Paused before the first prompt\.<\/p>/);
  assert.match(html, /data-action="resume-queue"/);
  assert.equal(html.includes("!"), false);
  assert.equal(html.includes("\u2014"), false);
});

test("a billing hold keeps its sentence and has no queue Resume", () => {
  const run: DriveRun = {
    promptId: "003",
    status: "failed",
    model: "grok-4.7-build-fast",
    effort: "xhigh",
    elapsedMs: 10,
    lastLines: [],
    filesWritten: [],
    reason: "Your Grok Build usage balance is used up. Top up your balance, then press Retry.",
    paused: true,
  };
  const html = queueBodyHtml(
    [
      { id: "003", kind: "build", status: "failed" },
      { id: "004", kind: "build", status: "paused" },
    ],
    run,
  );
  assert.match(html, /The queue is paused\./);
  assert.equal(html.includes("resume-queue"), false);
  assert.equal(html.includes("Paused after"), false);
});
