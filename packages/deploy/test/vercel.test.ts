import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deployCloudflare } from "../src/cloudflare.ts";
import { deployHostinger } from "../src/hostinger.ts";
import { deployNetlify } from "../src/netlify.ts";
import { deployVercel } from "../src/vercel.ts";

type PollState = "queued" | "completed" | "failed";

interface StaticClient {
  upload: () => Promise<{ id: string }>;
  poll: (id: string) => Promise<PollState>;
}

interface Script {
  states: PollState[];
  id: string;
  uploads: number;
  polls: number;
  ids: string[];
}

function scripted(states: PollState[], id = "dep-1"): { script: Script; client: StaticClient } {
  const script: Script = { states, id, uploads: 0, polls: 0, ids: [] };
  const client: StaticClient = {
    upload: () => {
      script.uploads += 1;
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

function sourceOf(relativeName: string): string {
  return readFileSync(fileURLToPath(new URL(relativeName, import.meta.url)), "utf8");
}

function assertNoTransport(source: string): void {
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("node:fs"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:child_process"), false);
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("exec("), false);
  assert.equal(source.includes("execFile"), false);
  assert.equal(source.includes("console."), false);
  assert.equal(source.includes("https://"), false);
  assert.equal(source.includes("http://"), false);
  assert.equal(source.includes("VERCEL_TOKEN"), false);
  assert.equal(source.includes("NETLIFY_AUTH_TOKEN"), false);
  assert.equal(source.includes("CLOUDFLARE_API_TOKEN"), false);
  assert.equal(source.includes("CLOUDFLARE_ACCOUNT_ID"), false);
  assert.equal(source.includes("approved ||"), false);
}

test("approved false throws, does not upload, and does not claim success", async () => {
  const { script, client } = scripted(["completed"]);
  await assert.rejects(
    () => deployVercel({ approved: false, kind: "static", maxPolls: 3, client }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Vercel deploy requires approval/);
      assert.equal(/succeeded/i.test(error.message), false);
      return true;
    },
  );
  assert.equal(script.uploads, 0);
  assert.equal(script.polls, 0);
});

test("a preview flag does not skip approval", async () => {
  const { script, client } = scripted(["completed"]);
  const input = {
    approved: false,
    kind: "static" as const,
    maxPolls: 2,
    client,
    preview: true,
  };
  await assert.rejects(() => deployVercel(input), /Vercel deploy requires approval/);
  assert.equal(script.uploads, 0);
  assert.equal(script.polls, 0);
});

test("unapproved node still requires approval and does not upload", async () => {
  const { script, client } = scripted(["completed"]);
  await assert.rejects(
    () => deployVercel({ approved: false, kind: "node", maxPolls: 3, client }),
    /Vercel deploy requires approval/,
  );
  assert.equal(script.uploads, 0);
  assert.equal(script.polls, 0);
});

test("kind node is rejected before upload", async () => {
  const { script, client } = scripted(["completed"]);
  await assert.rejects(
    () => deployVercel({ approved: true, kind: "node", maxPolls: 3, client }),
    /Vercel template is not wired/,
  );
  assert.equal(script.uploads, 0);
  assert.equal(script.polls, 0);
});

test("an unknown kind is rejected before upload", async () => {
  const { script, client } = scripted(["completed"]);
  await assert.rejects(
    () =>
      deployVercel({
        approved: true,
        kind: "edge" as "static",
        maxPolls: 2,
        client,
      }),
    /Vercel deploy kind must be static/,
  );
  assert.equal(script.uploads, 0);
});

test("maxPolls must be a positive integer and is checked before upload", async () => {
  for (const maxPolls of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const { script, client } = scripted(["completed"]);
    await assert.rejects(
      () => deployVercel({ approved: true, kind: "static", maxPolls, client }),
      /maxPolls must be a positive integer/,
    );
    assert.equal(script.uploads, 0);
    assert.equal(script.polls, 0);
  }
});

test("static upload polls queued, queued, completed once", async () => {
  const { script, client } = scripted(["queued", "queued", "completed"], "vercel-9");
  const result = await deployVercel({
    approved: true,
    kind: "static",
    maxPolls: 5,
    client,
  });
  assert.deepEqual(result, { state: "completed", uploads: 1 });
  assert.equal(script.uploads, 1);
  assert.equal(script.polls, 3);
  assert.deepEqual(script.ids, ["vercel-9", "vercel-9", "vercel-9"]);
});

test("a completed poll on the first read uploads once", async () => {
  const { script, client } = scripted(["completed"], "vercel-done");
  const result = await deployVercel({
    approved: true,
    kind: "static",
    maxPolls: 4,
    client,
  });
  assert.deepEqual(result, { state: "completed", uploads: 1 });
  assert.equal(script.uploads, 1);
  assert.equal(script.polls, 1);
});

test("queued until maxPolls returns queued and uploads once", async () => {
  const { script, client } = scripted(["queued", "queued", "queued", "completed"]);
  const result = await deployVercel({
    approved: true,
    kind: "static",
    maxPolls: 3,
    client,
  });
  assert.deepEqual(result, { state: "queued", uploads: 1 });
  assert.equal(script.uploads, 1);
  assert.equal(script.polls, 3);
});

test("a failed poll returns failed and does not upload again", async () => {
  const { script, client } = scripted(["queued", "failed", "completed"]);
  const result = await deployVercel({
    approved: true,
    kind: "static",
    maxPolls: 6,
    client,
  });
  assert.deepEqual(result, { state: "failed", uploads: 1 });
  assert.equal(script.uploads, 1);
  assert.equal(script.polls, 2);
});

test("an empty upload id throws after one upload and does not poll", async () => {
  for (const id of ["", "  ", "\n"]) {
    let uploads = 0;
    let polls = 0;
    const client: StaticClient = {
      upload: () => {
        uploads += 1;
        return Promise.resolve({ id });
      },
      poll: () => {
        polls += 1;
        return Promise.resolve("completed");
      },
    };
    await assert.rejects(
      () => deployVercel({ approved: true, kind: "static", maxPolls: 2, client }),
      /empty id/,
    );
    assert.equal(uploads, 1);
    assert.equal(polls, 0);
  }

  let uploads = 0;
  let polls = 0;
  const missing: StaticClient = {
    upload: () => {
      uploads += 1;
      return Promise.resolve({} as { id: string });
    },
    poll: () => {
      polls += 1;
      return Promise.resolve("completed");
    },
  };
  await assert.rejects(
    () => deployVercel({ approved: true, kind: "static", maxPolls: 2, client: missing }),
    /empty id/,
  );
  assert.equal(uploads, 1);
  assert.equal(polls, 0);
});

test("a thrown poll does not upload again", async () => {
  const { script, client } = scripted(["queued"]);
  client.poll = () => Promise.reject(new Error("status read failed"));
  await assert.rejects(
    () => deployVercel({ approved: true, kind: "static", maxPolls: 4, client }),
    /status read failed/,
  );
  assert.equal(script.uploads, 1);
  assert.equal(script.polls, 0);
});

test("an unexpected poll state does not upload again", async () => {
  const { script, client } = scripted(["queued"]);
  client.poll = () => Promise.resolve("mystery" as "queued");
  await assert.rejects(
    () => deployVercel({ approved: true, kind: "static", maxPolls: 3, client }),
    /unexpected Vercel poll state/,
  );
  assert.equal(script.uploads, 1);
});

test("a second call is a new attempt and each attempt uploads once", async () => {
  const { script, client } = scripted(["queued", "completed", "completed"]);
  const first = await deployVercel({
    approved: true,
    kind: "static",
    maxPolls: 1,
    client,
  });
  const second = await deployVercel({
    approved: true,
    kind: "static",
    maxPolls: 1,
    client,
  });
  assert.deepEqual(first, { state: "queued", uploads: 1 });
  assert.deepEqual(second, { state: "completed", uploads: 1 });
  assert.equal(script.uploads, 2);
});

test("static hosts do not share an upload count with each other or with Hostinger", async () => {
  const vercel = scripted(["completed"], "vercel-1");
  const netlify = scripted(["queued", "completed"], "netlify-1");
  const cloudflare = scripted(["failed"], "cf-1");
  let hostingerUploads = 0;
  const vercelResult = await deployVercel({
    approved: true,
    kind: "static",
    maxPolls: 2,
    client: vercel.client,
  });
  const netlifyResult = await deployNetlify({
    approved: true,
    kind: "static",
    maxPolls: 2,
    client: netlify.client,
  });
  const cloudflareResult = await deployCloudflare({
    approved: true,
    kind: "static",
    maxPolls: 2,
    client: cloudflare.client,
  });
  const hostingerResult = await deployHostinger({
    approved: true,
    kind: "static",
    files: [{ path: "dist/index.html", bytes: 12 }],
    maxPolls: 1,
    client: {
      uploadStatic: () => {
        hostingerUploads += 1;
        return Promise.resolve({ id: "host-1" });
      },
      uploadNode: () => Promise.reject(new Error("uploadNode was called")),
      poll: () => Promise.resolve("completed"),
    },
  });
  assert.deepEqual(vercelResult, { state: "completed", uploads: 1 });
  assert.deepEqual(netlifyResult, { state: "completed", uploads: 1 });
  assert.deepEqual(cloudflareResult, { state: "failed", uploads: 1 });
  assert.deepEqual(hostingerResult, { state: "completed", uploads: 1 });
  assert.equal(vercel.script.uploads, 1);
  assert.equal(netlify.script.uploads, 1);
  assert.equal(cloudflare.script.uploads, 1);
  assert.equal(hostingerUploads, 1);
  assert.equal(netlify.script.polls, 2);
  assert.equal(cloudflare.script.polls, 1);
});

test("the module does not read a token, call the network, or start the Vercel CLI", () => {
  const source = sourceOf("../src/vercel.ts");
  const pollSource = sourceOf("../src/poll.ts");
  assertNoTransport(source);
  assertNoTransport(pollSource);
  assert.match(source, /no preview exception/);
  assert.match(source, /Vercel template is not wired/);
  assert.equal(source.includes("prj_"), false);
  assert.equal(/^(export )?(let|var) /m.test(pollSource), false);
  assert.equal(pollSource.includes("globalThis"), false);
});
