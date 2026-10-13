/**
 * `hh brief` drafts or shows the Site Brief.
 * `hh brief --approve` approves it and starts the next phase.
 * Both use the same engine path as the desk.
 */
import {
  approveSiteBrief,
  draftSiteBrief,
  getBuildRunner,
  hasProjectBuildRunner,
  installLiveBuildRunner,
  readBriefDesk,
  think,
} from "@hitchhiker/engine";
import { projectFrom, type CommandResult } from "./context.ts";

const USAGE = "hh brief [--approve] [--project <dir>]\n";

export async function runBriefCommand(
  argv: readonly string[],
  cwd: string,
  thinkImpl: typeof think = think,
): Promise<CommandResult> {
  const project = projectFrom(argv, cwd);
  if (!project.ok) return { exitCode: 2, stdout: USAGE };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--project") {
      index += 1;
      continue;
    }
    if (arg !== "--approve") return { exitCode: 2, stdout: USAGE };
  }
  const approve = argv.includes("--approve");
  if (approve && thinkImpl === think && !hasProjectBuildRunner(project.dir) && getBuildRunner() === null) {
    installLiveBuildRunner();
  }
  try {
    const current = readBriefDesk(project.dir);
    const desk = approve
      ? await approveSiteBrief(project.dir, thinkImpl)
      : current.status === "idle"
        ? await draftSiteBrief(project.dir, thinkImpl)
        : current;
    const lines = [
      `status: ${desk.status}`,
      `phase: ${desk.phase}`,
      `next: ${desk.nextAction}`,
      desk.buildStarted ? "The build is started." : "",
      desk.markdown,
    ].filter((line) => line !== "");
    return { exitCode: 0, stdout: `${lines.join("\n")}\n` };
  } catch (error: unknown) {
    const message = error instanceof Error && error.message.trim() !== "" ? error.message : "The brief did not draft.";
    return { exitCode: 1, stdout: `${message}\n` };
  }
}
