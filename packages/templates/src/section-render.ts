/**
 * Deterministic library sections (BUG-058 idea 32).
 * Idea 5 names a section. This renders that id from props through a
 * template function. The same props always produce the same markup bytes.
 * A model may fill the props. It does not rewrite the markup.
 */

import { buildMarkupFromReferences } from "@hitchhiker/engine";

export interface LibrarySectionProps {
  words: string;
  imageCredit: string;
  display: string;
  body: string;
}

const EMPTY: LibrarySectionProps = {
  words: "",
  imageCredit: "",
  display: "",
  body: "",
};

const RENDERERS: Record<string, (props: LibrarySectionProps) => string> = {
  "asymmetric-editorial-grid": renderGrid,
  "three-hero": renderThreeHero,
};

/** Markup for one library section. Props are escaped, so they cannot add a landmark. */
export function renderLibrarySection(sectionId: string, props: LibrarySectionProps): string {
  const clean = normalize(props);
  const render = RENDERERS[sectionId];
  if (render !== undefined) return render(clean);
  if (!/^[a-z0-9-]+$/.test(sectionId)) {
    throw new Error("The section id is not a library id.");
  }
  return `<section data-landmark="${sectionId}" data-rendered="library"></section>`;
}

/** UTF-8 bytes of one section. Two calls with the same props match. */
export function sectionMarkupBytes(sectionId: string, props: LibrarySectionProps): Buffer {
  return Buffer.from(renderLibrarySection(sectionId, props), "utf8");
}

/**
 * Render every section idea 5 named. `model` is accepted and never called.
 * A prompt with no reference still returns the empty page shell.
 */
export function renderReferencedSections(
  source: string,
  propsById: Readonly<Record<string, LibrarySectionProps>>,
  model?: () => string,
): string {
  void model;
  const named = buildMarkupFromReferences(source);
  if (named.referenced.length === 0) return named.html;
  const parts: string[] = [];
  for (const ref of named.referenced) {
    const id = refId(ref);
    const props = propsById[id] ?? EMPTY;
    parts.push(renderLibrarySection(id, props));
  }
  return parts.join("\n");
}

function renderGrid(props: LibrarySectionProps): string {
  return [
    `<section data-landmark="asymmetric-editorial-grid" data-display="${escapeAttr(props.display)}" data-body="${escapeAttr(props.body)}">`,
    `  <figure data-landmark="image"><img alt="" data-credit="${escapeAttr(props.imageCredit)}"></figure>`,
    `  <div data-landmark="column"><p>${escapeText(props.words)}</p></div>`,
    "</section>",
  ].join("\n");
}

function renderThreeHero(props: LibrarySectionProps): string {
  return [
    `<section data-landmark="three-hero" data-display="${escapeAttr(props.display)}" data-body="${escapeAttr(props.body)}">`,
    `  <canvas data-landmark="canvas-hero"></canvas>`,
    `  <img data-landmark="poster" alt="${escapeAttr(props.imageCredit)}">`,
    `  <p data-landmark="caption">${escapeText(props.words)}</p>`,
    "</section>",
  ].join("\n");
}

function refId(ref: string): string {
  if (ref.startsWith("@section:")) return ref.slice("@section:".length);
  const template = ref.startsWith("@template:") ? ref.slice("@template:".length) : ref;
  const base = template.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "";
  const slug = base.toLowerCase().replace(/[^a-z0-9-]+/g, "").replace(/^-|-$/g, "");
  return slug === "" ? "referenced" : slug;
}

function normalize(props: LibrarySectionProps): LibrarySectionProps {
  return {
    words: clean(props.words),
    imageCredit: clean(props.imageCredit),
    display: clean(props.display),
    body: clean(props.body),
  };
}

function clean(value: string): string {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', "&quot;");
}
