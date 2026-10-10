import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  countOpenFindings,
  evalFromParts,
  parseTestCounts,
  uxPassCount,
  visibleCopy,
  type EvalResult,
} from "@hitchhiker/engine";
import { hiddenChildOptions } from "@hitchhiker/engine";
import { readTargetText } from "./files.ts";

interface Captured {
  status: number | null;
  stdout: string;
  stderr: string;
}

function pnpmCommand(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function capture(command: string, args: readonly string[], cwd: string, timeoutMs: number): Promise<Captured> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], hiddenChildOptions({
      cwd,
      stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
    }));
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      if (stdout.length < 4_000_000) stdout = `${stdout}${chunk}`.slice(0, 4_000_000);
    });
    child.stderr?.on("data", (chunk: string) => {
      if (stderr.length < 1_000_000) stderr = `${stderr}${chunk}`.slice(0, 1_000_000);
    });
    const timer = setTimeout(() => {
      child.kill();
    }, timeoutMs);
    child.once("error", () => {
      clearTimeout(timer);
      resolve({ status: null, stdout, stderr });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ status: code, stdout, stderr });
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function loadLint(cwd: string): Promise<(text: string) => number> {
  const file = path.resolve(cwd, "packages", "qa", "src", "antislop.ts");
  const loaded: unknown = await import(pathToFileURL(file).href);
  if (!isRecord(loaded) || typeof loaded.lintSlop !== "function") {
    throw new Error("The anti-slop module did not load.");
  }
  const lint = loaded.lintSlop as (text: string, mode: "guide") => unknown;
  return (text: string) => {
    if (text.trim().length === 0) return 0;
    const hits: unknown = lint(text, "guide");
    if (!Array.isArray(hits)) throw new Error("lintSlop did not return a list.");
    return hits.length;
  };
}

/** Pass count, doctor, tsc, and anti-slop hits in the target copy. */
export async function runEvaluation(cwd: string, targets: readonly string[]): Promise<EvalResult> {
  const tests = await capture(pnpmCommand(), ["-r", "test"], cwd, 45 * 60 * 1000);
  const counts = parseTestCounts(`${tests.stdout}\n${tests.stderr}`);
  const doctor = await capture(
    process.execPath,
    ["--experimental-strip-types", path.join("packages", "cli", "src", "main.ts"), "doctor"],
    cwd,
    60_000,
  );
  const tsc = await capture(pnpmCommand(), ["exec", "tsc", "-b", "--pretty", "false"], cwd, 15 * 60 * 1000);
  const lint = await loadLint(cwd);
  let antiSlopHits = 0;
  for (const file of readTargetText(cwd, targets)) {
    const ext = path.extname(file.path);
    antiSlopHits += lint(visibleCopy(file.body, ext));
  }
  return evalFromParts({
    testsPassed: counts.passed,
    testsFailed: counts.failed,
    testExit: tests.status ?? 1,
    doctorExit: doctor.status ?? 1,
    tscExit: tsc.status ?? 1,
    antiSlopHits,
  });
}

/** Open rows in docs/bug-scan.md and improve/findings. */
export function openBugCountFromDisk(cwd: string): number {
  const texts: string[] = [];
  const scan = path.join(cwd, "docs", "bug-scan.md");
  if (existsSync(scan)) texts.push(readFileSync(scan, "utf8"));
  const dir = path.join(cwd, "improve", "findings");
  if (!existsSync(dir)) return countOpenFindings(texts);
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".tsv") && !name.endsWith(".md")) continue;
    const abs = path.join(dir, name);
    if (!statSync(abs).isFile()) continue;
    texts.push(readFileSync(abs, "utf8"));
  }
  return countOpenFindings(texts);
}

/** Polish e2e passes plus the anti-slop suite. A missing suite counts as 0. */
async function measureUx(cwd: string): Promise<number> {
  try {
    const anti = await capture(
      pnpmCommand(),
      [
        "--filter",
        "@hitchhiker/qa",
        "exec",
        "node",
        "--experimental-strip-types",
        "--test",
        path.join("test", "antislop.test.ts"),
      ],
      cwd,
      10 * 60 * 1000,
    );
    const polish = await capture(
      pnpmCommand(),
      [
        "--filter",
        "@hitchhiker/app",
        "exec",
        "playwright",
        "test",
        path.join("e2e", "polish.spec.ts"),
        "--reporter=line",
      ],
      cwd,
      20 * 60 * 1000,
    );
    return uxPassCount(`${polish.stdout}\n${polish.stderr}`, `${anti.stdout}\n${anti.stderr}`);
  } catch {
    return 0;
  }
}

/**
 * The 173 evaluation, plus the UX pass count and the open-bug count.
 * Callers that inject a fake skip this.
 */
export async function runSupervisorEvaluation(cwd: string, targets: readonly string[]): Promise<EvalResult> {
  const base = await runEvaluation(cwd, targets);
  const uxPassed = await measureUx(cwd);
  const bugCount = openBugCountFromDisk(cwd);
  return evalFromParts({
    testsPassed: base.testsPassed,
    testsFailed: base.testsFailed,
    testExit: base.testsFailed > 0 ? 1 : 0,
    doctorExit: base.doctorExit,
    tscExit: base.tscExit,
    antiSlopHits: base.antiSlopHits,
    uxPassed,
    bugCount,
  });
}
