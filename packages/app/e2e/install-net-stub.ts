/**
 * Network scenarios for the install dialog. No socket is opened.
 * Redirect cases call the real allowlist. The second run of a failure is healthy.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assertRedirectUrl,
  buildInstallPlan,
  checksumMessage,
  offlineMessage,
  type InstallPlan,
  type RunResult,
} from "@hitchhiker/engine";
import type { DeskPreflight, PreflightName } from "../src/server/card.ts";
import type { ToolRuntime } from "../src/server/tool-desk.ts";

const NAMES: PreflightName[] = ["grok", "playwright", "whisper", "pdftotext"];
const HUGGING = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";
const GITHUB = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip";

const present = {
  grok: false,
  playwright: false,
  whisper: false,
  pdftotext: false,
};

let seenScenario = "";
let failArmed = true;

export function missingPreflight(): DeskPreflight {
  return report();
}

export function tools(): ToolRuntime {
  return {
    plan(input) {
      return buildInstallPlan(input.tool, input.modelId, {
        platform: "win32",
        arch: "x64",
        managers: managers(),
        dataDir: "C:\\Hitchhiker\\tools",
        browsersDir: "C:\\Cache\\ms-playwright",
        workspaceDir: "C:\\guide",
      });
    },
    async run(plan, ctx) {
      const problem = failureFor(scenario());
      if (problem !== null) {
        ctx.emit({ type: "stderr", text: `${problem}\n`, received: null, total: null });
        return failed(plan, problem);
      }
      if (scenario() === "redirect") {
        assertRedirectUrl("https://us.aws.cdn.hf.co/signed/ggml-base.bin", HUGGING);
        assertRedirectUrl("https://release-assets.githubusercontent.com/whisper-bin-x64.zip", GITHUB);
      }
      present[plan.tool] = true;
      ctx.emit({ type: "stdout", text: "installed\n", received: null, total: null });
      ctx.emit({ type: "download", text: "", received: plan.sizeBytes ?? 10, total: plan.sizeBytes ?? 10 });
      const ok: RunResult = {
        status: "ok",
        error: null,
        installPath: "C:\\Hitchhiker\\tools\\bin",
        versionLine: plan.tool === "grok" ? "grok 1.2.3" : null,
        manualCommand: plan.manualCommand,
        modelPath: plan.tool === "whisper" ? "C:\\Hitchhiker\\tools\\whisper\\ggml-base.bin" : null,
      };
      return ok;
    },
    recheck() {
      return report();
    },
  };
}

function managers(): string[] {
  const text = readProjectFile("managers.txt");
  if (text.length === 0) return ["npm", "pnpm", "scoop", "tar"];
  return text.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
}

function scenario(): string {
  const text = readProjectFile("scenario.txt");
  return text.length === 0 ? "success" : text;
}

function readProjectFile(name: string): string {
  const dir = process.env.HH_E2E_PROJECT ?? "";
  try {
    return readFileSync(path.join(dir, name), "utf8").trim();
  } catch {
    return "";
  }
}

function failureFor(name: string): string | null {
  if (name !== seenScenario) {
    seenScenario = name;
    failArmed = true;
  }
  if (!failArmed) return null;
  if (name === "checksum") {
    failArmed = false;
    return checksumMessage("ab".repeat(32), "cd".repeat(32));
  }
  if (name === "offline") {
    failArmed = false;
    return offlineMessage();
  }
  if (name === "rejected") {
    failArmed = false;
    try {
      assertRedirectUrl("https://evilhf.co/ggml-base.bin", HUGGING);
      return "The rejected host was allowed.";
    } catch (error: unknown) {
      return error instanceof Error ? error.message : "The download was sent to a server we do not recognize.";
    }
  }
  return null;
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
