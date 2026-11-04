/**
 * 245i reference capture. Fake page, no network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  REFERENCE_VIEWPORT,
  captureReferenceSite,
  innerPageUrls,
  type ReferenceShotPage,
  type Viewport,
} from "../src/index.ts";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function png(label: string): Uint8Array {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(label)]);
}

function page(html: string, gotos: string[]): ReferenceShotPage {
  return {
    goto: async (url) => {
      gotos.push(url);
    },
    content: async () => html,
    screenshot: async () => png("shot"),
  };
}

test("a home page with no inner links returns a fold shot and a full shot", async () => {
  const viewports: Viewport[] = [];
  const shots = await captureReferenceSite("https://example.com/", {
    openPage: async (viewport) => {
      viewports.push(viewport);
      return page("<html><body><h1>Home</h1></body></html>", []);
    },
    fetchImpl: async (input) => {
      assert.match(String(input), /\/robots\.txt$/);
      return new Response("", { status: 404 });
    },
  });
  assert.equal(shots.length, 2);
  assert.equal(shots[0]?.kind, "fold");
  assert.equal(shots[1]?.kind, "full");
  assert.deepEqual(viewports, [REFERENCE_VIEWPORT]);
  assert.equal(REFERENCE_VIEWPORT.width, 1440);
});

test("one inner link adds a fold shot and a full shot", async () => {
  const gotos: string[] = [];
  let html = '<html><body><a href="/visit">Visit</a></body></html>';
  const shots = await captureReferenceSite("https://example.com/", {
    openPage: async () => page(html, gotos),
    fetchImpl: async (input) => {
      assert.match(String(input), /\/robots\.txt$/);
      return new Response("User-agent: *\nDisallow:\n", { status: 200 });
    },
  });
  html = "<html><body><p>Visit</p></body></html>";
  assert.equal(shots.length, 4);
  assert.deepEqual(
    shots.map((shot) => shot.kind),
    ["fold", "full", "fold", "full"],
  );
  assert.equal(shots[2]?.pageUrl, "https://example.com/visit");
  assert.ok(gotos.includes("https://example.com/visit"));
});

test("a deeper home page still captures a link back to the site root", () => {
  const urls = innerPageUrls("https://www.airbnb.com/luxury", '<a href="/">Home</a><a href="/luxury">Stay</a>');
  assert.deepEqual(urls, ["https://www.airbnb.com/"]);
});

test("robots.txt disallow does not open a page", async () => {
  let opened = 0;
  await assert.rejects(
    () =>
      captureReferenceSite("https://example.com/", {
        openPage: async () => {
          opened += 1;
          return page("<html></html>", []);
        },
        fetchImpl: async () => new Response("User-agent: *\nDisallow: /\n", { status: 200 }),
      }),
    /disallows/,
  );
  assert.equal(opened, 0);
});

test("a hung page rejects on a short timeout", async () => {
  const started = Date.now();
  await assert.rejects(
    () =>
      captureReferenceSite("https://example.com/slow", {
        timeoutMs: 30,
        openPage: () => new Promise(() => undefined),
      }),
    /timed out/i,
  );
  assert.ok(Date.now() - started < 500);
});

test("the capture module does not statically import playwright", () => {
  const source = readFileSync(path.join(srcDir, "reference-shots.ts"), "utf8");
  assert.equal(source.includes('from "playwright"'), false);
  assert.equal(source.includes("from 'playwright'"), false);
});
