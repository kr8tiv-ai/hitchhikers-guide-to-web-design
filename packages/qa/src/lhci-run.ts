/**
 * Mobile Lighthouse gate (prompt 126, judged by 122).
 *
 * @lhci/cli 0.15.1 runs lighthouse 12.6.1. Research 06 names 13.5.0.
 * Autorun uses the copy the CLI depends on. The phone floor stays 90.
 *
 * Three mobile runs, simulated throttling, minScore 0.9 on performance,
 * accessibility, best-practices, and seo. A crash, a missing report, or a
 * score under the floor is BLOCKER. Nothing here lowers a floor.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { defaultConfig, hiddenChildOptions, type GuideConfig } from "@hitchhiker/engine";
import { evaluateLh, fromLhci, type LhScores } from "./lighthouse-gate.ts";
import { ensureChromium } from "./playwright-opener.ts";

const MOBILE_RUNS = 3;
const CATEGORY_FLOOR = 0.9;
const LHCI_TIMEOUT_MS = 8 * 60 * 1000;

export interface LhResult {
  route: string;
  status: "PASS" | "BLOCKER";
  reasons: string[];
  scores: LhScores | null;
  runs: number;
}

interface CollectConfig {
  ci: {
    collect: {
      url: string[];
      numberOfRuns: number;
      chromePath: string;
      settings: {
        formFactor: "mobile";
        throttlingMethod: "simulate";
        screenEmulation: {
          mobile: boolean;
          width: number;
          height: number;
          deviceScaleFactor: number;
          disabled: boolean;
        };
        onlyCategories: string[];
        chromeFlags: string;
        maxWaitForLoad: number;
        disableFullPageScreenshot: boolean;
        enableErrorReporting: boolean;
      };
    };
    assert: {
      assertions: Record<string, ["error", { minScore: number }]>;
    };
    upload: {
      target: "filesystem";
      outputDir: string;
    };
  };
}

export function lhciCollectConfig(urls: string[], chromePath: string, outputDir: string): CollectConfig {
  return {
    ci: {
      collect: {
        url: urls,
        numberOfRuns: 3,
        chromePath,
        settings: {
          formFactor: "mobile",
          throttlingMethod: "simulate",
          screenEmulation: {
            mobile: true,
            width: 412,
            height: 823,
            deviceScaleFactor: 1.75,
            disabled: false,
          },
          onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
          chromeFlags: "--ignore-certificate-errors --allow-insecure-localhost --no-sandbox --disable-dev-shm-usage",
          maxWaitForLoad: 45000,
          disableFullPageScreenshot: true,
          enableErrorReporting: false,
        },
      },
      assert: {
        assertions: {
          "categories:performance": ["error", { minScore: 0.9 }],
          "categories:accessibility": ["error", { minScore: 0.9 }],
          "categories:best-practices": ["error", { minScore: 0.9 }],
          "categories:seo": ["error", { minScore: 0.9 }],
        },
      },
      upload: {
        target: "filesystem",
        outputDir,
      },
    },
  };
}

function floors(): GuideConfig["gates"] {
  return defaultConfig().gates;
}

function blocker(route: string, reason: string): LhResult {
  return { route, status: "BLOCKER", reasons: [reason], scores: null, runs: 0 };
}

function lhciCli(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("@lhci/cli/package.json");
  return path.join(path.dirname(pkg), "src", "cli.js");
}

function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], hiddenChildOptions({ stdio: "ignore" as const }));
    return;
  }
  child.kill("SIGKILL");
}

function runCli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [lhciCli(), ...args], hiddenChildOptions({
      cwd,
      env: process.env,
    }));
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: { code: number; stdout: string; stderr: string } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      killTree(child);
      finish(new Error(`lhci timed out after ${LHCI_TIMEOUT_MS} ms`));
    }, LHCI_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => finish({ code: code ?? 1, stdout, stderr }));
  });
}

function probe(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const library = target.startsWith("https:") ? https : http;
    const req = library.get(
      target,
      target.startsWith("https:") ? { rejectUnauthorized: false, timeout: 4000 } : { timeout: 4000 },
      (res) => {
        res.resume();
        finish((res.statusCode ?? 500) < 400);
      },
    );
    req.on("error", () => finish(false));
    req.on("timeout", () => {
      req.destroy();
      finish(false);
    });
  });
}

function routePath(target: string): string {
  try {
    const pathname = new URL(target).pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
    return pathname;
  } catch {
    return target;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestedPath(json: unknown): string | undefined {
  if (!isRecord(json)) return undefined;
  const raw = json.requestedUrl ?? json.finalDisplayedUrl ?? json.finalUrl;
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return routePath(raw);
}

function weakAudits(json: unknown): string[] {
  if (!isRecord(json) || !isRecord(json.audits)) return [];
  const notes: string[] = [];
  for (const [id, audit] of Object.entries(json.audits)) {
    if (!isRecord(audit)) continue;
    const score = audit.score;
    if (typeof score === "number" && score < CATEGORY_FLOOR) notes.push(`${id} ${score}`);
  }
  return notes.slice(0, 10);
}

function collectAccepted(code: number, stderr: string, reportCount: number): boolean {
  if (code === 0) return true;
  return (
    code === 1 &&
    process.platform === "win32" &&
    reportCount > 0 &&
    stderr.includes("Generating results...") &&
    stderr.includes("Chrome could not be killed")
  );
}

function readReports(dir: string): Array<{ route: string; json: unknown; scores: LhScores }> {
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((name) => /^lhr-\d+\.json$/.test(name));
  } catch {
    return [];
  }
  const reports: Array<{ route: string; json: unknown; scores: LhScores }> = [];
  for (const name of names) {
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as unknown;
    } catch {
      continue;
    }
    const route = requestedPath(json);
    if (route === undefined) continue;
    try {
      reports.push({ route, json, scores: fromLhci(json) });
    } catch {
      continue;
    }
  }
  return reports;
}

function median(values: number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const center = sorted[mid];
  if (center === undefined) throw new Error("Lighthouse returned no scores.");
  if (sorted.length % 2 === 1) return center;
  const lower = sorted[mid - 1];
  return lower === undefined ? center : (lower + center) / 2;
}

function judgeRoute(
  route: string,
  runs: Array<{ json: unknown; scores: LhScores }>,
  assertOk: boolean,
  assertDetail: string,
): LhResult {
  if (runs.length === 0) return blocker(route, "Lighthouse wrote no report. The gate fails closed.");
  const scores = fromLhci({
    categories: {
      performance: { score: median(runs.map((run) => run.scores.performance)) },
      accessibility: { score: median(runs.map((run) => run.scores.accessibility)) },
      "best-practices": { score: median(runs.map((run) => run.scores.bestPractices)) },
      seo: { score: median(runs.map((run) => run.scores.seo)) },
    },
  });
  const judged = evaluateLh({ phone: scores, heavy: false, floors: floors() });
  const reasons = [...judged.reasons];
  let status = judged.status;
  for (const run of runs) {
    const one = evaluateLh({ phone: run.scores, heavy: false, floors: floors() });
    if (one.status === "BLOCKER") {
      status = "BLOCKER";
      reasons.push(...one.reasons);
      reasons.push(...weakAudits(run.json));
    }
  }
  if (!assertOk) {
    status = "BLOCKER";
    reasons.push(assertDetail.length > 0 ? assertDetail : "LHCI assert failed. The gate fails closed.");
  }
  if (runs.length < MOBILE_RUNS) {
    status = "BLOCKER";
    reasons.push(`Expected ${MOBILE_RUNS} mobile runs and found ${runs.length}.`);
  }
  return { route, status, reasons, scores, runs: runs.length };
}

export async function runLhci(url: string, routes: string[]): Promise<LhResult[]> {
  const list = routes.length > 0 ? routes : ["/"];
  try {
    const targets = list.map((route) => new URL(route, url).href);
    const dead: LhResult[] = [];
    const live: string[] = [];
    for (const target of targets) {
      if (await probe(target)) live.push(target);
      else dead.push(blocker(routePath(target), "Preview did not respond. The gate fails closed."));
    }
    if (live.length === 0) return dead;

    const chromePath = await ensureChromium();
    const cwd = mkdtempSync(path.join(os.tmpdir(), "hh-lhci-"));
    try {
      const configPath = path.join(cwd, "lighthouserc.json");
      writeFileSync(configPath, `${JSON.stringify(lhciCollectConfig(live, chromePath, "lhci-upload"))}\n`, "utf8");
      const collected = await runCli(["collect", "--config", configPath], cwd);
      const reports = readReports(path.join(cwd, ".lighthouseci"));
      if (!collectAccepted(collected.code, collected.stderr, reports.length) || reports.length === 0) {
        const detail = (collected.stderr || collected.stdout).trim().slice(0, 500);
        return [
          ...dead,
          ...live.map((target) =>
            blocker(routePath(target), detail.length > 0 ? detail : "Lighthouse crashed. The gate fails closed."),
          ),
        ];
      }
      const asserted = await runCli(["assert", "--config", configPath], cwd);
      const assertDetail = (asserted.stderr || asserted.stdout).trim().slice(0, 500);
      const grouped = new Map<string, Array<{ json: unknown; scores: LhScores }>>();
      for (const report of reports) {
        const bucket = grouped.get(report.route) ?? [];
        bucket.push({ json: report.json, scores: report.scores });
        grouped.set(report.route, bucket);
      }
      const judged = live.map((target) => {
        const route = routePath(target);
        return judgeRoute(route, grouped.get(route) ?? [], asserted.code === 0, assertDetail);
      });
      return [...dead, ...judged];
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lighthouse crashed.";
    return list.map((route) => blocker(routePath(new URL(route, url).href), `Lighthouse failed closed. ${message}`));
  }
}
