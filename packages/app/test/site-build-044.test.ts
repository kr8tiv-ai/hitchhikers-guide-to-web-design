/**
 * BUG-044: a turn-cap failure keeps the Retry label and says the partial work stays.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { queueBodyHtml, type DriveRun } from "../src/drive-markup.ts";

const run: DriveRun = {
  promptId: "001",
  status: "failed",
  model: "grok-4.7-build-fast",
  effort: "xhigh",
  elapsedMs: 1200,
  lastLines: [],
  filesWritten: [],
  reason: "Grok stopped after 80 turns; the desk sets no cap, so Grok's own limit applied. Press Retry to run this prompt again.",
  stopReason: "cancelled",
  turnLimited: true,
};

test("a turn-cap row keeps Retry and says the partial work is kept", () => {
  const html = queueBodyHtml(
    [
      { id: "001", kind: "build", status: "failed" },
      { id: "002", kind: "build", status: "queued" },
    ],
    run,
  );
  assert.match(html, /data-action="retry"[^>]*>Retry<\/button>/);
  assert.match(html, /data-retry-note>Partial work is kept\./);
  assert.match(html, /desk sets no cap/);
  assert.equal(html.includes("!"), false);
  const other = queueBodyHtml(
    [
      { id: "001", kind: "build", status: "failed" },
      { id: "002", kind: "build", status: "queued" },
    ],
    { ...run, promptId: "009", turnLimited: false, reason: "The build exited with code 1." },
  );
  assert.equal(other.includes("data-retry-note"), false);
});
