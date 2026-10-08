/**
 * Downloads media named in CREDITS.json.
 * Allowed media licenses are CC0, CC0-1.0, and CC-BY-4.0.
 * CC0 and CC0-1.0 both mean public domain.
 * A 3D array and an { entries } file parse onto the credits page and are not downloaded here.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertMediaLicense, parseCredits } from "./credits-file.ts";

export {
  ALLOWED_LICENSES,
  assertMediaLicense as assertLicense,
  creditLine,
  isPublicDomain,
  parseCredits,
  parseCreditsValue,
} from "./credits-file.ts";
export type { AllowedLicense, CreditPageEntry, CreditsOrigin, CreditsPageModel } from "./credits-file.ts";

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
  for (const asset of credits.entries) {
    if (asset.origin !== "assets") continue;
    assertMediaLicense(asset.license, asset.file);
    if (asset.url.length === 0) continue;
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
