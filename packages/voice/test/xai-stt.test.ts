import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  XAI_STT_ENDPOINT,
  assertLocalDoesNotUseXai,
  createXaiTranscriber,
  quoteStt,
  type XaiTranscribeRequest,
} from "../src/index.ts";

const FIXTURE_KEY = "fixture-key-hh-023-do-not-leak";
const FIXTURE_ENDPOINT = "https://api.x.ai/v1/stt";
const voiceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function codeWithoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function wavBuffer(seconds: number, sampleRate = 16_000): Buffer {
  const channels = 1;
  const bits = 16;
  const byteRate = sampleRate * channels * (bits / 8);
  const dataSize = Math.round(seconds * byteRate);
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(channels, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(byteRate, 28);
  bytes.writeUInt16LE(channels * (bits / 8), 32);
  bytes.writeUInt16LE(bits, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

function writeClip(name: string, seconds: number): { dir: string; wavPath: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-xai-"));
  const wavPath = path.join(dir, name);
  writeFileSync(wavPath, wavBuffer(seconds));
  return { dir, wavPath };
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function assertKeyHidden(error: unknown): void {
  assert.ok(error instanceof Error);
  assert.equal(error.message.includes(FIXTURE_KEY), false);
  assert.equal(String(error).includes(FIXTURE_KEY), false);
  assert.equal("cause" in error && (error as { cause?: unknown }).cause !== undefined, false);
}

test("REST and streaming quotes use the addendum hourly rates", () => {
  const rest = quoteStt({ seconds: 3_600, mode: "rest" });
  assert.equal(rest.usd, 0.1);
  assert.equal(rest.ratePerHour, 0.1);
  assert.equal(rest.mode, "rest");
  assert.match(rest.label, /\$0\.10/);
  assert.match(rest.label, /per hour/);
  assert.match(rest.label, /rest/);
  assert.doesNotMatch(rest.label, /free/i);

  const streaming = quoteStt({ seconds: 3_600, mode: "streaming" });
  assert.equal(streaming.usd, 0.2);
  assert.equal(streaming.ratePerHour, 0.2);
  assert.equal(streaming.mode, "streaming");
  assert.match(streaming.label, /\$0\.20/);
  assert.match(streaming.label, /per hour/);
  assert.match(streaming.label, /streaming/);
  assert.doesNotMatch(streaming.label, /free/i);
});

test("quoteStt for 10 seconds of REST is a small number and the label names per hour", () => {
  const quote = quoteStt({ seconds: 10, mode: "rest" });
  assert.equal(quote.usd, 0.0003);
  assert.ok(quote.usd > 0);
  assert.ok(quote.usd < 0.01);
  assert.match(quote.label, /per hour/);
  assert.match(quote.label, /\$0\.10/);
  assert.doesNotMatch(quote.label, /free/i);
});

test("a 1-second clip still quotes above zero", () => {
  const rest = quoteStt({ seconds: 1, mode: "rest" });
  const streaming = quoteStt({ seconds: 1, mode: "streaming" });
  assert.equal(rest.usd, 0.0001);
  assert.notEqual(rest.usd, 0);
  assert.equal(streaming.usd, 0.0001);
  assert.notEqual(streaming.usd, 0);
  assert.match(rest.label, /\$0\.10/);
  assert.match(streaming.label, /\$0\.20/);
});

test("a half unit of a cent rounds half up", () => {
  assert.equal(quoteStt({ seconds: 9, mode: "rest" }).usd, 0.0003);
});

test("zero, negative, and non-finite durations throw", () => {
  assert.throws(() => quoteStt({ seconds: 0, mode: "rest" }), /greater than zero/);
  assert.throws(() => quoteStt({ seconds: -4, mode: "streaming" }), /greater than zero/);
  assert.throws(() => quoteStt({ seconds: Number.NaN, mode: "rest" }), /finite/);
  assert.throws(
    () => quoteStt({ seconds: Number.POSITIVE_INFINITY, mode: "rest" }),
    /finite/,
  );
  assert.throws(
    () => quoteStt({ seconds: 10, mode: "batch" as "rest" }),
    /rest or streaming/,
  );
});

test("quoteStt does not call fetch", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    return Promise.reject(new Error("global fetch"));
  };
  try {
    const quote = quoteStt({ seconds: 3_600, mode: "rest" });
    assert.equal(quote.usd, 0.1);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("an empty or http endpoint throws before a transcriber exists", () => {
  assert.throws(() => createXaiTranscriber(""), /endpoint/i);
  assert.throws(() => createXaiTranscriber("   "), /endpoint/i);
  assert.throws(() => createXaiTranscriber("http://api.x.ai/v1/stt"), /https/i);
  assert.throws(() => createXaiTranscriber("HTTP://api.x.ai/v1/stt"), /https/i);
  assert.throws(() => createXaiTranscriber("not a url"), /https/i);
});

test("createXaiTranscriber does not call fetch", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => {
    calls += 1;
    return Promise.reject(new Error("global fetch"));
  };
  try {
    const transcribeXai = createXaiTranscriber(FIXTURE_ENDPOINT);
    assert.equal(typeof transcribeXai, "function");
    assert.equal(transcribeXai.engine, "xai");
    assert.equal(calls, 0);
    assert.equal(XAI_STT_ENDPOINT, FIXTURE_ENDPOINT);
  } finally {
    globalThis.fetch = original;
  }
});

test("the injected fetch receives the fixture endpoint and the bearer key", async () => {
  const clip = writeClip("take two.wav", 1);
  const seen: { url: string; init: RequestInit | undefined }[] = [];
  const original = globalThis.fetch;
  let globalCalls = 0;
  globalThis.fetch = () => {
    globalCalls += 1;
    return Promise.reject(new Error("global fetch"));
  };
  const fetchImpl: typeof fetch = (input, init) => {
    seen.push({ url: requestUrl(input), init });
    return Promise.resolve(
      new Response(JSON.stringify({ text: "from the api" }), { status: 200 }),
    );
  };
  try {
    const transcribeXai = createXaiTranscriber(FIXTURE_ENDPOINT);
    const result = await transcribeXai({
      wavPath: clip.wavPath,
      apiKey: FIXTURE_KEY,
      fetchImpl,
    });
    assert.equal(globalCalls, 0);
    assert.equal(seen.length, 1);
    const call = seen[0];
    assert.ok(call);
    assert.equal(call.url, FIXTURE_ENDPOINT);
    assert.equal(call.url.includes(FIXTURE_KEY), false);
    const init = call.init;
    assert.ok(init);
    assert.equal(init.method, "POST");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("authorization"), `Bearer ${FIXTURE_KEY}`);
    assert.deepEqual([...headers.keys()], ["authorization"]);
    assert.ok(init.body instanceof FormData);
    assert.deepEqual([...init.body.keys()], ["model", "file"]);
    assert.equal(init.body.get("model"), "grok-voice-transcribe-2.0");
    const file = init.body.get("file");
    assert.ok(file instanceof File);
    assert.equal(file.name, "take two.wav");
    assert.equal(file.type, "audio/wav");
    assert.deepEqual(result, {
      text: "from the api",
      engine: "xai",
      quote: quoteStt({ seconds: 1, mode: "rest" }),
    });
    assert.equal(result.quote.usd, 0.0001);
    assert.match(result.quote.label, /\$0\.10/);
    assert.doesNotMatch(result.quote.label, /free/i);
  } finally {
    globalThis.fetch = original;
    rmSync(clip.dir, { recursive: true, force: true });
  }
});

test("a caller-supplied https endpoint is the one that is posted", async () => {
  const clip = writeClip("clip.wav", 2);
  const endpoint = "https://example.test/v1/stt";
  let seen = "";
  const fetchImpl: typeof fetch = (input) => {
    seen = requestUrl(input);
    return Promise.resolve(
      new Response(JSON.stringify({ text: "from the api" }), { status: 200 }),
    );
  };
  try {
    const transcribeXai = createXaiTranscriber(endpoint);
    const result = await transcribeXai({
      wavPath: clip.wavPath,
      apiKey: FIXTURE_KEY,
      fetchImpl,
    });
    assert.equal(seen, endpoint);
    assert.notEqual(seen, XAI_STT_ENDPOINT);
    assert.equal(result.engine, "xai");
    assert.equal(result.quote.usd, quoteStt({ seconds: 2, mode: "rest" }).usd);
  } finally {
    rmSync(clip.dir, { recursive: true, force: true });
  }
});

test("a failed response does not echo the API key", async () => {
  const clip = writeClip("clip.wav", 1);
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: FIXTURE_KEY, detail: `bad ${FIXTURE_KEY}` }), {
        status: 401,
        statusText: FIXTURE_KEY,
      }),
    );
  try {
    const transcribeXai = createXaiTranscriber(FIXTURE_ENDPOINT);
    await assert.rejects(
      () =>
        transcribeXai({
          wavPath: clip.wavPath,
          apiKey: FIXTURE_KEY,
          fetchImpl,
        }),
      (error: unknown) => {
        assertKeyHidden(error);
        assert.match((error as Error).message, /401/);
        return true;
      },
    );
  } finally {
    rmSync(clip.dir, { recursive: true, force: true });
  }
});

test("a fetch error that contains the key is redacted", async () => {
  const clip = writeClip("clip.wav", 1);
  const fetchImpl: typeof fetch = () => Promise.reject(new Error(`denied ${FIXTURE_KEY}`));
  try {
    const transcribeXai = createXaiTranscriber(FIXTURE_ENDPOINT);
    await assert.rejects(
      () =>
        transcribeXai({
          wavPath: clip.wavPath,
          apiKey: FIXTURE_KEY,
          fetchImpl,
        }),
      (error: unknown) => {
        assertKeyHidden(error);
        assert.match((error as Error).message, /\[redacted\]/);
        return true;
      },
    );
  } finally {
    rmSync(clip.dir, { recursive: true, force: true });
  }
});

test("fetchImpl is required and global fetch is not a fallback", async () => {
  const clip = writeClip("clip.wav", 1);
  const original = globalThis.fetch;
  let globalCalls = 0;
  globalThis.fetch = () => {
    globalCalls += 1;
    return Promise.reject(new Error("global fetch"));
  };
  try {
    const transcribeXai = createXaiTranscriber(FIXTURE_ENDPOINT);
    const request = {
      wavPath: clip.wavPath,
      apiKey: FIXTURE_KEY,
    } as XaiTranscribeRequest;
    await assert.rejects(() => transcribeXai(request), /fetchImpl/);
    assert.equal(globalCalls, 0);
  } finally {
    globalThis.fetch = original;
    rmSync(clip.dir, { recursive: true, force: true });
  }
});

test("an endpoint that contains the key is refused before fetch", async () => {
  const clip = writeClip("clip.wav", 1);
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls += 1;
    return Promise.reject(new Error(FIXTURE_KEY));
  };
  try {
    const transcribeXai = createXaiTranscriber(`https://example.test/${FIXTURE_KEY}`);
    await assert.rejects(
      () =>
        transcribeXai({
          wavPath: clip.wavPath,
          apiKey: FIXTURE_KEY,
          fetchImpl,
        }),
      (error: unknown) => {
        assertKeyHidden(error);
        return true;
      },
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(clip.dir, { recursive: true, force: true });
  }
});

test("missing audio does not call fetch", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-xai-"));
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls += 1;
    return Promise.reject(new Error("should not run"));
  };
  try {
    const transcribeXai = createXaiTranscriber(FIXTURE_ENDPOINT);
    await assert.rejects(
      () =>
        transcribeXai({
          wavPath: path.join(dir, "missing.wav"),
          apiKey: FIXTURE_KEY,
          fetchImpl,
        }),
      /not found/,
    );
    await assert.rejects(
      () =>
        transcribeXai({
          wavPath: "https://example.test/clip.wav",
          apiKey: FIXTURE_KEY,
          fetchImpl,
        }),
      /local wav/,
    );
    const empty = path.join(dir, "empty.wav");
    writeFileSync(empty, Buffer.alloc(0));
    await assert.rejects(
      () => transcribeXai({ wavPath: empty, apiKey: FIXTURE_KEY, fetchImpl }),
      /empty/,
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty API key throws before fetch", async () => {
  const clip = writeClip("clip.wav", 1);
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls += 1;
    return Promise.reject(new Error("should not run"));
  };
  try {
    const transcribeXai = createXaiTranscriber(FIXTURE_ENDPOINT);
    await assert.rejects(
      () => transcribeXai({ wavPath: clip.wavPath, apiKey: "   ", fetchImpl }),
      /API key/,
    );
    assert.equal(calls, 0);
  } finally {
    rmSync(clip.dir, { recursive: true, force: true });
  }
});

test("voiceEngine local rejects an xAI transcriber and ignores other functions", () => {
  const transcribeXai = createXaiTranscriber("https://example.test/stt");
  assert.throws(
    () => assertLocalDoesNotUseXai({ voiceEngine: "local" }, transcribeXai),
    /local must not use an xAI transcriber/,
  );
  assert.doesNotThrow(() => assertLocalDoesNotUseXai({ voiceEngine: "xai" }, transcribeXai));
  assert.doesNotThrow(() => assertLocalDoesNotUseXai({ voiceEngine: "local" }, undefined));
  assert.doesNotThrow(() =>
    assertLocalDoesNotUseXai({ voiceEngine: "local" }, () => Promise.resolve("local")),
  );
  assert.equal(transcribeXai.engine, "xai");
});

test("import does not build a transcriber or read an API key", () => {
  for (const name of ["xai-stt.ts", "index.ts"]) {
    const code = codeWithoutComments(readFileSync(path.join(voiceRoot, "src", name), "utf8"));
    assert.doesNotMatch(code, /(?<![\w$])fetch\s*\(/);
    assert.doesNotMatch(code, /process\.env/);
    assert.doesNotMatch(code, /XAI_API_KEY/);
    assert.doesNotMatch(code, /\bconsole\./);
    assert.doesNotMatch(code, /textToSpeech|speechSynthesis|text-to-speech|\btts\b/i);
    const calls = code
      .split("\n")
      .filter(
        (line) =>
          line.includes("createXaiTranscriber(") && !line.includes("function createXaiTranscriber"),
      );
    assert.deepEqual(calls, []);
  }
  const index = readFileSync(path.join(voiceRoot, "src", "index.ts"), "utf8");
  assert.match(index, /quoteStt/);
  assert.match(index, /createXaiTranscriber/);
});
