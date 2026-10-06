import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const workflowDir = path.join(repoRoot, ".github", "workflows");

type YamlScalar = string | number | boolean | null;
type YamlValue = YamlScalar | YamlValue[] | YamlMap;
interface YamlMap {
  [key: string]: YamlValue;
}

interface WorkflowJob {
  "runs-on": string | string[];
  steps: unknown[];
}

const SHA = /^[0-9a-f]{40}$/;
const USES_REF = /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/;

export function readWorkflow(filePath: string): {
  name: string;
  jobs: Record<string, WorkflowJob>;
} {
  const doc = parseYaml(readFileSync(filePath, "utf8"));
  const name = doc.name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`${filePath}: workflow name is missing`);
  }
  const jobsRaw = doc.jobs;
  if (!isMap(jobsRaw)) {
    throw new Error(`${filePath}: jobs mapping is missing`);
  }
  const jobs: Record<string, WorkflowJob> = {};
  for (const [id, job] of Object.entries(jobsRaw)) {
    if (!isMap(job)) {
      throw new Error(`${filePath}: job ${id} is not a mapping`);
    }
    const runsOn = job["runs-on"];
    if (typeof runsOn !== "string" && !isStringArray(runsOn)) {
      throw new Error(`${filePath}: job ${id} has no runs-on`);
    }
    const steps = job.steps;
    if (!Array.isArray(steps)) {
      throw new Error(`${filePath}: job ${id} has no steps`);
    }
    jobs[id] = { "runs-on": runsOn, steps };
  }
  return { name, jobs };
}

test("unit workflow covers three operating systems and replays cassettes", () => {
  const filePath = path.join(workflowDir, "ci.yml");
  const raw = readFileSync(filePath, "utf8");
  const doc = parseYaml(raw);
  const workflow = readWorkflow(filePath);

  assert.equal(workflow.name, "CI");
  assert.deepEqual(triggerNames(doc), ["pull_request", "push"]);
  assertContentsRead(doc);

  const unit = workflow.jobs.unit;
  assert.ok(unit, "unit job");
  assert.equal(unit["runs-on"], "${{ matrix.os }}");
  assert.deepEqual(matrixOs(doc, "unit").sort(), [
    "macos-latest",
    "ubuntu-latest",
    "windows-latest",
  ]);

  const runs = stepRuns(unit.steps);
  assert.ok(runs.some((run) => run.includes("core.longpaths true")));
  assert.ok(runs.some((run) => run.includes("pnpm install --frozen-lockfile")));
  assert.ok(runs.some((run) => run.includes("pnpm install") && run.includes("warning")));
  assert.ok(runs.some((run) => run.includes("pnpm -r run --if-present lint")));
  assert.ok(runs.some((run) => run.includes("pnpm exec tsc -b")));
  assert.ok(runs.some((run) => run.trim() === "pnpm -r test"));
  assert.ok(runs.some((run) => run.includes("pnpm -r run --if-present eval")));
  assert.equal(stepEnv(unit.steps, "Unit tests", "HH_CASSETTE"), "replay");
  assert.equal(stepEnv(unit.steps, "Evals from cassettes", "HH_CASSETTE"), "replay");
  assertPinnedUses(raw, doc);
  assertNoSecretsOrRelease(raw, doc);
});

test("e2e workflow stays on Ubuntu and does not require a package script yet", () => {
  const filePath = path.join(workflowDir, "e2e.yml");
  const raw = readFileSync(filePath, "utf8");
  const doc = parseYaml(raw);
  const workflow = readWorkflow(filePath);

  assert.equal(workflow.name, "E2E");
  assert.deepEqual(triggerNames(doc), ["pull_request", "push"]);
  assertContentsRead(doc);
  const e2e = workflow.jobs.e2e;
  assert.ok(e2e, "e2e job");
  assert.equal(e2e["runs-on"], "ubuntu-latest");
  assert.equal(Object.keys(workflow.jobs).length, 1);

  const runs = stepRuns(e2e.steps);
  assert.ok(runs.some((run) => run.includes("playwright install --with-deps chromium")));
  assert.ok(runs.some((run) => run.includes("pnpm -r run --if-present e2e")));
  assertPinnedUses(raw, doc);
  assertNoSecretsOrRelease(raw, doc);
});

test("audit workflow calls the prompt 156 licence audit and scans with pinned gitleaks", () => {
  const filePath = path.join(workflowDir, "audit.yml");
  const raw = readFileSync(filePath, "utf8");
  const doc = parseYaml(raw);
  const workflow = readWorkflow(filePath);

  assert.equal(workflow.name, "Audit");
  assert.deepEqual(triggerNames(doc), ["pull_request", "push"]);
  assertContentsRead(doc);

  const licence = workflow.jobs.licence;
  const scan = workflow.jobs["secret-scan"];
  assert.ok(licence, "licence job");
  assert.ok(scan, "secret-scan job");
  assert.equal(licence["runs-on"], "ubuntu-latest");
  assert.equal(scan["runs-on"], "ubuntu-latest");

  const licenceRun = stepRuns(licence.steps).join("\n");
  assert.match(licenceRun, /pnpm licenses list --json/);
  assert.match(licenceRun, /packages\/qa\/src\/licenses\.ts/);
  assert.match(licenceRun, /auditDeps/);
  assert.match(licenceRun, /AGPL/);
  assert.match(licenceRun, /GPL/);

  const uses = collectUses(doc);
  assert.ok(uses.includes("gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e"));
  assertPinnedUses(raw, doc);
  assertNoSecretsOrRelease(raw, doc);
  assert.equal(raw.includes("GITLEAKS_LICENSE"), false);
});

test("the workflow reader keeps mappings, flow lists, and block scalars", () => {
  const doc = parseYaml(`
name: Sample
on:
  push:
  pull_request:
permissions:
  contents: read
jobs:
  unit:
    runs-on: \${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - name: Install
        run: |
          pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm exec tsc -b
`);
  assert.equal(doc.name, "Sample");
  const on = doc.on;
  assert.ok(isMap(on));
  assert.equal(on.push, null);
  assert.equal(on.pull_request, null);
  const jobs = doc.jobs;
  assert.ok(isMap(jobs));
  const unit = jobs.unit;
  assert.ok(isMap(unit));
  const strategy = unit.strategy;
  assert.ok(isMap(strategy));
  const matrix = strategy.matrix;
  assert.ok(isMap(matrix));
  assert.deepEqual(matrix.os, ["ubuntu-latest", "windows-latest", "macos-latest"]);
  const steps = unit.steps;
  assert.ok(Array.isArray(steps));
  const install = steps[0];
  assert.ok(isMap(install));
  assert.equal(install.run, "pnpm install --frozen-lockfile\n");
});

function triggerNames(doc: YamlMap): string[] {
  const on = doc.on;
  if (!isMap(on)) {
    throw new Error("workflow is missing on");
  }
  return Object.keys(on).sort();
}

function assertContentsRead(doc: YamlMap): void {
  const permissions = doc.permissions;
  assert.ok(isMap(permissions), "permissions");
  assert.deepEqual(Object.keys(permissions).sort(), ["contents"]);
  assert.equal(permissions.contents, "read");
}

function matrixOs(doc: YamlMap, jobId: string): string[] {
  const jobs = doc.jobs;
  if (!isMap(jobs)) throw new Error("jobs");
  const job = jobs[jobId];
  if (!isMap(job)) throw new Error(jobId);
  const strategy = job.strategy;
  if (!isMap(strategy)) throw new Error("strategy");
  const matrix = strategy.matrix;
  if (!isMap(matrix)) throw new Error("matrix");
  const os = matrix.os;
  if (!isStringArray(os)) throw new Error("matrix.os");
  return os;
}

function stepRuns(steps: unknown[]): string[] {
  const runs: string[] = [];
  for (const step of steps) {
    if (!isMap(step)) continue;
    const run = step.run;
    if (typeof run === "string") runs.push(run);
  }
  return runs;
}

function stepEnv(steps: unknown[], stepName: string, key: string): string | undefined {
  for (const step of steps) {
    if (!isMap(step) || step.name !== stepName) continue;
    const env = step.env;
    if (!isMap(env)) return undefined;
    const value = env[key];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function assertPinnedUses(raw: string, doc: YamlMap): void {
  const fromDoc = collectUses(doc);
  assert.ok(fromDoc.length > 0);
  for (const ref of fromDoc) {
    const sha = ref.split("@")[1] ?? "";
    assert.match(sha, SHA, ref);
    assert.match(ref, USES_REF, ref);
  }
  const fromText: string[] = [];
  for (const line of raw.split("\n")) {
    const match = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
    const ref = match?.[1];
    if (!ref) continue;
    assert.match(ref, USES_REF, line.trim());
    fromText.push(ref);
  }
  assert.deepEqual(fromText.sort(), [...fromDoc].sort());
}

function assertNoSecretsOrRelease(raw: string, doc: YamlMap): void {
  assert.equal(raw.includes("secrets."), false);
  const jobs = doc.jobs;
  if (!isMap(jobs)) throw new Error("jobs");
  for (const [id, job] of Object.entries(jobs)) {
    assert.equal(/\b(deploy|publish)\b/i.test(id), false, id);
    if (!isMap(job)) continue;
    const name = job.name;
    if (typeof name === "string") {
      assert.equal(/\b(deploy|publish)\b/i.test(name), false, name);
    }
    const steps = job.steps;
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      if (!isMap(step)) continue;
      for (const field of ["name", "run", "uses"] as const) {
        const value = step[field];
        if (typeof value !== "string") continue;
        assert.equal(/\b(deploy|publish)\b/i.test(value), false, value);
        assert.equal(/\b(npm|pnpm|yarn)\s+publish\b/.test(value), false, value);
      }
    }
  }
}

function collectUses(value: YamlValue): string[] {
  const found: string[] = [];
  walk(value, (node) => {
    if (!isMap(node)) return;
    const uses = node.uses;
    if (typeof uses === "string") found.push(uses);
  });
  return found;
}

function walk(value: YamlValue, visit: (node: YamlValue) => void): void {
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (isMap(value)) {
    for (const child of Object.values(value)) walk(child, visit);
  }
}

function isMap(value: YamlValue | unknown): value is YamlMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: YamlValue | unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

interface Line {
  indent: number;
  text: string;
  index: number;
}

function parseYaml(source: string): YamlMap {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let cursor = 0;

  function peek(): Line | null {
    let index = cursor;
    while (index < lines.length) {
      const raw = lines[index] ?? "";
      if (raw.includes("\t")) {
        throw new Error(`line ${index + 1}: tabs are not allowed`);
      }
      if (raw.trim() === "" || raw.trimStart().startsWith("#")) {
        index += 1;
        continue;
      }
      return {
        indent: raw.length - raw.trimStart().length,
        text: stripComment(raw.trim()),
        index,
      };
    }
    return null;
  }

  function take(line: Line): void {
    cursor = line.index + 1;
  }

  function readBlock(parentIndent: number, stripFinalNewline: boolean): string {
    const buf: string[] = [];
    let base: number | null = null;
    while (cursor < lines.length) {
      const raw = lines[cursor] ?? "";
      if (raw.trim() === "") {
        if (base !== null) buf.push("");
        cursor += 1;
        continue;
      }
      const indent = raw.length - raw.trimStart().length;
      if (indent <= parentIndent) break;
      if (base === null) base = indent;
      if (indent < base) {
        throw new Error(`line ${cursor + 1}: block scalar lost its indent`);
      }
      buf.push(raw.slice(base));
      cursor += 1;
    }
    const joined = buf.join("\n");
    if (stripFinalNewline) return joined.replace(/\n*$/, "");
    return `${joined}\n`;
  }

  function assignPair(map: YamlMap, text: string, keyIndent: number): void {
    const splitAt = indexOfKeyColon(text);
    if (splitAt < 0) {
      throw new Error(`expected key: value, received ${text}`);
    }
    const key = text.slice(0, splitAt).trim();
    const rawValue = text.slice(splitAt + 1).trim();
    if (key.length === 0) throw new Error("empty key");
    if (rawValue === "|" || rawValue === "|-" || rawValue === ">" || rawValue === ">-") {
      map[key] = readBlock(keyIndent, rawValue.endsWith("-"));
      return;
    }
    if (rawValue === "") {
      const next = peek();
      if (!next || next.indent <= keyIndent) {
        map[key] = null;
        return;
      }
      map[key] = next.text.startsWith("- ") || next.text === "-"
        ? parseSequence(next.indent)
        : parseMap(next.indent);
      return;
    }
    map[key] = parseScalarOrFlow(rawValue);
  }

  function parseMap(mapIndent: number): YamlMap {
    const map: YamlMap = {};
    while (true) {
      const line = peek();
      if (!line || line.indent !== mapIndent) break;
      if (line.text.startsWith("- ") || line.text === "-") break;
      take(line);
      assignPair(map, line.text, line.indent);
    }
    return map;
  }

  function parseSequence(seqIndent: number): YamlValue[] {
    const items: YamlValue[] = [];
    while (true) {
      const line = peek();
      if (!line || line.indent !== seqIndent) break;
      if (!line.text.startsWith("- ") && line.text !== "-") break;
      take(line);
      const after = line.text === "-" ? "" : line.text.slice(1).trim();
      if (after === "") {
        const next = peek();
        if (!next || next.indent <= seqIndent) {
          items.push(null);
        } else {
          items.push(next.text.startsWith("- ") ? parseSequence(next.indent) : parseMap(next.indent));
        }
        continue;
      }
      if (isKeyValue(after)) {
        const map: YamlMap = {};
        assignPair(map, after, seqIndent);
        while (true) {
          const next = peek();
          if (!next || next.indent <= seqIndent) break;
          if (next.text.startsWith("- ") || next.text === "-") break;
          take(next);
          assignPair(map, next.text, next.indent);
        }
        items.push(map);
        continue;
      }
      items.push(parseScalarOrFlow(after));
    }
    return items;
  }

  const first = peek();
  if (!first) throw new Error("empty workflow");
  const doc = parseMap(first.indent);
  const leftover = peek();
  if (leftover) {
    throw new Error(`line ${leftover.index + 1}: unexpected ${leftover.text}`);
  }
  return doc;
}

function parseScalarOrFlow(text: string): YamlValue {
  if (text.startsWith("[") && text.endsWith("]")) {
    const inner = text.slice(1, -1).trim();
    if (inner === "") return [];
    return splitCommas(inner).map((part) => parseScalar(part.trim()));
  }
  return parseScalar(text);
}

function parseScalar(text: string): YamlScalar {
  if (text === "null" || text === "~" || text === "") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  return text;
}

function isKeyValue(text: string): boolean {
  return indexOfKeyColon(text) >= 0;
}

function indexOfKeyColon(text: string): number {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char !== ":") continue;
    const next = text[index + 1];
    if (next === undefined || next === " " || next === "\t") return index;
  }
  return -1;
}

function stripComment(text: string): string {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "#" && (index === 0 || text[index - 1] === " ")) {
      return text.slice(0, index).trimEnd();
    }
  }
  return text.trimEnd();
}

function splitCommas(text: string): string[] {
  const parts: string[] = [];
  let quote: "'" | '"' | null = null;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === ",") {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}
