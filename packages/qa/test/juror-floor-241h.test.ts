/**
 * Idea 21. The floor runs before Elevate. Each row is a yes or a no
 * with Playwright or axe evidence, and each row can fail on its own.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { BODY_CONTRAST_MIN } from "../src/a11y-gate.ts";
import { runElevateAfterJurorFloor } from "../src/elevate-loop.ts";
import { JUROR_FLOOR_ROWS, measureJurorFloor, type JurorSample } from "../src/juror-floor.ts";
import { PRIMARY_TARGET_MIN } from "../src/mobile-checks.ts";
import { TYPE_MIN_BODY_PX } from "../src/type-gate.ts";

function clean(): JurorSample {
  return {
    scrollWidth: 390,
    clientWidth: 390,
    controls: [{ width: PRIMARY_TARGET_MIN, height: PRIMARY_TARGET_MIN }],
    keyboardTrap: false,
    missingFocus: false,
    textPx: [TYPE_MIN_BODY_PX],
    contrastRatio: BODY_CONTRAST_MIN,
    hoverOnlyControls: 0,
    videos: [{ autoplay: true, muted: true }],
    reducedMotionHidesContent: false,
    headings: ["Valley"],
    fakeTestimonials: false,
  };
}

test("a clean page gives every juror row a yes", () => {
  assert.equal(PRIMARY_TARGET_MIN, 44);
  assert.equal(TYPE_MIN_BODY_PX, 16);
  assert.equal(BODY_CONTRAST_MIN, 4.5);
  const report = measureJurorFloor(clean());
  assert.deepEqual(
    report.rows.map((row) => row.id),
    [...JUROR_FLOOR_ROWS],
  );
  assert.equal(report.ok, true, report.rows.filter((row) => !row.yes).map((row) => row.evidence).join("\n"));
  for (const row of report.rows) {
    assert.equal(row.yes, true, row.id);
    assert.match(row.evidence, /Playwright|axe/);
    assert.equal(row.evidence.includes("!"), false, row.evidence);
  }
});

test("each checklist row fails on its own fixture", () => {
  const cases: { id: (typeof JUROR_FLOOR_ROWS)[number]; patch: (sample: JurorSample) => void }[] = [
    { id: "horizontal-overflow", patch: (sample) => { sample.scrollWidth = sample.clientWidth + 1; } },
    { id: "control-under-44", patch: (sample) => { sample.controls = [{ width: PRIMARY_TARGET_MIN - 1, height: PRIMARY_TARGET_MIN }]; } },
    { id: "keyboard-trap", patch: (sample) => { sample.keyboardTrap = true; } },
    { id: "missing-focus", patch: (sample) => { sample.missingFocus = true; } },
    { id: "text-under-16", patch: (sample) => { sample.textPx = [TYPE_MIN_BODY_PX - 1]; } },
    { id: "contrast-under-floor", patch: (sample) => { sample.contrastRatio = BODY_CONTRAST_MIN - 0.01; } },
    { id: "hover-only-control", patch: (sample) => { sample.hoverOnlyControls = 1; } },
    { id: "video-autoplay-sound", patch: (sample) => { sample.videos = [{ autoplay: true, muted: false }]; } },
    { id: "reduced-motion-hides-content", patch: (sample) => { sample.reducedMotionHidesContent = true; } },
    { id: "empty-heading", patch: (sample) => { sample.headings = [" "]; } },
    { id: "fake-testimonial", patch: (sample) => { sample.fakeTestimonials = true; } },
  ];
  assert.deepEqual(cases.map((item) => item.id), [...JUROR_FLOOR_ROWS]);
  for (const item of cases) {
    const sample = clean();
    item.patch(sample);
    const report = measureJurorFloor(sample);
    const row = report.rows.find((entry) => entry.id === item.id);
    assert.ok(row, item.id);
    assert.equal(row.yes, false, `${item.id}: ${row.evidence}`);
    assert.equal(report.ok, false, item.id);
    const others = report.rows.filter((entry) => entry.id !== item.id);
    assert.ok(others.every((entry) => entry.yes), `${item.id} took another row with it`);
  }
});

test("Elevate does not start when the floor fails", async () => {
  const sample = clean();
  sample.scrollWidth = sample.clientWidth + 40;
  const floor = measureJurorFloor(sample);
  let started = false;
  const blocked = await runElevateAfterJurorFloor(floor, async () => {
    started = true;
    return "ran";
  });
  assert.equal(blocked.started, false);
  assert.equal(blocked.value, null);
  assert.equal(started, false);

  const allowed = await runElevateAfterJurorFloor(measureJurorFloor(clean()), async () => "ran");
  assert.equal(allowed.started, true);
  assert.equal(allowed.value, "ran");
});
