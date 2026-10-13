/**
 * BUG-009. A Guide call does not hold the request that started it.
 * The answer POST returns a job id. GET / and the session route stay quick.
 * The same submit joins the running job instead of calling the model twice.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { settleRaw } from "./settle-guide-job.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function hit<T>(value: T): ThinkResult<T> {
  return { value, raw: JSON.stringify(value), durationMs: 0, cassette: "hit" };
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
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: { host: `127.0.0.1:${port}`, ...headers },
      },
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

test("route handlers do not await a Guide call", () => {
  const source = readFileSync(path.resolve(here, "../src/server/routes.ts"), "utf8");
  const turn = slice(source, "async function handleTurn(", "async function handleAttach(");
  const approve = slice(source, "async function handleApproveForm(", "async function handleBriefPost(");
  const brief = slice(source, "async function handleBriefPost(", "function dropRequest(");
  const banned = [
    "await turn(",
    "await runTurn(",
    "await judgePushback(",
    "await guideThink(",
    "await think(",
    "await approveSiteBrief(",
    "await draftSiteBrief(",
    "await reviseSiteBrief(",
  ];
  for (const body of [turn, approve, brief]) {
    for (const phrase of banned) assert.equal(body.includes(phrase), false, phrase);
  }
  assert.match(turn, /guideJobsFor\(projectDir\)\.start/);
  assert.match(source, /async function runDeskTurn\(/);
});

test("a 30s Guide call leaves GET / and the session route under a second", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-guide-job-"));
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const backstop = setTimeout(() => release(), 30_000);
  let judges = 0;
  const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "pushback-judge") {
      judges += 1;
      await gate;
      return hit({ vague: false, quote: "", sharperChoice: "" });
    }
    if (req.task === "guide-message") {
      return hit({ message: "The next question is on the card.", explanationLevel: "beginner", joke: false });
    }
    if (req.task === "context-summary") return hit({ summary: "A shop site." });
    throw new Error(req.task);
  };
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const page = await raw(handle.port, "GET", "/");
    const token = tokenFrom(page.body);
    const headers = { "content-type": "application/json", "x-hh-csrf": token };
    const payload = JSON.stringify({ questionId: "DP-0.1", text: "For myself." });
    const started = Date.now();
    const posted = await raw(handle.port, "POST", "/api/answer", headers, payload);
    assert.ok(Date.now() - started < 1000, `answer POST took ${Date.now() - started}ms`);
    assert.equal(posted.status, 200);
    const accepted = JSON.parse(posted.body) as { jobId?: string; status?: string; session?: unknown };
    assert.equal(typeof accepted.jobId, "string");
    assert.equal(accepted.status, "running");
    assert.equal(accepted.session, undefined);

    const homeStarted = Date.now();
    const home = await raw(handle.port, "GET", "/");
    assert.equal(home.status, 200);
    assert.match(home.body, /data-question-id="DP-0\.1"/);
    assert.ok(Date.now() - homeStarted < 1000, `GET / took ${Date.now() - homeStarted}ms`);

    const statusStarted = Date.now();
    const status = await raw(handle.port, "GET", "/api/session");
    assert.equal(status.status, 200);
    assert.ok(Date.now() - statusStarted < 1000, `session took ${Date.now() - statusStarted}ms`);
    const during = JSON.parse(status.body) as {
      guideJob?: { id?: string; status?: string };
      question?: { id?: string };
    };
    assert.equal(during.question?.id, "DP-0.1");
    assert.equal(during.guideJob?.id, accepted.jobId);
    assert.equal(during.guideJob?.status, "running");

    const again = await raw(handle.port, "POST", "/api/answer", headers, payload);
    const second = JSON.parse(again.body) as { jobId?: string };
    assert.equal(second.jobId, accepted.jobId);

    release();
    clearTimeout(backstop);
    const settled = await settleRaw(handle.port, posted);
    assert.equal(settled.status, 200);
    const done = JSON.parse(settled.body) as { session?: { question?: { id?: string } } };
    assert.equal(done.session?.question?.id, "DP-0.2");
    assert.equal(judges, 1);
  } finally {
    clearTimeout(backstop);
    release();
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function slice(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, start);
  assert.ok(to > from, end);
  return source.slice(from, to);
}
