import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { defaultConfig, loadConfig, loadProjectFile, saveConfig, saveState } from "@hitchhiker/engine";
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
    assert.match(before, />Save project</);
    assert.match(before, />Resume project</);
    assert.match(before, />Open project folder</);
    assert.match(before, /Resume a project/);
    assert.equal(before.includes("hh-btn--primary"), false);
    const saved = await runProjectPost({
      pathname: "/api/project/save",
      projectDir: dir,
      token,
      header: undefined,
      raw: `csrf=${token}`,
      contentType: "application/x-www-form-urlencoded",
      tokensMatch: (expected, provided) => expected === provided,
    });
    assert.deepEqual(saved, { type: "redirect", location: "/?stay=1" });
    const json = await runProjectPost({
      pathname: "/api/project/save",
      projectDir: dir,
      token,
      header: undefined,
      raw: `csrf=${token}`,
      contentType: "application/x-www-form-urlencoded",
      accept: "application/json",
      tokensMatch: (expected, provided) => expected === provided,
    });
    assert.equal(json.type, "json");
    if (json.type === "json") {
      const body = json.body as { ok?: boolean; savedAt?: string; place?: string };
      assert.equal(body.ok, true);
      assert.equal(typeof body.savedAt, "string");
      assert.equal(body.savedAt?.includes("UTC"), false);
      assert.equal(typeof body.place, "string");
    }
    const stayed = await projectChrome(dir, token, false);
    assert.equal(stayed.includes("Resume a project"), false);
    assert.match(stayed, /<time datetime="/);
    assert.equal(stayed.includes("UTC"), false);
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
    assert.match(chrome, />Open project folder</);
    assert.match(chrome, />Save project</);
    assert.match(chrome, />Resume project</);
    assert.match(chrome, /Copy path/);
    assert.equal(chrome.includes("hh-btn--primary"), false);
    assert.equal((chrome.match(/role="region" aria-label="Project save"/g) ?? []).length, 1);
    assert.equal(chrome.includes("!"), false);
    const html = applyProjectChrome(
      '<body><main><section data-region="question"></section><div data-project-slot></div><section id="transcript"></section></main><footer>Ready.</footer></body>',
      chrome,
    );
    const question = html.indexOf('data-region="question"');
    const line = html.indexOf("hh-save-line");
    const transcript = html.indexOf('id="transcript"');
    const footer = html.indexOf("</footer>");
    assert.ok(question >= 0 && question < line && line < transcript && transcript < footer);
    assert.equal(html.includes("data-project-slot"), false);
    assert.equal((html.match(/role="region" aria-label="Project save"/g) ?? []).length, 1);
    const legacy = applyProjectChrome(
      '<body><div class="hh-columns"></div><footer>Ready.</footer></body>',
      chrome,
    );
    assert.ok(legacy.lastIndexOf("hh-save-line") > legacy.lastIndexOf("</footer>"));
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

test("factory medium shows Extra high, and a saved Medium stays Medium", async () => {
  const dir = tempDir();
  const home = path.join(dir, ".hh-save-home");
  process.env.HH_PROJECT_HOME = home;
  try {
    await saveConfig(dir, defaultConfig());
    const factory = await projectChrome(dir, "csrf-token", false);
    assert.match(factory, /value="xhigh" checked/);
    assert.equal(factory.includes('value="medium" checked'), false);
    assert.match(factory, /role="radiogroup" aria-label="Guide effort"/);
    assert.match(factory, /Higher is more thorough and slower/);
    const fresh = defaultConfig();
    assert.equal(fresh.effort, "medium");
    assert.equal(fresh.ai.effort.default, "medium");
    assert.equal(fresh.ai.effort.picked, undefined);
    const chosen = defaultConfig();
    chosen.effort = "medium";
    chosen.ai.effort.default = "medium";
    chosen.ai.effort.picked = "yes";
    await saveConfig(dir, chosen);
    const medium = await projectChrome(dir, "csrf-token", false);
    assert.match(medium, /value="medium" checked/);
    assert.equal(medium.includes('value="xhigh" checked'), false);
    const loaded = loadConfig(dir);
    assert.equal(loaded.effort, "medium");
    assert.equal(loaded.ai.effort.default, "medium");
    assert.equal(loaded.ai.effort.picked, "yes");
  } finally {
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    rmSync(dir, { recursive: true, force: true });
  }
});
});
