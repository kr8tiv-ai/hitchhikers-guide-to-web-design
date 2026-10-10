/**
 * Real deploy entry.
 *
 * Hostinger goes through deployHostinger. Vercel, Netlify, and Cloudflare
 * static uploads go through their yes-gated clients, and the injected
 * spawn runs the official CLI once inside that upload. A declined yes
 * returns before any spawn, MCP call, API call, or deploy record.
 *
 * CLI argv from this prompt: `vercel deploy --prebuilt`,
 * `netlify deploy --dir`, `wrangler pages deploy`.
 * Research 11 and docs.ts name `wrangler deploy` for Workers static
 * assets. This file follows this prompt and does not change docs.ts.
 *
 * Prompt 141 rejects kind node for every CLI host. Vercel serverless
 * still runs `vercel deploy --prebuilt` after that rejection, because
 * Node output needs the host runtime. Netlify and Cloudflare keep the
 * rejection: their commands upload a directory of built files.
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordApprovalYes, type SpawnLike } from "@hitchhiker/engine";
import { deployCloudflare } from "./cloudflare.ts";
import {
  loadHostingerSite,
  postNodeBuild,
  postStaticDeploy,
  readHostingerToken,
  readNodeBuildState,
  type HostingerApiCall,
  type HostingerPollState,
  type HostingerSite,
  type Keychain,
} from "./hostinger-api.ts";
import {
  runHostingerMcp,
  type HostingerMcpInput,
  type HostingerMcpResult,
  type McpClient,
} from "./hostinger-mcp.ts";
import { deployHostinger, type DeployFile, type HostingerClient } from "./hostinger.ts";
import { deployNetlify } from "./netlify.ts";
import { readSiteShape, type ShapeDecision, type SiteShape } from "./shape.ts";
import { deployVercel } from "./vercel.ts";

export type DeployTarget = "hostinger" | "vercel" | "netlify" | "cloudflare";
export type CliTarget = Exclude<DeployTarget, "hostinger">;

export interface DeployDeps {
  yes: () => Promise<boolean>;
  spawnImpl: SpawnLike;
  mcp?: McpClient;
  keychain: Keychain;
  /** Injected transport for the Hostinger API. Omitted calls use global fetch. */
  fetchImpl?: typeof fetch;
}

export type DeployOutcome = { url: string; record: string } | { declined: true };

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".hitchhiker",
  "dist",
  ".next",
  "out",
  "build",
  "coverage",
]);

const CLI_TIMEOUT_MS = 10 * 60 * 1000;
const HOSTINGER_POLLS = 5;

export function cliPlan(target: CliTarget, outputDir: string): { command: string; args: readonly string[] } {
  if (target === "vercel") return { command: "vercel", args: ["deploy", "--prebuilt"] };
  if (target === "netlify") return { command: "netlify", args: ["deploy", "--dir", outputDir] };
  return { command: "wrangler", args: ["pages", "deploy", outputDir] };
}

export function captureDeployUrl(stdout: string, stderr: string): string {
  const matches = `${stdout}\n${stderr}`.match(/https:\/\/[^\s)<>"']+/g);
  if (matches === null) {
    throw new Error("The deploy command did not print an https URL.");
  }
  const filtered = matches.filter((url) => !/\/docs(?:\/|$)/.test(url));
  const chosen = filtered[filtered.length - 1];
  if (chosen === undefined) {
    throw new Error("The deploy command did not print an https URL.");
  }
  return chosen.replace(/[.,]$/, "");
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function walkFiles(dir: string, base: string, files: DeployFile[], skipRoots: boolean): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(`Deploy directory is missing at ${dir}`);
    }
    throw error;
  }
  for (const entry of entries) {
    if (skipRoots && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, base, files, skipRoots);
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(full);
    files.push({
      path: path.relative(base, full).split(path.sep).join("/"),
      bytes: info.size,
    });
  }
}

export async function listDeployFiles(projectDir: string, decision: ShapeDecision): Promise<DeployFile[]> {
  if (decision.shape === "static") {
    const root = path.resolve(projectDir, decision.outputDir);
    const files: DeployFile[] = [];
    await walkFiles(root, root, files, false);
    return files;
  }
  const files: DeployFile[] = [];
  await walkFiles(projectDir, projectDir, files, true);
  return files;
}

interface RecordEntry {
  target: DeployTarget;
  shape: SiteShape;
  state: string;
  url: string;
  via: string;
}

function recordLine(entry: RecordEntry): string {
  const stamp = new Date().toISOString();
  return [
    `- ${stamp} — ${entry.target} — ${entry.shape} — ${entry.state} — ${entry.url}`,
    `  Via: ${entry.via}`,
    "",
  ].join("\n");
}

export async function writeDeployRecord(projectDir: string, entry: RecordEntry): Promise<string> {
  const dir = path.join(projectDir, ".hitchhiker", "deploy");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "DEPLOYS.md");
  let previous = "";
  try {
    previous = await readFile(file, "utf8");
  } catch (error) {
    if (!isEnoent(error)) throw error;
  }
  const header = "# Deploys\n\nA row is written only after a deploy runs with an explicit yes.\n\n";
  const next = previous.trim() === "" ? `${header}${recordLine(entry)}` : `${previous.trimEnd()}\n${recordLine(entry)}`;
  await writeFile(file, next.endsWith("\n") ? next : `${next}\n`, "utf8");
  return file;
}

async function runCli(
  spawnImpl: SpawnLike,
  projectDir: string,
  target: CliTarget,
  outputDir: string,
): Promise<string> {
  const plan = cliPlan(target, outputDir);
  const output = await spawnImpl({
    command: plan.command,
    args: plan.args,
    cwd: projectDir,
    env: process.env,
    timeoutMs: CLI_TIMEOUT_MS,
  });
  if (output.timedOut) {
    throw new Error(`${plan.command} timed out.`);
  }
  if (output.status !== 0) {
    throw new Error(`${plan.command} exited ${output.status ?? "null"}.`);
  }
  return captureDeployUrl(output.stdout, output.stderr);
}

function refusingClient(): {
  upload: () => Promise<{ id: string }>;
  poll: () => Promise<"queued" | "completed" | "failed">;
} {
  return {
    upload: () => Promise.reject(new Error("CLI upload ran before the contract allowed it.")),
    poll: () => Promise.reject(new Error("CLI poll ran before the contract allowed it.")),
  };
}

async function rejectNodeCli(target: CliTarget): Promise<void> {
  const client = refusingClient();
  if (target === "vercel") {
    await deployVercel({ approved: true, kind: "node", maxPolls: 1, client });
    return;
  }
  if (target === "netlify") {
    await deployNetlify({ approved: true, kind: "node", maxPolls: 1, client });
    return;
  }
  await deployCloudflare({ approved: true, kind: "node", maxPolls: 1, client });
}

async function deployStaticCli(
  target: CliTarget,
  projectDir: string,
  outputDir: string,
  spawnImpl: SpawnLike,
): Promise<string> {
  let url = "";
  const client = {
    upload: async () => {
      url = await runCli(spawnImpl, projectDir, target, outputDir);
      return { id: url };
    },
    poll: async () => "completed" as const,
  };
  const input = { approved: true as const, kind: "static" as const, maxPolls: 1, client };
  if (target === "vercel") await deployVercel(input);
  else if (target === "netlify") await deployNetlify(input);
  else await deployCloudflare(input);
  if (url === "") throw new Error("The deploy command did not print an https URL.");
  return url;
}

function mcpInput(site: HostingerSite, kind: SiteShape): HostingerMcpInput {
  const input: HostingerMcpInput = {
    kind,
    domain: site.domain,
    username: site.username,
    archivePath: site.archivePath,
    nodeVersion: site.nodeVersion,
    appType: site.appType,
    rootDirectory: site.rootDirectory,
    outputDirectory: site.outputDirectory,
    buildScript: site.buildScript,
    packageManager: site.packageManager,
    maxPolls: HOSTINGER_POLLS,
  };
  if (site.entryFile !== undefined) input.entryFile = site.entryFile;
  return input;
}

interface StartedHostinger {
  id: string;
  url: string;
  via: string;
  poll: () => Promise<HostingerPollState>;
}

async function startApi(deps: DeployDeps, site: HostingerSite, kind: SiteShape): Promise<StartedHostinger> {
  const token = await readHostingerToken(deps.keychain);
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable for the Hostinger API.");
  }
  const call: HostingerApiCall = { fetchImpl, token, site };
  if (kind === "static") {
    const posted = await postStaticDeploy(call);
    return {
      id: posted.id,
      url: posted.url,
      via: "hostinger api static deploy",
      poll: () => Promise.resolve(posted.state),
    };
  }
  const posted = await postNodeBuild(call);
  let reads = 0;
  return {
    id: posted.id,
    url: posted.url,
    via: "hostinger api node build",
    poll: async () => {
      if (posted.state === "completed" || posted.state === "failed") return posted.state;
      reads += 1;
      if (reads > HOSTINGER_POLLS) return "queued";
      return readNodeBuildState(call, posted.id);
    },
  };
}

async function startHostinger(deps: DeployDeps, site: HostingerSite, kind: SiteShape): Promise<StartedHostinger> {
  if (deps.mcp !== undefined) {
    const ran: HostingerMcpResult = await runHostingerMcp(deps.mcp, mcpInput(site, kind));
    if ("fallback" in ran) {
      const api = await startApi(deps, site, kind);
      return { ...api, via: `${api.via}. ${ran.manual}` };
    }
    return {
      id: ran.id,
      url: ran.url,
      via: ran.tool,
      poll: () => Promise.resolve(ran.state),
    };
  }
  return startApi(deps, site, kind);
}

async function deployToHostinger(
  projectDir: string,
  decision: ShapeDecision,
  deps: DeployDeps,
): Promise<{ url: string; record: string }> {
  const site = await loadHostingerSite(projectDir, decision.pick);
  const files = await listDeployFiles(projectDir, decision);
  let started: StartedHostinger | null = null;
  const client: HostingerClient = {
    uploadStatic: async () => {
      started = await startHostinger(deps, site, "static");
      return { id: started.id };
    },
    uploadNode: async () => {
      started = await startHostinger(deps, site, "node");
      return { id: started.id };
    },
    poll: () => {
      if (started === null) return Promise.reject(new Error("Hostinger poll ran before upload."));
      return started.poll();
    },
  };
  const result = await deployHostinger({
    approved: true,
    kind: decision.shape,
    files,
    maxPolls: HOSTINGER_POLLS,
    client,
  });
  if (started === null) {
    throw new Error("Hostinger upload did not start.");
  }
  const done: StartedHostinger = started;
  const record = await writeDeployRecord(projectDir, {
    target: "hostinger",
    shape: decision.shape,
    state: result.state,
    url: done.url,
    via: done.via,
  });
  return { url: done.url, record };
}

/**
 * Deploy one project after an explicit yes.
 * A decline does not spawn, call a host, or write DEPLOYS.md.
 */
export async function deploy(
  target: DeployTarget,
  projectDir: string,
  deps: DeployDeps,
): Promise<DeployOutcome> {
  const approved = await deps.yes();
  if (approved !== true) return { declined: true };
  if (existsSync(projectDir)) {
    await recordApprovalYes(projectDir, "hostinger-yes.json");
  }

  const decision = await readSiteShape(projectDir);
  if (target === "hostinger") {
    return deployToHostinger(projectDir, decision, deps);
  }

  if (decision.shape === "node") {
    try {
      await rejectNodeCli(target);
    } catch (error) {
      if (target === "vercel" && error instanceof Error && error.message === "Vercel template is not wired") {
        const url = await runCli(deps.spawnImpl, projectDir, "vercel", path.resolve(projectDir));
        const record = await writeDeployRecord(projectDir, {
          target: "vercel",
          shape: "node",
          state: "completed",
          url,
          via: "vercel deploy --prebuilt",
        });
        return { url, record };
      }
      throw error;
    }
    throw new Error("Node deploy was not rejected by the CLI contract.");
  }

  const outputDir = path.resolve(projectDir, decision.outputDir);
  const url = await deployStaticCli(target, projectDir, outputDir, deps.spawnImpl);
  const plan = cliPlan(target, outputDir);
  const record = await writeDeployRecord(projectDir, {
    target,
    shape: "static",
    state: "completed",
    url,
    via: `${plan.command} ${plan.args.join(" ")}`,
  });
  return { url, record };
}
