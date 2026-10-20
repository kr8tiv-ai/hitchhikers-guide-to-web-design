/**
 * BUG-054 audit 6. Vision exposes one boolean per type and Prompt 23 ban.
 * Any true fails judgeBeauty with that ban's name.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ThinkRequest } from "@hitchhiker/engine";
import { judgeBeauty, type SectionShot } from "../src/beauty-gate.ts";
import {
  VISUAL_BAN_KEYS,
  VISUAL_BAN_REASONS,
  falseVisualBans,
  zaphodReview,
  type SitePrompt,
  type VisualBans,
} from "../src/zaphod-vision.ts";

const TRUTH = "The towel sits in the hero shot.";
const PILLARS = ["copy", "visuals", "color", "type", "spacing", "experience", "motion", "brand"] as const;

function shot(bans: Partial<VisualBans> = {}): SectionShot {
  return {
    page: "home",
    section: "hero",
    screenshot: ".hitchhiker/review/home-hero.png",
    textOnly: false,
    todoImage: false,
    placeholderImage: false,
    score: 9,
    reason: "Layered media and a real type scale.",
    slop: "",
    ...falseVisualBans(),
    ...bans,
  };
}

function prompt(): SitePrompt {
  return {
    id: "010",
    kind: "build",
    body: `<must_haves>\ntruths:\n- ${TRUTH}\n</must_haves>\n`,
  };
}

function reviewValue(bans: Partial<VisualBans> = {}): Record<string, unknown> {
  return {
    truths: [{ truth: TRUTH, note: "The towel sits in the hero shot." }],
    pillars: PILLARS.map((name) => ({ name, status: "PASS", note: `${name} holds.` })),
    jury: { brand: 9, craft: 9, clarity: 9, performance: 9 },
    boots: true,
    copy: "A quiet towel page.",
    ...falseVisualBans(),
    ...bans,
  };
}

test("a clean vision result exposes every ban as false and passes beauty", async () => {
  const seen: ThinkRequest<unknown>[] = [];
  const verdict = await zaphodReview(
    { prompt: prompt(), shots: [], diff: "" },
    {
      think: async (request) => {
        seen.push(request);
        return { value: reviewValue(), raw: "{}", durationMs: 1, cassette: "hit" };
      },
    },
  );
  for (const key of VISUAL_BAN_KEYS) {
    assert.equal(verdict[key], false, key);
  }
  const required = seen[0]?.schema?.required ?? [];
  for (const key of VISUAL_BAN_KEYS) {
    assert.equal(required.includes(key), true, key);
  }
  const judged = judgeBeauty([shot()]);
  assert.equal(judged.pass, true);
});

test("each vision ban fails judgeBeauty with its named reason", () => {
  for (const key of VISUAL_BAN_KEYS) {
    const judged = judgeBeauty([shot({ [key]: true })]);
    assert.equal(judged.pass, false, key);
    assert.equal(judged.failures.length, 1, key);
    assert.equal(judged.failures[0]?.reason, VISUAL_BAN_REASONS[key], key);
  }
});

test("a true ban on the vision result is exposed and blocks beauty", async () => {
  for (const key of VISUAL_BAN_KEYS) {
    const verdict = await zaphodReview(
      {
        prompt: prompt(),
        shots: [".hitchhiker/review/home-hero.png"],
        diff: "",
        askSections: [{ page: "home", section: "hero" }],
      },
      {
        think: async () => ({
          value: {
            ...reviewValue({ [key]: true }),
            sections: [
              {
                page: "home",
                section: "hero",
                score: 9,
                reason: "The hero is in frame.",
                textOnly: false,
                todoImage: false,
                placeholderImage: false,
                slop: "",
                ...falseVisualBans(),
                [key]: true,
              },
            ],
          },
          raw: "{}",
          durationMs: 1,
          cassette: "hit",
        }),
      },
    );
    assert.equal(verdict[key], true, key);
    assert.equal(verdict.sections[0]?.[key], true, key);
    const judged = judgeBeauty([
      {
        ...verdict.sections[0],
        screenshot: ".hitchhiker/review/home-hero.png",
      } as SectionShot,
    ]);
    assert.equal(judged.pass, false, key);
    assert.equal(judged.failures[0]?.reason, VISUAL_BAN_REASONS[key], key);
  }
});
