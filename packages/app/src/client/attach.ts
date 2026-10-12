/**
 * Attach rules for interview questions that ask for sites or files.
 * Pure: no filesystem, no network. The card, the desk, and the server all
 * read this map, the caps, and the allow list.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACH_FILES = 8;
export const MAX_ATTACH_LINKS = 12;
/** Whole attach request. A larger Content-Length is refused before a file is written. */
export const MAX_ATTACH_REQUEST_BYTES = MAX_UPLOAD_BYTES * MAX_ATTACH_FILES;

export type AttachKind = "links" | "images" | "files";

/**
 * Question id to what that question accepts.
 * Follow-up ids are listed so the bank test can see them. They are not cards.
 */
export const QUESTION_ATTACH: Readonly<Record<string, readonly AttachKind[]>> = {
  "DP-0.2": ["links"],
  "DP-0.4": ["images", "files", "links"],
  "DP-1.1": ["images", "files"],
  "DP-1.4": ["images", "files", "links"],
  "DP-1.5": ["images", "files"],
  "DP-1.5a": ["images"],
  "DP-1.9": ["images", "files"],
  "DP-4.1": ["links"],
  "DP-5.1": ["links"],
  "DP-5.4b": ["links"],
  "DP-6.4": ["files"],
  "DP-8.2": ["files"],
};

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "svg", "avif"] as const;
const FILE_EXT = ["pdf", "txt", "md", "docx"] as const;
const SHORTCUT_EXT = ["url", "webloc"] as const;

const EXT_LABEL: Record<string, string> = {
  png: "PNG",
  jpg: "JPEG",
  jpeg: "JPEG",
  webp: "WEBP",
  gif: "GIF",
  svg: "SVG",
  avif: "AVIF",
  pdf: "PDF",
  txt: "TXT",
  md: "MD",
  docx: "DOCX",
};

const MIME_BY_EXT: Record<string, readonly string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  svg: ["image/svg+xml"],
  avif: ["image/avif"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  url: ["text/plain", "application/octet-stream"],
  webloc: ["application/octet-stream", "text/xml", "application/xml"],
};

const BLOCKED_PARTS = new Set(["exe", "html", "htm", "js", "mjs", "com", "bat", "cmd", "ps1"]);
const RESERVED_BASE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const NAME_MAX = 40;

export function kindsFor(questionId: string): readonly AttachKind[] | null {
  return QUESTION_ATTACH[questionId] ?? null;
}

/** Charset and the known map. A made-up id is refused even when the letters are safe. */
export function attachQuestionId(questionId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/.test(questionId) && kindsFor(questionId) !== null;
}

export function extensionsFor(kinds: readonly AttachKind[]): string[] {
  const set = new Set<string>();
  if (kinds.includes("images")) {
    for (const ext of IMAGE_EXT) set.add(ext);
  }
  if (kinds.includes("files")) {
    for (const ext of IMAGE_EXT) set.add(ext);
    for (const ext of FILE_EXT) set.add(ext);
  }
  if (kinds.includes("links")) {
    for (const ext of SHORTCUT_EXT) set.add(ext);
  }
  return [...set];
}

export function acceptAttribute(kinds: readonly AttachKind[]): string {
  const parts: string[] = [];
  for (const ext of extensionsFor(kinds)) {
    parts.push(`.${ext}`);
    for (const mime of MIME_BY_EXT[ext] ?? []) {
      if (!parts.includes(mime)) parts.push(mime);
    }
  }
  return parts.join(",");
}

export interface ZoneCopy {
  fine: string;
  coarse: string;
  group: string;
}

export function zoneCopy(questionId: string): ZoneCopy | null {
  const kinds = kindsFor(questionId);
  if (kinds === null) return null;
  const links = kinds.includes("links");
  const images = kinds.includes("images");
  const files = kinds.includes("files");
  if (links && images && files && questionId === "DP-0.4") {
    return {
      fine: "Drop images or files here, or paste a link.",
      coarse: "Attach images or files",
      group: "Images and files",
    };
  }
  if (images && links) {
    return {
      fine: "Drop images here, or paste a link.",
      coarse: "Attach images",
      group: "Images",
    };
  }
  if (images) {
    return {
      fine: "Drop images here, or use Attach.",
      coarse: "Attach images",
      group: "Images",
    };
  }
  if (files && links) {
    return {
      fine: "Drop files here, or paste a link.",
      coarse: "Attach files",
      group: "Files",
    };
  }
  if (files) {
    return {
      fine: "Drop files here, or use Attach.",
      coarse: "Attach files",
      group: "Files",
    };
  }
  return {
    fine: "Paste a link, or drop one here.",
    coarse: "Paste a link",
    group: "Links",
  };
}

export function displayName(filename: string): string {
  const leaf = filename.split(/[/\\]/).pop() ?? "";
  const clean = leaf.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  const shown = clean === "" ? "That file" : clean;
  return shown.length > 80 ? shown.slice(0, 80) : shown;
}

export function typeList(kinds: readonly AttachKind[]): string {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const ext of extensionsFor(kinds)) {
    if (ext === "url" || ext === "webloc" || ext === "jpg") continue;
    const label = EXT_LABEL[ext];
    if (label === undefined || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  if (labels.length === 0) return "link";
  if (labels.length === 1) return labels[0] ?? "file";
  const last = labels[labels.length - 1] ?? "file";
  return `${labels.slice(0, -1).join(", ")}, or ${last}`;
}

export function typeError(filename: string, kinds: readonly AttachKind[]): string {
  return `${displayName(filename)} is not a type the Guide takes. Try a ${typeList(kinds)}.`;
}

export function sizeError(filename: string): string {
  return `${displayName(filename)} is over 25 MB. Use a file under 25 MB.`;
}

export function emptyError(filename: string): string {
  return `${displayName(filename)} is empty. Choose a file that has something in it.`;
}

export function nameError(filename: string): string {
  const shown = displayName(filename);
  if (shown === "That file") return "That file name is not valid. Rename it and try again.";
  return `${shown} is not a usable file name. Rename it and try again.`;
}

export function linkSchemeError(): string {
  return "That link has to start with http or https.";
}

export function linkHostError(): string {
  return "That link needs a host, like example.com.";
}

export function linkCapError(): string {
  return `That is ${MAX_ATTACH_LINKS + 1} links. The Guide keeps ${MAX_ATTACH_LINKS}.`;
}

export function fileCapError(): string {
  return `That is ${MAX_ATTACH_FILES + 1} files. The Guide keeps ${MAX_ATTACH_FILES}.`;
}

export function shortcutMissError(): string {
  return "That shortcut did not contain a link.";
}

/** Last path segment. Slashes and backslashes both split. */
export function leafName(filename: string): string {
  const parts = filename.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

export function sanitizeUploadName(
  filename: string,
  allowed: readonly string[],
): { ok: true; name: string } | { ok: false; reason: "name" | "type" } {
  const stripped = filename.replace(/[\u0000-\u001F\u007F]/g, "");
  const leaf = leafName(stripped).normalize("NFKC");
  let cleaned = leaf.replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.\.+/g, ".").replace(/^\.+/, "");
  if (cleaned === "" || cleaned === ".") return { ok: false, reason: "name" };
  const dot = cleaned.lastIndexOf(".");
  if (dot <= 0 || dot === cleaned.length - 1) return { ok: false, reason: "type" };
  const ext = cleaned.slice(dot + 1).toLowerCase();
  const parts = cleaned.toLowerCase().split(".");
  if (!allowed.includes(ext) || parts.some((part) => BLOCKED_PARTS.has(part))) {
    return { ok: false, reason: "type" };
  }
  let base = cleaned.slice(0, dot).replace(/^\.+/, "").replace(/_+$/g, "");
  base = base.slice(0, NAME_MAX);
  if (base === "") base = "file";
  if (RESERVED_BASE.test(base)) base = `file-${base.toLowerCase()}`;
  const name = `${base}.${ext}`;
  if (name.includes("..") || name.includes("/") || name.includes("\\") || name.startsWith(".")) {
    return { ok: false, reason: "name" };
  }
  return { ok: true, name };
}

export function collisionName(name: string, index: number): string {
  if (index <= 1) return name;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-${index}`;
  return `${name.slice(0, dot)}-${index}${name.slice(dot)}`;
}

export function validateFileMeta(
  meta: { name: string; type: string; size: number },
  kinds: readonly AttachKind[],
): { ok: true; name: string } | { ok: false; error: string } {
  if (!Number.isFinite(meta.size) || meta.size <= 0) {
    return { ok: false, error: emptyError(meta.name) };
  }
  if (meta.size > MAX_UPLOAD_BYTES) return { ok: false, error: sizeError(meta.name) };
  const allowed = extensionsFor(kinds).filter((ext) => ext !== "url" && ext !== "webloc");
  const sanitized = sanitizeUploadName(meta.name, allowed);
  if (!sanitized.ok) {
    return {
      ok: false,
      error: sanitized.reason === "name" ? nameError(meta.name) : typeError(meta.name, kinds),
    };
  }
  const mime = mimeBase(meta.type);
  if (mime !== "" && mime !== "application/octet-stream") {
    const expected = MIME_BY_EXT[sanitized.name.slice(sanitized.name.lastIndexOf(".") + 1)] ?? [];
    if (!expected.includes(mime)) return { ok: false, error: typeError(meta.name, kinds) };
  }
  return { ok: true, name: sanitized.name };
}

function mimeBase(mime: string): string {
  const semi = mime.indexOf(";");
  return (semi === -1 ? mime : mime.slice(0, semi)).trim().toLowerCase();
}

export function bytesAllowed(ext: string, data: Uint8Array): boolean {
  const kind = ext.toLowerCase();
  if (kind === "png") return startsWith(data, [0x89, 0x50, 0x4e, 0x47]);
  if (kind === "jpg" || kind === "jpeg") return startsWith(data, [0xff, 0xd8, 0xff]);
  if (kind === "gif") return latin1(data, 6) === "GIF87a" || latin1(data, 6) === "GIF89a";
  if (kind === "webp") return latin1(data, 4) === "RIFF" && latin1(data.subarray(8), 4) === "WEBP";
  if (kind === "avif") {
    const head = latin1(data, 64);
    return head.includes("ftypavif") || head.includes("ftypavis");
  }
  if (kind === "svg") return svgLike(data);
  if (kind === "pdf") return latin1(data, 5) === "%PDF-";
  if (kind === "docx") return startsWith(data, [0x50, 0x4b, 0x03, 0x04]);
  if (kind === "txt" || kind === "md") return !looksExecutable(data);
  return false;
}

function startsWith(data: Uint8Array, bytes: number[]): boolean {
  if (data.length < bytes.length) return false;
  return bytes.every((byte, index) => data[index] === byte);
}

function latin1(data: Uint8Array, limit: number): string {
  const n = Math.min(data.length, limit);
  let out = "";
  for (let i = 0; i < n; i += 1) out += String.fromCharCode(data[i] ?? 0);
  return out;
}

function looksExecutable(data: Uint8Array): boolean {
  if (startsWith(data, [0x4d, 0x5a])) return true;
  if (startsWith(data, [0x7f, 0x45, 0x4c, 0x46])) return true;
  return false;
}

function svgLike(data: Uint8Array): boolean {
  if (looksExecutable(data)) return false;
  const text = latin1(data, 512).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  if (text.startsWith("<!doctype html") || text.startsWith("<html") || text.startsWith("<script")) {
    return false;
  }
  return text.startsWith("<svg") || (text.startsWith("<?xml") && text.includes("<svg"));
}

export interface NormalizedLink {
  url: string;
  host: string;
}

export function normalizeUrl(raw: string): { ok: true } & NormalizedLink | { ok: false; error: string } {
  let text = raw.trim();
  if (text.startsWith("<") && text.endsWith(">") && text.length > 2) text = text.slice(1, -1).trim();
  if (text === "") return { ok: false, error: linkHostError() };
  if (/[\u0000-\u001F\u007F]/.test(text)) return { ok: false, error: linkHostError() };
  let candidate = text;
  const schemeMatch = /^([a-z][a-z0-9+-]*):(.*)$/i.exec(text);
  if (schemeMatch !== null) {
    const scheme = (schemeMatch[1] ?? "").toLowerCase();
    const rest = schemeMatch[2] ?? "";
    if (scheme === "http" || scheme === "https") {
      candidate = text;
    } else if (/^\d/.test(rest) && !rest.startsWith("//")) {
      candidate = `https://${text}`;
    } else {
      return { ok: false, error: linkSchemeError() };
    }
  } else if (text.startsWith("//")) {
    candidate = `https:${text}`;
  } else {
    const bare = text.toLowerCase();
    const hostish =
      bare === "localhost" ||
      bare.startsWith("localhost/") ||
      text.includes(".");
    if (!hostish) return { ok: false, error: linkHostError() };
    candidate = `https://${text}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: linkHostError() };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: linkSchemeError() };
  }
  if (parsed.hostname === "") return { ok: false, error: linkHostError() };
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  return { ok: true, url: parsed.href, host: parsed.host };
}

export function linkTokens(text: string): string[] {
  return text.split(/\s+/).filter((part) => part !== "");
}

export function textIsOnlyLinks(text: string): boolean {
  const tokens = linkTokens(text);
  return tokens.length > 0 && tokens.every((token) => normalizeUrl(token).ok);
}

export function urisFromList(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    out.push(trimmed);
  }
  return out;
}

/** URL= line of a .url shortcut, or the plist string of a .webloc. Null when it is not a shortcut. */
export function shortcutTarget(filename: string, text: string): string | null {
  const ext = leafName(filename).split(".").pop()?.toLowerCase() ?? "";
  if (ext !== "url" && ext !== "webloc") return null;
  const source = text.replace(/^\uFEFF/, "");
  if (ext === "url") {
    for (const line of source.split(/\r?\n/)) {
      const matched = /^\s*URL=(.*)$/i.exec(line);
      if (matched?.[1] !== undefined && matched[1].trim() !== "") return matched[1].trim();
    }
    return "";
  }
  const matched = /<key>\s*URL\s*<\/key>\s*<string>([^<]*)<\/string>/i.exec(source);
  if (matched?.[1] === undefined) return "";
  return decodeXml(matched[1].trim());
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function collectLinks(
  existing: readonly string[],
  rawParts: readonly string[],
): { added: string[]; errors: string[] } {
  const have = new Set(existing);
  const added: string[] = [];
  const errors: string[] = [];
  for (const raw of rawParts) {
    const norm = normalizeUrl(raw);
    if (!norm.ok) {
      errors.push(norm.error);
      continue;
    }
    if (have.has(norm.url)) continue;
    if (have.size >= MAX_ATTACH_LINKS) {
      errors.push(linkCapError());
      continue;
    }
    have.add(norm.url);
    added.push(norm.url);
  }
  return { added, errors };
}

export function linkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}${parsed.search}`;
  } catch {
    return url;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pastedImageName(mime: string, stamp: number): string {
  const base = mimeBase(mime);
  const ext =
    base === "image/jpeg" ? "jpg" : base === "image/webp" ? "webp" : base === "image/gif" ? "gif" : base === "image/svg+xml" ? "svg" : base === "image/avif" ? "avif" : "png";
  return `pasted-image-${stamp}.${ext}`;
}

export function addedFilesMessage(count: number): string {
  return count === 1 ? "Added 1 file" : `Added ${count} files`;
}

export function addedLinksMessage(labels: readonly string[]): string {
  if (labels.length === 1) return `Added link ${labels[0] ?? ""}`;
  return `Added ${labels.length} links`;
}

export function removedMessage(label: string): string {
  return `Removed ${label}`;
}

export function uploadingMessage(index: number, total: number): string {
  return `Uploading ${index} of ${total}`;
}

export interface SummaryFile {
  originalName: string;
}

export function attachmentLine(files: readonly SummaryFile[], links: readonly string[]): string {
  const parts: string[] = [];
  if (files.length > 0) {
    parts.push(`Attached: ${files.map((file) => file.originalName).join(", ")}.`);
  }
  if (links.length > 0) {
    parts.push(`Links: ${links.map((link) => linkLabel(link)).join(", ")}`);
  }
  return parts.join(" ");
}

/** Draft plus a short line. An empty draft with attachments is still an answer. */
export function answerWithAttachments(
  draft: string,
  files: readonly SummaryFile[],
  links: readonly string[],
): string {
  const line = attachmentLine(files, links);
  const text = draft.trim();
  if (line === "") return text;
  if (text === "") return line;
  if (text.includes(line)) return text;
  return `${text}\n${line}`;
}

export interface AnswerAttachment {
  kind: "file" | "link";
  path?: string;
  originalName?: string;
  size?: number;
  type?: string;
  url?: string;
}
