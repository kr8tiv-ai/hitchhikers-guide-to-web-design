/**
 * BUG-028: a failed brief draft stays on the page with the recorded fields and Retry.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { syncAnswer, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const GOAL = "Help a visitor book a private tour.";
const PAGES = "Home, work, and visit.";

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

test("a max-turns draft keeps the fields and Retry stays on the brief", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-brief-028-"));
  let calls = 0;
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls += 1;
    if (req.task !== "brief-draft") throw new Error(req.task);
    throw new Error("max turns reached");
  };
  let handle: ServerHandle | undefined;
  try {
    await syncAnswer(dir, { questionId: "DP-2.1", text: GOAL, source: "answer", moveCursor: false, summarize: false });
    await syncAnswer(dir, { questionId: "DP-2.8", text: PAGES, source: "answer", moveCursor: false, summarize: false });
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const home = await raw(handle.port, "GET", "/");
    const token = tokenFrom(home.body);
    const started = await raw(
      handle.port,
      "POST",
      "/api/brief/draft",
      { "content-type": "application/json", "x-hh-csrf": token },
      "{}",
    );
    assert.equal(started.status, 200);
    let pending = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/api/brief");
      pending = next.body;
      if (pending.includes('"status":"pending"')) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.match(pending, /"status":"pending"/);
    assert.match(pending, /private tour/);
    assert.equal(calls, 2);
    const page = await raw(handle.port, "GET", "/approve");
    assert.equal(page.status, 200);
    assert.match(page.body, /data-brief-error/);
    assert.match(page.body, /Use Retry to ask again/);
    assert.match(page.body, />Retry</);
    assert.match(page.body, /<h2>Pages<\/h2>/);
    assert.match(page.body, /Home, work, and visit/);
    assert.match(page.body, /private tour/);
    assert.doesNotMatch(page.body.replace("<!DOCTYPE html>", ""), /!/);
    const retry = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=retry`,
    );
    assert.equal(retry.status, 303);
    assert.equal(retry.location, "/approve");
    let after = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/api/brief");
      after = next.body;
      if (after.includes('"status":"pending"') && calls >= 4) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(calls, 4);
    const shown = await raw(handle.port, "GET", "/approve");
    assert.match(shown.body, /data-brief-error/);
    assert.match(shown.body, /private tour/);
    assert.match(shown.body, /Home, work, and visit/);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
