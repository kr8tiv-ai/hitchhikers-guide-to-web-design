import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { curatedCandidates, discoverFwa, fwaCandidates, mergeCandidates, SHOWCASE_DELAY_MS } from "../src/award-discovery.ts";
import { isSiteReference, libraryRoot, loadDesignEntries, validateDesignEntry, type DesignEntry } from "../src/design-library.ts";
import { awardGate, runIngest, stackHints, type Clock, type GrokEntryDraft, type IngestCandidate, type IngestDeps, type IngestItemState } from "../src/ingest-pipeline.ts";

function clock(): Clock & { waits: number[] } {
  let now = 1_000;
  const waits: number[] = [];
  return {
    waits,
    now: () => now,
    wait: async (ms: number) => {
      waits.push(ms);
      now += ms;
    },
  };
}

const FOTD = { source: "fwa" as const, award: "FOTD", date: "2024-05-02", url: "https://thefwa.com/cases/studio", via: "listing" as const };

function award(url: string, title = "Studio"): IngestCandidate {
  return { url, source: "fwa", via: "auto", title, credit: "Studio Ltd", provenance: [FOTD] };
}

function draft(extra: Partial<GrokEntryDraft> = {}): GrokEntryDraft {
  return {
    techniques: ["three-hero", "not-a-technique"],
    promptLanguage: "A slow camera drifts through one lit object while the type holds still.",
    notes: "Our note on the public page. Nothing is copied.",
    perfCost: "high",
    reducedMotion: "Reduced motion shows a still frame of the object.",
    moods: ["dark", "cinematic", "glowing"],
    sectionTypes: ["hero", "sidebar"],
    libraries: ["three", "unknown-lib"],
    family: "3d-webgl",
    styleWorld: "editorial",
    kind: "site",
    source: "godly",
    ...extra,
  };
}

function libraryDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-award-"));
  mkdirSync(path.join(dir, "techniques"), { recursive: true });
  for (const name of ["three-hero", "split-text-reveal", "lenis-smooth-scroll"]) {
    writeFileSync(path.join(dir, "techniques", `${name}.md`), "# note\n");
  }
  return dir;
}

function deps(dir: string, fetchImpl: typeof fetch, extra: Partial<IngestDeps> = {}): IngestDeps {
  return { fetchImpl, clock: clock(), grok: async () => draft(), root: dir, nowIso: "2026-10-23", requireProvenance: true, ...extra };
}

const okRobots = (): Response => new Response("User-agent: *\nDisallow:\n", { status: 200 });

test("award gate: provenance is required, docs and code hosts are refused, a showcase award passes", () => {
  assert.match(awardGate({ url: "https://example.com/", source: "candidate", via: "auto" }) ?? "", /provenance/);
  assert.match(awardGate({ ...award("https://docs.astro.build/en/guides/images/") }) ?? "", /docs/);
  assert.match(awardGate({ ...award("https://example.com/docs/intro") }) ?? "", /docs/);
  assert.match(awardGate({ ...award("https://github.com/darkroomengineering/lenis") }) ?? "", /library page/);
  assert.match(awardGate({ ...award("https://example.com/"), provenance: [{ ...FOTD, url: "https://example.com/fake-award" }] }) ?? "", /not on the fwa showcase/);
  assert.match(awardGate({ ...award("https://example.com/"), provenance: [{ ...FOTD, date: "May 2024" }] }) ?? "", /provenance date/);
  assert.equal(awardGate(award("https://studio.example/")), null);
});

test("validator: an auto site needs provenance when asked, and provenance must point at the showcase", () => {
  const entry = loadDesignEntries(libraryRoot())[0] as DesignEntry;
  const auto: DesignEntry = { ...entry, id: "auto-site", kind: "site", verified: "auto" };
  delete auto.provenance;
  assert.ok(validateDesignEntry(auto, { requireSiteProvenance: true }).some((problem) => problem.includes("provenance required")));
  assert.equal(validateDesignEntry(auto).some((problem) => problem.includes("provenance")), false);
  const bad = { ...auto, provenance: [{ ...FOTD, url: "https://www.awwwards.com/sites/x" }] };
  assert.ok(validateDesignEntry(bad, { requireSiteProvenance: true }).some((problem) => problem.includes("not on the fwa showcase")));
  const good = { ...auto, provenance: [FOTD] };
  assert.equal(validateDesignEntry(good, { requireSiteProvenance: true }).some((problem) => problem.includes("provenance")), false);
});

test("the seed docs and library entries are flagged out of the award site-reference set", () => {
  const entries = loadDesignEntries(libraryRoot());
  for (const entry of entries.filter((item) => item.verified === "human")) {
    assert.equal(entry.siteReference, false, `${entry.id} should be flagged`);
    assert.equal(isSiteReference(entry), false);
  }
});

test("FWA listing: websites with dated awards since the cutoff, tracking stripped, provenance recorded", () => {
  const found = fwaCandidates(
    [
      { title: "Studio", slug: "studio", url: "https://studio.example/?utm_source=fwa", caseTypes: { name: "Website" }, profiles: [{ name: "Studio Ltd" }], awards: [{ type: "FOTD", awardedDate: "2024-05-02" }, { type: "FOTM", awardedDate: "2024-06-01" }] },
      { title: "Old", slug: "old", url: "https://old.example/", caseTypes: { name: "Website" }, awards: [{ type: "FOTD", awardedDate: "2019-01-01" }] },
      { title: "App", slug: "app", url: "https://app.example/", caseTypes: { name: "Mobile" }, awards: [{ type: "FOTD", awardedDate: "2024-01-01" }] },
      { title: "None", slug: "none", url: "https://none.example/", caseTypes: { name: "Website" }, awards: [] },
    ],
    "2022-01-01",
  );
  assert.equal(found.length, 1);
  assert.equal(found[0]?.url, "https://studio.example/");
  assert.deepEqual(found[0]?.provenance?.map((item) => `${item.source} ${item.award} ${item.date} ${item.url}`), [
    "fwa FOTD 2024-05-02 https://thefwa.com/cases/studio",
    "fwa FOTM 2024-06-01 https://thefwa.com/cases/studio",
  ]);
  assert.match(found[0]?.credit ?? "", /Studio Ltd/);
});

test("curated gallery: Awwwards award rows and GSAP showcase rows count, unawarded rows do not; merge joins provenance", () => {
  const curated = curatedCandidates([
    { url: "https://landonorris.com/", name: "Lando Norris", source: "awwwards", sourcePage: "https://www.awwwards.com/sites/lando-norris", award: "SOTY 2025", checked: "2026-10-12" },
    { url: "https://plain.example/", name: "Plain", source: "awwwards", sourcePage: "https://www.awwwards.com/sites/plain", award: "none", checked: "2026-10-12" },
    { url: "https://other.example/", name: "Other", source: "other", sourcePage: "https://other.example/", award: "none", checked: "2026-10-12" },
    { url: "https://motion.example/", name: "Motion", source: "gsap-showcase", sourcePage: "https://gsap.com/showcase/", award: "none", checked: "2026-10-12" },
  ]);
  assert.deepEqual(curated.map((item) => item.provenance?.[0]?.award), ["SOTY 2025", "GSAP Showcase"]);
  const merged = mergeCandidates([award("https://motion.example")], curated);
  const motion = merged.find((item) => item.url.includes("motion.example"));
  assert.equal(motion?.provenance?.length, 2);
  assert.equal(merged[0]?.url, "https://landonorris.com/");
});

test("FWA discovery honours robots.txt, waits between pages, and stops at the cutoff", async () => {
  const timed = clock();
  const blocked = await discoverFwa({ fetchImpl: async () => new Response("User-agent: *\nDisallow: /api/\n"), clock: timed }, "2022-01-01");
  assert.equal(blocked.candidates.length, 0);
  assert.match(blocked.note, /disallows/);
  const pages: string[] = [];
  const page = (offset: number) =>
    Array.from({ length: 50 }, (_, index) => ({
      title: `S${offset + index}`,
      slug: `s${offset + index}`,
      url: `https://s${offset + index}.example/`,
      createdDate: offset === 0 ? "2023-01-01 00:00:00" : "2021-06-01 00:00:00",
      caseTypes: { name: "Website" },
      awards: [{ type: "FOTD", awardedDate: offset === 0 ? "2023-01-01" : "2021-06-01" }],
    }));
  const result = await discoverFwa(
    {
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /admin/\n");
        pages.push(url);
        const offset = Number(new URL(url).searchParams.get("offset"));
        return new Response(JSON.stringify({ cases: page(offset) }));
      },
      clock: timed,
    },
    "2022-01-01",
  );
  assert.equal(pages.length, 2);
  assert.equal(result.candidates.length, 50);
  assert.ok(timed.waits.includes(SHOWCASE_DELAY_MS));
});

test("award ingest: no provenance is refused unfetched, a dead site fails, a live site is written with provenance and tidy tags", async () => {
  const dir = libraryDir();
  try {
    const fetched: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      fetched.push(url);
      if (url.endsWith("/robots.txt")) return okRobots();
      if (url.startsWith("https://dead.example")) return new Response("gone", { status: 404 });
      return new Response('<script src="/js/three.module.min.js"></script><script src="https://cdn/gsap.min.js"></script>', { status: 200 });
    };
    const progress: IngestItemState[] = [];
    const materials: string[] = [];
    const state = await runIngest(
      [
        { url: "https://plain.example/", source: "candidate", via: "auto" },
        award("https://dead.example/", "Dead"),
        award("https://studio.example/", "Studio"),
      ],
      { version: 1, items: {} },
      deps(dir, fetchImpl, {
        onProgress: (_state, item) => progress.push(item),
        grok: async (input) => {
          materials.push(input.material);
          assert.ok(input.vocabulary?.techniques.includes("three-hero"));
          return draft();
        },
      }),
    );
    assert.equal(state.items["https://plain.example/"]?.status, "refused");
    assert.equal(fetched.some((url) => url.includes("plain.example")), false);
    assert.match(state.items["https://dead.example/"]?.reason ?? "", /not live/);
    assert.equal(state.items["https://studio.example/"]?.status, "done");
    assert.equal(progress.length, 3);
    assert.match(materials[0] ?? "", /Award: fwa FOTD on 2024-05-02/);
    assert.match(materials[0] ?? "", /three/);
    assert.equal(stackHints('<script src="lenis.min.js"></script>'), "lenis");
    const entry = JSON.parse(readFileSync(path.join(dir, "entries", "studio.json"), "utf8")) as DesignEntry;
    assert.equal(entry.source, "fwa");
    assert.equal(entry.sourcePage, FOTD.url);
    assert.deepEqual(entry.provenance, [FOTD]);
    assert.deepEqual(entry.techniques, ["three-hero"]);
    assert.deepEqual(entry.moods, ["dark", "cinematic"]);
    assert.deepEqual(entry.sectionTypes, ["hero"]);
    assert.deepEqual(entry.libraries, ["three"]);
    assert.equal(entry.styleWorld, "3d-world");
    assert.equal(isSiteReference(entry), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("award ingest: parallel lanes finish every item, and a shared title never overwrites another site", async () => {
  const dir = libraryDir();
  try {
    const fetchImpl: typeof fetch = async (input) => (String(input).endsWith("/robots.txt") ? okRobots() : new Response("ok"));
    let inFlight = 0;
    let peak = 0;
    const state = await runIngest(
      [award("https://one.example/", "Portfolio"), award("https://two.example/", "Portfolio"), award("https://three.example/", "Portfolio")],
      { version: 1, items: {} },
      deps(dir, fetchImpl, {
        concurrency: 3,
        quotaFloor: 100,
        grok: async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return draft();
        },
      }),
    );
    assert.ok(peak > 1);
    const files = readdirSync(path.join(dir, "entries"));
    assert.equal(files.length, 3);
    const urls = files.map((file) => (JSON.parse(readFileSync(path.join(dir, "entries", file), "utf8")) as DesignEntry).sourceUrl).sort();
    assert.deepEqual(urls, ["https://one.example/", "https://three.example/", "https://two.example/"]);
    assert.equal(Object.values(state.items).filter((item) => item.status === "done").length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("robots through the crawler parser: our agent's block, server errors, and folder rules", async () => {
  const dir = libraryDir();
  try {
    const run = async (robots: () => Response, url: string) => {
      const fetched: string[] = [];
      const state = await runIngest([award(url)], { version: 1, items: {} }, deps(dir, async (input) => {
        fetched.push(String(input));
        return String(input).endsWith("/robots.txt") ? robots() : new Response("ok");
      }));
      return { item: Object.values(state.items)[0], fetched };
    };
    const ours = await run(() => new Response("User-agent: HitchhikerGuideDesignLibrary\nDisallow: /\n\nUser-agent: *\nDisallow:\n"), "https://a.example/");
    assert.equal(ours.item?.status, "refused");
    assert.equal(ours.fetched.some((url) => url === "https://a.example/"), false);
    const down = await run(() => new Response("oops", { status: 503 }), "https://b.example/");
    assert.equal(down.item?.status, "refused");
    assert.match(down.item?.reason ?? "", /503/);
    const sibling = await run(() => new Response("User-agent: *\nDisallow: /admin\n"), "https://c.example/administrator");
    assert.equal(sibling.item?.status, "done");
    const missing = await run(() => new Response("nf", { status: 404 }), "https://d.example/");
    assert.equal(missing.item?.status, "done");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
