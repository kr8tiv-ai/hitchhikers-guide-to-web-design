/**
 * Poly Haven models. Public API, no key.
 *
 * Live list param (2026-10-07) is `t=models`. Research 07 wrote `type=`.
 * Files are glTF plus an include map. There is no single GLB.
 * Prefer the 1k tier. Licence is CC0. Credit to Poly Haven is courteous.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertAcceptedLicence,
  isRecord,
  type AssetLicence,
  type DownloadedModel,
  type ModelHit,
} from "../credits.ts";

const ASSETS_URL = "https://api.polyhaven.com/assets?t=models";
const LICENCE: AssetLicence = "CC0-1.0";

export interface SourceDeps {
  fetchImpl: typeof fetch;
}

export async function search(query: string, deps: SourceDeps): Promise<ModelHit[]> {
  const body = await fetchJson(deps.fetchImpl, ASSETS_URL);
  if (!isRecord(body)) throw new Error("Poly Haven returned a catalog that was not an object.");
  const needle = query.trim().toLowerCase();
  const hits: ModelHit[] = [];
  for (const [id, raw] of Object.entries(body)) {
    if (!isRecord(raw)) continue;
    const name = typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : id;
    const tags = stringList(raw.tags);
    const categories = stringList(raw.categories);
    const haystack = [id, name, ...tags, ...categories].join(" ").toLowerCase();
    if (needle.length > 0 && !haystack.includes(needle)) continue;
    const author = authorsOf(raw.authors);
    const hit: ModelHit = {
      id,
      name,
      licence: assertAcceptedLicence(LICENCE),
      author,
      sourceUrl: `https://polyhaven.com/a/${encodeURIComponent(id)}`,
    };
    if (typeof raw.thumbnail_url === "string" && raw.thumbnail_url.length > 0) {
      hit.previewUrl = raw.thumbnail_url;
    }
    hits.push(hit);
  }
  return hits;
}

export async function download(id: string, dir: string, deps: SourceDeps): Promise<DownloadedModel> {
  const safeId = safeToken(id);
  if (safeId !== id.trim()) throw new Error("Poly Haven asset id has unexpected characters.");
  const files = await fetchJson(deps.fetchImpl, `https://api.polyhaven.com/files/${encodeURIComponent(safeId)}`);
  const author = isRecord(files) ? authorsOf(files.authors) : "Poly Haven";
  const picked = pickGltf(files);
  if (picked === null) throw new Error(`Poly Haven has no glTF files for ${safeId}.`);
  await mkdir(dir, { recursive: true });
  const gltfPath = safeJoin(dir, fileNameFromUrl(picked.url, `${safeId}.gltf`));
  await writeFile(gltfPath, await fetchBytes(deps.fetchImpl, picked.url));
  for (const [relative, url] of Object.entries(picked.include)) {
    const target = safeJoin(dir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, await fetchBytes(deps.fetchImpl, url));
  }
  return {
    file: gltfPath,
    licence: assertAcceptedLicence(LICENCE),
    author,
    sourceUrl: `https://polyhaven.com/a/${encodeURIComponent(safeId)}`,
  };
}

function pickGltf(files: unknown): { url: string; include: Record<string, string> } | null {
  if (!isRecord(files) || !isRecord(files.gltf)) return null;
  for (const tier of ["1k", "2k", "4k"]) {
    const tierNode = files.gltf[tier];
    if (!isRecord(tierNode) || !isRecord(tierNode.gltf)) continue;
    const file = tierNode.gltf;
    if (typeof file.url !== "string" || file.url.length === 0) continue;
    const include: Record<string, string> = {};
    if (isRecord(file.include)) {
      for (const [relative, meta] of Object.entries(file.include)) {
        if (isRecord(meta) && typeof meta.url === "string") include[relative] = meta.url;
      }
    }
    return { url: file.url, include };
  }
  return null;
}

function authorsOf(value: unknown): string {
  if (!isRecord(value)) return "Poly Haven";
  const names = Object.keys(value).map((name) => name.trim()).filter((name) => name.length > 0);
  return names.length > 0 ? names.join(", ") : "Poly Haven";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Poly Haven request failed (${response.status}).`);
  return response.json() as Promise<unknown>;
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Poly Haven download failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const name = path.basename(new URL(url).pathname);
    if (name.length > 0 && name !== "/" && name !== ".") return name;
  } catch {
    return fallback;
  }
  return fallback;
}

function safeToken(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return "";
  return trimmed;
}

function safeJoin(root: string, relative: string): string {
  const cleaned = path.normalize(relative).replace(/^([.][.][/\\])+/, "");
  const full = path.resolve(root, cleaned);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error(`Refused a path that leaves the download folder: ${relative}`);
  }
  return full;
}
