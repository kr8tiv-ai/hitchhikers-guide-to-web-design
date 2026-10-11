import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeShowcaseGif, type Raster } from "../scripts/gif.ts";
import { SHOWCASE_SHOTS } from "../scripts/showcase-media.ts";

test("showcase shots cover the empty desk, the sample, the tour, and a phone width", () => {
  const files = SHOWCASE_SHOTS.map((shot) => shot.file);
  assert.deepEqual(files, [
    "desk-empty.png",
    "sample-open.png",
    "tour.png",
    "desk-phone.png",
    "demo.gif",
  ]);
  assert.ok(SHOWCASE_SHOTS.filter((shot) => shot.file.endsWith(".png")).length >= 4);
  assert.ok(SHOWCASE_SHOTS.some((shot) => shot.width === 375));
  assert.ok(SHOWCASE_SHOTS.some((shot) => shot.width === 1440));
});

test("the gif encoder writes a looping GIF89a", () => {
  const frame = solid(4, 2, 243, 235, 221);
  const other = solid(4, 2, 142, 47, 26);
  const gif = encodeShowcaseGif([frame, other], 20);
  assert.equal(gif.subarray(0, 6).toString("ascii"), "GIF89a");
  assert.equal(gif.readUInt16LE(6), 4);
  assert.equal(gif.readUInt16LE(8), 2);
  assert.ok(gif.includes(Buffer.from("NETSCAPE2.0")));
  assert.equal(gif.filter((byte) => byte === 0x2c).length, 2);
  assert.equal(gif[gif.length - 1], 0x3b);
});

function solid(width: number, height: number, r: number, g: number, b: number): Raster {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }
  return { width, height, rgba };
}
