/**
 * Sketchfab search is public. Downloads need the user's own token.
 *
 * Search asks only for CC0 and CC-BY (`licenses=cc0,by`). Research 07 wrote
 * `license=cc0`. The live API (2026-10-07) uses `licenses`, and the result
 * label is checked again because the uid is not a slug.
 * Accepted labels: "CC0 Public Domain" and "CC Attribution".
 * Non-commercial, no-derivatives, share-alike, standard, and unknown labels
 * are refused. The token is never sent on search, and never read from a
 * project file. Env SKETCHFAB_TOKEN, then the OS keychain account sketchfab.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { KEYCHAIN_SERVICE, type KeychainGet } from "../../keychain.ts";
import {
  LicenceError,
  assertAcceptedLicence,
  isRecord,
  type AssetLicence,
  type DownloadedModel,
  type ModelHit,
} from "../credits.ts";

const SEARCH_URL = "https://api.sketchfab.com/v3/search";
const MODEL_URL = "https://api.sketchfab.com/v3/models";
const KEYTAR_SPECIFIER = "keytar";

export interface SourceDeps {
  fetchImpl: typeof fetch;
  token?: string;
  env?: Record<string, string | undefined>;
  keychain?: KeychainGet | null;
}

export async function search(query: string, deps: SourceDeps): Promise<ModelHit[]> {
  const params = new URLSearchParams({
    type: "models",
    downloadable: "true",
    licenses: "cc0,by",
    q: query.trim(),
  });
  const body = await fetchJson(deps.fetchImpl, `${SEARCH_URL}?${params.toString()}`);
  if (!isRecord(body) || !Array.isArray(body.results)) {
    throw new Error("Sketchfab returned a search response that was not a list.");
  }
  const hits: ModelHit[] = [];
  for (const raw of body.results) {
    if (!isRecord(raw) || typeof raw.uid !== "string") continue;
    const label = licenceLabel(raw);
    let licence: AssetLicence;
    try {
      licence = licenceFromLabel(label);
    } catch (error) {
      if (error instanceof LicenceError) continue;
      throw error;
    }
    const name = typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name.trim() : raw.uid;
    const hit: ModelHit = {
      id: raw.uid,
      name,
      licence,
      author: authorOf(raw.user),
      sourceUrl: typeof raw.viewerUrl === "string" && raw.viewerUrl.length > 0
        ? raw.viewerUrl
        : `https://sketchfab.com/3d-models/${raw.uid}`,
    };
    const preview = previewOf(raw.thumbnails);
    if (preview !== null) hit.previewUrl = preview;
    hits.push(hit);
  }
  return hits;
}

export async function download(id: string, dir: string, deps: SourceDeps): Promise<DownloadedModel> {
  const uid = id.trim();
  if (!/^[A-Za-z0-9-]+$/.test(uid)) throw new Error("Sketchfab model id has unexpected characters.");
  const detail = await fetchJson(deps.fetchImpl, `${MODEL_URL}/${encodeURIComponent(uid)}`);
  if (!isRecord(detail)) throw new Error("Sketchfab returned a model that was not an object.");
  const licence = licenceFromLabel(licenceLabel(detail));
  const token = await resolveToken(deps);
  const archive = await fetchJson(
    deps.fetchImpl,
    `${MODEL_URL}/${encodeURIComponent(uid)}/download`,
    { Authorization: `Bearer ${token}` },
  );
  const fileUrl = pickDownloadUrl(archive);
  if (fileUrl === null) throw new Error("Sketchfab did not return a glTF or GLB download.");
  const bytes = await fetchBytes(deps.fetchImpl, fileUrl);
  const extension = extensionFor(bytes, fileUrl);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${uid}${extension}`);
  await writeFile(file, bytes);
  const name = typeof detail.name === "string" && detail.name.trim().length > 0 ? detail.name.trim() : uid;
  return {
    file,
    licence: assertAcceptedLicence(licence),
    author: authorOf(detail.user) || name,
    sourceUrl: typeof detail.viewerUrl === "string" && detail.viewerUrl.length > 0
      ? detail.viewerUrl
      : `https://sketchfab.com/3d-models/${uid}`,
  };
}

export function licenceFromLabel(label: string): AssetLicence {
  const trimmed = label.trim();
  if (/^CC0\b/i.test(trimmed) || /public domain/i.test(trimmed)) return assertAcceptedLicence("CC0-1.0");
  if (trimmed === "CC Attribution") return assertAcceptedLicence("CC-BY-4.0");
  throw new LicenceError(
    trimmed.length > 0 ? trimmed : "unknown",
    `Sketchfab licence "${trimmed.length > 0 ? trimmed : "unknown"}" is not CC0 or CC-BY. Non-commercial, no-derivatives, share-alike, and unknown licences are refused.`,
  );
}

function licenceLabel(raw: Record<string, unknown>): string {
  if (!isRecord(raw.license)) return "";
  return typeof raw.license.label === "string" ? raw.license.label : "";
}

function authorOf(user: unknown): string {
  if (!isRecord(user)) return "Sketchfab";
  if (typeof user.displayName === "string" && user.displayName.trim().length > 0) return user.displayName.trim();
  if (typeof user.username === "string" && user.username.trim().length > 0) return user.username.trim();
  return "Sketchfab";
}

function previewOf(thumbnails: unknown): string | null {
  if (!isRecord(thumbnails) || !Array.isArray(thumbnails.images)) return null;
  for (const image of thumbnails.images) {
    if (isRecord(image) && typeof image.url === "string" && image.url.length > 0) return image.url;
  }
  return null;
}

function pickDownloadUrl(body: unknown): string | null {
  if (!isRecord(body)) return null;
  if (isRecord(body.glb) && typeof body.glb.url === "string") return body.glb.url;
  if (isRecord(body.gltf) && typeof body.gltf.url === "string") return body.gltf.url;
  return null;
}

function extensionFor(bytes: Uint8Array, url: string): string {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return ".zip";
  if (bytes.length >= 4 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
    return ".glb";
  }
  const lower = url.toLowerCase();
  if (lower.includes(".zip")) return ".zip";
  if (lower.includes(".gltf")) return ".gltf";
  throw new Error("Sketchfab did not return a model file.");
}

async function resolveToken(deps: SourceDeps): Promise<string> {
  const direct = cleanSecret(deps.token);
  if (direct !== null) return direct;
  const env = deps.env ?? process.env;
  const fromEnv = cleanSecret(env.SKETCHFAB_TOKEN) ?? cleanSecret(env.SKETCHFAB_API_TOKEN);
  if (fromEnv !== null) return fromEnv;
  if (deps.keychain !== null) {
    const chain = deps.keychain ?? (await loadOptionalKeytar());
    if (chain !== null) {
      const stored = cleanSecret(await chain.getPassword(KEYCHAIN_SERVICE, "sketchfab"));
      if (stored !== null) return stored;
    }
  }
  throw new Error(
    "No Sketchfab token. Set SKETCHFAB_TOKEN, or store it in the OS keychain under service hitchhikers-guide and account sketchfab. A token is not read from a project file.",
  );
}

function cleanSecret(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (/[\r\n]/.test(value)) {
    throw new Error("The Sketchfab token contains a line break. It was not sent.");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadOptionalKeytar(): Promise<KeychainGet | null> {
  try {
    const require = createRequire(import.meta.url);
    const loaded: unknown = require(KEYTAR_SPECIFIER);
    if (!isRecord(loaded)) return null;
    const source = isRecord(loaded.default) ? loaded.default : loaded;
    const getPassword = source.getPassword;
    if (typeof getPassword !== "function") return null;
    return {
      getPassword: (service: string, account: string) =>
        Promise.resolve(getPassword.call(source, service, account)).then((value: unknown) =>
          typeof value === "string" ? value : null,
        ),
    };
  } catch {
    return null;
  }
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  headers?: Record<string, string>,
): Promise<unknown> {
  const response = await fetchImpl(url, headers ? { headers } : undefined);
  if (!response.ok) throw new Error(`Sketchfab request failed (${response.status}).`);
  return response.json() as Promise<unknown>;
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Sketchfab download failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}
