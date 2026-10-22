/**
 * Local preview of a folder of built pages.
 *
 * The page is served on 127.0.0.1 at a free port. The desk already uses
 * its own port, so this file never binds that port and never stops it.
 * A zip of the same pages is written to `.hitchhiker/deploy/preview.zip`.
 *
 * No host is called. Saved sign-in secrets are not read. No account is required.
 * This file does not start a child process and does not run the site build.
 * The caller passes the folder the stack record already named.
 */

import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { crc32 } from "node:zlib";

/** The desk already listens here. A preview must not bind it. */
const DESK_PORT = 4175;
const LOOPBACK = "127.0.0.1";
const PORT_TRIES = 20;
const ZIP32_MAX = 0xffffffff;

const NOT_BUILT = "The pages are not built yet. Build the site, then ask again. Nothing was sent.";
const OUTSIDE = "That folder is outside the project. Nothing was sent.";
const NO_FRONT = "The pages folder has no front page. Nothing was sent.";
const TOO_LARGE = "The pages are too large to pack on this computer. Nothing was sent.";
const COULD_NOT_OPEN = "A preview on this computer could not open. Nothing was sent.";

const ONLY_HERE = "This preview only answers on this computer.";
const NOT_A_PAGE = "That page is not in the preview.";
const ONLY_PAGES = "This preview only opens pages.";
const PAGE_FAILED = "The preview could not open that page.";

export interface PreviewRequest {
  projectDir: string;
  /** Folder of built pages, relative to the project or inside it. */
  outputDir: string;
}

export interface PreviewSession {
  url: string;
  port: number;
  zipPath: string;
  close: () => Promise<void>;
}

interface PackedFile {
  name: string;
  data: Buffer;
}

export function previewZipPath(projectDir: string): string {
  return path.join(path.resolve(projectDir), ".hitchhiker", "deploy", "preview.zip");
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === code;
}

function inside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function safeZipName(name: string): boolean {
  if (name === "" || name.includes("\0") || name.includes("\\") || name.startsWith("/")) return false;
  return name.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function previewPortAllowed(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port < 65536 && port !== DESK_PORT;
}

/** Zip the pages with stored bytes so the file text stays readable. */
function packPreviewZip(files: readonly PackedFile[]): Buffer {
  if (files.length > 0xffff) throw new Error(TOO_LARGE);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const file of files) {
    if (!safeZipName(file.name)) throw new Error(OUTSIDE);
    if (file.data.length > ZIP32_MAX) throw new Error(TOO_LARGE);
    const name = Buffer.from(file.name, "utf8");
    if (name.length > 0xffff) throw new Error(TOO_LARGE);
    const crc = crc32(file.data) >>> 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const chunk = Buffer.concat([local, file.data]);
    locals.push(chunk);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += chunk.length;
    if (offset > ZIP32_MAX) throw new Error(TOO_LARGE);
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

async function pageRoot(projectDir: string, outputDir: string): Promise<string> {
  if (projectDir.includes("\0") || outputDir.includes("\0")) throw new Error(OUTSIDE);
  const project = path.resolve(projectDir);
  const output = path.resolve(project, outputDir);
  const rel = path.relative(project, output);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(OUTSIDE);
  let realProject: string;
  let realOutput: string;
  try {
    realProject = await realpath(project);
  } catch (error) {
    if (isCode(error, "ENOENT")) throw new Error(NOT_BUILT);
    throw error;
  }
  try {
    realOutput = await realpath(output);
  } catch (error) {
    if (isCode(error, "ENOENT") || isCode(error, "ENOTDIR")) throw new Error(NOT_BUILT);
    throw error;
  }
  const realRel = path.relative(realProject, realOutput);
  if (realRel === "" || realRel.startsWith("..") || path.isAbsolute(realRel)) throw new Error(OUTSIDE);
  const info = await stat(realOutput);
  if (!info.isDirectory()) throw new Error(NOT_BUILT);
  return realOutput;
}

async function collectPages(root: string): Promise<PackedFile[]> {
  const files: PackedFile[] = [];
  const seen = new Set<string>();
  let total = 0;

  async function addFile(real: string): Promise<void> {
    if (!inside(root, real) || seen.has(real)) return;
    seen.add(real);
    const info = await stat(real);
    if (!info.isFile()) return;
    if (info.size > ZIP32_MAX || total + info.size > ZIP32_MAX) throw new Error(TOO_LARGE);
    const data = await readFile(real);
    if (total + data.length > ZIP32_MAX) throw new Error(TOO_LARGE);
    total += data.length;
    const name = path.relative(root, real).split(path.sep).join("/");
    if (!safeZipName(name)) throw new Error(OUTSIDE);
    files.push({ name, data });
  }

  async function walk(dir: string): Promise<void> {
    const realDir = await realpath(dir);
    if (!inside(root, realDir) || seen.has(realDir)) return;
    seen.add(realDir);
    let entries;
    try {
      entries = await readdir(realDir, { withFileTypes: true });
    } catch (error) {
      if (isCode(error, "ENOENT") || isCode(error, "ENOTDIR")) throw new Error(NOT_BUILT);
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(realDir, entry.name);
      if (entry.isSymbolicLink()) {
        let linked: string;
        try {
          linked = await realpath(full);
        } catch {
          continue;
        }
        if (!inside(root, linked) || seen.has(linked)) continue;
        const info = await stat(linked);
        if (info.isDirectory()) {
          await walk(linked);
          continue;
        }
        if (info.isFile()) await addFile(linked);
        continue;
      }
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      await addFile(full);
    }
  }

  await walk(root);
  files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return files;
}

function contentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html" || ext === ".htm") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".json" || ext === ".map") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".xml") return "application/xml";
  if (ext === ".webmanifest") return "application/manifest+json";
  if (ext === ".woff") return "font/woff";
  if (ext === ".woff2") return "font/woff2";
  if (ext === ".ttf") return "font/ttf";
  if (ext === ".otf") return "font/otf";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".wasm") return "application/wasm";
  return "application/octet-stream";
}

function sendText(res: ServerResponse, status: number, body: string): void {
  const bytes = Buffer.from(body, "utf8");
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": String(bytes.length),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(bytes);
}

function allowedHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined) return false;
  const host = hostHeader.trim().toLowerCase();
  const portText = String(port);
  return host === LOOPBACK
    || host === `${LOOPBACK}:${portText}`
    || host === "localhost"
    || host === `localhost:${portText}`;
}

async function resolvePage(root: string, frontName: string, pathname: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const trimmed = decoded.replace(/^\/+/, "");
  const mapped = trimmed === "" || trimmed.toLowerCase() === "index.html" ? frontName : trimmed;
  const candidate = path.resolve(root, mapped);
  if (!inside(root, candidate)) return null;
  let real: string;
  try {
    real = await realpath(candidate);
  } catch (error) {
    if (isCode(error, "ENOENT") || isCode(error, "ENOTDIR")) return null;
    throw error;
  }
  if (!inside(root, real)) return null;
  const info = await stat(real);
  if (info.isDirectory()) {
    const index = path.join(real, "index.html");
    let indexReal: string;
    try {
      indexReal = await realpath(index);
    } catch (error) {
      if (isCode(error, "ENOENT")) return null;
      throw error;
    }
    if (!inside(root, indexReal)) return null;
    const indexInfo = await stat(indexReal);
    return indexInfo.isFile() ? indexReal : null;
  }
  return info.isFile() ? real : null;
}

function answer(root: string, frontName: string, port: number, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (port === DESK_PORT || !previewPortAllowed(port)) {
    sendText(res, 421, ONLY_HERE);
    return Promise.resolve();
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    sendText(res, 405, ONLY_PAGES);
    return Promise.resolve();
  }
  if (!allowedHost(req.headers.host, port)) {
    sendText(res, 421, ONLY_HERE);
    return Promise.resolve();
  }
  const pathname = new URL(req.url ?? "/", `http://${LOOPBACK}`).pathname;
  return resolvePage(root, frontName, pathname).then((file) => {
    if (file === null) {
      sendText(res, 404, NOT_A_PAGE);
      return;
    }
    return stat(file).then((info) => {
      res.writeHead(200, {
        "content-type": contentType(file),
        "content-length": String(info.size),
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = createReadStream(file);
      stream.on("error", () => {
        if (!res.headersSent) sendText(res, 500, PAGE_FAILED);
        else res.end();
      });
      stream.pipe(res);
    });
  });
}

function claimPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", (error: Error) => {
      probe.close(() => reject(error));
    });
    probe.listen(0, LOOPBACK, () => {
      const address = probe.address();
      const port = address !== null && typeof address === "object" ? address.port : 0;
      probe.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function onceListen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, LOOPBACK);
  });
}

function shutdown(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error && !isCode(error, "ERR_SERVER_NOT_RUNNING")) reject(error);
      else resolve();
    });
  });
}

async function listenLoop(server: Server): Promise<number> {
  for (let attempt = 0; attempt < PORT_TRIES; attempt += 1) {
    const port = await claimPort();
    if (!previewPortAllowed(port)) continue;
    try {
      await onceListen(server, port);
    } catch (error) {
      if (isCode(error, "EADDRINUSE")) continue;
      throw error;
    }
    const address = server.address();
    if (address !== null && typeof address === "object" && address.address === LOOPBACK && previewPortAllowed(address.port)) {
      return address.port;
    }
    await shutdown(server);
  }
  throw new Error(COULD_NOT_OPEN);
}

/**
 * Serve the built pages on this computer and write the zip handoff.
 * The returned close stops the page. The zip stays until the next preview.
 */
export async function openPreview(request: PreviewRequest): Promise<PreviewSession> {
  if (typeof request.projectDir !== "string" || request.projectDir.trim() === "") {
    throw new Error(OUTSIDE);
  }
  if (typeof request.outputDir !== "string" || request.outputDir.trim() === "") {
    throw new Error(OUTSIDE);
  }
  const root = await pageRoot(request.projectDir, request.outputDir);
  const files = await collectPages(root);
  const front = files.find((file) => file.name.toLowerCase() === "index.html");
  if (front === undefined) throw new Error(NO_FRONT);
  const zipBytes = packPreviewZip(files);
  const zipPath = previewZipPath(request.projectDir);
  await mkdir(path.dirname(zipPath), { recursive: true });
  await writeFile(zipPath, zipBytes);

  const server = createServer((req, res) => {
    const bound = server.address();
    const port = bound !== null && typeof bound === "object" ? bound.port : 0;
    void answer(root, front.name, port, req, res).catch(() => {
      if (res.headersSent || res.writableEnded) return;
      sendText(res, 500, PAGE_FAILED);
    });
  });
  server.requestTimeout = 0;
  server.timeout = 0;

  let port: number;
  try {
    port = await listenLoop(server);
  } catch (error) {
    await rm(zipPath, { force: true });
    await shutdown(server).catch(() => undefined);
    throw error;
  }
  if (!previewPortAllowed(port)) {
    await rm(zipPath, { force: true });
    await shutdown(server);
    throw new Error(COULD_NOT_OPEN);
  }

  let closing: Promise<void> | null = null;
  return {
    url: `http://${LOOPBACK}:${port}/`,
    port,
    zipPath,
    close: () => {
      if (closing === null) closing = shutdown(server);
      return closing;
    },
  };
}
