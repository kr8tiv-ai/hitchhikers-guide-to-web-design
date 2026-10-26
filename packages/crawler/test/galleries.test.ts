import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CURATED_PACK_FILE,
  DEFAULT_GALLERY_ALLOW,
  GALLERY_CACHE_MAX_AGE_MS,
  GALLERY_FETCH_TIMEOUT_MS,
  USER_AGENT,
  cacheIsFresh,
  loadCurated,
  refreshGalleries,
  suggestReferences,
  type GalleryEntry,
  type GallerySource,
  type GalleryStyleWorld,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

/**
 * The shipped pack holds at least 120 original rows. Lando Norris stays
 * SOTY 2025. CoMinVi stays a Site of the Day dated 2026-09-30. No SOTY
 * 2026 winner is invented. Legacy godly rows are not added.
 */

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function row(over: Partial<GalleryEntry> = {}): GalleryEntry {
  const entry: GalleryEntry = {
    name: "Example",
    url: "https://example.com/one",
    source: "awwwards",
    industry: "other",
    styleWorld: "editorial",
    motionLevel: 4,
    award: "none",
    noted: "Look at how a fixture stays a fixture.",
  };
  return { ...entry, ...over };
}

function many(source: GallerySource, count: number, industry = "saas"): GalleryEntry[] {
  const entries: GalleryEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    entries.push(
      row({
        name: `${source}-${index}`,
        url: `https://example.com/${source}/${index}`,
        source,
        industry,
        styleWorld: "playful",
      }),
    );
  }
  return entries;
}

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-gallery-"));
}

function writePack(dir: string, entries: unknown): string {
  const file = path.join(dir, "pack.json");
  writeFileSync(file, JSON.stringify(entries), "utf8");
  return file;
}

test("the offline pack keeps Lando as SOTY 2025 and CoMinVi as SOTD", () => {
  const pack = loadCurated(CURATED_PACK_FILE);
  assert.equal(path.basename(CURATED_PACK_FILE), "curated.json");
  assert.ok(pack.length >= 120);

  const lando = pack.find((entry) => entry.name === "Lando Norris");
  assert.ok(lando);
  assert.equal(lando.award, "SOTY 2025");
  assert.equal(lando.source, "awwwards");
  assert.equal(lando.url, "https://landonorris.com/");
  assert.equal(lando.noted.startsWith("Look at"), true);

  const cominvi = pack.find((entry) => entry.name === "CoMinVi");
  assert.ok(cominvi);
  assert.equal(cominvi.award, "SOTD");
  assert.equal(cominvi.award.includes("SOTY"), false);
  assert.equal(cominvi.source, "awwwards");

  const raw: unknown = JSON.parse(readFileSync(CURATED_PACK_FILE, "utf8"));
  assert.ok(Array.isArray(raw));
  const cominviRaw = raw.find((entry) => {
    return typeof entry === "object" && entry !== null && "name" in entry && entry.name === "CoMinVi";
  });
  assert.ok(cominviRaw && typeof cominviRaw === "object" && "date" in cominviRaw);
  assert.equal(cominviRaw.date, "2026-09-30");

  const sources = ["awwwards", "recent", "godly", "gsap-showcase", "aura", "other"];
  const awards = ["none", "SOTD", "Honorable Mention", "Developer Award", "SOTY 2025"];
  for (const entry of pack) {
    assert.equal(/SOTY\s*2026/i.test(entry.award), false);
    assert.equal(entry.noted.startsWith("Look at"), true);
    assert.equal(entry.noted.includes("!"), false);
    assert.equal(entry.noted.includes("\n"), false);
    assert.equal(sources.includes(entry.source), true, entry.source);
    assert.equal(awards.includes(entry.award), true, entry.award);
    if (entry.award === "SOTY 2025") assert.equal(entry.name, "Lando Norris");
    if (entry.award === "SOTD") assert.equal(entry.award.includes("Year"), false);
  }
  assert.equal(
    pack.some((entry) => entry.source === "godly"),
    false,
  );
});

test("the loader rejects SOTY 2026", () => {
  const dir = tempDir();
  try {
    const file = writePack(dir, [row({ award: "SOTY 2026" })]);
    assert.throws(() => loadCurated(file), /SOTY 2026/);
    const spaced = writePack(dir, [row({ award: "  soty   2026 winner" })]);
    assert.throws(() => loadCurated(spaced), /SOTY 2026/);
  } finally {
    removeTempDir(dir);
  }
});

test("the loader accepts SOTY 2025 and rejects a SOTD row that says SOTY", () => {
  const dir = tempDir();
  try {
    const ok = writePack(dir, [row({ award: "SOTY 2025", url: "https://example.com/soty" })]);
    assert.equal(loadCurated(ok)[0]?.award, "SOTY 2025");
    const mixed = writePack(dir, [row({ award: "SOTD SOTY", url: "https://example.com/mixed" })]);
    assert.throws(() => loadCurated(mixed), /Site of the Day/);
  } finally {
    removeTempDir(dir);
  }
});

test("duplicate urls throw at load", () => {
  const dir = tempDir();
  try {
    const file = writePack(dir, [
      row({ url: "https://example.com/same" }),
      row({ name: "Again", url: "https://example.com/same" }),
    ]);
    assert.throws(() => loadCurated(file), /Duplicate gallery url: https:\/\/example.com\/same/);
  } finally {
    removeTempDir(dir);
  }
});

test("snake_case pack fields load into GalleryEntry", () => {
  const dir = tempDir();
  try {
    const file = writePack(dir, [
      {
        name: "Snake",
        url: "https://example.com/snake",
        source: "other",
        industry: "agency",
        style_world: "brutalist",
        motion_level: 3,
        award: "none",
        noted: "Look at the field names, not the furniture.",
      },
    ]);
    const loaded = loadCurated(file);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]?.styleWorld, "brutalist");
    assert.equal(loaded[0]?.motionLevel, 3);
  } finally {
    removeTempDir(dir);
  }
});

test("suggestReferences respects limit and does not mutate the array", () => {
  const entries = [...many("godly", 5), ...many("awwwards", 5), ...many("other", 5)];
  const before = structuredClone(entries);
  Object.freeze(entries);

  assert.deepEqual(suggestReferences(entries, { limit: 0 }), []);
  assert.deepEqual(suggestReferences(entries, { limit: -2 }), []);

  const one = suggestReferences(entries, { limit: 1 });
  assert.equal(one.length, 1);
  assert.equal(one[0]?.source, "godly");

  const two = suggestReferences(entries, { limit: 2 });
  assert.deepEqual(
    two.map((entry) => entry.source),
    ["godly", "awwwards"],
  );

  const round = suggestReferences(entries, { limit: 4 });
  assert.equal(round.length, 4);
  assert.equal(round.filter((entry) => entry.source === "godly").length, 2);
  assert.equal(round.filter((entry) => entry.source === "awwwards").length, 2);
  assert.equal(round.filter((entry) => entry.source === "other").length, 0);

  const wide = suggestReferences(entries, { limit: 10 });
  assert.equal(wide.length, 4);

  assert.deepEqual(entries, before);
});

test("suggestReferences skips excluded urls and does not backfill from other", () => {
  const godly = many("godly", 4);
  const awwwards = many("awwwards", 3);
  const other = many("other", 6);
  const first = godly[0];
  const second = godly[1];
  assert.ok(first);
  assert.ok(second);
  const picked = suggestReferences([...godly, ...awwwards, ...other], {
    limit: 4,
    exclude: [first.url, second.url],
  });
  assert.equal(picked.length, 4);
  assert.equal(picked.some((entry) => entry.url === first.url), false);
  assert.equal(picked.some((entry) => entry.url === second.url), false);
  assert.equal(picked.filter((entry) => entry.source === "godly").length, 2);
  assert.equal(picked.filter((entry) => entry.source === "other").length, 0);

  const awwwardsOnly = suggestReferences([...awwwards, ...other], { limit: 4 });
  assert.equal(awwwardsOnly.length, 4);
  assert.equal(awwwardsOnly.filter((entry) => entry.source === "awwwards").length, 2);
  assert.equal(awwwardsOnly.filter((entry) => entry.source === "other").length, 2);
});

test("suggestReferences filters industry and style world together", () => {
  const entries = [
    row({ name: "Match", url: "https://example.com/match", industry: "fashion", styleWorld: "editorial" }),
    row({
      name: "Other industry",
      url: "https://example.com/industry",
      industry: "health",
      styleWorld: "editorial",
      source: "godly",
    }),
    row({
      name: "Other world",
      url: "https://example.com/world",
      industry: "fashion",
      styleWorld: "brutalist" satisfies GalleryStyleWorld,
      source: "godly",
    }),
  ];
  const both = suggestReferences(entries, { industry: "fashion", styleWorld: "editorial", limit: 4 });
  assert.deepEqual(
    both.map((entry) => entry.name),
    ["Match"],
  );
  const none = suggestReferences(entries, { industry: "fashion", styleWorld: "playful", limit: 4 });
  assert.deepEqual(none, []);
});

test("suggestReferences on the curated pack stays inside the limit", () => {
  const pack = loadCurated(CURATED_PACK_FILE);
  const before = structuredClone(pack);
  const suggested = suggestReferences(pack, { limit: 4 });
  assert.equal(suggested.length, 4);
  assert.ok(suggested.filter((entry) => entry.source === "awwwards").length <= 2);
  assert.ok(suggested.filter((entry) => entry.source === "godly" || entry.source === "recent").length <= 2);
  assert.deepEqual(pack, before);

  const lando = pack.find((entry) => entry.name === "Lando Norris");
  assert.ok(lando);
  const withoutLando = suggestReferences(pack, { limit: 4, exclude: [lando.url] });
  assert.equal(
    withoutLando.some((entry) => entry.url === lando.url),
    false,
  );
});

test("cacheIsFresh uses the injected clock and a 7 day max age", () => {
  const fetchedAt = "2026-01-01T00:00:00.000Z";
  const atAge = new Date(Date.parse(fetchedAt) + GALLERY_CACHE_MAX_AGE_MS);
  assert.equal(GALLERY_CACHE_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(cacheIsFresh(fetchedAt, atAge), true);
  assert.equal(cacheIsFresh(fetchedAt, new Date(atAge.getTime() + 1)), false);
  assert.equal(cacheIsFresh(fetchedAt, new Date(Date.parse(fetchedAt) - 1)), false);
  assert.equal(cacheIsFresh("not-a-date", atAge), false);
});

test("refresh without a fetcher skips and does not throw", async () => {
  const result = await refreshGalleries({ allow: ["https://example.com/gallery"] });
  assert.deepEqual(result, { status: "skipped", reason: "no fetcher" });
});

test("an empty allow list performs zero fetches", async () => {
  const fetchImpl: typeof fetch = () => {
    throw new Error("fetch should not be called");
  };
  const result = await refreshGalleries({ fetchImpl, allow: DEFAULT_GALLERY_ALLOW });
  assert.deepEqual(DEFAULT_GALLERY_ALLOW, []);
  assert.deepEqual(result, { status: "skipped", reason: "allow list empty" });
});

test("refresh GETs only the allow-listed URL and writes a cache", async () => {
  const dir = tempDir();
  try {
    const cachePath = path.join(dir, "nested", "cache.json");
    const allowUrl = "https://example.com/listing";
    const calls: Array<{ url: string; method: string | undefined; redirect: RequestRedirect | undefined }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, method: init?.method, redirect: init?.redirect });
      assert.ok(init?.signal instanceof AbortSignal);
      assert.equal(new Headers(init?.headers).get("user-agent"), USER_AGENT);
      return new Response("<html>listing</html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };
    const now = new Date("2026-10-06T12:00:00.000Z");
    const result = await refreshGalleries({ fetchImpl, allow: [allowUrl, allowUrl], cachePath, now });
    assert.deepEqual(result, { status: "ok", reason: "fetched" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, allowUrl);
    assert.equal(calls[0]?.method, "GET");
    assert.equal(calls[0]?.redirect, "manual");

    const stored: unknown = JSON.parse(readFileSync(cachePath, "utf8"));
    assert.ok(stored && typeof stored === "object");
    assert.equal("fetchedAt" in stored && stored.fetchedAt, now.toISOString());
    assert.equal("entries" in stored && Array.isArray(stored.entries) && stored.entries.length, 0);

    const again = await refreshGalleries({
      fetchImpl: () => {
        throw new Error("fetch should not be called");
      },
      allow: [allowUrl],
      cachePath,
      now: new Date(now.getTime() + 1_000),
    });
    assert.deepEqual(again, { status: "ok", reason: "cache fresh" });
    assert.equal(readFileSync(cachePath, "utf8").includes(now.toISOString()), true);
  } finally {
    removeTempDir(dir);
  }
});

test("a cache older than 7 days is not used", async () => {
  const dir = tempDir();
  try {
    const cachePath = path.join(dir, "cache.json");
    const now = new Date("2026-10-06T00:00:00.000Z");
    writeFileSync(
      cachePath,
      JSON.stringify({
        fetchedAt: new Date(now.getTime() - GALLERY_CACHE_MAX_AGE_MS - 1).toISOString(),
        entries: [],
      }),
      "utf8",
    );
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    };
    const result = await refreshGalleries({
      fetchImpl,
      allow: ["https://example.com/listing"],
      cachePath,
      now,
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { status: "ok", reason: "fetched" });
    const stored: unknown = JSON.parse(readFileSync(cachePath, "utf8"));
    assert.ok(stored && typeof stored === "object" && "fetchedAt" in stored);
    assert.equal(stored.fetchedAt, now.toISOString());
  } finally {
    removeTempDir(dir);
  }
});

test("a JSON object is not treated as a gallery API, and SOTY 2026 is not cached", async () => {
  const dir = tempDir();
  try {
    const objectPath = path.join(dir, "object.json");
    const objectFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ results: [{ name: "Nope" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await refreshGalleries({
      fetchImpl: objectFetch,
      allow: ["https://example.com/api"],
      cachePath: objectPath,
      now: new Date("2026-10-06T00:00:00.000Z"),
    });
    const stored: unknown = JSON.parse(readFileSync(objectPath, "utf8"));
    assert.ok(stored && typeof stored === "object" && "entries" in stored && Array.isArray(stored.entries));
    assert.equal(stored.entries.length, 0);

    const badPath = path.join(dir, "bad.json");
    const badFetch: typeof fetch = async () =>
      new Response(JSON.stringify([row({ award: "SOTY 2026", url: "https://example.com/invented" })]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    await assert.rejects(
      () =>
        refreshGalleries({
          fetchImpl: badFetch,
          allow: ["https://example.com/bad"],
          cachePath: badPath,
          now: new Date("2026-10-06T00:00:00.000Z"),
        }),
      /SOTY 2026/,
    );
    assert.throws(() => readFileSync(badPath, "utf8"));
  } finally {
    removeTempDir(dir);
  }
});

test("a redirect off the allow list is not followed", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(null, { status: 302, headers: { location: "https://example.com/elsewhere" } });
  await assert.rejects(
    () =>
      refreshGalleries({
        fetchImpl,
        allow: ["https://example.com/listing"],
        now: new Date("2026-10-06T00:00:00.000Z"),
      }),
    /redirect/,
  );
});

test("galleries.ts does not import playwright or refresh on import", () => {
  const galleries = readFileSync(path.join(srcDir, "galleries.ts"), "utf8");
  const index = readFileSync(path.join(srcDir, "index.ts"), "utf8");
  assert.equal(galleries.toLowerCase().includes("playwright"), false);
  assert.equal(galleries.includes("setInterval"), false);
  assert.equal(galleries.includes("globalThis.fetch"), false);
  assert.equal((galleries.match(/refreshGalleries\(/g) ?? []).length, 1);
  assert.equal(index.includes("refreshGalleries("), false);
  assert.equal(GALLERY_FETCH_TIMEOUT_MS, 10_000);
  assert.match(galleries, /AbortSignal\.timeout\(GALLERY_FETCH_TIMEOUT_MS\)/);
  for (const host of ["godly.website", "awwwards.com"]) {
    assert.equal(galleries.toLowerCase().includes(host), false, galleries);
    assert.equal(index.toLowerCase().includes(host), false);
  }
});
