/**
 * Launch kit draft: a note, a short caption, and a checklist.
 * The return value is markdown the caller may save. This module does not
 * write a file, does not open a network client, and does not send anything.
 * lintClaims runs on the draft before it is returned.
 */

import { lintBrandClaims as lintClaims, type Evidence } from "@hitchhiker/engine";

export interface LaunchKitInput {
  name: string;
  offer: string;
  url: string | null;
  evidence: Evidence;
}

const NAME_CAP = 60;
const DO_NOT_POST = "Do not post this until a human sends it.";

export function renderLaunchKit(input: LaunchKitInput): string {
  const name = oneLine(input.name, "name is empty");
  const offer = oneLine(input.offer, "offer is empty");
  rejectBang(name);
  rejectBang(offer);
  if ([...name].length > NAME_CAP) {
    throw new Error("name is longer than 60 characters");
  }
  const url = readUrl(input.url);
  const markdown = build(name, offer, url);
  if (markdown.includes("!")) {
    throw new Error("launch kit contains an exclamation mark");
  }
  const lint = lintClaims(markdown, input.evidence);
  if (!lint.ok) {
    const detail = lint.hits.map((hit) => hit.pattern).join(", ");
    throw new Error(`Launch kit failed the truth gate: ${detail}.`);
  }
  return markdown;
}

function readUrl(url: string | null): string | null {
  if (url === null) return null;
  const flat = oneLine(url, "url is empty");
  rejectBang(flat);
  return flat;
}

function build(name: string, offer: string, url: string | null): string {
  const offerLine = offer.replace(/[.]+$/g, "").trim();
  const address = url === null ? "The site address is still unset." : `The site address is ${url}.`;
  const note = [
    `${name} is ready to share.`,
    `The offer on the table is ${offerLine}.`,
    address,
    "Don't panic. This draft stays in the kit until a person sends it.",
  ].join(" ");
  const caption = `${name}. ${offerLine}.`;
  const domain = url === null ? "The domain is not set." : `Confirm the address ${url} before anyone shares it.`;
  return [
    "# Launch kit",
    "",
    "## Note",
    "",
    note,
    "",
    "## Caption",
    "",
    caption,
    "",
    "## Checklist",
    "",
    "- Read the note and the caption together.",
    `- ${domain}`,
    `- ${DO_NOT_POST}`,
    "",
  ].join("\n");
}

function oneLine(value: string, emptyMessage: string): string {
  const flat = value.replace(/[\r\n]+/g, " ").trim();
  if (flat === "") throw new Error(emptyMessage);
  return flat;
}

function rejectBang(value: string): void {
  if (value.includes("!")) {
    throw new Error("exclamation marks are not allowed");
  }
}
