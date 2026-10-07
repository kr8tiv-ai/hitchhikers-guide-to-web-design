/**
 * Downloads media named in CREDITS.json.
 * Allowed licenses are CC0 and CC-BY-4.0. Other licenses are refused.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const ALLOWED_LICENSES = ["CC0", "CC-BY-4.0"] as const;
export type AllowedLicense = (typeof ALLOWED_LICENSES)[number];

export interface CreditAsset {
  file: string;
  source: string;
  license: string;
  author: string;
  url?: string;
}

export interface CreditsFile {
  assets: CreditAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseCredits(text: string): CreditsFile {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !Array.isArray(parsed.assets)) {
    throw new Error("CREDITS.json needs an assets array.");
  }
  const assets: CreditAsset[] = [];
  for (const entry of parsed.assets) {
    if (!isRecord(entry)) throw new Error("A credit entry is not an object.");
    const file = entry.file;
    const source = entry.source;
    const license = entry.license;
    const author = entry.author;
    const url = entry.url;
    if (typeof file !== "string" || typeof source !== "string" || typeof license !== "string" || typeof author !== "string") {
      throw new Error("A credit entry needs file, source, license, and author.");
    }
    if (typeof url !== "undefined" && typeof url !== "string") throw new Error("A credit url must be a string.");
    assets.push(url === undefined ? { file, source, license, author } : { file, source, license, author, url });
  }
  return { assets };
}

export function assertLicense(license: string, file: string): asserts license is AllowedLicense {
  if (!(ALLOWED_LICENSES as readonly string[]).includes(license)) {
    throw new Error(`Refusing ${license} for ${file}. Allowed licenses are CC0 and CC-BY-4.0.`);
  }
}

export function safeDestination(outDir: string, file: string): string {
  if (file.length === 0 || file.includes("\0")) throw new Error("Asset file name is empty.");
  const target = path.resolve(outDir, file);
  const root = path.resolve(outDir);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Asset path escapes the output directory: ${file}`);
  }
  return target;
}

export async function fetchAssets(options: {
  creditsPath: string;
  outDir: string;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const text = await readFile(options.creditsPath, "utf8");
  const credits = parseCredits(text);
  const fetchImpl = options.fetchImpl ?? fetch;
  const written: string[] = [];
  for (const asset of credits.assets) {
    assertLicense(asset.license, asset.file);
    if (asset.url === undefined || asset.url.length === 0) continue;
    const destination = safeDestination(options.outDir, asset.file);
    const response = await fetchImpl(asset.url);
    if (!response.ok) throw new Error(`Asset download failed for ${asset.file}: ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    written.push(destination);
  }
  return written;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"));

if (invokedDirectly) {
  const creditsPath = argValue("--credits") ?? path.join(process.cwd(), "src", "data", "credits.json");
  const outDir = argValue("--out") ?? path.join(process.cwd(), "public", "media");
  const written = await fetchAssets({ creditsPath, outDir });
  console.log(JSON.stringify({ written: written.length }));
}
