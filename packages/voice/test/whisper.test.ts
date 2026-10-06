import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TIMEOUT_MS,
  WhisperError,
  buildArgs,
  resolveWhisperPaths,
  transcribe,
  type WhisperRunner,
} from "../src/index.ts";

const voiceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(voiceRoot, "..", "..");
const whisperSource = path.join(voiceRoot, "src", "whisper.ts");

interface Fixture {
  dir: string;
  bin: string;
  model: string;
  wav: string;
}

function makeFixture(prefix = "hh-voice-"): Fixture {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  const bin = path.join(dir, "whisper-cli");
  const model = path.join(dir, "model.bin");
  const wav = path.join(dir, "clip.wav");
  writeFileSync(bin, "");
  writeFileSync(model, "not-a-real-weight");
  writeFileSync(wav, Buffer.from([0x52, 0x49, 0x46, 0x46]));
  return { dir, bin, model, wav };
}

function removeFixture(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function countingRunner(result: {
  code: number | null;
  stdout: string;
  stderr: string;
}): { runner: WhisperRunner; calls: number } {
  const state = { calls: 0 };
  const runner: WhisperRunner = () => {
    state.calls += 1;
    return Promise.resolve(result);
  };
  return {
    runner,
    get calls() {
      return state.calls;
    },
  };
}

test("buildArgs keeps shell metacharacters in one argv entry", () => {
  const wavPath = "C:\\Users\\ada\\mic drop & co; $(rm).wav";
  const model = "D:\\models\\my model.bin";
  const bin = "C:\\Program Files\\whisper-cli.exe";
  const argv = buildArgs({ wavPath, model, bin });
  assert.ok(Array.isArray(argv));
  assert.equal(typeof argv, "object");
  assert.notEqual(typeof argv, "string");
  assert.deepEqual(argv, [
    bin,
    "-m",
    model,
    "-f",
    wavPath,
    "-nt",
    "--no-timestamps",
  ]);
  assert.equal(argv.filter((entry) => entry === wavPath).length, 1);
  assert.equal(argv.filter((entry) => entry === model).length, 1);
  const joined = argv.join(" ");
  assert.ok(joined.split(" ").length > argv.length);
  const source = readFileSync(whisperSource, "utf8");
  assert.doesNotMatch(source, /buildArgs\([^)\n]*\)\s*\.join/);
  assert.doesNotMatch(source, /\.join\(\s*["'`]/);
  assert.match(source, /shell:\s*false/);
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.match(source, /\bspawn\(/);
  assert.doesNotMatch(source, /\bexec(File|Sync)?\s*\(/);
});

test("an injected runner returns the fake transcript and engine local", async () => {
  const fixture = makeFixture("hh voice ");
  try {
    const wavPath = path.join(fixture.dir, "take two.wav");
    writeFileSync(wavPath, Buffer.from([1, 2, 3, 4]));
    const req = {
      wavPath,
      bin: fixture.bin,
      model: fixture.model,
    };
    const seen: { bin: string; args: readonly string[] }[] = [];
    const runner: WhisperRunner = (bin, args) => {
      seen.push({ bin, args });
      assert.ok(Array.isArray(args));
      assert.equal(args.includes(wavPath), true);
      assert.equal(
        args.some((part) => part.includes(" ") && part.includes("-m") && part.includes("-f")),
        false,
      );
      return Promise.resolve({
        code: 0,
        stdout: "  hello from the mic\n",
        stderr: "progress stays off the transcript",
      });
    };
    const transcript = await transcribe(req, { runner });
    assert.deepEqual(transcript, { text: "hello from the mic", engine: "local" });
    assert.equal(seen.length, 1);
    const call = seen[0];
    assert.ok(call);
    assert.equal(call.bin, fixture.bin);
    assert.deepEqual(call.args, buildArgs(req).slice(1));
    assert.equal(call.args.join(" "), buildArgs(req).slice(1).join(" "));
    assert.notEqual(call.args.length, 1);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a missing bin throws MISSING_BIN and does not call the runner", async () => {
  const fixture = makeFixture();
  try {
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    await assert.rejects(
      () =>
        transcribe(
          {
            wavPath: fixture.wav,
            bin: path.join(fixture.dir, "missing-bin"),
            model: fixture.model,
          },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "MISSING_BIN");
        return true;
      },
    );
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a directory passed as the binary is MISSING_BIN", async () => {
  const fixture = makeFixture();
  try {
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: fixture.wav, bin: fixture.dir, model: fixture.model },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "MISSING_BIN");
        return true;
      },
    );
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a missing model throws MISSING_MODEL and does not call the runner", async () => {
  const fixture = makeFixture();
  try {
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    await assert.rejects(
      () =>
        transcribe(
          {
            wavPath: fixture.wav,
            bin: fixture.bin,
            model: path.join(fixture.dir, "missing-model.bin"),
          },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "MISSING_MODEL");
        return true;
      },
    );
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a model path inside packages/ is refused before the runner", async () => {
  const fixture = makeFixture();
  try {
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    const sneaky = path.join(repoRoot, "packages", "voice", "..", "voice", "weight.bin");
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: fixture.wav, bin: fixture.bin, model: sneaky },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "FAILED");
        assert.match(error.message, /packages/);
        return true;
      },
    );
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a runner exit of 1 throws FAILED with stderr clipped and no env dump", async () => {
  const fixture = makeFixture();
  const sentinel = "HH_VOICE_SENTINEL_SHOULD_NOT_LEAK";
  const previous = process.env[sentinel];
  process.env[sentinel] = "super-secret-value";
  try {
    const stderr = "E".repeat(800);
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: fixture.wav, bin: fixture.bin, model: fixture.model },
          {
            runner: () => Promise.resolve({ code: 1, stdout: "", stderr }),
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "FAILED");
        assert.match(error.message, /^whisper\.cpp exited 1: /);
        assert.equal(error.message.includes("E".repeat(500)), true);
        assert.equal(error.message.includes("E".repeat(501)), false);
        assert.equal(error.message.includes(sentinel), false);
        assert.equal(error.message.includes("super-secret-value"), false);
        assert.equal(error.message.includes("PATH"), false);
        return true;
      },
    );
  } finally {
    if (previous === undefined) delete process.env[sentinel];
    else process.env[sentinel] = previous;
    removeFixture(fixture.dir);
  }
});

test("empty stdout with exit 0 throws FAILED", async () => {
  const fixture = makeFixture();
  try {
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: fixture.wav, bin: fixture.bin, model: fixture.model },
          { runner: () => Promise.resolve({ code: 0, stdout: " \n\t", stderr: "" }) },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "FAILED");
        return true;
      },
    );
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a null status throws FAILED", async () => {
  const fixture = makeFixture();
  try {
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: fixture.wav, bin: fixture.bin, model: fixture.model },
          { runner: () => Promise.resolve({ code: null, stdout: "hello", stderr: "" }) },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "FAILED");
        return true;
      },
    );
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a 0-byte wav throws BAD_AUDIO before the runner", async () => {
  const fixture = makeFixture();
  try {
    writeFileSync(fixture.wav, Buffer.alloc(0));
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: fixture.wav, bin: fixture.bin, model: fixture.model },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "BAD_AUDIO");
        assert.match(error.message, /empty/);
        return true;
      },
    );
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("http and https wav paths throw BAD_AUDIO and do not call the runner", async () => {
  const fixture = makeFixture();
  try {
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    for (const wavPath of ["http://example.com/a.wav", "https://example.com/a.wav", "HTTPS://example.com/a.wav"]) {
      await assert.rejects(
        () =>
          transcribe(
            { wavPath, bin: fixture.bin, model: fixture.model },
            { runner: counter.runner },
          ),
        (error: unknown) => {
          assert.ok(error instanceof WhisperError);
          assert.equal(error.code, "BAD_AUDIO");
          return true;
        },
      );
    }
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a non-wav path and a missing wav throw BAD_AUDIO", async () => {
  const fixture = makeFixture();
  try {
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    const mp3 = path.join(fixture.dir, "clip.mp3");
    writeFileSync(mp3, Buffer.from([1]));
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: mp3, bin: fixture.bin, model: fixture.model },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "BAD_AUDIO");
        return true;
      },
    );
    await assert.rejects(
      () =>
        transcribe(
          {
            wavPath: path.join(fixture.dir, "gone.wav"),
            bin: fixture.bin,
            model: fixture.model,
          },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "BAD_AUDIO");
        return true;
      },
    );
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a hung injected runner reports TIMEOUT", async () => {
  const fixture = makeFixture();
  try {
    const started = Date.now();
    await assert.rejects(
      () =>
        transcribe(
          {
            wavPath: fixture.wav,
            bin: fixture.bin,
            model: fixture.model,
            timeoutMs: 40,
          },
          { runner: () => new Promise(() => {}) },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "TIMEOUT");
        return true;
      },
    );
    assert.ok(Date.now() - started < 5_000);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a non-positive timeout is FAILED and does not call the runner", async () => {
  const fixture = makeFixture();
  try {
    const counter = countingRunner({ code: 0, stdout: "hello from the mic", stderr: "" });
    await assert.rejects(
      () =>
        transcribe(
          { wavPath: fixture.wav, bin: fixture.bin, model: fixture.model, timeoutMs: 0 },
          { runner: counter.runner },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "FAILED");
        return true;
      },
    );
    assert.equal(counter.calls, 0);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("the default timeout is 60 seconds", () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 60_000);
});

test("resolveWhisperPaths reads the env vars and then PATH", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-path-"));
  try {
    const exe = process.platform === "win32" ? ".exe" : "";
    const cli = path.join(dir, `whisper-cli${exe}`);
    const mainBin = path.join(dir, `main${exe}`);
    const model = path.join(dir, "m.bin");
    writeFileSync(cli, "");
    writeFileSync(mainBin, "");
    writeFileSync(model, "x");

    const fromPath = resolveWhisperPaths({
      env: { WHISPER_CPP_MODEL: model },
      pathDirs: [dir],
      platform: process.platform,
    });
    assert.equal(fromPath.bin, cli);
    assert.equal(fromPath.model, model);

    const explicit = path.join(dir, "custom-bin");
    writeFileSync(explicit, "");
    const fromEnv = resolveWhisperPaths({
      env: { WHISPER_CPP_BIN: explicit, WHISPER_CPP_MODEL: model, PATH: dir },
      pathDirs: [dir],
    });
    assert.equal(fromEnv.bin, explicit);

    rmSync(cli);
    const fallback = resolveWhisperPaths({
      env: { WHISPER_CPP_MODEL: model },
      pathDirs: [dir],
      platform: process.platform,
    });
    assert.equal(fallback.bin, mainBin);
  } finally {
    removeFixture(dir);
  }
});

test("linux and macOS candidate names have no exe suffix", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-unix-"));
  try {
    const cli = path.join(dir, "whisper-cli");
    const model = path.join(dir, "m.bin");
    writeFileSync(cli, "");
    writeFileSync(model, "x");
    for (const platform of ["linux", "darwin"] as const) {
      const found = resolveWhisperPaths({
        env: { WHISPER_CPP_MODEL: model },
        pathDirs: [dir],
        platform,
      });
      assert.equal(found.bin, cli);
    }
  } finally {
    removeFixture(dir);
  }
});

test("resolveWhisperPaths throws typed errors and does not spawn", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-resolve-"));
  try {
    const model = path.join(dir, "m.bin");
    writeFileSync(model, "x");
    assert.throws(
      () => resolveWhisperPaths({ env: {}, pathDirs: [] }),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "MISSING_MODEL");
        return true;
      },
    );
    assert.throws(
      () => resolveWhisperPaths({ env: { WHISPER_CPP_MODEL: model }, pathDirs: [] }),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "MISSING_BIN");
        return true;
      },
    );
    assert.throws(
      () =>
        resolveWhisperPaths({
          env: {
            WHISPER_CPP_BIN: path.join(dir, "missing"),
            WHISPER_CPP_MODEL: model,
          },
          pathDirs: [],
        }),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "MISSING_BIN");
        return true;
      },
    );
    assert.throws(
      () =>
        resolveWhisperPaths({
          env: {
            WHISPER_CPP_BIN: path.join(dir, "custom"),
            WHISPER_CPP_MODEL: path.join(repoRoot, "packages", "voice", "weight.bin"),
          },
          pathDirs: [],
        }),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "MISSING_BIN");
        return true;
      },
    );
  } finally {
    removeFixture(dir);
  }
});

test("resolveWhisperPaths refuses a model inside packages/", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hh-voice-pkg-"));
  try {
    const bin = path.join(dir, "whisper-cli");
    writeFileSync(bin, "");
    assert.throws(
      () =>
        resolveWhisperPaths({
          env: {
            WHISPER_CPP_BIN: bin,
            WHISPER_CPP_MODEL: path.join(repoRoot, "packages", "voice", "weight.bin"),
          },
          pathDirs: [],
        }),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "FAILED");
        assert.match(error.message, /packages/);
        return true;
      },
    );
  } finally {
    removeFixture(dir);
  }
});

test("the default runner collects stdout with shell off", async () => {
  const fixture = makeFixture();
  try {
    const transcript = await transcribe(
      {
        wavPath: fixture.wav,
        bin: process.execPath,
        model: fixture.model,
        timeoutMs: 10_000,
      },
      { args: ["-e", "process.stdout.write('hello from the mic')"] },
    );
    assert.deepEqual(transcript, { text: "hello from the mic", engine: "local" });
  } finally {
    removeFixture(fixture.dir);
  }
});

test("the default runner turns a non-zero exit into FAILED", async () => {
  const fixture = makeFixture();
  try {
    await assert.rejects(
      () =>
        transcribe(
          {
            wavPath: fixture.wav,
            bin: process.execPath,
            model: fixture.model,
            timeoutMs: 10_000,
          },
          { args: ["-e", "process.stderr.write('nope'); process.exit(1)"] },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "FAILED");
        assert.match(error.message, /nope/);
        assert.equal(error.message.includes("super-secret-value"), false);
        return true;
      },
    );
  } finally {
    removeFixture(fixture.dir);
  }
});

test("a hung child is killed and reported as TIMEOUT", { timeout: 8_000 }, async () => {
  const fixture = makeFixture();
  try {
    const started = Date.now();
    await assert.rejects(
      () =>
        transcribe(
          {
            wavPath: fixture.wav,
            bin: process.execPath,
            model: fixture.model,
            timeoutMs: 400,
          },
          { args: ["-e", "setTimeout(() => {}, 20000)"] },
        ),
      (error: unknown) => {
        assert.ok(error instanceof WhisperError);
        assert.equal(error.code, "TIMEOUT");
        return true;
      },
    );
    assert.ok(Date.now() - started < 5_000);
  } finally {
    removeFixture(fixture.dir);
  }
});

test("the package source has no fetch and no paid host", () => {
  const host = ["api", "x", "ai"].join(".");
  for (const relative of ["src/whisper.ts", "src/index.ts", "README.md"]) {
    const text = readFileSync(path.join(voiceRoot, relative), "utf8");
    assert.equal(text.includes(host), false, relative);
    assert.equal(text.includes("fetch("), false, relative);
  }
  const source = readFileSync(whisperSource, "utf8");
  assert.doesNotMatch(source, /\bwhich\b/);
  assert.doesNotMatch(source, /where\.exe/);
  assert.doesNotMatch(source, /winget/);
  assert.doesNotMatch(source, /\bapt-get\b/);
  assert.doesNotMatch(source, /\bbrew\b/);
});

test("README names the env vars and says weights are not in git", () => {
  const readme = readFileSync(path.join(voiceRoot, "README.md"), "utf8");
  assert.match(readme, /weights are not in git/);
  assert.match(readme, /not bundled/);
  assert.match(readme, /WHISPER_CPP_BIN/);
  assert.match(readme, /WHISPER_CPP_MODEL/);
  assert.match(readme, /MIT/);
  assert.match(readme, /\$0/);
  assert.match(readme, /no audio leaves the machine/);
  assert.match(readme, /Windows/);
  assert.match(readme, /macOS/);
  assert.match(readme, /Linux/);
  assert.match(readme, /Homebrew/);
  assert.match(readme, /--output-txt/);
  assert.doesNotMatch(readme, /!/);
});

test("NOTICE records the optional whisper.cpp binary", () => {
  const notice = readFileSync(path.join(repoRoot, "NOTICE"), "utf8");
  assert.equal(
    notice.includes(
      "optional local binary whisper.cpp, MIT, not distributed with this repo",
    ),
    true,
  );
});
