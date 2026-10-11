export interface PnpmInvocation {
  command: string;
  args: string[];
  /** True when Node must pass args to the child without its own quoting (cmd.exe). */
  verbatim: boolean;
}

const SAFE_ARG = /^[A-Za-z0-9_@.:/\\=+,-]+$/;
const FORBIDDEN_IN_QUOTES = /["%^&|<>!\r\n\0]/;

/** Quote one argument for cmd.exe. Refuses anything cmd could interpret. */
export function quoteCmdArg(arg: string): string {
  if (arg.length === 0) return '""';
  if (SAFE_ARG.test(arg)) return arg;
  if (FORBIDDEN_IN_QUOTES.test(arg)) {
    throw new Error(`Refusing to pass an argument with shell metacharacters to cmd.exe: ${JSON.stringify(arg)}`);
  }
  return `"${arg.endsWith("\\") ? `${arg}\\` : arg}"`;
}

/**
 * Build the spawn call for pnpm. Node 20.12+ refuses to spawn .cmd files without a
 * shell on Windows (EINVAL), so on win32 run `cmd.exe /d /s /c "pnpm.cmd ..."` with
 * verbatim arguments and strict quoting. Other platforms spawn `pnpm` directly.
 */
export function buildPnpmInvocation(
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  comspec: string | undefined = process.env.ComSpec,
): PnpmInvocation {
  if (platform !== "win32") return { command: "pnpm", args: [...args], verbatim: false };
  const line = ["pnpm.cmd", ...args.map(quoteCmdArg)].join(" ");
  return {
    command: comspec && comspec.length > 0 ? comspec : "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    verbatim: true,
  };
}
