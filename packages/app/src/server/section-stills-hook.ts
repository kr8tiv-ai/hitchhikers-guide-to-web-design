/**
 * Attach the desk stills step for a live build.
 * Tests leave the runner unset. The API key is read only when the
 * project has turned the billed provider on.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  hiddenChildOptions,
  resolveGrokCommand,
  setSectionStillRunner,
  type SpawnLike,
  type SpawnOutput,
} from "@hitchhiker/engine";

interface StillModule {
  readMediaSettings(projectDir: string): { api: boolean };
  resolveDeskProvider(
    projectDir: string,
    deps: { spawn?: SpawnLike; env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; key?: string },
  ): { generateImage(req: { model: string; prompt: string; aspect: string; n: number }): Promise<unknown> };
  generateSectionStills(
    projectDir: string,
    provider: { generateImage(req: { model: string; prompt: string; aspect: string; n: number }): Promise<unknown> },
    options?: { fetchImpl?: typeof fetch },
  ): Promise<unknown>;
}

export async function attachSectionStills(projectDir: string): Promise<void> {
  const href = pathToFileURL(path.resolve(import.meta.dirname, "..", "..", "..", "assets", "src", "section-generate.ts")).href;
  const mod = (await import(href)) as StillModule;
  setSectionStillRunner(projectDir, async (dir) => {
    const settings = mod.readMediaSettings(dir);
    let key = "";
    if (settings.api) {
      try {
        const keysHref = pathToFileURL(path.resolve(import.meta.dirname, "..", "..", "..", "assets", "src", "keychain.ts")).href;
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
    const deps: { spawn: SpawnLike; env: NodeJS.ProcessEnv; fetchImpl: typeof fetch; key?: string } = {
      spawn: (request) => spawnGrok({ ...request, command }),
      env: process.env,
      fetchImpl: globalThis.fetch,
    };
    if (key !== "") deps.key = key;
    const provider = mod.resolveDeskProvider(dir, deps);
    await mod.generateSectionStills(dir, provider, { fetchImpl: globalThis.fetch });
  });
}

function spawnGrok(request: {
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
    const finish = (result: SpawnOutput): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve(result);
    };
    timer = setTimeout(() => {
      child.kill();
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
    child.on("close", (status) => {
      finish({ status, stdout, stderr, timedOut: false, errorCode: null });
    });
  });
}
