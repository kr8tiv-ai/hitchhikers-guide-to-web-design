/**
 * Reads the scripts a built HTML file actually references.
 * A library marker in the HTML copy does not count. Only script bytes do.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const MARKERS: Record<string, readonly string[]> = {
  gsap: ["gsap"],
  lenis: ["lenis"],
  three: ["WebGLRenderer"],
  // OGL's Renderer keeps this property name. The letters ogl also sit inside "Google".
  ogl: ["premultipliedAlpha"],
  motion: ["motion-dom", "framer-motion"],
  anime: ["animejs"],
  theatre: ["@theatre/core", "theatre/core"],
};

function scriptSources(html: string): string[] {
  const found: string[] = [];
  const pattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(pattern)) {
    const src = match[1];
    if (src !== undefined) found.push(src);
  }
  return found;
}

export async function reportBlankBundle(htmlPath: string): Promise<string[]> {
  const html = await readFile(htmlPath, "utf8");
  const dir = path.dirname(htmlPath);
  const chunks: string[] = [];
  for (const src of scriptSources(html)) {
    if (src.startsWith("http://") || src.startsWith("https://")) continue;
    const cleaned = src.split("?")[0] ?? src;
    const file = path.resolve(dir, cleaned.replace(/^\//, ""));
    try {
      chunks.push(await readFile(file, "utf8"));
    } catch {
      const nested = path.resolve(dir, cleaned);
      chunks.push(await readFile(nested, "utf8"));
    }
  }
  const source = chunks.join("\n");
  const used: string[] = [];
  for (const [name, markers] of Object.entries(MARKERS)) {
    if (markers.some((marker) => source.includes(marker))) used.push(name);
  }
  return used;
}
