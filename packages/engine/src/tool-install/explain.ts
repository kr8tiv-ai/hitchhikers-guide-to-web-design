/**
 * Plain-language notes for a failing doctor or desk probe.
 * The words are shared. The probe itself still comes from probePathTools.
 */

import { buildInstallPlan } from "./plan.ts";
import type { HintContext } from "./hints.ts";
import type { PathProbeName } from "./probes.ts";
import { managersOnPath } from "./plan.ts";

export const DOCTOR_DOC = "docs/dont-panic.md";

export interface ProbeNote {
  id: string;
  means: string;
  why: string;
  fix: string;
  doc: string;
}

const TOOL_MEANS: Record<PathProbeName, string> = {
  grok: "The grok command is not on PATH, so the Guide cannot start a build session.",
  playwright: "Playwright is not installed, so browser shots and quality gates cannot run.",
  whisper: "whisper is not on PATH, so local speech recognition is unavailable.",
  pdftotext: "pdftotext is not on PATH, so text cannot be read out of a PDF upload.",
};

const TOOL_WHY: Record<PathProbeName, string> = {
  grok: "Suggest, the queue, and the build all call Grok Build. Without the CLI they have nothing to call.",
  playwright: "Review screenshots and the Mostly Harmless gates use Playwright. The interview still runs without it.",
  whisper: "When this browser cannot listen, the desk uses a local whisper install. Chrome and Edge can still use browser speech.",
  pdftotext: "A brand-guide PDF needs poppler. Images and other files still upload.",
};

export interface DoctorNoteInput {
  nodeOk: boolean;
  gitOk: boolean;
  grokOnPath: boolean;
  auth: string;
  sessionIdMode: string;
  effortFlag: boolean;
  warnings: readonly string[];
}

/** Notes for every failing or missing check. Order is stable. */
export function explainDoctor(report: DoctorNoteInput, context: HintContext = {}): ProbeNote[] {
  const notes: ProbeNote[] = [];
  if (!report.nodeOk) notes.push(explainRuntime("node", context));
  if (!report.gitOk) notes.push(explainRuntime("git", context));
  if (!report.grokOnPath) notes.push(explainTool("grok", context));
  for (const name of ["playwright", "whisper", "pdftotext"] as const) {
    if (report.warnings.some((warning) => warning.startsWith(`${name}:`))) {
      notes.push(explainTool(name, context));
    }
  }
  if (report.grokOnPath && report.auth !== "signed-in" && report.auth !== "skipped") {
    notes.push(explainRuntime("auth", context, report.auth));
  }
  if (report.grokOnPath && report.sessionIdMode === "unknown") {
    notes.push(explainRuntime("session-id", context));
  }
  if (report.grokOnPath && !report.effortFlag) {
    notes.push(explainRuntime("effort", context));
  }
  return notes;
}

/** One tool note. The manual command comes from the same install plan as `hh doctor` hints. */
export function explainTool(name: PathProbeName, context: HintContext = {}): ProbeNote {
  return {
    id: name,
    means: TOOL_MEANS[name],
    why: TOOL_WHY[name],
    fix: toolFix(name, context),
    doc: DOCTOR_DOC,
  };
}

export function explainRuntime(
  id: "node" | "git" | "auth" | "session-id" | "effort",
  context: HintContext = {},
  auth: string = "unknown",
): ProbeNote {
  const platform = context.platform ?? process.platform;
  const managers = context.managers ?? managersOnPath(context.env ?? process.env, platform);
  if (id === "node") {
    return {
      id,
      means: "Node.js is older than 22, so the Guide will not start.",
      why: "The desk and the CLI run TypeScript on Node 22 or newer. An older Node exits 1.",
      fix: nodeFix(platform),
      doc: DOCTOR_DOC,
    };
  }
  if (id === "git") {
    return {
      id,
      means: "git is not on PATH, so saves cannot record a commit and the queue cannot roll back.",
      why: "The build is one prompt, one commit. Without git, that record does not exist. This is a warning. Node 22 still exits 0.",
      fix: gitFix(platform, managers),
      doc: DOCTOR_DOC,
    };
  }
  if (id === "auth") {
    return authNote(auth);
  }
  if (id === "session-id") {
    return {
      id,
      means: "grok --help did not say whether a new session id is a UUID or an alias.",
      why: "A fresh build session needs the right flag. Doctor will not guess one.",
      fix: "Upgrade the Grok Build CLI, run hh doctor again, and pass an explicit session id if it is still unknown.",
      doc: DOCTOR_DOC,
    };
  }
  return {
    id,
    means: "grok --help did not list an effort flag.",
    why: "Prompt tiers ask for medium, high, or extra-high effort. Without the flag, grok uses its own default.",
    fix: "Upgrade the Grok Build CLI if a prompt must set effort. The desk still runs.",
    doc: DOCTOR_DOC,
  };
}

export function formatProbeNotes(notes: readonly ProbeNote[]): string[] {
  const lines: string[] = [];
  for (const note of notes) {
    lines.push(`note ${note.id}:`);
    lines.push(`means: ${note.means}`);
    lines.push(`why: ${note.why}`);
    lines.push(`fix: ${note.fix}`);
    lines.push(`doc: ${note.doc}`);
  }
  return lines;
}

function authNote(auth: string): ProbeNote {
  if (auth === "signed-out") {
    return {
      id: "auth",
      means: "grok is on PATH and the status probe says signed out.",
      why: "A build session spends your Grok Build plan. It cannot start while you are signed out.",
      fix: "Run grok login in a terminal, then run hh doctor again. The desk does not type the password.",
      doc: DOCTOR_DOC,
    };
  }
  if (auth === "no-flag") {
    return {
      id: "auth",
      means: "grok --help has no non-interactive status flag, so doctor cannot tell whether you are signed in.",
      why: "Doctor will not invent a login subcommand or send a credential.",
      fix: "Upgrade the Grok Build CLI, then run hh doctor again. Sign in with grok login if a later session asks.",
      doc: DOCTOR_DOC,
    };
  }
  return {
    id: "auth",
    means: "The auth probe did not say signed-in or signed-out.",
    why: "The desk will not guess. A build session may refuse to start until the status is clear.",
    fix: "Run grok login if you have not signed in, then run hh doctor again.",
    doc: DOCTOR_DOC,
  };
}

function nodeFix(platform: NodeJS.Platform): string {
  if (platform === "win32") {
    return "Install Node.js 22 or newer with the Windows installer from nodejs.org/en/download";
  }
  if (platform === "darwin") {
    return "Install Node.js 22 or newer with the macOS installer from nodejs.org/en/download. Homebrew is not required.";
  }
  return "Install Node.js 22 or newer from the Linux tarball at nodejs.org/en/download or from your distro Node 22 package.";
}

function gitFix(platform: NodeJS.Platform, managers: readonly string[]): string {
  if (platform === "win32") return "Install Git for Windows from git-scm.com/download/win";
  if (platform === "darwin") {
    return "Install Git with xcode-select --install, or the macOS installer from git-scm.com/download/mac. Homebrew is not required.";
  }
  if (managers.includes("apt-get")) return "sudo apt-get install -y git";
  if (managers.includes("dnf")) return "sudo dnf install -y git";
  if (managers.includes("pacman")) return "sudo pacman -S --noconfirm git";
  if (managers.includes("zypper")) return "sudo zypper install -y git";
  return "Install the git package from your Linux distro. The package name is git.";
}

function toolFix(name: PathProbeName, context: HintContext): string {
  const platform = context.platform ?? process.platform;
  try {
    const plan = buildInstallPlan(name, null, {
      platform,
      arch: context.arch ?? process.arch,
      managers: context.managers ?? managersOnPath(context.env ?? process.env, platform),
      dataDir: context.dataDir ?? "",
      browsersDir: context.browsersDir ?? "",
      workspaceDir: context.workspaceDir ?? "",
    });
    return `Install ${name} from the desk Install button. Manual: ${plan.manualCommand}`;
  } catch {
    return `Install ${name} from the desk Install button, then run hh doctor again.`;
  }
}
