/**
 * Kenney 3D packs from the published catalog pages.
 *
 * kenney.nl/robots.txt returned 404 on 2026-10-07, so there is no disallow.
 * This module requests the 3D category and one pack page only.
 * The zip URL includes a hash that changes. Parse it. Do not hardcode it.
 * Packs are CC0. A page without that licence is refused.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LicenceError, assertAcceptedLicence, type DownloadedModel, type ModelHit } from "../credits.ts";

const CATALOG_URL = "https://kenney.nl/assets/category:3D";
const CC0_MARK = "creativecommons.org/publicdomain/zero/1.0";

export interface SourceDeps {
  fetchImpl: typeof fetch;
}

export async function search(query: string, deps: SourceDeps): Promise<ModelHit[]> {
  const html = await fetchText(deps.fetchImpl, CATALOG_URL);
  const needle = query.trim().toLowerCase();
  const hits: ModelHit[] = [];
  const seen = new Set<string>();
  const link = /<a href=['"](?:https:\/\/kenney\.nl)?\/assets\/([^'"]+)['"][^>]*>([^<]*)<\/a>/gi;
  for (const match of html.matchAll(link)) {
    const slug = match[1]?.trim() ?? "";
    const title = decodeHtml(match[2]?.trim() ?? "");
    if (!isPackSlug(slug) || title.length === 0 || seen.has(slug)) continue;
    seen.add(slug);
    if (needle.length > 0 && !`${slug} ${title}`.toLowerCase().includes(needle)) continue;
    hits.push({
      id: slug,
      name: title,
      licence: assertAcceptedLicence("CC0-1.0"),
      author: "Kenney",
      sourceUrl: `https://kenney.nl/assets/${slug}`,
    });
  }
  return hits;
}

export async function download(id: string, dir: string, deps: SourceDeps): Promise<DownloadedModel> {
  const slug = id.trim();
  if (!isPackSlug(slug)) throw new Error("Kenney pack id has unexpected characters.");
  const pageUrl = `https://kenney.nl/assets/${slug}`;
  const html = await fetchText(deps.fetchImpl, pageUrl);
  const cc0 = html.toLowerCase().includes(CC0_MARK) || /\bCC0\b/.test(html);
  if (/creativecommons\.org\/licenses\/by-nc|non-?commercial/i.test(html) && !html.toLowerCase().includes(CC0_MARK)) {
    throw new LicenceError("CC-BY-NC", `Kenney pack ${slug} is non-commercial. That licence is refused.`);
  }
  if (!cc0) {
    throw new LicenceError(
      "unknown",
      `Kenney pack ${slug} does not show a CC0 licence. Non-commercial and unknown licences are refused.`,
    );
  }
  const zip = /href=['"](https:\/\/kenney\.nl\/media\/pages\/assets\/[^'"]+\.zip)['"]/i.exec(html);
  if (zip === null || zip[1] === undefined) {
    throw new Error(`Kenney pack ${slug} has no direct zip on the page.`);
  }
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug}.zip`);
  await writeFile(file, await fetchBytes(deps.fetchImpl, zip[1]));
  return {
    file,
    licence: assertAcceptedLicence("CC0-1.0"),
    author: "Kenney",
    sourceUrl: pageUrl,
  };
}

function isPackSlug(slug: string): boolean {
  if (!/^[a-z0-9-]+$/i.test(slug)) return false;
  return !slug.includes(":");
}

async function fetchText(fetchImpl: typeof fetch, url: string): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Kenney request failed (${response.status}).`);
  return response.text();
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Kenney download failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}
