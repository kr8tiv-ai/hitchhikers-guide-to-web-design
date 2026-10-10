/** TSV of command exits and git hook output. One row per recorded command. */

import { cleanNote } from "./results.ts";

export const HOOK_LOG_COLUMNS = ["n", "command", "exit", "hook", "note"] as const;

export const GIT_HOOKS = ["pre-commit", "commit-msg", "pre-push"] as const;

export type GitHookName = (typeof GIT_HOOKS)[number];

export interface HookLogRow {
  n: number;
  command: string;
  exit: number;
  hook: string;
  note: string;
}

export interface ParsedCommand {
  command: string;
  exit: number;
  hook: string;
  note: string;
}

const COMMAND_LINE = /^\[hh-command\] exit=(\d+) hook=(\S+) command=(.*?)(?: note=(.*))?$/;

function cell(value: string): string {
  return cleanNote(value).replace(/\t/g, " ");
}

export function formatHookLogHeader(): string {
  return HOOK_LOG_COLUMNS.join("\t");
}

export function formatHookLogRow(row: HookLogRow): string {
  if (!Number.isSafeInteger(row.n) || row.n < 0) throw new Error("n must be a non-negative integer.");
  if (!Number.isSafeInteger(row.exit)) throw new Error("exit must be an integer.");
  const hook = row.hook.trim().length === 0 ? "none" : cell(row.hook);
  const cells = [
    String(row.n),
    cell(row.command),
    String(row.exit),
    hook,
    cell(row.note),
  ];
  return cells.join("\t");
}

export function appendHookLog(existing: string, row: HookLogRow): string {
  const header = formatHookLogHeader();
  const line = formatHookLogRow(row);
  const normalized = existing.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.trim().length === 0) return `${header}\n${line}\n`;
  const body = normalized.endsWith("\n") ? normalized : `${normalized}\n`;
  if (!body.startsWith(`${header}\n`)) throw new Error("hook-log.tsv header does not match.");
  return `${body}${line}\n`;
}

export function isGitHook(name: string): name is GitHookName {
  return (GIT_HOOKS as readonly string[]).includes(name);
}

export function hookFailed(row: Pick<ParsedCommand, "exit" | "hook">): boolean {
  return row.exit !== 0 && isGitHook(row.hook);
}

export function commandFailed(row: Pick<ParsedCommand, "exit">): boolean {
  return row.exit !== 0;
}

/** Structured lines the supervisor writes, and that a fake session can emit. */
export function parseSessionCommands(log: string): ParsedCommand[] {
  const rows: ParsedCommand[] = [];
  for (const raw of log.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    const match = COMMAND_LINE.exec(raw.trim());
    if (match === null) continue;
    const hook = match[2] === "none" ? "" : (match[2] ?? "");
    rows.push({
      exit: Number(match[1] ?? "0"),
      hook,
      command: (match[3] ?? "").trim(),
      note: (match[4] ?? "").trim(),
    });
  }
  return rows;
}

/**
 * Unstructured hook failures in an agent log.
 * A bare mention of a hook name is not a failure.
 */
export function scanHookFailures(log: string): ParsedCommand[] {
  const rows: ParsedCommand[] = [];
  const lines = log.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.includes("[hh-command]")) continue;
    const lower = line.toLowerCase();
    for (const hook of GIT_HOOKS) {
      if (!lower.includes(hook)) continue;
      const window = lines.slice(index, index + 4).join("\n");
      const windowLower = window.toLowerCase();
      const exitMatch = /exit(?:ed)?(?:\s+with)?(?:\s+code)?[^\d]{0,8}(\d+)/i.exec(window);
      const exit = exitMatch === null ? null : Number(exitMatch[1] ?? "");
      const failedWord = /fail|error|rejected/.test(windowLower);
      if (exit === 0 || (exit === null && !failedWord) || (exit !== null && Number.isNaN(exit))) continue;
      rows.push({
        command: hook,
        exit: exit ?? 1,
        hook,
        note: line.trim(),
      });
      break;
    }
  }
  return rows;
}

export function commandUsesNoVerify(command: string): boolean {
  return command.split(/\s+/).includes("--no-verify");
}

export function logUsesNoVerify(log: string): boolean {
  if (parseSessionCommands(log).some((row) => commandUsesNoVerify(row.command))) return true;
  return log.split("\n").some((line) => line.split(/\s+/).includes("--no-verify"));
}
