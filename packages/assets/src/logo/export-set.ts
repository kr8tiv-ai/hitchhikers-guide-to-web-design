/**
 * Full logo export set. Names are [brand]-logo-[version]-[size].
 * Print paths go through pdf-lib drawSvgPath. Rasters go through resvg.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { assertLogoSvg, svgoOptimize } from "../wordmark.ts";
import { paintLogo, readViewBox, renderLogo } from "./checks.ts";
import { pngToIco } from "./ico.ts";

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const PRINT_MARGIN = 72;
const INK = rgb(17 / 255, 17 / 255, 17 / 255);

type Matrix = [number, number, number, number, number, number];

interface Move {
  k: "M";
  x: number;
  y: number;
}
interface Line {
  k: "L";
  x: number;
  y: number;
}
interface Cubic {
  k: "C";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x: number;
  y: number;
}
interface Quad {
  k: "Q";
  x1: number;
  y1: number;
  x: number;
  y: number;
}
interface Close {
  k: "Z";
}
type Seg = Move | Line | Cubic | Quad | Close;

interface DrawnPath {
  d: string;
  fill: boolean;
  stroke: boolean;
  strokeWidth: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function slugifyLogoName(value: string): string {
  const stripped = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug.length > 0 ? slug : "mark";
}

/** Conventional directory for the set. Callers pass this, or any other folder, to exportLogoSet. */
export function logoDir(projectDir: string): string {
  return path.join(projectDir, ".hitchhiker", "brand", "logo");
}

export function logoExportNames(brand: string, version: string): string[] {
  const stem = `${slugifyLogoName(brand)}-logo-${slugifyLogoName(version)}`;
  return [
    `${stem}-master.svg`,
    `${stem}-black.svg`,
    `${stem}-white.svg`,
    `${stem}-favicon.svg`,
    `${stem}-profile.png`,
    `${stem}-16.png`,
    `${stem}-32.png`,
    `${stem}-16.ico`,
    `${stem}-32.ico`,
    `${stem}-app-512.png`,
    `${stem}-512.png`,
    `${stem}-1024.png`,
    `${stem}-4096.png`,
    `${stem}-print.pdf`,
  ];
}

/** Path data in viewBox space, ready for drawSvgPath. Group transforms are baked in. */
export function pathsForPrint(svg: string): string[] {
  return extractPaths(svg).map((item) => item.d);
}

export async function exportLogoSet(
  svg: string,
  brand: string,
  version: string,
  outDir: string,
): Promise<string[]> {
  assertLogoSvg(svg);
  const master = svgoOptimize(svg);
  assertLogoSvg(master);
  const black = svgoOptimize(paintLogo(master, "#000000"));
  const white = svgoOptimize(paintLogo(master, "#ffffff"));
  const favicon = faviconSvg(master);
  assertLogoSvg(black);
  assertLogoSvg(white);
  assertLogoSvg(favicon);

  const plate = plateColor(master);
  const png16 = pngSquare(master, 16);
  const png32 = pngSquare(master, 32);
  const png512 = pngSquare(master, 512);
  const png1024 = pngSquare(master, 1024);
  const png4096 = pngSquare(master, 4096);
  const profile = pngSquare(plated(master, 512, 0.1, plate), 512);
  const app = pngSquare(plated(master, 512, 0.18, plate), 512);
  const pdf = await printPdf(master);

  const names = logoExportNames(brand, version);
  const bytes = [
    Buffer.from(master, "utf8"),
    Buffer.from(black, "utf8"),
    Buffer.from(white, "utf8"),
    Buffer.from(favicon, "utf8"),
    profile,
    png16,
    png32,
    pngToIco(png16),
    pngToIco(png32),
    app,
    png512,
    png1024,
    png4096,
    pdf,
  ];
  if (bytes.length !== names.length) {
    throw new Error("Logo export set is missing a file.");
  }

  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const body = bytes[i];
    if (name === undefined || body === undefined) {
      throw new Error("Logo export set is missing a file.");
    }
    const file = path.join(outDir, name);
    const relative = path.relative(outDir, file);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Logo export path left the output directory.");
    }
    await writeFile(file, body);
    written.push(file);
  }
  return written;
}

function faviconSvg(svg: string): string {
  const squared = squareLogo(svg);
  const sized = squared
    .replace(/\bwidth\s*=\s*"[^"]*"/i, 'width="32"')
    .replace(/\bheight\s*=\s*"[^"]*"/i, 'height="32"');
  return svgoOptimize(sized);
}

function squareLogo(svg: string): string {
  const box = readViewBox(svg);
  const side = Math.max(box.w, box.h);
  const tx = -box.x + (side - box.w) / 2;
  const ty = -box.y + (side - box.h) / 2;
  const body =
    Math.abs(tx) < 0.0001 && Math.abs(ty) < 0.0001
      ? innerSvg(svg)
      : `<g transform="translate(${num(tx)} ${num(ty)})">${innerSvg(svg)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(side)} ${num(side)}" width="${num(side)}" height="${num(side)}">${body}</svg>`;
}

function plated(svg: string, plate: number, padRatio: number, background: string): string {
  const squared = squareLogo(svg);
  const box = readViewBox(squared);
  const inset = plate * padRatio;
  const inner = plate - inset * 2;
  const scale = inner / Math.max(box.w, 1e-6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${plate} ${plate}" width="${plate}" height="${plate}"><rect width="${plate}" height="${plate}" fill="${background}"/><g transform="translate(${num(inset)} ${num(inset)}) scale(${num(scale)})">${innerSvg(squared)}</g></svg>`;
}

function pngSquare(svg: string, size: number): Buffer {
  const squared = squareLogo(svg);
  const raster = renderLogo(squared, size);
  if (raster.width !== size || raster.height !== size) {
    throw new Error(`Logo PNG rendered at ${raster.width}x${raster.height}, expected ${size}.`);
  }
  return raster.png;
}

function plateColor(svg: string): string {
  return markIsLight(svg) ? "#141414" : "#f4f1ea";
}

function markIsLight(svg: string): boolean {
  const colors: string[] = [];
  const patterns = [
    /\bfill\s*=\s*"([^"]+)"/gi,
    /\bstroke\s*=\s*"([^"]+)"/gi,
    /\b(?:fill|stroke)\s*:\s*([^;}"']+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of svg.matchAll(pattern)) {
      const raw = match[1];
      if (raw === undefined) continue;
      const color = raw.trim().toLowerCase();
      if (color.length === 0 || color === "none" || color === "transparent") continue;
      colors.push(color);
    }
  }
  if (colors.length === 0) return false;
  return colors.every((color) => {
    const luma = luminance(color);
    return luma !== null && luma > 0.72;
  });
}

function luminance(color: string): number | null {
  const named = color.replace(/\s+/g, "");
  if (named === "white") return 1;
  if (named === "black") return 0;
  const short = /^#([0-9a-f]{3})$/.exec(named);
  const long = /^#([0-9a-f]{6})$/.exec(named);
  const hex = short?.[1] ?? long?.[1];
  if (hex === undefined) return null;
  const full =
    hex.length === 3
      ? `${hex.charAt(0)}${hex.charAt(0)}${hex.charAt(1)}${hex.charAt(1)}${hex.charAt(2)}${hex.charAt(2)}`
      : hex;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

async function printPdf(svg: string): Promise<Buffer> {
  const box = readViewBox(svg);
  const paths = extractPaths(svg);
  if (paths.length === 0) {
    throw new Error("Logo SVG needs a path.");
  }
  const doc = await PDFDocument.create();
  const page = doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  const maxSide = LETTER_WIDTH - PRINT_MARGIN * 2;
  const side = Math.max(box.w, box.h, 1);
  const scale = maxSide / side;
  const x = (LETTER_WIDTH - box.w * scale) / 2;
  // drawSvgPath flips Y, so this y is the top of the viewBox.
  const y = (LETTER_HEIGHT + box.h * scale) / 2;
  for (const item of paths) {
    if (item.fill && item.stroke) {
      page.drawSvgPath(item.d, {
        x,
        y,
        scale,
        color: INK,
        borderColor: INK,
        borderWidth: item.strokeWidth,
      });
    } else if (item.fill) {
      page.drawSvgPath(item.d, { x, y, scale, color: INK });
    } else if (item.stroke) {
      page.drawSvgPath(item.d, {
        x,
        y,
        scale,
        borderColor: INK,
        borderWidth: item.strokeWidth,
      });
    }
  }
  return Buffer.from(await doc.save());
}

function extractPaths(svg: string): DrawnPath[] {
  const box = readViewBox(svg);
  const root = multiply(translate(-box.x, -box.y), IDENTITY);
  const stack: Matrix[] = [root];
  const paths: DrawnPath[] = [];
  const tagRe = /<\/?([a-zA-Z][\w:.-]*)\b([^>]*)\/?>/g;
  for (const match of svg.matchAll(tagRe)) {
    const raw = match[0];
    const name = match[1]?.toLowerCase();
    const attrs = match[2] ?? "";
    if (name === undefined) continue;
    if (raw.startsWith("</")) {
      if ((name === "g" || name === "svg") && stack.length > 1) stack.pop();
      continue;
    }
    const local = parseTransform(attr(attrs, "transform") ?? "");
    const top = stack[stack.length - 1] ?? root;
    const next = multiply(top, local);
    if (name === "g" || name === "svg") {
      stack.push(next);
      if (raw.endsWith("/>") && stack.length > 1) stack.pop();
      continue;
    }
    if (name !== "path") continue;
    const d = attr(attrs, "d");
    if (d === null || d.trim().length === 0) continue;
    const segs = transformSegs(parsePath(decodeAttr(d)), next);
    const paint = pathPaint(attrs);
    paths.push({ d: serialize(segs), ...paint });
  }
  return paths.filter((item) => item.d.trim().length > 0);
}

function pathPaint(attrs: string): { fill: boolean; stroke: boolean; strokeWidth: number } {
  const style = attr(attrs, "style") ?? "";
  const fillValue = attr(attrs, "fill") ?? styleValue(style, "fill");
  const strokeValue = attr(attrs, "stroke") ?? styleValue(style, "stroke");
  const widthRaw = attr(attrs, "stroke-width") ?? styleValue(style, "stroke-width");
  const fill = fillValue === null ? true : !isNone(fillValue);
  const stroke = strokeValue !== null && !isNone(strokeValue);
  const parsed = widthRaw === null ? 1 : Number.parseFloat(widthRaw);
  const strokeWidth = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return { fill, stroke, strokeWidth };
}

function isNone(value: string): boolean {
  const color = value.trim().toLowerCase();
  return color === "none" || color === "transparent";
}

function styleValue(style: string, name: string): string | null {
  const match = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i").exec(style);
  const value = match?.[1];
  return value === undefined ? null : value.trim();
}

function parsePath(d: string): Seg[] {
  const tokens: Array<{ cmd: string } | number> = [];
  const re = /([AaCcHhLlMmQqSsTtVvZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  for (const match of d.matchAll(re)) {
    if (match[1] !== undefined) tokens.push({ cmd: match[1] });
    else if (match[2] !== undefined) tokens.push(Number(match[2]));
  }
  const segs: Seg[] = [];
  let i = 0;
  let command = "";
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastX = 0;
  let lastY = 0;
  let prevCubic = false;
  let prevQuad = false;

  const read = (): number => {
    const token = tokens[i];
    if (typeof token !== "number") throw new Error("Logo path could not be read.");
    i += 1;
    return token;
  };
  const hasNum = (): boolean => typeof tokens[i] === "number";

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) break;
    if (typeof token !== "number") {
      command = token.cmd;
      i += 1;
    } else if (command === "") {
      throw new Error("Logo path could not be read.");
    }
    const rel = command === command.toLowerCase();
    const op = command.toUpperCase();
    if (op === "M") {
      const x = rel ? cx + read() : read();
      const y = rel ? cy + read() : read();
      segs.push({ k: "M", x, y });
      cx = x;
      cy = y;
      sx = x;
      sy = y;
      prevCubic = false;
      prevQuad = false;
      command = rel ? "l" : "L";
      while (hasNum()) {
        const lx = rel ? cx + read() : read();
        const ly = rel ? cy + read() : read();
        segs.push({ k: "L", x: lx, y: ly });
        cx = lx;
        cy = ly;
      }
      continue;
    }
    if (op === "Z") {
      segs.push({ k: "Z" });
      cx = sx;
      cy = sy;
      prevCubic = false;
      prevQuad = false;
      command = "";
      continue;
    }
    if (op === "L") {
      const x = rel ? cx + read() : read();
      const y = rel ? cy + read() : read();
      segs.push({ k: "L", x, y });
      cx = x;
      cy = y;
      prevCubic = false;
      prevQuad = false;
      continue;
    }
    if (op === "H") {
      const x = rel ? cx + read() : read();
      segs.push({ k: "L", x, y: cy });
      cx = x;
      prevCubic = false;
      prevQuad = false;
      continue;
    }
    if (op === "V") {
      const y = rel ? cy + read() : read();
      segs.push({ k: "L", x: cx, y });
      cy = y;
      prevCubic = false;
      prevQuad = false;
      continue;
    }
    if (op === "C") {
      const x1 = rel ? cx + read() : read();
      const y1 = rel ? cy + read() : read();
      const x2 = rel ? cx + read() : read();
      const y2 = rel ? cy + read() : read();
      const x = rel ? cx + read() : read();
      const y = rel ? cy + read() : read();
      segs.push({ k: "C", x1, y1, x2, y2, x, y });
      lastX = x2;
      lastY = y2;
      cx = x;
      cy = y;
      prevCubic = true;
      prevQuad = false;
      continue;
    }
    if (op === "S") {
      const x1 = prevCubic ? 2 * cx - lastX : cx;
      const y1 = prevCubic ? 2 * cy - lastY : cy;
      const x2 = rel ? cx + read() : read();
      const y2 = rel ? cy + read() : read();
      const x = rel ? cx + read() : read();
      const y = rel ? cy + read() : read();
      segs.push({ k: "C", x1, y1, x2, y2, x, y });
      lastX = x2;
      lastY = y2;
      cx = x;
      cy = y;
      prevCubic = true;
      prevQuad = false;
      continue;
    }
    if (op === "Q") {
      const x1 = rel ? cx + read() : read();
      const y1 = rel ? cy + read() : read();
      const x = rel ? cx + read() : read();
      const y = rel ? cy + read() : read();
      segs.push({ k: "Q", x1, y1, x, y });
      lastX = x1;
      lastY = y1;
      cx = x;
      cy = y;
      prevQuad = true;
      prevCubic = false;
      continue;
    }
    if (op === "T") {
      const x1 = prevQuad ? 2 * cx - lastX : cx;
      const y1 = prevQuad ? 2 * cy - lastY : cy;
      const x = rel ? cx + read() : read();
      const y = rel ? cy + read() : read();
      segs.push({ k: "Q", x1, y1, x, y });
      lastX = x1;
      lastY = y1;
      cx = x;
      cy = y;
      prevQuad = true;
      prevCubic = false;
      continue;
    }
    if (op === "A") {
      const rx = read();
      const ry = read();
      const angle = read();
      const large = read() >= 0.5 ? 1 : 0;
      const sweep = read() >= 0.5 ? 1 : 0;
      const x = rel ? cx + read() : read();
      const y = rel ? cy + read() : read();
      const curves = arcToCubics(cx, cy, rx, ry, angle, large, sweep, x, y);
      if (curves.length === 0) segs.push({ k: "L", x, y });
      for (const curve of curves) segs.push({ k: "C", ...curve });
      cx = x;
      cy = y;
      prevCubic = false;
      prevQuad = false;
      continue;
    }
    throw new Error("Logo path could not be read.");
  }
  return segs;
}

function arcToCubics(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  angleDeg: number,
  large: number,
  sweep: number,
  x2: number,
  y2: number,
): Array<Omit<Cubic, "k">> {
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx === 0 || ry === 0) return [];
  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  let rxAbs = Math.abs(rx);
  let ryAbs = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
  if (lambda > 1) {
    const grown = Math.sqrt(lambda);
    rxAbs *= grown;
    ryAbs *= grown;
  }
  const rxSq = rxAbs * rxAbs;
  const rySq = ryAbs * ryAbs;
  const num = Math.max(0, rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p);
  const den = rxSq * y1p * y1p + rySq * x1p * x1p;
  let coef = den === 0 ? 0 : Math.sqrt(num / den);
  if (large === sweep) coef = -coef;
  const cxp = (coef * rxAbs * y1p) / ryAbs;
  const cyp = (-coef * ryAbs * x1p) / rxAbs;
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;
  const start = Math.atan2((y1p - cyp) / ryAbs, (x1p - cxp) / rxAbs);
  let delta = Math.atan2((-y1p - cyp) / ryAbs, (-x1p - cxp) / rxAbs) - start;
  if (sweep === 0 && delta > 0) delta -= Math.PI * 2;
  if (sweep === 1 && delta < 0) delta += Math.PI * 2;
  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
  const step = delta / pieces;
  const curves: Array<Omit<Cubic, "k">> = [];
  const map = (u: number, v: number): [number, number] => [
    cx + cosPhi * rxAbs * u - sinPhi * ryAbs * v,
    cy + sinPhi * rxAbs * u + cosPhi * ryAbs * v,
  ];
  for (let piece = 0; piece < pieces; piece += 1) {
    const t1 = start + piece * step;
    const t2 = t1 + step;
    const alpha = (4 / 3) * Math.tan(step / 4);
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);
    const c1 = map(cos1 + alpha * -sin1, sin1 + alpha * cos1);
    const c2 = map(cos2 - alpha * -sin2, sin2 - alpha * cos2);
    const end = map(cos2, sin2);
    curves.push({ x1: c1[0], y1: c1[1], x2: c2[0], y2: c2[1], x: end[0], y: end[1] });
  }
  return curves;
}

function transformSegs(segs: Seg[], matrix: Matrix): Seg[] {
  const point = (x: number, y: number): [number, number] => [
    matrix[0] * x + matrix[2] * y + matrix[4],
    matrix[1] * x + matrix[3] * y + matrix[5],
  ];
  return segs.map((seg) => {
    if (seg.k === "Z") return seg;
    if (seg.k === "M" || seg.k === "L") {
      const [x, y] = point(seg.x, seg.y);
      return { ...seg, x, y };
    }
    if (seg.k === "Q") {
      const [x1, y1] = point(seg.x1, seg.y1);
      const [x, y] = point(seg.x, seg.y);
      return { k: "Q", x1, y1, x, y };
    }
    const [x1, y1] = point(seg.x1, seg.y1);
    const [x2, y2] = point(seg.x2, seg.y2);
    const [x, y] = point(seg.x, seg.y);
    return { k: "C", x1, y1, x2, y2, x, y };
  });
}

function serialize(segs: Seg[]): string {
  return segs
    .map((seg) => {
      if (seg.k === "Z") return "Z";
      if (seg.k === "M") return `M${num(seg.x)} ${num(seg.y)}`;
      if (seg.k === "L") return `L${num(seg.x)} ${num(seg.y)}`;
      if (seg.k === "Q") return `Q${num(seg.x1)} ${num(seg.y1)} ${num(seg.x)} ${num(seg.y)}`;
      return `C${num(seg.x1)} ${num(seg.y1)} ${num(seg.x2)} ${num(seg.y2)} ${num(seg.x)} ${num(seg.y)}`;
    })
    .join(" ");
}

function parseTransform(value: string): Matrix {
  let matrix: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  for (const match of value.matchAll(re)) {
    const name = match[1]?.toLowerCase();
    const body = match[2];
    if (name === undefined || body === undefined) continue;
    const args = numbers(body);
    matrix = multiply(matrix, transformOp(name, args));
  }
  return matrix;
}

function transformOp(name: string, args: number[]): Matrix {
  if (name === "translate") {
    return translate(args[0] ?? 0, args[1] ?? 0);
  }
  if (name === "scale") {
    const sx = args[0] ?? 1;
    return scale(sx, args[1] ?? sx);
  }
  if (name === "matrix") {
    return [
      args[0] ?? 1,
      args[1] ?? 0,
      args[2] ?? 0,
      args[3] ?? 1,
      args[4] ?? 0,
      args[5] ?? 0,
    ];
  }
  if (name === "rotate") {
    const angle = ((args[0] ?? 0) * Math.PI) / 180;
    const rot = rotate(angle);
    const cx = args[1];
    const cy = args[2];
    if (cx === undefined || cy === undefined) return rot;
    return multiply(multiply(translate(cx, cy), rot), translate(-cx, -cy));
  }
  if (name === "skewx") {
    return [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
  }
  if (name === "skewy") {
    return [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
  }
  return IDENTITY;
}

function multiply(after: Matrix, before: Matrix): Matrix {
  return [
    after[0] * before[0] + after[2] * before[1],
    after[1] * before[0] + after[3] * before[1],
    after[0] * before[2] + after[2] * before[3],
    after[1] * before[2] + after[3] * before[3],
    after[0] * before[4] + after[2] * before[5] + after[4],
    after[1] * before[4] + after[3] * before[5] + after[5],
  ];
}

function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

function scale(x: number, y: number): Matrix {
  return [x, 0, 0, y, 0, 0];
}

function rotate(angle: number): Matrix {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, sin, -sin, cos, 0, 0];
}

function numbers(value: string): number[] {
  const found: number[] = [];
  for (const match of value.matchAll(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)) {
    const parsed = Number(match[0]);
    if (Number.isFinite(parsed)) found.push(parsed);
  }
  return found;
}

function attr(source: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(source);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? null : value;
}

function decodeAttr(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function innerSvg(svg: string): string {
  const open = /<svg\b[^>]*>/i.exec(svg);
  if (open === null || open.index === undefined) {
    throw new Error("Logo SVG needs an svg element.");
  }
  const start = open.index + open[0].length;
  const end = svg.toLowerCase().lastIndexOf("</svg>");
  if (end < start) throw new Error("Logo SVG needs an svg element.");
  return svg.slice(start, end);
}

function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (!Number.isFinite(rounded) || Object.is(rounded, -0)) return "0";
  return String(rounded);
}
