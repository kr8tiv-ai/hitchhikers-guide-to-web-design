/**
 * Desk Run 7 surfaces: outlined specimens, the typed project name,
 * one interview counter, and a build line that follows real state.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createSiteProject, dealFontSamples, loadTree, saveState, type BriefDeskView, type Question } from "@hitchhiker/engine";
import { renderCard, specimenSvg, type CardState } from "../src/card.ts";
import { brandBriefMain } from "../src/server/brief-page.ts";
import { projectChrome } from "../src/server/project-desk.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "../../../interview/tree.yaml");
const ASK = "Do you have fonts you use? If not, pick a style from these examples.";

function question(): Question {
  return {
    id: "DP-1.5",
    module: "ford-field-notes",
    depth: ["deep"],
    ask: ASK,
    why: "Type is the look.",
    input: ["text"],
    skipDefault: "Pick one of the samples.",
    writes: ["BRAND.md#type"],
  };
}

function card(extra: Partial<CardState> = {}): CardState {
  return {
    question: question(),
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
    ...extra,
  };
}

test("every dealt pair is outlined in its own face", () => {
  const samples = dealFontSamples("");
  assert.equal(samples.length, 6);
  const paths = new Set<string>();
  const state = card();
  const html = renderCard(state);
  assert.equal(html.includes("ui-sans-serif"), false);
  assert.match(html, /Find your calm/);
  assert.match(html, /hh-type-sample__approx" hidden>approximate preview/);
  for (const sample of samples) {
    const svg = specimenSvg(sample.display);
    assert.ok(svg, sample.display);
    assert.match(svg, new RegExp(`<!-- face:${sample.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} -->`));
    assert.equal(svg.includes("ui-sans-serif"), false);
    assert.equal(/<text\b/.test(svg), false);
    assert.equal(svg.includes("<path"), true);
    assert.equal(svg.length < 15 * 1024, true, sample.display);
    const data = [...svg.matchAll(/\bd="([^"]+)"/g)].map((match) => match[1] ?? "").join("");
    assert.equal(data.length > 40, true, sample.display);
    paths.add(data);
    assert.match(html, new RegExp(`data-display="${sample.display}"[\\s\\S]*?data-specimen="outline"`));
  }
  assert.equal(paths.size, samples.length);
  assert.notEqual(specimenSvg("Gambetta"), specimenSvg("Tanker"));
});

test("a missing specimen shows the approximate preview label", () => {
  const html = renderCard(
    card({
      fontSamples: [
        { adjectives: "mystery face", display: "Not A Real Face", body: "Also Missing", pair: "Not A Real Face" },
      ],
    }),
  );
  const block = /data-display="Not A Real Face"[\s\S]*?<\/button>/.exec(html);
  assert.ok(block?.[0]);
  assert.match(block[0], /data-specimen="missing"/);
  assert.match(block[0], /approximate preview/);
  assert.equal(block[0].includes('hh-type-sample__approx" hidden'), false);
  assert.equal(block[0].includes("ui-sans-serif"), false);
  assert.equal(block[0].includes("<img"), false);
});

test("the brand page does not say the build started until the build exists", () => {
  const view = {
    status: "approved",
    draft: { goal: "A calm page." },
    markdown: "",
    sources: [],
    buildStarted: false,
    planApproved: true,
    phase: "Don't Panic",
    nextAction: "",
    error: "",
    note: "",
    fallback: false,
    revisit: null,
  } as BriefDeskView;
  const waiting = brandBriefMain(view);
  assert.equal(waiting.includes("The build is started."), false);
  assert.match(waiting, /The design is waiting for a yes/);
  const drafted = brandBriefMain({ ...view, planApproved: false });
  assert.equal(drafted.includes("The build is started."), false);
  assert.match(drafted, /The plan is drafted/);
  const started = brandBriefMain({ ...view, buildStarted: true });
  assert.match(started, /The build is started/);
});

test("after the interview every counter says 61 of 61", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-progress-242b-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const questions = loadTree(treeFile);
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify(questions.map((item) => ({ id: item.id, status: "ANSWERED", value: "Yes." }))),
  );
  await saveState(dir, {
    phase: "Don't Panic",
    slice: "Desk",
    promptId: "interview:done",
    lastGoodCommit: "",
    blockers: [],
    nextAction: "Interview done.",
    updatedAt: "2026-10-20T12:00:00.000Z",
  });
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      open: false,
      turnHandler: async () => ({ next: null, events: [] }),
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    assert.notEqual(handle.port, 4175);
    const html = await (await fetch(handle.url)).text();
    assert.match(html, /Interview done \(61 of 61\)/);
    assert.equal(html.includes("Question 1 of 1"), false);
    assert.equal(html.includes("question 1 of 1"), false);
    const again = await (await fetch(handle.url)).text();
    assert.match(again, /Interview done \(61 of 61\)/);
    assert.equal(again.includes("1 of 1"), false);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Paradise Calm in site stays Paradise Calm on the desk", async () => {
  const previousHome = process.env.HH_PROJECT_HOME;
  const previousE2e = process.env.HH_E2E_PROJECT;
  delete process.env.HH_PROJECT_HOME;
  delete process.env.HH_E2E_PROJECT;
  const root = mkdtempSync(path.join(tmpdir(), "hh-desk-name-242b-"));
  const dir = path.join(root, "site");
  let handle: ServerHandle | undefined;
  try {
    await createSiteProject({ name: "Paradise Calm", dir, homeDir: path.join(root, "home") });
    handle = await startServer({
      projectDir: dir,
      open: false,
      turnHandler: async () => ({ next: null, events: [] }),
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    assert.notEqual(handle.port, 4175);
    const first = await (await fetch(handle.url)).text();
    assert.match(first, /hh-project__name">Paradise Calm</);
    assert.equal(first.includes('hh-project__name">site<'), false);
    const second = await (await fetch(new URL("/?stay=1", handle.url))).text();
    assert.match(second, /hh-project__name">Paradise Calm</);
    const chrome = await projectChrome(dir, "token", true);
    assert.match(chrome, /hh-project__name">Paradise Calm</);
    assert.match(chrome, /Open Paradise Calm/);
  } finally {
    if (handle !== undefined) await handle.close();
    if (previousHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = previousHome;
    if (previousE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = previousE2e;
    rmSync(root, { recursive: true, force: true });
  }
});
