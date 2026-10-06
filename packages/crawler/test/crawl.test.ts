import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BadUrlError,
  DESKTOP_VIEWPORT,
  EXCERPT_LIMIT,
  MOBILE_VIEWPORT,
  NetworkError,
  ROBOTS_MAX_CHARS,
  RedirectError,
  RobotsDenied,
  USER_AGENT,
  clip,
  crawl,
  createBrowser,
  sniffStack,
  type CrawlDeps,
  type FakePage,
  type Viewport,
} from "../src/index.ts";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function header(init: RequestInit | undefined, name: string): string | null {
  if (!init?.headers) return null;
  return new Headers(init.headers).get(name);
}

function png(label: string): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from(label)]);
}

interface Harness {
  deps: CrawlDeps;
  calls: Call[];
  viewports: Viewport[];
  gotoUrls: string[];
}

function harness(options: {
  robots: Response | (() => Response);
  document?: (url: string) => Response;
  html?: string;
  title?: string;
  onRobotsText?: () => void;
}): Harness {
  const calls: Call[] = [];
  const viewports: Viewport[] = [];
  const gotoUrls: string[] = [];
  const html = options.html ?? "<html><title>Plain</title></html>";
  const title = options.title ?? "From the page";

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    calls.push({ url, init });
    if (url.endsWith("/robots.txt")) {
      const response = typeof options.robots === "function" ? options.robots() : options.robots;
      if (options.onRobotsText) {
        const read = response.text.bind(response);
        Object.defineProperty(response, "text", {
          configurable: true,
          value: async () => {
            options.onRobotsText?.();
            return read();
          },
        });
      }
      return response;
    }
    if (!options.document) {
      throw new Error(`document fetch was not expected: ${url}`);
    }
    return options.document(url);
  };

  const openPage = async (viewport: Viewport): Promise<FakePage> => {
    viewports.push({ width: viewport.width, height: viewport.height });
    return {
      title: async () => title,
      content: async () => html,
      screenshot: async () => png(String(viewport.width)),
      goto: async (next: string) => {
        gotoUrls.push(next);
      },
    };
  };

  return { deps: { fetchImpl, openPage }, calls, viewports, gotoUrls };
}

function allowRobots(): Response {
  return new Response("User-agent: *\nDisallow:\n", { status: 200 });
}

function documentOk(body = "<html></html>"): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
}

const NEXT_HTML = [
  "<!doctype html><html><head>",
  "<title>Ignored title</title>",
  '<meta name="description" content="Brass on warm paper.">',
  '<script src="/_next/static/chunks/a.js"></script>',
  "</head><body>",
  "<h1>First <em>heading</em></h1>",
  "<h1>Second</h1>",
  `<p>${"alpha ".repeat(2_000)}</p>`,
  "</body></html>",
].join("");

test("an allowed page captures both viewports and sniffs next", async () => {
  assert.deepEqual(DESKTOP_VIEWPORT, { width: 1440, height: 900 });
  assert.deepEqual(MOBILE_VIEWPORT, { width: 390, height: 844 });
  assert.equal(USER_AGENT, "HitchhikerGuideBot/0.1");

  const rig = harness({
    robots: allowRobots(),
    document: () => documentOk("<html><p>fetched</p></html>"),
    html: NEXT_HTML,
    title: "From the page",
  });

  const result = await crawl("http://example.com/guide", rig.deps);

  assert.deepEqual(rig.viewports, [DESKTOP_VIEWPORT, MOBILE_VIEWPORT]);
  assert.equal(result.stackHint, "next");
  assert.equal(result.title, "From the page");
  assert.equal(result.description, "Brass on warm paper.");
  assert.deepEqual(result.h1, ["First heading", "Second"]);
  assert.equal(result.finalUrl, "http://example.com/guide");
  assert.equal(result.excerpt.length, EXCERPT_LIMIT);
  assert.equal(result.excerpt.includes("alpha"), true);
  assert.equal(result.screenshots.desktop.equals(png("1440")), true);
  assert.equal(result.screenshots.mobile.equals(png("390")), true);
  assert.deepEqual(rig.gotoUrls, ["http://example.com/guide", "http://example.com/guide"]);

  assert.equal(rig.calls.length, 2);
  const robotsCall = rig.calls[0];
  const documentCall = rig.calls[1];
  assert.ok(robotsCall);
  assert.ok(documentCall);
  assert.equal(robotsCall.url, "http://example.com/robots.txt");
  assert.equal(documentCall.url, "http://example.com/guide");
  assert.equal(header(robotsCall.init, "user-agent"), USER_AGENT);
  assert.equal(header(documentCall.init, "user-agent"), USER_AGENT);
  assert.equal(header(documentCall.init, "cookie"), null);
  assert.equal(documentCall.init?.credentials, "omit");
});

test("a disallowed /secret path never fetches the document or opens a page", async () => {
  const rig = harness({
    robots: new Response("User-agent: *\nDisallow: /secret\n", {
      status: 200,
      headers: { "set-cookie": "session=nope" },
    }),
    document: () => documentOk(),
  });

  await assert.rejects(
    () => crawl("http://example.com/secret", rig.deps),
    (err: unknown) => {
      assert.ok(err instanceof RobotsDenied);
      assert.equal(err.code, "ROBOTS_DENIED");
      assert.equal(err.url, "http://example.com/secret");
      return true;
    },
  );

  assert.equal(rig.calls.length, 1);
  assert.equal(rig.calls[0]?.url, "http://example.com/robots.txt");
  assert.equal(rig.viewports.length, 0);
  assert.equal(rig.gotoUrls.length, 0);
});

test("the crawler user-agent is the one allowed() sees", async () => {
  const rig = harness({
    robots: new Response(
      ["User-agent: *", "Disallow:", "", "User-agent: HitchhikerGuideBot", "Disallow: /"].join("\n"),
      { status: 200 },
    ),
    document: () => documentOk(),
  });

  await assert.rejects(() => crawl("http://example.com/guide", rig.deps), (err: unknown) => {
    assert.ok(err instanceof RobotsDenied);
    return true;
  });
  assert.equal(rig.calls.length, 1);
  assert.equal(rig.viewports.length, 0);
});

test("a 404 robots.txt allows the page", async () => {
  const rig = harness({
    robots: new Response("User-agent: *\nDisallow: /\n", { status: 404 }),
    document: () => documentOk(),
    html: "<html>webflow.js</html>",
    title: "Allowed",
  });

  const result = await crawl("http://example.com/guide", rig.deps);
  assert.equal(result.stackHint, "webflow");
  assert.equal(result.title, "Allowed");
  assert.equal(rig.viewports.length, 2);
  assert.equal(rig.calls.length, 2);
});

test("a non-200 robots.txt other than 404 throws once and does not open a page", async () => {
  const rig = harness({
    robots: new Response("busy", { status: 503 }),
    document: () => documentOk(),
  });

  await assert.rejects(() => crawl("http://example.com/guide", rig.deps), (err: unknown) => {
    assert.ok(err instanceof NetworkError);
    assert.equal(err.code, "NETWORK");
    assert.equal(err.status, 503);
    return true;
  });
  assert.equal(rig.calls.length, 1);
  assert.equal(rig.viewports.length, 0);
});

test("a failed robots fetch is not retried", async () => {
  let attempts = 0;
  const fetchImpl: typeof fetch = async () => {
    attempts += 1;
    throw new Error("socket down");
  };
  let opened = 0;
  const openPage = async (): Promise<FakePage> => {
    opened += 1;
    throw new Error("browser should stay closed");
  };

  await assert.rejects(
    () => crawl("https://example.com/guide", { fetchImpl, openPage }),
    (err: unknown) => {
      assert.ok(err instanceof NetworkError);
      assert.equal(err.status, undefined);
      return true;
    },
  );
  assert.equal(attempts, 1);
  assert.equal(opened, 0);
});

test("a reported redirect count above 3 throws before navigation", async () => {
  const robots = new Response("User-agent: *\nDisallow:\n", { status: 200 });
  Object.defineProperty(robots, "redirectCount", { value: 5 });
  const rig = harness({ robots, document: () => documentOk() });

  await assert.rejects(() => crawl("http://example.com/guide", rig.deps), (err: unknown) => {
    assert.ok(err instanceof RedirectError);
    assert.equal(err.code, "TOO_MANY_REDIRECTS");
    assert.equal(err.count, 5);
    return true;
  });
  assert.equal(rig.calls.length, 1);
  assert.equal(rig.viewports.length, 0);
});

test("three reported redirects are inside the cap", async () => {
  const robots = new Response("User-agent: *\nDisallow:\n", { status: 200 });
  Object.defineProperty(robots, "redirectCount", { value: 3 });
  const rig = harness({
    robots,
    document: () => documentOk(),
    html: "<html>cdn.shopify.com</html>",
  });

  const result = await crawl("http://example.com/guide", rig.deps);
  assert.equal(result.stackHint, "shopify");
  assert.equal(rig.viewports.length, 2);
});

test("a document redirect chain longer than 3 throws and does not open a page", async () => {
  let hops = 0;
  const rig = harness({
    robots: allowRobots(),
    document: () => {
      hops += 1;
      if (hops <= 4) {
        return new Response(null, {
          status: 302,
          headers: { location: "http://example.com/loop" },
        });
      }
      return documentOk();
    },
  });

  await assert.rejects(() => crawl("http://example.com/start", rig.deps), (err: unknown) => {
    assert.ok(err instanceof RedirectError);
    assert.equal(err.count, 4);
    return true;
  });
  assert.equal(hops, 4);
  assert.equal(rig.viewports.length, 0);
});

test("one document redirect lands on the final URL", async () => {
  const rig = harness({
    robots: allowRobots(),
    document: (url) => {
      if (url === "http://example.com/start") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://example.com/landed" },
        });
      }
      assert.equal(url, "http://example.com/landed");
      return documentOk("<html><p>landed</p></html>");
    },
    html: "<html>/_next/static/landed.js</html>",
    title: "Landed",
  });

  const result = await crawl("http://example.com/start", rig.deps);
  assert.equal(result.finalUrl, "http://example.com/landed");
  assert.equal(result.title, "Landed");
  assert.deepEqual(rig.gotoUrls, ["http://example.com/landed", "http://example.com/landed"]);
});

test("a robots file larger than 500 KiB denies before navigation", async () => {
  let read = false;
  const rig = harness({
    robots: new Response(`${"User-agent: *\nDisallow:\n"}${"x".repeat(ROBOTS_MAX_CHARS)}`, {
      status: 200,
    }),
    document: () => documentOk(),
    onRobotsText: () => {
      read = true;
    },
  });

  await assert.rejects(() => crawl("http://example.com/guide", rig.deps), (err: unknown) => {
    assert.ok(err instanceof RobotsDenied);
    return true;
  });
  assert.equal(rig.viewports.length, 0);
  assert.equal(rig.calls.length, 1);
  assert.equal(rig.calls[0]?.url.endsWith("/robots.txt"), true);
  assert.equal(read, true);
});

test("a declared robots content-length above 500 KiB denies without reading the body", async () => {
  let read = false;
  const rig = harness({
    robots: new Response("User-agent: *\nDisallow:\n", {
      status: 200,
      headers: { "content-length": String(ROBOTS_MAX_CHARS + 1) },
    }),
    document: () => documentOk(),
    onRobotsText: () => {
      read = true;
    },
  });

  await assert.rejects(() => crawl("http://example.com/guide", rig.deps), (err: unknown) => {
    assert.ok(err instanceof RobotsDenied);
    return true;
  });
  assert.equal(read, false);
  assert.equal(rig.viewports.length, 0);
  assert.equal(rig.calls.some((call) => !call.url.endsWith("/robots.txt")), false);
});

test("non-http URLs are refused before any fetch", async () => {
  const urls = ["file:///C:/Windows/win.ini", "javascript:alert(1)", "ftp://example.com/file"];
  for (const url of urls) {
    let fetches = 0;
    let opened = 0;
    const fetchImpl: typeof fetch = async () => {
      fetches += 1;
      return allowRobots();
    };
    const openPage = async (): Promise<FakePage> => {
      opened += 1;
      throw new Error("browser should stay closed");
    };
    await assert.rejects(() => crawl(url, { fetchImpl, openPage }), (err: unknown) => {
      assert.ok(err instanceof BadUrlError);
      assert.equal(err.code, "BAD_URL");
      return true;
    });
    assert.equal(fetches, 0, url);
    assert.equal(opened, 0, url);
  }
});

test("a URL the constructor rejects is BAD_URL", async () => {
  let fetches = 0;
  const fetchImpl: typeof fetch = async () => {
    fetches += 1;
    return allowRobots();
  };
  await assert.rejects(
    () => crawl("http://", { fetchImpl, openPage: async () => Promise.reject(new Error("no")) }),
    (err: unknown) => {
      assert.ok(err instanceof BadUrlError);
      assert.equal(err.code, "BAD_URL");
      return true;
    },
  );
  assert.equal(fetches, 0);
});

test("userinfo in the URL is refused", async () => {
  let fetches = 0;
  const fetchImpl: typeof fetch = async () => {
    fetches += 1;
    return allowRobots();
  };
  await assert.rejects(
    () =>
      crawl("http://user:secret@example.com/guide", {
        fetchImpl,
        openPage: async () => Promise.reject(new Error("no")),
      }),
    (err: unknown) => err instanceof BadUrlError,
  );
  assert.equal(fetches, 0);
});

test("an internationalized host the constructor accepts is crawled", async () => {
  const rig = harness({
    robots: () => new Response("", { status: 404 }),
    document: () => documentOk(),
    html: "<html><p>plain page</p></html>",
    title: "Plain",
  });
  const result = await crawl("http://bücher.example/guide", rig.deps);
  assert.equal(result.title, "Plain");
  assert.equal(result.stackHint, "unknown");
  assert.equal(rig.calls[0]?.url, "http://xn--bcher-kva.example/robots.txt");
  assert.equal(rig.viewports.length, 2);
});

test("robots.txt is fetched from the URL origin, including the port", async () => {
  const rig = harness({
    robots: new Response("User-agent: *\nDisallow: /secret\n", { status: 200 }),
  });
  await assert.rejects(
    () => crawl("http://example.com:8080/secret/page", rig.deps),
    (err: unknown) => err instanceof RobotsDenied,
  );
  assert.equal(rig.calls.length, 1);
  assert.equal(rig.calls[0]?.url, "http://example.com:8080/robots.txt");
  assert.equal(rig.viewports.length, 0);
});

test("sniffStack is pure and matches shopify, webflow, next, then unknown", () => {
  assert.equal(sniffStack("<script src='https://cdn.shopify.com/s/files/a.js'></script>"), "shopify");
  assert.equal(sniffStack("<html>CDN.SHOPIFY.COM and webflow and /_next/static</html>"), "shopify");
  assert.equal(sniffStack("<script src='https://cdn.prod.website-files.com/webflow.js'></script>"), "webflow");
  assert.equal(sniffStack("<html class='Webflow'>/_next/static</html>"), "webflow");
  assert.equal(sniffStack("<script src='/_next/static/chunks/main.js'></script>"), "next");
  assert.equal(sniffStack("<html><p>A static page</p></html>"), "unknown");
  assert.equal(sniffStack(""), "unknown");
  const sample = "<html>/_next/static</html>";
  assert.equal(sniffStack(sample), sniffStack(sample));
});

test("clip caps text at 4000 characters", () => {
  assert.equal(clip("short"), "short");
  assert.equal(clip("a".repeat(EXCERPT_LIMIT)).length, EXCERPT_LIMIT);
  assert.equal(clip("a".repeat(EXCERPT_LIMIT + 25)).length, EXCERPT_LIMIT);
  assert.equal(clip("a".repeat(EXCERPT_LIMIT + 25)), "a".repeat(EXCERPT_LIMIT));
});

test("the package does not target galleries or search engines", () => {
  const banned = ["godly.website", "awwwards.com", "google.com/search", "bing.com/search"];
  for (const file of ["robots.ts", "crawl.ts", "index.ts"]) {
    const text = readFileSync(path.join(srcDir, file), "utf8").toLowerCase();
    for (const host of banned) {
      assert.equal(text.includes(host), false, `${file} mentions ${host}`);
    }
  }
});

test("createBrowser is exported and does not load playwright until it is called", () => {
  assert.equal(typeof createBrowser, "function");
  const source = readFileSync(path.join(srcDir, "crawl.ts"), "utf8");
  assert.match(source, /const specifier: string = "playwright"/);
  assert.match(source, /import\(specifier\)/);
  assert.doesNotMatch(source, /from\s+["']playwright["']/);
  const crawlStart = source.indexOf("export async function crawl");
  const crawlEnd = source.indexOf("export async function createBrowser");
  const body = source.slice(crawlStart, crawlEnd);
  const allowedAt = body.indexOf("allowed(");
  const openAt = body.indexOf("openPage");
  assert.ok(allowedAt >= 0);
  assert.ok(openAt > allowedAt);
});
