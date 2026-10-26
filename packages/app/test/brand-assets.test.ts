import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { contrastRatio, color } from "../src/design/tokens.ts";
import { PRODUCT_NAME, THEME_DARK, THEME_LIGHT } from "../src/server/head.ts";
import { startServer, type ServerHandle } from "../src/server/server.ts";
import { removeTempDir } from "./remove-temp.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const repoRoot = path.resolve(appRoot, "..", "..");
const publicDir = path.join(appRoot, "public");
const docsAssets = path.join(repoRoot, "docs", "assets");

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const FILES = [
  "packages/app/public/brand/logo-mark.svg",
  "packages/app/public/brand/logo-mark-dark.svg",
  "packages/app/public/brand/logo-lockup.svg",
  "packages/app/public/brand/social-card.svg",
  "packages/app/public/favicon.svg",
  "packages/app/public/favicon.ico",
  "packages/app/public/apple-touch-icon.png",
  "packages/app/public/icons/icon-192.png",
  "packages/app/public/icons/icon-512.png",
  "packages/app/public/icons/icon-maskable-192.png",
  "packages/app/public/icons/icon-maskable-512.png",
  "packages/app/public/social-card.png",
  "packages/app/public/manifest.webmanifest",
  "packages/app/scripts/build-brand-assets.ts",
  "docs/assets/social-card.png",
  "docs/assets/logo-lockup.png",
  "docs/brand.md",
  "packages/app/scripts/stable-raster.ts",
] as const;

const PNG_SIZES: Readonly<Record<string, { width: number; height: number }>> = {
  "packages/app/public/apple-touch-icon.png": { width: 180, height: 180 },
  "packages/app/public/icons/icon-192.png": { width: 192, height: 192 },
  "packages/app/public/icons/icon-512.png": { width: 512, height: 512 },
  "packages/app/public/icons/icon-maskable-192.png": { width: 192, height: 192 },
  "packages/app/public/icons/icon-maskable-512.png": { width: 512, height: 512 },
  "packages/app/public/social-card.png": { width: 1200, height: 630 },
  "docs/assets/social-card.png": { width: 1200, height: 630 },
};

const IDENTITY_ROUTES: Readonly<Record<string, string>> = {
  "/favicon.svg": "image/svg+xml",
  "/favicon.ico": "image/x-icon",
  "/apple-touch-icon.png": "image/png",
  "/icons/icon-192.png": "image/png",
  "/icons/icon-512.png": "image/png",
  "/icons/icon-maskable-192.png": "image/png",
  "/icons/icon-maskable-512.png": "image/png",
  "/brand/logo-mark.svg": "image/svg+xml",
  "/brand/logo-mark-dark.svg": "image/svg+xml",
  "/brand/logo-lockup.svg": "image/svg+xml",
  "/brand/social-card.svg": "image/svg+xml",
  "/social-card.png": "image/png",
  "/manifest.webmanifest": "application/manifest+json",
};

const HTML_GETS = ["/", "/gallery", "/motion", "/brand", "/approve", "/tools", "/settings", "/hh-dashboard", "/not-a-desk-page", "/src/missing-sheet.css"] as const;
const HTML_POSTS = ["/api/tour", "/api/interview/restart", "/settings"] as const;

interface Rgba {
  width: number;
  height: number;
  pixels: Uint8Array;
}

interface Reply {
  status: number;
  type: string;
  cache: string;
  csp: string;
  body: Buffer;
}

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface WebManifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
}

function repoFile(rel: string): string {
  return path.join(repoRoot, ...rel.split("/"));
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function pngSize(buf: Buffer): { width: number; height: number } {
  assert.ok(buf.subarray(0, 8).equals(PNG_SIG), "PNG signature");
  assert.equal(buf.toString("ascii", 12, 16), "IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dlu = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dlu) return left;
  if (du <= dlu) return up;
  return upLeft;
}

function decodePng(buf: Buffer): Rgba {
  assert.ok(buf.subarray(0, 8).equals(PNG_SIG), "PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8, "PNG bit depth");
  assert.equal(interlace, 0, "PNG interlace");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  assert.ok(channels > 0, `PNG color type ${colorType}`);
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * 4);
  const prior = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src] ?? 0;
    src += 1;
    for (let index = 0; index < stride; index += 1) {
      const raw = inflated[src + index] ?? 0;
      const left = index >= channels ? (row[index - channels] ?? 0) : 0;
      const up = prior[index] ?? 0;
      const upLeft = index >= channels ? (prior[index - channels] ?? 0) : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 255;
      else if (filter === 2) value = (raw + up) & 255;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`PNG filter ${filter}`);
      row[index] = value;
    }
    src += stride;
    prior.set(row);
    for (let x = 0; x < width; x += 1) {
      const index = x * channels;
      const out = (y * width + x) * 4;
      if (channels === 4) {
        pixels[out] = row[index] ?? 0;
        pixels[out + 1] = row[index + 1] ?? 0;
        pixels[out + 2] = row[index + 2] ?? 0;
        pixels[out + 3] = row[index + 3] ?? 0;
      } else if (channels === 3) {
        pixels[out] = row[index] ?? 0;
        pixels[out + 1] = row[index + 1] ?? 0;
        pixels[out + 2] = row[index + 2] ?? 0;
        pixels[out + 3] = 255;
      } else if (channels === 1) {
        const gray = row[index] ?? 0;
        pixels[out] = gray;
        pixels[out + 1] = gray;
        pixels[out + 2] = gray;
        pixels[out + 3] = 255;
      } else {
        const gray = row[index] ?? 0;
        pixels[out] = gray;
        pixels[out + 1] = gray;
        pixels[out + 2] = gray;
        pixels[out + 3] = row[index + 1] ?? 0;
      }
    }
  }
  return { width, height, pixels };
}

function pixelAt(image: Rgba, x: number, y: number): string {
  const index = (y * image.width + x) * 4;
  return `${image.pixels[index]},${image.pixels[index + 1]},${image.pixels[index + 2]},${image.pixels[index + 3]}`;
}

function countRgb(image: Rgba, x0: number, y0: number, x1: number, y1: number, rgb: string): number {
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (pixelAt(image, x, y) === rgb) count += 1;
    }
  }
  return count;
}

function icoSizes(buf: Buffer): number[] {
  assert.ok(buf.length >= 6, "ICO header");
  assert.equal(buf.readUInt16LE(0), 0, "ICO reserved");
  assert.equal(buf.readUInt16LE(2), 1, "ICO type");
  const count = buf.readUInt16LE(4);
  const sizes: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const widthByte = buf.readUInt8(entry);
    const heightByte = buf.readUInt8(entry + 1);
    const width = widthByte === 0 ? 256 : widthByte;
    const height = heightByte === 0 ? 256 : heightByte;
    assert.equal(width, height, "ICO entry is square");
    const bytes = buf.readUInt32LE(entry + 8);
    const imageOffset = buf.readUInt32LE(entry + 12);
    const png = buf.subarray(imageOffset, imageOffset + bytes);
    const size = pngSize(png);
    assert.equal(size.width, width);
    assert.equal(size.height, height);
    sizes.push(width);
  }
  return sizes;
}

function assertSvg(xml: string, label: string): void {
  assert.match(xml, /viewBox\s*=\s*"/, `${label} viewBox`);
  assert.doesNotMatch(xml, /<script\b/i, `${label} script`);
  assert.doesNotMatch(xml, /<foreignObject\b/i, `${label} foreignObject`);
  assert.doesNotMatch(xml, /\s(?:xlink:)?href\s*=/i, `${label} external href`);
  const stripped = xml
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const stack: string[] = [];
  const tags = stripped.match(/<\/?[A-Za-z][\w:.-]*\b[^>]*>/g);
  assert.ok(tags !== null && tags.length > 0, `${label} tags`);
  for (const tag of tags ?? []) {
    const name = /^<\/?([A-Za-z][\w:.-]*)/.exec(tag)?.[1];
    assert.ok(name, `${label} tag name`);
    if (tag.startsWith("</")) {
      assert.equal(stack.pop(), name, `${label} close ${name}`);
    } else if (!tag.endsWith("/>")) {
      stack.push(name ?? "");
    }
  }
  assert.deepEqual(stack, [], `${label} unclosed tags`);
}

function atLeast(name: string, ratio: number, floor: number): void {
  assert.ok(ratio >= floor, `${name} contrast ${ratio.toFixed(2)} is below ${floor}`);
}

function request(port: number, method: string, pathname: string, body?: string): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        headers: { host: `127.0.0.1:${port}` },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            type: String(res.headers["content-type"] ?? ""),
            cache: String(res.headers["cache-control"] ?? ""),
            csp: String(res.headers["content-security-policy"] ?? ""),
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

function headOf(html: string): string {
  const end = html.search(/<\/head>/i);
  assert.ok(end > 0, "head");
  return html.slice(0, end);
}

function countOf(hay: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from <= hay.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

function assertHead(html: string, route: string, port: number): void {
  const head = headOf(html);
  const image = `http://127.0.0.1:${port}/social-card.png`;
  const once = [
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    `<link rel="icon" href="/favicon.ico" sizes="48x48" />`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`,
    `<link rel="manifest" href="/manifest.webmanifest" />`,
    `<meta name="theme-color" content="${THEME_LIGHT}" media="(prefers-color-scheme: light)" />`,
    `<meta name="theme-color" content="${THEME_DARK}" media="(prefers-color-scheme: dark)" />`,
    `<meta name="color-scheme" content="light dark" />`,
    `<meta name="description" content="`,
    `<meta property="og:title" content="`,
    `<meta property="og:description" content="`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="`,
    `<meta property="og:site_name" content="`,
    `<meta property="og:url" content="http://127.0.0.1:${port}`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="`,
    `<meta name="twitter:description" content="`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="`,
  ];
  for (const needle of once) {
    assert.equal(countOf(head, needle), 1, `${route} missing or duplicate ${needle}`);
  }
  const titles = head.match(/<title>[^<]*<\/title>/gi) ?? [];
  assert.equal(titles.length, 1, `${route} title count ${titles.length}`);
  const title = (titles[0] ?? "").replaceAll("&#39;", "'").replaceAll("&amp;", "&");
  assert.ok(title.includes(PRODUCT_NAME), `${route} title ${title}`);
  assert.equal(countOf(head, 'name="theme-color"'), 2, `${route} theme-color count`);
  assert.equal(html.replace("<!DOCTYPE html>", "").includes("!"), false, `${route} exclamation`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readManifest(raw: string): WebManifest {
  const parsed: unknown = JSON.parse(raw);
  assert.ok(isRecord(parsed), "manifest object");
  const icons = parsed.icons;
  assert.ok(Array.isArray(icons), "manifest icons");
  const readIcon = (value: unknown): ManifestIcon => {
    assert.ok(isRecord(value), "icon object");
    assert.equal(typeof value.src, "string");
    assert.equal(typeof value.sizes, "string");
    assert.equal(typeof value.type, "string");
    assert.equal(typeof value.purpose, "string");
    return {
      src: String(value.src),
      sizes: String(value.sizes),
      type: String(value.type),
      purpose: String(value.purpose),
    };
  };
  assert.equal(typeof parsed.name, "string");
  assert.equal(typeof parsed.short_name, "string");
  assert.equal(typeof parsed.description, "string");
  assert.equal(typeof parsed.start_url, "string");
  assert.equal(typeof parsed.scope, "string");
  assert.equal(typeof parsed.display, "string");
  assert.equal(typeof parsed.background_color, "string");
  assert.equal(typeof parsed.theme_color, "string");
  return {
    name: String(parsed.name),
    short_name: String(parsed.short_name),
    description: String(parsed.description),
    start_url: String(parsed.start_url),
    scope: String(parsed.scope),
    display: String(parsed.display),
    background_color: String(parsed.background_color),
    theme_color: String(parsed.theme_color),
    icons: icons.map(readIcon),
  };
}

function insideScope(start: string, scope: string): boolean {
  const origin = "http://127.0.0.1";
  const startPath = new URL(start, origin).pathname;
  const scopeUrl = new URL(scope, origin);
  const scopePath = scopeUrl.pathname.endsWith("/") ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
  return startPath === scopeUrl.pathname || startPath.startsWith(scopePath);
}

describe("desk identity", { concurrency: false }, () => {
  test("files, sizes, svg rules, maskable safe zone, and contrast", () => {
    for (const rel of FILES) {
      const full = repoFile(rel);
      assert.equal(existsSync(full), true, rel);
      assert.ok(readFileSync(full).length > 0, rel);
    }
    const pkg = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf8")) as { scripts?: { "brand-assets"?: string } };
    assert.match(pkg.scripts?.["brand-assets"] ?? "", /build-brand-assets\.ts/);

    for (const [rel, expected] of Object.entries(PNG_SIZES)) {
      const size = pngSize(readFileSync(repoFile(rel)));
      assert.deepEqual(size, expected, rel);
    }
    const cream = "243,235,221,255";
    const ink = "28,22,18,255";
    const rust = "142,47,26,255";
    assert.equal(
      sha256(path.join(publicDir, "social-card.png")),
      sha256(path.join(docsAssets, "social-card.png")),
      "public and docs social cards",
    );
    const socialCard = decodePng(readFileSync(path.join(publicDir, "social-card.png")));
    assert.equal(pixelAt(socialCard, 0, 0), cream, "social card corner");
    assert.equal(pixelAt(socialCard, 1199, 629), cream, "social card far corner");
    assert.equal(countRgb(socialCard, 500, 360, 628, 368, rust), 128 * 8, "social card rust bar");
    assert.equal(countRgb(socialCard, 490, 395, 1180, 445, ink), 4892, "social card Literata line");
    assert.equal(countRgb(socialCard, 500, 180, 1100, 340, ink), 19267, "social card wordmark");
    assert.equal(countRgb(socialCard, 88, 135, 450, 500, ink), 29338, "social card book ink");
    assert.equal(countRgb(socialCard, 88, 135, 450, 500, rust), 7606, "social card book rust");
    const lockupPng = decodePng(readFileSync(path.join(docsAssets, "logo-lockup.png")));
    assert.equal(pixelAt(lockupPng, 0, 0), cream, "lockup corner");
    assert.equal(countRgb(lockupPng, 24, 24, 152, 152, ink), 3840, "lockup mark ink");
    assert.equal(countRgb(lockupPng, 24, 24, 152, 152, rust), 1024, "lockup mark rust");
    assert.equal(countRgb(lockupPng, 180, 40, 860, 140, ink), 31261, "lockup wordmark");
    const lockupSvg = readFileSync(path.join(publicDir, "brand", "logo-lockup.svg"), "utf8");
    const lockupWidth = Number(/width="(\d+)"/.exec(lockupSvg)?.[1]);
    const lockupHeight = Number(/height="(\d+)"/.exec(lockupSvg)?.[1]);
    assert.deepEqual(pngSize(readFileSync(path.join(docsAssets, "logo-lockup.png"))), {
      width: lockupWidth,
      height: lockupHeight,
    });
    assert.deepEqual(icoSizes(readFileSync(path.join(publicDir, "favicon.ico"))), [16, 32, 48]);

    for (const rel of [
      "packages/app/public/brand/logo-mark.svg",
      "packages/app/public/brand/logo-mark-dark.svg",
      "packages/app/public/brand/logo-lockup.svg",
      "packages/app/public/brand/social-card.svg",
      "packages/app/public/favicon.svg",
    ]) {
      assertSvg(readFileSync(repoFile(rel), "utf8"), rel);
    }

    for (const rel of [
      "packages/app/public/icons/icon-maskable-192.png",
      "packages/app/public/icons/icon-maskable-512.png",
    ]) {
      const image = decodePng(readFileSync(repoFile(rel)));
      const ring = Math.floor(image.width * 0.1);
      const border = pixelAt(image, 0, 0);
      assert.ok(border.endsWith(",255"), `${rel} border alpha ${border}`);
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const onRing = x < ring || y < ring || x >= image.width - ring || y >= image.height - ring;
          if (!onRing) continue;
          assert.equal(pixelAt(image, x, y), border, `${rel} ring ${x},${y}`);
        }
      }
      const center = pixelAt(image, Math.floor(image.width / 2), Math.floor(image.height / 2));
      assert.notEqual(center, border, `${rel} mark reaches the maskable ring`);
    }

    const apple = decodePng(readFileSync(path.join(publicDir, "apple-touch-icon.png")));
    for (let index = 3; index < apple.pixels.length; index += 4) {
      assert.equal(apple.pixels[index], 255, "apple-touch-icon alpha");
    }

    const pairs: ReadonlyArray<readonly [string, string, string, number]> = [
      ["ink on cream", color.ink.light, color.surface.light, 4.5],
      ["rust on cream", color.accent.light, color.surface.light, 4.5],
      ["dark ink on dark paper", color.ink.dark, color.surface.dark, 4.5],
      ["brass on dark paper", color.accent.dark, color.surface.dark, 4.5],
      ["theme on light page", THEME_LIGHT, color.surface.light, 3],
      ["theme on dark page", THEME_DARK, color.surface.dark, 3],
    ];
    for (const [name, fg, bg, floor] of pairs) {
      atLeast(name, contrastRatio(fg, bg), floor);
    }
    assert.equal(THEME_LIGHT, color.accent.light);
    assert.equal(THEME_DARK, color.accent.dark);
  });

  test("the desk serves identity files and stamps every HTML head", { timeout: 120_000 }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hh-brand-"));
    let handle: ServerHandle | undefined;
    try {
      handle = await startServer({ projectDir: dir, open: false });
      const port = handle.port;
      for (const [pathname, type] of Object.entries(IDENTITY_ROUTES)) {
        for (const method of ["GET", "HEAD"] as const) {
          const reply = await request(port, method, pathname);
          assert.equal(reply.status, 200, `${method} ${pathname}`);
          assert.equal(reply.type, type, `${method} ${pathname} type`);
          assert.equal(reply.cache, "no-cache", `${method} ${pathname} cache`);
          assert.equal(/max-age=\s*[1-9]/.test(reply.cache), false, pathname);
          if (method === "HEAD") assert.equal(reply.body.length, 0, `HEAD ${pathname} body`);
          else assert.ok(reply.body.length > 0, `GET ${pathname} body`);
          if (pathname === "/favicon.svg") {
            assert.match(reply.csp, /style-src 'sha256-[A-Za-z0-9+/=]+'/);
            assert.equal(reply.csp.includes("unsafe-inline"), false);
          }
        }
      }

      const missing = await request(port, "GET", "/icons/missing.png");
      assert.equal(missing.status, 404);
      assert.equal(missing.body.toString("utf8"), "That file is not on the desk.\n");
      for (const pathname of ["/icons/../../package.json", "/icons/%2e%2e/%2e%2e/package.json", "/brand/../package.json"]) {
        const reply = await request(port, "GET", pathname);
        assert.equal(reply.status, 404, pathname);
        assert.equal(reply.body.toString("utf8").includes("\"name\""), false, pathname);
        assert.equal(reply.body.toString("utf8"), "That file is not on the desk.\n");
      }
      for (const pathname of ["/favicon.svg", "/icons/icon-192.png", "/manifest.webmanifest", "/social-card.png"]) {
        const reply = await request(port, "POST", pathname, "");
        assert.equal(reply.status, 405, pathname);
        assert.match(reply.type, /^application\/json/);
      }

      const logo = await request(port, "GET", "/brand/logo");
      assert.equal(logo.status, 404);
      assert.match(logo.type, /^application\/json/);
      assert.match(logo.body.toString("utf8"), /No logo file/);

      const manifestReply = await request(port, "GET", "/manifest.webmanifest");
      const manifest = readManifest(manifestReply.body.toString("utf8"));
      assert.equal(manifest.name, PRODUCT_NAME);
      assert.equal(manifest.short_name, "Guide");
      assert.ok(manifest.short_name.length <= 12);
      assert.ok(manifest.description.length > 0);
      assert.equal(manifest.display, "standalone");
      assert.equal(manifest.background_color, color.surface.light);
      assert.equal(manifest.theme_color, color.accent.light);
      assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
      assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
      assert.equal(insideScope(manifest.start_url, manifest.scope), true);
      const purposes = new Set(manifest.icons.map((icon) => icon.purpose));
      assert.ok(purposes.has("any"));
      assert.ok(purposes.has("maskable"));
      const sizes = manifest.icons.map((icon) => icon.sizes);
      assert.ok(sizes.includes("192x192"));
      assert.ok(sizes.includes("512x512"));
      for (const icon of manifest.icons) {
        assert.equal(icon.type, "image/png");
        const iconReply = await request(port, "GET", icon.src);
        assert.equal(iconReply.status, 200, icon.src);
        assert.equal(iconReply.type, "image/png");
        const [width, height] = icon.sizes.split("x").map((part) => Number(part));
        assert.deepEqual(pngSize(iconReply.body), { width, height });
      }

      let imageChecked = false;
      for (const pathname of HTML_GETS) {
        const reply = await request(port, "GET", pathname);
        const expectStatus = pathname === "/not-a-desk-page" || pathname === "/src/missing-sheet.css" ? 404 : 200;
        assert.equal(reply.status, expectStatus, pathname);
        assert.match(reply.type, /^text\/html/, pathname);
        assertHead(reply.body.toString("utf8"), pathname, port);
        if (!imageChecked) {
          const image = /property="og:image" content="([^"]+)"/.exec(reply.body.toString("utf8"))?.[1];
          const twitter = /name="twitter:image" content="([^"]+)"/.exec(reply.body.toString("utf8"))?.[1];
          assert.ok(image && twitter, pathname);
          for (const target of [image ?? "", twitter ?? ""]) {
            const card = await request(port, "GET", new URL(target).pathname);
            assert.equal(card.status, 200, target);
            assert.equal(card.type, "image/png", target);
            assert.deepEqual(pngSize(card.body), { width: 1200, height: 630 });
          }
          imageChecked = true;
        }
      }
      for (const pathname of HTML_POSTS) {
        const reply = await request(port, "POST", pathname, "tour=seen");
        assert.equal(reply.status, 403, pathname);
        assert.match(reply.type, /^text\/html/, pathname);
        assertHead(reply.body.toString("utf8"), `POST ${pathname}`, port);
      }

      const headJs = await request(port, "GET", "/client/head.js");
      const tokensJs = await request(port, "GET", "/client/tokens.js");
      const documentHead = await request(port, "GET", "/client/document-head.js");
      assert.equal(headJs.status, 200);
      assert.equal(tokensJs.status, 200);
      assert.equal(documentHead.status, 200);
      assert.match(documentHead.body.toString("utf8"), /\/client\/head\.js/);
      assert.match(headJs.body.toString("utf8"), /\/client\/tokens\.js/);
      assert.equal(headJs.body.toString("utf8").includes("node:http"), false);
    } finally {
      if (handle !== undefined) await handle.close();
      removeTempDir(dir);
    }
  });

  test("brand-assets rewrites the rasters with the same bytes", { timeout: 180_000 }, () => {
    const watched = [
      "packages/app/public/favicon.ico",
      "packages/app/public/apple-touch-icon.png",
      "packages/app/public/icons/icon-192.png",
      "packages/app/public/icons/icon-512.png",
      "packages/app/public/icons/icon-maskable-192.png",
      "packages/app/public/icons/icon-maskable-512.png",
      "packages/app/public/social-card.png",
      "packages/app/public/brand/logo-lockup.svg",
      "packages/app/public/brand/social-card.svg",
      "docs/assets/social-card.png",
      "docs/assets/logo-lockup.png",
    ];
    const before = new Map(watched.map((rel) => [rel, sha256(repoFile(rel))]));
    const beforeSize = new Map(
      watched.filter((rel) => rel.endsWith(".png")).map((rel) => [rel, pngSize(readFileSync(repoFile(rel)))]),
    );
    const script = path.join(appRoot, "scripts", "build-brand-assets.ts");
    const result = spawnSync(process.execPath, ["--experimental-strip-types", script], {
      cwd: appRoot,
      encoding: "utf8",
      timeout: 150_000,
    });
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    for (const rel of watched) {
      assert.equal(sha256(repoFile(rel)), before.get(rel), `${rel} bytes changed`);
      if (!rel.endsWith(".png")) continue;
      assert.deepEqual(pngSize(readFileSync(repoFile(rel))), beforeSize.get(rel), rel);
    }
    assert.deepEqual(icoSizes(readFileSync(path.join(publicDir, "favicon.ico"))), [16, 32, 48]);
  });
});
