import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { removeTempDir, type TempRm, type TempRmOptions } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

function errno(code: string): NodeJS.ErrnoException {
  const error = new Error(code) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

function codeOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

test("a stubbed rmSync that throws EPERM and then succeeds is retried", () => {
  let calls = 0;
  let options: TempRmOptions | undefined;
  const waits: number[] = [];
  const rm: TempRm = (_target, opts) => {
    calls += 1;
    options = opts;
    if (calls < 3) throw errno("EPERM");
  };
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    removeTempDir("C:\\Temp\\hh-retry", rm, (ms) => {
      waits.push(ms);
    });
  } finally {
    console.error = original;
  }
  assert.equal(calls, 3);
  assert.deepEqual(waits, [100, 100]);
  assert.deepEqual(logs, []);
  assert.deepEqual(options, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test("an rmSync that always throws EBUSY does not fail the caller", () => {
  let calls = 0;
  const rm: TempRm = () => {
    calls += 1;
    throw errno("EBUSY");
  };
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    assert.doesNotThrow(() => removeTempDir("C:\\Temp\\hh-busy", rm, () => {}));
  } finally {
    console.error = original;
  }
  assert.equal(calls, 11);
  assert.equal(logs.length, 1);
  assert.match(logs[0] ?? "", /hh-busy/);
  assert.match(logs[0] ?? "", /EBUSY/);
});

test("a non-lock error such as EINVAL still throws", () => {
  let calls = 0;
  const rm: TempRm = () => {
    calls += 1;
    throw errno("EINVAL");
  };
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    assert.throws(
      () => removeTempDir("C:\\Temp\\hh-bad", rm, () => {}),
      (error: unknown) => {
        assert.equal(codeOf(error), "EINVAL");
        return true;
      },
    );
  } finally {
    console.error = original;
  }
  assert.equal(calls, 1);
  assert.deepEqual(logs, []);
});

test("a missing path is fine", () => {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  try {
    removeTempDir(path.join(os.tmpdir(), "hh-remove-temp-missing-does-not-exist"));
    const rm: TempRm = () => {
      throw errno("ENOENT");
    };
    removeTempDir("C:\\Temp\\hh-enoent", rm, () => {});
  } finally {
    console.error = original;
  }
  assert.deepEqual(logs, []);
});

test("the real rmSync deletes a temp directory", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-remove-temp-"));
  writeFileSync(path.join(dir, "note.txt"), "towel");
  removeTempDir(dir);
  assert.equal(existsSync(dir), false);
});

test("every package test folder uses the same removeTempDir helper", () => {
  const canonical = readFileSync(path.join(here, "remove-temp.ts"), "utf8");
  const packagesDir = path.resolve(here, "..", "..");
  const names = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.ok(names.includes("engine"));
  for (const name of names) {
    const testDir = path.join(packagesDir, name, "test");
    if (!existsSync(testDir)) continue;
    const helper = path.join(testDir, "remove-temp.ts");
    assert.equal(existsSync(helper), true, name);
    assert.equal(readFileSync(helper, "utf8"), canonical, name);
  }
});
