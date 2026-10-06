import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GalleryEntry } from "./guide/schemas.ts";
import { referenceCards } from "./guide/suggest.ts";

/**
 * Gallery walk state machine.
 *
 * Conflict, recorded on purpose: boundaries.ts forbids the engine from
 * depending on the crawler package, where 029 exports suggestReferences.
 * referenceCards in guide/suggest.ts is that picker, copied in prompt 035.
 * nextRound calls it under the name suggestReferences. Same rule: at most
 * two Godly and two Awwwards, no source "other" as backfill. aura.build
 * rows are added after that pick when the pack lists them.
 */

export const LOVE_TARGET = 10;
export const ROUND_CAP = 6;
export const ROUND_SIZE = 4;

export const WHY_NUDGE =
  "Love and hate need a reason. One line on the thinking is enough. If there is truly nothing to say, send it blank once more.";

export const MISSING_PROMPT =
  "None of these were a love. Say what was missing. That note is kept with the shortlist.";

const STYLE_WORLDS = [
  "editorial",
  "3d-world",
  "scroll-film",
  "brutalist",
  "minimal-luxury",
  "playful",
] as const;

const WHY_LIMIT = 2_000;
const AURA_CAP = 2;

export interface Verdict {
  url: string;
  verdict: "love" | "meh" | "hate";
  why: string;
}

export interface WalkQuery {
  industry?: string;
  styleWorld?: string;
}

export interface VerdictInput {
  url: string;
  verdict: "love" | "meh" | "hate";
  why: string;
  /** Set only after the nudge for this url and verdict has been shown. */
  allowBlank?: boolean;
}

export interface WalkState {
  round: number;
  seen: string[];
  verdicts: Verdict[];
  phase: "walking" | "narrowing" | "done";
  shortlist: string[];
  nudge: { url: string; verdict: "love" | "hate" } | null;
  fillNote: string | null;
  missingPrompt: string | null;
  shortlistError: string | null;
}

export interface Deal {
  state: WalkState;
  cards: GalleryEntry[];
}

interface Plan {
  cards: GalleryEntry[];
  fillNote: string | null;
}

/**
 * sha1 of the url, hex, then .webp and .json. The crawler writes the same names.
 * The desk only reads them. It does not fetch the site.
 */
export function galleryCachePaths(cacheDir: string, url: string): { image: string; meta: string } {
  const hash = createHash("sha1").update(url).digest("hex");
  return {
    image: path.join(cacheDir, `${hash}.webp`),
    meta: path.join(cacheDir, `${hash}.json`),
  };
}

export function defaultGalleryCacheDir(): string {
  return path.join(os.homedir(), ".hitchhiker", "cache", "gallery");
}

export function emptyWalk(): WalkState {
  return {
    round: 0,
    seen: [],
    verdicts: [],
    phase: "walking",
    shortlist: [],
    nudge: null,
    fillNote: null,
    missingPrompt: null,
    shortlistError: null,
  };
}

export function loveCount(s: WalkState): number {
  let count = 0;
  for (const verdict of s.verdicts) {
    if (verdict.verdict === "love") count += 1;
  }
  return count;
}

export function parseWalkState(value: unknown): WalkState | null {
  if (!isRecord(value)) return null;
  const round = value.round;
  const phase = value.phase;
  if (typeof round !== "number" || !Number.isInteger(round) || round < 0) return null;
  if (phase !== "walking" && phase !== "narrowing" && phase !== "done") return null;
  const seen = stringList(value.seen);
  const shortlist = stringList(value.shortlist);
  if (seen === null || shortlist === null) return null;
  const verdicts = parseVerdicts(value.verdicts);
  if (verdicts === null) return null;
  const nudge = parseNudge(value.nudge);
  if (nudge === undefined) return null;
  if (value.fillNote !== null && typeof value.fillNote !== "string") return null;
  if (value.missingPrompt !== null && typeof value.missingPrompt !== "string") return null;
  if (value.shortlistError !== null && typeof value.shortlistError !== "string") return null;
  return {
    round,
    seen,
    verdicts,
    phase,
    shortlist,
    nudge,
    fillNote: typeof value.fillNote === "string" ? value.fillNote : null,
    missingPrompt: typeof value.missingPrompt === "string" ? value.missingPrompt : null,
    shortlistError: typeof value.shortlistError === "string" ? value.shortlistError : null,
  };
}

/**
 * The 029 picker. The engine cannot import the crawler package, so this
 * calls referenceCards, which is that function's local copy.
 */
function suggestReferences(
  entries: readonly GalleryEntry[],
  q: { industry?: string; styleWorld?: string; exclude?: readonly string[]; limit: number },
): GalleryEntry[] {
  return referenceCards(entries, q);
}

/** Next round of cards. Seen urls stay out. Does not mutate the state or the pack. */
export function nextRound(s: WalkState, pack: readonly GalleryEntry[], q: WalkQuery): GalleryEntry[] {
  if (s.phase !== "walking") return [];
  if (loveCount(s) >= LOVE_TARGET) return [];
  const open = openEntries(s, pack);
  if (open.length > 0) return open;
  if (s.round >= ROUND_CAP) return [];
  return planRound(pack, s.seen, q).cards;
}

/** Deal the open round, or the next one, and remember the urls. */
export function dealRound(s: WalkState, pack: readonly GalleryEntry[], q: WalkQuery): Deal {
  if (s.phase !== "walking") return { state: s, cards: [] };
  if (loveCount(s) >= LOVE_TARGET) return { state: toNarrowing(s), cards: [] };
  const open = openEntries(s, pack);
  if (open.length > 0) return { state: s, cards: open };
  if (s.round >= ROUND_CAP) return { state: toNarrowing(s), cards: [] };
  const planned = planRound(pack, s.seen, q);
  if (planned.cards.length === 0) return { state: toNarrowing(s), cards: [] };
  const seen = s.seen.slice();
  for (const card of planned.cards) {
    if (!seen.includes(card.url)) seen.push(card.url);
  }
  return {
    state: {
      ...s,
      round: s.round + 1,
      seen,
      fillNote: planned.fillNote,
      shortlistError: null,
    },
    cards: planned.cards,
  };
}

/**
 * Record love, meh, or hate. An empty why on love or hate is refused once.
 * Pass allowBlank only after that nudge has been shown. Meh may be blank.
 */
export function recordVerdict(s: WalkState, input: VerdictInput): WalkState {
  if (s.phase !== "walking") return s;
  if (!s.seen.includes(input.url)) return s;
  if (s.verdicts.some((item) => item.url === input.url)) return s;
  if (input.verdict !== "love" && input.verdict !== "meh" && input.verdict !== "hate") return s;

  const why = input.why.trim().slice(0, WHY_LIMIT);
  if ((input.verdict === "love" || input.verdict === "hate") && why.length === 0) {
    const confirmed =
      input.allowBlank === true &&
      s.nudge !== null &&
      s.nudge.url === input.url &&
      s.nudge.verdict === input.verdict;
    if (!confirmed) {
      return { ...s, nudge: { url: input.url, verdict: input.verdict }, shortlistError: null };
    }
  }

  const next: WalkState = {
    ...s,
    verdicts: [...s.verdicts, { url: input.url, verdict: input.verdict, why }],
    nudge: s.nudge !== null && s.nudge.url === input.url ? null : s.nudge,
    shortlistError: null,
  };
  if (loveCount(next) >= LOVE_TARGET) return toNarrowing(next);
  if (next.round >= ROUND_CAP && roundClosed(next)) return toNarrowing(next);
  return next;
}

export function shortlistBounds(s: WalkState): { min: number; max: number } {
  const loves = loveCount(s);
  if (loves <= 0) return { min: 0, max: 0 };
  if (loves < 3) return { min: loves, max: loves };
  return { min: 3, max: Math.min(5, loves) };
}

/** Pick 3 to 5 loved urls. Fewer than three loves keeps every love. */
export function chooseShortlist(s: WalkState, urls: readonly string[]): WalkState {
  if (s.phase === "walking") {
    return { ...s, shortlistError: "The walk is still in progress." };
  }
  if (s.phase === "done") return s;
  const loved = lovedUrls(s);
  const bounds = shortlistBounds(s);
  if (bounds.max === 0) {
    return { ...s, shortlist: [], shortlistError: null };
  }
  if (bounds.min === bounds.max && bounds.max < 3) {
    return { ...s, shortlist: loved, shortlistError: null };
  }
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (seen.has(url) || !loved.includes(url)) continue;
    seen.add(url);
    picked.push(url);
  }
  if (picked.length < bounds.min || picked.length > bounds.max) {
    return { ...s, shortlistError: "Pick 3 to 5 loved sites." };
  }
  return { ...s, shortlist: picked, shortlistError: null };
}

/** A local thread from the reasons already given. Prompt 047's think path is not called. */
export function draftThread(s: WalkState, pack: readonly GalleryEntry[]): string {
  if (loveCount(s) === 0) {
    return "Nothing in the walk was a love. What was missing belongs in this note.";
  }
  const urls = s.shortlist.length > 0 ? s.shortlist : lovedUrls(s);
  const parts: string[] = [];
  for (const url of urls) {
    const verdict = s.verdicts.find((item) => item.url === url);
    const entry = pack.find((item) => item.url === url);
    const why = verdict?.why.trim() ?? "";
    if (why.length === 0) continue;
    const name = entry?.name ?? url;
    const line = why.length > 140 ? `${why.slice(0, 140).trim()}...` : why;
    parts.push(`${name}: ${line}`);
  }
  if (parts.length === 0) return "The loved sites are chosen. The shared thread still needs a line.";
  return `The loved sites keep the same kind of thinking. ${parts.join(" ")}`;
}

/**
 * One markdown file per shortlisted site, plus references/INDEX.md.
 * The files hold the thinking. They do not embed a third-party image.
 */
export async function writeReferences(
  projectDir: string,
  s: WalkState,
  pack: readonly GalleryEntry[],
  thread: string,
): Promise<string[]> {
  if (s.phase === "walking") throw new Error("The walk has not reached the shortlist.");
  const loved = new Set(lovedUrls(s));
  const picked = s.shortlist.filter((url) => loved.has(url));
  const bounds = shortlistBounds(s);
  if (bounds.max === 0) {
    if (picked.length > 0) throw new Error("There is no love to write.");
  } else if (picked.length < bounds.min || picked.length > bounds.max) {
    throw new Error("The shortlist needs 3 to 5 loved sites.");
  }

  const dir = path.join(projectDir, ".hitchhiker", "references");
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  const used = new Set<string>();
  const indexLines: string[] = [
    "# Reference shortlist",
    "",
    "This file is for Babel Fish and Deep Thought. The notes are the thinking, not a look to copy.",
    "",
    "## Thread",
    "",
    thread.trim(),
    "",
    "## Shortlist",
    "",
  ];

  for (const url of picked) {
    const entry = pack.find((item) => item.url === url);
    const verdict = s.verdicts.find((item) => item.url === url);
    const name = entry?.name ?? url;
    const fileName = uniqueSlug(name, url, used);
    const target = path.join(dir, fileName);
    const body = [
      `# ${name}`,
      "",
      `URL: ${url}`,
      `Source: ${entry?.source ?? "unknown"}`,
      `Industry: ${entry?.industry ?? "unknown"}`,
      `Style world: ${entry?.styleWorld ?? "unknown"}`,
      `Award: ${entry?.award ?? "none"}`,
      "",
      entry?.noted ?? "Look at the thinking the visitor named, not the surface.",
      "",
      "## Why",
      "",
      flatten(verdict?.why ?? ""),
      "",
      "Keep the thinking. Do not copy the look, and do not hotlink this site's images.",
      "",
    ].join("\n");
    await writeFile(target, body, "utf8");
    written.push(target);
    indexLines.push(`- ${name} (${entry?.source ?? "listed"})`);
    indexLines.push(`  URL: ${url}`);
    indexLines.push(`  File: ${fileName}`);
    indexLines.push(`  Why: ${flatten(verdict?.why ?? "")}`);
    indexLines.push("");
  }

  if (picked.length === 0) {
    indexLines.push("No site was loved. The thread above is what was missing.");
    indexLines.push("");
  }

  indexLines.push("## Walk");
  indexLines.push("");
  for (const verdict of s.verdicts) {
    indexLines.push(`- ${verdict.url} | ${verdict.verdict} | ${flatten(verdict.why)}`);
  }
  indexLines.push("");

  const indexPath = path.join(dir, "INDEX.md");
  await writeFile(indexPath, indexLines.join("\n"), "utf8");
  written.push(indexPath);
  return written;
}

function planRound(pack: readonly GalleryEntry[], exclude: readonly string[], q: WalkQuery): Plan {
  const query = normalizeQuery(q);
  let cards = suggestReferences(pack, { ...query, exclude, limit: ROUND_SIZE });
  const used = new Set<string>([...exclude, ...cards.map((card) => card.url)]);
  const aura = auraMatches(pack, used, query);
  let auraAdded = 0;
  for (const entry of aura) {
    if (auraAdded >= AURA_CAP) break;
    cards = [...cards, entry];
    used.add(entry.url);
    auraAdded += 1;
  }

  let filledFrom: string | null = null;
  let widened = false;
  if (cards.length < ROUND_SIZE && query.styleWorld !== undefined) {
    filledFrom = fillFromWorlds(pack, cards, used, query, false);
  }
  if (cards.length < ROUND_SIZE && query.industry !== undefined) {
    const before = cards.length;
    const fromWider = fillFromWorlds(pack, cards, used, query, true);
    if (cards.length > before) {
      widened = true;
      if (filledFrom === null) filledFrom = fromWider;
    }
  }

  return { cards, fillNote: fillNote(query, cards.length, auraAdded, filledFrom, widened) };
}

function fillFromWorlds(
  pack: readonly GalleryEntry[],
  cards: GalleryEntry[],
  used: Set<string>,
  query: WalkQuery,
  dropIndustry: boolean,
): string | null {
  const origin = query.styleWorld;
  const worlds = origin === undefined ? [] : neighbours(origin);
  let filledFrom: string | null = null;
  const passes: Array<string | undefined> = origin === undefined ? [undefined] : worlds;
  for (const world of passes) {
    if (cards.length >= ROUND_SIZE) break;
    const nextQuery: WalkQuery = {};
    if (!dropIndustry && query.industry !== undefined) nextQuery.industry = query.industry;
    if (world !== undefined) nextQuery.styleWorld = world;
    const more = suggestReferences(pack, {
      ...nextQuery,
      exclude: [...used],
      limit: ROUND_SIZE - cards.length,
    });
    for (const entry of more) {
      if (cards.length >= ROUND_SIZE || used.has(entry.url)) continue;
      cards.push(entry);
      used.add(entry.url);
      if (filledFrom === null && world !== undefined && world !== origin) filledFrom = world;
    }
  }
  return filledFrom;
}

function fillNote(
  query: WalkQuery,
  count: number,
  auraAdded: number,
  filledFrom: string | null,
  widened: boolean,
): string | null {
  const parts: string[] = [];
  if (auraAdded > 0) {
    parts.push("aura.build is listed for this filter, so it is in the round.");
  }
  if (filledFrom !== null || (widened && count > 0 && query.industry !== undefined)) {
    parts.unshift("Fewer than four sites matched.");
  }
  if (widened) {
    parts.push("This industry did not have four sites. The rest come from the wider pack.");
  }
  if (filledFrom !== null) {
    parts.push(`The rest come from the nearest style world, ${filledFrom}.`);
  }
  if (parts.length === 0) return null;
  return parts.join(" ");
}

function auraMatches(pack: readonly GalleryEntry[], used: Set<string>, query: WalkQuery): GalleryEntry[] {
  const found: GalleryEntry[] = [];
  for (const entry of pack) {
    if (used.has(entry.url) || !isAura(entry.url)) continue;
    if (query.industry !== undefined && entry.industry !== query.industry) continue;
    if (query.styleWorld !== undefined && entry.styleWorld !== query.styleWorld) continue;
    found.push(entry);
  }
  return found;
}

function neighbours(origin: string): string[] {
  const start = STYLE_WORLDS.indexOf(origin as (typeof STYLE_WORLDS)[number]);
  const worlds = STYLE_WORLDS.filter((world) => world !== origin);
  return worlds.slice().sort((left, right) => {
    const leftDistance = start < 0 ? 99 : Math.abs(STYLE_WORLDS.indexOf(left) - start);
    const rightDistance = start < 0 ? 99 : Math.abs(STYLE_WORLDS.indexOf(right) - start);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return STYLE_WORLDS.indexOf(left) - STYLE_WORLDS.indexOf(right);
  });
}

function normalizeQuery(q: WalkQuery): WalkQuery {
  const next: WalkQuery = {};
  if (q.industry !== undefined && q.industry.trim() !== "") next.industry = q.industry.trim();
  if (q.styleWorld !== undefined && isStyle(q.styleWorld)) next.styleWorld = q.styleWorld;
  return next;
}

function isStyle(value: string): boolean {
  return (STYLE_WORLDS as readonly string[]).includes(value);
}

function isAura(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "aura.build" || host.endsWith(".aura.build");
  } catch {
    return false;
  }
}

function openEntries(s: WalkState, pack: readonly GalleryEntry[]): GalleryEntry[] {
  const voted = new Set(s.verdicts.map((item) => item.url));
  const cards: GalleryEntry[] = [];
  for (const url of s.seen) {
    if (voted.has(url)) continue;
    const entry = pack.find((item) => item.url === url);
    if (entry !== undefined) cards.push(entry);
  }
  return cards;
}

function roundClosed(s: WalkState): boolean {
  if (s.seen.length === 0) return false;
  const voted = new Set(s.verdicts.map((item) => item.url));
  return s.seen.every((url) => voted.has(url));
}

function toNarrowing(s: WalkState): WalkState {
  if (s.phase !== "walking") return s;
  const loves = loveCount(s);
  return {
    ...s,
    phase: "narrowing",
    missingPrompt: loves === 0 ? MISSING_PROMPT : null,
    nudge: null,
    shortlistError: null,
  };
}

function lovedUrls(s: WalkState): string[] {
  const urls: string[] = [];
  for (const verdict of s.verdicts) {
    if (verdict.verdict === "love") urls.push(verdict.url);
  }
  return urls;
}

function uniqueSlug(name: string, url: string, used: Set<string>): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const stem = base.length > 0 ? base : "site";
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 8);
  let fileName = `${stem}-${hash}.md`;
  let extra = 2;
  while (used.has(fileName)) {
    fileName = `${stem}-${hash}-${extra}.md`;
    extra += 1;
  }
  used.add(fileName);
  return fileName;
}

function flatten(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseVerdicts(value: unknown): Verdict[] | null {
  if (!Array.isArray(value)) return null;
  const verdicts: Verdict[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const verdict = item.verdict;
    if (verdict !== "love" && verdict !== "meh" && verdict !== "hate") return null;
    if (typeof item.url !== "string" || typeof item.why !== "string") return null;
    verdicts.push({ url: item.url, verdict, why: item.why });
  }
  return verdicts;
}

function parseNudge(value: unknown): WalkState["nudge"] | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  if (typeof value.url !== "string") return undefined;
  if (value.verdict !== "love" && value.verdict !== "hate") return undefined;
  return { url: value.url, verdict: value.verdict };
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return null;
    items.push(item);
  }
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
