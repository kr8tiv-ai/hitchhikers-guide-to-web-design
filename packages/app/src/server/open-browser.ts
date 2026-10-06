import { spawn, type SpawnOptions } from "node:child_process";

export interface BrowserChild {
  once(event: "error", listener: (error: Error) => void): void;
  once(event: "spawn", listener: () => void): void;
  unref(): void;
}

export interface BrowserSpawn {
  (command: string, args: readonly string[], options: SpawnOptions): BrowserChild;
}

export interface OpenBrowserOptions {
  platform?: NodeJS.Platform;
  spawn?: BrowserSpawn;
}

/**
 * `start` on Windows is a cmd builtin, not an executable. The real spawn
 * wraps it in cmd.exe. An injected spawn still sees the command `start`.
 */
export function browserLaunch(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: readonly string[] } {
  if (platform === "win32") return { command: "start", args: ["", url] };
  if (platform === "darwin") return { command: "open", args: [url] };
  return { command: "xdg-open", args: [url] };
}

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): BrowserChild {
  if (command === "start") {
    return spawn("cmd.exe", ["/d", "/s", "/c", "start", ...args], { ...options, shell: false });
  }
  return spawn(command, [...args], { ...options, shell: false });
}

/**
 * Open the desk URL. A missing opener resolves false so a headless machine
 * still prints the URL and keeps serving.
 */
export function openBrowser(url: string, options: OpenBrowserOptions = {}): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  const launch = browserLaunch(platform, url);
  const spawnImpl = options.spawn ?? defaultSpawn;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (opened: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(opened);
    };
    const timer = setTimeout(() => finish(false), 5_000);
    timer.unref();
    let child: BrowserChild;
    try {
      child = spawnImpl(launch.command, launch.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      finish(false);
      return;
    }
    child.unref();
    child.once("error", () => finish(false));
    child.once("spawn", () => finish(true));
  });
}
