/**
 * hh so-long. The ship gate runs before any host. A red or stale check,
 * a missing yes, and an omitted host write nothing and call no adapter.
 * Preview uses an injected handoff, so the test does not open a port.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../src/main.ts";
import { SO_LONG_USAGE, type SoLongClients, type SoLongDeps } from "../src/commands/so-long.ts";
import { removeTempDir } from "./remove-temp.ts";

const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PREVIEW_URL = "http://127.0.0.1:49152/";
const BLOCKED = "The page is missing a font a reader needs.";

const GATE_IDS = [
  "fonts",
  "type-scale",
  "spacing",
  "color",
  "imagery",
  "motion",
  "3d",
  "copy",
  "device",
  "accessibility",
  "speed",
] as const;

const skillPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "grok-plugin",
  "skills",
  "hh-so-long",
  "SKILL.md",
);

function tempProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-so-long-"));
}

function writeHosting(dir: string, hosting: string): void {
  const folder = path.join(dir, ".hitchhiker");
  mkdirSync(folder, { recursive: true });
  // Idle keeps the phase lock on the launch step. A pending status would stop so-long before the host question.
  writeFileSync(
    path.join(folder, "brief-pending.json"),
    `${JSON.stringify({ status: "idle", draft: { hosting } }, null, 2)}\n`,
    "utf8",
  );
}

function writeStack(dir: string): void {
  const folder = path.join(dir, ".hitchhiker", "research");
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    path.join(folder, "STACK-DECISION.md"),
    "# STACK-DECISION\n\n## Pick\n\nvite-react\n\n## Why\n\nThe record names the pick.\n",
    "utf8",
  );
}

function writeGates(dir: string, head: string, blocker: { id: string; reason: string } | null = null): void {
  const results = GATE_IDS.map((id) => ({
    id,
    status: blocker !== null && blocker.id === id ? "BLOCKER" : "PASS",
    reason: blocker !== null && blocker.id === id ? blocker.reason : "This check is in good shape.",
    evidence: {},
  }));
  const file = path.join(dir, ".hitchhiker", "qa", "GATES.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ head, ranAt: "2026-10-21T12:00:00.000Z", results }, null, 2)}\n`,
    "utf8",
  );
}

function armed(calls: string[]): SoLongClients {
  const bump = (name: string) => (): Promise<never> => {
    calls.push(name);
    return Promise.reject(new Error("adapter called"));
  };
  return {
    hostinger: {
      uploadStatic: bump("hostinger"),
      uploadNode: bump("hostinger"),
      poll: bump("hostinger"),
    },
    vercel: { upload: bump("vercel"), poll: bump("vercel") },
    netlify: { upload: bump("netlify"), poll: bump("netlify") },
    cloudflare: { upload: bump("cloudflare"), poll: bump("cloudflare") },
    preview: { handoff: bump("preview") },
  };
}

function run(
  dir: string,
  args: readonly string[],
  extra: SoLongDeps = {},
): Promise<{ exitCode: number; stdout: string; stderr?: string }> {
  return runCli(["so-long", "--project", dir, ...args], undefined, { soLong: { head: HEAD, ...extra } });
}

function assertQuiet(stdout: string): void {
  assert.equal(stdout.includes("!"), false);
  assert.equal(stdout.includes("\u2014"), false);
  assert.equal(stdout.includes("HH_LIVE"), false);
  assert.equal(stdout.includes("4175"), false);
}

function assertUnwritten(dir: string): void {
  assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md")), false);
  assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "preview.zip")), false);
  assert.equal(existsSync(path.join(dir, ".hitchhiker", "hostinger-yes.json")), false);
}

test("a red gate exits non-zero and calls no adapter", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeGates(dir, HEAD, { id: "fonts", reason: BLOCKED });
    const outcome = await run(dir, ["--host", "preview", "--yes"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /missing a font a reader needs/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("a stale head exits non-zero and calls no adapter", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeGates(dir, OTHER);
    const outcome = await run(dir, ["--host", "hostinger", "--yes"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /different version of this site/);
    assert.match(outcome.stdout, /launch stays closed/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("a declined yes writes nothing", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const outcome = await run(dir, ["--host", "preview"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /Nothing was written/);
    assert.match(outcome.stdout, /preview on this computer/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("preview builds, hands off to the injected client, and records it", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const clients = armed(calls);
    clients.preview = {
      handoff: (input) => {
        calls.push("preview");
        assert.equal(path.resolve(input.projectDir), path.resolve(dir));
        assert.equal(input.shape, "static");
        assert.equal(input.outputDir, "dist");
        return Promise.resolve({ url: PREVIEW_URL });
      },
    };
    const outcome = await run(dir, ["--host", "preview", "--yes"], {
      clients,
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 0);
    assert.deepEqual(calls, ["build", "preview"]);
    assert.match(outcome.stdout, /The preview is open on this computer/);
    assert.match(outcome.stdout, /127\.0\.0\.1:49152/);
    assertQuiet(outcome.stdout);
    const record = readFileSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"), "utf8");
    assert.match(record, /preview/);
    assert.match(record, /127\.0\.0\.1:49152/);
    assert.match(record, /## Post-check/);
    assert.match(outcome.stdout, /The live check did not run, because no checker was connected/);
    assert.match(record, /no checker was connected/);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "deploy", "preview.zip")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "hostinger-yes.json")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("an omitted host recommends Hostinger and asks", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const extra: SoLongDeps = {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    };
    for (const args of [[], ["--yes"]] as const) {
      const outcome = await run(dir, args, extra);
      assert.equal(outcome.exitCode, 2);
      assert.match(outcome.stdout, /Hostinger is the suggested host/);
      assert.match(outcome.stdout, /preview on this computer/);
      assert.match(outcome.stdout, /--host hostinger --yes/);
      assert.match(outcome.stdout, /--host preview --yes/);
      assert.match(outcome.stdout, /Nothing was written/);
      assertQuiet(outcome.stdout);
    }
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("a brief that names Cloudflare Pages suggests that host", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    writeHosting(dir, "No web address yet. Use paradisefound.farm, hosted on Cloudflare Pages (free tier).");
    const outcome = await run(dir, [], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /Cloudflare Pages is the suggested host/);
    assert.match(outcome.stdout, /free tier/);
    assert.match(outcome.stdout, /--host cloudflare --yes/);
    assert.match(outcome.stdout, /--host preview --yes/);
    assert.equal(outcome.stdout.includes("Hostinger is the suggested host"), false);
    assert.match(outcome.stdout, /Nothing was written/);
    assertQuiet(outcome.stdout);
    const hostAt = outcome.stdout.indexOf("Cloudflare Pages is the suggested host");
    const costAt = outcome.stdout.indexOf("free tier");
    assert.ok(hostAt >= 0 && costAt > hostAt);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("a brief that names GitHub Pages suggests it and offers only the preview flag", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    writeHosting(dir, "The farm site lives on GitHub Pages.");
    const outcome = await run(dir, [], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /GitHub Pages is the suggested host/);
    assert.match(outcome.stdout, /free tier/);
    assert.match(outcome.stdout, /--host preview --yes/);
    assert.equal(/--host github/.test(outcome.stdout), false);
    assert.equal(outcome.stdout.includes("Hostinger is the suggested host"), false);
    assert.match(outcome.stdout, /Nothing was written/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("a folder with no saved version stays closed and calls no adapter", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeGates(dir, HEAD, { id: "fonts", reason: BLOCKED });
    const outcome = await runCli(["so-long", "--project", dir, "--host", "preview", "--yes"], undefined, {
      soLong: {
        clients: armed(calls),
        build: async () => {
          calls.push("build");
        },
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /saved version/);
    assert.match(outcome.stdout, /launch stays closed/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

const LIVE_PAGE = `<!doctype html><html><head><title>Milliways</title>
<meta property="og:title" content="Milliways">
<meta property="og:description" content="Lunch at the end">
<meta property="og:image" content="https://milliways.example/og.png">
</head><body>Milliways</body></html>`;

function pageResponse(status: number, body = LIVE_PAGE, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers });
}

function scriptedFetch(missingOn: string): typeof fetch {
  return (input) => {
    const url = String(input);
    if (url.startsWith("http://")) {
      const secure = url.replace("http://", "https://");
      return Promise.resolve(pageResponse(301, "", { location: secure }));
    }
    if (url.startsWith(missingOn) && url.includes("/missing")) return Promise.resolve(pageResponse(404, "missing"));
    return Promise.resolve(pageResponse(200, LIVE_PAGE, { "strict-transport-security": "max-age=60" }));
  };
}

function phoneRunner(seen: string[]) {
  return {
    runMobile: (url: string) => {
      seen.push(url);
      return Promise.resolve({ performance: 95, accessibility: 96, bestPractices: 97, seo: 98 });
    },
  };
}

test("a failed live check lists the 404 and does not roll back without a yes", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  const phones: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const clients = armed(calls);
    clients.preview = {
      handoff: () => {
        calls.push("preview");
        return Promise.resolve({ url: "https://new.example/" });
      },
    };
    const outcome = await run(dir, ["--host", "preview", "--yes"], {
      clients,
      checks: { fetchImpl: scriptedFetch("https://new.example/"), lhci: phoneRunner(phones), routes: ["/missing"] },
      rollbackYes: () => {
        calls.push("rollback-yes");
        return Promise.resolve(false);
      },
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.deepEqual(calls, ["build", "preview", "rollback-yes"]);
    assert.deepEqual(phones, ["https://new.example/"]);
    assert.match(outcome.stdout, /Page \/missing was not found \(404\)\./);
    assert.match(outcome.stdout, /The live check failed\./);
    assert.match(outcome.stdout, /The last working publish can go back up\./);
    assert.match(outcome.stdout, /The last working publish was left where it is/);
    assertQuiet(outcome.stdout);
    const record = readFileSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"), "utf8");
    assert.match(record, /## Post-check/);
    assert.match(record, /\/missing/);
    assert.match(record, /404/);
    assert.match(record, /The live check failed\./);
  } finally {
    removeTempDir(dir);
  }
});

test("a yes after a failed check sends the last working publish again", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<title>Milliways</title>\n", "utf8");
    mkdirSync(path.join(dir, ".hitchhiker", "deploy"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"),
      [
        "# Deploys",
        "",
        "- 2026-10-20T12:00:00.000Z — hostinger — static — completed — https://good.example/",
        "  Via: Hostinger",
        "",
        "## Post-check",
        "",
        "The live check passed.",
        "",
      ].join("\n"),
      "utf8",
    );
    const clients = armed(calls);
    clients.preview = {
      handoff: () => {
        calls.push("preview");
        return Promise.resolve({ url: "https://new.example/" });
      },
    };
    clients.hostinger = {
      uploadStatic: () => {
        calls.push("hostinger");
        return Promise.resolve({ id: "back" });
      },
      uploadNode: () => {
        calls.push("hostinger-node");
        return Promise.reject(new Error("node upload"));
      },
      poll: () => Promise.resolve("completed"),
    };
    const outcome = await run(dir, ["--host", "preview", "--yes"], {
      clients,
      checks: { fetchImpl: scriptedFetch("https://new.example/"), lhci: phoneRunner([]), routes: ["/missing"] },
      rollbackYes: () => Promise.resolve(true),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 0, outcome.stdout);
    assert.deepEqual(calls, ["build", "preview", "hostinger"]);
    assert.match(outcome.stdout, /404/);
    assert.match(outcome.stdout, /The last working publish was sent again/);
    assert.match(outcome.stdout, /https:\/\/good\.example\//);
    assert.match(outcome.stdout, /The live check passed\./);
    assertQuiet(outcome.stdout);
    const record = readFileSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"), "utf8");
    assert.match(record, /rollback of hostinger/);
    assert.match(record, /The live check passed\./);
    assert.match(record, /The live check failed\./);
  } finally {
    removeTempDir(dir);
  }
});

test("a passing live check does not offer a roll back", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const clients = armed(calls);
    clients.preview = {
      handoff: () => {
        calls.push("preview");
        return Promise.resolve({ url: "https://new.example/" });
      },
    };
    const outcome = await run(dir, ["--host", "preview", "--yes"], {
      clients,
      checks: { fetchImpl: scriptedFetch("https://nowhere.example/"), lhci: phoneRunner([]), routes: ["/"] },
      rollbackYes: () => {
        calls.push("rollback-yes");
        return Promise.resolve(true);
      },
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 0, outcome.stdout);
    assert.deepEqual(calls, ["build", "preview"]);
    assert.match(outcome.stdout, /The live check passed\./);
    assert.equal(outcome.stdout.includes("can go back up"), false);
    assertQuiet(outcome.stdout);
  } finally {
    removeTempDir(dir);
  }
});

test("rollback without a yes writes nothing", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const outcome = await run(dir, ["--rollback"], {
      clients: armed(calls),
      checks: {
        fetchImpl: () => {
          calls.push("fetch");
          return Promise.reject(new Error("fetched"));
        },
        lhci: {
          runMobile: () => {
            calls.push("phone");
            return Promise.reject(new Error("phone"));
          },
        },
      },
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /The last working publish can go back up/);
    assert.match(outcome.stdout, /--rollback --yes/);
    assert.match(outcome.stdout, /Nothing was written/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("rollback with a yes sends the last working publish and does not build", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    mkdirSync(path.join(dir, "dist"), { recursive: true });
    writeFileSync(path.join(dir, "dist", "index.html"), "<title>Milliways</title>\n", "utf8");
    mkdirSync(path.join(dir, ".hitchhiker", "deploy"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"),
      "- 2026-10-20T12:00:00.000Z — hostinger — static — completed — https://good.example/\n  Via: Hostinger\n",
      "utf8",
    );
    const clients = armed(calls);
    clients.hostinger = {
      uploadStatic: () => {
        calls.push("hostinger");
        return Promise.resolve({ id: "back" });
      },
      uploadNode: () => Promise.reject(new Error("node")),
      poll: () => Promise.resolve("completed"),
    };
    const outcome = await run(dir, ["--rollback", "--yes"], {
      clients,
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 0, outcome.stdout);
    assert.deepEqual(calls, ["hostinger"]);
    assert.match(outcome.stdout, /The last working publish was sent again/);
    assert.match(outcome.stdout, /Earlier address: https:\/\/good\.example\//);
    assert.match(outcome.stdout, /no checker was connected/);
    assertQuiet(outcome.stdout);
    const record = readFileSync(path.join(dir, ".hitchhiker", "deploy", "DEPLOYS.md"), "utf8");
    assert.match(record, /rollback of hostinger/);
    assert.match(record, /## Post-check/);
  } finally {
    removeTempDir(dir);
  }
});

test("rollback with nothing earlier stays quiet and sends nothing", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeStack(dir);
    writeGates(dir, HEAD);
    const outcome = await run(dir, ["--rollback", "--yes"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /There is no earlier publish to put back/);
    assert.match(outcome.stdout, /Nothing else was sent/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("a red gate blocks rollback and calls no adapter", async () => {
  const dir = tempProject();
  const calls: string[] = [];
  try {
    writeGates(dir, HEAD, { id: "fonts", reason: BLOCKED });
    const outcome = await run(dir, ["--rollback", "--yes"], {
      clients: armed(calls),
      build: async () => {
        calls.push("build");
      },
    });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.stdout, /missing a font a reader needs/);
    assertQuiet(outcome.stdout);
    assert.deepEqual(calls, []);
    assertUnwritten(dir);
  } finally {
    removeTempDir(dir);
  }
});

test("a host and a rollback together are refused", async () => {
  const dir = tempProject();
  try {
    const outcome = await run(dir, ["--host", "preview", "--rollback"]);
    assert.equal(outcome.exitCode, 2);
    assert.match(outcome.stdout, /Unexpected argument/);
    assertQuiet(outcome.stdout);
  } finally {
    removeTempDir(dir);
  }
});

test("the so-long skill names the command and still refuses a silent publish", () => {
  const skill = readFileSync(skillPath, "utf8");
  const source = readFileSync(new URL("../src/commands/so-long.ts", import.meta.url), "utf8");
  assert.equal(skill.includes("not implemented"), false);
  assert.match(skill, /Never push\./);
  assert.match(skill, /Never spend without the user's yes\./);
  assert.match(skill, /Never deploy\./);
  assert.match(skill, new RegExp(SO_LONG_USAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(source, /hiddenChildOptions\(/);
  assert.match(source, /pathToFileURL\(/);
  assert.equal(source.includes("HH_LIVE"), false);
  assert.equal(source.includes("4175"), false);
});
