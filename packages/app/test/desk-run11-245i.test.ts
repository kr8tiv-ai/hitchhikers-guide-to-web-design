/**
 * 245i desk: ask for a missing reference, and approve a page render.
 * The design stage panel stays the same when there is nothing to ask.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { approveRender, saveRenderUpload } from "@hitchhiker/engine";
import { renderDesignStagePanel } from "../src/server/design-stage-desk.ts";
import { removeTempDir } from "./remove-temp.ts";

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-245i-desk-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "# Sitemap\n\n## Primary\n\n- Home at /\n", "utf8");
  return dir;
}

test("the design stage panel stays free of reference chrome until there is something to show", () => {
  const dir = tempDir();
  try {
    const html = renderDesignStagePanel(dir, "token");
    assert.match(html, /data-design-stage="sitemap"/);
    assert.equal(html.includes("data-reference-ask"), false);
    assert.equal(html.includes("data-render-approve"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a missing reference asks for a screenshot and a render can be approved", () => {
  const dir = tempDir();
  try {
    writeFileSync(
      path.join(dir, ".hitchhiker", "reference-asks.json"),
      `${JSON.stringify({
        needs: [{ label: "Northwind", detail: "Northwind needs a URL or screenshot from the owner." }],
      })}\n`,
      "utf8",
    );
    saveRenderUpload(dir, "/", Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]));
    const waiting = renderDesignStagePanel(dir, "token");
    assert.match(waiting, /data-reference-ask/);
    assert.match(waiting, /needs a URL or screenshot from the owner/);
    assert.match(waiting, /\/api\/reference-upload\?csrf=token&amp;kind=ref/);
    assert.match(waiting, /data-render-approve/);
    assert.match(waiting, /name="action" value="approve-render"/);
    assert.match(waiting, /Approve/);
    approveRender(dir, "/", "2026-11-04T12:00:00.000Z");
    const approved = renderDesignStagePanel(dir, "token");
    assert.match(approved, /Home render approved\./);
    assert.equal(approved.includes('value="approve-render"'), false);
  } finally {
    removeTempDir(dir);
  }
});
