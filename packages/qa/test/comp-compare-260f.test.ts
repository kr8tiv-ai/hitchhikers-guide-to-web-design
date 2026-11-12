/**
 * 260f: coarse compare metrics on fixture pictures, plus a labelled composite.
 * Chromium is the one already cached. This test does not download a browser.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { test } from "node:test";
import { chromiumReady, compareToComp } from "../src/comp-compare.ts";

const WIDTH = 160;
const HEIGHT = 36;
const MISSING = "Chromium is not installed. The compare cannot shoot the page.";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    const byte = buf[i] ?? 0;
    c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, sum]);
}

function png(paint: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const row = y * (WIDTH * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < WIDTH; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function split(
  left: [number, number, number],
  right: [number, number, number],
): (x: number, y: number) => [number, number, number] {
  return (x) => (x < WIDTH / 2 ? left : right);
}

function jpegSize(bytes: Buffer): { width: number; height: number } {
  let i = 2;
  while (i + 8 < bytes.length) {
    if (bytes[i] !== 0xff) break;
    while (bytes[i] === 0xff) i += 1;
    const marker = bytes[i] ?? 0;
    i += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= bytes.length) break;
    const length = bytes.readUInt16BE(i);
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: bytes.readUInt16BE(i + 3), width: bytes.readUInt16BE(i + 5) };
    }
    i += length;
  }
  throw new Error("The composite is not a JPEG.");
}

test("identical pictures score 1, a mirror fails layout, and a recolour fails the palette", { skip: chromiumReady() ? false : MISSING, timeout: 120_000 }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-260f-compare-"));
  try {
    const same = png(split([0, 0, 0], [255, 255, 255]));
    const flipped = png(split([255, 255, 255], [0, 0, 0]));
    const red = png(split([220, 30, 30], [250, 210, 210]));
    const blue = png(split([30, 40, 220], [190, 210, 250]));
    const comp = path.join(dir, "comp.png");
    const shot = path.join(dir, "shot.png");
    const mirror = path.join(dir, "mirror.png");
    const other = path.join(dir, "other.png");
    const out = path.join(dir, "desktop.jpg");
    writeFileSync(comp, same);
    writeFileSync(shot, same);
    writeFileSync(mirror, flipped);
    writeFileSync(other, blue);
    writeFileSync(path.join(dir, "red.png"), red);

    const identical = await compareToComp({ shot, comp, view: "desktop", out });
    assert.equal(identical.layout, 1);
    assert.equal(identical.palette, 0);
    assert.equal(identical.edge.length, 6);
    assert.equal(identical.edge.every((value) => value === 0), true);
    assert.equal(identical.width, 320);
    assert.equal(identical.height, 68);
    assert.equal(identical.shotWidth, WIDTH);
    assert.ok(identical.leftInk > 10);
    assert.ok(identical.rightInk > 10);
    const jpeg = readFileSync(out);
    const size = jpegSize(jpeg);
    assert.equal(size.width, identical.width);
    assert.equal(size.height, identical.height);

    const mirrored = await compareToComp({
      shot: mirror,
      comp,
      view: "desktop",
      out: path.join(dir, "mirror.jpg"),
    });
    assert.ok(mirrored.layout < 0.55);

    const recoloured = await compareToComp({
      shot: other,
      comp: path.join(dir, "red.png"),
      view: "desktop",
      out: path.join(dir, "colour.jpg"),
    });
    assert.ok(recoloured.layout >= 0.55);
    assert.ok(recoloured.palette > 18);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
