/**
 * BUG-078. /approve shows the direction picker beside the brand kit.
 * Approve plan still posts the same action. The model is stubbed.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const LINE = "The site helps a visitor book a visit.";

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
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify([{ id: "DP-2.1", status: "ANSWERED", value: LINE }]),
  );
  const draft: Record<string, string> = {
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
    pages: "Pages: Home.",
    features: LINE,
    coverage: LINE,
  };
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({ status: "pending", draft, buildStarted: false, error: "" })}\n`,
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

const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
  throw new Error(req.task);
};

test("Approvals shows a direction picker beside the brand kit and Approve plan still posts", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-approve-243e-"));
  seed(dir);
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const home = await raw(handle.port, "GET", "/approve");
    assert.equal(home.status, 200);
    const token = tokenFrom(home.body);
    const drafted = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(drafted.status, 303);
    const page = await raw(handle.port, "GET", "/approve");
    assert.equal(page.status, 200);
    const html = page.body;
    const kitAt = html.indexOf("data-brand-kit");
    const pickAt = html.indexOf("data-direction-desk");
    const approveAt = html.indexOf("Approve plan");
    assert.ok(kitAt >= 0);
    assert.ok(pickAt > kitAt);
    assert.ok(approveAt > pickAt);
    assert.match(html, /data-pick-direction="/);
    assert.match(html, /\/client\/direction\.js/);
    assert.match(html, /value="approve">Approve plan</);
    assert.equal(html.includes('value="approve" disabled'), false);
    const button = /data-pick-direction="([^"]+)">([^<]+)</.exec(html);
    assert.ok(button?.[1]);
    assert.ok(button[2]);
    const name = button[2];
    const picked = await raw(
      handle.port,
      "POST",
      "/api/direction",
      { "content-type": "application/json", "x-hh-csrf": token },
      JSON.stringify({ id: button[1], reason: "The quieter page fits the brief." }),
    );
    assert.equal(picked.status, 200);
    const after = await raw(handle.port, "GET", "/approve");
    const pre = /<section data-brand-kit>[\s\S]*?<pre>([\s\S]*?)<\/pre>/.exec(after.body)?.[1] ?? "";
    assert.match(pre, new RegExp(`Picked ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(after.body, /value="approve">Approve plan</);
    assert.equal(after.body.includes('value="approve" disabled'), false);
    const planned = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(planned.status, 303);
    const stages = await raw(handle.port, "GET", "/approve");
    assert.match(stages.body, /data-design-stage="sitemap"/);
  } finally {
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
