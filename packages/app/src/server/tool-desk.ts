/**
 * Install routes for the desk. A plan is free. A run needs the confirm token
 * for that plan. The runner is the caller's, so tests never download.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  PlanError,
  buildInstallPlan,
  createConfirmStore,
  executePlan,
  loadConfig,
  managersOnPath,
  mergeInstall,
  playwrightBrowsersCache,
  probePathTools,
  publicInstallRecord,
  rememberInstallPath,
  saveConfig,
  saveProjectFile,
  spawnProbe,
  toolDataDir,
  type InstallEvent,
  type InstallPlan,
  type RunResult,
} from "@hitchhiker/engine";
import type { DeskPreflight } from "./card.ts";
import { encodeSse } from "./sse.ts";
import { contentLengthExceeds, readCapped } from "./uploads.ts";
import { readVoiceDeskFlags } from "./voice-flags.ts";

const JSON_LIMIT = 1024 * 1024;
const STILL_MISSING =
  "The install finished, and the check still cannot see the tool. Open a new terminal so the PATH refresh is picked up, or run the manual command.";

export interface ToolRuntime {
  plan(input: { tool: string; modelId: string | null }): InstallPlan;
  run(
    plan: InstallPlan,
    ctx: { signal: AbortSignal; emit: (event: InstallEvent) => void },
  ): Promise<RunResult>;
  recheck(): DeskPreflight;
}

export interface ToolDeskOptions {
  projectDir: string;
  getPreflight: () => DeskPreflight | null;
  setPreflight: (report: DeskPreflight) => void;
  statusHtml: () => string;
  publish: (name: string, data: unknown) => void;
  runtime?: ToolRuntime;
  now?: () => number;
  env?: NodeJS.ProcessEnv;
}

export function productionRuntime(env: NodeJS.ProcessEnv = process.env): ToolRuntime {
  const platform = process.platform;
  const workspaceDir = path.resolve(import.meta.dirname, "..", "..", "..", "..");
  return {
    plan(input) {
      return buildInstallPlan(input.tool, input.modelId, {
        platform,
        arch: process.arch,
        managers: managersOnPath(env, platform),
        dataDir: toolDataDir(platform, env),
        browsersDir: playwrightBrowsersCache(platform, env),
        workspaceDir,
      });
    },
    run(plan, ctx) {
      return executePlan(plan, ctx);
    },
    recheck() {
      const probes = probePathTools({ run: spawnProbe });
      return {
        grokOk: probes.some((probe) => probe.name === "grok" && probe.ok),
        probes: probes.map((probe) => ({
          name: probe.name,
          ok: probe.ok,
          detail: probe.detail,
          version: probe.version,
        })),
      };
    },
  };
}

export function createToolHandler(options: ToolDeskOptions): (req: IncomingMessage, res: ServerResponse, pathname: string) => Promise<void> {
  const runtime = options.runtime ?? productionRuntime(options.env ?? process.env);
  const confirms = createConfirmStore();
  const active = new Map<string, AbortController>();
  const now = (): number => options.now?.() ?? Date.now();

  return async (req, res, pathname) => {
    if (!originAllowed(req.headers.origin)) {
      sendJson(res, 403, { error: "The desk only answers on localhost." });
      return;
    }
    if (contentLengthExceeds(req.headers["content-length"], JSON_LIMIT)) {
      sendJson(res, 413, { error: "That request is too large." });
      req.destroy();
      return;
    }
    const capped = await readCapped(req, JSON_LIMIT);
    if (!capped.ok) {
      sendJson(res, 413, { error: "That request is too large." });
      req.destroy();
      return;
    }
    const body = parseJson(capped.body.toString("utf8"));
    if (body === null) {
      sendJson(res, 400, { error: "The request body could not be read." });
      return;
    }
    if (pathname === "/api/tools/plan") {
      await planRoute(res, body, runtime, confirms, now);
      return;
    }
    if (pathname === "/api/tools/run") {
      await runRoute(req, res, body, runtime, confirms, active, options, now);
      return;
    }
    if (pathname === "/api/tools/cancel") {
      cancelRoute(res, body, active);
      return;
    }
    if (pathname === "/api/tools/recheck") {
      recheckRoute(res, runtime, options);
      return;
    }
    sendJson(res, 404, { error: "That route is not on the desk." });
  };
}

async function planRoute(
  res: ServerResponse,
  body: Record<string, unknown>,
  runtime: ToolRuntime,
  confirms: ReturnType<typeof createConfirmStore>,
  now: () => number,
): Promise<void> {
  const tool = typeof body.tool === "string" ? body.tool : "";
  const modelId = typeof body.modelId === "string" ? body.modelId : null;
  let plan: InstallPlan;
  try {
    plan = runtime.plan({ tool, modelId });
  } catch (error: unknown) {
    const message = error instanceof PlanError || error instanceof Error ? error.message : "The plan could not be built.";
    sendJson(res, 400, { error: message });
    return;
  }
  const issued = confirms.issue(plan, now());
  sendJson(res, 200, {
    plan: publicPlan(plan),
    token: issued.token,
    planHash: issued.planHash,
    expiresAt: issued.expiresAt,
  });
}

async function runRoute(
  req: IncomingMessage,
  res: ServerResponse,
  body: Record<string, unknown>,
  runtime: ToolRuntime,
  confirms: ReturnType<typeof createConfirmStore>,
  active: Map<string, AbortController>,
  options: ToolDeskOptions,
  now: () => number,
): Promise<void> {
  const token = typeof body.token === "string" ? body.token : "";
  const looked = confirms.lookup(token, now());
  if (!looked.ok) {
    sendJson(res, 403, { error: looked.reason });
    return;
  }
  if (!looked.plan.canRun) {
    sendJson(res, 400, { error: "Nothing runs from the desk.", manualCommand: looked.plan.manualCommand });
    return;
  }
  if (active.has(looked.plan.tool)) {
    sendJson(res, 409, { error: "An install for that tool is already running." });
    return;
  }
  const consumed = confirms.consume(token, now());
  if (!consumed.ok) {
    sendJson(res, 403, { error: consumed.reason });
    return;
  }
  const plan = consumed.plan;
  const controller = new AbortController();
  active.set(plan.tool, controller);
  let finished = false;
  req.on("close", () => {
    if (!finished) controller.abort();
  });
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-store",
    connection: "keep-alive",
    "x-content-type-options": "nosniff",
  });
  const emit = (event: InstallEvent): void => {
    writeEvent(res, event.type, event);
  };
  try {
    const result = await runtime.run(plan, { signal: controller.signal, emit });
    if (result.status === "cancelled") {
      writeEvent(res, "done", {
        status: "cancelled",
        error: "Cancelled.",
        manualCommand: result.manualCommand,
      });
      return;
    }
    if (result.status === "failed") {
      writeEvent(res, "done", {
        status: "failed",
        error: result.error ?? "The install failed.",
        manualCommand: result.manualCommand,
        docsUrl: plan.docsUrl,
      });
      return;
    }
    const saved = await settle(plan, result, options, runtime);
    writeEvent(res, "done", saved);
    options.publish("tools", saved);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The install failed.";
    writeEvent(res, "done", {
      status: "failed",
      error: message,
      manualCommand: plan.manualCommand,
      docsUrl: plan.docsUrl,
    });
  } finally {
    finished = true;
    active.delete(plan.tool);
    res.end();
  }
}

function cancelRoute(
  res: ServerResponse,
  body: Record<string, unknown>,
  active: Map<string, AbortController>,
): void {
  const tool = typeof body.tool === "string" ? body.tool : "";
  const running = active.get(tool);
  if (running === undefined) {
    sendJson(res, 404, { error: "No install is running for that tool." });
    return;
  }
  running.abort();
  sendJson(res, 200, { ok: true, status: "cancelled" });
}

function recheckRoute(res: ServerResponse, runtime: ToolRuntime, options: ToolDeskOptions): void {
  const report = runtime.recheck();
  options.setPreflight(report);
  const payload = {
    status: "ok",
    probes: report.probes,
    grokOk: report.grokOk,
    statusHtml: options.statusHtml(),
    localWhisper: false,
  };
  options.publish("tools", payload);
  sendJson(res, 200, payload);
}

async function settle(
  plan: InstallPlan,
  result: RunResult,
  options: ToolDeskOptions,
  runtime: ToolRuntime,
): Promise<Record<string, unknown>> {
  const env = options.env ?? process.env;
  if (result.installPath !== null && path.isAbsolute(result.installPath)) {
    rememberInstallPath(env, result.installPath);
  }
  if (plan.tool === "whisper") {
    if (result.installPath !== null && path.isAbsolute(result.installPath)) {
      env.WHISPER_CPP_BIN = result.installPath;
    }
    if (result.modelPath !== null && result.modelPath.length > 0) {
      env.WHISPER_CPP_MODEL = result.modelPath;
    }
  }
  const report = runtime.recheck();
  const probe = report.probes.find((item) => item.name === plan.tool);
  const version = probe?.version ?? null;
  const record = publicInstallRecord({
    tool: plan.tool,
    version,
    installPath: result.installPath ?? plan.location,
    installedAt: new Date().toISOString(),
    recipeId: plan.recipeId,
    source: plan.sourceUrl,
  });
  const config = loadConfig(options.projectDir);
  await saveConfig(options.projectDir, {
    ...config,
    voiceEngine: config.voiceEngine,
    toolInstalls: mergeInstall(config.toolInstalls, record),
  });
  await saveProjectFile(options.projectDir, { now: new Date() });
  options.setPreflight(report);
  const stillMissing = probe?.ok !== true;
  let localWhisper = false;
  try {
    localWhisper = (await readVoiceDeskFlags(options.projectDir)).localWhisper;
  } catch {
    localWhisper = false;
  }
  return {
    status: "ok",
    error: null,
    probes: report.probes,
    grokOk: report.grokOk,
    statusHtml: options.statusHtml(),
    stillMissing,
    manualCommand: result.manualCommand,
    docsUrl: plan.docsUrl,
    localWhisper,
    notice: stillMissing ? STILL_MISSING : null,
  };
}

function publicPlan(plan: InstallPlan): InstallPlan {
  return {
    ...plan,
    steps: plan.steps.map(copyStep),
    runSteps: plan.runSteps.map(copyStep),
  };
}

function copyStep(step: InstallPlan["runSteps"][number]): InstallPlan["runSteps"][number] {
  const copy: InstallPlan["runSteps"][number] = {
    id: step.id,
    argv: [...step.argv],
    kind: step.kind,
    needsElevation: step.needsElevation,
    url: step.url,
    dest: step.dest,
    sha256: step.sha256,
    bytes: step.bytes,
    label: step.label,
  };
  if (step.cwd !== undefined) copy.cwd = step.cwd;
  if (step.placeAs !== undefined) copy.placeAs = step.placeAs;
  return copy;
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function originAllowed(origin: string | string[] | undefined): boolean {
  if (origin === undefined) return true;
  const value = Array.isArray(origin) ? origin[0] : origin;
  if (value === undefined || value.length === 0) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(payload.length),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

function writeEvent(res: ServerResponse, name: string, data: unknown): void {
  res.write(encodeSse(name, data));
}
