import { randomBytes } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_ATTACH_FILES,
  MAX_ATTACH_REQUEST_BYTES,
  MAX_UPLOAD_BYTES,
  bytesAllowed,
  collisionName,
  displayName,
  emptyError,
  extensionsFor,
  fileCapError,
  kindsFor,
  nameError,
  sanitizeUploadName,
  sizeError,
  typeError,
} from "../client/attach.ts";

export { MAX_ATTACH_REQUEST_BYTES, MAX_UPLOAD_BYTES };

const ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "pdf",
  "txt",
  "md",
  "docx",
  "wav",
  "webm",
  "m4a",
] as const;

type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

const AUDIO_EXTENSIONS = new Set<AllowedExtension>(["wav", "webm", "m4a"]);

const MIME_BY_EXT: Record<AllowedExtension, readonly string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  svg: ["image/svg+xml"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  wav: ["audio/wav", "audio/wave", "audio/x-wav"],
  webm: ["audio/webm", "video/webm"],
  m4a: ["audio/mp4", "audio/x-m4a", "audio/m4a"],
};

const BLOCKED_PARTS = new Set(["exe", "html", "htm", "js", "mjs", "com", "bat", "cmd", "ps1"]);

export type UploadDecision =
  | { ok: true; safeName: string }
  | { ok: false; reason: string };

function isAllowedExtension(value: string): value is AllowedExtension {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(value);
}

/** Last path segment, so `../../x.png` and `..\\..\\x.png` both become `x.png`. */
export function leafName(filename: string): string {
  const parts = filename.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

function mimeBase(mime: string): string {
  const semi = mime.indexOf(";");
  const base = (semi === -1 ? mime : mime.slice(0, semi)).trim().toLowerCase();
  return base;
}

/**
 * Allow-list plus a stored name that cannot leave `.hitchhiker/uploads`.
 * SVG is allowed on disk and is never given a route.
 */
export function acceptUpload(meta: {
  filename: string;
  mime: string;
  bytes: number;
}): UploadDecision {
  if (meta.filename.includes("\0") || meta.filename.trim() === "") {
    return { ok: false, reason: "File name is not valid." };
  }
  if (!Number.isFinite(meta.bytes) || meta.bytes < 0) {
    return { ok: false, reason: "File is empty." };
  }
  if (meta.bytes === 0) return { ok: false, reason: "File is empty." };
  if (meta.bytes > MAX_UPLOAD_BYTES) return { ok: false, reason: "File is over 25 MB." };

  const leaf = leafName(meta.filename);
  if (leaf === "" || leaf === "." || leaf === "..") {
    return { ok: false, reason: "File name is not valid." };
  }
  const cleaned = leaf
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/\.\.+/g, ".")
    .replace(/^\.+/, "");
  const dot = cleaned.lastIndexOf(".");
  if (dot <= 0 || dot === cleaned.length - 1) {
    return { ok: false, reason: "File type is not allowed." };
  }
  const ext = cleaned.slice(dot + 1).toLowerCase();
  const parts = cleaned.toLowerCase().split(".");
  if (!isAllowedExtension(ext) || parts.some((part) => BLOCKED_PARTS.has(part))) {
    return { ok: false, reason: "File type is not allowed." };
  }
  const mime = mimeBase(meta.mime);
  if (mime !== "" && mime !== "application/octet-stream" && !MIME_BY_EXT[ext].includes(mime)) {
    return { ok: false, reason: "MIME type is not allowed." };
  }
  const base = cleaned.slice(0, dot).slice(0, 48);
  if (base.length === 0) return { ok: false, reason: "File name is not valid." };
  const safeName = `hh-${randomBytes(4).toString("hex")}-${base}.${ext}`;
  if (safeName.includes("..") || safeName.includes("/") || safeName.includes("\\")) {
    return { ok: false, reason: "File name is not valid." };
  }
  return { ok: true, safeName };
}

/** Push-to-talk is a subset of the upload allow-list. */
export function acceptAudio(meta: {
  filename: string;
  mime: string;
  bytes: number;
}): UploadDecision {
  const decision = acceptUpload(meta);
  if (!decision.ok) return decision;
  const ext = decision.safeName.slice(decision.safeName.lastIndexOf(".") + 1);
  if (!isAllowedExtension(ext) || !AUDIO_EXTENSIONS.has(ext)) {
    return { ok: false, reason: "Push-to-talk accepts wav, webm, or m4a." };
  }
  return decision;
}

export function contentLengthExceeds(
  header: string | string[] | undefined,
  max: number,
): boolean {
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw === undefined || !/^\d+$/.test(raw)) return false;
  const value = Number(raw);
  return Number.isFinite(value) && value > max;
}

/**
 * Read until `max`. The chunk that would pass the cap is dropped, not stored.
 */
export async function readCapped(
  source: AsyncIterable<Buffer | string>,
  max: number,
): Promise<{ ok: true; body: Buffer } | { ok: false; reason: "too-large" }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    if (total + buf.length > max) return { ok: false, reason: "too-large" };
    chunks.push(buf);
    total += buf.length;
  }
  return { ok: true, body: chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks, total) };
}

export interface UploadPart {
  filename: string;
  mime: string;
  data: Buffer;
}

/** Every file part, in order. Binary parts stay in buffers. */
export function parseMultipartFiles(
  body: Buffer,
  contentType: string,
): { files: UploadPart[] } | { error: string } {
  const matched = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = (matched?.[1] ?? matched?.[2] ?? "").trim();
  if (boundary.length === 0 || boundary.length > 200) {
    return { error: "Upload is missing a multipart boundary." };
  }
  const marker = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(marker);
  if (pos < 0) return { error: "Upload body is not multipart." };
  pos += marker.length;
  const files: UploadPart[] = [];
  while (pos < body.length) {
    const at = body[pos];
    const nextByte = body[pos + 1];
    if (at === 45 && nextByte === 45) break;
    if (at === 13 && nextByte === 10) pos += 2;
    const headerEnd = body.indexOf("\r\n\r\n", pos);
    if (headerEnd < 0) return { error: "Upload part is missing headers." };
    const headers = body.subarray(pos, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const next = body.indexOf(Buffer.from(`\r\n--${boundary}`), dataStart);
    if (next < 0) return { error: "Upload part is truncated." };
    const filename = dispositionFilename(headers);
    if (filename !== null) {
      files.push({ filename, mime: partMime(headers), data: body.subarray(dataStart, next) });
    }
    pos = next + 2 + marker.length;
  }
  if (files.length === 0) return { error: "Upload is missing a file." };
  return { files };
}

/** First file part of a multipart body. Binary parts stay in buffers. */
export function parseMultipart(
  body: Buffer,
  contentType: string,
): UploadPart | { error: string } {
  const all = parseMultipartFiles(body, contentType);
  if ("error" in all) return all;
  return all.files[0] ?? { error: "Upload is missing a file." };
}

function dispositionFilename(headers: string): string | null {
  const quoted = /filename="([^"]*)"/i.exec(headers);
  const bare = /filename=([^;\r\n]+)/i.exec(headers);
  const raw = quoted?.[1] ?? bare?.[1];
  if (raw === undefined) return null;
  const name = raw.trim().replaceAll('"', "");
  return name.length === 0 ? null : name;
}

function partMime(headers: string): string {
  const matched = /^content-type:\s*([^\r\n]+)/im.exec(headers);
  return matched?.[1]?.trim().toLowerCase() ?? "";
}

export interface AttachStoredFile {
  ok: true;
  path: string;
  storedName: string;
  originalName: string;
  size: number;
  type: string;
}

export interface AttachRejectedFile {
  ok: false;
  originalName: string;
  error: string;
}

export type AttachFileResult = AttachStoredFile | AttachRejectedFile;

interface ManifestRow {
  path: string;
  storedName: string;
  originalName: string;
  size: number;
  type: string;
}

const PLATE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "pdf"]);

/**
 * Saves one batch under `.hitchhiker/uploads/<questionId>/`.
 * A bad part is an error row. It does not erase the parts that saved.
 * The returned path uses forward slashes and never an absolute path.
 */
export async function saveAttachParts(
  projectDir: string,
  questionId: string,
  parts: readonly { filename: string; mime: string; data: Buffer }[],
): Promise<{ ok: true; files: AttachFileResult[] } | { ok: false; error: string }> {
  const kinds = kindsFor(questionId);
  if (kinds === null) return { ok: false, error: "That question does not take files." };
  const folder = await prepareQuestionDir(projectDir, questionId);
  if (folder === null) return { ok: false, error: "That upload folder is not available." };
  const allowed = extensionsFor(kinds).filter((ext) => ext !== "url" && ext !== "webloc");
  const files: AttachFileResult[] = [];
  let kept = await manifestCount(folder);
  for (const part of parts) {
    const shown = displayName(part.filename);
    if (kept >= MAX_ATTACH_FILES) {
      files.push({ ok: false, originalName: shown, error: fileCapError() });
      continue;
    }
    if (part.data.length === 0) {
      files.push({ ok: false, originalName: shown, error: emptyError(part.filename) });
      continue;
    }
    if (part.data.length > MAX_UPLOAD_BYTES) {
      files.push({ ok: false, originalName: shown, error: sizeError(part.filename) });
      continue;
    }
    const sanitized = sanitizeUploadName(part.filename, allowed);
    if (!sanitized.ok) {
      const error = sanitized.reason === "name" ? nameError(part.filename) : typeError(part.filename, kinds);
      files.push({ ok: false, originalName: shown, error });
      continue;
    }
    const ext = sanitized.name.slice(sanitized.name.lastIndexOf(".") + 1);
    if (!bytesAllowed(ext, part.data)) {
      files.push({ ok: false, originalName: shown, error: typeError(part.filename, kinds) });
      continue;
    }
    try {
      const storedName = await writeUnique(folder, sanitized.name, part.data);
      if (storedName === null) {
        files.push({
          ok: false,
          originalName: shown,
          error: `${shown} did not save. Try a different file name.`,
        });
        continue;
      }
      const row: ManifestRow = {
        path: `.hitchhiker/uploads/${questionId}/${storedName}`,
        storedName,
        originalName: shown,
        size: part.data.length,
        type: canonicalType(ext, part.mime),
      };
      try {
        await appendManifest(folder, row);
      } catch {
        await unlink(path.join(folder, storedName)).catch(() => undefined);
        files.push({ ok: false, originalName: shown, error: `${shown} did not save. Try again.` });
        continue;
      }
      kept += 1;
      files.push({ ok: true, ...row });
    } catch {
      files.push({ ok: false, originalName: shown, error: `${shown} did not save. Try again.` });
    }
  }
  return { ok: true, files };
}

/** Plate-safe extensions. Avif stays an attachment and is not the brand image. */
export function plateExtension(storedName: string): boolean {
  const ext = storedName.slice(storedName.lastIndexOf(".") + 1).toLowerCase();
  return PLATE_EXT.has(ext);
}

async function prepareQuestionDir(projectDir: string, questionId: string): Promise<string | null> {
  const uploads = path.join(projectDir, ".hitchhiker", "uploads");
  await mkdir(uploads, { recursive: true });
  const folder = path.join(uploads, questionId);
  const realUploads = await realpath(uploads);
  try {
    const stat = await lstat(folder);
    if (stat.isSymbolicLink()) {
      const realFolder = await realpath(folder);
      if (!sameQuestionDir(realUploads, realFolder, questionId)) return null;
    }
  } catch (error: unknown) {
    if (nodeCode(error) !== "ENOENT") return null;
  }
  await mkdir(folder, { recursive: true });
  let realFolder: string;
  try {
    const stat = await lstat(folder);
    if (stat.isSymbolicLink()) {
      realFolder = await realpath(folder);
      if (!sameQuestionDir(realUploads, realFolder, questionId)) return null;
    }
    realFolder = await realpath(folder);
  } catch {
    return null;
  }
  if (!sameQuestionDir(realUploads, realFolder, questionId)) return null;
  return realFolder;
}

function sameQuestionDir(realUploads: string, realFolder: string, questionId: string): boolean {
  const rel = path.relative(realUploads, realFolder);
  return rel === questionId && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function writeUnique(folder: string, name: string, data: Buffer): Promise<string | null> {
  for (let index = 1; index <= 40; index += 1) {
    const stored = collisionName(name, index);
    const target = path.join(folder, stored);
    const rel = path.relative(folder, target);
    if (rel !== stored || rel.startsWith("..") || path.isAbsolute(rel)) return null;
    try {
      const stat = await lstat(target);
      if (stat.isSymbolicLink() || stat.isFile() || stat.isDirectory()) continue;
    } catch (error: unknown) {
      if (nodeCode(error) !== "ENOENT") throw error;
    }
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(target, "wx");
      await handle.writeFile(data);
    } catch (error: unknown) {
      await handle?.close().catch(() => undefined);
      if (nodeCode(error) === "EEXIST") continue;
      await unlink(target).catch(() => undefined);
      throw error;
    }
    if (handle === null) return null;
    await handle.close();
    let realFile: string;
    try {
      realFile = await realpath(target);
    } catch {
      await unlink(target).catch(() => undefined);
      return null;
    }
    const back = path.relative(folder, realFile);
    if (back !== stored || back.startsWith("..") || path.isAbsolute(back)) {
      await unlink(target).catch(() => undefined);
      return null;
    }
    return stored;
  }
  return null;
}

async function appendManifest(folder: string, row: ManifestRow): Promise<void> {
  const file = path.join(folder, "manifest.json");
  const rows = await readManifest(file);
  rows.push(row);
  const tmp = path.join(folder, `.manifest-${process.pid}-${Date.now()}.tmp`);
  try {
    await writeFile(tmp, `${JSON.stringify(rows)}\n`, { flag: "wx" });
    await rename(tmp, file);
  } catch (error: unknown) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
}

async function manifestCount(folder: string): Promise<number> {
  return (await readManifest(path.join(folder, "manifest.json"))).length;
}

async function readManifest(file: string): Promise<ManifestRow[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isManifestRow);
  } catch (error: unknown) {
    if (nodeCode(error) === "ENOENT") return [];
    return [];
  }
}

function isManifestRow(value: unknown): value is ManifestRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.path === "string" &&
    typeof row.storedName === "string" &&
    typeof row.originalName === "string" &&
    typeof row.size === "number" &&
    typeof row.type === "string" &&
    !row.path.includes("\\") &&
    !row.path.includes("..")
  );
}

function canonicalType(ext: string, mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base !== "" && base !== "application/octet-stream") return base;
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "pdf") return "application/pdf";
  if (ext === "txt" || ext === "md") return "text/plain";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return `image/${ext}`;
}

function nodeCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

export function audioFilename(mime: string, headerName: string | undefined): string {
  if (headerName !== undefined && headerName.trim() !== "") return headerName.trim();
  const base = mimeBase(mime);
  if (base === "audio/wav" || base === "audio/wave" || base === "audio/x-wav") {
    return "push-to-talk.wav";
  }
  if (base === "audio/mp4" || base === "audio/m4a" || base === "audio/x-m4a") {
    return "push-to-talk.m4a";
  }
  return "push-to-talk.webm";
}
