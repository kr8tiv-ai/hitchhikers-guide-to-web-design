/**
 * Idea 25. Yes or no rows on staging, then the same rows on the live
 * domain within an hour. A live failure reopens the launch. A staging
 * pass does not waive it. The checklist does not deploy.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LAUNCH_CHECK_ROWS,
  LAUNCH_WINDOW_MS,
  judgeLaunchChecklist,
  prepareLaunchChecklist,
} from "../src/post-deploy-live.ts";

const FLOOR = {
  "horizontal-overflow": true,
  "control-under-44": true,
  "keyboard-trap": true,
  "missing-focus": true,
  "text-under-16": true,
  "contrast-under-floor": true,
  "hover-only-control": true,
  "video-autoplay-sound": true,
  "reduced-motion-hides-content": true,
  "empty-heading": true,
  "fake-testimonial": true,
} as const;

const PASS_LH = { performance: 90, accessibility: 90, bestPractices: 90, seo: 90 };
const FAIL_LH = { performance: 89, accessibility: 90, bestPractices: 90, seo: 90 };

function checklist(url: string, at: string, floor: Record<string, boolean> = { ...FLOOR }) {
  return prepareLaunchChecklist({
    url,
    at,
    floor,
    phoneLighthouse: PASS_LH,
    desktopLighthouse: PASS_LH,
    licenseFilePresent: true,
  });
}

test("the launch list is the juror floor plus lighthouse and the licence file", () => {
  assert.equal(LAUNCH_WINDOW_MS, 60 * 60 * 1000);
  assert.deepEqual(LAUNCH_CHECK_ROWS.slice(0, 11), [
    "horizontal-overflow",
    "control-under-44",
    "keyboard-trap",
    "missing-focus",
    "text-under-16",
    "contrast-under-floor",
    "hover-only-control",
    "video-autoplay-sound",
    "reduced-motion-hides-content",
    "empty-heading",
    "fake-testimonial",
  ]);
  assert.deepEqual(LAUNCH_CHECK_ROWS.slice(11), ["lighthouse-phone", "lighthouse-desktop", "license-file"]);
});

test("a staging pass and a live fail reopens the launch", () => {
  const staging = checklist("https://staging.example", "2026-10-20T12:00:00.000Z");
  const live = checklist("https://live.example", "2026-10-20T12:30:00.000Z", {
    ...FLOOR,
    "horizontal-overflow": false,
  });
  const report = judgeLaunchChecklist(staging, live);
  assert.equal(report.status, "BLOCKER");
  assert.equal(report.reopened, true);
  assert.equal(report.procedureFailed, false);
  assert.equal(report.deployed, false);
  assert.equal(report.deltaMs, 30 * 60 * 1000);
  const note = report.reasons.join("\n");
  assert.match(note, /live/i);
  assert.match(note, /horizontal-overflow/);
  assert.match(note, /staging/);
  assert.match(note, /waive/);
});

test("a gap over an hour fails the procedure even when both passed", () => {
  const staging = checklist("https://staging.example", "2026-10-20T12:00:00.000Z");
  const live = checklist("https://live.example", "2026-10-20T13:00:00.001Z");
  const report = judgeLaunchChecklist(staging, live);
  assert.equal(report.status, "BLOCKER");
  assert.equal(report.procedureFailed, true);
  assert.equal(report.reopened, false);
  assert.equal(report.deployed, false);
  assert.match(report.reasons.join("\n"), /hour/);
  assert.ok(report.rows.every((row) => row.staging && row.live));
});

test("both passes inside the hour pass", () => {
  const staging = checklist("https://staging.example", "2026-10-20T12:00:00.000Z");
  const live = checklist("https://live.example", "2026-10-20T13:00:00.000Z");
  const report = judgeLaunchChecklist(staging, live);
  assert.equal(report.status, "PASS");
  assert.equal(report.reopened, false);
  assert.equal(report.procedureFailed, false);
  assert.equal(report.deltaMs, LAUNCH_WINDOW_MS);
  assert.equal(report.rows.length, LAUNCH_CHECK_ROWS.length);
  assert.equal(report.deployed, false);
});

test("desktop lighthouse under 90 and a missing licence file are nos", () => {
  const prepared = prepareLaunchChecklist({
    url: "https://staging.example",
    at: "2026-10-20T12:00:00.000Z",
    floor: { ...FLOOR },
    phoneLighthouse: PASS_LH,
    desktopLighthouse: FAIL_LH,
    licenseFilePresent: false,
  });
  assert.equal(prepared.answers["lighthouse-phone"], true);
  assert.equal(prepared.answers["lighthouse-desktop"], false);
  assert.equal(prepared.answers["license-file"], false);
});
