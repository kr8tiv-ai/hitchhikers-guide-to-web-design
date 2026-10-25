/**
 * 250i. Real Grok build of the towel sample, off unless HH_REAL_GROK_E2E=1.
 * This module registers no tests. The flagged test and the always-on guard import it.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { copyFile, mkdtemp } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BUILD_EFFORT,
  BUILD_MODEL,
  advanceDesignStages,
  approveSiteBrief,
  approveSitePlan,
  chooseDirection,
  clearProjectBuildRunner,
  configureSiteBuildWatch,
  dealDirections,
  designReadyForBuild,
  getBuildRunner,
  hiddenChildOptions,
  installLiveBuildRunner,
  loadConfig,
  loadQueue,
  openInterview,
  packagedModule,
  prepareSiteBuild,
  readBriefDesk,
  readBuildRun,
  redact,
  resetSiteBuildWatch,
  restoreProject,
  saveDirectionDeal,
  setBuildRunner,
  setProjectBuildRunner,
  siteBuildSettled,
  startSiteBuild,
  think,
  type BuildSpawn,
  type BuildSpawnHandle,
  type BuildSpawnRequest,
} from "@hitchhiker/engine";

export const REAL_GROK_E2E_SKIP = "set HH_REAL_GROK_E2E=1 to run a real Grok build";

/** The golden-path cassette writes this page. A real build must not match it. */
export const GOLDEN_PATH_FIXTURE_HTML =
  "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>Mostly Towels</title></head>\n<body><h1>Mostly Towels</h1><p>The shop sells towels for the home.</p></body>\n</html>\n";

const DEFAULT_PROMPTS = 3;
const DEFAULT_MINUTES = 60;
const MAX_PROMPTS = 999;
const MAX_MINUTES = 24 * 60;
const SAMPLE_ANSWER = "For a client who sells towels.";
const FALLBACK_CONFIRM = "Confirm the interview fallback before approving.";
const RESERVED_PORTS = new Set([4175, 4188, 4210]);
const BRIEF_STOP = new Set([
  "about",
  "their",
  "there",
  "which",
  "these",
  "those",
  "would",
  "could",
  "should",
  "field",
  "stated",
  "brief",
  "pages",
  "client",
]);

const GATE_NAMES = ["lh", "a11y", "console", "links", "weight", "screenshots"] as const;

export interface RealGrokE2eScope {
  maxPrompts: number;
  minutes: number;
}

export interface QueuePick {
  id: string;
  status: string;
}

export interface PromptSelection {
  keep: string[];
  pause: string[];
}

interface GateRow {
  name: string;
  verdict: "PASS" | "BLOCKER";
}

interface E2eReport {
  prompts: string[];
  gates: GateRow[];
}

class E2eBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "E2eBudgetError";
  }
}

function positiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined || !/^[1-9]\d*$/.test(raw)) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) return fallback;
  return value;
}

/** Reads only the object it is given. Empty, zero, and non-integers fall back to the defaults. */
export function parseRealGrokE2eScope(env: NodeJS.ProcessEnv): RealGrokE2eScope {
  return {
    maxPrompts: positiveInt(env.HH_REAL_GROK_E2E_MAX_PROMPTS, DEFAULT_PROMPTS, MAX_PROMPTS),
    minutes: positiveInt(env.HH_REAL_GROK_E2E_MINUTES, DEFAULT_MINUTES, MAX_MINUTES),
  };
}

/**
 * Keep the scaffold prompt, then section-layout prompts, then the rest of the
 * queued build ids. The plan writes brand prompts before the scaffold, so the
 * first three queue rows are not the practical scope. Default 3 is the scaffold
 * and the first two section layouts. A larger cap continues through the queue.
 * When the plan has no scaffold and no section layout, the first queued ids are kept.
 */
export function selectRealGrokPromptIds(
  items: readonly QueuePick[],
  requirementsById: Readonly<Record<string, readonly string[]>>,
  maxPrompts: number,
): PromptSelection {
  const numericQueued = items.filter((item) => item.status === "queued" && /^\d{3}$/.test(item.id));
  const scaffold: string[] = [];
  const sections: string[] = [];
  const others: string[] = [];
  for (const item of numericQueued) {
    const reqs = requirementsById[item.id] ?? [];
    const isScaffold = reqs.some((req) => req === "REQ-SCAFFOLD" || req.startsWith("REQ-SCAFFOLD-"));
    const isSection = reqs.some((req) => req.startsWith("REQ-STRUCT-"));
    if (isScaffold && scaffold.length === 0) scaffold.push(item.id);
    else if (isSection) sections.push(item.id);
    else others.push(item.id);
  }
  const preferred: string[] = [];
  const seen = new Set<string>();
  for (const id of [...scaffold, ...sections, ...others]) {
    if (seen.has(id)) continue;
    seen.add(id);
    preferred.push(id);
  }
  const cap = maxPrompts < 1 ? 1 : maxPrompts;
  const keep = preferred.slice(0, cap);
  const keepSet = new Set(keep);
  return {
    keep,
    pause: numericQueued.map((item) => item.id).filter((id) => !keepSet.has(id)),
  };
}

function towelSample(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 6; hop += 1) {
    const candidate = path.join(dir, "samples", "towel-day.hhproject");
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("The towel sample could not be found.");
}

function lastChars(text: string, count: number): string {
  return text.length <= count ? text : text.slice(text.length - count);
}

function requirementsOf(projectDir: string, id: string): string[] {
  const file = path.join(projectDir, ".hitchhiker", "prompts", `${id}.md`);
  if (!existsSync(file)) return [];
  const reqs: string[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^Requirements:\s*(.+)$/.exec(line.trim());
    if (match?.[1] === undefined) continue;
    for (const part of match[1].split(",")) {
      const trimmed = part.trim();
      if (trimmed !== "") reqs.push(trimmed);
    }
  }
  return reqs;
}

function applyPromptCap(projectDir: string, maxPrompts: number): string[] {
  const file = path.join(projectDir, ".hitchhiker", "queue.json");
  if (!existsSync(file)) return [];
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];
  const record = parsed as { items?: unknown };
  if (!Array.isArray(record.items)) return [];
  const items: QueuePick[] = [];
  for (const item of record.items) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as { id?: unknown; status?: unknown };
    if (typeof row.id !== "string" || typeof row.status !== "string") continue;
    items.push({ id: row.id, status: row.status });
  }
  const requirements: Record<string, string[]> = {};
  for (const item of items) {
    if (item.status === "queued" && /^\d{3}$/.test(item.id)) requirements[item.id] = requirementsOf(projectDir, item.id);
  }
  const choice = selectRealGrokPromptIds(items, requirements, maxPrompts);
  const pause = new Set(choice.pause);
  let changed = false;
  for (const item of record.items) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as { id?: unknown; status?: unknown };
    if (typeof row.id !== "string" || !pause.has(row.id) || row.status !== "queued") continue;
    row.status = "paused";
    changed = true;
  }
  if (changed) writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return choice.keep;
}

function failureTail(projectDir: string, promptId: string | null): string {
  const chunks: string[] = [];
  const run = readBuildRun(projectDir);
  if (run !== null && (promptId === null || run.promptId === promptId)) {
    if (run.reason.trim() !== "") chunks.push(run.reason);
    if (run.lastLines.length > 0) chunks.push(run.lastLines.join("\n"));
  }
  if (promptId !== null) {
    const log = path.join(projectDir, ".hitchhiker", "logs", `build-${promptId}.log`);
    if (existsSync(log)) chunks.push(lastChars(readFileSync(log, "utf8"), 4000));
  }
  return redact(lastChars(chunks.join("\n\n"), 4000));
}

function failedHandle(stderr: string): BuildSpawnHandle {
  return {
    pid: 0,
    done: Promise.resolve({ code: 1, stdout: "", stderr, errorCode: null }),
  };
}

function skippedHandle(): BuildSpawnHandle {
  return {
    pid: 0,
    done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }),
  };
}

function quoteCmdArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (!/[\s"&|<>^()%!`]/.test(arg)) return arg;
  let out = '"';
  let slashes = 0;
  for (const char of arg) {
    if (char === "\\") {
      slashes += 1;
      continue;
    }
    if (char === "%") {
      if (slashes > 0) out += "\\".repeat(slashes * 2);
      slashes = 0;
      out += '"^%"';
      continue;
    }
    if (char === '"') {
      out += `${"\\".repeat(slashes * 2)}\\"`;
      slashes = 0;
      continue;
    }
    if (slashes > 0) {
      out += "\\".repeat(slashes);
      slashes = 0;
    }
    out += char;
  }
  if (slashes > 0) out += "\\".repeat(slashes * 2);
  return `${out}"`;
}

function comSpec(): string {
  if (typeof process.env.ComSpec === "string" && process.env.ComSpec.length > 0) return process.env.ComSpec;
  if (typeof process.env.COMSPEC === "string" && process.env.COMSPEC.length > 0) return process.env.COMSPEC;
  return "cmd.exe";
}

function toolLaunch(bin: string, args: readonly string[]): { command: string; args: string[]; verbatim: boolean } {
  if (process.platform !== "win32") return { command: bin, args: [...args], verbatim: false };
  const line = [`${bin}.cmd`, ...args.map(quoteCmdArg)].join(" ");
  return { command: comSpec(), args: ["/d", "/s", "/c", `"${line}"`], verbatim: true };
}

function killTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { windowsHide: true, stdio: "ignore" });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process is already gone.
  }
}

function blockedGates(): GateRow[] {
  return GATE_NAMES.map((name) => ({ name, verdict: "BLOCKER" as const }));
}

function briefWords(brief: string): string[] {
  const found = brief.toLowerCase().match(/[a-z]{5,}/g) ?? [];
  const words: string[] = [];
  const seen = new Set<string>();
  for (const word of found) {
    if (BRIEF_STOP.has(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
  }
  return words;
}

function assertBuiltPage(projectDir: string, originalBrief: string): void {
  const file = path.join(projectDir, "dist", "index.html");
  if (!existsSync(file)) throw new Error("dist/index.html is missing. The stack build did not write it.");
  const html = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (html === GOLDEN_PATH_FIXTURE_HTML) throw new Error("dist/index.html is the golden-path fixture.");
  const words = briefWords(originalBrief);
  const lower = html.toLowerCase();
  if (words.length === 0 || !words.some((word) => lower.includes(word))) {
    throw new Error("dist/index.html does not contain text from the towel brief.");
  }
}

async function finishInterview(projectDir: string): Promise<void> {
  const session = await openInterview(projectDir, loadConfig(projectDir).interviewDepth);
  const seen = new Set<string>();
  for (let guard = 0; guard < 400; guard += 1) {
    const question = session.next();
    if (question === null) return;
    if (seen.has(question.id)) throw new Error("A question stayed open, so the interview could not finish.");
    seen.add(question.id);
    await session.command({ type: "keep", text: SAMPLE_ANSWER });
  }
  throw new Error("The interview did not finish.");
}

async function approveBrief(projectDir: string): Promise<void> {
  try {
    await approveSiteBrief(projectDir, think);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === FALLBACK_CONFIRM) {
      await approveSiteBrief(projectDir, think, { confirmFallback: true });
      return;
    }
    throw error;
  }
}

function passDesignStages(projectDir: string, brief: string): void {
  advanceDesignStages(projectDir, { brief, approval: { stage: "sitemap", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "wireframe", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "style-guide", text: "Approved." } });
  const deal = dealDirections();
  saveDirectionDeal(projectDir, deal);
  const first = deal.directions[0];
  if (first === undefined) throw new Error("The design did not offer a direction.");
  chooseDirection(projectDir, first.id, "It fits the visit.");
  advanceDesignStages(projectDir, { brief, approval: { stage: "style-guide", text: "Approved." } });
  advanceDesignStages(projectDir, { brief, approval: { stage: "direction", text: "Approved." } });
  advanceDesignStages(projectDir, {
    brief,
    approval: { stage: "prebuild", text: "Approved." },
    acknowledge: true,
  });
}

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".json") return "application/json";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".woff") return "font/woff";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function fileUnderDist(root: string, rawUrl: string): string | null {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(rawUrl, "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  const full = path.resolve(root, pathname.replace(/^[/\\]+/, ""));
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(`${base}${path.sep}`)) return null;
  if (!existsSync(full)) return null;
  if (statSync(full).isDirectory()) {
    const index = path.join(full, "index.html");
    return existsSync(index) ? index : null;
  }
  return statSync(full).isFile() ? full : null;
}

function serveFile(root: string, req: IncomingMessage, res: ServerResponse): void {
  const target = fileUnderDist(root, req.url ?? "/");
  if (target === null) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const body = readFileSync(target);
  res.writeHead(200, { "content-type": contentType(target), "content-length": body.length });
  res.end(body);
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("error", onError);
      reject(error);
    };
    server.on("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("The review server did not bind."));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function serveDist(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const server = createServer((req, res) => {
      try {
        serveFile(root, req, res);
      } catch {
        if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("The review server could not read that file.");
      }
    });
    try {
      const port = await listen(server);
      if (RESERVED_PORTS.has(port)) {
        await closeServer(server);
        continue;
      }
      return { url: `http://127.0.0.1:${port}`, close: () => closeServer(server) };
    } catch (error) {
      await closeServer(server).catch(() => undefined);
      if (attempt === 4) throw error;
    }
  }
  throw new Error("The review server was offered a reserved port.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function verdictOf(value: unknown): "PASS" | "BLOCKER" {
  return value === "PASS" ? "PASS" : "BLOCKER";
}

async function loadDeskReview(): Promise<{
  runGates: (url: string, routes: string[]) => Promise<unknown>;
  toGateResult: (report: unknown) => { lh: string; a11y: string; console: string; links: string; weight: string };
  captureReviewShots: (url: string, sections: string[], outDir: string) => Promise<string[]>;
} | null> {
  const gates = asRecord(await import(pathToFileURL(packagedModule("qa", "src/site-once-over.ts")).href));
  const loop = asRecord(await import(pathToFileURL(packagedModule("qa", "src/elevate-loop.ts")).href));
  const shots = asRecord(await import(pathToFileURL(packagedModule("qa", "src/playwright-opener.ts")).href));
  if (
    typeof gates?.runGates !== "function" ||
    typeof loop?.toGateResult !== "function" ||
    typeof shots?.captureReviewShots !== "function"
  ) {
    return null;
  }
  return {
    runGates: gates.runGates as (url: string, routes: string[]) => Promise<unknown>,
    toGateResult: loop.toGateResult as (report: unknown) => {
      lh: string;
      a11y: string;
      console: string;
      links: string;
      weight: string;
    },
    captureReviewShots: shots.captureReviewShots as (url: string, sections: string[], outDir: string) => Promise<string[]>,
  };
}

async function reviewDist(url: string, projectDir: string): Promise<GateRow[]> {
  const rows = blockedGates();
  const qa = await loadDeskReview();
  if (qa === null) return rows;
  const target = url.endsWith("/") ? url : `${url}/`;
  try {
    const mapped = qa.toGateResult(await qa.runGates(target, ["/"]));
    rows[0] = { name: "lh", verdict: verdictOf(mapped.lh) };
    rows[1] = { name: "a11y", verdict: verdictOf(mapped.a11y) };
    rows[2] = { name: "console", verdict: verdictOf(mapped.console) };
    rows[3] = { name: "links", verdict: verdictOf(mapped.links) };
    rows[4] = { name: "weight", verdict: verdictOf(mapped.weight) };
  } catch {
    // A thrown review is recorded. It does not decide the e2e by itself.
  }
  try {
    const shots = await qa.captureReviewShots(target, [], path.join(projectDir, ".hitchhiker", "e2e-250i-shots"));
    rows[5] = { name: "screenshots", verdict: Array.isArray(shots) && shots.length > 0 ? "PASS" : "BLOCKER" };
  } catch {
    // Screenshots stay BLOCKER when the browser pass throws.
  }
  return rows;
}

export async function runRealGrokTowelE2e(): Promise<void> {
  const scope = parseRealGrokE2eScope(process.env);
  const deadline = Date.now() + scope.minutes * 60_000;
  const report: E2eReport = { prompts: [], gates: [] };
  const kept: { ids: string[] } = { ids: [] };
  const stops: Array<() => void> = [];
  const children: ChildProcess[] = [];
  let projectDir: string | null = null;
  let published = false;
  let installed = false;
  let closeReview: (() => Promise<void>) | null = null;
  const previousRunner = getBuildRunner();
  const previousCassette = process.env.HH_CASSETTE;
  const previousHome = process.env.HH_PROJECT_HOME;
  delete process.env.HH_CASSETTE;

  const remaining = (): number => deadline - Date.now();
  const killStarted = (): void => {
    for (const stop of stops) {
      try {
        stop();
      } catch {
        // A child that already exited has nothing to stop.
      }
    }
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      const pid = child.pid;
      try {
        child.kill();
      } catch {
        // The tool process is already gone.
      }
      if (typeof pid === "number") killTree(pid);
    }
    if (projectDir !== null) {
      const run = readBuildRun(projectDir);
      if (run?.status === "running" && typeof run.pid === "number") killTree(run.pid);
    }
  };
  const budgetError = (): E2eBudgetError =>
    new E2eBudgetError(
      redact(
        `The real Grok build exceeded ${scope.minutes} minutes.\n${projectDir === null ? "" : failureTail(projectDir, null)}`,
      ),
    );
  const publish = (): void => {
    if (published || projectDir === null) return;
    published = true;
    const file = path.join(projectDir, ".hitchhiker", "e2e-250i.json");
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(path.resolve(file));
  };

  const withinBudget = async <T>(work: Promise<T>): Promise<T> => {
    const left = remaining();
    if (left <= 0) {
      killStarted();
      throw budgetError();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        killStarted();
        reject(budgetError());
      }, left);
    });
    void work.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const runTool = (bin: string, args: readonly string[]): Promise<void> => {
    if (projectDir === null) return Promise.reject(new Error("The temp project is missing."));
    const launch = toolLaunch(bin, args);
    const cwd = projectDir;
    return new Promise((resolve, reject) => {
      const child = spawn(
        launch.command,
        launch.args,
        hiddenChildOptions({
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
          ...(launch.verbatim ? { windowsVerbatimArguments: true } : {}),
        }),
      );
      children.push(child);
      let stderr = "";
      let stdout = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr = lastChars(stderr + chunk.toString("utf8"), 8000);
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout = lastChars(stdout + chunk.toString("utf8"), 8000);
      });
      child.on("error", (error) => {
        reject(new Error(redact(`${bin} ${args.join(" ")} did not start.\n${error.message}`)));
      });
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        const detail = stderr.trim() !== "" ? stderr : stdout;
        reject(new Error(redact(`${bin} ${args.join(" ")} failed.\n${lastChars(detail, 4000)}`)));
      });
    });
  };

  const capSpawn = (live: BuildSpawn): BuildSpawn => {
    let capped = false;
    return (request: BuildSpawnRequest): BuildSpawnHandle => {
      if (projectDir === null) return failedHandle("The temp project is missing.");
      if (!capped) {
        kept.ids = applyPromptCap(projectDir, scope.maxPrompts);
        capped = true;
        if (!kept.ids.includes(request.promptId)) return skippedHandle();
      } else if (!kept.ids.includes(request.promptId)) {
        return failedHandle(`Prompt ${request.promptId} is outside the e2e prompt cap.`);
      }
      if (request.model !== BUILD_MODEL || request.effort !== BUILD_EFFORT) {
        return failedHandle(`The live build asked for ${request.model} at effort ${request.effort}.`);
      }
      const handle = live(request);
      if (handle.stop !== undefined) stops.push(handle.stop);
      return handle;
    };
  };

  try {
    projectDir = await mkdtemp(path.join(os.tmpdir(), "hh-250i-towel-"));
    const home = path.join(projectDir, "project-home");
    mkdirSync(home);
    process.env.HH_PROJECT_HOME = home;

    const sampleCopy = path.join(projectDir, "towel-day.hhproject");
    await copyFile(towelSample(), sampleCopy);
    const restored = await restoreProject(sampleCopy, { projectDir, prefer: "file" });
    if (path.resolve(restored.projectDir) !== path.resolve(projectDir)) {
      throw new Error("The towel sample did not open into the temp project.");
    }
    const briefFile = path.join(projectDir, ".hitchhiker", "SITE-BRIEF.md");
    if (!existsSync(briefFile)) throw new Error("The towel sample did not include a site brief.");
    const originalBrief = readFileSync(briefFile, "utf8");

    await withinBudget(finishInterview(projectDir));
    await withinBudget(approveBrief(projectDir));
    const planned = await withinBudget(approveSitePlan(projectDir));
    const brief = planned.markdown.trim() !== "" ? planned.markdown : readBriefDesk(projectDir).markdown;
    if (brief.trim() === "") throw new Error("The approved brief is empty.");
    passDesignStages(projectDir, brief);
    const ready = designReadyForBuild(projectDir, brief);
    if (!ready.ok) throw new Error(ready.reason || "The design is not ready to build.");

    await withinBudget(prepareSiteBuild(projectDir, brief));
    kept.ids = applyPromptCap(projectDir, scope.maxPrompts);
    installLiveBuildRunner();
    installed = true;
    const live = getBuildRunner();
    if (live === null) throw new Error("The live build runner did not install.");
    setProjectBuildRunner(projectDir, capSpawn(live));
    configureSiteBuildWatch(projectDir, { idleMs: scope.minutes * 60_000 });

    const started = await withinBudget(startSiteBuild(projectDir));
    if (!started.buildStarted) {
      throw new Error(started.error.trim() !== "" ? started.error : "The build did not start.");
    }
    await withinBudget(siteBuildSettled(projectDir));

    const queue = await loadQueue(projectDir);
    report.prompts = kept.ids.filter((id) => queue?.items.some((item) => item.id === id && item.status === "passed") === true);
    const failed = kept.ids.find((id) => !report.prompts.includes(id));
    if (failed !== undefined) {
      throw new Error(`Prompt ${failed} failed.\n${failureTail(projectDir, failed)}`);
    }
    if (report.prompts.length === 0) throw new Error(`The build did not pass a prompt.\n${failureTail(projectDir, null)}`);

    const packageFile = path.join(projectDir, "package.json");
    if (!existsSync(packageFile)) throw new Error("The project has no package.json, so the stack build cannot run.");
    const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as { scripts?: { build?: unknown }; packageManager?: unknown };
    if (typeof pkg.scripts?.build !== "string" || pkg.scripts.build.trim() === "") {
      throw new Error("The project package.json has no build script.");
    }
    const usePnpm =
      existsSync(path.join(projectDir, "pnpm-lock.yaml")) ||
      (typeof pkg.packageManager === "string" && pkg.packageManager.startsWith("pnpm"));
    const bin = usePnpm ? "pnpm" : "npm";
    if (!existsSync(path.join(projectDir, "node_modules"))) await withinBudget(runTool(bin, ["install"]));
    await withinBudget(runTool(bin, ["run", "build"]));
    assertBuiltPage(projectDir, originalBrief);

    const served = await serveDist(path.join(projectDir, "dist"));
    closeReview = served.close;
    try {
      report.gates = await withinBudget(reviewDist(served.url, projectDir));
    } catch (error: unknown) {
      report.gates = blockedGates();
      if (error instanceof E2eBudgetError) throw error;
    }
    publish();
  } catch (error: unknown) {
    publish();
    throw error;
  } finally {
    if (closeReview !== null) await closeReview().catch(() => undefined);
    killStarted();
    if (projectDir !== null) {
      clearProjectBuildRunner(projectDir);
      resetSiteBuildWatch(projectDir);
    }
    if (installed) setBuildRunner(previousRunner);
    if (previousCassette === undefined) delete process.env.HH_CASSETTE;
    else process.env.HH_CASSETTE = previousCassette;
    if (previousHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = previousHome;
  }
}
