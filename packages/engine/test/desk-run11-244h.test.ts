/**
 * Desk Run 11, prompt 028: a page prompt mounts features another prompt wrote.
 * The rules say a second language is written, chrome does not narrate the page,
 * and a feature does not render the listings twice. The session hears about
 * narration already on its owned page before it starts, and shared chrome is
 * left out of that list.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  clearProjectBuildRunner,
  ensureSiteBuild,
  resetSiteBuildWatch,
  saveQueue,
  setProjectBuildRunner,
  setSiteBuildGate,
  siteBuildSettled,
  type BuildSpawn,
} from "../src/index.ts";
import {
  CHROME_COPY_RULE,
  ONE_BLOCK_PER_PAGE_RULE,
  SECOND_LANGUAGE_RULE,
  SITE_RULES,
} from "../src/spec/site-rules.ts";
import { removeTempDir } from "./remove-temp.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("site rules carry the second-language, chrome-copy, and one-block rules", () => {
  assert.ok(SITE_RULES.includes(SECOND_LANGUAGE_RULE));
  assert.ok(SITE_RULES.includes(CHROME_COPY_RULE));
  assert.ok(SITE_RULES.includes(ONE_BLOCK_PER_PAGE_RULE));
  assert.match(SECOND_LANGUAGE_RULE, /never mark it TODO/);
  assert.match(ONE_BLOCK_PER_PAGE_RULE, /does not render a second copy/);
});

const FARMS = [
  "## Task",
  "",
  "Prompt 028. Build the farms-main layout on Farms.",
  "Files: src/components/SectionFarmsMain.astro, src/pages/farms.astro",
  "Requirements: REQ-STRUCT-farms-main",
  "",
  "## Design language",
  "",
  "Example only.",
  "",
].join("\n");

test("a page prompt hears about narration already on its owned page, not shared chrome", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-244h-"));
  const sessions: string[] = [];
  const spawn: BuildSpawn = (request) => {
    const file = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
    sessions.push(readFileSync(file, "utf8"));
    return { pid: 244801, done: Promise.resolve({ code: 0, stdout: "", stderr: "", errorCode: null }) };
  };
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
    mkdirSync(path.join(dir, "dist", "farms"), { recursive: true });
    mkdirSync(path.join(dir, "src", "components"), { recursive: true });
    mkdirSync(path.join(dir, "src", "pages"), { recursive: true });
    writeFileSync(path.join(dir, ".hitchhiker", "prompts", "028.md"), FARMS, "utf8");
    writeFileSync(path.join(dir, "src", "components", "SectionFarmsMain.astro"), "<h1>Farms</h1>\n", "utf8");
    writeFileSync(path.join(dir, "src", "pages", "farms.astro"), "<h1>Farms</h1>\n", "utf8");
    const chrome = "<footer><p>Pick a language for the visit, the farms, the lawyer steps, and the caretaker match. Spanish or English. You stay on this page when you switch.</p></footer>";
    writeFileSync(
      path.join(dir, "dist", "farms", "index.html"),
      `<main><p>The facts a filter needs are not written here. Each farm card shows its region, its acres, and its asking price.</p></main>${chrome}\n`,
      "utf8",
    );
    writeFileSync(path.join(dir, "dist", "index.html"), `<main><p>Calm land by the sea, with horses and a garden, and a lawyer at your side for every step.</p></main>${chrome}\n`, "utf8");
    setProjectBuildRunner(dir, spawn);
    await saveQueue(dir, { items: [{ id: "028", kind: "build", status: "queued" }] });
    await ensureSiteBuild(dir);
    const first = sessions[0] ?? "";
    assert.match(first, /Fix before you finish/);
    assert.match(first, /dist\/farms\/index\.html: .*not written here/);
    assert.equal(first.includes("You stay on this page when you switch"), false);
  } finally {
    await Promise.race([siteBuildSettled(dir).catch(() => undefined), delay(8_000)]);
    resetSiteBuildWatch(dir);
    clearProjectBuildRunner(dir);
    setSiteBuildGate(dir, null);
    removeTempDir(dir);
  }
});
