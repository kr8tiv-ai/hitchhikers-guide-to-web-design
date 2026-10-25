/**
 * BUG-068. Folder names such as desk-e2e-run11 must survive the project file.
 * Real token shapes still redact. Path fields stay byte-exact.
 */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { saveState, type GuideState } from "../src/index.ts";
import { loadProjectFile, saveProjectFile, scrubText, scrubValue, SECRET_PATTERN } from "../src/project-file/index.ts";

const FOLDER = "C:\\Users\\lucid\\Desktop\\desk-e2e-run11\\site";
const TOKEN_DIR = "C:\\Users\\lucid\\Desktop\\sk-abcdefgh12345\\site";
const SPACED = "C:\\Users\\lucid\\Desktop\\My Site\\sk-abcdefgh12345\\site";
const PLANTED = "sk-plantedkey12345678";

test("scrubText keeps ordinary words and windows paths and still redacts tokens", () => {
  assert.equal(scrubText(FOLDER), FOLDER);
  assert.equal(scrubText("task-12345678"), "task-12345678");
  assert.equal(scrubText("kiosk-abcdefgh"), "kiosk-abcdefgh");
  assert.equal(scrubText("disk-abcdefghij"), "disk-abcdefghij");
  assert.equal(scrubText("park-abcdefgh"), "park-abcdefgh");
  assert.equal(scrubText("sk-abcdefgh12345"), "[redacted]");
  assert.equal(scrubText("xai-ABCDEFGH1234"), "[redacted]");
  assert.equal(scrubText("key=sk-abcdefgh12345"), "key=[redacted]");
  assert.equal(scrubText(`${FOLDER} ${PLANTED}`), `${FOLDER} [redacted]`);
  assert.equal(scrubText(`pnpm exec hh app --project "${SPACED}"`), `pnpm exec hh app --project "${SPACED}"`);
  assert.equal(scrubText(`folder ${SPACED} end`, [SPACED]), `folder ${SPACED} end`);
  assert.equal(SECRET_PATTERN.test("desk-e2e-run11"), false);
  assert.equal(SECRET_PATTERN.test("task-12345678"), false);
  assert.equal(SECRET_PATTERN.test("kiosk-abcdefgh"), false);
  assert.equal(SECRET_PATTERN.test("sk-abcdefgh12345"), true);
  assert.equal(SECRET_PATTERN.test("xai-abcdefgh1234"), true);
  assert.equal(SECRET_PATTERN.test("key=sk-abcdefgh12345"), true);
});

test("scrubValue leaves path fields byte-exact and still redacts free text", () => {
  const cleaned = scrubValue({
    sourceDir: TOKEN_DIR,
    note: PLANTED,
    snapshot: [{ path: "sk-abcdefgh12345.md", text: `${TOKEN_DIR} and ${PLANTED}` }],
  }) as { sourceDir: string; note: string; snapshot: { path: string; text: string }[] };
  assert.equal(cleaned.sourceDir, TOKEN_DIR);
  assert.equal(cleaned.note, "[redacted]");
  assert.equal(cleaned.snapshot[0]?.path, "sk-abcdefgh12345.md");
  assert.equal(cleaned.snapshot[0]?.text, `${TOKEN_DIR} and [redacted]`);
});

test("a project saved under desk-e2e-run11 reopens with its folder intact", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hh-068-"));
  const project = path.join(root, "desk-e2e-run11", "site");
  const home = path.join(root, "home");
  try {
    await seed(project, `See ${project}. ${PLANTED}`);
    const saved = await saveProjectFile(project, { homeDir: home, projectName: "Desk Run" });
    const loaded = await loadProjectFile(saved.filePath);
    const raw = await readFile(saved.filePath, "utf8");
    assert.equal(loaded.file?.sourceDir, project);
    assert.equal(loaded.file?.resumeMd.includes(project), true);
    assert.equal(loaded.file?.resumePrompt.includes(saved.filePath), true);
    assert.equal(raw.includes(project.replace(/\\/g, "\\\\")), true);
    assert.equal(raw.includes("de[redacted]"), false);
    assert.equal(raw.includes(PLANTED), false);
    const brief = loaded.file?.snapshot.find((item) => item.path === "SITE-BRIEF.md");
    assert.equal(brief?.path, "SITE-BRIEF.md");
    assert.equal(brief?.text.includes(project), true);
    assert.equal(brief?.text.includes(PLANTED), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a real token inside the project folder stays in sourceDir, resume, and snapshot", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hh-068-token-"));
  const project = path.join(root, "sk-abcdefgh12345", "site");
  const home = path.join(root, "home");
  try {
    await seed(project, PLANTED);
    const saved = await saveProjectFile(project, { homeDir: home, projectName: "Token Folder" });
    const loaded = await loadProjectFile(saved.filePath);
    const raw = await readFile(saved.filePath, "utf8");
    assert.equal(loaded.file?.sourceDir, project);
    assert.equal(loaded.file?.resumeMd.includes(project), true);
    assert.equal(loaded.file?.resumePrompt.includes(saved.filePath), true);
    assert.equal(raw.includes(PLANTED), false);
    assert.equal(raw.includes(project.replace(/\\/g, "\\\\")), true);
    const brief = loaded.file?.snapshot.find((item) => item.path === "SITE-BRIEF.md");
    assert.equal(brief?.text.includes(project), true);
    assert.equal(brief?.text.includes(PLANTED), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function seed(project: string, secretLine: string): Promise<void> {
  const hitch = path.join(project, ".hitchhiker");
  await mkdir(hitch, { recursive: true });
  const state: GuideState = {
    phase: "Don't Panic",
    slice: "Towel",
    promptId: "interview:DP-0.2",
    lastGoodCommit: "",
    blockers: [],
    nextAction: `Answer DP-0.2. ${secretLine}`,
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
  await saveState(project, state);
  await writeFile(path.join(hitch, "SITE-BRIEF.md"), `# Brief\n\nFolder ${project}\n${secretLine}\n`);
}
