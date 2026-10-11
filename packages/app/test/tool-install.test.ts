import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildInstallPlan, loadConfig, type InstallPlan, type RunResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import type { DeskPreflight, PreflightName } from "../src/server/card.ts";
import type { ToolRuntime } from "../src/server/tool-desk.ts";

const NAMES: PreflightName[] = ["grok", "playwright", "whisper", "pdftotext"];
const SECRET = "sk-plantedkey12345678";
const ENV_SECRET = "xai-plantedsecretvalue";

function ctx() {
  return {
    platform: "win32" as const,
    arch: "x64",
    managers: ["npm", "pnpm", "scoop", "tar"],
    dataDir: "C:\\Hitchhiker\\tools",
    browsersDir: "C:\\Cache\\ms-playwright",
    workspaceDir: "C:\\guide",
  };
}

function missingReport(): DeskPreflight {
  return {
    grokOk: false,
    probes: NAMES.map((name) => ({
      name,
      ok: false,
      detail: name === "grok" ? "grok: not on PATH" : `${name}: not installed`,
      version: null,
    })),
  };
}

function runtime(): ToolRuntime & { runs: InstallPlan[]; present: Set<string> } {
  const runs: InstallPlan[] = [];
  const present = new Set<string>();
  let pdfFailed = false;
  return {
    runs,
    present,
    plan(input) {
      return buildInstallPlan(input.tool, input.modelId, ctx());
    },
    async run(plan, runCtx) {
      runs.push(plan);
      if (plan.tool === "pdftotext" && !pdfFailed) {
        pdfFailed = true;
        runCtx.emit({
          type: "stderr",
          text: "poppler exit 3: package missing from the stub\n",
          received: null,
          total: null,
        });
        const failed: RunResult = {
          status: "failed",
          error: "exit 2: poppler exit 3: package missing from the stub",
          installPath: null,
          versionLine: null,
          manualCommand: plan.manualCommand,
          modelPath: null,
        };
        return failed;
      }
      present.add(plan.tool);
      const ok: RunResult = {
        status: "ok",
        error: null,
        installPath: `C:\\tools\\${SECRET}\\${plan.tool}.exe`,
        versionLine: null,
        manualCommand: plan.manualCommand,
        modelPath: null,
      };
      return ok;
    },
    recheck() {
      return {
        grokOk: present.has("grok"),
        probes: NAMES.map((name) => ({
          name,
          ok: present.has(name),
          detail: present.has(name) ? `${name}: installed` : `${name}: not installed`,
          version: name === "grok" && present.has("grok") ? "grok 1.2.3" : null,
        })),
      };
    },
  };
}

async function desk(clock?: { now: number }): Promise<{
  handle: ServerHandle;
  dir: string;
  tools: ReturnType<typeof runtime>;
  close: () => Promise<void>;
}> {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-install-"));
  const tools = runtime();
  const handle = await startServer({
    projectDir: dir,
    open: false,
    preflight: missingReport(),
    tools,
    ...(clock === undefined ? {} : { toolNow: () => clock.now }),
  });
  return {
    handle,
    dir,
    tools,
    async close() {
      await handle.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function csrfOf(url: string): Promise<string> {
  const html = await (await fetch(url)).text();
  const token = /name="hh-csrf" content="([^"]+)"/.exec(html)?.[1];
  assert.ok(token !== undefined && token.length > 0);
  return token;
}

async function post(url: string, token: string, pathname: string, body: unknown, origin?: string): Promise<Response> {
  return fetch(new URL(pathname, url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hh-csrf": token,
      ...(origin === undefined ? {} : { origin }),
    },
    body: JSON.stringify(body),
  });
}

async function events(response: Response): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
  const text = await response.text();
  const found: Array<{ event: string; data: Record<string, unknown> }> = [];
  for (const frame of text.split("\n\n")) {
    if (!frame.includes("data:")) continue;
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trim());
    }
    const parsed: unknown = JSON.parse(data.join("\n"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      found.push({ event, data: parsed as Record<string, unknown> });
    }
  }
  return found;
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) stack.push(full);
      else found.push(full);
    }
  }
  return found;
}

test("nothing runs without a valid confirm token", async () => {
  const session = await desk();
  try {
    const token = await csrfOf(session.handle.url);
    const planned = await post(session.handle.url, token, "/api/tools/plan", { tool: "playwright" });
    assert.equal(planned.status, 200);
    const planBody = await planned.json() as { token: string; plan: { runSteps: Array<{ argv: string[] }> } };
    assert.equal(session.tools.runs.length, 0);
    assert.deepEqual(planBody.plan.runSteps[0]?.argv, ["pnpm", "exec", "playwright", "install", "chromium"]);

    assert.equal((await post(session.handle.url, token, "/api/tools/run", {})).status, 403);
    assert.equal((await post(session.handle.url, token, "/api/tools/run", { token: "wrong" })).status, 403);
    const first = await post(session.handle.url, token, "/api/tools/run", { token: planBody.token });
    assert.equal(first.status, 200);
    const ran = await events(first);
    assert.equal(ran.at(-1)?.data.status, "ok");
    assert.equal(session.tools.runs.length, 1);
    const replay = await post(session.handle.url, token, "/api/tools/run", { token: planBody.token });
    assert.equal(replay.status, 403);
    const replayBody = await replay.json() as { error: string };
    assert.equal(replayBody.error, "confirm token was already used");
    assert.equal(session.tools.runs.length, 1);

    const foreign = await post(session.handle.url, token, "/api/tools/plan", { tool: "grok" }, "https://evil.example");
    assert.equal(foreign.status, 403);
    assert.equal(session.tools.runs.length, 1);
  } finally {
    await session.close();
  }
});

test("an expired confirm token never calls the runner", async () => {
  const clock = { now: 0 };
  const session = await desk(clock);
  try {
    const token = await csrfOf(session.handle.url);
    const planned = await post(session.handle.url, token, "/api/tools/plan", { tool: "grok" });
    const body = await planned.json() as { token: string };
    clock.now = 11 * 60 * 1000;
    const expired = await post(session.handle.url, token, "/api/tools/run", { token: body.token });
    assert.equal(expired.status, 403);
    const payload = await expired.json() as { error: string };
    assert.equal(payload.error, "confirm token expired");
    assert.equal(session.tools.runs.length, 0);
  } finally {
    await session.close();
  }
});

test("sudo stays manual text and a failure can be retried with a fresh plan", async () => {
  const session = await desk();
  try {
    const token = await csrfOf(session.handle.url);
    const linux = buildInstallPlan("pdftotext", null, { ...ctx(), platform: "linux", managers: ["apt-get"] });
    assert.equal(linux.canRun, false);
    assert.match(linux.manualCommand, /^sudo /);
    const planned = await post(session.handle.url, token, "/api/tools/plan", { tool: "pdftotext" });
    const body = await planned.json() as { token: string; plan: { manualCommand: string; canRun: boolean } };
    const first = await events(await post(session.handle.url, token, "/api/tools/run", { token: body.token }));
    assert.equal(first.at(-1)?.data.status, "failed");
    assert.match(String(first.at(-1)?.data.error), /poppler exit 3: package missing from the stub/);
    assert.equal(first.at(-1)?.data.manualCommand, body.plan.manualCommand);
    const again = await post(session.handle.url, token, "/api/tools/plan", { tool: "pdftotext" });
    const second = await again.json() as { token: string };
    const retried = await events(await post(session.handle.url, token, "/api/tools/run", { token: second.token }));
    assert.equal(retried.at(-1)?.data.status, "ok");
    assert.equal(session.tools.runs.length, 2);
    assert.equal(session.tools.runs[0]?.argvJoin, undefined);
    assert.equal(session.tools.runs.every((plan) => plan.runSteps.every((step) => step.argv[0] !== "sudo")), true);
  } finally {
    await session.close();
  }
});

test("success records a scrubbed install and returns the new probe", async () => {
  const previousKey = process.env.XAI_API_KEY;
  const previousPath = process.env.PATH;
  const previousWin = process.env.Path;
  process.env.XAI_API_KEY = ENV_SECRET;
  const session = await desk();
  try {
    const token = await csrfOf(session.handle.url);
    const planned = await post(session.handle.url, token, "/api/tools/plan", { tool: "grok" });
    const body = await planned.json() as { token: string; plan: { docsUrl: string; signIn: string; runSteps: Array<{ argv: string[] }> } };
    assert.equal(body.plan.docsUrl, "https://x.ai/docs/build/overview");
    assert.match(body.plan.signIn, /sign in yourself/);
    assert.equal(body.plan.runSteps.some((step) => step.argv.join(" ").includes("|")), false);
    const done = await events(await post(session.handle.url, token, "/api/tools/run", { token: body.token }));
    const last = done.at(-1)?.data;
    assert.equal(last?.status, "ok");
    assert.equal(last?.grokOk, true);
    assert.match(String(last?.statusHtml), /Ready\./);
    const config = loadConfig(session.dir);
    assert.equal(config.voiceEngine, "local");
    const saved = JSON.stringify(config);
    assert.equal(saved.includes(SECRET), false);
    assert.equal(saved.includes(ENV_SECRET), false);
    assert.equal(config.toolInstalls[0]?.tool, "grok");
    assert.equal(config.toolInstalls[0]?.version, "grok 1.2.3");
    assert.equal(config.toolInstalls[0]?.recipeId, "grok-npm");
    assert.equal(existsSync(path.join(session.dir, ".hitchhiker", "stt-quote.json")), false);
    const projectText = filesUnder(path.join(session.dir, ".hh-save-home"))
      .filter((file) => file.endsWith(".hhproject"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.ok(projectText.length > 0);
    assert.equal(projectText.includes(SECRET), false);
    assert.equal(projectText.includes(ENV_SECRET), false);
    assert.match(projectText, /grok-npm/);
  } finally {
    if (previousKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previousKey;
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    if (previousWin === undefined) delete process.env.Path;
    else process.env.Path = previousWin;
    await session.close();
  }
});
