import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../src/config.ts";
import { loadProjectFile, restoreProject } from "../src/project-file/index.ts";
import { removeTempDir } from "./remove-temp.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const samplePath = path.join(root, "samples", "towel-day.hhproject");

test("the towel sample loads through the project file loader", async () => {
  const raw = readFileSync(samplePath, "utf8");
  assert.equal(raw.includes("!"), false);
  assert.doesNotMatch(raw, /sk-|xai-|password|bearer|api[_-]?key/i);
  assert.doesNotMatch(raw, /[A-Za-z]:\\/);
  assert.doesNotMatch(raw, /\/Users\/|\/home\/|\\\\Users\\\\/);
  const loaded = await loadProjectFile(samplePath);
  assert.equal(loaded.source, "file");
  assert.equal(loaded.readOnly, false);
  assert.equal(loaded.file?.schemaVersion, 1);
  assert.equal(loaded.file?.projectId, "sample-towel-day");
  assert.equal(loaded.file?.projectName, "Mostly Towels");
  assert.equal(loaded.file?.sourceDir, ".");
  assert.equal(loaded.file?.interview.currentQuestionId, "DP-0.2");
  assert.equal(loaded.file?.interview.answers[0]?.value, "For a client who sells towels.");
  assert.equal(loaded.file?.brief.approval.approved, false);
  assert.equal(loaded.file?.elevate.approved, false);
  assert.equal(loaded.file?.hostinger.approved, false);
  assert.equal(loaded.file?.snapshot.some((item) => item.path === "config.json"), false);
  assert.equal(loaded.file?.snapshot.some((item) => item.path === "interview.json"), true);

  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-sample-"));
  try {
    const restored = await restoreProject(samplePath, { projectDir: dir, prefer: "file" });
    assert.equal(restored.kept, "file");
    assert.equal(restored.questionId, "DP-0.2");
    const interview = await readFile(path.join(dir, ".hitchhiker", "interview.json"), "utf8");
    assert.match(interview, /For a client who sells towels\./);
    const brief = await readFile(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), "utf8");
    assert.match(brief, /Mostly Towels/);
    assert.equal(interview.includes("brief-yes"), false);
  } finally {
    await removeTempDir(dir);
  }
});

test("a project file without tourSeen still parses", () => {
  const parsed = parseConfig({});
  assert.equal(parsed.tourSeen, false);
  const again = parseConfig({ tourSeen: true });
  assert.equal(again.tourSeen, true);
});
