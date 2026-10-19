import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  formatSelection,
  libraryRoot,
  loadDesignEntries,
  loadDesignIndex,
  selectDesignEntries,
  selectionHasBan,
  validateDesignEntry,
  type DesignEntry,
} from "../src/design-library.ts";
import { ingestPolicy } from "../src/ingest-policy.ts";
import { recheckLibrary, runIngest, type Clock, type GrokEntryDraft, type IngestCandidate, type IngestDeps, type IngestState } from "../src/ingest-pipeline.ts";

const root = libraryRoot();

function calm() {
  return selectDesignEntries(
    {
      artDirection: "calm editorial magazine",
      sectionType: "story",
      styleWorld: "editorial",
      moods: ["calm", "editorial", "minimal"],
      motionScore: 3,
      budget3d: 0,
      stack: ["lenis"],
    },
    loadDesignEntries(root),
    { index: loadDesignIndex(root) },
  );
}

test("a calm editorial brief picks editorial and minimal luxury with Lenis and a soft reveal", () => {
  const picked = calm();
  assert.ok(picked.some((entry) => entry.styleWorld === "editorial" && entry.libraries.includes("lenis") && /soft reveal/i.test(entry.promptLanguage)));
  assert.ok(picked.some((entry) => entry.styleWorld === "minimal-luxury" && entry.libraries.includes("lenis") && /soft reveal/i.test(entry.promptLanguage)));
  const text = formatSelection(picked);
  assert.equal(selectionHasBan(text), false);
  assert.match(text, /Take the thinking, not the skin\./);
  assert.match(text, /do not reproduce an entry/);
});

test("a bold tech brief picks scroll film and 3D entries, and the same input matches", () => {
  const input = {
    artDirection: "bold technical product",
    sectionType: "hero",
    styleWorld: "scroll-film",
    moods: ["bold", "technical"],
    motionScore: 9,
    budget3d: 2,
    stack: ["gsap", "three"],
  };
  const entries = loadDesignEntries(root);
  const index = loadDesignIndex(root);
  const first = selectDesignEntries(input, entries, { index });
  const second = selectDesignEntries(input, entries, { index });
  assert.deepEqual(first.map((entry) => entry.id), second.map((entry) => entry.id));
  assert.ok(first.some((entry) => entry.styleWorld === "scroll-film"));
  assert.ok(first.some((entry) => entry.styleWorld === "3d-world"));
  assert.equal(selectionHasBan(formatSelection(first)), false);
});

test("the seed technique notes name prompt language, perf cost, and reduced motion", () => {
  const required = [
    "three-hero",
    "r3f-island",
    "glsl-gradient-noise",
    "image-distortion-hover",
    "scrolltrigger-pin-timeline",
    "split-text-reveal",
    "lenis-smooth-scroll",
    "layered-parallax",
    "view-transitions",
    "scroll-video",
    "asymmetric-editorial-grid",
    "typographic-scale",
    "grain-and-grade",
    "ambient-sound-toggle",
  ];
  for (const name of required) {
    const text = readFileSync(path.join(root, "techniques", `${name}.md`), "utf8");
    assert.match(text, /Prompt language/);
    assert.match(text, /Perf cost/i);
    assert.match(text, /Reduced motion/);
  }
});

test("a snippet over the cap or a missing license text fails validation", () => {
  const entry = sampleEntry();
  const long = Array.from({ length: 81 }, () => "export const line = 1;").join("\n");
  const over = validateDesignEntry(entry, { snippetText: () => long, licenseText: () => "MIT License\nCopyright (c) 2024 darkroom.engineering\n" });
  assert.ok(over.some((problem) => problem.includes("cap")));
  const missing = validateDesignEntry(entry, { snippetText: () => "export const remix = 1;\n", licenseText: () => "" });
  assert.ok(missing.some((problem) => problem.includes("license text")));
  const copyleft = validateDesignEntry({ ...entry, license: "GPL-3.0" }, { snippetText: () => "export const remix = 1;\n", licenseText: () => "GPL-3.0" });
  assert.ok(copyleft.some((problem) => problem.includes("copyleft") || problem.includes("code license")));
});

test("an entry missing source URL, license, credit, or techniques fails", () => {
  const entry = sampleEntry();
  assert.ok(validateDesignEntry({ ...entry, sourceUrl: "", ingestMode: "link-only", license: "link-only", snippets: [], licenseTextPath: undefined }).some((problem) => problem.includes("source URL")));
  assert.ok(validateDesignEntry({ ...entry, creditLine: "", ingestMode: "link-only", license: "link-only", snippets: [], licenseTextPath: undefined }).some((problem) => problem.includes("credit")));
  assert.ok(validateDesignEntry({ ...entry, techniques: [], ingestMode: "link-only", license: "link-only", snippets: [], licenseTextPath: undefined }).some((problem) => problem.includes("techniques")));
  assert.ok(validateDesignEntry({ ...entry, license: "", ingestMode: "link-only", snippets: [], licenseTextPath: undefined }).some((problem) => problem.includes("license")));
});

function sampleEntry(): DesignEntry {
  return {
    id: "sample",
    kind: "technique",
    title: "Sample",
    url: "https://example.com/sample",
    source: "direct",
    sourcePage: "https://example.com/sample",
    styleWorld: "editorial",
    family: "editorial",
    moods: ["calm", "editorial"],
    sectionTypes: ["story"],
    techniques: ["lenis-smooth-scroll"],
    libraries: ["lenis"],
    promptLanguage: "A calm column eases in. The type stays put.",
    notes: "Our note. The motion is vocabulary.",
    perfCost: "low",
    reducedMotion: "Reduced motion keeps the column still.",
    sourceUrl: "https://example.com/sample",
    license: "MIT",
    creditLine: "Example, MIT, https://example.com/sample",
    licenseTextPath: "snippets/sample/LICENSE",
    ingestMode: "code",
    snippets: ["snippets/sample/snippet.ts"],
    shots: [],
    checked: "2026-10-19",
    verified: "human",
    retired: false,
  };
}

function clock(): Clock & { waits: number[] } {
  let now = Date.parse("2026-10-19T00:00:00.000Z");
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

function draft(extra: Partial<GrokEntryDraft> = {}): GrokEntryDraft {
  return {
    title: "Widget",
    techniques: ["typographic-scale"],
    promptLanguage: "Set a quiet scale and let the headline lead. Keep the measure short.",
    notes: "Our note on the allowed material. The page is not copied.",
    perfCost: "low",
    reducedMotion: "Reduced motion keeps the type still.",
    moods: ["calm", "editorial"],
    sectionTypes: ["story"],
    libraries: ["vanilla"],
    styleWorld: "editorial",
    family: "editorial",
    kind: "site",
    source: "direct",
    snippet: "export const remix = 1;\n",
    ...extra,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function tempRoot(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-library-"));
}

function deps(dir: string, fetchImpl: typeof fetch, grokCalls: string[]): IngestDeps {
  return {
    fetchImpl,
    clock: clock(),
    grok: async (input) => {
      grokCalls.push(`${input.mode} ${input.url}`);
      const technique = input.url.includes("gpl")
        ? "split-text-reveal"
        : input.url.includes("none")
          ? "grain-and-grade"
          : input.url.includes("custom")
            ? "scroll-video"
            : input.url.includes("studio")
              ? "view-transitions"
              : "typographic-scale";
      return draft({ title: input.url, techniques: [technique], styleWorld: input.url.includes("studio") ? "playful" : "editorial", family: input.url.includes("studio") ? "playful" : "editorial" });
    },
    root: dir,
    nowIso: "2026-10-19",
    quotaFloor: 8,
    quotaShare: 0.34,
  };
}

test("policy: MIT is code, GPL and missing licenses are link-only, feeds store no code, robots and refused hosts", () => {
  assert.equal(ingestPolicy("github", "https://github.com/example/widget", "MIT", { allowed: true, via: "auto" }).mode, "code");
  assert.equal(ingestPolicy("github", "https://github.com/example/widget", "GPL-3.0", { allowed: true, via: "auto" }).mode, "link-only");
  assert.equal(ingestPolicy("github", "https://github.com/example/widget", null, { allowed: true, via: "auto" }).mode, "link-only");
  assert.equal(ingestPolicy("github", "https://github.com/example/widget", "Custom", { allowed: true, via: "auto" }).mode, "link-only");
  assert.equal(ingestPolicy("land-book", "https://land-book.com/rss.xml", null, { allowed: true, via: "auto" }).mode, "feed");
  assert.equal(ingestPolicy("awwwards", "https://www.awwwards.com/websites/", null, { allowed: true, via: "auto" }).mode, "refuse");
  assert.equal(ingestPolicy("mobbin", "https://mobbin.com/browse", null, { allowed: true, via: "auto" }).mode, "refuse");
  assert.equal(ingestPolicy("refero", "https://refero.design/pages", null, { allowed: true, via: "auto" }).mode, "refuse");
  assert.equal(ingestPolicy("awwwards", "https://www.awwwards.com/websites/", null, { allowed: true, via: "add" }).mode, "link-only");
  assert.equal(ingestPolicy("direct", "https://example.com/page", null, { allowed: false, via: "auto" }).mode, "refuse");
});

test("ingest fixtures honour license, feeds, robots, quota, resume, and the host delay", async () => {
  const dir = tempRoot();
  try {
    const seen: string[] = [];
    const grokCalls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      if (url.includes("/repos/example/mit/license")) return jsonResponse({ license: { spdx_id: "MIT" } });
      if (url.includes("/repos/example/gpl/license")) return jsonResponse({ license: { spdx_id: "GPL-3.0" } });
      if (url.includes("/repos/example/none/license")) return jsonResponse({ license: { spdx_id: "NOASSERTION" } });
      if (url.includes("/repos/example/custom/license")) return jsonResponse({ license: { spdx_id: "NOASSERTION" } });
      if (url.endsWith("/rss.xml")) {
        return new Response("<rss><channel><item><title>Studio</title><link>https://example.com/studio</link><dc:creator>Ada</dc:creator></item></channel></rss>", { status: 200 });
      }
      return new Response("ok", { status: 200 });
    };
    const timed = clock();
    const result = await runIngest(
      [
        { url: "https://github.com/example/mit", source: "github", via: "auto" },
        { url: "https://github.com/example/gpl", source: "github", via: "auto" },
        { url: "https://github.com/example/none", source: "github", via: "auto" },
        { url: "https://github.com/example/custom", source: "github", via: "auto", license: "Custom" },
        { url: "https://land-book.com/rss.xml", source: "land-book", via: "auto" },
      ],
      { version: 1, items: {} },
      { ...deps(dir, fetchImpl, grokCalls), clock: timed },
    );
    const mit = JSON.parse(readFileSync(path.join(dir, "entries", "github-com-example-mit.json"), "utf8")) as DesignEntry;
    assert.equal(mit.ingestMode, "code");
    assert.equal(mit.license, "MIT");
    assert.ok(mit.creditLine.length > 0);
    assert.ok(mit.techniques.length > 0);
    assert.match(readFileSync(path.join(dir, mit.licenseTextPath ?? ""), "utf8"), /MIT/);
    const gpl = JSON.parse(readFileSync(path.join(dir, "entries", "github-com-example-gpl.json"), "utf8")) as DesignEntry;
    assert.equal(gpl.ingestMode, "link-only");
    assert.equal(gpl.snippets.length, 0);
    assert.equal(exists(path.join(dir, "snippets", gpl.id)), false);
    const none = JSON.parse(readFileSync(path.join(dir, "entries", "github-com-example-none.json"), "utf8")) as DesignEntry;
    assert.equal(none.ingestMode, "link-only");
    assert.equal(none.snippets.length, 0);
    assert.equal(result.items["https://land-book.com/rss.xml"]?.mode, "feed");
    const studio = Object.values(result.items).find((item) => item.url === "https://example.com/studio");
    assert.ok(studio);
    assert.equal(studio?.mode, "link-only");
    assert.ok(timed.waits.some((wait) => wait >= 2000));

    const blocked: string[] = [];
    await runIngest(
      [{ url: "https://blocked.example/secret", source: "direct", via: "auto", license: "MIT" }],
      { version: 1, items: {} },
      deps(dir, async (input) => {
        const url = String(input);
        blocked.push(url);
        if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /secret\n", { status: 200 });
        return new Response("nope", { status: 200 });
      }, []),
    );
    assert.equal(blocked.some((url) => url.endsWith("/secret")), false);

    const added = await runIngest(
      [{ url: "https://www.awwwards.com/websites/", source: "awwwards", via: "add" }],
      { version: 1, items: {} },
      deps(mkdtempSync(path.join(os.tmpdir(), "hh-add-")), async () => new Response("User-agent: *\nDisallow:\n", { status: 200 }), []),
    );
    assert.equal(Object.values(added.items)[0]?.mode, "link-only");
    const refused = await runIngest(
      [
        { url: "https://www.awwwards.com/websites/", source: "awwwards", via: "auto" },
        { url: "https://mobbin.com/browse", source: "direct", via: "auto" },
        { url: "https://refero.design/pages", source: "direct", via: "auto" },
      ],
      { version: 1, items: {} },
      deps(mkdtempSync(path.join(os.tmpdir(), "hh-refuse-")), async () => new Response("User-agent: *\nDisallow:\n", { status: 200 }), []),
    );
    for (const item of Object.values(refused.items)) assert.equal(item.status, "refused");

    mkdirSync(path.join(dir, "entries"), { recursive: true });
    for (let index = 0; index < 8; index += 1) {
      const filler = sampleEntry();
      filler.id = `fill-${index}`;
      filler.sourceUrl = `https://example.com/fill-${index}`;
      filler.url = filler.sourceUrl;
      filler.ingestMode = "link-only";
      filler.license = "link-only";
      filler.snippets = [];
      delete filler.licenseTextPath;
      writeFileSync(path.join(dir, "entries", `${filler.id}.json`), JSON.stringify(filler));
    }
    const quotaDeps = deps(dir, async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow:\n", { status: 200 });
      return new Response("ok", { status: 200 });
    }, []);
    quotaDeps.grok = async () => draft({ title: "Quota", techniques: ["ambient-sound-toggle"], styleWorld: "editorial", family: "editorial" });
    const quota = await runIngest(
      [{ url: "https://example.com/another-editorial", source: "candidate", via: "auto" }],
      { version: 1, items: {} },
      quotaDeps,
    );
    assert.equal(quota.items["https://example.com/another-editorial"]?.reason, "Style-world quota.");

    const skipCalls: string[] = [];
    const state: IngestState = { version: 1, items: { "https://example.com/done": { url: "https://example.com/done", status: "done", reason: "done", failures: 0 } } };
    await runIngest([{ url: "https://example.com/done", source: "candidate", via: "auto" }], state, deps(dir, async () => new Response("no", { status: 500 }), skipCalls));
    assert.equal(skipCalls.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a URL is retired after two recheck failures and not after one", async () => {
  const dir = tempRoot();
  try {
    mkdirSync(path.join(dir, "entries"), { recursive: true });
    const entry = sampleEntry();
    entry.ingestMode = "link-only";
    entry.license = "link-only";
    entry.snippets = [];
    delete entry.licenseTextPath;
    entry.checked = "2026-01-01";
    writeFileSync(path.join(dir, "entries", `${entry.id}.json`), JSON.stringify(entry));
    const failing: IngestDeps = {
      ...deps(dir, async () => new Response("no", { status: 500 }), []),
      recheck: true,
      clock: { now: () => Date.parse("2026-10-19T00:00:00.000Z"), wait: async () => undefined },
    };
    const once = await recheckLibrary(failing, { version: 1, items: {} });
    assert.equal(once.entries[0]?.retired, false);
    const twice = await recheckLibrary(failing, once.state);
    assert.equal(twice.entries[0]?.retired, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function exists(file: string): boolean {
  try {
    readFileSync(file);
    return true;
  } catch {
    return false;
  }
}

void 0 as IngestCandidate;
