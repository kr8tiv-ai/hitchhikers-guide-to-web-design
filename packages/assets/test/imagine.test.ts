import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  IMAGINE_IMAGE_ENDPOINT,
  IMAGINE_VIDEO_ENDPOINT,
  runJobs,
  type ImagineDeps,
} from "../src/imagine.ts";
import {
  CapExceeded,
  PRICE_CARD_DATE,
  assertFits,
  estimateMustFit,
  quote,
  quoteJob,
  stillImageUsd,
  videoPerSecondUsd,
  type StillJob,
  type VideoJob,
} from "../src/prices.ts";

const KEY = "xai-test-key-053-do-not-leak-into-errors";
const PROMPT = "unique-prompt-orchid-9931-do-not-log";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function still(overrides: Partial<StillJob> = {}): StillJob {
  return {
    kind: "still",
    model: "grok-imagine-image",
    resolution: "default",
    prompt: PROMPT,
    count: 1,
    ...overrides,
  };
}

function video(overrides: Partial<VideoJob> = {}): VideoJob {
  return {
    kind: "video",
    model: "grok-imagine-video-1.5",
    resolution: "1080p",
    seconds: 10,
    prompt: PROMPT,
    ...overrides,
  };
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function throwingFetch(): typeof fetch {
  return async () => {
    throw new Error("fetch must not run");
  };
}

function diyDeps(overrides: Partial<ImagineDeps> = {}): ImagineDeps {
  return {
    mode: "diy",
    remainingUsd: 0,
    fetch: throwingFetch(),
    ...overrides,
  };
}

test("PRICE_CARD_DATE is the 2026-09-29 card", () => {
  assert.equal(PRICE_CARD_DATE, "2026-09-29");
});

test("1080p and 480p video prices differ and match the card", () => {
  const hd = quoteJob(video({ resolution: "1080p", seconds: 10 }));
  const sd = quoteJob(video({ resolution: "480p", seconds: 10 }));
  assert.equal(videoPerSecondUsd("grok-imagine-video-1.5", "1080p"), 0.25);
  assert.equal(videoPerSecondUsd("grok-imagine-video-1.5", "480p"), 0.08);
  assert.equal(videoPerSecondUsd("grok-imagine-video-1.5", "720p"), 0.14);
  assert.equal(hd.usd, 2.5);
  assert.equal(hd.usd.toFixed(2), "2.50");
  assert.equal(sd.usd, 0.8);
  assert.equal(sd.usd.toFixed(2), "0.80");
  assert.notEqual(hd.usd, sd.usd);
  assert.equal(hd.usd, 10 * 0.25);
  assert.notEqual(hd.usd, 10 * 0.08);
  assert.match(hd.line, /grok-imagine-video-1\.5/);
  assert.match(hd.line, /1080p/);
  assert.match(hd.line, /10 seconds/);
  assert.match(hd.line, /2026-09-29/);
  assert.equal(hd.line.includes(PROMPT), false);
  assert.match(sd.line, /480p/);
  assert.equal(sd.line.includes(PROMPT), false);
});

test("video-1.5-lite 10 seconds is 0.20 at 480p and 1.40 at 1080p", () => {
  const sd = quoteJob(
    video({ model: "grok-imagine-video-1.5-lite", resolution: "480p", seconds: 10 }),
  );
  const hd = quoteJob(
    video({ model: "grok-imagine-video-1.5-lite", resolution: "1080p", seconds: 10 }),
  );
  assert.equal(videoPerSecondUsd("grok-imagine-video-1.5-lite", "480p"), 0.02);
  assert.equal(videoPerSecondUsd("grok-imagine-video-1.5-lite", "720p"), 0.03);
  assert.equal(videoPerSecondUsd("grok-imagine-video-1.5-lite", "1080p"), 0.14);
  assert.equal(sd.usd, 0.2);
  assert.equal(sd.usd.toFixed(2), "0.20");
  assert.equal(hd.usd, 1.4);
  assert.equal(hd.usd.toFixed(2), "1.40");
  assert.match(hd.line, /grok-imagine-video-1\.5-lite/);
  assert.match(hd.line, /1080p/);
  assert.equal(hd.line.includes(PROMPT), false);
});

test("grok-imagine-video prices 480p and 720p and rejects 1080p", () => {
  const sd = quoteJob(video({ model: "grok-imagine-video", resolution: "480p", seconds: 10 }));
  const mid = quoteJob(video({ model: "grok-imagine-video", resolution: "720p", seconds: 10 }));
  assert.equal(videoPerSecondUsd("grok-imagine-video", "480p"), 0.05);
  assert.equal(videoPerSecondUsd("grok-imagine-video", "720p"), 0.07);
  assert.equal(sd.usd, 0.5);
  assert.equal(mid.usd, 0.7);
  assert.throws(
    () => videoPerSecondUsd("grok-imagine-video", "1080p"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /grok-imagine-video at 1080p/);
      assert.match(error.message, /2026-09-29/);
      assert.doesNotMatch(error.message, /1\.5/);
      return true;
    },
  );
  assert.throws(() => quoteJob(video({ model: "grok-imagine-video", resolution: "1080p" })), /1080p/);
});

test("still count multiplies and image-2.0 resolutions stay apart", () => {
  assert.equal(stillImageUsd("grok-imagine-image"), 0.02);
  assert.equal(stillImageUsd("grok-imagine-image", "1k-low"), 0.02);
  assert.equal(stillImageUsd("grok-imagine-image", "2k-medium"), 0.02);
  const ten = quoteJob(still({ count: 10 }));
  assert.equal(ten.usd, 0.2);
  assert.equal(ten.usd.toFixed(2), "0.20");
  assert.match(ten.line, /grok-imagine-image/);
  assert.match(ten.line, /default/);
  assert.match(ten.line, /count 10/);
  assert.equal(ten.line.includes(PROMPT), false);

  const low = quoteJob(
    still({ model: "grok-imagine-image-2.0", resolution: "1k-low", count: 1 }),
  );
  const medium = quoteJob(
    still({ model: "grok-imagine-image-2.0", resolution: "2k-medium", count: 1 }),
  );
  assert.equal(stillImageUsd("grok-imagine-image-2.0", "1k-low"), 0.04);
  assert.equal(stillImageUsd("grok-imagine-image-2.0", "2k-medium"), 0.08);
  assert.equal(low.usd, 0.04);
  assert.equal(medium.usd, 0.08);
  assert.match(low.line, /1k-low/);
  assert.match(medium.line, /2k-medium/);
  assert.throws(
    () => stillImageUsd("grok-imagine-image-2.0", "default"),
    /No listed price for grok-imagine-image-2\.0 at default/,
  );

  const quality = quoteJob(
    still({ model: "grok-imagine-image-quality", resolution: "default", count: 1 }),
  );
  assert.equal(stillImageUsd("grok-imagine-image-quality"), 0.05);
  assert.equal(quality.usd, 0.05);
  assert.match(quality.line, /floor/);
  assert.match(quality.line, /grok-imagine-image-quality/);
  assert.equal(quoteJob(still({ model: "grok-imagine-image-quality", count: 4 })).usd, 0.2);
});

test("quote lines match quoteJob and omit the prompt", () => {
  const job = video();
  const single = quoteJob(job);
  const batch = quote(job);
  assert.equal(batch.usd, single.usd);
  assert.deepEqual(batch.lines, [single.line]);
  assert.equal(batch.lines[0]?.includes(PROMPT), false);
});

test("a $15 cap rejects 12 ten-second 1080p clips", () => {
  const jobs = Array.from({ length: 12 }, () => video({ seconds: 10, resolution: "1080p" }));
  const batch = quote(jobs);
  assert.equal(batch.usd, 30);
  assert.equal(batch.lines.length, 12);
  for (const line of batch.lines) {
    assert.match(line, /grok-imagine-video-1\.5/);
    assert.match(line, /1080p/);
    assert.equal(line.includes(PROMPT), false);
  }
  assert.throws(
    () => assertFits(batch, 15),
    (error: unknown) => {
      assert.ok(error instanceof CapExceeded);
      assert.equal(error.usd, 30);
      assert.equal(error.remainingUsd, 15);
      assert.match(error.message, /30/);
      assert.match(error.message, /1080p/);
      assert.equal(error.message.includes(PROMPT), false);
      return true;
    },
  );
  assert.throws(
    () => estimateMustFit(batch, 15),
    (error: unknown) => {
      assert.ok(error instanceof CapExceeded);
      assert.match(error.message, /30/);
      assert.match(error.message, /1080p/);
      return true;
    },
  );
  assert.doesNotThrow(() => assertFits(30, 30));
  assert.throws(() => assertFits(30, 15), /30/);
  assert.doesNotThrow(() => assertFits(batch.usd, batch.usd));
  assert.throws(() => assertFits(batch.usd, batch.usd - 1e-6), /30/);
});

test("seconds 0 and count 0 throw", () => {
  assert.throws(() => quoteJob(video({ seconds: 0 })), /seconds/);
  assert.throws(() => quoteJob(video({ seconds: -2 })), /seconds/);
  assert.throws(() => quoteJob(still({ count: 0 })), /count/);
  assert.throws(() => quoteJob(still({ count: -1 })), /count/);
  assert.throws(() => quoteJob(video({ seconds: 1.5 })), /seconds/);
});

test("DIY returns prompts and performs zero fetches", async () => {
  let calls = 0;
  const jobs = [
    still({ prompt: "prompt-alpha-towel", count: 2 }),
    video({ prompt: "prompt-beta-tea", resolution: "480p", seconds: 10 }),
  ];
  const logs: string[] = [];
  const result = await runJobs(jobs, {
    mode: "diy",
    remainingUsd: 0,
    apiKey: KEY,
    fetch: async () => {
      calls += 1;
      throw new Error("DIY must not fetch");
    },
    log: (line) => logs.push(line),
  });
  assert.equal(calls, 0);
  assert.equal(result.mode, "diy");
  assert.equal(result.usd, 0);
  assert.deepEqual(result.prompts, ["prompt-alpha-towel", "prompt-beta-tea"]);
  assert.equal(JSON.stringify(result).includes(KEY), false);
  assert.ok(logs.length >= 2);
  for (const line of logs) {
    assert.equal(line.includes("prompt-alpha-towel"), false);
    assert.equal(line.includes("prompt-beta-tea"), false);
    assert.equal(line.includes(KEY), false);
  }
  assert.match(logs.join("\n"), /grok-imagine-image/);
  assert.match(logs.join("\n"), /480p/);
});

test("API mode quotes first, sends Bearer, and ignores a price in the body", async () => {
  const seen: { url: string; authorization: string; body: string }[] = [];
  const job = video({ resolution: "1080p", seconds: 10, prompt: PROMPT });
  const result = await runJobs([job], {
    mode: "api",
    apiKey: KEY,
    remainingUsd: 3,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      seen.push({
        url: String(input),
        authorization: headers.get("authorization") ?? "",
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response(JSON.stringify({ usd: 0.01, price_per_second: 0.08, error: KEY }), {
        status: 200,
      });
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, IMAGINE_VIDEO_ENDPOINT);
  assert.equal(seen[0]?.url, "https://api.x.ai/v1/videos/generations");
  assert.equal(seen[0]?.authorization, `Bearer ${KEY}`);
  const payload = JSON.parse(seen[0]?.body ?? "{}") as {
    model?: string;
    prompt?: string;
    duration?: number;
    resolution?: string;
  };
  assert.equal(payload.model, "grok-imagine-video-1.5");
  assert.equal(payload.prompt, PROMPT);
  assert.equal(payload.duration, 10);
  assert.equal(payload.resolution, "1080p");
  assert.equal(result.usd, 2.5);
  assert.equal(result.prompts[0], PROMPT);
  assert.equal(result.lines[0]?.includes(PROMPT), false);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test("a still request uses the image endpoint and multiplies by count", async () => {
  let body = "";
  let url = "";
  await runJobs(
    [still({ model: "grok-imagine-image-2.0", resolution: "2k-medium", count: 2, prompt: PROMPT })],
    {
      mode: "api",
      apiKey: KEY,
      remainingUsd: 1,
      fetch: async (input, init) => {
        url = String(input);
        body = typeof init?.body === "string" ? init.body : "";
        return new Response("{}", { status: 200 });
      },
    },
  );
  assert.equal(url, IMAGINE_IMAGE_ENDPOINT);
  assert.equal(url, "https://api.x.ai/v1/images/generations");
  const payload = JSON.parse(body) as { model?: string; n?: number; resolution?: string; quality?: string };
  assert.equal(payload.model, "grok-imagine-image-2.0");
  assert.equal(payload.n, 2);
  assert.equal(payload.resolution, "2k");
  assert.equal(payload.quality, "medium");
});

test("a 401 body that echoes the key stays out of the error", async () => {
  let authorization = "";
  await assert.rejects(
    () =>
      runJobs([still({ count: 1 })], {
        mode: "api",
        apiKey: KEY,
        remainingUsd: 1,
        fetch: async (_input, init) => {
          const headers = new Headers(init?.headers);
          authorization = headers.get("authorization") ?? "";
          return new Response(JSON.stringify({ error: KEY, prompt: PROMPT }), { status: 401 });
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /401/);
      assert.equal(error.message.includes(KEY), false);
      assert.equal(String(error).includes(KEY), false);
      assert.equal(error.message.includes(PROMPT), false);
      assert.equal("cause" in error && (error as { cause?: unknown }).cause !== undefined, false);
      return true;
    },
  );
  assert.equal(authorization, `Bearer ${KEY}`);
});

test("a thrown fetch error that contains the key is replaced", async () => {
  await assert.rejects(
    () =>
      runJobs([still()], {
        mode: "api",
        apiKey: KEY,
        remainingUsd: 1,
        fetch: async () => {
          throw new Error(`network down ${KEY}`);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message.includes(KEY), false);
      assert.equal(error.message.includes(PROMPT), false);
      assert.equal("cause" in error && (error as { cause?: unknown }).cause !== undefined, false);
      return true;
    },
  );
});

test("a failed job retries once and not again", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runJobs([still()], {
        mode: "api",
        apiKey: KEY,
        remainingUsd: 1,
        fetch: async () => {
          calls += 1;
          return new Response("busy", { status: 500 });
        },
      }),
    /500/,
  );
  assert.equal(calls, 2);

  calls = 0;
  const result = await runJobs([still()], {
    mode: "api",
    apiKey: KEY,
    remainingUsd: 1,
    fetch: async () => {
      calls += 1;
      if (calls === 1) return new Response("busy", { status: 503 });
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.usd, 0.02);
});

test("remaining 0 in api mode throws before fetch", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runJobs([video()], {
        mode: "api",
        apiKey: KEY,
        remainingUsd: 0,
        fetch: async () => {
          calls += 1;
          throw new Error("fetch must not run");
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof CapExceeded);
      assert.match(error.message, /2\.50/);
      assert.match(error.message, /1080p/);
      assert.equal(error.message.includes(PROMPT), false);
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("runJobs refuses 12 ten-second 1080p clips before fetch", async () => {
  let calls = 0;
  const jobs = Array.from({ length: 12 }, () => video());
  await assert.rejects(
    () =>
      runJobs(jobs, {
        mode: "api",
        apiKey: KEY,
        remainingUsd: 15,
        fetch: async () => {
          calls += 1;
          throw new Error("fetch must not run");
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof CapExceeded);
      assert.match(error.message, /30/);
      assert.match(error.message, /1080p/);
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("an unknown model throws before fetch", async () => {
  let calls = 0;
  const unknown = video({ model: "grok-imagine-video-9" as VideoJob["model"] });
  await assert.rejects(
    () =>
      runJobs([still(), unknown], {
        mode: "api",
        apiKey: KEY,
        remainingUsd: 100,
        fetch: async () => {
          calls += 1;
          throw new Error("fetch must not run");
        },
      }),
    /Unknown Imagine model/,
  );
  assert.equal(calls, 0);
  assert.throws(() => quoteJob(unknown), /Unknown Imagine model "grok-imagine-video-9"/);
});

test("api mode without a key throws before fetch and does not bill SuperGrok", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runJobs([still()], {
        mode: "api",
        remainingUsd: 5,
        fetch: async () => {
          calls += 1;
          throw new Error("fetch must not run");
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /apiKey/);
      assert.match(error.message, /SuperGrok is not a billing source/);
      assert.equal(error.message.includes("!"), false);
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("prices are local and a fitting batch fetches once per job", async () => {
  const pricesSource = stripComments(
    readFileSync(path.join(root, "packages", "assets", "src", "prices.ts"), "utf8"),
  );
  const imagineSource = stripComments(
    readFileSync(path.join(root, "packages", "assets", "src", "imagine.ts"), "utf8"),
  );
  assert.equal(pricesSource.includes("fetch"), false);
  assert.equal(pricesSource.includes("http"), false);
  assert.equal(imagineSource.includes("developers/pricing"), false);
  assert.equal(imagineSource.includes("0.08"), false);
  assert.equal(imagineSource.includes("0.25"), false);

  const notice = readFileSync(path.join(root, "NOTICE"), "utf8");
  assert.match(notice, /2026-09-29/);
  assert.match(notice, /recomputed if the card changes/);

  let calls = 0;
  const jobs = [still({ count: 1 }), video({ resolution: "480p", seconds: 10 })];
  const result = await runJobs(jobs, {
    mode: "api",
    apiKey: `  ${KEY}  `,
    remainingUsd: quote(jobs).usd,
    fetch: async (input) => {
      calls += 1;
      const url = String(input);
      assert.equal(url.includes(KEY), false);
      assert.equal(
        url === IMAGINE_IMAGE_ENDPOINT || url === IMAGINE_VIDEO_ENDPOINT,
        true,
      );
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.usd, 0.82);
});

test("DIY helper still refuses a broken job without fetching", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      runJobs([video({ seconds: 0 })], {
        ...diyDeps(),
        fetch: async () => {
          calls += 1;
          throw new Error("fetch must not run");
        },
      }),
    /seconds/,
  );
  assert.equal(calls, 0);
});
