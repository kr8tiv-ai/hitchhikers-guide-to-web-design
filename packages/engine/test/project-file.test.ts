import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { openInterview, saveState, type GuideState } from "../src/index.ts";
import {
  loadProjectFile,
  locateProjectFile,
  migrate,
  projectHome,
  recordApprovalYes,
  renderResumeMd,
  renderResumePrompt,
  restoreProject,
  sanitizeProjectName,
  saveProjectFile,
  type ProjectDraft,
} from "../src/project-file/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "fixtures");

const SK = "sk-plantedkey12345678";
const XAI = "xai-plantedkey12345678";
const BEARER = "Bearer plantedtoken123456";
const ENV_LINE = "XAI_API_KEY=planted-env-value";
const PLANTS = [SK, XAI, "plantedtoken123456", "planted-env-value"];

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function stateFor(promptId: string, updatedAt: string): GuideState {
  const question = promptId.startsWith("interview:") ? promptId.slice("interview:".length) : promptId;
  return {
    phase: "Don't Panic",
    slice: "Towel",
    promptId,
    lastGoodCommit: "",
    blockers: [],
    nextAction: `Answer ${question}.`,
    updatedAt,
  };
}

async function seed(dir: string, promptId: string, updatedAt = "2020-01-01T00:00:00.000Z"): Promise<void> {
  await saveState(dir, stateFor(promptId, updatedAt));
}

function towelDraft(): ProjectDraft {
  return {
    schemaVersion: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    savedAt: "2026-01-02T00:00:00.000Z",
    app: { name: "The Hitchhiker's Guide to Web Design", version: "0.0.0" },
    projectId: "p-towel",
    projectName: "Towel Desk",
    sourceDir: "C:\\Projects\\Towel Desk",
    interview: {
      answers: [
        { id: "DP-0.1", status: "ANSWERED", value: "For a client.", assumption: false },
        { id: "DP-2.1", status: "ANSWERED", value: "A towel shop.", assumption: false },
        { id: "DP-5.3", status: "SUGGESTED", value: "Quiet and dry.", assumption: true },
      ],
      currentQuestionId: "DP-0.2",
      index: 2,
      total: 40,
    },
    brief: { body: null, approval: { approved: false, at: null } },
    brand: { body: null, sections: {}, approval: { approved: false, at: null } },
    prd: { body: null, approval: { approved: true, at: "2026-01-02T00:00:00.000Z" } },
    promptPackage: { body: null, approval: { approved: false, at: null } },
    elevate: { approved: false, at: null },
    hostinger: { approved: false, at: null },
    queue: { items: [], lastDone: "", currentPrompt: null, blockers: [] },
    state: stateFor("interview:DP-0.2", "2026-01-02T00:00:00.000Z"),
    git: { present: false, branch: null, head: null, lastGoodCommit: null, remoteUrl: null },
    settings: { voiceEngine: "browser" },
    voice: "browser",
    uploads: [],
    references: [],
    snapshot: [],
  };
}

test("sanitizeProjectName keeps spaces and non-ASCII and rewrites reserved names", () => {
  assert.equal(sanitizeProjectName("Café Towel"), "Café Towel");
  assert.equal(sanitizeProjectName("path with spaces"), "path with spaces");
  assert.equal(sanitizeProjectName("CON"), "CON project");
  assert.equal(sanitizeProjectName("con.txt"), "con.txt project");
  assert.equal(sanitizeProjectName("COM1"), "COM1 project");
  assert.equal(sanitizeProjectName("lpt9"), "lpt9 project");
  assert.equal(sanitizeProjectName("PRN"), "PRN project");
  assert.equal(sanitizeProjectName("Towel..."), "Towel");
  assert.equal(sanitizeProjectName("Towel "), "Towel");
  assert.equal(sanitizeProjectName(".hidden"), "hidden");
  assert.equal(sanitizeProjectName("A/B\\C:D"), "A B C D");
  assert.equal(sanitizeProjectName("   "), "project");
  assert.equal(sanitizeProjectName(""), "project");
  const long = sanitizeProjectName("é".repeat(120));
  assert.ok(long.length <= 80);
  assert.ok(long.startsWith("é"));
});

test("a missing Desktop writes in the home folder and does not create Desktop", async () => {
  const root = await tempDir("hh-desk-");
  try {
    const home = path.join(root, "home");
    const located = await locateProjectFile("Towel", { homeDir: home });
    assert.equal(located.filePath, path.join(home, "Towel.hhproject"));
    assert.equal(located.note, `Desktop is not available. The project file is in ${home}.`);
    assert.equal(existsSync(path.join(home, "Desktop")), false);
    assert.equal(existsSync(path.join(home, "OneDrive")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an OneDrive Desktop is used when it is the only Desktop under home", async () => {
  const root = await tempDir("hh-onedrive-");
  try {
    const home = path.join(root, "home");
    const desktop = path.join(home, "OneDrive", "Desktop");
    await mkdir(desktop, { recursive: true });
    const located = await locateProjectFile("Café Towel", { homeDir: home });
    assert.equal(located.note, null);
    assert.equal(located.filePath, path.join(desktop, "Café Towel.hhproject"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Windows paths with spaces, non-ASCII, and a reserved name round-trip", async () => {
  const root = await tempDir("hh-winpath-");
  try {
    const spaced = path.join(root, "path with spaces", "カフェ Café");
    const project = path.join(spaced, "the site");
    const home = path.join(root, "home");
    await mkdir(project, { recursive: true });
    await seed(project, "interview:DP-0.2");
    const saved = await saveProjectFile(project, {
      to: spaced,
      projectName: "CON",
      homeDir: home,
      now: new Date("2026-03-01T00:00:00.000Z"),
    });
    assert.equal(path.basename(saved.filePath), "CON project.hhproject");
    assert.equal(path.dirname(saved.filePath), path.resolve(spaced));
    const named = await saveProjectFile(project, {
      to: path.join(spaced, "named"),
      projectName: "Café Towel",
      homeDir: home,
    });
    assert.equal(path.basename(named.filePath), "Café Towel.hhproject");
    const loaded = await loadProjectFile(saved.filePath);
    assert.equal(loaded.source, "file");
    assert.equal(loaded.readOnly, false);
    assert.equal(loaded.file?.interview.currentQuestionId, "DP-0.2");
    assert.equal(loaded.file?.state?.promptId, "interview:DP-0.2");
    if (process.platform === "win32") {
      assert.match(saved.filePath, /path with spaces/);
      assert.match(saved.filePath, /カフェ Café/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume text matches the secret-free fixtures", () => {
  const draft = towelDraft();
  const filePath = "C:\\Users\\towel\\Desktop\\Towel Desk.hhproject";
  const md = renderResumeMd(draft, filePath);
  const prompt = renderResumePrompt(draft, filePath);
  const expectedMd = readFileSync(path.join(fixtures, "resume-towel.md"), "utf8");
  const expectedPrompt = readFileSync(path.join(fixtures, "resume-prompt.txt"), "utf8");
  assert.equal(normalize(md), normalize(expectedMd));
  assert.equal(normalize(prompt), normalize(expectedPrompt));
  const packed = `${md}\n${prompt}`;
  assert.equal(packed.includes("!"), false);
  assert.equal(packed.toLowerCase().includes("grok"), false);
  assert.equal(packed.toLowerCase().includes("claude"), false);
  assert.match(md, /Keep them marked as assumptions/);
  assert.match(md, /pnpm exec hh resume/);
});

test("a planted key never appears in the project file, RESUME.md, or the resume prompt", async () => {
  const root = await tempDir("hh-secret-");
  try {
    const project = path.join(root, "site");
    const home = path.join(root, "home");
    await mkdir(path.join(project, ".hitchhiker"), { recursive: true });
    await saveState(project, {
      ...stateFor("interview:DP-0.2", "2020-01-01T00:00:00.000Z"),
      blockers: [BEARER],
      nextAction: `Answer DP-0.2. ${SK}`,
    });
    await writeFile(
      path.join(project, ".hitchhiker", "interview.json"),
      `${JSON.stringify({
        version: 1,
        answers: [
          { id: "DP-0.1", status: "ANSWERED", value: XAI },
          { id: "DP-5.3", status: "SUGGESTED", value: "Quiet and dry." },
          { id: "DP-5.4", status: "SKIPPED", value: "Skipped on purpose." },
        ],
        cursor: 1,
        pushedIds: [],
      })}\n`,
    );
    await writeFile(
      path.join(project, ".hitchhiker", "SITE-BRIEF.md"),
      `# Brief\n\n${ENV_LINE}\n`,
    );
    await writeFile(
      path.join(project, ".hitchhiker", "config.json"),
      `${JSON.stringify({
        voiceEngine: "browser",
        tokenBudget: 42,
        apiKey: SK,
        password: "hunter2-planted",
      })}\n`,
    );
    const saved = await saveProjectFile(project, {
      homeDir: home,
      to: path.join(home, "Towel.hhproject"),
      projectName: `Shop ${SK}`,
    });
    const raw = await readFile(saved.filePath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    assert.equal(typeof parsed, "object");
    for (const plant of PLANTS) {
      assert.equal(raw.includes(plant), false, plant);
    }
    assert.equal(raw.includes("hunter2-planted"), false);
    assert.match(raw, /\[redacted\]/);
    assert.match(raw, /"tokenBudget": 42/);
    assert.match(raw, /Do not put secrets/);
    const file = parsed as {
      resumeMd: string;
      resumePrompt: string;
      settings: Record<string, unknown>;
      interview: { answers: { id: string; assumption: boolean; status: string }[] };
      projectName: string;
    };
    for (const plant of PLANTS) {
      assert.equal(file.resumeMd.includes(plant), false);
      assert.equal(file.resumePrompt.includes(plant), false);
    }
    assert.equal(file.settings.tokenBudget, 42);
    assert.equal(file.settings.voiceEngine, "browser");
    assert.equal(Object.hasOwn(file.settings, "apiKey"), false);
    assert.equal(Object.hasOwn(file.settings, "password"), false);
    const suggested = file.interview.answers.find((item) => item.id === "DP-5.3");
    const skipped = file.interview.answers.find((item) => item.id === "DP-5.4");
    assert.equal(suggested?.assumption, true);
    assert.equal(suggested?.status, "SUGGESTED");
    assert.equal(skipped?.assumption, true);
    assert.equal(file.projectName.includes(SK), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("schema 0 migrates in memory and the fixture bytes stay", async () => {
  const root = await tempDir("hh-migrate-");
  try {
    const filePath = path.join(root, "Towel.hhproject");
    const raw = await readFile(path.join(fixtures, "project-v0.json"), "utf8");
    await writeFile(filePath, raw);
    const before = await readFile(filePath);
    const loaded = await loadProjectFile(filePath);
    const after = await readFile(filePath);
    assert.deepEqual(after, before);
    assert.equal(loaded.readOnly, false);
    assert.equal(loaded.source, "file");
    assert.equal(loaded.file?.schemaVersion, 1);
    assert.equal(loaded.file?.projectName, "Towel");
    assert.equal(loaded.file?.interview.currentQuestionId, "DP-0.2");
    assert.equal(loaded.file?.queue.lastDone, "7");
    assert.equal(loaded.file?.interview.answers[1]?.assumption, true);
    assert.equal(loaded.file?.brief.approval.approved, false);
    assert.equal(loaded.file?.elevate.approved, false);
    const direct = migrate(JSON.parse(raw) as unknown, 0, 1);
    assert.equal(direct.readOnly, false);
    assert.equal(direct.file?.schemaVersion, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a newer schema opens read-only and is not rewritten", async () => {
  const root = await tempDir("hh-newer-");
  try {
    const filePath = path.join(root, "Towel.hhproject");
    const body = `${JSON.stringify({ schemaVersion: 2, name: "Future" }, null, 2)}\n`;
    await writeFile(filePath, body);
    const before = statSync(filePath);
    const loaded = await loadProjectFile(filePath);
    const after = await readFile(filePath, "utf8");
    const stat = statSync(filePath);
    assert.equal(after, body);
    assert.equal(stat.mtimeMs, before.mtimeMs);
    assert.equal(loaded.readOnly, true);
    assert.equal(loaded.file, null);
    assert.match(loaded.message ?? "", /read-only/i);
    assert.equal(existsSync(`${filePath}.corrupt-`), false);
    const names = readdirSync(root);
    assert.equal(names.some((name) => name.includes(".corrupt-")), false);
    await assert.rejects(
      () => saveProjectFile(root, { to: filePath, homeDir: path.join(root, "home") }),
      /newer app/,
    );
    assert.equal(await readFile(filePath, "utf8"), body);
    const stepped = migrate({ schemaVersion: 2 }, 2, 1);
    assert.equal(stepped.readOnly, true);
    assert.equal(stepped.file, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a truncated file falls back to the backup and keeps the bad bytes", async () => {
  const root = await tempDir("hh-corrupt-");
  try {
    const project = path.join(root, "site");
    const home = path.join(root, "home");
    const filePath = path.join(home, "Towel.hhproject");
    await mkdir(project, { recursive: true });
    await seed(project, "interview:DP-0.2", "2020-01-01T00:00:00.000Z");
    await saveProjectFile(project, { to: filePath, homeDir: home, projectName: "Towel" });
    await seed(project, "interview:DP-0.3", "2020-06-01T00:00:00.000Z");
    await saveProjectFile(project, { to: filePath, homeDir: home, projectName: "Towel" });
    const backup = await readFile(`${filePath}.bak`, "utf8");
    assert.match(backup, /DP-0\.2/);
    const truncated = "{ \"schema";
    await writeFile(filePath, truncated);
    const loaded = await loadProjectFile(filePath, { liveDir: project });
    assert.equal(loaded.source, "backup");
    assert.match(loaded.message ?? "", /previous save/);
    assert.equal(loaded.file?.interview.currentQuestionId, "DP-0.2");
    assert.equal(existsSync(filePath), false);
    const quarantined = readdirSync(home).filter((name) => name.includes(".corrupt-"));
    assert.equal(quarantined.length, 1);
    const kept = quarantined[0];
    assert.ok(kept !== undefined);
    assert.equal(await readFile(path.join(home, kept), "utf8"), truncated);
    assert.equal(existsSync(`${filePath}.bak`), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a truncated file with no backup uses the live project folder", async () => {
  const root = await tempDir("hh-live-");
  try {
    const project = path.join(root, "site");
    const home = path.join(root, "home");
    const filePath = path.join(home, "Towel.hhproject");
    await mkdir(home, { recursive: true });
    await seed(project, "interview:DP-0.4", "2024-01-01T00:00:00.000Z");
    const truncated = "{\"schemaVersion\":";
    await writeFile(filePath, truncated);
    const loaded = await loadProjectFile(filePath, { liveDir: project });
    assert.equal(loaded.source, "live");
    assert.match(loaded.message ?? "", /project folder on disk/);
    assert.equal(loaded.file?.interview.currentQuestionId, "DP-0.4");
    const quarantined = readdirSync(home).filter((name) => name.includes(".corrupt-"));
    assert.equal(quarantined.length, 1);
    const kept = quarantined[0];
    assert.ok(kept !== undefined);
    assert.equal(await readFile(path.join(home, kept), "utf8"), truncated);
    assert.equal(existsSync(`${filePath}.bak`), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("backup rotation keeps the previous file and one older copy", async () => {
  const root = await tempDir("hh-bak-");
  try {
    const project = path.join(root, "site");
    const home = path.join(root, "home");
    const filePath = path.join(home, "Towel.hhproject");
    await mkdir(project, { recursive: true });
    await seed(project, "interview:DP-0.1", "2020-01-01T00:00:00.000Z");
    await saveProjectFile(project, { to: filePath, homeDir: home, projectName: "Towel" });
    await seed(project, "interview:DP-0.2", "2020-02-01T00:00:00.000Z");
    await saveProjectFile(project, { to: filePath, homeDir: home, projectName: "Towel" });
    await seed(project, "interview:DP-0.3", "2020-03-01T00:00:00.000Z");
    await saveProjectFile(project, { to: filePath, homeDir: home, projectName: "Towel" });
    const current = await readFile(filePath, "utf8");
    const bak = await readFile(`${filePath}.bak`, "utf8");
    const older = await readFile(`${filePath}.bak.1`, "utf8");
    assert.match(current, /DP-0\.3/);
    assert.match(bak, /DP-0\.2/);
    assert.match(older, /DP-0\.1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a second window stays read-only and a dead lock is taken over", async () => {
  const root = await tempDir("hh-lock-");
  try {
    const project = path.join(root, "site");
    const home = path.join(root, "home");
    const filePath = path.join(home, "Towel.hhproject");
    await mkdir(project, { recursive: true });
    await seed(project, "interview:DP-0.2", "2020-01-01T00:00:00.000Z");
    await saveProjectFile(project, {
      to: filePath,
      homeDir: home,
      projectName: "Towel",
      now: new Date("2020-01-01T00:00:00.000Z"),
    });
    const first = await readFile(filePath, "utf8");
    const lockPath = `${filePath}.lock`;
    writeFileSync(
      lockPath,
      `${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`,
    );
    await assert.rejects(
      () => saveProjectFile(project, { to: filePath, homeDir: home, projectName: "Towel" }),
      /Opened read-only/,
    );
    assert.equal(await readFile(filePath, "utf8"), first);
    const staleAt = new Date(Date.now() - 31_000).toISOString();
    writeFileSync(lockPath, `${JSON.stringify({ pid: 2147483646, acquiredAt: staleAt })}\n`);
    await seed(project, "interview:DP-0.3", "2021-01-01T00:00:00.000Z");
    const again = await saveProjectFile(project, { to: filePath, homeDir: home, projectName: "Towel" });
    assert.equal(again.filePath, filePath);
    assert.equal(existsSync(lockPath), false);
    const loaded = await loadProjectFile(filePath);
    assert.equal(loaded.file?.interview.currentQuestionId, "DP-0.3");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume keeps a newer live folder and never approves a closed gate", async () => {
  const root = await tempDir("hh-restore-");
  try {
    const project = path.join(root, "site");
    const home = path.join(root, "home");
    const filePath = path.join(home, "Towel.hhproject");
    await mkdir(path.join(project, ".hitchhiker"), { recursive: true });
    await seed(project, "interview:DP-0.2", "2020-01-01T00:00:00.000Z");
    await writeFile(
      path.join(project, ".hitchhiker", "elevate-yes.json"),
      `${JSON.stringify({ approved: true, at: "2020-01-01T00:00:00.000Z" })}\n`,
    );
    await saveProjectFile(project, {
      to: filePath,
      homeDir: home,
      projectName: "Towel",
      now: new Date("2020-01-02T00:00:00.000Z"),
    });
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as {
      elevate: { approved: boolean; at: string | null };
      brief: { approval: { approved: boolean } };
      git: {
        present: boolean;
        branch: string | null;
        head: string | null;
        lastGoodCommit: string | null;
        remoteUrl: string | null;
      };
    };
    parsed.elevate = { approved: false, at: null };
    parsed.git = {
      present: true,
      branch: "not-a-branch",
      head: "abc1234abc1234abc1234abc1234abc1234abc",
      lastGoodCommit: null,
      remoteUrl: null,
    };
    assert.equal(parsed.brief.approval.approved, false);
    await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`);
    await writeFile(
      path.join(project, ".hitchhiker", "brief-yes.json"),
      `${JSON.stringify({ approved: true, at: "2024-01-01T00:00:00.000Z" })}\n`,
    );
    await seed(project, "interview:DP-0.5", "2024-01-01T00:00:00.000Z");
    const kept = await restoreProject(filePath, { projectDir: project, prefer: "newer" });
    assert.equal(kept.kept, "live");
    assert.match(kept.message ?? "", /Kept the folder/);
    assert.equal((await readFile(path.join(project, ".hitchhiker", "STATE.md"), "utf8")).includes("DP-0.5"), true);
    const applied = await restoreProject(filePath, { projectDir: project, prefer: "file" });
    assert.equal(applied.kept, "file");
    assert.equal(applied.questionId, "DP-0.2");
    const state = await readFile(path.join(project, ".hitchhiker", "STATE.md"), "utf8");
    assert.match(state, /interview:DP-0\.2/);
    assert.equal(existsSync(path.join(project, ".hitchhiker", "brief-yes.json")), false);
    assert.equal(existsSync(path.join(project, ".hitchhiker", "elevate-yes.json")), false);
    assert.equal(existsSync(path.join(project, ".git")), false);
    assert.match(applied.gitNote ?? "", /Nothing in the git tree was changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

describe("autosave hooks", { concurrency: 1 }, () => {
  const prior = process.env.HH_PROJECT_HOME;

  test("a test run keeps the project file beside the project", () => {
    delete process.env.HH_PROJECT_HOME;
    try {
      const dir = path.join(os.tmpdir(), "hh-home-check");
      assert.equal(projectHome(dir), path.join(dir, ".hh-save-home"));
    } finally {
      if (prior === undefined) delete process.env.HH_PROJECT_HOME;
      else process.env.HH_PROJECT_HOME = prior;
    }
  });

  test("an interview answer autosaves the next question", async () => {
    const root = await tempDir("hh-answer-");
    const home = path.join(root, "home");
    process.env.HH_PROJECT_HOME = home;
    try {
      const session = await openInterview(root, "express");
      const saved = await session.command({ type: "answer", text: "For myself." });
      assert.equal(saved?.id, "DP-0.1");
      const names = readdirSync(home).filter((name) => name.endsWith(".hhproject"));
      assert.equal(names.length, 1);
      const fileName = names[0];
      assert.ok(fileName !== undefined);
      const loaded = await loadProjectFile(path.join(home, fileName));
      assert.equal(loaded.file?.interview.answers.some((item) => item.id === "DP-0.1" && item.value === "For myself."), true);
      assert.equal(loaded.file?.interview.currentQuestionId, "DP-0.2");
      assert.equal(loaded.file?.brief.approval.approved, false);
    } finally {
      if (prior === undefined) delete process.env.HH_PROJECT_HOME;
      else process.env.HH_PROJECT_HOME = prior;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("a failed autosave still stores the answer", async () => {
    const root = await tempDir("hh-fail-");
    const blocked = path.join(root, "not-a-directory");
    await writeFile(blocked, "x");
    process.env.HH_PROJECT_HOME = blocked;
    try {
      const session = await openInterview(root, "express");
      const saved = await session.command({ type: "answer", text: "For myself." });
      assert.equal(saved?.id, "DP-0.1");
      const interview = await readFile(path.join(root, ".hitchhiker", "interview.json"), "utf8");
      assert.match(interview, /For myself\./);
    } finally {
      if (prior === undefined) delete process.env.HH_PROJECT_HOME;
      else process.env.HH_PROJECT_HOME = prior;
      await rm(root, { recursive: true, force: true });
    }
  });

  test("an explicit yes autosaves that gate and leaves the others closed", async () => {
    const root = await tempDir("hh-yes-");
    const home = path.join(root, "home");
    process.env.HH_PROJECT_HOME = home;
    try {
      await seed(root, "interview:DP-0.2");
      await recordApprovalYes(root, "brief-yes.json", "2026-04-01T00:00:00.000Z");
      const names = readdirSync(home).filter((name) => name.endsWith(".hhproject"));
      assert.equal(names.length, 1);
      const fileName = names[0];
      assert.ok(fileName !== undefined);
      const loaded = await loadProjectFile(path.join(home, fileName));
      assert.equal(loaded.file?.brief.approval.approved, true);
      assert.equal(loaded.file?.brief.approval.at, "2026-04-01T00:00:00.000Z");
      assert.equal(loaded.file?.elevate.approved, false);
      assert.equal(loaded.file?.hostinger.approved, false);
      assert.equal(loaded.file?.prd.approval.approved, false);
      assert.equal(loaded.file?.promptPackage.approval.approved, false);
      assert.equal(existsSync(path.join(root, ".hitchhiker", "elevate-yes.json")), false);
    } finally {
      if (prior === undefined) delete process.env.HH_PROJECT_HOME;
      else process.env.HH_PROJECT_HOME = prior;
      await rm(root, { recursive: true, force: true });
    }
  });
});
