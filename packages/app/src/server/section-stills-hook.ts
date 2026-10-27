/**
 * Attach the desk stills step for a live build.
 * Tests leave the runner unset. The API key is read only when the
 * project has turned the billed provider on.
 */

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  hiddenChildOptions,
  packagedModule,
  resolveGrokCommand,
  setSectionStillRunner,
  type SpawnLike,
  type SpawnOutput,
} from "@hitchhiker/engine";

interface StillModule {
  readMediaSettings(projectDir: string): { api: boolean; browser: boolean };
  resolveDeskProvider(
    projectDir: string,
    deps: {
      spawn?: SpawnLike;
      env?: NodeJS.ProcessEnv;
      fetchImpl?: typeof fetch;
      key?: string;
      browserDriver?: unknown;
    },
  ): { generateImage(req: { model: string; prompt: string; aspect: string; n: number }): Promise<unknown> };
  generateSectionStills(
    projectDir: string,
    provider: { generateImage(req: { model: string; prompt: string; aspect: string; n: number }): Promise<unknown> },
    options?: { fetchImpl?: typeof fetch },
  ): Promise<unknown>;
}

export async function attachSectionStills(projectDir: string): Promise<void> {
  const href = pathToFileURL(packagedModule("assets", "src/section-generate.ts")).href;
  const mod = (await import(href)) as StillModule;
  setSectionStillRunner(projectDir, async (dir) => {
    const settings = mod.readMediaSettings(dir);
    let key = "";
    if (settings.api) {
      try {
        const keysHref = pathToFileURL(packagedModule("assets", "src/keychain.ts")).href;
        const keys = (await import(keysHref)) as { readApiKey(): Promise<string> };
        key = await keys.readApiKey();
      } catch {
        key = "";
      }
    }
    let command = "grok";
    try {
      command = resolveGrokCommand(process.env);
    } catch {
      command = "grok";
    }
    const deps: {
      spawn: SpawnLike;
      env: NodeJS.ProcessEnv;
      fetchImpl: typeof fetch;
      key?: string;
      browserDriver?: unknown;
    } = {
      spawn: (request) => spawnGrok({ ...request, command }),
      env: process.env,
      fetchImpl: globalThis.fetch,
    };
    if (key !== "") deps.key = key;
    if (settings.browser) {
      const browser = await import("./imagine-browser.ts");
      deps.browserDriver = await browser.embeddedImagineDriver(dir);
    }
    const provider = mod.resolveDeskProvider(dir, deps);
    await mod.generateSectionStills(dir, provider, { fetchImpl: globalThis.fetch });
  });
}

const STILL_EXIT_DRAIN_MS = 500;

export function spawnGrok(request: {
  command: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}): Promise<SpawnOutput> {
  return new Promise((resolve) => {
    const child = spawn(
      request.command,
      [...request.args],
      hiddenChildOptions({
        cwd: request.cwd,
        env: request.env,
        stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
      }),
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let drain: ReturnType<typeof setTimeout> | undefined;
    const killTree = (): void => {
      if (process.platform === "win32" && child.pid !== undefined) {
        try {
          const killer = spawn(
            "taskkill",
            ["/pid", String(child.pid), "/T", "/F"],
            hiddenChildOptions({ stdio: "ignore" as const }),
          );
          killer.on("error", () => undefined);
          killer.unref();
        } catch {
          // The process is already gone.
        }
      }
      try {
        child.kill("SIGKILL");
      } catch {
        // The process is already gone.
      }
    };
    const finish = (result: SpawnOutput): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (drain !== undefined) clearTimeout(drain);
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve(result);
    };
    timer = setTimeout(() => {
      killTree();
      finish({ status: null, stdout, stderr, timedOut: true, errorCode: "TIMEOUT" });
    }, request.timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      finish({ status: null, stdout, stderr: error.message, timedOut: false, errorCode: error.code ?? "ENOENT" });
    });
    child.on("exit", (status) => {
      if (settled || drain !== undefined) return;
      drain = setTimeout(() => {
        if (settled) return;
        killTree();
        finish({ status, stdout, stderr, timedOut: false, errorCode: null });
      }, STILL_EXIT_DRAIN_MS);
    });
    child.on("close", (status) => {
      finish({ status, stdout, stderr, timedOut: false, errorCode: null });
    });
  });
}
