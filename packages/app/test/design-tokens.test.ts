import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { color, motion, radius, space } from "../src/design/tokens.ts";

const designDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/design",
);
const fontDir = path.resolve(designDir, "../../public/fonts");

function read(rel: string): string {
  return readFileSync(path.join(designDir, rel), "utf8");
}

function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function declarations(css: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
  for (const match of css.matchAll(pattern)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    const normalized = value.trim().replace(/\s+/g, " ");
    const canonical = /-(?:light|dark)$/.test(name) || name.startsWith("--space-") || name.startsWith("--radius-") || name.startsWith("--motion-");
    const previous = found.get(name);
    if (canonical && previous !== undefined && previous !== normalized) {
      throw new Error(`${name} disagrees: ${previous} vs ${normalized}`);
    }
    if (previous === undefined) found.set(name, normalized);
  }
  return found;
}

test("tokens.css matches tokens.ts", () => {
  const css = declarations(read("tokens.css"));
  const expectProp = (name: string, value: string): void => {
    assert.equal(css.get(name), value, name);
  };

  for (const [key, pair] of Object.entries(color)) {
    const stem = kebab(key);
    expectProp(`--color-${stem}-light`, pair.light);
    expectProp(`--color-${stem}-dark`, pair.dark);
  }

  space.forEach((step, index) => {
    expectProp(`--space-${index}`, `${step}px`);
  });

  for (const [key, value] of Object.entries(radius)) {
    expectProp(`--radius-${key}`, value);
  }

  for (const [key, value] of Object.entries(motion.durations)) {
    expectProp(`--motion-duration-${key}`, `${value}ms`);
  }

  for (const [key, value] of Object.entries(motion.easings)) {
    expectProp(`--motion-easing-${kebab(key)}`, value);
  }
});

test("fonts are self-hosted woff2 with an OFL", () => {
  const faces = [
    "BricolageGrotesque-opsz96-wght800.woff2",
    "BricolageGrotesque-opsz16-wght600.woff2",
    "Literata-opsz16-wght400.woff2",
    "Literata-opsz16-wght600.woff2",
    "Literata-Italic-opsz16-wght400.woff2",
  ];
  const typeCss = read("type.css");
  for (const file of faces) {
    const bytes = readFileSync(path.join(fontDir, file));
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2", file);
    assert.match(typeCss, new RegExp(file.replace(".", "\\.")));
  }
  for (const file of ["BricolageGrotesque-OFL.txt", "Literata-OFL.txt"]) {
    const text = readFileSync(path.join(fontDir, file), "utf8");
    assert.match(text, /SIL Open Font License, Version 1\.1/);
  }
  assert.doesNotMatch(typeCss, /fonts\.google|fonts\.gstatic|cdn\.|system-ui/);
});

test("wordmark is outlined paths with a title", () => {
  const svg = read("wordmark.svg");
  assert.match(svg, /viewBox="0 0 1090\.69 150\.80"/);
  assert.match(svg, /<title>Don't Panic<\/title>/);
  assert.match(svg, /<path\b[^>]*\bd="/);
  assert.doesNotMatch(svg, /NaN|undefined/);
  assert.doesNotMatch(svg, /<text[\s>]/);
});

test("buttons keep a 44px target", () => {
  const css = read("components.css");
  assert.match(css, /\.hh-btn,\s*\.hh-vote\s*\{[^}]*min-width:\s*44px;/s);
  assert.match(css, /\.hh-btn,\s*\.hh-vote\s*\{[^}]*min-height:\s*44px;/s);
});

const BANNED = [
  "unlock",
  "elevate",
  "seamless",
  "revolutionize",
  "empower",
  "game-changer",
  "delve",
  "leverage",
  "synergy",
  "robust",
  "cutting-edge",
  "journey",
  "tapestry",
  "landscape",
];

function hueOf(hex: string): { h: number; s: number; l: number } {
  const raw = hex.slice(1);
  const full = raw.length === 3 ? raw.replace(/[0-9a-f]/gi, (channel) => channel + channel) : raw;
  const r = Number.parseInt(full.slice(0, 2), 16) / 255;
  const g = Number.parseInt(full.slice(2, 4), 16) / 255;
  const b = Number.parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

function isIndigoOrViolet(hex: string): boolean {
  const { h, s, l } = hueOf(hex);
  return s > 0.18 && l > 0.12 && l < 0.92 && h >= 230 && h <= 295;
}

test("comps stay clear of slop, banned words, and indigo", () => {
  const files = [
    ...readdirSync(path.join(designDir, "comps"))
      .filter((name) => name.endsWith(".html"))
      .map((name) => path.join("comps", name)),
    "tokens.css",
    "type.css",
    "components.css",
  ];

  for (const rel of files) {
    const source = read(rel)
      .replace(/<!DOCTYPE html>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    assert.equal(source.includes("!"), false, `${rel} has an exclamation mark`);
    assert.equal(source.includes("\u2014"), false, `${rel} has an em dash`);
    assert.doesNotMatch(source, /\blorem\b/i, rel);
    assert.doesNotMatch(source, /in today's fast-paced world/i, rel);
    assert.doesNotMatch(source, /it['’]s not just\b/i, rel);
    assert.doesNotMatch(source, /in a world where/i, rel);
    assert.doesNotMatch(source, /\b(indigo|violet)-\d/i, rel);
    for (const word of BANNED) {
      const pattern = new RegExp(`\\b${word}\\b`, "i");
      assert.doesNotMatch(source, pattern, `${rel} contains ${word}`);
    }
    for (const match of source.matchAll(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
      const hex = match[0];
      assert.equal(isIndigoOrViolet(hex), false, `${rel} ${hex}`);
      assert.notEqual(hex.toLowerCase(), "#999999", rel);
      assert.notEqual(hex.toLowerCase(), "#999", rel);
    }
    for (const gradient of source.matchAll(/(?:linear|radial|conic)-gradient\(([^)]*)\)/g)) {
      const body = gradient[1] ?? "";
      const stops = [...body.matchAll(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map((item) =>
        hueOf(item[0]),
      );
      const purple = stops.some((stop) => stop.s > 0.2 && stop.h >= 260 && stop.h <= 320);
      const blue = stops.some((stop) => stop.s > 0.2 && stop.h >= 200 && stop.h < 250);
      assert.equal(purple && blue, false, `${rel} has a purple-to-blue gradient`);
    }
  }
});
