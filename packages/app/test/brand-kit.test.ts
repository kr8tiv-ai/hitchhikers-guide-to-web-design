import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderBrandKit, writeBrandKit, type BrandKitModel } from "../src/brand-kit.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, "../src/brand-kit.css");
const sourcePath = path.resolve(here, "../src/brand-kit.ts");

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#14201c" d="M6 26 L16 6 L26 26 L20 26 L16 16 L12 26 Z"/></svg>`;

function model(overrides: Partial<BrandKitModel> = {}): BrandKitModel {
  const base: BrandKitModel = {
    purpose: "North Glass cuts architectural glass for houses that want the view.",
    why: "So a room can keep the weather out and the daylight in.",
    archetype: "Creator, assumed until you approve it.",
    positioning: "For people building a house, North Glass is the shop that cuts the view to size.",
    stories: {
      s25: "North Glass cuts the pane that fits the room.",
      s100: "The shop measures twice, then cuts the sheet that the window actually needs.",
      s300: "A house gets one chance at the opening. North Glass treats that opening as the whole brief.",
    },
    voiceItems: [
      { id: "trait-direct", text: "Direct, not rude." },
      { id: "vocab-pane", text: "Say pane, sheet, and opening." },
      { id: "banned-hype", text: "Banned: the hype list from the voice file." },
      { id: "micro-empty", text: "Nothing is listed yet." },
    ],
    taglines: [
      "Glass, cut slow.",
      "The view, to size.",
      "Daylight, kept in.",
      "Measure twice.",
      "A pane with a job.",
    ],
    palette: { paper: "#f4efe6", ink: "#14201c", signal: "#b6401a" },
    typeNames: ["Fraunces", "Source Serif 4"],
    logoSvg: MARK,
    logoSet: {
      master: MARK,
      oneColor: MARK,
      reversed: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#f4efe6" d="M4 4h24v24H4z"/></svg>`,
      favicon: MARK,
    },
    images: ["Night stall, tungsten practicals, no stock smiles.", "mark.png"],
  };
  return { ...base, ...overrides };
}

test("a script in the purpose is escaped and the draft banner sits beside the h1", () => {
  const html = renderBrandKit(model({ purpose: `Before <script>alert(1)</script> after` }));
  assert.match(html, /Before &lt;script&gt;alert\(1\)&lt;\/script&gt; after/);
  assert.doesNotMatch(html, /<script[\s>]/i);
  assert.match(html, /<h1 class="hh-headline">Brand kit<\/h1>\s*<p class="bk-draft">Draft\. Not approved\.<\/p>/);
  assert.match(html, /This page is not the website/);
  assert.doesNotMatch(html.replace("<!DOCTYPE html>", ""), /!/);
  assert.doesNotMatch(html, /elevate/i);
  assert.doesNotMatch(html, /indigo|lorem|linear-gradient/i);
});

test("approve controls exist for each section, each voice item, and each tagline", () => {
  const html = renderBrandKit(model());
  for (const id of ["purpose", "palette", "type", "taglines", "logo", "voice", "imagery", "story"]) {
    assert.match(html, new RegExp(`data-approve="${id}"`));
    assert.match(html, new RegExp(`data-redo="${id}"`));
  }
  assert.match(html, /data-approve="trait-direct"/);
  assert.match(html, /data-approve="vocab-pane"/);
  assert.match(html, /data-approve="banned-hype"/);
  assert.match(html, /data-approve="micro-empty"/);
  for (let index = 1; index <= 5; index += 1) {
    assert.match(html, new RegExp(`data-approve="tagline-${index}"`));
  }
  assert.match(html, /Glass, cut slow\./);
  assert.match(html, /A pane with a job\./);
});

test("zero taglines say so, and a missing logo says so", () => {
  const html = renderBrandKit(model({ taglines: [], logoSvg: null, logoSet: null }));
  assert.match(html, /No taglines yet\./);
  assert.match(html, /No logo yet/);
  assert.doesNotMatch(html, /data-approve="tagline-1"/);
  assert.match(html, /data-approve="taglines"/);
  assert.match(html, /data-approve="logo"/);
});

test("an invalid hex throws and a failing brand ink stays off the body color", () => {
  assert.throws(() => renderBrandKit(model({ palette: { paper: "#fff;}", ink: "#111111", signal: "#ff00aa" } })), /Invalid brand hex/);
  assert.throws(() => renderBrandKit(model({ palette: { paper: "#abcd", ink: "#111111", signal: "#ff00aa" } })), /Invalid brand hex/);
  const html = renderBrandKit(model({ palette: { paper: "#ffffff", ink: "#cccccc", signal: "#767676" } }));
  assert.match(html, /style="background:#cccccc;color:#1c1612"/);
  assert.doesNotMatch(html, /color:#cccccc/i);
  assert.match(html, /Body text fails\. This page keeps the desk ink\./);
  assert.match(html, /background:#ffffff/);
});

test("three-digit hex is accepted and more than two type names throws", () => {
  const html = renderBrandKit(model({ palette: { paper: "#fff", ink: "#111", signal: "#b41" } }));
  assert.match(html, /background:#ffffff/);
  assert.match(html, /background:#111111/);
  assert.match(html, /background:#bb4411/);
  assert.throws(() => renderBrandKit(model({ typeNames: ["One", "Two", "Three"] })), /two type names/);
});

test("a tagline with an exclamation mark throws before render", () => {
  assert.throws(() => renderBrandKit(model({ taglines: ["Glass, cut slow!"] })), /exclamation mark/);
});

test("an svg with an embedded image is dropped", () => {
  const html = renderBrandKit(
    model({
      logoSvg: `<svg xmlns="http://www.w3.org/2000/svg"><image href="mark.png"/><path d="M0 0h10v10H0z"/></svg>`,
      logoSet: null,
    }),
  );
  assert.match(html, /Logo rejected by the SVG check\./);
  assert.doesNotMatch(html, /<image/i);
});

test("a clean logo is inlined and a safe image is an img", () => {
  const html = renderBrandKit(model());
  assert.match(html, /<path fill="#14201c"/);
  assert.match(html, /<img src="mark\.png" alt="Approved image"/);
  assert.match(html, /Night stall, tungsten practicals/);
  assert.match(html, /Fraunces/);
  assert.match(html, /font-family:'Fraunces'/);
  assert.match(html, /font-family:'Source Serif 4'/);
});

test("a quoted voice id cannot break out of the approve attribute", () => {
  const html = renderBrandKit(model({ voiceItems: [{ id: `x" onfocus="alert(1)`, text: "Plain speech." }] }));
  assert.match(html, /data-approve="x&quot; onfocus=&quot;alert\(1\)"/);
  assert.doesNotMatch(html, /onfocus="/);
});

test("css uses shell variables and skips indigo, gradients, and a fixed banner", () => {
  const css = readFileSync(cssPath, "utf8");
  assert.match(css, /var\(--color-/);
  assert.match(css, /var\(--space-/);
  assert.match(css, /\.bk-draft/);
  assert.doesNotMatch(css, /indigo|purple|#4f46e5|linear-gradient|position:\s*fixed/i);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
  const source = readFileSync(sourcePath, "utf8");
  assert.doesNotMatch(source, /@hitchhiker\/assets/);
  assert.doesNotMatch(source, /elevate/i);
});

test("writeBrandKit writes html and a print pdf under .hitchhiker/brand", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "hh-brand-"));
  try {
    const written = await writeBrandKit(dir, model({ purpose: "North Glass cuts the pane." }));
    assert.equal(path.basename(written.htmlPath), "brand-kit.html");
    assert.equal(path.basename(written.pdfPath), "brand-kit.pdf");
    assert.equal(path.basename(path.dirname(written.htmlPath)), "brand");
    assert.equal(path.basename(path.dirname(path.dirname(written.htmlPath))), ".hitchhiker");
    const html = await readFile(written.htmlPath, "utf8");
    const pdf = await readFile(written.pdfPath);
    assert.match(html, /Draft\. Not approved\./);
    assert.match(html, /North Glass cuts the pane\./);
    assert.match(html, /<style>/);
    assert.match(html, /fonts\/Literata-opsz16-wght400\.woff2/);
    assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.match(pdf.toString("latin1"), /Draft\. Not approved\./);
    assert.match(pdf.toString("latin1"), /North Glass cuts the pane\./);
    const font = await stat(path.join(path.dirname(written.htmlPath), "fonts", "Literata-opsz16-wght400.woff2"));
    assert.ok(font.size > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
