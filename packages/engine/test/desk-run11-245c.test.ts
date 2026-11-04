/**
 * 245c. DESIGN.md tokens stay in the shape the CDP assertion layer reads.
 * The layer itself lives in @hitchhiker/qa. The engine does not import that
 * package. Type sizes are clamp() expressions, not a single pixel ladder.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { typeScaleFor } from "../src/brand/type-scale.ts";
import { designSectionBody, designTokenTree } from "../src/spec/design-md-lint.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const TIMEOUT = 5_000;

const DESIGN = `---
name: "Sample"
colors:
  paper: "#f4f1ea"
  ink: "#1a1a1a"
typography:
  display:
    fontFamily: "General Sans"
    fontSize: "64px"
  body:
    fontFamily: "Satoshi"
    fontSize: "18px"
spacing:
  space-4: "16px"
  space-7: "64px"
---

## Typography

Families: General Sans and Satoshi.
Ratio: 1.25 (major third).

- display: 64px, line-height 0.95
- body: 18px, line-height 1.5
`;

function qa(relative: string): string {
  return readFileSync(path.join(repo, "packages", "qa", relative), "utf8");
}

test("designTokenTree exposes the families, colours, and spacing CDP checks read", { timeout: TIMEOUT }, () => {
  const tree = designTokenTree(DESIGN);
  const typography = tree.typography;
  const colors = tree.colors;
  const spacing = tree.spacing;
  assert.equal(typeof typography, "object");
  assert.equal(typeof colors, "object");
  assert.equal(typeof spacing, "object");
  if (typeof typography === "string" || typeof colors === "string" || typeof spacing === "string") {
    assert.fail("token groups are maps");
  }
  const display = typography.display;
  const body = typography.body;
  assert.equal(typeof display, "object");
  assert.equal(typeof body, "object");
  if (typeof display === "string" || typeof body === "string") assert.fail("roles are maps");
  assert.equal(display.fontFamily, "General Sans");
  assert.equal(body.fontFamily, "Satoshi");
  assert.equal(colors.ink, "#1a1a1a");
  assert.equal(spacing["space-4"], "16px");
  const prose = designSectionBody(DESIGN, "Typography") ?? "";
  assert.match(prose, /Families: General Sans and Satoshi/);
  assert.match(prose, /64px/);
});

test("the type scale written into DESIGN.md is a clamp(), which CDP evaluates at the viewport", { timeout: TIMEOUT }, () => {
  const scale = typeScaleFor("An editorial visit.");
  assert.match(scale.display, /^clamp\(/);
  assert.match(scale.heading, /^clamp\(/);
  assert.match(scale.body, /^clamp\(/);
  assert.equal(scale.display.includes("px"), false);
});

test("the qa package exports the CDP assertion layer and does not add a qa command", { timeout: TIMEOUT }, () => {
  const assertions = qa("src/cdp-assertions.ts");
  const runner = qa("src/cdp-runner.ts");
  const index = qa("src/index.ts");
  const commands = readFileSync(path.join(repo, "packages", "cli", "src", "commands-table.ts"), "utf8");
  assert.match(assertions, /export function evaluateCollectedFacts/);
  assert.match(assertions, /export function assertionsFromDesign/);
  assert.match(assertions, /export function summaryForModel/);
  assert.match(assertions, /export interface CdpAssertionReport/);
  assert.match(assertions, /export interface Finding/);
  assert.match(runner, /export async function runCdpAssertions/);
  assert.match(runner, /newCDPSession/);
  assert.match(runner, /CSS\.getComputedStyleForNode/);
  assert.match(runner, /4175/);
  assert.match(runner, /375, 768, 1440/);
  assert.match(index, /evaluateCollectedFacts/);
  assert.match(index, /runCdpAssertions/);
  assert.equal(commands.includes('"qa"'), false);
});
