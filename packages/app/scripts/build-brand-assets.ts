/**
 * Rasterize the desk mark. logo-mark.svg is the geometry source.
 * Lockup and social card are written from that mark plus the outlined
 * Don't Panic wordmark. Icon tiles are Playwright Chromium screenshots.
 * The lockup and the social card are drawn from those outlines here,
 * including Literata's glyph outlines, so their pixels do not depend on
 * the operating system's font rasterizer. A PNG that already has those
 * pixels is left untouched.
 *
 *   pnpm --filter @hitchhiker/app run brand-assets
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { literataContours, rasterRgb, samePicture, type Paint, type Rgb } from "./stable-raster.ts";

const appRoot = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(appRoot, "public");
const brandDir = path.join(publicDir, "brand");
const iconDir = path.join(publicDir, "icons");
const docsAssets = path.resolve(appRoot, "..", "..", "docs", "assets");
const wordmarkPath = path.join(appRoot, "src", "design", "wordmark.svg");
const fontPath = path.join(publicDir, "fonts", "Literata-opsz16-wght600.woff2");

const PAPER = "#f3ebdd";
const INK = "#1c1612";
const RUST = "#8e2f1a";
const PAPER_RGB: Rgb = { r: 0xf3, g: 0xeb, b: 0xdd };
const INK_RGB: Rgb = { r: 0x1c, g: 0x16, b: 0x12 };
const RUST_RGB: Rgb = { r: 0x8e, g: 0x2f, b: 0x1a };
const SOCIAL_LINE = "The Hitchhiker's Guide to Web Design";

const KEEP_CHUNK = new Set(["IHDR", "PLTE", "IDAT", "IEND", "sRGB", "gAMA", "cHRM", "pHYs", "tRNS", "bKGD"]);

function num(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function rounded(value: number): number {
  return Number(num(value));
}

function rgbOf(hex: string): Rgb {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`Color ${hex} is not a 6-digit hex.`);
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function scaledRects(shapes: string, originX: number, originY: number, scale: number): Paint[] {
  const tags = shapes.match(/<rect\b[^>]*\/>/g);
  if (tags === null || tags.length === 0) throw new Error("Mark has no rects to rasterize.");
  return tags.map((tag) => {
    const numAttr = (name: string, fallback: number): number => {
      const found = new RegExp(`\\b${name}="([^"]+)"`).exec(tag)?.[1];
      if (found === undefined) return fallback;
      const value = Number(found);
      if (!Number.isFinite(value)) throw new Error(`Mark rect ${name} is not a number.`);
      return value;
    };
    const fill = /\bfill="([^"]+)"/.exec(tag)?.[1];
    if (fill === undefined) throw new Error("Mark rect is missing a fill.");
    return {
      kind: "rect",
      x: originX + numAttr("x", 0) * scale,
      y: originY + numAttr("y", 0) * scale,
      w: numAttr("width", 0) * scale,
      h: numAttr("height", 0) * scale,
      color: rgbOf(fill),
    };
  });
}

function wordmarkMap(
  originX: number,
  originY: number,
  scale: number,
  inner: string,
): (x: number, y: number) => { x: number; y: number } {
  const shift = /translate\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec(inner);
  const dx = Number(shift?.[1]);
  const dy = Number(shift?.[2]);
  if (shift === null || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    throw new Error("Wordmark transform is not a translate.");
  }
  return (x, y) => ({
    x: originX + (x + dx) * scale,
    y: originY + (y + dy) * scale,
  });
}

function writePicture(file: string, png: Buffer): void {
  if (existsSync(file) && samePicture(readFileSync(file), png)) return;
  writeFileSync(file, png);
}

function markShapes(svg: string): string {
  const rects = svg.match(/<rect\b[^>]*\/>/g);
  if (rects === null || rects.length < 4) {
    throw new Error("logo-mark.svg needs the paper, pages, accent, and desk rects.");
  }
  return rects.join("\n      ");
}

function wordmarkParts(svg: string): { transform: string; d: string } {
  const transform = /<g\s+transform="([^"]+)"/.exec(svg)?.[1];
  const d = /<path\b[^>]*\bd="([^"]+)"/.exec(svg)?.[1];
  if (transform === undefined || d === undefined) {
    throw new Error("wordmark.svg is missing the outlined path.");
  }
  return { transform, d };
}

function writeLockup(shapes: string, word: { transform: string; d: string }): {
  svg: string;
  width: number;
  height: number;
  markX: number;
  markY: number;
  markScale: number;
  wordX: number;
  wordY: number;
  wordScale: number;
} {
  const pad = 24;
  const mark = 128;
  const gap = 28;
  const wordScale = 96 / 150.8;
  const wordW = 1090.69 * wordScale;
  const wordH = 96;
  const width = Math.ceil(pad + mark + gap + wordW + pad);
  const height = pad + mark + pad;
  const wordX = pad + mark + gap;
  const wordY = pad + (mark - wordH) / 2;
  const placed = {
    markX: pad,
    markY: pad,
    markScale: 2,
    wordX: rounded(wordX),
    wordY: rounded(wordY),
    wordScale: rounded(wordScale),
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <title>Don't Panic lockup</title>
  <desc>The desk mark beside the Don't Panic wordmark, on editorial cream.</desc>
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  <g transform="translate(${placed.markX} ${placed.markY}) scale(${placed.markScale})">
      ${shapes}
  </g>
  <g transform="translate(${placed.wordX} ${placed.wordY}) scale(${placed.wordScale})">
    <g transform="${word.transform}">
      <path fill="${INK}" d="${word.d}"/>
    </g>
  </g>
</svg>
`;
  return { svg, width, height, ...placed };
}

function writeSocial(
  shapes: string,
  word: { transform: string; d: string },
  fontBase64: string,
): {
  svg: string;
  width: number;
  height: number;
  markX: number;
  markY: number;
  markScale: number;
  wordX: number;
  wordY: number;
  wordScale: number;
  barY: number;
  barW: number;
  barH: number;
  lineY: number;
  lineSize: number;
} {
  const width = 1200;
  const height = 630;
  const mark = 360;
  const markX = 88;
  const markY = (height - mark) / 2;
  const wordX = 500;
  const wordY = 188;
  const placed = {
    markX,
    markY: rounded(markY),
    markScale: rounded(mark / 64),
    wordX,
    wordY,
    wordScale: rounded(0.5),
    barY: 360,
    barW: 128,
    barH: 8,
    lineY: 430,
    lineSize: 36,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
  <title>Don't Panic</title>
  <desc>Social card. An open book on a cream desk, the Don't Panic wordmark, and the Guide name.</desc>
  <style>
    @font-face {
      font-family: Literata;
      font-style: normal;
      font-weight: 600;
      src: url("data:font/woff2;base64,${fontBase64}") format("woff2");
    }
  </style>
  <rect width="${width}" height="${height}" fill="${PAPER}"/>
  <g transform="translate(${placed.markX} ${placed.markY}) scale(${placed.markScale})">
      ${shapes}
  </g>
  <g transform="translate(${placed.wordX} ${placed.wordY}) scale(${num(placed.wordScale)})">
    <g transform="${word.transform}">
      <path fill="${INK}" d="${word.d}"/>
    </g>
  </g>
  <rect x="${placed.wordX}" y="${placed.barY}" width="${placed.barW}" height="${placed.barH}" fill="${RUST}"/>
  <text x="${placed.wordX}" y="${placed.lineY}" fill="${INK}" font-family="Literata" font-size="${placed.lineSize}" font-weight="600">${SOCIAL_LINE}</text>
</svg>
`;
  return { svg, width, height, ...placed };
}

function stabilizePng(png: Buffer): Buffer {
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Raster is not a PNG.");
  }
  const chunks: Buffer[] = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const total = 12 + length;
    if (offset + total > png.length) break;
    if (KEEP_CHUNK.has(type)) chunks.push(png.subarray(offset, offset + total));
    offset += total;
    if (type === "IEND") break;
  }
  return Buffer.concat([png.subarray(0, 8), ...chunks]);
}

function pngSize(png: Buffer): { width: number; height: number } {
  if (png.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("PNG is missing IHDR.");
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function shoot(page: Page, html: string, width: number, height: number): Promise<Buffer> {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: "load" });
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check("600 36px Literata") || document.fonts.check("36px Literata");
  });
  if (!loaded && html.includes("Literata")) {
    throw new Error("Literata did not load. The social card would fall back to a system font.");
  }
  const raw = await page.screenshot({
    type: "png",
    omitBackground: false,
    clip: { x: 0, y: 0, width, height },
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
  const png = stabilizePng(Buffer.from(raw));
  const size = pngSize(png);
  if (size.width !== width || size.height !== height) {
    throw new Error(`Expected ${width}x${height}, raster is ${size.width}x${size.height}.`);
  }
  return png;
}

function frame(svg: string, width: number, height: number, background: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${background}">${svg}</body></html>`;
}

function maskFrame(svg: string, size: number, background: string): string {
  const inner = Math.round(size * 0.6);
  const offset = Math.round((size - inner) / 2);
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body style="margin:0;width:${size}px;height:${size}px;overflow:hidden;background:${background}"><div style="position:absolute;left:${offset}px;top:${offset}px;width:${inner}px;height:${inner}px">${svg.replace(/<svg\b/, `<svg width="${inner}" height="${inner}"`)}</div></body></html>`;
}

function pngIco(images: readonly { size: number; png: Buffer }[]): Buffer {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  let offset = 6 + 16 * count;
  const entries: Buffer[] = [];
  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 0);
    entry.writeUInt8(image.size >= 256 ? 0 : image.size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

const markSvg = readFileSync(path.join(brandDir, "logo-mark.svg"), "utf8");
const shapes = markShapes(markSvg);
const word = wordmarkParts(readFileSync(wordmarkPath, "utf8"));
const fontBytes = readFileSync(fontPath);
const fontBase64 = fontBytes.toString("base64");
const lockup = writeLockup(shapes, word);
const social = writeSocial(shapes, word, fontBase64);

mkdirSync(iconDir, { recursive: true });
mkdirSync(docsAssets, { recursive: true });
writeFileSync(path.join(brandDir, "logo-lockup.svg"), lockup.svg, "utf8");
writeFileSync(path.join(brandDir, "social-card.svg"), social.svg, "utf8");

const browser = await chromium.launch({
  headless: true,
  args: ["--font-render-hinting=none", "--disable-lcd-text"],
});
try {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    viewport: { width: 64, height: 64 },
  });
  const sized = (svg: string, width: number, height: number): string =>
    svg.replace("<svg ", `<svg width="${width}" height="${height}" `);

  const square = async (px: number): Promise<Buffer> =>
    shoot(page, frame(sized(markSvg, px, px), px, px, PAPER), px, px);

  const icon16 = await square(16);
  const icon32 = await square(32);
  const icon48 = await square(48);
  const apple = await square(180);
  const icon192 = await square(192);
  const icon512 = await square(512);
  const mask192 = await shoot(page, maskFrame(markSvg, 192, RUST), 192, 192);
  const mask512 = await shoot(page, maskFrame(markSvg, 512, RUST), 512, 512);
  const socialPaints: Paint[] = [
    ...scaledRects(shapes, social.markX, social.markY, social.markScale),
    { kind: "path", d: word.d, color: INK_RGB, map: wordmarkMap(social.wordX, social.wordY, social.wordScale, word.transform) },
    { kind: "rect", x: social.wordX, y: social.barY, w: social.barW, h: social.barH, color: RUST_RGB },
    { kind: "glyphs", color: INK_RGB, contours: literataContours(fontBytes, SOCIAL_LINE, social.wordX, social.lineY, social.lineSize) },
  ];
  const socialPng = rasterRgb(social.width, social.height, PAPER_RGB, socialPaints);
  const lockupPaints: Paint[] = [
    ...scaledRects(shapes, lockup.markX, lockup.markY, lockup.markScale),
    { kind: "path", d: word.d, color: INK_RGB, map: wordmarkMap(lockup.wordX, lockup.wordY, lockup.wordScale, word.transform) },
  ];
  const lockupPng = rasterRgb(lockup.width, lockup.height, PAPER_RGB, lockupPaints);

  writeFileSync(path.join(publicDir, "apple-touch-icon.png"), apple);
  writeFileSync(path.join(iconDir, "icon-192.png"), icon192);
  writeFileSync(path.join(iconDir, "icon-512.png"), icon512);
  writeFileSync(path.join(iconDir, "icon-maskable-192.png"), mask192);
  writeFileSync(path.join(iconDir, "icon-maskable-512.png"), mask512);
  writePicture(path.join(publicDir, "social-card.png"), socialPng);
  writeFileSync(path.join(publicDir, "favicon.ico"), pngIco([
    { size: 16, png: icon16 },
    { size: 32, png: icon32 },
    { size: 48, png: icon48 },
  ]));
  writePicture(path.join(docsAssets, "social-card.png"), socialPng);
  writePicture(path.join(docsAssets, "logo-lockup.png"), lockupPng);
  await page.close();
} finally {
  await browser.close();
}

console.log("brand assets written");
