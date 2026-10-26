import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  InstallCancelled,
  checksumMessage,
  downloadVerifiedFile,
  type DownloadRequester,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const HUGGING = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const GITHUB = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip";

function response(status: number, headers: Record<string, string>, body: Buffer | null): IncomingMessage {
  const message = new EventEmitter() as IncomingMessage;
  message.statusCode = status;
  message.headers = headers;
  message.resume = () => message;
  message.destroy = () => {
    message.emit("close");
    return message;
  };
  if (body !== null) {
    setImmediate(() => {
      message.emit("data", body);
      message.emit("end");
    });
  }
  return message;
}

function sha(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

test("a redirect stays on the source list, strips userinfo, and rejects http", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-dl-"));
  const dest = path.join(dir, "model.bin");
  const seen: URL[] = [];
  const body = Buffer.from("model-bytes");
  const request: DownloadRequester = (target) => {
    seen.push(target);
    if (seen.length === 1) {
      return Promise.resolve(response(302, { location: "https://user:pass@us.aws.cdn.hf.co/signed/model.bin" }, null));
    }
    return Promise.resolve(response(200, { "content-length": String(body.length) }, body));
  };
  try {
    const result = await downloadVerifiedFile(HUGGING, dest, {
      signal: new AbortController().signal,
      expectedSha256: sha("model-bytes"),
      expectedBytes: body.length,
      request,
      freeBytes: async () => 10_000_000,
    });
    assert.equal(result.finalHost, "us.aws.cdn.hf.co");
    assert.deepEqual(result.hops, ["huggingface.co", "us.aws.cdn.hf.co"]);
    assert.equal(seen[1]?.username, "");
    assert.equal(seen[1]?.password, "");
    assert.equal(readFileSync(dest, "utf8"), "model-bytes");
    assert.equal(existsSync(`${dest}.partial`), false);
  } finally {
    await removeTempDir(dir);
  }

  const blocked = await mkdtemp(path.join(os.tmpdir(), "hh-dl-"));
  try {
    const httpHop: DownloadRequester = (target) => {
      if (target.hostname === "huggingface.co") {
        return Promise.resolve(response(302, { location: "http://us.aws.cdn.hf.co/file" }, null));
      }
      throw new Error("http hop was requested");
    };
    await assert.rejects(
      () => downloadVerifiedFile(HUGGING, path.join(blocked, "x.bin"), {
        signal: new AbortController().signal,
        request: httpHop,
        freeBytes: async () => 10_000_000,
      }),
      /https/,
    );
    const unknown: DownloadRequester = () => Promise.resolve(response(302, { location: "https://evilhf.co/file" }, null));
    await assert.rejects(
      () => downloadVerifiedFile(HUGGING, path.join(blocked, "y.bin"), {
        signal: new AbortController().signal,
        request: unknown,
        freeBytes: async () => 10_000_000,
      }),
      /evilhf\.co/,
    );
    const crossed: DownloadRequester = () => Promise.resolve(response(302, { location: "https://us.aws.cdn.hf.co/file" }, null));
    await assert.rejects(
      () => downloadVerifiedFile(GITHUB, path.join(blocked, "z.bin"), {
        signal: new AbortController().signal,
        request: crossed,
        freeBytes: async () => 10_000_000,
      }),
      /us\.aws\.cdn\.hf\.co/,
    );
  } finally {
    await removeTempDir(blocked);
  }
});

test("a dropped connection resumes with Range and a checksum mismatch deletes the file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-dl-resume-"));
  const dest = path.join(dir, "model.bin");
  const partial = `${dest}.partial`;
  await writeFile(partial, "model");
  const rest = Buffer.from("-bytes");
  let ranged = false;
  let calls = 0;
  const request: DownloadRequester = (_target, headers) => {
    calls += 1;
    if (calls === 1) {
      const error = new Error("reset") as NodeJS.ErrnoException;
      error.code = "ECONNRESET";
      return Promise.reject(error);
    }
    if (headers.range === "bytes=5-") ranged = true;
    return Promise.resolve(response(206, { "content-range": "bytes 5-10/11" }, rest));
  };
  try {
    const result = await downloadVerifiedFile(HUGGING, dest, {
      signal: new AbortController().signal,
      expectedSha256: sha("model-bytes"),
      expectedBytes: 11,
      request,
      delay: async () => {},
      freeBytes: async () => 10_000_000,
    });
    assert.equal(ranged, true);
    assert.equal(result.bytes, 11);
    assert.equal(readFileSync(dest, "utf8"), "model-bytes");

    const badDest = path.join(dir, "bad.bin");
    await writeFile(badDest, "stale");
    const wrong = "ab".repeat(32);
    const once: DownloadRequester = () => Promise.resolve(response(200, {}, Buffer.from("nope")));
    await assert.rejects(
      () => downloadVerifiedFile(HUGGING, badDest, {
        signal: new AbortController().signal,
        expectedSha256: wrong,
        expectedBytes: 4,
        request: once,
        freeBytes: async () => 10_000_000,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, new RegExp(`Expected ${wrong}`));
        assert.match(error.message, /Actual [0-9a-f]{64}/);
        assert.match(error.message, /Nothing was installed/);
        return true;
      },
    );
    assert.equal(existsSync(badDest), false);
    assert.equal(existsSync(`${badDest}.partial`), false);
    assert.match(checksumMessage(wrong, "cd".repeat(32)), /Expected/);
  } finally {
    await removeTempDir(dir);
  }
});

test("low disk, offline, and cancel leave no partial file", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-dl-stop-"));
  const dest = path.join(dir, "model.bin");
  try {
    let requested = false;
    await assert.rejects(
      () => downloadVerifiedFile(HUGGING, dest, {
        signal: new AbortController().signal,
        expectedBytes: 5_000_000,
        freeBytes: async () => 100,
        request: () => {
          requested = true;
          return Promise.reject(new Error("should not request"));
        },
      }),
      /free space/,
    );
    assert.equal(requested, false);
    assert.equal(existsSync(`${dest}.partial`), false);

    const offline = new Error("lookup") as NodeJS.ErrnoException;
    offline.code = "ENOTFOUND";
    await assert.rejects(
      () => downloadVerifiedFile(HUGGING, dest, {
        signal: new AbortController().signal,
        request: () => Promise.reject(offline),
        delay: async () => {},
        freeBytes: async () => 10_000_000,
      }),
      /could not reach the server/,
    );
    assert.equal(existsSync(`${dest}.partial`), false);

    const controller = new AbortController();
    const hanging: DownloadRequester = () => {
      const message = response(200, { "content-length": "4" }, null);
      setImmediate(() => controller.abort());
      return Promise.resolve(message);
    };
    await assert.rejects(
      () => downloadVerifiedFile(HUGGING, dest, {
        signal: controller.signal,
        expectedBytes: 4,
        request: hanging,
        freeBytes: async () => 10_000_000,
      }),
      (error: unknown) => error instanceof InstallCancelled,
    );
    assert.equal(existsSync(`${dest}.partial`), false);
    assert.equal(existsSync(dest), false);
  } finally {
    await removeTempDir(dir);
  }
});
