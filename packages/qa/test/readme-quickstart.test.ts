import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

/**
 * Clone steps in first-run order.
 * The pnpm pin is the root packageManager field, not a second copy of the version.
 */
function cloneCommands(packageManager: string): readonly string[] {
  return [
    "Node >=22.18",
    "corepack enable",
    `corepack prepare ${packageManager} --activate`,
    "pnpm install",
    "pnpm exec hh doctor",
    "pnpm exec hh app --project <dir> --no-open",
  ];
}

function readPackageManager(root: string): string {
  const parsed: unknown = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("packageManager" in parsed)) {
    throw new Error("root package.json is missing packageManager");
  }
  const manager = parsed.packageManager;
  if (typeof manager !== "string" || !/^pnpm@\d+\.\d+\.\d+$/.test(manager)) {
    throw new Error(`packageManager is not a pnpm pin: ${String(manager)}`);
  }
  return manager;
}

function quickStart(markdown: string): string {
  const heading = "## Quick start";
  const start = markdown.indexOf(heading);
  const end = markdown.indexOf("\n## ", start + heading.length);
  assert.ok(start >= 0, "README is missing ## Quick start");
  assert.ok(end > start, "README is missing the section after Quick start");
  return markdown.slice(start, end);
}

/** A positive claim that a published CLI, with no clone, opens the desk. */
function loneCliClaim(markdown: string): string | null {
  const patterns = [
    /desk (?:starts|runs) from (?:a )?lone cli install/i,
    /lone cli install (?:starts|runs|opens)/i,
    /npx hitchhikers-guide` runs/i,
    /with no arguments it starts the local app/i,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(markdown);
    if (found !== null && found[0] !== undefined) return found[0];
  }
  return null;
}

test("README quick start is a git clone, not an npm package", () => {
  const markdown = readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const manager = readPackageManager(repoRoot);
  const section = quickStart(markdown);
  const commands = cloneCommands(manager);
  assert.equal(commands.length, 6);

  let cursor = 0;
  for (const command of commands) {
    const at = section.indexOf(command, cursor);
    assert.ok(at >= cursor, `quick start missing or reordered: ${command}`);
    cursor = at + command.length;
  }

  const npxLines = markdown.split(/\r?\n/).filter((line) => line.includes("npx hitchhikers-guide"));
  assert.equal(npxLines.length, 1);
  const npxLine = npxLines[0] ?? "";
  const folded = npxLine.toLowerCase();
  assert.ok(
    folded.includes("future") || folded.includes("not yet published"),
    `npx line is not a future note: ${npxLine}`,
  );

  const claim = loneCliClaim(markdown);
  assert.equal(claim, null, `README claims a lone CLI install: ${claim ?? ""}`);
});
