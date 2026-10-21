/**
 * Desk Run 8, through the desk routes.
 * A sitemap change stays waiting. Limits on the draft route drop the timeline.
 * A failing pre-build check keeps Start build disabled and does not start a build.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deterministicBrief, renderSiteBrief, type SiteBrief, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "../../engine/test/fixtures/project4-interview.json");
const TITLES = [
  "Home",
  "Farms",
  "Farm detail",
  "Live on the Land",
  "How Buying Works",
  "Eco-Building and Food",
  "About",
  "Contact",
  "Blog",
  "Privacy",
  "Terms",
];
const LINE = "The site helps a visitor book a visit.";
const DP84 =
  "Yes, privacy and terms pages. Never give legal advice.Disclaimer: Paradise Found does not give legal advice. Never promise title, price, residency or returns, never call a farm an investment. Show asking prices labelled Asking price, set by the seller. Work with a licensed Costa Rican lawyer on every purchase.";
const DP91 = "In 4 weeks: by November 10, 2026.";
const DP95 =
  "Yes, that is right. Also: the caretaker program and a Spanish-first caretaker sign-up matter (Esteban, 61, Android). Office hours Monday to Friday 8:00-17:00 Costa Rica time. Never say investment.";

test("changing the sitemap revises it, stays waiting, and the wireframe follows only the approved pages", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-run8-route-"));
  let handle: ServerHandle | undefined;
  try {
    seedRun8(dir, true);
    handle = await startServer({ projectDir: dir, open: false, guideThink: throwThink });
    const home = await request(handle.port, "GET", "/approve");
    assert.equal(home.status, 200);
    const token = tokenFrom(home.body);
    const sitemap = section(home.body, "sitemap");
    for (const title of TITLES) assert.equal(sitemap.includes(title), true, title);
    assert.match(sitemap, /data-design-stage="sitemap"/);

    const noise = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "stage", stage: "sitemap", commit: "change", approval: "make it pop please" }),
    );
    assert.equal(noise.status, 303, noise.body);
    const ignored = await request(handle.port, "GET", "/approve");
    const ignoredMap = section(ignored.body, "sitemap");
    assert.match(ignoredMap, /data-design-stage="sitemap"/);
    assert.equal(ignoredMap.includes("make it pop"), false);
    assert.equal(readStages(dir).includes("make it pop"), false);

    const changed = await request(
      handle.port,
      "POST",
      "/approve",
      form({
        csrf: token,
        action: "stage",
        stage: "sitemap",
        commit: "change",
        approval: "add a Volunteers page under About. remove Blog",
      }),
    );
    assert.equal(changed.status, 303, changed.body);
    const waiting = await request(handle.port, "GET", "/approve");
    const revised = section(waiting.body, "sitemap");
    assert.match(revised, /data-design-stage="sitemap"/);
    assert.match(revised, /Volunteers/);
    assert.equal(revised.includes("- Blog at"), false);
    assert.equal(revised.includes("add a Volunteers"), false);
    const saved = readStages(dir);
    const parsed = JSON.parse(saved === "" ? "{}" : saved) as { sitemap?: string };
    assert.equal(parsed.sitemap, undefined);
    assert.equal(saved.includes("add a Volunteers"), false);
    assert.equal(saved.includes("remove Blog"), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "wireframe.md")), false);

    const approved = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "stage", stage: "sitemap", commit: "approve", approval: "Approved." }),
    );
    assert.equal(approved.status, 303);
    const wirePage = await request(handle.port, "GET", "/approve");
    const wire = section(wirePage.body, "wireframe");
    assert.match(wire, /data-design-stage="wireframe"/);
    const sitemapFile = readFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), "utf8");
    const expected = pageTitles(sitemapFile);
    const shown = [...readFileSync(path.join(dir, ".hitchhiker", "wireframe.md"), "utf8").matchAll(/^## (.+)$/gm)].map(
      (match) => match[1] ?? "",
    );
    assert.deepEqual(shown, expected);
    assert.equal(shown.includes("Volunteers"), true);
    assert.equal(shown.includes("Blog"), false);

    const later = await request(
      handle.port,
      "POST",
      "/approve",
      form({
        csrf: token,
        action: "stage",
        stage: "sitemap",
        commit: "change",
        approval: "add a Visits page under Contact",
      }),
    );
    assert.equal(later.status, 303);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "wireframe.md")), false);
    const reopened = await request(handle.port, "GET", "/approve");
    assert.match(section(reopened.body, "sitemap"), /data-design-stage="sitemap"/);
    assert.match(section(reopened.body, "sitemap"), /Visits/);
    const after = JSON.parse(readStages(dir) === "" ? "{}" : readStages(dir)) as { sitemap?: string; wireframe?: string };
    assert.equal(after.sitemap, undefined);
    assert.equal(after.wireframe, undefined);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a failing pre-build check keeps Start build disabled and does not start a build", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-run8-gate-"));
  let handle: ServerHandle | undefined;
  try {
    seedRun8(dir, true);
    const hitch = path.join(dir, ".hitchhiker");
    writeFileSync(path.join(hitch, "sitemap.md"), "# Sitemap\n\n## Primary\n\n- Home at /\n", "utf8");
    writeFileSync(path.join(hitch, "wireframe.md"), "# Wireframe\n\n## Home\n", "utf8");
    writeFileSync(path.join(dir, "DESIGN.md"), "Paper #ffffff carries ink #ffffff.\n", "utf8");
    writeFileSync(
      path.join(hitch, "design-stages.json"),
      `${JSON.stringify({
        sitemap: "Approved.",
        wireframe: "Approved.",
        styleGuide: "Approved.",
        direction: "Approved.",
        prebuild: "Approved.",
      })}\n`,
    );
    handle = await startServer({ projectDir: dir, open: false, guideThink: throwThink });
    const page = await request(handle.port, "GET", "/approve");
    assert.equal(page.status, 200);
    assert.match(page.body, /data-start-build disabled/);
    assert.equal(page.body.includes('data-start-build">'), false);
    const token = tokenFrom(page.body);
    const started = await request(
      handle.port,
      "POST",
      "/approve",
      form({ csrf: token, action: "start-build" }),
    );
    assert.equal(started.status, 400, started.body);
    assert.equal(existsSync(path.join(hitch, "queue.json")), false);
    assert.equal(existsSync(path.join(hitch, "build-run.json")), false);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the brief draft route keeps the Run 8 timeline out of Limits", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-run8-limits-"));
  const priorHome = process.env.HH_PROJECT_HOME;
  process.env.HH_PROJECT_HOME = path.join(dir, ".hh-save-home");
  let handle: ServerHandle | undefined;
  try {
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "interview.json"),
      `${JSON.stringify({
        version: 1,
        answers: [
          { id: "DP-8.4", status: "ANSWERED", value: DP84 },
          { id: "DP-9.1", status: "ANSWERED", value: DP91 },
          { id: "DP-9.5", status: "ANSWERED", value: DP95 },
        ],
        cursor: 0,
        pushedIds: [],
      })}\n`,
    );
    const guideThink = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
      if (req.task === "brief-draft" || req.task === "brief-revise") {
        const value = filledBrief();
        value.limits = `${DP91} Yes, that is right.`;
        value.cadence = "A small blog, updated when there is news.";
        return { value, raw: "{}", durationMs: 0, cassette: "live" };
      }
      throw new Error(req.task);
    };
    handle = await startServer({ projectDir: dir, open: false, guideThink: guideThink as never });
    const home = await request(handle.port, "GET", "/approve");
    const token = tokenFrom(home.body);
    const posted = await request(handle.port, "POST", "/api/brief/draft", "{}", {
      "content-type": "application/json",
      "x-hh-csrf": token,
    });
    assert.equal(posted.status, 200, posted.body);
    let pending = "";
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const next = await request(handle.port, "GET", "/api/brief");
      pending = next.body;
      if (pending.includes('"status":"pending"') || pending.includes('"status":"idle"')) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const payload = JSON.parse(pending) as { status: string; fallback: boolean; error: string; draft: SiteBrief | null };
    assert.equal(payload.status, "pending", payload.error);
    assert.equal(payload.fallback, false, payload.error);
    assert.ok(payload.draft);
    assert.equal(/November/.test(payload.draft.limits), false, payload.draft.limits);
    assert.equal(payload.draft.limits.includes("Yes, that is right"), false, payload.draft.limits);
    assert.equal(payload.draft.limits.includes("In 4 weeks"), false, payload.draft.limits);
    assert.match(payload.draft.cadence, /by November 10, 2026/);
    const approve = await request(handle.port, "GET", "/approve");
    const limits = headingSection(approve.body, "Limits");
    assert.equal(/November/.test(limits), false, limits);
    assert.equal(limits.includes("Yes, that is right"), false, limits);
    assert.equal(limits.includes("In 4 weeks"), false, limits);
    const cadence = headingSection(approve.body, "Cadence");
    assert.match(cadence, /by November 10, 2026/);
  } finally {
    if (handle !== undefined) await handle.close();
    if (priorHome === undefined) delete process.env.HH_PROJECT_HOME;
    else process.env.HH_PROJECT_HOME = priorHome;
    rmSync(dir, { recursive: true, force: true });
  }
});

function seedRun8(dir: string, planApproved: boolean): { markdown: string; draft: SiteBrief } {
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "interview.json"), readFileSync(fixture));
  const facts = JSON.parse(readFileSync(fixture, "utf8")) as {
    answers: Array<{ id: string; value: string; status?: string }>;
  };
  const draft = deterministicBrief({ answers: facts.answers, uploads: [], crawlNotes: [] }, "en");
  const markdown = renderSiteBrief(draft);
  writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), markdown);
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({
      status: "approved",
      draft,
      buildStarted: false,
      planApproved,
      error: "",
      note: "",
      fallback: false,
    })}\n`,
  );
  return { markdown, draft };
}

function filledBrief(): SiteBrief {
  return {
    goal: LINE,
    visitor: LINE,
    action: LINE,
    offer: LINE,
    vibe: LINE,
    references: LINE,
    exists: LINE,
    protected: LINE,
    motion: LINE,
    limits: LINE,
    hosting: LINE,
    maintainer: LINE,
    pages: "Home",
    features: "contact form",
    cadence: LINE,
    languages: LINE,
    imagery: LINE,
    budget: LINE,
    session: LINE,
    logo: LINE,
    palette: LINE,
    coverage: LINE,
  };
}

function throwThink(req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> {
  return Promise.reject(new Error(req.task));
}

function readStages(dir: string): string {
  const file = path.join(dir, ".hitchhiker", "design-stages.json");
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8");
}

function pageTitles(markdown: string): string[] {
  const titles: string[] = [];
  for (const line of markdown.split(/\n/)) {
    const match = /^- (.+?) at \S+/.exec(line.trim());
    if (match?.[1] !== undefined && !titles.includes(match[1])) titles.push(match[1]);
  }
  return titles;
}

function section(html: string, stage: string): string {
  const match = new RegExp(`<section data-design-stage="${stage}">[\\s\\S]*?</section>`).exec(html);
  return match?.[0] ?? "";
}

function headingSection(html: string, heading: string): string {
  const match = new RegExp(`<h2>${heading}</h2>([\\s\\S]*?)(?=<h2>|$)`).exec(html);
  return match?.[1] ?? "";
}

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
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; location: string }> {
  const response = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method,
    redirect: "manual",
    headers: body === undefined ? headers : { "content-type": "application/x-www-form-urlencoded", ...headers },
    body,
  });
  return {
    status: response.status,
    body: await response.text(),
    location: response.headers.get("location") ?? "",
  };
}
