/**
 * Check the design library. Prints every problem and exits non-zero.
 * Screenshot sets are optional and are not required in git.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildDesignIndex,
  loadDesignEntries,
  loadDesignIndex,
  validateDesignEntry,
} from "../src/design-library.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "design-library");

function main(): void {
  const problems: string[] = [];
  const techniques = new Set(
    readdirSync(path.join(root, "techniques"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.replace(/\.md$/, "")),
  );
  for (const name of techniques) {
    const text = readFileSync(path.join(root, "techniques", `${name}.md`), "utf8");
    if (!text.includes("Prompt language")) problems.push(`${name}: technique note needs prompt language`);
    if (!/Perf cost/i.test(text)) problems.push(`${name}: technique note needs a perf cost`);
    if (!text.includes("Reduced motion")) problems.push(`${name}: technique note needs a reduced-motion line`);
  }
  const entries = loadDesignEntries(root);
  const human = entries.filter((entry) => entry.verified === "human" && !entry.retired).length;
  if (human < 12) problems.push(`human-verified seed is ${human}, need at least 12`);
  const seen = new Set<string>();
  for (const entry of entries) {
    problems.push(
      ...validateDesignEntry(entry, {
        requireSiteProvenance: true,
        techniqueNames: techniques,
        seenUrls: seen,
        snippetText: (relative) => readMaybe(path.join(root, relative)),
        licenseText: (relative) => readMaybe(path.join(root, relative)),
      }),
    );
  }
  const index = loadDesignIndex(root);
  const built = buildDesignIndex(entries, index?.built ?? "");
  if (index === null) problems.push("index.json is missing");
  else if (JSON.stringify(index.entries) !== JSON.stringify(built.entries) || JSON.stringify(index.by) !== JSON.stringify(built.by)) {
    problems.push("index.json does not match the entries");
  }
  problems.push(...copyleftScan(root));
  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log(`design library ok (${entries.length} entries)`);
}

function readMaybe(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function copyleftScan(dir: string): string[] {
  const problems: string[] = [];
  const folder = path.join(dir, "snippets");
  let names: string[] = [];
  try {
    names = walk(folder);
  } catch {
    return problems;
  }
  for (const file of names) {
    const text = readFileSync(file, "utf8");
    if (/\bAGPL\b|\bGPL-\d|\bGNU General Public License\b/i.test(text)) {
      problems.push(`copyleft text stored in ${path.relative(dir, file)}`);
    }
  }
  return problems;
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, name.name);
    if (name.isDirectory()) found.push(...walk(abs));
    else found.push(abs);
  }
  return found;
}

void main();
