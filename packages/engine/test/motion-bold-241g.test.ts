import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMotionModule } from "../src/spec/design-outputs.ts";
import { lintMotionSource } from "../src/spec/motion.ts";

const REDUCED = "export const motionReduced = { opacity: 1, yPercent: 0, duration: 0 } as const;";

const NAMED = [
  'export const boldThing = "Soft parallax on the hero." as const;',
  'export const orchestratedMoment = { id: "hero", kind: "timeline" } as const;',
  REDUCED,
].join("\n");

function scrolls(count: number): string {
  return Array.from({ length: count }, (_, index) => {
    return `gsap.to(".s${index}", { y: 20, duration: 1, scrollTrigger: { trigger: ".s${index}" } });`;
  }).join("\n");
}

test("a motion file with zero named moments fails", () => {
  const report = lintMotionSource(`${REDUCED}\n`);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.some((reason) => /bold/i.test(reason)));
  assert.ok(report.reasons.some((reason) => /timeline/i.test(reason)));
  assert.equal(report.reasons.some((reason) => reason.includes("!")), false);
});

test("five unrelated scroll effects and no single timeline fail", () => {
  const report = lintMotionSource(`${scrolls(5)}\n${REDUCED}\n`);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.some((reason) => /unrelated scroll/i.test(reason)));
  assert.ok(report.reasons.some((reason) => /timeline/i.test(reason)));
});

test("one bold thing, one timeline, and a short opacity tween pass", () => {
  const report = lintMotionSource(`${NAMED}\ngsap.to(".keep", { opacity: 0, duration: 0.15 });\n`);
  assert.equal(report.ok, true, report.reasons.join(" | "));
  const atCeiling = lintMotionSource(`${NAMED}\ngsap.to(".keep", { opacity: 0, duration: 200 });\n`);
  assert.equal(atCeiling.ok, true, atCeiling.reasons.join(" | "));
});

test("an opacity tween longer than 200 ms fails", () => {
  const report = lintMotionSource(`${NAMED}\ngsap.to(".keep", { opacity: 0, duration: 0.8 });\n`);
  assert.equal(report.ok, false);
  assert.ok(report.reasons.some((reason) => /200/i.test(reason)));
});

test("hiding the page fails even when one moment is named", () => {
  const hidden = lintMotionSource(`${NAMED}\ngsap.set(".keep", { display: "none" });\n`);
  assert.equal(hidden.ok, false);
  assert.ok(hidden.reasons.some((reason) => /display|visibility|complete/i.test(reason)));
  const collapsed = lintMotionSource(`${NAMED}\ngsap.set(".keep", { visibility: "hidden" });\n`);
  assert.equal(collapsed.ok, false);
});

test("renderMotionModule names exactly one bold thing and one orchestrated timeline", () => {
  const source = renderMotionModule(
    ["## Vibe", "", "Calm editorial, warm and specific.", "", "## Motion", "", "Motion score: 2.", ""].join("\n"),
    [],
    ["hero", "story"],
  );
  const report = lintMotionSource(source);
  assert.equal(report.ok, true, report.reasons.join(" | "));
  assert.equal((source.match(/export const boldThing = /g) ?? []).length, 1);
  assert.equal((source.match(/export const orchestratedMoment = /g) ?? []).length, 1);
  assert.match(source, /kind: "timeline"/);
  assert.match(
    source,
    /export const boldThing = "(?:Soft parallax on the hero\.|A signature hero island\. You choose the boundary and the library\.|A designed hero with a clear first frame\.)" as const;/,
  );
  assert.equal(source.includes("!"), false);
  assert.equal((source.match(/\bgsap\.timeline\s*\(/g) ?? []).length, 0);
});
