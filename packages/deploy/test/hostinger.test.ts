import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deployHostinger, prepareNodeArchive } from "../src/hostinger.ts";
import type { DeployPollState, HostingerClient } from "../src/types.ts";

const CAP = 50 * 1024 * 1024;

const STATIC_FILES = [{ path: "dist/index.html", bytes: 120 }];
const NODE_FILES = [
  { path: "package.json", bytes: 40 },
  { path: "src/index.js", bytes: 80 },
];

interface Script {
  states: DeployPollState[];
  id: string;
  staticUploads: number;
  nodeUploads: number;
  polls: number;
  ids: string[];
}

function scripted(states: DeployPollState[], id = "job-1"): { script: Script; client: HostingerClient } {
  const script: Script = {
    states,
    id,
    staticUploads: 0,
    nodeUploads: 0,
    polls: 0,
    ids: [],
  };
  const client: HostingerClient = {
    uploadStatic: () => {
      script.staticUploads += 1;
      return Promise.resolve({ id: script.id });
    },
    uploadNode: () => {
      script.nodeUploads += 1;
      return Promise.resolve({ id: script.id });
    },
    poll: (pollId: string) => {
      const state = script.states[script.polls];
      script.polls += 1;
      script.ids.push(pollId);
      if (state === undefined) {
        return Promise.reject(new Error("poll past script"));
      }
      return Promise.resolve(state);
    },
  };
  return { script, client };
}

function forbiddenClient(): HostingerClient {
  const boom = (): Promise<never> => Promise.reject(new Error("client was called"));
  return {
    uploadStatic: boom,
    uploadNode: boom,
    poll: () => boom(),
  };
}

function uploads(script: Script): number {
  return script.staticUploads + script.nodeUploads;
}

test("prepareNodeArchive sums injected sizes and allows the 50 MB cap", () => {
  const archive = prepareNodeArchive([
    { path: "src/index.js", bytes: 10 },
    { path: "package.json", bytes: 20 },
  ]);
  assert.deepEqual(archive, { bytes: 30 });
  assert.deepEqual(prepareNodeArchive([{ path: "src/app.js", bytes: CAP }]), { bytes: CAP });
});

test("prepareNodeArchive rejects node_modules and a total over 50 MB", () => {
  assert.throws(
    () => prepareNodeArchive([{ path: "node_modules/left-pad/index.js", bytes: 4 }]),
    /node_modules/,
  );
  assert.throws(
    () => prepareNodeArchive([{ path: "services/api/node_modules/express/index.js", bytes: 4 }]),
    /node_modules/,
  );
  assert.throws(
    () => prepareNodeArchive([{ path: "services\\api\\node_modules\\express\\index.js", bytes: 4 }]),
    /node_modules/,
  );
  assert.throws(
    () => prepareNodeArchive([{ path: "NODE_MODULES/pkg/index.js", bytes: 4 }]),
    /node_modules/,
  );
  assert.throws(
    () => prepareNodeArchive([{ path: "src/app.js", bytes: CAP + 1 }]),
    /exceeds 50 MB/,
  );
  const half = 30 * 1024 * 1024;
  assert.throws(
    () =>
      prepareNodeArchive([
        { path: "a.js", bytes: half },
        { path: "b.js", bytes: half },
      ]),
    /exceeds 50 MB/,
  );
});

test("prepareNodeArchive rejects an empty list and a bad byte count", () => {
  assert.throws(() => prepareNodeArchive([]), /file list is empty/);
  assert.throws(
    () => prepareNodeArchive([{ path: "src/app.js", bytes: -1 }]),
    /non-negative/,
  );
  assert.throws(
    () => prepareNodeArchive([{ path: "src/app.js", bytes: Number.NaN }]),
    /non-negative/,
  );
});

test("approved false throws and does not upload", async () => {
  const client = forbiddenClient();
  await assert.rejects(
    () =>
      deployHostinger({
        approved: false,
        kind: "static",
        files: STATIC_FILES,
        maxPolls: 3,
        client,
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /requires approval/);
      assert.equal(error.message.includes("succeeded"), false);
      return true;
    },
  );
});

test("maxPolls 0 throws before upload", async () => {
  const client = forbiddenClient();
  await assert.rejects(
    () =>
      deployHostinger({
        approved: true,
        kind: "static",
        files: STATIC_FILES,
        maxPolls: 0,
        client,
      }),
    /maxPolls must be a positive integer/,
  );
});

test("an empty file list throws before upload", async () => {
  const client = forbiddenClient();
  await assert.rejects(
    () =>
      deployHostinger({
        approved: true,
        kind: "static",
        files: [],
        maxPolls: 2,
        client,
      }),
    /file list is empty/,
  );
  await assert.rejects(
    () =>
      deployHostinger({
        approved: true,
        kind: "node",
        files: [],
        maxPolls: 2,
        client,
      }),
    /file list is empty/,
  );
});

test("kind node with node_modules throws before upload", async () => {
  const { script, client } = scripted(["completed"]);
  await assert.rejects(
    () =>
      deployHostinger({
        approved: true,
        kind: "node",
        files: [{ path: "app/node_modules/left-pad/index.js", bytes: 12 }],
        maxPolls: 3,
        client,
      }),
    /node_modules/,
  );
  assert.equal(uploads(script), 0);
  assert.equal(script.polls, 0);
});

test("kind node over 50 MB throws before upload", async () => {
  const { script, client } = scripted(["completed"]);
  await assert.rejects(
    () =>
      deployHostinger({
        approved: true,
        kind: "node",
        files: [{ path: "src/app.js", bytes: CAP + 1 }],
        maxPolls: 3,
        client,
      }),
    /exceeds 50 MB/,
  );
  assert.equal(uploads(script), 0);
  assert.equal(script.polls, 0);
});

test("static upload polls queued, queued, completed once", async () => {
  const { script, client } = scripted(["queued", "queued", "completed"], "static-9");
  const result = await deployHostinger({
    approved: true,
    kind: "static",
    files: STATIC_FILES,
    maxPolls: 5,
    client,
  });
  assert.deepEqual(result, { state: "completed", uploads: 1 });
  assert.equal(script.staticUploads, 1);
  assert.equal(script.nodeUploads, 0);
  assert.equal(script.polls, 3);
  assert.deepEqual(script.ids, ["static-9", "static-9", "static-9"]);
});

test("node upload polls queued, queued, completed once", async () => {
  const { script, client } = scripted(["queued", "queued", "completed"], "node-9");
  const result = await deployHostinger({
    approved: true,
    kind: "node",
    files: NODE_FILES,
    maxPolls: 5,
    client,
  });
  assert.deepEqual(result, { state: "completed", uploads: 1 });
  assert.equal(script.nodeUploads, 1);
  assert.equal(script.staticUploads, 0);
  assert.equal(script.polls, 3);
  assert.deepEqual(script.ids, ["node-9", "node-9", "node-9"]);
});

test("queued until maxPolls returns queued and uploads once", async () => {
  const { script, client } = scripted(["queued", "queued", "queued", "completed"]);
  const result = await deployHostinger({
    approved: true,
    kind: "static",
    files: STATIC_FILES,
    maxPolls: 3,
    client,
  });
  assert.deepEqual(result, { state: "queued", uploads: 1 });
  assert.equal(script.staticUploads, 1);
  assert.equal(script.nodeUploads, 0);
  assert.equal(script.polls, 3);
});

test("a failed poll returns failed and does not upload again", async () => {
  const { script, client } = scripted(["queued", "failed", "completed"]);
  const result = await deployHostinger({
    approved: true,
    kind: "node",
    files: NODE_FILES,
    maxPolls: 6,
    client,
  });
  assert.deepEqual(result, { state: "failed", uploads: 1 });
  assert.equal(script.nodeUploads, 1);
  assert.equal(script.staticUploads, 0);
  assert.equal(script.polls, 2);
});

test("an empty upload id throws after one upload and does not poll", async () => {
  let staticUploads = 0;
  let polls = 0;
  const client: HostingerClient = {
    uploadStatic: () => {
      staticUploads += 1;
      return Promise.resolve({ id: "  " });
    },
    uploadNode: () => Promise.reject(new Error("uploadNode was called")),
    poll: () => {
      polls += 1;
      return Promise.resolve("completed");
    },
  };
  await assert.rejects(
    () =>
      deployHostinger({
        approved: true,
        kind: "static",
        files: STATIC_FILES,
        maxPolls: 2,
        client,
      }),
    /empty id/,
  );
  assert.equal(staticUploads, 1);
  assert.equal(polls, 0);
});

test("a thrown poll does not upload again", async () => {
  const { script, client } = scripted(["queued"]);
  client.poll = () => Promise.reject(new Error("status read failed"));
  await assert.rejects(
    () =>
      deployHostinger({
        approved: true,
        kind: "static",
        files: STATIC_FILES,
        maxPolls: 4,
        client,
      }),
    /status read failed/,
  );
  assert.equal(script.staticUploads, 1);
  assert.equal(script.nodeUploads, 0);
});

test("a second call is a new attempt and each attempt uploads once", async () => {
  const { script, client } = scripted(["queued", "completed", "completed"]);
  const first = await deployHostinger({
    approved: true,
    kind: "static",
    files: STATIC_FILES,
    maxPolls: 1,
    client,
  });
  const second = await deployHostinger({
    approved: true,
    kind: "static",
    files: STATIC_FILES,
    maxPolls: 1,
    client,
  });
  assert.deepEqual(first, { state: "queued", uploads: 1 });
  assert.deepEqual(second, { state: "completed", uploads: 1 });
  assert.equal(script.staticUploads, 2);
});

test("the module does not read a token, call the network, or name an agency overwrite tool", () => {
  const sourcePath = fileURLToPath(new URL("../src/hostinger.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("readFile"), false);
  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("agency-hosting"), false);
  assert.match(source, /Hostinger MCP schema at/);
  assert.match(source, /integration time/);
  assert.match(source, /18, 20, 22, and 24/);
  assert.match(source, /does not invent a REST path/);
});
