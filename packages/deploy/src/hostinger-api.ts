/**
 * Hostinger API fallback.
 *
 * Token source is the OS keychain (service hitchhikers-guide, account
 * hostinger). This file does not read a project file for the token and
 * does not write one. Paths are the documented hosting v1 routes:
 * static archive deploy, start Node.js build, and list Node.js builds.
 * A write is sent once. Polling uses the list route.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

export const HOSTINGER_API_ORIGIN = "https://developers.hostinger.com";
export const HOSTINGER_KEYCHAIN_SERVICE = "hitchhikers-guide";
export const HOSTINGER_KEYCHAIN_ACCOUNT = "hostinger";

const NODE_VERSIONS = [18, 20, 22, 24] as const;
const APP_TYPES = [
  "create-react-app",
  "gatsby",
  "vite",
  "angular",
  "react",
  "vue",
  "parcel",
  "next",
  "nuxt",
  "nest",
  "express",
  "fastify",
  "astro",
  "svelte",
  "svelte-kit",
  "hono",
  "react-router",
  "nitro",
  "other",
] as const;
const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm"] as const;

export type HostingerNodeVersion = (typeof NODE_VERSIONS)[number];
export type HostingerAppType = (typeof APP_TYPES)[number];
export type HostingerPackageManager = (typeof PACKAGE_MANAGERS)[number];

export interface Keychain {
  getPassword(service: string, account: string): Promise<string | null>;
}

export interface HostingerSite {
  domain: string;
  username: string;
  archivePath: string;
  nodeVersion: HostingerNodeVersion;
  appType: HostingerAppType;
  rootDirectory: string;
  outputDirectory: string;
  buildScript: string;
  packageManager: HostingerPackageManager;
  entryFile?: string;
}

export interface HostingerApiCall {
  fetchImpl: typeof fetch;
  token: string;
  site: HostingerSite;
}

export type HostingerPollState = "queued" | "completed" | "failed";

const SECRET_KEYS = new Set([
  "token",
  "apitoken",
  "api_token",
  "authorization",
  "password",
  "secret",
  "bearer",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnoent(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export function redactSecret(text: string, secret: string): string {
  if (secret.length === 0) return text;
  return text.split(secret).join("[redacted]");
}

export async function readHostingerToken(keychain: Keychain): Promise<string> {
  const stored = await keychain.getPassword(HOSTINGER_KEYCHAIN_SERVICE, HOSTINGER_KEYCHAIN_ACCOUNT);
  if (typeof stored !== "string" || /[\r\n]/.test(stored) || stored.trim() === "") {
    throw new Error(
      "No Hostinger API token. Store it in the OS keychain under service hitchhikers-guide and account hostinger.",
    );
  }
  return stored.trim();
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`host.json ${key} must be a non-empty string.`);
  }
  return value.trim();
}

function appTypeForPick(pick: string): HostingerAppType {
  if (pick === "next") return "next";
  if (pick === "astro") return "astro";
  if (pick === "vite-react") return "vite";
  if (pick === "sveltekit") return "svelte-kit";
  throw new Error("host.json app type could not be chosen from the stack pick.");
}

function outputForApp(appType: HostingerAppType): string {
  if (appType === "next") return ".next";
  if (appType === "svelte-kit") return "build";
  return "dist";
}

function asNodeVersion(value: unknown): HostingerNodeVersion {
  if (value === 18 || value === 20 || value === 22 || value === 24) return value;
  throw new Error("host.json nodeVersion must be 18, 20, 22, or 24.");
}

function asAppType(value: string): HostingerAppType {
  if ((APP_TYPES as readonly string[]).includes(value)) return value as HostingerAppType;
  throw new Error("host.json appType is not a Hostinger Node application type.");
}

function asPackageManager(value: string): HostingerPackageManager {
  if (value === "npm" || value === "yarn" || value === "pnpm") return value;
  throw new Error("host.json packageManager must be npm, yarn, or pnpm.");
}

/** Read the non-secret site file. A token key is refused. */
export function parseHostingerSite(json: unknown, pick: string): HostingerSite {
  if (!isRecord(json)) {
    throw new Error("host.json must be an object with domain, username, and archivePath.");
  }
  for (const key of Object.keys(json)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      throw new Error("host.json must not contain a token. Store it in the OS keychain.");
    }
  }
  const domain = readString(json, "domain");
  const username = readString(json, "username");
  const archivePath = readString(json, "archivePath");
  if (domain === undefined || username === undefined || archivePath === undefined) {
    throw new Error("host.json needs domain, username, and archivePath.");
  }
  if (domain.includes("://") || domain.includes("/") || /\s/.test(domain)) {
    throw new Error("host.json domain must be a bare hostname.");
  }
  const appType = readString(json, "appType");
  const chosenApp = appType === undefined ? appTypeForPick(pick) : asAppType(appType);
  const nodeVersion = Object.hasOwn(json, "nodeVersion") ? asNodeVersion(json.nodeVersion) : 22;
  const packageManager = readString(json, "packageManager");
  const entryFile = readString(json, "entryFile");
  const site: HostingerSite = {
    domain,
    username,
    archivePath,
    nodeVersion,
    appType: chosenApp,
    rootDirectory: readString(json, "rootDirectory") ?? ".",
    outputDirectory: readString(json, "outputDirectory") ?? outputForApp(chosenApp),
    buildScript: readString(json, "buildScript") ?? "build",
    packageManager: packageManager === undefined ? "npm" : asPackageManager(packageManager),
  };
  if (entryFile !== undefined) site.entryFile = entryFile;
  return site;
}

export async function loadHostingerSite(projectDir: string, pick: string): Promise<HostingerSite> {
  const file = path.join(projectDir, ".hitchhiker", "deploy", "host.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      throw new Error(
        `host.json is missing at ${file}. Add domain, username, and archivePath. Put the API token in the OS keychain.`,
      );
    }
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("host.json is not valid JSON.");
  }
  return parseHostingerSite(parsed, pick);
}

function siteUrl(domain: string): string {
  return `https://${domain}`;
}

function accountPath(site: HostingerSite, suffix: string): string {
  return `/api/hosting/v1/accounts/${encodeURIComponent(site.username)}/websites/${encodeURIComponent(site.domain)}${suffix}`;
}

async function callApi(
  deps: HostingerApiCall,
  method: "GET" | "POST",
  apiPath: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${deps.token}`,
  };
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await deps.fetchImpl(`${HOSTINGER_API_ORIGIN}${apiPath}`, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hostinger API request failed.";
    throw new Error(redactSecret(message, deps.token));
  }
  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    const detail = redactSecret(text.slice(0, 180), deps.token);
    throw new Error(
      `Hostinger API ${method} ${apiPath} returned ${response.status}. ${detail}`.trim(),
    );
  }
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(redactSecret("Hostinger API returned a body that is not JSON.", deps.token));
  }
}

export function mapHostingerState(value: string): HostingerPollState | null {
  const state = value.toLowerCase();
  if (state === "completed" || state === "success" || state === "succeeded") return "completed";
  if (state === "failed" || state === "error") return "failed";
  if (state === "queued" || state === "pending" || state === "running" || state === "accepted") {
    return "queued";
  }
  return null;
}

function readState(value: unknown): HostingerPollState | null {
  if (!isRecord(value)) return null;
  for (const key of ["state", "status"]) {
    const raw = value[key];
    if (typeof raw === "string") {
      const mapped = mapHostingerState(raw);
      if (mapped !== null) return mapped;
    }
  }
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

/**
 * POST the documented static deploy route. The archive must already be
 * on the website. This does not upload bytes and does not invent a path.
 */
export async function postStaticDeploy(deps: HostingerApiCall): Promise<{ id: string; url: string; state: HostingerPollState }> {
  const value = await callApi(deps, "POST", accountPath(deps.site, "/deploy"), {
    archive_path: deps.site.archivePath,
  });
  const state = readState(value) ?? "queued";
  const id = readId(value) || deps.site.archivePath;
  return { id, url: siteUrl(deps.site.domain), state };
}

/** POST the documented Node.js build route once. */
export async function postNodeBuild(deps: HostingerApiCall): Promise<{ id: string; url: string; state: HostingerPollState }> {
  const sourceOptions: Record<string, string> = { archive_path: deps.site.archivePath };
  const body: Record<string, unknown> = {
    node_version: deps.site.nodeVersion,
    app_type: deps.site.appType,
    root_directory: deps.site.rootDirectory,
    output_directory: deps.site.outputDirectory,
    build_script: deps.site.buildScript,
    package_manager: deps.site.packageManager,
    source_type: "archive",
    source_options: sourceOptions,
  };
  if (deps.site.entryFile !== undefined) body.entry_file = deps.site.entryFile;
  const value = await callApi(deps, "POST", accountPath(deps.site, "/nodejs/builds"), body);
  const state = readState(value) ?? "queued";
  const id = readId(value);
  if (id === "") {
    throw new Error("Hostinger Node build returned no uuid.");
  }
  return { id, url: siteUrl(deps.site.domain), state };
}

function buildsFrom(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.builds)) return value.builds;
  return [];
}

/** GET the documented build list. This does not start another build. */
export async function readNodeBuildState(deps: HostingerApiCall, id: string): Promise<HostingerPollState> {
  const value = await callApi(deps, "GET", `${accountPath(deps.site, "/nodejs/builds")}?page=1&per_page=25`);
  for (const item of buildsFrom(value)) {
    if (readId(item) !== id) continue;
    return readState(item) ?? "queued";
  }
  return "queued";
}
