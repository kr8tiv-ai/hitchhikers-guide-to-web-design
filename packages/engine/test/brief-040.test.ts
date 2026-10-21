/**
 * BUG-040: a project4-shaped brief draft is used, coverage stays complete,
 * a rejected draft names the fields, retry can replace the fallback, and
 * the fallback stays labelled until a model draft replaces it.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { approveSiteBrief, approveSitePlan, draftSiteBrief, readBriefDesk, reviseSiteBrief } from "../src/guide/brief-desk.ts";
import { deterministicBrief } from "../src/guide/brief-loop.ts";
import { BRIEF_KEYS, briefFieldTarget, type Facts, type SiteBrief } from "../src/guide/schemas.ts";
import { loadFacts } from "../src/guide/suggest.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const SKIPPED = new Set(["SKIPPED", "NOT_APPLICABLE", "UNANSWERED"]);

interface Answer {
  id: string;
  value: string;
  status?: string;
}

function projectDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-040-"));
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  writeFileSync(path.join(hitch, "interview.json"), readFileSync(path.join(here, "fixtures", "project4-interview.json")));
  return dir;
}

function splitIds(facts: Facts): { covered: string[]; uncovered: string[] } {
  const covered: string[] = [];
  const uncovered: string[] = [];
  const seen = new Set<string>();
  for (const answer of facts.answers) {
    if (answer.id === "DP-6.5" || seen.has(answer.id)) continue;
    seen.add(answer.id);
    if (SKIPPED.has(answer.status ?? "")) uncovered.push(answer.id);
    else if (answer.value.trim() !== "") covered.push(answer.id);
  }
  return { covered, uncovered };
}

function hasId(coverage: string, id: string): boolean {
  let from = 0;
  while (from < coverage.length) {
    const at = coverage.indexOf(id, from);
    if (at < 0) return false;
    const next = coverage[at + id.length] ?? "";
    const longer = next === "a" || (next >= "0" && next <= "9");
    if (!longer) return true;
    from = at + id.length;
  }
  return false;
}

function coverageComplete(coverage: string, facts: Facts): boolean {
  const { covered, uncovered } = splitIds(facts);
  const total = covered.length + uncovered.length;
  if (covered.every((id) => hasId(coverage, id)) && uncovered.every((id) => hasId(coverage, id))) return true;
  if (!coverage.includes(`Covered ${covered.length} of ${total}`)) return false;
  if (uncovered.length === 0) return true;
  if (uncovered.every((id) => hasId(coverage, id))) return true;
  return coverage.includes(`Uncovered ${uncovered.length} of ${total}`);
}

function modelDraft(recorded: SiteBrief): SiteBrief {
  return {
    ...recorded,
    goal: "The published brief promises a calm buying path for the farms.",
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

test("a project4-shaped ok draft is used and coverage accounts for every id", async () => {
  const dir = projectDir();
  const facts = loadFacts(dir);
  const recorded = deterministicBrief(facts, "en");
  const model = modelDraft(recorded);
  const calls: ThinkRequest<unknown>[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls.push(req);
    assert.equal(req.task, "brief-draft");
    assert.equal(req.model, "grok-4.7-build-fast");
    assert.equal(req.effort, "xhigh");
    return { value: model, raw: JSON.stringify(model), durationMs: 0, cassette: "live" };
  };
  try {
    const { covered, uncovered } = splitIds(facts);
    assert.ok(covered.length + uncovered.length >= 61);
    const desk = await draftSiteBrief(dir, think as never);
    assert.equal(calls.length, 1);
    assert.equal(desk.error, "");
    assert.equal(desk.fallback, false);
    assert.equal(desk.status, "pending");
    assert.match(desk.draft?.goal ?? "", /published brief/);
    assert.match(desk.draft?.maintainer ?? "", /each month/);
    assert.match(desk.draft?.budget ?? "", /50 dollars/);
    assert.equal((desk.draft?.budget ?? "").includes("Not applicable"), false);
    assert.match(desk.draft?.languages ?? "", /English first/);
    assert.match(desk.draft?.languages ?? "", /Spanish second/);
    assert.match(desk.draft?.imagery ?? "", /50 dollars/);
    assert.match(desk.draft?.session ?? "", /No X account/);
    assert.match(desk.draft?.logo ?? "", /paradise-found-logo/);
    assert.match(desk.draft?.palette ?? "", /soft sand/);
    const coverage = desk.draft?.coverage ?? "";
    assert.ok(coverageComplete(coverage, facts), coverage);
    assert.ok(coverage.length <= briefFieldTarget("coverage"), `${coverage.length}`);
    for (const key of BRIEF_KEYS) {
      assert.ok((desk.draft?.[key] ?? "").length <= briefFieldTarget(key), key);
    }
    const pending = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "brief-pending.json"), "utf8")) as {
      fallback?: boolean;
      error?: string;
    };
    assert.equal(pending.fallback, false);
    assert.equal(pending.error, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function spanishDraft(recorded: SiteBrief): SiteBrief {
  return {
    ...recorded,
    languages: "Quiero una tienda para el sitio.",
    budget: "Quiero una tienda para el sitio.",
    session: "Quiero una tienda para el sitio.",
  };
}

test("a rejected ok draft logs the field and rule and the alert is readable", async () => {
  const dir = projectDir();
  const recorded = deterministicBrief(loadFacts(dir), "en");
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    assert.equal(req.model, "grok-4.7-build-fast");
    assert.equal(req.effort, "xhigh");
    return { value: spanishDraft(recorded), raw: "{}", durationMs: 0, cassette: "live" };
  };
  try {
    const desk = await draftSiteBrief(dir, think as never);
    assert.equal(desk.fallback, true);
    assert.match(desk.error, /Languages, Budget, and Session are not in the reply language/);
    assert.equal(desk.error.includes("language; language"), false);
    assert.match(desk.error, /Use Retry to ask again/);
    assert.equal(desk.error.includes("!"), false);
    const log = readFileSync(path.join(dir, ".hitchhiker", "logs", "ai.ndjson"), "utf8");
    const rows = log
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { task?: string; outcome?: string; error?: string; model?: string; effort?: string });
    const rejected = rows.filter((row) => row.outcome === "rejected");
    assert.ok(rejected.length >= 1);
    assert.equal(rejected.every((row) => row.outcome !== "ok"), true);
    assert.equal(rejected[0]?.task, "brief-draft");
    assert.equal(rejected[0]?.model, "grok-4.7-build-fast");
    assert.equal(rejected[0]?.effort, "xhigh");
    assert.match(rejected[0]?.error ?? "", /languages: language/);
    assert.match(rejected[0]?.error ?? "", /budget: language/);
    assert.match(rejected[0]?.error ?? "", /session: language/);
    const copies = desk.error.split("reply language").length - 1;
    assert.equal(copies, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("retry replaces a fallback when the next draft is valid, and a second failure stays readable", async () => {
  const dir = projectDir();
  const facts = loadFacts(dir);
  const recorded = deterministicBrief(facts, "en");
  const good = modelDraft(recorded);
  let calls = 0;
  const inputs: string[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls += 1;
    inputs.push(req.input);
    assert.equal(req.task, "brief-draft");
    assert.equal(req.model, "grok-4.7-build-fast");
    assert.equal(req.effort, "xhigh");
    if (calls <= 2) return { value: spanishDraft(recorded), raw: "{}", durationMs: 0, cassette: "live" };
    return { value: good, raw: JSON.stringify(good), durationMs: 0, cassette: "live" };
  };
  try {
    const first = await draftSiteBrief(dir, think as never);
    assert.equal(first.fallback, true);
    assert.match(first.error, /reply language/);
    assert.equal(calls, 2);
    const second = await draftSiteBrief(dir, think as never);
    assert.equal(second.fallback, false);
    assert.equal(second.error, "");
    assert.match(second.draft?.goal ?? "", /published brief/);
    assert.match(second.draft?.budget ?? "", /50 dollars/);
    assert.equal((second.draft?.budget ?? "").includes("Not applicable"), false);
    assert.ok(inputs.length >= 3);
    assert.match(inputs[0] ?? "", /DP-2\.1/);
    assert.match(inputs[2] ?? "", /DP-2\.1/);
    assert.equal(inputs[2]?.includes("language; language"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const again = projectDir();
  const base = deterministicBrief(loadFacts(again), "en");
  const failing = async (): Promise<ThinkResult<unknown>> => {
    return { value: spanishDraft(base), raw: "{}", durationMs: 0, cassette: "live" };
  };
  try {
    await draftSiteBrief(again, failing as never);
    const second = await draftSiteBrief(again, failing as never);
    assert.equal(second.fallback, true);
    assert.match(second.error, /failed again at \d{4}-\d{2}-\d{2}T/);
    assert.match(second.error, /Languages, Budget, and Session are not in the reply language/);
    assert.equal(second.error.includes("language; language"), false);
    assert.equal(second.error.includes("!"), false);
  } finally {
    rmSync(again, { recursive: true, force: true });
  }
});

test("a named change on a fallback keeps the marker, and approve needs confirmation", async () => {
  const dir = projectDir();
  const recorded = deterministicBrief(loadFacts(dir), "en");
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "brief-draft") return { value: spanishDraft(recorded), raw: "{}", durationMs: 0, cassette: "live" };
    if (req.task === "brief-revise") return { value: { budget: "Quiero una tienda para el sitio." }, raw: "{}", durationMs: 0, cassette: "live" };
    if (req.task === "context-summary") return { value: { summary: "Brief approved." }, raw: "{}", durationMs: 0, cassette: "live" };
    throw new Error(req.task);
  };
  try {
    const drafted = await draftSiteBrief(dir, think as never);
    assert.equal(drafted.fallback, true);
    const correction = "Budget: Up to 50 dollars for AI stills. Maintainer: The owner approves every change.";
    const revised = await reviseSiteBrief(dir, correction, think as never);
    assert.equal(revised.fallback, true);
    assert.match(revised.draft?.budget ?? "", /50 dollars/);
    assert.equal((revised.draft?.budget ?? "").includes("Not applicable"), false);
    assert.match(revised.draft?.maintainer ?? "", /approves every change/);
    assert.match(revised.error, /reply language/);
    const pending = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "brief-pending.json"), "utf8")) as {
      fallback?: boolean;
    };
    assert.equal(pending.fallback, true);
    await assert.rejects(() => approveSiteBrief(dir, think as never), /Confirm the interview fallback/);
    const held = readBriefDesk(dir);
    assert.equal(held.status, "pending");
    assert.equal(held.fallback, true);
    assert.match(held.draft?.budget ?? "", /50 dollars/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("confirming a small fallback approves it and keeps the marker", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-040-yes-"));
  const line = "The site helps a visitor book a visit.";
  mkdirSync(path.join(dir, "interview"), { recursive: true });
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  writeFileSync(
    path.join(dir, "interview", "tree.yaml"),
    `questions:
  - id: DP-2.1
    module: the-question
    depth: [express, standard, deep]
    ask: "What should the site do?"
    why: "The job of the site."
    input: [text]
    skip_default: "Site why not stated."
    writes:
      - "SITE-BRIEF.md"
`,
  );
  writeFileSync(
    path.join(dir, ".hitchhiker", "interview.json"),
    JSON.stringify([{ id: "DP-2.1", status: "ANSWERED", value: line }]),
  );
  const draft: Record<string, string> = {};
  for (const key of BRIEF_KEYS) draft[key] = line;
  draft.budget = "Not applicable: 3D is none, so the custom generation budget is not asked.";
  draft.maintainer = "The owner types the raw answer.";
  writeFileSync(
    path.join(dir, ".hitchhiker", "brief-pending.json"),
    `${JSON.stringify({
      status: "pending",
      draft,
      buildStarted: false,
      error: "The brief draft stopped early. These fields stay filled from the interview. Use Retry to ask again.",
      note: "",
      fallback: true,
    })}\n`,
  );
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    if (req.task === "context-summary") {
      return { value: { summary: "Brief approved." }, raw: "{}", durationMs: 0, cassette: "live" };
    }
    throw new Error(req.task);
  };
  try {
    const approved = await approveSiteBrief(dir, think as never, { confirmFallback: true });
    assert.equal(approved.status, "approved");
    assert.equal(approved.fallback, true);
    assert.equal(approved.buildStarted, false);
    const started = await approveSitePlan(dir);
    assert.equal(started.buildStarted, false);
    assert.equal(started.planApproved, true);
    assert.equal(approved.error, "");
    assert.match(approved.draft?.budget ?? "", /Not applicable/);
    const file = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "brief-pending.json"), "utf8")) as {
      status?: string;
      fallback?: boolean;
      error?: string;
    };
    assert.equal(file.status, "approved");
    assert.equal(file.fallback, true);
    assert.equal(file.error, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
