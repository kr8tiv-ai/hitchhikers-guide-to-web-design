/**
 * One dispatcher. The paid branch is createXaiTranscriber, which calls the guard
 * before its request. web-speech and local-whisper never take that branch.
 */

import { VOICE_FALLBACK, type RateAcceptGate, type VoiceEngineId } from "./select.ts";
import { createXaiTranscriber, XAI_STT_ENDPOINT } from "./xai-stt.ts";

export interface EngineTurn {
  engine: VoiceEngineId;
  gate: RateAcceptGate;
  webSpeechText?: string;
  whisperText?: string;
  wavPath?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
}

export async function transcribeWithEngine(
  input: EngineTurn,
): Promise<{ text: string; engine: VoiceEngineId }> {
  if (input === null || typeof input !== "object") {
    throw new Error("A voice turn is required.");
  }
  if (input.engine === "web-speech") {
    if (typeof input.webSpeechText !== "string" || input.webSpeechText.trim().length === 0) {
      throw new Error(VOICE_FALLBACK);
    }
    return { text: input.webSpeechText, engine: "web-speech" };
  }
  if (input.engine === "local-whisper") {
    if (typeof input.whisperText !== "string" || input.whisperText.trim().length === 0) {
      throw new Error("Local whisper returned no text.");
    }
    return { text: input.whisperText, engine: "local-whisper" };
  }
  if (input.engine === "none") {
    throw new Error(VOICE_FALLBACK);
  }
  if (input.engine !== "xai") {
    throw new Error("Unknown voice engine.");
  }
  if (
    typeof input.fetchImpl !== "function" ||
    typeof input.wavPath !== "string" ||
    typeof input.apiKey !== "string"
  ) {
    throw new Error("xAI speech-to-text needs a wav, a key, and fetchImpl.");
  }
  const endpoint = input.endpoint ?? XAI_STT_ENDPOINT;
  const transcribe = createXaiTranscriber(endpoint);
  const result = await transcribe({
    wavPath: input.wavPath,
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    optIn: input.gate,
  });
  return { text: result.text, engine: "xai" };
}
