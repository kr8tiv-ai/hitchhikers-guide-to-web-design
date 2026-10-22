/**
 * Host recommendation and the deploy dispatcher.
 *
 * recommendHost reads `.hitchhiker/research/STACK-DECISION.md` and names
 * a host. It does not upload, spawn, or ask. Hostinger is the suggested
 * host. A site of finished pages can use any of the four hosts. A site
 * that needs a server can use Hostinger or Vercel. The so-long command
 * asks before it calls deploy. This file does not ask.
 *
 * deploy runs one already-confirmed choice through the matching adapter.
 * The caller injects the client. Preview stays on this computer. An
 * injected preview handoff is used when one is passed. Otherwise the
 * local preview serves the built pages and writes the zip. This file
 * does not open a port or build a zip itself.
 * Netlify and Cloudflare reject a server site with their existing messages.
 */

import path from "node:path";
import { deployCloudflare } from "./cloudflare.ts";
import { listDeployFiles } from "./cli-run.ts";
import { deployHostinger, type HostingerClient } from "./hostinger.ts";
import { deployNetlify } from "./netlify.ts";
import type { StaticDeployClient, StaticDeployResult } from "./poll.ts";
import { openPreview, type PreviewSession } from "./preview.ts";
import { readSiteShape, type ShapeDecision, type SiteShape, type StackPick } from "./shape.ts";
import { deployVercel } from "./vercel.ts";

export type PublishHost = "hostinger" | "vercel" | "netlify" | "cloudflare";
export type DeployHost = PublishHost | "preview";

const DEPLOY_HOSTS: readonly DeployHost[] = ["hostinger", "vercel", "netlify", "cloudflare", "preview"];
const DEFAULT_MAX_POLLS = 5;

export interface HostRecommendation {
  suggested: "hostinger";
  /** Hosts that can publish this site. Preview is named separately. */
  allowed: readonly PublishHost[];
  local: "preview";
  reason: string;
  shape: SiteShape;
  pick: StackPick;
}

export interface PreviewHandoff {
  projectDir: string;
  pick: StackPick;
  shape: SiteShape;
  outputDir: string;
}

export interface PreviewClient {
  handoff: (input: PreviewHandoff) => Promise<{ url: string }>;
}

export interface DispatchClients {
  hostinger?: HostingerClient;
  vercel?: StaticDeployClient;
  netlify?: StaticDeployClient;
  cloudflare?: StaticDeployClient;
  preview?: PreviewClient;
}

export interface DispatchDeps {
  /** Explicit true sends. Any other result writes nothing and calls no client. */
  yes: () => Promise<boolean>;
  clients: DispatchClients;
  maxPolls?: number;
}

export interface DispatchRun {
  host: DeployHost;
  state: "completed" | "queued" | "failed";
  uploads: number;
  url: string | null;
}

export type DispatchOutcome = DispatchRun | { declined: true };

function isDeployHost(host: string): host is DeployHost {
  return (DEPLOY_HOSTS as readonly string[]).includes(host);
}

function allowedFor(shape: SiteShape): readonly PublishHost[] {
  if (shape === "static") return ["hostinger", "vercel", "netlify", "cloudflare"];
  return ["hostinger", "vercel"];
}

function plainReason(shape: SiteShape): string {
  if (shape === "static") {
    return [
      "This site is finished pages, so Hostinger, Vercel, Netlify, and Cloudflare can all publish it.",
      "Hostinger is the suggested host.",
      "A copy can also stay on this computer.",
      "Nothing is sent until you confirm.",
    ].join(" ");
  }
  return [
    "This site needs a server to answer each visit.",
    "Hostinger can run that server, and Vercel can too.",
    "Netlify and Cloudflare cannot publish this one.",
    "Hostinger is the suggested host.",
    "A copy can also stay on this computer.",
    "Nothing is sent until you confirm.",
  ].join(" ");
}

/** Read the stack record and suggest a host. Nothing is sent. */
export async function recommendHost(dir: string): Promise<HostRecommendation> {
  const decision = await readSiteShape(dir);
  return {
    suggested: "hostinger",
    allowed: allowedFor(decision.shape),
    local: "preview",
    reason: plainReason(decision.shape),
    shape: decision.shape,
    pick: decision.pick,
  };
}

function hostLabel(host: PublishHost): string {
  switch (host) {
    case "hostinger":
      return "Hostinger";
    case "vercel":
      return "Vercel";
    case "netlify":
      return "Netlify";
    case "cloudflare":
      return "Cloudflare";
    default: {
      const neverHost: never = host;
      throw new Error(`unexpected deploy host ${String(neverHost)}`);
    }
  }
}

function notConnected(host: PublishHost): string {
  return `${hostLabel(host)} is not connected yet. Nothing was sent.`;
}

function ran(host: DeployHost, result: StaticDeployResult, url: string | null): DispatchRun {
  return { host, state: result.state, uploads: result.uploads, url };
}

function refusingStatic(): StaticDeployClient {
  return {
    upload: () => Promise.reject(new Error("The upload ran before the host accepted this site.")),
    poll: () => Promise.reject(new Error("The status check ran before the host accepted this site.")),
  };
}

function directoryClient(
  host: "netlify" | "cloudflare",
  shape: SiteShape,
  clients: DispatchClients,
): StaticDeployClient {
  const client = clients[host];
  if (client !== undefined) return client;
  if (shape === "node") return refusingStatic();
  throw new Error(notConnected(host));
}

async function runHostinger(
  dir: string,
  decision: ShapeDecision,
  client: HostingerClient,
  maxPolls: number,
): Promise<DispatchRun> {
  const files = await listDeployFiles(dir, decision);
  const result = await deployHostinger({
    approved: true,
    kind: decision.shape,
    files,
    maxPolls,
    client,
  });
  return ran("hostinger", result, null);
}

/**
 * The Vercel gate rejects kind node before upload. A server site still
 * uploads once through that same client, which is the prebuilt path.
 */
async function runVercel(client: StaticDeployClient, decision: ShapeDecision, maxPolls: number): Promise<DispatchRun> {
  if (decision.shape === "node") {
    try {
      const accepted = await deployVercel({ approved: true, kind: "node", maxPolls, client });
      return ran("vercel", accepted, null);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Vercel template is not wired") {
        throw error;
      }
    }
  }
  const result = await deployVercel({ approved: true, kind: "static", maxPolls, client });
  return ran("vercel", result, null);
}

async function runDirectoryHost(
  host: "netlify" | "cloudflare",
  client: StaticDeployClient,
  decision: ShapeDecision,
  maxPolls: number,
): Promise<DispatchRun> {
  const input = { approved: true as const, kind: decision.shape, maxPolls, client };
  const result = host === "netlify" ? await deployNetlify(input) : await deployCloudflare(input);
  return ran(host, result, null);
}

const previews = new Map<string, PreviewSession>();

/** Stop the preview `deploy` opened for this project. A second call does nothing. */
export async function closePreview(projectDir: string): Promise<void> {
  const key = path.resolve(projectDir);
  const session = previews.get(key);
  if (session === undefined) return;
  previews.delete(key);
  await session.close();
}

async function trackPreview(projectDir: string, session: PreviewSession): Promise<void> {
  const key = path.resolve(projectDir);
  const prior = previews.get(key);
  previews.set(key, session);
  if (prior !== undefined && prior !== session) await prior.close();
}

async function runInjectedPreview(dir: string, decision: ShapeDecision, client: PreviewClient): Promise<DispatchRun> {
  const handed = await client.handoff({
    projectDir: dir,
    pick: decision.pick,
    shape: decision.shape,
    outputDir: decision.outputDir,
  });
  const url = typeof handed?.url === "string" ? handed.url.trim() : "";
  if (url === "") {
    throw new Error("The preview did not give an address. Nothing was sent.");
  }
  return { host: "preview", state: "completed", uploads: 0, url };
}

async function runPreview(dir: string, decision: ShapeDecision, deps: DispatchDeps): Promise<DispatchRun> {
  const client = deps.clients.preview;
  if (client !== undefined) return runInjectedPreview(dir, decision, client);
  if (decision.shape !== "static") {
    throw new Error(
      "This site needs a server to answer each visit, so there is no folder of finished pages to open on this computer. Nothing was sent.",
    );
  }
  const session = await openPreview({ projectDir: dir, outputDir: decision.outputDir });
  await trackPreview(dir, session);
  return { host: "preview", state: "completed", uploads: 0, url: session.url };
}

/**
 * Send one confirmed choice through the matching adapter.
 * A yes that is not exactly true returns before any client call.
 */
export async function deploy(host: DeployHost, dir: string, deps: DispatchDeps): Promise<DispatchOutcome> {
  if (!isDeployHost(host)) {
    throw new Error("That host is not one of the choices. Nothing was sent.");
  }
  const approved = await deps.yes();
  if (approved !== true) return { declined: true };
  if (typeof deps.clients !== "object" || deps.clients === null) {
    throw new Error("That host is not connected yet. Nothing was sent.");
  }

  const decision = await readSiteShape(dir);
  const maxPolls = deps.maxPolls ?? DEFAULT_MAX_POLLS;
  if (host === "preview") return runPreview(dir, decision, deps);
  if (host === "hostinger") {
    const client = deps.clients.hostinger;
    if (client === undefined) throw new Error(notConnected("hostinger"));
    return runHostinger(dir, decision, client, maxPolls);
  }
  if (host === "vercel") {
    const client = deps.clients.vercel;
    if (client === undefined) throw new Error(notConnected("vercel"));
    return runVercel(client, decision, maxPolls);
  }
  return runDirectoryHost(host, directoryClient(host, decision.shape, deps.clients), decision, maxPolls);
}
