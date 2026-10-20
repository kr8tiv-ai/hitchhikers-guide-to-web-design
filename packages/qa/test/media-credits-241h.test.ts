/**
 * Idea 12. Every image and video has an author, a source URL, and a
 * licence string in CREDITS.json. A generated image carries a prompt id
 * and is not labelled as a photograph of a real place. The licence
 * string is information only.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { auditSourcedMedia } from "../src/licenses.ts";

const PAGE = `<!doctype html><html><body>
  <img src="/images/ridge.jpg" alt="Ridge">
  <video src="/footage/valley.mp4" poster="/images/valley-poster.jpg"></video>
</body></html>`;

test("an img or video whose URL is absent from CREDITS.json fails", () => {
  const missing = auditSourcedMedia(PAGE, []);
  assert.equal(missing.ok, false);
  const note = missing.problems.join("\n");
  assert.match(note, /ridge\.jpg/);
  assert.match(note, /valley\.mp4/);
  assert.match(note, /valley-poster\.jpg/);
  assert.match(note, /CREDITS\.json/);

  const credited = auditSourcedMedia(PAGE, [
    {
      file: "/images/ridge.jpg",
      author: "Ada Lovelace",
      license: "CC-BY-4.0",
      link: "https://photos.example/ridge",
      category: "image",
    },
    {
      file: "/footage/valley.mp4",
      author: "Ada Lovelace",
      license: "CC-BY-4.0",
      link: "https://photos.example/valley.mp4",
      category: "footage",
    },
    {
      file: "/images/valley-poster.jpg",
      author: "Ada Lovelace",
      license: "CC-BY-4.0",
      link: "https://photos.example/poster",
      category: "image",
    },
  ]);
  assert.equal(credited.ok, true, credited.problems.join("\n"));
});

test("a credit needs an author, a source URL, and a licence string", () => {
  const html = `<img src="/images/ridge.jpg" alt="Ridge">`;
  const thin = auditSourcedMedia(html, [{ file: "/images/ridge.jpg", category: "image" }]);
  assert.equal(thin.ok, false);
  const note = thin.problems.join("\n");
  assert.match(note, /author/);
  assert.match(note, /source/);
  assert.match(note, /licen/);

  const recorded = auditSourcedMedia(html, [
    {
      file: "/images/ridge.jpg",
      author: "Ada Lovelace",
      license: "all rights reserved",
      link: "https://photos.example/ridge",
      category: "image",
    },
  ]);
  assert.equal(recorded.ok, true, recorded.problems.join("\n"));
});

test("a generated image has a prompt id and is not a photograph of a real place", () => {
  const html = `<img src="/images/made.jpg" alt="">`;
  const labelled = auditSourcedMedia(html, [
    {
      file: "/images/made.jpg",
      author: "Imagine",
      license: "generated",
      link: "https://imagine.example/p1",
      category: "photograph",
      generated: true,
      promptId: "p1",
      usedFor: "photograph of a real place",
    },
  ]);
  assert.equal(labelled.ok, false);
  assert.match(labelled.problems.join("\n"), /photograph/);

  const noPrompt = auditSourcedMedia(html, [
    {
      file: "/images/made.jpg",
      author: "Imagine",
      license: "generated",
      link: "https://imagine.example/p1",
      category: "generated",
      generated: true,
    },
  ]);
  assert.equal(noPrompt.ok, false);
  assert.match(noPrompt.problems.join("\n"), /prompt/);

  const credited = auditSourcedMedia(html, [
    {
      file: "/images/made.jpg",
      author: "Imagine",
      license: "generated",
      link: "https://imagine.example/p1",
      category: "generated",
      generated: true,
      promptId: "p1",
    },
  ]);
  assert.equal(credited.ok, true, credited.problems.join("\n"));
});
