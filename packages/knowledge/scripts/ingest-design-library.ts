/**
 * Manual design-library ingest. Not part of CI or a build.
 * Grok spec builds use grok-4.7-build-fast at xhigh on the user's plan.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyIngestState, recheckLibrary, runIngest, type IngestCandidate, type IngestState } from "../src/ingest-pipeline.ts";
import { grokLibraryRunner } from "./grok-library-runner.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "design-library");
const recheck = process.argv.includes("--recheck");

const clock = {
  now: () => Date.now(),
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

async function main(): Promise<void> {
  const state = readState();
  const deps = { fetchImpl: globalThis.fetch, clock, grok: grokLibraryRunner, root, recheck, nowIso: new Date().toISOString() };
  const next = recheck ? (await recheckLibrary(deps, state)).state : await runIngest(readCandidates(), state, deps);
  writeFileSync(path.join(root, "ingest-state.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`ingest ${recheck ? "recheck" : "run"} recorded ${Object.keys(next.items).length} items`);
}

function readState(): IngestState {
  try {
    return JSON.parse(readFileSync(path.join(root, "ingest-state.json"), "utf8")) as IngestState;
  } catch {
    return emptyIngestState();
  }
}

function readCandidates(): IngestCandidate[] {
  const raw = JSON.parse(readFileSync(path.join(root, "candidates.json"), "utf8")) as { candidates?: IngestCandidate[] };
  return raw.candidates ?? [];
}

void main();
