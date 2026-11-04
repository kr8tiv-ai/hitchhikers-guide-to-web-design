/**
 * 245i: reference screenshots, one approved render per primary page,
 * and no billed API provider on the render path.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RenderApprovalError,
  approveRender,
  buildRenderPrompt,
  clearReferenceCaptureRunner,
  collectReferenceShots,
  countDesignReferenceImages,
  draftKeyPageRenders,
  isRenderApproved,
  pagesWaitingForRender,
  prepareSiteBuild,
  refreshReferenceReadme,
  saveRenderUpload,
  scheduleReferenceCapture,
  setReferenceCaptureRunner,
  syncRenderApprovals,
  type CapturedReferenceShot,
} from "../src/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = "The site helps a visitor book a visit.";
const WHEN = "2026-11-04T12:00:00.000Z";
const HEADLINE = "Book the north cabin before Friday.";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-245i-"));
}

function png(label: string): Uint8Array {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(label)]);
}

function writeBrief(dir: string, references: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, ".hitchhiker", "SITE-BRIEF.md"),
    `# Site Brief\n\n## References\n\n${references}\n`,
    "utf8",
  );
}

function writeSitemap(dir: string, body: string): void {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), body, "utf8");
}

const THREE_PAGES = `# Sitemap

## Primary

- Home at /
  - still water
- Visit at /visit
  - arrival
- About at /about
  - quiet shore

## Footer

- Privacy at /privacy
  - legal
`;

function approveFile(dir: string, route: string, label: string): void {
  saveRenderUpload(dir, route, png(label));
  approveRender(dir, route, WHEN);
}

test("named references with urls are captured and a name without a url asks the owner", async () => {
  const dir = tempDir();
  try {
    writeBrief(
      dir,
      [
        "Patagonia: love. Big quiet photography and plain type.",
        "Aesop: love. Restraint and empty space.",
        "Northwind: love. A cold grid.",
      ].join("\n"),
    );
    const result = await collectReferenceShots(dir, {
      now: () => new Date(WHEN),
      capture: async (url) => {
        const shots: CapturedReferenceShot[] = [
          { kind: "fold", pageUrl: url, bytes: png(`${url}-fold`) },
          { kind: "full", pageUrl: url, bytes: png(`${url}-full`) },
        ];
        return shots;
      },
    });
    const refs = path.join(dir, "reference", "refs");
    const files = readdirSync(refs).filter((name) => name.endsWith(".png")).sort();
    assert.deepEqual(files, ["aesop-1.png", "aesop-2.png", "patagonia-1.png", "patagonia-2.png"]);
    assert.equal(countDesignReferenceImages(dir), 4);
    const shots = readFileSync(path.join(refs, "README.md"), "utf8");
    assert.match(shots, /https:\/\/www\.patagonia\.com\//);
    assert.match(shots, /https:\/\/www\.aesop\.com\//);
    assert.match(shots, /love\. Big quiet photography and plain type\./);
    assert.match(shots, /love\. Restraint and empty space\./);
    assert.match(shots, new RegExp(WHEN));
    const readme = readFileSync(path.join(dir, "reference", "README.md"), "utf8");
    assert.match(readme, /Northwind needs a URL or screenshot from the owner\./);
    assert.equal(readme.includes("northwind.com"), false);
    assert.equal(result.needs.some((need) => need.label === "Northwind"), true);
    assert.equal(existsSync(path.join(dir, "DESIGN.md")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a hung capture returns on a short timeout", async () => {
  const dir = tempDir();
  try {
    writeBrief(dir, "Patagonia: love. Big quiet photography and plain type.");
    const started = Date.now();
    const result = await collectReferenceShots(dir, {
      timeoutMs: 40,
      now: () => new Date(WHEN),
      capture: (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    });
    assert.ok(Date.now() - started < 500);
    assert.match(result.captured[0]?.error ?? "", /timed out/i);
    const shots = readFileSync(path.join(dir, "reference", "refs", "README.md"), "utf8");
    assert.match(shots, /timed out/i);
  } finally {
    removeTempDir(dir);
  }
});

test("scheduling capture returns before the runner starts", async () => {
  const dir = tempDir();
  let started = false;
  try {
    setReferenceCaptureRunner(dir, async () => {
      started = true;
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    scheduleReferenceCapture(dir);
    assert.equal(started, false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started, true);
  } finally {
    clearReferenceCaptureRunner(dir);
    removeTempDir(dir);
  }
});

test("draft calls resolveDeskProvider with default settings and never the api provider", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, `# Sitemap\n\n## Primary\n\n- Home at /\n  - still water\n`);
    writeFileSync(path.join(dir, "DESIGN.md"), designMarkdown(), "utf8");
    let spawns = 0;
    let clientCalls = 0;
    let fetches = 0;
    const deps = {
      spawn: async () => {
        spawns += 1;
        return { status: 1, stdout: "", stderr: "", timedOut: false, errorCode: null };
      },
      env: { ...process.env, XAI_API_KEY: "test-key" },
      client: {
        generateImage: async () => {
          clientCalls += 1;
          return [];
        },
      },
      fetchImpl: (async () => {
        fetches += 1;
        return new Response("");
      }) as typeof fetch,
    };
    await draftKeyPageRenders(dir, deps);
    assert.equal(spawns, 0);
    writeFileSync(
      path.join(dir, ".hitchhiker", "design-lock.json"),
      `${JSON.stringify({ sha256: createHash("sha256").update(readFileSync(path.join(dir, "DESIGN.md"))).digest("hex"), directionId: "quiet", at: WHEN })}\n`,
      "utf8",
    );
    await draftKeyPageRenders(dir, deps);
    assert.equal(spawns, 1);
    assert.equal(clientCalls, 0);
    assert.equal(fetches, 0);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "media.json")), false);
    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "spec", "page-renders.ts"),
      "utf8",
    );
    assert.match(source, /resolveDeskProvider\(projectDir,/);
    assert.equal(source.includes("@hitchhiker/crawler"), false);
    const note = readFileSync(path.join(dir, "reference", "renders", "README.md"), "utf8");
    assert.match(note, /Grok CLI media generation failed/);
  } finally {
    removeTempDir(dir);
  }
});

test("prepareSiteBuild waits until every primary page has an approved render", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_PAGES);
    approveFile(dir, "/", "home");
    approveFile(dir, "/visit", "visit");
    await assert.rejects(() => prepareSiteBuild(dir, BRIEF), (error: unknown) => {
      assert.ok(error instanceof RenderApprovalError);
      assert.match(error.message, /About \(\/about\)/);
      assert.equal(error.message.includes("Privacy"), false);
      assert.equal(error.message.includes("/privacy"), false);
      return true;
    });
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "prompts")), false);
    approveFile(dir, "/about", "about");
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "prompts", `${ids[0]}.md`)), true);
  } finally {
    removeTempDir(dir);
  }
});

test("an owner mock counts once approved and a later edit withdraws approval", async () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_PAGES);
    const rel = saveRenderUpload(dir, "/about", png("about"));
    saveRenderUpload(dir, "/", png("home"));
    saveRenderUpload(dir, "/visit", png("visit"));
    assert.equal(rel, "reference/renders/about.png");
    assert.equal(isRenderApproved(dir, "/about"), false);
    approveRender(dir, "/", WHEN);
    approveRender(dir, "/visit", WHEN);
    approveRender(dir, "/about", WHEN);
    assert.equal(isRenderApproved(dir, "/about"), true);
    writeFileSync(path.join(dir, "reference", "renders", "about.png"), png("about-edited"));
    assert.equal(isRenderApproved(dir, "/about"), false);
    const kept = syncRenderApprovals(dir);
    assert.equal(kept.some((row) => row.route === "/about"), false);
    const waiting = pagesWaitingForRender(dir).map((page) => page.route);
    assert.deepEqual(waiting, ["/about"]);
    await assert.rejects(() => prepareSiteBuild(dir, BRIEF), /About \(\/about\)/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "prompts")), false);
    approveRender(dir, "/about", WHEN);
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0);
  } finally {
    removeTempDir(dir);
  }
});

test("the render prompt uses the design guide and owner photos and no page copy", () => {
  const dir = tempDir();
  try {
    writeSitemap(dir, THREE_PAGES);
    writeFileSync(path.join(dir, "DESIGN.md"), designMarkdown(), "utf8");
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), `# Site Brief\n\n## Goal\n\n${HEADLINE}\n`, "utf8");
    writeFileSync(
      path.join(dir, ".hitchhiker", "ASSETS.md"),
      [
        "| slot | source | file | cost | approved | license | status | grade | job |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        "| north-cabin | upload | src/assets/photos/north-cabin.jpg | 0 | yes | owner | done |  |  |",
        "| logo | upload | src/assets/brand/logo.svg | 0 | yes | owner | done |  |  |",
        "",
      ].join("\n"),
      "utf8",
    );
    mkdirSync(path.join(dir, "reference", "refs"), { recursive: true });
    writeFileSync(path.join(dir, "reference", "refs", "patagonia-1.png"), png("patagonia"));
    const prompt = buildRenderPrompt(dir, "/");
    assert.match(prompt, /Fraunces and Source Serif 4/);
    assert.match(prompt, /#f3efe4/);
    assert.match(prompt, /#1c2421/);
    assert.match(prompt, /A still lake before anyone speaks\./);
    assert.match(prompt, /Owner photographs first, graded cool and quiet\./);
    assert.match(prompt, /One slow reveal of the photograph\./);
    assert.match(prompt, /src\/assets\/photos\/north-cabin\.jpg/);
    assert.match(prompt, /compose the page with these owner photographs/);
    assert.match(prompt, /Text-free page render\. No letters, no words, no numbers, and no baked-in copy\./);
    assert.match(prompt, /reference\/refs\/patagonia-1\.png/);
    assert.match(prompt, /still water/);
    assert.equal(prompt.includes(HEADLINE), false);
    assert.equal(prompt.includes("src/assets/brand/logo.svg"), false);
    assert.equal(prompt.includes("Home"), false);
    refreshReferenceReadme(dir);
    const readme = readFileSync(path.join(dir, "reference", "README.md"), "utf8");
    assert.match(readme, /src\/assets\/photos\/north-cabin\.jpg/);
    assert.match(readme, /may not use the logo file as a photo/);
    assert.equal(readme.includes("src/assets/brand/logo.svg"), false);
  } finally {
    removeTempDir(dir);
  }
});

function designMarkdown(): string {
  return [
    "---",
    "colors:",
    "  paper: \"#f3efe4\"",
    "  ink: \"#1c2421\"",
    "  accent: \"#4a6a62\"",
    "typography:",
    "  display:",
    "    fontFamily: \"Fraunces\"",
    "  body:",
    "    fontFamily: \"Source Serif 4\"",
    "---",
    "",
    "# Design",
    "",
    "## Brand idea",
    "",
    "A still lake before anyone speaks.",
    "",
    "## Image direction",
    "",
    "Owner photographs first, graded cool and quiet.",
    "",
    "## Signature techniques",
    "",
    "One slow reveal of the photograph.",
    "Any appropriate library may carry a technique.",
    "",
  ].join("\n");
}
