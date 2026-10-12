/**
 * The only writer of icon, manifest, theme-color, Open Graph, and Twitter tags.
 * Every HTML response the desk sends passes through applyIdentityHead.
 */

import type { IncomingMessage } from "node:http";
import { escapeHtml } from "../card.ts";
import { color } from "../design/tokens.ts";

export const PRODUCT_NAME = "The Hitchhiker's Guide to Web Design";
export const DEFAULT_DESCRIPTION = "Don't Panic. One question at a time. The work saves on this machine.";
export const IMAGE_ALT = "Don't Panic. An open book on a cream desk, with one rust accent.";

export const THEME_LIGHT = color.accent.light;
export const THEME_DARK = color.accent.dark;

export interface IdentityHeadInput {
  description: string;
  imageUrl: string;
  /** Included when the page does not already have a title. */
  title?: string;
  /** Absolute page URL. Omitted when the host is not known. */
  pageUrl?: string;
  /** When set, og:title and twitter:title use this instead of the product name. */
  socialTitle?: string;
}

export function identityHead(input: IdentityHeadInput): string {
  const description = escapeHtml(input.description);
  const image = escapeHtml(input.imageUrl);
  const alt = escapeHtml(IMAGE_ALT);
  const social = escapeHtml(input.socialTitle ?? input.title ?? PRODUCT_NAME);
  const title =
    input.title === undefined ? "" : `    <title>${escapeHtml(input.title)}</title>\n`;
  const page =
    input.pageUrl === undefined
      ? ""
      : `    <meta property="og:url" content="${escapeHtml(input.pageUrl)}" />\n`;
  return `${title}    <meta name="description" content="${description}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="${THEME_LIGHT}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="${THEME_DARK}" media="(prefers-color-scheme: dark)" />
    <meta name="color-scheme" content="light dark" />
    <meta property="og:title" content="${social}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${alt}" />
    <meta property="og:site_name" content="${escapeHtml(PRODUCT_NAME)}" />
${page}    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${social}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
    <meta name="twitter:image:alt" content="${alt}" />`;
}

function unescapeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function withProductName(title: string): string {
  if (title.includes(PRODUCT_NAME)) return title;
  return `${title}, ${PRODUCT_NAME}`;
}

function requestOrigin(req: IncomingMessage): string | undefined {
  const raw = req.headers.host;
  const host = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (host === undefined || host.length === 0) return undefined;
  if (!/^(?:127\.0\.0\.1|localhost):\d{1,5}$/i.test(host)) return undefined;
  return `http://${host}`;
}

function requestPath(req: IncomingMessage): string {
  const raw = (req.url ?? "/").split("?")[0] ?? "/";
  if (!raw.startsWith("/") || raw.includes("\\") || raw.includes("\0")) return "/";
  return raw;
}

function headSlice(html: string): { head: string; rest: string } | null {
  const match = /<\/head>/i.exec(html);
  if (match === null || match.index === undefined) return null;
  return { head: html.slice(0, match.index), rest: html.slice(match.index) };
}

function stripIdentity(head: string): string {
  return head
    .replace(/[ \t]*<title>[^<]*<\/title>\r?\n?/gi, "")
    .replace(/[ \t]*<meta name="description"[^>]*>\r?\n?/gi, "")
    .replace(/[ \t]*<link rel="icon"[^>]*>\r?\n?/gi, "")
    .replace(/[ \t]*<link rel="apple-touch-icon"[^>]*>\r?\n?/gi, "")
    .replace(/[ \t]*<link rel="manifest"[^>]*>\r?\n?/gi, "")
    .replace(/[ \t]*<meta name="theme-color"[^>]*>\r?\n?/gi, "")
    .replace(/[ \t]*<meta name="color-scheme"[^>]*>\r?\n?/gi, "")
    .replace(/[ \t]*<meta property="og:[^"]+"[^>]*>\r?\n?/gi, "")
    .replace(/[ \t]*<meta name="twitter:[^"]+"[^>]*>\r?\n?/gi, "");
}

/**
 * Replace any icon, manifest, theme, Open Graph, and Twitter tags in the head
 * with one block from identityHead. The title stays a single element and
 * includes the product name. og:url is set from the request host on localhost.
 */
export function applyIdentityHead(html: string, req: IncomingMessage): string {
  const parts = headSlice(html);
  if (parts === null) return html;
  const titleMatch = /<title>([^<]*)<\/title>/i.exec(parts.head);
  const descriptionMatch = /<meta name="description" content="([^"]*)"/i.exec(parts.head);
  const title = withProductName(unescapeHtml(titleMatch?.[1] ?? PRODUCT_NAME));
  const description =
    descriptionMatch?.[1] === undefined ? DEFAULT_DESCRIPTION : unescapeHtml(descriptionMatch[1]);
  const origin = requestOrigin(req);
  const imageUrl = origin === undefined ? "/social-card.png" : `${origin}/social-card.png`;
  const pageUrl = origin === undefined ? undefined : `${origin}${requestPath(req)}`;
  const block = identityHead({
    title,
    description,
    imageUrl,
    socialTitle: title,
    ...(pageUrl === undefined ? {} : { pageUrl }),
  });
  const head = stripIdentity(parts.head).replace(/\s*$/, "\n");
  return `${head}${block}\n  ${parts.rest}`;
}
