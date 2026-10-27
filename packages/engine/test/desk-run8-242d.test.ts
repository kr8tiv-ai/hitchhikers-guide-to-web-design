/**
 * Desk Run 8. The sitemap lists every brief page, a change edits it,
 * the style guide follows the kit and the pick, and the pre-build checks
 * read those artefacts. Sentence joins keep a space after terminal punctuation.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dealDirections, saveDirectionDeal, chooseDirection } from "../src/brand/directions.ts";
import { deterministicBrief, renderSiteBrief } from "../src/guide/brief-loop.ts";
import { spaceAfterTerminal } from "../src/guide/sentence-space.ts";
import { BRIEF_KEYS, type SiteBrief } from "../src/guide/schemas.ts";
import { advanceDesignStages, designReadyForBuild } from "../src/spec/design-stages.ts";
import { renderDesignMd } from "../src/spec/design-outputs.ts";
import { runPrebuildChecks } from "../src/spec/prebuild-checks.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLES = [
  "Home",
  "Farms",
  "Farm detail",
  "Live on the Land",
  "How Buying Works",
  "Eco-Building and Food",
  "About",
  "Contact",
  "Blog",
  "Privacy",
  "Terms",
];
const DP22 =
  "Send an inquiry about one farm they can see; the form is prefilled with that farm ID.Only ask for more details and offer a visit; the purchase itself happens offline later with the buyer's own lawyer.";
const LIMITS = [
  {
    id: "DP-8.4",
    value:
      "Yes, privacy and terms pages. Never give legal advice.Disclaimer: Paradise Found does not give legal advice. Never promise title, price, residency or returns, never call a farm an investment. Show asking prices labelled Asking price, set by the seller. Work with a licensed Costa Rican lawyer on every purchase.",
  },
  { id: "DP-9.1", value: "In 4 weeks: by November 10, 2026." },
  {
    id: "DP-9.5",
    value:
      "Yes, that is right. Also: the caretaker program and a Spanish-first caretaker sign-up matter (Esteban, 61, Android). Office hours Monday to Friday 8:00-17:00 Costa Rica time. Never say investment.",
  },
];

interface AnswerFile {
  answers: Array<{ id: string; value: string; status?: string }>;
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-run8-242d-"));
}

function run8Facts(): AnswerFile {
  return JSON.parse(readFileSync(path.join(here, "fixtures", "project4-interview.json"), "utf8")) as AnswerFile;
}

function run8Brief(): { markdown: string; answers: AnswerFile["answers"] } {
  const answers = run8Facts().answers;
  const markdown = renderSiteBrief(deterministicBrief({ answers, uploads: [], crawlNotes: [] }, "en"));
  return { markdown, answers };
}

function writeInterview(dir: string, answers: AnswerFile["answers"]): void {
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  writeFileSync(path.join(hitch, "interview.json"), `${JSON.stringify({ version: 1, answers, cursor: 0, pushedIds: [] })}\n`);
}

function pageTitles(markdown: string): string[] {
  const titles: string[] = [];
  for (const line of markdown.split(/\n/)) {
    const match = /^- (.+?) at \S+/.exec(line.trim());
    if (match?.[1] !== undefined && !titles.includes(match[1])) titles.push(match[1]);
  }
  return titles;
}

function gluedCapitals(text: string): string[] {
  let masked = text.replace(/https?:\/\/\S+/gi, " ").replace(/\bwww\.\S+/gi, " ");
  masked = masked.replace(/\b\d+\.\d+\b/g, " ");
  masked = masked.replace(/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc|e\.g|i\.e|U\.S|U\.K)\./gi, " ");
  masked = masked.replace(/(^|[\s(])[A-Za-z]\./g, "$1 ");
  const hits: string[] = [];
  for (const match of masked.matchAll(/[.!?][A-Z]/g)) {
    const at = match.index ?? 0;
    hits.push(masked.slice(Math.max(0, at - 16), at + 8));
  }
  return hits;
}

test("the Run 8 brief sitemap lists all 11 pages, with privacy and terms in the footer", () => {
  const dir = tempDir();
  try {
    const { markdown, answers } = run8Brief();
    writeInterview(dir, answers);
    const wrote = advanceDesignStages(dir, { brief: markdown });
    assert.equal(wrote.wrote, "sitemap");
    const sitemap = readFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "utf8");
    for (const title of TITLES) assert.equal(sitemap.includes(`- ${title} at `), true, title);
    assert.equal(pageTitles(sitemap).length, 11);
    const footer = sitemap.split("## Footer")[1] ?? "";
    const primary = sitemap.split("## Footer")[0] ?? "";
    assert.match(footer, /- Privacy at \/privacy/);
    assert.match(footer, /- Terms at \/terms/);
    assert.equal(primary.includes("- Privacy at "), false);
    assert.equal(primary.includes("- Terms at "), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a sitemap change revises the pages and does not approve the stage", () => {
  const dir = tempDir();
  try {
    const { markdown, answers } = run8Brief();
    writeInterview(dir, answers);
    advanceDesignStages(dir, { brief: markdown });
    const changed = advanceDesignStages(dir, {
      brief: markdown,
      change: { stage: "sitemap", text: "add a Volunteers page under About. remove Blog" },
    });
    assert.equal(changed.wrote, "none");
    const sitemap = readFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "utf8");
    assert.match(sitemap, /- Volunteers at \/volunteers/);
    assert.equal(sitemap.includes("- Blog at "), false);
    const about = sitemap.indexOf("- About at ");
    const volunteers = sitemap.indexOf("- Volunteers at ");
    assert.equal(about >= 0 && volunteers > about, true);
    const saved = readFileSync(path.join(dir, ".hitchhiker", "design-stages.json"), "utf8");
    const parsed = JSON.parse(saved) as { sitemap?: string };
    assert.equal(parsed.sitemap, undefined);
    assert.equal(saved.includes("add a Volunteers"), false);
    assert.equal(saved.includes("remove Blog"), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "wireframe.md")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("the wireframe lists the approved sitemap and goes stale after a later sitemap change", () => {
  const dir = tempDir();
  try {
    const { markdown, answers } = run8Brief();
    writeInterview(dir, answers);
    advanceDesignStages(dir, { brief: markdown });
    advanceDesignStages(dir, { brief: markdown, approval: { stage: "sitemap", text: "Approved." } });
    const sitemap = readFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "utf8");
    const wireframe = readFileSync(path.join(dir, ".hitchhiker", "wireframe.md"), "utf8");
    const expected = pageTitles(sitemap);
    const shown = [...wireframe.matchAll(/^## (.+)$/gm)].map((match) => match[1] ?? "");
    assert.deepEqual(shown, expected);
    advanceDesignStages(dir, {
      brief: markdown,
      change: { stage: "sitemap", text: "add a Volunteers page under About" },
    });
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "wireframe.md")), false);
    assert.equal(existsSync(path.join(dir, "DESIGN.md")), false);
    const state = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "design-stages.json"), "utf8")) as {
      sitemap?: string;
      wireframe?: string;
    };
    assert.equal(state.sitemap, undefined);
    assert.equal(state.wireframe, undefined);
    const waiting = advanceDesignStages(dir, { brief: markdown });
    assert.equal(waiting.wrote, "none");
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "wireframe.md")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("the style guide uses the Run 8 kit, then the picked pair, and skips 3D on a motion-4 site", () => {
  const dir = tempDir();
  try {
    const { markdown, answers } = run8Brief();
    writeInterview(dir, answers);
    writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), markdown);
    const kit = renderDesignMd(markdown, answers);
    assert.match(kit, /#f3e6d0/);
    assert.match(kit, /#8a6a12/);
    assert.match(kit, /Syne/);
    assert.match(kit, /Spline Sans/);
    assert.match(kit, /Source: brand kit/);
    assert.doesNotMatch(kit, /Gambarino/);
    assert.doesNotMatch(kit, /Author/);
    assert.doesNotMatch(kit, /\bcamera\b/i);
    assert.doesNotMatch(kit, /\bFOV\b/);
    assert.doesNotMatch(kit, /\bbloom\b/i);
    assert.doesNotMatch(kit, /Pin length|anticipatePin|pin-3D|scroll-pinned/i);
    assert.match(kit, /Motion score 4/);

    advanceDesignStages(dir, { brief: markdown });
    advanceDesignStages(dir, { brief: markdown, approval: { stage: "sitemap", text: "Approved." } });
    advanceDesignStages(dir, { brief: markdown, approval: { stage: "wireframe", text: "Approved." } });
    advanceDesignStages(dir, { brief: markdown, approval: { stage: "style-guide", text: "Approved." } });
    const before = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    assert.match(before, /Syne/);
    assert.match(before, /#f3e6d0/);
    const deal = dealDirections();
    const first = deal.directions[0];
    assert.ok(first);
    saveDirectionDeal(dir, {
      pickedId: null,
      directions: deal.directions.map((direction, index) =>
        index === 0 ? { ...direction, display: "Boska", body: "General Sans" } : direction,
      ),
    });
    chooseDirection(dir, first.id, "Boska fits the calm page.");
    const after = readFileSync(path.join(dir, "DESIGN.md"), "utf8");
    assert.match(after, /General Sans/);
    assert.equal(after.includes("Boska"), false);
    assert.match(after, /Source: picked direction/);
    assert.match(after, /#f3e6d0/);
    assert.match(after, /#8a6a12/);
    assert.doesNotMatch(after, /Gambarino/);
    assert.doesNotMatch(after, /Author/);
    assert.doesNotMatch(after, /\bcamera\b/i);
    assert.doesNotMatch(after, /\bFOV\b/);
    assert.doesNotMatch(after, /\bbloom\b/i);
    const state = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "design-stages.json"), "utf8")) as {
      styleGuide?: string;
      sitemap?: string;
    };
    assert.equal(state.styleGuide, undefined);
    assert.equal(state.sitemap, "Approved.");
  } finally {
    removeTempDir(dir);
  }
});

test("pre-build checks read the Run 8 artefacts and a failure keeps the build gate shut", () => {
  const dir = tempDir();
  const blocked = tempDir();
  try {
    const { markdown, answers } = run8Brief();
    writeInterview(dir, answers);
    writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), markdown);
    advanceDesignStages(dir, { brief: markdown });
    advanceDesignStages(dir, { brief: markdown, approval: { stage: "sitemap", text: "Approved." } });
    advanceDesignStages(dir, { brief: markdown, approval: { stage: "wireframe", text: "Approved." } });
    const deal = dealDirections();
    const first = deal.directions[0];
    assert.ok(first);
    saveDirectionDeal(dir, {
      pickedId: null,
      directions: deal.directions.map((direction, index) =>
        index === 0 ? { ...direction, display: "Boska", body: "General Sans" } : direction,
      ),
    });
    chooseDirection(dir, first.id, "Boska fits the calm page.");
    const report = runPrebuildChecks(markdown, dir);
    const byId = new Map(report.checks.map((check) => [check.id, check]));
    for (const id of ["critique", "devices", "phone", "webgl", "elevate", "ai-look", "type", "awwwards"]) {
      assert.equal(byId.has(id), true, id);
    }
    const type = byId.get("type");
    assert.ok(type);
    assert.match(type.detail, /General Sans/);
    assert.match(type.detail, /wght 300/);
    assert.equal(type.detail.includes("Boska"), false);
    for (const other of ["Gambetta", "Erode", "Tanker", "Clash Display", "Switzer", "Unbounded", "Gambarino", "Author"]) {
      assert.equal(type.detail.includes(other), false, other);
      assert.equal(type.findings.join(" ").includes(other), false, other);
    }
    const webgl = byId.get("webgl");
    assert.ok(webgl);
    assert.match(webgl.detail, /skipped: no 3D/);
    const devices = byId.get("devices");
    assert.ok(devices);
    for (const name of ["iOS Safari", "Android Chrome", "tablet", "desktop"]) {
      assert.match(devices.detail, new RegExp(name));
    }
    const critique = byId.get("critique");
    assert.ok(critique);
    assert.equal(critique.detail.trim() === markdown.replace(/\s+/g, " ").trim(), false);
    assert.equal(report.checks.some((check) => check.status === "fail"), false, report.checks.filter((check) => check.status === "fail").map((check) => `${check.id}: ${check.detail}`).join(" | "));

    mkdirSync(path.join(blocked, ".hitchhiker"), { recursive: true });
    writeFileSync(path.join(blocked, ".hitchhiker", "design-stages.json"), `${JSON.stringify({
      sitemap: "Approved.",
      wireframe: "Approved.",
      styleGuide: "Approved.",
      direction: "Approved.",
      prebuild: "Approved.",
    })}\n`);
    writeFileSync(path.join(blocked, ".hitchhiker", "sitemap.md"), "# Sitemap\n\n## Primary\n\n- Home at /\n", "utf8");
    writeFileSync(path.join(blocked, ".hitchhiker", "wireframe.md"), "# Wireframe\n\n## Home\n", "utf8");
    writeFileSync(path.join(blocked, "DESIGN.md"), "Paper #ffffff carries ink #ffffff.\n", "utf8");
    const gate = designReadyForBuild(blocked, "The site helps a visitor book a visit.");
    assert.equal(gate.ok, false);
    assert.equal(gate.checks.checks.some((check) => check.status === "fail"), true);
  } finally {
    removeTempDir(dir);
    removeTempDir(blocked);
  }
});

test("Run 8 DP-2.2 joins as farm ID. Only ask, and no brief section glues a capital to punctuation", () => {
  assert.equal(spaceAfterTerminal("farm ID.Only ask"), "farm ID. Only ask");
  assert.equal(spaceAfterTerminal("farm ID. Only ask"), "farm ID. Only ask");
  assert.equal(spaceAfterTerminal("See https://example.com/A today"), "See https://example.com/A today");
  assert.equal(spaceAfterTerminal("Version 3.14 is current."), "Version 3.14 is current.");
  assert.equal(spaceAfterTerminal("Ask Dr.Who"), "Ask Dr.Who");
  assert.equal(spaceAfterTerminal("Logo file paradise-found-logo.png is attached."), "Logo file paradise-found-logo.png is attached.");
  assert.equal(spaceAfterTerminal("Logo file paradise-found-logo.PNG is attached."), "Logo file paradise-found-logo.PNG is attached.");
  const facts = {
    answers: [{ id: "DP-2.2", status: "ANSWERED", value: DP22 }, ...LIMITS],
    uploads: [] as string[],
    crawlNotes: [] as string[],
  };
  const filled = deterministicBrief(facts, "en");
  assert.match(filled.action, /farm ID\. Only ask/);
  assert.equal(filled.action.includes("farm ID.Only"), false);
  const markdown = renderSiteBrief(filled);
  assert.match(markdown, /farm ID\. Only ask/);
  const sections = markdown.split(/^## /m).slice(1);
  for (const section of sections) {
    const name = section.slice(0, section.indexOf("\n")).trim();
    assert.deepEqual(gluedCapitals(section), [], name);
  }
  const full = renderSiteBrief(deterministicBrief({ answers: run8Facts().answers, uploads: [], crawlNotes: [] }, "en"));
  const blocks = full.split(/^## /m).slice(1);
  assert.equal(blocks.length >= BRIEF_KEYS.length, true);
  for (const section of blocks) {
    const name = section.slice(0, section.indexOf("\n")).trim();
    assert.deepEqual(gluedCapitals(section), [], name);
  }
  const typed = filled satisfies SiteBrief;
  assert.equal(typed.action.includes("farm ID.Only"), false);
});
