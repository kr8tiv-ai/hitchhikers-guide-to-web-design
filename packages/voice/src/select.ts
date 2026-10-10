/**
 * Deterministic speech-engine pick, and the gate in front of every paid STT call.
 * xAI wins only when the setting is on and the rate-accept gate is accepted.
 * Anything else uses browser speech, then an installed local whisper, then none.
 * This module does not call the network.
 */

export type VoiceEngineId = "web-speech" | "local-whisper" | "xai" | "none";

export interface RateAcceptGate {
  settingEnabled: boolean;
  rateAccepted: boolean;
}

export interface EngineSelectionInput {
  speechRecognition: boolean;
  webkitSpeechRecognition: boolean;
  localWhisper: boolean;
  gate: RateAcceptGate;
}

export const VOICE_FALLBACK =
  "Voice input needs Chrome or Edge on this computer. Type your answer instead.";

export const VOICE_PRIVACY_HELP =
  "Browser speech recognition is free to you, and the browser vendor processes it. For example, Google does this in Chrome and Microsoft does this in Edge, so audio may leave this device.";

/** Exact hosts. A subdomain matches only as a dotted suffix. */
const PAID_STT_HOSTS = [
  "api.x.ai",
  "api.openai.com",
  "api.groq.com",
  "api.deepgram.com",
  "api.assemblyai.com",
  "speech.googleapis.com",
  "transcribe.amazonaws.com",
  "transcribestreaming.amazonaws.com",
  "api.rev.ai",
  "api.speechmatics.com",
  "api.elevenlabs.io",
] as const;

/** Suffixes include the leading dot. */
const PAID_STT_SUFFIXES = [".cognitiveservices.azure.com", ".stt.speech.microsoft.com"] as const;

const PAID_PROTOCOLS = new Set(["https:", "http:", "wss:", "ws:"]);

export class PaidSttBlocked extends Error {
  readonly code = "PAID_STT_BLOCKED";

  constructor() {
    super("Paid speech-to-text stays off until xAI is enabled and the rate is accepted.");
    this.name = "PaidSttBlocked";
  }
}

export function selectVoiceEngine(input: EngineSelectionInput): VoiceEngineId {
  if (!isSelection(input)) {
    throw new Error("Voice engine selection needs speech flags and a rate gate.");
  }
  if (input.gate.settingEnabled === true && input.gate.rateAccepted === true) return "xai";
  if (input.speechRecognition === true || input.webkitSpeechRecognition === true) return "web-speech";
  if (input.localWhisper === true) return "local-whisper";
  return "none";
}

export function engineStatusLabel(id: VoiceEngineId): string {
  if (id === "web-speech") return "Voice: browser (free)";
  if (id === "local-whisper") return "Voice: local whisper";
  if (id === "xai") return "Voice: xAI (paid, accepted)";
  if (id === "none") return "Voice: unavailable";
  throw new Error("Unknown voice engine.");
}

export function isPaidSttUrl(value: string): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (!PAID_PROTOCOLS.has(url.protocol)) return false;
  return hostIsPaid(url.hostname);
}

export function guardPaidSttRequest(input: {
  url: string;
  optIn: RateAcceptGate;
  paidEngine?: boolean;
}): void {
  if (input === null || typeof input !== "object") {
    throw new Error("A paid speech-to-text guard needs a URL and an opt-in gate.");
  }
  if (typeof input.url !== "string" || !isGate(input.optIn)) {
    throw new Error("A paid speech-to-text guard needs a URL and an opt-in gate.");
  }
  const paid = input.paidEngine === true || isPaidSttUrl(input.url);
  if (!paid) return;
  if (input.optIn.settingEnabled === true && input.optIn.rateAccepted === true) return;
  throw new PaidSttBlocked();
}

function hostIsPaid(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/\.+$/, "");
  for (const item of PAID_STT_HOSTS) {
    if (name === item || name.endsWith(`.${item}`)) return true;
  }
  for (const suffix of PAID_STT_SUFFIXES) {
    if (name.endsWith(suffix) || name === suffix.slice(1)) return true;
  }
  return false;
}

function isSelection(input: EngineSelectionInput): boolean {
  if (input === null || typeof input !== "object") return false;
  if (typeof input.speechRecognition !== "boolean") return false;
  if (typeof input.webkitSpeechRecognition !== "boolean") return false;
  if (typeof input.localWhisper !== "boolean") return false;
  return isGate(input.gate);
}

function isGate(value: RateAcceptGate): boolean {
  if (value === null || typeof value !== "object") return false;
  return typeof value.settingEnabled === "boolean" && typeof value.rateAccepted === "boolean";
}
