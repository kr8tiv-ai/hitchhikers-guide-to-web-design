/**
 * The orchestrator owns the README edge
 * Elevate (repeat as desired) -> Drive.
 *
 * Each accepted pick is one golden prompt, one queue row, one run, and one
 * commit. An empty pick list enqueues nothing and commits nothing.
 * Spawn is injected. This file does not call a live host.
 */

import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hiddenChildOptions, type SpawnLike } from "@hitchhiker/engine";
import { GitFlowError, commitPrompt } from "./git-flow.ts";
import { commandFor } from "./live-runner.ts";
import { evaluateCommand } from "./policy.ts";
import { enqueueElevatePicks, loadQueue, saveQueue, type QueueStatus } from "./queue-file.ts";
import { DEFAULT_MODEL, buildArgv, runElevatePicks, type RunRequest, type SpawnImpl } from "./runner.ts";
import { scheduleElevatePicks } from "./schedule.ts";

/** README edge. The orchestrator owns Elevate (repeat as desired) -> Drive. */
export const ELEVATE_TO_DRIVE = "Elevate (repeat as desired) -> Drive";

export interface ElevateDrivePick {
  id: string;
  promptPath: string;
  promptText: string;
}

export interface ElevateDriveHooks {
  bin: string;
  spawnImpl: SpawnImpl;
}

const ALREADY_PLAIN =
  /could not be added to the build|is missing, so nothing was built|was not started|could not be saved|private file was part|did not finish/;

function plain(error: unknown): Error {
  if (error instanceof Error && ALREADY_PLAIN.test(error.message)) return error;
  if (error instanceof GitFlowError && /secret/i.test(error.message)) {
    return new Error("A private file was part of this improvement, so it was not saved.");
  }
  return new Error("This improvement did not finish, so it was not saved.");
}

function runGit(argv: readonly string[], attempt = 0): Promise<void> {
  const bin = argv[0];
  if (bin === undefined || bin === "") {
    return Promise.reject(new Error("This improvement could not be saved."));
  }
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      argv.slice(1),
      hiddenChildOptions({ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
      (error, _stdout, stderr) => {
        if (error) {
          const detail = `${String(stderr ?? "")}\n${error.message}`;
          if (attempt < 5 && /permission denied|unable to write file|index\.lock|updating files failed/i.test(detail)) {
            const dirFlag = argv.indexOf("-C");
            const dir = argv[dirFlag + 1];
            if (dirFlag >= 0 && typeof dir === "string" && dir.length > 0) {
              rmSync(path.join(dir, ".git", "index.lock"), { force: true });
            }
            setTimeout(() => {
              runGit(argv, attempt + 1).then(resolve, reject);
            }, 300 * (attempt + 1));
            return;
          }
          reject(new Error("This improvement could not be saved."));
          return;
        }
        resolve();
      },
    );
  });
}

async function setStatus(projectDir: string, id: string, status: QueueStatus): Promise<void> {
  const queue = await loadQueue(projectDir);
  if (queue === null) {
    throw new Error("This improvement could not be saved.");
  }
  const items = queue.items.map((item) =>
    item.id === id ? { id: item.id, kind: item.kind, status } : { id: item.id, kind: item.kind, status: item.status },
  );
  if (queue.pause === undefined) await saveQueue(projectDir, { items });
  else await saveQueue(projectDir, { items, pause: queue.pause });
}

function adaptSpawn(spawn: SpawnLike, cwd: string): SpawnImpl {
  return async (argv) => {
    const command = argv[0] ?? "";
    const output = await spawn({
      command,
      args: argv.slice(1),
      cwd,
      env: process.env,
      timeoutMs: 0,
    });
    return {
      code: output.status === null ? 1 : output.status,
      stderr: typeof output.stderr === "string" ? output.stderr : "",
    };
  };
}

/**
 * Enqueue accepted picks, run each one, and commit once per pick.
 * An empty list returns before the queue, the runner, and git.
 */
export async function driveElevatePicks(
  projectDir: string,
  picks: readonly ElevateDrivePick[],
  hooks: ElevateDriveHooks,
): Promise<{ enqueued: number; committed: number }> {
  if (typeof projectDir !== "string" || projectDir.trim() === "") {
    throw new Error("The project folder is missing, so nothing was built.");
  }
  if (!Array.isArray(picks)) {
    throw new Error("That improvement could not be added to the build.");
  }

  let scheduled: ReturnType<typeof scheduleElevatePicks>;
  try {
    scheduled = scheduleElevatePicks(picks.map((pick) => ({ id: pick.id })));
  } catch {
    throw new Error("That improvement could not be added to the build.");
  }
  if (scheduled.length === 0) return { enqueued: 0, committed: 0 };

  if (
    typeof hooks !== "object" ||
    hooks === null ||
    typeof hooks.bin !== "string" ||
    hooks.bin.trim() === "" ||
    typeof hooks.spawnImpl !== "function"
  ) {
    throw new Error("This improvement was not started.");
  }

  const byId = new Map<string, ElevateDrivePick>();
  for (const pick of picks) {
    if (byId.has(pick.id)) throw new Error("That improvement could not be added to the build.");
    byId.set(pick.id, pick);
  }

  try {
    await enqueueElevatePicks(projectDir, scheduled);
  } catch {
    throw new Error("That improvement could not be added to the build.");
  }

  let committed = 0;
  for (const item of scheduled) {
    const pick = byId.get(item.id);
    try {
      if (pick === undefined || pick.promptText.trim() === "" || pick.promptPath.trim() === "") {
        throw new Error("That improvement is missing, so nothing was built.");
      }
      const req: RunRequest = {
        model: DEFAULT_MODEL,
        cwd: projectDir,
        promptText: pick.promptText,
        bin: hooks.bin,
        promptPath: pick.promptPath,
        effort: item.effort,
        maxTurns: null,
        sessionMode: "alias",
        approved: true,
      };
      const flags = buildArgv(req);
      const decision = evaluateCommand({ argv: [hooks.bin, ...flags], projectRoot: projectDir });
      if (decision.decision === "deny") {
        throw new Error("This improvement was not started.");
      }
      await setStatus(projectDir, item.id, "running");
      await runElevatePicks([req], hooks.spawnImpl, async () => {
        await setStatus(projectDir, item.id, "passed");
        await commitPrompt(projectDir, item.id, runGit);
      });
      committed += 1;
    } catch (error) {
      await setStatus(projectDir, item.id, "failed").catch(() => undefined);
      throw plain(error);
    }
  }
  return { enqueued: scheduled.length, committed };
}

/** One golden prompt file. The id is the file name. */
export async function driveElevateFile(
  projectDir: string,
  file: string,
  deps: { spawnImpl: SpawnLike },
): Promise<{ enqueued: number; committed: number }> {
  if (typeof deps !== "object" || deps === null || typeof deps.spawnImpl !== "function") {
    throw new Error("This improvement was not started.");
  }
  if (typeof file !== "string" || file.trim() === "") {
    throw new Error("That improvement is missing, so nothing was built.");
  }
  const resolved = path.resolve(file);
  let promptText: string;
  try {
    promptText = await readFile(resolved, "utf8");
  } catch {
    throw new Error("That improvement is missing, so nothing was built.");
  }
  const base = path.basename(resolved);
  const ext = path.extname(base);
  const id = (ext.length > 0 ? base.slice(0, -ext.length) : base).toLowerCase();
  return driveElevatePicks(
    projectDir,
    [{ id, promptPath: resolved, promptText }],
    { bin: commandFor(deps.spawnImpl, process.env), spawnImpl: adaptSpawn(deps.spawnImpl, projectDir) },
  );
}
