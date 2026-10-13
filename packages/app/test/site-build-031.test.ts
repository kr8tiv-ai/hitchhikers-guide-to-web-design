/**
 * BUG-031: approving the brief starts one runner. A failed stub surfaces Retry.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadQueue, siteBuildSettled, type BuildSpawn, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
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
    pages: LINE,
    features: LINE,
    coverage: LINE,
  };
}

function seed(dir: string): void {
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
}

function raw(
  port: number,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
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

function guideThink(): (req: ThinkRequest<unknown>) => Promise<ThinkResult<unknown>> {
  return async (req) => {
    if (req.task === "brief-draft" || req.task === "brief-revise") {
      return { value: sample(), raw: "{}", durationMs: 0, cassette: "live" };
    }
    throw new Error(req.task);
  };
}

test("approve starts one build and the drive shows model, effort, and files", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-build-"));
  seed(dir);
  let calls = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const buildSpawn: BuildSpawn = (request) => {
    calls += 1;
    assert.ok(request.args.includes("grok-4.7-build-fast"));
    assert.ok(request.args.includes("xhigh"));
    request.onOutput?.("Writing the home page");
    if (request.promptId === "001") {
      return {
        pid: 424242,
        done: gate.then(() => {
          writeFileSync(path.join(dir, "index.html"), "<p>Home</p>\n", "utf8");
          return { code: 0, stdout: "", stderr: "", errorCode: null };
        }),
      };
    }
    return { pid: 424242, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink() as never, buildSpawn });
    const home = await raw(handle.port, "GET", "/approve");
    const token = tokenFrom(home.body);
    const yes = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(yes.status, 303);
    let progress = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/api/drive/progress");
      progress = next.body;
      if (progress.includes('"status":"running"')) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.match(progress, /grok-4\.7-build-fast/);
    assert.match(progress, /xhigh/);
    assert.match(progress, /Writing the home page/);
    assert.equal(calls, 1);
    const again = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(again.status, 303);
    assert.equal(calls, 1);
    const listed = await raw(handle.port, "GET", "/api/drive");
    const queue = JSON.parse(listed.body) as { items: unknown[] };
    assert.deepEqual(Object.keys(queue).sort(), ["items"]);
    const page = await raw(handle.port, "GET", "/hh-dashboard");
    assert.match(page.body, /data-build-model="grok-4\.7-build-fast"/);
    assert.match(page.body, /data-build-effort="xhigh"/);
    assert.equal(page.body.includes("Model, effort, and duration are not on the queue."), false);
    assert.equal(page.body.replace("<!DOCTYPE html>", "").includes("!"), false);
    release();
    await siteBuildSettled(dir);
    assert.equal(existsSync(path.join(dir, "index.html")), true);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    release();
    await siteBuildSettled(dir);
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failing stub shows the failure and Retry starts the same prompt again", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-build-fail-"));
  seed(dir);
  let calls = 0;
  const buildSpawn: BuildSpawn = (request) => {
    calls += 1;
    if (calls === 1) {
      return { pid: 424242, done: Promise.resolve({ code: 1, stdout: "", stderr: "usage limit", errorCode: null }) };
    }
    if (request.promptId === "001") {
      writeFileSync(path.join(dir, "index.html"), "<p>Home</p>\n", "utf8");
    }
    return { pid: 424242, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink() as never, buildSpawn });
    const home = await raw(handle.port, "GET", "/approve");
    const token = tokenFrom(home.body);
    const yes = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(yes.status, 303);
    let page = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/hh-dashboard");
      page = next.body;
      if (page.includes('data-status="failed"')) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.match(page, /data-status="failed"/);
    assert.match(page, /data-action="retry"/);
    assert.match(page, /usage limit/);
    assert.equal(page.replace("<!DOCTYPE html>", "").includes("!"), false);
    const retry = await raw(
      handle.port,
      "POST",
      "/api/drive/retry",
      { "content-type": "application/json", "x-hh-csrf": tokenFrom(page) },
      JSON.stringify({ id: "001" }),
    );
    assert.equal(retry.status, 200);
    await siteBuildSettled(dir);
    assert.ok(calls > 1);
    assert.equal(readFileSync(path.join(dir, "index.html"), "utf8").includes("Home"), true);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
  } finally {
    await siteBuildSettled(dir);
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
