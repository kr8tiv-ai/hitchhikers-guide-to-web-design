import assert from "node:assert/strict";
import { test } from "node:test";
import { renderTile } from "../src/gallery/tile.ts";

const FAMILIES = [
  "editorial",
  "brutalist",
  "3d-webgl",
  "scroll-gsap",
  "dark-luxury",
  "playful",
  "minimal",
  "saas",
  "architecture-real-estate",
  "portfolio",
  "ecommerce",
  "culture-art",
  "fashion-beauty",
  "hospitality-food",
  "photography",
  "nonprofit-events",
  "dev-tools-craft",
];

function body(svg: string): string {
  return svg.replace(/aria-label="[^"]*"/, "");
}

test("a tile is deterministic and contains no image or remote address", () => {
  const entry = { family: "editorial", id: "sample", url: "https://example.com/one" };
  const first = renderTile(entry);
  const second = renderTile(entry);
  assert.equal(first, second);
  assert.equal(first.includes("<image"), false);
  assert.equal(first.toLowerCase().includes("http"), false);
  assert.equal(first.includes("<foreignObject"), false);
  assert.equal(first.includes("href="), false);
  assert.match(first, /role="img"/);
  assert.match(first, /aria-label="Abstract tile for the editorial family"/);
  assert.match(first, /var\(--color-/);
});

test("each family has its own composition and two urls of one family differ", () => {
  const url = "https://example.com/shared";
  const bodies = new Set<string>();
  for (const family of FAMILIES) {
    const svg = renderTile({ family, id: family, url });
    assert.match(svg, new RegExp(`aria-label="Abstract tile for the ${family} family"`));
    bodies.add(body(svg));
  }
  assert.equal(bodies.size, FAMILIES.length);
  const left = renderTile({ family: "brutalist", id: "a", url: "https://example.com/alpha" });
  const right = renderTile({ family: "brutalist", id: "b", url: "https://example.com/beta" });
  assert.notEqual(body(left), body(right));
});
