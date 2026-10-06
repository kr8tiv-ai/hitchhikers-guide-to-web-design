import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createAcpClient, type AcpClient, type AcpIo } from "../src/acp.ts";

const PROMPT = "Say hello in one short sentence.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultLine(id: number, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result });
}

function handshake(sessionId = "sess-test"): string[] {
  return [
    resultLine(1, { authMethods: [{ id: "cached_token" }] }),
    resultLine(2, {}),
    resultLine(3, { sessionId }),
  ];
}

function scripted(responses: readonly string[]): { io: AcpIo; writes: string[] } {
  const writes: string[] = [];
  const pending = [...responses];
  return {
    writes,
    io: {
      write(line: string) {
        writes.push(line);
      },
      read() {
        const next = pending.shift();
        if (next === undefined) {
          return Promise.reject(new Error("scripted stdout has no line"));
        }
        return Promise.resolve(next);
      },
    },
  };
}

interface Sent {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

function parseLine(line: string): Sent {
  assert.equal(line.endsWith("\n"), true);
  assert.equal(line.indexOf("\n"), line.length - 1);
  const raw: unknown = JSON.parse(line);
  if (!isRecord(raw)) assert.fail("request is not an object");
  assert.equal(raw.jsonrpc, "2.0");
  const id = raw.id;
  const method = raw.method;
  const params = raw.params;
  if (typeof id !== "number" || typeof method !== "string" || !isRecord(params)) {
    assert.fail("request shape");
  }
  return { id, method, params };
}

function methods(writes: readonly string[]): string[] {
  return writes.map((line) => parseLine(line).method);
}

async function openSession(client: AcpClient): Promise<void> {
  await client.initialize();
  await client.authenticate();
  await client.newSession();
}

function jsonContains(value: unknown, secret: string): boolean {
  if (typeof value === "string") return value.includes(secret);
  if (Array.isArray(value)) return value.some((entry) => jsonContains(entry, secret));
  if (isRecord(value)) return Object.values(value).some((entry) => jsonContains(entry, secret));
  return false;
}

function assertKeyAbsent(lines: readonly string[]): void {
  const secret = process.env.XAI_API_KEY;
  if (secret === undefined || secret === "") return;
  for (const line of lines) {
    if (jsonContains(JSON.parse(line) as unknown, secret)) {
      assert.fail("ACP JSON contains the API key.");
    }
  }
}

async function expectSilent(run: () => Promise<void>): Promise<void> {
  let calls = 0;
  const previous = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  const sink = (): void => {
    calls += 1;
  };
  console.log = sink;
  console.info = sink;
  console.warn = sink;
  console.error = sink;
  console.debug = sink;
  try {
    await run();
  } finally {
    console.log = previous.log;
    console.info = previous.info;
    console.warn = previous.warn;
    console.error = previous.error;
    console.debug = previous.debug;
  }
  assert.equal(calls, 0);
}

async function withApiKey(value: string | undefined, run: () => Promise<void>): Promise<void> {
  const previous = process.env.XAI_API_KEY;
  if (value === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = value;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previous;
  }
}

test("the four methods write in handshake order", async () => {
  const rig = scripted([...handshake(), resultLine(4, { stopReason: "end_turn" })]);
  const client = createAcpClient(rig.io);

  await expectSilent(async () => {
    await openSession(client);
    await client.prompt(PROMPT);
  });

  assert.deepEqual(methods(rig.writes), [
    "initialize",
    "authenticate",
    "session/new",
    "session/prompt",
  ]);

  const sent = rig.writes.map(parseLine);
  assert.deepEqual(
    sent.map((line) => line.id),
    [1, 2, 3, 4],
  );
  assert.deepEqual(sent[0]?.params, {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
  });
  assert.deepEqual(sent[1]?.params, {
    methodId: "cached_token",
    _meta: { headless: true },
  });
  assert.deepEqual(sent[2]?.params, {
    cwd: process.cwd(),
    mcpServers: [],
  });
  assert.deepEqual(sent[3]?.params, {
    sessionId: "sess-test",
    prompt: [{ type: "text", text: PROMPT }],
  });
  assertKeyAbsent(rig.writes);
});

test("two prompts in a row are allowed after a session exists", async () => {
  const rig = scripted([
    ...handshake("sess-again"),
    resultLine(4, { stopReason: "end_turn" }),
    resultLine(5, { stopReason: "end_turn" }),
  ]);
  const client = createAcpClient(rig.io);

  await expectSilent(async () => {
    await openSession(client);
    await client.prompt("first turn");
    await client.prompt("second turn");
  });

  assert.deepEqual(methods(rig.writes), [
    "initialize",
    "authenticate",
    "session/new",
    "session/prompt",
    "session/prompt",
  ]);
  const fourth = parseLine(rig.writes[3] ?? "");
  const fifth = parseLine(rig.writes[4] ?? "");
  assert.deepEqual(fourth.params.prompt, [{ type: "text", text: "first turn" }]);
  assert.deepEqual(fifth.params.prompt, [{ type: "text", text: "second turn" }]);
  assert.equal(fourth.params.sessionId, "sess-again");
  assert.equal(fifth.params.sessionId, "sess-again");
  assertKeyAbsent(rig.writes);
});

test("skipping initialize throws", async () => {
  const rig = scripted([]);
  const client = createAcpClient(rig.io);
  await assert.rejects(() => client.authenticate(), /initialize/);
  await assert.rejects(() => client.newSession(), /initialize/);
  await assert.rejects(() => client.prompt(PROMPT), /initialize/);
  assert.deepEqual(rig.writes, []);
});

test("session/new before authenticate throws", async () => {
  const rig = scripted(handshake());
  const client = createAcpClient(rig.io);
  await client.initialize();
  await assert.rejects(() => client.newSession(), /authenticate/);
  assert.equal(rig.writes.length, 1);
});

test("session/prompt before session/new throws", async () => {
  const rig = scripted(handshake());
  const client = createAcpClient(rig.io);
  await client.initialize();
  await client.authenticate();
  await assert.rejects(() => client.prompt(PROMPT), /session\/new/);
  assert.equal(rig.writes.length, 2);
});

test("prompt rejects an empty string", async () => {
  const rig = scripted([...handshake(), resultLine(4, { stopReason: "end_turn" })]);
  const client = createAcpClient(rig.io);
  await openSession(client);
  await assert.rejects(() => client.prompt(""), /empty/);
  assert.equal(rig.writes.length, 3);
  await client.prompt(PROMPT);
  assert.equal(parseLine(rig.writes[3] ?? "").method, "session/prompt");
});

test("a response that is not JSON throws", async () => {
  const rig = scripted(["nope", resultLine(2, { authMethods: [{ id: "cached_token" }] })]);
  const client = createAcpClient(rig.io);
  await assert.rejects(() => client.initialize(), /not JSON/);
  await client.initialize();
  assert.equal(parseLine(rig.writes[1] ?? "").id, 2);
});

test("a response id that does not match throws", async () => {
  const wrongNumber = scripted([resultLine(9, {})]);
  await assert.rejects(() => createAcpClient(wrongNumber.io).initialize(), /id did not match/);

  const stringId = scripted([JSON.stringify({ jsonrpc: "2.0", id: "1", result: {} })]);
  await assert.rejects(() => createAcpClient(stringId.io).initialize(), /id did not match/);
});

test("a JSON-RPC error does not advance the handshake", async () => {
  const rig = scripted([
    JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "bad initialize" } }),
  ]);
  const client = createAcpClient(rig.io);
  await assert.rejects(() => client.initialize(), /bad initialize/);
  await assert.rejects(() => client.authenticate(), /initialize/);
  assert.equal(rig.writes.length, 1);
});

test("initialize twice throws", async () => {
  const rig = scripted([resultLine(1, { authMethods: [{ id: "cached_token" }] })]);
  const client = createAcpClient(rig.io);
  await client.initialize();
  await assert.rejects(() => client.initialize(), /out of order/);
  assert.equal(rig.writes.length, 1);
});

test("authenticate without an offered method throws before writing", async () => {
  const rig = scripted([resultLine(1, {})]);
  const client = createAcpClient(rig.io);
  await client.initialize();
  await assert.rejects(() => client.authenticate(), /grok login/);
  assert.equal(rig.writes.length, 1);
});

test("a configured API key selects the method id and stays out of the JSON", async () => {
  const secret = "hh-acp-test-key-do-not-send";
  await withApiKey(secret, async () => {
    const rig = scripted([
      resultLine(1, { authMethods: [{ id: "cached_token" }, { id: "xai.api_key" }] }),
      resultLine(2, {}),
    ]);
    const client = createAcpClient(rig.io);
    await client.initialize();
    await client.authenticate();
    const auth = parseLine(rig.writes[1] ?? "");
    assert.equal(auth.method, "authenticate");
    assert.deepEqual(auth.params, { methodId: "xai.api_key", _meta: { headless: true } });
    assert.equal(jsonContains(JSON.parse(rig.writes[1] ?? "") as unknown, secret), false);
  });
});

test("the client source does not start a process", () => {
  const source = readFileSync(new URL("../src/acp.ts", import.meta.url), "utf8");
  assert.match(source, /context\/sources\/xai\/cli_headless-scripting\.md/);
  assert.match(source, /hh-build-plan\/RESEARCH-ADDENDUM\.md/);
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /\bspawn(Sync)?\b/);
  assert.doesNotMatch(source, /\bfork\b/);
  assert.doesNotMatch(source, /\bexec(File|Sync)?\b/);
  assert.doesNotMatch(source, /console\./);
  assert.doesNotMatch(source, /process\.(stdout|stderr)/);
});
