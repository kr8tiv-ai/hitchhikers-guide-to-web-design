/**
 * BUG-063. Opening a saved .hhproject must switch to that project's folder.
 * It must not write the opened brief, answers, or approval into the project
 * that is already open.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createSiteProject, saveProjectFile } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const MARK = "NORTH-WIND-ONLY-BRIEF";

test("opening another .hhproject switches to it and leaves the open project byte-for-byte unchanged", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "hh-open-242d-"));
  const home = path.join(sandbox, ".hh-save-home");
  const priorHome = process.env.HH_PROJECT_HOME;
  const priorE2e = process.env.HH_E2E_PROJECT;
  process.env.HH_PROJECT_HOME = home;
  process.env.HH_E2E_PROJECT = sandbox;
  let handle: ServerHandle | undefined;
  try {
    const calm = path.join(sandbox, "sites", "paradise-calm");
    const wind = path.join(sandbox, "sites", "north-wind");
    await createSiteProject({ name: "Paradise Calm", dir: calm, homeDir: home });
    await createSiteProject({ name: "North Wind", dir: wind, homeDir: home });
    writeFileSync(
      path.join(wind, ".hitchhiker", "interview.json"),
      `${JSON.stringify([{ id: "DP-0.1", status: "ANSWERED", value: MARK, assumption: false }])}\n`,
    );
    writeFileSync(path.join(wind, ".hitchhiker", "SITE-BRIEF.md"), `# Brief\n\n${MARK}\n`);
    writeFileSync(
      path.join(wind, ".hitchhiker", "brief-yes.json"),
      `${JSON.stringify({ approved: true, at: "2026-10-20T12:00:00.000Z" })}\n`,
    );
    writeFileSync(
      path.join(wind, ".hitchhiker", "brief-pending.json"),
      `${JSON.stringify({
        status: "approved",
        draft: briefDraft(MARK),
        buildStarted: false,
        planApproved: false,
        error: "",
        note: "",
        fallback: false,
      })}\n`,
    );
    const saved = await saveProjectFile(wind, { projectName: "North Wind", homeDir: home });

    handle = await startServer({ projectDir: calm, open: false });
    const homePage = await request(handle.port, "GET", "/");
    assert.equal(homePage.status, 200);
    const before = fingerprint(calm);
    assert.match(homePage.body, /Paradise Calm/);
    const opened = await request(
      handle.port,
      "POST",
      "/api/project/open",
      form({ csrf: tokenFrom(homePage.body), path: saved.filePath }),
    );
    assert.equal(opened.status, 303, opened.body);
    assert.equal(opened.location.includes("open-error"), false, opened.body);

    assert.equal(fingerprint(calm), before);
    assert.equal(existsSync(path.join(calm, ".hitchhiker", "brief-yes.json")), false);
    assert.equal(existsSync(path.join(calm, ".hitchhiker", "SITE-BRIEF.md")), false);
    assert.equal(existsSync(path.join(calm, ".hitchhiker", "interview.json")), false);
    assert.equal(readTree(calm).includes(MARK), false);

    const desk = await request(handle.port, "GET", opened.location || "/");
    assert.match(desk.body, /<p class="hh-project__name">North Wind<\/p>/);
    assert.match(desk.body, new RegExp(`data-project-root="${escapeRegExp(wind)}"`));
    assert.match(desk.body, /data-save-status/);
    assert.match(desk.body, /North Wind\.hhproject|north-wind/i);
    const approve = await request(handle.port, "GET", "/approve");
    assert.match(approve.body, new RegExp(MARK));

    const back = await request(
      handle.port,
      "POST",
      "/api/project/open",
      form({ csrf: tokenFrom(desk.body), path: calm }),
    );
    assert.equal(back.status, 303, back.body);
    const returned = await request(handle.port, "GET", "/");
    assert.match(returned.body, /<p class="hh-project__name">Paradise Calm<\/p>/);
    assert.match(returned.body, new RegExp(`data-project-root="${escapeRegExp(calm)}"`));
    assert.equal(returned.body.includes(MARK), false);
    const approveAgain = await request(handle.port, "GET", "/approve");
    assert.equal(approveAgain.body.includes(MARK), false);
    assert.equal(existsSync(path.join(calm, ".hitchhiker", "brief-yes.json")), false);
    assert.equal(existsSync(path.join(calm, ".hitchhiker", "SITE-BRIEF.md")), false);
    assert.equal(readTree(calm).includes(MARK), false);
    assert.equal(fingerprint(calm), before);
  } finally {
    if (handle !== undefined) await handle.close();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    if (priorE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = priorE2e;
    removeTempDir(sandbox);
  }
});

test("a missing sourceDir offers relocate and does not write into the open project", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "hh-relocate-242d-"));
  const home = path.join(sandbox, ".hh-save-home");
  const priorHome = process.env.HH_PROJECT_HOME;
  const priorE2e = process.env.HH_E2E_PROJECT;
  process.env.HH_PROJECT_HOME = home;
  process.env.HH_E2E_PROJECT = sandbox;
  let handle: ServerHandle | undefined;
  try {
    const calm = path.join(sandbox, "sites", "paradise-calm");
    const wind = path.join(sandbox, "sites", "north-wind");
    await createSiteProject({ name: "Paradise Calm", dir: calm, homeDir: home });
    await createSiteProject({ name: "North Wind", dir: wind, homeDir: home });
    writeFileSync(path.join(wind, ".hitchhiker", "SITE-BRIEF.md"), `# Brief\n\n${MARK}\n`);
    const saved = await saveProjectFile(wind, { projectName: "North Wind", homeDir: home });
    const raw = readFileSync(saved.filePath, "utf8");
    const moved = path.join(sandbox, "sites", "moved-away");
    writeFileSync(saved.filePath, raw.replaceAll(wind.replaceAll("\\", "\\\\"), moved.replaceAll("\\", "\\\\")));
    const parsed = JSON.parse(readFileSync(saved.filePath, "utf8")) as { sourceDir: string };
    assert.equal(parsed.sourceDir, moved);
    assert.equal(existsSync(moved), false);

    handle = await startServer({ projectDir: calm, open: false });
    const homePage = await request(handle.port, "GET", "/");
    const before = fingerprint(calm);
    const offered = await request(
      handle.port,
      "POST",
      "/api/project/open",
      form({ csrf: tokenFrom(homePage.body), path: saved.filePath }),
    );
    assert.equal(offered.status, 200, offered.body);
    assert.match(offered.body, /Relocate/);
    assert.match(offered.body, /not on this machine|saved folder is missing|folder is not on this machine/i);
    assert.equal(fingerprint(calm), before);
    assert.equal(readTree(calm).includes(MARK), false);

    const dest = path.join(sandbox, "sites", "relocated");
    const accepted = await request(
      handle.port,
      "POST",
      "/api/project/open",
      form({
        csrf: tokenFrom(offered.body),
        path: saved.filePath,
        relocate: "1",
        dir: dest,
      }),
    );
    assert.equal(accepted.status, 303, accepted.body);
    assert.equal(fingerprint(calm), before);
    const desk = await request(handle.port, "GET", "/");
    assert.match(desk.body, /<p class="hh-project__name">North Wind<\/p>/);
    assert.match(desk.body, new RegExp(`data-project-root="${escapeRegExp(dest)}"`));
    assert.equal(existsSync(path.join(dest, ".hitchhiker", "SITE-BRIEF.md")), true);
    assert.equal(readFileSync(path.join(dest, ".hitchhiker", "SITE-BRIEF.md"), "utf8").includes(MARK), true);
    assert.equal(readTree(calm).includes(MARK), false);
  } finally {
    if (handle !== undefined) await handle.close();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    if (priorE2e === undefined) delete process.env.HH_E2E_PROJECT;
    else process.env.HH_E2E_PROJECT = priorE2e;
    removeTempDir(sandbox);
  }
});

function briefDraft(mark: string): Record<string, string> {
  const line = `The site helps a visitor. ${mark}`;
  const keys = [
    "goal",
    "visitor",
    "action",
    "offer",
    "vibe",
    "references",
    "exists",
    "protected",
    "motion",
    "limits",
    "hosting",
    "maintainer",
    "pages",
    "features",
    "cadence",
    "languages",
    "imagery",
    "budget",
    "session",
    "logo",
    "palette",
    "coverage",
  ];
  return Object.fromEntries(keys.map((key) => [key, line]));
}

function fingerprint(dir: string): string {
  const hash = createHash("sha256");
  const walk = (current: string): void => {
    const names = readdirSync(current).sort();
    for (const name of names) {
      const full = path.join(current, name);
      const info = statSync(full);
      const relative = path.relative(dir, full);
      if (info.isDirectory()) {
        hash.update(`dir:${relative}\n`);
        walk(full);
      } else {
        hash.update(`file:${relative}\n`);
        hash.update(readFileSync(full));
        hash.update("\n");
      }
    }
  };
  walk(dir);
  return hash.digest("hex");
}

function readTree(dir: string): string {
  const chunks: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else chunks.push(readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return chunks.join("\n");
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
