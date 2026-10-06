import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { think, type JsonSchema } from "../src/index.ts";

const live = process.env.HH_LIVE === "1";

const schema: JsonSchema = {
  type: "object",
  required: ["greeting", "ok"],
  properties: {
    greeting: { type: "string", maxLength: 80 },
    ok: { type: "boolean" },
  },
};

test(
  "live smoke returns a two-field object",
  { skip: live ? false : "set HH_LIVE=1 to call the installed grok CLI" },
  async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "hh-live-"));
    const env: NodeJS.ProcessEnv = { ...process.env, HH_CASSETTE: "off" };
    delete env.GROK_HOME;
    try {
      const result = await think<{ greeting: string; ok: boolean }>(
        {
          task: "live-smoke",
          input:
            "Return one JSON object. Set greeting to the single word hello. Set ok to true. Do not add other words.",
          schema,
          effort: "medium",
          maxTurns: 1,
        },
        {
          projectDir: dir,
          cassetteDir: path.join(dir, "cassettes"),
          env,
        },
      );
      assert.equal(typeof result.value.greeting, "string");
      assert.ok(result.value.greeting.length > 0);
      assert.equal(result.value.ok, true);
      assert.equal(result.cassette, "live");
      assert.equal(result.durationMs >= 0, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
