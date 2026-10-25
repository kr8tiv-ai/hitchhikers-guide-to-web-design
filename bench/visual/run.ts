/**
 * Hand-run visual benchmark. Not part of pnpm -r test.
 * Refuses to start unless the process argv contains --run.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { benchMayStart } from "../../packages/qa/src/visual-bench.ts";

export { benchMayStart };

export function benchCommands(briefPath: string, outDir: string): { desk: string[]; plain: string[] } {
  const model = ["-m", "grok-4.7-build-fast", "--effort", "xhigh"];
  return {
    desk: ["grok", "--no-auto-update", ...model, "--cwd", path.join(outDir, "desk"), "-p", briefPath],
    plain: ["grok", "--no-auto-update", ...model, "--cwd", path.join(outDir, "plain"), "-p", briefPath],
  };
}

function runLive(): void {
  const briefs = path.join(path.dirname(new URL(import.meta.url).pathname), "briefs");
  const out = path.join(path.dirname(new URL(import.meta.url).pathname), "results");
  const commands = benchCommands(path.join(briefs, "paradise.md"), out);
  const desk = spawnSync(commands.desk[0] ?? "grok", commands.desk.slice(1), { encoding: "utf8" });
  const plain = spawnSync(commands.plain[0] ?? "grok", commands.plain.slice(1), { encoding: "utf8" });
  console.error(`desk ${desk.status ?? "none"} plain ${plain.status ?? "none"}`);
  console.error("Import an aura.build export into bench/visual/aura before scoring. Nothing is scraped.");
}

function main(): void {
  if (!benchMayStart(process.argv)) {
    console.error("bench/visual refuses to start without --run.");
    // Node 24 on Windows aborts inside process.exit() (libuv async.c:76,
    // UV_HANDLE_CLOSING) and the status becomes 3221226505, not 2.
    process.exitCode = 2;
    return;
  }
  runLive();
}

const entry = process.argv[1];
if (entry !== undefined && path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url))) main();
