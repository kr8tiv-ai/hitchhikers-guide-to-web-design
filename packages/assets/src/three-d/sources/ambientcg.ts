/**
 * ambientCG 3D models. Public API, no key.
 *
 * The docs say type=3DModel. The live API (2026-10-07) filters with
 * type=3d-model. Assets are CC0 unless a record says otherwise.
 * Prefer the LQ-1K-JPG zip. The author field is not in the API, so the
 * credit names ambientCG.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  LicenceError,
  assertAcceptedLicence,
  isRecord,
  type AssetLicence,
  type DownloadedModel,
  type ModelHit,
} from "../credits.ts";

const API = "https://ambientcg.com/api/v2/full_json";

export interface SourceDeps {
  fetchImpl: typeof fetch;
}

export async function search(query: string, deps: SourceDeps): Promise<ModelHit[]> {
  const body = await fetchJson(deps.fetchImpl, catalogUrl(query));
  return assetsFrom(body).flatMap((asset) => {
    try {
      return [hitFrom(asset)];
    } catch (error) {
      if (error instanceof LicenceError) return [];
      throw error;
    }
  });
}

export async function download(id: string, dir: string, deps: SourceDeps): Promise<DownloadedModel> {
  const safeId = id.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(safeId)) throw new Error("ambientCG asset id has unexpected characters.");
  const body = await fetchJson(deps.fetchImpl, catalogUrl(safeId));
  const asset = assetsFrom(body).find((row) => row.assetId === safeId);
  if (asset === undefined) throw new Error(`ambientCG has no 3D model named ${safeId}.`);
  const licence = licenceOf(asset.raw, safeId);
  const zipUrl = zipUrlOf(asset.raw);
  if (zipUrl === null) throw new Error(`ambientCG has no zip download for ${safeId}.`);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${safeId}.zip`);
  await writeFile(file, await fetchBytes(deps.fetchImpl, zipUrl));
  return {
    file,
    licence,
    author: "ambientCG",
    sourceUrl: `https://ambientcg.com/a/${encodeURIComponent(safeId)}`,
  };
}

function catalogUrl(query: string): string {
  const params = new URLSearchParams({
    type: "3d-model",
    q: query.trim(),
    limit: "24",
    include: "downloadData",
  });
  return `${API}?${params.toString()}`;
}

interface AmbientAsset {
  assetId: string;
  raw: Record<string, unknown>;
}

function assetsFrom(body: unknown): AmbientAsset[] {
  if (!isRecord(body) || !Array.isArray(body.foundAssets)) {
    throw new Error("ambientCG returned a catalog that was not a list.");
  }
  const assets: AmbientAsset[] = [];
  for (const raw of body.foundAssets) {
    if (!isRecord(raw) || typeof raw.assetId !== "string") continue;
    if (raw.dataType !== undefined && raw.dataType !== "3DModel") continue;
    assets.push({ assetId: raw.assetId, raw });
  }
  return assets;
}

function hitFrom(asset: AmbientAsset): ModelHit {
  const name =
    typeof asset.raw.displayName === "string" && asset.raw.displayName.trim().length > 0
      ? asset.raw.displayName.trim()
      : asset.assetId;
  const hit: ModelHit = {
    id: asset.assetId,
    name,
    licence: licenceOf(asset.raw, asset.assetId),
    author: "ambientCG",
    sourceUrl:
      typeof asset.raw.shortLink === "string" && asset.raw.shortLink.length > 0
        ? asset.raw.shortLink
        : `https://ambientcg.com/a/${encodeURIComponent(asset.assetId)}`,
  };
  const preview = previewOf(asset.raw.previewImage);
  if (preview !== null) hit.previewUrl = preview;
  return hit;
}

function licenceOf(raw: Record<string, unknown>, id: string): AssetLicence {
  const value = raw.license ?? raw.licence;
  if (typeof value !== "string" || value.trim().length === 0) return assertAcceptedLicence("CC0-1.0");
  const text = value.trim();
  if (/non-?commercial|no-?deriv|share-?alike|\bnc\b|\bnd\b|\bsa\b/i.test(text)) {
    throw new LicenceError(text, `ambientCG asset ${id} licence "${text}" is not CC0 or CC-BY.`);
  }
  if (/cc0|public domain/i.test(text)) return assertAcceptedLicence("CC0-1.0");
  if (/cc[- ]?by(?:[- ]?4(?:\.0)?)?$/i.test(text) || text === "CC-BY-4.0") return assertAcceptedLicence("CC-BY-4.0");
  throw new LicenceError(text, `ambientCG asset ${id} licence "${text}" is not CC0 or CC-BY.`);
}

function zipUrlOf(raw: Record<string, unknown>): string | null {
  const downloads = walkDownloads(raw);
  const ranked = downloads
    .map((item) => ({ ...item, score: zipScore(item.attribute) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.url ?? null;
}

function walkDownloads(raw: Record<string, unknown>): Array<{ attribute: string; url: string }> {
  const folders = raw.downloadFolders;
  if (!isRecord(folders)) return [];
  const found: Array<{ attribute: string; url: string }> = [];
  for (const folder of Object.values(folders)) {
    if (!isRecord(folder) || !isRecord(folder.downloadFiletypeCategories)) continue;
    const zip = folder.downloadFiletypeCategories.zip;
    if (!isRecord(zip) || !Array.isArray(zip.downloads)) continue;
    for (const item of zip.downloads) {
      if (!isRecord(item) || typeof item.fullDownloadPath !== "string") continue;
      const attribute = typeof item.attribute === "string" ? item.attribute : "";
      found.push({ attribute, url: item.fullDownloadPath });
    }
  }
  return found;
}

function zipScore(attribute: string): number {
  const text = attribute.toUpperCase();
  if (text.includes("LQ") && text.includes("1K") && text.includes("JPG")) return 3;
  if (text.includes("1K")) return 2;
  if (text.length > 0) return 1;
  return 0;
}

function previewOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (!isRecord(value)) return null;
  for (const key of ["url", "fullDownloadPath", "previewLink"]) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return null;
}

async function fetchJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`ambientCG request failed (${response.status}).`);
  return response.json() as Promise<unknown>;
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`ambientCG download failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}
