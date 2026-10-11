/**
 * Stubbed installer for the desk e2e. No download and no package manager.
 * Plans are the real recipes so the dialog shows the real commands.
 */

import {
  buildInstallPlan,
  type InstallEvent,
  type InstallPlan,
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
      return buildInstallPlan(input.tool, input.modelId, {
        platform: "win32",
        arch: "x64",
        managers: ["npm", "pnpm", "scoop", "tar"],
        dataDir: "C:\\Hitchhiker\\tools",
        browsersDir: "C:\\Cache\\ms-playwright",
        workspaceDir: "C:\\guide",
      });
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
