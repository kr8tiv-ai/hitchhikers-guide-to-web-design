/**
 * Shared head tags for pages the desk or before-we-jump server renders.
 * Icon, manifest, theme-color, Open Graph, and Twitter tags come from identityHead.
 * The desk send path calls applyIdentityHead again so og:url uses the request host.
 */

import { DEFAULT_DESCRIPTION, identityHead } from "../server/head.ts";
import { escapeHtml } from "../card.ts";

const FONT_PRELOADS = [
  "/public/fonts/BricolageGrotesque-opsz96-wght800.woff2",
  "/public/fonts/Literata-opsz16-wght400.woff2",
] as const;

export function documentHeadExtras(description: string): string {
  const safe = description.trim().length === 0 ? DEFAULT_DESCRIPTION : description;
  const preloads = FONT_PRELOADS.map(
    (href) => `    <link rel="preload" href="${escapeHtml(href)}" as="font" type="font/woff2" crossorigin />`,
  );
  return [identityHead({ description: safe, imageUrl: "/social-card.png" }), ...preloads].join("\n");
}
