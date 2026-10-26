/**
 * BUG-068. Opening a project saved under desk-e2e-run11 must switch to that folder.
 * It must not ask to relocate because the path was scrubbed.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createSiteProject, saveProjectFile, saveState, type GuideState } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

test("opening a project in desk-e2e-run11 does not say the folder is missing", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "hh-open-243a-"));
  const home = path.join(sandbox, ".hh-save-home");
  const priorHome = process.env.HH_PROJECT_HOME;
  const priorE2e = process.env.HH_E2E_PROJECT;
  process.env.HH_PROJECT_HOME = home;
  process.env.HH_E2E_PROJECT = sandbox;
  let handle: ServerHandle | undefined;
  try {
    const calm = path.join(sandbox, "sites", "calm");
    const project = path.join(sandbox, "desk-e2e-run11", "site");
    await createSiteProject({ name: "Calm", dir: calm, homeDir: home });
    await createSiteProject({ name: "Desk Run", dir: project, homeDir: home });
    await saveState(project, state());
    const saved = await saveProjectFile(project, { projectName: "Desk Run", homeDir: home });
    handle = await startServer({ projectDir: calm, open: false });
    const homePage = await request(handle.port, "GET", "/");
    const opened = await request(
      handle.port,
      "POST",
      "/api/project/open",
      form({ csrf: tokenFrom(homePage.body), path: saved.filePath }),
    );
    assert.equal(opened.status, 303, opened.body);
    assert.equal(/not on this machine/i.test(opened.body), false);
    const desk = await request(handle.port, "GET", opened.location || "/");
    assert.equal(/not on this machine/i.test(desk.body), false);
    assert.match(desk.body, /<p class="hh-project__name">Desk Run<\/p>/);
    assert.match(desk.body, new RegExp(`data-project-root="${escapeRegExp(project)}"`));
  } finally {
    if (handle !== undefined) await handle.close();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    if (priorE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = priorE2e;
    removeTempDir(sandbox);
  }
});

function state(): GuideState {
  return {
    phase: "Don't Panic",
    slice: "Towel",
    promptId: "interview:DP-0.2",
    lastGoodCommit: "",
    blockers: [],
    nextAction: "Answer DP-0.2.",
    updatedAt: "2020-01-01T00:00:00.000Z",
  };
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  if (matched?.[1] === undefined) {
    const formToken = /name="csrf" value="([0-9a-f]{64})"/.exec(html);
    assert.ok(formToken?.[1]);
    return formToken[1];
  }
  return matched[1];
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
