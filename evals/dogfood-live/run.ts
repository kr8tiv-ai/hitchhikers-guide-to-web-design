/**
 * Opt-in live dogfood for a small Towel and Tea site.
 *
 * Runs only when HH_LIVE is exactly "1". CI must leave that variable unset.
 * The report records per-prompt duration and token counts for prompt 118.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GrokMissingError, defaultConfig } from "../../packages/engine/src/index.ts";
import {
  LiveUsageLimitError,
  liveDogfoodEnabled,
  liveGrokSpawn,
  runLivePrompt,
} from "../../packages/orchestrator/src/live-runner.ts";

interface Row {
  id: string;
  exit: number | string;
  durationMs: number;
  input: string;
  output: string;
  note: string;
}

const PROMPTS: ReadonlyArray<{ id: string; body: string }> = [
  {
    id: "001-home",
    body: `---
id: 001-home
kind: build
effort: medium
maxTurns: 8
---

Build the Towel and Tea home page. One headline, one short paragraph, and a link to the work page.
`,
  },
  {
    id: "002-work",
    body: `---
id: 002-work
kind: build
effort: medium
maxTurns: 8
---

Build the Towel and Tea work page. Name three quiet services and link back home.
`,
  },
  {
    id: "003-visit",
    body: `---
id: 003-visit
kind: build
effort: medium
maxTurns: 8
---

Build the Towel and Tea visit page. Give the hours, the neighbourhood, and a way to write.
`,
  },
];

function invokedDirectly(): boolean {
  const entry = process.argv[1];
  if (entry === undefined || entry.length === 0) return false;
  const left = path.resolve(entry);
  const right = fileURLToPath(import.meta.url);
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

function reportPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "REPORT.md");
}

function render(rows: readonly Row[], stopped: string): string {
  const lines = [
    "# Live dogfood",
    "",
    "Towel and Tea, three short prompts. Times and token counts feed prompt 118.",
    "",
    "| Prompt | Exit | Duration ms | Input tokens | Output tokens | Note |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.id} | ${row.exit} | ${row.durationMs} | ${row.input} | ${row.output} | ${row.note} |`,
    );
  }
  if (stopped.length > 0) {
    lines.push("", `Stopped: ${stopped}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<number> {
  if (!liveDogfoodEnabled(process.env)) return 0;
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-dogfood-"));
  const rows: Row[] = [];
  let stopped = "";
  let failed = false;
  try {
    await mkdir(path.join(dir, ".hitchhiker", "prompts"), { recursive: true });
    await writeFile(
      path.join(dir, ".hitchhiker", "drive-approval.json"),
      `${JSON.stringify({ approved: true })}\n`,
      "utf8",
    );
    const config = defaultConfig();
    config.sessionIdMode = "alias";
    config.effort = "medium";
    for (const prompt of PROMPTS) {
      const file = path.join(dir, ".hitchhiker", "prompts", `${prompt.id}.md`);
      await writeFile(file, prompt.body, "utf8");
      try {
        const result = await runLivePrompt(file, { spawnImpl: liveGrokSpawn, projectDir: dir, config });
        rows.push({
          id: prompt.id,
          exit: result.exitCode,
          durationMs: result.durationMs,
          input: result.tokens === undefined ? "n/a" : String(result.tokens.input),
          output: result.tokens === undefined ? "n/a" : String(result.tokens.output),
          note: result.exitCode === 0 ? "" : "non-zero exit",
        });
        if (result.exitCode !== 0) failed = true;
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : "Live run failed.";
        rows.push({ id: prompt.id, exit: "stopped", durationMs: 0, input: "n/a", output: "n/a", note: message });
        if (error instanceof LiveUsageLimitError || error instanceof GrokMissingError) {
          stopped = message;
          break;
        }
        stopped = message;
        break;
      }
    }
    await writeFile(reportPath(), render(rows, stopped), "utf8");
    return failed ? 1 : 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

if (invokedDirectly()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : "Live dogfood failed.";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    },
  );
}
