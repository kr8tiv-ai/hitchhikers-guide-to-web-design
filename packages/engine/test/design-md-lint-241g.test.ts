/**
 * Idea 8. DESIGN.md lint: section order, token refs, no duplicate keys.
 * Typography carries the families and the type scale ratio.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { lintDesignMd } from "../src/spec/design-md-lint.ts";
import { renderDesignMd } from "../src/spec/design-outputs.ts";

const BRUTALIST = ["## Vibe", "", "A brutalist poster.", ""].join("\n");

const PASSING = [
  "---",
  "colors:",
  "  ink: \"#111111\"",
  "  paper: \"#f4f1ea\"",
  "components:",
  "  button:",
  "    backgroundColor: \"{colors.ink}\"",
  "    textColor: \"{colors.paper}\"",
  "---",
  "",
  "## Overview",
  "",
  "A quiet system.",
  "",
  "## Colors",
  "",
  "Ink on paper.",
  "",
  "## Typography",
  "",
  "Families: Fraunces and Instrument Sans.",
  "Ratio: 1.333 (perfect fourth).",
  "",
  "## Layout",
  "",
  "A single column.",
  "",
  "## Elevation",
  "",
  "Flat.",
  "",
  "## Shapes",
  "",
  "A 4px corner.",
  "",
  "## Components",
  "",
  "One button.",
  "",
  "## Do's and Don'ts",
  "",
  "Remix the tokens.",
  "",
].join("\n");

test("a duplicated color key fails and the required section order passes", () => {
  const duplicated = PASSING.replace("  ink: \"#111111\"", "  ink: \"#111111\"\n  ink: \"#000000\"");
  const failed = lintDesignMd(duplicated);
  assert.equal(failed.ok, false);
  assert.equal(
    failed.errors.some((error) => error.rule === "duplicate-key" && error.message.includes("colors.ink")),
    true,
  );

  const passed = lintDesignMd(PASSING);
  assert.equal(passed.ok, true, passed.errors.map((error) => error.message).join(" "));

  const swapped = PASSING.replace("## Overview\n\nA quiet system.\n\n## Colors", "## Colors\n\nInk on paper.\n\n## Overview");
  const disorder = lintDesignMd(swapped);
  assert.equal(disorder.ok, false);
  assert.equal(disorder.errors.some((error) => error.rule === "section-order"), true);

  const broken = PASSING.replace("{colors.ink}", "{colors.missing}");
  const missing = lintDesignMd(broken);
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.some((error) => error.rule === "broken-ref" && error.message.includes("colors.missing")), true);
});

test("writeDesignMd output passes the lint and names the families in Typography", () => {
  const design = renderDesignMd(BRUTALIST);
  const lint = lintDesignMd(design);
  assert.equal(lint.ok, true, lint.errors.map((error) => error.message).join(" "));
  const typography = design.split("## Typography")[1]?.split("## ")[0] ?? "";
  assert.match(typography, /Families: Tanker and Cabinet Grotesk\./);
  assert.match(typography, /Ratio: 1\.5/);
  assert.equal(design.includes("!"), false);
});
