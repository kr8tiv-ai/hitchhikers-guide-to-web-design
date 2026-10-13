/**
 * `hh context` and `hh next --status` read the project context.
 * Repair is the only write, and only when the person names it.
 */

import {
  auditContext,
  continueSiteBuild,
  formatStatusLine,
  getBuildRunner,
  hasProjectBuildRunner,
  installLiveBuildRunner,
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

const NEXT_USAGE = "hh next --status [--project <dir>]\nhh next --run [--project <dir>]\nhh next --resume [--project <dir>]\n";
const BUILD_USAGE = "hh build --resume [--project <dir>]\n";

export async function runNextCommand(argv: readonly string[], cwd: string): Promise<CommandResult> {
  const status = argv.includes("--status");
  const run = argv.includes("--run") || argv.includes("--resume");
  if (!status && !run) return { exitCode: 2, stdout: NEXT_USAGE };
  const project = projectFrom(argv, cwd);
  if (!project.ok) return { exitCode: 2, stdout: NEXT_USAGE };
  if (run) return startBuild(project.dir);
  return { exitCode: 0, stdout: `${formatStatusLine(project.dir)}\n` };
}

export async function runBuildCommand(argv: readonly string[], cwd: string): Promise<CommandResult> {
  if (!argv.includes("--resume")) return { exitCode: 2, stdout: BUILD_USAGE };
  const project = projectFrom(argv, cwd);
  if (!project.ok) return { exitCode: 2, stdout: BUILD_USAGE };
  return startBuild(project.dir);
}

async function startBuild(projectDir: string): Promise<CommandResult> {
  if (!hasProjectBuildRunner(projectDir) && getBuildRunner() === null) installLiveBuildRunner();
  const outcome = await continueSiteBuild(projectDir);
  if (outcome === "idle" || outcome === "rejected") return { exitCode: 1, stdout: "No site build is queued.\n" };
  return { exitCode: 0, stdout: "The build is started.\n" };
}

export function runDoctorContext(argv: readonly string[], cwd: string): CommandResult {
  const project = projectFrom(argv, cwd);
  if (!project.ok) return { exitCode: 2, stdout: "hh doctor --context [--project <dir>]\n" };
  const findings = auditContext(project.dir);
  if (findings.length === 0) return { exitCode: 0, stdout: "Context files agree.\n" };
  const lines = findings.map((finding) => `${finding.file}: ${finding.problem}\nFix: ${finding.fix}`);
  return { exitCode: 1, stdout: `${lines.join("\n")}\n` };
}
