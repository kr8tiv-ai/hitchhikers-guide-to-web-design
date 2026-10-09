import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { hiddenChildOptions } from "../src/hidden-child.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CALL = /\b(?:spawnSync|execFileSync|spawn|execFile)\s*\(/g;
const LAUNCH = /\b(?:chromium|webkit|firefox)\.launch\s*\(/g;

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir: string, into: string[]): void {
  if (!isDirectory(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "e2e") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") continue;
      walk(full, into);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      into.push(full);
    }
  }
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") line += 1;
  }
  return line;
}

function callBody(source: string, openParen: number): string | null {
  let depth = 0;
  for (let cursor = openParen; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openParen, cursor + 1);
    }
  }
  return null;
}

test("hidden children stay attached on Windows and keep the console hidden", () => {
  const hidden = hiddenChildOptions({ detached: true, stdio: "ignore" as const });
  assert.equal(hidden.windowsHide, true);
  assert.equal(hidden.shell, false);
  assert.equal(hidden.stdio, "ignore");
  if (process.platform === "win32") assert.equal(hidden.detached, false);
  else assert.equal(hidden.detached, true);
  const plain = hiddenChildOptions();
  assert.equal(plain.windowsHide, true);
  assert.equal(plain.shell, false);
  assert.equal(plain.detached, false);

  const voice = readFileSync(path.join(repoRoot, "packages", "voice", "src", "hidden-child.ts"), "utf8");
  const engine = readFileSync(path.join(repoRoot, "packages", "engine", "src", "hidden-child.ts"), "utf8");
  for (const source of [voice, engine]) {
    assert.match(source, /windowsHide: true/);
    assert.match(source, /process\.platform === "win32" \? false : base\.detached === true/);
    assert.match(source, /shell: false/);
  }
});

test("every spawn in packages/*/src uses hiddenChildOptions", () => {
  const packages = path.join(repoRoot, "packages");
  const misses: string[] = [];
  for (const name of readdirSync(packages)) {
    const src = path.join(packages, name, "src");
    const files: string[] = [];
    walk(src, files);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /detached:\s*true/, path.relative(repoRoot, file));
      assert.doesNotMatch(source, /windowsHide:\s*false/, path.relative(repoRoot, file));
      for (const match of source.matchAll(CALL)) {
        const index = match.index ?? 0;
        const open = index + match[0].length - 1;
        const body = callBody(source, open);
        if (body !== null && body.includes("hiddenChildOptions")) continue;
        misses.push(`${path.relative(repoRoot, file)}:${lineOf(source, index)}`);
      }
    }
  }
  assert.deepEqual(misses, []);
});

test("playwright launches outside e2e are headless", () => {
  const packages = path.join(repoRoot, "packages");
  const misses: string[] = [];
  for (const name of readdirSync(packages)) {
    const files: string[] = [];
    walk(path.join(packages, name), files);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(LAUNCH)) {
        const index = match.index ?? 0;
        const open = index + match[0].length - 1;
        const body = callBody(source, open);
        if (body !== null && body.includes("headless: true")) continue;
        misses.push(`${path.relative(repoRoot, file)}:${lineOf(source, index)}`);
      }
    }
  }
  assert.deepEqual(misses, []);
});
