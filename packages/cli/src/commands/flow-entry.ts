/**
 * CLI entry into the orchestrator transition table.
 * The published CLI depends only on the engine, so the table loads by file URL.
 */

import path from "node:path";
import { pathToFileURL } from "node:url";
import { packagedModule } from "@hitchhiker/engine";

export type CliFlowPhase = "discovery" | "brief" | "design" | "build" | "elevate" | "so-long";

export interface CliFlowOptions {
  publish?: boolean;
  shipGateOk?: boolean;
  write?: boolean;
}

export interface CliFlowDecision {
  ok: boolean;
  reason: string;
}

const CLOSED = "The next step could not be checked, so nothing moved.";

type Enter = (projectDir: string, to: CliFlowPhase, options?: CliFlowOptions) => Promise<CliFlowDecision>;

let loading: Promise<Enter | null> | null = null;

function loadEnter(): Promise<Enter | null> {
  if (loading === null) {
    const file = packagedModule("orchestrator", "src/phase-lock.ts");
    loading = import(pathToFileURL(file).href)
      .then((loaded: unknown) => {
        if (typeof loaded !== "object" || loaded === null || !("enterFlow" in loaded)) return null;
        const enterFlow = (loaded as { enterFlow?: unknown }).enterFlow;
        if (typeof enterFlow !== "function") return null;
        return enterFlow as Enter;
      })
      .catch(() => null);
  }
  return loading;
}

/** Ask the one transition table before a command moves the project. */
export async function enterCliFlow(
  projectDir: string,
  to: CliFlowPhase,
  options?: CliFlowOptions,
): Promise<CliFlowDecision> {
  const enterFlow = await loadEnter();
  if (enterFlow === null) return { ok: false, reason: CLOSED };
  try {
    const decision = options === undefined ? await enterFlow(projectDir, to) : await enterFlow(projectDir, to, options);
    if (typeof decision.ok !== "boolean") return { ok: false, reason: CLOSED };
    const reason = typeof decision.reason === "string" ? decision.reason : CLOSED;
    return { ok: decision.ok, reason: decision.ok ? "" : reason.length > 0 ? reason : CLOSED };
  } catch {
    return { ok: false, reason: CLOSED };
  }
}

export function orchestratorPhaseLockFile(): string {
  return path.resolve(packagedModule("orchestrator", "src/phase-lock.ts"));
}
