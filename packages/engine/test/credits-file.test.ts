import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertMediaLicense,
  creditLine,
  parseCredits,
  type CreditPageEntry,
} from "../src/index.ts";

function row(model: ReturnType<typeof parseCredits>, index: number): CreditPageEntry {
  const entry = model.entries[index];
  assert.ok(entry, `row ${index} missing`);
  return entry;
}

test("CC0 and CC0-1.0 are public domain and the writer spelling stays", () => {
  const assets = parseCredits(
    JSON.stringify({
      assets: [
        { file: "mark.svg", source: "https://example.com/mark.svg", license: "CC0", author: "Desk", url: "https://example.com/mark.svg" },
        {
          file: "mark-hd.svg",
          source: "https://example.com/mark-hd.svg",
          license: "CC0-1.0",
          author: "Desk",
          url: "https://cdn.example/mark-hd.svg",
          name: "HD mark",
          usedFor: "header",
        },
      ],
    }),
  );
  const cc0 = row(assets, 0);
  assert.equal(cc0.publicDomain, true);
  assert.equal(cc0.license, "CC0");
  assert.equal(cc0.licence, "CC0");
  assert.equal(cc0.origin, "assets");
  assert.equal(creditLine(cc0), "mark.svg. Desk. CC0. https://example.com/mark.svg.");
  const hd = row(assets, 1);
  assert.equal(hd.publicDomain, true);
  assert.equal(hd.license, "CC0-1.0");
  assert.equal(hd.name, "HD mark");
  assert.equal(hd.usedFor, "header");
  assert.equal(hd.url, "https://cdn.example/mark-hd.svg");
  assert.match(creditLine(hd), /CC0-1\.0/);
  assert.match(creditLine(hd), /https:\/\/cdn\.example\/mark-hd\.svg/);
  assert.match(creditLine(hd), /Used for header/);
  assert.equal(parseCredits(JSON.stringify({ assets: [] })).entries.length, 0);
});

test("a 3D array and an entries file keep every writer field", () => {
  const array = parseCredits(
    JSON.stringify([
      {
        name: "Test triangle",
        author: "Hitchhiker Guide test fixture",
        license: "CC0-1.0",
        link: "https://example.com/triangle",
        usedFor: "optimizer fixture",
        category: "3D models",
        sha256: "abc",
      },
    ]),
  );
  const model = row(array, 0);
  assert.equal(model.origin, "array");
  assert.equal(model.publicDomain, true);
  assert.equal(model.name, "Test triangle");
  assert.equal(model.author, "Hitchhiker Guide test fixture");
  assert.equal(model.license, "CC0-1.0");
  assert.equal(model.link, "https://example.com/triangle");
  assert.equal(model.usedFor, "optimizer fixture");
  assert.equal(model.category, "3D models");
  assert.equal(model.sha256, "abc");
  assert.equal(
    creditLine(model),
    "Test triangle. Hitchhiker Guide test fixture. CC0-1.0. https://example.com/triangle. Used for optimizer fixture. 3D models. sha256 abc.",
  );

  const entries = parseCredits(
    JSON.stringify({
      entries: [
        {
          name: "realesrgan-ncnn-vulkan.exe",
          url: "https://example.test/runner",
          sha256: "abc123",
          licence: "MIT",
          category: "Code and libraries",
        },
      ],
    }),
  );
  const tool = row(entries, 0);
  assert.equal(tool.origin, "entries");
  assert.equal(tool.publicDomain, false);
  assert.equal(tool.name, "realesrgan-ncnn-vulkan.exe");
  assert.equal(tool.url, "https://example.test/runner");
  assert.equal(tool.sha256, "abc123");
  assert.equal(tool.licence, "MIT");
  assert.equal(tool.license, "MIT");
  assert.equal(tool.category, "Code and libraries");
  assert.match(creditLine(tool), /realesrgan-ncnn-vulkan\.exe/);
  assert.match(creditLine(tool), /MIT/);
  assert.match(creditLine(tool), /sha256 abc123/);
  assert.match(creditLine(tool), /Code and libraries/);

  const both = parseCredits(
    JSON.stringify({
      assets: [{ file: "mark.svg", source: "https://example.com/mark.svg", license: "CC-BY-4.0", author: "Ada" }],
      entries: [
        {
          name: "runner",
          url: "https://example.test/runner",
          sha256: "ff",
          licence: "BSD-3-Clause",
          category: "Code and libraries",
        },
      ],
    }),
  );
  assert.equal(both.entries.length, 2);
  assert.equal(both.entries[0]?.origin, "assets");
  assert.equal(both.entries[0]?.publicDomain, false);
  assert.equal(both.entries[1]?.origin, "entries");
  assert.equal(both.entries[1]?.licence, "BSD-3-Clause");

  assert.throws(() => assertMediaLicense("GPL-3.0", "nope.png"), /Allowed licenses are CC0 and CC-BY-4.0/);
  assertMediaLicense("CC0-1.0", "mark.svg");
  assertMediaLicense("CC0", "mark.svg");
});
