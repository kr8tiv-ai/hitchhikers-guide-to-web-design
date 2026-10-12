/**
 * Stubbed installer for the desk e2e. No download and no package manager.
 * Plans are the real recipes so the dialog shows the real commands.
 */

import { readFileSync } from "node:fs";
import {
  buildInstallPlan,
  type InstallEvent,
  type InstallPlan,
  type PlanContext,
  type RunResult,
} from "@hitchhiker/engine";
import type { DeskPreflight, PreflightName } from "../src/server/card.ts";
import type { ToolRuntime } from "../src/server/tool-desk.ts";

const NAMES: PreflightName[] = ["grok", "playwright", "whisper", "pdftotext"];

const present = {
  grok: false,
  playwright: false,
  whisper: false,
  pdftotext: false,
};

let pdfFailed = false;

export function missingPreflight(): DeskPreflight {
  return report();
}

export function tools(): ToolRuntime {
  return {
    plan(input) {
      const code = blockCode();
      if (code === "unsupported-platform" && input.tool === "whisper") {
        return buildInstallPlan("whisper", null, deskCtx({ arch: "s390x", managers: ["tar"] }));
      }
      if (code.length > 0 && input.tool === "pdftotext" && code !== "unsupported-platform") {
        return blockedPoppler(code);
      }
      return buildInstallPlan(input.tool, input.modelId, deskCtx());
    },
    async run(plan, ctx) {
      if (plan.tool === "whisper") return cancelWhisper(plan, ctx);
      if (plan.tool === "pdftotext" && !pdfFailed) {
        pdfFailed = true;
        ctx.emit({
          type: "stderr",
          text: "poppler exit 3: package missing from the stub\n",
          received: null,
          total: null,
        });
        return failed(plan, "exit 2: poppler exit 3: package missing from the stub");
      }
      present[plan.tool] = true;
      ctx.emit({ type: "stdout", text: "installed\n", received: null, total: null });
      const ok: RunResult = {
        status: "ok",
        error: null,
        installPath: "C:\\Hitchhiker\\tools\\bin",
        versionLine: plan.tool === "grok" ? "grok 1.2.3" : null,
        manualCommand: plan.manualCommand,
        modelPath: null,
      };
      return ok;
    },
    recheck() {
      return report();
    },
  };
}

function blockCode(): string {
  const file = process.env.HH_E2E_BLOCK_FILE;
  if (file === undefined || file.length === 0) return "";
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

function deskCtx(extra: {
  arch?: string;
  managers?: readonly string[];
  present?: readonly string[];
  elevationOverrides?: Readonly<Record<string, boolean>>;
} = {}): PlanContext {
  const ctx: PlanContext = {
    platform: "win32",
    arch: extra.arch ?? "x64",
    managers: extra.managers ?? ["npm", "pnpm", "scoop", "tar"],
    dataDir: "C:\\Hitchhiker\\tools",
    browsersDir: "C:\\Cache\\ms-playwright",
    workspaceDir: "C:\\guide",
  };
  if (extra.present !== undefined) ctx.present = extra.present;
  if (extra.elevationOverrides !== undefined) ctx.elevationOverrides = extra.elevationOverrides;
  return ctx;
}

function blockedPoppler(code: string): InstallPlan {
  if (code === "installed") {
    return buildInstallPlan("pdftotext", null, deskCtx({ managers: ["winget"], present: ["pdftotext"] }));
  }
  if (code === "needs-admin") {
    return buildInstallPlan("pdftotext", null, deskCtx({
      managers: ["winget"],
      elevationOverrides: { "pdftotext-winget": true },
    }));
  }
  if (code === "no-manager") return buildInstallPlan("pdftotext", null, deskCtx({ managers: [] }));
  if (code === "winget-missing") return buildInstallPlan("pdftotext", null, deskCtx({ managers: ["npm"] }));
  return buildInstallPlan("pdftotext", null, deskCtx());
}

function report(): DeskPreflight {
  return {
    grokOk: present.grok,
    probes: NAMES.map((name) => ({
      name,
      ok: present[name],
      detail: present[name]
        ? name === "grok" ? "grok: grok 1.2.3" : `${name}: installed`
        : name === "grok" ? "grok: not on PATH" : `${name}: not installed`,
      version: name === "grok" && present.grok ? "grok 1.2.3" : null,
    })),
  };
}

async function cancelWhisper(
  plan: InstallPlan,
  ctx: { signal: AbortSignal; emit: (event: InstallEvent) => void },
): Promise<RunResult> {
  ctx.emit({ type: "download", text: "", received: 20, total: 100 });
  await new Promise<void>((resolve) => {
    if (ctx.signal.aborted) resolve();
    else ctx.signal.addEventListener("abort", () => resolve(), { once: true });
  });
  return {
    status: "cancelled",
    error: "Cancelled.",
    installPath: null,
    versionLine: null,
    manualCommand: plan.manualCommand,
    modelPath: null,
  };
}

function failed(plan: InstallPlan, error: string): RunResult {
  return {
    status: "failed",
    error,
    installPath: null,
    versionLine: null,
    manualCommand: plan.manualCommand,
    modelPath: null,
  };
}
