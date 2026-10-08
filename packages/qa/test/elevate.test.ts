import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  defaultConfig,
  think,
  type SpawnLike,
  type ThinkRequest,
} from "@hitchhiker/engine";
import {
  ELEVATE_CAP,
  ELEVATE_PLAN_SCHEMA,
  ELEVATE_PLAN_TASK,
  planElevate,
  planElevateModel,
  type ElevateColdRead,
} from "../src/elevate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, "..", "src", "elevate.ts");

const FLAGS = new Set([
  "-p",
  "-m",
  "--effort",
  "--json-schema",
  "--output-format",
  "--max-turns",
  "--tools",
  "--permission-mode",
]);

function line(file: string, change = "open the tracking on the display line"): string {
  return `${file}: ${change}`;
}

function coldRead(): ElevateColdRead {
  return {
    shots: ["shots/375.png", "shots/768.png", "shots/1440.png", "shots/1920.png"],
    code: "export function Hero() { return <h1>Towel</h1>; }",
    brand: "A quiet towel shop. Paper, ink, and one green stitch.",
    voice: "Short sentences. Concrete nouns. No hype.",
    motion: "One pinned story on the desktop. A still on the phone.",
  };
}

test("empty input returns an empty list and truncated false", () => {
  const result = planElevate([]);
  assert.deepEqual(result, { items: [], skipped: 0, truncated: false });
});

test("a note that does not name a file is skipped", () => {
  const result = planElevate([
    "",
    "   ",
    "open the tracking",
    ": missing file",
    "missing change:",
    "src/hero.tsx: open the tracking",
  ]);
  assert.equal(result.skipped, 5);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.items, [{ file: "src/hero.tsx", change: "open the tracking" }]);
});

test("nine valid notes yield truncated true and the first eight in order", () => {
  const notes = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((name) => line(`src/${name}.tsx`));
  const copy = [...notes];
  const result = planElevate(notes);
  assert.deepEqual(notes, copy);
  assert.equal(result.truncated, true);
  assert.equal(result.skipped, 0);
  assert.equal(result.items.length, ELEVATE_CAP);
  assert.equal(ELEVATE_CAP, 8);
  assert.deepEqual(
    result.items.map((item) => item.file),
    ["a", "b", "c", "d", "e", "f", "g", "h"].map((name) => `src/${name}.tsx`),
  );
  assert.equal(
    result.items.some((item) => item.file === "src/i.tsx"),
    false,
  );
});

test("skips do not take a slot and a ninth accepted note still truncates", () => {
  const notes = [
    line("src/a.tsx"),
    line("src/b.tsx"),
    line("src/c.tsx", "add a magnetic hover"),
    line("src/d.tsx"),
    line("src/e.tsx"),
    line("src/f.tsx"),
    line("src/g.tsx"),
    line("src/h.tsx"),
    line("src/i.tsx"),
    line("src/j.tsx"),
    line("src/k.tsx", "Make the type larger!"),
  ];
  const result = planElevate(notes);
  assert.equal(result.truncated, true);
  assert.equal(result.skipped, 2);
  assert.deepEqual(
    result.items.map((item) => item.file),
    ["src/a.tsx", "src/b.tsx", "src/d.tsx", "src/e.tsx", "src/f.tsx", "src/g.tsx", "src/h.tsx", "src/i.tsx"],
  );
});

test("magnetic and exclamation changes are skipped and the plan is kept", () => {
  const result = planElevate([
    line("src/hero.tsx", "open the tracking"),
    line("src/button.tsx", "add a magnetic hover"),
    line("src/nav.tsx", "ADD A MAGNETIC pull"),
    line("src/mark.tsx", "make the control magnetic"),
    line("src/type.tsx", "Make the type larger!"),
    line("src/cursor.tsx", "a non-magnetic cursor that stays put"),
    line("src/fold.tsx", "Give the fold a calmer crop"),
  ]);
  assert.equal(result.skipped, 4);
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.items.map((item) => item.file),
    ["src/hero.tsx", "src/cursor.tsx", "src/fold.tsx"],
  );
  assert.equal(
    result.items.some((item) => /magnetic/i.test(item.change) && !/non-magnetic/i.test(item.change)),
    false,
  );
  assert.equal(
    result.items.some((item) => item.change.includes("!")),
    false,
  );
});

test("the file may contain elevate and the change may not", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(path.basename(sourcePath), "elevate.ts");
  assert.match(source, /export function planElevate\b/);
  assert.match(source, /elevate-plan/);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("writeFile"), false);

  const result = planElevate([
    line("packages/qa/src/elevate.ts", "open the tracking on the display line"),
    line("src/hero.tsx", "elevate the headline"),
    line("src/nav.tsx", "elevated contrast on the mark"),
    line("src/copy.tsx", "unlock a calmer fold"),
    line("src/voice.tsx", "it's not just a towel, it is a towel"),
    line("src/dash.tsx", "open the tracking \u2014 quietly"),
    line("src/placeholder.tsx", "lorem in the hero"),
  ]);
  assert.deepEqual(result.items, [
    {
      file: "packages/qa/src/elevate.ts",
      change: "open the tracking on the display line",
    },
    { file: "src/nav.tsx", change: "elevated contrast on the mark" },
  ]);
  assert.equal(result.skipped, 5);
  for (const item of result.items) {
    assert.equal(/\belevate\b/i.test(item.change), false);
  }
});

test("duplicate pairs are dropped and a parent segment is skipped", () => {
  const result = planElevate([
    line("src/a.tsx", "open the tracking"),
    line("src/a.tsx", "open the tracking"),
    line("src/a.tsx", "pin the subhead"),
    line("../secret.ts", "open the tracking"),
    line("src/../hero.tsx", "open the tracking"),
    line("src/foo..bar.ts", "keep the odd name"),
    "C:\\sites\\hero.tsx: open the tracking",
  ]);
  assert.equal(result.skipped, 2);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.items, [
    { file: "src/a.tsx", change: "open the tracking" },
    { file: "src/a.tsx", change: "pin the subhead" },
    { file: "src/foo..bar.ts", change: "keep the odd name" },
    { file: "C:\\sites\\hero.tsx", change: "open the tracking" },
  ]);
});

test("eight accepted notes are not truncated", () => {
  const notes = ["a", "b", "c", "d", "e", "f", "g", "h"].map((name) => line(`src/${name}.tsx`));
  const result = planElevate(notes);
  assert.equal(result.items.length, 8);
  assert.equal(result.truncated, false);
  assert.equal(result.skipped, 0);
});

test("planElevateModel replays a recorded cassette and applies nothing", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-elevate-"));
  const cassetteDir = path.join(dir, "cassettes");
  const siteDir = path.join(dir, "site");
  const siteFile = path.join(siteDir, "hero.tsx");
  const payload = {
    upgrades: [
      {
        file: "src/hero.tsx",
        change: "Open the tracking on the display line",
        pass: "type-and-spacing",
        phone: "poster",
        reducedMotion: "the same poster",
      },
      {
        file: "src/story.tsx",
        change: "Pin the origin story for one viewport",
        pass: "standout",
        feature: "scroll-storytelling",
        phone: "a short still",
        reducedMotion: "the still, no pin",
      },
      {
        file: "src/button.tsx",
        change: "add a magnetic hover",
        pass: "motion",
        phone: "none",
        reducedMotion: "none",
      },
      {
        file: "../secret.ts",
        change: "Read a token from disk",
        pass: "copy",
        phone: "same",
        reducedMotion: "same",
      },
    ],
  };
  let spawns = 0;
  const spawnImpl: SpawnLike = async () => {
    spawns += 1;
    return {
      status: 0,
      stdout: JSON.stringify({
        text: JSON.stringify(payload),
        stopReason: "end_turn",
        usage: { input_tokens: 20, output_tokens: 40 },
      }),
      stderr: "",
      timedOut: false,
      errorCode: null,
    };
  };
  const seen: ThinkRequest<unknown>[] = [];
  const recorded: typeof think = (req, deps) => {
    seen.push(req);
    return think(req, {
      ...deps,
      spawnImpl,
      projectDir: dir,
      cassetteDir,
      config: defaultConfig(),
      flags: FLAGS,
      env: { HH_CASSETTE: "record", PATH: "" },
    });
  };
  const read = coldRead();
  read.shots = [375, 768, 1440, 1920].map((width) => path.join(dir, "shots", `${width}.png`));
  try {
    mkdirSync(siteDir, { recursive: true });
    const before = "export function Hero() { return null; }\n";
    writeFileSync(siteFile, before, "utf8");

    const first = await planElevateModel(read, { think: recorded });
    assert.equal(spawns, 1);
    assert.equal(seen.length, 1);
    const request = seen[0];
    assert.ok(request);
    assert.equal(request.task, ELEVATE_PLAN_TASK);
    assert.equal(request.task, "elevate-plan");
    assert.equal(request.effort, "xhigh");
    assert.equal(request.schema, ELEVATE_PLAN_SCHEMA);
    assert.equal(ELEVATE_PLAN_SCHEMA.properties?.upgrades?.maxItems, 8);
    assert.deepEqual(request.images, read.shots);
    assert.equal(request.input.includes("How could I possibly improve this?"), true);
    assert.equal(request.input.includes("BRAND"), true);
    assert.equal(request.input.includes(read.brand), true);
    assert.equal(request.input.includes("VOICE"), true);
    assert.equal(request.input.includes(read.voice), true);
    assert.equal(request.input.includes("MOTION"), true);
    assert.equal(request.input.includes(read.motion), true);
    assert.equal(request.input.includes(read.code), true);
    assert.equal(request.input.includes("375"), true);
    assert.equal(first.truncated, false);
    assert.equal(first.skipped, 2);
    assert.equal(first.items.length, 2);
    assert.equal(first.items[0]?.file, "src/hero.tsx");
    assert.equal(first.items[0]?.change.includes("Open the tracking on the display line"), true);
    assert.equal(first.items[0]?.change.includes("Pass type and spacing."), true);
    assert.equal(first.items[0]?.change.includes("Phone poster."), true);
    assert.equal(first.items[0]?.change.includes("Reduced motion the same poster."), true);
    assert.equal(first.items[1]?.file, "src/story.tsx");
    assert.equal(first.items[1]?.change.includes("Pass standout scroll storytelling."), true);
    assert.equal(
      first.items.some((item) => item.file.includes("..")),
      false,
    );
    for (const item of first.items) {
      assert.equal(/\belevate\b/i.test(item.change), false);
      assert.equal(item.change.includes("!"), false);
      assert.equal(/\bmagnetic\b/i.test(item.change), false);
    }
    assert.equal(readFileSync(siteFile, "utf8"), before);

    const replayed: typeof think = (req, deps) =>
      think(req, {
        ...deps,
        spawnImpl: async () => {
          throw new Error("spawned during replay");
        },
        projectDir: dir,
        cassetteDir,
        config: defaultConfig(),
        flags: FLAGS,
        env: { HH_CASSETTE: "replay", PATH: "" },
      });
    const second = await planElevateModel(read, { think: replayed });
    assert.equal(spawns, 1);
    assert.deepEqual(second, first);
    assert.equal(readFileSync(siteFile, "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
