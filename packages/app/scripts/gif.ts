/**
 * PNG decode and GIF89a encode for the showcase media.
 * No extra package. Playwright writes the PNG frames.
 */

import { inflateSync } from "node:zlib";

export interface Raster {
  width: number;
  height: number;
  rgba: Buffer;
}

export function decodePng(buffer: Buffer): Raster {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("Not a PNG.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`PNG color type ${colorType} bit depth ${bitDepth} is not supported.`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src] ?? 0;
    src += 1;
    const row = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    unfilter(filter, row, prev, channels);
    for (let x = 0; x < width; x += 1) {
      const i = x * channels;
      const o = (y * width + x) * 4;
      rgba[o] = row[i] ?? 0;
      rgba[o + 1] = row[i + 1] ?? 0;
      rgba[o + 2] = row[i + 2] ?? 0;
      rgba[o + 3] = channels === 4 ? (row[i + 3] ?? 255) : 255;
    }
    prev = row;
  }
  return { width, height, rgba };
}

export function fitWidth(raster: Raster, width: number): Raster {
  if (raster.width === width) return raster;
  const height = Math.max(1, Math.round((raster.height * width) / raster.width));
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sy = Math.min(raster.height - 1, Math.floor((y * raster.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(raster.width - 1, Math.floor((x * raster.width) / width));
      const from = (sy * raster.width + sx) * 4;
      const to = (y * width + x) * 4;
      rgba[to] = raster.rgba[from] ?? 0;
      rgba[to + 1] = raster.rgba[from + 1] ?? 0;
      rgba[to + 2] = raster.rgba[from + 2] ?? 0;
      rgba[to + 3] = raster.rgba[from + 3] ?? 255;
    }
  }
  return { width, height, rgba };
}

/** Same canvas. Extra rows are the cream desk color. */
export function padHeight(raster: Raster, height: number): Raster {
  if (raster.height === height && raster.width > 0) return raster;
  const rgba = Buffer.alloc(raster.width * height * 4, 0);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 243;
    rgba[i + 1] = 235;
    rgba[i + 2] = 221;
    rgba[i + 3] = 255;
  }
  const rows = Math.min(raster.height, height);
  raster.rgba.copy(rgba, 0, 0, rows * raster.width * 4);
  return { width: raster.width, height, rgba };
}

export function encodeShowcaseGif(frames: readonly Raster[], delayCs = 40): Buffer {
  const first = frames[0];
  if (first === undefined) throw new Error("A gif needs a frame.");
  const width = first.width;
  const height = first.height;
  for (const frame of frames) {
    if (frame.width !== width || frame.height !== height) throw new Error("GIF frames must share a size.");
  }
  const parts: Buffer[] = [Buffer.from("GIF89a")];
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0xf7;
  parts.push(screen, palette256());
  parts.push(Buffer.from([0x21, 0xff, 0x0b, ...Buffer.from("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00]));
  for (const frame of frames) {
    const gce = Buffer.from([0x21, 0xf9, 0x04, 0x08, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00]);
    const image = Buffer.alloc(10);
    image[0] = 0x2c;
    image.writeUInt16LE(width, 5);
    image.writeUInt16LE(height, 7);
    parts.push(gce, image, lzwImage(indexFrame(frame)));
  }
  parts.push(Buffer.from([0x3b]));
  return Buffer.concat(parts);
}

function palette256(): Buffer {
  const palette = Buffer.alloc(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    palette[i * 3] = Math.round((((i >> 5) & 7) * 255) / 7);
    palette[i * 3 + 1] = Math.round((((i >> 2) & 7) * 255) / 7);
    palette[i * 3 + 2] = Math.round(((i & 3) * 255) / 3);
  }
  return palette;
}

function indexFrame(frame: Raster): Uint8Array {
  const count = frame.width * frame.height;
  const indices = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = i * 4;
    const r = frame.rgba[o] ?? 0;
    const g = frame.rgba[o + 1] ?? 0;
    const b = frame.rgba[o + 2] ?? 0;
    indices[i] = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
  }
  return indices;
}

function lzwImage(indices: Uint8Array): Buffer {
  const minCodeSize = 8;
  const clearCode = 256;
  const eoi = 257;
  let codeSize = 9;
  let nextCode = 258;
  const dict = new Map<string, number>();
  const bytes: number[] = [];
  let acc = 0;
  let nbits = 0;
  const write = (code: number): void => {
    acc |= code << nbits;
    nbits += codeSize;
    while (nbits >= 8) {
      bytes.push(acc & 255);
      acc >>>= 8;
      nbits -= 8;
    }
  };
  const reset = (): void => {
    dict.clear();
    codeSize = 9;
    nextCode = 258;
    write(clearCode);
  };
  reset();
  let key = String(indices[0] ?? 0);
  let code = indices[0] ?? 0;
  for (let i = 1; i < indices.length; i += 1) {
    const symbol = indices[i] ?? 0;
    const nextKey = `${key},${symbol}`;
    const known = dict.get(nextKey);
    if (known !== undefined) {
      key = nextKey;
      code = known;
      continue;
    }
    write(code);
    if (nextCode < 4096) {
      dict.set(nextKey, nextCode);
      nextCode += 1;
      if (codeSize < 12 && nextCode === 1 << codeSize) codeSize += 1;
    } else {
      write(clearCode);
      dict.clear();
      codeSize = 9;
      nextCode = 258;
    }
    key = String(symbol);
    code = symbol;
  }
  write(code);
  write(eoi);
  if (nbits > 0) bytes.push(acc & 255);
  const out: number[] = [minCodeSize];
  for (let offset = 0; offset < bytes.length; offset += 255) {
    const slice = bytes.slice(offset, offset + 255);
    out.push(slice.length, ...slice);
  }
  out.push(0);
  return Buffer.from(out);
}

function unfilter(filter: number, row: Buffer, prev: Buffer, bpp: number): void {
  for (let i = 0; i < row.length; i += 1) {
    const left = i >= bpp ? (row[i - bpp] ?? 0) : 0;
    const up = prev[i] ?? 0;
    const upLeft = i >= bpp ? (prev[i - bpp] ?? 0) : 0;
    const value = row[i] ?? 0;
    if (filter === 1) row[i] = (value + left) & 255;
    else if (filter === 2) row[i] = (value + up) & 255;
    else if (filter === 3) row[i] = (value + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) row[i] = (value + paeth(left, up, upLeft)) & 255;
    else if (filter !== 0) throw new Error(`Unknown PNG filter ${filter}.`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dul) return left;
  if (du <= dul) return up;
  return upLeft;
}
