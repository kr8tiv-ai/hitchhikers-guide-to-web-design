/**
 * prebuild gate for a generated site. Walks up to the Hitchhiker engine and
 * fails the build when lintMotion reports a finding. A site copied outside
 * the workspace has no engine module, so the gate skips instead of failing
 * the install.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

interface MotionFinding {
  file: string;
  line: number;
  detail: string;
  fix: string;
}

async function loadLint(start: string): Promise<((dir: string) => MotionFinding[]) | null> {
  let dir = start;
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = path.join(dir, "packages", "engine", "src", "spec", "motion-lint.ts");
    if (existsSync(candidate)) {
      const loaded = (await import(pathToFileURL(candidate).href)) as { lintMotion?: (dir: string) => MotionFinding[] };
      if (typeof loaded.lintMotion === "function") return loaded.lintMotion;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const lint = await loadLint(process.cwd());
if (lint === null) {
  console.log("hh-motion-lint skipped: the engine module is not in a parent directory.");
  process.exit(0);
}

const findings = lint(process.cwd());
if (findings.length === 0) process.exit(0);
for (const finding of findings) {
  console.error(`${finding.file}:${finding.line} ${finding.detail} Fix: ${finding.fix}`);
}
process.exit(1);
