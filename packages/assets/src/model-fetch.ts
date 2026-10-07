/**
 * First-use download of the Real-ESRGAN ncnn Vulkan runner.
 *
 * Production passes os.homedir() as cacheDir. Files land in
 * cacheDir/.hitchhiker/models/realesrgan/ and are never committed.
 * The manifest points at the official xinntao/Real-ESRGAN v0.2.5.0
 * portable archives (runner, models, and the Windows CRT dlls).
 * sha256 values were measured from those release assets on 2026-10-06.
 * Tests inject fetchImpl. This module does not call global fetch.
 */

import { createHash } from "node:crypto";
import { access, chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32, inflateRaw } from "node:zlib";

export interface UpscalerManifestEntry {
  name: string;
  url: string;
  sha256: string;
  licence: string;
  platform: "win32" | "darwin" | "linux" | "any";
}

export interface EnsureUpscalerDeps {
  cacheDir: string;
  platform: NodeJS.Platform;
  fetchImpl: typeof fetch;
  manifest?: UpscalerManifestEntry[];
}

export interface EnsureUpscalerResult {
  runner: string;
  modelDir: string;
  downloaded: boolean;
}

export class UpscalerOfflineError extends Error {
  constructor() {
    super("Real-ESRGAN is not cached and the download failed. The original image is unchanged.");
    this.name = "UpscalerOfflineError";
  }
}

export class UpscalerChecksumError extends Error {
  constructor(name: string) {
    super(`${name} checksum did not match. The partial download was deleted.`);
    this.name = "UpscalerChecksumError";
  }
}

const RELEASE = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0";

/**
 * Real-ESRGAN itself is BSD-3-Clause. The ncnn Vulkan runner it bundles
 * is MIT (Xintao Wang, and nihui's realsr-ncnn-vulkan). Both texts are
 * written beside the download and into the cache CREDITS entry.
 */
export const UPSCALER_LICENCE = [
  "Real-ESRGAN portable ncnn Vulkan archive.",
  "Release: https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0",
  "Runner project: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan",
  "Photo model inside the archive: realesrgan-x4plus.",
  "The Windows archive also contains vcomp140.dll as shipped upstream. It is not committed to this repo.",
  "",
  "BSD 3-Clause License",
  "",
  "Copyright (c) 2021, Xintao Wang",
  "All rights reserved.",
  "",
  "Redistribution and use in source and binary forms, with or without",
  "modification, are permitted provided that the following conditions are met:",
  "",
  "1. Redistributions of source code must retain the above copyright notice, this",
  "   list of conditions and the following disclaimer.",
  "",
  "2. Redistributions in binary form must reproduce the above copyright notice,",
  "   this list of conditions and the following disclaimer in the documentation",
  "   and/or other materials provided with the distribution.",
  "",
  "3. Neither the name of the copyright holder nor the names of its",
  "   contributors may be used to endorse or promote products derived from",
  "   this software without specific prior written permission.",
  "",
  'THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"',
  "AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE",
  "IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE",
  "DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE",
  "FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL",
  "DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR",
  "SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER",
  "CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,",
  "OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE",
  "OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.",
  "",
  "The MIT License (MIT)",
  "",
  "Copyright (c) 2021 Xintao Wang",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  'of this software and associated documentation files (the "Software"), to deal',
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "",
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
  "",
  "The following is the License of realsr-ncnn-vulkan",
  "",
  "The MIT License (MIT)",
  "",
  "Copyright (c) 2019 nihui",
  "",
  "Permission is hereby granted, free of charge, to any person obtaining a copy",
  'of this software and associated documentation files (the "Software"), to deal',
  "in the Software without restriction, including without limitation the rights",
  "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
  "copies of the Software, and to permit persons to whom the Software is",
  "furnished to do so, subject to the following conditions:",
  "",
  "The above copyright notice and this permission notice shall be included in all",
  "copies or substantial portions of the Software.",
  "",
  'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
  "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
  "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
  "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
  "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
  "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
  "SOFTWARE.",
  "",
].join("\n");

export const UPSCALER_MANIFEST: readonly UpscalerManifestEntry[] = [
  {
    name: "realesrgan-ncnn-vulkan-20220424-windows.zip",
    url: `${RELEASE}/realesrgan-ncnn-vulkan-20220424-windows.zip`,
    sha256: "abc02804e17982a3be33675e4d471e91ea374e65b70167abc09e31acb412802d",
    licence: UPSCALER_LICENCE,
    platform: "win32",
  },
  {
    name: "realesrgan-ncnn-vulkan-20220424-macos.zip",
    url: `${RELEASE}/realesrgan-ncnn-vulkan-20220424-macos.zip`,
    sha256: "e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a",
    licence: UPSCALER_LICENCE,
    platform: "darwin",
  },
  {
    name: "realesrgan-ncnn-vulkan-20220424-ubuntu.zip",
    url: `${RELEASE}/realesrgan-ncnn-vulkan-20220424-ubuntu.zip`,
    sha256: "e5aa6eb131234b87c0c51f82b89390f5e3e642b7b70f2b9bbe95b6a285a40c96",
    licence: UPSCALER_LICENCE,
    platform: "linux",
  },
];

const PLATFORMS = new Set(["win32", "darwin", "linux", "any"]);
const WEIGHT_EXT = [".pth", ".bin", ".param", ".onnx"];
const RUNNER_NAME: Partial<Record<NodeJS.Platform, string>> = {
  win32: "realesrgan-ncnn-vulkan.exe",
  darwin: "realesrgan-ncnn-vulkan",
  linux: "realesrgan-ncnn-vulkan",
};

export function realesrganCacheRoot(cacheDir: string): string {
  return path.join(cacheDir, ".hitchhiker", "models", "realesrgan");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFileName(name: string): string {
  const normalized = name.replaceAll("\\", "/");
  const base = path.posix.basename(normalized);
  if (base !== normalized || base.length === 0 || base === "." || base === "..") {
    throw new Error(`Upscaler manifest name is not a single file name: ${name}`);
  }
  return base;
}

function assertEntry(entry: UpscalerManifestEntry): void {
  safeFileName(entry.name);
  if (!PLATFORMS.has(entry.platform)) {
    throw new Error(`Upscaler manifest platform is not supported: ${entry.platform}`);
  }
  if (!entry.url.startsWith("https://")) {
    throw new Error("Upscaler downloads must use https.");
  }
  if (!/^[0-9a-f]{64}$/i.test(entry.sha256)) {
    throw new Error(`Upscaler manifest sha256 must be 64 hex characters: ${entry.name}`);
  }
  if (entry.licence.trim().length === 0) {
    throw new Error(`Upscaler manifest entry ${entry.name} needs a licence.`);
  }
}

function forPlatform(
  manifest: readonly UpscalerManifestEntry[],
  platform: NodeJS.Platform,
): UpscalerManifestEntry[] {
  return manifest.filter((entry) => entry.platform === "any" || entry.platform === platform);
}

function isWeightName(name: string): boolean {
  const lower = name.toLowerCase();
  return WEIGHT_EXT.some((ext) => lower.endsWith(ext));
}

async function fileMatches(file: string, expected: string): Promise<boolean> {
  try {
    const bytes = await readFile(file);
    return sha256(bytes) === expected;
  } catch {
    return false;
  }
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetchImpl(url);
  } catch {
    throw new UpscalerOfflineError();
  }
  if (!response.ok) throw new UpscalerOfflineError();
  return Buffer.from(await response.arrayBuffer());
}

function licenceText(licence: string): string {
  return licence.endsWith("\n") ? licence : `${licence}\n`;
}

async function writeLicence(dest: string, licence: string): Promise<void> {
  await writeFile(`${dest}.licence.txt`, licenceText(licence), "utf8");
}

interface CreditRow {
  name: string;
  url: string;
  sha256: string;
  licence: string;
  category: "Code and libraries";
}

async function writeCredits(root: string, entries: readonly UpscalerManifestEntry[]): Promise<void> {
  const rows: CreditRow[] = entries.map((entry) => ({
    name: entry.name,
    url: entry.url,
    sha256: entry.sha256.toLowerCase(),
    licence: entry.licence,
    category: "Code and libraries",
  }));
  await writeFile(path.join(root, "CREDITS.json"), `${JSON.stringify({ entries: rows }, null, 2)}\n`, "utf8");
}

function readUInt16(buf: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > buf.length) throw new Error("Zip header is truncated.");
  return buf.readUInt16LE(offset);
}

function readUInt32(buf: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buf.length) throw new Error("Zip header is truncated.");
  return buf.readUInt32LE(offset);
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  crc32: number;
}

function findEocd(buf: Buffer): number {
  if (buf.length < 22) throw new Error("Zip has no end of central directory.");
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let offset = buf.length - 22; offset >= min; offset -= 1) {
    if (readUInt32(buf, offset) === 0x06054b50) return offset;
  }
  throw new Error("Zip has no end of central directory.");
}

function listZipEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  const count = readUInt16(buf, eocd + 10);
  const cdOffset = readUInt32(buf, eocd + 16);
  const entries: ZipEntry[] = [];
  let cursor = cdOffset;
  for (let index = 0; index < count; index += 1) {
    if (readUInt32(buf, cursor) !== 0x02014b50) {
      throw new Error("Zip central directory is truncated.");
    }
    const method = readUInt16(buf, cursor + 10);
    const crc = readUInt32(buf, cursor + 16);
    const compressedSize = readUInt32(buf, cursor + 20);
    const uncompressedSize = readUInt32(buf, cursor + 24);
    const nameLen = readUInt16(buf, cursor + 28);
    const extraLen = readUInt16(buf, cursor + 30);
    const commentLen = readUInt16(buf, cursor + 32);
    const localOffset = readUInt32(buf, cursor + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("Zip64 archives are not supported.");
    }
    const nameStart = cursor + 46;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset, crc32: crc });
    cursor = nameStart + nameLen + extraLen + commentLen;
  }
  return entries;
}

function safeZipPath(root: string, name: string): string {
  const normalized = name.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("Zip entry path escapes the cache.");
  }
  const parts = normalized.split("/").filter((part) => part.length > 0);
  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Zip entry path escapes the cache.");
  }
  const resolved = path.resolve(root, ...parts);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Zip entry path escapes the cache.");
  }
  return resolved;
}

function inflate(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    inflateRaw(data, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

async function extractZip(buf: Buffer, destDir: string): Promise<void> {
  const entries = listZipEntries(buf);
  await mkdir(destDir, { recursive: true });
  for (const entry of entries) {
    if (entry.name.endsWith("/")) {
      await mkdir(safeZipPath(destDir, entry.name), { recursive: true });
      continue;
    }
    const outPath = safeZipPath(destDir, entry.name);
    await mkdir(path.dirname(outPath), { recursive: true });
    if (readUInt32(buf, entry.localOffset) !== 0x04034b50) {
      throw new Error("Zip local header is missing.");
    }
    const nameLen = readUInt16(buf, entry.localOffset + 26);
    const extraLen = readUInt16(buf, entry.localOffset + 28);
    const start = entry.localOffset + 30 + nameLen + extraLen;
    const end = start + entry.compressedSize;
    if (end > buf.length) throw new Error(`Zip entry ${entry.name} is truncated.`);
    const compressed = buf.subarray(start, end);
    let data: Buffer;
    if (entry.method === 0) data = Buffer.from(compressed);
    else if (entry.method === 8) data = await inflate(compressed);
    else throw new Error(`Zip compression method ${entry.method} is not supported.`);
    if (data.length !== entry.uncompressedSize) {
      throw new Error(`Zip entry ${entry.name} expanded to the wrong size.`);
    }
    if ((crc32(data) >>> 0) !== entry.crc32) {
      throw new Error(`Zip entry ${entry.name} failed its checksum.`);
    }
    await writeFile(outPath, data);
  }
}

async function findNamedFile(dir: string, base: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findNamedFile(full, base);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === base) {
      return full;
    }
  }
  return null;
}

async function findModelDir(dir: string): Promise<string | null> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries.filter((entry) => entry.isFile());
  if (files.some((entry) => isWeightName(entry.name))) return dir;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = await findModelDir(path.join(dir, entry.name));
    if (nested) return nested;
  }
  return null;
}

async function materializeZip(
  zipPath: string,
  unpack: string,
  force: boolean,
  platform: NodeJS.Platform,
): Promise<{ runner: string; modelDir: string }> {
  const base = RUNNER_NAME[platform];
  if (!base) throw new Error("No Real-ESRGAN runner is listed for this platform.");
  if (force) await rm(unpack, { recursive: true, force: true });
  let runner = await findNamedFile(unpack, base);
  if (!runner) {
    await rm(unpack, { recursive: true, force: true });
    await extractZip(await readFile(zipPath), unpack);
    runner = await findNamedFile(unpack, base);
  }
  if (!runner) throw new Error("The Real-ESRGAN archive has no runner binary.");
  const modelDir = await findModelDir(unpack);
  if (!modelDir) throw new Error("The Real-ESRGAN archive has no model directory.");
  return { runner, modelDir };
}

export async function ensureUpscaler(deps: EnsureUpscalerDeps): Promise<EnsureUpscalerResult> {
  if (deps.cacheDir.trim().length === 0) throw new Error("Upscaler cacheDir is required.");
  if (typeof deps.fetchImpl !== "function") throw new Error("Upscaler needs an injected fetch.");
  const manifest = deps.manifest ?? UPSCALER_MANIFEST;
  const selected = forPlatform(manifest, deps.platform);
  if (selected.length === 0) throw new Error("No Real-ESRGAN file is listed for this platform.");

  const seen = new Set<string>();
  for (const entry of selected) {
    assertEntry(entry);
    const name = safeFileName(entry.name);
    if (seen.has(name)) throw new Error(`Upscaler manifest repeats ${name}.`);
    seen.add(name);
  }

  const root = realesrganCacheRoot(deps.cacheDir);
  await mkdir(root, { recursive: true });

  let downloaded = false;
  const fetched = new Set<string>();
  for (const entry of selected) {
    const name = safeFileName(entry.name);
    const dest = path.join(root, name);
    const expected = entry.sha256.toLowerCase();
    if (await fileMatches(dest, expected)) {
      await writeLicence(dest, entry.licence);
      continue;
    }
    await rm(dest, { force: true });
    await rm(`${dest}.licence.txt`, { force: true });
    const bytes = await fetchBytes(deps.fetchImpl, entry.url);
    const partial = `${dest}.partial`;
    await writeFile(partial, bytes);
    let actual = "";
    try {
      actual = sha256(await readFile(partial));
    } catch {
      await rm(partial, { force: true });
      throw new UpscalerChecksumError(name);
    }
    if (actual !== expected) {
      await rm(partial, { force: true });
      await rm(dest, { force: true });
      throw new UpscalerChecksumError(name);
    }
    await rm(dest, { force: true });
    await rename(partial, dest);
    await writeLicence(dest, entry.licence);
    downloaded = true;
    fetched.add(name);
  }

  await writeCredits(root, selected);

  const platformEntries = selected.filter((entry) => entry.platform === deps.platform);
  const zipEntry = platformEntries.find((entry) => entry.name.toLowerCase().endsWith(".zip"));
  let runner: string | null = null;
  let modelDir: string | null = null;

  if (zipEntry) {
    const zipName = safeFileName(zipEntry.name);
    const layout = await materializeZip(
      path.join(root, zipName),
      path.join(root, "unpack", zipName.replace(/\.zip$/i, "")),
      fetched.has(zipName),
      deps.platform,
    );
    runner = layout.runner;
    modelDir = layout.modelDir;
  } else {
    const loose = platformEntries.find((entry) => !isWeightName(entry.name));
    if (loose) runner = path.join(root, safeFileName(loose.name));
    modelDir = await findModelDir(root);
  }

  if (!runner) throw new Error("No Real-ESRGAN runner is listed for this platform.");
  if (!modelDir) throw new Error("No Real-ESRGAN model directory was found in the cache.");
  if (deps.platform === "darwin" || deps.platform === "linux") await chmod(runner, 0o755);

  try {
    await access(runner);
    await access(modelDir);
  } catch {
    throw new Error("Real-ESRGAN runner or model directory is missing from the cache.");
  }

  return { runner, modelDir, downloaded };
}
