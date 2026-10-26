import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openPreview as previewFromIndex, previewZipPath as zipFromIndex } from "../src/index.ts";
import { openPreview, previewZipPath, type PreviewSession } from "../src/preview.ts";
import { removeTempDir } from "./remove-temp.ts";

const SOURCE = readFileSync(fileURLToPath(new URL("../src/preview.ts", import.meta.url)), "utf8");

test("the package entry re-exports the local preview", () => {
  assert.equal(previewFromIndex, openPreview);
  assert.equal(zipFromIndex, previewZipPath);
});

test("the preview module does not call a host, read a keychain, or bind the desk port", () => {
  assert.equal(SOURCE.includes("fetch("), false);
  assert.equal(SOURCE.includes("node:https"), false);
  assert.equal(SOURCE.includes("node:dns"), false);
  assert.equal(SOURCE.includes("child_process"), false);
  assert.equal(SOURCE.includes("keychain"), false);
  assert.equal(SOURCE.includes("HH_LIVE"), false);
  assert.equal(SOURCE.includes("hitchhikers-guide"), false);
  assert.equal(SOURCE.includes("hostinger"), false);
  assert.equal(SOURCE.includes("listen(4175"), false);
  assert.equal(SOURCE.includes("listen(DESK_PORT"), false);
  assert.equal(SOURCE.split("4175").length - 1, 1);
  assert.match(SOURCE, /const DESK_PORT = 4175;/);
});

test("a built folder is served with 200, a zip is written, and no call leaves this computer", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-preview-"));
  let session: PreviewSession | undefined;
  try {
    session = await seed(dir);
    assert.notEqual(session.port, 4175);
    assert.equal(session.url, `http://127.0.0.1:${session.port}/`);
    assert.equal(session.zipPath, previewZipPath(dir));
    const home = await request(session.port, "GET", "/");
    assert.equal(home.status, 200);
    assert.match(home.type, /text\/html/);
    assert.match(home.body, /Milliways/);
    const head = await request(session.port, "HEAD", "/");
    assert.equal(head.status, 200);
    assert.equal(head.body, "");
    const css = await request(session.port, "GET", "/assets/app.css");
    assert.equal(css.status, 200);
    assert.match(css.type, /text\/css/);
    assert.match(css.body, /color/);
    const nested = await request(session.port, "GET", "/about/");
    assert.equal(nested.status, 200);
    assert.match(nested.body, /About/);
    const missing = await request(session.port, "GET", "/missing.html");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.includes("DO_NOT_LEAK"), false);
    const climbed = await request(session.port, "GET", "/../secret.txt");
    assert.equal(climbed.status, 404);
    assert.equal(climbed.body.includes("DO_NOT_LEAK"), false);
    const encoded = await request(session.port, "GET", "/%2e%2e/secret.txt");
    assert.equal(encoded.status, 404);
    assert.equal(encoded.body.includes("DO_NOT_LEAK"), false);
    const nestedClimb = await request(session.port, "GET", "/assets/../../secret.txt");
    assert.equal(nestedClimb.status, 404);
    assert.equal(nestedClimb.body.includes("DO_NOT_LEAK"), false);
    const stranger = await request(session.port, "GET", "/", "evil.test");
    assert.equal(stranger.status, 421);
    assert.equal(stranger.body.includes("Milliways"), false);
    const posted = await request(session.port, "POST", "/");
    assert.equal(posted.status, 405);
    const zip = await readFile(session.zipPath);
    assert.equal(zip.subarray(0, 4).toString("hex"), "504b0304");
    assert.equal(zip.subarray(-22, -18).toString("hex"), "504b0506");
    assert.equal(zip.includes(Buffer.from("index.html")), true);
    assert.equal(zip.includes(Buffer.from("assets/app.css")), true);
    assert.equal(zip.includes(Buffer.from("about/index.html")), true);
    assert.equal(zip.includes(Buffer.from("Milliways")), true);
    assert.equal(zip.includes(Buffer.from("DO_NOT_LEAK")), false);
    assert.deepEqual(outsideAddresses(), []);
    await session.close();
    await session.close();
    await assert.rejects(() => request(session.port, "GET", "/"));
  } finally {
    await session?.close();
    await removeTempDir(dir);
  }
});

test("a missing page folder writes no zip and does not listen", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-preview-"));
  try {
    await mkdir(dir, { recursive: true });
    await assert.rejects(
      () => openPreview({ projectDir: dir, outputDir: "dist" }),
      /The pages are not built yet\. Build the site, then ask again\. Nothing was sent\./,
    );
    await absent(previewZipPath(dir));
  } finally {
    await removeTempDir(dir);
  }
});

test("a folder with no front page writes no zip", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-preview-"));
  try {
    await mkdir(path.join(dir, "dist"), { recursive: true });
    await writeFile(path.join(dir, "dist", "app.css"), "body{}", "utf8");
    await assert.rejects(
      () => openPreview({ projectDir: dir, outputDir: "dist" }),
      /The pages folder has no front page\. Nothing was sent\./,
    );
    await absent(previewZipPath(dir));
  } finally {
    await removeTempDir(dir);
  }
});

test("a folder outside the project is refused", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-preview-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "hh-preview-out-"));
  try {
    await writeFile(path.join(outside, "index.html"), "<title>Outside</title>", "utf8");
    await assert.rejects(
      () => openPreview({ projectDir: dir, outputDir: outside }),
      /That folder is outside the project\. Nothing was sent\./,
    );
    await assert.rejects(
      () => openPreview({ projectDir: dir, outputDir: "../not-this-project" }),
      /That folder is outside the project\. Nothing was sent\./,
    );
    await assert.rejects(
      () => openPreview({ projectDir: dir, outputDir: "" }),
      /That folder is outside the project\. Nothing was sent\./,
    );
    await absent(previewZipPath(dir));
  } finally {
    await removeTempDir(dir);
    await removeTempDir(outside);
  }
});

async function seed(dir: string): Promise<PreviewSession> {
  await mkdir(path.join(dir, "dist", "assets"), { recursive: true });
  await mkdir(path.join(dir, "dist", "about"), { recursive: true });
  await writeFile(path.join(dir, "dist", "index.html"), "<title>Milliways</title>", "utf8");
  await writeFile(path.join(dir, "dist", "assets", "app.css"), "body{color:#111}", "utf8");
  await writeFile(path.join(dir, "dist", "about", "index.html"), "<title>About</title>", "utf8");
  await writeFile(path.join(dir, "secret.txt"), "DO_NOT_LEAK", "utf8");
  return openPreview({ projectDir: dir, outputDir: "dist" });
}

async function absent(file: string): Promise<void> {
  await assert.rejects(() => access(file));
}

function request(
  port: number,
  method: string,
  reqPath: string,
  host?: string,
): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (host !== undefined) headers.host = host;
    const req = http.request(
      { hostname: "127.0.0.1", port, path: reqPath, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            type: String(res.headers["content-type"] ?? ""),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function outsideAddresses(): string[] {
  const proc = process as NodeJS.Process & {
    _getActiveHandles?: () => Array<{ remoteAddress?: string }>;
  };
  assert.equal(typeof proc._getActiveHandles, "function");
  const handles = proc._getActiveHandles?.() ?? [];
  const local = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
  const found: string[] = [];
  for (const handle of handles) {
    const remote = handle.remoteAddress;
    if (typeof remote !== "string" || remote === "" || local.has(remote)) continue;
    found.push(remote);
  }
  return found;
}
