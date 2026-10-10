/**
 * Browser speech recognition. The constructor is injected.
 * This module does not call a network API of its own.
 */

import { VOICE_FALLBACK } from "./select.ts";

export interface BrowserSpeechSession {
  start(): void;
}

export interface BrowserSpeechHost {
  SpeechRecognition?: new () => BrowserSpeechSession;
  webkitSpeechRecognition?: new () => BrowserSpeechSession;
}

export interface WebSpeechEngine {
  readonly id: "web-speech";
  readonly paid: false;
  available(host: BrowserSpeechHost): boolean;
}

export function browserSpeechConstructor(
  host: BrowserSpeechHost,
): (new () => BrowserSpeechSession) | null {
  if (host === null || typeof host !== "object") return null;
  if (typeof host.SpeechRecognition === "function") return host.SpeechRecognition;
  if (typeof host.webkitSpeechRecognition === "function") return host.webkitSpeechRecognition;
  return null;
}

export function createWebSpeechEngine(): WebSpeechEngine {
  return {
    id: "web-speech",
    paid: false,
    available(host) {
      return browserSpeechConstructor(host) !== null;
    },
  };
}

/** Uses the injected session only. There is no fetch in this function. */
export async function transcribeWebSpeech(session: {
  start(): Promise<string> | string;
}): Promise<string> {
  if (session === null || typeof session !== "object" || typeof session.start !== "function") {
    throw new Error(VOICE_FALLBACK);
  }
  const text = await session.start();
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error(VOICE_FALLBACK);
  }
  return text;
}
