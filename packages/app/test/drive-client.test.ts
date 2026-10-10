import assert from "node:assert/strict";
import { test } from "node:test";
import { hostMatchMedia, mountDrive, paintDrive, parseDriveQueue, type DriveEnv } from "../src/client/drive.ts";

const TOKEN = "ab".repeat(32);

interface FakeEl {
  innerHTML: string;
  textContent: string | null;
  parentElement: FakeEl | null;
  attrs: Map<string, string>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

function element(attrs: Record<string, string> = {}): FakeEl {
  const store = new Map(Object.entries(attrs));
  const el: FakeEl = {
    innerHTML: "",
    textContent: "",
    parentElement: null,
    attrs: store,
    getAttribute(name) {
      return store.has(name) ? store.get(name) ?? "" : null;
    },
    setAttribute(name, value) {
      store.set(name, value);
    },
    removeAttribute(name) {
      store.delete(name);
    },
  };
  return el;
}

function desk(items: unknown): {
  env: DriveEnv;
  regions: Map<string, FakeEl>;
  calls: Array<{ url: string; init: RequestInit | undefined }>;
  click: (target: FakeEl) => void;
  poll: () => void;
} {
  const regions = new Map<string, FakeEl>([
    ["#drive-queue-body", element()],
    ["#drive-progress", element()],
    ["[data-cost-line]", element()],
    ["#drive-escalations", element()],
    ["#drive-verdicts", element()],
    ["#drive-watchdog", element()],
    ["#drive-pause", element({ "data-action": "pause" })],
    ["#drive-pause-note", element()],
    ["[data-theme-toggle]", element({ "data-theme-toggle": "" })],
    ['meta[name="hh-csrf"]', element({ content: TOKEN })],
  ]);
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  let onClick: ((event: { target: FakeEl | null }) => void) | null = null;
  let poll = (): void => undefined;
  const dataset: { theme?: string } = {};
  const env: DriveEnv = {
    document: {
      querySelector(selector) {
        return regions.get(selector) ?? null;
      },
      addEventListener(_type, listener) {
        onClick = listener as (event: { target: FakeEl | null }) => void;
      },
      removeEventListener() {
        onClick = null;
      },
      documentElement: { dataset },
    },
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      const payload = url === "/api/drive/pause" ? pausedItems() : items;
      return Response.json(payload);
    },
    setInterval(fn) {
      poll = fn;
      return 1;
    },
    clearInterval() {
      poll = () => undefined;
    },
    matchMedia() {
      return { matches: false };
    },
  };
  return {
    env,
    regions,
    calls,
    click(target) {
      onClick?.({ target });
    },
    poll() {
      poll();
    },
  };
}

function pausedItems(): { items: Array<{ id: string; kind: string; status: string }> } {
  return {
    items: [
      { id: "001", kind: "build", status: "passed" },
      { id: "002", kind: "build", status: "paused" },
    ],
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test("parseDriveQueue accepts a queue and rejects a bad shape", () => {
  assert.deepEqual(
    parseDriveQueue({
      items: [
        { id: "001", kind: "build", status: "running" },
        { id: "002", kind: "review", status: "queued" },
      ],
    })?.map((item) => item.status),
    ["running", "queued"],
  );
  assert.equal(parseDriveQueue({ items: [{ id: "001", kind: "build", status: "fixed" }] }), null);
  assert.equal(parseDriveQueue("{not json"), null);
  assert.equal(parseDriveQueue({ items: [{ id: "Bad", kind: "build", status: "queued" }] }), null);
});

test("pause posts the token and repaints the paused row", async () => {
  const running = {
    items: [
      { id: "001", kind: "build", status: "passed" },
      { id: "002", kind: "build", status: "running" },
    ],
  };
  const view = desk(running);
  mountDrive(view.env);
  await flush();
  assert.equal(view.calls[0]?.url, "/api/drive");
  assert.match(view.regions.get("#drive-queue-body")?.innerHTML ?? "", /data-status="running"/);
  assert.equal(view.regions.get("[data-cost-line]")?.textContent, "Prompts 2 of 2.");

  const pause = view.regions.get("#drive-pause");
  assert.ok(pause);
  view.click(pause);
  await flush();
  const posted = view.calls[1];
  assert.equal(posted?.url, "/api/drive/pause");
  assert.equal(posted?.init?.method, "POST");
  const headers = new Headers(posted?.init?.headers);
  assert.equal(headers.get("x-hh-csrf"), TOKEN);
  assert.match(view.regions.get("#drive-queue-body")?.innerHTML ?? "", /data-status="paused"/);
  assert.doesNotMatch(view.regions.get("#drive-queue-body")?.innerHTML ?? "", /data-status="running"/);
  assert.match(view.regions.get("#drive-progress")?.innerHTML ?? "", /Paused/);
  assert.equal(view.regions.get("[data-cost-line]")?.textContent, "Prompts 2 of 2.");
});

test("an empty queue does not post, and the theme control still flips", async () => {
  const view = desk({ items: [] });
  mountDrive(view.env);
  await flush();
  const pause = view.regions.get("#drive-pause");
  assert.ok(pause);
  assert.equal(pause.getAttribute("aria-disabled"), "true");
  view.click(pause);
  await flush();
  assert.equal(view.calls.length, 1);
  const toggle = view.regions.get("[data-theme-toggle]");
  assert.ok(toggle);
  view.click(toggle);
  assert.equal(view.env.document.documentElement.dataset.theme, "dark");
  assert.equal(toggle.textContent, "Day desk");
  paintDrive(view.env.document, []);
  assert.match(
    view.regions.get("#drive-queue-body")?.innerHTML ?? "",
    /No queue yet\. The plan lands here after you approve the prompts\./,
  );
  assert.equal(pause.getAttribute("disabled"), "");
  assert.equal(pause.getAttribute("aria-disabled"), "true");
});

test("a throwing theme probe still posts pause", async () => {
  const view = desk({
    items: [{ id: "002", kind: "build", status: "running" }],
  });
  view.env.matchMedia = () => {
    throw new TypeError("Illegal invocation");
  };
  mountDrive(view.env);
  await flush();
  const pause = view.regions.get("#drive-pause");
  assert.ok(pause);
  view.click(pause);
  await flush();
  assert.equal(view.calls[1]?.url, "/api/drive/pause");
  assert.match(view.regions.get("#drive-queue-body")?.innerHTML ?? "", /data-status="paused"/);
});

test("hostMatchMedia calls matchMedia on the window so theme detection does not throw", () => {
  const host = globalThis as { matchMedia?: (query: string) => { matches: boolean } };
  const previous = host.matchMedia;
  host.matchMedia = function media(this: unknown, query: string) {
    if (this === undefined || this === null) throw new TypeError("Illegal invocation");
    return { matches: query.includes("dark") };
  };
  try {
    assert.equal(hostMatchMedia("(prefers-color-scheme: dark)").matches, true);
    assert.equal(hostMatchMedia("(prefers-color-scheme: light)").matches, false);
  } finally {
    if (previous === undefined) delete host.matchMedia;
    else host.matchMedia = previous;
  }
});
