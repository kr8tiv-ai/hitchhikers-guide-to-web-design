/**
 * Side-by-side compare of an approved sketch and a built screenshot.
 * Metrics run in Chromium canvas. No native image library.
 * The browser scripts are plain strings: Node type stripping must not leak into the page.
 * runCompGate lives in the engine. This file re-exports it so the compare module is one import.
 */

import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile, type ChildProcess } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { chromium, type Browser } from "playwright";
import { runCompGate } from "@hitchhiker/engine";

export { runCompGate };

const execFileAsync = promisify(execFile);

const DESK_PORT = "4175";
const LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];

export interface ComparePicture {
  layout: number;
  palette: number;
  edge: number[];
  width: number;
  height: number;
  shotWidth: number;
  leftInk: number;
  rightInk: number;
}

export interface ShootRequest {
  url: string;
  viewport: { width: number; height: number };
  fullPage: boolean;
  out: string;
  timeoutMs: number;
}

export interface MotionRecordRequest {
  url: string;
  seconds: number;
  band?: { y: number; height: number };
  longHeight: number;
  outDir: string;
  timeoutMs: number;
}

interface MeasureInput {
  shot: string;
  comp: string;
}

interface MeasureOutput extends ComparePicture {
  jpeg: string;
}

const relay = new Function(
  "packed",
  "return new Function('input', packed.source)(packed.input);",
) as (packed: { source: string; input: unknown }) => Promise<unknown>;

/**
 * CIEDE2000 in degrees. The Sharma pair Lab(50, 2.6772, -79.7751) and
 * Lab(50, 0, -82.7485) is about 2.0425. Do not swap this for a simpler delta.
 */
const MEASURE_SOURCE = `return (async () => {
  const FONT = {
    " ": ["00000","00000","00000","00000","00000","00000","00000"],
    "0": ["01110","10001","10011","10101","11001","10001","01110"],
    "1": ["00100","01100","00100","00100","00100","00100","01110"],
    "2": ["01110","10001","00001","00010","00100","01000","11111"],
    "3": ["11110","00001","00001","01110","00001","00001","11110"],
    "4": ["00010","00110","01010","10010","11111","00010","00010"],
    "5": ["11111","10000","11110","00001","00001","10001","01110"],
    "6": ["00110","01000","10000","11110","10001","10001","01110"],
    "7": ["11111","00001","00010","00100","01000","01000","01000"],
    "8": ["01110","10001","10001","01110","10001","10001","01110"],
    "9": ["01110","10001","10001","01111","00001","00010","01100"],
    B: ["11110","10001","10001","11110","10001","10001","11110"],
    C: ["01110","10001","10000","10000","10000","10001","01110"],
    D: ["11110","10001","10001","10001","10001","10001","11110"],
    I: ["01110","00100","00100","00100","00100","00100","01110"],
    L: ["10000","10000","10000","10000","10000","10000","11111"],
    M: ["10001","11011","10101","10101","10001","10001","10001"],
    O: ["01110","10001","10001","10001","10001","10001","01110"],
    P: ["11110","10001","10001","11110","10000","10000","10000"],
    U: ["10001","10001","10001","10001","10001","10001","01110"]
  };
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("The picture could not be read.")); };
      img.src = src;
    });
  }
  function srgbToLab(r, g, b) {
    function lin(channel) {
      const u = channel / 255;
      return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
    }
    const R = lin(r);
    const G = lin(g);
    const B = lin(b);
    const x = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
    const y = (R * 0.2126729 + G * 0.7151522 + B * 0.072175) / 1;
    const z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
    const EPS = 216 / 24389;
    const KAPPA = 24389 / 27;
    function f(t) { return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116; }
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function deltaE(lab1, lab2) {
    const L1 = lab1[0], a1 = lab1[1], b1 = lab1[2];
    const L2 = lab2[0], a2 = lab2[1], b2 = lab2[2];
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cbar = (C1 + C2) / 2;
    const Cbar7 = Math.pow(Cbar, 7);
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    function hue(a, b) {
      if (Math.hypot(a, b) < 1e-12) return 0;
      const h = Math.atan2(b, a) * 180 / Math.PI;
      return h < 0 ? h + 360 : h;
    }
    const H1 = hue(a1p, b1);
    const H2 = hue(a2p, b2);
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dh = 0;
    if (C1p * C2p !== 0) {
      dh = H2 - H1;
      if (dh > 180) dh -= 360;
      else if (dh < -180) dh += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * Math.PI) / 360);
    const Lp = (L1 + L2) / 2;
    const Cp = (C1p + C2p) / 2;
    let Hp = (H1 + H2) / 2;
    if (C1p * C2p !== 0 && Math.abs(H1 - H2) > 180) Hp += H1 + H2 < 360 ? 180 : -180;
    const rad = Math.PI / 180;
    const T = 1 - 0.17 * Math.cos((Hp - 30) * rad) + 0.24 * Math.cos(2 * Hp * rad) + 0.32 * Math.cos((3 * Hp + 6) * rad) - 0.2 * Math.cos((4 * Hp - 63) * rad);
    const dRo = 30 * Math.exp(-Math.pow((Hp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cp, 7) / (Math.pow(Cp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lp - 50, 2)) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
    const Sc = 1 + 0.045 * Cp;
    const Sh = 1 + 0.015 * Cp * T;
    const Rt = -Math.sin(2 * dRo * rad) * Rc;
    const l = dLp / Sl;
    const c = dCp / Sc;
    const h = dHp / Sh;
    return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
  }
  function gridOf(img) {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("The picture could not be read.");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const cols = 32;
    const rows = 18;
    const luma = [];
    const color = [];
    for (let gy = 0; gy < rows; gy++) {
      const y0 = Math.floor((gy * img.height) / rows);
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * img.height) / rows));
      const rowL = [];
      const rowC = [];
      for (let gx = 0; gx < cols; gx++) {
        const x0 = Math.floor((gx * img.width) / cols);
        const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * img.width) / cols));
        let rs = 0, gs = 0, bs = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * img.width + x) * 4;
            rs += data[i];
            gs += data[i + 1];
            bs += data[i + 2];
            n += 1;
          }
        }
        const r = rs / n;
        const g = gs / n;
        const b = bs / n;
        rowL.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
        rowC.push([r, g, b]);
      }
      luma.push(rowL);
      color.push(rowC);
    }
    return { luma: luma, color: color };
  }
  function layoutScore(a, b) {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < a.length; y++) {
      for (let x = 0; x < a[y].length; x++) {
        sum += Math.abs(a[y][x] - b[y][x]);
        n += 1;
      }
    }
    return n === 0 ? 0 : 1 - sum / n / 255;
  }
  function paletteOf(colors) {
    const bins = new Map();
    for (let y = 0; y < colors.length; y++) {
      for (let x = 0; x < colors[y].length; x++) {
        const px = colors[y][x];
        const qr = Math.min(15, Math.max(0, Math.floor(px[0] / 16)));
        const qg = Math.min(15, Math.max(0, Math.floor(px[1] / 16)));
        const qb = Math.min(15, Math.max(0, Math.floor(px[2] / 16)));
        const key = qr + "," + qg + "," + qb;
        bins.set(key, (bins.get(key) || 0) + 1);
      }
    }
    const ranked = [...bins.entries()].sort(function (left, right) {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0;
    });
    if (ranked.length === 0) throw new Error("The picture could not be read.");
    const top = ranked.slice(0, 5).map(function (entry) { return entry[0]; });
    while (top.length < 5) top.push(top[0]);
    return top.map(function (key) {
      const parts = key.split(",");
      return srgbToLab(Number(parts[0]) * 16, Number(parts[1]) * 16, Number(parts[2]) * 16);
    });
  }
  function meanDelta(a, b) {
    const order = [0, 1, 2, 3, 4];
    let best = Infinity;
    function walk(start) {
      if (start === 5) {
        let sum = 0;
        for (let i = 0; i < 5; i++) sum += deltaE(a[i], b[order[i]]);
        if (sum < best) best = sum;
        return;
      }
      for (let i = start; i < 5; i++) {
        const swap = order[start];
        order[start] = order[i];
        order[i] = swap;
        walk(start + 1);
        order[i] = order[start];
        order[start] = swap;
      }
    }
    walk(0);
    return best / 5;
  }
  function edgeBands(luma) {
    const bands = [];
    for (let band = 0; band < 6; band++) {
      const y0 = band * 3;
      let edges = 0;
      let pairs = 0;
      for (let y = y0; y < y0 + 3; y++) {
        for (let x = 0; x < 32; x++) {
          if (x + 1 < 32) {
            pairs += 1;
            if (Math.abs(luma[y][x] - luma[y][x + 1]) > 40) edges += 1;
          }
          if (y + 1 < y0 + 3) {
            pairs += 1;
            if (Math.abs(luma[y][x] - luma[y + 1][x]) > 40) edges += 1;
          }
        }
      }
      bands.push(pairs === 0 ? 0 : edges / pairs);
    }
    return bands;
  }
  function textWidth(text, scale) {
    return text.length * (6 * scale);
  }
  function drawText(ctx, text, x, y, scale) {
    ctx.fillStyle = "#161616";
    for (let i = 0; i < text.length; i++) {
      const rows = FONT[text[i]] || FONT[" "];
      for (let row = 0; row < rows.length; row++) {
        const line = rows[row];
        for (let col = 0; col < line.length; col++) {
          if (line[col] !== "1") continue;
          ctx.fillRect(x + i * (6 * scale) + col * scale, y + row * scale, scale, scale);
        }
      }
    }
  }
  function panelWidth(img, targetHeight) {
    if (!img.width || !img.height) throw new Error("The picture could not be read.");
    return Math.max(1, Math.round((img.width * targetHeight) / img.height));
  }
  const shot = await loadImage(input.shot);
  const comp = await loadImage(input.comp);
  const shotGrid = gridOf(shot);
  const compGrid = gridOf(comp);
  const layout = layoutScore(compGrid.luma, shotGrid.luma);
  const palette = meanDelta(paletteOf(compGrid.color), paletteOf(shotGrid.color));
  const compEdge = edgeBands(compGrid.luma);
  const shotEdge = edgeBands(shotGrid.luma);
  const edge = compEdge.map(function (value, index) { return Math.abs(value - shotEdge[index]); });
  const targetH = comp.height;
  const leftW = panelWidth(comp, targetH);
  const rightW = panelWidth(shot, targetH);
  const label = "BUILD " + String(shot.width);
  const canvas = document.createElement("canvas");
  canvas.width = leftW + rightW;
  canvas.height = targetH + 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The picture could not be read.");
  ctx.fillStyle = "#f6f3ee";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(comp, 0, 32, leftW, targetH);
  ctx.drawImage(shot, leftW, 32, rightW, targetH);
  const leftScale = textWidth("COMP", 2) <= leftW - 8 ? 2 : 1;
  const rightScale = textWidth(label, 2) <= rightW - 8 ? 2 : 1;
  drawText(ctx, "COMP", 8, Math.floor((32 - 7 * leftScale) / 2), leftScale);
  drawText(ctx, label, leftW + 8, Math.floor((32 - 7 * rightScale) / 2), rightScale);
  const url = canvas.toDataURL("image/jpeg", 0.92);
  const jpg = await loadImage(url);
  const inkCanvas = document.createElement("canvas");
  inkCanvas.width = jpg.width;
  inkCanvas.height = jpg.height;
  const inkCtx = inkCanvas.getContext("2d");
  if (!inkCtx) throw new Error("The picture could not be read.");
  inkCtx.drawImage(jpg, 0, 0);
  const bar = Math.min(32, jpg.height);
  const pixels = inkCtx.getImageData(0, 0, jpg.width, bar).data;
  function inkBetween(x0, x1) {
    let n = 0;
    for (let y = 0; y < bar; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * jpg.width + x) * 4;
        if (pixels[i] < 80 && pixels[i + 1] < 80 && pixels[i + 2] < 80) n += 1;
      }
    }
    return n;
  }
  const comma = url.indexOf(",");
  return {
    layout: layout,
    palette: palette,
    edge: edge,
    width: canvas.width,
    height: canvas.height,
    shotWidth: shot.width,
    leftInk: inkBetween(0, leftW),
    rightInk: inkBetween(leftW, jpg.width),
    jpeg: comma === -1 ? "" : url.slice(comma + 1)
  };
})();`;

const SHEET_SOURCE = `return (async () => {
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("The picture could not be read.")); };
      img.src = src;
    });
  }
  const frames = [];
  for (let i = 0; i < input.frames.length; i++) frames.push(await loadImage(input.frames[i]));
  if (frames.length === 0) throw new Error("The motion frames are missing.");
  const cols = 4;
  const rows = Math.ceil(frames.length / cols);
  const cellW = 160;
  const cellH = 90;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cellW;
  canvas.height = rows * cellH + 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The picture could not be read.");
  ctx.fillStyle = "#f6f3ee";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#161616";
  ctx.font = "16px sans-serif";
  ctx.fillText(input.label, 8, 22);
  for (let i = 0; i < frames.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    ctx.drawImage(frames[i], col * cellW, 32 + row * cellH, cellW, cellH);
  }
  const url = canvas.toDataURL("image/jpeg", 0.92);
  const comma = url.indexOf(",");
  return comma === -1 ? "" : url.slice(comma + 1);
})();`;

const SCROLL_SOURCE = `return (async () => {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  const body = document.body;
  const scrollHeight = Math.max(root ? root.scrollHeight : 0, body ? body.scrollHeight : 0);
  const view = window.innerHeight || 720;
  const maxScroll = Math.max(0, scrollHeight - view);
  let start = 0;
  let end = maxScroll;
  if (arg.band && arg.longHeight > 0 && scrollHeight > 0) {
    const scale = scrollHeight / arg.longHeight;
    start = Math.min(maxScroll, Math.max(0, arg.band.y * scale));
    end = Math.min(maxScroll, Math.max(start, (arg.band.y + arg.band.height) * scale - view));
  }
  const seconds = Math.max(1, Math.min(10, arg.seconds || 6));
  const steps = reduce ? 1 : Math.max(8, Math.round(seconds * 12));
  const wait = reduce ? 0 : Math.round((seconds * 1000) / steps);
  for (let i = 0; i <= steps; i++) {
    const y = start + ((end - start) * i) / steps;
    window.scrollTo(0, y);
    if (wait > 0) await new Promise(function (resolve) { setTimeout(resolve, wait); });
  }
})();`;

export function chromiumReady(): boolean {
  try {
    const executablePath = chromium.executablePath();
    return executablePath !== "" && existsSync(executablePath);
  } catch {
    return false;
  }
}

function requireChromium(): string {
  let executablePath = "";
  try {
    executablePath = chromium.executablePath();
  } catch {
    executablePath = "";
  }
  if (executablePath === "" || !existsSync(executablePath)) {
    throw new Error("Chromium is not installed. The compare cannot shoot the page.");
  }
  return executablePath;
}

async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    executablePath: requireChromium(),
    args: LAUNCH_ARGS,
  });
}

function launchedProcess(browser: Browser): ChildProcess | null {
  const owner = browser as Browser & { process?: () => ChildProcess | null };
  if (typeof owner.process !== "function") return null;
  return owner.process();
}

async function closeBrowser(browser: Browser): Promise<void> {
  await Promise.race([
    browser.close().then(
      () => undefined,
      () => undefined,
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  const child = launchedProcess(browser);
  if (child !== null && child.exitCode === null && !child.killed) {
    try {
      child.kill("SIGKILL");
    } catch {
      // The browser this compare started is already gone.
    }
  }
}

function assertNotDesk(url: string): void {
  let port = "";
  try {
    const parsed = new URL(url);
    port = parsed.port === "" ? (parsed.protocol === "https:" ? "443" : "80") : parsed.port;
  } catch {
    throw new Error("The preview address is not a page.");
  }
  if (port === DESK_PORT) {
    throw new Error("Refusing the desk port 4175. The compare uses the site preview.");
  }
}

function dataUrl(file: string, bytes: Buffer): string {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function readMeasure(value: unknown): MeasureOutput {
  if (typeof value !== "object" || value === null) throw new Error("The compare did not return scores.");
  const record = value as Record<string, unknown>;
  const edge = record.edge;
  if (!Array.isArray(edge)) throw new Error("The compare did not return scores.");
  const edges: number[] = [];
  for (const item of edge) {
    if (typeof item !== "number" || !Number.isFinite(item)) throw new Error("The compare did not return scores.");
    edges.push(item);
  }
  const fields = ["layout", "palette", "width", "height", "shotWidth", "leftInk", "rightInk"] as const;
  const numbers: Record<(typeof fields)[number], number> = {
    layout: 0,
    palette: 0,
    width: 0,
    height: 0,
    shotWidth: 0,
    leftInk: 0,
    rightInk: 0,
  };
  for (const field of fields) {
    const item = record[field];
    if (typeof item !== "number" || !Number.isFinite(item)) throw new Error("The compare did not return scores.");
    numbers[field] = item;
  }
  if (typeof record.jpeg !== "string" || record.jpeg === "") throw new Error("The compare did not return a picture.");
  return { ...numbers, edge: edges, jpeg: record.jpeg };
}

/** Labelled COMP / BUILD composite plus coarse layout, palette, and edge scores. */
export async function compareToComp(input: {
  shot: string;
  comp: string;
  view: string;
  out: string;
}): Promise<ComparePicture> {
  const shotBytes = await readFile(input.shot);
  const compBytes = await readFile(input.comp);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20_000);
    await page.setContent("<!doctype html><title>compare</title>");
    const raw = await page.evaluate(relay, {
      source: MEASURE_SOURCE,
      input: {
        shot: dataUrl(input.shot, shotBytes),
        comp: dataUrl(input.comp, compBytes),
        view: input.view,
      } satisfies MeasureInput & { view: string },
    });
    const measured = readMeasure(raw);
    await mkdir(path.dirname(input.out), { recursive: true });
    await writeFile(input.out, Buffer.from(measured.jpeg, "base64"));
    return {
      layout: measured.layout,
      palette: measured.palette,
      edge: measured.edge,
      width: measured.width,
      height: measured.height,
      shotWidth: measured.shotWidth,
      leftInk: measured.leftInk,
      rightInk: measured.rightInk,
    };
  } finally {
    await closeBrowser(browser);
  }
}

function pngSize(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) {
    throw new Error("The shot is not a picture.");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Fold viewport, or the full page when the approved view is the long sketch. */
export async function shootBuiltView(req: ShootRequest): Promise<{ width: number; height: number; file: string }> {
  assertNotDesk(req.url);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: req.viewport.width, height: req.viewport.height },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(req.timeoutMs);
    await page.goto(req.url, { waitUntil: "load", timeout: req.timeoutMs });
    await mkdir(path.dirname(req.out), { recursive: true });
    const bytes = await page.screenshot({
      path: req.out,
      fullPage: req.fullPage,
      type: "png",
      animations: "disabled",
      timeout: req.timeoutMs,
    });
    const size = pngSize(Buffer.from(bytes));
    return { width: size.width, height: size.height, file: req.out };
  } finally {
    await closeBrowser(browser);
  }
}

const scroll = new Function("arg", SCROLL_SOURCE) as (arg: {
  seconds: number;
  band: { y: number; height: number } | null;
  longHeight: number;
}) => Promise<void>;

/** 1280 by 720 scroll through the section, matching the motion clip length. */
export async function recordSectionMotion(req: MotionRecordRequest): Promise<{ video: string }> {
  assertNotDesk(req.url);
  await mkdir(req.outDir, { recursive: true });
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      recordVideo: { dir: req.outDir, size: { width: 1280, height: 720 } },
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(req.timeoutMs);
      await page.goto(req.url, { waitUntil: "load", timeout: req.timeoutMs });
      await page.evaluate(scroll, {
        seconds: req.seconds,
        band: req.band ?? null,
        longHeight: req.longHeight,
      });
      const video = page.video();
      await page.close();
      const recorded = video === null ? "" : await video.path();
      await context.close();
      if (recorded === "") throw new Error("The motion recording is missing.");
      const stable = path.join(req.outDir, "recorded.webm");
      if (path.resolve(recorded) !== path.resolve(stable)) await copyFile(recorded, stable);
      return { video: stable };
    } finally {
      await context.close().catch(() => undefined);
    }
  } finally {
    await closeBrowser(browser);
  }
}

export async function ffmpegOnPath(): Promise<boolean> {
  try {
    await execFileAsync("ffmpeg", ["-version"], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

/** Pull up to `count` frames. Missing ffmpeg throws. Fewer frames is allowed. */
export async function extractFrames(video: string, outDir: string, count: number): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const pattern = path.join(outDir, "frame-%02d.png");
  await execFileAsync(
    "ffmpeg",
    ["-y", "-i", video, "-frames:v", String(count), "-vf", "fps=2", pattern],
    { timeout: 30_000 },
  );
  const names = (await readdir(outDir))
    .filter((name) => name.startsWith("frame-") && name.endsWith(".png"))
    .sort();
  return names.map((name) => path.join(outDir, name));
}

/** Contact sheet. The label says which half is the sketch. */
export async function writeMotionSheet(frames: string[], out: string, label = "COMP then BUILD"): Promise<void> {
  if (frames.length === 0) throw new Error("The motion frames are missing.");
  const urls: string[] = [];
  for (const frame of frames) {
    const bytes = await readFile(frame);
    urls.push(dataUrl(frame, bytes));
  }
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><title>motion</title>");
    const raw = await page.evaluate(relay, {
      source: SHEET_SOURCE,
      input: { frames: urls, label },
    });
    if (typeof raw !== "string" || raw === "") throw new Error("The motion sheet is missing.");
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, Buffer.from(raw, "base64"));
  } finally {
    await closeBrowser(browser);
  }
}
