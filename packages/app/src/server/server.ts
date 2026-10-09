import { existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { openBrowser, type BrowserSpawn } from "./open-browser.ts";
import { createDeskApp, type GuideThink, type TurnHandler } from "./routes.ts";

export type { TurnHandler } from "./routes.ts";

const LOOPBACK = "127.0.0.1";

/** The default opener runs once per process. Injected openers stay per call so tests can count them. */
let defaultBrowserOpened = false;

export interface ServerHandle {
  url: string;
  port: number;
  boundHost: typeof LOOPBACK;
  opened: boolean;
  close(): Promise<void>;
}

export interface StartServerOptions {
  projectDir: string;
  port?: number;
  open?: boolean;
  /** Only loopback is accepted. Any other value throws before listen. */
  host?: typeof LOOPBACK;
  turnHandler?: TurnHandler;
  spawn?: BrowserSpawn;
  platform?: NodeJS.Platform;
  /** Shown on the desk status line when replay or record was explicitly allowed. */
  cassetteNotice?: string;
  /** Tests inject the Guide model. Omitted, the desk picks replay, quiet, or live. */
  guideThink?: GuideThink;
  /** Replaces the platform opener. Tests inject this so a refusal can prove it was not called. */
  openBrowser?: (url: string) => Promise<boolean>;
}

/**
 * True when the Host header is this process's loopback port.
 * `localhost` is allowed. Any other host, including a public address, is not.
 */
export function checkHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined) return false;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  const host = hostHeader.trim().toLowerCase();
  if (host.length === 0 || host.includes(",") || host.includes(" ") || host.includes("\t")) {
    return false;
  }
  return host === `${LOOPBACK}:${port}` || host === `localhost:${port}`;
}

/**
 * Listen on 127.0.0.1. Port 0 picks a free port. `open` defaults to false so
 * tests do not launch a browser. A failed opener does not stop the desk.
 */
export async function startServer(opts: StartServerOptions): Promise<ServerHandle> {
  const requested = (opts as { host?: string }).host ?? LOOPBACK;
  if (requested !== LOOPBACK) {
    throw new Error(`Refusing to bind ${requested}. The desk listens on 127.0.0.1 only.`);
  }
  const requestedPort = opts.port ?? 0;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new Error("Port must be an integer from 0 to 65535.");
  }
  const projectDir = path.resolve(opts.projectDir);
  if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
    throw new Error(`Project directory does not exist: ${projectDir}`);
  }

  const app = await createDeskApp({
    projectDir,
    ...(opts.turnHandler === undefined ? {} : { turnHandler: opts.turnHandler }),
    ...(opts.cassetteNotice === undefined ? {} : { cassetteNotice: opts.cassetteNotice }),
    ...(opts.guideThink === undefined ? {} : { guideThink: opts.guideThink }),
  });
  let dispatch: (req: IncomingMessage, res: ServerResponse) => Promise<void> = async () => undefined;
  const server = createServer((req, res) => {
    void dispatch(req, res);
  });
  server.requestTimeout = 0;
  server.timeout = 0;

  dispatch = async (req, res) => {
    try {
      const bound = boundPort();
      const host = typeof req.headers.host === "string" ? req.headers.host : undefined;
      if (!checkHost(host, bound)) {
        sendFixed(req, res, 421, { error: "The desk only answers on localhost." });
        return;
      }
      await app.handle(req, res);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : "request failed";
      process.stderr.write(`Desk error: ${detail}\n`);
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendFixed(req, res, 500, { error: "The desk could not finish that request." });
    }
  };

  const boundPort = (): number => {
    const address = server.address();
    if (address !== null && typeof address === "object") return address.port;
    return 0;
  };

  try {
    await listen(server, requestedPort);
  } catch (error: unknown) {
    app.close();
    if (errorCode(error) === "EADDRINUSE") {
      throw new Error(
        `Port ${requestedPort} is already in use. Leave the port unset, or stop the other desk.`,
      );
    }
    throw error;
  }

  const address = server.address();
  if (address === null || typeof address === "string" || address.address !== LOOPBACK) {
    app.close();
    await closeServer(server);
    throw new Error("The desk did not bind to 127.0.0.1.");
  }

  const port = address.port;
  const url = `http://${LOOPBACK}:${port}/`;
  let opened = false;
  if (opts.open === true) {
    const injected = opts.openBrowser !== undefined || opts.spawn !== undefined;
    if (!injected && defaultBrowserOpened) {
      opened = true;
    } else {
      try {
        opened =
          opts.openBrowser !== undefined
            ? await opts.openBrowser(url)
            : await openBrowser(url, {
                ...(opts.platform === undefined ? {} : { platform: opts.platform }),
                ...(opts.spawn === undefined ? {} : { spawn: opts.spawn }),
              });
      } catch {
        opened = false;
      }
      if (opened && !injected) defaultBrowserOpened = true;
    }
    if (!opened) process.stderr.write(`The browser did not open. Desk: ${url}\n`);
  }

  let closing: Promise<void> | null = null;
  return {
    url,
    port,
    boundHost: LOOPBACK,
    opened,
    close() {
      if (closing === null) {
        app.close();
        closing = closeServer(server);
      }
      return closing;
    },
  };
}

function sendFixed(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
  });
  if (req.method === "HEAD") res.end();
  else res.end(payload);
}

function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(port, LOOPBACK, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof server.closeAllConnections === "function") server.closeAllConnections();
    server.close((error) => {
      if (error !== undefined && errorCode(error) !== "ERR_SERVER_NOT_RUNNING") {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}
