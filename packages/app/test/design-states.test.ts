import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { motion } from "../src/design/tokens.ts";

const designDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/design");

function read(name: string): string {
  return readFileSync(path.join(designDir, name), "utf8");
}

test("ui state transitions stay on the fast token", () => {
  assert.ok(motion.durations.fast < 250);
  const css = read("components.css");
  const motionSource = read("motion.ts");
  for (const block of css.matchAll(/transition:\s*[^;]+;/g)) {
    const line = block[0];
    if (line.includes("none")) continue;
    assert.match(line, /var\(--motion-duration-fast\)/);
    assert.doesNotMatch(line, /var\(--motion-duration-(?:base|slow)\)/);
  }
  assert.match(css, /animation:\s*hh-rise var\(--motion-duration-fast\)/);
  assert.match(motionSource, /enter\(el: Element[\s\S]*?duration: motion\.durations\.fast/);
  assert.match(motionSource, /toast\(el: Element[\s\S]*?duration: motion\.durations\.fast/);
  assert.match(motionSource, /if \(prefersReducedMotion\(\)\)/);
});

test("reduced motion clears button, rise, and busy motion", () => {
  const css = read("components.css");
  const card = readFileSync(path.resolve(designDir, "../card.css"), "utf8");
  const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(reduced);
  const body = reduced?.[1] ?? "";
  assert.match(body, /\.hh-btn/);
  assert.match(body, /\.hh-rise/);
  assert.match(body, /\[aria-busy="true"\] \.hh-btn--primary::after/);
  assert.match(body, /transition:\s*none/);
  assert.match(body, /animation:\s*none/);
  assert.match(card, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/);
});

test("buttons share rest, hover, focus, active, disabled, and loading", () => {
  const css = read("components.css");
  assert.match(css, /\.hh-btn--primary \{[^}]*background:\s*var\(--color-accent\)/s);
  assert.match(css, /\.hh-btn--primary:hover \{/);
  assert.match(css, /\.hh-btn--primary:active:not\(:disabled\) \{/);
  assert.match(css, /\.hh-btn--primary:focus-visible,\s*\.hh-qcard__input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-focus\)/s);
  assert.match(css, /\.hh-btn:disabled,\s*\.hh-btn:disabled:hover \{[^}]*cursor:\s*not-allowed/s);
  assert.match(css, /\[aria-busy="true"\] \.hh-btn--primary:disabled \{[^}]*cursor:\s*progress/s);
  assert.match(css, /@keyframes hh-wait/);
});

test("plate, field, and line tokens exist for both themes", () => {
  const css = read("tokens.css");
  for (const name of ["--color-plate", "--color-field", "--color-line", "--color-line-strong"]) {
    const hits = css.split(name).length - 1;
    assert.ok(hits >= 4, `${name} is set on the root and on each theme`);
  }
  assert.match(css, /--color-field:\s*var\(--color-surface\)/);
  assert.match(css, /--color-field:\s*color-mix\(in srgb, var\(--color-ink\) 12%, var\(--color-surface\)\)/);
  assert.doesNotMatch(css, /--color-plate:\s*#[0-9a-f]{3,8}/i);
});

test("a hidden error plate does not keep its grid", () => {
  const css = read("components.css");
  assert.match(css, /\.hh-error\[hidden\],\s*\.hh-empty\[hidden\][\s\S]*display:\s*none/);
});
