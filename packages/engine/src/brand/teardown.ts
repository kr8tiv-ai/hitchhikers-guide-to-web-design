/**
 * Deterministic competitor teardown.
 * White space is a Wish: line the user wrote, in envy, in boredom,
 * or already in the competitor report. Nothing else becomes a gap.
 * Sameness is copied from the report. This module does not crawl or call a model.
 */

export interface TeardownInput {
  reportMarkdown: string;
  envy: string;
  boredom: string;
}

const QUOTE_LIMIT = 240;
const WHITE_SPACE_MAX = 3;
const WISH_PREFIX = "Wish:";
const SAMENESS_MISSING = "Sameness was not computed.";
const WHITE_SPACE_EMPTY = "No white space recorded yet.";

/**
 * buildTeardown folds one competitor report plus the envy and boredom answers.
 * The report is already the crawler's markdown. URLs in it are not fetched.
 * At most three wishes are white space. Later wishes are parked.
 */
export function buildTeardown(input: TeardownInput): {
  markdown: string;
  whiteSpaces: string[];
  parked: string[];
} {
  const wishes = dedupe([
    ...wishLines(input.envy),
    ...wishLines(input.boredom),
    ...wishLines(input.reportMarkdown),
  ]);
  const whiteSpaces = wishes.slice(0, WHITE_SPACE_MAX);
  const parked = wishes.slice(WHITE_SPACE_MAX);
  const parts = [
    section("Sameness", samenessFrom(input.reportMarkdown)),
    section("Envy", quote(input.envy)),
    section("Boredom", quote(input.boredom)),
    section("White space", whiteSpaceBody(whiteSpaces)),
  ];
  if (parked.length > 0) parts.push(section("Parked", bullets(parked)));
  return { markdown: stripScript(parts.join("\n")), whiteSpaces, parked };
}

function whiteSpaceBody(whiteSpaces: readonly string[]): string {
  if (whiteSpaces.length === 0) return WHITE_SPACE_EMPTY;
  return bullets(whiteSpaces);
}

function quote(value: string): string {
  return clip(stripScript(value).trim());
}

function samenessFrom(report: string): string {
  const lines = report.split(/\r\n|\n|\r/).map((line) => stripScript(line).trim());
  const pattern = lines.filter((line) => isSamenessSentence(line));
  if (pattern.length > 0) return pattern.join("\n");
  const shared = lines.filter((line) => line.includes("shared"));
  if (shared.length > 0) return shared.join("\n");
  return SAMENESS_MISSING;
}

function isSamenessSentence(line: string): boolean {
  return line.includes("No shared title pattern") || line.includes("A shared title pattern");
}

function wishLines(source: string): string[] {
  const wishes: string[] = [];
  for (const raw of source.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (!line.startsWith(WISH_PREFIX)) continue;
    const body = clip(stripScript(line.slice(WISH_PREFIX.length)).trim());
    if (body === "") continue;
    wishes.push(body);
  }
  return wishes;
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function section(title: string, body: string): string {
  if (body.trim() === "") return `## ${title}\n`;
  return `## ${title}\n\n${body.trim()}\n`;
}

function dedupe(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** 240 characters, with three periods when the source was longer. */
function clip(value: string): string {
  if (value.length <= QUOTE_LIMIT) return value;
  return `${value.slice(0, QUOTE_LIMIT - 3)}...`;
}

function stripScript(value: string): string {
  return value.replace(/<script/gi, "");
}
