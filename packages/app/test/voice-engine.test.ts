import assert from "node:assert/strict";
import { test } from "node:test";
import { renderCard, type CardState } from "../src/card.ts";
import { TALK_NEEDS_CHROMIUM, reshapeDeskCard } from "../src/client/desk.ts";
import {
  PaidSttBlocked,
  VOICE_FALLBACK,
  VOICE_PRIVACY_HELP,
  engineStatusLabel,
  guardPaidSttRequest,
  isPaidSttUrl,
  selectVoiceEngine,
  voiceChromeFor,
  type EngineSelectionInput,
  type RateAcceptGate,
} from "../src/client/voice-engine.ts";

const canonUrl = new URL("../../voice/src/select.ts", import.meta.url);

interface Canon {
  selectVoiceEngine(input: EngineSelectionInput): string;
  engineStatusLabel(id: string): string;
  isPaidSttUrl(value: string): boolean;
  guardPaidSttRequest(input: { url: string; optIn: RateAcceptGate; paidEngine?: boolean }): void;
  VOICE_FALLBACK: string;
  VOICE_PRIVACY_HELP: string;
  PaidSttBlocked: new () => Error;
}

const URLS = [
  "https://api.x.ai/v1/stt",
  "wss://api.x.ai/v1/stt",
  "https://api.openai.com/v1/audio/transcriptions",
  "https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1",
  "https://westus.cognitiveservices.azure.com/sts/v1.0/issuetoken",
  "https://example.test/v1/stt",
];

test("the desk copy matches the voice package selector and guard", async () => {
  const loaded: unknown = await import(canonUrl.href);
  const canon = loaded as Canon;
  const cases: EngineSelectionInput[] = [
    {
      speechRecognition: true,
      webkitSpeechRecognition: false,
      localWhisper: true,
      gate: { settingEnabled: false, rateAccepted: false },
    },
    {
      speechRecognition: true,
      webkitSpeechRecognition: false,
      localWhisper: false,
      gate: { settingEnabled: true, rateAccepted: false },
    },
    {
      speechRecognition: true,
      webkitSpeechRecognition: false,
      localWhisper: false,
      gate: { settingEnabled: false, rateAccepted: true },
    },
    {
      speechRecognition: false,
      webkitSpeechRecognition: false,
      localWhisper: true,
      gate: { settingEnabled: true, rateAccepted: true },
    },
    {
      speechRecognition: false,
      webkitSpeechRecognition: true,
      localWhisper: false,
      gate: { settingEnabled: false, rateAccepted: false },
    },
    {
      speechRecognition: false,
      webkitSpeechRecognition: false,
      localWhisper: false,
      gate: { settingEnabled: false, rateAccepted: false },
    },
  ];
  for (const input of cases) {
    assert.equal(selectVoiceEngine(input), canon.selectVoiceEngine(input));
  }
  for (const id of ["web-speech", "local-whisper", "xai", "none"] as const) {
    assert.equal(engineStatusLabel(id), canon.engineStatusLabel(id));
    const chrome = voiceChromeFor(id);
    assert.equal(chrome.label, engineStatusLabel(id));
    assert.equal(chrome.help, VOICE_PRIVACY_HELP);
    assert.equal(chrome.fallback, id === "none" ? VOICE_FALLBACK : null);
  }
  assert.equal(VOICE_FALLBACK, canon.VOICE_FALLBACK);
  assert.equal(VOICE_PRIVACY_HELP, canon.VOICE_PRIVACY_HELP);
  for (const url of URLS) assert.equal(isPaidSttUrl(url), canon.isPaidSttUrl(url), url);
  const blocked = { url: "https://api.x.ai/v1/stt", optIn: { settingEnabled: true, rateAccepted: false } };
  assert.throws(() => guardPaidSttRequest(blocked), PaidSttBlocked);
  assert.throws(() => canon.guardPaidSttRequest(blocked), canon.PaidSttBlocked);
  assert.doesNotThrow(() =>
    guardPaidSttRequest({
      url: "https://api.x.ai/v1/stt",
      optIn: { settingEnabled: true, rateAccepted: true },
    }),
  );
});

test("the card names the engine, and a browser without speech keeps the draft", () => {
  const ready = reshapeDeskCard(renderCard(card()), true);
  assert.match(ready, /data-voice-engine="web-speech"/);
  assert.match(ready, /Voice: browser \(free\)/);
  assert.match(ready, /data-voice-help[\s\S]*Google[\s\S]*Microsoft[\s\S]*may leave/);
  const entry = entryBlock(ready);
  assert.equal(entry.includes("data-voice-engine"), false);
  assert.match(entry, />Hold to talk</);
  assert.match(ready, /<textarea/);
  assert.equal(ready.includes("!"), false);

  const missing = reshapeDeskCard(renderCard(card()), false);
  assert.match(missing, /data-voice-engine="none"/);
  assert.match(missing, /Voice: unavailable/);
  assert.match(missing, /data-voice-fallback/);
  assert.match(missing, /Type your answer instead/);
  assert.match(entryBlock(missing), new RegExp(`disabled>${TALK_NEEDS_CHROMIUM}</button>`));
  assert.match(missing, /<textarea/);
  assert.equal(missing.includes("role=\"alert\""), false);
  assert.equal(missing.includes("!"), false);

  const local = reshapeDeskCard(renderCard(card()), false, voiceChromeFor("local-whisper"));
  assert.match(local, /data-voice-engine="local-whisper"/);
  assert.match(local, /Voice: local whisper/);
  assert.equal(local.includes("data-voice-fallback"), false);
  assert.match(entryBlock(local), new RegExp(`>${TALK_NEEDS_CHROMIUM}</button>`));

  const paid = reshapeDeskCard(renderCard(card()), true, voiceChromeFor("xai"));
  assert.match(paid, /data-voice-engine="xai"/);
  assert.match(paid, /Voice: xAI \(paid, accepted\)/);
  assert.match(paid, /does not send the microphone to a paid service/);
  assert.equal(paid.includes("data-voice-fallback"), false);
  assert.match(entryBlock(paid), /disabled>Hold to talk</);
});

function card(): CardState {
  return {
    question: {
      id: "DP-0.1",
      module: "towel-check",
      depth: ["deep"],
      ask: "Is this site for you, or for a client?",
      why: "The desk needs an answer.",
      input: ["text", "voice"],
      skipDefault: "For myself.",
      writes: ["PROJECT.md#audience"],
    },
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
}

function entryBlock(html: string): string {
  const matched = /<div class="hh-qcard__entry">[\s\S]*?<\/div>/.exec(html);
  assert.ok(matched, "entry");
  return matched[0];
}
