// Runs on Windows, macOS, and Linux. Do not skip. Wasm load failure is a real failure.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { symbolTrace } from "../src/symbol-trace.ts";
import { setViewBox } from "../src/wordmark.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

test("vtracer traces symbol.png into an SVG path", () => {
  const pkgPath = require.resolve("@visioncortex/vtracer/package.json");
  const pkg: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
  assert.equal(typeof pkg, "object");
  assert.ok(pkg !== null);
  const record = pkg as Record<string, unknown>;
  assert.equal(record.name, "@visioncortex/vtracer");
  assert.equal(record.version, "1.0.0-alpha.4");
  assert.equal(record.license, "MIT OR Apache-2.0");

  const png = readFileSync(path.join(here, "fixtures", "symbol.png"));
  assert.ok(png.length > 8);
  assert.equal(png[0], 0x89);
  assert.equal(png[1], 0x50);
  const svg = symbolTrace(png);
  assert.equal(svg.includes("<path"), true);
  assert.equal(svg.includes("<image"), false);
  assert.equal(svg.toLowerCase().includes("foreignobject"), false);
  assert.equal(svg.includes("data:image"), false);
  assert.equal(svg.includes("<?xml"), false);
  assert.match(svg, /viewBox="0 0 32 32"/);
  assert.match(svg, /<path\b[^>]*\bd="[^"]+"/);
  assert.match(svg, /fill="#111111"/);
  const small = setViewBox(svg, 16);
  assert.match(small, /viewBox="0 0 16 16"/);
  assert.equal(small.includes("<path"), true);
  const d = small.match(/\bd="([^"]+)"/);
  assert.ok(d?.[1]);
  assert.ok(d[1].length > 0);
});
