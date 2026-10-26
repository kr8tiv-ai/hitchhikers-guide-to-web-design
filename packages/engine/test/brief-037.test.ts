/**
 * BUG-037: one answer fills one field, fields stay near their target,
 * and languages, imagery, and budget are not dumped into neighbouring fields.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkRequest, ThinkResult } from "../src/ai/think.ts";
import { readBriefDesk, draftSiteBrief } from "../src/guide/brief-desk.ts";
import { BRIEF_SOURCES, deterministicBrief, renderAnswerMap } from "../src/guide/brief-loop.ts";
import {
  BRIEF_DRAFT_SCHEMA,
  BRIEF_KEYS,
  BRIEF_LIST_MAX,
  BRIEF_PROSE_MAX,
  briefFieldDescription,
  briefFieldTarget,
  type BriefKey,
  type Facts,
  type SiteBrief,
} from "../src/guide/schemas.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

interface Row {
  id: string;
  status: string;
  value: string;
}

function run3Facts(): Facts {
  const rows = JSON.parse(readFileSync(path.join(here, "fixtures", "paradise-run3-answers.json"), "utf8")) as Row[];
  return {
    answers: rows.map((row) =>
      row.status === "ANSWERED" ? { id: row.id, value: row.value } : { id: row.id, value: row.value, status: row.status },
    ),
    uploads: [],
    crawlNotes: [],
  };
}

function countOf(haystack: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

test("each DP id maps to one field and every field except derived coverage has a source", () => {
  const owner = new Map<string, BriefKey>();
  for (const key of BRIEF_KEYS) {
    const ids = BRIEF_SOURCES[key];
    if (key === "coverage") {
      assert.deepEqual(ids, []);
      continue;
    }
    assert.ok(ids.length > 0, `${key} has no source`);
    for (const id of ids) {
      assert.equal(owner.has(id), false, `${id} maps to ${owner.get(id) ?? ""} and ${key}`);
      owner.set(id, key);
    }
  }
  assert.equal(owner.get("DP-3.9"), "languages");
  assert.equal(owner.get("DP-7.1"), "imagery");
  assert.equal(owner.get("DP-7.2"), "budget");
  assert.equal(owner.get("DP-0.5"), "session");
  assert.equal(owner.get("DP-1.1"), "logo");
  assert.equal(owner.get("DP-1.2"), "palette");
  assert.equal(owner.get("DP-0.2"), "exists");
  assert.equal(owner.get("DP-2.8"), "pages");
  assert.equal(owner.get("DP-9.2"), "hosting");
});

test("schema descriptions and the draft prompt state the same length targets", async () => {
  const props = BRIEF_DRAFT_SCHEMA.properties ?? {};
  for (const key of BRIEF_KEYS) {
    const field = props[key];
    assert.equal(field?.description, briefFieldDescription(key), key);
    const list = key === "pages" || key === "features" || key === "limits" || key === "references" || key === "cadence";
    assert.equal(field?.maxLength, list ? BRIEF_LIST_MAX : BRIEF_PROSE_MAX, key);
    assert.match(field?.description ?? "", new RegExp(`Target ${briefFieldTarget(key)} characters`));
  }
  assert.match(props.pages?.description ?? "", /Short items/);
  assert.match(props.goal?.description ?? "", /Prose/);
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-037-prompt-"));
  mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
  const calls: ThinkRequest<unknown>[] = [];
  const think = async (req: ThinkRequest<unknown>): Promise<ThinkResult<unknown>> => {
    calls.push(req);
    const brief = {} as SiteBrief;
    for (const key of BRIEF_KEYS) brief[key] = "The site helps a visitor book a visit.";
    return { value: brief, raw: JSON.stringify(brief), durationMs: 0, cassette: "live" };
  };
  try {
    await draftSiteBrief(dir, think as never);
    const input = calls[0]?.input ?? "";
    assert.match(input, new RegExp(`at most ${BRIEF_PROSE_MAX} characters`));
    assert.match(input, /pages, features, limits, references, and cadence/);
    assert.match(input, new RegExp(`at most ${BRIEF_LIST_MAX} characters`));
    assert.match(input, new RegExp(briefFieldDescription("goal").replace(/[.]/g, "\\.")));
    assert.match(input, new RegExp(briefFieldDescription("pages").replace(/[.]/g, "\\.")));
    assert.match(input, /DP-3\.9: languages/);
    assert.match(input, /DP-7\.1: imagery/);
    assert.match(input, /DP-7\.2: budget/);
    assert.match(input, /DP-0\.5: session/);
    assert.match(input, /Each answer feeds one field/);
    assert.equal(input.includes(renderAnswerMap()), true);
    assert.equal(calls[0]?.model, "grok-4.7-build-fast");
    assert.equal(calls[0]?.effort, "xhigh");
  } finally {
    removeTempDir(dir);
  }
});

test("Paradise Found Run 3 fallback keeps each field short and on one topic", () => {
  const filled = deterministicBrief(run3Facts(), "en");
  const phrase = "buying with a lawyer, living off the land, caretaker farms";
  for (const key of BRIEF_KEYS) {
    assert.ok(filled[key].length <= briefFieldTarget(key), `${key} is ${filled[key].length}`);
    assert.equal(filled[key].includes("!"), false, key);
  }
  assert.match(filled.languages, /English first/);
  assert.match(filled.languages, /Spanish second/);
  assert.equal(/english first/i.test(filled.hosting), false);
  assert.equal(/english first/i.test(filled.pages), false);
  assert.equal(/spanish second/i.test(filled.hosting), false);
  assert.equal(/spanish second/i.test(filled.pages), false);
  assert.match(filled.imagery, /50 dollars/);
  assert.equal(/50 dollars/i.test(filled.pages), false);
  assert.equal(/50 dollars/i.test(filled.budget), false);
  assert.match(filled.budget, /\$0|3D/);
  assert.match(filled.session, /X account/);
  assert.match(filled.session, /hour/);
  assert.equal(/x account/i.test(filled.exists), false);
  assert.equal(/voice learning/i.test(filled.exists), false);
  assert.equal(/paradise-found-logo/i.test(filled.exists), false);
  assert.match(filled.logo, /paradise-found-logo/);
  assert.match(filled.palette, /[Ss]and/);
  assert.equal(countOf(filled.cadence, phrase), 1);
  assert.match(filled.exists, /first site/);
});

test("an older pending brief without the new fields still loads", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-brief-037-old-"));
  const hitch = path.join(dir, ".hitchhiker");
  mkdirSync(hitch, { recursive: true });
  const draft: Record<string, string> = {};
  for (const key of BRIEF_KEYS) {
    if (key === "languages" || key === "imagery" || key === "budget" || key === "session" || key === "logo" || key === "palette") {
      continue;
    }
    draft[key] = "The site helps a visitor book a visit.";
  }
  writeFileSync(
    path.join(hitch, "brief-pending.json"),
    `${JSON.stringify({ status: "pending", draft, buildStarted: false, error: "" })}\n`,
  );
  try {
    const desk = readBriefDesk(dir);
    assert.equal(desk.status, "pending");
    assert.equal(desk.draft?.goal, "The site helps a visitor book a visit.");
    assert.equal(desk.draft?.languages, "The field is not stated yet.");
    assert.equal(desk.draft?.imagery, "The field is not stated yet.");
    assert.equal(desk.draft?.budget, "The field is not stated yet.");
    assert.match(desk.markdown, /## Languages/);
    assert.match(desk.markdown, /## Imagery/);
    assert.match(desk.markdown, /## Budget/);
    assert.match(desk.markdown, /## Colours/);
  } finally {
    removeTempDir(dir);
  }
});
