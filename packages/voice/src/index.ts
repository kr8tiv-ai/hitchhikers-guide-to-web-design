export const PACKAGE_NAME = "@hitchhiker/voice";

export {
  DEFAULT_TIMEOUT_MS,
  WhisperError,
  buildArgs,
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
