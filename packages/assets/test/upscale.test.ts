import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import type { GradeFacts } from "../src/grade.ts";
import {
  UPSCALER_MANIFEST,
  UpscalerChecksumError,
  UpscalerOfflineError,
  ensureUpscaler,
  realesrganCacheRoot,
  type UpscalerManifestEntry,
} from "../src/model-fetch.ts";
import {
  ALREADY_LARGE_REASON,
  REALESRGAN_PHOTO_MODEL,
  REALESRGAN_SCALE2_MODEL,
  UPSCALE_REVIEW_LINE,
  realesrganModelForScale,
  runUpscale,
  upscalePlan,
} from "../src/upscale.ts";
import { ensureUpscaler as ensureFromIndex, grade as gradeFromIndex, runUpscale as runFromIndex, upscalePlan as planFromIndex } from "../src/index.ts";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEIGHT_EXT = new Set([".pth", ".bin", ".param", ".onnx"]);
const SKIP_DIRS = new Set(["node_modules", "dist"]);

function facts(overrides: Partial<GradeFacts> = {}): GradeFacts {
  return {
    width: 2400,
    height: 1600,
    bytes: 80_000,
    sharpness: 0.8,
    subjectIsReal: true,
    ...overrides,
  };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function entry(overrides: Partial<UpscalerManifestEntry> & Pick<UpscalerManifestEntry, "name" | "url" | "platform">, bytes: Buffer): UpscalerManifestEntry {
  return {
    sha256: sha256(bytes),
    licence: "BSD-3-Clause\nThe MIT License (MIT)\n",
    ...overrides,
  };
}

interface ZipFile {
  name: string;
  data: Buffer;
  method: 0 | 8;
}

function buildZip(files: ZipFile[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const compressed = file.method === 8 ? deflateRawSync(file.data) : file.data;
    const crc = crc32(file.data) >>> 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(file.method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const chunk = Buffer.concat([local, compressed]);
    locals.push(chunk);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(file.method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += chunk.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

async function withCache(run: (cacheDir: string) => Promise<void>): Promise<void> {
  const cacheDir = await mkdtemp(path.join(tmpdir(), "hh-upscale-"));
  try {
    await run(cacheDir);
  } finally {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

test("an 800 px product shot upscales 4x, a 1200 px frame upscales 2x, and a sharp 2400 px frame is skipped", () => {
  const product = upscalePlan(
    facts({ width: 800, height: 600, sharpness: 0.4, subjectIsReal: true }),
    false,
  );
  assert.equal(product.action, "upscale");
  assert.equal(product.scale, 4);
  assert.match(product.reason, /under 1920/);
  assert.match(product.reason, new RegExp(UPSCALE_REVIEW_LINE.replace("?", "\\?")));

  const mid = upscalePlan(facts({ width: 1200, height: 800, sharpness: 0.9, subjectIsReal: true }), false);
  assert.equal(mid.action, "upscale");
  assert.equal(mid.scale, 2);

  const large = upscalePlan(facts({ width: 2400, height: 1600, sharpness: 0.9, subjectIsReal: true }), false);
  assert.deepEqual(large, { action: "skip", reason: "already large enough" });
  assert.equal(large.reason, ALREADY_LARGE_REASON);
});

test("scale flips from 4 to 2 at the point where 2x meets the target", () => {
  const needsFour = upscalePlan(facts({ width: 959, height: 400 }), false);
  const needsTwo = upscalePlan(facts({ width: 960, height: 400 }), false);
  assert.equal(needsFour.scale, 4);
  assert.equal(needsTwo.scale, 2);
});

test("a sharp image that is still small is upscaled, including when yes is true", () => {
  const plan = upscalePlan(facts({ width: 800, height: 800, sharpness: 1, subjectIsReal: true }), true);
  assert.equal(plan.action, "upscale");
  assert.equal(plan.scale, 4);
});

test("upscalePlan never returns imagine-replacement for a real subject without yes", () => {
  const samples: GradeFacts[] = [
    facts({ width: 800, height: 600, sharpness: 0.1 }),
    facts({ width: 1200, height: 900, sharpness: 0.2 }),
    facts({ width: 2400, height: 1600, sharpness: 0.95 }),
    facts({ width: 2400, height: 1600, sharpness: 0.1 }),
    facts({ width: 100, height: 100, sharpness: 0 }),
    facts({ width: 4000, height: 100, sharpness: 0.05 }),
  ];
  for (const sample of samples) {
    const plan = upscalePlan({ ...sample, subjectIsReal: true }, false);
    assert.notEqual(plan.action, "imagine-replacement");
  }
});

test("replacement is offered only when it is allowed and upscaling will not grow the frame", () => {
  const softLarge = facts({ width: 2400, height: 1800, sharpness: 0.1, subjectIsReal: true });
  assert.equal(upscalePlan(softLarge, false).action, "skip");
  assert.equal(upscalePlan(softLarge, true).action, "imagine-replacement");

  const notRealSmall = facts({ width: 800, height: 600, sharpness: 0.1, subjectIsReal: false });
  assert.equal(upscalePlan(notRealSmall, false).action, "upscale");

  const notRealSoft = facts({ width: 2400, height: 1800, sharpness: 0.1, subjectIsReal: false });
  assert.equal(upscalePlan(notRealSoft, false).action, "imagine-replacement");

  const notRealSharp = facts({ width: 2400, height: 1800, sharpness: 0.8, subjectIsReal: false });
  assert.equal(upscalePlan(notRealSharp, false).action, "skip");
  assert.equal(upscalePlan(notRealSharp, false).reason, "already large enough");
});

test("sharpness outside 0 to 1 throws from the plan", () => {
  assert.throws(() => upscalePlan(facts({ sharpness: 2 }), false), /sharpness must be between 0 and 1/);
  assert.throws(() => upscalePlan(facts({ sharpness: -0.1 }), true), /sharpness must be between 0 and 1/);
});

test("upscalePlan does not call Imagine", () => {
  const source = readFileSync(path.join(packageRoot, "src", "upscale.ts"), "utf8");
  assert.doesNotMatch(source, /from\s+["'][^"']*imagine/);
  assert.doesNotMatch(source, /runJobs|IMAGINE_/);
  assert.equal(source.includes("fetch("), false);
});

test("ensureUpscaler downloads each file for this platform once, then reuses the cache", async () => {
  await withCache(async (cacheDir) => {
    const runnerBytes = Buffer.from("runner-bytes");
    const paramBytes = Buffer.from("param-bytes");
    const binBytes = Buffer.from("bin-bytes");
    const linuxBytes = Buffer.from("linux-runner");
    const files = new Map<string, Buffer>([
      ["https://example.test/runner", runnerBytes],
      ["https://example.test/model.param", paramBytes],
      ["https://example.test/model.bin", binBytes],
      ["https://example.test/linux", linuxBytes],
    ]);
    const manifest: UpscalerManifestEntry[] = [
      entry({ name: "realesrgan-ncnn-vulkan.exe", url: "https://example.test/runner", platform: "win32" }, runnerBytes),
      entry({ name: "realesrgan-x4plus.param", url: "https://example.test/model.param", platform: "any" }, paramBytes),
      entry({ name: "realesrgan-x4plus.bin", url: "https://example.test/model.bin", platform: "any" }, binBytes),
      entry({ name: "realesrgan-ncnn-vulkan", url: "https://example.test/linux", platform: "linux" }, linuxBytes),
    ];
    const calls: string[] = [];
    let online = true;
    const fetchImpl: typeof fetch = async (input) => {
      if (!online) throw new Error("offline");
      const url = String(input);
      calls.push(url);
      const body = files.get(url);
      if (!body) return new Response("missing", { status: 404 });
      return new Response(body);
    };

    const first = await ensureUpscaler({ cacheDir, platform: "win32", fetchImpl, manifest });
    assert.equal(first.downloaded, true);
    assert.deepEqual(calls.sort(), [
      "https://example.test/model.bin",
      "https://example.test/model.param",
      "https://example.test/runner",
    ]);
    assert.equal(calls.includes("https://example.test/linux"), false);
    const root = realesrganCacheRoot(cacheDir);
    assert.equal(first.runner, path.join(root, "realesrgan-ncnn-vulkan.exe"));
    assert.equal(first.modelDir, root);
    assert.ok(first.runner.startsWith(cacheDir));
    assert.equal(readFileSync(first.runner).equals(runnerBytes), true);
    assert.equal(readFileSync(path.join(root, "realesrgan-x4plus.param")).equals(paramBytes), true);
    const licence = await readFile(`${first.runner}.licence.txt`, "utf8");
    assert.match(licence, /BSD-3-Clause/);
    const credits = JSON.parse(await readFile(path.join(root, "CREDITS.json"), "utf8")) as {
      entries: { name: string; licence: string; sha256: string }[];
    };
    assert.equal(credits.entries.length, 3);
    assert.match(credits.entries[0]?.licence ?? "", /MIT/);

    online = false;
    const second = await ensureUpscaler({ cacheDir, platform: "win32", fetchImpl, manifest });
    assert.equal(second.downloaded, false);
    assert.equal(second.runner, first.runner);
    assert.equal(second.modelDir, first.modelDir);
    assert.equal(calls.length, 3);
  });
});

test("a sha256 mismatch deletes the partial file and throws UpscalerChecksumError", async () => {
  await withCache(async (cacheDir) => {
    const good = Buffer.from("good-bytes");
    const manifest: UpscalerManifestEntry[] = [
      entry({ name: "realesrgan-ncnn-vulkan.exe", url: "https://example.test/runner", platform: "win32" }, good),
      entry({ name: "realesrgan-x4plus.param", url: "https://example.test/model.param", platform: "any" }, Buffer.from("param")),
    ];
    const fetchImpl: typeof fetch = async () => new Response(Buffer.from("tampered"));
    await assert.rejects(
      () => ensureUpscaler({ cacheDir, platform: "win32", fetchImpl, manifest }),
      (error: unknown) => {
        assert.ok(error instanceof UpscalerChecksumError);
        assert.match(error.message, /partial download was deleted/);
        assert.equal(error.message.includes("\n"), false);
        return true;
      },
    );
    const root = realesrganCacheRoot(cacheDir);
    assert.equal(existsSync(path.join(root, "realesrgan-ncnn-vulkan.exe")), false);
    assert.equal(existsSync(path.join(root, "realesrgan-ncnn-vulkan.exe.partial")), false);
  });
});

test("offline on first use throws UpscalerOfflineError and leaves no runner", async () => {
  await withCache(async (cacheDir) => {
    const bytes = Buffer.from("runner");
    const manifest: UpscalerManifestEntry[] = [
      entry({ name: "realesrgan-ncnn-vulkan.exe", url: "https://example.test/runner", platform: "win32" }, bytes),
      entry({ name: "realesrgan-x4plus.param", url: "https://example.test/model.param", platform: "any" }, Buffer.from("p")),
    ];
    const fetchImpl: typeof fetch = async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    };
    await assert.rejects(
      () => ensureUpscaler({ cacheDir, platform: "win32", fetchImpl, manifest }),
      (error: unknown) => {
        assert.ok(error instanceof UpscalerOfflineError);
        assert.equal(error.message.includes("\n"), false);
        assert.match(error.message, /original image is unchanged/);
        return true;
      },
    );
    const root = realesrganCacheRoot(cacheDir);
    assert.equal(existsSync(path.join(root, "realesrgan-ncnn-vulkan.exe")), false);
    assert.equal(existsSync(path.join(root, "realesrgan-ncnn-vulkan.exe.partial")), false);
  });
});

test("a portable archive is unpacked to the runner and the model directory", async () => {
  await withCache(async (cacheDir) => {
    const zip = buildZip([
      { name: "realesrgan-ncnn-vulkan.exe", data: Buffer.from("exe-bytes"), method: 0 },
      { name: "models/realesrgan-x4plus.param", data: Buffer.from("param-bytes"), method: 8 },
      { name: "models/realesrgan-x4plus.bin", data: Buffer.from("bin-bytes"), method: 8 },
    ]);
    const manifest: UpscalerManifestEntry[] = [
      entry(
        {
          name: "realesrgan-ncnn-vulkan-20220424-windows.zip",
          url: "https://example.test/windows.zip",
          platform: "win32",
        },
        zip,
      ),
    ];
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return new Response(zip);
    };
    const ready = await ensureUpscaler({ cacheDir, platform: "win32", fetchImpl, manifest });
    assert.equal(calls, 1);
    assert.equal(ready.downloaded, true);
    assert.equal(path.basename(ready.runner), "realesrgan-ncnn-vulkan.exe");
    assert.equal(path.basename(ready.modelDir), "models");
    assert.equal(readFileSync(ready.runner).toString(), "exe-bytes");
    assert.equal(readFileSync(path.join(ready.modelDir, "realesrgan-x4plus.param")).toString(), "param-bytes");
    assert.ok(ready.runner.startsWith(cacheDir));

    const fetchAgain: typeof fetch = async () => {
      throw new Error("offline");
    };
    const second = await ensureUpscaler({ cacheDir, platform: "win32", fetchImpl: fetchAgain, manifest });
    assert.equal(second.downloaded, false);
    assert.equal(second.runner, ready.runner);
    assert.equal(second.modelDir, ready.modelDir);
  });
});

test("a zip entry that escapes the cache is refused", async () => {
  await withCache(async (cacheDir) => {
    const zip = buildZip([{ name: "../escape.txt", data: Buffer.from("nope"), method: 0 }]);
    const manifest: UpscalerManifestEntry[] = [
      entry({ name: "bundle.zip", url: "https://example.test/bundle.zip", platform: "win32" }, zip),
    ];
    const fetchImpl: typeof fetch = async () => new Response(zip);
    await assert.rejects(
      () => ensureUpscaler({ cacheDir, platform: "win32", fetchImpl, manifest }),
      /escapes the cache/,
    );
    assert.equal(existsSync(path.join(cacheDir, "escape.txt")), false);
    assert.equal(existsSync(path.join(path.dirname(cacheDir), "escape.txt")), false);
  });
});

test("runUpscale passes separate args and throws the runner stderr", async () => {
  const input = "C:\\Photos\\founder portrait.png";
  const output = "C:\\Photos\\founder portrait.upscaled.png";
  const modelDir = "C:\\Users\\Guide\\models\\realesrgan";
  const runner = "C:\\Users\\Guide\\realesrgan-ncnn-vulkan.exe";
  let seen: { cmd: string; args: string[] } | undefined;
  await runUpscale(input, output, 4, {
    runner,
    modelDir,
    spawnImpl: async (cmd, args) => {
      seen = { cmd, args };
      return { code: 0, stderr: "" };
    },
  });
  assert.ok(seen);
  assert.equal(seen.cmd, runner);
  assert.equal(seen.args[seen.args.indexOf("-i") + 1], input);
  assert.equal(seen.args[seen.args.indexOf("-o") + 1], output);
  assert.equal(seen.args[seen.args.indexOf("-s") + 1], "4");
  assert.equal(seen.args[seen.args.indexOf("-m") + 1], modelDir);
  assert.equal(seen.args[seen.args.indexOf("-n") + 1], REALESRGAN_PHOTO_MODEL);
  assert.equal(seen.args[seen.args.indexOf("-n") + 1], realesrganModelForScale(4));
  assert.equal(seen.args.includes(input), true);
  assert.equal(seen.args.some((arg) => arg.includes(" -")), false);

  let scaleTwo: string[] = [];
  await runUpscale(input, output, 2, {
    runner,
    modelDir,
    spawnImpl: async (_cmd, args) => {
      scaleTwo = args;
      return { code: 0, stderr: "" };
    },
  });
  assert.equal(scaleTwo[scaleTwo.indexOf("-s") + 1], "2");
  assert.equal(scaleTwo[scaleTwo.indexOf("-n") + 1], REALESRGAN_SCALE2_MODEL);
  assert.equal(scaleTwo[scaleTwo.indexOf("-n") + 1], realesrganModelForScale(2));
  assert.notEqual(scaleTwo[scaleTwo.indexOf("-n") + 1], REALESRGAN_PHOTO_MODEL);
  assert.equal(scaleTwo[scaleTwo.indexOf("-i") + 1], input);
  assert.equal(scaleTwo[scaleTwo.indexOf("-m") + 1], modelDir);

  await assert.rejects(
    () =>
      runUpscale(input, output, 2, {
        runner,
        modelDir,
        spawnImpl: async () => ({ code: 7, stderr: "vulkan device lost" }),
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /vulkan device lost/);
      return true;
    },
  );
});

test("upscalePlan feeds runUpscale with the paths ensureUpscaler returns", async () => {
  await withCache(async (cacheDir) => {
    const plan = upscalePlan(facts({ width: 800, height: 500, sharpness: 0.2, subjectIsReal: true }), false);
    assert.equal(plan.action, "upscale");
    assert.equal(plan.scale, 4);
    const runnerBytes = Buffer.from("runner");
    const paramBytes = Buffer.from("param");
    const manifest: UpscalerManifestEntry[] = [
      entry({ name: "realesrgan-ncnn-vulkan.exe", url: "https://example.test/runner", platform: "win32" }, runnerBytes),
      entry({ name: "realesrgan-x4plus.param", url: "https://example.test/model.param", platform: "any" }, paramBytes),
    ];
    const ready = await ensureUpscaler({
      cacheDir,
      platform: "win32",
      fetchImpl: async (input) => {
        const url = String(input);
        const body = url.endsWith("runner") ? runnerBytes : paramBytes;
        return new Response(body);
      },
      manifest,
    });
    const input = "D:\\Jobs\\shop front.png";
    const output = "D:\\Jobs\\shop front.upscaled.png";
    let args: string[] = [];
    let cmd = "";
    await runUpscale(input, output, plan.scale ?? 2, {
      runner: ready.runner,
      modelDir: ready.modelDir,
      spawnImpl: async (spawnCmd, spawnArgs) => {
        cmd = spawnCmd;
        args = spawnArgs;
        return { code: 0, stderr: "" };
      },
    });
    assert.equal(cmd, ready.runner);
    assert.equal(args[args.indexOf("-s") + 1], "4");
    assert.equal(args[args.indexOf("-m") + 1], ready.modelDir);
    assert.equal(args[args.indexOf("-i") + 1], input);
    assert.equal(args[args.indexOf("-o") + 1], output);
  });
});

test("the package index exports the grader and the upscaler", () => {
  assert.equal(typeof gradeFromIndex, "function");
  assert.equal(typeof planFromIndex, "function");
  assert.equal(typeof ensureFromIndex, "function");
  assert.equal(typeof runFromIndex, "function");
});

test("the default manifest points at the official portable release", () => {
  const byPlatform = new Map(UPSCALER_MANIFEST.map((item) => [item.platform, item]));
  assert.equal(byPlatform.size, 3);
  const windows = byPlatform.get("win32");
  const mac = byPlatform.get("darwin");
  const linux = byPlatform.get("linux");
  assert.ok(windows && mac && linux);
  assert.equal(
    windows.url,
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip",
  );
  assert.equal(windows.sha256, "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d");
  assert.equal(
    mac.url,
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip",
  );
  assert.equal(mac.sha256, "e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a");
  assert.equal(
    linux.url,
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-ubuntu.zip",
  );
  assert.equal(linux.sha256, "e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96");
  for (const item of UPSCALER_MANIFEST) {
    assert.match(item.sha256, /^[0-9a-f]{64}$/);
    assert.match(item.licence, /BSD 3-Clause License/);
    assert.match(item.licence, /The MIT License \(MIT\)/);
    assert.match(item.licence, /Copyright \(c\) 2019 nihui/);
  }
});

test("packages/assets contains no committed weight files", () => {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = path.join(dir, name);
      const info = statSync(full);
      if (info.isDirectory()) walk(full);
      else if (WEIGHT_EXT.has(path.extname(name).toLowerCase())) hits.push(full);
    }
  };
  walk(packageRoot);
  assert.deepEqual(hits, []);
});
