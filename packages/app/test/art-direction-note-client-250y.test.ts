/**
 * 250y. The drive desk serves art-direction-note as JavaScript.
 * A relative .ts import 404s in the browser and the queue rows never update.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { NO_ART_DIRECTION_NOTE } from "@hitchhiker/engine";
import { artDirectionNoteHtml } from "../src/art-direction-note.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

test("served drive markup rewrites the art-direction note and that module is JavaScript", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-art-note-250y-"));
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    const markup = await fetch(new URL("/client/drive-markup.js", handle.url));
    assert.equal(markup.status, 200);
    const markupJs = await markup.text();
    assert.match(markupJs, /from "\/client\/art-direction-note\.js"/);
    assert.equal(markupJs.includes("art-direction-note.ts"), false);

    const note = await fetch(new URL("/client/art-direction-note.js", handle.url));
    assert.equal(note.status, 200);
    assert.match(note.headers.get("content-type") ?? "", /javascript/);
    const noteJs = await note.text();
    assert.match(noteJs, /function artDirectionNoteHtml/);
    assert.match(noteJs, /from "\/client\/card\.js"/);
    assert.equal(/from\s+["'][^"']+\.ts["']/.test(noteJs), false);
    assert.equal(noteJs.includes("@hitchhiker"), false);
    assert.equal(noteJs.includes("node:"), false);
    assert.equal(noteJs.includes("child_process"), false);
    assertSyntax(noteJs, "hh-art-direction-note-check.js");
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the desk note keeps the engine sentence", () => {
  assert.equal(
    artDirectionNoteHtml("none"),
    `<p data-art-direction="none" role="status">${NO_ART_DIRECTION_NOTE}</p>`,
  );
  assert.equal(artDirectionNoteHtml(""), "");
  assert.equal(artDirectionNoteHtml(undefined), "");
});

function assertSyntax(source: string, name: string): void {
  const file = path.join(tmpdir(), name);
  writeFileSync(file, source);
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  rmSync(file, { force: true });
}
