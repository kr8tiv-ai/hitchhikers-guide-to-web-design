import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Evidence } from "@hitchhiker/engine";
import { renderSocial } from "../src/social.ts";
import { renderSocial as exported } from "../src/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(here, "../src/social.ts");
const packagePath = path.resolve(here, "../package.json");

const empty: Evidence = { quotes: [], awards: [], numbers: [] };
const palette = { paper: "#f4efe6", ink: "#14201c", signal: "#b6401a" };

function words(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return trimmed.split(/\s+/).length;
}

test("the happy path returns three captions and a 1080 frame in the palette", () => {
  const frame = renderSocial({
    name: "North Glass",
    tagline: "Glass, cut slow.",
    offer: "hand-cut architectural glass",
    palette,
    evidence: empty,
  });
  assert.equal(frame.captions.length, 3);
  assert.equal(exported(frameInput()).captions.length, 3);
  for (const caption of frame.captions) {
    assert.match(caption, /\.$/);
    assert.equal(caption.includes("!"), false);
    assert.equal(caption.includes("#"), false);
    assert.ok(words(caption) < 40, caption);
    assert.equal(/elevate/i.test(caption), false);
  }
  assert.match(frame.captions[0] ?? "", /North Glass/);
  assert.match(frame.captions.join(" "), /Glass, cut slow/);
  assert.match(frame.svg, /width="1080"/);
  assert.match(frame.svg, /height="1080"/);
  assert.match(frame.svg, /fill="#f4efe6"/);
  assert.match(frame.svg, /fill="#14201c"/);
  assert.match(frame.svg, /fill="#b6401a"/);
  assert.match(frame.svg, /<text\b/);
  assert.doesNotMatch(frame.svg, /<image\b/i);
});

test("a tagline of 5 stars with empty evidence throws", () => {
  assert.throws(
    () =>
      renderSocial({
        name: "North Glass",
        tagline: "5 stars",
        offer: "hand-cut glass",
        palette,
        evidence: empty,
      }),
    /truth gate: stars/,
  );
});

test("a sale, a follower count, or a multi-digit rating cannot be claimed", () => {
  const base = {
    name: "North Glass",
    tagline: "Glass, cut slow.",
    palette,
    evidence: empty,
  };
  assert.throws(() => renderSocial({ ...base, offer: "panes on sale this week" }), /claims a sale/);
  assert.throws(() => renderSocial({ ...base, offer: "sheets for sale" }), /claims a sale/);
  assert.throws(() => renderSocial({ ...base, tagline: "Glass, cut slow.", offer: "12000 followers and a shop" }), /follower count/);
  assert.throws(() => renderSocial({ ...base, offer: "12k followers" }), /follower count/);
  assert.throws(() => renderSocial({ ...base, tagline: "10 stars", offer: "hand-cut glass" }), /star rating/);
  assert.throws(() => renderSocial({ ...base, tagline: "five stars", offer: "hand-cut glass" }), /star rating/);
});

test("an exclamation mark is rejected and a hashtag in the offer is stripped", () => {
  assert.throws(
    () =>
      renderSocial({
        name: "North Glass",
        tagline: "Cut slow!",
        offer: "hand-cut glass",
        palette,
        evidence: empty,
      }),
    /exclamation/,
  );
  const frame = renderSocial({
    name: "North Glass",
    tagline: "",
    offer: "linen #drop shirts",
    palette,
    evidence: empty,
  });
  const joined = frame.captions.join(" ");
  assert.equal(joined.includes("#"), false);
  assert.equal(joined.includes("drop"), false);
  assert.match(joined, /linen/);
  assert.match(joined, /shirts/);
});

test("an empty tagline uses the offer, a long name is clipped, and a bad hex throws", () => {
  const frame = renderSocial({
    name: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    tagline: "",
    offer: "hand-cut glass",
    palette,
    evidence: empty,
  });
  assert.match(frame.captions.join(" "), /hand-cut glass/);
  assert.match(frame.svg, />ABCDEFGHIJKLMNOPQRSTUVWX</);
  assert.doesNotMatch(frame.svg, /ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
  assert.throws(
    () =>
      renderSocial({
        name: "North Glass",
        tagline: "Glass, cut slow.",
        offer: "hand-cut glass",
        palette: { paper: "#fff;color:red", ink: "#111111", signal: "#b6401a" },
        evidence: empty,
      }),
    /Invalid brand hex/,
  );
});

test("the source calls the brand truth gate and does not import a network sdk", () => {
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /lintClaims\(/);
  assert.match(source, /lintBrandClaims/);
  assert.doesNotMatch(source, /twitter|instagram|facebook|tiktok|node:https|axios/i);
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { dependencies?: Record<string, string>; scripts?: { test?: string } };
  assert.equal(pkg.dependencies?.["@hitchhiker/engine"], "workspace:*");
  assert.match(pkg.scripts?.test ?? "", /--test/);
  assert.equal(Object.keys(pkg.dependencies ?? {}).some((name) => /twitter|facebook|instagram/i.test(name)), false);
});

function frameInput(): {
  name: string;
  tagline: string;
  offer: string;
  palette: { paper: string; ink: string; signal: string };
  evidence: Evidence;
} {
  return {
    name: "North Glass",
    tagline: "Glass, cut slow.",
    offer: "hand-cut architectural glass",
    palette,
    evidence: empty,
  };
}
