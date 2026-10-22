import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deployCloudflare as cloudflareFromFile } from "../src/cloudflare.ts";
import { deploy as deployFromFile, recommendHost as recommendFromFile } from "../src/dispatch.ts";
import { deployHostinger as hostingerFromFile, prepareNodeArchive as archiveFromFile } from "../src/hostinger.ts";
import { renderLaunchKit as kitFromFile } from "../src/launch-kit.ts";
import { deployNetlify as netlifyFromFile } from "../src/netlify.ts";
import { postCheck as postCheckFromFile } from "../src/post-check.ts";
import { deployVercel as vercelFromFile } from "../src/vercel.ts";
import {
  PHONE_CATEGORY_FLOOR,
  deploy,
  deployCloudflare,
  deployHostinger,
  deployNetlify,
  deployVercel,
  postCheck,
  prepareNodeArchive,
  recommendHost,
  renderLaunchKit,
} from "../src/index.ts";
import type { DispatchClients, PreviewHandoff } from "../src/dispatch.ts";
import type { HostingerClient } from "../src/hostinger.ts";
import type { StaticDeployClient } from "../src/poll.ts";

const BANNED = [
  "!",
  "SSR",
  "serverless",
  "adapter",
  "runtime",
  "CLI",
  "API",
  "MCP",
  "node_modules",
  "static export",
  "template",
  ".next",
];

function stack(pick: string, why = "The record names the pick."): string {
  return `# STACK-DECISION\n\n## Pick\n\n${pick}\n\n## Why\n\n${why}\n`;
}

async function makeProject(markdown: string, files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-dispatch-"));
  await mkdir(path.join(dir, ".hitchhiker", "research"), { recursive: true });
  await writeFile(path.join(dir, ".hitchhiker", "research", "STACK-DECISION.md"), markdown, "utf8");
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, "utf8");
  }
  return dir;
}

async function absent(file: string): Promise<void> {
  await assert.rejects(() => access(file));
}

function assertPlain(reason: string): void {
  for (const word of BANNED) {
    assert.equal(reason.includes(word), false, word);
  }
  assert.equal(/\bnode\b/i.test(reason), false);
  assert.equal(/\bstatic\b/i.test(reason), false);
}

interface StaticScript {
  uploads: number;
  polls: number;
  client: StaticDeployClient;
}

function scriptedStatic(state: "queued" | "completed" | "failed" = "completed"): StaticScript {
  const script: StaticScript = {
    uploads: 0,
    polls: 0,
    client: {
      upload: () => Promise.reject(new Error("upload unset")),
      poll: () => Promise.reject(new Error("poll unset")),
    },
  };
  script.client = {
    upload: () => {
      script.uploads += 1;
      return Promise.resolve({ id: "up-1" });
    },
    poll: () => {
      script.polls += 1;
      return Promise.resolve(state);
    },
  };
  return script;
}

interface HostingerScript {
  staticUploads: number;
  nodeUploads: number;
  polls: number;
  client: HostingerClient;
}

function scriptedHostinger(): HostingerScript {
  const script: HostingerScript = {
    staticUploads: 0,
    nodeUploads: 0,
    polls: 0,
    client: {
      uploadStatic: () => Promise.reject(new Error("upload unset")),
      uploadNode: () => Promise.reject(new Error("upload unset")),
      poll: () => Promise.reject(new Error("poll unset")),
    },
  };
  script.client = {
    uploadStatic: () => {
      script.staticUploads += 1;
      return Promise.resolve({ id: "host-1" });
    },
    uploadNode: () => {
      script.nodeUploads += 1;
      return Promise.resolve({ id: "host-1" });
    },
    poll: () => {
      script.polls += 1;
      return Promise.resolve("completed");
    },
  };
  return script;
}

function yes(): Promise<boolean> {
  return Promise.resolve(true);
}

function clients(partial: DispatchClients): DispatchClients {
  return partial;
}

test("the package entry re-exports the adapters, the launch kit, and the post-check", () => {
  assert.equal(deploy, deployFromFile);
  assert.equal(recommendHost, recommendFromFile);
  assert.equal(deployHostinger, hostingerFromFile);
  assert.equal(deployVercel, vercelFromFile);
  assert.equal(deployNetlify, netlifyFromFile);
  assert.equal(deployCloudflare, cloudflareFromFile);
  assert.equal(renderLaunchKit, kitFromFile);
  assert.equal(postCheck, postCheckFromFile);
  assert.equal(prepareNodeArchive, archiveFromFile);
  assert.equal(PHONE_CATEGORY_FLOOR, 90);
});

test("the dispatcher does not spawn, fetch, or open a port", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/dispatch.ts", import.meta.url)), "utf8");
  assert.equal(source.includes("child_process"), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("4175"), false);
  assert.equal(source.includes("HH_LIVE"), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:net"), false);
});

test("a static record suggests Hostinger and allows all four hosts", async () => {
  const dir = await makeProject(stack("vite-react"));
  try {
    const pick = await recommendHost(dir);
    assert.equal(pick.suggested, "hostinger");
    assert.equal(pick.local, "preview");
    assert.equal(pick.shape, "static");
    assert.equal(pick.pick, "vite-react");
    assert.deepEqual(pick.allowed, ["hostinger", "vercel", "netlify", "cloudflare"]);
    assert.match(pick.reason, /Hostinger is the suggested host/);
    assert.match(pick.reason, /Hostinger, Vercel, Netlify, and Cloudflare/);
    assert.match(pick.reason, /Nothing is sent until you confirm/);
    assertPlain(pick.reason);
    await absent(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"));
    await absent(path.join(dir, ".hitchhiker", "hostinger-yes.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a server record suggests Hostinger and keeps Vercel as the other host", async () => {
  const next = await makeProject(stack("next", "Next.js is the pick because the site type is app."));
  const ssr = await makeProject(stack("astro", "Astro SSR renders each request on the server."));
  try {
    const nodePick = await recommendHost(next);
    const ssrPick = await recommendHost(ssr);
    assert.equal(nodePick.shape, "node");
    assert.equal(ssrPick.shape, "node");
    assert.deepEqual(nodePick.allowed, ["hostinger", "vercel"]);
    assert.deepEqual(ssrPick.allowed, ["hostinger", "vercel"]);
    assert.equal(nodePick.suggested, "hostinger");
    assert.equal(nodePick.local, "preview");
    assert.equal(nodePick.reason, ssrPick.reason);
    assert.match(nodePick.reason, /Netlify and Cloudflare cannot publish this one/);
    assert.match(nodePick.reason, /Nothing is sent until you confirm/);
    assertPlain(nodePick.reason);
  } finally {
    await rm(next, { recursive: true, force: true });
    await rm(ssr, { recursive: true, force: true });
  }
});

test("a static export of a server framework can use all four hosts", async () => {
  const dir = await makeProject(stack("next", "This Next.js site is a static export."));
  try {
    const pick = await recommendHost(dir);
    assert.equal(pick.shape, "static");
    assert.equal(pick.suggested, "hostinger");
    assert.deepEqual(pick.allowed, ["hostinger", "vercel", "netlify", "cloudflare"]);
    assertPlain(pick.reason);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a declined yes calls no client and writes nothing", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  const hostinger = scriptedHostinger();
  const vercel = scriptedStatic();
  let asked = 0;
  try {
    const outcome = await deploy("vercel", dir, {
      yes: () => {
        asked += 1;
        return Promise.resolve(false);
      },
      clients: clients({ hostinger: hostinger.client, vercel: vercel.client }),
    });
    assert.deepEqual(outcome, { declined: true });
    assert.equal(asked, 1);
    assert.equal(vercel.uploads, 0);
    assert.equal(hostinger.staticUploads, 0);
    await absent(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"));
    await absent(path.join(dir, ".hitchhiker", "hostinger-yes.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a decline does not need a stack record", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-dispatch-"));
  const vercel = scriptedStatic();
  try {
    const outcome = await deploy("netlify", dir, {
      yes: () => Promise.resolve(false),
      clients: { netlify: vercel.client },
    });
    assert.deepEqual(outcome, { declined: true });
    assert.equal(vercel.uploads, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an unknown host is refused before the yes", async () => {
  let asked = 0;
  await assert.rejects(
    () => deploy("github" as "vercel", "unused", {
      yes: () => {
        asked += 1;
        return Promise.reject(new Error("yes ran"));
      },
      clients: {},
    }),
    /That host is not one of the choices/,
  );
  assert.equal(asked, 0);
});

test("static hosts reach their adapters through the injected clients", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  const hostinger = scriptedHostinger();
  const vercel = scriptedStatic();
  const netlify = scriptedStatic();
  const cloudflare = scriptedStatic();
  try {
    const hosted = await deploy("hostinger", dir, { yes, clients: { hostinger: hostinger.client } });
    assert.deepEqual(hosted, { host: "hostinger", state: "completed", uploads: 1, url: null });
    assert.equal(hostinger.staticUploads, 1);
    assert.equal(hostinger.nodeUploads, 0);
    assert.equal(hostinger.polls, 1);

    const onVercel = await deploy("vercel", dir, { yes, clients: { vercel: vercel.client } });
    assert.deepEqual(onVercel, { host: "vercel", state: "completed", uploads: 1, url: null });
    assert.equal(vercel.uploads, 1);

    const onNetlify = await deploy("netlify", dir, { yes, clients: { netlify: netlify.client } });
    assert.deepEqual(onNetlify, { host: "netlify", state: "completed", uploads: 1, url: null });
    assert.equal(netlify.uploads, 1);

    const onCloudflare = await deploy("cloudflare", dir, {
      yes,
      clients: { cloudflare: cloudflare.client },
    });
    assert.deepEqual(onCloudflare, { host: "cloudflare", state: "completed", uploads: 1, url: null });
    assert.equal(cloudflare.uploads, 1);
    assert.equal(cloudflare.polls, 1);

    await absent(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"));
    await absent(path.join(dir, ".hitchhiker", "hostinger-yes.json"));
    await absent(path.join(dir, ".hitchhiker", "deploy", "launch-checklist.json"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a queued static upload stops when the poll cap is reached", async () => {
  const dir = await makeProject(stack("vite-react"));
  const vercel = scriptedStatic("queued");
  try {
    const outcome = await deploy("vercel", dir, {
      yes,
      maxPolls: 1,
      clients: { vercel: vercel.client },
    });
    assert.deepEqual(outcome, { host: "vercel", state: "queued", uploads: 1, url: null });
    assert.equal(vercel.uploads, 1);
    assert.equal(vercel.polls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a server site on Hostinger uses the node upload", async () => {
  const dir = await makeProject(stack("next"), {
    "package.json": "{}\n",
    "src/server.js": "export {}\n",
  });
  const hostinger = scriptedHostinger();
  try {
    const outcome = await deploy("hostinger", dir, { yes, clients: { hostinger: hostinger.client } });
    assert.deepEqual(outcome, { host: "hostinger", state: "completed", uploads: 1, url: null });
    assert.equal(hostinger.nodeUploads, 1);
    assert.equal(hostinger.staticUploads, 0);
    assert.equal(hostinger.polls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a server site on Vercel uploads once through the injected client", async () => {
  const dir = await makeProject(stack("next"), {
    "package.json": "{}\n",
    "src/server.js": "export {}\n",
  });
  const vercel = scriptedStatic();
  const netlify = scriptedStatic();
  try {
    const outcome = await deploy("vercel", dir, {
      yes,
      clients: { vercel: vercel.client, netlify: netlify.client },
    });
    assert.deepEqual(outcome, { host: "vercel", state: "completed", uploads: 1, url: null });
    assert.equal(vercel.uploads, 1);
    assert.equal(vercel.polls, 1);
    assert.equal(netlify.uploads, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a server site on Netlify and Cloudflare is rejected with the existing message", async () => {
  const dir = await makeProject(stack("next"), { "package.json": "{}\n" });
  const netlify = scriptedStatic();
  const cloudflare = scriptedStatic();
  try {
    await assert.rejects(
      () => deploy("netlify", dir, { yes, clients: { netlify: netlify.client } }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Netlify template is not wired");
        return true;
      },
    );
    await assert.rejects(
      () => deploy("cloudflare", dir, { yes, clients: { cloudflare: cloudflare.client } }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Cloudflare template is not wired");
        return true;
      },
    );
    assert.equal(netlify.uploads, 0);
    assert.equal(netlify.polls, 0);
    assert.equal(cloudflare.uploads, 0);
    assert.equal(cloudflare.polls, 0);
    await absent(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a server site on Netlify is still rejected when no client was injected", async () => {
  const dir = await makeProject(stack("sveltekit"));
  try {
    await assert.rejects(
      () => deploy("netlify", dir, { yes, clients: {} }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Netlify template is not wired");
        return true;
      },
    );
    await assert.rejects(
      () => deploy("cloudflare", dir, { yes, clients: {} }),
      /Cloudflare template is not wired/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a missing connection is named and nothing is sent", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  try {
    await assert.rejects(
      () => deploy("vercel", dir, { yes, clients: {} }),
      /Vercel is not connected yet\. Nothing was sent\./,
    );
    await assert.rejects(
      () => deploy("hostinger", dir, { yes, clients: {} }),
      /Hostinger is not connected yet\. Nothing was sent\./,
    );
    await absent(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preview calls only the injected handoff", async () => {
  const dir = await makeProject(stack("vite-react"), { "dist/index.html": "<title>Milliways</title>" });
  const vercel = scriptedStatic();
  const seen: PreviewHandoff[] = [];
  try {
    const outcome = await deploy("preview", dir, {
      yes,
      clients: {
        vercel: vercel.client,
        preview: {
          handoff: (input) => {
            seen.push(input);
            return Promise.resolve({ url: "http://127.0.0.1:4317/" });
          },
        },
      },
    });
    assert.deepEqual(outcome, {
      host: "preview",
      state: "completed",
      uploads: 0,
      url: "http://127.0.0.1:4317/",
    });
    assert.equal(vercel.uploads, 0);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.projectDir, dir);
    assert.equal(seen[0]?.pick, "vite-react");
    assert.equal(seen[0]?.shape, "static");
    assert.equal(seen[0]?.outputDir, "dist");
    await absent(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a server site can still ask for a local preview", async () => {
  const dir = await makeProject(stack("next"));
  try {
    const outcome = await deploy("preview", dir, {
      yes,
      clients: {
        preview: {
          handoff: (input) => {
            assert.equal(input.shape, "node");
            assert.equal(input.outputDir, ".next");
            return Promise.resolve({ url: "http://127.0.0.1:4317/server" });
          },
        },
      },
    });
    assert.equal("url" in outcome && outcome.url, "http://127.0.0.1:4317/server");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preview without a handoff sends nothing", async () => {
  const dir = await makeProject(stack("astro"));
  try {
    await assert.rejects(
      () => deploy("preview", dir, { yes, clients: {} }),
      /A preview on this computer is not ready yet\. Nothing was sent\./,
    );
    const stackText = await readFile(path.join(dir, ".hitchhiker", "research", "STACK-DECISION.md"), "utf8");
    assert.match(stackText, /# STACK-DECISION/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
