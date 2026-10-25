/**
 * 250f. CI lint runs eslint in every TypeScript package.
 * The root flat config keeps the import boundary and a minimal type-aware set.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function hasTypeScript(dir: string): boolean {
  if (!existsSync(dir)) return false;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = path.join(current, entry);
      const info = statSync(full);
      if (info.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.endsWith(".ts") || entry.endsWith(".tsx")) return true;
    }
  }
  return false;
}

function typescriptPackages(): string[] {
  const packagesDir = path.join(repoRoot, "packages");
  return readdirSync(packagesDir)
    .filter((name) => {
      const dir = path.join(packagesDir, name);
      if (!statSync(dir).isDirectory()) return false;
      if (!existsSync(path.join(dir, "package.json"))) return false;
      return hasTypeScript(path.join(dir, "src")) || hasTypeScript(path.join(dir, "test"));
    })
    .sort();
}

test("every TypeScript package defines an eslint lint script", () => {
  const missing: string[] = [];
  for (const name of typescriptPackages()) {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "packages", name, "package.json"), "utf8")) as {
      scripts?: { lint?: string };
    };
    const lint = pkg.scripts?.lint;
    if (typeof lint !== "string" || !lint.includes("eslint")) missing.push(name);
  }
  assert.deepEqual(missing, []);
});

test("root eslint config has the minimal rule set", () => {
  const config = readFileSync(path.join(repoRoot, "eslint.config.js"), "utf8");
  const root = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  const eslintVersion = root.devDependencies?.eslint;
  const tsEslintVersion = root.devDependencies?.["typescript-eslint"];
  assert.match(eslintVersion ?? "", /^\d+\.\d+\.\d+$/);
  assert.match(tsEslintVersion ?? "", /^\d+\.\d+\.\d+$/);

  for (const rule of [
    "no-restricted-imports",
    "@typescript-eslint/no-floating-promises",
    "@typescript-eslint/no-explicit-any",
    "no-debugger",
    "@typescript-eslint/no-unused-vars",
  ]) {
    assert.ok(config.includes(`"${rule}"`) || config.includes(`'${rule}'`), `missing ${rule}`);
  }

  assert.match(config, /@typescript-eslint\/no-explicit-any["']?\s*:\s*["']error["']/);
  assert.match(config, /no-debugger["']?\s*:\s*["']error["']/);
  assert.match(config, /@typescript-eslint\/no-floating-promises["']?\s*:\s*["']error["']/);
  assert.match(config, /projectService:\s*true/);
  assert.match(config, /IgnorePattern:\s*["']\^_["']/);
  assert.match(config, /["']vendor\/\*\*["']/);
  assert.match(config, /["']\*\*\/dist\/\*\*["']/);
  assert.match(config, /node_modules/);
  assert.match(config, /packages\/templates\//);

  const ruleAt = config.indexOf('"@typescript-eslint/no-floating-promises"');
  const filesAt = config.lastIndexOf("files:", ruleAt);
  const filesLine = config.slice(filesAt, config.indexOf("]", filesAt) + 1);
  assert.match(filesLine, /src\/\*\*\/\*\.ts/);
  assert.equal(filesLine.includes("test/"), false);
});
