/**
 * One PNG, wrapped as a single-image ICO.
 * Vista-style: the image bytes stay PNG. No extra package.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IHDR = 0x49484452;

export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("ICO needs a PNG buffer.");
  }
  if (png.readUInt32BE(12) !== IHDR) {
    throw new Error("ICO needs a PNG buffer.");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Write one square PNG (1–256) into an ICO. */
export function pngToIco(png: Buffer): Buffer {
  const { width, height } = pngSize(png);
  if (width !== height || width < 1 || width > 256) {
    throw new Error("ICO needs a square PNG from 1 to 256 px.");
  }
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(width === 256 ? 0 : width, 6);
  header.writeUInt8(height === 256 ? 0 : height, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}
