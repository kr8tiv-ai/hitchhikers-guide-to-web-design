/**
 * Award-showcase discovery for the design library.
 * Only sites with a verifiable award or curation record become candidates, each with its provenance.
 * Fetch and clock are injected. Tests never open the network.
 */

import { allowed as robotsAllowed } from "@hitchhiker/crawler";
import { canonicalUrl, type Provenance } from "./design-library.ts";
import { DESIGN_LIBRARY_USER_AGENT } from "./ingest-policy.ts";
import type { Clock, IngestCandidate } from "./ingest-pipeline.ts";

/** Listing pages are read politely: one request per this many milliseconds. */
export const SHOWCASE_DELAY_MS = 5_000;
export const FWA_PAGE_SIZE = 50;
export const FWA_LIST_URL = "https://thefwa.com/api/cases/";

export interface FwaAward {
  type?: string;
  name?: string;
  awardedDate?: string;
  awardFor?: string;
}

export interface FwaCase {
  title?: string;
  slug?: string;
  url?: string;
  createdDate?: string;
  caseTypes?: { name?: string } | null;
  profiles?: Array<{ name?: string }>;
  awards?: FwaAward[];
}

export interface GalleryRow {
  url: string;
  name?: string;
  source: string;
  sourcePage: string;
  award?: string;
  checked?: string;
}

const AWARD_RANK: Record<string, number> = {
  FOTY: 0,
  SOTY: 0,
  TCEAY: 1,
  FOTM: 1,
  SOTM: 1,
  TCEA: 2,
  FOTD: 3,
  SOTD: 3,
  MOTD: 3,
  "Honorable Mention": 5,
  "GSAP Showcase": 6,
};

const TRACKING = /^(utm_|ref$|fbclid$|gclid$)/i;

export function cleanSiteUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    for (const key of [...parsed.searchParams.keys()]) if (TRACKING.test(key)) parsed.searchParams.delete(key);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/** FWA award-winning websites from one listing page, newer than `since` (ISO date). */
export function fwaCandidates(cases: readonly FwaCase[], since: string): IngestCandidate[] {
  const found: IngestCandidate[] = [];
  for (const item of cases) {
    if ((item.caseTypes?.name ?? "Website") !== "Website") continue;
    const url = cleanSiteUrl(item.url ?? "");
    if (url === null || item.slug === undefined || item.slug === "") continue;
    const page = `https://thefwa.com/cases/${item.slug}`;
    const provenance: Provenance[] = [];
    for (const award of item.awards ?? []) {
      const date = (award.awardedDate ?? award.awardFor ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < since) continue;
      const type = (award.type ?? "").trim();
      if (type === "") continue;
      provenance.push({ source: "fwa", award: type, date, url: page, via: "listing" });
    }
    if (provenance.length === 0) continue;
    const credit = (item.profiles ?? []).map((profile) => profile.name ?? "").filter((name) => name !== "").join(", ");
    found.push({
      url,
      source: "fwa",
      via: "auto",
      license: null,
      title: item.title ?? "",
      credit: credit === "" ? `${item.title ?? url}, awarded on The FWA (${page})` : `${credit}, ${item.title ?? ""} (${page})`,
      provenance,
    });
  }
  return found;
}

/** Sites a person already verified in the curated gallery, with the award the gallery records. */
export function curatedCandidates(rows: readonly GalleryRow[]): IngestCandidate[] {
  const found: IngestCandidate[] = [];
  for (const row of rows) {
    const url = cleanSiteUrl(row.url);
    if (url === null) continue;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(row.checked ?? "") ? (row.checked as string) : "";
    if (date === "") continue;
    let provenance: Provenance | null = null;
    if (row.source === "awwwards" && row.award !== undefined && row.award !== "" && row.award !== "none" && /awwwards\.com\/sites\//.test(row.sourcePage)) {
      provenance = { source: "awwwards", award: row.award, date, url: row.sourcePage, via: "curated-gallery" };
    } else if (row.source === "gsap-showcase" && /^https:\/\/gsap\.com\/showcase/.test(row.sourcePage)) {
      provenance = { source: "gsap-showcase", award: "GSAP Showcase", date, url: row.sourcePage, via: "curated-gallery" };
    }
    if (provenance === null) continue;
    found.push({ url, source: provenance.source, via: "auto", license: null, title: row.name ?? "", credit: `${row.name ?? url}, listed on ${provenance.source}`, provenance: [provenance] });
  }
  return found;
}

function rank(candidate: IngestCandidate): number {
  return Math.min(...(candidate.provenance ?? []).map((item) => AWARD_RANK[item.award.replace(/ \d{4}$/, "")] ?? 4), 9);
}

function newest(candidate: IngestCandidate): string {
  return (candidate.provenance ?? []).map((item) => item.date).sort().at(-1) ?? "";
}

/** Merge by canonical URL, joining provenance. Order: higher award first, then the most recent. */
export function mergeCandidates(...lists: ReadonlyArray<readonly IngestCandidate[]>): IngestCandidate[] {
  const byUrl = new Map<string, IngestCandidate>();
  for (const list of lists) {
    for (const candidate of list) {
      const key = canonicalUrl(candidate.url);
      const prior = byUrl.get(key);
      if (prior === undefined) {
        byUrl.set(key, { ...candidate, provenance: [...(candidate.provenance ?? [])] });
        continue;
      }
      for (const item of candidate.provenance ?? []) {
        if (!(prior.provenance ?? []).some((have) => have.source === item.source && have.award === item.award && have.date === item.date)) {
          prior.provenance = [...(prior.provenance ?? []), item];
        }
      }
    }
  }
  return [...byUrl.values()].sort((left, right) => {
    const delta = rank(left) - rank(right);
    if (delta !== 0) return delta;
    const date = newest(right).localeCompare(newest(left));
    if (date !== 0) return date;
    return canonicalUrl(left.url).localeCompare(canonicalUrl(right.url));
  });
}

export interface DiscoverDeps {
  fetchImpl: typeof fetch;
  clock: Clock;
  log?: (line: string) => void;
}

/** Walk the FWA award listing newest first until it passes `since`. Honours robots.txt and a polite delay. */
export async function discoverFwa(deps: DiscoverDeps, since: string, maxPages = 400): Promise<{ candidates: IngestCandidate[]; pages: number; note: string }> {
  const headers = { "user-agent": DESIGN_LIBRARY_USER_AGENT, accept: "application/json" };
  const robots = await deps.fetchImpl("https://thefwa.com/robots.txt", { headers: { "user-agent": DESIGN_LIBRARY_USER_AGENT } });
  if (robots.status >= 500) return { candidates: [], pages: 0, note: `robots.txt returned ${robots.status}; skipped.` };
  const body = robots.ok ? await robots.text() : "";
  if (!robotsAllowed(FWA_LIST_URL, body, DESIGN_LIBRARY_USER_AGENT)) return { candidates: [], pages: 0, note: "robots.txt disallows the listing; skipped." };
  const found: IngestCandidate[] = [];
  let pages = 0;
  for (let offset = 0; pages < maxPages; offset += FWA_PAGE_SIZE) {
    if (pages > 0) await deps.clock.wait(SHOWCASE_DELAY_MS);
    const response = await deps.fetchImpl(`${FWA_LIST_URL}?offset=${offset}&limit=${FWA_PAGE_SIZE}`, { headers });
    pages += 1;
    if (!response.ok) return { candidates: found, pages, note: `listing returned ${response.status} at offset ${offset}; stopped.` };
    const data = (await response.json()) as { cases?: FwaCase[] };
    const cases = data.cases ?? [];
    found.push(...fwaCandidates(cases, since));
    deps.log?.(`fwa offset ${offset}: ${cases.length} cases, ${found.length} candidates so far`);
    const oldest = cases.map((item) => (item.createdDate ?? "").slice(0, 10)).filter((date) => date !== "").sort()[0] ?? "";
    if (cases.length < FWA_PAGE_SIZE || (oldest !== "" && oldest < since)) break;
  }
  return { candidates: found, pages, note: "read the public award listing" };
}
