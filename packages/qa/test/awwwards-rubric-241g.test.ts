/**
 * Idea 6. The beauty gate returns the four Awwwards parts.
 * Usability is 30 of 100 and has an explicit floor.
 * A flat average that would pass does not save a failed usability score.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { judgeBeauty, type SectionShot } from "../src/beauty-gate.ts";
import { AWWWARDS_USABILITY_FLOOR, AWWWARDS_WEIGHTS, juryFromRubric } from "../src/jury.ts";
import { falseVisualBans } from "../src/zaphod-vision.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function shot(): SectionShot {
  return {
    page: "home",
    section: "hero",
    screenshot: ".hitchhiker/review/home-hero.png",
    textOnly: false,
    todoImage: false,
    placeholderImage: false,
    score: 9,
    reason: "A composed hero.",
    slop: "",
    ...falseVisualBans(),
  };
}

test("a failed usability score fails the gate when a flat average would pass", () => {
  const scores = { design: 10, usability: 6, creativity: 10, content: 10 };
  const flat = (scores.design + scores.usability + scores.creativity + scores.content) / 4;
  assert.ok(flat >= AWWWARDS_USABILITY_FLOOR);
  assert.equal(scores.design >= AWWWARDS_USABILITY_FLOOR, true);
  assert.equal(scores.creativity >= AWWWARDS_USABILITY_FLOOR, true);
  assert.equal(scores.content >= AWWWARDS_USABILITY_FLOOR, true);
  assert.equal(scores.usability < AWWWARDS_USABILITY_FLOOR, true);

  const judged = judgeBeauty([shot()], scores);
  const jury = juryFromRubric(scores, false);
  assert.ok(jury.total >= 70);
  assert.equal(jury.status, "PASS");
  assert.equal(judged.pass, false);
  assert.equal(judged.rubric.total, jury.total);
  assert.equal(judged.rubric.flatAverage, flat);
  assert.deepEqual(
    judged.rubric.subscores.map((part) => part.weight),
    [AWWWARDS_WEIGHTS.design, AWWWARDS_WEIGHTS.usability, AWWWARDS_WEIGHTS.creativity, AWWWARDS_WEIGHTS.content],
  );
  assert.deepEqual(
    judged.rubric.subscores.map((part) => part.id),
    ["design", "usability", "creativity", "content"],
  );
  assert.equal(judged.rubric.subscores[1]?.weight, 30);
  const reason = judged.failures.map((failure) => failure.reason).join(" ");
  assert.match(reason, /Usability is 6 out of 10/);
  assert.match(reason, /floor is 7/);
  assert.match(reason, /30 of 100/);
});

test("scores on the floor pass, and the jury modules share the weights", () => {
  const scores = { design: 9, usability: 7, creativity: 8, content: 8 };
  const judged = judgeBeauty([shot()], scores);
  assert.equal(judged.pass, true);
  assert.equal(judged.failures.length, 0);
  assert.equal(judged.rubric.subscores[0]?.weight, 40);
  assert.equal(judged.rubric.subscores[1]?.weight, 30);
  assert.equal(judged.rubric.subscores[2]?.weight, 20);
  assert.equal(judged.rubric.subscores[3]?.weight, 10);

  const award = readFileSync(path.join(here, "..", "src", "award-jury.ts"), "utf8");
  const patterns = readFileSync(path.join(here, "..", "src", "pattern-score.ts"), "utf8");
  const selfScore = readFileSync(path.join(here, "..", "src", "self-score.ts"), "utf8");
  assert.match(award, /juryFromRubric/);
  assert.match(patterns, /juryFromRubric/);
  assert.match(selfScore, /judgeBeauty\(\s*input\.shots,\s*scores\s*\)/);
});
