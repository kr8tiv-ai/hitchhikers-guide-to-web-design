/**
 * BUG-030: two change posts share one revise, and the desk answers while it runs.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadDecisions, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const LINE = "The site helps a visitor book a visit.";
const NEXT = "The site helps a visitor book a tour.";

function sample(goal = LINE): Record<string, string> {
  return {
    goal,
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

test("two change requests start one revise and return while it is still running", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-brief-030-"));
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let revises = 0;
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "brief-draft") {
      return { value: sample(), raw: "{}", durationMs: 0, cassette: "live" };
    }
    if (req.task !== "brief-revise") throw new Error(req.task);
    revises += 1;
    await gate;
    return { value: sample(NEXT), raw: "{}", durationMs: 0, cassette: "live" };
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const home = await raw(handle.port, "GET", "/");
    const token = tokenFrom(home.body);
    await raw(handle.port, "POST", "/api/brief/draft", { "content-type": "application/json", "x-hh-csrf": token }, "{}");
    let pending = false;
    for (let attempt = 0; attempt < 40 && !pending; attempt += 1) {
      const next = await raw(handle.port, "GET", "/api/brief");
      pending = next.body.includes('"status":"pending"');
      if (!pending) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(pending, true);
    const started = Date.now();
    const headers = { "content-type": "application/json", "x-hh-csrf": token };
    const body = JSON.stringify({ correction: "The goal should name a tour." });
    const [first, second] = await Promise.all([
      raw(handle.port, "POST", "/api/brief/change", headers, body),
      raw(handle.port, "POST", "/api/brief/change", headers, body),
    ]);
    assert.ok(Date.now() - started < 1000);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.match(first.body, /"status":"revising"/);
    assert.equal(revises, 1);
    release();
    let updated = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/api/brief");
      updated = next.body;
      if (updated.includes(NEXT)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.match(updated, /book a tour/);
    assert.equal(revises, 1);
    let stored = false;
    for (let attempt = 0; attempt < 40 && !stored; attempt += 1) {
      stored = loadDecisions(dir).some((item) => item.questionId === "DP-2.1" && item.source === "brief-correction");
      if (!stored) await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(stored, true);
  } finally {
    release();
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
