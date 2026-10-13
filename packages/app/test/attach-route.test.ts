/**
 * POST /api/attach/:questionId saves only inside the project uploads folder.
 * Traversal, a bad type, a sniffed executable, and an oversize body are refused.
 * One bad file does not erase the valid files in the same request.
 */
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { MAX_ATTACH_REQUEST_BYTES, MAX_UPLOAD_BYTES } from "../src/client/attach.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { settleResponse } from "./settle-guide-job.ts";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h2v2H0z"/></svg>');
const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-attach-"));
}

async function withDesk(
  run: (handle: ServerHandle, dir: string) => Promise<void>,
  turn?: (text: string) => void,
): Promise<void> {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      ...(turn === undefined
        ? {}
        : {
            turnHandler: async (input) => {
              turn(input.text ?? "");
              return { next: null, events: [] };
            },
          }),
    });
    await run(handle, dir);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function multipart(parts: { filename: string; mime: string; data: Buffer }[]): { body: Buffer; type: string } {
  const boundary = "hhboundary";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${part.filename}"\r\nContent-Type: ${part.mime}\r\n\r\n`,
      ),
    );
    chunks.push(part.data);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
}

interface AttachPayload {
  ok?: boolean;
  error?: string;
  files?: {
    ok?: boolean;
    path?: string;
    storedName?: string;
    originalName?: string;
    size?: number;
    type?: string;
    error?: string;
  }[];
}

async function postAttach(
  handle: ServerHandle,
  questionId: string,
  token: string | null,
  parts: { filename: string; mime: string; data: Buffer }[],
): Promise<{ status: number; payload: AttachPayload }> {
  const body = multipart(parts);
  const headers: Record<string, string> = { "content-type": body.type };
  if (token !== null) headers["x-hh-csrf"] = token;
  const response = await fetch(new URL(`/api/attach/${questionId}`, handle.url), {
    method: "POST",
    headers,
    body: new Uint8Array(body.body),
  });
  const payload = (await response.json()) as AttachPayload;
  return { status: response.status, payload };
}

function savedNames(dir: string, questionId: string): string[] {
  const folder = path.join(dir, ".hitchhiker", "uploads", questionId);
  if (!existsSync(folder)) return [];
  return readdirSync(folder).filter((name) => name !== "manifest.json");
}

function assertInside(projectDir: string, questionId: string, storedName: string): void {
  const file = path.join(projectDir, ".hitchhiker", "uploads", questionId, storedName);
  const root = path.join(projectDir, ".hitchhiker", "uploads", questionId);
  const rel = path.relative(root, file);
  assert.equal(rel, storedName);
  assert.equal(path.isAbsolute(rel), false);
  assert.equal(rel.includes(".."), false);
  assert.equal(lstatSync(file).isSymbolicLink(), false);
}

test("a valid image is saved under the question folder and the answer lists it", async () => {
  let stored = "";
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    const sent = await postAttach(handle, "DP-1.1", token, [
      { filename: "tins.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(sent.status, 200);
    const file = sent.payload.files?.[0];
    assert.equal(file?.ok, true);
    assert.equal(file?.storedName, "tins.png");
    assert.equal(file?.originalName, "tins.png");
    assert.equal(file?.path, ".hitchhiker/uploads/DP-1.1/tins.png");
    assert.equal(file?.path?.includes("\\"), false);
    assert.equal(path.isAbsolute(file?.path ?? ""), false);
    assertInside(dir, "DP-1.1", "tins.png");
    const intake = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "brand", "logo-intake.json"), "utf8")) as {
      safeName: string;
    };
    assert.equal(intake.safeName, "DP-1.1/tins.png");

    const answer = await settleResponse(await fetch(new URL("/api/answer", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({
        questionId: "DP-1.1",
        text: "A wordmark in two colors.",
        attachments: [
          { kind: "file", path: file?.path, originalName: "../../secret.png", size: 1, type: "image/png" },
          { kind: "link", url: "javascript:alert(1)" },
          { kind: "link", url: "example.com/work" },
          { kind: "file", path: ".hitchhiker/uploads/DP-1.1/../../secret.png" },
        ],
      }),
    }));
    assert.equal(answer.status, 200);
    assert.match(stored, /A wordmark in two colors\./);
    assert.match(stored, /Attached: tins\.png\./);
    assert.match(stored, /Links: example\.com\/work/);
    assert.equal(stored.includes("javascript:"), false);
    assert.equal(stored.includes("secret.png"), false);
  }, (text) => {
    stored = text;
  });
});

test("traversal in the file name stays inside, and a bad question id writes nothing", async () => {
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    writeFileSync(path.join(dir, "x.png"), Buffer.from("sentinel"));
    const sent = await postAttach(handle, "DP-1.1", token, [
      { filename: "..\\..\\x.png", mime: "image/png", data: PNG },
      { filename: "C:\\secret\\mark.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(sent.status, 200);
    assert.equal(sent.payload.files?.[0]?.storedName, "x.png");
    assert.equal(sent.payload.files?.[1]?.storedName, "mark.png");
    assert.equal(readFileSync(path.join(dir, "x.png"), "utf8"), "sentinel");
    assertInside(dir, "DP-1.1", "x.png");
    assertInside(dir, "DP-1.1", "mark.png");

    const escaped = path.join(dir, "escaped.bin");
    writeFileSync(escaped, Buffer.from("keep"));
    const bad = await fetch(new URL("/api/attach/..%2F..%2Fescaped.bin", handle.url), {
      method: "POST",
      headers: { "content-type": "text/plain", "x-hh-csrf": token },
      body: "nope",
    });
    assert.equal(bad.status, 400);
    assert.equal(readFileSync(escaped, "utf8"), "keep");
    const nested = await postAttach(handle, encodeURIComponent("DP-1.1/../../escaped.bin"), token, [
      { filename: "ok.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(nested.status, 400);
    assert.equal(readFileSync(escaped, "utf8"), "keep");
    assert.equal(existsSync(path.join(dir, "escaped.bin.png")), false);
  });
});

test("oversize content length is 413 and a too-large part writes nothing", async () => {
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    const url = new URL("/api/attach/DP-1.1", handle.url);
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}`,
          method: "POST",
          headers: {
            host: `${url.hostname}:${url.port}`,
            "content-type": "multipart/form-data; boundary=hhboundary",
            "content-length": String(MAX_ATTACH_REQUEST_BYTES + 1),
            "x-hh-csrf": token,
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end(Buffer.from("small"));
    });
    assert.equal(status, 413);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "uploads", "DP-1.1")), false);

    const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    PNG.copy(huge);
    const sent = await postAttach(handle, "DP-1.1", token, [
      { filename: "huge.png", mime: "image/png", data: huge },
      { filename: "ok.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(sent.status, 200);
    assert.equal(sent.payload.files?.[0]?.ok, false);
    assert.match(sent.payload.files?.[0]?.error ?? "", /huge\.png is over 25 MB/);
    assert.equal(sent.payload.files?.[1]?.ok, true);
    assert.equal(savedNames(dir, "DP-1.1").includes("huge.png"), false);
    assert.equal(savedNames(dir, "DP-1.1").includes("ok.png"), true);
  });
});

test("a wrong type and a renamed executable are refused, and a mixed batch keeps the valid file", async () => {
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    const sent = await postAttach(handle, "DP-1.1", token, [
      { filename: "logo.exe", mime: "application/octet-stream", data: EXE },
      { filename: "photo.png", mime: "image/png", data: EXE },
      { filename: "mark.svg", mime: "image/svg+xml", data: SVG },
    ]);
    assert.equal(sent.status, 200);
    assert.equal(sent.payload.files?.[0]?.ok, false);
    assert.match(sent.payload.files?.[0]?.error ?? "", /logo\.exe is not a type the Guide takes/);
    assert.equal(sent.payload.files?.[1]?.ok, false);
    assert.match(sent.payload.files?.[1]?.error ?? "", /photo\.png is not a type the Guide takes/);
    assert.equal(sent.payload.files?.[2]?.ok, true);
    assert.equal(sent.payload.files?.[2]?.storedName, "mark.svg");
    assert.deepEqual(savedNames(dir, "DP-1.1"), ["mark.svg"]);
  });
});

test("a second file with the same name gets a suffix", async () => {
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    const first = await postAttach(handle, "DP-1.1", token, [
      { filename: "mark.png", mime: "image/png", data: PNG },
    ]);
    const second = await postAttach(handle, "DP-1.1", token, [
      { filename: "mark.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(first.payload.files?.[0]?.storedName, "mark.png");
    assert.equal(second.payload.files?.[0]?.storedName, "mark-2.png");
    assert.deepEqual(savedNames(dir, "DP-1.1").sort(), ["mark-2.png", "mark.png"]);
  });
});

test("a missing CSRF token is refused and nothing is written", async () => {
  await withDesk(async (handle, dir) => {
    const sent = await postAttach(handle, "DP-1.1", null, [
      { filename: "tins.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(sent.status, 403);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "uploads")), false);
  });
});

test("a symlink target is not written through", async () => {
  await withDesk(async (handle, dir) => {
    const token = tokenFrom(await (await fetch(handle.url)).text());
    const uploads = path.join(dir, ".hitchhiker", "uploads");
    const escaped = path.join(dir, "escaped-dir");
    mkdirSync(uploads, { recursive: true });
    mkdirSync(escaped, { recursive: true });
    const link = path.join(uploads, "DP-1.1");
    try {
      try {
        symlinkSync(escaped, link, "dir");
      } catch (error: unknown) {
        const code = nodeCode(error);
        if (code !== "EPERM" && code !== "ENOTSUP" && code !== "EACCES") throw error;
        symlinkSync(escaped, link, "junction");
      }
    } catch (error: unknown) {
      const code = nodeCode(error);
      assert.ok(code === "EPERM" || code === "ENOTSUP" || code === "EACCES");
      return;
    }
    const sent = await postAttach(handle, "DP-1.1", token, [
      { filename: "mark.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(sent.status, 400);
    assert.deepEqual(readdirSync(escaped), []);

    unlinkSync(link);
    mkdirSync(path.join(uploads, "DP-1.1"), { recursive: true });
    const outside = path.join(dir, "outside-target.png");
    writeFileSync(outside, Buffer.from("sentinel"));
    const fileLink = path.join(uploads, "DP-1.1", "mark.png");
    try {
      symlinkSync(outside, fileLink);
    } catch (error: unknown) {
      const code = nodeCode(error);
      assert.ok(code === "EPERM" || code === "ENOTSUP" || code === "EACCES");
      return;
    }
    const saved = await postAttach(handle, "DP-1.1", token, [
      { filename: "mark.png", mime: "image/png", data: PNG },
    ]);
    assert.equal(saved.status, 200);
    assert.equal(saved.payload.files?.[0]?.storedName, "mark-2.png");
    assert.equal(readFileSync(outside, "utf8"), "sentinel");
    assert.equal(lstatSync(path.join(uploads, "DP-1.1", "mark-2.png")).isSymbolicLink(), false);
  });
});

function nodeCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
