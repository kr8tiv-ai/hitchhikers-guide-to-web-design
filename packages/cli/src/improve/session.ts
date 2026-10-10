import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { hiddenChildOptions } from "@hitchhiker/engine";

/**
 * Deny rules passed beside --always-approve, matching the build driver.
 * The runner still enforces protected paths and the branch whitelist after
 * the session, because a deny rule is grok configuration.
 */
export const GROK_DENY_RULES = [
  "Bash(*git push*)",
  "Bash(*git push --force*)",
  "Bash(*git checkout main*)",
  "Bash(*git checkout master*)",
  "Bash(*vercel deploy*)",
  "Bash(*netlify deploy*)",
  "Bash(*wrangler deploy*)",
  "Bash(*npm publish*)",
  "Bash(*pnpm publish*)",
  "Bash(*pnpm add*)",
  "Bash(*npm install *)",
  "Read(**/.env)",
  "Read(**/.env.*)",
  "Read(**/.ssh/**)",
  "Read(**/*credential*)",
  "Read(**/*secret*)",
] as const;

export const GROK_RULES =
  "You are one experiment inside hh improve. Edit only the target area. " +
  "Do not push, force-push, deploy, publish, or check out main. " +
  "Do not install packages. Do not read or print secrets. " +
  "Do not edit protected paths. Commit once on this branch and stop.";

export interface SessionRequest {
  prompt: string;
  model: string;
  effort: string;
  turns: number;
  minutes: number;
  cwd: string;
  branch: string;
}

export interface SessionResult {
  timedOut: boolean;
  exitCode: number | null;
  note: string;
}

export function budgetMs(minutes: number): number {
  if (!Number.isSafeInteger(minutes) || minutes < 1) {
    throw new Error("minutes must be a positive integer.");
  }
  return minutes * 60 * 1000;
}

export function experimentPrompt(input: {
  programPath: string;
  targets: readonly string[];
  branch: string;
  experiment: number;
  minutes: number;
  turns: number;
}): string {
  const targets = input.targets.map((target) => `- ${target}`).join("\n");
  return [
    `You are running experiment ${input.experiment} for hh improve on branch ${input.branch}.`,
    `Read ${input.programPath} and docs/improve-runbook.md.`,
    "Make one small change inside the target area only:",
    targets,
    "Do not edit protected paths. The runner rejects them.",
    "Do not push, force-push, deploy, publish, or check out main.",
    "Do not install packages. Do not read or print secrets.",
    "Commit on this branch with a one-line message that states the hypothesis.",
    "Then stop. The runner scores the commit and keeps it only when the score strictly improves.",
    `Minute budget: ${input.minutes}. Turn budget: ${input.turns}.`,
    "",
  ].join("\n");
}

/** Argv for one fresh grok session. Turn cap uses --max-turns, the driver flag. */
export function buildImproveArgv(input: {
  prompt: string;
  model: string;
  effort: string;
  turns: number;
  cwd: string;
}): string[] {
  const args = [
    "-p",
    input.prompt,
    "-m",
    input.model,
    "--effort",
    input.effort,
    "--max-turns",
    String(input.turns),
    "--always-approve",
    "--sandbox",
    "workspace",
    "--cwd",
    input.cwd,
  ];
  for (const rule of GROK_DENY_RULES) args.push("--deny", rule);
  args.push("--rules", GROK_RULES);
  return args;
}

/** Kill a grok process and its children. Windows uses taskkill /T. */
export function killProcessTree(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], hiddenChildOptions({
      stdio: "ignore" as const,
    }));
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

function cap(text: string, chunk: string): string {
  if (text.length >= 32_000) return text;
  return `${text}${chunk}`.slice(0, 32_000);
}

/**
 * Spawn grok and kill the tree when the minute budget ends.
 * Stdout is capped and never copied into the results note.
 */
export async function runGrokSession(
  command: string,
  request: SessionRequest,
): Promise<SessionResult> {
  const args = buildImproveArgv({
    prompt: request.prompt,
    model: request.model,
    effort: request.effort,
    turns: request.turns,
    cwd: request.cwd,
  });
  const child: ChildProcess = spawn(command, args, hiddenChildOptions({
    cwd: request.cwd,
    // Unix needs a process group so the minute budget can kill the tree.
    // Windows forces this off inside hiddenChildOptions and uses taskkill /T.
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"],
  }));
  let timedOut = false;
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  let sink = "";
  child.stdout?.on("data", (chunk: string) => {
    sink = cap(sink, chunk);
  });
  child.stderr?.on("data", (chunk: string) => {
    sink = cap(sink, chunk);
  });
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid !== undefined) killProcessTree(child.pid);
  }, budgetMs(request.minutes));
  const exitCode = await new Promise<number | null>((resolve) => {
    child.once("error", () => resolve(null));
    child.once("close", (code) => resolve(code));
  });
  clearTimeout(timer);
  if (timedOut) {
    return { timedOut: true, exitCode, note: "minute budget killed the grok process" };
  }
  if (exitCode === null) return { timedOut: false, exitCode: null, note: "grok did not start" };
  if (exitCode !== 0) return { timedOut: false, exitCode, note: "grok exited non-zero" };
  return { timedOut: false, exitCode, note: "" };
}
