import { randomBytes } from "node:crypto";

/** Whole request cap. A larger Content-Length is refused before the body is read. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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

/** First file part of a multipart body. Binary parts stay in buffers. */
export function parseMultipart(
  body: Buffer,
  contentType: string,
): UploadPart | { error: string } {
  const matched = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = (matched?.[1] ?? matched?.[2] ?? "").trim();
  if (boundary.length === 0 || boundary.length > 200) {
    return { error: "Upload is missing a multipart boundary." };
  }
  const marker = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(marker);
  if (pos < 0) return { error: "Upload body is not multipart." };
  pos += marker.length;
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
      return { filename, mime: partMime(headers), data: body.subarray(dataStart, next) };
    }
    pos = next + 2 + marker.length;
  }
  return { error: "Upload is missing a file." };
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
