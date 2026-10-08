/**
 * Shared head tags for pages the desk or before-we-jump server actually serves.
 * Paths are absolute on purpose. Standalone kit files must not use this helper.
 */

import { escapeHtml } from "../card.ts";

const FONT_PRELOADS = [
  "/public/fonts/BricolageGrotesque-opsz96-wght800.woff2",
  "/public/fonts/Literata-opsz16-wght400.woff2",
] as const;

export function documentHeadExtras(description: string): string {
  const safe = escapeHtml(description);
  const preloads = FONT_PRELOADS.map(
    (href) => `    <link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin />`,
  );
  return [
    `    <meta name="description" content="${safe}" />`,
    `    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />`,
    ...preloads,
  ].join("\n");
}
