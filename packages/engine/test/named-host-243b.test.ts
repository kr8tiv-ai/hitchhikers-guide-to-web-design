/**
 * BUG-073: a host named in the brief Hosting field is the suggestion.
 * Hostinger remains the suggestion only when the field names no known host.
 * GitHub Pages is recognized in text and has no deploy --host flag.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { briefHostingText, namedHostFromBrief } from "../src/guide/named-host.ts";
import { removeTempDir } from "./remove-temp.ts";

const CLOUDFLARE = "No web address yet. Use paradisefound.farm, hosted on Cloudflare Pages (free tier).";

test("Cloudflare Pages in the hosting field is the named host and its free tier", () => {
  const named = namedHostFromBrief(CLOUDFLARE);
  assert.ok(named !== null);
  assert.equal(named.id, "cloudflare");
  assert.equal(named.label, "Cloudflare Pages");
  assert.equal(named.flag, "cloudflare");
  assert.equal(named.cost, "free tier");
});

test("a shorter Cloudflare mention does not become Cloudflare Pages", () => {
  const named = namedHostFromBrief("Publish the finished pages on Cloudflare.");
  assert.ok(named !== null);
  assert.equal(named.label, "Cloudflare");
  assert.equal(named.flag, "cloudflare");
  assert.equal(named.cost, "free tier");
});

test("Netlify, Vercel, and Hostinger keep their deploy flags", () => {
  const netlify = namedHostFromBrief("The site is on Netlify.");
  const vercel = namedHostFromBrief("Use Vercel for the shop.");
  const hostinger = namedHostFromBrief("Hostinger holds the shop.");
  assert.equal(netlify?.flag, "netlify");
  assert.equal(netlify?.label, "Netlify");
  assert.equal(vercel?.flag, "vercel");
  assert.equal(hostinger?.flag, "hostinger");
  assert.equal(hostinger?.cost, "your host plan");
  assert.equal(namedHostFromBrief("Hostinger on the free tier this year.")?.cost, "free tier");
});

test("GitHub Pages is named and has no deploy flag", () => {
  const named = namedHostFromBrief("The farm site lives on GitHub Pages.");
  assert.ok(named !== null);
  assert.equal(named.id, "github");
  assert.equal(named.label, "GitHub Pages");
  assert.equal(named.flag, null);
  assert.equal(named.cost, "free tier");
});

test("an unnamed hosting field is not a host", () => {
  assert.equal(namedHostFromBrief(""), null);
  assert.equal(namedHostFromBrief("No web address yet."), null);
  assert.equal(namedHostFromBrief("The field is not stated yet."), null);
});

test("brief hosting is read from the pending draft, then from the site brief", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "hh-named-host-"));
  try {
    const hitch = path.join(dir, ".hitchhiker");
    mkdirSync(hitch, { recursive: true });
    writeFileSync(
      path.join(hitch, "SITE-BRIEF.md"),
      ["# Site Brief", "", "## Hosting", "", "Use Netlify for the preview.", "", "## Maintainer", "", "The owner."].join("\n"),
      "utf8",
    );
    assert.equal(briefHostingText(dir), "Use Netlify for the preview.");
    writeFileSync(
      path.join(hitch, "brief-pending.json"),
      `${JSON.stringify({ status: "pending", draft: { hosting: CLOUDFLARE } }, null, 2)}\n`,
      "utf8",
    );
    assert.equal(briefHostingText(dir), CLOUDFLARE);
  } finally {
    removeTempDir(dir);
  }
});
