import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { SpawnLike } from "@hitchhiker/engine";
import {
  FILE_DATA_URI_MAX_BYTES,
  IMAGE_EDITS_PATH,
  IMAGINE_ORIGIN,
  ImagineHttpError,
  editImage,
  fileToDataUri,
  pollVideo,
  startVideo,
  type EditRequest,
} from "../src/imagine-http.ts";
import { quoteEdit, stillImageUsd } from "../src/prices.ts";
import {
  ImagineHandsBack,
  browserHandsBackProvider,
  resolveDeskProvider,
  type ImaginePageDriver,
} from "../src/section-generate.ts";
import { removeTempDir } from "./remove-temp.ts";

const KEY = "xai-test-key-260a-do-not-leak";
const PROMPT = "unique-prompt-orchid-260a-do-not-log";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

interface Seen {
  url: string;
  method: string;
  body: string;
  authorization: string;
}

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-edit-260a-"));
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function seenFrom(input: RequestInfo | URL, init?: RequestInit): Seen {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? init.body : "";
  let authorization = "";
  const headers = init?.headers;
  if (headers instanceof Headers) authorization = headers.get("authorization") ?? "";
  else if (Array.isArray(headers)) {
    const found = headers.find(([name]) => name.toLowerCase() === "authorization");
    authorization = found?.[1] ?? "";
  } else if (headers !== undefined) {
    const record = headers as Record<string, string>;
    authorization = record.Authorization ?? record.authorization ?? "";
  }
  return { url, method, body, authorization };
}

function scripted(responses: Response[]): { fetchImpl: typeof fetch; calls: Seen[] } {
  const calls: Seen[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(seenFrom(input, init));
    const next = responses.shift();
    if (next === undefined) throw new Error("no scripted response");
    return next;
  };
  return { fetchImpl, calls };
}

function httpDeps(fetchImpl: typeof fetch, sleeps: number[] = []) {
  return {
    fetchImpl,
    key: KEY,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

function edit(overrides: Partial<EditRequest> = {}): EditRequest {
  return {
    model: "grok-imagine-image",
    prompt: PROMPT,
    sources: ["https://cdn.example/a.png"],
    n: 1,
    ...overrides,
  };
}

function writeMedia(dir: string, settings: unknown): void {
  const folder = path.join(dir, ".hitchhiker", "assets");
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, "media.json"), `${JSON.stringify(settings)}\n`);
}

async function rejectsHttp(run: () => Promise<unknown>, check?: (error: ImagineHttpError) => void): Promise<void> {
  await assert.rejects(async () => {
    await run();
  }, (error: unknown) => {
    assert.ok(error instanceof ImagineHttpError);
    if (check !== undefined) check(error);
    return true;
  });
}

test("one source posts image and three sources post images in order", async () => {
  const one = scripted([json(200, { data: [{ url: "https://cdn.example/out.png", b64_json: "aaaa" }] })]);
  const images = await editImage(
    edit({
      model: "grok-imagine-image-2.0",
      n: 2,
      aspect: "16:9",
      resolution: "2k",
      quality: "medium",
      sources: ["data:image/png;base64,aaaa"],
    }),
    httpDeps(one.fetchImpl),
  );
  assert.equal(one.calls.length, 1);
  const call = one.calls[0];
  assert.ok(call !== undefined);
  assert.equal(call.url, `${IMAGINE_ORIGIN}${IMAGE_EDITS_PATH}`);
  assert.equal(IMAGE_EDITS_PATH, "/v1/images/edits");
  assert.equal(call.method, "POST");
  assert.equal(call.authorization, `Bearer ${KEY}`);
  assert.equal(call.url.includes(KEY), false);
  assert.equal(call.body.includes(KEY), false);
  const body = JSON.parse(call.body) as Record<string, unknown>;
  assert.equal(body.n, 2);
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal(body.aspect, undefined);
  assert.equal(body.resolution, "2k");
  assert.equal(body.quality, "medium");
  assert.equal(body.images, undefined);
  assert.deepEqual(body.image, { type: "image_url", url: "data:image/png;base64,aaaa" });
  assert.deepEqual(images, [{ url: "https://cdn.example/out.png", b64: "aaaa" }]);

  const three = scripted([json(200, { data: [{ b64_json: "bbbb" }] })]);
  const sources = [
    "https://cdn.example/a.png",
    "http://cdn.example/b.png",
    "data:image/webp;base64,cccc",
  ];
  await editImage(edit({ sources }), httpDeps(three.fetchImpl));
  const posted = JSON.parse(three.calls[0]?.body ?? "{}") as Record<string, unknown>;
  assert.equal(posted.image, undefined);
  assert.equal(posted.aspect_ratio, undefined);
  assert.deepEqual(posted.images, sources.map((url) => ({ type: "image_url", url })));
});

test("six sources, a file url, and a plain path throw before fetch", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new Error("fetch must not run");
  };
  const deps = httpDeps(fetchImpl);
  await rejectsHttp(() => editImage(edit({ sources: [] }), deps));
  await rejectsHttp(() =>
    editImage(edit({ sources: Array.from({ length: 6 }, (_, index) => `https://cdn.example/${index}.png`) }), deps),
  );
  await rejectsHttp(() => editImage(edit({ sources: ["file:///tmp/brand.png"] }), deps));
  await rejectsHttp(() => editImage(edit({ sources: ["refs/brand.png"] }), deps));
  await rejectsHttp(() => editImage(edit({ sources: ["data:text/plain;base64,aaaa"] }), deps));
  assert.equal(calls, 0);
});

test("aspect_ratio passes through and an unsupported aspect throws before fetch", async () => {
  const script = scripted([json(200, { data: [{ url: "https://cdn.example/tall.png" }] })]);
  await editImage(edit({ aspect: "9:19.5" }), httpDeps(script.fetchImpl));
  const body = JSON.parse(script.calls[0]?.body ?? "{}") as Record<string, unknown>;
  assert.equal(body.aspect_ratio, "9:19.5");

  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new Error("fetch must not run");
  };
  await rejectsHttp(
    () => editImage(edit({ aspect: "square" }), httpDeps(fetchImpl)),
    (error) => {
      assert.match(error.message, /square/);
    },
  );
  assert.equal(calls, 0);
});

test("reference images post reference_images and the poll is unchanged", async () => {
  const script = scripted([
    json(200, { request_id: "job123" }),
    json(200, { status: "pending" }),
    json(200, { status: "done", video: { url: "https://cdn.example/clip.mp4" } }),
  ]);
  const sleeps: number[] = [];
  const deps = httpDeps(script.fetchImpl, sleeps);
  const started = await startVideo(
    {
      model: "grok-imagine-video-1.5",
      prompt: PROMPT,
      referenceImages: ["https://cdn.example/ref-a.png", "https://cdn.example/ref-b.png"],
      seconds: 6,
      resolution: "480p",
      aspect: "16:9",
      generateAudio: false,
    },
    deps,
  );
  assert.deepEqual(started, { id: "job123" });
  const call = script.calls[0];
  assert.ok(call !== undefined);
  assert.equal(call.url, "https://api.x.ai/v1/videos/generations");
  assert.equal(call.body.includes(KEY), false);
  const body = JSON.parse(call.body) as Record<string, unknown>;
  assert.deepEqual(body.reference_images, [
    { url: "https://cdn.example/ref-a.png" },
    { url: "https://cdn.example/ref-b.png" },
  ]);
  assert.equal(body.image, undefined);
  assert.equal(body.duration, 6);
  assert.equal(body.resolution, "480p");
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal(body.generate_audio, false);
  const polled = await pollVideo(started.id, deps);
  assert.equal(polled.url, "https://cdn.example/clip.mp4");
  assert.deepEqual(sleeps, [2_000]);
  assert.equal(script.calls[1]?.method, "GET");
  assert.equal(script.calls[1]?.url, "https://api.x.ai/v1/videos/job123");
  assert.equal(script.calls[2]?.method, "GET");
});

test("a first-frame image and reference images together throw before fetch", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new Error("fetch must not run");
  };
  await rejectsHttp(
    () =>
      startVideo(
        {
          model: "grok-imagine-video-1.5",
          prompt: PROMPT,
          image: "https://cdn.example/still.png",
          referenceImages: ["https://cdn.example/ref.png"],
          seconds: 4,
          resolution: "720p",
        },
        httpDeps(fetchImpl),
      ),
    (error) => {
      assert.match(error.message, /reference images/);
      assert.equal(error.message.includes(KEY), false);
    },
  );
  await rejectsHttp(() =>
    startVideo(
      {
        model: "grok-imagine-video-1.5",
        prompt: PROMPT,
        referenceImages: Array.from({ length: 6 }, (_, index) => `https://cdn.example/${index}.png`),
        seconds: 4,
        resolution: "720p",
      },
      httpDeps(fetchImpl),
    ),
  );
  await rejectsHttp(() =>
    startVideo(
      {
        model: "grok-imagine-video-1.5",
        prompt: PROMPT,
        referenceImages: ["file:///tmp/comp.png"],
        seconds: 4,
        resolution: "720p",
      },
      httpDeps(fetchImpl),
    ),
  );
  assert.equal(calls, 0);
});

test("a 429 is retried and a key in an error body is not in the message", async () => {
  const sleeps: number[] = [];
  const retried = scripted([
    new Response(JSON.stringify({ error: KEY }), { status: 429 }),
    json(200, { data: [{ url: "https://cdn.example/out.png" }] }),
  ]);
  const images = await editImage(edit(), httpDeps(retried.fetchImpl, sleeps));
  assert.deepEqual(sleeps, [1000]);
  assert.equal(retried.calls.length, 2);
  assert.deepEqual(images, [{ url: "https://cdn.example/out.png" }]);

  const denied = scripted([new Response(KEY, { status: 400 })]);
  await rejectsHttp(
    () => editImage(edit(), httpDeps(denied.fetchImpl)),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.message.includes(KEY), false);
      assert.equal(error.message.includes(PROMPT), false);
      assert.match(error.message, /status 400/);
    },
  );
  assert.equal(denied.calls.length, 1);
});

test("fileToDataUri encodes png jpeg and webp and refuses other files", async () => {
  const dir = tempDir();
  try {
    const png = path.join(dir, "brand.png");
    const jpg = path.join(dir, "photo.jpg");
    const jpeg = path.join(dir, "photo.jpeg");
    const webp = path.join(dir, "mark.webp");
    const gif = path.join(dir, "anim.gif");
    const lying = path.join(dir, "lying.png");
    const empty = path.join(dir, "empty.png");
    const huge = path.join(dir, "huge.png");
    await writeFile(png, PNG);
    await writeFile(jpg, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
    await writeFile(jpeg, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));
    const payload = Buffer.concat([Buffer.from("WEBP"), Buffer.from([0, 0, 0, 0])]);
    const header = Buffer.alloc(8);
    header.write("RIFF", 0);
    header.writeUInt32LE(payload.length, 4);
    await writeFile(webp, Buffer.concat([header, payload]));
    await writeFile(gif, Buffer.from("GIF89a"));
    await writeFile(lying, Buffer.from("GIF89a"));
    await writeFile(empty, Buffer.alloc(0));
    const handle = await open(huge, "w");
    await handle.truncate(FILE_DATA_URI_MAX_BYTES + 1);
    await handle.close();

    const pngUri = await fileToDataUri(png);
    assert.equal(pngUri, `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
    assert.match(await fileToDataUri(jpg), /^data:image\/jpeg;base64,/);
    assert.match(await fileToDataUri(jpeg), /^data:image\/jpeg;base64,/);
    assert.match(await fileToDataUri(webp), /^data:image\/webp;base64,/);
    await rejectsHttp(() => fileToDataUri(gif));
    await rejectsHttp(() => fileToDataUri(lying));
    await rejectsHttp(() => fileToDataUri(empty));
    await rejectsHttp(() => fileToDataUri(huge), (error) => {
      assert.match(error.message, /20 MB/);
    });
    await rejectsHttp(() => fileToDataUri(path.join(dir, "missing.png")));
  } finally {
    removeTempDir(dir);
  }
});

test("the api provider edits when it is enabled", async () => {
  const dir = tempDir();
  try {
    writeMedia(dir, { order: ["grok-cli", "browser", "api"], browser: false, api: true });
    let edits = 0;
    let generates = 0;
    let seen: EditRequest | undefined;
    const provider = resolveDeskProvider(dir, {
      key: KEY,
      fetchImpl: async () => {
        throw new Error("network");
      },
      client: {
        async generateImage() {
          generates += 1;
          return [];
        },
        async editImage(req) {
          edits += 1;
          seen = req;
          return [{ url: "https://cdn.example/edited.png" }];
        },
        async startVideo(req) {
          assert.deepEqual(req.referenceImages, ["https://cdn.example/ref.png"]);
          return { id: "job123" };
        },
        async pollVideo() {
          return { url: "https://cdn.example/clip.mp4" };
        },
      },
    });
    const edited = await provider.editImage?.(edit({ sources: ["https://cdn.example/brand.png", "https://cdn.example/comp.png"] }));
    assert.equal(edits, 1);
    assert.equal(generates, 0);
    assert.equal(edited?.note, undefined);
    assert.deepEqual(seen?.sources, ["https://cdn.example/brand.png", "https://cdn.example/comp.png"]);
    assert.equal(edited?.images[0]?.url, "https://cdn.example/edited.png");
    const started = await provider.startVideo?.({
      model: "grok-imagine-video-1.5-lite",
      prompt: PROMPT,
      seconds: 6,
      resolution: "480p",
      referenceImages: ["https://cdn.example/ref.png"],
    });
    assert.deepEqual(started, { id: "job123" });
  } finally {
    removeTempDir(dir);
  }
});

test("grok-cli edit puts absolute reference paths in the instruction and saves the file", async () => {
  const dir = tempDir();
  try {
    writeMedia(dir, { order: ["grok-cli"], browser: false, api: false });
    const secret = "hidden-key-260a-should-not-appear";
    let prompts = 0;
    const spawn: SpawnLike = (request) => {
      prompts += 1;
      assert.equal(request.env.XAI_API_KEY, undefined);
      const promptFile = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
      const text = readFileSync(promptFile, "utf8");
      assert.equal(text.includes(secret), false);
      assert.match(text, /Use these reference images as image inputs: /);
      assert.ok(text.includes(path.resolve(dir, "brand/ref.png")));
      assert.ok(text.includes(path.join(dir, "comp.png")));
      assert.ok(text.indexOf(path.resolve(dir, "brand/ref.png")) < text.indexOf(path.join(dir, "comp.png")));
      const destLine = text.split("\n").find((line) => line.startsWith("Save the image bytes to ")) ?? "";
      const file = destLine.replace(/^Save the image bytes to /, "");
      writeFileSync(file, PNG);
      return Promise.resolve({ status: 0, stdout: "", stderr: "", timedOut: false, errorCode: null });
    };
    const provider = resolveDeskProvider(dir, { spawn, env: { XAI_API_KEY: secret, PATH: "/usr/bin" } });
    const edited = await provider.editImage?.(
      edit({
        sources: ["brand/ref.png", path.join(dir, "comp.png")],
        aspect: "16:9",
      }),
    );
    assert.equal(prompts, 1);
    assert.equal(edited?.note, undefined);
    const image = edited?.images[0];
    assert.ok(image?.b64);
    assert.equal(Buffer.from(image.b64, "base64").equals(Buffer.from(PNG)), true);
  } finally {
    removeTempDir(dir);
  }
});

test("grok-cli video instructions name reference paths and refuse a first frame with them", async () => {
  const dir = tempDir();
  try {
    let prompts = 0;
    const spawn: SpawnLike = (request) => {
      prompts += 1;
      const promptFile = request.args[request.args.indexOf("--prompt-file") + 1] ?? "";
      const text = readFileSync(promptFile, "utf8");
      assert.match(text, /Use these reference images as video inputs: /);
      assert.ok(text.includes(path.resolve(dir, "reference/renders/home.png")));
      const destLine = text.split("\n").find((line) => line.startsWith("Save the video bytes to ")) ?? "";
      writeFileSync(destLine.replace(/^Save the video bytes to /, ""), Buffer.from("video"));
      return Promise.resolve({ status: 0, stdout: "", stderr: "", timedOut: false, errorCode: null });
    };
    const provider = resolveDeskProvider(dir, { spawn });
    const started = await provider.startVideo?.({
      model: "grok-imagine-video-1.5-lite",
      prompt: "A slow push in.",
      seconds: 6,
      resolution: "480p",
      referenceImages: ["reference/renders/home.png"],
      generateAudio: false,
    });
    assert.ok(started);
    assert.equal(prompts, 1);
    await assert.rejects(
      async () => {
        await provider.startVideo?.({
          model: "grok-imagine-video-1.5-lite",
          prompt: "A slow push in.",
          seconds: 6,
          resolution: "480p",
          image: "https://cdn.example/still.png",
          referenceImages: ["reference/renders/home.png"],
        });
      },
      (error: unknown) => error instanceof Error && /reference images/.test(error.message),
    );
    assert.equal(prompts, 1);
  } finally {
    removeTempDir(dir);
  }
});

test("a browser without a session hands back and does not reach the api", async () => {
  const dir = tempDir();
  try {
    writeMedia(dir, { order: ["browser", "api"], browser: true, api: true });
    let edits = 0;
    const provider = resolveDeskProvider(dir, {
      key: KEY,
      fetchImpl: async () => {
        throw new Error("network");
      },
      client: {
        async generateImage() {
          return [];
        },
        async editImage() {
          edits += 1;
          return [];
        },
        async startVideo() {
          return { id: "job" };
        },
        async pollVideo() {
          return { url: "https://cdn.example/clip.mp4" };
        },
      },
    });
    await assert.rejects(async () => {
      await provider.editImage?.(edit());
    }, (error: unknown) => error instanceof ImagineHandsBack);
    assert.equal(edits, 0);
    await assert.rejects(async () => {
      await browserHandsBackProvider().editImage?.(edit());
    }, (error: unknown) => error instanceof ImagineHandsBack);
  } finally {
    removeTempDir(dir);
  }
});

test("no edit-capable provider falls back to generate and records a text-only note", async () => {
  const dir = tempDir();
  try {
    writeMedia(dir, { order: ["browser"], browser: true, api: false });
    let prompt = "";
    const driver: ImaginePageDriver = {
      async submitStill(text) {
        prompt = text;
        return { bytes: PNG };
      },
    };
    const provider = resolveDeskProvider(dir, { browserDriver: driver });
    const edited = await provider.editImage?.(
      edit({
        prompt: "A quiet counter.",
        sources: ["/tmp/brand.png", "/tmp/comp.png"],
        aspect: "16:9",
      }),
    );
    assert.match(edited?.note ?? "", /text-only/);
    assert.match(prompt, /text-only/);
    assert.ok(prompt.includes("/tmp/brand.png"));
    assert.ok(prompt.includes("/tmp/comp.png"));
    assert.ok(prompt.includes("A quiet counter."));
    assert.equal(edited?.images.length, 1);
    assert.ok(edited?.images[0]?.b64);
  } finally {
    removeTempDir(dir);
  }
});

test("an edit quote is the output price plus one input price per source", () => {
  const unit = stillImageUsd("grok-imagine-image", "default");
  const single = quoteEdit({
    kind: "edit",
    model: "grok-imagine-image",
    resolution: "default",
    prompt: PROMPT,
    count: 1,
    sources: 1,
  });
  assert.equal(single.usd, 0.04);
  assert.equal(single.usd, unit * 2);
  assert.match(single.line, /grok-imagine-image/);
  assert.match(single.line, /count 1/);
  assert.match(single.line, /inputs 1/);
  assert.equal(single.line.includes(PROMPT), false);

  const many = quoteEdit({
    kind: "edit",
    model: "grok-imagine-image",
    resolution: "default",
    prompt: PROMPT,
    count: 2,
    sources: 3,
  });
  assert.equal(many.usd, 0.1);
  assert.match(many.line, /inputs 3/);

  const sharp = quoteEdit({
    kind: "edit",
    model: "grok-imagine-image-2.0",
    resolution: "2k-medium",
    prompt: PROMPT,
    count: 1,
    sources: 2,
  });
  assert.equal(sharp.usd, stillImageUsd("grok-imagine-image-2.0", "2k-medium") * 3);
  assert.equal(sharp.usd, 0.24);

  const floor = quoteEdit({
    kind: "edit",
    model: "grok-imagine-image-quality",
    resolution: "default",
    prompt: PROMPT,
    count: 1,
    sources: 4,
  });
  assert.equal(floor.usd, 0.25);
  assert.match(floor.line, /floor/);

  assert.throws(
    () =>
      quoteEdit({
        kind: "edit",
        model: "grok-imagine-image-edit" as "grok-imagine-image",
        resolution: "default",
        prompt: PROMPT,
        count: 1,
        sources: 1,
      }),
    /Unknown Imagine model/,
  );
});
