import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  benchMayStart,
  compareBrief,
  deskPagesDiffer,
  isTemplateClone,
  type BriefComparison,
  type PageScore,
  type PairVote,
} from "../src/visual-bench.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function page(patch: Partial<PageScore> = {}): PageScore {
  return {
    sections: [
      { id: "hero", visualRichness: 10 },
      { id: "story", visualRichness: 9 },
      { id: "footer", visualRichness: 9 },
    ],
    originality: 9,
    rubric: {
      visualRichness: 10,
      originality: 9,
      artDirection: 9,
      typography: 9,
      motion: 9,
      imagery: 9,
      accessibility: 9,
      performance: 9,
    },
    richnessIndex: 20,
    techniques: ["shader", "split-text"],
    skeleton: "hero-story-footer",
    hard: {},
    ...patch,
  };
}

function pairs(prefer: PairVote["prefer"] = "desk"): PairVote[] {
  return [
    { viewport: "375", prefer, swappedPrefer: prefer },
    { viewport: "1440", prefer, swappedPrefer: prefer },
  ];
}

function brief(desk: PageScore, plain: PageScore): BriefComparison {
  return { id: "calm", desk, plain, pairs: pairs() };
}

test("stubbed losses, ties, richness, originality, slop, and clones fail as specified", () => {
  const plain = page({
    sections: [
      { id: "hero", visualRichness: 4 },
      { id: "story", visualRichness: 4 },
    ],
    originality: 4,
    richnessIndex: 1,
    techniques: ["stack"],
    skeleton: "one-column",
  });
  assert.equal(compareBrief(brief(page({ richnessIndex: 9.9 }), plain)).pass, false);
  assert.equal(compareBrief(brief(page({ richnessIndex: 10 }), plain)).pass, true);
  assert.equal(compareBrief(brief(page({ originality: 7, richnessIndex: 10 }), plain)).pass, false);
  assert.equal(compareBrief(brief(page({ originality: 8, richnessIndex: 10 }), { ...plain, originality: 5 })).pass, false);
  assert.equal(compareBrief(brief(page({ originality: 8, richnessIndex: 10 }), { ...plain, originality: 4 })).pass, true);
  assert.equal(compareBrief({ ...brief(page({ richnessIndex: 10 }), plain), pairs: pairs("tie") }).pass, false);
  assert.equal(compareBrief({ ...brief(page({ richnessIndex: 10 }), plain), pairs: pairs("plain") }).pass, false);
  assert.equal(compareBrief(brief(page({ richnessIndex: 10, hard: { slop: true } }), plain)).pass, false);
  const snippet = "function pinTimeline scrub the hero and release the next section with a quiet grade";
  assert.equal(isTemplateClone(`${snippet} ${snippet}`, [snippet]), true);
  assert.equal(isTemplateClone("a fresh composition with its own grid and its own type", [snippet]), false);
  assert.equal(
    compareBrief(brief(page({ richnessIndex: 10, hard: { templateClone: true } }), plain)).pass,
    false,
  );
  assert.equal(
    deskPagesDiffer([
      { techniques: ["shader", "split-text"], skeleton: "a" },
      { techniques: ["split-text", "shader"], skeleton: "a" },
    ]),
    false,
  );
  assert.equal(
    deskPagesDiffer([
      { techniques: ["shader"], skeleton: "a" },
      { techniques: ["lenis", "parallax"], skeleton: "b" },
    ]),
    true,
  );
});

test("the runner refuses to start without --run", () => {
  assert.equal(benchMayStart(["node", "run.ts"]), false);
  assert.equal(benchMayStart(["node", "run.ts", "--run"]), true);
  const script = path.resolve(here, "../../../bench/visual/run.ts");
  const result = spawnSync(process.execPath, ["--experimental-strip-types", script], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(`${result.stderr}`, /without --run/);
});
