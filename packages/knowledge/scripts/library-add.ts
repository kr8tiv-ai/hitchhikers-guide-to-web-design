/**
 * Add one public URL as link-only unless the policy allows code.
 * Usage: pnpm --filter @hitchhiker/knowledge run library:add -- <url>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addLibraryUrl, emptyIngestState, type IngestState } from "../src/ingest-pipeline.ts";
import { grokLibraryRunner } from "./grok-library-runner.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "design-library");
const url = process.argv.slice(2).find((arg) => arg.startsWith("http"));
if (url === undefined) {
  console.error("Pass a URL.");
  process.exit(1);
}

const clock = {
  now: () => Date.now(),
  wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

function readState(): IngestState {
  try {
    return JSON.parse(readFileSync(path.join(root, "ingest-state.json"), "utf8")) as IngestState;
  } catch {
    return emptyIngestState();
  }
}

const next = await addLibraryUrl(url, {
  fetchImpl: globalThis.fetch,
  clock,
  grok: grokLibraryRunner,
  root,
  nowIso: new Date().toISOString(),
}, readState());
writeFileSync(path.join(root, "ingest-state.json"), `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(next.items[Object.keys(next.items).at(-1) ?? ""]?.reason ?? "added");
