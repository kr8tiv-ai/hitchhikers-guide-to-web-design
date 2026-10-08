import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { SpawnLike } from "@hitchhiker/engine";
import { deploy, cliPlan, listDeployFiles } from "../src/cli-run.ts";
import { readHostingerToken } from "../src/hostinger-api.ts";
import { hostingerMcpLaunchPlan, selectDeployTool } from "../src/hostinger-mcp.ts";
import type { McpClient, McpToolInfo } from "../src/hostinger-mcp.ts";
import type { Keychain } from "../src/hostinger-api.ts";
import { parseSiteShape, readSiteShape } from "../src/shape.ts";

const TOKEN = "hh-test-hostinger-token";

function stack(pick: string, why = "The record names the pick."): string {
  return `# STACK-DECISION\n\n## Pick\n\n${pick}\n\n## Why\n\n${why}\n`;
}

async function makeProject(markdown: string, files: Record<string, string> = {}): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-deploy-"));
  await mkdir(path.join(dir, ".hitchhiker", "research"), { recursive: true });
  await writeFile(path.join(dir, ".hitchhiker", "research", "STACK-DECISION.md"), markdown, "utf8");
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, "utf8");
  }
  return dir;
}

async function hostFile(dir: string): Promise<void> {
  await mkdir(path.join(dir, ".hitchhiker", "deploy"), { recursive: true });
  await writeFile(
    path.join(dir, ".hitchhiker", "deploy", "host.json"),
    JSON.stringify({
      domain: "milliways.example",
      username: "u123456789",
      archivePath: "site.zip",
    }),
    "utf8",
  );
}

function keychain(token: string | null, calls: { n: number }): Keychain {
  return {
    getPassword: () => {
      calls.n += 1;
      return Promise.resolve(token);
    },
  };
}

function spawnOk(stdout: string, calls: { requests: { command: string; args: readonly string[]; cwd: string }[] }): SpawnLike {
  return (request) => {
    calls.requests.push({ command: request.command, args: request.args, cwd: request.cwd });
    return Promise.resolve({
      status: 0,
      stdout,
      stderr: "",
      timedOut: false,
      errorCode: null,
    });
  };
}

function boomSpawn(): SpawnLike {
  return () => Promise.reject(new Error("spawn ran"));
}

function mcpClient(
  tools: readonly McpToolInfo[],
  onCall: (name: string, args: Record<string, unknown>) => unknown,
  calls: { names: string[] },
): McpClient {
  return {
    listTools: () => Promise.resolve(tools),
    callTool: (name, args) => {
      calls.names.push(name);
      if (!tools.some((tool) => tool.name === name)) {
        throw new Error(`unlisted tool ${name}`);
      }
      return Promise.resolve(onCall(name, args));
    },
  };
}

async function recordText(dir: string): Promise<string> {
  return readFile(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"), "utf8");
}

async function noRecord(dir: string): Promise<void> {
  await assert.rejects(() => access(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md")));
}

test("static stacks upload files and Node stacks need a server", () => {
  const astro = parseSiteShape(stack("astro", "Astro is the default marketing stack."));
  assert.equal(astro.shape, "static");
  assert.equal(astro.outputDir, "dist");
  const vite = parseSiteShape(stack("vite-react", "Vite plus React is a single-page world."));
  assert.equal(vite.shape, "static");
  assert.equal(vite.outputDir, "dist");
  const next = parseSiteShape(stack("next", "Next.js is the pick because the site type is app."));
  assert.equal(next.shape, "node");
  assert.equal(next.outputDir, ".next");
  const ssr = parseSiteShape(stack("astro", "Astro SSR renders each request on the server."));
  assert.equal(ssr.shape, "node");
  assert.equal(ssr.reason.includes("Astro SSR"), true);
  const exported = parseSiteShape(stack("next", "This Next.js site is a static export."));
  assert.equal(exported.shape, "static");
  assert.equal(exported.outputDir, "out");
  assert.throws(
    () => parseSiteShape(stack("astro", "output: static and also output: server")),
    /both static output and a server/,
  );
});

test("readSiteShape loads STACK-DECISION.md from the project", async () => {
  const dir = await makeProject(stack("vite-react"));
  try {
    const decision = await readSiteShape(dir);
    assert.equal(decision.pick, "vite-react");
    assert.equal(decision.shape, "static");
    await assert.rejects(() => readSiteShape(path.join(dir, "missing")), /STACK-DECISION.md is missing/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the file list for a Node project omits node_modules", async () => {
  const dir = await makeProject(stack("next"), {
    "package.json": "{}\n",
    "src/index.js": "export {}\n",
    "node_modules/left-pad/index.js": "module.exports = 1;\n",
  });
  try {
    const decision = await readSiteShape(dir);
    const files = await listDeployFiles(dir, decision);
    assert.equal(files.some((file) => file.path.includes("node_modules")), false);
    assert.equal(files.some((file) => file.path === "src/index.js"), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a declined yes does not spawn, call a host, or write a deploy record", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  const calls = { n: 0, names: [] as string[] };
  try {
    const outcome = await deploy("vercel", dir, {
      yes: () => Promise.resolve(false),
      spawnImpl: boomSpawn(),
      keychain: keychain(TOKEN, calls),
      mcp: mcpClient([{ name: "hosting_deploy-static-website" }], () => ({}), calls),
    });
    assert.deepEqual(outcome, { declined: true });
    assert.equal(calls.n, 0);
    assert.deepEqual(calls.names, []);
    await noRecord(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Hostinger MCP deploys with a tool that was listed", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  await hostFile(dir);
  const calls = { names: [] as string[], n: 0 };
  const tools: McpToolInfo[] = [
    { name: "hosting_deploy-static-website", description: "Deploy a static website from an archive." },
    { name: "agency-hosting_deploy-node-static-website", description: "Overwrite an Agency site." },
  ];
  try {
    const outcome = await deploy("hostinger", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: boomSpawn(),
      keychain: keychain(TOKEN, calls),
      mcp: mcpClient(tools, (name, args) => {
        assert.equal(name, "hosting_deploy-static-website");
        assert.equal(args.domain, "milliways.example");
        assert.equal(args.archivePath, "site.zip");
        assert.equal(args.removeArchive, false);
        return { id: "up-1" };
      }, calls),
    });
    assert.equal("url" in outcome && outcome.url, "https://milliways.example");
    assert.deepEqual(calls.names, ["hosting_deploy-static-website"]);
    assert.equal(calls.n, 0);
    const record = await recordText(dir);
    assert.match(record, /hostinger — static — completed — https:\/\/milliways\.example/);
    assert.match(record, /hosting_deploy-static-website/);
    assert.equal(record.includes(TOKEN), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a renamed static tool is used and a hardcoded missing name is not", () => {
  const tools = [{ name: "custom_static_ship", description: "Deploy the static website archive." }];
  const selected = selectDeployTool(tools, "static");
  assert.deepEqual(selected, { name: "custom_static_ship" });
  const agencyOnly = selectDeployTool(
    [{ name: "agency-hosting_deploy-node-static-website", description: "Deploy a static website." }],
    "static",
  );
  assert.equal("missing" in agencyOnly, true);
});

test("MCP falls back to the API when the tool list has no deploy tool", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  await hostFile(dir);
  const calls = { names: [] as string[], n: 0, posts: 0 };
  const tools = [{ name: "domains_list", description: "List domains." }];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = String(input);
    assert.equal(url.includes(TOKEN), false);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`);
    if (init?.method === "POST") calls.posts += 1;
    return Promise.resolve(new Response(JSON.stringify({ message: "Request accepted" }), { status: 200 }));
  };
  try {
    const outcome = await deploy("hostinger", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: boomSpawn(),
      keychain: keychain(TOKEN, calls),
      mcp: mcpClient(tools, () => {
        throw new Error("callTool ran");
      }, calls),
      fetchImpl,
    });
    assert.equal("url" in outcome && outcome.url, "https://milliways.example");
    assert.equal(calls.posts, 1);
    assert.deepEqual(calls.names, []);
    const record = await recordText(dir);
    assert.match(record, /queued/);
    assert.match(record, /No unlisted tool was called/);
    assert.equal(record.includes(TOKEN), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the API token stays in the keychain and a failed response does not echo it", async () => {
  const dir = await makeProject(stack("next"), {
    "package.json": "{}\n",
    "src/server.js": "export {}\n",
  });
  await hostFile(dir);
  const calls = { n: 0 };
  const fetchImpl: typeof fetch = () => {
    return Promise.resolve(new Response(`nope ${TOKEN}`, { status: 403 }));
  };
  try {
    await assert.rejects(
      () => deploy("hostinger", dir, {
        yes: () => Promise.resolve(true),
        spawnImpl: boomSpawn(),
        keychain: keychain(TOKEN, calls),
        fetchImpl,
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(TOKEN), false);
        assert.match(error.message, /403/);
        return true;
      },
    );
    assert.equal(calls.n, 1);
    await noRecord(dir);
    await assert.rejects(
      () => readHostingerToken({ getPassword: () => Promise.resolve("  ") }),
      /keychain/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Node API build is posted once and then polled", async () => {
  const dir = await makeProject(stack("next"), {
    "package.json": "{}\n",
    "src/server.js": "export {}\n",
  });
  await hostFile(dir);
  const calls = { n: 0, posts: [] as string[] };
  let gets = 0;
  const fetchImpl: typeof fetch = (input, init) => {
    const url = String(input);
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${TOKEN}`);
    if (init?.method === "POST") {
      calls.posts.push(url);
      return Promise.resolve(new Response(JSON.stringify({ uuid: "build-1", state: "pending" }), { status: 200 }));
    }
    gets += 1;
    const state = gets === 1 ? "running" : "completed";
    return Promise.resolve(
      new Response(JSON.stringify({ data: [{ uuid: "build-1", state }] }), { status: 200 }),
    );
  };
  try {
    const outcome = await deploy("hostinger", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: boomSpawn(),
      keychain: keychain(TOKEN, calls),
      fetchImpl,
    });
    assert.equal("url" in outcome && outcome.url, "https://milliways.example");
    assert.equal(calls.posts.length, 1);
    assert.match(calls.posts[0] ?? "", /\/nodejs\/builds$/);
    assert.equal(gets >= 2, true);
    const record = await recordText(dir);
    assert.match(record, /hostinger — node — completed/);
    assert.equal(record.includes(TOKEN), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Node MCP deploy polls the listed status tool and does not write twice", async () => {
  const dir = await makeProject(stack("next"), {
    "package.json": "{}\n",
    "src/server.js": "export {}\n",
  });
  await hostFile(dir);
  const calls = { names: [] as string[], n: 0 };
  let polls = 0;
  const tools: McpToolInfo[] = [
    { name: "hosting_deploy-js-application", description: "Deploy a JavaScript application." },
    { name: "hosting_list-js-deployments", description: "List javascript application deployments." },
  ];
  try {
    const outcome = await deploy("hostinger", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: boomSpawn(),
      keychain: keychain(TOKEN, calls),
      mcp: mcpClient(tools, (name) => {
        if (name === "hosting_deploy-js-application") return { uuid: "job-9", state: "pending" };
        polls += 1;
        return { data: [{ uuid: "job-9", state: polls < 2 ? "running" : "completed" }] };
      }, calls),
    });
    assert.equal("declined" in outcome, false);
    const writes = calls.names.filter((name) => name === "hosting_deploy-js-application");
    assert.deepEqual(writes, ["hosting_deploy-js-application"]);
    assert.equal(calls.names.includes("hosting_list-js-deployments"), true);
    assert.equal(calls.n, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("host.json refuses a token field", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  await mkdir(path.join(dir, ".hitchhiker", "deploy"), { recursive: true });
  await writeFile(
    path.join(dir, ".hitchhiker", "deploy", "host.json"),
    JSON.stringify({ domain: "milliways.example", username: "u1", archivePath: "site.zip", token: TOKEN }),
    "utf8",
  );
  const calls = { n: 0 };
  try {
    await assert.rejects(
      () => deploy("hostinger", dir, {
        yes: () => Promise.resolve(true),
        spawnImpl: boomSpawn(),
        keychain: keychain(TOKEN, calls),
        fetchImpl: () => Promise.reject(new Error("fetch ran")),
      }),
      /must not contain a token/,
    );
    assert.equal(calls.n, 0);
    await noRecord(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Vercel, Netlify, and Wrangler run after yes and capture the URL", async () => {
  const dir = await makeProject(stack("vite-react"), { "dist/index.html": "<title>Milliways</title>" });
  const outputDir = path.resolve(dir, "dist");
  try {
    const vercelCalls = { requests: [] as { command: string; args: readonly string[]; cwd: string }[] };
    const vercel = await deploy("vercel", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: spawnOk("Preview: https://milliways-preview.vercel.app\nhttps://milliways.vercel.app", vercelCalls),
      keychain: keychain(TOKEN, { n: 0 }),
    });
    assert.equal("url" in vercel && vercel.url, "https://milliways.vercel.app");
    assert.equal(vercelCalls.requests[0]?.command, "vercel");
    assert.deepEqual(vercelCalls.requests[0]?.args, ["deploy", "--prebuilt"]);
    assert.equal(vercelCalls.requests.length, 1);

    const netlifyCalls = { requests: [] as { command: string; args: readonly string[]; cwd: string }[] };
    const netlify = await deploy("netlify", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: spawnOk("Website URL: https://milliways.netlify.app", netlifyCalls),
      keychain: keychain(TOKEN, { n: 0 }),
    });
    assert.equal("url" in netlify && netlify.url, "https://milliways.netlify.app");
    assert.deepEqual(netlifyCalls.requests[0]?.args, ["deploy", "--dir", outputDir]);

    const cloudflareCalls = { requests: [] as { command: string; args: readonly string[]; cwd: string }[] };
    const cloudflare = await deploy("cloudflare", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: spawnOk("Deployment complete. https://milliways.pages.dev", cloudflareCalls),
      keychain: keychain(TOKEN, { n: 0 }),
    });
    assert.equal("url" in cloudflare && cloudflare.url, "https://milliways.pages.dev");
    assert.deepEqual(cloudflareCalls.requests[0]?.args, ["pages", "deploy", outputDir]);
    assert.deepEqual(cliPlan("cloudflare", outputDir).args, ["pages", "deploy", outputDir]);

    const record = await recordText(dir);
    assert.match(record, /vercel — static — completed — https:\/\/milliways\.vercel\.app/);
    assert.match(record, /netlify — static — completed/);
    assert.match(record, /cloudflare — static — completed — https:\/\/milliways\.pages\.dev/);
    assert.equal(record.includes(TOKEN), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a non-zero CLI exit writes no deploy record", async () => {
  const dir = await makeProject(stack("astro"), { "dist/index.html": "<title>Milliways</title>" });
  try {
    await assert.rejects(
      () => deploy("netlify", dir, {
        yes: () => Promise.resolve(true),
        spawnImpl: () => Promise.resolve({
          status: 1,
          stdout: "",
          stderr: "refused",
          timedOut: false,
          errorCode: null,
        }),
        keychain: { getPassword: () => Promise.reject(new Error("keychain ran")) },
      }),
      /netlify exited 1/,
    );
    await noRecord(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Node is rejected on Netlify and Cloudflare and uses Vercel prebuilt", async () => {
  const dir = await makeProject(stack("next"), {
    "package.json": "{}\n",
    "src/server.js": "export {}\n",
  });
  try {
    let spawned = 0;
    await assert.rejects(
      () => deploy("netlify", dir, {
        yes: () => Promise.resolve(true),
        spawnImpl: () => {
          spawned += 1;
          return Promise.reject(new Error("spawn ran"));
        },
        keychain: { getPassword: () => Promise.reject(new Error("keychain ran")) },
      }),
      /Netlify template is not wired/,
    );
    await assert.rejects(
      () => deploy("cloudflare", dir, {
        yes: () => Promise.resolve(true),
        spawnImpl: () => {
          spawned += 1;
          return Promise.reject(new Error("spawn ran"));
        },
        keychain: { getPassword: () => Promise.reject(new Error("keychain ran")) },
      }),
      /Cloudflare template is not wired/,
    );
    assert.equal(spawned, 0);
    await noRecord(dir);

    const calls = { requests: [] as { command: string; args: readonly string[]; cwd: string }[] };
    const outcome = await deploy("vercel", dir, {
      yes: () => Promise.resolve(true),
      spawnImpl: spawnOk("https://milliways-next.vercel.app", calls),
      keychain: { getPassword: () => Promise.reject(new Error("keychain ran")) },
    });
    assert.equal("url" in outcome && outcome.url, "https://milliways-next.vercel.app");
    assert.deepEqual(calls.requests[0]?.args, ["deploy", "--prebuilt"]);
    assert.equal(calls.requests.length, 1);
    const record = await recordText(dir);
    assert.match(record, /vercel — node — completed — https:\/\/milliways-next\.vercel\.app/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the official Hostinger MCP launch plan is hosted OAuth or npx", () => {
  const plan = hostingerMcpLaunchPlan();
  assert.equal(plan.url, "https://mcp.hostinger.com");
  assert.equal(plan.command, "npx");
  assert.deepEqual(plan.args, ["-y", "@hostinger/mcp"]);
});
