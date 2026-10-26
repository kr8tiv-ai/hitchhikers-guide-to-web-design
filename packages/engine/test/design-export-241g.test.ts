import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { designTokenTree, type DesignTokenNode } from "../src/spec/design-md-lint.ts";
import { exportDesignMd, writeDesignExports } from "../src/spec/design-export.ts";
import { renderDesignMd, writeDesignMd } from "../src/spec/design-outputs.ts";
import { removeTempDir } from "./remove-temp.ts";

const BROKEN = [
  "---",
  "colors:",
  "  ink: \"#111111\"",
  "  ink: \"#222222\"",
  "---",
  "",
  "## Overview",
  "",
  "## Colors",
  "",
  "## Typography",
  "",
  "Families: Fraunces and Instrument Sans.",
  "Ratio: 1.333",
  "",
  "## Layout",
  "",
  "## Elevation",
  "",
  "## Shapes",
  "",
  "## Components",
  "",
  "## Do's and Don'ts",
  "",
].join("\n");

function text(node: DesignTokenNode | undefined, label: string): string {
  assert.equal(typeof node, "string", label);
  return node as string;
}

function group(node: DesignTokenNode | undefined, label: string): { [key: string]: DesignTokenNode } {
  assert.equal(typeof node, "object", label);
  return node as { [key: string]: DesignTokenNode };
}

test("a valid DESIGN.md exports Tailwind v4 and DTCG from the same token tree", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-design-export-"));
  try {
    const markdown = renderDesignMd("A quiet studio with a clear first frame.");
    const tree = designTokenTree(markdown);
    const colors = group(tree.colors, "colors");
    const ink = text(colors.ink, "ink");
    const typography = group(tree.typography, "typography");
    const display = group(typography.display, "display");
    const family = text(display.fontFamily, "fontFamily");
    const fontSize = text(display.fontSize, "fontSize");
    const exported = exportDesignMd(markdown);
    assert.ok(exported);
    assert.match(exported.css, /^@theme \{\n/);
    assert.match(exported.css, new RegExp(`--color-ink: ${ink.toLowerCase()};`));
    assert.match(exported.css, new RegExp(`--font-display: "${family.replace(/"/g, "\\\"")}";`));
    assert.match(exported.css, new RegExp(`--text-display: ${fontSize.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")};`));
    assert.match(exported.css, /--leading-display: 0\.95;/);
    assert.match(exported.css, /--tracking-display: -0\.03em;/);
    assert.match(exported.css, /--radius-sm: 4px;/);
    assert.match(exported.css, /--spacing-space-1: 4px;/);
    assert.equal(exported.css.includes("!"), false);

    const dtcg = JSON.parse(exported.dtcg) as {
      $schema: string;
      color: { ink: { $value: { hex: string; components: number[] } } };
      spacing: { "space-1": { $value: { value: number; unit: string } } };
      typography: { display: { $type: string; $value: { fontFamily: string; fontSize: string } } };
    };
    assert.match(dtcg.$schema, /designtokens\.org/);
    assert.equal(dtcg.color.ink.$value.hex, ink.toLowerCase());
    assert.equal(dtcg.color.ink.$value.components.length, 3);
    assert.equal(dtcg.spacing["space-1"].$value.value, 4);
    assert.equal(dtcg.spacing["space-1"].$value.unit, "px");
    assert.equal(dtcg.typography.display.$type, "typography");
    assert.equal(dtcg.typography.display.$value.fontFamily, family);
    assert.equal(dtcg.typography.display.$value.fontSize, fontSize);

    const written = writeDesignExports(dir, markdown);
    assert.ok(written);
    assert.equal(readFileSync(written.css, "utf8"), exported.css);
    assert.equal(readFileSync(written.dtcg, "utf8"), exported.dtcg);

    const project = mkdtempSync(path.join(os.tmpdir(), "hh-design-export-write-"));
    try {
      writeDesignMd(project, "A quiet studio with a clear first frame.");
      const css = readFileSync(path.join(project, ".hitchhiker", "design", "tailwind-theme.css"), "utf8");
      const tokens = readFileSync(path.join(project, ".hitchhiker", "design", "tokens.json"), "utf8");
      assert.match(css, /--color-ink:/);
      assert.match(tokens, /"hex":/);
    } finally {
      removeTempDir(project);
    }
  } finally {
    removeTempDir(dir);
  }
});

test("a DESIGN.md that fails lint produces neither export", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-design-export-bad-"));
  try {
    assert.equal(exportDesignMd(BROKEN), null);
    assert.equal(writeDesignExports(dir, BROKEN), null);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "design", "tailwind-theme.css")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "design", "tokens.json")), false);
  } finally {
    removeTempDir(dir);
  }
});
