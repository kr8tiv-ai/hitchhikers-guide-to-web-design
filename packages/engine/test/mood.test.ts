import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { cassetteFile, cassetteKey, writeCassette } from "../src/ai/cassette.ts";
import { think, type ThinkRequest, type ThinkResult } from "../src/ai/think.ts";
import { ConfigError, defaultConfig, parseConfig } from "../src/config.ts";
import type { Facts } from "../src/guide/schemas.ts";
import {
  MOOD_IMAGE_BYTE_LIMIT,
  MOOD_SCHEMA,
  MOOD_TASK,
  MoodValidationError,
  analyzeMood,
  buildMoodRequest,
  moodImageName,
} from "../src/mood/analyze.ts";

const FACTS: Facts = {
  answers: [{ id: "DP-1.4", value: "warm paper and brass" }],
  uploads: [],
  crawlNotes: [],
  industry: "bakery",
};

const FIXTURES = [
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQkdMAAACkAFt2Ll/jAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOIEhEBAAFOAIPeyAgOAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQCbABAAEcAKHV0Ka1AAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGM4saUHAARQAgmuMNamAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPg4uICAABAAB9egfgSAAAAAElFTkSuQmCC",
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP48OE1AAWfAszDd2B2AAAAAElFTkSuQmCC",
] as const;

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4Kooor6M+fP/Z",
  "base64",
);

const HEX = /^#[0-9a-f]{6}$/;

interface SeenImage {
  file: string;
  whatItSays: string;
  palette: string[];
  typeClass: string;
  why?: string;
  note?: string;
}

interface SeenDirection {
  name: string;
  palette: string[];
  typeClasses: { display: string; text: string };
  mood: string;
  references: string[];
  notes?: string[];
}

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-mood-"));
}

function asImage(value: unknown): SeenImage {
  assert.equal(typeof value, "object");
  assert.ok(value !== null);
  return value as SeenImage;
}

function asDirection(value: unknown): SeenDirection {
  assert.equal(typeof value, "object");
  assert.ok(value !== null);
  return value as SeenDirection;
}

function fakeThink(onRequest: (request: ThinkRequest<unknown>) => unknown): typeof think {
  const wrapped = async <T>(request: ThinkRequest<T>): Promise<ThinkResult<T>> => {
    const value = onRequest(request) as T;
    return { value, raw: JSON.stringify(value), durationMs: 1, cassette: "live" };
  };
  return wrapped as typeof think;
}

function swatch(index: number): { file: string; whatItSays: string; palette: string[]; typeClass: string } {
  return {
    file: `shot-${index + 1}.png`,
    whatItSays: `Swatch ${index + 1} is a quiet field of color.`,
    palette: ["#112233", "#445566"],
    typeClass: "humanist sans",
  };
}

function directions(): SeenDirection[] {
  return [
    {
      name: "Brass paper",
      palette: ["#f3efe4", "#c4a574", "#1f1a17", "#8c9a86", "#f7f4ee"],
      typeClasses: { display: "high-contrast serif", text: "humanist sans" },
      mood: "Warm paper, brass, and a quiet counter.",
      references: ["shot-1.png"],
    },
    {
      name: "Ink slab",
      palette: ["#14181c", "#d8d2c8", "#8a3b2c", "#e6e1d8", "#3d4c3f"],
      typeClasses: { display: "slab", text: "grotesk" },
      mood: "Printed ink on a thick slab.",
      references: ["shot-2.png"],
    },
    {
      name: "Morning tile",
      palette: ["#f7f1e8", "#2f5d50", "#e3b23c", "#1c1c1c", "#d9cfc3"],
      typeClasses: { display: "geometric sans", text: "old-style serif" },
      mood: "Tile, herb green, and a pale morning.",
      references: ["shot-3.png"],
    },
  ];
}

function model(count: number, patch?: (image: ReturnType<typeof swatch>, index: number) => void) {
  const perImage = Array.from({ length: count }, (_, index) => {
    const image = swatch(index);
    patch?.(image, index);
    return image;
  });
  return { perImage, directions: directions() };
}

async function writeFixtures(dir: string, count = 6): Promise<string[]> {
  const files: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const file = path.join(dir, `shot-${index + 1}.png`);
    const encoded = FIXTURES[index] ?? FIXTURES[0];
    assert.ok(encoded);
    await writeFile(file, Buffer.from(encoded, "base64"));
    files.push(file);
  }
  return files;
}

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    c ^= bytes[index] ?? 0;
    for (let bit = 0; bit < 8; bit += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Uncompressed RGB PNG, large enough to cross the 10 MB send limit. */
function bulkyPng(width: number, height: number): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 1; x <= stride; x += 1) raw[row + x] = (y * 17 + x * 13) & 255;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const idat = deflateSync(raw, { level: 0 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function bloatedJpeg(): Buffer {
  const sos = TINY_JPEG.indexOf(Buffer.from([0xff, 0xda]));
  assert.ok(sos > 2, "fixture JPEG is missing a start-of-scan marker");
  const payload = Buffer.alloc(60_000, 0x20);
  const segment = Buffer.alloc(4 + payload.length);
  segment[0] = 0xff;
  segment[1] = 0xfe;
  segment.writeUInt16BE(payload.length + 2, 2);
  payload.copy(segment, 4);
  const parts: Buffer[] = [TINY_JPEG.subarray(0, sos)];
  for (let index = 0; index < 180; index += 1) parts.push(segment);
  parts.push(TINY_JPEG.subarray(sos));
  return Buffer.concat(parts);
}

test("pinterest capture defaults off", () => {
  assert.equal(defaultConfig().integrations.pinterestCapture, false);
  assert.equal(parseConfig({}).integrations.pinterestCapture, false);
  assert.equal(parseConfig({ integrations: {} }).integrations.pinterestCapture, false);
  assert.equal(parseConfig({ integrations: { pinterestCapture: true } }).integrations.pinterestCapture, true);
  assert.throws(
    () => parseConfig({ integrations: { pinterestCapture: "yes" } }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "integrations.pinterestCapture");
      return true;
    },
  );
  assert.throws(
    () => parseConfig({ integrations: { pinterestCapture: null } }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "integrations.pinterestCapture");
      return true;
    },
  );
  assert.throws(
    () => parseConfig({ integrations: { jar: true } }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.field, "integrations.jar");
      return true;
    },
  );
});

test("non-hex colors and repeated palettes are rejected", async () => {
  const dir = tempDir();
  try {
    const [file] = await writeFixtures(dir, 1);
    assert.ok(file);
    const bad = model(1);
    const first = bad.directions[0];
    assert.ok(first);
    first.palette = ["red", "#112233", "#445566", "#778899", "#aabbcc"];
    await assert.rejects(
      () => analyzeMood([file], FACTS, "standard", { think: fakeThink(() => bad) }),
      (error: unknown) => {
        assert.ok(error instanceof MoodValidationError);
        assert.match(error.message, /not a hex color/);
        return true;
      },
    );

    const repeated = model(1);
    const left = repeated.directions[0];
    const right = repeated.directions[1];
    assert.ok(left);
    assert.ok(right);
    right.palette = ["#ABC", "#111111", "#222222", "#333333", "#444444"];
    left.palette = ["#aabbcc", "#111111", "#222222", "#333333", "#444444"];
    await assert.rejects(
      () => analyzeMood([file], FACTS, "standard", { think: fakeThink(() => repeated) }),
      (error: unknown) => {
        assert.ok(error instanceof MoodValidationError);
        assert.match(error.message, /repeats an earlier direction palette/);
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a font name becomes a class and the guess is noted", async () => {
  const dir = tempDir();
  try {
    const [file] = await writeFixtures(dir, 1);
    assert.ok(file);
    const drafted = model(1, (image) => {
      image.typeClass = "Helvetica";
    });
    const firstDirection = drafted.directions[0];
    assert.ok(firstDirection);
    firstDirection.typeClasses = { display: "Playfair Display", text: "humanist sans" };
    const result = await analyzeMood([file], FACTS, "standard", { think: fakeThink(() => drafted) });
    const image = asImage(result.perImage[0]);
    assert.equal(image.typeClass, "grotesk");
    assert.match(image.note ?? "", /Helvetica/);
    assert.match(image.note ?? "", /not a fact/);
    assert.equal(image.typeClass.includes("Helvetica"), false);
    const direction = asDirection(result.directions[0]);
    assert.equal(direction.typeClasses.display, "high-contrast serif");
    assert.equal(direction.typeClasses.text, "humanist sans");
    assert.match((direction.notes ?? []).join(" "), /Playfair Display/);
    assert.equal(JSON.stringify(result).includes('"Helvetica"'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("express records no why and marks the field ASSUMED", async () => {
  const dir = tempDir();
  try {
    const files = await writeFixtures(dir, 2);
    let asked = "";
    const result = await analyzeMood(files, FACTS, "express", {
      think: fakeThink((request) => {
        asked = request.input;
        const drafted = model(2, (image) => {
          (image as { why?: string }).why = "quiet paper";
        });
        return drafted;
      }),
    });
    assert.equal(asked.includes("Ask why for:"), false);
    assert.equal(asked.includes("Express records none."), true);
    assert.equal(result.perImage.length, 2);
    for (const value of result.perImage) {
      assert.equal(asImage(value).why, "ASSUMED");
    }
    assert.equal(JSON.stringify(result).includes("quiet paper"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deep asks why for at most 5 images", async () => {
  const dir = tempDir();
  try {
    const files = await writeFixtures(dir, 6);
    let asked = "";
    let sent = 0;
    const result = await analyzeMood(files, FACTS, "deep", {
      think: fakeThink((request) => {
        asked = request.input;
        sent = request.images?.length ?? 0;
        const drafted = model(6, (image) => {
          (image as { why?: string }).why = `because ${image.file}`;
        });
        return drafted;
      }),
    });
    const line = asked.split("\n").find((entry) => entry.startsWith("Ask why for:"));
    assert.ok(line);
    const names = line.slice("Ask why for:".length).replace(/\.$/, "").split(",").map((name) => name.trim());
    assert.equal(names.length, 5);
    assert.equal(names.includes(moodImageName(files[5] ?? "", 5)), false);
    assert.equal(sent, 6);
    const withWhy = result.perImage.filter((value) => {
      const why = asImage(value).why;
      return why !== undefined && why !== "ASSUMED";
    });
    assert.equal(withWhy.length, 5);
    const last = asImage(result.perImage[5]);
    assert.equal(last.why, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("only 12 images are sent", async () => {
  const dir = tempDir();
  try {
    const files = await writeFixtures(dir, 6);
    while (files.length < 13) {
      const copy = path.join(dir, `extra-${files.length}.png`);
      await writeFile(copy, Buffer.from(FIXTURES[0] ?? "", "base64"));
      files.push(copy);
    }
    let sent = 0;
    await analyzeMood(files, FACTS, "standard", {
      think: fakeThink((request) => {
        sent = request.images?.length ?? 0;
        return model(12);
      }),
    });
    assert.equal(sent, 12);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("images over 10 MB are downscaled before think", async () => {
  const dir = tempDir();
  try {
    const png = path.join(dir, "bulky.png");
    const jpeg = path.join(dir, "bloated.jpg");
    writeFileSync(png, bulkyPng(2000, 1800));
    writeFileSync(jpeg, bloatedJpeg());
    const pngSize = statSync(png).size;
    const jpegSize = statSync(jpeg).size;
    assert.ok(pngSize > MOOD_IMAGE_BYTE_LIMIT);
    assert.ok(jpegSize > MOOD_IMAGE_BYTE_LIMIT);

    const seen: { file: string; size: number; head: Buffer }[] = [];
    await analyzeMood([png, jpeg], FACTS, "standard", {
      think: fakeThink((request) => {
        for (const image of request.images ?? []) {
          const bytes = readFileSync(image);
          seen.push({ file: image, size: bytes.length, head: bytes.subarray(0, 8) });
        }
        return model(2);
      }),
    });
    assert.equal(seen.length, 2);
    const pngOut = seen[0];
    const jpegOut = seen[1];
    assert.ok(pngOut);
    assert.ok(jpegOut);
    assert.ok(pngOut.size <= MOOD_IMAGE_BYTE_LIMIT);
    assert.ok(pngOut.size < pngSize);
    assert.equal(pngOut.head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
    assert.ok(jpegOut.size <= MOOD_IMAGE_BYTE_LIMIT);
    assert.ok(jpegOut.size < jpegSize);
    assert.equal(jpegOut.head[0], 0xff);
    assert.equal(jpegOut.head[1], 0xd8);
    assert.equal(pngOut.file === png, false);
    assert.equal(jpegOut.file === jpeg, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a six-image cassette returns 3 distinct hex directions", async () => {
  const dir = tempDir();
  const project = tempDir();
  try {
    const files = await writeFixtures(dir, 6);
    const labels = files.map((file, index) => moodImageName(file, index));
    const request = buildMoodRequest(files, FACTS, "standard", labels);
    assert.equal(request.task, MOOD_TASK);
    assert.equal(request.schema, MOOD_SCHEMA);
    const key = cassetteKey({
      task: request.task,
      model: "grok-4.7",
      effort: "medium",
      schema: request.schema ?? null,
      input: request.input,
      ...(request.images !== undefined ? { images: request.images } : {}),
    });
    const cassetteDir = fileURLToPath(new URL("./cassettes/", import.meta.url));
    const file = cassetteFile(cassetteDir, MOOD_TASK, key);
    if (process.env.HH_WRITE_MOOD_CASSETTE === "1") {
      const drafted = model(6, (image, index) => {
        image.file = labels[index] ?? image.file;
        if (index === 0) image.typeClass = "Helvetica";
      });
      writeCassette(cassetteDir, {
        task: MOOD_TASK,
        model: "grok-4.7",
        effort: "medium",
        key,
        result: drafted,
        raw: JSON.stringify(drafted),
        durationMs: 4,
      });
    }
    assert.equal(statSync(file).isFile(), true, `missing cassette ${key}`);
    const replay: typeof think = (req, deps) =>
      think(req, {
        ...deps,
        projectDir: project,
        cassetteDir,
        config: defaultConfig(),
        env: { HH_CASSETTE: "replay", PATH: "" },
        spawnImpl: () => {
          throw new Error("replay must not spawn grok");
        },
        now: () => 1_000,
      });
    const result = await analyzeMood(files, FACTS, "standard", { think: replay });
    assert.equal(result.directions.length, 3);
    const keys = new Set<string>();
    for (const direction of result.directions) {
      assert.equal(direction.palette.length, 5);
      for (const color of direction.palette) assert.match(color, HEX);
      const palette = direction.palette.join(",");
      assert.equal(keys.has(palette), false);
      keys.add(palette);
      assert.equal(direction.typeClasses.display.includes("Helvetica"), false);
      assert.equal(direction.typeClasses.text.includes("Helvetica"), false);
    }
    const first = asImage(result.perImage[0]);
    assert.equal(result.perImage.length, 6);
    assert.equal(first.typeClass, "grotesk");
    assert.match(first.note ?? "", /Helvetica/);
    assert.match(first.note ?? "", /not a fact/);
    await mkdir(project, { recursive: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});
