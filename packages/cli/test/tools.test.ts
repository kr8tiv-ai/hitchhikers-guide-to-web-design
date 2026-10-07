import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { think, type ThinkRequest, type ThinkResult } from "@hitchhiker/engine";
import { runToolsCommand, type ToolOption } from "../src/commands/tools.ts";
import { runCli } from "../src/main.ts";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-tools-cli-"));
}

function recentIso(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function option(overrides: Partial<ToolOption> = {}): ToolOption {
  const name = overrides.name ?? "widget-kit";
  return {
    name,
    kind: "npm",
    why: "Embeds a booking form.",
    licence: "MIT",
    costNote: "No price listed by the registry.",
    maintenance: "published recently, 5000 downloads in the last week.",
    blocked: false,
    blockReasons: [],
    repositoryUrl: "https://github.com/acme/widget-kit",
    publishedAt: recentIso(),
    weeklyDownloads: 5000,
    hasInstallScript: false,
    installScriptExplanation: "",
    packageName: name,
    secretEnv: [],
    command: "",
    args: [],
    url: "",
    registryNote: "",
    userAsk: "",
    ...overrides,
  };
}

function writeShortlist(dir: string, options: ToolOption[]): void {
  const file = path.join(dir, ".hitchhiker", "tools", "shortlist.json");
  writeFileSync(file, JSON.stringify({ feature: "booking", options }), "utf8");
}

test("hh tools is wired and prints usage without a bang", async () => {
  const help = await runCli(["tools", "--help"]);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /hh tools search/);
  assert.match(help.stdout, /--yes/);
  assert.equal(help.stdout.includes("!"), false);

  const missing = await runCli(["tools"]);
  assert.equal(missing.exitCode, 2);
  assert.match(missing.stdout, /Missing tools command/);
});

test("search prints a blocked GPL option and does not call the network", async () => {
  const dir = tempDir();
  const publishedAt = recentIso();
  const fetchImpl: typeof fetch = async (input) => {
    const url = input instanceof URL ? input.href : String(input);
    if (url.includes("/v0/servers")) return Response.json({ servers: [] });
    if (url.includes("/-/v1/search")) {
      return Response.json({
        objects: [
          {
            package: {
              name: "gpl-widget",
              description: "A booking widget.",
              links: { repository: "https://github.com/acme/gpl-widget" },
            },
          },
        ],
      });
    }
    if (url.includes("/downloads/")) return Response.json({ downloads: 8000 });
    return Response.json({
      name: "gpl-widget",
      license: "GPL-3.0",
      repository: { url: "https://github.com/acme/gpl-widget" },
      "dist-tags": { latest: "1.0.0" },
      time: { modified: publishedAt, "1.0.0": publishedAt },
      versions: { "1.0.0": { license: "GPL-3.0", repository: { url: "https://github.com/acme/gpl-widget" } } },
    });
  };
  const rankingThink: typeof think = async <T,>(req: ThinkRequest<T>): Promise<ThinkResult<T>> => {
    assert.match(req.input, /booking/);
    const value = {
      options: [
        {
          name: "gpl-widget",
          kind: "npm",
          why: "Closest match for a booking form.",
          licence: "GPL-3.0",
          costNote: "No price listed by the registry.",
          maintenance: "published recently.",
        },
      ],
    } as T;
    return { value, raw: "{}", durationMs: 1, cassette: "live" };
  };
  try {
    const result = await runToolsCommand(
      ["search", "--project", dir, "--feature", "booking"],
      { fetchImpl, think: rankingThink },
    );
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /gpl-widget/);
    assert.match(result.stdout, /package license is denied/);
    assert.equal(result.stdout.includes("!"), false);
    const shortlist = readFileSync(path.join(dir, ".hitchhiker", "tools", "shortlist.json"), "utf8");
    assert.match(shortlist, /gpl-widget/);
    assert.equal(shortlist.includes("sk-"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install without a yes runs nothing", async () => {
  const dir = tempDir();
  await mkdir(path.join(dir, ".hitchhiker", "tools"), { recursive: true });
  writeShortlist(dir, [option()]);
  const runs: string[] = [];
  try {
    const result = await runToolsCommand(["install", "--project", dir, "--name", "widget-kit"], {
      run: async (cmd, args) => {
        runs.push([cmd, ...args].join(" "));
        return 0;
      },
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /Nothing was installed/);
    assert.match(result.stdout, /--yes/);
    assert.deepEqual(runs, []);
    assert.equal(existsSync(path.join(dir, "NOTICE")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("install --yes records NOTICE and a blocked package does not run", async () => {
  const dir = tempDir();
  await mkdir(path.join(dir, ".hitchhiker", "tools"), { recursive: true });
  writeShortlist(dir, [
    option(),
    option({
      name: "gpl-widget",
      packageName: "gpl-widget",
      licence: "GPL-3.0",
      repositoryUrl: "https://github.com/acme/gpl-widget",
      blocked: true,
      blockReasons: ["package license is denied"],
    }),
  ]);
  const runs: string[] = [];
  try {
    const installed = await runToolsCommand(
      ["install", "--project", dir, "--name", "widget-kit", "--yes"],
      {
        run: async (cmd, args) => {
          runs.push([cmd, ...args].join(" "));
          return 0;
        },
      },
    );
    assert.equal(installed.exitCode, 0);
    assert.match(installed.stdout, /Installed widget-kit/);
    assert.match(readFileSync(path.join(dir, "NOTICE"), "utf8"), /widget-kit/);
    assert.equal(runs.length, 1);
    assert.match(runs[0] ?? "", /pnpm add widget-kit/);

    const blocked = await runToolsCommand(
      ["install", "--project", dir, "--name", "gpl-widget", "--yes"],
      {
        run: async () => {
          runs.push("should-not-run");
          return 0;
        },
      },
    );
    assert.equal(blocked.exitCode, 1);
    assert.match(blocked.stdout, /package license is denied/);
    assert.equal(runs.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an MCP yes asks for the keychain and does not store the secret", async () => {
  const dir = tempDir();
  await mkdir(path.join(dir, ".hitchhiker", "tools"), { recursive: true });
  writeShortlist(dir, [
    option({
      name: "com.acme/booking-mcp",
      kind: "mcp",
      packageName: "booking-mcp",
      repositoryUrl: "https://github.com/acme/booking-mcp",
      command: "npx",
      args: ["-y", "booking-mcp"],
      secretEnv: ["BOOKING_TOKEN"],
      weeklyDownloads: 0,
    }),
  ]);
  try {
    const result = await runToolsCommand(
      ["install", "--project", dir, "--name", "com.acme/booking-mcp", "--yes"],
      { run: async () => 0 },
    );
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /keychain/);
    assert.equal(result.stdout.includes("!"), false);
    const toml = readFileSync(path.join(dir, ".grok", "config.toml"), "utf8");
    assert.match(toml, /\$\{BOOKING_TOKEN\}/);
    assert.equal(toml.includes("sk-"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
