/**
 * 245v. The signature gate checks the locked hook, competition, and a
 * designed reduced-motion fallback. No browser and no network.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkSignature } from "../src/signature-gate.ts";
import { removeTempDir } from "./remove-temp.ts";

const TIMEOUT = 5_000;

test("a present moment passes, a missing hook fails, and a second pinned hero competes unless it is an echo", { timeout: TIMEOUT }, () => {
  const empty = tempDir();
  const present = tempDir();
  const missing = tempDir();
  const competing = tempDir();
  const echoed = tempDir();
  const hidden = tempDir();
  try {
    assert.deepEqual(checkSignature(empty, empty), []);

    writeMoment(present, "none");
    writeHost(present, { hook: true, opacity: "1" });
    assert.deepEqual(checkSignature(present, present), []);
    const overBudget = checkSignature(present, { root: present, measures: [{ id: "dusk-turn", frameMs: 40 }] });
    assert.equal(overBudget.some((failure) => failure.code === "budget" && /maxFrameMs/.test(failure.message)), true);

    writeMoment(missing, "none");
    writeHost(missing, { hook: false, opacity: "1" });
    const missingFailures = checkSignature(missing, missing);
    assert.equal(
      missingFailures.some((failure) => failure.code === "missing-hook" && failure.message.includes('data-signature="dusk-turn"')),
      true,
    );

    writeMoment(competing, "none");
    writeHost(competing, { hook: true, opacity: "1" });
    writeStory(competing);
    const competed = checkSignature(competing, competing);
    const competedText = competed.map((failure) => failure.message).join("\n");
    assert.match(competedText, /competes with pinned motion in src\/sections\/story\.ts:\d+/);

    writeMoment(echoed, "about/story");
    writeHost(echoed, { hook: true, opacity: "1" });
    writeStory(echoed);
    assert.deepEqual(checkSignature(echoed, echoed), []);

    writeMoment(hidden, "none");
    writeHost(hidden, { hook: true, opacity: "0" });
    const hiddenFailures = checkSignature(hidden, hidden);
    assert.equal(hiddenFailures.some((failure) => failure.kind === "optical.reducedMotion" && /opacity 0/.test(failure.message)), true);
  } finally {
    for (const dir of [empty, present, missing, competing, echoed, hidden]) removeTempDir(dir);
  }
});

function writeMoment(dir: string, echoes: string): void {
  mkdirSync(dir, { recursive: true });
  const echoLine = echoes === "none" ? "none" : echoes;
  writeFileSync(path.join(dir, "DESIGN.md"), [
    "## Brand idea",
    "",
    "The window holds the day. The brand idea stays in that turn.",
    "",
    "## Signature moments",
    "",
    "### dusk-turn",
    "",
    "- id: dusk-turn",
    "- name: The window turns",
    "- description: The window turns with the day. The brand idea stays in that turn.",
    "- section: home/hero",
    "- recipe: pinnedTimeline",
    "- approach: Pin the hero and scrub opacity with pinnedTimeline. Asset: reference/refs/still.png.",
    "- fallback: The still frame stays fully visible at opacity 1.",
    "- budget: maxJsKb 24, maxFrameMs 8, lcp 2.5, cls 0.05",
    `- echoes: ${echoLine}`,
    "",
  ].join("\n"), "utf8");
}

const MOTION_SPECIFIER = ["@hitchhiker", "design-system", "motion"].join("/");

function writeHost(dir: string, options: { hook: boolean; opacity: string }): void {
  const hook = options.hook ? ' data-signature="dusk-turn"' : "";
  const file = path.join(dir, "src", "sections", "hero.ts");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, [
    `import { pinnedTimeline } from "${MOTION_SPECIFIER}";`,
    "",
    "export function hero(progress: number): void {",
    '  window.addEventListener("scroll", () => progress);',
    "  pinnedTimeline(progress);",
    "}",
    "",
    `export const markup = \`<section data-section="home/hero"${hook}></section>\`;`,
    "",
    "export const css = `",
    "@media (prefers-reduced-motion: reduce) {",
    `  [data-signature="dusk-turn"] { opacity: ${options.opacity}; }`,
    "}",
    "`;",
    "",
  ].join("\n"), "utf8");
}

function writeStory(dir: string): void {
  const file = path.join(dir, "src", "sections", "story.ts");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, [
    `import { pinnedTimeline } from "${MOTION_SPECIFIER}";`,
    'export const markup = `<section data-section="about/story"></section>`;',
    "export const motion = pinnedTimeline;",
    "",
  ].join("\n"), "utf8");
}

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-245v-gate-"));
}
