import { spawn, type SpawnOptions } from "node:child_process";
import { hiddenChildOptions } from "@hitchhiker/engine";

export interface BrowserChild {
  once(event: "error", listener: (error: Error) => void): void;
  once(event: "exit", listener: (code: number | null) => void): void;
  unref(): void;
}

export interface BrowserSpawn {
  (command: string, args: readonly string[], options: SpawnOptions): BrowserChild;
}

export interface OpenBrowserOptions {
  platform?: NodeJS.Platform;
  spawn?: BrowserSpawn;
}

const DESK_HTTP = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::([0-9]{1,5}))?\/$/;

/** Desk URLs only. `start` is not given a public or file URL. */
function isDeskHttp(url: string): boolean {
  const match = DESK_HTTP.exec(url);
  if (match === null) return false;
  const port = match[1];
  if (port === undefined) return true;
  const number = Number(port);
  return number >= 1 && number <= 65535;
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

/**
 * One verbatim command line: `start "" "<url>"`.
 * The empty title is inside the string, so Node cannot drop it.
 * The line does not start with a quote, so cmd `/s` does not strip it.
 */
export function windowsBrowserLaunch(url: string): { file: string; args: readonly string[] } {
  if (!isDeskHttp(url)) {
    throw new Error("Refusing to open a browser for a non-loopback URL.");
  }
  return {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", `start "" "${url}"`],
  };
}

function defaultSpawn(
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): BrowserChild {
  if (command === "start") {
    const url = args[1] ?? "";
    const planned = windowsBrowserLaunch(url);
    return spawn(planned.file, [...planned.args], hiddenChildOptions({
      ...options,
      windowsVerbatimArguments: true,
    }));
  }
  return spawn(command, [...args], hiddenChildOptions(options));
}

/**
 * Open the desk URL. A missing opener, or a URL that is not
 * http://127.0.0.1 or http://localhost, resolves false. The desk
 * still prints the URL and keeps serving.
 * Success is exit code 0. Detached stays off on Windows: a detached
 * child gets its own console.
 */
export function openBrowser(url: string, options: OpenBrowserOptions = {}): Promise<boolean> {
  if (!isDeskHttp(url)) return Promise.resolve(false);
  const platform = options.platform ?? process.platform;
  const launch = browserLaunch(platform, url);
  const spawnImpl = options.spawn ?? defaultSpawn;
  const childOptions = hiddenChildOptions({
    stdio: "ignore" as const,
    detached: platform !== "win32",
    ...(platform === "win32" ? { windowsVerbatimArguments: true as const } : {}),
  });
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
      child = spawnImpl(launch.command, launch.args, childOptions);
    } catch {
      finish(false);
      return;
    }
    child.unref();
    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0));
  });
}
