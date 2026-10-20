/**
 * BUG-058 idea 28. A public reference URL yields tokens whose colors match
 * the computed styles, and a library note the direction dealer can read.
 * The output keeps no long sentence from the page, no image address, and
 * no markup. robots.txt and a login wall stop the read before a write.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { dealDirections, loadStudiedPages } from "../src/brand/directions.ts";
import {
  ReferenceExtractError,
  extractReferenceDesign,
  longCopyLeak,
  tokensFromPublicHtml,
  type ReferenceTransport,
} from "../src/brand/reference-system.ts";

const SENTENCE =
  "The long sentence about the kiln that must never be copied into the token file or the library note at all.";
const IMAGE = "https://cdn.example/plate-photo.jpg";

const PAGE = `<!DOCTYPE html>
<html>
<head>
<style>
  :root { --paper: #f4f1ea; --ink: #1c1917; --accent: #0f6b4a; }
  body {
    background-color: var(--paper);
    background-image: url("${IMAGE}");
    color: var(--ink);
    font-family: Literata, serif;
    font-size: 18px;
  }
  h1 { font-family: Fraunces, serif; font-size: 64px; color: var(--ink); }
  a { color: var(--accent); }
</style>
</head>
<body>
  <header data-landmark="hero"><h1>Kiln</h1></header>
  <section data-landmark="story"><p>${SENTENCE}</p></section>
  <section data-landmark="gallery"><img src="${IMAGE}" alt=""></section>
  <footer data-landmark="footer"><a href="/visit">Visit</a></footer>
</body>
</html>`;

function callsFor(body: string, status = 200): { transport: ReferenceTransport; calls: { robots: number; page: number } } {
  const calls = { robots: 0, page: 0 };
  const transport: ReferenceTransport = {
    robots() {
      calls.robots += 1;
      return Promise.resolve({ status: 404, body: "" });
    },
    page() {
      calls.page += 1;
      return Promise.resolve({ status, body });
    },
  };
  return { transport, calls };
}

function writtenText(dir: string): string {
  const parts: string[] = [];
  for (const relative of ["index.json"]) {
    const file = path.join(dir, relative);
    if (existsSync(file)) parts.push(readFileSync(file, "utf8"));
  }
  return parts.join("\n");
}

test("a fixture page writes tokens that match the computed colors and no long copy", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-ref-"));
  const { transport, calls } = callsFor(PAGE);
  try {
    const pure = tokensFromPublicHtml(PAGE, "https://example.com/");
    assert.deepEqual(pure.colors, [
      { role: "paper", hex: "#f4f1ea" },
      { role: "ink", hex: "#1c1917" },
      { role: "accent", hex: "#0f6b4a" },
    ]);
    assert.deepEqual(pure.typeRoles, [
      { role: "display", family: "Fraunces" },
      { role: "body", family: "Literata" },
    ]);
    assert.deepEqual(pure.sectionRhythm, ["hero", "story", "gallery", "footer"]);
    assert.equal(longCopyLeak(`${SENTENCE}`, PAGE), SENTENCE);
    assert.equal(pure.structure.includes(SENTENCE), false);
    assert.equal(JSON.stringify(pure).includes("plate-photo"), false);
    assert.equal(JSON.stringify(pure).includes("<section"), false);

    const result = await extractReferenceDesign({
      url: "https://example.com/",
      transport,
      libraryRoot: dir,
    });
    assert.equal(calls.page, 1);
    const saved = JSON.parse(readFileSync(result.tokenFile, "utf8")) as typeof pure;
    assert.deepEqual(saved.colors, pure.colors);
    assert.deepEqual(saved.typeRoles, pure.typeRoles);
    assert.equal(saved.sourceUrl, "https://example.com/");
    const note = readFileSync(result.noteFile, "utf8");
    const entry = readFileSync(result.entryFile, "utf8");
    const bundle = `${JSON.stringify(saved)}\n${note}\n${entry}\n${writtenText(dir)}`;
    assert.equal(bundle.includes(SENTENCE), false);
    assert.equal(bundle.toLowerCase().includes("plate-photo"), false);
    assert.equal(bundle.includes("<section"), false);
    assert.match(note, /https:\/\/example\.com\//);
    assert.match(note, /hero, story, gallery, footer/);

    const studied = loadStudiedPages(dir);
    assert.equal(studied.length, 1);
    assert.equal(studied[0]?.url, "https://example.com/");
    assert.deepEqual(studied[0]?.sectionTypes, ["hero", "story", "gallery", "footer"]);

    mkdirSync(path.join(dir, "entries"), { recursive: true });
    for (const [id, sections] of [
      ["aa-alpha", ["cards"]],
      ["bb-beta", ["pricing"]],
    ] as const) {
      writeFileSync(
        path.join(dir, "entries", `${id}.json`),
        JSON.stringify({
          id,
          title: id,
          url: `https://example.com/${id}`,
          styleWorld: "editorial",
          sectionTypes: sections,
        }),
      );
    }
    const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")) as { entries: string[] };
    index.entries.push("aa-alpha", "bb-beta");
    writeFileSync(path.join(dir, "index.json"), JSON.stringify(index));
    const deal = dealDirections(dir);
    assert.equal(
      deal.directions.some((direction) => direction.url === "https://example.com/"),
      true,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an inline color and an rgb paper color are the computed values", () => {
  const html = `<!DOCTYPE html><html><head><style>
    body { background-color: rgb(244, 241, 234); color: #222222; font-family: Literata, serif; font-size: 18px; }
    a { color: #111111; }
    h1 { font-family: Fraunces, serif; font-size: 40px; }
  </style></head><body>
    <h1>Title</h1>
    <a style="color: #0f6b4a" href="/go">Go</a>
  </body></html>`;
  const tokens = tokensFromPublicHtml(html, "https://example.com/inline");
  assert.deepEqual(tokens.colors, [
    { role: "paper", hex: "#f4f1ea" },
    { role: "ink", hex: "#222222" },
    { role: "accent", hex: "#0f6b4a" },
  ]);
  assert.equal(tokens.typeRoles[0]?.family, "Fraunces");
  assert.equal(tokens.typeRoles[1]?.family, "Literata");
});

test("robots.txt disallow writes nothing and does not open the page", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-ref-robots-"));
  const calls = { robots: 0, page: 0 };
  const transport: ReferenceTransport = {
    robots() {
      calls.robots += 1;
      return Promise.resolve({ status: 200, body: "User-agent: *\nDisallow: /\n" });
    },
    page() {
      calls.page += 1;
      return Promise.resolve({ status: 200, body: PAGE });
    },
  };
  try {
    await assert.rejects(
      () => extractReferenceDesign({ url: "https://example.com/work", transport, libraryRoot: dir }),
      (error: unknown) => error instanceof ReferenceExtractError && error.code === "robots",
    );
    assert.equal(calls.robots, 1);
    assert.equal(calls.page, 0);
    assert.equal(existsSync(path.join(dir, "tokens")), false);
    assert.equal(existsSync(path.join(dir, "entries")), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a password page and a logged-in request are refused", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-ref-login-"));
  const login = callsFor('<form><input type="password" name="secret"></form>');
  const privateHost = callsFor(PAGE);
  const session = callsFor(PAGE);
  try {
    await assert.rejects(
      () => extractReferenceDesign({ url: "https://example.com/account", transport: login.transport, libraryRoot: dir }),
      (error: unknown) => error instanceof ReferenceExtractError && error.code === "login",
    );
    assert.equal(login.calls.page, 1);
    assert.equal(existsSync(path.join(dir, "tokens")), false);

    await assert.rejects(
      () =>
        extractReferenceDesign({
          url: "http://127.0.0.1/desk",
          transport: privateHost.transport,
          libraryRoot: dir,
        }),
      (error: unknown) => error instanceof ReferenceExtractError && error.code === "url",
    );
    assert.equal(privateHost.calls.robots, 0);
    assert.equal(privateHost.calls.page, 0);

    await assert.rejects(
      () =>
        extractReferenceDesign({
          url: "https://example.com/members",
          transport: session.transport,
          libraryRoot: dir,
          authenticated: true,
        }),
      (error: unknown) => error instanceof ReferenceExtractError && error.code === "login",
    );
    assert.equal(session.calls.robots, 0);
    assert.equal(session.calls.page, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
