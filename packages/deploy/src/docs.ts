/**
 * DEPLOY.md and HANDOFF.md for one chosen host.
 *
 * Returns markdown strings. This module does not write a client project,
 * does not embed a token, and does not add a live URL.
 *
 * Kind is chosen by the caller. Astro and Vite builds are static uploads.
 * Next.js or other SSR is a Node archive, and only Hostinger accepts that
 * kind. Vercel, Netlify, and Cloudflare reject node because those templates
 * are not wired. See packages/engine/src/spec/stack.ts for how a stack is
 * chosen, and the deploy functions for what each host will actually run.
 *
 * Hostinger Node versions follow the adapter note: 18, 20, 22, and 24.
 * Versions 20 and 22 are the LTS pair named in CONTEXT-PACKAGE section 13.
 */

const HOSTS = ["hostinger", "vercel", "netlify", "cloudflare"] as const;

type Host = (typeof HOSTS)[number];
type Kind = "static" | "node";

const YES = "Nothing deploys without an explicit yes.";

const SECRET_RULES = ["xai-", "Bearer ", "sk-"] as const;

const NODE_REJECTION: Record<Exclude<Host, "hostinger">, string> = {
  vercel: "Vercel template is not wired",
  netlify: "Netlify template is not wired",
  cloudflare: "Cloudflare template is not wired",
};

const NODE_ARCHIVE = [
  "Archive the project without node_modules and keep it at or under 50 MB.",
  "Hostinger builds that archive.",
  "Node versions on this host are 18, 20, 22, and 24.",
  "Versions 20 and 22 are LTS.",
].join(" ");

export interface DeployDocsInput {
  host: Host;
  kind: Kind;
  maintainer: string;
  siteWhy: string;
}

export function renderDeployDocs(input: DeployDocsInput): { deployMd: string; handoffMd: string } {
  const host = readHost(input.host);
  const kind = readKind(input.kind);
  if (kind === "node" && host !== "hostinger") {
    throw new Error(NODE_REJECTION[host]);
  }

  const maintainer = oneLine(input.maintainer, "maintainer is empty");
  const siteWhy = oneLine(input.siteWhy, "siteWhy is empty");
  rejectSecrets(maintainer);
  rejectSecrets(siteWhy);
  rejectBang(maintainer);
  rejectBang(siteWhy);

  const deployMd = renderDeploy(host, kind);
  const handoffMd = renderHandoff(host, kind, maintainer, siteWhy);
  const words = countWords(`${deployMd}\n${handoffMd}`);
  if (words > 500) {
    throw new Error(`deploy docs are ${words} words, over the 500 word cap`);
  }
  if (deployMd.includes("!") || handoffMd.includes("!")) {
    throw new Error("deploy docs contain an exclamation mark");
  }
  return { deployMd, handoffMd };
}

function renderDeploy(host: Host, kind: Kind): string {
  const lines = [
    "# Deploy",
    "",
    `Host: ${label(host)}`,
    shapeLine(kind),
    `Guide function: ${guideFunction(host)}`,
    `Command: ${commandLine(host, kind)}`,
    "The function uploads once and then polls. A queued result is not finished. Do not send the same write again.",
    "",
    YES,
  ];
  return finish(lines);
}

function renderHandoff(host: Host, kind: Kind, maintainer: string, siteWhy: string): string {
  const lines = [
    "# Handoff",
    "",
    `Maintainer: ${maintainer}`,
    `Hosting: ${label(host)}`,
    `Why: ${siteWhy}`,
    "",
    "Edit content in the project files. Deploy the result only after an explicit yes.",
    "Elevate is the upgrade pass. Run /hh-elevate, pick from the ranked list, and keep a pass that holds its gates.",
    blogLine(kind),
    "Renew the domain with the registrar before the renewal date.",
    "",
    rollback(host, kind),
    "",
    YES,
  ];
  return finish(lines);
}

function commandLine(host: Host, kind: Kind): string {
  if (host === "hostinger" && kind === "node") {
    return `deployHostinger with kind node. ${NODE_ARCHIVE}`;
  }
  if (host === "hostinger") {
    return "deployHostinger with kind static. Upload the built files. No second build runs on the host.";
  }
  if (kind !== "static") {
    throw new Error(NODE_REJECTION[host]);
  }
  if (host === "vercel") return "deployVercel. Manual command: `vercel deploy`.";
  if (host === "netlify") return "deployNetlify. Manual command: `netlify deploy`.";
  return "deployCloudflare. Manual command: `wrangler deploy`. Name-server changes stay outside this command.";
}

function guideFunction(host: Host): string {
  switch (host) {
    case "hostinger":
      return "deployHostinger";
    case "vercel":
      return "deployVercel";
    case "netlify":
      return "deployNetlify";
    case "cloudflare":
      return "deployCloudflare";
    default: {
      const neverHost: never = host;
      throw new Error(`unexpected deploy host ${String(neverHost)}`);
    }
  }
}

function rollback(host: Host, kind: Kind): string {
  if (host === "hostinger" && kind === "node") {
    return `Roll back with deployHostinger kind node and the previous archive. ${NODE_ARCHIVE} A queued result is not finished. Do not send the same write again.`;
  }
  if (host === "hostinger") {
    return "Roll back by uploading the previous built files with deployHostinger kind static. A queued result is not finished. Do not send the same write again.";
  }
  const manual =
    host === "vercel" ? "`vercel deploy`" : host === "netlify" ? "`netlify deploy`" : "`wrangler deploy`";
  return `Roll back by running ${manual} for the previous static build. A queued result is not finished. Do not send the same write again.`;
}

function blogLine(kind: Kind): string {
  if (kind === "node") {
    return "Add a blog post as a markdown file in the project, then include it in the next archive.";
  }
  return "Add a blog post as a markdown file in the project, then deploy that new static build.";
}

function shapeLine(kind: Kind): string {
  return kind === "node" ? "This site is Node." : "This site is static.";
}

function label(host: Host): string {
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

function finish(lines: readonly string[]): string {
  return `${lines.join("\n").trim()}\n`;
}

function oneLine(value: unknown, emptyMessage: string): string {
  if (typeof value !== "string") {
    throw new Error(emptyMessage);
  }
  const flat = value.replace(/[\r\n]+/g, " ").trim();
  if (flat === "") {
    throw new Error(emptyMessage);
  }
  return flat;
}

function rejectSecrets(value: string): void {
  for (const rule of SECRET_RULES) {
    if (value.includes(rule)) {
      throw new Error(`Refusing a secret-shaped token (${rule}).`);
    }
  }
}

function rejectBang(value: string): void {
  if (value.includes("!")) {
    throw new Error("exclamation marks are not allowed");
  }
}

function readHost(value: unknown): Host {
  if (typeof value !== "string") {
    throw new Error("unexpected deploy host");
  }
  if (value === "undecided") {
    throw new Error("deploy host undecided");
  }
  if (isHost(value)) return value;
  throw new Error("unexpected deploy host");
}

function readKind(value: unknown): Kind {
  if (value === "static" || value === "node") return value;
  throw new Error("deploy kind must be static or node");
}

function isHost(value: string): value is Host {
  return (HOSTS as readonly string[]).includes(value);
}

function countWords(markdown: string): number {
  const trimmed = markdown.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}
