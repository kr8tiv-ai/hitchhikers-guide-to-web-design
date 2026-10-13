/**
 * BUG-005. The Logo file slot uses the same drop zone as Images and files.
 * A saved logo shows a thumbnail, the original name, the size, and Remove.
 * SVG is a thumbnail only while a blob preview exists. A reload does not ask
 * the server to serve SVG.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { loadTree } from "@hitchhiker/engine";
import { renderCard, type CardState } from "../src/card.ts";
import { withInterviewExtras, type LogoSlotView } from "../src/client/desk.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const treeFile = path.resolve(here, "..", "..", "..", "interview", "tree.yaml");

function drawn(id: string, logo?: LogoSlotView): string {
  const question = loadTree(treeFile).find((item) => item.id === id);
  assert.ok(question);
  const state: CardState = {
    question,
    draft: "",
    pushback: null,
    error: null,
    done: false,
    pending: false,
  };
  const note = logo === undefined ? undefined : `Saved as ${logo.originalName}.`;
  return withInterviewExtras(renderCard(state), question, note, logo ?? null);
}

function logoZone(html: string): string {
  const start = html.indexOf('data-logo-drop');
  assert.ok(start >= 0);
  const end = html.indexOf("hh-qcard__composer", start);
  assert.ok(end > start);
  return html.slice(html.lastIndexOf("<div", start), end);
}

test("the empty logo slot is a labelled drop zone, not a native file row", () => {
  const zone = logoZone(drawn("DP-0.4"));
  assert.match(zone, /class="hh-qcard__drop hh-attach"/);
  assert.match(zone, /role="group"/);
  assert.match(zone, /aria-labelledby="hh-logo-label"/);
  assert.match(zone, /id="hh-logo-label"[^>]*>Logo file</);
  assert.match(zone, /class="hh-btn hh-btn--secondary hh-attach__button"[^>]*data-logo-button[^>]*>Choose logo</);
  assert.match(zone, /class="hh-attach__file"[^>]*id="hh-logo-file"[^>]*data-logo-file/);
  assert.equal(zone.includes("hh-qcard__file"), false);
  assert.equal(zone.includes("No file chosen"), false);
  assert.equal(zone.includes("Choose File"), false);
  assert.equal(zone.includes("!"), false);
  assert.equal(drawn("DP-0.4").match(/hh-btn--primary/g)?.length, 1);
  assert.equal(drawn("DP-0.5").includes("data-logo-drop"), false);
});

test("a saved raster logo shows a thumbnail, name, size, and Remove", () => {
  const logo: LogoSlotView = {
    originalName: "paradise-found-logo.png",
    safeName: "hh-98860ac8-paradise-found-logo.png",
    bytes: 10,
  };
  const zone = logoZone(drawn("DP-0.4", logo));
  assert.match(zone, /<img class="hh-attach__thumb" alt="" src="\/brand\/logo" \/>/);
  assert.match(zone, /class="hh-attach__name">paradise-found-logo\.png</);
  assert.match(zone, /class="hh-attach__meta">10 B</);
  assert.match(zone, /data-logo-remove/);
  assert.match(zone, /aria-label="Remove paradise-found-logo\.png"/);
  assert.match(zone, /data-logo-button[^>]*>Replace</);
  assert.match(zone, /data-logo-status>Saved as paradise-found-logo\.png\./);
  assert.equal(zone.includes("No file chosen"), false);
  assert.equal(zone.includes("!"), false);
  assert.equal(drawn("DP-0.4", logo).match(/hh-btn--primary/g)?.length, 1);
});

test("an SVG logo thumbnails from a blob and a reload shows name and size only", () => {
  const logo: LogoSlotView = {
    originalName: "mark.svg",
    safeName: "hh-abcd1234-mark.svg",
    bytes: 40,
    previewUrl: "blob:http://desk/mark",
  };
  const live = logoZone(drawn("DP-1.1", logo));
  assert.match(live, /src="blob:http:\/\/desk\/mark"/);
  assert.match(live, /class="hh-attach__name">mark\.svg</);
  const again: LogoSlotView = {
    originalName: logo.originalName,
    safeName: logo.safeName,
    bytes: logo.bytes,
  };
  const reloaded = logoZone(drawn("DP-1.1", again));
  assert.equal(reloaded.includes("<img"), false);
  assert.equal(reloaded.includes("/brand/logo"), false);
  assert.match(reloaded, /class="hh-attach__name">mark\.svg</);
  assert.match(reloaded, /class="hh-attach__meta">40 B</);
});
