/**
 * 245e. A direction pick writes .hitchhiker/design/variants.json.
 * The desk shows that ranking beside the pick. Scaffold copies the primitives.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { rankVariants } from "@hitchhiker/design-system";
import { chooseDirection, readDirectionDeal } from "../src/brand/directions.ts";
import { writeBrandKit } from "../src/brand/kit-from-interview.ts";
import { styleWorldFrom } from "../src/spec/art-direction.ts";
import { scaffoldProject } from "../src/spec/scaffold.ts";
import { readVariantRanking, variantRankingHtml, writeVariantRanking } from "../src/spec/variant-rank.ts";
import { removeTempDir } from "./remove-temp.ts";

const TIMEOUT = 15_000;
const here = path.dirname(fileURLToPath(import.meta.url));
const BRIEF = ["# Site brief", "", "An editorial magazine about quiet farms and paper margins.", ""].join("\n");
const SITEMAP = [
  "# Sitemap",
  "## Primary",
  "- Home at /",
  "  - hero",
  "  - story",
  "- Visit at /visit",
  "  - contact",
  "## Footer",
  "- Privacy at /privacy",
  "  - policy",
  "",
].join("\n");
const COMPONENTS = [
  "Hero.astro",
  "Feature.astro",
  "Gallery.astro",
  "Quote.astro",
  "CTA.astro",
  "Steps.astro",
  "Listing.astro",
  "FAQ.astro",
  "Contact.astro",
  "Footer.astro",
  "Nav.astro",
];

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-245e-"));
}

function project(): string {
  const dir = tempDir();
  writeBrandKit(dir, []);
  writeFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), BRIEF, "utf8");
  writeFileSync(path.join(dir, ".hitchhiker", "sitemap.md"), SITEMAP, "utf8");
  return dir;
}

test("an editorial pick writes variants.json and the desk shows it", { timeout: TIMEOUT }, () => {
  const dir = project();
  try {
    const written = writeVariantRanking(dir, { name: "Quiet margins", description: "A centred essay." });
    const hero = written.find((row) => row.page === "Home" && row.section === "hero");
    assert.ok(hero);
    assert.ok(hero.variant === "statement" || hero.variant === "split-editorial");
    assert.equal(hero.variant, "statement");
    assert.equal(hero.alternatives.some((item) => item.id === hero.variant), false);
    assert.ok(hero.alternatives.every((item) => item.id !== "" && !item.reason.includes("\n")));
    assert.equal(written.find((row) => row.section === "story")?.variant, "split");
    assert.equal(written.find((row) => row.section === "contact")?.variant, "split");
    assert.equal(written.find((row) => row.section === "policy")?.variant, "split");

    const raw = readFileSync(path.join(dir, ".hitchhiker", "design", "variants.json"), "utf8");
    assert.equal(raw.endsWith("\n"), true);
    assert.deepEqual(readVariantRanking(dir), written);

    const deal = readDirectionDeal(dir);
    assert.ok(deal);
    const first = deal.directions[0];
    assert.ok(first);
    chooseDirection(dir, first.id, "The quieter page fits the brief.");
    const brief = readFileSync(path.join(dir, ".hitchhiker", "SITE-BRIEF.md"), "utf8");
    const directionText = [first.name, first.description]
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter((part) => part !== "")
      .join(". ");
    const expected = rankVariants(styleWorldFrom(`${brief}\n${directionText}`), directionText, "hero", brief)[0]?.id;
    const picked = readVariantRanking(dir)?.find((row) => row.page === "Home" && row.section === "hero");
    assert.equal(picked?.variant, expected);
    const html = variantRankingHtml(dir);
    assert.match(html, /data-variant-ranking/);
    assert.match(html, /data-variant-pick/);
    assert.match(html, new RegExp(`data-variant="${picked?.variant ?? ""}"`));

    const desk = readFileSync(path.resolve(here, "..", "..", "app", "src", "server", "direction-desk.ts"), "utf8");
    const pickedAt = desk.indexOf("Picked ${escapeHtml(name)}");
    const rankAt = desk.indexOf("variantRankingHtml(projectDir)");
    assert.ok(pickedAt >= 0 && rankAt > pickedAt);
  } finally {
    removeTempDir(dir);
  }
});

test("scaffold copies the section primitives beside the spine", { timeout: TIMEOUT }, async () => {
  const dir = tempDir();
  try {
    writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: "night-stall", dependencies: { astro: "5.0.0" } }, null, 2)}\n`,
      "utf8",
    );
    const written = await scaffoldProject(dir, {
      name: "Night Stall",
      siteWhy: "The stall exists so regulars can find the tea.",
      hosting: "Hostinger",
    });
    assert.deepEqual(
      written,
      ["PROJECT.md", "REQUIREMENTS.md", "ROADMAP.md", "STATE.md"].map((name) => path.join(".hitchhiker", name)),
    );
    for (const name of COMPONENTS) {
      const file = path.join(dir, "src", "components", name);
      assert.equal(existsSync(file), true, name);
      const source = readFileSync(file, "utf8");
      assert.match(source, /data-section="/);
      assert.match(source, /data-variant=\{variant\}/);
      for (const slot of ["eyebrow", "title", "body", "media", "actions"]) {
        assert.match(source, new RegExp(`<slot name="${slot}" />`));
      }
    }
    assert.equal(existsSync(path.join(dir, "src", "components", "sections.css")), true);
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    assert.equal(pkg.dependencies["@hitchhiker/design-system"], "workspace:*");
    assert.equal(pkg.dependencies.astro, "5.0.0");
  } finally {
    removeTempDir(dir);
  }
});

test("a missing sitemap still records a home hero", { timeout: TIMEOUT }, () => {
  const dir = tempDir();
  try {
    mkdirSync(dir, { recursive: true });
    const rows = writeVariantRanking(dir, { name: "Quiet margins", description: "A centred essay." });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.page, "Home");
    assert.equal(rows[0]?.section, "hero");
    assert.equal(rows[0]?.variant, "statement");
    assert.equal(variantRankingHtml(path.join(dir, "missing")), "");
  } finally {
    removeTempDir(dir);
  }
});
