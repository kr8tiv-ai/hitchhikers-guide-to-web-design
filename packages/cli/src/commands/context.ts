/**
 * `hh context` and `hh next --status` read the project context.
 * Repair is the only write, and only when the person names it.
 */

import {
  auditContext,
  formatStatusLine,
  renderContextText,
  repairAssets,
  repairCursor,
  repairDecisions,
} from "@hitchhiker/engine";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr?: string;
}

export function projectFrom(argv: readonly string[], fallback: string): { ok: true; dir: string } | { ok: false } {
  const index = argv.indexOf("--project");
  if (index < 0) return { ok: true, dir: fallback };
  const value = argv[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("-")) return { ok: false };
  return { ok: true, dir: value };
}

export async function runContextCommand(argv: readonly string[], cwd: string): Promise<CommandResult> {
  const project = projectFrom(argv, cwd);
  if (!project.ok) return { exitCode: 2, stdout: "hh context [--audit] [--project <dir>]\n" };
  if (argv.includes("repair")) {
    if (argv.includes("--decisions")) await repairDecisions(project.dir);
    else if (argv.includes("--assets")) await repairAssets(project.dir);
    else if (argv.includes("--cursor")) await repairCursor(project.dir);
    else return { exitCode: 2, stdout: "hh context repair --decisions|--assets|--cursor [--project <dir>]\n" };
  }
  return { exitCode: 0, stdout: renderContextText(project.dir, argv.includes("--audit")) };
}

export function runNextCommand(argv: readonly string[], cwd: string): CommandResult {
  if (!argv.includes("--status")) return { exitCode: 2, stdout: "hh next --status [--project <dir>]\n" };
  const project = projectFrom(argv, cwd);
  if (!project.ok) return { exitCode: 2, stdout: "hh next --status [--project <dir>]\n" };
  return { exitCode: 0, stdout: `${formatStatusLine(project.dir)}\n` };
}

export function runDoctorContext(argv: readonly string[], cwd: string): CommandResult {
  const project = projectFrom(argv, cwd);
  if (!project.ok) return { exitCode: 2, stdout: "hh doctor --context [--project <dir>]\n" };
  const findings = auditContext(project.dir);
  if (findings.length === 0) return { exitCode: 0, stdout: "Context files agree.\n" };
  const lines = findings.map((finding) => `${finding.file}: ${finding.problem}\nFix: ${finding.fix}`);
  return { exitCode: 1, stdout: `${lines.join("\n")}\n` };
}
