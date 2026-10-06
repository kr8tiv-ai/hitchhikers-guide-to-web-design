/**
 * Push-to-talk controller for one card draft.
 *
 * A later UI may call getUserMedia. This prompt's capture is injected.
 * stop() returns a draft. It does not submit. The person still presses Answer.
 *
 * createPtt's transcribe argument is the local engine. packages/voice
 * transcribe (whisper.cpp) satisfies it in the app wiring: the caller maps
 * `{ text, engine: "local" }` to `{ text }` and passes that function here.
 * The unit test injects a fake and does not call the voice package.
 * The app boundary allows a dependency on @hitchhiker/engine only, so this
 * file does not import the voice package and does not spawn a process.
 * There is no API key on this controller.
 */

export type PttState = "idle" | "recording" | "transcribing";

export interface PttDeps {
  capture: () => Promise<{ wavPath: string }>;
  transcribe: (wavPath: string) => Promise<{ text: string }>;
}

export interface PttResult {
  draft: string | null;
  warning: string | null;
}

const MISSING_BIN =
  "Local transcriber not installed. Set WHISPER_CPP_BIN and WHISPER_CPP_MODEL, or type instead.";

const FAILED = "Transcription failed.";

const SILENT = "Nothing was heard.";

export function createPtt(deps: PttDeps): {
  state(): PttState;
  start(): void;
  stop(): Promise<PttResult>;
} {
  let phase: PttState = "idle";

  return {
    state() {
      return phase;
    },
    start() {
      if (phase === "recording") {
        throw new Error("Push-to-talk is already recording.");
      }
      if (phase !== "idle") {
        throw new Error("Push-to-talk is transcribing.");
      }
      phase = "recording";
    },
    stop() {
      return finish();
    },
  };

  async function finish(): Promise<PttResult> {
    if (phase !== "recording") {
      throw new Error("Push-to-talk is not recording.");
    }
    // The phase change is the latch. It runs before the first await, so a
    // second stop() in the same turn sees transcribing and throws.
    phase = "transcribing";
    try {
      const captured = await deps.capture();
      const transcript = await deps.transcribe(captured.wavPath);
      const heard = transcript.text.trim();
      if (heard.length === 0) {
        return { draft: null, warning: SILENT };
      }
      return { draft: heard, warning: null };
    } catch (error) {
      if (isMissingBin(error)) {
        return { draft: null, warning: MISSING_BIN };
      }
      return { draft: null, warning: FAILED };
    } finally {
      phase = "idle";
    }
  }
}

function isMissingBin(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (!("code" in error)) return false;
  return error.code === "MISSING_BIN";
}
