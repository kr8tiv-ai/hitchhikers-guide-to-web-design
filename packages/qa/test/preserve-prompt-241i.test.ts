/**
 * BUG-058 idea 33. Elevate and redesign prompts start with the preserve
 * sentence and the lock list. A prompt that omits the sentence does not
 * call the model. The sentence is a fixture so it cannot drift.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ThinkResult } from "@hitchhiker/engine";
import { planElevateModel, type ElevateColdRead } from "../src/elevate.ts";
import {
  PRESERVE_FUNCTIONALITY,
  callModelIfPreserved,
  elevatePickPrompt,
  redesignPrompt,
  runRedesignPrompt,
  withPreservePrompt,
} from "../src/preserve-prompt.ts";

const fixture = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "preserve-functionality.txt"),
  "utf8",
).trim();

function coldRead(): ElevateColdRead {
  return {
    shots: ["shots/375.png", "shots/768.png", "shots/1440.png", "shots/1920.png"],
    code: "export function Hero() { return null; }",
    brand: "Paper and ink.",
    voice: "Short sentences.",
    motion: "One still on the phone.",
  };
}

test("the preserve sentence is the fixture and the lock list follows it", () => {
  assert.equal(PRESERVE_FUNCTIONALITY, fixture);
  assert.equal(
    withPreservePrompt("Change the hero type.", ["footer", "nav"]),
    `${fixture}\nLock list: footer, nav.\n\nChange the hero type.\n`,
  );
  const pick = elevatePickPrompt("type and spacing", "Change the display size in type.css.");
  assert.equal(pick.startsWith(`${fixture}\n`), true);
  assert.match(pick, /Lock list: motion, imagery, copy, standout feature\./);
  assert.equal(pick.includes("type and spacing"), false);
  const redesign = redesignPrompt("type", "Set the display face in type.css.", ["footer", "nav"]);
  assert.equal(redesign.startsWith(`${fixture}\nLock list: footer, nav.\n`), true);
  assert.match(redesign, /Step: type\./);
});

test("a prompt that omits the sentence does not call the model", async () => {
  let calls = 0;
  const skipped = await callModelIfPreserved("Change the hero type.", async () => {
    calls += 1;
    return "ran";
  });
  assert.equal(skipped.called, false);
  assert.equal(skipped.value, null);
  assert.equal(calls, 0);

  const ran = await callModelIfPreserved(withPreservePrompt("Change the hero type.", ["footer"]), async () => {
    calls += 1;
    return "ran";
  });
  assert.equal(ran.called, true);
  assert.equal(ran.value, "ran");
  assert.equal(calls, 1);

  let redesignCalls = 0;
  const step = await runRedesignPrompt("color", "Keep the paper hex.", ["footer"], async () => {
    redesignCalls += 1;
  });
  assert.equal(step.called, true);
  assert.equal(redesignCalls, 1);
  assert.equal(step.prompt.startsWith(`${fixture}\n`), true);

  const omitted = await callModelIfPreserved(step.prompt.replace(fixture, "Please rewrite the page."), async () => {
    redesignCalls += 1;
  });
  assert.equal(omitted.called, false);
  assert.equal(redesignCalls, 1);
});

test("the elevate plan prompt starts with the fixture and still asks at xhigh", async () => {
  const seen: { input: string; effort: string | undefined }[] = [];
  const result = await planElevateModel(coldRead(), {
    think: (request) => {
      seen.push({ input: request.input, effort: request.effort });
      const value: ThinkResult<unknown> = {
        value: { upgrades: [] },
        raw: "{}",
        durationMs: 1,
        cassette: "hit",
      };
      return Promise.resolve(value);
    },
  });
  assert.equal(result.items.length, 0);
  const request = seen[0];
  assert.ok(request);
  assert.equal(request.effort, "xhigh");
  assert.equal(request.input.startsWith(`${fixture}\nLock list: none.\n`), true);
  assert.equal(request.input.includes("How could I possibly improve this?"), true);
});
