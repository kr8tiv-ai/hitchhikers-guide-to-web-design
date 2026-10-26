import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { translateBrief } from "../src/spec/art-direction.ts";
import { SECTION_STILL_MODEL, planSectionStills, writeSectionStillPlan } from "../src/spec/section-stills.ts";
import {
  ensureSiteBuild,
  prepareSiteBuild,
  setProjectBuildRunner,
  setSectionStillRunner,
  siteBuildSettled,
  type BuildSpawn,
} from "../src/guide/site-build.ts";
import { loadQueue } from "../src/queue-file.ts";
import type { PlannedPage } from "../src/spec/brief-plan.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = [
  "# Site Brief",
  "",
  "A supplied hero image is already in the project.",
  "",
  "## Vibe",
  "",
  "Calm, warm, and honest.",
  "",
].join("\n");

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-stills-"));
}

function pages(): PlannedPage[] {
  return [
    { id: "home", title: "Home", route: "/", sections: ["hero", "farms"], contentSources: ["src/data/home.ts"] },
    { id: "visit", title: "Visit", route: "/visit", sections: ["about", "visit"], contentSources: ["src/data/visit.ts"] },
  ];
}

test("one supplied image and four sections keep the hero and plan three stills", () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, "public"), { recursive: true });
    writeFileSync(path.join(dir, "public", "field.jpg"), "owner-bytes");
    const plan = writeSectionStillPlan(dir, BRIEF, [], pages());
    assert.equal(plan.kept.length, 1);
    assert.equal(plan.kept[0]?.sectionId, "hero");
    assert.equal(plan.kept[0]?.file, "public/field.jpg");
    assert.deepEqual(plan.slots.map((slot) => slot.id), ["farms", "about", "visit"]);
    const artLines = plan.slots.map((slot) => slot.prompt.split("\n").find((line) => line.startsWith("Art direction:")));
    assert.equal(artLines[0], artLines[1]);
    assert.equal(artLines[1], artLines[2]);
    assert.ok((artLines[0] ?? "").length > "Art direction: ".length);
    for (const slot of plan.slots) {
      assert.equal(slot.model, "grok-imagine-image-2.0");
      assert.equal(slot.model, SECTION_STILL_MODEL);
      assert.equal(slot.aspect, "3:2");
      assert.equal(slot.subjectIsReal, false);
      assert.match(slot.prompt, /^Subject:/);
      assert.match(slot.prompt, /Details and camera:/);
      assert.match(slot.prompt, /Light:/);
      assert.match(slot.prompt, /Color:/);
      assert.match(slot.prompt, /Composition: 3:2/);
      assert.equal(slot.prompt.includes("TODO"), false);
      assert.equal(slot.prompt.includes("XAI_API_KEY"), false);
      assert.equal(slot.prompt.includes("keychain"), false);
    }
    const raw = readFileSync(path.join(dir, ".hitchhiker", "assets", "slots.json"), "utf8");
    assert.equal(raw.includes("origin"), false);
    assert.equal(raw.includes("XAI_API_KEY"), false);
    assert.equal(raw.includes("keychain"), false);
    const same = planSectionStills({
      sections: ["hero", "farms", "about", "visit"],
      art: translateBrief(BRIEF, [], ["hero", "farms", "about", "visit"]),
      supplied: [{ sectionId: "hero", file: "public/field.jpg" }],
    });
    assert.equal(same.slots.length, 3);
    assert.equal(same.kept.length, 1);
  } finally {
    removeTempDir(dir);
  }
});

test("the still runner fires once after the last art prompt and does not pause the queue", async () => {
  const dir = tempDir();
  let runs = 0;
  const spawn: BuildSpawn = () => ({
    pid: 7,
    done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }),
  });
  setProjectBuildRunner(dir, spawn);
  setSectionStillRunner(dir, async () => {
    runs += 1;
  });
  try {
    await prepareSiteBuild(dir, BRIEF);
    await ensureSiteBuild(dir);
    const queue = await loadQueue(dir);
    assert.equal(runs, 1);
    assert.equal(queue?.pause, undefined);
    assert.equal(queue?.items.some((item) => item.status === "paused"), false);
  } finally {
    setSectionStillRunner(dir, null);
    setProjectBuildRunner(dir, null);
    await siteBuildSettled(dir);
    removeTempDir(dir);
  }
});
