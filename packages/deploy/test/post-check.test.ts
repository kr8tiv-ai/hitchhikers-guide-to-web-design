import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { postCheck } from "../src/post-check.ts";

const PAGE = "<!doctype html><html><head><title>Milliways</title></head><body><h1>Milliways</h1></body></html>";

function page(overrides: Partial<{ status: number; body: string; redirects: number }> = {}) {
  return {
    status: 200,
    body: PAGE,
    redirects: 0,
    ...overrides,
  };
}

test("queued skips the fetch", async () => {
  let calls = 0;
  const result = await postCheck({
    state: "queued",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () => {
      calls += 1;
      throw new Error("fetch called");
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { skipped: true, ok: false, reason: "queued" });
});

test("failed skips the fetch", async () => {
  let calls = 0;
  const result = await postCheck({
    state: "failed",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () => {
      calls += 1;
      throw new Error("fetch called");
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { skipped: true, ok: false, reason: "failed" });
});

test("completed 200 with a title and the site name is ok", async () => {
  let seen = "";
  const result = await postCheck({
    state: "completed",
    url: "http://localhost:9/milliways",
    siteName: "Milliways",
    fetchImpl: (url) => {
      seen = url;
      return Promise.resolve(page());
    },
  });
  assert.equal(seen, "http://localhost:9/milliways");
  assert.deepEqual(result, { skipped: false, ok: true, reason: "ok" });
});

test("a blank 200 fails the name check", async () => {
  const result = await postCheck({
    state: "completed",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () => Promise.resolve(page({ body: "<title></title><body></body>" })),
  });
  assert.deepEqual(result, { skipped: false, ok: false, reason: "site name missing" });
});

test("200 without the site name is not ok", async () => {
  const result = await postCheck({
    state: "completed",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () => Promise.resolve(page({ body: "<title>Restaurant</title><p>Restaurant</p>" })),
  });
  assert.equal(result.skipped, false);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "site name missing");
});

test("a multiline title is collapsed and still counts", async () => {
  const result = await postCheck({
    state: "completed",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () =>
      Promise.resolve(page({ body: "<title>\n  Milliways\n</title><p>Milliways</p>" })),
  });
  assert.deepEqual(result, { skipped: false, ok: true, reason: "ok" });
});

test("a title that is only whitespace fails", async () => {
  const result = await postCheck({
    state: "completed",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () => Promise.resolve(page({ body: "<title>   </title><p>Milliways</p>" })),
  });
  assert.deepEqual(result, { skipped: false, ok: false, reason: "title missing" });
});

test("status 404 is not ok", async () => {
  const result = await postCheck({
    state: "completed",
    url: "https://milliways.example/missing",
    siteName: "Milliways",
    fetchImpl: () => Promise.resolve(page({ status: 404 })),
  });
  assert.deepEqual(result, { skipped: false, ok: false, reason: "status 404" });
});

test("three redirects still pass", async () => {
  const result = await postCheck({
    state: "completed",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () => Promise.resolve(page({ redirects: 3 })),
  });
  assert.deepEqual(result, { skipped: false, ok: true, reason: "ok" });
});

test("more than three redirects is not ok and does not throw", async () => {
  const result = await postCheck({
    state: "completed",
    url: "https://milliways.example/",
    siteName: "Milliways",
    fetchImpl: () => Promise.resolve(page({ redirects: 4, status: 200 })),
  });
  assert.deepEqual(result, { skipped: false, ok: false, reason: "too many redirects" });
});

test("file and other non-http urls throw before fetch", async () => {
  const urls = ["file:///C:/sites/index.html", "ftp://milliways.example/menu", "not a url"];
  for (const url of urls) {
    let calls = 0;
    await assert.rejects(
      () =>
        postCheck({
          state: "completed",
          url,
          siteName: "Milliways",
          fetchImpl: () => {
            calls += 1;
            return Promise.resolve(page());
          },
        }),
      /url must be http or https/,
    );
    assert.equal(calls, 0);
  }
});

test("an empty site name throws", async () => {
  await assert.rejects(
    () =>
      postCheck({
        state: "completed",
        url: "https://milliways.example/",
        siteName: "   ",
        fetchImpl: () => Promise.resolve(page()),
      }),
    /siteName is empty/,
  );
});

test("the module does not log the body", () => {
  const source = readFileSync(new URL("../src/post-check.ts", import.meta.url), "utf8");
  assert.equal(source.includes("console."), false);
});
