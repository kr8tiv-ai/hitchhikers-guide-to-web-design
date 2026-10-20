import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { isOverusedFamily, passesBodyContrast } from "@hitchhiker/engine";
import { evaluateNavFooter, type NavFooterInput } from "../src/craft-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

const HTML = [
  "<nav>",
  '<button type="button">Menu</button>',
  '<a href="/" aria-current="page" data-current="page">Work</a>',
  '<a href="/about">About</a>',
  "</nav>",
  "<footer>",
  '<p class="wordmark">North</p>',
  '<p class="colophon">Set in the brand type.</p>',
  '<a href="#top" data-back-to-top>Top</a>',
  "<p>Type and imagery credits.</p>",
  '<a href="/contact">Contact</a>',
  '<div class="column">Visit</div>',
  "</footer>",
].join("");

const CSS = [
  "footer { padding-bottom: env(safe-area-inset-bottom); }",
  "footer .column { display: block; }",
  "footer a:focus-visible { outline: 2px solid currentColor; }",
].join("\n");

function input(patch: Partial<NavFooterInput> = {}): NavFooterInput {
  return {
    navFamily: "Boska",
    brandFamilies: ["Boska", "General Sans"],
    namedFamilies: [],
    currentMark: "aria",
    html: HTML,
    css: CSS,
    tabOrder: ["Work", "About", "Contact"],
    visualOrder: ["Work", "About", "Contact"],
    navTargets: [
      { name: "Work", width: 44, height: 44 },
      { name: "About", width: 88, height: 44 },
    ],
    phoneButton: { name: "Menu", width: 44, height: 44 },
    pointer: "coarse",
    barHides: false,
    recallTarget: null,
    barCoversFocused: false,
    menuOpened: true,
    menuEscapeClosed: true,
    footerLinks: ["#top", "/contact"],
    footerLinksReached: ["#top", "/contact"],
    focusRingVisible: true,
    footerInk: "#f4f1ea",
    footerPaper: "#1a1a1a",
    ...patch,
  };
}

test("a designed nav and footer pass, including keyboard open and Escape", () => {
  const result = evaluateNavFooter(input());
  assert.equal(result.status, "PASS", result.reasons.join("\n"));
  assert.deepEqual(result.reasons, []);
  assert.equal(passesBodyContrast("#f4f1ea", "#1a1a1a"), true);
  assert.equal(isOverusedFamily("Boska"), false);
});

test("a default face fails unless the person named it, and the bar stays in the brand type", () => {
  const unnamed = evaluateNavFooter(input({ navFamily: "Inter", brandFamilies: ["Inter", "Boska"] }));
  assert.equal(unnamed.status, "BLOCKER");
  assert.match(unnamed.reasons.join(" "), /Inter/);
  assert.match(unnamed.reasons.join(" "), /named/);
  const named = evaluateNavFooter(
    input({ navFamily: "Inter", brandFamilies: ["Inter"], namedFamilies: ["Inter"] }),
  );
  assert.equal(named.status, "PASS", named.reasons.join("\n"));
  const stranger = evaluateNavFooter(input({ navFamily: "Fraunces" }));
  assert.equal(stranger.status, "BLOCKER");
  assert.match(stranger.reasons.join(" "), /Fraunces/);
  assert.match(stranger.reasons.join(" "), /brand type/);
});

test("colour alone fails, and aria or text must be present in the markup", () => {
  const colour = evaluateNavFooter(input({ currentMark: "color" }));
  assert.equal(colour.status, "BLOCKER");
  assert.match(colour.reasons.join(" "), /colour alone/);
  const missingAria = evaluateNavFooter(
    input({ html: HTML.replace('aria-current="page"', "") }),
  );
  assert.match(missingAria.reasons.join(" "), /aria-current/);
  const missingText = evaluateNavFooter(
    input({ currentMark: "text", html: HTML.replace('data-current="page"', "") }),
  );
  assert.equal(missingText.status, "BLOCKER");
  assert.match(missingText.reasons.join(" "), /text mark/);
});

test("keyboard order, 44px targets, disclosure open and Escape, and role=menu", () => {
  const order = evaluateNavFooter(input({ tabOrder: ["About", "Work", "Contact"] }));
  assert.match(order.reasons.join(" "), /visual order/);
  const small = evaluateNavFooter(
    input({ navTargets: [{ name: "Work", width: 43, height: 44 }] }),
  );
  assert.match(small.reasons.join(" "), /Work is 43 by 44/);
  assert.match(small.reasons.join(" "), /44/);
  const button = evaluateNavFooter(input({ phoneButton: { name: "Menu", width: 44, height: 43 } }));
  assert.match(button.reasons.join(" "), /Menu is 44 by 43/);
  const closed = evaluateNavFooter(input({ menuOpened: false, menuEscapeClosed: false }));
  assert.match(closed.reasons.join(" "), /did not open/);
  assert.match(closed.reasons.join(" "), /Escape/);
  const menu = evaluateNavFooter(input({ html: `${HTML}<div role="menu"></div>` }));
  assert.equal(menu.status, "BLOCKER");
  assert.match(menu.reasons.join(" "), /role="menu"/);
  assert.match(menu.reasons.join(" "), /disclosure/);
});

test("a coarse pointer that hides the bar needs a 44px recall that misses the focus", () => {
  const short = evaluateNavFooter(
    input({ barHides: true, recallTarget: { name: "Recall", width: 40, height: 44 } }),
  );
  assert.match(short.reasons.join(" "), /Recall is 40 by 44/);
  const cover = evaluateNavFooter(
    input({
      barHides: true,
      recallTarget: { name: "Recall", width: 44, height: 44 },
      barCoversFocused: true,
    }),
  );
  assert.match(cover.reasons.join(" "), /covers the focused element/);
  const steady = evaluateNavFooter(
    input({
      barHides: true,
      recallTarget: { name: "Recall", width: 44, height: 44 },
      barCoversFocused: false,
    }),
  );
  assert.equal(steady.status, "PASS", steady.reasons.join("\n"));
  const fine = evaluateNavFooter(
    input({ pointer: "fine", barHides: true, recallTarget: null, barCoversFocused: true }),
  );
  assert.equal(fine.status, "PASS", fine.reasons.join("\n"));
});

test("the footer is a last scene: wordmark, colophon, top, credits, safe area, contrast, focus", () => {
  const bare = evaluateNavFooter(input({ html: "<footer><a href='/contact'>Contact</a></footer>" }));
  const text = bare.reasons.join(" ");
  assert.match(text, /wordmark/);
  assert.match(text, /colophon/);
  assert.match(text, /back to the top/);
  assert.match(text, /credit/);
  const navInset = evaluateNavFooter(
    input({ css: "nav { padding-top: env(safe-area-inset-top); }" }),
  );
  assert.match(navInset.reasons.join(" "), /safe-area/);
  const hover = evaluateNavFooter(
    input({
      css: `${CSS}\nfooter .column { display: none; }\nfooter:hover .column { display: block; }`,
    }),
  );
  assert.match(hover.reasons.join(" "), /hover/);
  assert.equal(passesBodyContrast("#111111", "#0a0a0a"), false);
  const contrast = evaluateNavFooter(input({ footerInk: "#111111", footerPaper: "#0a0a0a" }));
  assert.match(contrast.reasons.join(" "), /4\.5/);
  const missed = evaluateNavFooter(input({ footerLinksReached: ["#top"] }));
  assert.match(missed.reasons.join(" "), /\/contact/);
  const ring = evaluateNavFooter(input({ focusRingVisible: false }));
  assert.match(ring.reasons.join(" "), /focus ring/);
});

test("the craft gate reuses the brand helpers and does not launch a browser", () => {
  const source = readFileSync(path.join(here, "..", "src", "craft-gate.ts"), "utf8");
  assert.match(source, /passesBodyContrast\(/);
  assert.match(source, /isOverusedFamily\(/);
  assert.equal(/>=\s*4\.5/.test(source), false);
  assert.equal(/child_process|playwright|puppeteer/.test(source), false);
});
