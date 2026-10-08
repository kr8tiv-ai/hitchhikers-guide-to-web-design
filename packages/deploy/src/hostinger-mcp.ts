/**
 * Hostinger MCP deploy.
 *
 * Official connections are the hosted server at https://mcp.hostinger.com
 * (OAuth) or `npx -y @hostinger/mcp`. Tool names are taken from listTools
 * at runtime. A preferred name is called only when that list contains it.
 * Agency overwrite tools are not called. A write tool is called once.
 * Later status checks use a list tool when the server offered one.
 */

export const HOSTINGER_MCP_URL = "https://mcp.hostinger.com";
export const HOSTINGER_MCP_COMMAND = "npx";
export const HOSTINGER_MCP_ARGS = ["-y", "@hostinger/mcp"] as const;

const STATIC_PREFERRED = ["hosting_deploy-static-website", "hosting_websites_deploy-static-site-archive"] as const;
const NODE_PREFERRED = ["hosting_deploy-js-application", "hosting_nodejs_start-build"] as const;
const NODE_POLL_PREFERRED = ["hosting_list-js-deployments", "hosting_nodejs_list-builds"] as const;

export interface McpToolInfo {
  name: string;
  description?: string;
}

export interface McpClient {
  listTools(): Promise<readonly McpToolInfo[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface McpLaunchPlan {
  url: string;
  command: string;
  args: readonly string[];
}

export type McpKind = "static" | "node";

export interface HostingerMcpInput {
  kind: McpKind;
  domain: string;
  username: string;
  archivePath: string;
  nodeVersion: number;
  appType: string;
  rootDirectory: string;
  outputDirectory: string;
  buildScript: string;
  packageManager: string;
  entryFile?: string;
  maxPolls: number;
}

export type HostingerMcpResult =
  | { fallback: true; manual: string }
  | { url: string; tool: string; id: string; state: "queued" | "completed" | "failed" };

/** How a live session reaches the official server. This does not spawn it. */
export function hostingerMcpLaunchPlan(): McpLaunchPlan {
  return {
    url: HOSTINGER_MCP_URL,
    command: HOSTINGER_MCP_COMMAND,
    args: HOSTINGER_MCP_ARGS,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function eligible(tools: readonly McpToolInfo[]): McpToolInfo[] {
  return tools.filter((tool) => tool.name.trim() !== "" && !/^agency-/i.test(tool.name));
}

function textOf(tool: McpToolInfo): string {
  return `${tool.name} ${tool.description ?? ""}`;
}

function matchesKind(tool: McpToolInfo, kind: McpKind): boolean {
  const text = textOf(tool);
  if (kind === "static") {
    return /deploy/i.test(text) && /static/i.test(text) && !/javascript application/i.test(text);
  }
  if (/static website/i.test(text) && !/javascript application/i.test(text)) return false;
  return /deploy|start-build/i.test(text) && /javascript application|node\.?js build/i.test(text);
}

export function selectDeployTool(
  tools: readonly McpToolInfo[],
  kind: McpKind,
): { name: string } | { missing: true; manual: string } {
  const listed = eligible(tools);
  const names = new Set(listed.map((tool) => tool.name));
  const preferred = kind === "static" ? STATIC_PREFERRED : NODE_PREFERRED;
  for (const name of preferred) {
    if (names.has(name)) return { name };
  }
  const described = listed.find((tool) => matchesKind(tool, kind));
  if (described !== undefined) return { name: described.name };
  const manual = kind === "static"
    ? "The Hostinger MCP tool list has no static deploy tool. The API path is next. If that cannot run, upload the built files in hPanel. No unlisted tool was called."
    : "The Hostinger MCP tool list has no Node deploy tool. The API path is next. If that cannot run, upload an archive without node_modules in hPanel and start a Node build. No unlisted tool was called.";
  return { missing: true, manual };
}

export function selectPollTool(tools: readonly McpToolInfo[], kind: McpKind): string | null {
  if (kind !== "node") return null;
  const listed = eligible(tools);
  const names = new Set(listed.map((tool) => tool.name));
  for (const name of NODE_POLL_PREFERRED) {
    if (names.has(name)) return name;
  }
  const found = listed.find((tool) => /list/i.test(tool.name) && /deploy|build/i.test(tool.name));
  return found === undefined ? null : found.name;
}

function mapState(value: string): "queued" | "completed" | "failed" | null {
  const state = value.toLowerCase();
  if (state === "completed" || state === "success" || state === "succeeded") return "completed";
  if (state === "failed" || state === "error") return "failed";
  if (state === "queued" || state === "pending" || state === "running") return "queued";
  return null;
}

function readState(value: unknown): "queued" | "completed" | "failed" | null {
  if (!isRecord(value)) return null;
  for (const key of ["state", "status"]) {
    const raw = value[key];
    if (typeof raw === "string") {
      const mapped = mapState(raw);
      if (mapped !== null) return mapped;
    }
  }
  if (Array.isArray(value.data) && value.data.length > 0) return readState(value.data[0]);
  if (Array.isArray(value.deployments) && value.deployments.length > 0) return readState(value.deployments[0]);
  return null;
}

function readId(value: unknown): string {
  if (!isRecord(value)) return "";
  for (const key of ["uuid", "id"]) {
    const raw = value[key];
    if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  }
  if (isRecord(value.data)) return readId(value.data);
  return "";
}

function assertListed(tools: readonly McpToolInfo[], name: string): void {
  if (!tools.some((tool) => tool.name === name)) {
    throw new Error(`Refusing to call ${name} because it was not in the Hostinger tool list.`);
  }
}

function writeArgs(tool: string, input: HostingerMcpInput): Record<string, unknown> {
  if (tool === "hosting_deploy-static-website" || tool === "hosting_deploy-js-application") {
    return { domain: input.domain, archivePath: input.archivePath, removeArchive: false };
  }
  if (tool === "hosting_websites_deploy-static-site-archive") {
    return { username: input.username, domain: input.domain, archive_path: input.archivePath };
  }
  if (tool === "hosting_nodejs_start-build") {
    const args: Record<string, unknown> = {
      username: input.username,
      domain: input.domain,
      node_version: input.nodeVersion,
      app_type: input.appType,
      root_directory: input.rootDirectory,
      output_directory: input.outputDirectory,
      build_script: input.buildScript,
      package_manager: input.packageManager,
      source_type: "archive",
      source_options: { archive_path: input.archivePath },
    };
    if (input.entryFile !== undefined) args.entry_file = input.entryFile;
    return args;
  }
  return { domain: input.domain, archivePath: input.archivePath };
}

function pollArgs(tool: string, input: HostingerMcpInput): Record<string, unknown> {
  if (tool === "hosting_list-js-deployments") return { domain: input.domain };
  if (tool === "hosting_nodejs_list-builds") return { username: input.username, domain: input.domain };
  return { domain: input.domain };
}

function afterWrite(tool: string, value: unknown): "queued" | "completed" | "failed" {
  const parsed = readState(value);
  if (parsed !== null) return parsed;
  if (tool === "hosting_deploy-js-application" || tool === "hosting_nodejs_start-build") return "queued";
  return "completed";
}

/**
 * List tools, call one deploy tool that is actually listed, then poll
 * with a list tool when the write is still queued.
 */
export async function runHostingerMcp(client: McpClient, input: HostingerMcpInput): Promise<HostingerMcpResult> {
  if (!Number.isInteger(input.maxPolls) || input.maxPolls < 1) {
    throw new Error("maxPolls must be a positive integer");
  }
  const tools = await client.listTools();
  const selected = selectDeployTool(tools, input.kind);
  if ("missing" in selected) return { fallback: true, manual: selected.manual };

  assertListed(tools, selected.name);
  const written = await client.callTool(selected.name, writeArgs(selected.name, input));
  const id = readId(written) || input.archivePath;
  let state = afterWrite(selected.name, written);
  const pollTool = selectPollTool(tools, input.kind);

  if (state === "queued" && pollTool !== null) {
    assertListed(tools, pollTool);
    for (let attempt = 0; attempt < input.maxPolls; attempt += 1) {
      const polled = await client.callTool(pollTool, pollArgs(pollTool, input));
      const next = readState(polled);
      if (next === "completed" || next === "failed") {
        state = next;
        break;
      }
      state = "queued";
    }
  }

  return {
    url: `https://${input.domain}`,
    tool: selected.name,
    id,
    state,
  };
}
