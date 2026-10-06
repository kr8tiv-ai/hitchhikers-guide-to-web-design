import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BadUrlError, NetworkError, RobotsDenied, USER_AGENT } from "../src/crawl.ts";
import {
  CAPTURE_OFF_MESSAGE,
  EMPTY_BOARD_MESSAGE,
  LOGIN_WALL_MESSAGE,
  PIN_CAP,
  SCROLL_DELAY_MS,
  boardMessage,
  captureBoard,
  type BoardSession,
  type CaptureDeps,
  type CrawlLike,
  type GuideConfig,
  type OpenOptions,
  type PinBytes,
} from "../src/pinterest.ts";

const source = readFileSync(
  fileURLToPath(new URL("../src/pinterest.ts", import.meta.url)),
  "utf8",
);

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-pin-"));
}

function config(enabled: boolean): GuideConfig {
  return { integrations: { pinterestCapture: enabled } };
}

function pins(count: number, bytes: Buffer): PinBytes[] {
  const list: PinBytes[] = [];
  for (let index = 0; index < count; index += 1) {
    list.push({
      bytes,
      contentType: "image/png",
      width: 120,
      height: 90,
    });
  }
  return list;
}

interface Rig {
  deps: CaptureDeps;
  events: string[];
  opens: OpenOptions[];
  sleeps: number[];
  closed: number;
}

function rig(options: {
  root: string;
  enabled?: boolean;
  robots?: { status: number; body: string };
  loginWall?: boolean;
  finalUrl?: string;
  counts?: number[];
  bytes?: Buffer;
}): Rig {
  const events: string[] = [];
  const opens: OpenOptions[] = [];
  const sleeps: number[] = [];
  let closed = 0;
  let reads = 0;
  const counts = options.counts ?? [3];
  const bytes = options.bytes ?? Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const crawl: CrawlLike = {
    robots: async () => {
      events.push("robots");
      if (options.robots === undefined) throw new Error("robots was not expected");
      return options.robots;
    },
    open: async (_url, openOptions) => {
      events.push("open");
      opens.push(openOptions);
      const session: BoardSession = {
        finalUrl: options.finalUrl ?? "https://www.pinterest.com/guide/warm-paper/",
        loginWall: options.loginWall ?? false,
        pins: async () => {
          events.push("pins");
          const count = counts[Math.min(reads, counts.length - 1)] ?? 0;
          reads += 1;
          return pins(count, bytes);
        },
        scroll: async () => {
          events.push("scroll");
        },
        close: async () => {
          closed += 1;
          events.push("close");
        },
      };
      return session;
    },
  };
  return {
    deps: {
      crawl,
      config: config(options.enabled ?? true),
      sleep: async (ms) => {
        sleeps.push(ms);
        events.push("sleep");
      },
      root: options.root,
    },
    events,
    opens,
    sleeps,
    get closed() {
      return closed;
    },
  };
}

const ALLOW = { status: 200, body: "User-agent: *\nDisallow:\n" };

test("capture stays off unless the flag is true", async () => {
  assert.equal(PIN_CAP, 60);
  assert.equal(SCROLL_DELAY_MS, 1_500);
  const root = tempDir();
  const off = rig({ root, enabled: false });
  try {
    const saved = await captureBoard("not a url", off.deps);
    assert.deepEqual([...saved], []);
    assert.equal(boardMessage(saved), CAPTURE_OFF_MESSAGE);
    assert.deepEqual(off.events, []);
    assert.equal(existsSync(path.join(root, ".hitchhiker")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a disallowed board never opens or sleeps", async () => {
  const root = tempDir();
  const blocked = rig({
    root,
    robots: { status: 200, body: "User-agent: *\nDisallow: /\n" },
  });
  try {
    await assert.rejects(
      () => captureBoard("https://www.pinterest.com/guide/warm-paper/", blocked.deps),
      (error: unknown) => {
        assert.ok(error instanceof RobotsDenied);
        return true;
      },
    );
    assert.deepEqual(blocked.events, ["robots"]);
    assert.equal(blocked.sleeps.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the guide user-agent is the one robots.txt is checked against", async () => {
  const root = tempDir();
  const blocked = rig({
    root,
    robots: {
      status: 200,
      body: ["User-agent: *", "Disallow:", "", "User-agent: HitchhikerGuideBot", "Disallow: /"].join(
        "\n",
      ),
    },
  });
  try {
    await assert.rejects(
      () => captureBoard("https://www.pinterest.com/guide/warm-paper/", blocked.deps),
      RobotsDenied,
    );
    assert.deepEqual(blocked.events, ["robots"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a missing robots file still allows a public board", async () => {
  const root = tempDir();
  const bytes = Buffer.from("displayed-pin");
  const open = rig({ root, robots: { status: 404, body: "ignored" }, counts: [1], bytes });
  try {
    const saved = await captureBoard("https://www.pinterest.com/guide/warm-paper/", open.deps);
    assert.equal(saved.length, 1);
    assert.equal(boardMessage(saved), "");
    const file = saved[0];
    assert.ok(file);
    assert.equal(file.endsWith(`${path.sep}.hitchhiker${path.sep}uploads${path.sep}mood${path.sep}pin-01.png`), true);
    assert.equal(readFileSync(file).equals(bytes), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("robots.txt errors never open the board", async () => {
  const root = tempDir();
  const failed = rig({ root, robots: { status: 503, body: "" } });
  try {
    await assert.rejects(
      () => captureBoard("https://www.pinterest.com/guide/warm-paper/", failed.deps),
      (error: unknown) => {
        assert.ok(error instanceof NetworkError);
        assert.equal(error.status, 503);
        return true;
      },
    );
    assert.deepEqual(failed.events, ["robots"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("user info in the board url is refused before any fetch", async () => {
  const root = tempDir();
  const called = rig({ root, robots: ALLOW });
  try {
    await assert.rejects(
      () => captureBoard("https://user:pw@www.pinterest.com/guide/warm-paper/", called.deps),
      (error: unknown) => {
        assert.ok(error instanceof BadUrlError);
        return true;
      },
    );
    assert.deepEqual(called.events, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a login wall returns an empty list and asks for exports", async () => {
  const root = tempDir();
  const wall = rig({ root, robots: ALLOW, loginWall: true, counts: [8] });
  try {
    const saved = await captureBoard("https://www.pinterest.com/guide/private/", wall.deps);
    assert.deepEqual([...saved], []);
    assert.equal(boardMessage(saved), LOGIN_WALL_MESSAGE);
    assert.equal(wall.events.includes("pins"), false);
    assert.equal(wall.events.includes("sleep"), false);
    assert.equal(wall.events.includes("close"), true);
    assert.equal(existsSync(path.join(root, ".hitchhiker")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a login redirect is treated as a wall even when the flag is clear", async () => {
  const root = tempDir();
  const wall = rig({
    root,
    robots: ALLOW,
    loginWall: false,
    finalUrl: "https://www.pinterest.com/login/",
    counts: [4],
  });
  try {
    const saved = await captureBoard("https://www.pinterest.com/guide/private/", wall.deps);
    assert.deepEqual([...saved], []);
    assert.equal(boardMessage(saved), LOGIN_WALL_MESSAGE);
    assert.equal(wall.sleeps.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scrolls wait 1.5 seconds and stop at 60 pins", async () => {
  const root = tempDir();
  const bytes = Buffer.from("pin-at-displayed-size");
  const board = rig({
    root,
    robots: ALLOW,
    counts: [25, 50, 100],
    bytes,
  });
  try {
    const saved = await captureBoard("https://www.pinterest.com/guide/warm-paper/", board.deps);
    assert.equal(saved.length, 60);
    assert.deepEqual(board.sleeps, [SCROLL_DELAY_MS, SCROLL_DELAY_MS]);
    assert.deepEqual(board.events, [
      "robots",
      "open",
      "pins",
      "sleep",
      "scroll",
      "pins",
      "sleep",
      "scroll",
      "pins",
      "close",
    ]);
    const open = board.opens[0];
    assert.ok(open);
    assert.equal(open.userAgent, USER_AGENT);
    assert.equal(open.credentials, "omit");
    assert.equal(Object.hasOwn(open, "cookie"), false);
    const first = saved[0];
    const last = saved[59];
    assert.ok(first);
    assert.ok(last);
    assert.equal(path.basename(first), "pin-01.png");
    assert.equal(path.basename(last), "pin-60.png");
    assert.equal(readFileSync(first).equals(bytes), true);
    assert.equal(board.closed, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the first screen of 60 pins does not scroll", async () => {
  const root = tempDir();
  const board = rig({ root, robots: ALLOW, counts: [80] });
  try {
    const saved = await captureBoard("https://www.pinterest.com/guide/warm-paper/", board.deps);
    assert.equal(saved.length, 60);
    assert.deepEqual(board.sleeps, []);
    assert.equal(board.events.includes("scroll"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an empty public board asks for exported images", async () => {
  const root = tempDir();
  const board = rig({ root, robots: ALLOW, counts: [0, 0] });
  try {
    const saved = await captureBoard("https://www.pinterest.com/guide/empty/", board.deps);
    assert.deepEqual([...saved], []);
    assert.equal(boardMessage(saved), EMPTY_BOARD_MESSAGE);
    assert.equal(existsSync(path.join(root, ".hitchhiker")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the capture source never stores a jar or signs in", () => {
  assert.equal(source.includes("storageState"), false);
  assert.equal(source.includes("addCookies"), false);
  assert.equal(source.includes("document.cookie"), false);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("delete headers.cookie"), true);
  assert.equal(source.includes('credentials: "omit"'), true);
});
