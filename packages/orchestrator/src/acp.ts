/**
 * Scripted ACP client for grok agent stdio.
 *
 * Request shapes and handshake order follow
 * context/sources/xai/cli_headless-scripting.md (ACP section).
 * context/sources/xai/cli_reference.md points `grok agent stdio` at that section.
 * hh-build-plan/RESEARCH-ADDENDUM.md records the same order:
 * initialize, authenticate, session/new, session/prompt.
 *
 * Each method writes one JSON-RPC line and reads one response line.
 * The scripting example also delivers assistant text as session/update
 * notifications on stdout. This client does not read those. A later
 * prompt must re-read that schema before a live stdio process is wired up.
 *
 * initialize clientCapabilities are copied from the scripting example.
 * This client does not serve fs or terminal requests.
 * authenticate sends a method id only. It never places an API key in the JSON.
 */

export interface AcpIo {
  write(line: string): void;
  read(): Promise<string>;
}

export interface AcpClient {
  initialize(): Promise<void>;
  authenticate(): Promise<void>;
  newSession(): Promise<void>;
  prompt(text: string): Promise<void>;
}

type Phase = "idle" | "initialized" | "authenticated" | "ready";

type MethodName = "initialize" | "authenticate" | "session/new" | "session/prompt";

const EXPECTED: Record<MethodName, Phase> = {
  initialize: "idle",
  authenticate: "initialized",
  "session/new": "authenticated",
  "session/prompt": "ready",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPhase(phase: Phase, method: MethodName): void {
  if (phase === EXPECTED[method]) return;
  if (phase === "idle") {
    throw new Error(`Call initialize before ${method}.`);
  }
  if (method === "session/prompt") {
    throw new Error("Call session/new before session/prompt.");
  }
  if (method === "session/new" && phase === "initialized") {
    throw new Error("Call authenticate before session/new.");
  }
  throw new Error(`ACP method ${method} is out of order.`);
}

function parseResponse(line: string, id: number): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err: unknown) {
    throw new Error("ACP response was not JSON.", { cause: err });
  }
  if (!isRecord(parsed)) {
    throw new Error("ACP response was not JSON.");
  }
  if (parsed.id !== id) {
    throw new Error("ACP response id did not match.");
  }
  if (parsed.error != null) {
    const detail =
      isRecord(parsed.error) && typeof parsed.error.message === "string" && parsed.error.message !== ""
        ? parsed.error.message
        : "ACP request failed.";
    throw new Error(detail);
  }
  return parsed.result ?? {};
}

function readAuthMethodIds(result: unknown): string[] {
  if (!isRecord(result) || !Array.isArray(result.authMethods)) return [];
  const ids: string[] = [];
  for (const entry of result.authMethods) {
    if (!isRecord(entry)) continue;
    const id = entry.id;
    if (typeof id === "string" && id !== "") ids.push(id);
  }
  return ids;
}

function apiKeyConfigured(): boolean {
  return (process.env.XAI_API_KEY ?? "") !== "";
}

function chooseAuthMethod(ids: readonly string[]): string {
  const offered = new Set(ids);
  if (apiKeyConfigured() && offered.has("xai.api_key")) return "xai.api_key";
  if (offered.has("cached_token")) return "cached_token";
  throw new Error("Run `grok login` first, or set XAI_API_KEY.");
}

function readSessionId(result: unknown): string {
  if (!isRecord(result) || typeof result.sessionId !== "string" || result.sessionId === "") {
    throw new Error("ACP session/new response did not include a sessionId.");
  }
  return result.sessionId;
}

export function createAcpClient(io: AcpIo): AcpClient {
  let phase: Phase = "idle";
  let nextId = 1;
  let authMethodIds: readonly string[] = [];
  let sessionId: string | null = null;

  async function call(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = nextId;
    nextId += 1;
    io.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    const line = await io.read();
    return parseResponse(line, id);
  }

  return {
    async initialize(): Promise<void> {
      assertPhase(phase, "initialize");
      const result = await call("initialize", {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: true,
        },
      });
      authMethodIds = readAuthMethodIds(result);
      phase = "initialized";
    },

    async authenticate(): Promise<void> {
      assertPhase(phase, "authenticate");
      const methodId = chooseAuthMethod(authMethodIds);
      await call("authenticate", {
        methodId,
        _meta: { headless: true },
      });
      phase = "authenticated";
    },

    async newSession(): Promise<void> {
      assertPhase(phase, "session/new");
      const result = await call("session/new", {
        cwd: process.cwd(),
        mcpServers: [],
      });
      sessionId = readSessionId(result);
      phase = "ready";
    },

    async prompt(text: string): Promise<void> {
      assertPhase(phase, "session/prompt");
      if (text === "") {
        throw new Error("ACP prompt text is empty.");
      }
      if (sessionId === null) {
        throw new Error("Call session/new before session/prompt.");
      }
      await call("session/prompt", {
        sessionId,
        prompt: [{ type: "text", text }],
      });
    },
  };
}
