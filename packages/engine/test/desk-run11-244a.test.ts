/**
 * Desk Run 11: shared chrome on an owned page follows the baseline.
 * A placeholder that only that page carries still fails.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  judgeVisibleCopy,
  type VisibleCopyHit,
  type VisibleCopyJudgeInput,
  type VisibleCopyJudgement,
} from "../src/spec/visible-copy.ts";

function judge(input: Partial<VisibleCopyJudgeInput> = {}): VisibleCopyJudgement {
  return judgeVisibleCopy({
    fullSite: false,
    baseline: { distExisted: true, counts: [] },
    counts: [],
    hits: [],
    ownedSourceHits: [],
    ownedDistFiles: [],
    ...input,
  });
}

function hit(file: string, snippet: string, patternId = "todo"): VisibleCopyHit {
  return { file, snippet, patternId };
}

const OWNED = "live-on-the-land/index.html";
const OTHER = "about/index.html";
const SHARED = "The WhatsApp number is TODO";
const PAGE_ONLY = "TODO only on this page";

test("an owned page fails for a hit that appears only on that page, with or without a baseline", () => {
  const withBaseline = judge({
    baseline: { distExisted: true, counts: [{ file: OWNED, patternId: "todo", count: 4 }] },
    counts: [{ file: OWNED, patternId: "todo", count: 2 }],
    hits: [hit(OWNED, PAGE_ONLY), hit(OTHER, "A different TODO on another page")],
    ownedDistFiles: [OWNED],
  });
  assert.match(withBaseline.reason, /Visible copy failed/);
  assert.match(withBaseline.reason, /Owned page:/);
  assert.match(withBaseline.reason, new RegExp(`dist/${OWNED}: ${PAGE_ONLY}`));
  assert.doesNotMatch(withBaseline.reason, /Shared chrome:/);
  assert.doesNotMatch(withBaseline.reason, /A different TODO/);
  assert.equal(withBaseline.note, "");

  const withoutBaseline = judge({
    baseline: null,
    counts: [{ file: OWNED, patternId: "todo", count: 1 }],
    hits: [hit(OWNED, PAGE_ONLY)],
    ownedDistFiles: [OWNED],
  });
  assert.match(withoutBaseline.reason, /Owned page:/);
  assert.match(withoutBaseline.reason, new RegExp(`dist/${OWNED}: ${PAGE_ONLY}`));
  assert.match(withoutBaseline.note, /dist did not exist before this prompt/);
  assert.doesNotMatch(withoutBaseline.note, /Shared chrome/);
});

test("shared chrome on an owned page passes when its count did not rise", () => {
  const hits = [hit(OWNED, SHARED), hit(OTHER, SHARED)];
  const unchanged = judge({
    baseline: {
      distExisted: true,
      counts: [
        { file: OWNED, patternId: "todo", count: 5 },
        { file: OTHER, patternId: "todo", count: 5 },
      ],
    },
    counts: [
      { file: OWNED, patternId: "todo", count: 5 },
      { file: OTHER, patternId: "todo", count: 5 },
    ],
    hits,
    ownedDistFiles: [OWNED],
  });
  assert.equal(unchanged.reason, "");
  assert.equal(unchanged.note, "");

  const lower = judge({
    baseline: { distExisted: true, counts: [{ file: OWNED, patternId: "todo", count: 8 }] },
    counts: [{ file: OWNED, patternId: "todo", count: 3 }],
    hits,
    ownedDistFiles: [OWNED],
  });
  assert.equal(lower.reason, "");
  assert.equal(lower.note, "");
});

test("shared chrome on an owned page fails when its count rose, and is labelled shared", () => {
  const hits: VisibleCopyHit[] = [];
  for (let index = 0; index < 45; index += 1) {
    const snippet = `TODO shared ${String(index).padStart(2, "0")}`;
    hits.push(hit(OWNED, snippet));
    hits.push(hit(OTHER, snippet));
  }
  const result = judge({
    baseline: {
      distExisted: true,
      counts: [
        { file: OWNED, patternId: "todo", count: 40 },
        { file: OTHER, patternId: "todo", count: 45 },
      ],
    },
    counts: [
      { file: OWNED, patternId: "todo", count: 45 },
      { file: OTHER, patternId: "todo", count: 45 },
    ],
    hits,
    ownedDistFiles: [OWNED],
  });
  assert.match(result.reason, /Visible copy failed/);
  assert.match(result.reason, /Shared chrome:/);
  assert.match(result.reason, new RegExp(`dist/${OWNED}:`));
  assert.doesNotMatch(result.reason, /Owned page:/);
  assert.doesNotMatch(result.reason, /New hits:/);
  assert.doesNotMatch(result.reason, new RegExp(`dist/${OTHER}`));
  const sharedBlock = result.reason.split("Shared chrome:")[1] ?? "";
  const listed = sharedBlock.split("\n").filter((line) => line.startsWith("dist/"));
  assert.equal(listed.length, 40);
  assert.match(sharedBlock, /\.\.\. and 5 more/);
});

test("with no baseline, shared chrome on an owned page passes and is noted", () => {
  const result = judge({
    baseline: { distExisted: false, counts: [] },
    counts: [
      { file: OWNED, patternId: "todo", count: 2 },
      { file: OTHER, patternId: "todo", count: 2 },
    ],
    hits: [hit(OWNED, SHARED), hit(OTHER, SHARED)],
    ownedDistFiles: [OWNED],
  });
  assert.equal(result.reason, "");
  assert.match(result.note, /dist did not exist before this prompt/);
  assert.match(result.note, /Shared chrome on an owned page was not failed/);
});

test("an owned source hit still fails, and a full-site prompt still fails on any hit", () => {
  const source = judge({
    hits: [hit(OTHER, SHARED)],
    ownedSourceHits: [{ file: "src/pages/index.astro", patternId: "todo", snippet: 'data-copy-es="TODO"', line: 7 }],
    ownedDistFiles: [OWNED],
  });
  assert.match(source.reason, /Owned source:/);
  assert.match(source.reason, /src\/pages\/index\.astro:7 data-copy-es="TODO"/);
  assert.doesNotMatch(source.reason, /Shared chrome:/);

  const fullSite = judge({
    fullSite: true,
    baseline: { distExisted: true, counts: [{ file: OTHER, patternId: "todo", count: 9 }] },
    counts: [{ file: OTHER, patternId: "todo", count: 1 }],
    hits: [hit(OTHER, SHARED)],
  });
  assert.match(fullSite.reason, /Visible copy failed/);
  assert.match(fullSite.reason, new RegExp(`dist/${OTHER}: ${SHARED}`));
  assert.equal(fullSite.note, "");
  assert.doesNotMatch(fullSite.reason, /Owned page:/);
  assert.doesNotMatch(fullSite.reason, /Shared chrome:/);
});
