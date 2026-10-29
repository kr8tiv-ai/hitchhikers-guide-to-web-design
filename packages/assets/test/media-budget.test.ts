/**
 * Desk Run 11: variant widths stop at 1920, a run stops on the byte budget
 * or on low free space, a failed encode leaves no partial, and a second
 * run of the same bytes does not encode again.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  MAX_RUN_BYTES,
  MAX_VARIANT_BYTES,
  MAX_VARIANTS_PER_IMAGE,
  MAX_VARIANT_WIDTH,
  MEDIA_DISK_SPACE_FALLBACK,
  MediaBudgetExceededError,
  MediaDiskSpaceError,
  assertFreeForMedia,
  formatByteCount,
  formatMediaDiskSpaceReason,
  readMediaBudget,
  requiredFreeBytes,
  runMediaEncode,
  selectVariantWidths,
  variantWidthsForProject,
  volumeLabel,
  type ImageVariantJob,
  type StatFsFn,
} from "../src/media-budget.ts";
import { removeTempDir } from "./remove-temp.ts";

const ROOMY: StatFsFn = async () => ({ bsize: 4096, bavail: 1_000_000_000 });

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-media-budget-"));
}

function namesOf(dir: string): Promise<string[]> {
  return readdir(dir, { recursive: true }).then((entries) => entries.map((entry) => String(entry)));
}

async function sourceFile(dir: string, name: string, bytes: number): Promise<string> {
  const file = path.join(dir, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.alloc(bytes, 7));
  return file;
}

function writer(bytes: number, calls: { n: number }): (job: ImageVariantJob) => Promise<void> {
  return async (job) => {
    calls.n += 1;
    await writeFile(job.destination, Buffer.alloc(bytes, calls.n));
  };
}

test("widths stop at 1920, skip near duplicates, and do not upscale", () => {
  assert.equal(MAX_VARIANT_WIDTH, 1920);
  assert.deepEqual(selectVariantWidths({ sourceWidth: 4000 }), [640, 1280, 1920]);
  const withExtra = selectVariantWidths({ sourceWidth: 5000, candidates: [640, 960, 1280, 1920, 2560] });
  assert.deepEqual(withExtra, [640, 960, 1280]);
  assert.equal(withExtra.includes(2560), false);
  assert.equal(withExtra.length, 3);
  assert.deepEqual(selectVariantWidths({ sourceWidth: 800 }), [640]);
  assert.deepEqual(selectVariantWidths({ sourceWidth: 1500 }), [640, 1280]);
  assert.equal(selectVariantWidths({ sourceWidth: 4000 }).includes(2560), false);
  assert.equal(selectVariantWidths({ sourceWidth: 4000 }).length <= 3, true);
  assert.deepEqual(
    selectVariantWidths({
      sourceWidth: 4000,
      maxCount: 4,
      candidates: [640, 700, 1280, 1400, 1800, 1920],
    }),
    [640, 1280, 1800],
  );
});

test("a picture manifest uses the project cap and never lists 2560", async () => {
  const dir = tempDir();
  try {
    assert.deepEqual(variantWidthsForProject(dir), [640, 1280, 1920]);
    mkdirSync(path.join(dir, ".hitchhiker"), { recursive: true });
    writeFileSync(
      path.join(dir, ".hitchhiker", "config.json"),
      JSON.stringify({ media: { maxWidth: 2560, maxVariantsPerImage: 4, maxRunBytes: 1024 } }),
      "utf8",
    );
    const budget = readMediaBudget(dir);
    assert.equal(budget.maxWidth, 1920);
    assert.equal(budget.maxVariantsPerImage, 4);
    assert.equal(budget.maxRunBytes, 1024);
    writeFileSync(path.join(dir, ".hitchhiker", "config.json"), "{", "utf8");
    assert.equal(readMediaBudget(dir).maxVariantsPerImage, MAX_VARIANTS_PER_IMAGE);
    assert.equal(readMediaBudget(dir).maxRunBytes, MAX_RUN_BYTES);
    const source = await readFile(path.join(import.meta.dirname, "..", "src", "section-generate.ts"), "utf8");
    assert.match(source, /variantWidthsForProject/);
    assert.equal(source.includes("2560"), false);
  } finally {
    removeTempDir(dir);
  }
});

test("per-image and per-run budgets stop further variants", async () => {
  const dir = tempDir();
  try {
    const out = path.join(dir, "public", "media");
    const input = await sourceFile(dir, "wide.png", 1000);
    const calls = { n: 0 };
    const capped = await runMediaEncode({
      images: [input],
      outDir: out,
      ffmpeg: null,
      budget: { maxVariantsPerImage: 2, maxRunBytes: MAX_RUN_BYTES },
      deps: { statfs: ROOMY, sourceWidth: async () => 4000, encodeImageVariant: writer(40, calls) },
    });
    assert.equal(calls.n, 2);
    assert.equal(capped.encoded, 2);
    assert.deepEqual(
      capped.images[0]?.outputs.map((item) => item.width),
      [640, 640],
    );
    assert.equal(capped.images[0]?.outputs.some((item) => item.width === 1280), false);

    const first = await sourceFile(dir, "one.png", 1000);
    const second = await sourceFile(dir, "two.png", 1000);
    const runCalls = { n: 0 };
    await assert.rejects(
      () =>
        runMediaEncode({
          images: [first, second],
          outDir: path.join(dir, "budget"),
          ffmpeg: null,
          budget: { maxVariantsPerImage: 2, maxRunBytes: 500 },
          deps: { statfs: ROOMY, sourceWidth: async () => 4000, encodeImageVariant: writer(200, runCalls) },
        }),
      (error: unknown) => {
        assert.ok(error instanceof MediaBudgetExceededError);
        assert.equal(error.writtenBytes, 400);
        assert.equal(error.limitBytes, 500);
        assert.match(error.message, /400 bytes written, limit 500/);
        return true;
      },
    );
    const budgetDir = path.join(dir, "budget");
    assert.equal(await fileExists(path.join(budgetDir, "one-640.avif")), true);
    assert.equal(await fileExists(path.join(budgetDir, "one-640.webp")), true);
    assert.equal(await fileExists(path.join(budgetDir, "two-640.avif")), false);
    assert.equal((await namesOf(budgetDir)).some((name) => name.endsWith(".partial")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("a variant larger than the source or 1.5 MB keeps only the smaller format", async () => {
  const dir = tempDir();
  try {
    const out = path.join(dir, "out");
    const input = await sourceFile(dir, "tight.png", 100);
    const calls = { n: 0 };
    const report = await runMediaEncode({
      images: [input],
      outDir: out,
      ffmpeg: null,
      deps: {
        statfs: ROOMY,
        sourceWidth: async () => 700,
        encodeImageVariant: async (job) => {
          calls.n += 1;
          await writeFile(job.destination, Buffer.alloc(job.format === "avif" ? 500 : 40));
        },
      },
    });
    assert.equal(calls.n, 2);
    assert.equal(report.encoded, 1);
    assert.equal(await fileExists(path.join(out, "tight-640.avif")), false);
    assert.equal(await fileExists(path.join(out, "tight-640.webp")), true);
    assert.equal(report.images[0]?.outputs.some((item) => item.width > 640), false);

    const heavy = await sourceFile(dir, "heavy.png", 2_000_000);
    const heavyOut = path.join(dir, "heavy");
    const heavyReport = await runMediaEncode({
      images: [heavy],
      outDir: heavyOut,
      ffmpeg: null,
      deps: {
        statfs: ROOMY,
        sourceWidth: async () => 700,
        encodeImageVariant: async (job) => {
          const size = job.format === "avif" ? 1_600_000 : 1_700_000;
          assert.ok(size > MAX_VARIANT_BYTES);
          await writeFile(job.destination, Buffer.alloc(size));
        },
      },
    });
    assert.equal(heavyReport.encoded, 1);
    assert.equal(await fileExists(path.join(heavyOut, "heavy-640.avif")), true);
    assert.equal(await fileExists(path.join(heavyOut, "heavy-640.webp")), false);
  } finally {
    removeTempDir(dir);
  }
});

test("low free space stops before any encode and names the volume", async () => {
  const dir = tempDir();
  try {
    const out = path.join(dir, "public", "media");
    await mkdir(out, { recursive: true });
    const input = await sourceFile(dir, "hero.png", 1000);
    const calls = { n: 0 };
    const free = 4096 * 10;
    const estimate = 6 * 1000;
    const required = requiredFreeBytes(estimate);
    assert.equal(formatByteCount(required), "2 GB");
    await assert.rejects(
      () =>
        assertFreeForMedia(out, estimate, {
          statfs: async () => ({ bsize: 4096, bavail: 10 }),
        }),
      (error: unknown) => {
        assert.ok(error instanceof MediaDiskSpaceError);
        assert.equal(
          error.message,
          formatMediaDiskSpaceReason(formatByteCount(free), volumeLabel(out), "2 GB"),
        );
        assert.match(error.message, /Free space and retry\./);
        return true;
      },
    );
    await assert.rejects(
      () =>
        runMediaEncode({
          images: [input],
          outDir: out,
          ffmpeg: null,
          deps: {
            statfs: async () => ({ bsize: 4096, bavail: 10 }),
            sourceWidth: async () => 2400,
            encodeImageVariant: writer(40, calls),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof MediaDiskSpaceError);
        assert.match(error.message, /Not enough free disk space to write media variants:/);
        assert.match(error.message, new RegExp(volumeLabel(out).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        return true;
      },
    );
    assert.equal(calls.n, 0);
  } finally {
    removeTempDir(dir);
  }
});

test("an unsupported statfs warns once and still encodes", async () => {
  const dir = tempDir();
  try {
    const out = path.join(dir, "out");
    const input = await sourceFile(dir, "hero.png", 800);
    const warnings: string[] = [];
    const calls = { n: 0 };
    const report = await runMediaEncode({
      images: [input],
      outDir: out,
      ffmpeg: null,
      budget: { maxVariantsPerImage: 2 },
      deps: {
        statfs: null,
        warn: (message) => warnings.push(message),
        sourceWidth: async () => 2000,
        encodeImageVariant: writer(30, calls),
      },
    });
    assert.deepEqual(warnings, ["Free-space check skipped: statfs is not supported on this platform."]);
    assert.equal(calls.n, 2);
    assert.equal(report.encoded, 2);
  } finally {
    removeTempDir(dir);
  }
});

test("ENOSPC removes the partial and the variants started for that image", async () => {
  const dir = tempDir();
  try {
    const out = path.join(dir, "public", "media");
    await mkdir(path.join(out, "nested"), { recursive: true });
    await writeFile(path.join(out, "stale.avif.partial"), Buffer.alloc(8));
    await writeFile(path.join(out, "nested", "old.partial"), Buffer.alloc(8));
    const good = path.join(dir, "good.png");
    const bad = path.join(dir, "bad.png");
    await writeFile(good, Buffer.alloc(1000, 1));
    await writeFile(bad, Buffer.alloc(1000, 2));
    const calls = { n: 0 };
    await assert.rejects(
      () =>
        runMediaEncode({
          images: [good, bad],
          outDir: out,
          ffmpeg: null,
          budget: { maxVariantsPerImage: 2 },
          deps: {
            statfs: ROOMY,
            sourceWidth: async () => 900,
            encodeImageVariant: async (job) => {
              calls.n += 1;
              await writeFile(job.destination, Buffer.alloc(50));
              if (job.input.endsWith("bad.png") && job.format === "webp") {
                throw Object.assign(new Error("No space left on device"), { code: "ENOSPC" });
              }
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof MediaDiskSpaceError);
        assert.equal(error.message, MEDIA_DISK_SPACE_FALLBACK);
        assert.ok(error.cause instanceof Error);
        assert.match(error.cause.message, /No space left on device/);
        return true;
      },
    );
    const names = await namesOf(out);
    assert.equal(names.some((name) => name.endsWith(".partial")), false);
    assert.equal(await fileExists(path.join(out, "good-640.avif")), true);
    assert.equal(await fileExists(path.join(out, "good-640.webp")), true);
    assert.equal(await fileExists(path.join(out, "bad-640.avif")), false);
    assert.equal(await fileExists(path.join(out, "bad-640.webp")), false);
    assert.ok(calls.n >= 3);
  } finally {
    removeTempDir(dir);
  }
});

test("a second run of unchanged sources performs zero encodes", async () => {
  const dir = tempDir();
  try {
    const out = path.join(dir, "public", "media");
    const bytes = Buffer.alloc(1000, 3);
    const first = path.join(dir, "hero.png");
    const twin = path.join(dir, "hero-twin.png");
    await writeFile(first, bytes);
    await writeFile(twin, bytes);
    const calls = { n: 0 };
    const deps = {
      statfs: ROOMY,
      sourceWidth: async () => 2400,
      encodeImageVariant: writer(40, calls),
      encodeVideoVariant: async (job: { destination: string }) => {
        calls.n += 1;
        await writeFile(job.destination, Buffer.alloc(20));
      },
    };
    const clip = await sourceFile(dir, "reel.mov", 80);
    const firstRun = await runMediaEncode({
      images: [first, twin],
      videos: [clip],
      outDir: out,
      ffmpeg: "ffmpeg",
      deps,
    });
    assert.equal(firstRun.encoded, 8);
    assert.equal(firstRun.copied, 6);
    assert.equal(calls.n, 8);
    const manifest = JSON.parse(await readFile(path.join(out, ".variants.json"), "utf8")) as {
      version: number;
      entries: Record<string, { file: string }>;
    };
    assert.equal(manifest.version, 1);
    assert.equal(Object.keys(manifest.entries).some((key) => key.includes(":2560:")), false);
    assert.equal(Object.values(manifest.entries).some((entry) => entry.file.includes("..")), false);
    calls.n = 0;
    const second = await runMediaEncode({
      images: [first, twin],
      videos: [clip],
      outDir: out,
      ffmpeg: "ffmpeg",
      deps,
    });
    assert.equal(calls.n, 0);
    assert.equal(second.encoded, 0);
    assert.equal(second.copied, 0);
    assert.equal(second.skipped, 14);
  } finally {
    removeTempDir(dir);
  }
});

async function fileExists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}
