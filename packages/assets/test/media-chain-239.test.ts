import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { SpawnLike } from "@hitchhiker/engine";
import {
  ImagineHandsBack,
  browserImagineProvider,
  generateSectionStills,
  grokCliProvider,
  resolveDeskProvider,
  type ImaginePageDriver,
} from "../src/section-generate.ts";
import { removeTempDir } from "./remove-temp.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-media-239-"));
}

test("the CLI provider names image_gen and video_gen and strips API keys", async () => {
  const dir = tempDir();
  try {
    const spawn: SpawnLike = async (request) => {
      assert.equal(request.env.XAI_API_KEY, undefined);
      assert.equal(request.env.OPENAI_API_KEY, undefined);
      const prompt = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
      const text = readFileSync(prompt, "utf8");
      const dest = text.split("\n").find((line) => line.startsWith("Save the")) ?? "";
      const file = dest.replace(/^Save the (image|video) bytes to /, "");
      if (text.includes("features.video_gen")) {
        assert.match(text, /generate_audio: false/);
        writeFileSync(file, Buffer.from("video"));
      } else {
        assert.match(text, /features\.image_gen/);
        writeFileSync(file, PNG);
      }
      return { status: 0, stdout: "", stderr: "", timedOut: false, errorCode: null };
    };
    const provider = grokCliProvider(dir, spawn, { XAI_API_KEY: "hidden", OPENAI_API_KEY: "hidden", PATH: "C:\\Windows" });
    const images = await provider.generateImage({ model: "grok-imagine-image-2.0", prompt: "A quiet field.", aspect: "16:9", n: 1 });
    assert.equal(images.length, 1);
    const started = await provider.startVideo?.({
      model: "grok-imagine-video-1.5-lite",
      prompt: "A silent hero film.",
      seconds: 8,
      resolution: "720p",
      generateAudio: false,
    });
    assert.ok(started);
    assert.equal(existsSync(started.id), true);
    const polled = await provider.pollVideo?.(started.id);
    assert.ok(polled?.bytes && polled.bytes.byteLength > 0);
  } finally {
    removeTempDir(dir);
  }
});

test("toggle off never calls the browser driver, and a captcha does not reach the API", async () => {
  const dir = tempDir();
  try {
    mkdirSync(path.join(dir, ".hitchhiker", "assets"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "assets", "media.json"),
      `${JSON.stringify({ order: ["grok-cli", "browser", "api"], browser: false, api: true })}\n`,
    );
    let browserCalls = 0;
    let apiCalls = 0;
    const driver: ImaginePageDriver = {
      async submitStill() {
        browserCalls += 1;
        return { bytes: PNG };
      },
    };
    const off = resolveDeskProvider(dir, {
      spawn: async () => ({ status: 1, stdout: "", stderr: "no", timedOut: false, errorCode: null }),
      browserDriver: driver,
      key: "billed-sample",
      fetchImpl: async () => {
        throw new Error("network");
      },
      client: {
        async generateImage() {
          apiCalls += 1;
          return [];
        },
        async startVideo() {
          apiCalls += 1;
          return { id: "job" };
        },
        async pollVideo() {
          return { url: "https://example.test/video.mp4" };
        },
      },
    });
    await off.generateImage({ model: "grok-imagine-image-2.0", prompt: "A field.", aspect: "3:2", n: 1 }).catch(() => undefined);
    assert.equal(browserCalls, 0);
    assert.equal(apiCalls, 1);

    writeFileSync(
      path.join(dir, ".hitchhiker", "assets", "media.json"),
      `${JSON.stringify({ order: ["grok-cli", "browser", "api"], browser: true, api: true })}\n`,
    );
    apiCalls = 0;
    const hands: ImaginePageDriver = {
      async submitStill() {
        return { handsBack: "captcha" };
      },
    };
    const on = resolveDeskProvider(dir, {
      spawn: async () => ({ status: 1, stdout: "", stderr: "no", timedOut: false, errorCode: null }),
      browserDriver: hands,
      key: "billed-sample",
      fetchImpl: async () => {
        throw new Error("network");
      },
      client: {
        async generateImage() {
          apiCalls += 1;
          return [];
        },
        async startVideo() {
          apiCalls += 1;
          return { id: "job" };
        },
        async pollVideo() {
          return { url: "https://example.test/video.mp4" };
        },
      },
    });
    await assert.rejects(
      () => on.generateImage({ model: "grok-imagine-image-2.0", prompt: "A field.", aspect: "3:2", n: 1 }),
      (error: unknown) => error instanceof ImagineHandsBack,
    );
    assert.equal(apiCalls, 0);
  } finally {
    removeTempDir(dir);
  }
});

test("browser video bytes are on disk before the next job, and a missing plan drops the slot", async () => {
  const dir = tempDir();
  try {
    let calls = 0;
    const driver: ImaginePageDriver = {
      async submitStill() {
        return { bytes: PNG };
      },
      async submitVideo() {
        calls += 1;
        if (calls === 1) return { bytes: Uint8Array.from([1, 2, 3, 4]) };
        return { handsBack: "limit" };
      },
    };
    const provider = browserImagineProvider(dir, driver);
    const first = await provider.startVideo?.({
      model: "grok-imagine-video-1.5-lite",
      prompt: "Silent film.",
      seconds: 6,
      resolution: "480p",
      generateAudio: false,
    });
    assert.ok(first);
    assert.equal(existsSync(first.id), true);
    await assert.rejects(() => provider.startVideo?.({
      model: "grok-imagine-video-1.5-lite",
      prompt: "Second film.",
      seconds: 6,
      resolution: "480p",
      generateAudio: false,
    }), ImagineHandsBack);

    mkdirSync(path.join(dir, ".hitchhiker", "assets"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "assets", "slots.json"),
      `${JSON.stringify({
        slots: [
          {
            id: "hero-film",
            kind: "video",
            model: "grok-imagine-video-1.5-lite",
            prompt: "A silent concept film.",
            aspect: "16:9",
            n: 1,
            subjectIsReal: false,
            light: "soft",
            seconds: 8,
            resolution: "720p",
            generateAudio: false,
          },
        ],
      })}\n`,
    );
    const result = await generateSectionStills(dir, { async generateImage() { return []; } });
    assert.equal(result.count, 0);
    const slots = readFileSync(path.join(dir, ".hitchhiker", "assets", "slots.json"), "utf8");
    assert.equal(slots.includes("hero-film"), false);
    assert.equal(slots.includes("TODO"), false);
    const note = readFileSync(path.join(dir, ".hitchhiker", "assets", "fallback.md"), "utf8");
    assert.match(note, /Stills and motion only/);
  } finally {
    removeTempDir(dir);
  }
});
