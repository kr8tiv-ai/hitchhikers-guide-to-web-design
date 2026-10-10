import { GIT_HOOKS, hookFailed, isGitHook, parseSessionCommands, scanHookFailures } from "@hitchhiker/engine";
import type { HookLogRow, ParsedCommand } from "@hitchhiker/engine";

export const HOOK_LOG_REL = "improve/hook-log.tsv";
export const PUSH_FAILED_REL = "improve/PUSH-FAILED.txt";

export interface CommandOutput {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** First git hook name in a command transcript. Empty when none is named. */
export function detectHook(text: string): string {
  const lower = text.toLowerCase();
  for (const name of GIT_HOOKS) {
    if (lower.includes(name)) return name;
  }
  return "";
}

function shortNote(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * A row for a nonzero exit, or for output that names a git hook.
 * A clean command with no hook text returns null.
 */
export function observeCommand(n: number, command: string, output: CommandOutput): HookLogRow | null {
  const text = `${output.stdout}\n${output.stderr}`;
  const hook = detectHook(text);
  const exit = output.status ?? 1;
  if (exit === 0 && hook.length === 0) return null;
  return {
    n,
    command,
    exit,
    hook,
    note: shortNote(text),
  };
}

function rowFrom(n: number, parsed: ParsedCommand): HookLogRow {
  return {
    n,
    command: parsed.command,
    exit: parsed.exit,
    hook: parsed.hook,
    note: parsed.note,
  };
}

/** Structured command lines plus unstructured hook failures in an agent log. */
export function rowsFromAgentLog(n: number, log: string): HookLogRow[] {
  const rows: HookLogRow[] = [];
  for (const parsed of parseSessionCommands(log)) {
    if (parsed.exit !== 0 || isGitHook(parsed.hook)) rows.push(rowFrom(n, parsed));
  }
  for (const parsed of scanHookFailures(log)) rows.push(rowFrom(n, parsed));
  return rows;
}

export function agentHookFailed(rows: readonly HookLogRow[]): boolean {
  return rows.some((row) => hookFailed(row));
}

export function agentCommandFailed(rows: readonly HookLogRow[]): boolean {
  return rows.some((row) => row.exit !== 0);
}
