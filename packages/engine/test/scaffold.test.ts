import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { LockHeld, STATE_LOCK_NAME } from "../src/lock.ts";
import { ScaffoldError, scaffoldProject, type ProjectInfo } from "../src/spec/scaffold.ts";
import { TemplateError } from "../src/templates.ts";

const PHASE_DIRS = [
  "01-dont-panic",
  "02-babel-fish",
  "03-deep-thought",
  "04-improbability-drive",
  "05-mostly-harmless",
  "06-so-long",
] as const;

const SPINE = ["PROJECT.md", "REQUIREMENTS.md", "ROADMAP.md", "STATE.md"] as const;

const CLOCK = () => Date.parse("2026-01-15T15:04:05.000Z");

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-scaffold-"));
}

function info(overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: "Night Stall",
    siteWhy: "The stall exists so regulars can find the tea.",
    hosting: "Hostinger",
    now: CLOCK,
    ...overrides,
  };
}

function readSpine(dir: string, name: (typeof SPINE)[number]): string {
  return readFileSync(path.join(dir, ".hitchhiker", name), "utf8");
}

function tableDataRows(markdown: string): string[] {
  return markdown.split("\n").filter((line) => {
    if (!line.startsWith("|")) return false;
    if (line.includes("---")) return false;
    if (line === "| Requirement | Phase | Status |") return false;
    if (line === "| Feature | Reason |") return false;
    return true;
  });
}

function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = end.length === 0 ? text.length : text.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing ${start}`);
  assert.ok(to > from, `missing end after ${start}`);
  return text.slice(from, to);
}

test("a fresh directory gets four spine files, six phase dirs, and no PRD", async () => {
  const dir = tempDir();
  try {
    const written = await scaffoldProject(dir, info());
    assert.deepEqual(
      written,
      SPINE.map((name) => path.join(".hitchhiker", name)),
    );

    for (const name of SPINE) {
      const raw = readSpine(dir, name);
      assert.equal(raw.includes("\r"), false);
      assert.equal(raw.includes("{{"), false);
      assert.equal(raw.includes(".planning"), false);
      assert.equal(
        existsSync(path.join(dir, ".hitchhiker", `${name}.tmp-${process.pid}`)),
        false,
      );
    }

    const project = readSpine(dir, "PROJECT.md");
    assert.match(project, /^# Night Stall\n/);
    assert.match(project, /## What This Is\n\nThe stall exists so regulars can find the tea\./);
    assert.match(project, /## Core Value\n\nThe stall exists so regulars can find the tea\./);
    assert.match(project, /## Constraints\n\n- \*\*Hosting\*\*: Hostinger/);
    assert.match(project, /\*Last updated: 2026-01-15 after scaffold\*/);
    assert.equal(project.includes("[Requirement 1]"), false);

    const requirements = readSpine(dir, "REQUIREMENTS.md");
    assert.match(requirements, /# Requirements: Night Stall/);
    assert.match(requirements, /\| Requirement \| Phase \| Status \|/);
    assert.match(requirements, /\| Feature \| Reason \|/);
    assert.deepEqual(tableDataRows(requirements), []);
    assert.equal(requirements.includes("AUTH-01"), false);
    assert.match(requirements, /Ids only\. None yet\./);
    assert.match(requirements, /v1 requirements: 0 total/);

    const roadmap = readSpine(dir, "ROADMAP.md");
    for (const heading of [
      "## Overview",
      "## Phases",
      "## Phase Details",
      "## Progress",
      "**Goal**",
      "**Depends on**",
      "**Requirements**",
      "**Success Criteria**",
      "**Plans**",
      "| Phase | Plans Complete | Status | Completed |",
      "**Phase Numbering:**",
      "**Execution Order:**",
    ]) {
      assert.ok(roadmap.includes(heading), heading);
    }
    assert.equal(/\[[xX]\]/.test(roadmap), false);
    assert.equal(roadmap.includes("Scaffold the MIT monorepo"), false);
    assert.equal(roadmap.includes("Port GSD spine"), false);
    assert.equal(roadmap.includes("hh-build-plan"), false);
    const boxes = roadmap.match(/- \[ \]/g) ?? [];
    assert.equal(boxes.length, 37);

    const dontPanic = between(roadmap, "### Phase 1: Don't Panic", "### Phase 2: Babel Fish");
    assert.match(dontPanic, /Towel Check: prompt range TBD/);
    assert.match(dontPanic, /Guide Entry: prompt range TBD/);
    assert.equal(dontPanic.includes("Heart of Gold"), false);

    const babel = between(roadmap, "### Phase 2: Babel Fish", "### Phase 3: Deep Thought");
    assert.match(babel, /Heart of Gold: prompt range TBD/);
    assert.equal(babel.includes("Infinite Improbability"), false);

    const drive = between(
      roadmap,
      "### Phase 4: Improbability Drive",
      "### Phase 5: Mostly Harmless",
    );
    assert.match(drive, /Infinite Improbability: prompt range TBD/);
    assert.match(drive, /Magrathea: prompt range TBD/);

    const farewell = between(roadmap, "### Phase 6: So Long and Thanks for All the Fish", "");
    assert.match(farewell, /Share and Enjoy: prompt range TBD/);
    assert.match(farewell, /Not started/);

    const state = readSpine(dir, "STATE.md");
    assert.match(state, /Phase: 3 of 6 \(Deep Thought\)/);
    assert.match(state, /Slice: Seven and a Half Million Years/);
    assert.match(state, /Prompt id: scaffold/);
    assert.match(state, /Next action: Write the PRD/);
    assert.match(state, /Last activity: 2026-01-15 scaffolded project files/);
    assert.match(state, /gsd_state_version/);
    assert.ok(state.split("\n").length <= 100);

    assert.deepEqual(
      readdirSync(path.join(dir, ".hitchhiker", "phases")).sort(),
      [...PHASE_DIRS].sort(),
    );
    for (const phase of PHASE_DIRS) {
      assert.equal(statSync(path.join(dir, ".hitchhiker", "phases", phase)).isDirectory(), true);
    }
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "PRD.md")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "config.json")), false);
    assert.equal(existsSync(path.join(dir, ".planning")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the date is the UTC day from the injected clock", async () => {
  const dir = tempDir();
  try {
    await scaffoldProject(
      dir,
      info({ now: () => Date.parse("2026-01-15T23:30:00.000Z") }),
    );
    assert.match(readSpine(dir, "PROJECT.md"), /2026-01-15/);
    assert.match(readSpine(dir, "STATE.md"), /2026-01-15/);
    assert.match(readSpine(dir, "REQUIREMENTS.md"), /2026-01-15/);
    assert.equal(readSpine(dir, "PROJECT.md").includes("2026-01-16"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an omitted clock still writes a UTC day", async () => {
  const dir = tempDir();
  const before = new Date().toISOString().slice(0, 10);
  try {
    await scaffoldProject(dir, info({ now: undefined }));
    const after = new Date().toISOString().slice(0, 10);
    const project = readSpine(dir, "PROJECT.md");
    assert.ok(project.includes(before) || project.includes(after));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("empty siteWhy, empty hosting, and a newline in the name write nothing", async () => {
  const cases: Partial<ProjectInfo>[] = [
    { siteWhy: "" },
    { siteWhy: "   " },
    { siteWhy: "\n" },
    { hosting: "" },
    { hosting: "  \t" },
    { name: "Night\nStall" },
    { name: "Night\r\nStall" },
    { siteWhy: "one line\nand another" },
  ];
  for (const overrides of cases) {
    const dir = tempDir();
    try {
      await assert.rejects(
        () => scaffoldProject(dir, info(overrides)),
        (error: unknown) => {
          assert.ok(error instanceof ScaffoldError);
          return true;
        },
      );
      assert.equal(existsSync(path.join(dir, ".hitchhiker")), false);
      assert.equal(existsSync(path.join(dir, ".planning")), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test("an existing .planning directory blocks the scaffold and stays put", async () => {
  const dir = tempDir();
  const planning = path.join(dir, ".planning");
  const marker = path.join(planning, "PROJECT.md");
  const nested = path.join(planning, "nested", "note.txt");
  try {
    mkdirSync(path.dirname(nested), { recursive: true });
    writeFileSync(marker, "keep-this-planning\n", "utf8");
    writeFileSync(nested, "also-keep\n", "utf8");

    await assert.rejects(
      () => scaffoldProject(dir, info()),
      (error: unknown) => {
        assert.ok(error instanceof ScaffoldError);
        assert.match(error.message, /acknowledgeForeignPlanning/);
        return true;
      },
    );
    await assert.rejects(
      () => scaffoldProject(dir, info({ acknowledgeForeignPlanning: false })),
      (error: unknown) => error instanceof ScaffoldError,
    );

    assert.equal(existsSync(path.join(dir, ".hitchhiker")), false);
    assert.equal(readFileSync(marker, "utf8"), "keep-this-planning\n");
    assert.equal(readFileSync(nested, "utf8"), "also-keep\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("acknowledging .planning writes .hitchhiker and does not touch the foreign tree", async () => {
  const dir = tempDir();
  const planning = path.join(dir, ".planning");
  const marker = path.join(planning, "PROJECT.md");
  try {
    mkdirSync(planning, { recursive: true });
    writeFileSync(marker, "keep-this-planning\n", "utf8");

    await scaffoldProject(dir, info({ acknowledgeForeignPlanning: true }));

    assert.equal(readFileSync(marker, "utf8"), "keep-this-planning\n");
    assert.deepEqual(readdirSync(planning), ["PROJECT.md"]);
    assert.match(readSpine(dir, "PROJECT.md"), /The stall exists so regulars can find the tea/);
    assert.equal(readSpine(dir, "PROJECT.md").includes(".planning"), false);
    assert.match(readSpine(dir, "STATE.md"), /Deep Thought/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an existing PROJECT.md is left unchanged", async () => {
  const dir = tempDir();
  const project = path.join(dir, ".hitchhiker", "PROJECT.md");
  try {
    mkdirSync(path.dirname(project), { recursive: true });
    writeFileSync(project, "original project\n", "utf8");

    await assert.rejects(
      () => scaffoldProject(dir, info()),
      (error: unknown) => {
        assert.ok(error instanceof ScaffoldError);
        assert.match(error.message, /PROJECT\.md already exists/);
        return true;
      },
    );

    assert.equal(readFileSync(project, "utf8"), "original project\n");
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "REQUIREMENTS.md")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "ROADMAP.md")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "STATE.md")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "PRD.md")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a live state lock blocks the write", async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, ".hitchhiker", STATE_LOCK_NAME);
  try {
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
      "utf8",
    );

    await assert.rejects(
      () => scaffoldProject(dir, info()),
      (error: unknown) => {
        assert.ok(error instanceof LockHeld);
        assert.equal(error.pid, process.pid);
        return true;
      },
    );
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "PROJECT.md")), false);
    assert.equal(existsSync(lockPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a name that introduces a template token writes nothing", async () => {
  const dir = tempDir();
  try {
    await assert.rejects(
      () => scaffoldProject(dir, info({ name: "{{injected}}" })),
      (error: unknown) => error instanceof TemplateError,
    );
    assert.equal(existsSync(path.join(dir, ".hitchhiker")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffoldProject renders the four spine templates under one state lock", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/spec/scaffold.ts", import.meta.url)),
    "utf8",
  );
  assert.equal(source.match(/renderTemplate\(/g)?.length, 4);
  assert.match(source, /renderTemplate\(\s*"project"/);
  assert.match(source, /renderTemplate\(\s*"requirements"/);
  assert.match(source, /renderTemplate\(\s*"roadmap"/);
  assert.match(source, /renderTemplate\(\s*"state"/);
  assert.match(source, /project_name/);
  assert.equal(source.match(/withStateLock\(/g)?.length, 1);
  assert.match(source, /replaceViaTemp/);
  assert.equal(source.includes("PRD.md"), false);
});
