import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { judgePhoneLighthouse, postDeployChecks, sitemapInstructions } from "../src/post-deploy-live.ts";

const PAGE = `<!doctype html><html><head>
<title>Milliways</title>
<meta property="og:title" content="Milliways">
<meta property="og:description" content="The restaurant at the end of the universe">
<meta property="og:image" content="https://milliways.example/og.png">
<meta name="hh-inbox" content="owner@milliways.example">
<script defer data-domain="milliways.example" src="https://plausible.io/js/script.js"></script>
</head><body>
<h1>Milliways</h1>
<form action="/contact" method="post" data-inbox="owner@milliways.example"></form>
</body></html>`;

const LIVE = "https://milliways.example/";

interface Scripted {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

function site(pages: Record<string, Scripted>, log: string[]) {
  const fetchImpl: typeof fetch = (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    log.push(`${method} ${url}`);
    const found = pages[`${method} ${url}`] ?? pages[url];
    if (found === undefined) return Promise.resolve(new Response("missing", { status: 404 }));
    return Promise.resolve(new Response(found.body ?? "", { status: found.status, headers: found.headers }));
  };
  return fetchImpl;
}

function happyPages(menuStatus = 200): Record<string, Scripted> {
  const html = { status: 200, body: PAGE, headers: { "strict-transport-security": "max-age=31536000" } };
  return {
    [LIVE]: html,
    "https://milliways.example/menu": { status: menuStatus, body: menuStatus === 200 ? PAGE : "missing" },
    "http://milliways.example/": {
      status: 301,
      headers: { location: "https://milliways.example/" },
    },
    "POST https://milliways.example/contact": { status: 200, body: "ok" },
    "POST https://plausible.io/api/event": { status: 202, body: "{}" },
  };
}

function scores(performance: number) {
  return {
    runMobile: () => Promise.resolve({
      performance,
      accessibility: 0.96,
      bestPractices: 0.97,
      seo: 0.98,
    }),
  };
}

test("live checks pass on a phone run, routes, form, analytics, OG, HTTPS, and redirects", async () => {
  const log: string[] = [];
  const yesCalls: boolean[] = [];
  const report = await postDeployChecks(LIVE, ["/", "/menu"], {
    fetchImpl: site(happyPages(), log),
    lhci: scores(0.95),
    yes: () => {
      yesCalls.push(true);
      return Promise.resolve(true);
    },
  });
  assert.equal(report.lighthouse.status, "PASS");
  assert.equal(report.lighthouse.scores?.performance, 95);
  assert.equal(report.routes.every((route) => route.ok), true);
  assert.equal(report.homepage.ok, true);
  assert.equal(report.https.ok, true);
  assert.equal(report.https.hsts, true);
  assert.equal(report.redirects[0]?.ok, true);
  assert.equal(report.redirects[0]?.to, "https://milliways.example/");
  assert.equal(report.og.ok, true);
  assert.match(report.og.preview, /Milliways/);
  assert.match(report.og.preview, /og\.png/);
  assert.equal(report.form.declined, false);
  assert.equal(report.form.ok, true);
  assert.equal(report.analytics.ok, true);
  assert.match(report.analytics.confirm, /analytics dashboard/);
  assert.equal(report.sitemap.submitted, false);
  assert.match(report.sitemap.instructions, /Google Search Console/);
  assert.match(report.sitemap.instructions, /Bing Webmaster Tools/);
  assert.equal(log.some((line) => /google|bing/i.test(line)), false);
  assert.equal(log.filter((line) => line.startsWith("POST")).length, 2);
  assert.equal(yesCalls.length, 2);
});

test("a category under 90 is a blocker and a 404 stays in the report", async () => {
  const log: string[] = [];
  const report = await postDeployChecks(LIVE, ["/menu"], {
    fetchImpl: site(happyPages(404), log),
    lhci: scores(0.89),
    yes: () => Promise.resolve(false),
  });
  assert.equal(report.lighthouse.status, "BLOCKER");
  assert.match(report.lighthouse.reasons.join(" "), /Phone performance/);
  const menu = report.routes.find((route) => route.route === "/menu");
  assert.equal(menu?.status, 404);
  assert.equal(menu?.ok, false);
  assert.equal(report.sitemap.submitted, false);
  assert.equal(report.form.declined, true);
  assert.equal(report.analytics.declined, true);
  assert.equal(log.some((line) => line.startsWith("POST")), false);
});

test("form and analytics each wait for their own yes", async () => {
  const log: string[] = [];
  const answers = [false, true];
  const report = await postDeployChecks(LIVE, [], {
    fetchImpl: site(happyPages(), log),
    lhci: scores(0.95),
    yes: () => Promise.resolve(answers.shift() ?? false),
  });
  assert.equal(report.form.declined, true);
  assert.equal(report.analytics.declined, false);
  assert.equal(report.analytics.ok, true);
  assert.equal(log.some((line) => line.includes("/contact")), false);
  assert.equal(log.some((line) => line === "POST https://plausible.io/api/event"), true);
});

test("the phone floor matches prompt 122 for ratios and category reports", () => {
  const pass = judgePhoneLighthouse({
    categories: {
      performance: { score: 0.9 },
      accessibility: { score: 1 },
      "best-practices": { score: 90 },
      seo: { score: 0.91 },
    },
  });
  assert.equal(pass.status, "PASS");
  assert.equal(pass.scores?.performance, 90);
  const fail = judgePhoneLighthouse({
    performance: 89,
    accessibility: 90,
    bestPractices: 90,
    seo: 90,
  });
  assert.equal(fail.status, "BLOCKER");
  const missing = judgePhoneLighthouse(null);
  assert.equal(missing.status, "BLOCKER");
  assert.match(missing.reasons[0] ?? "", /real mobile run/);
  const split = judgePhoneLighthouse({
    categories: {
      performance: { score: 0.95 },
      accessibility: { score: 0.95 },
      "best-practices": { score: 0.95 },
      bestPractices: { score: 0.4 },
      seo: { score: 0.95 },
    },
  });
  assert.equal(split.status, "BLOCKER");
});

test("HTTPS, HSTS, and OG failures are reported without a form post", async () => {
  const bare = "<!doctype html><html><head><title>Milliways</title></head><body>Milliways</body></html>";
  const log: string[] = [];
  const pages: Record<string, Scripted> = {
    "http://milliways.example/lunch": { status: 200, body: bare },
  };
  const report = await postDeployChecks("http://milliways.example/lunch", [], {
    fetchImpl: site(pages, log),
    lhci: { runMobile: () => Promise.reject(new Error("runner unavailable")) },
    yes: () => Promise.reject(new Error("yes ran")),
  });
  assert.equal(report.lighthouse.status, "BLOCKER");
  assert.match(report.lighthouse.reasons[0] ?? "", /runner unavailable/);
  assert.equal(report.https.ok, false);
  assert.match(report.https.reason, /not https/);
  assert.equal(report.og.ok, false);
  assert.match(report.og.preview, /Untitled/);
  assert.equal(report.form.ok, false);
  assert.match(report.form.reason, /No contact form/);
  assert.equal(log.some((line) => line.startsWith("POST")), false);
});

test("HTTPS without HSTS fails the header check", async () => {
  const log: string[] = [];
  const report = await postDeployChecks(LIVE, [], {
    fetchImpl: site({
      [LIVE]: { status: 200, body: PAGE },
      "http://milliways.example/": { status: 200, body: "still http" },
    }, log),
    lhci: scores(90),
    yes: () => Promise.resolve(false),
  });
  assert.equal(report.https.hsts, false);
  assert.equal(report.https.ok, false);
  assert.match(report.https.reason, /strict-transport-security/);
  assert.equal(report.redirects[0]?.ok, false);
  assert.equal(report.lighthouse.status, "PASS");
  assert.equal(report.lighthouse.scores?.performance, 90);
});

test("a route failure does not rewrite the deploy record", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-deploy-record-"));
  const file = path.join(dir, "DEPLOYS.md");
  const original = "# Deploys\n\n- kept — https://milliways.example/\n";
  await writeFile(file, original, "utf8");
  try {
    const report = await postDeployChecks(LIVE, ["/missing"], {
      fetchImpl: site({
        [LIVE]: { status: 200, body: PAGE, headers: { "strict-transport-security": "max-age=60" } },
        "https://milliways.example/missing": { status: 404, body: "missing" },
        "http://milliways.example/": { status: 301, headers: { location: LIVE } },
      }, []),
      lhci: scores(0.95),
      yes: () => Promise.resolve(false),
    });
    assert.equal(report.routes[0]?.status, 404);
    assert.equal(await readFile(file, "utf8"), original);
    const instructions = sitemapInstructions(LIVE);
    assert.match(instructions, /sitemap\.xml/);
    assert.match(instructions, /does not submit a sitemap/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an Umami snippet is the analytics call when Plausible is absent", async () => {
  const html = PAGE.replace(
    /<script\b[^>]*><\/script>/,
    '<script defer src="https://cloud.umami.is/script.js" data-website-id="site-1"></script>',
  );
  const log: string[] = [];
  const pages = happyPages();
  pages[LIVE] = { status: 200, body: html, headers: { "strict-transport-security": "max-age=60" } };
  pages["POST https://cloud.umami.is/api/send"] = { status: 200, body: "{}" };
  const report = await postDeployChecks(LIVE, [], {
    fetchImpl: site(pages, log),
    lhci: scores(0.95),
    yes: () => Promise.resolve(true),
  });
  assert.equal(report.analytics.ok, true);
  assert.equal(log.includes("POST https://cloud.umami.is/api/send"), true);
  assert.equal(log.some((line) => line.includes("plausible.io")), false);
});
