/**
 * Design-library ingestion. Fetch, clock, and the Grok runner are injected.
 * A manual command owns the network. Tests never open one.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildDesignIndex,
  canonicalUrl,
  loadDesignEntries,
  nearDuplicate,
  quotaAllows,
  validateDesignEntry,
  type DesignEntry,
} from "./design-library.ts";
import { DESIGN_LIBRARY_USER_AGENT, ingestPolicy, robotsAllow, type PolicyResult } from "./ingest-policy.ts";

export const PER_HOST_DELAY_MS = 2_000;
export const RECHECK_MS = 30 * 24 * 60 * 60 * 1000;

export interface Clock {
  now(): number;
  wait(ms: number): Promise<void>;
}

export interface GrokEntryDraft {
  techniques: string[];
  promptLanguage: string;
  notes: string;
  perfCost: "low" | "medium" | "high";
  reducedMotion: string;
  moods: string[];
  sectionTypes: string[];
  libraries: string[];
  snippet?: string;
  title?: string;
  styleWorld?: string;
  family?: string;
  kind?: DesignEntry["kind"];
  source?: DesignEntry["source"];
}

export type GrokRunner = (input: { url: string; mode: string; material: string }) => Promise<GrokEntryDraft>;

export interface IngestCandidate {
  url: string;
  source: string;
  via: "auto" | "add";
  license?: string | null;
  title?: string;
  credit?: string;
}

export interface IngestItemState {
  url: string;
  status: "done" | "refused" | "failed" | "pending";
  mode?: string;
  reason: string;
  failures: number;
  checked?: string;
  entryId?: string;
}

export interface IngestState {
  version: 1;
  items: Record<string, IngestItemState>;
}

export interface IngestDeps {
  fetchImpl: typeof fetch;
  clock: Clock;
  grok: GrokRunner;
  root: string;
  recheck?: boolean;
  nowIso?: string;
  quotaFloor?: number;
  quotaShare?: number;
}

export function emptyIngestState(): IngestState {
  return { version: 1, items: {} };
}

export async function runIngest(
  candidates: readonly IngestCandidate[],
  state: IngestState,
  deps: IngestDeps,
): Promise<IngestState> {
  const next = cloneState(state);
  const hosts = new Map<string, number>();
  const discovered = [...candidates];
  for (const candidate of candidates) {
    if (isFeedUrl(candidate.url)) {
      const extra = await readFeed(candidate, deps, hosts);
      for (const item of extra) discovered.push(item);
    }
  }
  for (const candidate of discovered) {
    const key = canonicalUrl(candidate.url);
    const prior = next.items[key];
    if (prior?.status === "done" || prior?.status === "refused") continue;
    if (isFeedUrl(candidate.url)) {
      next.items[key] = {
        url: candidate.url,
        status: "done",
        mode: "feed",
        reason: "Feed items became candidates. No code was stored.",
        failures: 0,
        checked: day(deps),
      };
      continue;
    }
    const robots = await readRobots(candidate.url, deps, hosts);
    if (!robots.allowed) {
      const policy = ingestPolicy(candidate.source, candidate.url, candidate.license ?? null, { allowed: false, via: candidate.via });
      next.items[key] = itemFrom(candidate.url, "refused", policy, 0, deps);
      continue;
    }
    const license = candidate.license ?? (await githubLicense(candidate.url, deps, hosts));
    const policy = ingestPolicy(candidate.source, candidate.url, license, { allowed: true, via: candidate.via });
    if (policy.mode === "refuse") {
      next.items[key] = itemFrom(candidate.url, "refused", policy, 0, deps);
      continue;
    }
    if (policy.mode === "feed") {
      next.items[key] = itemFrom(candidate.url, "done", policy, 0, deps);
      continue;
    }
    try {
      const material = await allowedMaterial(candidate, policy, license, deps, hosts);
      const draft = await deps.grok({ url: candidate.url, mode: policy.mode, material });
      if (policy.mode === "code" && (draft.snippet ?? "").split(/\r?\n/).length > 80) {
        next.items[key] = { ...itemFrom(candidate.url, "failed", policy, (prior?.failures ?? 0) + 1, deps), reason: "Snippet over the cap." };
        continue;
      }
      const entry = draftToEntry(candidate, policy, license, draft, deps);
      const problems = problemsFor(entry, deps.root);
      if (problems.length > 0) {
        next.items[key] = { ...itemFrom(candidate.url, "failed", policy, (prior?.failures ?? 0) + 1, deps), reason: problems.join("; ") };
        continue;
      }
      const existing = safeEntries(deps.root);
      if (existing.some((item) => canonicalUrl(item.sourceUrl) === canonicalUrl(entry.sourceUrl) || nearDuplicate(item, entry))) {
        next.items[key] = { ...itemFrom(candidate.url, "done", policy, 0, deps), reason: "Duplicate canonical URL or technique cluster." };
        continue;
      }
      if (!quotaAllows(existing, entry.styleWorld, deps.quotaFloor ?? 8, deps.quotaShare ?? 0.34)) {
        next.items[key] = { ...itemFrom(candidate.url, "refused", policy, 0, deps), reason: "Style-world quota." };
        continue;
      }
      writeEntry(deps.root, entry, policy.mode === "code" ? draft.snippet ?? "" : "", license);
      next.items[key] = { ...itemFrom(candidate.url, "done", policy, 0, deps), entryId: entry.id, mode: policy.mode };
    } catch (error) {
      const failures = (prior?.failures ?? 0) + 1;
      next.items[key] = {
        ...itemFrom(candidate.url, "failed", policy, failures, deps),
        reason: error instanceof Error ? error.message : "Ingest failed.",
      };
    }
  }
  rebuildIndex(deps.root, day(deps));
  return next;
}

export async function recheckLibrary(deps: IngestDeps, state: IngestState): Promise<{ state: IngestState; entries: DesignEntry[] }> {
  const next = cloneState(state);
  const hosts = new Map<string, number>();
  const entries = safeEntries(deps.root);
  for (const entry of entries) {
    const key = canonicalUrl(entry.sourceUrl);
    const prior = next.items[key];
    const checkedAt = Date.parse(`${entry.checked}T00:00:00Z`);
    const due = deps.recheck === true || !Number.isFinite(checkedAt) || deps.clock.now() - checkedAt >= RECHECK_MS;
    if (!due) continue;
    try {
      const response = await fetchTimed(entry.sourceUrl, deps, hosts, prior?.checked ?? entry.checked);
      if (!response.ok && response.status !== 304) throw new Error(`Recheck status ${response.status}`);
      entry.checked = day(deps);
      entry.retired = false;
      writeJson(path.join(deps.root, "entries", `${entry.id}.json`), entry);
      next.items[key] = {
        url: entry.sourceUrl,
        status: "done",
        mode: entry.ingestMode,
        reason: response.status === 304 ? "Not modified." : "Rechecked.",
        failures: 0,
        checked: entry.checked,
        entryId: entry.id,
      };
    } catch (error) {
      const failures = (prior?.failures ?? 0) + 1;
      if (failures >= 2) entry.retired = true;
      writeJson(path.join(deps.root, "entries", `${entry.id}.json`), entry);
      next.items[key] = {
        url: entry.sourceUrl,
        status: "failed",
        mode: entry.ingestMode,
        reason: error instanceof Error ? error.message : "Recheck failed.",
        failures,
        checked: entry.checked,
        entryId: entry.id,
      };
    }
  }
  rebuildIndex(deps.root, day(deps));
  return { state: next, entries: safeEntries(deps.root) };
}

export async function addLibraryUrl(url: string, deps: IngestDeps, state: IngestState): Promise<IngestState> {
  return runIngest([{ url, source: hostSource(url), via: "add" }], state, deps);
}

function itemFrom(url: string, status: IngestItemState["status"], policy: PolicyResult, failures: number, deps: IngestDeps): IngestItemState {
  const item: IngestItemState = { url, status, reason: policy.reason, failures, checked: day(deps) };
  if (policy.mode !== "refuse") item.mode = policy.mode;
  return item;
}

async function readRobots(url: string, deps: IngestDeps, hosts: Map<string, number>): Promise<{ allowed: boolean }> {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
  try {
    const response = await fetchTimed(robotsUrl, deps, hosts);
    if (!response.ok) return { allowed: true };
    const body = await response.text();
    return { allowed: robotsAllow(body, parsed.pathname) };
  } catch {
    return { allowed: true };
  }
}

async function githubLicense(url: string, deps: IngestDeps, hosts: Map<string, number>): Promise<string | null> {
  const parsed = new URL(url);
  if (parsed.hostname.replace(/^www\./, "") !== "github.com") return null;
  const parts = parsed.pathname.split("/").filter((part) => part !== "");
  if (parts.length < 2) return null;
  const api = `https://api.github.com/repos/${parts[0]}/${parts[1]}/license`;
  try {
    const response = await fetchTimed(api, deps, hosts);
    if (!response.ok) return null;
    const body = (await response.json()) as { license?: { spdx_id?: string } };
    const spdx = body.license?.spdx_id ?? "";
    return spdx === "" || spdx === "NOASSERTION" ? null : spdx;
  } catch {
    return null;
  }
}

async function allowedMaterial(
  candidate: IngestCandidate,
  policy: PolicyResult,
  license: string | null,
  deps: IngestDeps,
  hosts: Map<string, number>,
): Promise<string> {
  if (policy.mode === "code" && license !== null) {
    const response = await fetchTimed(candidate.url, deps, hosts);
    const text = response.ok ? await response.text() : "";
    return `Licensed ${license}. Read only this allowed material.\n${text.slice(0, 4_000)}`;
  }
  return "Public page. Write our notes, technique names, and prompt language. Do not copy code, copy, fonts, or images.";
}

async function readFeed(candidate: IngestCandidate, deps: IngestDeps, hosts: Map<string, number>): Promise<IngestCandidate[]> {
  try {
    const response = await fetchTimed(candidate.url, deps, hosts);
    if (!response.ok) return [];
    const xml = await response.text();
    const items: IngestCandidate[] = [];
    const blocks = xml.split(/<item\b/i).slice(1);
    for (const block of blocks) {
      const link = /<link>([^<]+)<\/link>/i.exec(block)?.[1]?.trim();
      const title = /<title>([^<]+)<\/title>/i.exec(block)?.[1]?.trim() ?? "";
      const credit = /<dc:creator>([^<]+)<\/dc:creator>/i.exec(block)?.[1]?.trim() ?? "";
      if (link === undefined || link === "") continue;
      items.push({ url: link, source: "candidate", via: "auto", title, credit, license: null });
    }
    return items;
  } catch {
    return [];
  }
}

async function fetchTimed(url: string, deps: IngestDeps, hosts: Map<string, number>, since?: string): Promise<Response> {
  const host = new URL(url).host;
  const last = hosts.get(host) ?? 0;
  if (last !== 0) {
    const elapsed = deps.clock.now() - last;
    if (elapsed < PER_HOST_DELAY_MS) await deps.clock.wait(PER_HOST_DELAY_MS - elapsed);
  }
  hosts.set(host, deps.clock.now());
  const headers: Record<string, string> = { "user-agent": DESIGN_LIBRARY_USER_AGENT, accept: "*/*" };
  if (since !== undefined && since !== "") headers["if-modified-since"] = since;
  return deps.fetchImpl(url, { headers });
}

function draftToEntry(
  candidate: IngestCandidate,
  policy: PolicyResult,
  license: string | null,
  draft: GrokEntryDraft,
  deps: IngestDeps,
): DesignEntry {
  const id = slug(candidate.title || draft.title || candidate.url);
  const mode = policy.mode === "code" ? "code" : "link-only";
  const entry: DesignEntry = {
    id,
    kind: draft.kind ?? "site",
    title: draft.title ?? candidate.title ?? id,
    url: candidate.url,
    source: draft.source ?? "direct",
    sourcePage: candidate.url,
    styleWorld: draft.styleWorld ?? "editorial",
    family: draft.family ?? "editorial",
    moods: draft.moods,
    sectionTypes: draft.sectionTypes,
    techniques: draft.techniques,
    libraries: draft.libraries,
    promptLanguage: draft.promptLanguage,
    notes: draft.notes,
    perfCost: draft.perfCost,
    reducedMotion: draft.reducedMotion,
    sourceUrl: candidate.url,
    license: mode === "code" ? (license ?? "") : "link-only",
    creditLine: candidate.credit && candidate.credit !== "" ? candidate.credit : `Notes on ${candidate.url}`,
    ingestMode: mode,
    snippets: mode === "code" && draft.snippet ? [`snippets/${id}/snippet.ts`] : [],
    shots: [],
    checked: day(deps),
    verified: "auto",
    retired: false,
  };
  if (mode === "code") entry.licenseTextPath = `snippets/${id}/LICENSE`;
  return entry;
}

function writeEntry(root: string, entry: DesignEntry, snippet: string, license: string | null): void {
  mkdirSync(path.join(root, "entries"), { recursive: true });
  writeJson(path.join(root, "entries", `${entry.id}.json`), entry);
  if (entry.ingestMode !== "code") return;
  const dir = path.join(root, "snippets", entry.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "snippet.ts"), snippet.endsWith("\n") ? snippet : `${snippet}\n`, "utf8");
  writeFileSync(path.join(dir, "LICENSE"), mitText(license ?? "MIT"), "utf8");
  writeFileSync(
    path.join(dir, "CREDIT.md"),
    `# Credit\n\n${entry.creditLine}\n\nSource: ${entry.sourceUrl}\n\nThe snippet is our remix.\n`,
    "utf8",
  );
}

function problemsFor(entry: DesignEntry, root: string): string[] {
  return validateDesignEntry(entry, {
    snippetText: (relative) => {
      try {
        return readFileSync(path.join(root, relative), "utf8");
      } catch {
        return entry.ingestMode === "code" ? "export {}\n" : "";
      }
    },
    licenseText: () => mitText("MIT"),
  });
}

function rebuildIndex(root: string, built: string): void {
  const entries = safeEntries(root);
  if (entries.length === 0) return;
  mkdirSync(root, { recursive: true });
  writeJson(path.join(root, "index.json"), buildDesignIndex(entries, built));
}

function safeEntries(root: string): DesignEntry[] {
  try {
    return loadDesignEntries(root);
  } catch {
    return [];
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cloneState(state: IngestState): IngestState {
  return { version: 1, items: { ...state.items } };
}

function day(deps: IngestDeps): string {
  if (deps.nowIso !== undefined && deps.nowIso !== "") return deps.nowIso.slice(0, 10);
  return new Date(deps.clock.now()).toISOString().slice(0, 10);
}

function isFeedUrl(url: string): boolean {
  return /\/rss\.xml$/i.test(url);
}

function hostSource(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("awwwards.com")) return "awwwards";
    if (host.endsWith("mobbin.com")) return "mobbin";
    if (host.endsWith("refero.design")) return "refero";
    return "direct";
  } catch {
    return "direct";
  }
}

function slug(value: string): string {
  const cleaned = value.toLowerCase().replace(/https?:\/\//, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 48) || "entry";
}

function mitText(spdx: string): string {
  if (spdx !== "MIT") return `${spdx}\n`;
  return [
    "MIT License",
    "",
    "Copyright (c) 2024 darkroom.engineering",
    "",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    "of this software and associated documentation files (the Software), to deal",
    "in the Software without restriction, including without limitation the rights",
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
    "copies of the Software, and to permit persons to whom the Software is",
    "furnished to do so, subject to the following conditions:",
    "",
    "The above copyright notice and this permission notice shall be included in all",
    "copies or substantial portions of the Software.",
    "",
    "THE SOFTWARE IS PROVIDED AS IS, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
    "SOFTWARE.",
    "",
  ].join("\n");
}
