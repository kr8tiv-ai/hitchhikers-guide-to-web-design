import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintSlop } from "../src/antislop.ts";
import { checkTruths } from "../src/goal-backward.ts";
import { summarizePillars, type PillarName, type PillarStatus } from "../src/pillars.ts";
import { decideReview } from "../src/verdict.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const EIGHT: readonly PillarName[] = [
  "copy",
  "visuals",
  "color",
  "type",
  "spacing",
  "experience",
  "motion",
  "brand",
];

type TruthStatus = "FOUND" | "MISSING";
type Worst = "PASS" | "FIX" | "BLOCKER";

interface ReviewInput {
  truthStatuses: TruthStatus[];
  worstPillar: Worst;
  slopHits: number;
  fixRound: number;
  boots: boolean;
}

function clean(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    truthStatuses: overrides.truthStatuses ?? ["FOUND"],
    worstPillar: overrides.worstPillar ?? "PASS",
    slopHits: overrides.slopHits ?? 0,
    fixRound: overrides.fixRound ?? 0,
    boots: overrides.boots ?? true,
  };
}

function pillarRows(
  overrides: Partial<Record<PillarName, PillarStatus>> = {},
): Array<{ name: PillarName; status: PillarStatus; note: string }> {
  return EIGHT.map((name) => ({
    name,
    status: overrides[name] ?? "PASS",
    note: `${name} holds in the review.`,
  }));
}

test("a clean input passes at every allowed round", () => {
  for (const fixRound of [0, 1, 2]) {
    const result = decideReview(clean({ fixRound, truthStatuses: ["FOUND", "FOUND"] }));
    assert.equal(result.verdict, "PASS");
    assert.deepEqual(result.reasons, []);
  }
});

test("a MISSING truth at round 0 with boots true is FIX", () => {
  const result = decideReview(clean({ truthStatuses: ["FOUND", "MISSING"], fixRound: 0 }));
  assert.equal(result.verdict, "FIX");
  assert.deepEqual(result.reasons, ["truthStatuses[1] is MISSING."]);
});

test("a MISSING truth at round 1 is still FIX", () => {
  const result = decideReview(clean({ truthStatuses: ["MISSING"], fixRound: 1 }));
  assert.equal(result.verdict, "FIX");
  assert.deepEqual(result.reasons, ["truthStatuses[0] is MISSING."]);
});

test("a booting site with a MISSING truth at round 2 is a known issue", () => {
  const input = clean({ truthStatuses: ["FOUND", "MISSING"], fixRound: 0 });
  const first = decideReview(input);
  const third = decideReview({ ...input, fixRound: 2 });
  assert.equal(first.verdict, "FIX");
  assert.equal(third.verdict, "PASS_WITH_KNOWN_ISSUES");
  assert.deepEqual(third.reasons, first.reasons);
  assert.deepEqual(third.reasons, ["truthStatuses[1] is MISSING."]);
});

test("a BLOCKER escalates at round 0 even when the site boots", () => {
  const result = decideReview(clean({ worstPillar: "BLOCKER", fixRound: 0 }));
  assert.equal(result.verdict, "ESCALATE");
  assert.deepEqual(result.reasons, ["worstPillar is BLOCKER."]);
});

test("a BLOCKER at round 2 stays ESCALATE", () => {
  const result = decideReview(
    clean({
      truthStatuses: ["MISSING"],
      worstPillar: "BLOCKER",
      slopHits: 2,
      fixRound: 2,
      boots: true,
    }),
  );
  assert.equal(result.verdict, "ESCALATE");
  assert.deepEqual(result.reasons, [
    "truthStatuses[0] is MISSING.",
    "worstPillar is BLOCKER.",
    "slopHits is 2.",
  ]);
});

test("boots false escalates even when every other field passes", () => {
  const result = decideReview(clean({ boots: false, fixRound: 0 }));
  assert.equal(result.verdict, "ESCALATE");
  assert.deepEqual(result.reasons, ["boots is false."]);
});

test("boots false at round 2 is ESCALATE, not a known issue", () => {
  const result = decideReview(
    clean({ truthStatuses: ["MISSING"], worstPillar: "FIX", slopHits: 1, fixRound: 2, boots: false }),
  );
  assert.equal(result.verdict, "ESCALATE");
  assert.deepEqual(result.reasons, [
    "truthStatuses[0] is MISSING.",
    "worstPillar is FIX.",
    "slopHits is 1.",
    "boots is false.",
  ]);
});

test("slopHits above 0 is FIX until the round cap, then a known issue", () => {
  const early = decideReview(clean({ slopHits: 3, fixRound: 0 }));
  const mid = decideReview(clean({ slopHits: 3, fixRound: 1 }));
  const capped = decideReview(clean({ slopHits: 3, fixRound: 2 }));
  assert.equal(early.verdict, "FIX");
  assert.equal(mid.verdict, "FIX");
  assert.equal(capped.verdict, "PASS_WITH_KNOWN_ISSUES");
  assert.deepEqual(capped.reasons, ["slopHits is 3."]);
});

test("a FIX pillar follows the same round cap", () => {
  assert.equal(decideReview(clean({ worstPillar: "FIX", fixRound: 0 })).verdict, "FIX");
  assert.equal(decideReview(clean({ worstPillar: "FIX", fixRound: 1 })).verdict, "FIX");
  const capped = decideReview(clean({ worstPillar: "FIX", fixRound: 2 }));
  assert.equal(capped.verdict, "PASS_WITH_KNOWN_ISSUES");
  assert.deepEqual(capped.reasons, ["worstPillar is FIX."]);
});

test("several failures are all named, and round 0 still asks for a fix", () => {
  const result = decideReview(
    clean({
      truthStatuses: ["MISSING", "FOUND", "MISSING"],
      worstPillar: "FIX",
      slopHits: 4,
      fixRound: 0,
    }),
  );
  assert.equal(result.verdict, "FIX");
  assert.deepEqual(result.reasons, [
    "truthStatuses[0] is MISSING.",
    "truthStatuses[2] is MISSING.",
    "worstPillar is FIX.",
    "slopHits is 4.",
  ]);
  for (const reason of result.reasons) {
    assert.equal(reason.includes("!"), false);
  }
});

test("fixRound 2 never returns FIX, and earlier rounds never return a known issue", () => {
  const pillars: Worst[] = ["PASS", "FIX", "BLOCKER"];
  const lists: TruthStatus[][] = [["FOUND"], ["MISSING"], ["FOUND", "MISSING", "FOUND"]];
  for (const fixRound of [0, 1, 2]) {
    for (const worstPillar of pillars) {
      for (const slopHits of [0, 2]) {
        for (const boots of [true, false]) {
          for (const truthStatuses of lists) {
            const result = decideReview(
              clean({ truthStatuses: [...truthStatuses], worstPillar, slopHits, fixRound, boots }),
            );
            for (const reason of result.reasons) {
              assert.equal(reason.includes("!"), false);
            }
            if (result.verdict === "PASS") {
              assert.deepEqual(result.reasons, []);
              assert.equal(boots, true);
              assert.equal(worstPillar, "PASS");
              assert.equal(slopHits, 0);
              assert.equal(
                truthStatuses.every((status) => status === "FOUND"),
                true,
              );
            } else {
              assert.ok(result.reasons.length > 0);
            }
            if (fixRound === 2) assert.notEqual(result.verdict, "FIX");
            if (fixRound < 2) assert.notEqual(result.verdict, "PASS_WITH_KNOWN_ISSUES");
            if (worstPillar === "BLOCKER" || boots === false) {
              assert.equal(result.verdict, "ESCALATE");
            }
          }
        }
      }
    }
  }
});

test("an empty truth list throws", () => {
  assert.throws(
    () => decideReview(clean({ truthStatuses: [] })),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /truthStatuses is empty/);
      assert.equal(err.message.includes("!"), false);
      return true;
    },
  );
});

test("a truth status outside the union throws", () => {
  assert.throws(
    () =>
      decideReview(
        clean({ truthStatuses: ["FOUND", "GAP"] as Array<"FOUND" | "MISSING"> }),
      ),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /GAP/);
      assert.match(err.message, /FOUND or MISSING/);
      return true;
    },
  );
});

test("fixRound 3 throws because the caller should have stopped", () => {
  for (const fixRound of [-1, 1.5, 3, 4]) {
    assert.throws(
      () => decideReview(clean({ fixRound })),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, new RegExp(`fixRound is ${fixRound}`));
        assert.match(err.message, /The caller should have stopped/);
        assert.equal(err.message.includes("!"), false);
        return true;
      },
    );
  }
});

test("a bad pillar, slop count, or boots value throws", () => {
  assert.throws(
    () => decideReview(clean({ worstPillar: "MAYBE" as Worst })),
    /worstPillar is "MAYBE"/,
  );
  assert.throws(() => decideReview(clean({ slopHits: -1 })), /slopHits is -1/);
  assert.throws(() => decideReview(clean({ slopHits: 1.5 })), /slopHits is 1\.5/);
  assert.throws(() => decideReview(clean({ slopHits: Number.NaN })), /slopHits is NaN/);
  assert.throws(
    () => decideReview({ ...clean(), boots: "yes" as unknown as boolean }),
    /boots is "yes"/,
  );
});

test("decideReview does not mutate its input", () => {
  const input = clean({ truthStatuses: ["MISSING", "FOUND"], worstPillar: "FIX", slopHits: 1 });
  const snapshot = structuredClone(input);
  decideReview(input);
  assert.deepEqual(input, snapshot);
});

test("evidence from checkTruths, summarizePillars, and lintSlop decides the verdict", () => {
  const found = checkTruths(
    ["Hero headline is visible at 375px."],
    [{ truth: "Hero headline is visible at 375px.", note: "Seen above the fold in the 375px shot." }],
  );
  const missing = checkTruths(
    ["Hero headline is visible at 375px."],
    [{ truth: "Hero headline is visible at 375px.", note: "ok" }],
  );
  const passingPillars = summarizePillars(pillarRows());
  const fixingPillars = summarizePillars(pillarRows({ copy: "FIX" }));
  const cleanHits = lintSlop("Where is the maple floor?", "site");
  const slop = lintSlop("Lorem ipsum sits in the hero.", "site");

  const passed = decideReview({
    truthStatuses: found.map((row) => row.status),
    worstPillar: passingPillars.worst,
    slopHits: cleanHits.length,
    fixRound: 0,
    boots: true,
  });
  assert.equal(passed.verdict, "PASS");

  const shared = {
    truthStatuses: missing.map((row) => row.status),
    worstPillar: fixingPillars.worst,
    slopHits: slop.length,
    boots: true,
  };
  assert.equal(decideReview({ ...shared, fixRound: 0 }).verdict, "FIX");
  assert.equal(decideReview({ ...shared, fixRound: 2 }).verdict, "PASS_WITH_KNOWN_ISSUES");
  assert.equal(missing[0]?.status, "MISSING");
  assert.equal(fixingPillars.worst, "FIX");
  assert.ok(slop.length > 0);
});

test("the verdict source does not edit files or apply a fix", () => {
  const source = readFileSync(path.join(here, "..", "src", "verdict.ts"), "utf8");
  assert.match(source, /export function decideReview/);
  assert.match(source, /checkTruths/);
  assert.match(source, /summarizePillars/);
  assert.match(source, /lintSlop/);
  assert.doesNotMatch(source, /checkTruths\s*\(/);
  assert.doesNotMatch(source, /summarizePillars\s*\(/);
  assert.doesNotMatch(source, /lintSlop\s*\(/);
  assert.doesNotMatch(source, /node:fs|node:child_process|writeFile|appendFile|createWriteStream/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});
