/**
 * Audit 13, imagery half. One grade across the page. An image whose URL
 * is missing from CREDITS.json fails the licence check.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkImageryGrade, GRADE_AXIS_TOLERANCE } from "../src/imagery-grade.ts";
import { auditImageCredits } from "../src/licenses.ts";

const PAGE = `<!doctype html><html><body>
  <img src="/images/ridge.jpg" alt="Ridge above the valley">
  <img src="/images/valley.jpg" alt="Valley floor">
</body></html>`;

test("images on one page share a single grade", () => {
  assert.ok(GRADE_AXIS_TOLERANCE > 0);
  assert.ok(GRADE_AXIS_TOLERANCE <= 0.15);

  const same = checkImageryGrade([
    { src: "/images/ridge.jpg", temperature: 0.82, contrast: 0.48, saturation: 0.28 },
    { src: "/images/valley.jpg", temperature: 0.8, contrast: 0.5, saturation: 0.3 },
  ]);
  assert.equal(same.ok, true, same.problems.join("\n"));
  assert.equal(same.problems.length, 0);
  assert.match(same.grade, /warm/);
  assert.match(same.grade, /muted/);

  const mixed = checkImageryGrade([
    { src: "/images/ridge.jpg", temperature: 0.82, contrast: 0.48, saturation: 0.28 },
    { src: "/images/neon.jpg", temperature: 0.1, contrast: 0.9, saturation: 0.95 },
  ]);
  assert.equal(mixed.ok, false);
  const note = mixed.problems.join("\n");
  assert.match(note, /\/images\/neon\.jpg/);
  assert.match(note, /grade/);
  assert.equal(note.includes("!"), false);
});

test("a fixture image missing from CREDITS.json fails licenses.ts", () => {
  const missing = auditImageCredits(PAGE, { assets: [] });
  assert.equal(missing.ok, false);
  const note = missing.problems.join("\n");
  assert.match(note, /ridge\.jpg/);
  assert.match(note, /valley\.jpg/);
  assert.match(note, /CREDITS\.json/);

  const credited = auditImageCredits(PAGE, [
    {
      name: "Ridge",
      author: "Ada Lovelace",
      license: "CC-BY-4.0",
      link: "https://photos.example/ridge",
      file: "/images/ridge.jpg",
      usedFor: "hero",
      category: "image",
    },
    {
      name: "Valley",
      author: "Ada Lovelace",
      license: "CC0-1.0",
      link: "https://photos.example/valley",
      file: "images/valley.jpg",
      usedFor: "section",
      category: "image",
    },
  ]);
  assert.equal(credited.ok, true, credited.problems.join("\n"));
});
