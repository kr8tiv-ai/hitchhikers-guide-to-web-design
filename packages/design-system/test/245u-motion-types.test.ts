/**
 * 245u. Recipe options typecheck, and every motion file passes checkRecipes.
 * The checker is loaded by file URL. This package does not depend on qa.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const motionDir = path.resolve(here, "..", "src", "motion");
const TIMEOUT = 20_000;

const RECIPES = [
  "pinned-timeline.ts",
  "horizontal-track.ts",
  "kinetic-type.ts",
  "scroll-camera.ts",
  "preloader-handoff.ts",
  "frame-sequence.ts",
  "page-transition.ts",
  "batch-reveal.ts",
  "parallax-layers.ts",
  "snap-to-labels.ts",
  "micro-interactions.ts",
  "setup.ts",
] as const;

interface RecipeFinding {
  file: string;
  rule: string;
  detail: string;
}

test("motion recipe files pass checkRecipes with zero findings", { timeout: 5_000 }, async () => {
  const names = readdirSync(motionDir).filter((name) => name.endsWith(".ts")).sort();
  for (const required of RECIPES) assert.equal(names.includes(required), true, required);
  const href = pathToFileURL(path.resolve(here, "..", "..", "qa", "src", "recipe-check.ts")).href;
  const loaded = (await import(href)) as {
    checkRecipes: (source: string, file?: string) => RecipeFinding[];
  };
  for (const name of names) {
    const source = readFileSync(path.join(motionDir, name), "utf8");
    const findings = loaded.checkRecipes(source, name);
    assert.deepEqual(
      findings.map((finding) => `${finding.rule}: ${finding.detail}`),
      [],
      name,
    );
  }

  const index = readFileSync(path.resolve(here, "..", "src", "index.ts"), "utf8");
  assert.equal(/from\s+["']gsap["']/.test(index), false);
  assert.equal(/from\s+["']lenis["']/.test(index), false);
  assert.equal(/recipes\//.test(index), false);

  const pkg = JSON.parse(readFileSync(path.resolve(here, "..", "package.json"), "utf8")) as {
    exports: Record<string, string>;
  };
  assert.equal(pkg.exports["./motion"], "./src/motion/index.ts");
});

test("recipe options and MotionHandle typecheck", { timeout: TIMEOUT }, () => {
  const ts = createRequire(path.join(repoRoot, "package.json"))("typescript") as typeof import("typescript");
  const fixture = path.resolve(here, "245u-motion-types.fixture.ts");
  const ambient = path.resolve(here, "..", "src", "ambient.d.ts");
  const configPath = path.resolve(here, "..", "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(read.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
  const options = { ...parsed.options, noEmit: true };
  delete options.rootDir;
  delete options.outDir;
  options.composite = false;
  options.declaration = false;
  options.emitDeclarationOnly = false;
  const program = ts.createProgram({
    rootNames: [fixture, ambient],
    options,
  });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => {
      const file = diagnostic.file?.fileName ?? "";
      return !file.includes("node_modules");
    })
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const file = diagnostic.file;
      if (file === undefined || diagnostic.start === undefined) return message;
      const pos = file.getLineAndCharacterOfPosition(diagnostic.start);
      const rel = path.relative(repoRoot, file.fileName);
      return `${rel}:${pos.line + 1}:${pos.character + 1} ${message}`;
    });
  assert.deepEqual(diagnostics, []);
});
