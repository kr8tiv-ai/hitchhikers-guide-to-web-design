/**
 * Quaternius packs from the published site.
 *
 * quaternius.com/robots.txt returned 404 on 2026-10-07.
 * Packs are CC0, but the live download button is an itch.io widget with no
 * file URL. A direct zip, glb, or gltf href is saved. An itch-only page
 * throws and writes nothing. The Guide does not run a checkout.
 * A page that is not CC0 or CC-BY is refused.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  LicenceError,
  assertAcceptedLicence,
  type AssetLicence,
  type DownloadedModel,
  type ModelHit,
} from "../credits.ts";

const HOME_URL = "https://quaternius.com/";
const CC0_MARK = "creativecommons.org/publicdomain/zero/1.0";

export interface SourceDeps {
  fetchImpl: typeof fetch;
}

export async function search(query: string, deps: SourceDeps): Promise<ModelHit[]> {
  const html = await fetchText(deps.fetchImpl, HOME_URL);
  const needle = query.trim().toLowerCase();
  const hits: ModelHit[] = [];
  const seen = new Set<string>();
  const link = /<a href=['"](?:https:\/\/quaternius\.com)?(\/packs\/([^'"]+?)\.html)['"][^>]*>([^<]*)<\/a>/gi;
  for (const match of html.matchAll(link)) {
    const slug = match[2]?.trim() ?? "";
    const title = decodeHtml((match[3]?.trim() ?? "") || slug);
    if (!/^[a-z0-9-]+$/i.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    if (needle.length > 0 && !`${slug} ${title}`.toLowerCase().includes(needle)) continue;
    hits.push({
      id: slug,
      name: title,
      licence: assertAcceptedLicence("CC0-1.0"),
      author: "Quaternius",
      sourceUrl: `https://quaternius.com/packs/${slug}.html`,
    });
  }
  return hits;
}

export async function download(id: string, dir: string, deps: SourceDeps): Promise<DownloadedModel> {
  const slug = id.trim().replace(/\.html$/i, "");
  if (!/^[a-z0-9-]+$/i.test(slug)) throw new Error("Quaternius pack id has unexpected characters.");
  const pageUrl = `https://quaternius.com/packs/${slug}.html`;
  const html = await fetchText(deps.fetchImpl, pageUrl);
  const licence = licenceFromPage(html, slug);
  const direct = directFile(html);
  if (direct !== null) {
    await mkdir(dir, { recursive: true });
    const extension = path.extname(new URL(direct, pageUrl).pathname) || ".zip";
    const file = path.join(dir, `${slug}${extension}`);
    await writeFile(file, await fetchBytes(deps.fetchImpl, new URL(direct, pageUrl).toString()));
    return {
      file,
      licence,
      author: "Quaternius",
      sourceUrl: pageUrl,
    };
  }
  const itch = /https?:\/\/quaternius\.itch\.io\/[a-z0-9-]+/i.exec(html);
  const game = /game\s*:\s*['"]([a-z0-9-]+)['"]/i.exec(html);
  const itchUrl = itch?.[0] ?? (game?.[1] ? `https://quaternius.itch.io/${game[1]}` : "https://quaternius.itch.io/");
  throw new Error(
    `This Quaternius pack is ${licence}, but the publisher serves the files through an itch.io button (${itchUrl}). The Guide does not run a checkout. Download the pack yourself and drop the file in.`,
  );
}

function licenceFromPage(html: string, slug: string): AssetLicence {
  const lower = html.toLowerCase();
  if (/creativecommons\.org\/licenses\/by-nc|non-?commercial/.test(lower)) {
    throw new LicenceError(
      "CC-BY-NC",
      `Quaternius pack ${slug} is marked non-commercial. That licence is refused.`,
    );
  }
  if (/creativecommons\.org\/licenses\/by-nd|no-?deriv/.test(lower)) {
    throw new LicenceError("CC-BY-ND", `Quaternius pack ${slug} does not allow derivatives. That licence is refused.`);
  }
  if (/creativecommons\.org\/licenses\/by-sa|share-?alike/.test(lower)) {
    throw new LicenceError("CC-BY-SA", `Quaternius pack ${slug} is share-alike. That licence is refused.`);
  }
  if (lower.includes(CC0_MARK) || /\bcc0\b/.test(lower)) return assertAcceptedLicence("CC0-1.0");
  if (/creativecommons\.org\/licenses\/by\/4\.0/.test(lower)) return assertAcceptedLicence("CC-BY-4.0");
  throw new LicenceError(
    "unknown",
    `Quaternius pack ${slug} has no CC0 or CC-BY licence on the page. Unknown licences are refused.`,
  );
}

function directFile(html: string): string | null {
  const href = /href=['"]([^'"]+\.(?:zip|glb|gltf))['"]/gi;
  for (const match of html.matchAll(href)) {
    const url = match[1] ?? "";
    if (/itch\.io/i.test(url)) continue;
    return url;
  }
  return null;
}

async function fetchText(fetchImpl: typeof fetch, url: string): Promise<string> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Quaternius request failed (${response.status}).`);
  return response.text();
}

async function fetchBytes(fetchImpl: typeof fetch, url: string): Promise<Uint8Array> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Quaternius download failed (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"');
}