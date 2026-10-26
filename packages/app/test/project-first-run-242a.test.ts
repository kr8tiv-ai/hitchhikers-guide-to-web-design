/**
 * BUG-046 and BUG-050. A desk pointed at its own repo asks for a project.
 * Empty open, the repo, and a resume row whose source is the repo are refused.
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { saveProjectFile, saveState, upsertRecentProject } from "@hitchhiker/engine";
import { projectChrome } from "../src/server/project-desk.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("first run shows a project prompt and refuses the desk repo", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "hh-first-242a-"));
  const home = path.join(sandbox, ".hh-save-home");
  const priorHome = process.env.HH_PROJECT_HOME;
  const priorE2e = process.env.HH_E2E_PROJECT;
  process.env.HH_PROJECT_HOME = home;
  process.env.HH_E2E_PROJECT = sandbox;
  const interview = path.join(repo, ".hitchhiker", "interview.json");
  const before = existsSync(interview) ? statSync(interview).mtimeMs : null;
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({ projectDir: repo, open: false });
    const homePage = await request(handle.port, "GET", "/");
    assert.equal(homePage.status, 200);
    assert.match(homePage.body, /Start a project/);
    assert.match(homePage.body, /id="hh-new-name"/);
    assert.match(homePage.body, /id="hh-new-dir"/);
    assert.match(homePage.body, /Hitchhiker Sites/);
    assert.equal(homePage.body.includes("Question 1 of"), false);
    assert.equal(homePage.body.includes('data-question-id="DP-0.1"'), false);
    assert.equal(homePage.body.includes("No question yet."), false);
    assert.equal(homePage.body.includes("The open form did not include a path"), false);
    const token = tokenFrom(homePage.body);

    const empty = await request(handle.port, "POST", "/api/project/open", form({ csrf: token, path: "  " }));
    assert.equal(empty.status, 303);
    assert.match(empty.location, /open-error=choose/);
    const choose = await request(handle.port, "GET", empty.location);
    assert.match(choose.body, /Choose a project folder or \.hhproject file/);
    assert.equal(choose.body.includes("The open form did not include a path"), false);
    assert.match(choose.body, /Start a project/);

    const repoOpen = await request(handle.port, "POST", "/api/project/open", form({ csrf: tokenFrom(choose.body), path: repo }));
    assert.equal(repoOpen.status, 303);
    assert.match(repoOpen.location, /open-error=repo/);
    const refused = await request(handle.port, "GET", repoOpen.location);
    assert.match(refused.body, /own source repo/);
    assert.match(refused.body, /Hitchhiker Sites/);
    assert.match(refused.body, /Start a project/);

    const nested = path.join(repo, "packages", "app");
    const nestedOpen = await request(
      handle.port,
      "POST",
      "/api/project/new",
      form({ csrf: tokenFrom(refused.body), name: "Inside", dir: nested }),
    );
    assert.equal(nestedOpen.status, 303);
    assert.match(nestedOpen.location, /open-error=repo/);

    const ghost = path.join(sandbox, "repo-row.hhproject");
    await upsertRecentProject(
      {
        projectId: "p-repo",
        name: "Desk Repo",
        filePath: ghost,
        sourceDir: repo,
        savedAt: "2026-01-02T14:18:00.000Z",
        progress: "question 62 of 62",
        ok: true,
        reason: null,
      },
      home,
    );
    const resume = await request(
      handle.port,
      "POST",
      "/api/project/open",
      form({ csrf: tokenFrom(refused.body), path: ghost }),
    );
    assert.equal(resume.status, 303, resume.body);
    assert.match(resume.location, /open-error=repo/);

    const dest = path.join(sandbox, "sites", "visit-book");
    const created = await request(
      handle.port,
      "POST",
      "/api/project/new",
      form({ csrf: tokenFrom(refused.body), name: "Visit Book", dir: dest }),
    );
    assert.equal(created.status, 303, created.body);
    assert.equal(created.location.includes("open-error"), false);
    assert.equal(existsSync(path.join(dest, ".hitchhiker")), true);
    const desk = await request(handle.port, "GET", "/");
    assert.match(desk.body, /data-question-id="/);
    assert.equal(desk.body.includes("data-first-run"), false);
    assert.equal(desk.body.includes("Start a project"), false);
    assert.match(desk.body, /New project/);
    if (before === null) assert.equal(existsSync(interview), false);
    else assert.equal(statSync(interview).mtimeMs, before);
  } finally {
    if (handle !== undefined) await handle.close();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    if (priorE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = priorE2e;
    removeTempDir(sandbox);
  }
});

test("resume rows open, show a local date, and use the desk question count", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-resume-row-242a-"));
  const home = path.join(dir, ".hh-save-home");
  const prior = process.env.HH_PROJECT_HOME;
  process.env.HH_PROJECT_HOME = home;
  try {
    mkdirSync(path.join(dir, "interview"), { recursive: true });
    writeFileSync(
      path.join(dir, "interview", "tree.yaml"),
      `questions:
  - id: DP-0.1
    module: desk
    depth: [express, standard, deep]
    ask: "Who is it for?"
    why: "The audience."
    input: [text]
    skip_default: "A person."
    writes:
      - "PROJECT.md"
  - id: DP-0.2
    module: desk
    depth: [express, standard, deep]
    ask: "What should it do?"
    why: "The job."
    input: [text]
    skip_default: "A page."
    writes:
      - "PROJECT.md"
`,
    );
    await saveState(dir, {
      phase: "Don't Panic",
      slice: "Desk",
      promptId: "interview:DP-0.1",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "Answer DP-0.1.",
      updatedAt: "2026-10-20T12:00:00.000Z",
    });
    mkdirSync(home, { recursive: true });
    const saved = await saveProjectFile(dir, {
      to: path.join(home, "Visit Desk.hhproject"),
      projectName: "Visit Desk",
      homeDir: home,
      now: new Date("2026-01-02T14:18:00.000Z"),
    });
    const filePath = saved.filePath;
    const missing = path.join(home, "Gone Desk.hhproject");
    await upsertRecentProject(
      {
        projectId: saved.projectId,
        name: "Visit Desk",
        filePath,
        sourceDir: dir,
        savedAt: "2026-01-02T14:18:00.000Z",
        progress: "question 62 of 62",
        ok: true,
        reason: null,
      },
      home,
    );
    await upsertRecentProject(
      {
        projectId: "p-gone",
        name: "Gone Desk",
        filePath: missing,
        sourceDir: path.join(dir, "missing"),
        savedAt: "2026-01-02T14:18:00.000Z",
        progress: "question 62 of 62",
        ok: true,
        reason: null,
      },
      home,
    );
    const beforeFile = readFileSync(filePath, "utf8");
    const chrome = await projectChrome(dir, "csrf-token", true);
    assert.match(chrome, /aria-label="Open Visit Desk"/);
    assert.match(chrome, /action="\/api\/project\/open"/);
    assert.match(chrome, /question 1 of 2/);
    assert.equal(chrome.includes("62 of 62"), false);
    assert.match(chrome, /2 Jan 2026/);
    assert.match(chrome, /datetime="2026-01-02T14:18:00.000Z"/);
    assert.equal(chrome.includes("UTC"), false);
    assert.match(chrome, /data-missing="true"/);
    assert.match(chrome, /<p class="hh-title">Gone Desk<\/p>/);
    assert.equal(chrome.includes('aria-label="Open Gone Desk"'), false);
    assert.match(chrome, /New project/);
    assert.equal(chrome.includes("hh-btn--primary"), false);
    assert.equal(chrome.includes("!"), false);
    const compact = await projectChrome(dir, "csrf-token", false);
    assert.equal(compact.includes("Resume a project"), false);
    assert.match(compact, /New project/);
    assert.equal(readFileSync(filePath, "utf8"), beforeFile);
  } finally {
    if (prior === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = prior;
    removeTempDir(dir);
  }
});

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

async function request(
  port: number,
  method: string,
  urlPath: string,
  body?: string,
): Promise<{ status: number; body: string; location: string }> {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    redirect: "manual",
    headers: body === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return {
    status: response.status,
    body: await response.text(),
    location: response.headers.get("location") ?? "",
  };
}
