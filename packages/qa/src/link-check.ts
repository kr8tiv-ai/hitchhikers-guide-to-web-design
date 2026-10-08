/**
 * Internal links and same-site assets (prompt 126, facts for 124).
 *
 * Cross-origin URLs are skipped. A hash link is broken when the id is
 * missing. Status 400 and up, or a network error, is broken. A failed
 * fetch does not become a pass.
 */

import http from "node:http";
import https from "node:https";

export interface CheckedPage {
  url: string;
  title: string;
  h1Count: number;
  textLength: number;
  brokenLinks: string[];
  bytes: number;
}

export interface LinkResult {
  broken: string[];
  bytes: number;
  pages: CheckedPage[];
  pass: boolean;
}

interface Fetched {
  status: number;
  body: string;
  bytes: number;
}

function emptyPage(url: string, href: string): CheckedPage {
  return { url, title: "", h1Count: 0, textLength: 0, brokenLinks: [href], bytes: 0 };
}

function fetchText(target: string, redirects = 0): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const secure = target.startsWith("https:");
    const library = secure ? https : http;
    const req = library.get(
      target,
      secure ? { rejectUnauthorized: false, timeout: 8_000 } : { timeout: 8_000 },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && typeof location === "string" && redirects < 3) {
          res.resume();
          resolve(fetchText(new URL(location, target).href, redirects + 1));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({ status, body: body.toString("utf8"), bytes: body.length });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timed out: ${target}`));
    });
  });
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function idsOf(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
    const id = match[1] ?? match[2];
    if (id !== undefined && id.length > 0) ids.add(id);
  }
  return ids;
}

function attrs(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = match[1] ?? match[2];
    if (href !== undefined) found.push(href);
  }
  return found;
}

function stylesheetHrefs(html: string): string[] {
  const found: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0] ?? "";
    if (!/\brel\s*=\s*["'][^"']*stylesheet/i.test(tag)) continue;
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = href?.[1] ?? href?.[2];
    if (value !== undefined) found.push(value);
  }
  return found;
}

function skipHref(href: string): boolean {
  const trimmed = href.trim();
  return (
    trimmed.length === 0 ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("tel:") ||
    trimmed.startsWith("javascript:")
  );
}

async function assetBytes(pageUrl: string, html: string): Promise<number> {
  let total = Buffer.byteLength(html, "utf8");
  const origin = new URL(pageUrl).origin;
  const seen = new Set<string>();
  for (const href of stylesheetHrefs(html)) {
    if (skipHref(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (resolved.origin !== origin) continue;
    resolved.hash = "";
    const key = resolved.href;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const asset = await fetchText(key);
      if (asset.status < 400) total += asset.bytes;
    } catch {
      // The link pass records the break. Bytes stay at the HTML size.
    }
  }
  return total;
}

async function inspect(pageUrl: string): Promise<CheckedPage> {
  let fetched: Fetched;
  try {
    fetched = await fetchText(pageUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : pageUrl;
    return emptyPage(pageUrl, message);
  }
  if (fetched.status >= 400) return emptyPage(pageUrl, pageUrl);
  const html = fetched.body;
  const origin = new URL(pageUrl).origin;
  const ids = idsOf(html);
  const broken: string[] = [];
  const seen = new Set<string>();
  for (const href of attrs(html)) {
    if (skipHref(href) || seen.has(href)) continue;
    seen.add(href);
    if (href.trim().startsWith("#")) {
      const id = decodeURIComponent(href.trim().slice(1));
      if (id.length > 0 && !ids.has(id)) broken.push(href);
      continue;
    }
    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl);
    } catch {
      broken.push(href);
      continue;
    }
    if (resolved.origin !== origin) continue;
    const hash = resolved.hash;
    resolved.hash = "";
    if (hash.length > 1 && resolved.href === pageUrl.split("#")[0]) {
      const id = decodeURIComponent(hash.slice(1));
      if (!ids.has(id)) broken.push(href);
      continue;
    }
    try {
      const target = await fetchText(resolved.href);
      if (target.status >= 400) broken.push(resolved.href);
    } catch {
      broken.push(resolved.href);
    }
  }
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  const h1Count = [...html.matchAll(/<h1\b/gi)].length;
  return {
    url: pageUrl,
    title,
    h1Count,
    textLength: visibleText(html).length,
    brokenLinks: broken,
    bytes: await assetBytes(pageUrl, html),
  };
}

export async function checkLinks(url: string, routes: string[]): Promise<LinkResult> {
  const list = routes.length > 0 ? routes : ["/"];
  const pages: CheckedPage[] = [];
  const broken = new Set<string>();
  let bytes = 0;
  for (const route of list) {
    const pageUrl = new URL(route, url).href;
    const page = await inspect(pageUrl);
    pages.push(page);
    for (const href of page.brokenLinks) broken.add(href);
    if (page.bytes > bytes) bytes = page.bytes;
  }
  return {
    broken: [...broken],
    bytes,
    pages,
    pass: broken.size === 0 && pages.every((page) => page.title.trim().length > 0),
  };
}
