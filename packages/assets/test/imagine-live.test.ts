import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createImagineClient } from "../src/imagine-http.ts";
import { readSpend, runBatch } from "../src/imagine-run.ts";
import type { AssetSlot } from "../src/slots.ts";

const key = (process.env.XAI_API_KEY ?? "").trim();
const live = process.env.HH_LIVE === "1" && key.length > 0;

test(
  "one low-cost still under a ten cent cap",
  { skip: live ? false : "set HH_LIVE=1 and XAI_API_KEY to call Imagine", timeout: 120_000 },
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hh-imagine-live-"));
    const slot: AssetSlot = {
      id: "live-still",
      kind: "still",
      model: "grok-imagine-image-2.0",
      prompt: "a folded green towel on a dark wood table, north window light",
      aspect: "1:1",
      n: 1,
      subjectIsReal: false,
      light: "north window",
      stillResolution: "1k-low",
    };
    try {
      const result = await runBatch([slot], {
        confirm: async () => true,
        cap: 0.1,
        spent: 0,
        client: createImagineClient(),
        projectDir: dir,
        key,
        fetchImpl: globalThis.fetch,
      });
      assert.ok(result.spent <= 0.1);
      assert.equal(result.done[0]?.status, "done");
      const file = result.done[0]?.file;
      assert.ok(file !== undefined && existsSync(file));
      const bytes = await readFile(file);
      assert.ok(bytes.byteLength > 32);
      const ledger = await readSpend(dir);
      assert.ok(ledger.spentUsd <= 0.1);
      const stored = await readFile(path.join(dir, ".hitchhiker", "assets", "spend.json"), "utf8");
      assert.equal(key.length >= 8 && stored.includes(key), false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Imagine live still failed.";
      const safe = key.length >= 8 ? message.split(key).join("[redacted]") : message;
      throw new Error(safe);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
