import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  KEYCHAIN_ACCOUNT,
  KEYCHAIN_SERVICE,
  MissingApiKeyError,
  readApiKey,
} from "../src/keychain.ts";
import {
  ImagineHttpError,
  POLL_CAP_MS,
  POLL_MAX_INTERVAL_MS,
  POLL_START_MS,
  VideoJobError,
  VideoPollTimeout,
  createImagineClient,
  generateImage,
  pollVideo,
  startVideo,
} from "../src/imagine-http.ts";
import { RealSubjectError, planBatch, readSpend, runBatch, type RunBatchDeps } from "../src/imagine-run.ts";
import { CapExceeded } from "../src/prices.ts";
import { proposeReplacement, readAssetTable, type AssetSlot } from "../src/slots.ts";

const KEY = "xai-test-key-062-do-not-leak";
const PROMPT = "unique-prompt-orchid-9931-do-not-log";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

interface Seen {
  url: string;
  method: string;
  body: string;
  authorization: string;
}

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-imagine-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function still(id: string): AssetSlot {
  return {
    id,
    kind: "still",
    model: "grok-imagine-image",
    prompt: PROMPT,
    aspect: "1:1",
    n: 1,
    subjectIsReal: false,
    light: "north window",
  };
}

function video(id: string): AssetSlot {
  return {
    id,
    kind: "video",
    model: "grok-imagine-video-1.5-lite",
    prompt: PROMPT,
    aspect: "16:9",
    n: 1,
    subjectIsReal: false,
    light: "north window",
    seconds: 1,
    resolution: "480p",
  };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pngResponse(): Response {
  return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
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

function httpDeps(fetchImpl: typeof fetch, sleeps: number[] = []): { fetchImpl: typeof fetch; key: string; sleep: (ms: number) => Promise<void> } {
  return {
    fetchImpl,
    key: KEY,
    sleep: async (ms: number) => {
      sleeps.push(ms);
    },
  };
}

function batchDeps(projectDir: string, fetchImpl: typeof fetch, extras: Partial<RunBatchDeps> = {}): RunBatchDeps {
  return {
    confirm: async () => true,
    cap: 1,
    spent: 0,
    client: createImagineClient(),
    projectDir,
    key: KEY,
    fetchImpl,
    sleep: async () => {},
    now: () => "2026-10-06T00:00:00.000Z",
    ...extras,
  };
}

function expectedPollSleeps(): number[] {
  const sleeps = [2_000, 4_000, 8_000, 16_000];
  while (sleeps.reduce((sum, item) => sum + item, 0) < POLL_CAP_MS) sleeps.push(POLL_MAX_INTERVAL_MS);
  return sleeps;
}

test("a missing key names the env var and the keychain", async () => {
  const dir = tempDir();
  const secret = "file-secret-should-not-be-read";
  writeFileSync(path.join(dir, "XAI_API_KEY"), secret);
  try {
    await assert.rejects(
      () => readApiKey({ env: {}, keychain: null }),
      (error: unknown) => {
        assert.ok(error instanceof MissingApiKeyError);
        assert.match(error.message, /XAI_API_KEY/);
        assert.match(error.message, /keychain/);
        assert.match(error.message, /not read from a project file/);
        assert.equal(error.message.includes("!"), false);
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  } finally {
    cleanup(dir);
  }
});

test("the env key wins, and the keychain is next", async () => {
  let service = "";
  let account = "";
  const fromEnv = await readApiKey({
    env: { XAI_API_KEY: "  from-env-key-value  " },
    keychain: {
      getPassword: () => Promise.reject(new Error("keychain should not run")),
    },
  });
  assert.equal(fromEnv, "from-env-key-value");

  const fromChain = await readApiKey({
    env: { XAI_API_KEY: "   " },
    keychain: {
      async getPassword(nextService, nextAccount) {
        service = nextService;
        account = nextAccount;
        return "chain-key-not-a-file";
      },
    },
  });
  assert.equal(fromChain, "chain-key-not-a-file");
  assert.equal(service, KEYCHAIN_SERVICE);
  assert.equal(account, KEYCHAIN_ACCOUNT);
  assert.equal(KEYCHAIN_SERVICE, "hitchhikers-guide");
  assert.equal(KEYCHAIN_ACCOUNT, "xai");
});

test("a newline in a key is refused without echoing it", async () => {
  const secret = "super-secret-key";
  await assert.rejects(
    () => readApiKey({ env: { XAI_API_KEY: `${secret}\n` }, keychain: null }),
    (error: unknown) => {
      assert.ok(error instanceof MissingApiKeyError);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
});

test("generateImage posts aspect_ratio and reads url and base64", async () => {
  const sleeps: number[] = [];
  const script = scripted([
    json(200, { data: [{ url: "https://cdn.example/a.png", b64_json: "aaaa" }] }),
  ]);
  const images = await generateImage(
    { model: "grok-imagine-image", prompt: PROMPT, aspect: "16:9", n: 1 },
    httpDeps(script.fetchImpl, sleeps),
  );
  assert.equal(script.calls.length, 1);
  const call = script.calls[0];
  assert.ok(call !== undefined);
  assert.equal(call.url, "https://api.x.ai/v1/images/generations");
  assert.equal(call.method, "POST");
  assert.equal(call.authorization, `Bearer ${KEY}`);
  assert.equal(call.url.includes(KEY), false);
  assert.equal(call.body.includes(KEY), false);
  const body = JSON.parse(call.body) as Record<string, unknown>;
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal(body.aspect, undefined);
  assert.equal(body.resolution, undefined);
  assert.deepEqual(images, [{ url: "https://cdn.example/a.png", b64: "aaaa" }]);
  assert.deepEqual(sleeps, []);
});

test("429 and 500 retry twice, and 400 does not", async () => {
  const once: number[] = [];
  const onceScript = scripted([json(429, { error: KEY }), json(200, { data: [{ url: "https://cdn.example/a.png" }] })]);
  await generateImage({ model: "grok-imagine-image", prompt: PROMPT, aspect: "1:1", n: 1 }, httpDeps(onceScript.fetchImpl, once));
  assert.deepEqual(once, [1000]);
  assert.equal(onceScript.calls.length, 2);

  const twice: number[] = [];
  const twiceScript = scripted([
    json(429, { error: KEY }),
    json(429, { error: PROMPT }),
    json(200, { data: [{ b64_json: "aaaa" }] }),
  ]);
  await generateImage({ model: "grok-imagine-image", prompt: PROMPT, aspect: "1:1", n: 1 }, httpDeps(twiceScript.fetchImpl, twice));
  assert.deepEqual(twice, [1000, 2000]);

  const failed: number[] = [];
  const failedScript = scripted([
    new Response(KEY, { status: 500 }),
    new Response(PROMPT, { status: 500 }),
    new Response(KEY, { status: 502 }),
  ]);
  await assert.rejects(
    () => generateImage({ model: "grok-imagine-image", prompt: PROMPT, aspect: "1:1", n: 1 }, httpDeps(failedScript.fetchImpl, failed)),
    (error: unknown) => {
      assert.ok(error instanceof ImagineHttpError);
      assert.equal(error.status, 502);
      assert.equal(error.message.includes(KEY), false);
      assert.equal(error.message.includes(PROMPT), false);
      assert.match(error.message, /status 502/);
      return true;
    },
  );
  assert.deepEqual(failed, [1000, 2000]);
  assert.equal(failedScript.calls.length, 3);

  const denied: number[] = [];
  const deniedScript = scripted([json(400, { error: KEY })]);
  await assert.rejects(
    () => generateImage({ model: "grok-imagine-image", prompt: PROMPT, aspect: "1:1", n: 1 }, httpDeps(deniedScript.fetchImpl, denied)),
    (error: unknown) => error instanceof ImagineHttpError && error.status === 400,
  );
  assert.deepEqual(denied, []);
  assert.equal(deniedScript.calls.length, 1);
});

test("startVideo maps duration and request_id", async () => {
  const script = scripted([json(200, { request_id: "job123" })]);
  const started = await startVideo(
    {
      model: "grok-imagine-video-1.5",
      prompt: PROMPT,
      image: "https://cdn.example/still.png",
      seconds: 4,
      resolution: "720p",
      aspect: "16:9",
    },
    httpDeps(script.fetchImpl),
  );
  assert.deepEqual(started, { id: "job123" });
  const call = script.calls[0];
  assert.ok(call !== undefined);
  assert.equal(call.url, "https://api.x.ai/v1/videos/generations");
  const body = JSON.parse(call.body) as Record<string, unknown>;
  assert.equal(body.duration, 4);
  assert.equal(body.seconds, undefined);
  assert.equal(body.resolution, "720p");
  assert.equal(body.aspect_ratio, "16:9");
  assert.equal(body.image, "https://cdn.example/still.png");
  assert.equal(call.authorization, `Bearer ${KEY}`);
  assert.equal(call.body.includes(KEY), false);
});

test("a video response without request_id is refused", async () => {
  const script = scripted([json(200, { id: "nope" })]);
  await assert.rejects(
    () =>
      startVideo(
        { model: "grok-imagine-video-1.5", prompt: PROMPT, seconds: 1, resolution: "480p" },
        httpDeps(script.fetchImpl),
      ),
    (error: unknown) => error instanceof ImagineHttpError,
  );
});

test("pollVideo backs off until the ten minute cap", async () => {
  assert.equal(POLL_START_MS, 2_000);
  assert.equal(POLL_MAX_INTERVAL_MS, 30_000);
  assert.equal(POLL_CAP_MS, 600_000);
  const sleeps: number[] = [];
  let polls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const seen = seenFrom(input, init);
    assert.equal(seen.url, "https://api.x.ai/v1/videos/job123");
    assert.equal(seen.authorization, `Bearer ${KEY}`);
    polls += 1;
    return json(200, { status: "pending" });
  };
  await assert.rejects(
    () => pollVideo("job123", httpDeps(fetchImpl, sleeps)),
    (error: unknown) => {
      assert.ok(error instanceof VideoPollTimeout);
      assert.equal(error.jobId, "job123");
      return true;
    },
  );
  const expected = expectedPollSleeps();
  assert.equal(expected[0], 2_000);
  assert.equal(expected[4], 30_000);
  assert.equal(expected.length, 23);
  assert.equal(expected.reduce((sum, item) => sum + item, 0), 600_000);
  assert.deepEqual(sleeps, expected);
  assert.equal(polls, 24);
});

test("pollVideo returns on the first or second done status", async () => {
  const immediate: number[] = [];
  const once = scripted([json(200, { status: "done", video: { url: "https://cdn.example/a.mp4" } })]);
  const first = await pollVideo("job123", httpDeps(once.fetchImpl, immediate));
  assert.equal(first.url, "https://cdn.example/a.mp4");
  assert.deepEqual(immediate, []);

  const later: number[] = [];
  const twice = scripted([
    json(200, { status: "pending" }),
    json(200, { status: "done", video: { url: "https://cdn.example/b.mp4" } }),
  ]);
  const second = await pollVideo("job123", httpDeps(twice.fetchImpl, later));
  assert.equal(second.url, "https://cdn.example/b.mp4");
  assert.deepEqual(later, [2_000]);
});

test("a failed or expired video keeps the job id", async () => {
  const failed = scripted([json(200, { status: "failed" })]);
  await assert.rejects(
    () => pollVideo("job123", httpDeps(failed.fetchImpl)),
    (error: unknown) => {
      assert.ok(error instanceof VideoJobError);
      assert.equal(error.jobId, "job123");
      assert.match(error.message, /failed/);
      return true;
    },
  );
  const expired = scripted([json(200, { status: "expired" })]);
  await assert.rejects(
    () => pollVideo("job9", httpDeps(expired.fetchImpl)),
    (error: unknown) => error instanceof VideoJobError && error.jobId === "job9",
  );
});

test("planBatch uses the price card and omits the prompt", () => {
  const quoted = planBatch([still("hero"), still("side")]);
  assert.equal(quoted.usd, 0.04);
  assert.equal(quoted.lines[0], "hero: grok-imagine-image at default, count 1, card 2026-09-29");
  assert.equal(quoted.lines.join("\n").includes(PROMPT), false);
});

test("a batch over the cap is refused before confirm and before fetch", async () => {
  const dir = tempDir();
  let confirmed = false;
  let fetched = false;
  const fetchImpl: typeof fetch = async () => {
    fetched = true;
    throw new Error("fetch must not run");
  };
  try {
    await assert.rejects(
      () =>
        runBatch([still("hero"), still("side")], {
          ...batchDeps(dir, fetchImpl),
          cap: 0.03,
          confirm: async () => {
            confirmed = true;
            return true;
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof CapExceeded);
        assert.equal(error.usd, 0.04);
        return true;
      },
    );
    assert.equal(confirmed, false);
    assert.equal(fetched, false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "ASSETS.md")), false);
  } finally {
    cleanup(dir);
  }
});

test("declining the confirm spends nothing and leaves ASSETS.md", async () => {
  const dir = tempDir();
  const assets = path.join(dir, ".hitchhiker", "ASSETS.md");
  await mkdir(path.dirname(assets), { recursive: true });
  await writeFile(assets, "KEEP\n");
  let fetched = false;
  let confirms = 0;
  const fetchImpl: typeof fetch = async () => {
    fetched = true;
    throw new Error("fetch must not run");
  };
  try {
    const result = await runBatch([still("hero"), still("side")], {
      ...batchDeps(dir, fetchImpl, { spent: 0.05 }),
      confirm: async () => {
        confirms += 1;
        return false;
      },
    });
    assert.equal(confirms, 1);
    assert.equal(fetched, false);
    assert.equal(result.spent, 0.05);
    assert.equal(await readFile(assets, "utf8"), "KEEP\n");
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
  } finally {
    cleanup(dir);
  }
});

test("stills run in order, record the total, and do not log the key", async () => {
  const dir = tempDir();
  const calls: Seen[] = [];
  let posted = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const seen = seenFrom(input, init);
    calls.push(seen);
    if (seen.method === "POST") {
      posted += 1;
      if (posted === 2) {
        const ledger = JSON.parse(readFileSync(path.join(dir, ".hitchhiker", "assets", "spend.json"), "utf8")) as {
          spentUsd: number;
        };
        assert.equal(ledger.spentUsd, 0.02);
      }
      const name = posted === 1 ? "a" : "b";
      return json(200, { data: [{ url: `https://cdn.example/${name}.png` }] });
    }
    assert.equal(seen.authorization, "");
    return pngResponse();
  };
  let confirms = 0;
  try {
    const result = await runBatch([still("hero"), still("side")], {
      ...batchDeps(dir, fetchImpl),
      confirm: async () => {
        confirms += 1;
        return true;
      },
    });
    assert.equal(confirms, 1);
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        "https://api.x.ai/v1/images/generations",
        "https://cdn.example/a.png",
        "https://api.x.ai/v1/images/generations",
        "https://cdn.example/b.png",
      ],
    );
    assert.equal(result.spent, 0.04);
    assert.equal(result.done[0]?.status, "done");
    assert.equal(result.done[1]?.status, "done");
    const hero = result.done[0]?.file;
    const side = result.done[1]?.file;
    assert.ok(hero !== undefined && existsSync(hero));
    assert.ok(side !== undefined && existsSync(side));
    assert.equal(path.basename(hero), "hero.png");
    assert.equal(path.basename(side), "side.png");
    const spendText = readFileSync(path.join(dir, ".hitchhiker", "assets", "spend.json"), "utf8");
    const assetsText = readFileSync(path.join(dir, ".hitchhiker", "ASSETS.md"), "utf8");
    assert.equal(spendText.includes(PROMPT), false);
    assert.equal(spendText.includes(KEY), false);
    assert.equal(assetsText.includes(PROMPT), false);
    assert.equal(assetsText.includes(KEY), false);
    assert.equal(assetsText.includes("https://"), false);
    const rows = readAssetTable(assetsText);
    assert.equal(rows[0]?.source, "imagine");
    assert.equal(rows[0]?.cost, "0.02");
    assert.equal(rows[0]?.approved, "no");
    assert.equal(rows[0]?.license, "user-account");
    const ledger = await readSpend(dir);
    assert.equal(ledger.spentUsd, 0.04);
    assert.equal(ledger.entries.length, 2);
  } finally {
    cleanup(dir);
  }
});

test("image 2.0 at 1k-low sends resolution and quality", async () => {
  const dir = tempDir();
  let body: Record<string, unknown> = {};
  const fetchImpl: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return json(200, { data: [{ b64_json: Buffer.from(PNG).toString("base64") }] });
  };
  const slot = still("hero");
  slot.model = "grok-imagine-image-2.0";
  slot.stillResolution = "1k-low";
  try {
    const result = await runBatch([slot], batchDeps(dir, fetchImpl));
    assert.equal(body.resolution, "1k");
    assert.equal(body.quality, "low");
    assert.equal(body.aspect_ratio, "1:1");
    assert.equal(result.spent, 0.04);
    const file = result.done[0]?.file;
    assert.ok(file !== undefined && path.basename(file) === "hero.png");
  } finally {
    cleanup(dir);
  }
});

test("HTTP 500 stops the batch and keeps the finished slot", async () => {
  const dir = tempDir();
  const calls: string[] = [];
  let posts = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const seen = seenFrom(input, init);
    calls.push(seen.url);
    if (seen.method === "GET") return pngResponse();
    posts += 1;
    if (posts === 1) return json(200, { data: [{ url: "https://cdn.example/a.png" }] });
    return new Response("nope", { status: 500 });
  };
  try {
    const result = await runBatch([still("hero"), still("side"), still("tail")], batchDeps(dir, fetchImpl));
    assert.equal(result.spent, 0.02);
    assert.equal(result.done[0]?.status, "done");
    assert.equal(result.done[1]?.status, "failed");
    assert.equal(result.done[2]?.status, undefined);
    assert.equal(posts, 4);
    assert.equal(calls.filter((url) => url.startsWith("https://cdn.example")).length, 1);
    assert.equal(existsSync(result.done[0]?.file ?? ""), true);
    assert.equal(result.done[1]?.file, undefined);
    const ledger = await readSpend(dir);
    assert.equal(ledger.entries.length, 1);
    assert.equal(ledger.entries[0]?.slot, "hero");
  } finally {
    cleanup(dir);
  }
});

test("a video poll timeout keeps the job id and the charge", async () => {
  const dir = tempDir();
  const sleeps: number[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const seen = seenFrom(input, init);
    if (seen.method === "POST") return json(200, { request_id: "job123" });
    return json(200, { status: "pending" });
  };
  const slot = video("loop");
  try {
    const result = await runBatch([slot], {
      ...batchDeps(dir, fetchImpl),
      sleep: async (ms: number) => {
        sleeps.push(ms);
      },
    });
    assert.equal(sleeps.length, 23);
    assert.equal(result.spent, 0.02);
    assert.equal(result.done[0]?.status, "failed");
    assert.equal(result.done[0]?.jobId, "job123");
    assert.equal(result.done[0]?.file, undefined);
    assert.match(result.done[0]?.error ?? "", /job123/);
    const assets = readFileSync(path.join(dir, ".hitchhiker", "ASSETS.md"), "utf8");
    const row = readAssetTable(assets).find((item) => item.slot === "loop");
    assert.equal(row?.job, "job123");
    assert.equal(row?.status, "failed");
    assert.equal(row?.cost, "0.02");
    assert.equal(assets.includes(PROMPT), false);
    assert.equal(assets.includes(KEY), false);
    const ledger = await readSpend(dir);
    assert.equal(ledger.spentUsd, 0.02);
    assert.equal(ledger.entries[0]?.jobId, "job123");
  } finally {
    cleanup(dir);
  }
});

test("a paid video resumes with a poll and does not charge again", async () => {
  const dir = tempDir();
  const spend = path.join(dir, ".hitchhiker", "assets", "spend.json");
  await mkdir(path.dirname(spend), { recursive: true });
  await writeFile(
    spend,
    `${JSON.stringify(
      {
        spentUsd: 0.02,
        entries: [{ slot: "loop", usd: 0.02, at: "2026-10-06T00:00:00.000Z", jobId: "job123" }],
      },
      null,
      2,
    )}\n`,
  );
  const calls: Seen[] = [];
  let polls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const seen = seenFrom(input, init);
    calls.push(seen);
    if (seen.method === "POST") throw new Error("resume must not start a new job");
    polls += 1;
    if (polls === 1) {
      return json(200, { status: "done", video: { url: "https://cdn.example/loop.mp4" } });
    }
    assert.equal(seen.authorization, "");
    return new Response(Uint8Array.from([0, 1, 2, 3]), {
      status: 200,
      headers: { "content-type": "video/mp4" },
    });
  };
  const slot = video("loop");
  slot.status = "failed";
  slot.jobId = "job123";
  let quotedUsd = -1;
  try {
    const result = await runBatch([slot], {
      ...batchDeps(dir, fetchImpl, { cap: 0, spent: 0.02 }),
      confirm: async (quote) => {
        quotedUsd = quote.usd;
        assert.match(quote.lines.join("\n"), /resume job job123/);
        return true;
      },
    });
    assert.equal(quotedUsd, 0);
    assert.equal(calls.some((call) => call.method === "POST"), false);
    assert.equal(result.spent, 0.02);
    assert.equal(result.done[0]?.status, "done");
    assert.equal(path.basename(result.done[0]?.file ?? ""), "loop.mp4");
    const ledger = await readSpend(dir);
    assert.equal(ledger.spentUsd, 0.02);
    assert.equal(ledger.entries.length, 1);
  } finally {
    cleanup(dir);
  }
});

test("a finished slot is left out of the quote and is not fetched", async () => {
  const dir = tempDir();
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push(seenFrom(input, init).url);
    if (seenFrom(input, init).method === "POST") return json(200, { data: [{ b64_json: Buffer.from(PNG).toString("base64") }] });
    throw new Error("no download");
  };
  const done = still("hero");
  done.status = "done";
  done.file = "already.png";
  let lines = "";
  try {
    const result = await runBatch([done, still("side")], {
      ...batchDeps(dir, fetchImpl),
      confirm: async (quote) => {
        lines = quote.lines.join("\n");
        assert.equal(quote.usd, 0.02);
        return true;
      },
    });
    assert.equal(lines.includes("hero"), false);
    assert.match(lines, /side:/);
    assert.equal(calls.length, 1);
    assert.equal(result.done[0]?.file, "already.png");
    assert.equal(result.done[1]?.status, "done");
    assert.equal(result.spent, 0.02);
  } finally {
    cleanup(dir);
  }
});

test("a real subject is not replaced without a recorded yes", async () => {
  const dir = tempDir();
  let confirmed = false;
  let fetched = false;
  const fetchImpl: typeof fetch = async () => {
    fetched = true;
    throw new Error("fetch must not run");
  };
  const slot = still("portrait");
  slot.subjectIsReal = true;
  slot.replaces = "old";
  try {
    await assert.rejects(
      () =>
        runBatch([slot], {
          ...batchDeps(dir, fetchImpl),
          confirm: async () => {
            confirmed = true;
            return true;
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof RealSubjectError);
        assert.match(error.message, /recorded yes/);
        return true;
      },
    );
    assert.equal(confirmed, false);
    assert.equal(fetched, false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "ASSETS.md")), false);

    slot.realPersonYes = true;
    let reached = false;
    const allowed = await runBatch([slot], {
      ...batchDeps(dir, fetchImpl),
      confirm: async () => {
        reached = true;
        return false;
      },
    });
    assert.equal(reached, true);
    assert.equal(fetched, false);
    assert.equal(allowed.spent, 0);
  } finally {
    cleanup(dir);
  }
});

test("weak real subjects are proposed only after a recorded yes", () => {
  const blocked = proposeReplacement({ id: "portrait", subjectIsReal: true, gradeScore: 4 });
  assert.equal(blocked.propose, false);
  assert.equal(blocked.needsYes, true);
  assert.match(blocked.reason, /recorded yes/);

  const allowed = proposeReplacement({ id: "portrait", subjectIsReal: true, gradeScore: 4, realPersonYes: true });
  assert.equal(allowed.propose, true);
  assert.equal(allowed.needsYes, false);

  const fresh = proposeReplacement({ id: "chair", subjectIsReal: false, gradeScore: 3 });
  assert.equal(fresh.propose, true);
  assert.equal(fresh.needsYes, false);

  const strong = proposeReplacement({ id: "chair", subjectIsReal: false, gradeScore: 8 });
  assert.equal(strong.propose, false);
  assert.equal(strong.needsYes, false);
  assert.match(strong.reason, /stays/);

  const tiny = proposeReplacement({
    id: "tiny",
    subjectIsReal: false,
    gradeFacts: { width: 100, height: 80, bytes: 100, sharpness: 0.1, subjectIsReal: true },
  });
  assert.equal(tiny.propose, false);
  assert.equal(tiny.needsYes, true);
  assert.match(tiny.reason, /recorded yes/);
});
