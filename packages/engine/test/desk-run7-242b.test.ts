/**
 * Desk Run 7. Directions come from design references, the brand kit
 * keeps the colour answer and a real type pair, Limits stay limits,
 * and every brief page is a coverage row.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readDecisionLog, rejectedDirectionNames } from "../src/brand/decision-canvas.ts";
import {
  dealDirections,
  isDocsOrPackUrl,
  loadDesignReferences,
  loadStudiedPages,
  saveDirectionDeal,
  chooseDirection,
} from "../src/brand/directions.ts";
import {
  brandKitFromAnswers,
  passesBodyContrast,
  passesLargeContrast,
} from "../src/brand/kit-from-interview.ts";
import { pickType } from "../src/brand/tokens.ts";
import { deterministicBrief, renderSiteBrief } from "../src/guide/brief-loop.ts";
import { readBriefDesk } from "../src/guide/brief-desk.ts";
import { BRIEF_KEYS, type SiteBrief } from "../src/guide/schemas.ts";
import { createSiteProject } from "../src/new-project.ts";
import { readProjectDisplayName } from "../src/project-file/display-name.ts";
import { interviewProgressLabel } from "../src/project-file/capture.ts";
import { readRecentProjects } from "../src/project-file/locate.ts";
import { projectHome } from "../src/project-file/locate.ts";
import { planFromBrief } from "../src/spec/brief-plan.ts";
import { saveState } from "../src/state.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const RUN7_TYPE =
  "No fonts yet. Light, wide, airy sans for headings like the logo; easy-reading body. Show me pairings.";
const RUN7_COLOUR =
  "Jungle green, sunset gold, ocean blue, from the hero photo. Plus soft sand and a near-black green. Sunset gold is the accent; soft sand is the page.";
const RUN7_REFS =
  "Patagonia: big quiet photography and plain type. Aesop: restraint, lots of empty space, small calm type. Kinfolk: slow editorial scroll and soft color. Airbnb Luxe: clean listing cards and gallery.";
const RUN7_LOVE = "Aesop: love. Kinfolk: love. Patagonia: love. Cereal: meh, too cold.";

test("docs and knowledge-pack urls are not design references", () => {
  const rejected = [
    "https://docs.astro.build/en/guides/images/",
    "https://docs.astro.build/en/guides/view-transitions/",
    "https://nextjs.org/docs/app/building-your-application",
    "https://vitejs.dev/guide/",
    "https://gsap.com/docs/v3/",
    "https://github.com/withastro/docs",
    "https://threejs.org/docs/",
    "https://www.awwwards.com/websites/sites_of_the_day/",
    "not a url",
  ];
  for (const url of rejected) assert.equal(isDocsOrPackUrl(url), true, url);
  for (const url of [
    "https://www.patagonia.com/",
    "https://www.aesop.com/",
    "https://www.kinfolk.com/",
    "https://example.com/",
    "https://landonorris.com/",
  ]) {
    assert.equal(isDocsOrPackUrl(url), false, url);
  }
  const stock = loadStudiedPages();
  assert.equal(stock.length > 0, true);
  assert.equal(stock.every((page) => isDocsOrPackUrl(page.url)), true);
  for (const page of loadDesignReferences()) assert.equal(isDocsOrPackUrl(page.url), false, page.url);
});

test("Run 7 loves are the directions, and Cereal and docs are not", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-directions-242b-"));
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "interview.json"),
      JSON.stringify([
        { id: "DP-5.1", status: "ANSWERED", value: RUN7_REFS },
        { id: "DP-5.2", status: "ANSWERED", value: RUN7_LOVE },
      ]),
    );
    const deal = dealDirections(undefined, dir);
    assert.deepEqual(
      deal.directions.map((direction) => direction.title),
      ["Patagonia", "Aesop", "Kinfolk"],
    );
    for (const direction of deal.directions) {
      assert.equal(isDocsOrPackUrl(direction.url), false);
      assert.equal(direction.description.trim().length > 0, true);
      assert.notEqual(direction.name, direction.title);
      assert.equal(/astro|vite|nextjs|docs\./i.test(direction.url), false);
    }
    const blob = deal.directions.map((direction) => `${direction.title} ${direction.url} ${direction.name}`).join("\n");
    assert.equal(/cereal/i.test(blob), false);
    assert.match(deal.directions[0]?.name ?? "", /quiet photography/i);
    assert.match(deal.directions[1]?.description ?? "", /quiet/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a re-pick appends a decision and the latest pick wins", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-repick-242b-"));
  try {
    const deal = dealDirections();
    saveDirectionDeal(dir, deal);
    const first = deal.directions[0];
    const second = deal.directions[1];
    assert.ok(first);
    assert.ok(second);
    chooseDirection(dir, first.id, "The first page fits.", "2026-10-20T12:00:00.000Z");
    chooseDirection(dir, second.id, "The second page fits better.", "2026-10-20T12:05:00.000Z");
    const picks = readDecisionLog(dir).filter((row) => row.status === "picked");
    assert.equal(picks.length, 2);
    assert.equal(picks[0]?.id, first.id);
    assert.equal(picks[1]?.id, second.id);
    assert.equal(picks[1]?.reason, "The second page fits better.");
    const names = rejectedDirectionNames(dir);
    assert.equal(names.includes(second.name), false);
    assert.equal(names.includes(first.name), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Run 7 type intent deals a wide sans, and the five colours are the palette", () => {
  const kit = brandKitFromAnswers([
    { id: "DP-1.5", value: RUN7_TYPE },
    { id: "DP-1.2", value: RUN7_COLOUR },
  ]);
  const dealt = /Dealt families: ([^\n]+)/.exec(kit.markdown);
  assert.ok(dealt?.[1]);
  assert.equal(/\bNo\b/.test(dealt[1]), false);
  assert.equal(/\bLight\b/.test(dealt[1]), false);
  assert.match(dealt[1], /Syne/);
  assert.match(dealt[1], /Spline Sans/);
  const pair = pickType(RUN7_TYPE.replace(/^no fonts yet\.?\s*/i, ""));
  assert.deepEqual(pair.families, ["Syne", "Spline Sans"]);
  for (const name of ["jungle green", "sunset gold", "ocean blue", "soft sand", "near-black green"]) {
    assert.match(kit.markdown, new RegExp(name, "i"));
  }
  assert.equal(kit.palette.paper, "#f3e6d0");
  assert.equal(kit.palette.ink, "#14241c");
  assert.notEqual(kit.palette.paper, "#f4f1ea");
  assert.notEqual(kit.palette.ink, "#1a1a1a");
  assert.notEqual(kit.palette.accent, "#1f6b4a");
  assert.equal(passesBodyContrast(kit.palette.ink, kit.palette.paper), true);
  assert.equal(passesBodyContrast(kit.palette.muted, kit.palette.paper), true);
  assert.equal(passesLargeContrast(kit.palette.accent, kit.palette.paper), true);
  assert.equal(kit.palette.swatches.length, 5);
});

test("Run 7 limits keep constraints, and the timeline and facts leave that section", () => {
  const facts = {
    answers: [
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
      { id: "DP-3.5", value: "Yes, a small blog, one guide a month." },
    ],
    uploads: [],
    crawlNotes: [],
  };
  const filled = deterministicBrief(facts, "en");
  assert.match(filled.limits, /Privacy and terms/);
  assert.match(filled.limits, /Never give legal advice/);
  assert.match(filled.limits, /advice\. Disclaimer/);
  assert.match(filled.limits, /Never say investment/);
  assert.equal(filled.limits.includes("November"), false);
  assert.equal(filled.limits.includes("caretaker program"), false);
  assert.equal(filled.limits.includes("Office hours"), false);
  assert.equal(filled.limits.includes("Yes, that is right"), false);
  assert.match(filled.cadence, /November 10, 2026/);
  assert.match(filled.session, /caretaker program/);
  assert.match(filled.session, /Office hours/);
  const markdown = renderSiteBrief(filled);
  assert.match(markdown, /## Timeline\n\nIn 4 weeks: by November 10, 2026\./);
  const limitsBody = /## Limits\n\n([\s\S]*?)\n\n## /.exec(markdown)?.[1] ?? "";
  assert.equal(limitsBody.includes("November"), false);
  assert.equal(limitsBody.includes("caretaker"), false);
});

test("Run 7 coverage has one row per page and feature", () => {
  const raw = JSON.parse(readFileSync(path.join(here, "fixtures", "project4-interview.json"), "utf8")) as {
    answers: Array<{ id: string; value: string; status?: string }>;
  };
  const markdown = renderSiteBrief(deterministicBrief({ answers: raw.answers, uploads: [], crawlNotes: [] }, "en"));
  const planned = planFromBrief(markdown, raw.answers);
  assert.equal(planned.requirements.length, planned.pages.length + planned.features.length);
  assert.equal(planned.pages.length, 11);
  assert.equal(planned.features.length, 14);
  for (const title of [
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
  ]) {
    assert.equal(planned.pages.some((page) => page.title === title), true, title);
  }
  assert.equal(planned.pages.some((page) => page.title === "Eco-Building"), false);

  const bullets = planFromBrief(
    ["## Pages", "", "- Home", "- About", "- Contact", "", "## Features", "", "- Farm map", "- Newsletter", ""].join("\n"),
  );
  assert.deepEqual(
    bullets.pages.map((page) => page.title),
    ["Home", "About", "Contact"],
  );
  assert.equal(bullets.requirements.length, bullets.pages.length + bullets.features.length);

  const shortened = planFromBrief(["## Pages", "", "Home", ""].join("\n"), [
    {
      id: "DP-2.8",
      value:
        "Home; Farms (grid plus a detail page); Live on the Land; How Buying Works; Eco-Building and Food; About; Contact",
    },
  ]);
  for (const title of ["Home", "Farms", "Live on the Land", "How Buying Works", "Eco-Building and Food", "About", "Contact"]) {
    assert.equal(shortened.pages.some((page) => page.title === title), true, title);
  }
  assert.equal(shortened.pages.filter((page) => page.title === "Eco-Building and Food").length, 1);
});

test("the build-started line follows the queue, not a stale pending flag", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-build-flag-242b-"));
  const hitch = path.join(dir, ".hitchhiker");
  try {
    mkdirSync(hitch, { recursive: true });
    const draft = {} as SiteBrief;
    for (const key of BRIEF_KEYS) draft[key] = "Noted for the test.";
    writeFileSync(
      path.join(hitch, "brief-pending.json"),
      JSON.stringify({ status: "approved", draft, buildStarted: true, planApproved: false, error: "", note: "", fallback: false }),
    );
    assert.equal(readBriefDesk(dir).buildStarted, false);
    writeFileSync(
      path.join(hitch, "brief-pending.json"),
      JSON.stringify({ status: "approved", draft, buildStarted: true, planApproved: true, error: "", note: "", fallback: false }),
    );
    assert.equal(readBriefDesk(dir).buildStarted, false);
    assert.equal(readBriefDesk(dir).planApproved, true);
    writeFileSync(path.join(hitch, "queue.json"), "{}\n");
    assert.equal(readBriefDesk(dir).buildStarted, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a typed project name survives the folder name", async () => {
  const previousHome = process.env.HH_PROJECT_HOME;
  const previousE2e = process.env.HH_E2E_PROJECT;
  delete process.env.HH_PROJECT_HOME;
  delete process.env.HH_E2E_PROJECT;
  const root = mkdtempSync(path.join(tmpdir(), "hh-name-242b-"));
  try {
    const dir = path.join(root, "site");
    const home = path.join(root, "home");
    const created = await createSiteProject({
      name: "Paradise Calm",
      dir,
      homeDir: home,
      now: new Date("2026-10-20T12:00:00.000Z"),
    });
    assert.equal(readProjectDisplayName(created.dir), "Paradise Calm");
    const rows = await readRecentProjects(projectHome(created.dir));
    assert.equal(rows.some((row) => row.sourceDir === created.dir && row.name === "Paradise Calm"), true);
    await saveState(created.dir, {
      phase: "Don't Panic",
      slice: "Desk",
      promptId: "interview:done",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "Interview done.",
      updatedAt: "2026-10-20T12:00:00.000Z",
    });
    assert.equal(interviewProgressLabel(created.dir), "Interview done (61 of 61)");
  } finally {
    if (previousHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = previousHome;
    if (previousE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = previousE2e;
    rmSync(root, { recursive: true, force: true });
  }
});
