/**
 * BUG-034b: a dead run is recovered after an explicit Resume.
 * BUG-042: desk start holds that run and does not advance on its own.
 * Two Resume posts for an interrupted row still share one spawn.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  LockHeld,
  loadQueue,
  prepareSiteBuild,
  readBuildRun,
  saveQueue,
  siteBuildSettled,
  type BuildSpawn,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { queueBodyHtml, type DriveRun } from "../src/drive-markup.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const LINE = "The site helps a visitor book a visit.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    req.setTimeout(45_000, () => {
      req.destroy(new Error(`The ${method} ${pathname} call timed out.`));
    });
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
      return { value: { goal: LINE }, raw: "{}", durationMs: 0, cassette: "live" };
    }
    throw new Error(req.task);
  };
}

async function queueAt(dir: string, running: "003" | "interrupted"): Promise<void> {
  await prepareSiteBuild(dir, "Brief.");
  const statusFor = (id: string): "passed" | "running" | "interrupted" | "queued" => {
    if (id === "001" || id === "002") return "passed";
    if (id !== "003") return "queued";
    return running === "003" ? "running" : "interrupted";
  };
  await saveQueue(dir, {
    items: ["001", "002", "003", "004"].map((id) => ({ id, kind: "build" as const, status: statusFor(id) })),
  });
}

function writeRunning(dir: string, promptId: string): void {
  writeFileSync(
    path.join(dir, ".hitchhiker", "build-run.json"),
    `${JSON.stringify({
      promptId,
      status: "running",
      model: BUILD_MODEL,
      effort: BUILD_EFFORT,
      startedAt: "2026-10-13T00:00:00.000Z",
      elapsedMs: 10,
      lastLines: [],
      filesWritten: [],
      reason: "",
      pid: null,
      recovery: "",
      recoveryRerun: false,
    })}\n`,
    "utf8",
  );
}

function writeEnd(dir: string, promptId: string): void {
  const logs = path.join(dir, ".hitchhiker", "logs");
  mkdirSync(logs, { recursive: true });
  writeFileSync(path.join(logs, `build-${promptId}.log`), '{"type":"end","stopReason":"end_turn"}\n', "utf8");
}

function promptIdWith(dir: string, needle: string): string {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  const hit = readdirSync(folder)
    .filter((name) => /^\d{3}\.md$/.test(name))
    .sort()
    .find((name) => readFileSync(path.join(folder, name), "utf8").includes(needle));
  assert.ok(hit, needle);
  return hit.slice(0, 3);
}

function shiftId(id: string, by: number): string {
  return String(Number(id) + by).padStart(3, "0");
}

function writeLogo(dir: string): void {
  mkdirSync(path.join(dir, "public"), { recursive: true });
  mkdirSync(path.join(dir, "src", "components"), { recursive: true });
  writeFileSync(path.join(dir, "public", "logo.svg"), "<svg></svg>\n", "utf8");
  writeFileSync(path.join(dir, "src", "components", "Logo.astro"), "---\n---\n", "utf8");
}

function runView(status: string, recovery: string): DriveRun {
  return {
    promptId: "003",
    status,
    model: BUILD_MODEL,
    effort: BUILD_EFFORT,
    elapsedMs: 12,
    lastLines: [],
    filesWritten: ["public/logo.svg"],
    reason: recovery,
    recovery,
  };
}

test("Resume stays disabled while a run is live and the recovery line is shown", () => {
  const idle = queueBodyHtml(
    [{ id: "003", kind: "build", status: "interrupted" }],
    runView("interrupted", "003 rerun after restart"),
  );
  assert.match(idle, /data-action="resume" data-prompt="003">Resume/);
  assert.equal(idle.includes('data-action="resume" data-prompt="003" disabled'), false);
  assert.match(idle, /data-recovery>003 rerun after restart/);
  const verified = queueBodyHtml(
    [{ id: "003", kind: "build", status: "passed" }],
    runView("passed", "003 recovered: output verified, passed"),
  );
  assert.match(verified, /data-recovery>003 recovered: output verified, passed/);
  const live = queueBodyHtml(
    [
      { id: "003", kind: "build", status: "interrupted" },
      { id: "004", kind: "build", status: "queued" },
    ],
    runView("running", "003 rerun after restart"),
  );
  assert.match(live, /data-action="resume" data-prompt="003" disabled aria-disabled="true"/);
  assert.equal(live.includes("!"), false);
});

test("desk start holds a finished prompt until Resume, then verifies and advances", { timeout: 90_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-034b-start-"));
  seed(dir);
  const seen: string[] = [];
  const buildSpawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, BUILD_MODEL);
    assert.equal(request.effort, BUILD_EFFORT);
    assert.ok(request.args.includes(BUILD_MODEL));
    assert.ok(request.args.includes(BUILD_EFFORT));
    return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  let handle: ServerHandle | undefined;
  try {
    await prepareSiteBuild(dir, "Brief.");
    const logo = promptIdWith(dir, "public/logo.svg");
    const next = shiftId(logo, 1);
    const before = shiftId(logo, -1);
    const count = Number(next);
    await saveQueue(dir, {
      items: Array.from({ length: count }, (_, index) => {
        const id = String(index + 1).padStart(3, "0");
        const status = id < logo ? "passed" : id === logo ? "running" : "queued";
        return { id, kind: "build" as const, status };
      }),
    });
    writeRunning(dir, logo);
    writeEnd(dir, logo);
    writeLogo(dir);
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink() as never, buildSpawn });
    let held = false;
    for (let attempt = 0; attempt < 40 && !held; attempt += 1) {
      const queue = await loadQueue(dir);
      const status = queue?.items.find((item) => item.id === logo)?.status;
      if (status === "passed" || status === "queued" || seen.length > 0) {
        assert.fail(`desk started the queue before Resume: ${status ?? "missing"}`);
      }
      held = queue?.pause !== undefined && status === "running" && queue.pause.after === before;
      if (!held) await delay(25);
    }
    assert.equal(held, true);
    assert.deepEqual(seen, []);
    const parked = await raw(handle.port, "GET", "/hh-dashboard");
    assert.equal(parked.status, 200);
    assert.match(parked.body, /id="queue"[^>]*data-queue-state="paused"/);
    assert.match(parked.body, new RegExp(`data-id="${logo}"[^>]*data-status="running"`));
    const resumed = await raw(
      handle.port,
      "POST",
      "/api/drive/resume-queue",
      { "content-type": "application/json", "x-hh-csrf": tokenFrom(parked.body) },
      "{}",
    );
    assert.equal(resumed.status, 200, resumed.body);
    let passed = false;
    for (let attempt = 0; attempt < 80 && !passed; attempt += 1) {
      try {
        const queue = await loadQueue(dir);
        passed =
          queue?.items.find((item) => item.id === logo)?.status === "passed" &&
          queue?.items.find((item) => item.id === next)?.status === "passed";
      } catch (error: unknown) {
        if (!(error instanceof LockHeld)) throw error;
      }
      if (!passed) await delay(50);
    }
    assert.equal(passed, true);
    assert.equal(seen.includes(logo), false);
    assert.equal(seen.includes(next), true);
    const recovered = `${logo} recovered: output verified, passed`;
    let page = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const view = await raw(handle.port, "GET", "/hh-dashboard");
      page = view.body;
      if (view.status === 200 && page.includes(recovered)) break;
      await delay(50);
    }
    assert.match(page, new RegExp(recovered.replace(/[.]/g, "\\.")));
    assert.match(page, /data-build-model="grok-4\.7-build-fast"/);
    assert.match(page, /data-build-effort="xhigh"/);
    assert.equal(readBuildRun(dir)?.model, BUILD_MODEL);
    assert.equal(readBuildRun(dir)?.effort, BUILD_EFFORT);
  } finally {
    await siteBuildSettled(dir);
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});

test("two Resume posts start one run and the button is held while it is live", { timeout: 90_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-app-034b-resume-"));
  seed(dir);
  const seen: string[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const buildSpawn: BuildSpawn = (request) => {
    seen.push(request.promptId);
    assert.equal(request.model, BUILD_MODEL);
    assert.equal(request.effort, BUILD_EFFORT);
    if (request.promptId === "003") {
      return { pid: 999999, done: gate.then(() => ({ code: 0, stdout: "", stderr: "", errorCode: null })) };
    }
    return { pid: 999999, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  let handle: ServerHandle | undefined;
  try {
    await queueAt(dir, "interrupted");
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink() as never, buildSpawn });
    const home = await raw(handle.port, "GET", "/hh-dashboard");
    assert.match(home.body, /data-action="resume"/);
    assert.equal(home.body.includes('data-action="resume" data-prompt="003" disabled'), false);
    const token = tokenFrom(home.body);
    const headers = { "content-type": "application/json", "x-hh-csrf": token };
    const body = JSON.stringify({ id: "003" });
    const [first, second] = await Promise.all([
      raw(handle.port, "POST", "/api/drive/resume", headers, body),
      raw(handle.port, "POST", "/api/drive/resume", headers, body),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    for (let attempt = 0; attempt < 40 && !seen.includes("003"); attempt += 1) await delay(25);
    assert.deepEqual(seen, ["003"]);
    let held = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const page = await raw(handle.port, "GET", "/hh-dashboard");
      held = page.body;
      if (held.includes('data-status="running"') || held.includes("003 rerun after restart")) break;
      await delay(25);
    }
    assert.match(held, /003 rerun after restart/);
    const resume = /<button\b[^>]*data-action="resume"[^>]*>/.exec(held);
    if (resume !== null) assert.match(resume[0], /disabled/);
    const third = await raw(handle.port, "POST", "/api/drive/resume", headers, body);
    assert.equal(third.status, 200);
    await delay(40);
    assert.deepEqual(seen, ["003"]);
    release();
    await siteBuildSettled(dir);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items.find((item) => item.id === "003")?.status, "passed");
    assert.equal(queue?.items.find((item) => item.id === "004")?.status, "passed");
    assert.equal(seen.filter((id) => id === "003").length, 1);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "queue.json")), true);
  } finally {
    release();
    await siteBuildSettled(dir);
    if (handle !== undefined) await handle.close();
    removeTempDir(dir);
  }
});
