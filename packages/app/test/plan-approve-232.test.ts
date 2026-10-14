/**
 * BUG-041: /approve shows the coverage table and refuses a plan that drops a page.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const LINE = "The site helps a visitor book a visit.";

function seed(dir: string, pages: string, prompt: string | null): void {
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
    pages,
    features: LINE,
    coverage: LINE,
  };
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({ status: "pending", draft, buildStarted: false, error: "" })}\n`,
  );
  if (prompt !== null) {
    const prompts = path.join(dir, ".hitchhiker", "prompts");
    mkdirSync(prompts, { recursive: true });
    writeFileSync(path.join(prompts, "001.md"), prompt, "utf8");
  }
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

test("an uncovered page disables Approve and the server names it", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-approve-232-"));
  const home = "---\nid: 001\ntitle: Add the Home route.\n---\n\nRequirements: REQ-PAGE-home\n";
  seed(dir, "Pages: Home; Eco-Building and Food; About.", home);
  const file = path.join(dir, ".hitchhiker", "prompts", "001.md");
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const page = await raw(handle.port, "GET", "/approve");
    assert.equal(page.status, 200);
    assert.match(page.body, /data-plan-coverage/);
    assert.match(page.body, /Plan coverage/);
    assert.match(page.body, /data-coverage-id="REQ-PAGE-eco-building-and-food" data-covered="no"/);
    assert.match(page.body, /Approve stays off until every row is covered/);
    assert.match(page.body, /value="approve" disabled/);
    const token = tokenFrom(page.body);
    const refused = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(refused.status, 422);
    assert.match(refused.body, /Eco-Building and Food/);
    assert.match(refused.body, /These requirements have no build task/);
    assert.equal(readFileSync(file, "utf8"), home);
    const drive = await raw(handle.port, "GET", "/hh-dashboard");
    assert.equal(drive.status, 200);
    assert.match(drive.body, /data-plan-gap/);
    assert.match(drive.body, /Eco-Building and Food/);
    assert.equal(readFileSync(file, "utf8"), home);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a complete plan is accepted and Approve stays on", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-approve-232-ok-"));
  seed(dir, "Pages: Home.", null);
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const page = await raw(handle.port, "GET", "/approve");
    assert.equal(page.status, 200);
    assert.match(page.body, /data-plan-coverage/);
    assert.match(page.body, /data-coverage-id="REQ-PAGE-home" data-covered="yes"/);
    assert.doesNotMatch(page.body, /data-covered="no"/);
    assert.match(page.body, /value="approve">Approve</);
    const token = tokenFrom(page.body);
    const accepted = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(accepted.status, 303);
    const written = readFileSync(path.join(dir, ".hitchhiker", "prompts", "012.md"), "utf8");
    assert.match(written, /Add the Home route/);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
