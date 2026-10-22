/**
 * 244d. The Elevate skill quotes the CLI usage string. `--pick` is the yes.
 * `--rounds` on an unbuilt project still refuses before a round, and it does
 * not ask for `--yes`.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ELEVATE_USAGE } from "../src/commands/elevate.ts";
import { runCli } from "../src/main.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const skillPath = path.resolve(here, "..", "..", "grok-plugin", "skills", "hh-elevate", "SKILL.md");
const helpPath = path.resolve(here, "..", "..", "grok-plugin", "skills", "hh-help", "SKILL.md");

test("the Elevate skill includes the CLI usage string and does not ask for --yes", () => {
  const skill = readFileSync(skillPath, "utf8").replace(/\r\n/g, "\n");
  const help = readFileSync(helpPath, "utf8").replace(/\r\n/g, "\n");
  assert.equal(skill.includes(ELEVATE_USAGE), true);
  assert.equal(skill.includes("--yes"), false);
  assert.equal(skill.includes("!"), false);
  assert.equal(skill.includes("\u2014"), false);
  assert.match(skill, /`--pick` is the yes|`--pick all\|none\|1,2` is the yes/);
  assert.match(skill, /Never push\. Never deploy\. Never spend without the user's yes\./);
  const elevateLine = help.split("\n").find((line) => line.includes("hh elevate"));
  assert.equal(elevateLine !== undefined, true);
  assert.equal(elevateLine?.includes("--yes"), false);
  assert.match(elevateLine ?? "", /--rounds N/);
  assert.match(elevateLine ?? "", /--pick all\|none\|1,2/);
});

test("hh elevate --rounds does not demand --yes when the project is unbuilt", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-elevate-usage-"));
  const shots = path.join(dir, ".hitchhiker", "elevate", "shots");
  mkdirSync(shots, { recursive: true });
  for (const width of [375, 768, 1440, 1920]) {
    writeFileSync(path.join(shots, `full-${width}.png`), "shot");
  }
  try {
    const result = await runCli(["elevate", "--rounds", "2", "--project", dir, "--pick", "all"]);
    assert.equal(result.exitCode, 1, result.stdout);
    assert.equal(result.stdout.includes("--yes"), false);
    assert.match(result.stdout, /Elevate refused\./);
    assert.match(result.stdout, /Missing: index\.html/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
