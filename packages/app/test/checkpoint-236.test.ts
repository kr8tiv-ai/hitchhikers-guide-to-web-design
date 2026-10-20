/**
 * Checkpoint 236. A project4 draft is the brief on the desk, with no fallback
 * alert, and /approve shows every page and feature covered.
 * The DP-7.2 skip from that interview renders as a note.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BRIEF_HEADINGS,
  draftSiteBrief,
  type SiteBrief,
  type ThinkRequest,
  type ThinkResult,
} from "@hitchhiker/engine";
import { startServer, type ServerHandle } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(here, "..", "..", "engine", "test", "fixtures", "project4-interview.json");

const PAGES = [
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
] as const;

const FEATURES = [
  "general contact form",
  "footer newsletter signup",
  "WhatsApp link",
  "blog and monthly guide",
  "footer legal disclaimer",
  "llms.txt",
  "FAQ structured data",
] as const;

const GOAL = "The published brief promises a calm buying path for the farms.";
const NOT_ASKED = "Not asked: 3D is none, so the custom budget is not needed";

function projectDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-checkpoint-236-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(path.join(dir, ".hitchhiker", "interview.json"), readFileSync(fixture));
  return dir;
}

function recordedBrief(input: string): SiteBrief {
  const marker = "Recorded fields:\n";
  const at = input.indexOf(marker);
  assert.ok(at >= 0, "recorded fields");
  const markdown = input.slice(at + marker.length);
  const draft = {} as SiteBrief;
  for (const [key, heading] of Object.entries(BRIEF_HEADINGS) as [keyof SiteBrief, string][]) {
    const start = markdown.indexOf(`## ${heading}\n`);
    assert.ok(start >= 0, heading);
    const body = markdown.slice(start + `## ${heading}\n`.length);
    const next = body.search(/\n## /);
    draft[key] = (next === -1 ? body : body.slice(0, next)).trim();
  }
  return draft;
}

function modelDraft(recorded: SiteBrief): SiteBrief {
  return {
    ...recorded,
    goal: GOAL,
    maintainer: "The owner reviews the site each month.",
    languages: "English first, Spanish second.",
    imagery: "Stock photos plus 50 dollars of AI stills.",
    budget: "Up to 50 dollars for AI stills.",
    session: "About an hour. No X account.",
    logo: "Crescent mark, wide caps, paradise-found-logo.png.",
    palette: "Jungle green, sunset gold, ocean blue, soft sand.",
    coverage: "The coverage line names every answered and skipped question.",
  };
}

function raw(port: number, pathname: string, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: body === undefined ? "GET" : "POST",
        headers: body === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function entry(html: string, id: string): string {
  const marker = `data-answer-id="${id}"`;
  const at = html.indexOf(marker);
  assert.ok(at >= 0, id);
  const next = html.indexOf("data-answer-id=", at + marker.length);
  return html.slice(at, next === -1 ? html.length : next);
}

test("a project4 draft is used, the coverage table is full, and DP-7.2 is a note", async () => {
  const dir = projectDir();
  const calls: ThinkRequest<unknown>[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls.push(req);
    assert.equal(req.task, "brief-draft");
    assert.equal(req.model, "grok-4.7-build-fast");
    assert.equal(req.effort, "xhigh");
    const draft = modelDraft(recordedBrief(String(req.input)));
    return { value: draft, raw: JSON.stringify(draft), durationMs: 0, cassette: "live" };
  };
  let handle: ServerHandle | undefined;
  try {
    const desk = await draftSiteBrief(dir, think as never);
    assert.equal(calls.length, 1);
    assert.equal(desk.fallback, false);
    assert.equal(desk.error, "");
    assert.match(desk.draft?.goal ?? "", /published brief/);
    handle = await startServer({
      projectDir: dir,
      open: false,
      guideThink: (async (req: ThinkRequest<unknown>) => {
        throw new Error(req.task);
      }) as never,
    });
    const before = await raw(handle.port, "/approve");
    assert.equal(before.status, 200);
    assert.equal(before.body.includes("data-brief-fallback"), false);
    assert.equal(before.body.includes("This brief is filled from the interview"), false);
    assert.match(before.body, /The published brief promises a calm buying path/);
    assert.match(before.body, /Draft the plan/);
    assert.equal(before.body.includes('value="approve" disabled'), false);
    const token = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(before.body)?.[1] ?? "";
    assert.notEqual(token, "");
    const drafted = await raw(handle.port, "/approve", `csrf=${token}&action=approve`);
    assert.equal(drafted.status, 303);
    const page = await raw(handle.port, "/approve");
    const tableAt = page.body.indexOf("data-plan-coverage");
    const tableEnd = page.body.indexOf("</table>", tableAt);
    assert.ok(tableAt >= 0 && tableEnd > tableAt);
    const table = page.body.slice(tableAt, tableEnd);
    assert.match(table, /Plan coverage/);
    assert.equal(table.includes('data-covered="no"'), false);
    assert.match(table, /data-covered="yes"/);
    assert.match(table, />\d{3}(?:, \d{3})*</);
    for (const title of PAGES) assert.match(table, new RegExp(title.replace(/[.]/g, "\\.")));
    for (const feature of FEATURES) assert.match(table, new RegExp(feature.replace(/[.]/g, "\\."), "i"));
    assert.match(page.body, /value="approve">Approve/);
    assert.equal(page.body.includes('value="approve" disabled'), false);

    const home = await raw(handle.port, "/");
    assert.equal(home.status, 200);
    const notAsked = entry(home.body, "DP-7.2");
    assert.match(notAsked, /data-answer-kind="not-asked"/);
    assert.match(notAsked, new RegExp(`data-answer-text>${NOT_ASKED}<`));
    assert.equal(notAsked.includes(">You<"), false);
    assert.equal(notAsked.includes("Not applicable:"), false);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
