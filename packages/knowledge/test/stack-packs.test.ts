import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { lintPackClaims, parsePack } from "../src/pack.ts";

export const STACK_PACKS: readonly string[] = [
  "stack-astro",
  "stack-next",
  "stack-vite-react",
];

const SMOKE =
  "Smoke-test `@react-three/fiber` against the installed Three version. If the check fails, drive object properties from `@theatre/core`.";

const here = path.dirname(fileURLToPath(import.meta.url));

function packPath(name: string): string {
  return path.resolve(here, "..", "packs", name, "SKILL.md");
}

function readPack(name: string): string {
  return readFileSync(packPath(name), "utf8");
}

function bodyAfterFrontmatter(markdown: string): string {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  assert.ok(close > 0);
  return lines.slice(close + 1).join("\n");
}

function studioExcluded(markdown: string): boolean {
  const ban = "Do not import `@theatre/studio`.";
  if (!markdown.includes(ban)) return false;
  return !markdown.replaceAll(ban, "").includes("@theatre/studio");
}

test("three stack packs parse and follow the decision record", () => {
  assert.deepEqual(STACK_PACKS, ["stack-astro", "stack-next", "stack-vite-react"]);
  for (const name of STACK_PACKS) {
    const markdown = readPack(name);
    assert.equal(markdown.includes("!"), false, name);
    assert.equal(
      markdown.split(/\r?\n/).some((line) => /^effort\s*:/.test(line.trim())),
      false,
      name,
    );
    assert.equal(/\b\d+\.\d+\.\d+\b/.test(markdown), false, name);
    assert.equal(/npm\s+install[^\n]*@latest/i.test(markdown), false, name);
    assert.equal(markdown.includes("@latest"), false, name);
    assert.match(markdown, /re-resolve at install/, name);
    assert.match(markdown, /The lockfile pins what install resolved\./, name);
    assert.match(markdown, /floating latest tag/, name);
    assert.match(markdown, /STACK-DECISION\.md/, name);
    assert.match(markdown, /src\/scripts\/motion\.ts/, name);
    assert.match(markdown, /bootMotion/, name);
    assert.equal(studioExcluded(markdown), true, name);
    assert.match(markdown, /@theatre\/core/, name);
    const meta = parsePack(markdown);
    assert.ok(meta.description.length > 0, name);
    assert.ok(meta.whenToUse.length > 0, name);
    assert.deepEqual(meta.paths, [`packages/knowledge/packs/${name}/SKILL.md`]);
    assert.deepEqual(lintPackClaims(bodyAfterFrontmatter(markdown)), [], name);
  }
});

test("Astro does not pull React Three and keeps islands as the exception", () => {
  const markdown = readPack("stack-astro");
  assert.equal(markdown.includes("@react-three/fiber"), false);
  assert.equal(markdown.includes("@theatre/r3f"), false);
  assert.equal(markdown.toLowerCase().includes("r3f"), false);
  assert.match(markdown, /the pick is `astro`/);
  assert.match(markdown, /content collections/);
  assert.match(markdown, /React is not the default/);
  assert.match(markdown, /React island only when `STACK-DECISION\.md` says the site needs one/);
  assert.match(markdown, /Plain Three\.js is the 3D runtime/);
  assert.match(markdown, /## Alternatives/);
  const alternatives = markdown.split("## Alternatives")[1] ?? "";
  assert.match(alternatives, /SvelteKit/);
  assert.match(alternatives, /The 3D ecosystem is thinner\./);
  assert.equal(alternatives.includes("@react-three/fiber"), false);
});

test("Next and Vite smoke-test React Three and do not invent a router tree", () => {
  const next = readPack("stack-next");
  const vite = readPack("stack-vite-react");
  assert.match(next, /the pick is `next`/);
  assert.match(next, /Follow the template's router/);
  assert.equal(next.includes("app/page.tsx"), false);
  assert.equal(next.includes("pages/index.tsx"), false);
  assert.ok(next.includes(SMOKE));
  assert.match(next, /@react-three\/fiber/);
  assert.match(next, /@theatre\/r3f/);

  assert.match(vite, /the pick is `vite-react`/);
  assert.match(vite, /single page/);
  assert.match(vite, /level 10/);
  assert.match(vite, /A client-side router is optional/);
  assert.ok(vite.includes(SMOKE));
  assert.match(vite, /@react-three\/fiber/);
  assert.match(vite, /@theatre\/r3f/);
  assert.equal(vite.includes("SvelteKit"), false);
  assert.equal(next.includes("SvelteKit"), false);
});
