import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HAPPY_CARD,
  IngestError,
  MAX_INGEST_BYTES,
  TEXT_CAP,
  brandGuideRequest,
  cassetteKey,
  defaultConfig,
  extractPdfText,
  importBrandGuide,
  readImageFacts,
  suggestAnswerPatches,
  think,
  writeCassette,
  type BrandGuideAdapter,
  type SpawnLike,
} from "../src/index.ts";

const fixturePdf = fileURLToPath(new URL("./fixtures/slogan.pdf", import.meta.url));
const sourcePath = fileURLToPath(new URL("../src/ingest.ts", import.meta.url));

/** 1x1 PNG. The longest side is under 512, so the grade warns. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function tempDir(): string {
  return mkdtempSync(path.join(os.tmpdir(), "hh-ingest-"));
}

function escapePdf(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function minimalPdf(text: string, wide = false): Buffer {
  const stream = wide
    ? `BT\n/F1 1 Tf\n0 10 Td\n(${escapePdf(text)}) Tj\nET\n`
    : `BT\n/F1 24 Tf\n72 720 Td\n(${escapePdf(text)}) Tj\nET\n`;
  const box = wide ? "0 0 1000000 1000" : "0 0 612 792";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [${box}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const header = Buffer.from("%PDF-1.4\n");
  const chunks: Buffer[] = [header];
  let offset = header.length;
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(offset);
    const body = objects[index];
    if (body === undefined) throw new Error("missing pdf object");
    const chunk = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`);
    chunks.push(chunk);
    offset += chunk.length;
  }
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    const start = offsets[index];
    if (start === undefined) throw new Error("missing xref offset");
    xref += `${String(start).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(Buffer.from(xref));
  chunks.push(
    Buffer.from(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`),
  );
  return Buffer.concat(chunks);
}

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpeg(width: number, height: number): Buffer {
  const app = Buffer.alloc(18);
  app[0] = 0xff;
  app[1] = 0xe0;
  app.writeUInt16BE(16, 2);
  const sof = Buffer.alloc(13);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(11, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 1;
  sof[10] = 1;
  sof[11] = 0x11;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app, sof, Buffer.from([0xff, 0xd9])]);
}

function assertIngest(error: unknown, code: IngestError["code"]): boolean {
  assert.ok(error instanceof IngestError);
  assert.equal(error.name, "IngestError");
  assert.equal(error.code, code);
  return true;
}

test("ingest.ts does not name a text extractor binary or a process spawn module", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.equal(source.includes("pdftotext"), false);
  assert.equal(source.includes("child_process"), false);
});

test("the committed slogan fixture is extracted", async () => {
  const extracted = await extractPdfText(fixturePdf);
  assert.equal(extracted.pages, 1);
  assert.equal(extracted.truncated, false);
  assert.ok(extracted.text.includes("Slogan: Bring a towel"));
});

test("a file outside the root is rejected and a file inside is read", async () => {
  const root = tempDir();
  const outsideRoot = tempDir();
  try {
    const inside = path.join(root, "slogan.pdf");
    const outside = path.join(outsideRoot, "slogan.pdf");
    const bytes = readFileSync(fixturePdf);
    writeFileSync(inside, bytes);
    writeFileSync(outside, bytes);
    const extracted = await extractPdfText(inside, { root });
    assert.ok(extracted.text.includes("Slogan: Bring a towel"));
    const escaped = path.resolve(root, "..", path.basename(outsideRoot), "slogan.pdf");
    await assert.rejects(() => extractPdfText(escaped, { root }), (error: unknown) =>
      assertIngest(error, "OUTSIDE_ROOT"),
    );
    await assert.rejects(() => extractPdfText(outside, { root }), (error: unknown) =>
      assertIngest(error, "OUTSIDE_ROOT"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outsideRoot, { recursive: true, force: true });
  }
});

test("a missing file throws IngestError NOT_FOUND", async () => {
  const root = tempDir();
  try {
    await assert.rejects(
      () => extractPdfText(path.join(root, "missing.pdf"), { root }),
      (error: unknown) => assertIngest(error, "NOT_FOUND"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file over 25 MB is refused before it is parsed", async () => {
  const root = tempDir();
  try {
    const file = path.join(root, "notes.pdf");
    writeFileSync(file, Buffer.from("this is not a pdf"));
    await assert.rejects(
      () =>
        extractPdfText(file, {
          root,
          statImpl: async () => ({ size: MAX_INGEST_BYTES + 1 }),
        }),
      (error: unknown) => assertIngest(error, "TOO_LARGE"),
    );
    const extracted = await extractPdfText(path.join(root, "real.pdf"), {
      root,
      statImpl: async () => ({ size: MAX_INGEST_BYTES }),
    }).catch((error: unknown) => error);
    writeFileSync(path.join(root, "real.pdf"), readFileSync(fixturePdf));
    const atCap = await extractPdfText(path.join(root, "real.pdf"), {
      root,
      statImpl: async () => ({ size: MAX_INGEST_BYTES }),
    });
    assert.ok(atCap.text.includes("Slogan: Bring a towel"));
    assert.ok(extracted instanceof IngestError);
    assert.equal(extracted.code, "NOT_FOUND");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("text past the cap keeps the prefix and sets truncated", async () => {
  const root = tempDir();
  try {
    const file = path.join(root, "long.pdf");
    const body = "E".repeat(TEXT_CAP + 50);
    await writeFile(file, minimalPdf(body, true));
    const extracted = await extractPdfText(file, { root });
    assert.equal(extracted.truncated, true);
    assert.equal(extracted.pages, 1);
    assert.equal(extracted.text.length, TEXT_CAP);
    assert.equal(extracted.text, "E".repeat(TEXT_CAP));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bytes that are not a PDF are unsupported", async () => {
  const root = tempDir();
  try {
    const file = path.join(root, "notes.pdf");
    writeFileSync(file, Buffer.from("hello"));
    await assert.rejects(() => extractPdfText(file, { root }), (error: unknown) =>
      assertIngest(error, "UNSUPPORTED"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a 1x1 PNG warns and the file bytes stay put", async () => {
  const root = tempDir();
  try {
    const file = path.join(root, "mark.png");
    writeFileSync(file, PNG_1X1);
    const before = readFileSync(file);
    const facts = await readImageFacts(file, { root });
    assert.equal(facts.width, 1);
    assert.equal(facts.height, 1);
    assert.equal(facts.bytes, PNG_1X1.length);
    assert.equal(facts.warning, "Longest side is 1px, under 512.");
    assert.ok(readFileSync(file).equals(before));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a 512px side does not warn, and JPEG SOF is measured", async () => {
  const root = tempDir();
  try {
    const wide = path.join(root, "wide.png");
    writeFileSync(wide, png(512, 10));
    const wideFacts = await readImageFacts(wide, { root });
    assert.equal(wideFacts.width, 512);
    assert.equal(wideFacts.height, 10);
    assert.equal(wideFacts.warning, null);

    const photo = path.join(root, "mark.jpg");
    writeFileSync(photo, jpeg(640, 480));
    const photoFacts = await readImageFacts(photo, { root });
    assert.equal(photoFacts.width, 640);
    assert.equal(photoFacts.height, 480);
    assert.equal(photoFacts.warning, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an unknown image type and an oversized image are refused", async () => {
  const root = tempDir();
  try {
    const gif = path.join(root, "mark.gif");
    writeFileSync(gif, Buffer.from("GIF89a"));
    await assert.rejects(() => readImageFacts(gif, { root }), (error: unknown) =>
      assertIngest(error, "UNSUPPORTED"),
    );
    const pngFile = path.join(root, "big.png");
    writeFileSync(pngFile, PNG_1X1);
    await assert.rejects(
      () =>
        readImageFacts(pngFile, {
          root,
          statImpl: async () => ({ size: MAX_INGEST_BYTES + 1 }),
        }),
      (error: unknown) => assertIngest(error, "TOO_LARGE"),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an explicit Slogan label becomes one IMPORTED patch and nothing else", () => {
  const patches = suggestAnswerPatches("Slogan: Bring a towel");
  assert.deepEqual(patches, [{ id: "DP-1.3", status: "IMPORTED", value: "Bring a towel" }]);
});

test("lowercase and mid-line labels are ignored, and only labelled fields are kept", () => {
  const text = [
    "Our story starts with a towel.",
    "slogan: not this one",
    "The Slogan: not at the start",
    " Slogan: leading space",
    "Slogan: Bring a towel",
    "Slogan: a later line does not replace the first",
    "A testimonial: someone said the work was solid",
    "Colors: lime and void",
    "Do not use: stock handshakes",
    "Slogan:",
  ].join("\n");
  assert.deepEqual(suggestAnswerPatches(text), [
    { id: "DP-1.3", status: "IMPORTED", value: "Bring a towel" },
    { id: "DP-1.2", status: "IMPORTED", value: "lime and void" },
    { id: "DP-1.9", status: "IMPORTED", value: "stock handshakes" },
  ]);
  assert.deepEqual(suggestAnswerPatches("slogan: Bring a towel\nWe like green."), []);
});

test("importBrandGuide replays a cassette and does not spawn", async () => {
  const dir = tempDir();
  const cassetteDir = path.join(dir, "cassettes");
  const guide = "Slogan: Bring a towel\nA testimonial: invented praise stays out.";
  const images = ["page-1.png"];
  const request = brandGuideRequest(guide, images);
  const config = defaultConfig();
  const key = cassetteKey({
    task: request.task,
    model: config.ai.model,
    effort: config.ai.effort.default,
    schema: request.schema ?? null,
    input: request.input,
    ...(request.images !== undefined ? { images: request.images } : {}),
  });
  writeCassette(cassetteDir, {
    task: request.task,
    model: config.ai.model,
    effort: config.ai.effort.default,
    key,
    result: { fields: [{ id: "DP-1.3", value: "Bring a towel" }] },
    raw: '{"fields":[{"id":"DP-1.3","value":"Bring a towel"}]}',
    durationMs: 12,
  });
  let calls = 0;
  const spawnImpl: SpawnLike = async () => {
    calls += 1;
    throw new Error("spawned during replay");
  };
  let seenImages: readonly string[] | undefined;
  const adapter: BrandGuideAdapter = async (sent) => {
    seenImages = sent.images;
    assert.equal(sent.input.includes("%PDF"), false);
    assert.ok(sent.input.includes(guide));
    return think(sent, {
      spawnImpl,
      projectDir: dir,
      cassetteDir,
      config,
      env: { HH_CASSETTE: "replay", PATH: "" },
    });
  };
  try {
    await mkdir(dir, { recursive: true });
    const cards = await importBrandGuide(guide, images, adapter);
    assert.equal(calls, 0);
    assert.deepEqual(seenImages, images);
    assert.deepEqual(cards, [
      {
        answer: { id: "DP-1.3", status: "IMPORTED", value: "Bring a towel" },
        card: HAPPY_CARD,
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("importBrandGuide drops blank values, duplicates, and ids that are not brand or voice", async () => {
  const adapter: BrandGuideAdapter = async () => ({
    value: {
      fields: [
        { id: "DP-1.3", value: "Bring a towel" },
        { id: "DP-1.3", value: "second slogan" },
        { id: "DP-1.2", value: "   " },
        { id: "DP-9.9", value: "A testimonial we must not store." },
      ],
    },
    raw: "{}",
    durationMs: 1,
    cassette: "live",
  });
  const cards = await importBrandGuide("Slogan: Bring a towel", [], adapter);
  assert.deepEqual(cards, [
    {
      answer: { id: "DP-1.3", status: "IMPORTED", value: "Bring a towel" },
      card: "happy with this?",
    },
  ]);
});
