/**
 * BUG-029: an empty Change something stays on the approve page as HTML.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
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

function raw(
  port: number,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path: pathname, method, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const type = res.headers["content-type"];
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            type: Array.isArray(type) ? type[0] ?? "" : type ?? "",
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

test("a no-JS empty change post returns the approve page, not JSON", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-brief-029-"));
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "brief-draft") return { value: sample(), raw: "{}", durationMs: 0, cassette: "live" };
    throw new Error(req.task);
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
    const empty = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=change&correction=`,
    );
    assert.equal(empty.status, 400);
    assert.match(empty.type, /text\/html/);
    assert.match(empty.body, /<h1[^>]*>Site Brief<\/h1>/);
    assert.match(empty.body, /data-change-error/);
    assert.match(empty.body, /Write the change\./);
    assert.doesNotMatch(empty.body.trim(), /^\{/);
    const spaces = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=change&correction=${encodeURIComponent("  \n  ")}`,
    );
    assert.equal(spaces.status, 400);
    assert.match(spaces.type, /text\/html/);
    assert.match(spaces.body, /Write the change\./);
    const api = await raw(
      handle.port,
      "POST",
      "/api/brief/change",
      { "content-type": "application/json", "x-hh-csrf": token },
      JSON.stringify({ correction: "   " }),
    );
    assert.equal(api.status, 400);
    assert.match(api.type, /application\/json/);
    assert.match(api.body, /Write the change\./);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
