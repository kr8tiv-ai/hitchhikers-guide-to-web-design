/**
 * Manual design-library ingest. Not part of CI or a build.
 * Grok spec builds use grok-4.7-build-fast at xhigh on the user's plan.
 *
 * Flags:
 *   --recheck                 recheck stored URLs instead of ingesting
 *   --candidates <file>       candidate file in design-library/ (default candidates.json)
 *   --require-provenance      award gate: only sites with verifiable award or curation provenance
 *   --concurrency <n>         items in flight at once (default 1)
 *   --limit <n>               stop after n candidates (smoke runs)
 * State is saved after every item, so a stopped run resumes where it left off.
 */
import { renameSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalUrl } from "../src/design-library.ts";
import { emptyIngestState, recheckLibrary, refreshIndex, runIngest, type IngestCandidate, type IngestState } from "../src/ingest-pipeline.ts";
import { grokLibraryRunner } from "./grok-library-runner.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "design-library");
const argv = process.argv.slice(2);
const recheck = argv.includes("--recheck");
const requireProvenance = argv.includes("--require-provenance");
const candidateFile = flag("--candidates") ?? "candidates.json";
const concurrency = Number(flag("--concurrency") ?? "1");
const limit = Number(flag("--limit") ?? "0");

const clock = {
  now: () => Date.now(),
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

function flag(name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function saveState(state: IngestState): void {
  const file = path.join(root, "ingest-state.json");
  writeFileSync(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(`${file}.tmp`, file);
}

async function main(): Promise<void> {
  const state = readState();
  const started = Date.now();
  let settled = 0;
  let accepted = 0;
  const deps = {
    fetchImpl: globalThis.fetch,
    clock,
    grok: grokLibraryRunner,
    root,
    recheck,
    nowIso: new Date().toISOString(),
    concurrency,
    requireProvenance,
    onProgress: (snapshot: IngestState, item: IngestState["items"][string]) => {
      settled += 1;
      if (item.entryId !== undefined) accepted += 1;
      saveState(snapshot);
      if (accepted > 0 && item.entryId !== undefined && accepted % 10 === 0) refreshIndex(root, new Date().toISOString().slice(0, 10));
      const minutes = ((Date.now() - started) / 60000).toFixed(1);
      console.log(`${new Date().toISOString()} [${settled}] ${item.status}${item.entryId ? ` ${item.entryId}` : ""} ${item.url} :: ${item.reason} (accepted this run ${accepted}, ${minutes} min)`);
    },
  };
  let candidates = recheck ? [] : readCandidates();
  if (limit > 0) {
    const pending = candidates.filter((candidate) => {
      const prior = state.items[canonicalUrl(candidate.url)];
      return prior?.status !== "done" && prior?.status !== "refused";
    });
    candidates = pending.slice(0, limit);
  }
  console.log(`${new Date().toISOString()} ingest start: ${candidates.length} candidates from ${candidateFile}, concurrency ${concurrency}, provenance gate ${requireProvenance ? "on" : "off"}, pid ${process.pid}`);
  const next = recheck ? (await recheckLibrary(deps, state)).state : await runIngest(candidates, state, deps);
  saveState(next);
  console.log(`${new Date().toISOString()} ingest ${recheck ? "recheck" : "run"} recorded ${Object.keys(next.items).length} items`);
}

function readState(): IngestState {
  try {
    return JSON.parse(readFileSync(path.join(root, "ingest-state.json"), "utf8")) as IngestState;
  } catch {
    return emptyIngestState();
  }
}

function readCandidates(): IngestCandidate[] {
  const raw = JSON.parse(readFileSync(path.join(root, candidateFile), "utf8")) as { candidates?: IngestCandidate[] };
  return raw.candidates ?? [];
}

void main();
