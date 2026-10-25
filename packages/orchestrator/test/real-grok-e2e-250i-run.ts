/**
 * pnpm --filter @hitchhiker/orchestrator run e2e:real
 * Sets the live flag, clears HH_CASSETTE, and runs only the flagged towel build.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hiddenChildOptions } from "@hitchhiker/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
const env: NodeJS.ProcessEnv = { ...process.env, HH_REAL_GROK_E2E: "1" };
delete env.HH_CASSETTE;
delete env.NODE_TEST_CONTEXT;

const child = spawn(
  process.execPath,
  ["--experimental-strip-types", "--test", path.join(here, "real-grok-e2e-250i.test.ts")],
  hiddenChildOptions({
    cwd: path.resolve(here, ".."),
    env,
    stdio: "inherit",
  }),
);

child.on("error", () => {
  process.exit(1);
});
child.on("exit", (code) => {
  process.exit(code ?? 1);
});
