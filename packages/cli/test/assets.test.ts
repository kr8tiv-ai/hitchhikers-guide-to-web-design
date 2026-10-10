import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { runAssetsCommand } from "../src/commands/assets.ts";
import { runCli } from "../src/main.ts";

const PROMPT = "orchid-prompt-should-stay-hidden-062";

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-assets-cli-"));
}

function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

function writeProject(dir: string, budget: number): void {
  writeJson(path.join(dir, ".hitchhiker", "config.json"), { imagineBudgetUsd: budget });
  writeJson(path.join(dir, ".hitchhiker", "assets", "slots.json"), {
    slots: [
      {
        id: "hero",
        kind: "still",
        model: "grok-imagine-image",
        prompt: PROMPT,
        aspect: "1:1",
        n: 1,
        subjectIsReal: false,
        light: "north window",
        gradeScore: 4,
      },
    ],
  });
}

test("hh assets without a command exits 2", async () => {
  const bare = await runCli(["assets"]);
  assert.equal(bare.exitCode, 2);
  assert.match(bare.stdout, /hh assets/);
  assert.match(bare.stdout, /--project/);
  assert.equal(bare.stdout.includes("!"), false);

  const help = await runCli(["assets", "--help"]);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /--yes/);

  const refused = await runCli(["sessions"]);
  assert.equal(refused.exitCode, 2);
  assert.equal(refused.stdout, "");
  assert.match(refused.stderr ?? "", /^  hh assets$/m);
  assert.equal((refused.stderr ?? "").includes("node:"), false);
});

test("plan prints the quote and not the prompt", async () => {
  const dir = tempDir();
  writeProject(dir, 1);
  try {
    const result = await runCli(["assets", "plan", "--project", dir]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /0\.02/);
    assert.match(result.stdout, /grok-imagine-image at default/);
    assert.match(result.stdout, /replace it/);
    assert.equal(result.stdout.includes(PROMPT), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
  } finally {
    cleanup(dir);
  }
});

test("plan over the cap exits 1", async () => {
  const dir = tempDir();
  writeProject(dir, 0);
  try {
    const result = await runCli(["assets", "plan", "--project", dir]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /Cap exceeded/);
    assert.equal(result.stdout.includes(PROMPT), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
  } finally {
    cleanup(dir);
  }
});

test("diy writes the prompt pack", async () => {
  const dir = tempDir();
  writeProject(dir, 0);
  try {
    const result = await runCli(["assets", "diy", "--project", dir]);
    assert.equal(result.exitCode, 0);
    const file = path.join(dir, ".hitchhiker", "assets", "diy", "PROMPTS.md");
    assert.match(result.stdout, /PROMPTS\.md/);
    const text = readFileSync(file, "utf8");
    assert.match(text, /## hero/);
    assert.match(text, /no text, no letters, no logos, no watermarks, no faces/);
  } finally {
    cleanup(dir);
  }
});

test("run without --yes spends nothing", async () => {
  const dir = tempDir();
  writeProject(dir, 1);
  try {
    const result = await runCli(["assets", "run", "--project", dir]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /Nothing was spent/);
    assert.match(result.stdout, /--yes/);
    assert.equal(result.stdout.includes(PROMPT), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "ASSETS.md")), false);
  } finally {
    cleanup(dir);
  }
});

test("run --yes over the cap exits before the key is read", async () => {
  const dir = tempDir();
  writeProject(dir, 0);
  let fetched = false;
  try {
    const result = await runAssetsCommand(["run", "--project", dir, "--yes"], {
      env: {},
      keychain: null,
      fetchImpl: async () => {
        fetched = true;
        throw new Error("network blocked");
      },
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /Cap exceeded/);
    assert.equal(result.stdout.includes("No xAI API key"), false);
    assert.equal(fetched, false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
  } finally {
    cleanup(dir);
  }
});

test("run --yes uses the injected fetch and does not print the key", async () => {
  const dir = tempDir();
  writeProject(dir, 1);
  const secret = "test-key-not-a-secret-062";
  try {
    const result = await runAssetsCommand(["run", "--project", dir, "--yes"], {
      env: { XAI_API_KEY: secret },
      keychain: null,
      fetchImpl: async () => {
        throw new Error("injected fetch stopped the call");
      },
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /injected fetch stopped the call/);
    assert.equal(result.stdout.includes(secret), false);
    assert.equal(result.stdout.includes(PROMPT), false);
    assert.equal(existsSync(path.join(dir, ".hitchhiker", "assets", "spend.json")), false);
  } finally {
    cleanup(dir);
  }
});

test("import maps a dropped file onto the slot", async () => {
  const dir = tempDir();
  writeProject(dir, 0);
  const dropped = path.join(dir, "hero.png");
  writeFileSync(dropped, Buffer.from("png-bytes"));
  try {
    const result = await runCli(["assets", "import", "--project", dir, "--file", dropped]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /hero/);
    const copied = path.join(dir, ".hitchhiker", "assets", "diy", "imported", "hero.png");
    assert.equal(readFileSync(copied, "utf8"), "png-bytes");
    const assets = readFileSync(path.join(dir, ".hitchhiker", "ASSETS.md"), "utf8");
    assert.match(assets, /diy/);
    assert.match(assets, /0\.00/);
  } finally {
    cleanup(dir);
  }
});
