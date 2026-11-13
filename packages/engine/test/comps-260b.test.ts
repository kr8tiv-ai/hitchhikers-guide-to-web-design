/**
 * 260b: comp sets, approvals, and the consistency chain.
 * Providers are fakes. No network and no real Grok call.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  COMPS_REL,
  ConfigError,
  RENDER_MODEL,
  RenderApprovalError,
  approveComp,
  compCandidateRel,
  compRenderRel,
  compsWaiting,
  defaultConfig,
  draftComps,
  isCompApproved,
  isRenderApproved,
  listComps,
  loadConfig,
  pagesWaitingForRender,
  parseConfig,
  prepareSiteBuild,
  requestCompChange,
  syncCompApprovals,
  writeDesignLock,
  type CompView,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const WHEN = "2026-11-11T12:00:00.000Z";
const BRIEF = "The site helps a visitor book a visit.";
const NO_TEXT =
  "No readable text. Use neutral bars where headings and copy will sit; real text is added in code.";
const TEXT_ONLY =
  "These sketches used words only. The reference pictures could not be sent as pictures.";

const HOME = `# Sitemap

## Primary

- Home at /
  - still water
  - the path
  - the shore
`;

const HOME_AND_VISIT = `# Sitemap

## Primary

- Home at /
  - still water
- Visit at /visit
  - arrival

## Footer

- Privacy at /privacy
  - legal
`;

interface DrawnCall {
  kind: "generate" | "edit";
  model: string;
  prompt: string;
  aspect: string;
  n: number;
  sources: string[];
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-260b-"));
}

function png(label: string): Uint8Array {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(label)]);
}

function projectPath(dir: string, rel: string): string {
  return path.join(dir, ...rel.split("/"));
}

function writeBytes(dir: string, rel: string, label: string): void {
  const abs = projectPath(dir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, png(label));
}

function writeSitemap(dir: string, body: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), body, "utf8");
}

function writeDesign(dir: string): void {
  writeFileSync(path.join(dir, "DESIGN.md"), "# Design\n\n## Brand idea\n\nA still lake before anyone speaks.\n", "utf8");
  writeDesignLock(dir, "quiet", WHEN);
}

function writeCompsConfig(dir: string, comps: Record<string, unknown>): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "config.json"),
    `${JSON.stringify({ design: { comps } })}\n`,
    "utf8",
  );
}

function writeAssets(dir: string, rows: readonly { slot: string; file: string }[]): void {
  const lines = [
    "| slot | source | file | cost | approved | license | status | grade | job |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.slot} | upload | ${row.file} | 0 | yes | owner | done |  |  |`),
    "",
  ];
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "ASSETS.md"), lines.join("\n"), "utf8");
}

function plantCandidate(dir: string, route: string, view: CompView): string {
  const rel = compCandidateRel(route, view, 1);
  writeBytes(dir, rel, `${route}-${view}`);
  return rel;
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function drawingProvider(calls: DrawnCall[]): {
  generateImage(req: { model: string; prompt: string; aspect: string; n: number }): Promise<{ b64: string }[]>;
  editImage(req: {
    model: string;
    prompt: string;
    sources: readonly string[];
    n: number;
    aspect?: string;
  }): Promise<{ images: { b64: string }[] }>;
} {
  let serial = 0;
  const image = (): { b64: string }[] => {
    serial += 1;
    return [{ b64: Buffer.from(png(`sketch-${serial}`)).toString("base64") }];
  };
  return {
    async generateImage(req) {
      calls.push({
        kind: "generate",
        model: req.model,
        prompt: req.prompt,
        aspect: req.aspect,
        n: req.n,
        sources: [],
      });
      return image();
    },
    async editImage(req) {
      calls.push({
        kind: "edit",
        model: req.model,
        prompt: req.prompt,
        aspect: req.aspect ?? "",
        n: req.n,
        sources: [...req.sources],
      });
      return { images: image() };
    },
  };
}

function forgetCandidates(dir: string, route: string, view: CompView, count: number): void {
  for (let index = 1; index <= count; index += 1) {
    const rel = compCandidateRel(route, view, index);
    const pngPath = projectPath(dir, rel);
    rmSync(pngPath, { force: true });
    rmSync(pngPath.replace(/\.png$/i, ".prompt.txt"), { force: true });
  }
}

test("three views and three candidates are drafted with the right aspects and prompts", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME);
    writeDesign(dir);
    const calls: DrawnCall[] = [];
    const expected: string[] = [];
    for (const view of ["desktop", "desktop-long", "mobile"] as const) {
      for (let index = 1; index <= 3; index += 1) expected.push(compCandidateRel("/", view, index));
    }
    const provider = {
      async generateImage(req: { model: string; prompt: string; aspect: string; n: number }) {
        if (calls.length > 0) {
          const previous = expected[calls.length - 1];
          assert.ok(previous);
          assert.equal(existsSync(projectPath(dir, previous)), true);
        }
        calls.push({
          kind: "generate",
          model: req.model,
          prompt: req.prompt,
          aspect: req.aspect,
          n: req.n,
          sources: [],
        });
        return [{ b64: Buffer.from(png(`fold-${calls.length}`)).toString("base64") }];
      },
    };
    const written = await draftComps(dir, { provider });
    assert.deepEqual(written, expected);
    assert.deepEqual(
      calls.map((call) => call.aspect),
      ["16:9", "16:9", "16:9", "1:2", "1:2", "1:2", "9:19.5", "9:19.5", "9:19.5"],
    );
    const phrase: Record<string, string> = {
      "16:9": "desktop browser first screen 1440 wide",
      "1:2": "full scrolling desktop page",
      "9:19.5": "phone first screen 390 wide",
    };
    for (const call of calls) {
      assert.equal(call.kind, "generate");
      assert.equal(call.model, RENDER_MODEL);
      assert.equal(call.n, 1);
      assert.equal(call.prompt.includes(NO_TEXT), true);
      const first = call.prompt.indexOf("1. still water");
      const second = call.prompt.indexOf("2. the path");
      const third = call.prompt.indexOf("3. the shore");
      assert.ok(first >= 0 && first < second && second < third);
      assert.equal(call.prompt.includes(`View: ${phrase[call.aspect]}.`), true);
    }
    for (let index = 0; index < expected.length; index += 1) {
      const rel = expected[index];
      assert.ok(rel);
      const promptFile = projectPath(dir, rel.replace(/\.png$/i, ".prompt.txt"));
      assert.equal(readFileSync(promptFile, "utf8"), calls[index]?.prompt);
    }
    const home = listComps(dir).pages.find((page) => page.route === "/");
    assert.ok(home);
    assert.deepEqual(home.views.desktop.viewport, [1440, 810]);
    assert.equal(home.views.desktop.aspect, "16:9");
    assert.equal(home.views.desktop.candidates.length, 3);
    assert.deepEqual(home.views.mobile.viewport, [390, 845]);
    assert.equal(home.views.mobile.aspect, "9:19.5");
    assert.deepEqual(home.views["desktop-long"]?.viewport, [1440, 2880]);
    assert.equal(home.views["desktop-long"]?.aspect, "1:2");
    assert.deepEqual(
      home.sections.map((section) => section.id),
      ["still-water", "the-path", "the-shore"],
    );
    await draftComps(dir, { provider });
    assert.equal(calls.length, 9);
  } finally {
    removeTempDir(dir);
  }
});

test("after the home desktop approval the next request starts with that comp", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME_AND_VISIT);
    writeDesign(dir);
    const photos = [
      "src/assets/photos/north.jpg",
      "src/assets/photos/shore.jpg",
      "src/assets/photos/path.jpg",
      "src/assets/photos/cabin.jpg",
    ];
    writeAssets(dir, [
      ...photos.map((file) => ({ slot: path.basename(file, ".jpg"), file })),
      { slot: "logo", file: "src/assets/brand/logo.png" },
    ]);
    for (const file of photos) writeBytes(dir, file, file);
    writeBytes(dir, "src/assets/brand/logo.png", "logo");
    for (const name of ["aesop.png", "patagonia.png", "logo.png", "brand-logo.webp"]) {
      writeBytes(dir, `reference/refs/${name}`, name);
    }
    const calls: DrawnCall[] = [];
    const provider = drawingProvider(calls);
    await draftComps(dir, { provider });
    assert.equal(calls.length, 18);
    assert.deepEqual(calls[0]?.sources, [...photos, "reference/refs/aesop.png"]);
    for (const call of calls) {
      assert.equal(call.kind, "edit");
      assert.ok(call.sources.length <= 5);
      assert.equal(call.sources.some((item) => /logo/i.test(item)), false);
      assert.equal(call.sources.some((item) => item.startsWith("reference/renders/")), false);
    }
    approveComp(dir, "/", "desktop", compCandidateRel("/", "desktop", 1));
    approveComp(dir, "/visit", "desktop", compCandidateRel("/visit", "desktop", 1));
    forgetCandidates(dir, "/", "mobile", 3);
    forgetCandidates(dir, "/visit", "mobile", 3);
    const before = calls.length;
    await draftComps(dir, { provider });
    const next = calls.slice(before);
    assert.equal(next.length, 6);
    const homeMobile = next.filter((call) => call.prompt.includes("1. still water"));
    const visitMobile = next.filter((call) => call.prompt.includes("1. arrival"));
    assert.equal(homeMobile.length, 3);
    assert.equal(visitMobile.length, 3);
    for (const call of homeMobile) {
      assert.equal(call.aspect, "9:19.5");
      assert.deepEqual(call.sources, [compRenderRel("/", "desktop"), ...photos]);
    }
    for (const call of visitMobile) {
      assert.equal(call.aspect, "9:19.5");
      assert.equal(call.sources[0], compRenderRel("/", "desktop"));
      assert.equal(call.sources[1], compRenderRel("/visit", "desktop"));
      assert.deepEqual(call.sources, [
        compRenderRel("/", "desktop"),
        compRenderRel("/visit", "desktop"),
        photos[0],
        photos[1],
        photos[2],
      ]);
      assert.equal(call.sources.includes(photos[3] ?? ""), false);
      assert.equal(call.sources.some((item) => item.includes("aesop") || item.includes("patagonia")), false);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("approve copies to the fixed path and a later edit drops the approval", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME);
    const desktopFrom = plantCandidate(dir, "/", "desktop");
    const desktop = approveComp(dir, "/", "desktop", desktopFrom);
    assert.equal(desktop.file, "reference/renders/home.png");
    assert.equal(desktop.from, desktopFrom);
    const desktopAbs = projectPath(dir, desktop.file);
    assert.equal(readFileSync(desktopAbs).equals(readFileSync(projectPath(dir, desktopFrom))), true);
    assert.equal(desktop.sha256, sha256(desktopAbs));
    assert.equal(isCompApproved(dir, "/", "desktop"), true);
    assert.equal(isRenderApproved(dir, "/"), true);

    const mobileFrom = plantCandidate(dir, "/", "mobile");
    const mobile = approveComp(dir, "/", "mobile", mobileFrom);
    assert.equal(mobile.file, "reference/renders/home.mobile.png");
    assert.equal(mobile.from, mobileFrom);
    assert.equal(mobile.sha256, sha256(projectPath(dir, mobile.file)));

    const longFrom = plantCandidate(dir, "/", "desktop-long");
    const long = approveComp(dir, "/", "desktop-long", longFrom);
    assert.equal(long.file, "reference/renders/home.long.png");
    assert.equal(long.from, longFrom);
    assert.equal(long.sha256, sha256(projectPath(dir, long.file)));

    writeBytes(dir, mobile.file, "mobile-edited");
    assert.equal(isCompApproved(dir, "/", "mobile"), false);
    const afterMobile = syncCompApprovals(dir);
    assert.equal(afterMobile.some((row) => row.view === "mobile"), false);
    assert.equal(isCompApproved(dir, "/", "desktop"), true);
    assert.deepEqual(pagesWaitingForRender(dir).map((page) => page.route), []);

    writeBytes(dir, desktop.file, "desktop-edited");
    assert.equal(isCompApproved(dir, "/", "desktop"), false);
    assert.equal(isRenderApproved(dir, "/"), false);
    assert.deepEqual(pagesWaitingForRender(dir).map((page) => page.route), ["/"]);
    const afterDesktop = syncCompApprovals(dir);
    assert.equal(afterDesktop.some((row) => row.view === "desktop"), false);
    assert.equal(isCompApproved(dir, "/", "desktop-long"), true);
  } finally {
    removeTempDir(dir);
  }
});

test("a legacy renders.json approval counts as the desktop approval", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME_AND_VISIT);
    writeBytes(dir, "reference/renders/home.png", "legacy-home");
    const file = "reference/renders/home.png";
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "renders.json"),
      `${JSON.stringify([{ route: "/", file, sha256: sha256(projectPath(dir, file)), approvedAt: WHEN }])}\n`,
      "utf8",
    );
    assert.equal(existsSync(projectPath(dir, COMPS_REL)), false);
    assert.equal(isCompApproved(dir, "/", "desktop"), true);
    assert.equal(isCompApproved(dir, "/", "mobile"), false);
    assert.equal(isCompApproved(dir, "/visit", "desktop"), false);
    assert.deepEqual(
      pagesWaitingForRender(dir).map((page) => page.route),
      ["/visit"],
    );
    const migrated = listComps(dir).pages.find((page) => page.route === "/");
    assert.ok(migrated);
    assert.equal(migrated.views.desktop.approved?.file, file);
    assert.equal(migrated.views.desktop.approved?.sha256, sha256(projectPath(dir, file)));
    assert.equal(migrated.views.desktop.approved?.from, file);
    assert.equal(migrated.views.mobile.approved, undefined);

    writeBytes(dir, file, "legacy-edited");
    assert.equal(isCompApproved(dir, "/", "desktop"), false);
    assert.deepEqual(
      pagesWaitingForRender(dir).map((page) => page.route),
      ["/", "/visit"],
    );
    const kept = syncCompApprovals(dir);
    assert.equal(kept.some((row) => row.route === "/"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("site prompt generation refuses while a mobile comp is unapproved", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME);
    approveComp(dir, "/", "desktop", plantCandidate(dir, "/", "desktop"));
    approveComp(dir, "/", "desktop-long", plantCandidate(dir, "/", "desktop-long"));
    await assert.rejects(() => prepareSiteBuild(dir, BRIEF), (error: unknown) => {
      assert.ok(error instanceof RenderApprovalError);
      assert.equal(error.message, "These pages still need an approved sketch: Home (/), phone.");
      return true;
    });
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "prompts")), false);
    approveComp(dir, "/", "mobile", plantCandidate(dir, "/", "mobile"));
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0);
  } finally {
    removeTempDir(dir);
  }
});

test("a change request stores the words and the next draft includes them", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME);
    writeDesign(dir);
    const calls: DrawnCall[] = [];
    const provider = drawingProvider(calls);
    await draftComps(dir, { provider });
    const words = "Lower the horizon and widen the shore.";
    approveComp(dir, "/", "mobile", compCandidateRel("/", "mobile", 2));
    requestCompChange(dir, "/", "mobile", words);
    const stored = listComps(dir).pages.find((page) => page.route === "/");
    assert.ok(stored);
    assert.deepEqual(stored.views.mobile.notes, [words]);
    assert.deepEqual(stored.notes, [words]);
    const before = calls.length;
    await draftComps(dir, { provider });
    const next = calls.slice(before);
    assert.equal(next.length, 3);
    for (const call of next) {
      assert.equal(call.kind, "edit");
      assert.equal(call.aspect, "9:19.5");
      assert.equal(call.prompt.includes(words), true);
      assert.equal(call.prompt.includes("Changes the owner asked for:"), true);
      assert.equal(call.prompt.includes(NO_TEXT), true);
      assert.deepEqual(call.sources, [compRenderRel("/", "mobile")]);
    }
    const desktop = calls.filter((call) => call.aspect === "16:9");
    assert.equal(desktop.length, 3);
    assert.equal(desktop.some((call) => call.prompt.includes(words)), false);
  } finally {
    removeTempDir(dir);
  }
});

test("design.comps.long false skips the long view", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME);
    writeDesign(dir);
    writeCompsConfig(dir, { long: false });
    const loaded = loadConfig(dir);
    assert.equal(loaded.design.comps.long, false);
    assert.equal(loaded.design.comps.candidates, 3);
    assert.equal(loaded.design.comps.model, RENDER_MODEL);
    const calls: DrawnCall[] = [];
    await draftComps(dir, { provider: drawingProvider(calls) });
    assert.deepEqual(
      calls.map((call) => call.aspect),
      ["16:9", "16:9", "16:9", "9:19.5", "9:19.5", "9:19.5"],
    );
    const names = readdirSync(path.join(dir, "reference", "comps", "home"));
    assert.equal(names.some((name) => name.includes("desktop-long") || name.includes(".long.")), false);
    assert.deepEqual(
      compsWaiting(dir).map((item) => item.view),
      ["desktop", "mobile"],
    );
    approveComp(dir, "/", "desktop", compCandidateRel("/", "desktop", 1));
    approveComp(dir, "/", "mobile", compCandidateRel("/", "mobile", 1));
    const file = projectPath(dir, COMPS_REL);
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      pages: Array<{ views: Record<string, unknown> }>;
    };
    const page = raw.pages[0];
    assert.ok(page);
    page.views["desktop-long"] = {
      aspect: "1:2",
      viewport: [1440, 2880],
      candidates: ["reference/comps/home/desktop-long-1.png"],
      notes: [],
    };
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
    assert.equal(listComps(dir).pages[0]?.views["desktop-long"]?.approved, undefined);
    assert.deepEqual(compsWaiting(dir), []);
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0);
  } finally {
    removeTempDir(dir);
  }
});

test("design.comps model and candidate count come from config", async () => {
  const defaults = defaultConfig().design.comps;
  assert.equal(defaults.candidates, 3);
  assert.equal(defaults.model, RENDER_MODEL);
  assert.equal(defaults.long, true);
  const partial = parseConfig({ design: { minReferenceImages: 4 } });
  assert.deepEqual(partial.design.comps, defaults);
  const custom = parseConfig({
    design: { comps: { candidates: 4, model: "grok-imagine-image-2.0", long: true } },
  });
  assert.equal(custom.design.comps.candidates, 4);
  assert.equal(custom.design.comps.model, "grok-imagine-image-2.0");
  assert.throws(() => parseConfig({ design: { comps: { candidates: 0 } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { comps: { candidates: 5 } } }), ConfigError);
  assert.throws(() => parseConfig({ design: { comps: { model: "grok-imagine-video" } } }), ConfigError);

  const dir = tempDir();
  try {
    writeSitemap(dir, HOME);
    writeDesign(dir);
    writeCompsConfig(dir, { candidates: 1, model: "grok-imagine-image-quality", long: false });
    const calls: DrawnCall[] = [];
    await draftComps(dir, { provider: drawingProvider(calls) });
    assert.deepEqual(
      calls.map((call) => ({ aspect: call.aspect, model: call.model })),
      [
        { aspect: "16:9", model: "grok-imagine-image-quality" },
        { aspect: "9:19.5", model: "grok-imagine-image-quality" },
      ],
    );
  } finally {
    removeTempDir(dir);
  }
});

test("a provider failure is recorded once and the pass stops", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME_AND_VISIT);
    writeDesign(dir);
    let calls = 0;
    await draftComps(dir, {
      provider: {
        async generateImage() {
          calls += 1;
          throw new Error("Grok CLI media generation failed.");
        },
      },
    });
    assert.equal(calls, 1);
    assert.equal(existsSync(projectPath(dir, compCandidateRel("/", "desktop", 1))), false);
    const renders = readFileSync(path.join(dir, "reference", "renders", "README.md"), "utf8");
    const sketches = readFileSync(path.join(dir, "reference", "comps", "README.md"), "utf8");
    assert.match(renders, /Grok CLI media generation failed/);
    assert.match(sketches, /Grok CLI media generation failed/);
    assert.equal(renders.includes("Visit"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a provider without editImage records a text-only note", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, HOME);
    writeDesign(dir);
    writeBytes(dir, "reference/refs/aesop.png", "aesop");
    writeBytes(dir, "reference/refs/logo.png", "logo");
    const calls: DrawnCall[] = [];
    await draftComps(dir, {
      provider: {
        async generateImage(req: { model: string; prompt: string; aspect: string; n: number }) {
          calls.push({
            kind: "generate",
            model: req.model,
            prompt: req.prompt,
            aspect: req.aspect,
            n: req.n,
            sources: [],
          });
          return [{ b64: Buffer.from(png(`words-${calls.length}`)).toString("base64") }];
        },
      },
    });
    assert.equal(calls.length, 9);
    for (const call of calls) {
      assert.match(call.prompt, /Reference pictures, described because they could not be sent as pictures:/);
      assert.equal(call.prompt.includes("reference/refs/aesop.png"), true);
      assert.equal(call.prompt.includes("reference/refs/logo.png"), false);
    }
    const readme = readFileSync(path.join(dir, "reference", "comps", "README.md"), "utf8");
    assert.equal(readme.split(TEXT_ONLY).length - 1, 1);
  } finally {
    removeTempDir(dir);
  }
});
