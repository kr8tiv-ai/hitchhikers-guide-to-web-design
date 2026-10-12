import { createHash } from "node:crypto";

/**
 * Family list and the round picker. The crawler keeps a copy of both,
 * because the engine must not import that package. A shared test checks
 * the copies stay equal.
 *
 * styleWorld is derived from family. The interview still filters on the
 * six worlds. Q9 asked for two Godly and two Awwwards. Godly now redirects
 * to Recent, so the lead cap is recent or legacy godly, then Awwwards.
 */

export const STYLE_WORLDS = [
  "editorial",
  "3d-world",
  "scroll-film",
  "brutalist",
  "minimal-luxury",
  "playful",
] as const;

export const FAMILIES = [
  "editorial",
  "brutalist",
  "3d-webgl",
  "scroll-gsap",
  "dark-luxury",
  "playful",
  "minimal",
  "saas",
  "architecture-real-estate",
  "portfolio",
  "ecommerce",
  "culture-art",
  "fashion-beauty",
  "hospitality-food",
  "photography",
  "nonprofit-events",
  "dev-tools-craft",
] as const;

export type GalleryFamily = (typeof FAMILIES)[number];
export type GalleryStyleWorld = (typeof STYLE_WORLDS)[number];

/** Pinned family to style world map. Adjust only with a written reason. */
export const FAMILY_STYLE: Record<GalleryFamily, GalleryStyleWorld> = {
  editorial: "editorial",
  photography: "editorial",
  "culture-art": "editorial",
  portfolio: "editorial",
  brutalist: "brutalist",
  "3d-webgl": "3d-world",
  "scroll-gsap": "scroll-film",
  "dev-tools-craft": "scroll-film",
  "dark-luxury": "minimal-luxury",
  minimal: "minimal-luxury",
  "fashion-beauty": "minimal-luxury",
  "hospitality-food": "minimal-luxury",
  "architecture-real-estate": "minimal-luxury",
  ecommerce: "minimal-luxury",
  saas: "minimal-luxury",
  playful: "playful",
  "nonprofit-events": "playful",
};

export const GALLERY_SOURCES = [
  "awwwards",
  "recent",
  "godly",
  "gsap-showcase",
  "aura",
  "other",
] as const;

export type GallerySource = (typeof GALLERY_SOURCES)[number];

export const ROUND_FILL = 4;
const LEAD_CAP = 2;
const AWW_CAP = 2;
const AURA_CAP = 2;

const familySet: ReadonlySet<string> = new Set(FAMILIES);
const styleSet: ReadonlySet<string> = new Set(STYLE_WORLDS);
const sourceSet: ReadonlySet<string> = new Set(GALLERY_SOURCES);

export function isGalleryFamily(value: string): value is GalleryFamily {
  return familySet.has(value);
}

export function isGalleryStyleWorld(value: string): value is GalleryStyleWorld {
  return styleSet.has(value);
}

export function isGallerySource(value: string): value is GallerySource {
  return sourceSet.has(value);
}

export function styleWorldForFamily(family: string): GalleryStyleWorld | null {
  if (!isGalleryFamily(family)) return null;
  return FAMILY_STYLE[family];
}

export function familyOf(entry: { family?: string }): string {
  if (typeof entry.family === "string" && isGalleryFamily(entry.family)) return entry.family;
  return "";
}

export interface GalleryPick {
  url: string;
  source: string;
  industry: string;
  styleWorld: string;
  family?: string;
  verified?: boolean;
}

export interface CardQuery {
  industry?: string;
  styleWorld?: string;
  family?: string;
  exclude?: readonly string[];
  limit: number;
  seed?: string;
  /** 1-based round being dealt. The taste nudge starts at round 2. */
  round?: number;
  lovedUrls?: readonly string[];
}

/** Stable unsigned rank. Not Math.random, and not locale order. */
export function stableRank(seed: string, key: string): number {
  const digest = createHash("sha256").update(`${seed}\n${key}`).digest();
  return digest.readUInt32BE(0);
}

export function isAuraUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "aura.build" || host.endsWith(".aura.build");
  } catch {
    return false;
  }
}

function isLead(source: string): boolean {
  return source === "godly" || source === "recent";
}

/**
 * One round. Quota first (up to two lead, up to two Awwwards), then
 * backfill until four. Unfiltered rounds with three or more families in
 * the pool keep at most two cards of one family and at least three families.
 */
export function selectReferenceCards<T extends GalleryPick>(
  entries: readonly T[],
  query: CardQuery,
): T[] {
  if (!Number.isFinite(query.limit) || query.limit <= 0) return [];
  const cap = Math.min(Math.floor(query.limit), ROUND_FILL);
  const seed = query.seed !== undefined && query.seed.length > 0 ? query.seed : "hh";
  const excluded = new Set(query.exclude ?? []);
  const eligible: T[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.url) || excluded.has(entry.url)) continue;
    if (entry.verified === false) continue;
    if (query.industry !== undefined && entry.industry !== query.industry) continue;
    if (query.styleWorld !== undefined && entry.styleWorld !== query.styleWorld) continue;
    if (query.family !== undefined && query.family.length > 0 && familyOf(entry) !== query.family) continue;
    seen.add(entry.url);
    eligible.push(entry);
  }

  const distinct = distinctFamilies(eligible);
  const unfiltered = query.styleWorld === undefined && (query.family === undefined || query.family.length === 0);
  const familyFilter = query.family !== undefined && query.family.length > 0;
  const spread = !familyFilter && distinct.length >= 2 && (unfiltered || query.styleWorld !== undefined);
  const needThree = unfiltered && distinct.length >= 3;
  const maxPerFamily = spread ? 2 : Number.POSITIVE_INFINITY;
  const ordered = spread ? spreadOrder(eligible, seed) : eligible;

  const leads = ordered.filter((entry) => isLead(entry.source));
  const aww = ordered.filter((entry) => entry.source === "awwwards");
  const gsap = ordered.filter((entry) => entry.source === "gsap-showcase");
  const aura = ordered.filter((entry) => entry.source === "aura" || (entry.source === "other" && isAuraUrl(entry.url)));
  const other = ordered.filter(
    (entry) => entry.source === "other" && !isAuraUrl(entry.url),
  );

  const picked: T[] = [];
  const familyCounts = new Map<string, number>();
  const leadCount = { n: 0 };
  const awwCount = { n: 0 };
  const auraCount = { n: 0 };

  const take = (entry: T): void => {
    picked.push(entry);
    const family = familyOf(entry);
    if (family.length > 0) familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  };

  const unusedFamilyLeft = (): boolean => {
    for (const entry of ordered) {
      if (picked.some((item) => item.url === entry.url)) continue;
      const family = familyOf(entry);
      if (family.length > 0 && !familyCounts.has(family)) return true;
    }
    return false;
  };

  const allowed = (entry: T, preferNew: boolean): boolean => {
    const family = familyOf(entry);
    if (family.length === 0) return true;
    const count = familyCounts.get(family) ?? 0;
    if (count >= maxPerFamily) return false;
    if (!preferNew || count < 1 || !unusedFamilyLeft()) return true;
    if (needThree && familyCounts.size < 3) return false;
    if (!unfiltered && query.styleWorld !== undefined && familyCounts.size < Math.min(cap, distinct.length)) {
      return false;
    }
    return true;
  };

  const pull = (pool: readonly T[], sourceCap: number, counter: { n: number }, preferNew: boolean): void => {
    for (const entry of pool) {
      if (picked.length >= cap || counter.n >= sourceCap) return;
      if (picked.some((item) => item.url === entry.url)) continue;
      if (!allowed(entry, preferNew)) continue;
      take(entry);
      counter.n += 1;
    }
  };

  if (!spread) {
    let leadIndex = 0;
    let awwIndex = 0;
    for (let slot = 0; slot < LEAD_CAP && picked.length < cap; slot += 1) {
      const lead = leads[leadIndex];
      if (lead !== undefined && leadCount.n < LEAD_CAP) {
        leadIndex += 1;
        take(lead);
        leadCount.n += 1;
      }
      if (picked.length >= cap) break;
      const award = aww[awwIndex];
      if (award !== undefined && awwCount.n < AWW_CAP) {
        awwIndex += 1;
        take(award);
        awwCount.n += 1;
      }
    }
  } else {
    pull(leads, LEAD_CAP, leadCount, true);
    pull(aww, AWW_CAP, awwCount, true);
  }

  const rest = { n: 0 };
  pull(gsap, Number.POSITIVE_INFINITY, rest, true);
  pull(aura, AURA_CAP, auraCount, true);
  pull(other, Number.POSITIVE_INFINITY, rest, true);

  if (spread) {
    pull(leads, LEAD_CAP, leadCount, false);
    pull(aww, AWW_CAP, awwCount, false);
    pull(gsap, Number.POSITIVE_INFINITY, rest, false);
    pull(aura, AURA_CAP, auraCount, false);
    pull(other, Number.POSITIVE_INFINITY, rest, false);
  }

  if ((query.round ?? 1) >= 2) {
    applyTaste(picked, ordered, entries, excluded, query.lovedUrls ?? [], maxPerFamily);
  }
  return picked;
}

function applyTaste<T extends GalleryPick>(
  picked: T[],
  pool: readonly T[],
  entries: readonly T[],
  excluded: ReadonlySet<string>,
  lovedUrls: readonly string[],
  maxPerFamily: number,
): void {
  if (picked.length === 0) return;
  const loveFamilies: string[] = [];
  for (const url of lovedUrls) {
    const entry = entries.find((item) => item.url === url);
    const family = entry === undefined ? "" : familyOf(entry);
    if (family.length > 0) loveFamilies.push(family);
  }
  const seenFamilies = new Set<string>();
  for (const entry of entries) {
    if (!excluded.has(entry.url)) continue;
    const family = familyOf(entry);
    if (family.length > 0) seenFamilies.add(family);
  }

  let top = "";
  if (loveFamilies.length > 0) {
    const counts = new Map<string, number>();
    for (const family of loveFamilies) counts.set(family, (counts.get(family) ?? 0) + 1);
    let best = 0;
    for (const family of loveFamilies) {
      const count = counts.get(family) ?? 0;
      if (count > best) {
        best = count;
        top = family;
      }
    }
  }

  const hasFamily = (family: string): boolean => picked.some((entry) => familyOf(entry) === family);
  const countsNow = (): Map<string, number> => {
    const map = new Map<string, number>();
    for (const entry of picked) {
      const family = familyOf(entry);
      if (family.length > 0) map.set(family, (map.get(family) ?? 0) + 1);
    }
    return map;
  };

  const find = (pred: (entry: T) => boolean): T | undefined => {
    for (const entry of pool) {
      if (picked.some((item) => item.url === entry.url)) continue;
      if (excluded.has(entry.url)) continue;
      if (pred(entry)) return entry;
    }
    return undefined;
  };

  const swap = (next: T, keepFamily: string): boolean => {
    const nextFamily = familyOf(next);
    for (let index = picked.length - 1; index >= 0; index -= 1) {
      const current = picked[index];
      if (current === undefined) continue;
      const currentFamily = familyOf(current);
      if (keepFamily.length > 0 && currentFamily === keepFamily) {
        const only = picked.filter((entry) => familyOf(entry) === keepFamily).length === 1;
        if (only) continue;
      }
      picked[index] = next;
      const after = countsNow();
      let ok = true;
      for (const count of after.values()) {
        if (count > maxPerFamily) ok = false;
      }
      if (!ok || (nextFamily.length > 0 && (after.get(nextFamily) ?? 0) > maxPerFamily)) {
        picked[index] = current;
        continue;
      }
      return true;
    }
    return false;
  };

  if (top.length > 0 && !hasFamily(top)) {
    const next = find((entry) => familyOf(entry) === top);
    if (next !== undefined) swap(next, "");
  }

  const hasUnseen = picked.some((entry) => {
    const family = familyOf(entry);
    return family.length > 0 && !seenFamilies.has(family);
  });
  if (!hasUnseen) {
    const next = find((entry) => {
      const family = familyOf(entry);
      return family.length > 0 && !seenFamilies.has(family);
    });
    if (next !== undefined) swap(next, top);
  }
}

function distinctFamilies<T extends GalleryPick>(entries: readonly T[]): string[] {
  const found: string[] = [];
  for (const entry of entries) {
    const family = familyOf(entry);
    if (family.length > 0 && !found.includes(family)) found.push(family);
  }
  return found;
}

function spreadOrder<T extends GalleryPick>(entries: readonly T[], seed: string): T[] {
  const groups = new Map<string, T[]>();
  const loose: T[] = [];
  for (const entry of entries) {
    const family = familyOf(entry);
    if (family.length === 0) {
      loose.push(entry);
      continue;
    }
    const list = groups.get(family) ?? [];
    list.push(entry);
    groups.set(family, list);
  }
  for (const list of groups.values()) {
    list.sort((left, right) => stableRank(seed, left.url) - stableRank(seed, right.url));
  }
  const names = [...groups.keys()].sort();
  if (names.length === 0) return [...entries];
  const start = stableRank(seed, "family-start") % names.length;
  const rotated = [...names.slice(start), ...names.slice(0, start)];
  const out: T[] = [];
  let index = 0;
  let added = true;
  while (added) {
    added = false;
    for (const family of rotated) {
      const item = groups.get(family)?.[index];
      if (item !== undefined) {
        out.push(item);
        added = true;
      }
    }
    index += 1;
  }
  return [...out, ...loose];
}
