/**
 * BUG-046. `hh app --project` refuses the desk repo before the server listens.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DESK_REPO_REFUSAL } from "@hitchhiker/engine";
import { runCli } from "../src/main.ts";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("hh app --project refuses the desk repo and a folder inside it", async () => {
  const root = await runCli(["app", "--project", repo, "--no-open"], undefined, { env: {}, open: async () => true });
  assert.equal(root.exitCode, 1);
  assert.equal(root.stdout, "");
  assert.equal(root.stderr, `${DESK_REPO_REFUSAL}\n`);

  const nested = await runCli(["app", "--project", path.join(repo, "packages", "app"), "--no-open"], undefined, {
    env: {},
    open: async () => true,
  });
  assert.equal(nested.exitCode, 1);
  assert.equal(nested.stdout, "");
  assert.match(nested.stderr ?? "", /own source repo/);
});
