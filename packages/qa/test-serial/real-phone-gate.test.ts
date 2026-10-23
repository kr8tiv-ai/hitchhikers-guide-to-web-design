/**
 * Real Chrome plus Lighthouse. The qa test script runs this file after
 * the other tests, with concurrency 1, so a busy CPU cannot stretch the trace.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { rmSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { captureReviewShots, startFixtureSite } from "../src/playwright-opener.ts";
import { runGates } from "../src/site-once-over.ts";

function points(score: number): number {
  return score <= 1 ? score * 100 : score;
}

describe("real phone gate", { concurrency: false }, () => {
  test("a dead preview fails closed", { timeout: 300_000 }, async () => {
    const server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    const result = await runGates(`http://127.0.0.1:${address.port}/`, ["/"]);
    assert.equal(result.pass, false);
    assert.equal(result.lighthouse[0]?.status, "BLOCKER");
    assert.equal(result.lighthouse[0]?.scores, null);
    assert.ok(result.console.errors > 0);
    assert.ok(result.console.failedRequests > 0);
  });

  test("the starter fixture clears the real phone gates", { timeout: 600_000 }, async () => {
    const site = await startFixtureSite();
    const shotsDir = await mkdtemp(path.join(os.tmpdir(), "hh-shots-"));
    try {
      assert.match(site.url, /^https:\/\/127\.0\.0\.1:\d+$/);
      const gates = await runGates(`${site.url}/`, ["/", "/credits"]);
      const shots = await captureReviewShots(`${site.url}/`, ["main"], shotsDir);
      assert.equal(shots.length, 16);
      for (const file of shots) assert.ok(statSync(file).size > 0);
      const detail = JSON.stringify(
        {
          lighthouse: gates.lighthouse,
          axe: {
            status: gates.axe.status,
            notes: gates.axe.notes,
            violations: gates.axe.violations,
            keyboard: gates.axe.keyboard,
            reducedMotion: gates.axe.reducedMotion,
            contrastRatio: gates.axe.contrastRatio,
          },
          console: gates.console,
          links: { broken: gates.links.broken, bytes: gates.links.bytes, pass: gates.links.pass },
          weight: gates.weight,
        },
        null,
        2,
      );
      assert.equal(gates.console.errors, 0, detail);
      assert.equal(gates.console.failedRequests, 0, detail);
      assert.equal(gates.axe.status, "PASS", detail);
      assert.equal(gates.axe.keyboard, true, detail);
      assert.equal(gates.axe.reducedMotion, true, detail);
      assert.ok(gates.axe.contrastRatio >= 4.5, detail);
      assert.deepEqual(gates.links.broken, [], detail);
      assert.equal(gates.weight.status, "PASS", detail);
      assert.ok(gates.weight.bytes > 0 && gates.weight.bytes <= 1_500_000, detail);
      for (const row of gates.lighthouse) {
        assert.equal(row.status, "PASS", `${row.route} ${row.reasons.join(" | ")}`);
        assert.ok(row.scores !== null);
        assert.ok(row.runs >= 3, row.route);
        const scores = row.scores;
        for (const score of [scores.performance, scores.accessibility, scores.bestPractices, scores.seo]) {
          assert.ok(points(score) >= 90, `${row.route} ${score}`);
        }
      }
      assert.equal(gates.pass, true, detail);
    } finally {
      await site.close();
      rmSync(shotsDir, { recursive: true, force: true });
    }
  });
});
