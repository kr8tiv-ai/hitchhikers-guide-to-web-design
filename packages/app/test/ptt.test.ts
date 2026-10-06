import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Question } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import { createPtt, type PttDeps } from "../src/ptt.ts";
import { createPtt as createPttExported } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const pttSourcePath = path.resolve(here, "../src/ptt.ts");

const MISSING =
  "Local transcriber not installed. Set WHISPER_CPP_BIN and WHISPER_CPP_MODEL, or type instead.";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  const box: {
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  } = {
    resolve: () => {},
    reject: () => {},
  };
  const promise = new Promise<T>((resolve, reject) => {
    box.resolve = resolve;
    box.reject = reject;
  });
  return {
    promise,
    resolve: (value) => box.resolve(value),
    reject: (reason) => box.reject(reason),
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function question(): Question {
  return {
    id: "DP-1.1",
    module: "ford-field-notes",
    depth: ["express", "standard", "deep"],
    ask: "Do you have a logo you love?",
    why: "The logo anchors color, type, and tone.",
    input: ["text", "voice"],
    skipDefault: "A wordmark, assumed.",
    suggest: "A wordmark.",
    writes: ["BRAND.md#logo"],
  };
}

function card(draft: string): CardState {
  return {
    question: question(),
    draft,
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
}

test("the app index exports createPtt", () => {
  assert.equal(createPttExported, createPtt);
});

test("capture runs, then transcribe, while state is transcribing", async () => {
  const order: string[] = [];
  const captureGate = deferred<{ wavPath: string }>();
  const transcribeGate = deferred<{ text: string }>();
  const wavPath = path.join("tmp", "not-for-the-dom", "clip.wav");
  const ptt = createPtt({
    capture() {
      order.push("capture");
      return captureGate.promise;
    },
    transcribe(given) {
      order.push("transcribe");
      assert.equal(given, wavPath);
      return transcribeGate.promise;
    },
  });

  assert.equal(ptt.state(), "idle");
  await assert.rejects(ptt.stop(), /not recording/);
  assert.equal(ptt.state(), "idle");

  ptt.start();
  assert.equal(ptt.state(), "recording");
  assert.throws(() => ptt.start(), /already recording/);
  assert.equal(ptt.state(), "recording");

  const pending = ptt.stop();
  assert.equal(ptt.state(), "transcribing");
  assert.deepEqual(order, ["capture"]);
  assert.throws(() => ptt.start(), /transcribing/);

  captureGate.resolve({ wavPath });
  await settle();
  assert.equal(ptt.state(), "transcribing");
  assert.deepEqual(order, ["capture", "transcribe"]);

  transcribeGate.resolve({ text: "  A brass wordmark.  " });
  const result = await pending;
  assert.deepEqual(result, { draft: "A brass wordmark.", warning: null });
  assert.equal(ptt.state(), "idle");
  assert.equal(JSON.stringify(result).includes("clip.wav"), false);

  ptt.start();
  assert.equal(ptt.state(), "recording");
});

test("a second stop during transcribe throws and the first result still lands", async () => {
  const order: string[] = [];
  const captureGate = deferred<{ wavPath: string }>();
  const transcribeGate = deferred<{ text: string }>();
  const ptt = createPtt({
    capture() {
      order.push("capture");
      return captureGate.promise;
    },
    transcribe() {
      order.push("transcribe");
      return transcribeGate.promise;
    },
  });

  ptt.start();
  const first = ptt.stop();
  await assert.rejects(ptt.stop(), /not recording/);
  assert.equal(ptt.state(), "transcribing");
  assert.deepEqual(order, ["capture"]);

  captureGate.resolve({ wavPath: path.join("recordings", "take.wav") });
  await settle();
  transcribeGate.resolve({ text: "Earthy, quiet, paper." });
  const result = await first;
  assert.deepEqual(result, { draft: "Earthy, quiet, paper.", warning: null });
  assert.equal(ptt.state(), "idle");
  await assert.rejects(ptt.stop(), /not recording/);
  assert.deepEqual(order, ["capture", "transcribe"]);
});

test("MISSING_BIN leaves the draft null and names the env vars", async () => {
  let draft = "typed on the keyboard";
  const ptt = createPtt({
    async capture() {
      return { wavPath: path.join("audio", "missing.wav") };
    },
    transcribe() {
      return Promise.reject({ code: "MISSING_BIN" });
    },
  });

  ptt.start();
  const result = await ptt.stop();
  if (result.draft !== null) draft = result.draft;

  assert.equal(result.draft, null);
  assert.equal(result.warning, MISSING);
  assert.equal(draft, "typed on the keyboard");
  assert.equal(result.warning?.includes("!"), false);
  assert.equal(ptt.state(), "idle");

  const html = renderCard(card(draft));
  assert.match(html, /<textarea\b[^>]*>typed on the keyboard<\/textarea>/);
  assert.match(html, />Hold to talk</);
  assert.match(html, /data-action="answer"/);
  ptt.start();
  assert.equal(ptt.state(), "recording");
});

test("other transcribe errors return Transcription failed", async () => {
  const cases: Array<PttDeps["transcribe"]> = [
    () => Promise.reject(new Error("whisper.cpp exited 1.")),
    () => Promise.reject({ code: "FAILED" }),
    () => Promise.reject("nope"),
  ];

  for (const transcribe of cases) {
    const ptt = createPtt({
      async capture() {
        return { wavPath: "clip.wav" };
      },
      transcribe,
    });
    ptt.start();
    const result = await ptt.stop();
    assert.deepEqual(result, { draft: null, warning: "Transcription failed." });
    assert.equal(ptt.state(), "idle");
  }
});

test("a capture failure returns Transcription failed and does not stick", async () => {
  const ptt = createPtt({
    capture() {
      return Promise.reject(new Error("capture stopped"));
    },
    transcribe() {
      return Promise.reject(new Error("transcribe should not run"));
    },
  });
  ptt.start();
  const result = await ptt.stop();
  assert.deepEqual(result, { draft: null, warning: "Transcription failed." });
  assert.equal(ptt.state(), "idle");
});

test("an empty transcript returns Nothing was heard", async () => {
  for (const text of ["", "   \n\t"]) {
    const ptt = createPtt({
      async capture() {
        return { wavPath: "clip.wav" };
      },
      async transcribe() {
        return { text };
      },
    });
    ptt.start();
    const result = await ptt.stop();
    assert.deepEqual(result, { draft: null, warning: "Nothing was heard." });
    assert.equal(ptt.state(), "idle");
  }
});

test("the wav path is not written into the card", async () => {
  const wavPath = path.join("secret-recordings", "session-clip.wav");
  const ptt = createPtt({
    async capture() {
      return { wavPath };
    },
    async transcribe(given) {
      assert.equal(given, wavPath);
      return { text: "A tea shop on the corner." };
    },
  });
  ptt.start();
  const result = await ptt.stop();
  assert.equal(result.draft, "A tea shop on the corner.");
  assert.equal(JSON.stringify(result).includes("session-clip.wav"), false);
  assert.equal(JSON.stringify(result).includes(".wav"), false);

  const html = renderCard(card(result.draft ?? ""));
  assert.equal(html.includes(wavPath), false);
  assert.equal(html.includes("session-clip.wav"), false);
  assert.equal(html.includes(".wav"), false);
  assert.match(html, /Hold to talk/);
  assert.match(html, /<textarea\b[^>]*>A tea shop on the corner\.<\/textarea>/);
});

test("the controller does not import the xAI adapter or child_process", () => {
  const source = readFileSync(pttSourcePath, "utf8");
  assert.match(source, /A later UI may call getUserMedia/);
  assert.match(source, /packages\/voice/);
  assert.match(source, /does not import the voice package/);
  assert.doesNotMatch(source, /getUserMedia\s*\(/);
  assert.doesNotMatch(source, /mediaDevices/);
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /api\.x\.ai/);
  assert.doesNotMatch(source, /xai-stt|createXaiTranscriber|XAI_API_KEY|apiKey/);
  assert.doesNotMatch(source, /from ["']@hitchhiker\/voice["']/);
  assert.doesNotMatch(source, /Hold to talk!|Transcription failed!|Nothing was heard!/);
});
