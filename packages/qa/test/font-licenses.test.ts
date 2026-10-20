import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { auditDeps, auditFontHandoffDir } from "../src/licenses.ts";

function handoff(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-font-license-"));
}

function writeCredits(dir: string, rows: unknown): void {
  writeFileSync(path.join(dir, "CREDITS.json"), JSON.stringify(rows), "utf8");
}

function writeFace(dir: string, family: string, fileName: string, withOfl: boolean): void {
  const folder = path.join(dir, "fonts", family);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, fileName), "woff2");
  if (withOfl) writeFileSync(path.join(folder, "OFL.txt"), "SIL Open Font License");
}

test("npm auditDeps still rejects GPL and still allows MIT", () => {
  assert.equal(auditDeps([{ name: "copyleft", license: "GPL-3.0-only" }]).ok, false);
  assert.equal(auditDeps([{ name: "ok", license: "MIT" }]).ok, true);
});

test("an OFL face with OFL.txt and a linked Fontshare face with no file pass", () => {
  const dir = handoff();
  writeFace(dir, "Fraunces", "Fraunces.woff2", true);
  writeCredits(dir, [
    {
      name: "Fraunces",
      author: "Undercase Type",
      license: "OFL-1.1",
      link: "https://github.com/google/fonts/blob/main/ofl/fraunces/OFL.txt",
      usedFor: "headlines",
      category: "Fonts",
    },
    {
      name: "Satoshi",
      author: "Indian Type Foundry",
      license: "ITF-FFL",
      link: "https://www.fontshare.com/fonts/satoshi",
      usedFor: "text",
      category: "Fonts",
    },
  ]);
  const result = auditFontHandoffDir(dir);
  assert.deepEqual(result.problems, []);
  assert.equal(result.ok, true);
});

test("a vendored Fontshare FFL file fails", () => {
  const dir = handoff();
  writeFace(dir, "Satoshi", "Satoshi.woff2", false);
  writeCredits(dir, {
    fonts: [
      {
        name: "Satoshi",
        author: "Indian Type Foundry",
        license: "ITF-FFL",
        link: "https://www.fontshare.com/licenses/itf-ffl",
        usedFor: "text",
        category: "Fonts",
      },
    ],
  });
  const result = auditFontHandoffDir(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /Satoshi vendors a Fontshare FFL file/);
});

test("Fraunces without OFL.txt fails", () => {
  const dir = handoff();
  writeFace(dir, "Fraunces", "Fraunces.woff2", false);
  writeCredits(dir, [
    {
      name: "Fraunces",
      author: "Undercase Type",
      license: "OFL-1.1",
      link: "https://github.com/google/fonts/blob/main/ofl/fraunces/OFL.txt",
      usedFor: "headlines",
      category: "Fonts",
    },
  ]);
  const result = auditFontHandoffDir(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /Fraunces ships without OFL\.txt/);
});

test("a Pangram face without a paid flag fails, and a paid flag does not", () => {
  const open = handoff();
  writeCredits(open, [
    {
      name: "Editorial New",
      author: "Pangram Pangram",
      license: "personal-trial",
      link: "https://pangrampangram.com/pages/faq",
      usedFor: "reference",
      category: "Fonts",
    },
  ]);
  const blocked = auditFontHandoffDir(open);
  assert.equal(blocked.ok, false);
  assert.match(blocked.problems.join("\n"), /Editorial New is a Pangram trial face without a paid license/);

  const paid = handoff();
  writeCredits(paid, [
    {
      name: "Editorial New",
      author: "Pangram Pangram",
      license: "paid",
      link: "https://pangrampangram.com/",
      usedFor: "headlines",
      category: "Fonts",
      paid: true,
    },
  ]);
  assert.equal(auditFontHandoffDir(paid).ok, true);
});

test("a shipped family missing from CREDITS.json fails", () => {
  const dir = handoff();
  writeFace(dir, "Literata", "Literata.woff2", true);
  writeCredits(dir, []);
  const result = auditFontHandoffDir(dir);
  assert.equal(result.ok, false);
  assert.match(result.problems.join("\n"), /Literata is missing from CREDITS\.json/);
});
