/**
 * Search the official MCP Registry and the npm registry, then rank with think().
 *
 * fetch is injected so tests never touch the network. Licence text comes from
 * the registry record, not from the model. A GPL or AGPL hit stays in the
 * list and is marked blocked.
 */

import { think } from "../ai/think.ts";
import type { JsonSchema } from "../ai/schema-validate.ts";
import { validateJson } from "../ai/schema-validate.ts";
import { checkLegitimacy, type RegistryMeta, type ToolKind, type ToolOption } from "./legitimacy.ts";

export type { ToolKind, ToolOption } from "./legitimacy.ts";

export const MCP_REGISTRY_ORIGIN = "https://registry.modelcontextprotocol.io";
export const NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org";
export const NPM_DOWNLOADS_ORIGIN = "https://api.npmjs.org";

const SEARCH_LIMIT = 8;
const RANK_LIMIT = 5;
const NO_PRICE = "No price listed by the registry.";

const BANNED_WHY = [
  "unlock",
  "elevate",
  "seamless",
  "revolutionize",
  "empower",
  "delve",
  "leverage",
  "synergy",
  "robust",
  "journey",
  "tapestry",
  "landscape",
] as const;

const RANK_SCHEMA: JsonSchema = {
  type: "object",
  required: ["options"],
  properties: {
    options: {
      type: "array",
      maxItems: RANK_LIMIT,
      items: {
        type: "object",
        required: ["name", "kind", "why", "licence", "costNote", "maintenance"],
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["mcp", "npm", "api"] },
          why: { type: "string" },
          licence: { type: "string" },
          costNote: { type: "string" },
          maintenance: { type: "string" },
        },
      },
    },
  },
};

export class RegistryUnreachableError extends Error {
  readonly manualOptions: readonly string[];

  constructor(sources: readonly string[]) {
    const joined = sources.length === 1 ? sources[0] : sources.join(" and ");
    super(
      `${joined} could not be reached. Name a package yourself with its exact name, repository URL, and an allowed licence. Set any secret in the environment or the OS keychain, not in a file.`,
    );
    this.name = "RegistryUnreachableError";
    this.manualOptions = [
      "Pass the exact package name and the repository URL from the project you meant.",
      "Use an allowed licence: MIT, Apache-2.0, BSD, ISC, Unlicense, Zlib, or MPL-2.0.",
      "Set secrets in the environment or the OS keychain. The Guide does not write them into a file.",
    ];
  }
}

interface Candidate {
  option: ToolOption;
  meta: RegistryMeta;
}

interface RankedChoice {
  name: string;
  kind: ToolKind;
  why: string;
}

export async function discoverTools(
  feature: string,
  deps: { fetchImpl: typeof fetch; think: typeof think },
): Promise<ToolOption[]> {
  const query = feature.trim();
  if (query === "") throw new Error("Feature text is empty.");

  const mcpUrl = new URL("/v0/servers", MCP_REGISTRY_ORIGIN);
  mcpUrl.searchParams.set("search", query);
  mcpUrl.searchParams.set("limit", String(SEARCH_LIMIT));

  const npmUrl = new URL("/-/v1/search", NPM_REGISTRY_ORIGIN);
  npmUrl.searchParams.set("text", query);
  npmUrl.searchParams.set("size", String(SEARCH_LIMIT));

  const [mcp, npm] = await Promise.all([
    readRegistry(deps.fetchImpl, mcpUrl),
    readRegistry(deps.fetchImpl, npmUrl),
  ]);

  if (!mcp.ok && !npm.ok) {
    throw new RegistryUnreachableError(["The MCP Registry", "The npm registry"]);
  }

  const note = registryNote(mcp.ok, npm.ok);
  const mcpCandidates = mcp.ok ? await candidatesFromMcp(mcp.value, deps.fetchImpl, note) : [];
  const npmCandidates = npm.ok ? await candidatesFromNpm(npm.value, deps.fetchImpl, note) : [];
  const candidates = [...mcpCandidates, ...npmCandidates];
  if (candidates.length === 0) return [];

  const ranked = await rank(query, candidates, deps.think);
  const byKey = new Map(candidates.map((candidate) => [keyOf(candidate.option), candidate]));
  const chosen: ToolOption[] = [];
  for (const choice of ranked) {
    if (chosen.length >= RANK_LIMIT) break;
    const candidate = byKey.get(`${choice.kind}\n${choice.name}`);
    if (candidate === undefined) continue;
    chosen.push(present(candidate, choice.why));
  }
  return chosen;
}

function keyOf(option: ToolOption): string {
  return `${option.kind}\n${option.name}`;
}

function registryNote(mcpOk: boolean, npmOk: boolean): string {
  if (mcpOk && npmOk) return "";
  if (!mcpOk) return "The MCP Registry could not be reached. These options are from npm only.";
  return "The npm registry could not be reached. These options are from the MCP Registry only.";
}

async function rank(
  feature: string,
  candidates: readonly Candidate[],
  thinkImpl: typeof think,
): Promise<RankedChoice[]> {
  const brief = candidates.map((candidate) => ({
    name: candidate.option.name,
    kind: candidate.option.kind,
    licence: candidate.option.licence,
    repositoryUrl: candidate.option.repositoryUrl,
    maintenance: candidate.option.maintenance,
    description: candidate.option.why,
  }));
  const result = await thinkImpl({
    task: "Rank registry tools for a feature request.",
    schema: RANK_SCHEMA,
    input: [
      "Rank up to 5 of these registry candidates for the feature.",
      "Use only names and kinds from the list. Do not invent a package.",
      "Copy each licence exactly.",
      "Put the closest match first, even when its licence is GPL or AGPL.",
      `Feature: ${feature}`,
      JSON.stringify({ candidates: brief }),
    ].join("\n"),
  });
  const errors = validateJson(result.value, RANK_SCHEMA);
  if (errors.length > 0) {
    throw new Error(`think() returned options that do not match the ranking schema: ${errors.join("; ")}`);
  }
  const record = asRecord(result.value);
  const options = record?.options;
  if (!Array.isArray(options)) return [];
  const ranked: RankedChoice[] = [];
  for (const item of options) {
    const row = asRecord(item);
    if (row === null) continue;
    const name = typeof row.name === "string" ? row.name : "";
    const kind = row.kind;
    const why = typeof row.why === "string" ? row.why : "";
    if (name === "" || (kind !== "mcp" && kind !== "npm" && kind !== "api")) continue;
    ranked.push({ name, kind, why });
  }
  return ranked;
}

function present(candidate: Candidate, why: string): ToolOption {
  const option: ToolOption = {
    ...candidate.option,
    why: safeWhy(why, candidate.option.why),
    costNote: NO_PRICE,
  };
  const gate = checkLegitimacy(option, candidate.meta);
  option.blocked = !gate.ok;
  option.blockReasons = gate.reasons;
  return option;
}

function safeWhy(modelWhy: string, fallback: string): string {
  const why = modelWhy.trim();
  if (why === "" || why.includes("!") || why.includes("\u2014")) return fallback;
  const lower = why.toLowerCase();
  for (const word of BANNED_WHY) {
    if (lower.includes(word)) return fallback;
  }
  return why.length > 400 ? `${why.slice(0, 400).trimEnd()}…` : why;
}

async function candidatesFromMcp(
  payload: unknown,
  fetchImpl: typeof fetch,
  note: string,
): Promise<Candidate[]> {
  const servers = serverRows(payload).slice(0, SEARCH_LIMIT);
  const built = await Promise.all(servers.map((row) => mcpCandidate(row, fetchImpl, note)));
  const candidates: Candidate[] = [];
  for (const candidate of built) {
    if (candidate !== null) candidates.push(candidate);
  }
  return candidates;
}

async function mcpCandidate(
  row: unknown,
  fetchImpl: typeof fetch,
  note: string,
): Promise<Candidate | null> {
  const wrapped = asRecord(row);
  if (wrapped === null) return null;
  const server = asRecord(wrapped.server) ?? wrapped;
  const name = typeof server.name === "string" ? server.name.trim() : "";
  if (name === "") return null;
  const description = typeof server.description === "string" ? server.description.trim() : "";
  const repository = asRecord(server.repository);
  const repositoryUrl = typeof repository?.url === "string" ? repository.url.trim() : "";
  const metaOfficial = officialMeta(wrapped._meta);
  const publishedAt = metaOfficial.publishedAt;
  const status = metaOfficial.status;
  const npmPackage = firstNpmPackage(server.packages);
  const remoteUrl = firstRemoteUrl(server.remotes);
  const packument = npmPackage === null ? null : await readPackument(fetchImpl, npmPackage.identifier);
  const downloads = npmPackage === null ? 0 : await readDownloads(fetchImpl, npmPackage.identifier);
  const licence = packument?.licence ?? "unspecified";
  const published = publishedAt !== "" ? publishedAt : (packument?.publishedAt ?? "");
  const hasInstallScript = packument?.hasInstallScript ?? false;
  const secretEnv = npmPackage?.secretEnv ?? [];
  const option = emptyOption({
    name,
    kind: "mcp",
    why: description === "" ? name : description,
    licence,
    maintenance: maintenanceLine(published, downloads, status),
    repositoryUrl,
    publishedAt: published,
    weeklyDownloads: downloads,
    hasInstallScript,
    packageName: npmPackage?.identifier ?? "",
    secretEnv,
    command: npmPackage?.command ?? "",
    args: npmPackage?.args ?? [],
    url: remoteUrl,
    registryNote: note,
  });
  return { option, meta: metaFrom(option) };
}

async function candidatesFromNpm(
  payload: unknown,
  fetchImpl: typeof fetch,
  note: string,
): Promise<Candidate[]> {
  const objects = npmObjects(payload).slice(0, SEARCH_LIMIT);
  const built = await Promise.all(objects.map((row) => npmCandidate(row, fetchImpl, note)));
  const candidates: Candidate[] = [];
  for (const candidate of built) {
    if (candidate !== null) candidates.push(candidate);
  }
  return candidates;
}

async function npmCandidate(
  row: unknown,
  fetchImpl: typeof fetch,
  note: string,
): Promise<Candidate | null> {
  const record = asRecord(row);
  const pkg = asRecord(record?.package);
  if (pkg === null) return null;
  const name = typeof pkg.name === "string" ? pkg.name.trim() : "";
  if (name === "") return null;
  const description = typeof pkg.description === "string" ? pkg.description.trim() : "";
  const links = asRecord(pkg.links);
  const searchRepo = typeof links?.repository === "string" ? links.repository.trim() : "";
  const searchDate = typeof pkg.date === "string" ? pkg.date : "";
  const score = asRecord(asRecord(record?.score)?.detail);
  const maintenanceScore = typeof score?.maintenance === "number" ? score.maintenance : null;
  const packument = await readPackument(fetchImpl, name);
  const downloads = await readDownloads(fetchImpl, name);
  const licence = packument?.licence ?? "unspecified";
  const repositoryUrl = packument?.repositoryUrl || searchRepo;
  const publishedAt = packument?.publishedAt || searchDate;
  const option = emptyOption({
    name,
    kind: "npm",
    why: description === "" ? name : description,
    licence,
    maintenance: npmMaintenance(publishedAt, downloads, maintenanceScore),
    repositoryUrl,
    publishedAt,
    weeklyDownloads: downloads,
    hasInstallScript: packument?.hasInstallScript ?? false,
    packageName: name,
    registryNote: note,
  });
  return { option, meta: metaFrom(option) };
}

function maintenanceLine(published: string, downloads: number, status: string): string {
  const when = published === "" ? "publish date not listed" : `published ${published}`;
  const pulls = `${downloads} downloads in the last week`;
  const state = status === "" ? "registry status not listed" : `registry status ${status}`;
  return `${when}, ${pulls}, ${state}.`;
}

function npmMaintenance(published: string, downloads: number, score: number | null): string {
  const when = published === "" ? "publish date not listed" : `published ${published}`;
  const pulls = `${downloads} downloads in the last week`;
  const maintained = score === null ? "maintenance score not listed" : `maintenance score ${score.toFixed(2)}`;
  return `${when}, ${pulls}, ${maintained}.`;
}

function metaFrom(option: ToolOption): RegistryMeta {
  return {
    name: option.name,
    licence: option.licence,
    repositoryUrl: option.repositoryUrl,
    publishedAt: option.publishedAt,
    weeklyDownloads: option.weeklyDownloads,
    hasInstallScript: option.hasInstallScript,
    installScriptExplanation: option.installScriptExplanation,
  };
}

interface PackumentFacts {
  licence: string;
  repositoryUrl: string;
  publishedAt: string;
  hasInstallScript: boolean;
}

async function readPackument(fetchImpl: typeof fetch, name: string): Promise<PackumentFacts | null> {
  const url = new URL(`/${encodePackageName(name)}`, NPM_REGISTRY_ORIGIN);
  const result = await readRegistry(fetchImpl, url);
  if (!result.ok) return null;
  return parsePackument(result.value);
}

async function readDownloads(fetchImpl: typeof fetch, name: string): Promise<number> {
  const url = new URL(`/downloads/point/last-week/${encodePackageName(name)}`, NPM_DOWNLOADS_ORIGIN);
  const result = await readRegistry(fetchImpl, url);
  if (!result.ok) return 0;
  const record = asRecord(result.value);
  const downloads = record?.downloads;
  return typeof downloads === "number" && Number.isFinite(downloads) ? downloads : 0;
}

function encodePackageName(name: string): string {
  if (name.startsWith("@")) {
    const slash = name.indexOf("/");
    if (slash > 0) return `${name.slice(0, slash)}%2F${name.slice(slash + 1)}`;
  }
  return encodeURIComponent(name);
}

function parsePackument(payload: unknown): PackumentFacts | null {
  const record = asRecord(payload);
  if (record === null) return null;
  const distTags = asRecord(record["dist-tags"]);
  const latest = typeof distTags?.latest === "string" ? distTags.latest : "";
  const versions = asRecord(record.versions);
  const version = latest !== "" && versions !== null ? asRecord(versions[latest]) : null;
  const licence = readLicence(version?.license) || readLicence(record.license) || "unspecified";
  const repositoryUrl = readRepo(version?.repository) || readRepo(record.repository);
  const time = asRecord(record.time);
  const stamped = latest !== "" && typeof time?.[latest] === "string" ? time[latest] : "";
  const modified = typeof time?.modified === "string" ? time.modified : "";
  const scripts = asRecord(version?.scripts);
  const hasInstallScript = scriptPresent(scripts, "preinstall")
    || scriptPresent(scripts, "install")
    || scriptPresent(scripts, "postinstall");
  return {
    licence,
    repositoryUrl,
    publishedAt: stamped || modified,
    hasInstallScript,
  };
}

function scriptPresent(scripts: Record<string, unknown> | null, key: string): boolean {
  const value = scripts?.[key];
  return typeof value === "string" && value.trim() !== "";
}

function readLicence(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const record = asRecord(value);
  return typeof record?.type === "string" ? record.type.trim() : "";
}

function readRepo(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const record = asRecord(value);
  return typeof record?.url === "string" ? record.url.trim() : "";
}

interface NpmBinding {
  identifier: string;
  command: string;
  args: string[];
  secretEnv: string[];
}

function firstNpmPackage(value: unknown): NpmBinding | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const row = asRecord(item);
    if (row === null) continue;
    if (row.registryType !== "npm") continue;
    const identifier = typeof row.identifier === "string" ? row.identifier.trim() : "";
    if (identifier === "") continue;
    const runtime = typeof row.runtimeHint === "string" && row.runtimeHint.trim() !== ""
      ? row.runtimeHint.trim()
      : "npx";
    const runtimeArgs = positionalArgs(row.runtimeArguments);
    const leading = runtimeArgs.length > 0 ? runtimeArgs : ["-y"];
    const args = [...leading, identifier, ...positionalArgs(row.packageArguments)];
    return { identifier, command: runtime, args, secretEnv: secretNames(row.environmentVariables) };
  }
  return null;
}

function looksLikeSecret(value: string): boolean {
  if (value.includes("${")) return false;
  return /sk-[A-Za-z0-9]{8,}/.test(value)
    || value.includes("sk-ant-")
    || /ghp_[A-Za-z0-9]{8,}/.test(value)
    || value.includes("github_pat_")
    || /AKIA[0-9A-Z]{16}/.test(value)
    || /Bearer\s+[A-Za-z0-9._-]{8,}/i.test(value)
    || /-----BEGIN [A-Z ]+KEY-----/.test(value)
    || /xox[baprs]-/.test(value);
}

function positionalArgs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const args: string[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (typeof row?.value !== "string") continue;
    if (row.isSecret === true) continue;
    const text = row.value;
    if (looksLikeSecret(text)) continue;
    if (text.trim() === "" || text.includes("\n") || text.includes("\r")) continue;
    args.push(text);
  }
  return args;
}

function secretNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (row === null || row.isSecret !== true) continue;
    if (typeof row.name !== "string") continue;
    const name = row.name.trim();
    if (name !== "" && !names.includes(name)) names.push(name);
  }
  return names;
}

function firstRemoteUrl(value: unknown): string {
  if (!Array.isArray(value)) return "";
  for (const item of value) {
    const row = asRecord(item);
    if (typeof row?.url === "string" && row.url.trim() !== "") return row.url.trim();
  }
  return "";
}

function officialMeta(value: unknown): { publishedAt: string; status: string } {
  const record = asRecord(value);
  const official = asRecord(record?.["io.modelcontextprotocol.registry/official"]);
  const updated = typeof official?.updatedAt === "string" ? official.updatedAt : "";
  const published = typeof official?.publishedAt === "string" ? official.publishedAt : "";
  const status = typeof official?.status === "string" ? official.status : "";
  return { publishedAt: updated || published, status };
}

function serverRows(payload: unknown): unknown[] {
  const record = asRecord(payload);
  return Array.isArray(record?.servers) ? record.servers : [];
}

function npmObjects(payload: unknown): unknown[] {
  const record = asRecord(payload);
  return Array.isArray(record?.objects) ? record.objects : [];
}

function emptyOption(partial: {
  name: string;
  kind: ToolKind;
  why: string;
  licence: string;
  maintenance: string;
  repositoryUrl: string;
  publishedAt: string;
  weeklyDownloads: number;
  hasInstallScript: boolean;
  packageName: string;
  secretEnv?: string[];
  command?: string;
  args?: string[];
  url?: string;
  registryNote: string;
}): ToolOption {
  return {
    name: partial.name,
    kind: partial.kind,
    why: partial.why,
    licence: partial.licence,
    costNote: NO_PRICE,
    maintenance: partial.maintenance,
    blocked: false,
    blockReasons: [],
    repositoryUrl: partial.repositoryUrl,
    publishedAt: partial.publishedAt,
    weeklyDownloads: partial.weeklyDownloads,
    hasInstallScript: partial.hasInstallScript,
    installScriptExplanation: "",
    packageName: partial.packageName,
    secretEnv: partial.secretEnv ?? [],
    command: partial.command ?? "",
    args: partial.args ?? [],
    url: partial.url ?? "",
    registryNote: partial.registryNote,
    userAsk: "",
  };
}

type RegistryRead = { ok: true; value: unknown } | { ok: false };

async function readRegistry(fetchImpl: typeof fetch, url: URL): Promise<RegistryRead> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return { ok: false };
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
