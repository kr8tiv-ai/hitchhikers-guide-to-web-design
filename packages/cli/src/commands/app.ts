import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { cassetteNotice, cassetteRefusal } from "../cassette-guard.ts";
import { deskPreflight, spawnCommand, type CommandRunner } from "../doctor.ts";

const USAGE = "Usage: hh app [--project <dir>] [--port <n>] [--no-open] [--cassette]";
const HELP = `${USAGE}
--cassette keeps HH_CASSETTE=replay or record. HH_ALLOW_CASSETTE=1 does the same.
`;

export type ParsedApp =
  | { ok: true; help: true }
  | { ok: true; help: false; projectDir: string; port: number; open: boolean }
  | { ok: false; error: string };

interface StartedDesk {
  url: string;
  opened: boolean;
  close(): Promise<void>;
}

interface DeskPreflightPayload {
  grokOk: boolean;
  probes: readonly { name: "grok" | "playwright" | "whisper" | "pdftotext"; ok: boolean; detail: string }[];
}

interface DeskModule {
  startServer(opts: {
    projectDir: string;
    port?: number;
    open?: boolean;
    cassetteNotice?: string;
    openBrowser?: (url: string) => Promise<boolean>;
    preflight?: DeskPreflightPayload;
  }): Promise<StartedDesk>;
}

export interface RunAppOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Injected browser opener. A cassette refusal must not call it. */
  open?: (url: string) => Promise<boolean>;
  /** Same runner `hh doctor` uses. Omitted, probes spawn on PATH. */
  runner?: CommandRunner;
}

let active: StartedDesk | null = null;

/** Close the desk started by this process, if `hh app` is still serving. */
export function closeActiveApp(): Promise<void> {
  const current = active;
  active = null;
  if (current === null) return Promise.resolve();
  return current.close();
}

/** Flags for `hh app`. Unknown flags and duplicates are errors. */
export function parseAppArgs(argv: readonly string[], cwd = process.cwd()): ParsedApp {
  let project: string | undefined;
  let port = 0;
  let open = true;
  let sawProject = false;
  let sawPort = false;
  let sawOpen = false;
  let sawCassette = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { ok: true, help: true };
    if (arg === "--no-open") {
      if (sawOpen) return { ok: false, error: `Flag --no-open was given twice. ${USAGE}` };
      sawOpen = true;
      open = false;
      continue;
    }
    if (arg === "--cassette") {
      if (sawCassette) return { ok: false, error: `Flag --cassette was given twice. ${USAGE}` };
      sawCassette = true;
      continue;
    }
    if (arg === "--project") {
      if (sawProject) return { ok: false, error: `Flag --project was given twice. ${USAGE}` };
      const value = argv[index + 1];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        return { ok: false, error: `Missing --project. ${USAGE}` };
      }
      project = value;
      sawProject = true;
      index += 1;
      continue;
    }
    if (arg === "--port") {
      if (sawPort) return { ok: false, error: `Flag --port was given twice. ${USAGE}` };
      const value = argv[index + 1];
      if (value === undefined || !/^\d+$/.test(value)) {
        return { ok: false, error: `Port must be an integer from 0 to 65535. ${USAGE}` };
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed > 65535) {
        return { ok: false, error: `Port must be an integer from 0 to 65535. ${USAGE}` };
      }
      port = parsed;
      sawPort = true;
      index += 1;
      continue;
    }
    return { ok: false, error: `Unexpected argument. ${USAGE}` };
  }

  return {
    ok: true,
    help: false,
    projectDir: path.resolve(cwd, project ?? "."),
    port,
    open,
  };
}

/**
 * Start the companion app for a project directory.
 * The CLI package cannot depend on the app package, so the server is loaded
 * by file URL from the sibling package in this repo.
 */
export async function runApp(
  argv: readonly string[],
  opts: RunAppOptions = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const env = opts.env ?? process.env;
  const parsed = parseAppArgs(argv, opts.cwd ?? process.cwd());
  if (!parsed.ok) return { exitCode: 1, stdout: `${parsed.error}\n`, stderr: "" };
  if (parsed.help) return { exitCode: 0, stdout: HELP, stderr: "" };
  const refusal = cassetteRefusal(env, argv);
  if (refusal !== null) return { exitCode: 2, stdout: "", stderr: refusal };
  const notice = cassetteNotice(env, argv);

  const serverFile = path.resolve(import.meta.dirname, "../../../app/src/server/server.ts");
  if (!existsSync(serverFile)) {
    return {
      exitCode: 1,
      stdout: "The companion app is not next to the CLI. Run hh app from the Guide repo.\n",
      stderr: "",
    };
  }

  let loaded: unknown;
  try {
    loaded = await import(pathToFileURL(serverFile).href);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The companion app did not load.";
    return { exitCode: 1, stdout: `${message}\n`, stderr: "" };
  }
  if (!isDeskModule(loaded)) {
    return { exitCode: 1, stdout: "The companion app did not load.\n", stderr: "" };
  }

  try {
    const handle = await loaded.startServer({
      projectDir: parsed.projectDir,
      port: parsed.port,
      open: parsed.open,
      preflight: deskPreflight(opts.runner ?? { run: spawnCommand }),
      ...(notice === null ? {} : { cassetteNotice: notice }),
      ...(opts.open === undefined ? {} : { openBrowser: opts.open }),
    });
    if (!isHandle(handle)) {
      return { exitCode: 1, stdout: "The companion app did not load.\n", stderr: "" };
    }
    active = handle;
    let stdout = `${handle.url}\n`;
    if (parsed.open && !handle.opened) {
      stdout += "The browser did not open. Use the URL above.\n";
    }
    return { exitCode: 0, stdout, stderr: "" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "The desk did not start.";
    return { exitCode: 1, stdout: `${message}\n`, stderr: "" };
  }
}

function isDeskModule(value: unknown): value is DeskModule {
  return isRecord(value) && typeof value.startServer === "function";
}

function isHandle(value: unknown): value is StartedDesk {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    typeof value.opened === "boolean" &&
    typeof value.close === "function"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
