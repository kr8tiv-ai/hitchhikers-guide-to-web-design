import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Opt-in xAI speech-to-text.
 *
 * The CLI or the app passes the API key. This file does not read
 * XAI_API_KEY, does not read process.env, and does not load a key from
 * a file. Importing the module does not create a transcriber and does
 * not call the network.
 *
 * Rates are the 2026-09-29 card in the research addendum: $0.10 per
 * hour for REST and $0.20 per hour for streaming. There is no
 * text-to-speech in this module.
 *
 * The local speech guide names https://api.x.ai/v1/stt. That string is
 * XAI_STT_ENDPOINT. Pass it to createXaiTranscriber. Nothing requests
 * it on load. A later prompt can change the constant if the path moves.
 */

/** Documented REST path. Inert until a caller passes it. */
export const XAI_STT_ENDPOINT = "https://api.x.ai/v1/stt";

const TRANSCRIBE_MODEL = "grok-voice-transcribe-2.0";
const SECONDS_PER_HOUR = 3_600;
const USD_SCALE = 10_000;
/** Redact only long secrets so a short substring cannot rewrite a status line. */
const MIN_SECRET_LENGTH = 12;

/**
 * Hourly card for REST and streaming. quoteStt reads this object.
 * Callers import it. Do not copy the numbers into another package.
 */
export const XAI_STT_RATES = {
  rest: { ratePerHour: 0.1, unitsPerHour: 1_000, priceText: "$0.10" },
  streaming: { ratePerHour: 0.2, unitsPerHour: 2_000, priceText: "$0.20" },
} as const;

export interface SttQuote {
  usd: number;
  ratePerHour: number;
  mode: "rest" | "streaming";
  label: string;
}

export interface XaiTranscribeRequest {
  wavPath: string;
  apiKey: string;
  fetchImpl: typeof fetch;
}

export interface XaiTranscript {
  text: string;
  engine: "xai";
  quote: SttQuote;
}

export type XaiTranscriber = ((req: XaiTranscribeRequest) => Promise<XaiTranscript>) & {
  readonly engine: "xai";
};

/**
 * Quote a clip. This does not call the network.
 * usd is seconds / 3600 times the hourly rate, rounded half up to 4
 * decimal places. A positive amount that would round to 0 is kept at
 * $0.0001, so a 1-second clip is not quoted as $0.
 */
export function quoteStt(input: { seconds: number; mode: "rest" | "streaming" }): SttQuote {
  if (input === null || typeof input !== "object") {
    throw new Error("A speech-to-text quote needs seconds and a mode.");
  }
  if (typeof input.seconds !== "number" || !Number.isFinite(input.seconds)) {
    throw new Error("Speech-to-text duration must be a finite number of seconds.");
  }
  if (input.seconds <= 0) {
    throw new Error("Speech-to-text duration must be greater than zero seconds.");
  }
  if (input.mode !== "rest" && input.mode !== "streaming") {
    throw new Error("Speech-to-text mode must be rest or streaming.");
  }
  const rate = XAI_STT_RATES[input.mode];
  const exactUnits = (input.seconds * rate.unitsPerHour) / SECONDS_PER_HOUR;
  if (!Number.isFinite(exactUnits)) {
    throw new Error("Speech-to-text duration is too large to quote.");
  }
  let units = Math.round(exactUnits);
  if (exactUnits > 0 && units < 1) {
    units = 1;
  }
  if (!Number.isSafeInteger(units) || units < 1) {
    throw new Error("Speech-to-text duration is too large to quote.");
  }
  const usd = units / USD_SCALE;
  const label = `Speech-to-text in ${input.mode} mode is ${rate.priceText} per hour.`;
  return {
    usd,
    ratePerHour: rate.ratePerHour,
    mode: input.mode,
    label,
  };
}

/**
 * Build a REST transcriber for one https endpoint.
 * An empty endpoint throws here. The returned function does not run
 * until the caller invokes it. fetchImpl is required on that call.
 * There is no global fetch fallback.
 */
export function createXaiTranscriber(endpoint: string): XaiTranscriber {
  const target = requireHttpsEndpoint(endpoint);
  const transcribe = async (req: XaiTranscribeRequest): Promise<XaiTranscript> =>
    transcribeAt(target, req);
  return Object.assign(transcribe, { engine: "xai" as const });
}

/**
 * The interview engine calls this before it would hand work to xAI.
 * voiceEngine local plus an xAI transcriber throws. A local project
 * that passes no transcriber, or a function that is not this client,
 * is left alone.
 */
export function assertLocalDoesNotUseXai(
  config: { voiceEngine: "local" | "xai" },
  transcriber: unknown,
): void {
  if (config === null || typeof config !== "object") {
    throw new Error("voiceEngine config is required.");
  }
  if (config.voiceEngine !== "local" && config.voiceEngine !== "xai") {
    throw new Error("voiceEngine must be local or xai.");
  }
  if (config.voiceEngine === "local" && isXaiTranscriber(transcriber)) {
    throw new Error("voiceEngine local must not use an xAI transcriber.");
  }
}

async function transcribeAt(target: string, req: XaiTranscribeRequest): Promise<XaiTranscript> {
  if (req === null || typeof req !== "object") {
    throw new Error("A transcribe request is required.");
  }
  if (typeof req.fetchImpl !== "function") {
    throw new Error("fetchImpl is required.");
  }
  if (typeof req.apiKey !== "string" || req.apiKey.trim().length === 0) {
    throw new Error("An API key argument is required.");
  }
  const apiKey = req.apiKey.trim();
  const fetchImpl = req.fetchImpl;
  if (apiKey.length >= MIN_SECRET_LENGTH && target.includes(apiKey)) {
    throw publicError("Speech-to-text endpoint must not contain the API key.", apiKey);
  }

  assertLocalWavPath(req.wavPath, apiKey);
  const bytes = await readWav(req.wavPath, apiKey);
  let seconds: number;
  try {
    seconds = wavDurationSeconds(bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audio must be a readable wav file.";
    throw publicError(message, apiKey);
  }
  // The hourly rate is known before the request is sent.
  const quote = quoteStt({ seconds, mode: "rest" });

  const filename = path.basename(req.wavPath);
  const uploadName = filename.length > 0 ? filename : "audio.wav";
  const form = new FormData();
  form.append("model", TRANSCRIBE_MODEL);
  form.append("file", new File([bytes], uploadName, { type: "audio/wav" }));

  let response: Response;
  try {
    response = await fetchImpl(target, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "xAI speech-to-text request failed.";
    throw publicError(message, apiKey);
  }

  if (typeof response !== "object" || response === null || typeof response.ok !== "boolean") {
    throw publicError("xAI speech-to-text returned an unreadable response.", apiKey);
  }
  if (!response.ok) {
    throw publicError(`xAI speech-to-text failed with status ${response.status}.`, apiKey);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw publicError("xAI speech-to-text returned an unreadable response.", apiKey);
  }
  if (!isRecord(payload) || typeof payload.text !== "string" || payload.text.trim().length === 0) {
    throw publicError("xAI speech-to-text returned no text.", apiKey);
  }
  return { text: payload.text, engine: "xai", quote };
}

function requireHttpsEndpoint(endpoint: string): string {
  if (typeof endpoint !== "string") {
    throw new Error("An https speech-to-text endpoint is required.");
  }
  const trimmed = endpoint.trim();
  if (trimmed.length === 0) {
    throw new Error("An https speech-to-text endpoint is required.");
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Speech-to-text endpoint must be an https URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("Speech-to-text endpoint must be https.");
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error("Speech-to-text endpoint must not carry credentials.");
  }
  return trimmed;
}

function assertLocalWavPath(wavPath: string, apiKey: string): void {
  if (typeof wavPath !== "string" || wavPath.trim().length === 0) {
    throw publicError("Audio must be a local wav file.", apiKey);
  }
  const lowered = wavPath.trim().toLowerCase();
  if (
    lowered.startsWith("http:") ||
    lowered.startsWith("https:") ||
    lowered.startsWith("file:")
  ) {
    throw publicError("Audio must be a local wav file.", apiKey);
  }
  if (path.extname(wavPath).toLowerCase() !== ".wav") {
    throw publicError("Audio must be a .wav file.", apiKey);
  }
}

async function readWav(wavPath: string, apiKey: string): Promise<Buffer> {
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(wavPath);
  } catch {
    throw publicError("Audio file was not found.", apiKey);
  }
  if (!info.isFile()) {
    throw publicError("Audio path is not a file.", apiKey);
  }
  if (info.size === 0) {
    throw publicError("Audio file is empty.", apiKey);
  }
  try {
    return await readFile(wavPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audio file could not be read.";
    throw publicError(message, apiKey);
  }
}

function wavDurationSeconds(bytes: Buffer): number {
  if (
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Audio must be a readable wav file.");
  }
  let offset = 12;
  let byteRate = 0;
  let dataBytes = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 16 && start + 16 <= bytes.length) {
      byteRate = bytes.readUInt32LE(start + 8);
    } else if (id === "data" && start <= bytes.length) {
      dataBytes = Math.min(size, bytes.length - start);
    }
    const next = start + size + (size % 2);
    if (!Number.isFinite(next) || next <= offset) break;
    offset = next;
  }
  if (byteRate <= 0 || dataBytes <= 0) {
    throw new Error("Audio wav is missing duration data.");
  }
  return dataBytes / byteRate;
}

function isXaiTranscriber(value: unknown): boolean {
  if (typeof value === "function") {
    return "engine" in value && value.engine === "xai";
  }
  if (typeof value === "object" && value !== null) {
    return "engine" in value && value.engine === "xai";
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function publicError(message: string, apiKey: string): Error {
  const cleaned = redact(message, apiKey).trim();
  if (cleaned.length === 0) return new Error("xAI speech-to-text request failed.");
  return new Error(cleaned);
}

function redact(message: string, apiKey: string): string {
  if (apiKey.length < MIN_SECRET_LENGTH || !message.includes(apiKey)) return message;
  return message.split(apiKey).join("[redacted]");
}
