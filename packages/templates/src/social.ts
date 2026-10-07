/**
 * Optional social frame. Three captions and one plain SVG.
 * Captions go through the brand truth gate. Nothing is posted.
 */

import {
  BANNED_PHRASES,
  BANNED_WORDS,
  lintBrandClaims as lintClaims,
  type Evidence,
} from "@hitchhiker/engine";

export interface SocialInput {
  name: string;
  tagline: string;
  offer: string;
  palette: { paper: string; ink: string; signal: string };
  evidence: Evidence;
}

export interface SocialFrame {
  captions: string[];
  svg: string;
}

const WORD_CAP = 39;
const NAME_CAP = 24;

/** Ratings and counts the brand truth gate does not spell out. Digit-plus-star still goes through lintClaims first. */
const SALE_CLAIM = /\b(?:on sale|for sale|flash sale|half off)\b/i;
const FOLLOWER_CLAIM = /\b\d[\d,.]*\s*[kmb]?\s*followers?\b|\bfollower counts?\b/i;
const STAR_CLAIM = /\b\d[\d.]*\s+stars?\b|\b(?:one|two|three|four|five|ten)\s+stars?\b/i;

const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function renderSocial(input: SocialInput): SocialFrame {
  if (input.name.includes("!") || input.tagline.includes("!") || input.offer.includes("!")) {
    throw new Error("A social caption includes an exclamation mark.");
  }
  const palette = {
    paper: assertHex(input.palette.paper),
    ink: assertHex(input.palette.ink),
    signal: assertHex(input.palette.signal),
  };
  const captions = buildCaptions(input.name, input.tagline, input.offer);
  for (const caption of captions) {
    assertVoice(caption);
  }
  const lint = lintClaims(captions.join("\n"), input.evidence);
  if (!lint.ok) {
    const detail = lint.hits.map((hit) => hit.pattern).join(", ");
    throw new Error(`Social captions failed the truth gate: ${detail}.`);
  }
  for (const caption of captions) {
    assertUnclaimed(caption);
  }
  return { captions, svg: frame(clipChars(stripHashes(input.name).trim(), NAME_CAP), palette) };
}

function assertHex(value: string): string {
  const match = HEX.exec(value.trim());
  const digits = match?.[1];
  if (digits === undefined) throw new Error("Invalid brand hex.");
  const full = digits.length === 3 ? [...digits].map((channel) => channel + channel).join("") : digits;
  return `#${full.toLowerCase()}`;
}

function buildCaptions(name: string, tagline: string, offer: string): string[] {
  const who = plain(clipWords(stripHashes(name), 8)) || "This brand";
  const line = plain(clipWords(stripHashes(tagline), 16));
  const work = plain(clipWords(stripHashes(offer), 16));
  if (line === "") {
    const about = work || "the work still to be named";
    return [
      sentence(work === "" ? `${who} has not set a line yet` : `${who}. ${about}`),
      sentence(work === "" ? "The offer is still unwritten" : `${about}. From ${who}`),
      sentence(`${who} keeps the work specific`),
    ];
  }
  return [
    sentence(`${who}. ${line}`),
    sentence(work === "" ? `${line}. From ${who}` : `${who}. ${work}`),
    sentence(work === "" ? `${who}. ${line}` : `${line}. ${work}`),
  ];
}

function assertUnclaimed(caption: string): void {
  if (SALE_CLAIM.test(caption)) throw new Error("A social caption claims a sale.");
  if (FOLLOWER_CLAIM.test(caption)) throw new Error("A social caption claims a follower count.");
  if (STAR_CLAIM.test(caption)) throw new Error("A social caption claims a star rating.");
}

function assertVoice(caption: string): void {
  if (caption.includes("!") || caption.includes("\u2014")) {
    throw new Error("A social caption includes an exclamation mark.");
  }
  const lower = caption.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) throw new Error("A social caption includes a banned phrase.");
  }
  for (const word of BANNED_WORDS) {
    const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
    if (pattern.test(caption)) throw new Error("A social caption includes a banned word.");
  }
  if (caption.includes("#")) throw new Error("A social caption includes a hashtag.");
}

function plain(value: string): string {
  return value.trim().replace(/[.]+$/g, "").trim();
}

function sentence(value: string): string {
  const core = value.trim().replace(/[.]+$/g, "").trim();
  const cut = core.split(/\s+/).filter((word) => word !== "").slice(0, WORD_CAP);
  return `${cut.join(" ")}.`;
}

function stripHashes(value: string): string {
  return value.replace(/#[^\s#]+/g, " ").replace(/\s+/g, " ").trim();
}

function clipWords(value: string, max: number): string {
  return value.trim().split(/\s+/).filter((word) => word !== "").slice(0, max).join(" ");
}

function clipChars(value: string, max: number): string {
  return [...value].slice(0, max).join("");
}

function frame(name: string, palette: { paper: string; ink: string; signal: string }): string {
  const label = escapeXml(name);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" role="img" aria-label="Social frame">`,
    `<rect width="1080" height="1080" fill="${palette.paper}"/>`,
    `<rect x="84" y="84" width="912" height="912" fill="${palette.signal}"/>`,
    `<text x="140" y="560" fill="${palette.ink}" font-size="64" font-family="sans-serif">${label}</text>`,
    `</svg>`,
  ].join("");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
