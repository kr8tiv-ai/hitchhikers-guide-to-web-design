import { managersOnPath, playwrightBrowsersCache, toolDataDir, buildInstallPlan } from "./plan.ts";
import type { InstallTool } from "./types.ts";

export interface HintContext {
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  managers?: readonly string[];
  dataDir?: string;
  browsersDir?: string;
  workspaceDir?: string;
}

const OPTIONAL = ["playwright", "whisper", "pdftotext"] as const;

/**
 * One hint line per missing tool. The manual command is the stable recipe
 * string. It does not include a home directory. Nothing is installed.
 */
export function installHints(
  report: { grokOnPath: boolean; warnings: readonly string[] },
  context: HintContext = {},
): string[] {
  const platform = context.platform ?? process.platform;
  const env = context.env ?? process.env;
  const managers = context.managers ?? managersOnPath(env, platform);
  const lines: string[] = [];
  const missing: InstallTool[] = [];
  if (!report.grokOnPath) missing.push("grok");
  for (const name of OPTIONAL) {
    if (report.warnings.some((warning) => warning.startsWith(`${name}:`))) missing.push(name);
  }
  for (const tool of missing) {
    try {
      const plan = buildInstallPlan(tool, null, {
        platform,
        arch: context.arch ?? process.arch,
        managers,
        dataDir: context.dataDir ?? toolDataDir(platform, env),
        browsersDir: context.browsersDir ?? playwrightBrowsersCache(platform, env),
        workspaceDir: context.workspaceDir ?? "",
      });
      lines.push(`hint: Install ${tool} from the desk Install button. Manual: ${plan.manualCommand}`);
    } catch {
      lines.push(`hint: Install ${tool} from the desk Install button.`);
    }
  }
  return lines;
}
