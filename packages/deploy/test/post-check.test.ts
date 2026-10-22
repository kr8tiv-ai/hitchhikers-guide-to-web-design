import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { postCheck } from "../src/post-check.ts";
import {
  appendPostCheckSection,
  readLastGoodDeploy,
  recordLiveCheck,
  renderPostCheckSection,
  summarizePostCheck,
  type PostDeployReport,
} from "../src/post-deploy-live.ts";

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

const GOOD_PAGE = `<!doctype html><html><head><title>Milliways</title>
<meta property="og:title" content="Milliways">
<meta property="og:description" content="Lunch at the end">
<meta property="og:image" content="https://milliways.example/og.png">
</head><body>Milliways</body></html>`;

function liveReport(routes: PostDeployReport["routes"] = [{ route: "/", status: 200, ok: true }]): PostDeployReport {
  return {
    url: "https://milliways.example/",
    lighthouse: {
      status: "PASS",
      scores: { performance: 95, accessibility: 96, bestPractices: 97, seo: 98 },
      reasons: [],
    },
    routes,
    homepage: { skipped: false, ok: true, reason: "ok" },
    form: { declined: true, ok: false, reason: "Form test declined. Nothing was submitted." },
    analytics: {
      declined: true,
      ok: false,
      confirm: "",
      reason: "Analytics test declined. No event was sent.",
    },
    og: {
      ok: true,
      title: "Milliways",
      description: "Lunch at the end",
      image: "https://milliways.example/og.png",
      preview: "card",
    },
    https: { ok: true, hsts: true, reason: "HTTPS and HSTS are present." },
    redirects: [{ from: "http://milliways.example/", to: "https://milliways.example/", status: 301, ok: true }],
    sitemap: { submitted: false, instructions: "Keep the sitemap for yourself." },
  };
}

function assertPlain(text: string): void {
  assert.equal(text.includes("!"), false);
  assert.equal(text.includes("\u2014"), false);
  assert.equal(/lighthouse|hsts|open graph|\bog\b/i.test(text), false);
}

test("a passing live check names all four phone scores", () => {
  const summary = summarizePostCheck(liveReport());
  assert.equal(summary.ok, true);
  assert.equal(summary.lines.filter((line) => line.includes("meets 90")).length, 4);
  const section = renderPostCheckSection(liveReport());
  assert.match(section, /## Post-check/);
  assert.match(section, /Phone speed is 95, which meets 90\./);
  assert.match(section, /Phone reading is 96, which meets 90\./);
  assert.match(section, /Phone care is 97, which meets 90\./);
  assert.match(section, /Phone search is 98, which meets 90\./);
  assert.match(section, /The live check passed\./);
  assertPlain(section);
});

test("a 404 route is listed and the check fails in plain language", () => {
  const report = liveReport([{ route: "/missing", status: 404, ok: false }]);
  const summary = summarizePostCheck(report);
  assert.equal(summary.ok, false);
  assert.equal(summary.lines.length > 0, true);
  const section = renderPostCheckSection(report);
  assert.match(section, /Page \/missing was not found \(404\)\./);
  assert.match(section, /The live check failed\./);
  assertPlain(section);
  const slow = liveReport();
  slow.lighthouse = {
    status: "BLOCKER",
    scores: { performance: 89, accessibility: 96, bestPractices: 97, seo: 98 },
    reasons: ["Phone performance is 89, below the floor of 90."],
  };
  const slowSummary = summarizePostCheck(slow);
  assert.equal(slowSummary.ok, false);
  assert.match(slowSummary.lines.join("\n"), /Phone speed is 89, below 90\./);
  assertPlain(slowSummary.lines.join("\n"));
});

test("appending a post-check keeps the deploy row and lists the 404", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-post-check-"));
  const file = path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md");
  const original = [
    "# Deploys",
    "",
    "- 2026-10-19T12:00:00.000Z — preview — static — completed — https://good.example/",
    "  Via: preview",
    "",
    "## Post-check",
    "",
    "The live check passed.",
    "",
    "- 2026-10-20T12:00:00.000Z — hostinger — static — completed — https://milliways.example/",
    "  Via: Hostinger",
    "",
  ].join("\n");
  try {
    await mkdir(path.dirname(file), { recursive: true });
    writeFileSync(file, original, "utf8");
    const report = liveReport([{ route: "/missing", status: 404, ok: false }]);
    await appendPostCheckSection(dir, report);
    const next = await readFile(file, "utf8");
    assert.equal(next.startsWith(original.trimEnd()), true);
    assert.match(next, /https:\/\/milliways\.example\//);
    assert.match(next, /## Post-check/);
    assert.match(next, /\/missing/);
    assert.match(next, /404/);
    assert.match(next, /The live check failed\./);
    assertPlain(next.slice(original.trimEnd().length));
    const good = readLastGoodDeploy(next);
    assert.equal(good?.target, "preview");
    assert.equal(good?.url, "https://good.example/");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a recorded live check uses the injected runners and lists a 404", async () => {
  const dir = await mkdtempSync(path.join(os.tmpdir(), "hh-post-check-live-"));
  const file = path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md");
  const original = "# Deploys\n\n- kept — https://milliways.example/\n";
  const seen: string[] = [];
  try {
    await mkdir(path.dirname(file), { recursive: true });
    writeFileSync(file, original, "utf8");
    const recorded = await recordLiveCheck(dir, "https://milliways.example/", ["/missing"], {
      fetchImpl: (input) => {
        const url = String(input);
        seen.push(url);
        if (url === "https://milliways.example/missing") {
          return Promise.resolve(new Response("missing", { status: 404 }));
        }
        if (url === "http://milliways.example/") {
          return Promise.resolve(new Response("", { status: 301, headers: { location: "https://milliways.example/" } }));
        }
        return Promise.resolve(
          new Response(GOOD_PAGE, { status: 200, headers: { "strict-transport-security": "max-age=60" } }),
        );
      },
      lhci: {
        runMobile: (url) => {
          seen.push(`phone ${url}`);
          return Promise.resolve({ performance: 95, accessibility: 96, bestPractices: 97, seo: 98 });
        },
      },
      yes: () => Promise.reject(new Error("side effect yes ran")),
    });
    assert.equal(recorded.ok, false);
    assert.match(recorded.lines.join("\n"), /\/missing/);
    assert.match(recorded.lines.join("\n"), /404/);
    assert.equal(recorded.closer, "The live check failed.");
    assertPlain(recorded.lines.join("\n"));
    const next = await readFile(file, "utf8");
    assert.equal(next.startsWith(original.trimEnd()), true);
    assert.match(next, /Page \/missing was not found \(404\)\./);
    assert.equal(seen.includes("phone https://milliways.example/"), true);
    assert.equal(seen.includes("https://milliways.example/missing"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the last good row skips a failed post-check", () => {
  const markdown = [
    "- 2026-10-20T12:00:00.000Z — preview — static — completed — https://good.example/",
    "",
    "## Post-check",
    "",
    "The live check passed.",
    "",
    "- 2026-10-21T12:00:00.000Z — hostinger — static — completed — https://new.example/",
    "",
    "## Post-check",
    "",
    "- Page /missing was not found (404).",
    "",
    "The live check failed.",
    "",
  ].join("\n");
  const good = readLastGoodDeploy(markdown);
  assert.deepEqual(good, { target: "preview", shape: "static", url: "https://good.example/" });
  assert.equal(readLastGoodDeploy("The live check failed.\n"), null);
});
