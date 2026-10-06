import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import {
  MAX_UPLOAD_BYTES,
  acceptAudio,
  acceptUpload,
  contentLengthExceeds,
} from "../src/server/uploads.ts";

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-upload-"));
}

async function withDesk(
  run: (handle: ServerHandle, dir: string) => Promise<void>,
): Promise<void> {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir });
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

function multipart(filename: string, mime: string, data: Buffer): { body: Buffer; type: string } {
  const boundary = "hhboundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, data, tail]),
    type: `multipart/form-data; boundary=${boundary}`,
  };
}

test("acceptUpload sanitizes a path and rejects the blocked list", () => {
  const saved = acceptUpload({ filename: "../../x.png", mime: "image/png", bytes: 12 });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.match(saved.safeName, /^hh-[0-9a-f]{8}-x\.png$/);
  assert.equal(saved.safeName.includes(".."), false);
  assert.equal(saved.safeName.includes("/"), false);
  assert.equal(saved.safeName.includes("\\"), false);

  const windows = acceptUpload({ filename: "..\\..\\shot.jpg", mime: "image/jpeg", bytes: 8 });
  assert.equal(windows.ok, true);
  if (windows.ok) assert.match(windows.safeName, /^hh-[0-9a-f]{8}-shot\.jpg$/);

  const exe = acceptUpload({ filename: "tool.exe", mime: "application/octet-stream", bytes: 4 });
  assert.deepEqual(exe, { ok: false, reason: "File type is not allowed." });
  const disguised = acceptUpload({ filename: "x.exe.png", mime: "image/png", bytes: 4 });
  assert.equal(disguised.ok, false);

  assert.equal(acceptUpload({ filename: "a.png", mime: "image/png", bytes: 0 }).ok, false);
  assert.equal(
    acceptUpload({ filename: "a.png", mime: "image/png", bytes: MAX_UPLOAD_BYTES + 1 }).ok,
    false,
  );
  assert.equal(acceptUpload({ filename: "a.png", mime: "image/png", bytes: MAX_UPLOAD_BYTES }).ok, true);
  assert.equal(acceptUpload({ filename: "a.png", mime: "image/gif", bytes: 4 }).ok, false);
  assert.equal(acceptUpload({ filename: "a.png", mime: "", bytes: 4 }).ok, true);
  assert.equal(contentLengthExceeds(String(MAX_UPLOAD_BYTES + 1), MAX_UPLOAD_BYTES), true);
  assert.equal(contentLengthExceeds(String(MAX_UPLOAD_BYTES), MAX_UPLOAD_BYTES), false);

  const audio = acceptAudio({ filename: "note.png", mime: "image/png", bytes: 4 });
  assert.equal(audio.ok, false);
  const wav = acceptAudio({ filename: "note.wav", mime: "audio/wav", bytes: 4 });
  assert.equal(wav.ok, true);
});

test("a 26 MB upload is refused before the body is buffered", { timeout: 10_000 }, async () => {
  await withDesk(async (handle) => {
    const page = await fetch(handle.url);
    const token = tokenFrom(await page.text());
    const declared = 26 * 1024 * 1024;
    const started = Date.now();
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: handle.port,
          path: "/api/upload",
          method: "POST",
          headers: {
            host: `127.0.0.1:${handle.port}`,
            "content-type": "multipart/form-data; boundary=hh",
            "content-length": String(declared),
            "x-hh-csrf": token,
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", () => resolve(413));
      req.write(Buffer.alloc(1024, 1));
      req.on("error", reject);
    });
    assert.equal(status, 413);
    assert.ok(Date.now() - started < 2_000);
  });
});

test("an exe is rejected and a traversal name is stored under uploads", async () => {
  await withDesk(async (handle, dir) => {
    const page = await fetch(handle.url);
    const token = tokenFrom(await page.text());
    const exe = multipart("tool.exe", "application/octet-stream", Buffer.from("MZ"));
    const denied = await fetch(new URL("/api/upload", handle.url), {
      method: "POST",
      headers: {
        "content-type": exe.type,
        "x-hh-csrf": token,
      },
      body: new Uint8Array(exe.body),
    });
    assert.equal(denied.status, 415);
    assert.match(await denied.text(), /not allowed/);

    const marker = "HHSVGTOKEN";
    const svg = multipart("../../mark.svg", "image/svg+xml", Buffer.from(`<svg>${marker}</svg>`));
    const saved = await fetch(new URL("/api/upload", handle.url), {
      method: "POST",
      headers: {
        "content-type": svg.type,
        "x-hh-csrf": token,
      },
      body: new Uint8Array(svg.body),
    });
    assert.equal(saved.status, 201);
    assert.match(saved.headers.get("content-type") ?? "", /^application\/json/);
    const payload = (await saved.json()) as { ok: boolean; safeName: string };
    assert.equal(payload.ok, true);
    assert.match(payload.safeName, /^hh-[0-9a-f]{8}-mark\.svg$/);
    const folder = path.join(dir, ".hitchhiker", "uploads");
    const names = readdirSync(folder);
    assert.deepEqual(names, [payload.safeName]);
    assert.match(readFileSync(path.join(folder, payload.safeName), "utf8"), new RegExp(marker));

    const fetched = await fetch(new URL(`/.hitchhiker/uploads/${payload.safeName}`, handle.url));
    const body = await fetched.text();
    assert.equal(fetched.status, 404);
    assert.equal((fetched.headers.get("content-type") ?? "").includes("image/svg+xml"), false);
    assert.equal(body.includes(marker), false);
    assert.equal(body.includes("<svg"), false);
  });
});

test("push-to-talk audio is stored and not returned inline", async () => {
  await withDesk(async (handle, dir) => {
    const page = await fetch(handle.url);
    const token = tokenFrom(await page.text());
    const bytes = Buffer.from("RIFF....WAVEfmt ");
    const saved = await fetch(new URL("/api/audio", handle.url), {
      method: "POST",
      headers: {
        "content-type": "audio/wav",
        "x-hh-csrf": token,
        "x-hh-filename": "take.wav",
      },
      body: new Uint8Array(bytes),
    });
    assert.equal(saved.status, 201);
    const payload = (await saved.json()) as { stored: boolean; safeName: string };
    assert.equal(payload.stored, true);
    assert.match(payload.safeName, /^hh-[0-9a-f]{8}-take\.wav$/);
    const onDisk = readFileSync(path.join(dir, ".hitchhiker", "uploads", payload.safeName));
    assert.deepEqual(onDisk, bytes);
    const gone = await fetch(new URL(`/api/audio/${payload.safeName}`, handle.url));
    assert.equal(gone.status, 404);
  });
});

test("upload without a token is refused", async () => {
  await withDesk(async (handle) => {
    const png = multipart("a.png", "image/png", Buffer.from([1, 2, 3, 4]));
    const denied = await fetch(new URL("/api/upload", handle.url), {
      method: "POST",
      headers: { "content-type": png.type },
      body: new Uint8Array(png.body),
    });
    assert.equal(denied.status, 403);
  });
});
