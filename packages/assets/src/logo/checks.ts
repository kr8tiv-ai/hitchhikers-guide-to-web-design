/**
 * Raster checks for a traced logo.
 * @resvg/resvg-js renders 32 px and 16 px. Failing checks become advice.
 * The SVG is not rewritten here.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const INK_ALPHA = 128;
const AREA_ALPHA = 32;
const PX_PER_UNIT = 4;
const GRID = 64;
const SQUINT_SIGMA = 1.35;

export interface LegibilityScore {
  filledRatio: number;
  components: number;
  oneColourFilledRatio: number;
  reversedFilledRatio: number;
}

export interface LogoCheck {
  px32: LegibilityScore;
  px16: LegibilityScore;
  squint: number;
  advice: string[];
}

export interface Silhouette {
  area: number;
  grid: Uint8Array;
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Rendered {
  pixels: Uint8Array;
  width: number;
  height: number;
  png: Buffer;
}

interface RenderedImage {
  readonly pixels: Buffer;
  readonly width: number;
  readonly height: number;
  asPng(): Buffer;
}

interface ResvgInstance {
  render(): RenderedImage;
}

interface ResvgOptions {
  fitTo: { mode: "width"; value: number };
  background: string;
  font: { loadSystemFonts: false };
  shapeRendering: 0 | 1 | 2;
}

type ResvgCtor = new (svg: string, options?: ResvgOptions) => ResvgInstance;

let resvgCtor: ResvgCtor | null = null;

/** The Guide asks this after the export set. `elevate` is a banned word. */
export const LOGO_HAPPY_QUESTION = "happy with this? want me to improve it?";

export function readViewBox(svg: string): ViewBox {
  const view = /viewBox\s*=\s*"([^"]+)"/i.exec(svg);
  if (view?.[1] !== undefined) {
    const parts = view[1]
      .trim()
      .split(/[\s,]+/)
      .map((part) => Number(part));
    const x = parts[0];
    const y = parts[1];
    const w = parts[2];
    const h = parts[3];
    if (
      x !== undefined &&
      y !== undefined &&
      w !== undefined &&
      h !== undefined &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(w) &&
      Number.isFinite(h) &&
      w > 0 &&
      h > 0
    ) {
      return { x, y, w, h };
    }
  }
  const width = readLength(svg, "width");
  const height = readLength(svg, "height");
  if (width !== null && height !== null && width > 0 && height > 0) {
    return { x: 0, y: 0, w: width, h: height };
  }
  return { x: 0, y: 0, w: 32, h: 32 };
}

export function hasViewBox(svg: string): boolean {
  return /viewBox\s*=\s*"[^"]+"/i.test(svg);
}

export function isSquareViewBox(svg: string): boolean {
  if (!hasViewBox(svg)) return false;
  const box = readViewBox(svg);
  return Math.abs(box.w - box.h) / Math.max(box.w, box.h) < 0.001;
}

/** Recolour fills and strokes. `none` stays empty. Stroke-only paths stay unfilled. */
export function paintLogo(svg: string, color: string): string {
  let next = svg;
  next = next.replace(/\bfill\s*=\s*"(?!none\b)[^"]*"/gi, `fill="${color}"`);
  next = next.replace(/\bfill\s*=\s*'(?!none\b)[^']*'/gi, `fill="${color}"`);
  next = next.replace(/\bfill\s*:\s*(?!none\b)[^;}"']+/gi, `fill:${color}`);
  next = next.replace(/\bstroke\s*=\s*"(?!none\b)[^"]*"/gi, `stroke="${color}"`);
  next = next.replace(/\bstroke\s*=\s*'(?!none\b)[^']*'/gi, `stroke="${color}"`);
  next = next.replace(/\bstroke\s*:\s*(?!none\b)[^;}"']+/gi, `stroke:${color}`);
  next = next.replace(/<path\b([^>]*)>/gi, (full, attrs: string) => {
    if (/\bfill\s*[:=]/i.test(attrs)) return full;
    if (/\bstroke\s*[:=]/i.test(attrs)) return full;
    return `<path fill="${color}"${attrs}>`;
  });
  return next;
}

export function renderLogo(svg: string, size: number): Rendered {
  if (!Number.isFinite(size) || size < 1) {
    throw new Error("Logo render size must be a positive number.");
  }
  const Ctor = loadResvg();
  let image: RenderedImage;
  try {
    const renderer = new Ctor(svg, {
      fitTo: { mode: "width", value: Math.round(size) },
      background: "rgba(0,0,0,0)",
      font: { loadSystemFonts: false },
      shapeRendering: 2,
    });
    image = renderer.render();
  } catch {
    throw new Error("Logo SVG could not be rendered.");
  }
  if (image.width < 1 || image.height < 1) {
    throw new Error("Logo SVG could not be rendered.");
  }
  return { pixels: image.pixels, width: image.width, height: image.height, png: image.asPng() };
}

/**
 * Filled area in user units, plus a scale-normalized 64² mask.
 * The mask ignores translation and uniform scale so a tighter viewBox
 * can still match. Area is the geometric ink, so a shrunk path does not.
 */
export function measureSilhouette(svg: string): Silhouette {
  const box = readViewBox(svg);
  const px = Math.max(32, Math.round(box.w * PX_PER_UNIT));
  const raster = renderLogo(svg, px);
  let ink = 0;
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (alpha(raster.pixels, y * raster.width + x) < AREA_ALPHA) continue;
      ink += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const scaleX = box.w / raster.width;
  const scaleY = box.h / raster.height;
  const grid = new Uint8Array(GRID * GRID);
  if (maxX >= minX && maxY >= minY) {
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const fit = (GRID - 2) / Math.max(bw, bh);
    const ox = (GRID - bw * fit) / 2;
    const oy = (GRID - bh * fit) / 2;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (alpha(raster.pixels, y * raster.width + x) < AREA_ALPHA) continue;
        const gx = clampIndex(ox + (x - minX) * fit);
        const gy = clampIndex(oy + (y - minY) * fit);
        grid[gy * GRID + gx] = 1;
      }
    }
  }
  return { area: ink * scaleX * scaleY, grid };
}

export function silhouetteDelta(
  before: Silhouette,
  after: Silhouette,
): { areaDelta: number; iou: number } {
  const base = Math.max(before.area, 1e-6);
  const areaDelta = Math.abs(before.area - after.area) / base;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < before.grid.length; i += 1) {
    const left = before.grid[i] === 1;
    const right = after.grid[i] === 1;
    if (left && right) inter += 1;
    if (left || right) union += 1;
  }
  return { areaDelta, iou: union === 0 ? 1 : inter / union };
}

export async function checkLogo(svg: string): Promise<LogoCheck> {
  if (typeof svg !== "string" || !/<svg\b/i.test(svg)) {
    throw new Error("Logo SVG needs an svg element.");
  }
  const px32 = scoreAt(svg, 32);
  const px16 = scoreAt(svg, 16);
  const raster = renderLogo(svg, 32);
  const squint = squintScore(raster.pixels, raster.width, raster.height);
  return { px32, px16, squint, advice: advise(px32, px16, squint) };
}

export function squintScore(pixels: Uint8Array, width: number, height: number): number {
  const alphaPlane = new Float32Array(width * height);
  for (let i = 0; i < alphaPlane.length; i += 1) {
    alphaPlane[i] = alpha(pixels, i) / 255;
  }
  const blurred = blurAlpha(alphaPlane, width, height, SQUINT_SIGMA);
  let ink = 0;
  let mass = 0;
  for (let i = 0; i < alphaPlane.length; i += 1) {
    if ((alphaPlane[i] ?? 0) < 0.5) continue;
    ink += 1;
    mass += blurred[i] ?? 0;
  }
  if (ink === 0) return 0;
  return clamp01(mass / ink);
}

export function connectedComponents(pixels: Uint8Array, width: number, height: number): number {
  const count = width * height;
  const seen = new Uint8Array(count);
  let components = 0;
  const stack: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (seen[index] === 1 || alpha(pixels, index) < INK_ALPHA) continue;
    components += 1;
    seen[index] = 1;
    stack.push(index);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      const x = current % width;
      const y = (current - x) / width;
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1,
      ];
      for (const next of neighbors) {
        if (next < 0 || seen[next] === 1 || alpha(pixels, next) < INK_ALPHA) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return components;
}

function scoreAt(svg: string, size: number): LegibilityScore {
  const original = renderLogo(svg, size);
  const one = renderLogo(paintLogo(svg, "#000000"), size);
  const reversed = renderLogo(paintLogo(svg, "#ffffff"), size);
  const pixels = original.width * original.height;
  return {
    filledRatio: countInk(original.pixels) / pixels,
    components: connectedComponents(original.pixels, original.width, original.height),
    oneColourFilledRatio: countInk(one.pixels) / (one.width * one.height),
    reversedFilledRatio: countInk(reversed.pixels) / (reversed.width * reversed.height),
  };
}

function advise(px32: LegibilityScore, px16: LegibilityScore, squint: number): string[] {
  const advice: string[] = [];
  const thin =
    (px32.components > 0 && px16.components === 0) ||
    (px32.filledRatio >= 0.004 && px16.filledRatio < px32.filledRatio * 0.4);
  if (thin) {
    advice.push("Very thin strokes vanish at 16 px. A simplified favicon mark will hold.");
  }
  if (px32.filledRatio < 0.004 && px16.filledRatio < 0.004) {
    advice.push("The mark does not read at 32 px or 16 px.");
  }
  if (px32.components > 12) {
    advice.push("The mark breaks into many pieces at 32 px. Join the silhouette.");
  }
  if (px32.filledRatio > 0.92) {
    advice.push("The mark is nearly solid at 32 px. Open some counter space.");
  }
  if (px32.filledRatio > 0.01 && px32.oneColourFilledRatio < px32.filledRatio * 0.6) {
    advice.push("The mark loses ink in one colour. Keep a single colour that still reads.");
  }
  if (
    px32.oneColourFilledRatio > 0.01 &&
    px32.reversedFilledRatio < px32.oneColourFilledRatio * 0.6
  ) {
    advice.push("The reversed white mark does not hold the same ink.");
  }
  if (px32.filledRatio > 0.01 && squint < 0.35) {
    advice.push("A squint washes the mark out. Simplify the silhouette.");
  }
  advice.push(LOGO_HAPPY_QUESTION);
  return advice;
}

function countInk(pixels: Uint8Array): number {
  let ink = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < count; i += 1) {
    if (alpha(pixels, i) >= INK_ALPHA) ink += 1;
  }
  return ink;
}

function alpha(pixels: Uint8Array, index: number): number {
  return pixels[index * 4 + 3] ?? 0;
}

function blurAlpha(
  source: Float32Array,
  width: number,
  height: number,
  sigma: number,
): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = gaussianKernel(radius, sigma);
  const horizontal = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = 0; k < kernel.length; k += 1) {
        const xx = clamp(x + k - radius, 0, width - 1);
        acc += (source[y * width + xx] ?? 0) * (kernel[k] ?? 0);
      }
      horizontal[y * width + x] = acc;
    }
  }
  const vertical = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = 0; k < kernel.length; k += 1) {
        const yy = clamp(y + k - radius, 0, height - 1);
        acc += (horizontal[yy * width + x] ?? 0) * (kernel[k] ?? 0);
      }
      vertical[y * width + x] = acc;
    }
  }
  return vertical;
}

function gaussianKernel(radius: number, sigma: number): Float64Array {
  const kernel = new Float64Array(radius * 2 + 1);
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < kernel.length; i += 1) {
    const x = i - radius;
    const weight = Math.exp(-(x * x) / denom);
    kernel[i] = weight;
    sum += weight;
  }
  for (let i = 0; i < kernel.length; i += 1) {
    kernel[i] = (kernel[i] ?? 0) / sum;
  }
  return kernel;
}

function loadResvg(): ResvgCtor {
  if (resvgCtor !== null) return resvgCtor;
  const loaded: unknown = require("@resvg/resvg-js");
  if (typeof loaded !== "object" || loaded === null) {
    throw new Error("Logo SVG could not be rendered.");
  }
  const record = loaded as Record<string, unknown>;
  const ctor = record.Resvg;
  if (typeof ctor !== "function") {
    throw new Error("Logo SVG could not be rendered.");
  }
  resvgCtor = ctor as ResvgCtor;
  return resvgCtor;
}

function readLength(svg: string, name: string): number | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`, "i").exec(svg);
  if (match?.[1] === undefined) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

function clampIndex(value: number): number {
  return clamp(Math.floor(value), 0, GRID - 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}
