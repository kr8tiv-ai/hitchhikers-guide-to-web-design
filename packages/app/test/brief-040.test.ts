/**
 * BUG-040: a fallback brief stays labelled after Change something,
 * and Approve asks for an explicit confirmation.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const LINE = "The site helps a visitor book a visit.";
const STOPPED =
  "The brief draft stopped early. These fields stay filled from the interview. Use Retry to ask again.";

function draft(): Record<string, string> {
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
    maintainer: "The owner types the raw answer.",
    pages: LINE,
    features: LINE,
    cadence: LINE,
    languages: LINE,
    imagery: LINE,
    budget: "Not applicable: 3D is none, so the custom generation budget is not asked.",
    session: LINE,
    logo: LINE,
    palette: LINE,
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
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify([{ id: "DP-2.1", status: "ANSWERED", value: LINE }]),
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({
      status: "pending",
      draft: draft(),
      buildStarted: false,
      error: STOPPED,
      note: "",
      fallback: true,
    })}\n`,
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

function fieldText(html: string, name: string): string {
  const matched = new RegExp(`<h2>${name}</h2>\\s*<p>([^<]*)</p>`).exec(html);
  return matched?.[1] ?? "";
}

test("Change something keeps the fallback marker, and Approve requires confirmation", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-brief-040-"));
  seed(dir);
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "brief-revise") {
      return { value: { budget: "Quiero una tienda para el sitio." }, raw: "{}", durationMs: 0, cassette: "live" };
    }
    if (req.task === "context-summary") {
      return { value: { summary: "Brief approved." }, raw: "{}", durationMs: 0, cassette: "live" };
    }
    throw new Error(req.task);
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const home = await raw(handle.port, "GET", "/approve");
    assert.equal(home.status, 200);
    const token = tokenFrom(home.body);
    assert.match(home.body, /data-brief-fallback/);
    assert.match(home.body, /filled from the interview/);
    assert.match(home.body, /stopped early/);
    assert.match(home.body, /name="confirmFallback"/);
    assert.match(fieldText(home.body, "Budget"), /Not applicable/);
    assert.match(fieldText(home.body, "Maintainer"), /raw answer/);
    assert.doesNotMatch(home.body, /data-fallback-confirm/);

    const headers = { "content-type": "application/json", "x-hh-csrf": token };
    const correction = "Budget: Up to 50 dollars for AI stills. Maintainer: The owner approves every change.";
    const changed = await raw(handle.port, "POST", "/api/brief/change", headers, JSON.stringify({ correction }));
    assert.equal(changed.status, 200);
    let pending = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/api/brief");
      pending = next.body;
      if (pending.includes("50 dollars") && pending.includes('"status":"pending"')) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.match(pending, /50 dollars/);
    assert.match(pending, /approves every change/);
    assert.match(pending, /"fallback":true/);
    assert.match(pending, /"status":"pending"/);
    assert.match(pending, /stopped early/);
    assert.equal(pending.includes("Not applicable"), false);

    const page = await raw(handle.port, "GET", "/approve");
    assert.match(page.body, /data-brief-fallback/);
    assert.match(page.body, /data-brief-error[^>]*>[^<]*stopped early/);
    assert.match(fieldText(page.body, "Budget"), /50 dollars/);
    assert.match(fieldText(page.body, "Maintainer"), /approves every change/);
    assert.doesNotMatch(page.body, /language; language/);

    const denied = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve`,
    );
    assert.equal(denied.status, 409);
    assert.match(denied.body, /data-fallback-confirm[^>]*>Confirm the interview fallback before approving/);
    assert.match(denied.body, /data-brief-fallback/);
    assert.match(denied.body, /data-brief-error[^>]*>[^<]*stopped early/);
    assert.doesNotMatch(denied.body, /data-brief-error[^>]*>[^<]*Confirm the interview fallback/);
    assert.doesNotMatch(denied.body, /The build is started/);
    const still = await raw(handle.port, "GET", "/api/brief");
    assert.match(still.body, /"status":"pending"/);
    assert.match(still.body, /"fallback":true/);
    assert.match(still.body, /50 dollars/);

    const apiDenied = await raw(handle.port, "POST", "/api/brief/approve", headers, "{}");
    assert.equal(apiDenied.status, 409);
    assert.match(apiDenied.body, /Confirm the interview fallback before approving/);

    const yes = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${token}&action=approve&confirmFallback=yes`,
    );
    assert.equal(yes.status, 303);
    assert.equal(yes.location, "/approve");
    const planned = await raw(handle.port, "GET", "/approve");
    assert.match(planned.body, /Approve plan|Draft the plan|data-plan-coverage/);
    const planToken = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(planned.body)?.[1] ?? token;
    const planYes = await raw(
      handle.port,
      "POST",
      "/approve",
      { "content-type": "application/x-www-form-urlencoded" },
      `csrf=${planToken}&action=approve&confirmFallback=yes`,
    );
    assert.equal(planYes.status, 303);
    let after = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await raw(handle.port, "GET", "/approve");
      after = next.body;
      if (after.includes("The build is started")) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.match(after, /The build is started/);
    assert.match(after, /data-brief-fallback/);
    assert.match(after, /50 dollars/);
    assert.doesNotMatch(after, /data-brief-error/);
    const approved = await raw(handle.port, "GET", "/api/brief");
    assert.match(approved.body, /"status":"approved"/);
    assert.match(approved.body, /"fallback":true/);
    assert.match(approved.body, /"buildStarted":true/);
    assert.match(approved.body, /"error":""/);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
