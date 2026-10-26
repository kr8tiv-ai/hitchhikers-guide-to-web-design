/**
 * BUG-055. The design stage panel renders from the stage files.
 * buildStarted is not required.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { renderDesignStagePanel } from "../src/server/design-stage-desk.ts";
import { removeTempDir } from "./remove-temp.ts";

test("renderDesignStagePanel renders the sitemap when no build has started", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-stage-panel-"));
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "# Sitemap\n\n- Home at /\n", "utf8");
    const html = renderDesignStagePanel(dir, "token");
    assert.match(html, /data-design-stage="sitemap"/);
    assert.match(html, /Approve sitemap/);
    assert.doesNotMatch(html, /The build is started/);
    assert.equal(html.includes("buildStarted"), false);
  } finally {
    removeTempDir(dir);
  }
});
