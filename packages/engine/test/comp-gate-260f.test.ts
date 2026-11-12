/**
 * 260f: the compare gate fixes one blocking miss, then pauses.
 * Shoots, reviews, and the preview are fakes. No browser and no model call.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  ConfigError,
  approveComp,
  clearProjectBuildRunner,
  compCandidateRel,
  ensureSiteBuild,
  isCompCompareCloseReason,
  loadQueue,
  parseConfig,
  readBuildRun,
  resetSiteBuildWatch,
  runCompGate,
  saveQueue,
  setCompGateDeps,
  setProjectBuildRunner,
  siteBuildSettled,
  type BuildSpawn,
  type BuildSpawnResult,
  type CompFault,
  type CompFixTurn,
} from "../src/index.ts";
import { formatFixBeforeFinish, isSurfaceCloseReason } from "../src/spec/visible-copy.ts";
import { removeTempDir } from "./remove-temp.ts";

const SITEMAP = `# Sitemap

## Primary

- Home at /
  - hero
`;

const WHEN = "2026-11-12T12:00:00.000Z";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-260f-gate-"));
}

function pagePrompt(): string {
  return ["# Build the home page", "", "## Task", "", "Route: /", "Requirements: REQ-PAGE-home", "", "## Notes", "", "Done.", ""].join("\n");
}

function setupPrompt(): string {
  return ["# Set up the project", "", "## Task", "", "Requirements: REQ-STACK", "", "## Notes", "", "Done.", ""].join("\n");
}

function writePrompt(dir: string, id: string, body: string): void {
  const folder = path.join(dir, ".hitchhiker", "prompts");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, `${id}.md`), body, "utf8");
}

function approveHome(dir: string): string {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), SITEMAP, "utf8");
  const rel = compCandidateRel("/", "desktop", 1);
  const abs = path.join(dir, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, Buffer.from("sketch"));
  approveComp(dir, "/", "desktop", rel);
  return "reference/renders/home.png";
}

async function queueItem(dir: string, id: string): Promise<void> {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  await saveQueue(dir, { items: [{ id, kind: "build", status: "running" }] });
}

function cleanScores() {
  return {
    layout: 1,
    palette: 0,
    edge: [0, 0, 0, 0, 0, 0],
    width: 320,
    height: 68,
    shotWidth: 1440,
    leftInk: 40,
    rightInk: 40,
  };
}

function blockingFault(): CompFault {
  return {
    view: "desktop",
    area: "hero",
    fault: "The hero sits too low.",
    expected: "The hero fills the top of the page.",
    fix: "Move the hero up.",
    blocking: true,
  };
}

function result(code: number): BuildSpawnResult {
  return { code, stdout: "ok\n", stderr: "", errorCode: null };
}

test("a blocking vision fault sends one fix turn, then a reshoot", async () => {
  const dir = tempDir();
  const sketch = approveHome(dir);
  writePrompt(dir, "003", pagePrompt());
  await queueItem(dir, "003");
  const shoots: string[] = [];
  const thinks: number[] = [];
  const reruns: CompFixTurn[] = [];
  let closed = 0;
  try {
    const gate = await runCompGate(dir, "003", null, {
      now: () => new Date(WHEN),
      preview: async () => ({
        url: "http://127.0.0.1:4311/",
        port: 4311,
        close: async () => {
          closed += 1;
        },
      }),
      shoot: async (req) => {
        shoots.push(req.view);
        return { width: req.viewport.width, height: req.viewport.height };
      },
      compare: async () => cleanScores(),
      think: async () => {
        thinks.push(1);
        return thinks.length === 1 ? { faults: [blockingFault()] } : { faults: [] };
      },
      rerun: async (turn) => {
        reruns.push(turn);
      },
    });
    assert.equal(gate.status, "clean");
    assert.equal(shoots.length, 2);
    assert.equal(reruns.length, 1);
    assert.match(reruns[0]?.text ?? "", /Comp compare failed\./);
    assert.match(reruns[0]?.text ?? "", /The hero sits too low/);
    assert.match(reruns[0]?.text ?? "", new RegExp(sketch.replaceAll(".", "\\.")));
    assert.equal(closed, 1);
    const queue = await loadQueue(dir);
    assert.equal(queue?.pause, undefined);
    assert.equal(queue?.items[0]?.status, "running");
  } finally {
    removeTempDir(dir);
  }
});

test("out of rounds pauses with the composites", async () => {
  const dir = tempDir();
  approveHome(dir);
  writePrompt(dir, "003", pagePrompt());
  await queueItem(dir, "003");
  const shoots: string[] = [];
  const reruns: CompFixTurn[] = [];
  let closed = 0;
  try {
    const gate = await runCompGate(dir, "003", null, {
      now: () => new Date(WHEN),
      preview: async () => ({
        url: "http://127.0.0.1:4311/",
        port: 4311,
        close: async () => {
          closed += 1;
        },
      }),
      shoot: async () => {
        shoots.push("desktop");
        return { width: 1440, height: 810 };
      },
      compare: async () => cleanScores(),
      think: async () => ({ faults: [blockingFault()] }),
      rerun: async (turn) => {
        reruns.push(turn);
      },
    });
    assert.equal(gate.status, "paused");
    assert.match(gate.reason, /does not match the approved sketch/);
    assert.equal(shoots.length, 2);
    assert.equal(reruns.length, 1);
    assert.equal(closed, 1);
    assert.ok(gate.composites.includes("qa/compare/003/desktop.jpg"));
    const queue = await loadQueue(dir);
    assert.equal(queue?.pause?.reason, "comp-mismatch");
    assert.equal(queue?.pause?.at, WHEN);
    assert.ok(queue?.pause?.composites?.includes("qa/compare/003/desktop.jpg"));
    assert.equal(queue?.items[0]?.status, "paused");
  } finally {
    removeTempDir(dir);
  }
});

test("a setup prompt skips with a logged reason and does not pause", async () => {
  const dir = tempDir();
  writePrompt(dir, "001", setupPrompt());
  await queueItem(dir, "001");
  const lines: string[] = [];
  let opened = 0;
  try {
    const gate = await runCompGate(dir, "001", null, {
      log: (line) => lines.push(line),
      preview: async () => {
        opened += 1;
        return { url: "http://127.0.0.1:4311/", port: 4311, close: async () => undefined };
      },
    });
    assert.equal(gate.status, "skipped");
    assert.match(gate.reason, /does not own a page/);
    assert.match(lines.join("\n"), /does not own a page/);
    assert.equal(opened, 0);
    const queue = await loadQueue(dir);
    assert.equal(queue?.pause, undefined);
    assert.equal(queue?.items[0]?.status, "running");
    const faults = readFileSync(path.join(dir, "qa", "compare", "001", "faults.md"), "utf8");
    assert.match(faults, /does not own a page/);
  } finally {
    removeTempDir(dir);
  }
});

test("the compare fix block names the sketch and is not a surface rerun", () => {
  const reason = "Comp compare failed.\nThe hero sits too low.\nSketch: reference/renders/home.png";
  const text = formatFixBeforeFinish([], reason);
  assert.match(text, /The hero sits too low/);
  assert.match(text, /reference\/renders\/home\.png/);
  assert.match(text, /Match the approved sketch/);
  assert.equal(isSurfaceCloseReason(reason), false);
  assert.equal(isCompCompareCloseReason(reason), true);
});

test("compare floors fill in when design only sets the reference count", () => {
  const parsed = parseConfig({ design: { minReferenceImages: 4 } });
  assert.equal(parsed.design.minReferenceImages, 4);
  assert.equal(parsed.design.compare.layoutMin, 0.55);
  assert.equal(parsed.design.compare.paletteMax, 18);
  assert.equal(parsed.design.compare.edgeMax, 0.45);
  assert.equal(parsed.design.compare.rounds, 2);
  assert.equal(parsed.design.compare.motionBlocking, false);
  assert.throws(() => parseConfig({ design: { compare: { nope: true } } }), ConfigError);
});

test("the desk port is refused and a broken compare pauses without a fix", async () => {
  const dir = tempDir();
  approveHome(dir);
  writePrompt(dir, "003", pagePrompt());
  await queueItem(dir, "003");
  let closed = 0;
  let shoots = 0;
  const reruns: CompFixTurn[] = [];
  try {
    const refused = await runCompGate(dir, "003", null, {
      now: () => new Date(WHEN),
      preview: async () => ({
        url: "http://127.0.0.1:4175/",
        port: 4175,
        close: async () => {
          closed += 1;
        },
      }),
      shoot: async () => {
        shoots += 1;
        return { width: 1440, height: 810 };
      },
      compare: async () => cleanScores(),
      think: async () => ({ faults: [] }),
      rerun: async (turn) => {
        reruns.push(turn);
      },
    });
    assert.equal(refused.status, "paused");
    assert.equal(shoots, 0);
    assert.equal(reruns.length, 0);
    assert.equal(closed, 1);
    assert.equal((await loadQueue(dir))?.pause?.reason, "comp-mismatch");

    let closedAgain = 0;
    const broken = await runCompGate(dir, "003", null, {
      now: () => new Date(WHEN),
      preview: async () => ({
        url: "http://127.0.0.1:4311/",
        port: 4311,
        close: async () => {
          closedAgain += 1;
        },
      }),
      shoot: async () => ({ width: 1440, height: 810 }),
      compare: async () => {
        throw new Error("compare broke");
      },
      think: async () => ({ faults: [] }),
      rerun: async (turn) => {
        reruns.push(turn);
      },
    });
    assert.equal(broken.status, "paused");
    assert.match(broken.reason, /could not finish/);
    assert.equal(reruns.length, 0);
    assert.equal(closedAgain, 1);
    assert.equal((await loadQueue(dir))?.pause?.reason, "comp-mismatch");
  } finally {
    removeTempDir(dir);
  }
});

test("an old pause still loads, and a compare pause keeps its pictures", async () => {
  const dir = tempDir();
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  try {
    await saveQueue(dir, {
      items: [{ id: "003", kind: "build", status: "paused" }],
      pause: { at: WHEN, after: "" },
    });
    const plain = await loadQueue(dir);
    assert.equal(plain?.pause?.reason, undefined);
    assert.equal(plain?.pause?.composites, undefined);
    await saveQueue(dir, {
      items: [{ id: "003", kind: "build", status: "paused" }],
      pause: { at: WHEN, after: "", reason: "comp-mismatch", composites: ["qa/compare/003/desktop.jpg"] },
    });
    const loaded = await loadQueue(dir);
    assert.equal(loaded?.pause?.reason, "comp-mismatch");
    assert.deepEqual(loaded?.pause?.composites, ["qa/compare/003/desktop.jpg"]);
  } finally {
    removeTempDir(dir);
  }
});

test("a setup close logs the skip and does not open a preview", async () => {
  const dir = tempDir();
  const lines: string[] = [];
  let opened = 0;
  const spawn: BuildSpawn = (request) => {
    request.onOutput?.("ok\n");
    return { pid: 424242, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  setCompGateDeps(dir, {
    log: (line) => lines.push(line),
    preview: async () => {
      opened += 1;
      return { url: "http://127.0.0.1:4311/", port: 4311, close: async () => undefined };
    },
  });
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
    writePrompt(dir, "001", setupPrompt());
    await saveQueue(dir, { items: [{ id: "001", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    assert.equal((await loadQueue(dir))?.items[0]?.status, "passed");
    assert.equal((await loadQueue(dir))?.pause, undefined);
    assert.match(lines.join("\n"), /does not own a page/);
    assert.equal(opened, 0);
    assert.equal(readBuildRun(dir)?.status, "passed");
  } finally {
    await siteBuildSettled(dir);
    setCompGateDeps(dir, null);
    clearProjectBuildRunner(dir);
    resetSiteBuildWatch(dir);
    removeTempDir(dir);
  }
});

test("the close sends the fault and the sketch into the fix spawn, then passes", async () => {
  const dir = tempDir();
  const sketch = approveHome(dir);
  writePrompt(dir, "003", pagePrompt());
  await saveQueue(dir, { items: [{ id: "003", kind: "build", status: "queued" }] });
  const prompts: string[] = [];
  let compares = 0;
  let opened = 0;
  let closed = 0;
  const spawn: BuildSpawn = (request) => {
    const index = request.args.indexOf("--prompt-file");
    const file = request.args[index + 1] ?? "";
    prompts.push(readFileSync(file, "utf8"));
    request.onOutput?.("ok\n");
    return { pid: 424242, done: Promise.resolve(result(0)) };
  };
  setProjectBuildRunner(dir, spawn);
  setCompGateDeps(dir, {
    preview: async () => {
      opened += 1;
      return {
        url: "http://127.0.0.1:4311/",
        port: 4311,
        close: async () => {
          closed += 1;
        },
      };
    },
    shoot: async () => ({ width: 1440, height: 810 }),
    compare: async () => {
      compares += 1;
      return compares === 1 ? { ...cleanScores(), layout: 0.1 } : cleanScores();
    },
    think: async () => ({ faults: [] }),
  });
  try {
    await ensureSiteBuild(dir);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1] ?? "", /Comp compare failed\./);
    assert.match(prompts[1] ?? "", /layout does not match the sketch/);
    assert.match(prompts[1] ?? "", new RegExp(sketch.replaceAll(".", "\\.")));
    assert.match(prompts[1] ?? "", /Match the approved sketch/);
    assert.equal(compares, 2);
    assert.equal(opened, 1);
    assert.equal(closed, 1);
    const queue = await loadQueue(dir);
    assert.equal(queue?.items[0]?.status, "passed");
    assert.equal(queue?.pause, undefined);
  } finally {
    await siteBuildSettled(dir);
    setCompGateDeps(dir, null);
    clearProjectBuildRunner(dir);
    resetSiteBuildWatch(dir);
    removeTempDir(dir);
  }
});
