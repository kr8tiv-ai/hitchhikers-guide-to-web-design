import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ConfigError,
  IMAGINE_BUDGET_USD_MAX,
  TOKEN_BUDGET_MAX,
  defaultConfig,
  loadConfig,
  parseConfig,
} from "../src/config.ts";
import { defaultConfig as fromIndex, parseConfig as parseFromIndex } from "../src/index.ts";

const engineRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function templateObject(): unknown {
  const text = readFileSync(
    path.join(engineRoot, "templates", "gsd", "config.json"),
    "utf8",
  );
  assert.equal(text.includes("\r"), false);
  const start = text.indexOf("{");
  assert.ok(start >= 0);
  return JSON.parse(text.slice(start));
}

test("empty object becomes defaults", () => {
  const config = parseConfig({});
  assert.deepEqual(config, defaultConfig());
  assert.equal(config.worktrees, false);
  assert.equal(config.voiceEngine, "local");
  assert.equal(config.effort, "medium");
  assert.equal(config.gates.phonePerfMin, 90);
  assert.equal(config.model, "grok-4.7");
  assert.equal(config.interviewDepth, "deep");
  assert.equal(config.sessionIdMode, "unknown");
  assert.equal(config.deployTarget, "undecided");
  assert.equal(config.imagineBudgetUsd, 0);
  assert.equal(config.tokenBudget, 200000);
});

test("serialized defaultConfig round-trips", () => {
  const again = parseConfig(JSON.parse(JSON.stringify(defaultConfig())));
  assert.deepEqual(again, defaultConfig());
  assert.deepEqual(parseFromIndex({}), fromIndex());
});

test("the gsd template parses through parseConfig", () => {
  assert.deepEqual(parseConfig(templateObject()), defaultConfig());
});

test("effort low throws and names the field", () => {
  assert.throws(
    () => parseConfig({ effort: "low" }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "effort");
      assert.match(error.message, /effort/);
      assert.match(error.message, /low/);
      assert.match(error.message, /medium, high, xhigh/);
      return true;
    },
  );
});

test("unknown keys throw instead of being stripped", () => {
  for (const key of ["gsapFallback", "motionFallback", "replaceGsap"]) {
    assert.throws(
      () => parseConfig({ [key]: true }),
      (error: unknown) => {
        assert.ok(error instanceof ConfigError);
        assert.equal(error.field, key);
        assert.match(error.message, new RegExp(key));
        assert.match(error.message, /unknown key/);
        return true;
      },
    );
  }
});

test("imagineBudgetUsd rejects negatives and amounts above the ceiling", () => {
  assert.throws(
    () => parseConfig({ imagineBudgetUsd: -1 }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "imagineBudgetUsd");
      assert.match(error.message, /imagineBudgetUsd/);
      assert.match(error.message, /-1/);
      return true;
    },
  );
  assert.throws(
    () => parseConfig({ imagineBudgetUsd: IMAGINE_BUDGET_USD_MAX + 0.01 }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "imagineBudgetUsd");
      return true;
    },
  );
  assert.equal(
    parseConfig({ imagineBudgetUsd: IMAGINE_BUDGET_USD_MAX }).imagineBudgetUsd,
    IMAGINE_BUDGET_USD_MAX,
  );
  assert.equal(parseConfig({ imagineBudgetUsd: 0 }).imagineBudgetUsd, 0);
});

test("tokenBudget rejects values above 200000", () => {
  assert.throws(
    () => parseConfig({ tokenBudget: TOKEN_BUDGET_MAX + 1 }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "tokenBudget");
      assert.match(error.message, /tokenBudget/);
      assert.match(error.message, /200001/);
      return true;
    },
  );
  assert.equal(parseConfig({ tokenBudget: TOKEN_BUDGET_MAX }).tokenBudget, TOKEN_BUDGET_MAX);
});

test("null does not fall through to the default", () => {
  assert.throws(
    () => parseConfig({ model: null }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "model");
      assert.match(error.message, /null/);
      return true;
    },
  );
  assert.throws(
    () => parseConfig({ gates: { phonePerfMin: null } }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "gates.phonePerfMin");
      return true;
    },
  );
});

test("numeric gates passed as strings throw", () => {
  assert.throws(
    () => parseConfig({ gates: { phonePerfMin: "90" } }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "gates.phonePerfMin");
      assert.match(error.message, /string/);
      return true;
    },
  );
});

test("deployTarget aws names the allowed list", () => {
  assert.throws(
    () => parseConfig({ deployTarget: "aws" }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "deployTarget");
      assert.match(error.message, /hostinger/);
      assert.match(error.message, /vercel/);
      assert.match(error.message, /netlify/);
      assert.match(error.message, /cloudflare/);
      assert.match(error.message, /undecided/);
      return true;
    },
  );
});

test("gate integers stay inside their ranges", () => {
  const ok = parseConfig({
    gates: { phonePerfMin: 0, a11yMin: 100, desktopFpsMin: 120 },
  });
  assert.equal(ok.gates.phonePerfMin, 0);
  assert.equal(ok.gates.a11yMin, 100);
  assert.equal(ok.gates.bestPracticesMin, 90);
  assert.equal(ok.gates.desktopFpsMin, 120);

  for (const gates of [
    { phonePerfMin: 101 },
    { phonePerfMin: -1 },
    { seoMin: 90.5 },
    { desktopFpsMin: 0 },
    { desktopFpsMin: 121 },
  ]) {
    assert.throws(() => parseConfig({ gates }), ConfigError);
  }
});

test("GuideConfig has no secret fields", () => {
  const keys = Object.keys(defaultConfig());
  const gateKeys = Object.keys(defaultConfig().gates);
  const joined = [...keys, ...gateKeys].join(" ");
  assert.equal(/api|key|bearer|email|secret|password|budgets/i.test(joined), false);
  assert.equal(keys.includes("gsapFallback"), false);
  assert.equal(keys.includes("motionFallback"), false);
  assert.equal(keys.includes("replaceGsap"), false);
});

test("parseConfig does not read the environment", () => {
  const previous = process.env.XAI_API_KEY;
  process.env.XAI_API_KEY = "not-a-real-key";
  try {
    const config = parseConfig({});
    assert.deepEqual(config, defaultConfig());
    assert.equal(JSON.stringify(config).includes("not-a-real-key"), false);
  } finally {
    if (previous === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = previous;
  }
});

test("missing config.json is defaults and does not create a directory", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-config-"));
  try {
    assert.deepEqual(loadConfig(dir), defaultConfig());
    assert.equal(existsSync(path.join(dir, ".hitchhiker")), false);
    assert.deepEqual(loadConfig(dir), defaultConfig());
    assert.equal(existsSync(path.join(dir, ".hitchhiker")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig reads a present file and fills missing keys", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-config-"));
  try {
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch);
    writeFileSync(
      path.join(hitch, "config.json"),
      JSON.stringify({ effort: "high", worktrees: false }),
      "utf8",
    );
    const config = loadConfig(dir);
    assert.equal(config.effort, "high");
    assert.equal(config.worktrees, false);
    assert.equal(config.voiceEngine, "local");
    assert.equal(config.gates.phonePerfMin, 90);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
