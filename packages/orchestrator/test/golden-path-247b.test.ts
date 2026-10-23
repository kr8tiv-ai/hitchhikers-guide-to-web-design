/**
 * 247b. Fixture walk of the towel sample.
 * The brief is approved in the harness. This file does not run
 * `hh brief --approve`, does not set HH_LIVE, and does not call a host.
 * The preview command lives in the cli package, which this package cannot depend on.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { hiddenChildOptions } from "@hitchhiker/engine";
import { readElevateLedger } from "@hitchhiker/qa";
import { readFlowFrom, runGoldenPath } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("towel sample walks every phase", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "hh-golden-247b-"));
  const sample = path.resolve(here, "../../../samples/towel-day.hhproject");
  try {
    const walked = await runGoldenPath({ projectDir: dir, samplePath: sample });
    assert.equal(walked.applied.length, 1);
    assert.equal(walked.refused.length, 1);
    assert.equal(existsSync(path.join(dir, walked.keptFile)), true);
    assert.equal(existsSync(path.join(dir, walked.revertedFile)), false);
    const page = readFileSync(path.join(dir, "dist", "index.html"), "utf8");
    const visible = page.replace(/<!doctype html>/i, "");
    assert.match(visible, /Mostly Towels/);
    assert.match(visible, /The shop sells towels for the home\./);
    assert.equal(visible.includes("!"), false);
    assert.equal(visible.includes("\u2014"), false);

    const ledger = await readElevateLedger(dir);
    const round = ledger.rounds.at(-1);
    assert.ok(round !== undefined);
    assert.equal(round.kept.length, 1);
    assert.equal(round.reverted.length, 1);
    const kept = round.picks.find((item) => round.kept.includes(item.id));
    const reverted = round.picks.find((item) => round.reverted.some((row) => row.id === item.id));
    assert.equal(kept?.file, "src/hero.tsx");
    assert.equal(reverted?.file, "src/footer.tsx");
    assert.equal(readFlowFrom(dir), "elevate");
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "hostinger-yes.json")), false);
    const head = await gitHead(dir);
    assert.equal(head, walked.head);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function gitHead(dir: string): Promise<string> {
  const hooks = mkdtempSync(path.join(tmpdir(), "hh-golden-hooks-"));
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-c", `core.hooksPath=${hooks.replaceAll("\\", "/")}`, "-C", dir, "rev-parse", "HEAD"],
      hiddenChildOptions({ encoding: "utf8", timeout: 30_000 }),
      (error, stdout, stderr) => {
        rmSync(hooks, { recursive: true, force: true });
        if (error) {
          reject(error instanceof Error ? error : new Error(String(stderr)));
          return;
        }
        resolve(String(stdout).trim().toLowerCase());
      },
    );
  });
}
