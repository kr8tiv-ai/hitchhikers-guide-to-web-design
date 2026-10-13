/**
 * BUG-004. A Logo file upload is on the DP-1.1 call, by its original filename.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x11, 0x22]);

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function questionId(html: string): string {
  const matched = /data-question-id="([^"]+)"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function multipart(filename: string, mime: string, data: Buffer): { body: Buffer; type: string } {
  const boundary = "hhboundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return { body: Buffer.concat([head, data, tail]), type: `multipart/form-data; boundary=${boundary}` };
}

test("a Logo file upload is named on the DP-1.1 call and survives reload", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-211-route-"));
  const seen: string[] = [];
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      guideThink: async (req: ThinkRequest<unknown>) => {
        seen.push(`${req.task}\n${String(req.input)}`);
        if (req.task === "pushback-judge") {
          return hit({
            vague: true,
            quote: "Neither",
            sharperChoice: "Header logo is paradise-found-hero.jpg and favicon is paradise-found-mark.png?",
          });
        }
        return hit({
          message: "What is one concrete detail this page should keep?",
          explanationLevel: "beginner",
          joke: false,
        });
      },
    });
    const first = await (await fetch(handle.url)).text();
    const token = tokenFrom(first);
    const part = multipart("paradise-found-logo.png", "image/png", PNG);
    const uploaded = await fetch(new URL("/api/upload", handle.url), {
      method: "POST",
      headers: { "content-type": part.type, "x-hh-csrf": token, "x-hh-question": "DP-0.4" },
      body: new Uint8Array(part.body),
    });
    const payload = (await uploaded.json()) as { ok?: boolean; originalName?: string };
    assert.equal(uploaded.status, 201);
    assert.equal(payload.ok, true);
    assert.equal(payload.originalName, "paradise-found-logo.png");

    const hero = multipart("paradise-found-hero.jpg", "image/jpeg", PNG);
    const attached = await fetch(new URL("/api/attach/DP-0.4", handle.url), {
      method: "POST",
      headers: { "content-type": hero.type, "x-hh-csrf": token },
      body: new Uint8Array(hero.body),
    });
    assert.equal(attached.status, 200);

    let html = "";
    for (let step = 0; step < 12; step += 1) {
      html = await (await fetch(handle.url)).text();
      const id = questionId(html);
      if (id === "DP-1.1") break;
      const skipped = await fetch(new URL("/api/skip", handle.url), {
        method: "POST",
        headers: { "content-type": "application/json", "x-hh-csrf": token },
        body: JSON.stringify({ questionId: id }),
      });
      assert.equal(skipped.status, 200);
    }
    assert.equal(questionId(html), "DP-1.1");
    assert.match(html, /Saved as paradise-found-logo\.png/);
    assert.match(html, /Using the logo you gave earlier \(paradise-found-logo\.png\)/);
    assert.equal(html.includes("Header logo is paradise-found-hero.jpg"), false);

    const session = (await (await fetch(new URL("/api/session", handle.url))).json()) as {
      question?: { id?: string; ask?: string };
      logoFile?: { originalName?: string };
    };
    assert.equal(session.question?.id, "DP-1.1");
    assert.match(session.question?.ask ?? "", /paradise-found-logo\.png/);
    assert.equal(session.logoFile?.originalName, "paradise-found-logo.png");

    const prompt = seen.find((item) => item.startsWith("guide-message") && item.includes("DP-1.1"));
    assert.ok(prompt, "DP-1.1 guide call");
    assert.match(prompt, /paradise-found-logo\.png/);
    assert.match(prompt, /role logo/);

    const answered = await fetch(new URL("/api/answer", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({
        questionId: "DP-1.1",
        text: "Neither. Use paradise-found-logo.png, the full logo I put in the Logo file slot.",
      }),
    });
    assert.equal(answered.status, 200);
    const body = (await answered.json()) as { session?: { question?: { id?: string; ask?: string } } };
    assert.notEqual(body.session?.question?.id, "DP-1.1");
    assert.equal((body.session?.question?.ask ?? "").includes("paradise-found-hero.jpg"), false);
    const judge = seen.find((item) => item.startsWith("pushback-judge") && item.includes("DP-1.1"));
    assert.ok(judge);
    assert.match(judge, /paradise-found-logo\.png/);
    assert.match(judge, /role logo/);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
