/**
 * BUG-039: plan approval refuses an uncovered requirement and accepts a complete plan.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

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
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
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

test("plan approval names uncovered requirements and accepts a complete plan", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-plan-coverage-"));
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      guideThink: (() => {
        throw new Error("plan approval must not call a model");
      }) as never,
    });
    const page = await raw(handle.port, "GET", "/approve");
    assert.equal(page.status, 200);
    const headers = {
      "content-type": "application/json",
      "x-hh-csrf": tokenFrom(page.body),
    };
    const missing = await raw(
      handle.port,
      "POST",
      "/api/plan/approve",
      headers,
      JSON.stringify({
        requirements: [
          { id: "REQ-PAGE-home", label: "Home at /" },
          { id: "REQ-FEAT-map", label: "map" },
        ],
        tasks: [{ requirements: ["REQ-PAGE-home"] }],
      }),
    );
    assert.equal(missing.status, 422);
    const refused = JSON.parse(missing.body) as { ok?: boolean; error?: string; uncovered?: Array<{ id: string; label: string }> };
    assert.equal(refused.ok, false);
    assert.match(refused.error ?? "", /These requirements have no build task: map \(REQ-FEAT-map\)/);
    assert.deepEqual(refused.uncovered, [{ id: "REQ-FEAT-map", label: "map" }]);

    const complete = await raw(
      handle.port,
      "POST",
      "/api/plan/approve",
      headers,
      JSON.stringify({
        requirements: [
          { id: "REQ-PAGE-home", label: "Home at /" },
          { id: "REQ-FEAT-map", label: "map" },
        ],
        tasks: [{ requirements: ["REQ-PAGE-home"] }, { requirements: ["REQ-FEAT-map"] }],
      }),
    );
    assert.equal(complete.status, 200);
    const accepted = JSON.parse(complete.body) as { ok?: boolean };
    assert.equal(accepted.ok, true);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
