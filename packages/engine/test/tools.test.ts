import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { think, type ThinkRequest, type ThinkResult } from "../src/ai/think.ts";
import {
  discoverTools,
  RegistryUnreachableError,
} from "../src/tools/discover.ts";
import { denyInstallPolicy, installTool, mcpServerKey, secretAsk } from "../src/tools/install.ts";
import {
  WEEKLY_DOWNLOAD_FLOOR,
  checkLegitimacy,
  type RegistryMeta,
  type ToolOption,
} from "../src/tools/legitimacy.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function recentIso(now = Date.now()): string {
  return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-tools-"));
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

function metaFor(opt: ToolOption, overrides: Partial<RegistryMeta> = {}): RegistryMeta {
  return {
    name: opt.name,
    licence: opt.licence,
    repositoryUrl: opt.repositoryUrl,
    publishedAt: opt.publishedAt,
    weeklyDownloads: opt.weeklyDownloads,
    hasInstallScript: opt.hasInstallScript,
    installScriptExplanation: opt.installScriptExplanation,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function hrefOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function packument(name: string, licence: string, repo: string, publishedAt: string, scripts?: Record<string, string>): unknown {
  return {
    name,
    license: licence,
    repository: { type: "git", url: `git+${repo}.git` },
    "dist-tags": { latest: "1.2.0" },
    time: { modified: publishedAt, "1.2.0": publishedAt },
    versions: {
      "1.2.0": {
        license: licence,
        repository: { type: "git", url: repo },
        ...(scripts === undefined ? {} : { scripts }),
      },
    },
  };
}

test("discoverTools queries the real registries and ranks with think()", async () => {
  const publishedAt = recentIso();
  const seen: string[] = [];
  let request: ThinkRequest<unknown> | undefined;
  const fetchImpl: typeof fetch = async (input) => {
    const url = hrefOf(input);
    seen.push(url);
    if (url.startsWith("https://registry.modelcontextprotocol.io/v0/servers")) {
      return jsonResponse({
        servers: [
          {
            server: {
              name: "com.acme/booking-mcp",
              description: "Booking calendar for a service business.",
              repository: { url: "https://github.com/acme/booking-mcp", source: "github" },
              version: "1.2.0",
              packages: [
                {
                  registryType: "npm",
                  identifier: "booking-mcp",
                  version: "1.2.0",
                  runtimeHint: "npx",
                  runtimeArguments: [{ type: "positional", value: "-y" }],
                  environmentVariables: [{ name: "BOOKING_TOKEN", isSecret: true, isRequired: true }],
                },
              ],
            },
            _meta: {
              "io.modelcontextprotocol.registry/official": {
                status: "active",
                publishedAt,
                updatedAt: publishedAt,
                isLatest: true,
              },
            },
          },
        ],
      });
    }
    if (url.startsWith("https://registry.npmjs.org/-/v1/search")) {
      return jsonResponse({
        objects: [
          {
            package: {
              name: "gpl-widget",
              description: "A booking widget.",
              links: { repository: "https://github.com/acme/gpl-widget" },
              date: publishedAt,
            },
            score: { detail: { maintenance: 0.4 } },
          },
          {
            package: {
              name: "booking-widget",
              description: "Embed a booking form.",
              links: { repository: "https://github.com/acme/booking-widget" },
            },
            score: { detail: { maintenance: 0.91 } },
          },
        ],
      });
    }
    if (url.includes("/downloads/point/last-week/")) {
      return jsonResponse({ downloads: 5000 });
    }
    if (url.startsWith("https://registry.npmjs.org/")) {
      const name = decodeURIComponent(url.slice("https://registry.npmjs.org/".length));
      const licence = name === "gpl-widget" ? "GPL-3.0" : "MIT";
      const repo = `https://github.com/acme/${name}`;
      return jsonResponse(packument(name, licence, repo, publishedAt));
    }
    return jsonResponse({ error: "missing" }, 404);
  };
  const rankingThink: typeof think = async <T>(req: ThinkRequest<T>): Promise<ThinkResult<T>> => {
    request = req;
    const value = {
      options: [
        {
          name: "gpl-widget",
          kind: "npm",
          why: "Closest match for the booking form.",
          licence: "MIT",
          costNote: "$12 a month",
          maintenance: "stale",
        },
        {
          name: "booking-widget",
          kind: "npm",
          why: "Maintained embed with a permissive licence.",
          licence: "MIT",
          costNote: "free",
          maintenance: "fine",
        },
        {
          name: "left-pad",
          kind: "npm",
          why: "Invented by the model.",
          licence: "MIT",
          costNote: "none",
          maintenance: "none",
        },
        {
          name: "com.acme/booking-mcp",
          kind: "mcp",
          why: "Registry server for the same booking job.",
          licence: "MIT",
          costNote: "none",
          maintenance: "none",
        },
      ],
    } as T;
    return { value, raw: "{}", durationMs: 1, cassette: "live" };
  };

  const options = await discoverTools("booking widget", { fetchImpl, think: rankingThink });
  assert.ok(seen.some((url) => url.startsWith("https://registry.modelcontextprotocol.io/v0/servers")));
  assert.ok(seen.some((url) => url.startsWith("https://registry.npmjs.org/-/v1/search")));
  assert.ok(seen.some((url) => url.includes("booking+widget") || url.includes("booking%20widget")));
  assert.ok(request);
  assert.equal(request.schema?.properties?.options?.maxItems, 5);
  const required = request.schema?.properties?.options?.items?.required;
  assert.ok(required?.includes("name"));
  assert.ok(required?.includes("kind"));
  assert.ok(required?.includes("why"));
  assert.ok(required?.includes("licence"));
  assert.ok(required?.includes("costNote"));
  assert.ok(required?.includes("maintenance"));

  assert.equal(options.length, 3);
  assert.equal(options[0]?.name, "gpl-widget");
  assert.equal(options[0]?.blocked, true);
  assert.ok(options[0]?.blockReasons.includes("package license is denied"));
  assert.equal(options[0]?.licence, "GPL-3.0");
  assert.equal(options[0]?.costNote, "No price listed by the registry.");
  assert.equal(options[0]?.maintenance.includes("stale"), false);
  assert.equal(options.some((item) => item.name === "left-pad"), false);

  const healthy = options.find((item) => item.name === "booking-widget");
  assert.ok(healthy);
  assert.equal(healthy.blocked, false);
  assert.deepEqual(healthy.blockReasons, []);
  assert.equal(healthy.why, "Maintained embed with a permissive licence.");

  const server = options.find((item) => item.name === "com.acme/booking-mcp");
  assert.ok(server);
  assert.equal(server.kind, "mcp");
  assert.deepEqual(server.secretEnv, ["BOOKING_TOKEN"]);
  assert.equal(server.command, "npx");
  assert.deepEqual(server.args, ["-y", "booking-mcp"]);
  assert.equal(server.blocked, false);
});

test("a banned why falls back to the registry description", async () => {
  const publishedAt = recentIso();
  const fetchImpl: typeof fetch = async (input) => {
    const url = hrefOf(input);
    if (url.includes("/v0/servers")) return jsonResponse({ servers: [] });
    if (url.includes("/-/v1/search")) {
      return jsonResponse({
        objects: [
          {
            package: {
              name: "booking-widget",
              description: "Embed a booking form.",
              links: { repository: "https://github.com/acme/booking-widget" },
            },
          },
        ],
      });
    }
    if (url.includes("/downloads/")) return jsonResponse({ downloads: 5000 });
    return jsonResponse(packument("booking-widget", "MIT", "https://github.com/acme/booking-widget", publishedAt));
  };
  const rankingThink: typeof think = async <T,>(): Promise<ThinkResult<T>> => {
    const value = {
      options: [
        {
          name: "booking-widget",
          kind: "npm",
          why: "This will elevate the booking form.",
          licence: "MIT",
          costNote: "No price listed by the registry.",
          maintenance: "published recently.",
        },
      ],
    } as T;
    return { value, raw: "{}", durationMs: 1, cassette: "live" };
  };
  const options = await discoverTools("booking", { fetchImpl, think: rankingThink });
  assert.equal(options[0]?.why, "Embed a booking form.");
});

test("both registries unreachable offers manual options", async () => {
  const fetchImpl: typeof fetch = async () => {
    throw new Error("offline");
  };
  const rankingThink: typeof think = async () => {
    throw new Error("think should not run");
  };
  await assert.rejects(
    () => discoverTools("booking widget", { fetchImpl, think: rankingThink }),
    (error: unknown) => {
      assert.ok(error instanceof RegistryUnreachableError);
      assert.match(error.message, /could not be reached/);
      assert.match(error.message, /keychain/);
      assert.equal(error.message.includes("!"), false);
      assert.equal(error.manualOptions.length, 3);
      assert.match(error.manualOptions[1] ?? "", /MPL-2\.0/);
      return true;
    },
  );
});

test("one registry down still returns the other and says so", async () => {
  const publishedAt = recentIso();
  const fetchImpl: typeof fetch = async (input) => {
    const url = hrefOf(input);
    if (url.includes("/v0/servers")) throw new Error("mcp down");
    if (url.includes("/-/v1/search")) {
      return jsonResponse({
        objects: [
          {
            package: {
              name: "booking-widget",
              description: "Embed a booking form.",
              links: { repository: "https://github.com/acme/booking-widget" },
            },
          },
        ],
      });
    }
    if (url.includes("/downloads/")) return jsonResponse({ downloads: 5000 });
    return jsonResponse(packument("booking-widget", "MIT", "https://github.com/acme/booking-widget", publishedAt));
  };
  const rankingThink: typeof think = async <T,>(): Promise<ThinkResult<T>> => {
    const value = {
      options: [
        {
          name: "booking-widget",
          kind: "npm",
          why: "Embed a booking form.",
          licence: "MIT",
          costNote: "No price listed by the registry.",
          maintenance: "kept",
        },
      ],
    } as T;
    return { value, raw: "{}", durationMs: 1, cassette: "live" };
  };
  const options = await discoverTools("booking", { fetchImpl, think: rankingThink });
  assert.equal(options.length, 1);
  assert.match(options[0]?.registryNote ?? "", /MCP Registry could not be reached/);
});

test("exact name match is required", () => {
  const opt = option();
  const gate = checkLegitimacy(opt, metaFor(opt, { name: "widget-kit-typo" }));
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes("name does not match the registry record"));
});

test("licence allow-list accepts the Guide set and blocks GPL, AGPL, and unknown", () => {
  const allowed = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "MPL-2.0", "Unlicense", "Zlib", "0BSD", "MIT OR Apache-2.0"];
  for (const licence of allowed) {
    const opt = option({ licence });
    const gate = checkLegitimacy(opt, metaFor(opt));
    assert.equal(gate.ok, true, licence);
  }
  for (const licence of ["GPL-3.0", "AGPL-3.0-only", "GNU General Public License v3.0", "MIT AND GPL-3.0"]) {
    const opt = option({ licence });
    const gate = checkLegitimacy(opt, metaFor(opt));
    assert.equal(gate.ok, false, licence);
    assert.ok(gate.reasons.includes("package license is denied"), licence);
  }
  const lgpl = option({ licence: "LGPL-2.1" });
  const lgplGate = checkLegitimacy(lgpl, metaFor(lgpl));
  assert.equal(lgplGate.ok, false);
  assert.ok(lgplGate.reasons.includes("licence is not on the allow-list"));
  assert.equal(lgplGate.reasons.includes("package license is denied"), false);
});

test("repository URL must be present and must match the package record", () => {
  const opt = option({ repositoryUrl: "git+https://github.com/acme/widget-kit.git" });
  const matched = checkLegitimacy(opt, metaFor(opt, { repositoryUrl: "https://github.com/acme/widget-kit" }));
  assert.equal(matched.ok, true);

  const missing = checkLegitimacy(opt, metaFor(opt, { repositoryUrl: "" }));
  assert.ok(missing.reasons.includes("repository URL is missing"));

  const malformed = checkLegitimacy(opt, metaFor(opt, { repositoryUrl: "not a url" }));
  assert.ok(malformed.reasons.includes("repository URL is not a repository URL"));

  const mismatch = checkLegitimacy(opt, metaFor(opt, { repositoryUrl: "https://github.com/other/widget-kit" }));
  assert.ok(mismatch.reasons.includes("repository URL does not match the package"));
});

test("last publish must be within 18 months", () => {
  const now = Date.parse("2026-10-07T00:00:00.000Z");
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 18);
  const fresh = option({ publishedAt: cutoff.toISOString() });
  assert.equal(checkLegitimacy(fresh, metaFor(fresh), now).ok, true);

  const staleAt = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const stale = option({ publishedAt: staleAt });
  const gate = checkLegitimacy(stale, metaFor(stale), now);
  assert.ok(gate.reasons.includes("last publish is older than 18 months"));

  const missing = option({ publishedAt: "yesterday" });
  assert.ok(checkLegitimacy(missing, metaFor(missing), now).reasons.includes("last publish date is missing"));
});

test("weekly downloads must meet the floor for npm packages", () => {
  const low = option({ weeklyDownloads: WEEKLY_DOWNLOAD_FLOOR - 1 });
  const lowGate = checkLegitimacy(low, metaFor(low));
  assert.ok(lowGate.reasons.some((reason) => reason.includes("below the floor")));

  const enough = option({ weeklyDownloads: WEEKLY_DOWNLOAD_FLOOR });
  assert.equal(checkLegitimacy(enough, metaFor(enough)).ok, true);

  const server = option({ kind: "mcp", weeklyDownloads: 0, packageName: "booking-mcp" });
  assert.equal(checkLegitimacy(server, metaFor(server)).ok, true);
});

test("an install script must be explained", () => {
  const hidden = option({ hasInstallScript: true, installScriptExplanation: "" });
  assert.ok(checkLegitimacy(hidden, metaFor(hidden)).reasons.includes("install script is not explained"));

  const explained = option({
    hasInstallScript: true,
    installScriptExplanation: "Rebuilds a native addon from published source.",
  });
  assert.equal(checkLegitimacy(explained, metaFor(explained)).ok, true);
});

test("a typo-squat of a popular name is rejected", () => {
  const squat = option({
    name: "expresss",
    packageName: "expresss",
    repositoryUrl: "https://github.com/acme/expresss",
  });
  const gate = checkLegitimacy(squat, metaFor(squat));
  assert.equal(gate.ok, false);
  assert.ok(gate.reasons.includes("name is an edit-distance typo of express"));

  const real = option({
    name: "express",
    packageName: "express",
    repositoryUrl: "https://github.com/expressjs/express",
  });
  assert.equal(checkLegitimacy(real, metaFor(real)).reasons.some((reason) => reason.includes("typo")), false);

  const neighbor = option({
    name: "preact",
    packageName: "preact",
    repositoryUrl: "https://github.com/preactjs/preact",
  });
  assert.equal(checkLegitimacy(neighbor, metaFor(neighbor)).reasons.some((reason) => reason.includes("typo")), false);
});

test("a declined confirm runs nothing", async () => {
  const dir = tempDir();
  const runs: string[][] = [];
  let confirmed = 0;
  try {
    const outcome = await installTool(option(), dir, {
      confirm: async () => {
        confirmed += 1;
        return false;
      },
      run: async (cmd, args) => {
        runs.push([cmd, ...args]);
        return 0;
      },
    });
    assert.equal(outcome, "declined");
    assert.equal(confirmed, 1);
    assert.deepEqual(runs, []);
    await assert.rejects(readFile(path.join(dir, "NOTICE"), "utf8"));
    await assert.rejects(readFile(path.join(dir, ".grok", "config.toml"), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a yes installs an npm package and records it in NOTICE", async () => {
  const dir = tempDir();
  const runs: string[][] = [];
  try {
    const opt = option({ licence: "MPL-2.0" });
    const outcome = await installTool(opt, dir, {
      confirm: async () => true,
      run: async (cmd, args) => {
        runs.push([cmd, ...args]);
        return 0;
      },
    });
    assert.equal(outcome, "installed");
    assert.deepEqual(runs, [["pnpm", "add", "widget-kit", "--dir", path.resolve(dir)]]);
    const notice = await readFile(path.join(dir, "NOTICE"), "utf8");
    assert.match(notice, /^widget-kit$/m);
    assert.match(notice, /License field: MPL-2\.0/);
    assert.match(notice, /file-level copyleft/);
    assert.match(notice, /https:\/\/github.com\/acme\/widget-kit/);
    assert.equal(notice.includes("!"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GPL and a failed pnpm add do not write NOTICE", async () => {
  const dir = tempDir();
  let runs = 0;
  let confirms = 0;
  try {
    const gpl = option({ licence: "GPL-3.0" });
    const blocked = await installTool(gpl, dir, {
      confirm: async () => {
        confirms += 1;
        return true;
      },
      run: async () => {
        runs += 1;
        return 0;
      },
    });
    assert.equal(blocked, "blocked");
    assert.equal(confirms, 0);
    assert.equal(runs, 0);
    assert.ok(gpl.blockReasons.includes("package license is denied"));

    const failing = option();
    const failed = await installTool(failing, dir, {
      confirm: async () => true,
      run: async () => {
        runs += 1;
        return 1;
      },
    });
    assert.equal(failed, "blocked");
    assert.equal(runs, 1);
    await assert.rejects(readFile(path.join(dir, "NOTICE"), "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an MCP install writes project config without secrets and records NOTICE", async () => {
  const dir = tempDir();
  let runs = 0;
  try {
    const opt = option({
      name: "com.acme/booking-mcp",
      kind: "mcp",
      packageName: "booking-mcp",
      repositoryUrl: "https://github.com/acme/booking-mcp",
      command: "npx",
      args: ["-y", "booking-mcp"],
      secretEnv: ["BOOKING_TOKEN"],
      weeklyDownloads: 0,
    });
    const outcome = await installTool(opt, dir, {
      confirm: async () => true,
      run: async () => {
        runs += 1;
        return 0;
      },
    });
    assert.equal(outcome, "installed");
    assert.equal(runs, 0);
    assert.match(opt.userAsk, /BOOKING_TOKEN/);
    assert.match(opt.userAsk, /keychain/);
    const toml = await readFile(path.join(dir, ".grok", "config.toml"), "utf8");
    assert.match(toml, /\[mcp_servers\.booking-mcp\]/);
    assert.match(toml, /command = "npx"/);
    assert.match(toml, /\$\{BOOKING_TOKEN\}/);
    assert.equal(toml.includes("sk-"), false);
    assert.match(toml, /not written to a file/);
    const notice = await readFile(path.join(dir, "NOTICE"), "utf8");
    assert.match(notice, /com\.acme\/booking-mcp/);
    assert.match(notice, /Secret names, values not stored: BOOKING_TOKEN/);
    assert.equal(mcpServerKey("com.acme/booking-mcp"), "booking-mcp");
    assert.match(secretAsk(["BOOKING_TOKEN"]), /environment or the OS keychain/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a raw secret or a denied command is blocked before confirm", async () => {
  const dir = tempDir();
  let confirms = 0;
  let runs = 0;
  const deps = {
    confirm: async () => {
      confirms += 1;
      return true;
    },
    run: async () => {
      runs += 1;
      return 0;
    },
  };
  try {
    const leaked = option({
      kind: "mcp",
      name: "com.acme/booking-mcp",
      packageName: "booking-mcp",
      repositoryUrl: "https://github.com/acme/booking-mcp",
      command: "npx",
      args: ["-y", "booking-mcp", "sk-abcdefghijklmnopqrst"],
      weeklyDownloads: 0,
    });
    const secretBlocked = await installTool(leaked, dir, deps);
    assert.equal(secretBlocked, "blocked");
    assert.ok(leaked.blockReasons.some((reason) => reason.includes("keychain")));
    await assert.rejects(readFile(path.join(dir, ".grok", "config.toml"), "utf8"));

    const push = option({
      kind: "mcp",
      name: "com.acme/booking-mcp",
      packageName: "booking-mcp",
      repositoryUrl: "https://github.com/acme/booking-mcp",
      command: "git",
      args: ["push", "origin", "main"],
      weeklyDownloads: 0,
    });
    const pushBlocked = await installTool(push, dir, deps);
    assert.equal(pushBlocked, "blocked");
    assert.ok(push.blockReasons.includes("git push is denied"));
    assert.equal(confirms, 0);
    assert.equal(runs, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("denyInstallPolicy uses the 097 deny reasons", () => {
  const policy = readFileSync(path.join(repoRoot, "packages", "orchestrator", "src", "policy.ts"), "utf8");
  const source = readFileSync(new URL("../src/tools/install.ts", import.meta.url), "utf8");
  const discover = readFileSync(new URL("../src/tools/discover.ts", import.meta.url), "utf8");
  const reasons = [
    "git push is denied",
    "git remote add is denied",
    "gh repo create is denied",
    "deploy command is denied",
    "deleting a filesystem root is denied",
    "deleting the project root is denied",
    "legitimacy record missing",
    "package repo is empty",
    "package license is denied",
    "package name does not match the legitimacy record",
  ];
  for (const reason of reasons) {
    assert.ok(policy.includes(reason), reason);
    assert.ok(source.includes(reason), reason);
  }
  assert.match(discover, /from "\.\.\/ai\/think\.ts"/);
  assert.match(discover, /deps\.think/);

  const root = tempDir();
  try {
    assert.equal(denyInstallPolicy(["git", "push"], root, undefined).reason, "git push is denied");
    assert.equal(denyInstallPolicy(["vercel", "deploy"], root, undefined).reason, "deploy command is denied");
    assert.equal(denyInstallPolicy(["rm", "-rf", "/"], root, undefined).reason, "deleting a filesystem root is denied");
    assert.equal(
      denyInstallPolicy(["pnpm", "add", "widget-kit"], root, undefined).reason,
      "legitimacy record missing",
    );
    assert.equal(
      denyInstallPolicy(["pnpm", "add", "widget-kit"], root, {
        name: "widget-kit",
        license: "MIT",
        repo: "",
      }).reason,
      "package repo is empty",
    );
    assert.equal(
      denyInstallPolicy(["pnpm", "add", "widget-kit"], root, {
        name: "widget-kit",
        license: "AGPL-3.0",
        repo: "https://github.com/acme/widget-kit",
      }).reason,
      "package license is denied",
    );
    assert.equal(
      denyInstallPolicy(["pnpm", "add", "other"], root, {
        name: "widget-kit",
        license: "MIT",
        repo: "https://github.com/acme/widget-kit",
      }).reason,
      "package name does not match the legitimacy record",
    );
    assert.equal(
      denyInstallPolicy(["pnpm", "add", "widget-kit", "--dir", root], root, {
        name: "widget-kit",
        license: "MIT",
        repo: "https://github.com/acme/widget-kit",
      }).decision,
      "allow",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
