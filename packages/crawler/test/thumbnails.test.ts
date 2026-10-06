import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { RobotsDenied } from "../src/crawl.ts";
import {
  FAIL_NOTE,
  ROBOTS_NOTE,
  THUMB_MAX_AGE_MS,
  THUMB_VIEWPORT,
  captureThumbnail,
  crawlThumbnail,
  defaultThumbnailCacheDir,
  thumbnailPaths,
  type CrawlLike,
} from "../src/thumbnails.ts";

function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "hh-thumb-"));
}

test("default cache dir is under the home directory", () => {
  assert.equal(
    defaultThumbnailCacheDir(),
    path.join(os.homedir(), ".hitchhiker", "cache", "gallery"),
  );
});

test("captureThumbnail caches a shot for 30 days and refreshes after that", async () => {
  const dir = await tempDir();
  const url = "https://example.com/gallery";
  const png = Buffer.from("png-bytes");
  let calls = 0;
  let now = 1_700_000_000_000;
  const crawl: CrawlLike = async () => {
    calls += 1;
    return { png };
  };
  try {
    const first = await captureThumbnail(url, { crawl, cacheDir: dir, now: () => now });
    const expected = thumbnailPaths(dir, url).image;
    assert.equal(first.placeholder, false);
    assert.equal(first.note, "");
    assert.equal(first.path, expected);
    assert.equal(path.basename(expected), `${createHash("sha1").update(url).digest("hex")}.webp`);
    assert.deepEqual(await readFile(first.path), png);

    const second = await captureThumbnail(url, { crawl, cacheDir: dir, now: () => now });
    assert.equal(second.placeholder, false);
    assert.equal(calls, 1);

    now += THUMB_MAX_AGE_MS;
    const still = await captureThumbnail(url, { crawl, cacheDir: dir, now: () => now });
    assert.equal(still.placeholder, false);
    assert.equal(calls, 1);

    now += 1;
    const again = await captureThumbnail(url, { crawl, cacheDir: dir, now: () => now });
    assert.equal(again.placeholder, false);
    assert.equal(calls, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a robots denial is a placeholder and is not captured again inside 30 days", async () => {
  const dir = await tempDir();
  const url = "https://blocked.example/work";
  let calls = 0;
  const now = 1_700_000_000_000;
  const crawl: CrawlLike = () => {
    calls += 1;
    throw new RobotsDenied(url);
  };
  try {
    const first = await captureThumbnail(url, { crawl, cacheDir: dir, now: () => now });
    assert.equal(first.placeholder, true);
    assert.equal(first.note, ROBOTS_NOTE);
    const bytes = await readFile(first.path);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");

    const second = await captureThumbnail(url, { crawl, cacheDir: dir, now: () => now });
    assert.equal(second.placeholder, true);
    assert.equal(second.note, ROBOTS_NOTE);
    assert.equal(calls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a failed capture and a bad url become placeholders without a bypass", async () => {
  const dir = await tempDir();
  let calls = 0;
  const crawl: CrawlLike = () => {
    calls += 1;
    throw new Error("camera jammed");
  };
  try {
    const failed = await captureThumbnail("https://example.com/down", {
      crawl,
      cacheDir: dir,
      now: () => 10,
    });
    assert.equal(failed.placeholder, true);
    assert.equal(failed.note, FAIL_NOTE);
    assert.equal(calls, 1);

    const bad = await captureThumbnail("file:///tmp/secret", {
      crawl,
      cacheDir: dir,
      now: () => 10,
    });
    assert.equal(bad.placeholder, true);
    const userinfo = await captureThumbnail("https://user:pass@example.com/a", {
      crawl,
      cacheDir: dir,
      now: () => 10,
    });
    assert.equal(userinfo.placeholder, true);
    assert.equal(calls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("crawlThumbnail respects robots.txt and asks for a 1280 by 800 shot", async () => {
  let opened = false;
  let documentFetched = false;
  await assert.rejects(
    crawlThumbnail("https://blocked.example/secret", {
      fetchImpl: async (input) => {
        const address = String(input);
        if (!address.endsWith("/robots.txt")) {
          documentFetched = true;
          throw new Error("document was fetched");
        }
        return new Response("User-agent: *\nDisallow: /\n", { status: 200 });
      },
      openPage: () => {
        opened = true;
        throw new Error("page opened");
      },
    }),
    (error: unknown) => error instanceof RobotsDenied,
  );
  assert.equal(opened, false);
  assert.equal(documentFetched, false);

  let viewport: { width: number; height: number } | null = null;
  let wentTo = "";
  const shot = Buffer.from("above-the-fold");
  const result = await crawlThumbnail("https://open.example/work", {
    fetchImpl: async (input) => {
      const address = String(input);
      assert.equal(address.endsWith("/robots.txt"), true);
      return new Response("", { status: 404 });
    },
    openPage: async (next) => {
      viewport = next;
      return {
        goto: async (url) => {
          wentTo = url;
        },
        screenshot: async () => shot,
        close: async () => undefined,
      };
    },
  });
  assert.deepEqual(viewport, THUMB_VIEWPORT);
  assert.equal(wentTo, "https://open.example/work");
  assert.deepEqual(result.png, shot);
});
