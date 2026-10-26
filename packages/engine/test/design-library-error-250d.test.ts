/**
 * 250d. A design library that throws during load or selection must not
 * vanish. The plan still writes prompts, and the failure is on disk,
 * in the model log, and in the design-language block.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { designLibraryArtDirection, prepareSiteBuild, setDesignLibraryDir } from "../src/guide/site-build.ts";
import { removeTempDir } from "./remove-temp.ts";

const BRIEF = `# Site Brief

## Vibe

Calm editorial paper.

## Pages

Pages: Home.
`;

const NO_ART =
  "No art direction: the design library failed to load (see library-error.txt).";

function projectDir(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-liberr-250d-"));
}

function brokenLibrary(body: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "hh-dlib-250d-"));
  const entries = path.join(root, "entries");
  mkdirSync(entries, { recursive: true });
  writeFileSync(path.join(entries, "broken.json"), body, "utf8");
  return root;
}

function thrownMessage(body: string): string {
  if (body === "{") {
    try {
      JSON.parse(body);
    } catch (error: unknown) {
      if (error instanceof Error) return error.message;
    }
  }
  return "Cannot read properties of undefined (reading 'includes')";
}

async function expectRecorded(body: string): Promise<void> {
  const dir = projectDir();
  const library = brokenLibrary(body);
  const expected = thrownMessage(body);
  setDesignLibraryDir(library);
  try {
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0, "prompts are still written");
    const promptPath = path.join(dir, ".hitchhiker", "prompts", `${ids[0]}.md`);
    assert.equal(existsSync(promptPath), true);
    const errorFile = path.join(dir, ".hitchhiker", "library-error.txt");
    const written = existsSync(errorFile) ? readFileSync(errorFile, "utf8") : "";
    assert.equal(written, `${expected}\n`, "design library errors must be written to library-error.txt");
    const logFile = path.join(dir, ".hitchhiker", "logs", "ai.ndjson");
    const log = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
    assert.match(log, /"task":"design-library"/);
    assert.match(log, /"outcome":"error"/);
    assert.equal(log.includes(expected), true);
    const prompt = readFileSync(promptPath, "utf8");
    assert.match(prompt, /## Design language/);
    assert.match(prompt, new RegExp(NO_ART.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(designLibraryArtDirection(dir), "none");
  } finally {
    setDesignLibraryDir(null);
    removeTempDir(dir);
    removeTempDir(library);
  }
}

test("a broken design library is recorded and the plan still writes prompts", async () => {
  await expectRecorded("{");
  await expectRecorded("{}\n");
  const dir = projectDir();
  setDesignLibraryDir(null);
  try {
    const ids = await prepareSiteBuild(dir, BRIEF);
    assert.ok(ids.length > 0);
    const prompt = readFileSync(path.join(dir, ".hitchhiker", "prompts", `${ids[0]}.md`), "utf8");
    assert.equal(prompt.includes(NO_ART), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "library-error.txt")), false);
    assert.equal(designLibraryArtDirection(dir), "");
  } finally {
    setDesignLibraryDir(null);
    removeTempDir(dir);
  }
});
