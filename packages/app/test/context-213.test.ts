/**
 * Desk routes write facts through the context module.
 * The route file does not name the memory files itself.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const routes = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/server/routes.ts"), "utf8");

test("routes write facts through the context module", () => {
  for (const name of ["DECISIONS.md", "ASSETS.md", "CONTEXT-SUMMARY.md", "PROJECT.md"]) {
    assert.equal(routes.includes(name), false, name);
  }
  assert.match(routes, /recordAsset|syncAnswer/);
});
