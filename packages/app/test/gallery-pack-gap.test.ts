import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startServer, type ServerHandle } from "../src/server/server.ts";

/**
 * On HEAD a malformed pack makes readPack return [] and the page says
 * "No sites matched" with no loader message. Prompt 202 makes that loud.
 */
test("a malformed gallery row is an error on the page, not an empty walk", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-bad-pack-"));
  const project = mkdtempSync(path.join(tmpdir(), "hh-bad-project-"));
  const file = path.join(dir, "pack.json");
  writeFileSync(
    file,
    JSON.stringify([
      {
        id: "bad-row",
        name: "Bad row",
        url: "https://example.com/bad-row",
        source: "not-a-source",
        industry: "saas",
        styleWorld: "editorial",
        motionLevel: 3,
        award: "none",
        noted: "Look at a row the loader must refuse.",
      },
    ]),
  );
  const previous = process.env.HH_GALLERY_FILE;
  process.env.HH_GALLERY_FILE = file;
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: project,
      open: false,
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    const html = await getText(handle.port, "/gallery");
    assert.match(html, /bad-row/);
    assert.match(html, /The gallery pack is invalid/);
    assert.match(html, /validate:gallery/);
    assert.equal(html.includes("No sites matched"), false);
  } finally {
    if (handle !== undefined) await handle.close();
    if (previous === undefined) delete process.env.HH_GALLERY_FILE;
    else process.env.HH_GALLERY_FILE = previous;
    rmSync(dir, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

function getText(port: number, pathname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: pathname, method: "GET" }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.end();
  });
}
