import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintPackClaims, parsePack } from "../src/pack.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const examplePath = path.resolve(here, "..", "packs", "example", "SKILL.md");

const validFront = `---
description: Checks pack frontmatter.
when-to-use: Use when editing a pack.
paths:
  - packages/knowledge/src/pack.ts
---
`;

function bodyAfterFrontmatter(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(close > 0, "example pack has a closing fence");
  return lines.slice(close + 1).join("\n");
}

test("the example pack loads and passes the claim linter", () => {
  const markdown = readFileSync(examplePath, "utf8");
  assert.equal(
    markdown.split(/\r?\n/).some((line) => /^effort\s*:/.test(line.trim())),
    false,
  );
  const meta = parsePack(markdown);
  assert.equal(
    meta.description,
    "Checks a knowledge pack for required frontmatter and a source after every statistic.",
  );
  assert.match(meta.whenToUse, /knowledge pack/);
  assert.deepEqual(meta.paths, [
    "packages/knowledge/src/pack.ts",
    "packages/knowledge/packs/**",
  ]);
  assert.deepEqual(lintPackClaims(bodyAfterFrontmatter(markdown)), []);
});

test("effort in frontmatter throws", () => {
  assert.throws(
    () =>
      parsePack(`${validFront.slice(0, -4)}effort: high\n---\n`),
    /Set effort on the prompt, not the skill/,
  );
});

test("a description may mention effort without setting the key", () => {
  const meta = parsePack(
    validFront.replace(
      "description: Checks pack frontmatter.",
      "description: Checks pack frontmatter and ignores the word effort.",
    ),
  );
  assert.match(meta.description, /effort/);
});

test("missing description throws", () => {
  assert.throws(
    () =>
      parsePack(`---
when-to-use: Use when editing a pack.
paths:
  - packages/knowledge/src/pack.ts
---
`),
    /missing description/,
  );
});

test("frontmatter without a closing fence throws", () => {
  assert.throws(
    () =>
      parsePack(`---
description: Checks pack frontmatter.
when-to-use: Use when editing a pack.
paths:
  - packages/knowledge/src/pack.ts
`),
    /closing ---/,
  );
});

test("paths as a single string throws", () => {
  assert.throws(
    () =>
      parsePack(`---
description: Checks pack frontmatter.
when-to-use: Use when editing a pack.
paths: packages/knowledge/src/pack.ts
---
`),
    /paths must be a list of strings/,
  );
});

test("a flow list is accepted and CRLF frontmatter parses", () => {
  const meta = parsePack(
    "---\r\ndescription: Checks pack frontmatter.\r\nwhen-to-use: Use when editing a pack.\r\npaths: [packages/knowledge/src/pack.ts, packages/knowledge/packs/**]\r\n---\r\n",
  );
  assert.deepEqual(meta.paths, [
    "packages/knowledge/src/pack.ts",
    "packages/knowledge/packs/**",
  ]);
});

test("an empty body passes the claim linter", () => {
  assert.deepEqual(lintPackClaims(""), []);
  assert.deepEqual(lintPackClaims("\n\n"), []);
});

test("a percent without Source fails", () => {
  const warnings = lintPackClaims("About 40% of drafts skip the source line.\n");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /40%/);
});

test("a percent followed by Source passes", () => {
  assert.deepEqual(
    lintPackClaims("About 40% of drafts skip the source line.\n\nSource: the fixture string.\n"),
    [],
  );
});

test("a four-digit year used as a statistic needs a source", () => {
  const warnings = lintPackClaims("A survey figure from 2019 is still quoted.\n");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0] ?? "", /2019/);
  assert.deepEqual(
    lintPackClaims("A survey figure from 2019 is still quoted.\nSource: the fixture string.\n"),
    [],
  );
});
