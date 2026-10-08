/**
 * Preview server and review shots (prompt 126, screenshots from 108).
 *
 * Widths come from REVIEW_WIDTHS: 375, 768, 1440, and 1920. Each width
 * gets a full-page shot and a fold shot. Motion-led sections get an
 * eight-frame scroll strip.
 *
 * The fixture is the astro-default starter (prompt 106), served as static
 * HTML over TLS. Lighthouse scores is-on-https at 0 for an http URL, which
 * pulls best-practices under 90. The certificate is generated in process
 * for 127.0.0.1. Chrome is told to ignore it. The floor stays 90.
 */

import { spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import https from "node:https";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSecureContext } from "node:tls";
import { chromium, type Browser, type Page } from "playwright";
import { REVIEW_WIDTHS } from "./screenshots.ts";

export const CHROME_FIX = "Chromium is missing. Run: pnpm exec playwright install chromium";

const SCROLL_FRAMES = 8;

interface Body {
  type: string;
  body: Buffer;
}

interface StartedSite {
  url: string;
  close: () => Promise<void>;
}

export function chromiumExecutable(): string {
  return chromium.executablePath();
}

function playwrightCli(): string {
  const require = createRequire(import.meta.url);
  const pkg = require.resolve("playwright/package.json");
  return path.join(path.dirname(pkg), "cli.js");
}

async function installChromium(): Promise<void> {
  const cli = playwrightCli();
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], {
      windowsHide: true,
      shell: false,
    });
    child.on("error", reject);
    child.on("close", (status) => resolve(status));
  });
  if (code !== 0) throw new Error(CHROME_FIX);
}

export async function ensureChromium(): Promise<string> {
  const first = chromium.executablePath();
  if (existsSync(first)) return first;
  await installChromium();
  const second = chromium.executablePath();
  if (existsSync(second)) return second;
  throw new Error(CHROME_FIX);
}

export async function withChromium<T>(run: (browser: Browser) => Promise<T>): Promise<T> {
  const executablePath = await ensureChromium();
  const browser = await chromium.launch({
    executablePath,
    args: [
      "--ignore-certificate-errors",
      "--allow-insecure-localhost",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  try {
    return await run(browser);
  } finally {
    await browser.close();
  }
}

function templateRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = path.join(dir, "packages", "templates", "astro-default");
    if (existsSync(path.join(candidate, "src", "pages", "index.astro"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("astro-default template is missing.");
}

function readTemplate(root: string, relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

function quoted(source: string, name: string): string {
  const match = new RegExp(`const ${name} = "([^"]*)";`).exec(source);
  const value = match?.[1];
  if (value === undefined || value.length === 0) {
    throw new Error(`Template is missing ${name}.`);
  }
  return value;
}

function tagText(source: string, tag: string, className?: string): string[] {
  const pattern =
    className === undefined
      ? new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g")
      : new RegExp(`<${tag}[^>]*class="${className}"[^>]*>([^<]+)</${tag}>`, "g");
  const found: string[] = [];
  for (const match of source.matchAll(pattern)) {
    const text = match[1];
    if (text !== undefined && text.trim().length > 0) found.push(text.trim());
  }
  return found;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function canonicalOf(source: string, fallback: string): string {
  const match = /canonical="([^"]+)"/.exec(source);
  return match?.[1] ?? fallback;
}

function shell(title: string, description: string, canonical: string, body: string): string {
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: title,
    description,
    url: canonical,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/blank.css">
<meta name="theme-color" content="#f3ecdf">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
${body}
</body>
</html>
`;
}

function homeDocument(root: string): string {
  const source = readTemplate(root, path.join("src", "pages", "index.astro"));
  const base = readTemplate(root, path.join("src", "layouts", "Base.astro"));
  const title = quoted(source, "title");
  const description = quoted(source, "description");
  const h1 = tagText(source, "h1")[0];
  const mark = tagText(source, "p", "mark")[0];
  const kicker = tagText(source, "p", "kicker")[0];
  const dek = tagText(source, "p", "dek")[0];
  const footer = tagText(source, "p").find((line) => line.startsWith("GSAP"));
  const skip = /<a class="skip" href="#content">([^<]+)<\/a>/.exec(base)?.[1] ?? "Skip to content";
  const credit = /<a class="credits" href="([^"]+)">([^<]+)<\/a>/.exec(source);
  if (h1 === undefined || mark === undefined || kicker === undefined || dek === undefined || footer === undefined) {
    throw new Error("Home template is missing visible copy.");
  }
  const href = credit?.[1] ?? "/credits";
  const label = credit?.[2] ?? "Credits";
  const body = `<header class="top">
<a class="skip" href="#content">${escapeHtml(skip)}</a>
<p class="mark">${escapeHtml(mark)}</p>
<a class="credits" href="${escapeHtml(href)}">${escapeHtml(label)}</a>
</header>
<main id="content">
<p class="kicker">${escapeHtml(kicker)}</p>
<h1>${escapeHtml(h1)}</h1>
<p class="dek">${escapeHtml(dek)}</p>
</main>
<footer>
<p>${escapeHtml(footer)}</p>
</footer>`;
  return shell(title, description, canonicalOf(source, "https://example.com/"), body);
}

function creditsDocument(root: string): string {
  const source = readTemplate(root, path.join("src", "pages", "credits.astro"));
  const base = readTemplate(root, path.join("src", "layouts", "Base.astro"));
  const title = quoted(source, "title");
  const description = quoted(source, "description");
  const h1 = tagText(source, "h1")[0];
  const mark = tagText(source, "p", "mark")[0];
  const kicker = tagText(source, "p", "kicker")[0];
  const dek = tagText(source, "p", "dek")[0];
  const skip = /<a class="skip" href="#content">([^<]+)<\/a>/.exec(base)?.[1] ?? "Skip to content";
  const home = /<a class="credits" href="([^"]+)">([^<]+)<\/a>/.exec(source);
  if (h1 === undefined || mark === undefined || kicker === undefined || dek === undefined) {
    throw new Error("Credits template is missing visible copy.");
  }
  const href = home?.[1] ?? "/";
  const label = home?.[2] ?? "Home";
  const body = `<header class="top">
<a class="skip" href="#content">${escapeHtml(skip)}</a>
<p class="mark">${escapeHtml(mark)}</p>
<a class="credits" href="${escapeHtml(href)}">${escapeHtml(label)}</a>
</header>
<main id="content">
<p class="kicker">${escapeHtml(kicker)}</p>
<h1>${escapeHtml(h1)}</h1>
<p class="dek">${escapeHtml(dek)}</p>
</main>`;
  return shell(title, description, canonicalOf(source, "https://example.com/credits"), body);
}

function tinyIcon(): Buffer {
  const size = 16;
  const xor = size * size * 4;
  const and = 4 * size;
  const image = 40 + xor + and;
  const offset = 22;
  const buf = Buffer.alloc(offset + image);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(1, 4);
  buf.writeUInt8(size, 6);
  buf.writeUInt8(size, 7);
  buf.writeUInt16LE(1, 10);
  buf.writeUInt16LE(32, 12);
  buf.writeUInt32LE(image, 14);
  buf.writeUInt32LE(offset, 18);
  buf.writeUInt32LE(40, offset);
  buf.writeInt32LE(size, offset + 4);
  buf.writeInt32LE(size * 2, offset + 8);
  buf.writeUInt16LE(1, offset + 12);
  buf.writeUInt16LE(32, offset + 14);
  const pixels = offset + 40;
  for (let index = 0; index < size * size; index += 1) {
    const at = pixels + index * 4;
    buf[at] = 0xdf;
    buf[at + 1] = 0xec;
    buf[at + 2] = 0xf3;
    buf[at + 3] = 0xff;
  }
  return buf;
}

function derLen(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value = Math.floor(value / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLen(value.length), value]);
}

function seq(parts: readonly Buffer[]): Buffer {
  return tlv(0x30, Buffer.concat(parts));
}

function derInt(value: Buffer): Buffer {
  const first = value[0];
  const body = first !== undefined && (first & 0x80) !== 0 ? Buffer.concat([Buffer.from([0]), value]) : value;
  return tlv(0x02, body);
}

function oid(nums: readonly number[]): Buffer {
  const first = nums[0];
  const second = nums[1];
  if (first === undefined || second === undefined) throw new Error("OID is too short.");
  const body: number[] = [first * 40 + second];
  for (let index = 2; index < nums.length; index += 1) {
    const part = nums[index];
    if (part === undefined) continue;
    const stack: number[] = [part & 0x7f];
    let value = Math.floor(part / 128);
    while (value > 0) {
      stack.unshift((value & 0x7f) | 0x80);
      value = Math.floor(value / 128);
    }
    body.push(...stack);
  }
  return tlv(0x06, Buffer.from(body));
}

function utcTime(date: Date): Buffer {
  const pad = (value: number) => String(value).padStart(2, "0");
  const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(text, "ascii"));
}

function pem(label: string, der: Buffer): string {
  const lines = der.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function localCertificate(): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const spki = publicKey.export({ type: "spki", format: "der" });
  const exportedKey = privateKey.export({ type: "pkcs8", format: "pem" });
  const key = typeof exportedKey === "string" ? exportedKey : exportedKey.toString("utf8");
  const sha256Rsa = seq([oid([1, 2, 840, 113549, 1, 1, 11]), Buffer.from([0x05, 0x00])]);
  const name = seq([tlv(0x31, seq([oid([2, 5, 4, 3]), tlv(0x0c, Buffer.from("localhost", "utf8"))]))]);
  const now = Date.now();
  const san = seq([
    tlv(0x82, Buffer.from("localhost", "ascii")),
    tlv(0x87, Buffer.from([127, 0, 0, 1])),
  ]);
  const extension = seq([oid([2, 5, 29, 17]), tlv(0x04, san)]);
  const tbs = seq([
    tlv(0xa0, derInt(Buffer.from([2]))),
    derInt(randomBytes(8)),
    sha256Rsa,
    name,
    seq([utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 730 * 86_400_000))]),
    name,
    spki,
    tlv(0xa3, seq([extension])),
  ]);
  const signature = sign("sha256", tbs, privateKey);
  const cert = seq([tbs, sha256Rsa, tlv(0x03, Buffer.concat([Buffer.from([0]), signature]))]);
  const certPem = pem("CERTIFICATE", cert);
  createSecureContext({ key, cert: certPem });
  return { key, cert: certPem };
}

function fixtureMap(root: string): Map<string, Body> {
  const pages = new Map<string, Body>();
  const html = (text: string): Body => ({
    type: "text/html; charset=utf-8",
    body: Buffer.from(text, "utf8"),
  });
  pages.set("/", html(homeDocument(root)));
  pages.set("/index.html", html(homeDocument(root)));
  pages.set("/credits", html(creditsDocument(root)));
  pages.set("/blank.css", {
    type: "text/css; charset=utf-8",
    body: readFileSync(path.join(root, "src", "styles", "blank.css")),
  });
  pages.set("/favicon.svg", {
    type: "image/svg+xml",
    body: readFileSync(path.join(root, "public", "favicon.svg")),
  });
  pages.set("/favicon.ico", { type: "image/x-icon", body: tinyIcon() });
  pages.set("/robots.txt", {
    type: "text/plain; charset=utf-8",
    body: readFileSync(path.join(root, "public", "robots.txt")),
  });
  pages.set("/sitemap.xml", {
    type: "application/xml",
    body: readFileSync(path.join(root, "public", "sitemap.xml")),
  });
  pages.set("/credits/CREDITS.json", {
    type: "application/json",
    body: readFileSync(path.join(root, "public", "credits", "CREDITS.json")),
  });
  pages.set("/.well-known/appspecific/com.chrome.devtools.json", {
    type: "application/json",
    body: Buffer.from("{}\n", "utf8"),
  });
  return pages;
}

export async function startFixtureSite(): Promise<StartedSite> {
  const pages = fixtureMap(templateRoot());
  const { key, cert } = localCertificate();
  const server = https.createServer({ key, cert }, (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { allow: "GET, HEAD" });
        res.end();
        return;
      }
      const host = req.headers.host ?? "127.0.0.1";
      const parsed = new URL(req.url ?? "/", `https://${host}`);
      let pathname = decodeURIComponent(parsed.pathname);
      if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
      const hit = pages.get(pathname);
      if (hit === undefined) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": hit.type,
        "content-length": hit.body.length,
        "cache-control": "no-store",
      });
      if (req.method === "HEAD") res.end();
      else res.end(hit.body);
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  server.on("clientError", (_error, socket) => {
    socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Fixture server has no port.");
  }
  return {
    url: `https://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function slug(section: string): string {
  const cleaned = section.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return cleaned.length > 0 ? cleaned : "section";
}

async function shoot(page: Page, file: string, fullPage: boolean): Promise<void> {
  await page.screenshot({ path: file, fullPage });
  if (!existsSync(file)) throw new Error(`Screenshot was not written: ${file}`);
}

async function scrollStrip(page: Page, section: string, outDir: string, into: string[]): Promise<void> {
  const locator = page.locator(section);
  if ((await locator.count()) > 0) {
    await locator.first().scrollIntoViewIfNeeded().catch(() => undefined);
  }
  const span = await page.evaluate(() => {
    const view = globalThis as unknown as {
      document: { documentElement: { scrollHeight: number } };
      innerHeight: number;
    };
    return Math.max(0, view.document.documentElement.scrollHeight - view.innerHeight);
  });
  const name = slug(section);
  for (let frame = 0; frame < SCROLL_FRAMES; frame += 1) {
    const top = span === 0 ? 0 : Math.round((span * frame) / (SCROLL_FRAMES - 1));
    await page.evaluate((y: number) => {
      const view = globalThis as unknown as { scrollTo: (x: number, y: number) => void };
      view.scrollTo(0, y);
    }, top);
    const file = path.join(outDir, `scroll-${name}-${frame}.png`);
    await shoot(page, file, false);
    into.push(file);
  }
}

/**
 * Full page and fold at every review width, then eight scroll frames
 * for each motion-led section selector.
 */
export async function captureReviewShots(
  url: string,
  sections: string[],
  outDir: string,
): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  return withChromium(async (browser) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const files: string[] = [];
    try {
      for (const width of REVIEW_WIDTHS) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
        await page.goto(url, { waitUntil: "load", timeout: 20_000 });
        const full = path.join(outDir, `full-${width}.png`);
        const fold = path.join(outDir, `fold-${width}.png`);
        await shoot(page, full, true);
        await shoot(page, fold, false);
        files.push(full, fold);
        await page.close();
      }
      if (sections.length > 0) {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(url, { waitUntil: "load", timeout: 20_000 });
        for (const section of sections) {
          await scrollStrip(page, section, outDir, files);
        }
        await page.close();
      }
      return files;
    } finally {
      await context.close();
    }
  });
}
