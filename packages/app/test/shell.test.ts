import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { assertShellCss, assertShellHtml, renderShell } from "../src/shell.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const cssPath = path.resolve(here, "../src/shell.css");
const htmlPath = path.resolve(here, "../index.html");
const packagePath = path.resolve(here, "../package.json");
const shellSourcePath = path.resolve(here, "../src/shell.ts");

function normalize(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function countRegion(html: string, name: string): number {
  return html.match(new RegExp(`data-region="${name}"`, "g"))?.length ?? 0;
}

test("shell css passes the anti-slop checks", () => {
  const css = readFileSync(cssPath, "utf8");
  assert.deepEqual(assertShellCss(css), []);
  assert.match(css, /font-size:\s*clamp\(/);
  assert.match(css, /min-height:\s*44px/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  assert.match(css, /\.hh-skip:focus/);
});

test("assertShellCss flags indigo gradients and pill cliches", () => {
  const problems = assertShellCss(
    ".bg-indigo-600{background:linear-gradient(90deg,#4f46e5,#7c3aed)}.rounded-full{border-radius:999px}",
  );
  assert.ok(problems.some((item) => item.includes("bg-indigo-600")));
  assert.ok(problems.some((item) => item.includes("rounded-full")));
  assert.ok(problems.some((item) => item.includes("#4f46e5")));
  assert.ok(problems.some((item) => item.includes("#7c3aed")));
  assert.deepEqual(assertShellCss(".ok{background:linear-gradient(90deg,#8e2f1a,#e6a15c)}"), []);
});

test("rendered html has one of each region and no exclamation in the copy", () => {
  const html = renderShell();
  assert.deepEqual(assertShellHtml(html), []);
  assert.equal(countRegion(html, "transcript"), 1);
  assert.equal(countRegion(html, "question"), 1);
  assert.equal(countRegion(html, "status"), 1);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"\s*\/>/);
  assert.match(html, /<title>The Hitchhiker's Guide to Web Design<\/title>/);
  assert.match(html, /The Hitchhiker's Guide to Web Design/);
  assert.match(html, /Don't Panic\./);
  assert.match(html, /<p class="hh-qcard__title">No question yet\.<\/p>/);
  assert.match(html, /data-region="status"[^>]*>\s*<span>Ready\.<\/span>/);
  assert.doesNotMatch(html, /<(?:input|textarea|select)\b/i);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|use\.typekit|cdn\./i);
  assert.match(html, /href="src\/design\/tokens\.css"/);
  assert.match(html, /href="src\/design\/type\.css"/);
  assert.match(html, /href="src\/design\/components\.css"/);
  assert.match(html, /href="src\/shell\.css"/);
  assert.doesNotMatch(html, /<style[\s>]/i);
});

test("assertShellHtml ignores the doctype and flags an exclamation", () => {
  assert.deepEqual(assertShellHtml("<!DOCTYPE html><p>Ready.</p>"), []);
  const problems = assertShellHtml("<!DOCTYPE html><p>Ready!</p>");
  assert.ok(problems.some((item) => item.includes("exclamation")));
});

test("the skip link is the first focusable control", () => {
  const html = renderShell();
  const match = /<(?:a|button|input|select|textarea)\b[^>]*>/.exec(html);
  assert.ok(match);
  assert.match(match[0], /^<a class="hh-skip" href="#transcript">/);
  assert.match(html, /id="transcript"/);
  assert.match(html, /data-region="transcript"/);
});

test("index.html matches renderShell and keeps the question region", () => {
  const disk = normalize(readFileSync(htmlPath, "utf8"));
  assert.match(disk, /data-region="question"/);
  assert.equal(disk, normalize(renderShell()));
});

test("the package stays free of react, tailwind, and a direct gsap import", () => {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const names = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ];
  for (const name of names) {
    assert.equal(/react|tailwind/i.test(name), false, name);
  }
  const source = readFileSync(shellSourcePath, "utf8");
  assert.doesNotMatch(source, /from ["'](?:react|gsap|tailwindcss|@hitchhiker\/engine)["']/);
});
