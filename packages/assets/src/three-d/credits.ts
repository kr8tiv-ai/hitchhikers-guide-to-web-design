/**
 * Shared 3D types, CREDITS.json append, and the plain-language options.
 *
 * CREDITS.json is the project file the site credits page reads.
 * Field names follow Matt's prompt 20: name, author, license, link, usedFor, category.
 * ModelHit uses the prompt spelling `licence`. The JSON field stays `license`.
 */

import { readFile, writeFile } from "node:fs/promises";
import {
  MESHY_IMAGE_CREDITS,
  MESHY_IMAGE_USD,
  MESHY_TEXT_CREDITS,
  MESHY_TEXT_USD,
  TRIPO_IMAGE_USD,
  TRIPO_TEXT_USD,
} from "./generate.ts";

export type AssetLicence = "CC0-1.0" | "CC-BY-4.0";

export interface ModelHit {
  id: string;
  name: string;
  licence: AssetLicence;
  author: string;
  sourceUrl: string;
  previewUrl?: string;
}

export interface DownloadedModel {
  file: string;
  licence: AssetLicence;
  author: string;
  sourceUrl: string;
}

export interface CreditRecord {
  name: string;
  author: string;
  license: AssetLicence;
  link: string;
  usedFor: string;
  category: string;
}

export interface OptionCard {
  id: "a" | "b" | "c" | "d" | "e" | "f";
  title: string;
  plain: string;
  cost: string;
}

export class LicenceError extends Error {
  readonly licence: string;

  constructor(licence: string, reason: string) {
    super(reason);
    this.name = "LicenceError";
    this.licence = licence;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertAcceptedLicence(value: string): AssetLicence {
  if (value === "CC0-1.0" || value === "CC-BY-4.0") return value;
  throw new LicenceError(
    value,
    `Licence "${value}" is not CC0-1.0 or CC-BY-4.0. Non-commercial and unknown licences are refused.`,
  );
}

export async function appendCredit(entry: CreditRecord, creditsPath: string): Promise<CreditRecord[]> {
  const next = normalizeCredit(entry);
  const existing = await readCredits(creditsPath);
  const index = existing.findIndex((row) => row.name === next.name && row.link === next.link);
  if (index >= 0) existing[index] = next;
  else existing.push(next);
  await writeFile(creditsPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
  return existing;
}

export function renderCreditsSnippet(entries: readonly CreditRecord[]): string {
  const items = entries.map((entry) => {
    const credit =
      entry.license === "CC-BY-4.0" ? " Credit is required." : " Credit is courteous.";
    return `    <li><a href="${escapeHtml(entry.link)}">${escapeHtml(entry.name)}</a> by ${escapeHtml(entry.author)}. ${escapeHtml(entry.license)}.${escapeHtml(credit)} Used for ${escapeHtml(entry.usedFor)}.</li>`;
  });
  const list = items.length > 0 ? items.join("\n") : "    <li>No models recorded yet.</li>";
  return [
    '<section id="credits">',
    "  <h2>Credits</h2>",
    "  <p>Each model keeps the licence it arrived with. CC-BY entries must stay on this page.</p>",
    "  <ul>",
    list,
    "  </ul>",
    "</section>",
  ].join("\n");
}

/**
 * Options a to f, in plain words. A 3D moment starts at appetite 8.
 * Below that, the copy points at a poster or a CSS stand-in.
 */
export function explainOptions(level: number): OptionCard[] {
  if (!Number.isInteger(level) || level < 1 || level > 10) {
    throw new Error(`Motion appetite must be an integer from 1 to 10. Received ${String(level)}.`);
  }
  const gate =
    level >= 8
      ? `Appetite ${level} can hold one 3D moment. Phones still use a 1.5 MB file, at most 150000 triangles, and a poster when the model is heavier.`
      : `A real 3D moment starts at appetite 8. Appetite ${level} keeps a poster or a CSS stand-in.`;
  const generated = `Tripo text $${TRIPO_TEXT_USD.toFixed(2)}, Tripo picture $${TRIPO_IMAGE_USD.toFixed(2)}, Meshy text $${MESHY_TEXT_USD.toFixed(2)} (${MESHY_TEXT_CREDITS} credits), Meshy picture $${MESHY_IMAGE_USD.toFixed(2)} (${MESHY_IMAGE_CREDITS} credits)`;
  return [
    {
      id: "a",
      title: "No 3D",
      plain: `Skip the model. ${gate}`,
      cost: "$0",
    },
    {
      id: "b",
      title: "CSS stand-in",
      plain: `Fake depth with CSS, a still, or a short loop. ${gate}`,
      cost: "$0",
    },
    {
      id: "c",
      title: "CC0 model",
      plain: `Pull a CC0 model from Poly Haven, ambientCG, Kenney, Quaternius, or Sketchfab. ${gate}`,
      cost: "Free (CC0)",
    },
    {
      id: "d",
      title: "CC-BY model",
      plain: `A CC-BY model is free to use, and the credit has to stay on the credits page. ${gate}`,
      cost: "Free, credit required",
    },
    {
      id: "e",
      title: "Generated model",
      plain: `Tripo or Meshy can build a GLB from a prompt or a picture. You see the price, and nothing is sent until you say yes. ${gate}`,
      cost: generated,
    },
    {
      id: "f",
      title: "Hire an artist",
      plain: "Commission a person to model it. The price is their quote.",
      cost: "The artist's quote",
    },
  ];
}

async function readCredits(creditsPath: string): Promise<CreditRecord[]> {
  let text: string;
  try {
    text = await readFile(creditsPath, "utf8");
  } catch (error) {
    const code = isRecord(error) ? error.code : undefined;
    if (code === "ENOENT") return [];
    throw error;
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(`CREDITS.json at ${creditsPath} is not JSON.`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`CREDITS.json at ${creditsPath} must be an array.`);
  }
  return parsed.map((row, index) => {
    if (!isRecord(row)) throw new Error(`CREDITS.json row ${index} is not an object.`);
    return normalizeCredit({
      name: requiredString(row.name, `row ${index} name`),
      author: requiredString(row.author, `row ${index} author`),
      license: assertAcceptedLicence(requiredString(row.license, `row ${index} license`)),
      link: requiredString(row.link, `row ${index} link`),
      usedFor: requiredString(row.usedFor, `row ${index} usedFor`),
      category: requiredString(row.category, `row ${index} category`),
    });
  });
}

function normalizeCredit(entry: CreditRecord): CreditRecord {
  return {
    name: requiredString(entry.name, "name"),
    author: requiredString(entry.author, "author"),
    license: assertAcceptedLicence(entry.license),
    link: requiredString(entry.link, "link"),
    usedFor: requiredString(entry.usedFor, "usedFor"),
    category: requiredString(entry.category, "category"),
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Credit ${label} must be a non-empty string.`);
  }
  return value.trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
