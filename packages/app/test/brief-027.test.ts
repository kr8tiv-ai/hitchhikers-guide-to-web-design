/**
 * BUG-027: a finished interview can draft, review, and approve the Site Brief.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadQueue, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const LINE = "The site helps a visitor book a visit.";

function sample(): Record<string, string> {
  return {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    coverage: LINE,
  };
}

function seedFinished(dir: string): void {
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, "interview", "tree.yaml"),
    `questions:
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`,
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify([{ id: "DP-2.1", status: "ANSWERED", value: LINE }]),
  );
}

function raw(
  port: number,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string; location: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            location: String(res.headers.location ?? ""),
          });
        });
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

test("draft, review, approve, and a second approve stays one build", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-desk-"));
  seedFinished(dir);
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = true;
  const seen: string[] = [];
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    seen.push(req.task);
    if (req.task === "brief-draft") {
      assert.match(req.input, /## Context packet/);
      assert.match(req.input, /Purpose: brief/);
      if (held) await gate;
      return { value: sample(), raw: "{}", durationMs: 0, cassette: "live" };
    }
    throw new Error(req.task);
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const home = await raw(handle.port, "GET", "/");
    assert.equal(home.status, 200);
    assert.match(home.body, /Draft the Site Brief/);
    assert.match(home.body, /data-brief-auto="once"/);
    assert.doesNotMatch(home.body, /Nothing is waiting for a yes/);
    const token = tokenFrom(home.body);
    const started = Date.now();
    const draft = await raw(handle.port, "POST", "/api/brief/draft", {
      "content-type": "application/json",
      "x-hh-csrf": token,
    }, "{}");
    assert.ok(Date.now() - started < 1000);
    assert.equal(draft.status, 200);
    assert.match(draft.body, /"status":"drafting"/);
    const during = await raw(handle.port, "GET", "/");
    assert.equal(during.status, 200);
    assert.ok(Date.now() - started < 1000);
    const status = await raw(handle.port, "GET", "/api/brief");
    assert.equal(status.status, 200);
    assert.match(status.body, /"status":"drafting"/);
    release();
    let pending = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/api/brief");
      pending = next.body;
      if (pending.includes('"status":"pending"')) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(pending, /"status":"pending"/);
    const approve = await raw(handle.port, "GET", "/approve");
    assert.equal(approve.status, 200);
    assert.match(approve.body, /<h2>Goal<\/h2>/);
    assert.match(approve.body, /The site helps a visitor book a visit/);
    assert.match(approve.body, />Approve</);
    assert.match(approve.body, />Change something</);
    assert.doesNotMatch(approve.body, /Nothing is waiting for a yes/);
    const back = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=change&correction=DP-2.1`,
    );
    assert.equal(back.status, 303);
    assert.equal(back.location, "/");
    const yes = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(yes.status, 303);
    assert.equal(yes.location, "/approve");
    const after = await raw(handle.port, "GET", "/approve");
    assert.match(after.body, /The build is started/);
    assert.match(after.body, />Approve</);
    const brand = await raw(handle.port, "GET", "/brand");
    assert.match(brand.body, /Babel Fish/);
    assert.match(brand.body, /The site helps a visitor book a visit/);
    assert.match(brand.body, /href="\/hh-dashboard"/);
    assert.match(brand.body, /href="\/approve"/);
    const drive = await raw(handle.port, "GET", "/hh-dashboard");
    assert.match(drive.body, /Improbability Drive/);
    assert.match(drive.body, /Babel Fish/);
    assert.match(drive.body, /data-id="001"/);
    assert.doesNotMatch(drive.body, /data-id="guide-entry"/);
    assert.match(drive.body, /The site helps a visitor book a visit/);
    const again = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(again.status, 303);
    const queue = await loadQueue(dir);
    assert.ok((queue?.items.length ?? 0) > 1);
    assert.equal(queue?.items[0]?.id, "001");
    assert.equal(queue?.items[0]?.status, "queued");
    assert.equal(seen.filter((task) => task === "brief-draft").length, 1);
  } finally {
    release();
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
