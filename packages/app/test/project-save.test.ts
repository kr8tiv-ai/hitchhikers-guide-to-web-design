import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { loadProjectFile, saveState } from "@hitchhiker/engine";
import { postBrandDecision } from "../src/server/brand-desk.ts";
import { applyProjectChrome, projectChrome, runProjectPost } from "../src/server/project-desk.ts";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-save-ui-"));
}

function projectFile(home: string): string {
  const names = readdirSync(home).filter((name) => name.endsWith(".hhproject") && !name.includes(".bak"));
  assert.equal(names.length, 1);
  const fileName = names[0];
  assert.ok(fileName !== undefined);
  return path.join(home, fileName);
}

describe("desk save", { concurrency: 1 }, () => {
const priorHome = process.env.HH_PROJECT_HOME;

test("approving a brand section autosaves without approving the whole brand", async () => {
  const dir = tempDir();
  const home = path.join(dir, ".hh-save-home");
  process.env.HH_PROJECT_HOME = home;
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "BRAND.md"),
      "# Brand\n\nStatus: draft\n\n## Purpose\n\nA towel shop.\n",
    );
    await saveState(dir, {
      phase: "Don't Panic",
      slice: "Towel",
      promptId: "interview:DP-0.2",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "Answer DP-0.2.",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const result = await postBrandDecision(dir, JSON.stringify({ section: "purpose", action: "approve" }));
    assert.equal(result.status, 200);
    const loaded = await loadProjectFile(projectFile(home));
    assert.equal(loaded.file?.brand.sections.purpose, true);
    assert.equal(loaded.file?.brand.approval.approved, false);
    assert.equal(loaded.file?.brief.approval.approved, false);
    assert.equal(loaded.file?.elevate.approved, false);
  } finally {
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the save chrome lists a project, marks a missing file, and remove leaves the file", async () => {
  const dir = tempDir();
  const home = path.join(dir, ".hh-save-home");
  process.env.HH_PROJECT_HOME = home;
  try {
    await saveState(dir, {
      phase: "Don't Panic",
      slice: "Towel",
      promptId: "interview:DP-0.2",
      lastGoodCommit: "",
      blockers: [],
      nextAction: "Answer DP-0.2.",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const token = "csrf-token";
    const before = await projectChrome(dir, token, true);
    assert.match(before, /Not saved · No save yet/);
    assert.match(before, /Resume a project/);
    const saved = await runProjectPost({
      pathname: "/api/project/save",
      projectDir: dir,
      token,
      header: undefined,
      raw: `csrf=${token}`,
      contentType: "application/x-www-form-urlencoded",
      tokensMatch: (expected, provided) => expected === provided,
    });
    assert.deepEqual(saved, { type: "redirect" });
    const filePath = projectFile(home);
    const kept = path.join(home, "keep-me.hhproject");
    writeFileSync(kept, "{}\n");
    const missing = path.join(home, "Gone Desk.hhproject");
    const { upsertRecentProject } = await import("@hitchhiker/engine");
    await upsertRecentProject(
      {
        projectId: "p-gone",
        name: "Gone Desk",
        filePath: missing,
        sourceDir: path.join(dir, "gone"),
        savedAt: "2020-01-01T00:00:00.000Z",
        progress: "question 1 of 40",
        ok: true,
        reason: null,
      },
      home,
    );
    const chrome = await projectChrome(dir, token, true);
    assert.match(chrome, /Saved · /);
    assert.match(chrome, /Gone Desk/);
    assert.match(chrome, /data-missing="true"/);
    assert.match(chrome, />Remove</);
    assert.match(chrome, /Open project file/);
    assert.match(chrome, /Copy path/);
    assert.equal(chrome.includes("!"), false);
    const html = applyProjectChrome(
      "<body><div class=\"hh-columns\"></div><footer>Ready.</footer></body>",
      chrome,
    );
    const columns = html.indexOf("hh-columns");
    const resume = html.indexOf("Resume a project");
    const footer = html.indexOf("</footer>");
    const line = html.indexOf("hh-save-line");
    assert.ok(resume >= 0 && resume < columns);
    assert.ok(line > footer);
    assert.match(html, /class="hh-save-line" role="region" aria-label="Project save"/);
    const removed = await runProjectPost({
      pathname: "/api/project/remove",
      projectDir: dir,
      token,
      header: undefined,
      raw: `csrf=${token}&path=${encodeURIComponent(missing)}`,
      contentType: "application/x-www-form-urlencoded",
      tokensMatch: (expected, provided) => expected === provided,
    });
    assert.deepEqual(removed, { type: "redirect" });
    assert.equal(existsSync(missing), false);
    assert.equal(existsSync(kept), true);
    assert.equal(existsSync(filePath), true);
    assert.equal(readFileSync(kept, "utf8"), "{}\n");
  } finally {
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    rmSync(dir, { recursive: true, force: true });
  }
});
});
