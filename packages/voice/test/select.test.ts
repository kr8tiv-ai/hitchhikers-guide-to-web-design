import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PaidSttBlocked,
  VOICE_FALLBACK,
  VOICE_PRIVACY_HELP,
  createXaiTranscriber,
  detectLocalWhisper,
  engineStatusLabel,
  guardPaidSttRequest,
  isPaidSttUrl,
  selectVoiceEngine,
  transcribeWebSpeech,
  transcribeWithEngine,
  type EngineSelectionInput,
  type RateAcceptGate,
} from "../src/index.ts";

const voiceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OFF: RateAcceptGate = { settingEnabled: false, rateAccepted: false };
const SETTING_ONLY: RateAcceptGate = { settingEnabled: true, rateAccepted: false };
const RATE_ONLY: RateAcceptGate = { settingEnabled: false, rateAccepted: true };
const BOTH: RateAcceptGate = { settingEnabled: true, rateAccepted: true };

function selection(overrides: Partial<EngineSelectionInput> = {}): EngineSelectionInput {
  return {
    speechRecognition: true,
    webkitSpeechRecognition: false,
    localWhisper: false,
    gate: OFF,
    ...overrides,
  };
}

function wavBuffer(): Buffer {
  const dataSize = 320;
  const bytes = Buffer.alloc(44 + dataSize);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + dataSize, 4);
  bytes.write("WAVE", 8);
  bytes.write("fmt ", 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(dataSize, 40);
  return bytes;
}

test("default mode is browser speech even when whisper and the setting are off", () => {
  assert.equal(
    selectVoiceEngine(selection({ localWhisper: true, gate: OFF })),
    "web-speech",
  );
  assert.equal(engineStatusLabel("web-speech"), "Voice: browser (free)");
});

test("a gate that is not accepted falls back to browser speech", () => {
  assert.equal(selectVoiceEngine(selection({ gate: SETTING_ONLY })), "web-speech");
  assert.equal(selectVoiceEngine(selection({ gate: { settingEnabled: true, rateAccepted: false } })), "web-speech");
});

test("an accepted rate with the setting off falls back to browser speech", () => {
  assert.equal(selectVoiceEngine(selection({ gate: RATE_ONLY })), "web-speech");
});

test("xAI is chosen only when the setting is on and the rate is accepted", () => {
  assert.equal(selectVoiceEngine(selection({ gate: BOTH, localWhisper: true })), "xai");
  assert.equal(engineStatusLabel("xai"), "Voice: xAI (paid, accepted)");
});

test("no browser speech uses local whisper only when it is installed", () => {
  assert.equal(
    selectVoiceEngine(
      selection({ speechRecognition: false, webkitSpeechRecognition: false, localWhisper: true }),
    ),
    "local-whisper",
  );
  assert.equal(engineStatusLabel("local-whisper"), "Voice: local whisper");
});

test("no browser speech and no whisper is none", () => {
  assert.equal(
    selectVoiceEngine(
      selection({ speechRecognition: false, webkitSpeechRecognition: false, localWhisper: false }),
    ),
    "none",
  );
  assert.equal(engineStatusLabel("none"), "Voice: unavailable");
  assert.match(VOICE_FALLBACK, /Type your answer instead/);
  assert.equal(VOICE_FALLBACK.includes("!"), false);
  assert.match(VOICE_PRIVACY_HELP, /Google/);
  assert.match(VOICE_PRIVACY_HELP, /Microsoft/);
  assert.match(VOICE_PRIVACY_HELP, /may leave/);
  assert.equal(VOICE_PRIVACY_HELP.includes("!"), false);
});

test("webkitSpeechRecognition alone selects browser speech", () => {
  assert.equal(
    selectVoiceEngine(
      selection({ speechRecognition: false, webkitSpeechRecognition: true, localWhisper: true }),
    ),
    "web-speech",
  );
});

test("a truthy non-boolean cannot turn xAI on", () => {
  const lied = {
    speechRecognition: true,
    webkitSpeechRecognition: false,
    localWhisper: false,
    gate: { settingEnabled: "yes", rateAccepted: 1 },
  } as unknown as EngineSelectionInput;
  assert.throws(() => selectVoiceEngine(lied), /speech flags/);
});

test("paid hosts are recognized and a fixture host is not", () => {
  const paid = [
    "https://api.x.ai/v1/stt",
    "wss://api.x.ai/v1/stt",
    "https://api.openai.com/v1/audio/transcriptions",
    "https://api.groq.com/openai/v1/audio/transcriptions",
    "https://api.deepgram.com/v1/listen",
    "https://api.assemblyai.com/v2/transcript",
    "https://speech.googleapis.com/v1/speech:recognize",
    "https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1",
    "https://westus.cognitiveservices.azure.com/sts/v1.0/issuetoken",
    "https://transcribe.amazonaws.com/",
    "https://transcribestreaming.amazonaws.com/",
    "https://api.rev.ai/speechtotext/v1/jobs",
    "https://api.speechmatics.com/v2/jobs",
    "https://api.elevenlabs.io/v1/speech-to-text",
  ];
  for (const url of paid) assert.equal(isPaidSttUrl(url), true, url);
  assert.equal(isPaidSttUrl("https://example.test/v1/stt"), false);
  assert.equal(isPaidSttUrl("https://notapi.x.ai/v1/stt"), false);
});

test("the guard throws before a paid call unless both flags are on", () => {
  const url = "https://api.x.ai/v1/stt";
  assert.throws(() => guardPaidSttRequest({ url, optIn: OFF }), PaidSttBlocked);
  assert.throws(() => guardPaidSttRequest({ url, optIn: SETTING_ONLY }), PaidSttBlocked);
  assert.throws(() => guardPaidSttRequest({ url, optIn: RATE_ONLY }), PaidSttBlocked);
  assert.throws(
    () => guardPaidSttRequest({ url: "https://example.test/v1/stt", optIn: OFF, paidEngine: true }),
    PaidSttBlocked,
  );
  assert.doesNotThrow(() =>
    guardPaidSttRequest({ url: "https://example.test/v1/stt", optIn: OFF }),
  );
  assert.doesNotThrow(() => guardPaidSttRequest({ url, optIn: BOTH }));
});

test("default, setting-off, and rate-off transcribe calls do not fetch", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-guard-"));
  const wavPath = path.join(dir, "clip.wav");
  writeFileSync(wavPath, wavBuffer());
  const cases: RateAcceptGate[] = [OFF, SETTING_ONLY, RATE_ONLY];
  try {
    for (const gate of cases) {
      let calls = 0;
      const fetchImpl: typeof fetch = () => {
        calls += 1;
        return Promise.reject(new Error("paid fetch"));
      };
      await assert.rejects(
        () =>
          createXaiTranscriber("https://example.test/v1/stt")({
            wavPath,
            apiKey: "fixture-key-hh-023-do-not-leak",
            fetchImpl,
            optIn: gate,
          }),
        (error: unknown) => error instanceof PaidSttBlocked,
      );
      assert.equal(calls, 0);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("both flags on is the only state that reaches fetch", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-guard-"));
  const wavPath = path.join(dir, "clip.wav");
  writeFileSync(wavPath, wavBuffer());
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls += 1;
    return Promise.resolve(new Response(JSON.stringify({ text: "from the api" }), { status: 200 }));
  };
  try {
    const result = await transcribeWithEngine({
      engine: "xai",
      gate: BOTH,
      wavPath,
      apiKey: "fixture-key-hh-023-do-not-leak",
      fetchImpl,
      endpoint: "https://example.test/v1/stt",
    });
    assert.equal(calls, 1);
    assert.equal(result.engine, "xai");
    assert.equal(result.text, "from the api");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("browser speech and a missing engine do not fetch", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls += 1;
    return Promise.reject(new Error("paid fetch"));
  };
  const heard = await transcribeWithEngine({
    engine: "web-speech",
    gate: OFF,
    webSpeechText: "For myself.",
    fetchImpl,
  });
  assert.equal(heard.text, "For myself.");
  assert.equal(heard.engine, "web-speech");
  await assert.rejects(
    () => transcribeWithEngine({ engine: "none", gate: BOTH, fetchImpl }),
    new RegExp(VOICE_FALLBACK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  const local = await transcribeWithEngine({
    engine: "local-whisper",
    gate: OFF,
    whisperText: "typed nearby",
    fetchImpl,
  });
  assert.equal(local.engine, "local-whisper");
  assert.equal(calls, 0);
  let sessionCalls = 0;
  const text = await transcribeWebSpeech({
    start() {
      sessionCalls += 1;
      return "For myself.";
    },
  });
  assert.equal(text, "For myself.");
  assert.equal(sessionCalls, 1);
  assert.equal(calls, 0);
});

test("local whisper is detected only when both files exist outside packages", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-whisper-detect-"));
  const bin = path.join(dir, process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli");
  const model = path.join(dir, "model.bin");
  writeFileSync(bin, "");
  writeFileSync(model, "weight");
  try {
    assert.equal(
      detectLocalWhisper({
        env: { WHISPER_CPP_BIN: bin, WHISPER_CPP_MODEL: model },
        pathDirs: [],
      }),
      true,
    );
    assert.equal(
      detectLocalWhisper({
        env: {
          WHISPER_CPP_BIN: path.join(dir, "missing-cli"),
          WHISPER_CPP_MODEL: path.join(dir, "missing-model.bin"),
        },
        pathDirs: [],
      }),
      false,
    );
    assert.equal(
      detectLocalWhisper({
        env: { WHISPER_CPP_BIN: bin, WHISPER_CPP_MODEL: path.join(voiceRoot, "missing-weight.bin") },
        pathDirs: [],
      }),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the paid request is guarded before fetchImpl, and browser modules do not fetch", () => {
  const xai = readFileSync(path.join(voiceRoot, "src", "xai-stt.ts"), "utf8");
  const guardAt = xai.indexOf("guardPaidSttRequest(");
  const fetchAt = xai.indexOf("fetchImpl(");
  assert.ok(guardAt >= 0);
  assert.ok(fetchAt > guardAt);
  for (const name of ["src/web-speech.ts", "src/engines.ts", "src/select.ts"]) {
    const text = readFileSync(path.join(voiceRoot, name), "utf8");
    assert.equal(text.includes("fetch("), false, name);
  }
});
