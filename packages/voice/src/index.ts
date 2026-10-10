export const PACKAGE_NAME = "@hitchhiker/voice";

export {
  DEFAULT_TIMEOUT_MS,
  WhisperError,
  buildArgs,
  detectLocalWhisper,
  resolveWhisperPaths,
  transcribe,
} from "./whisper.ts";
export type {
  ProcessResult,
  ResolveOptions,
  Transcript,
  TranscribeDeps,
  TranscribeRequest,
  WhisperErrorCode,
  WhisperPaths,
  WhisperRunner,
} from "./whisper.ts";

export {
  XAI_STT_ENDPOINT,
  assertLocalDoesNotUseXai,
  createXaiTranscriber,
  quoteStt,
} from "./xai-stt.ts";
export type {
  SttQuote,
  XaiTranscribeRequest,
  XaiTranscriber,
  XaiTranscript,
} from "./xai-stt.ts";

export {
  PaidSttBlocked,
  VOICE_FALLBACK,
  VOICE_PRIVACY_HELP,
  engineStatusLabel,
  guardPaidSttRequest,
  isPaidSttUrl,
  selectVoiceEngine,
} from "./select.ts";
export type { EngineSelectionInput, RateAcceptGate, VoiceEngineId } from "./select.ts";

export { browserSpeechConstructor, createWebSpeechEngine, transcribeWebSpeech } from "./web-speech.ts";
export type { BrowserSpeechHost, WebSpeechEngine } from "./web-speech.ts";

export { transcribeWithEngine } from "./engines.ts";
export type { EngineTurn } from "./engines.ts";
