/**
 * Idea 11. An Elevate edit names one section and a lock list.
 * A locked section whose screenshot changes fails the edit.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { runScopedSectionEdit } from "../src/elevate-loop.ts";
import { sectionBuffersDiffer } from "../src/screenshots.ts";

test("a hero edit that rewrites the footer fails the lock", async () => {
  assert.equal(sectionBuffersDiffer(Buffer.from("footer-v1"), Buffer.from("footer-v1")), false);
  assert.equal(sectionBuffersDiffer(Buffer.from("footer-v1"), Buffer.from("footer-v2")), true);

  let hero = Buffer.from("hero-v1");
  let footer = Buffer.from("footer-v1");
  const rewritten = await runScopedSectionEdit(
    { target: "hero", lock: ["footer"] },
    {
      capture: async () => [
        { id: "hero", png: hero },
        { id: "footer", png: footer },
      ],
      apply: async () => {
        hero = Buffer.from("hero-v2");
        footer = Buffer.from("footer-v2");
      },
    },
  );
  assert.equal(rewritten.ok, false);
  assert.deepEqual(rewritten.changedLocked, ["footer"]);
  assert.match(rewritten.problems.join("\n"), /footer/);

  hero = Buffer.from("hero-v1");
  footer = Buffer.from("footer-v1");
  const kept = await runScopedSectionEdit(
    { target: "hero", lock: ["footer"] },
    {
      capture: async () => [
        { id: "hero", png: hero },
        { id: "footer", png: footer },
      ],
      apply: async () => {
        hero = Buffer.from("hero-v2");
      },
    },
  );
  assert.equal(kept.ok, true, kept.problems.join("\n"));
  assert.deepEqual(kept.changedLocked, []);
});

test("an edit with no target does not apply", async () => {
  let ran = false;
  const report = await runScopedSectionEdit(
    { target: " ", lock: ["footer"] },
    {
      capture: async () => [],
      apply: async () => {
        ran = true;
      },
    },
  );
  assert.equal(report.ok, false);
  assert.equal(ran, false);
  assert.match(report.problems.join("\n"), /target/);
});
