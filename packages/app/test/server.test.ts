import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { InterviewError } from "@hitchhiker/engine";
import { parseSession } from "../src/client/desk.ts";
import { browserLaunch, openBrowser, windowsBrowserLaunch } from "../src/server/open-browser.ts";
import { createSseHub, HEARTBEAT_MS } from "../src/server/sse.ts";
import { startServer, checkHost, type ServerHandle, type TurnHandler } from "../src/server/server.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(here, "../../cli/src/main.ts");

function tempProject(): string {
  return mkdtempSync(path.join(tmpdir(), "hh-desk-"));
}

async function withDesk(
  opts: { port?: number; open?: boolean; turnHandler?: TurnHandler; platform?: NodeJS.Platform },
  run: (handle: ServerHandle, dir: string) => Promise<void>,
): Promise<void> {
  const dir = tempProject();
  let handle: ServerHandle | undefined;
  try {
    handle = await startServer({
      projectDir: dir,
      ...(opts.port === undefined ? {} : { port: opts.port }),
      ...(opts.open === undefined ? {} : { open: opts.open }),
      ...(opts.turnHandler === undefined ? {} : { turnHandler: opts.turnHandler }),
      ...(opts.platform === undefined ? {} : { platform: opts.platform }),
      spawn() {
        throw new Error("browser spawn was not expected");
      },
    });
    await run(handle, dir);
  } finally {
    if (handle !== undefined) await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function tokenFrom(html: string): string {
  const matched = /<meta name="hh-csrf" content="([0-9a-f]{64})"/.exec(html);
  assert.ok(matched?.[1]);
  return matched[1];
}

function raw(
  port: number,
  hostHeader: string,
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: { host: hostHeader, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            type: String(res.headers["content-type"] ?? ""),
          });
        });
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test("checkHost allows only this loopback port", () => {
  assert.equal(checkHost("127.0.0.1:4321", 4321), true);
  assert.equal(checkHost("localhost:4321", 4321), true);
  assert.equal(checkHost(" LocalHost:4321 ", 4321), true);
  assert.equal(checkHost("evil.example:4321", 4321), false);
  assert.equal(checkHost("127.0.0.1:4321", 4322), false);
  assert.equal(checkHost(undefined, 4321), false);
  assert.equal(checkHost("127.0.0.1", 4321), false);
  assert.equal(checkHost("[::1]:4321", 4321), false);
  assert.equal(checkHost("127.0.0.1:4321, evil.example:4321", 4321), false);
  assert.equal(checkHost("127.0.0.1:04321", 4321), false);
  assert.equal(checkHost("127.0.0.1:0", 0), false);
});

test("the server binds to 127.0.0.1 and refuses any other host", async () => {
  await assert.rejects(
    () => startServer({ projectDir: path.join(tmpdir(), "hh-missing-desk"), host: "0.0.0.0" as "127.0.0.1" }),
    /Refusing to bind 0\.0\.0\.0/,
  );
  await withDesk({}, async (handle) => {
    assert.equal(handle.boundHost, "127.0.0.1");
    assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    assert.equal(handle.opened, false);
    const page = await fetch(handle.url);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /name="hh-csrf" content="[0-9a-f]{64}"/);
    assert.match(html, /Is this site for you, or for a client\?/);
    assert.match(html, /src="\/client\/desk\.js"/);
    assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
    assert.equal(html.includes("\u2014"), false);
    const wrong = await raw(handle.port, `evil.example:${handle.port}`, "GET", "/");
    assert.equal(wrong.status, 421);
    assert.match(wrong.body, /localhost/);
    await handle.close();
    await handle.close();
  });
});

test("a fixed port that is taken fails with a clear message", async () => {
  const dir = tempProject();
  const first = await startServer({ projectDir: dir });
  try {
    await assert.rejects(
      () => startServer({ projectDir: dir, port: first.port }),
      /already in use/,
    );
  } finally {
    await first.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("POST without a token is rejected and the session advances through the engine", async () => {
  await withDesk({}, async (handle, dir) => {
    const page = await raw(handle.port, `127.0.0.1:${handle.port}`, "GET", "/");
    const token = tokenFrom(page.body);
    const session = await raw(handle.port, `127.0.0.1:${handle.port}`, "GET", "/api/session");
    const parsed = parseSession(JSON.parse(session.body));
    assert.ok(parsed);
    assert.equal(parsed?.question?.id, "DP-0.1");
    assert.equal(parsed?.question?.ask, "Is this site for you, or for a client?");

    const missing = await raw(handle.port, `127.0.0.1:${handle.port}`, "POST", "/api/answer", {
      "content-type": "application/json",
    }, JSON.stringify({ questionId: "DP-0.1", text: "For myself." }));
    assert.equal(missing.status, 403);

    const wrong = await raw(handle.port, `127.0.0.1:${handle.port}`, "POST", "/api/answer", {
      "content-type": "application/json",
      "x-hh-csrf": "0".repeat(64),
    }, JSON.stringify({ questionId: "DP-0.1", text: "For myself." }));
    assert.equal(wrong.status, 403);

    const badHost = await raw(handle.port, "localhost", "POST", "/api/answer", {
      "content-type": "application/json",
      "x-hh-csrf": token,
    }, JSON.stringify({ questionId: "DP-0.1", text: "For myself." }));
    assert.equal(badHost.status, 421);

    const empty = await raw(handle.port, `localhost:${handle.port}`, "POST", "/api/answer", {
      "content-type": "application/json",
      "x-hh-csrf": token,
    }, JSON.stringify({ questionId: "DP-0.1", text: "   " }));
    assert.equal(empty.status, 400);

    const answered = await raw(handle.port, `127.0.0.1:${handle.port}`, "POST", "/api/answer", {
      "content-type": "application/json",
      "x-hh-csrf": token,
    }, JSON.stringify({ questionId: "DP-0.1", text: "For myself." }));
    assert.equal(answered.status, 200);
    const body = JSON.parse(answered.body) as { session?: { question?: { id?: string } } };
    assert.equal(body.session?.question?.id, "DP-0.2");
    const state = readFileSync(path.join(dir, ".hitchhiker", "STATE.md"), "utf8");
    assert.match(state, /interview:DP-0\.2/);
    assert.match(state, /Answer DP-0\.2\./);
  });
});

test("suggest and skip call the turn handler, and a thrown error stays off the page", async () => {
  const seen: Array<{ kind: string; questionId: string; text?: string }> = [];
  const handler: TurnHandler = async (input) => {
    seen.push(input);
    if (input.kind === "skip") throw new Error("C:\\secret\\interview.json");
    return { next: { id: "next" }, events: [{ n: 1 }, { n: 2 }] };
  };
  await withDesk({ turnHandler: handler }, async (handle) => {
    const page = await fetch(handle.url);
    const token = tokenFrom(await page.text());
    const suggested = await fetch(new URL("/api/suggest", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({ questionId: "DP-0.1" }),
    });
    assert.equal(suggested.status, 200);
    assert.equal(seen[0]?.kind, "suggest");
    assert.equal(seen[0]?.text, undefined);

    const skipped = await fetch(new URL("/api/skip", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({ questionId: "DP-0.1" }),
    });
    assert.equal(skipped.status, 500);
    const text = await skipped.text();
    assert.match(text, /did not save/);
    assert.equal(text.includes("secret"), false);
  });
});

test("a busy interview is a 409 with the desk's own line", async () => {
  const handler: TurnHandler = async () => {
    throw new InterviewError("busy", "The interview session is single-flight.");
  };
  await withDesk({ turnHandler: handler }, async (handle) => {
    const page = await fetch(handle.url);
    const token = tokenFrom(await page.text());
    const response = await fetch(new URL("/api/answer", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({ questionId: "DP-0.1", text: "For myself." }),
    });
    assert.equal(response.status, 409);
    assert.match(await response.text(), /saving another answer/);
  });
});

test("two listeners both receive the handler events", async () => {
  const handler: TurnHandler = async () => ({ next: { id: "next" }, events: [{ n: 1 }, { n: 2 }] });
  await withDesk({ turnHandler: handler }, async (handle) => {
    const page = await fetch(handle.url);
    const token = tokenFrom(await page.text());
    const left = collect(handle, 2);
    const right = collect(handle, 2);
    await Promise.all([left.ready, right.ready]);
    const posted = await fetch(new URL("/api/answer", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: JSON.stringify({ questionId: "DP-0.1", text: "For myself." }),
    });
    assert.equal(posted.status, 200);
    const [a, b] = await Promise.all([left.done, right.done]);
    assert.equal(a.filter((line) => line.startsWith("event: update")).length, 2);
    assert.equal(b.filter((line) => line.startsWith("event: update")).length, 2);
    assert.match(a.join("\n"), /"n":1/);
    assert.match(a.join("\n"), /"n":2/);
    assert.equal(a.join("\n").includes("event: heartbeat"), false);
  });
});

test("route slots, static files, and the browser modules are served", async () => {
  await withDesk({}, async (handle) => {
    for (const pathname of ["/brand", "/approve", "/hh-dashboard"]) {
      const response = await fetch(new URL(pathname, handle.url));
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /hh-shell/);
      assert.match(html, /hh-wordmark/);
      assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);
      assert.equal(html.includes("\u2014"), false);
    }
    const dashboard = await fetch(new URL("/hh-dashboard", handle.url));
    assert.match(await dashboard.text(), /\/hh-dashboard/);
    const missing = await fetch(new URL("/no-such-plate", handle.url));
    assert.equal(missing.status, 404);
    assert.match(await missing.text(), /not on the desk/);

    const css = await fetch(new URL("/src/design/tokens.css", handle.url));
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type") ?? "", /text\/css/);
    const font = await fetch(
      new URL("/public/fonts/BricolageGrotesque-opsz96-wght800.woff2", handle.url),
    );
    assert.equal(font.status, 200);
    const escaped = await fetch(new URL("/src/design/../../package.json", handle.url));
    assert.equal(escaped.status, 404);

    const desk = await fetch(new URL("/client/desk.js", handle.url));
    const deskJs = await desk.text();
    assert.match(deskJs, /from "\/client\/card\.js"/);
    assert.equal(deskJs.includes("@hitchhiker"), false);
    const card = await fetch(new URL("/client/card.js", handle.url));
    const cardJs = await card.text();
    assert.match(cardJs, /hh-qcard/);
    assert.equal(cardJs.includes("@hitchhiker"), false);
    assertSyntax(deskJs, "hh-desk-check.js");
    assertSyntax(cardJs, "hh-card-check.js");
  });
});

test("the drive page reads queue.json and the pause route writes paused rows", async () => {
  await withDesk({}, async (handle, dir) => {
    const queue = {
      items: [
        { id: "001", kind: "build", status: "passed" },
        { id: "002", kind: "build", status: "running" },
        { id: "003", kind: "review", status: "queued" },
      ],
    };
    const file = writeQueue(dir, `${JSON.stringify(queue, null, 2)}\n`);
    const before = readFileSync(file);

    const page = await fetch(new URL("/hh-dashboard", handle.url));
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /data-id="001"/);
    assert.match(html, /data-status="passed"/);
    assert.match(html, /data-status="running"/);
    assert.match(html, /data-status="queued"/);
    assert.match(html, /Prompts 2 of 3\./);
    assert.match(html, /name="hh-csrf" content="[0-9a-f]{64}"/);
    assert.match(html, /src="\/client\/drive\.js"/);
    assert.equal(html.includes("The queue is empty"), false);
    assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false);

    const listed = await fetch(new URL("/api/drive", handle.url));
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), queue);

    const missing = await fetch(new URL("/api/drive/pause", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(missing.status, 403);
    assert.deepEqual(readFileSync(file), before);

    const wrong = await fetch(new URL("/api/drive/pause", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": "0".repeat(64) },
      body: "{}",
    });
    assert.equal(wrong.status, 403);
    assert.deepEqual(readFileSync(file), before);

    const token = tokenFrom(html);
    const paused = await fetch(new URL("/api/drive/pause", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: "{}",
    });
    assert.equal(paused.status, 200);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { items: Array<{ id: string; status: string }> };
    assert.deepEqual(
      saved.items.map((item) => item.status),
      ["passed", "paused", "queued"],
    );
    assert.deepEqual(await paused.json(), saved);

    const again = await fetch(new URL("/hh-dashboard", handle.url));
    const next = await again.text();
    assert.match(next, /data-id="002"[^>]*data-status="paused"/);
    assert.match(next, /Prompts 2 of 3\./);
    assert.equal(next.includes("The queue is empty"), false);

    const driveJs = await fetch(new URL("/client/drive.js", handle.url));
    const source = await driveJs.text();
    assert.equal(driveJs.status, 200);
    assert.match(source, /\/api\/drive\/pause/);
    assert.match(source, /x-hh-csrf/);
    assert.match(source, /from "\/client\/drive-markup\.js"/);
    assert.equal(source.includes("@hitchhiker"), false);
    assert.equal(source.includes("child_process"), false);
    assertSyntax(source, "hh-drive-check.js");
    const markup = await fetch(new URL("/client/drive-markup.js", handle.url));
    const markupJs = await markup.text();
    assert.match(markupJs, /from "\/client\/card\.js"/);
    assert.equal(markupJs.includes("@hitchhiker"), false);
    assertSyntax(markupJs, "hh-drive-markup-check.js");
  });
});

test("a missing queue file renders the empty state and pause creates nothing", async () => {
  await withDesk({}, async (handle, dir) => {
    const page = await fetch(new URL("/hh-dashboard", handle.url));
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /No drive queued\./);
    assert.match(html, /The drive has not been planned\./);
    assert.match(html, /No prompts on this queue\./);
    assert.equal(html.includes("The queue is empty"), false);

    const listed = await fetch(new URL("/api/drive", handle.url));
    assert.equal(listed.status, 200);
    assert.deepEqual(await listed.json(), { items: [] });

    const folder = path.join(dir, ".hitchhiker");
    const queuePath = path.join(folder, "queue.json");
    assert.equal(existsSync(queuePath), false);
    const namesBefore = readdirSync(folder).sort();
    const token = tokenFrom(html);
    const paused = await fetch(new URL("/api/drive/pause", handle.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-hh-csrf": token },
      body: "{}",
    });
    assert.equal(paused.status, 409);
    assert.match(await paused.text(), /No queue file is on disk/);
    assert.equal(existsSync(queuePath), false);
    assert.deepEqual(readdirSync(folder).sort(), namesBefore);
  });
});

test("a corrupt queue file is a styled 500 and stays on disk", async () => {
  await withDesk({}, async (handle, dir) => {
    const raw = "{not json";
    const file = writeQueue(dir, raw);
    const page = await fetch(new URL("/hh-dashboard", handle.url));
    const html = await page.text();
    assert.equal(page.status, 500);
    assert.match(html, /The queue file could not be read\./);
    assert.match(html, /queue\.json is not valid JSON\./);
    assert.match(html, /It was left on disk\./);
    assert.match(html, /hh-error/);
    assert.equal(html.includes("The queue is empty"), false);
    assert.equal(html.includes(raw), false);
    assert.equal(readFileSync(file, "utf8"), raw);

    const listed = await fetch(new URL("/api/drive", handle.url));
    assert.equal(listed.status, 500);
    assert.equal(readFileSync(file, "utf8"), raw);
    const body = await listed.text();
    assert.match(body, /not valid JSON/);
    assert.equal(body.includes(raw), false);
  });
});

test("drive route source does not import a process spawn", () => {
  const root = path.resolve(here, "..", "src");
  const files = [
    "dashboard.ts",
    "drive-markup.ts",
    "client/drive.ts",
    "server/drive.ts",
    "server/routes.ts",
  ];
  const source = files.map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /node:child_process/);
  assert.doesNotMatch(source, /child_process/);
  assert.doesNotMatch(source, /spawning grok/i);
  assert.doesNotMatch(source, /spawn\(\s*["']grok/);
});

test("sse heartbeat is 15 seconds and both sinks close", () => {
  assert.equal(HEARTBEAT_MS, 15_000);
  const left: string[] = [];
  const right: string[] = [];
  const hub = createSseHub(60_000);
  hub.add({
    write(chunk) {
      left.push(chunk);
      return true;
    },
    end() {
      left.push("end");
    },
  });
  hub.add({
    write(chunk) {
      right.push(chunk);
      return true;
    },
    end() {
      right.push("end");
    },
  });
  hub.publish("update", { n: 1 });
  hub.heartbeat();
  hub.close();
  assert.match(left[0] ?? "", /event: update/);
  assert.match(right[0] ?? "", /"n":1/);
  assert.equal(left.includes(": heartbeat\n\n"), true);
  assert.equal(left.at(-1), "end");
  assert.equal(right.at(-1), "end");
});

test("browser open uses the platform command and survives a missing opener", async () => {
  assert.deepEqual(browserLaunch("win32", "http://127.0.0.1:1/"), {
    command: "start",
    args: ["", "http://127.0.0.1:1/"],
  });
  assert.deepEqual(browserLaunch("darwin", "http://127.0.0.1:1/"), {
    command: "open",
    args: ["http://127.0.0.1:1/"],
  });
  assert.deepEqual(browserLaunch("linux", "http://127.0.0.1:1/"), {
    command: "xdg-open",
    args: ["http://127.0.0.1:1/"],
  });

  let command = "";
  let windowsHide: unknown;
  let detached: unknown;
  let verbatim: unknown;
  const opened = await openBrowser("http://127.0.0.1:9/", {
    platform: "win32",
    spawn(next, _args, opts) {
      command = next;
      windowsHide = opts.windowsHide;
      detached = opts.detached;
      verbatim = opts.windowsVerbatimArguments;
      return {
        once(event, listener) {
          if (event === "exit") listener(0);
        },
        unref() {},
      };
    },
  });
  assert.equal(opened, true);
  assert.equal(command, "start");
  assert.equal(windowsHide, true);
  assert.equal(detached, false);
  assert.equal(verbatim, true);
  assert.deepEqual(windowsBrowserLaunch("http://127.0.0.1:9/"), {
    file: "cmd.exe",
    args: ["/d", "/s", "/c", 'start "" "http://127.0.0.1:9/"'],
  });
  assert.throws(() => windowsBrowserLaunch("http://example.com/"), /non-loopback/);

  let refused = false;
  const blocked = await openBrowser("http://169.254.169.254/", {
    platform: "win32",
    spawn() {
      refused = true;
      return {
        once() {},
        unref() {},
      };
    },
  });
  assert.equal(blocked, false);
  assert.equal(refused, false);

  const failed = await openBrowser("http://127.0.0.1:9/", {
    platform: "linux",
    spawn() {
      return {
        once(event, listener) {
          if (event === "error") listener(new Error("ENOENT"));
        },
        unref() {},
      };
    },
  });
  assert.equal(failed, false);

  const dir = tempProject();
  const handle = await startServer({
    projectDir: dir,
    open: true,
    platform: "linux",
    spawn() {
      return {
        once(event, listener) {
          if (event === "error") listener(new Error("ENOENT"));
        },
        unref() {},
      };
    },
  });
  try {
    assert.equal(handle.opened, false);
    assert.match(handle.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  } finally {
    await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the desk opens the browser once across requests and an SSE reconnect", async () => {
  const calls: string[] = [];
  const opener = async (url: string): Promise<boolean> => {
    calls.push(url);
    return true;
  };
  const dir = tempProject();
  const skipped = await startServer({ projectDir: dir, open: false, openBrowser: opener });
  try {
    assert.equal(calls.length, 0);
    assert.equal(skipped.opened, false);
  } finally {
    await skipped.close();
  }

  const handle = await startServer({ projectDir: dir, open: true, openBrowser: opener });
  try {
    assert.equal(calls.length, 1);
    assert.equal(handle.opened, true);
    assert.match(calls[0] ?? "", /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const home = await fetch(handle.url);
    assert.equal(home.status, 200);
    const again = await fetch(handle.url);
    assert.equal(again.status, 200);
    const session = await fetch(`${handle.url}api/session`);
    assert.equal(session.status, 200);
    await readSse(handle);
    await readSse(handle);
    const after = await fetch(handle.url);
    assert.equal(after.status, 200);
    assert.equal(calls.length, 1);
  } finally {
    await handle.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function readSse(handle: ServerHandle): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error !== undefined) reject(error);
      else resolve();
    };
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port: handle.port,
        path: "/api/events",
        headers: { host: `127.0.0.1:${handle.port}` },
      },
      (res) => {
        res.setEncoding("utf8");
        let text = "";
        res.on("data", (chunk: string) => {
          text += chunk;
          if (!text.includes(": connected")) return;
          req.destroy();
          finish();
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish(new Error("SSE reconnect did not connect."));
    }, 5_000);
    req.on("error", () => {
      if (!settled) finish(new Error("SSE reconnect did not connect."));
    });
  });
}

test("hh app prints a loopback URL and hh sessions stays the doctor hint", async () => {
  const help = spawnSync(process.execPath, ["--experimental-strip-types", cliEntry, "app", "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: hh app \[--project <dir>\] \[--port <n>\] \[--no-open\] \[--cassette\]/);
  assert.match(help.stdout, /HH_ALLOW_CASSETTE=1/);

  const unknown = spawnSync(process.execPath, ["--experimental-strip-types", cliEntry, "sessions"], {
    encoding: "utf8",
  });
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, "hh doctor [--project <dir>]\n");

  const dir = tempProject();
  const child = spawn(
    process.execPath,
    ["--experimental-strip-types", cliEntry, "app", "--cassette", "--no-open", "--project", dir],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  try {
    const url = await readUrl(child);
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /hh-shell/);
  } finally {
    await stopChild(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

function collect(
  handle: ServerHandle,
  updates: number,
): { ready: Promise<void>; done: Promise<string[]> } {
  let readyResolve: () => void = () => undefined;
  let doneResolve: (lines: string[]) => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });
  const done = new Promise<string[]>((resolve) => {
    doneResolve = resolve;
  });
  const req = http.get(
    {
      hostname: "127.0.0.1",
      port: handle.port,
      path: "/api/events",
      headers: { host: `127.0.0.1:${handle.port}` },
    },
    (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        text += chunk;
        if (text.includes(": connected")) readyResolve();
        const lines = text.split("\n");
        const count = lines.filter((line) => line.startsWith("event: update")).length;
        if (count >= updates) {
          res.destroy();
          doneResolve(lines);
        }
      });
    },
  );
  req.on("error", () => undefined);
  return { ready, done };
}

function writeQueue(dir: string, body: string): string {
  const folder = path.join(dir, ".hitchhiker");
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "queue.json");
  writeFileSync(file, body, "utf8");
  return file;
}

function assertSyntax(source: string, name: string): void {
  const file = path.join(tmpdir(), name);
  writeFileSync(file, source);
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  rmSync(file, { force: true });
}

function readUrl(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`hh app did not print a URL\n${stderr}`));
    }, 20_000);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
      const line = stdout.split("\n").find((item) => item.startsWith("http://127.0.0.1:"));
      if (line !== undefined && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(line.trim());
      }
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`hh app exited ${code ?? "null"}\n${stderr}\n${stdout}`));
    });
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
