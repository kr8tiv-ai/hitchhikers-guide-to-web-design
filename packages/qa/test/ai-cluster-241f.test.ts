/**
 * BUG-055 idea 3. The AI-cluster gate measures palette and chrome tells.
 * The face list is the 241a overused list. A named face still wins.
 * Three.js is not a failure. No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { OVERUSED_DEFAULTS } from "@hitchhiker/engine";
import { AI_CLUSTER_VISION_KEYS, judgeAiCluster } from "../src/antislop.ts";
import { VISUAL_BAN_KEYS, VISUAL_BAN_REASONS } from "../src/zaphod-vision.ts";

const FIELD_CSS = 'export const towel = "field";\n';
const FIELD_HTML = "<main><h1>Field notes</h1></main>";
const THREE = 'import * as THREE from "three";\nconst renderer = new THREE.WebGLRenderer();\n';

function displayCss(family: string): string {
  return `h1 { font-family: "${family}", sans-serif; }\n`;
}

test("vision keys match the 241e visual ban list", () => {
  assert.deepEqual([...AI_CLUSTER_VISION_KEYS], [...VISUAL_BAN_KEYS]);
});

test("a Three.js page and the field fixture pass", () => {
  assert.equal(judgeAiCluster({ css: THREE, html: "<canvas></canvas>" }).pass, true);
  assert.equal(judgeAiCluster({ css: FIELD_CSS, html: FIELD_HTML }).pass, true);
  assert.equal(judgeAiCluster({ css: displayCss("Boska"), html: FIELD_HTML }).pass, true);
});

test("every overused display face fails unless the person named it", () => {
  for (const family of OVERUSED_DEFAULTS) {
    const unnamed = judgeAiCluster({ css: displayCss(family), html: FIELD_HTML });
    assert.equal(unnamed.pass, false, family);
    assert.match(unnamed.hits.map((hit) => hit.detail).join("\n"), new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const named = judgeAiCluster({
      css: displayCss(family),
      html: FIELD_HTML,
      namedFamilies: [family],
    });
    assert.equal(named.pass, true, `named ${family}`);
  }
});

test("a brief that names Inter waives the face and a purple blob hero still fails", () => {
  const css = [
    displayCss("Inter"),
    ".hero { background: #4f46e5; }",
    ".hero.blob { border-radius: 40% 60% 50% 70%; }",
  ].join("\n");
  const html = '<section class="hero blob"><h1>Stay</h1></section>';
  const failed = judgeAiCluster({ css, html });
  assert.equal(failed.pass, false);
  const details = failed.hits.map((hit) => hit.detail).join("\n");
  assert.match(details, /Inter/);
  assert.match(details, /#4f46e5/);
  assert.match(details, /Blob hero/);
  const waived = judgeAiCluster({ css, html, brief: "The owner asked for Inter." });
  assert.equal(waived.pass, false);
  const waivedText = waived.hits.map((hit) => hit.detail).join("\n");
  assert.equal(/Display face is Inter/.test(waivedText), false);
  assert.match(waivedText, /#4f46e5/);
  assert.match(waivedText, /Blob hero/);
  const violet = judgeAiCluster({ css: ".hero { color: #7c3aed; }", html: '<div class="hero"></div>' });
  assert.equal(violet.pass, false);
  assert.match(violet.hits.map((hit) => hit.detail).join("\n"), /#7c3aed/);
});

test("chrome tells fail on markup and each vision boolean fails on its own", () => {
  const cards = [
    "<article class=\"card\"><i class=\"icon-star\"></i><h3>One</h3></article>",
    "<article class=\"card\"><i class=\"icon-star\"></i><h3>Two</h3></article>",
    "<article class=\"card\"><i class=\"icon-star\"></i><h3>Three</h3></article>",
  ].join("");
  assert.equal(judgeAiCluster({ css: "", html: cards }).pass, false);
  const sections = [1, 2, 3]
    .map((n) => `<section class="band split"><h2>Part ${n}</h2><p>Same</p></section>`)
    .join("");
  assert.match(judgeAiCluster({ css: "", html: sections }).hits.map((hit) => hit.detail).join("\n"), /Cloned section rhythm/);
  const stock = '<img src="https://images.example/stock-laptop-people.jpg" alt="people on laptops">';
  assert.match(judgeAiCluster({ css: "", html: stock }).hits.map((hit) => hit.detail).join("\n"), /Stock laptop people/);
  const fakes = [
    '<img class="fake-logo" alt="Acme" src="logoipsum.svg">',
    "<blockquote class=\"fake-testimonial\">Jane Doe loved it.</blockquote>",
    '<p class="fake-number">10,000+ customers</p>',
  ].join("");
  const fakeDetails = judgeAiCluster({ css: "", html: fakes }).hits.map((hit) => hit.detail).join("\n");
  assert.match(fakeDetails, /Fake logos/);
  assert.match(fakeDetails, /Fake testimonials/);
  assert.match(fakeDetails, /Fake numbers/);
  for (const key of AI_CLUSTER_VISION_KEYS) {
    const result = judgeAiCluster({ css: FIELD_CSS, html: FIELD_HTML, vision: { [key]: true } });
    assert.equal(result.pass, false, key);
    assert.equal(result.hits.some((hit) => hit.detail === VISUAL_BAN_REASONS[key]), true, key);
    const clear = judgeAiCluster({ css: FIELD_CSS, html: FIELD_HTML, vision: { [key]: false } });
    assert.equal(clear.pass, true, key);
  }
});

test("the review runners call the cluster gate and lintSlop stays the copy checker", () => {
  const runners = readFileSync(fileURLToPath(new URL("../src/review-runners.ts", import.meta.url)), "utf8");
  const slop = readFileSync(fileURLToPath(new URL("../src/antislop.ts", import.meta.url)), "utf8");
  assert.match(runners, /judgeAiCluster\(/);
  assert.match(slop, /checkPurpleGradient/);
  assert.match(slop, /checkMagnetic/);
});
