/**
 * Design-library ingestion. Fetch, clock, and the Grok runner are injected.
 * A manual command owns the network. Tests never open one.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allowed as crawlerRobotsAllowed } from "@hitchhiker/crawler";
import { FAMILY_STYLE } from "@hitchhiker/engine";
import {
  LIBRARY_IDS,
  MOODS,
  SECTION_TYPES,
  ENTRY_SOURCES,
  provenanceProblems,
  type Provenance,
  buildDesignIndex,
  canonicalUrl,
  loadDesignEntries,
  isSiteReference,
  nearDuplicate,
  quotaAllows,
  validateDesignEntry,
  type DesignEntry,
} from "./design-library.ts";
import { DESIGN_LIBRARY_USER_AGENT, ingestPolicy, type PolicyResult } from "./ingest-policy.ts";

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
  industry?: string;
  palette?: { note?: string; hex?: string[] };
  typography?: string;
}

export interface GrokVocabulary {
  techniques: readonly string[];
  moods: readonly string[];
  sectionTypes: readonly string[];
  libraries: readonly string[];
  families: Readonly<Record<string, string>>;
}

export type GrokRunner = (input: { url: string; mode: string; material: string; vocabulary?: GrokVocabulary }) => Promise<GrokEntryDraft>;

export interface IngestCandidate {
  url: string;
  source: string;
  via: "auto" | "add";
  license?: string | null;
  title?: string;
  credit?: string;
  /** Award or curation provenance found by discovery. */
  provenance?: Provenance[];
}

export interface IngestItemState {
  url: string;
  status: "done" | "refused" | "failed" | "pending";
  mode?: string;
  reason: string;
  failures: number;
  checked?: string;
  entryId?: string;
  /** A link-only entry held back by the style-world quota, placed later without another Grok call. */
  held?: DesignEntry;
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
  /** Items processed at once. Each item still honours the per-host delay. Default 1. */
  concurrency?: number;
  /** Called after every settled item with the state so far, so a long run can save and resume. */
  onProgress?: (state: IngestState, item: IngestItemState) => void;
  /** Award gate: refuse a site with no verifiable award or curation provenance, docs pages, and dead sites. */
  requireProvenance?: boolean;
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
  const vocabulary = vocabularyFor(deps.root);
  const queue = discovered.filter((candidate, index) => {
    const key = canonicalUrl(candidate.url);
    const prior = next.items[key];
    if (prior?.status === "done" || prior?.status === "refused") return false;
    return discovered.findIndex((other) => canonicalUrl(other.url) === key) === index;
  });
  let cursor = 0;
  let accepted = 0;
  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const candidate = queue[cursor] as IngestCandidate;
      cursor += 1;
      const key = canonicalUrl(candidate.url);
      const item = await ingestOne(candidate, next.items[key], deps, hosts, vocabulary);
      next.items[key] = item;
      deps.onProgress?.(next, item);
      if (item.entryId !== undefined) {
        accepted += 1;
        // Every tenth placement, held drafts get another try so the quota does not starve a long run.
        if (accepted % 10 === 0) placeHeldItems(next, deps);
      }
    }
  };
  const lanes = Math.max(1, Math.floor(deps.concurrency ?? 1));
  await Promise.all(Array.from({ length: Math.min(lanes, Math.max(queue.length, 1)) }, () => worker()));
  placeHeldItems(next, deps);
  rebuildIndex(deps.root, day(deps));
  return next;
}

async function ingestOne(
  candidate: IngestCandidate,
  prior: IngestItemState | undefined,
  deps: IngestDeps,
  hosts: Map<string, number>,
  vocabulary: GrokVocabulary,
): Promise<IngestItemState> {
  if (isFeedUrl(candidate.url)) {
    return {
      url: candidate.url,
      status: "done",
      mode: "feed",
      reason: "Feed items became candidates. No code was stored.",
      failures: 0,
      checked: day(deps),
    };
  }
  if (deps.requireProvenance === true) {
    const gate = awardGate(candidate);
    if (gate !== null) return { url: candidate.url, status: "refused", reason: gate, failures: 0, checked: day(deps) };
  }
  if (prior?.status === "pending" && prior.held !== undefined) return placeHeld(prior.held, prior, deps);
  const robots = await readRobots(candidate.url, deps, hosts);
  if (!robots.allowed) {
    const policy = ingestPolicy(candidate.source, candidate.url, candidate.license ?? null, { allowed: false, via: candidate.via });
    return { ...itemFrom(candidate.url, "refused", policy, 0, deps), reason: robots.reason ?? policy.reason };
  }
  const license = candidate.license ?? (await githubLicense(candidate.url, deps, hosts));
  const policy = ingestPolicy(candidate.source, candidate.url, license, { allowed: true, via: candidate.via });
  if (policy.mode === "refuse") return itemFrom(candidate.url, "refused", policy, 0, deps);
  if (policy.mode === "feed") return itemFrom(candidate.url, "done", policy, 0, deps);
  try {
    let hints = "";
    if (deps.requireProvenance === true && policy.mode === "link-only") {
      const live = await fetchTimed(candidate.url, deps, hosts);
      if (live.status >= 400) {
        return { ...itemFrom(candidate.url, "failed", policy, (prior?.failures ?? 0) + 1, deps), reason: `Site not live (status ${live.status}).` };
      }
      hints = stackHints(await live.text());
    }
    const material = await allowedMaterial(candidate, policy, license, deps, hosts, hints);
    const draft = await deps.grok({ url: candidate.url, mode: policy.mode, material, vocabulary });
    if (policy.mode === "code" && (draft.snippet ?? "").split(/\r?\n/).length > 80) {
      return { ...itemFrom(candidate.url, "failed", policy, (prior?.failures ?? 0) + 1, deps), reason: "Snippet over the cap." };
    }
    const existing = safeEntries(deps.root);
    const entry = draftToEntry(candidate, policy, license, draft, deps, vocabulary, existing);
    const problems = problemsFor(entry, deps.root, vocabulary, deps.requireProvenance === true);
    if (problems.length > 0) {
      return { ...itemFrom(candidate.url, "failed", policy, (prior?.failures ?? 0) + 1, deps), reason: problems.join("; ") };
    }
    const awardSite = entry.kind === "site" && (entry.provenance?.length ?? 0) > 0;
    const duplicate = existing.some((item) =>
      canonicalUrl(item.sourceUrl) === canonicalUrl(entry.sourceUrl) || (!awardSite && nearDuplicate(item, entry)),
    );
    if (duplicate) {
      return { ...itemFrom(candidate.url, "done", policy, 0, deps), reason: "Duplicate canonical URL or technique cluster." };
    }
    // Award ingest balances the site-reference set only; flagged docs/library notes are not sites.
    const pool = awardSite ? existing.filter(isSiteReference) : existing;
    if (!quotaAllows(pool, entry.styleWorld, deps.quotaFloor ?? 8, deps.quotaShare ?? 0.34)) {
      const pending: IngestItemState = { ...itemFrom(candidate.url, "pending", policy, 0, deps), reason: `Style-world quota (${entry.styleWorld}).` };
      if (entry.ingestMode !== "code") pending.held = entry;
      return pending;
    }
    writeEntry(deps.root, entry, policy.mode === "code" ? draft.snippet ?? "" : "", license);
    return { ...itemFrom(candidate.url, "done", policy, 0, deps), entryId: entry.id, mode: policy.mode };
  } catch (error) {
    return {
      ...itemFrom(candidate.url, "failed", policy, (prior?.failures ?? 0) + 1, deps),
      reason: error instanceof Error ? error.message : "Ingest failed.",
    };
  }
}

const DOCS_HOSTS = ["github.com", "gitlab.com", "npmjs.com", "registry.npmjs.org", "codepen.io", "codesandbox.io", "stackblitz.com"];

/** Null when the candidate may proceed; otherwise the refusal reason. Pure. */
export function awardGate(candidate: IngestCandidate): string | null {
  const list = candidate.provenance ?? [];
  if (list.length === 0) return "No verifiable award or curation provenance.";
  const probe = { id: "candidate", kind: "site", verified: "auto", provenance: list } as unknown as DesignEntry;
  const problems = provenanceProblems(probe, true);
  if (problems.length > 0) return `Provenance is not verifiable: ${problems.join("; ")}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return "The URL could not be read.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "Not a public web page.";
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (DOCS_HOSTS.some((name) => host === name || host.endsWith(`.${name}`))) return "A code host or library page is not an award site.";
  if (/^(docs|developer|developers|api)\./.test(host) || /^\/(docs|documentation|api|reference)(\/|$)/i.test(parsed.pathname)) {
    return "A docs page is not an award site.";
  }
  return null;
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

/** Entries held by the quota get another try now that the mix has moved. No fetch, no Grok. */
function placeHeldItems(next: IngestState, deps: IngestDeps): void {
  let placed = true;
  while (placed) {
    placed = false;
    for (const [key, item] of Object.entries(next.items)) {
      if (item.status !== "pending" || item.held === undefined) continue;
      const after = placeHeld(item.held, item, deps);
      if (after.status !== "pending") {
        next.items[key] = after;
        deps.onProgress?.(next, after);
        placed = true;
      }
    }
  }
}

/** Place a held link-only entry if the quota allows it now; otherwise it stays pending with its draft. */
function placeHeld(held: DesignEntry, prior: IngestItemState, deps: IngestDeps): IngestItemState {
  const existing = safeEntries(deps.root);
  const base: IngestItemState = { url: prior.url, status: "done", reason: prior.reason, failures: 0, checked: day(deps) };
  if (prior.mode !== undefined) base.mode = prior.mode;
  if (existing.some((item) => canonicalUrl(item.sourceUrl) === canonicalUrl(held.sourceUrl))) {
    return { ...base, reason: "Duplicate canonical URL or technique cluster." };
  }
  const awardSite = held.kind === "site" && (held.provenance?.length ?? 0) > 0;
  const pool = awardSite ? existing.filter(isSiteReference) : existing;
  if (!quotaAllows(pool, held.styleWorld, deps.quotaFloor ?? 8, deps.quotaShare ?? 0.34)) return prior;
  const entry: DesignEntry = { ...held, id: uniqueId(held.id, held.sourceUrl, existing, deps.root) };
  writeEntry(deps.root, entry, "", entry.license);
  return { ...base, reason: "The automated path stores a link and our notes when the host is allowed.", entryId: entry.id };
}

function itemFrom(url: string, status: IngestItemState["status"], policy: PolicyResult, failures: number, deps: IngestDeps): IngestItemState {
  const item: IngestItemState = { url, status, reason: policy.reason, failures, checked: day(deps) };
  if (policy.mode !== "refuse") item.mode = policy.mode;
  return item;
}

/**
 * robots.txt through the crawler package's parser, for our user agent.
 * A missing file (4xx) allows. A server error or an unreachable host denies, so an unread file never allows.
 */
async function readRobots(url: string, deps: IngestDeps, hosts: Map<string, number>): Promise<{ allowed: boolean; reason?: string }> {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
  try {
    const response = await fetchTimed(robotsUrl, deps, hosts);
    if (response.status >= 500) return { allowed: false, reason: `robots.txt returned ${response.status}, so the site is skipped.` };
    if (!response.ok) return { allowed: true };
    const body = await response.text();
    return { allowed: crawlerRobotsAllowed(url, body, DESIGN_LIBRARY_USER_AGENT) };
  } catch {
    return { allowed: false, reason: "robots.txt could not be read, so the site is skipped." };
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
  hints = "",
): Promise<string> {
  if (policy.mode === "code" && license !== null) {
    const response = await fetchTimed(candidate.url, deps, hosts);
    const text = response.ok ? await response.text() : "";
    return `Licensed ${license}. Read only this allowed material.\n${text.slice(0, 4_000)}`;
  }
  const lines = ["Public page. Write our notes, technique names, and prompt language. Do not copy code, copy, fonts, or images."];
  if (candidate.title !== undefined && candidate.title !== "") lines.push(`Project: ${candidate.title}`);
  for (const award of candidate.provenance ?? []) lines.push(`Award: ${award.source} ${award.award} on ${award.date} (${award.url})`);
  if (hints !== "") lines.push(`Libraries seen in the page markup: ${hints}`);
  return lines.join("\n");
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
  vocabulary: GrokVocabulary,
  existing: readonly DesignEntry[],
): DesignEntry {
  const id = uniqueId(slug(candidate.title || draft.title || candidate.url), candidate.url, existing, deps.root);
  const mode = policy.mode === "code" ? "code" : "link-only";
  const award = candidate.provenance !== undefined && candidate.provenance.length > 0;
  if (award) draft = tidyDraft(draft, vocabulary);
  const entry: DesignEntry = {
    id,
    kind: draft.kind ?? "site",
    title: draft.title ?? candidate.title ?? id,
    url: candidate.url,
    source: award ? provenanceSource(candidate.provenance ?? []) : draft.source ?? "direct",
    sourcePage: award ? (candidate.provenance?.[0]?.url ?? candidate.url) : candidate.url,
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
  if (award && candidate.provenance !== undefined) entry.provenance = candidate.provenance;
  if (draft.industry !== undefined) entry.industry = draft.industry;
  if (draft.palette?.note !== undefined && draft.palette.hex !== undefined && draft.palette.hex.length > 0) entry.palette = { note: draft.palette.note, hex: draft.palette.hex };
  if (draft.typography !== undefined) entry.typography = draft.typography;
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

function problemsFor(entry: DesignEntry, root: string, vocabulary: GrokVocabulary, requireProvenance: boolean): string[] {
  return validateDesignEntry(entry, {
    requireSiteProvenance: requireProvenance,
    ...(vocabulary.techniques.length > 0 ? { techniqueNames: new Set(vocabulary.techniques) } : {}),
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

/** The vocabulary Grok must write in, read from the library so every entry validates. */
export function vocabularyFor(root: string): GrokVocabulary {
  let techniques: string[] = [];
  try {
    techniques = readdirSync(path.join(root, "techniques"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.replace(/\.md$/, ""))
      .sort();
  } catch {
    techniques = [];
  }
  return { techniques, moods: MOODS, sectionTypes: SECTION_TYPES, libraries: LIBRARY_IDS, families: FAMILY_STYLE };
}

/** Keep only vocabulary words and derive the style world from the family, so a good draft is not lost to a stray tag. */
export function tidyDraft(draft: GrokEntryDraft, vocabulary: GrokVocabulary): GrokEntryDraft {
  const keep = (list: readonly string[] | undefined, allowed: readonly string[]): string[] =>
    [...new Set((list ?? []).map((item) => String(item).trim().toLowerCase()).filter((item) => allowed.includes(item)))];
  const techniques = vocabulary.techniques.length > 0 ? keep(draft.techniques, vocabulary.techniques) : draft.techniques;
  const family = typeof draft.family === "string" && vocabulary.families[draft.family] !== undefined ? draft.family : undefined;
  const tidy: GrokEntryDraft = {
    ...draft,
    techniques,
    moods: keep(draft.moods, vocabulary.moods).slice(0, 6),
    sectionTypes: keep(draft.sectionTypes, vocabulary.sectionTypes),
    libraries: keep(draft.libraries, vocabulary.libraries),
    kind: "site",
  };
  delete tidy.industry;
  delete tidy.palette;
  delete tidy.typography;
  Object.assign(tidy, briefFields(draft));
  if (family !== undefined) {
    tidy.family = family;
    tidy.styleWorld = vocabulary.families[family] as string;
  }
  return tidy;
}

/** Industry, palette, and typography from a Grok answer, cleaned for brief matching. Invalid parts are dropped. Pure. */
export function briefFields(raw: { industry?: unknown; palette?: { note?: unknown; hex?: unknown } | unknown; typography?: unknown }): Pick<GrokEntryDraft, "industry" | "palette" | "typography"> {
  const out: Pick<GrokEntryDraft, "industry" | "palette" | "typography"> = {};
  const industry = typeof raw.industry === "string" ? raw.industry.toLowerCase().replace(/[^a-z0-9 &/-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40).trim() : "";
  if (/^[a-z0-9][a-z0-9 &/-]{1,39}$/.test(industry)) out.industry = industry;
  const palette = (typeof raw.palette === "object" && raw.palette !== null ? raw.palette : {}) as { note?: unknown; hex?: unknown };
  const hex = [...new Set((Array.isArray(palette.hex) ? palette.hex : [])
    .map((value) => String(value).trim().toUpperCase())
    .map((value) => (/^#[0-9A-F]{3}$/.test(value) ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value))
    .filter((value) => /^#[0-9A-F]{6}$/.test(value)))].slice(0, 5);
  const note = plainLine(palette.note);
  if (hex.length > 0 && note !== "") out.palette = { note, hex };
  const typography = plainLine(raw.typography);
  if (typography !== "") out.typography = typography;
  return out;
}

function plainLine(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/https?:\/\/\S+/gi, "").replace(/[\u2014\u2013]/g, ",").replace(/!/g, ".").replace(/\s+/g, " ").trim().slice(0, 220).trim();
}

function provenanceSource(list: readonly Provenance[]): DesignEntry["source"] {
  const first = list[0]?.source ?? "direct";
  return (ENTRY_SOURCES as readonly string[]).includes(first) ? (first as DesignEntry["source"]) : "direct";
}

/** A new site never overwrites another site's entry that happens to share a title slug. */
function uniqueId(base: string, url: string, existing: readonly DesignEntry[], root: string): string {
  const taken = (id: string): boolean => {
    const other = existing.find((entry) => entry.id === id);
    if (other !== undefined) return canonicalUrl(other.sourceUrl) !== canonicalUrl(url);
    return existsSync(path.join(root, "entries", `${id}.json`));
  };
  if (!taken(base)) return base;
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const withHost = slug(`${base}-${host}`);
  if (!taken(withHost)) return withHost;
  for (let index = 2; index < 1000; index += 1) {
    const next = `${withHost.slice(0, 44)}-${index}`;
    if (!taken(next)) return next;
  }
  return withHost;
}

const STACK_MARKERS: Array<[string, RegExp]> = [
  ["gsap", /gsap(\.min)?\.js|\/gsap@|["']gsap["']/i],
  ["scrolltrigger", /ScrollTrigger/],
  ["splittext", /SplitText/],
  ["lenis", /lenis/i],
  ["three", /three(\.module)?(\.min)?\.js|\/three@|THREE\./],
  ["r3f", /@react-three\/fiber/],
  ["ogl", /\bogl\b/],
  ["howler", /howler/i],
  ["view-transitions", /view-transition/i],
];

/** Library names seen in a page's markup. Facts for tagging only; nothing from the page is stored. */
export function stackHints(html: string): string {
  const sample = html.slice(0, 400_000);
  return STACK_MARKERS.filter(([, pattern]) => pattern.test(sample)).map(([name]) => name).join(", ");
}

/** Rebuild index.json from the entries on disk. Exposed so a long run can refresh it between commits. */
export function refreshIndex(root: string, built: string): void {
  rebuildIndex(root, built);
}
