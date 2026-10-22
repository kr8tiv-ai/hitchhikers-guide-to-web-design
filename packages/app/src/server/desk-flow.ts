/**
 * Desk buttons ask the orchestrator transition table before they move a step.
 * The app package does not depend on the orchestrator, so the table loads by file URL.
 */

import { pathToFileURL } from "node:url";
import { packagedModule } from "@hitchhiker/engine";

export type DeskFlowPhase = "discovery" | "brief" | "design" | "build" | "elevate" | "so-long";

export interface DeskFlowOptions {
  publish?: boolean;
  shipGateOk?: boolean;
  write?: boolean;
}

export interface DeskFlowDecision {
  ok: boolean;
  reason: string;
}

const CLOSED = "The next step could not be checked, so nothing moved.";

type Enter = (projectDir: string, to: DeskFlowPhase, options?: DeskFlowOptions) => Promise<DeskFlowDecision>;

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

/** The one transition table. A refusal is a plain sentence and the step stays put. */
export async function enterFlow(
  projectDir: string,
  to: DeskFlowPhase,
  options?: DeskFlowOptions,
): Promise<DeskFlowDecision> {
  const enter = await loadEnter();
  if (enter === null) return { ok: false, reason: CLOSED };
  try {
    const decision = options === undefined ? await enter(projectDir, to) : await enter(projectDir, to, options);
    if (typeof decision !== "object" || decision === null || typeof decision.ok !== "boolean") {
      return { ok: false, reason: CLOSED };
    }
    const reason = typeof decision.reason === "string" ? decision.reason : CLOSED;
    return { ok: decision.ok, reason: decision.ok ? "" : reason.length > 0 ? reason : CLOSED };
  } catch {
    return { ok: false, reason: CLOSED };
  }
}
